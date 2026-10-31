import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_failure.dart';
import '../../domain/dates.dart';
import '../../domain/money.dart';
import '../../models/studio_snapshot.dart';
import '../../models/vendor_product.dart';
import '../../routing/routes.dart';
import '../../theme/chapega_colors.dart';
import '../../ui/feedback.dart';
import '../../ui/product_image.dart';
import '../../ui/status_badge.dart';
import '../studio/studio_chrome.dart';
import '../studio/studio_store.dart';

/// The catalogue: search, categories, stock, and kiosk visibility.
class ProductsScreen extends ConsumerStatefulWidget {
  const ProductsScreen({super.key, required this.slug});

  final String slug;

  @override
  ConsumerState<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends ConsumerState<ProductsScreen> {
  final _search = TextEditingController();
  String? _category;
  final Set<String> _updating = {};

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _toggleVisibility(VendorProduct product) async {
    if (_updating.contains(product.id)) return;
    setState(() => _updating.add(product.id));
    final store = ref.read(studioStoreProvider(widget.slug).notifier);
    VendorProduct? saved;
    // The endpoint replaces the whole product, so send it all with the change.
    final failure = await store.guard(() async {
      saved = await store.api.updateProduct(product.id, product.toInput(visible: !product.visible));
    });
    if (!mounted) return;
    setState(() => _updating.remove(product.id));
    if (saved != null) {
      store.commitProduct(saved!);
      showToast(
        context,
        product.visible ? 'Product hidden from the kiosk.' : 'Product published to the kiosk.',
      );
    } else if (failure != null && !failure.handled) {
      if (failure is HttpFailure && failure.code == 'VERSION_CONFLICT') {
        await store.refresh();
      }
      if (mounted) showToast(context, failure.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: StudioAppBar(slug: widget.slug, title: 'Products'),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push(Routes.newProduct(widget.slug)),
        icon: const Icon(Icons.add),
        label: const Text('Add product'),
      ),
      body: StudioBody(slug: widget.slug, builder: _list),
    );
  }

  Widget _list(BuildContext context, StudioSnapshot data) {
    final text = Theme.of(context).textTheme;
    final query = _search.text.trim().toLowerCase();
    final products = [
      for (final product in data.products)
        if ((_category == null || product.category == _category) &&
            (query.isEmpty ||
                [
                  product.name,
                  product.category,
                  product.shortDescription,
                  ...product.tags,
                ].join(' ').toLowerCase().contains(query)))
          product,
    ];
    final published = data.products.where((product) => product.visible).length;

    return RefreshIndicator(
      onRefresh: () => ref.read(studioStoreProvider(widget.slug).notifier).refresh(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        children: [
          TextField(
            controller: _search,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search products',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear search',
                      onPressed: () => setState(_search.clear),
                      icon: const Icon(Icons.close),
                    ),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final category in <String?>[null, ...data.categories])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(category ?? 'All categories'),
                      selected: _category == category,
                      onSelected: (_) => setState(() => _category = category),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(header: true, child: Text('Catalogue', style: text.titleLarge)),
                    Text(
                      '$published published · ${data.products.length} active products',
                      style: text.bodySmall,
                    ),
                  ],
                ),
              ),
              Text('Showing ${products.length}', style: text.labelMedium),
            ],
          ),
          const SizedBox(height: 10),
          if (products.isEmpty)
            const EmptyState(
              icon: Icons.inventory_2_outlined,
              title: 'No products match',
              message: 'Try a different search or category, or add a new product.',
            )
          else
            for (final product in products) ...[
              _ProductCard(
                slug: widget.slug,
                product: product,
                lowStockThreshold: data.settings.lowStockThreshold,
                updating: _updating.contains(product.id),
                onToggle: () => _toggleVisibility(product),
                onOpen: () => context.push(Routes.editProduct(widget.slug, product.id)),
              ),
              const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.slug,
    required this.product,
    required this.lowStockThreshold,
    required this.updating,
    required this.onToggle,
    required this.onOpen,
  });

  final String slug;
  final VendorProduct product;
  final int lowStockThreshold;
  final bool updating;
  final VoidCallback onToggle;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 4, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ProductImage(slug: slug, path: product.image, size: 64),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.name,
                      style: text.titleSmall,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(product.category, style: text.bodySmall),
                    const SizedBox(height: 4),
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 8,
                      children: [
                        Text(formatInr(product.pricePaise), style: text.titleSmall),
                        if (product.compareAtPricePaise != null)
                          Text(
                            formatInr(product.compareAtPricePaise!),
                            style: text.bodySmall?.copyWith(decoration: TextDecoration.lineThrough),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    StockBadge(stock: product.stock, lowStockThreshold: lowStockThreshold),
                    const SizedBox(height: 2),
                    Text(
                      'Updated ${formatShortDate(product.updatedAt)}',
                      style: text.bodySmall?.copyWith(color: colors.muted),
                    ),
                  ],
                ),
              ),
              Column(
                children: [
                  updating
                      ? const Padding(
                          padding: EdgeInsets.all(14),
                          child: SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2.4),
                          ),
                        )
                      : Semantics(
                          label: '${product.visible ? 'Hide' : 'Show'} ${product.name} on kiosk',
                          child: Switch(value: product.visible, onChanged: (_) => onToggle()),
                        ),
                  Text(product.visible ? 'Visible' : 'Hidden', style: text.labelSmall),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
