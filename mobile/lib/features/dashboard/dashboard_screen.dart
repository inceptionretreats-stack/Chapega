import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../bootstrap/providers.dart';
import '../../domain/dates.dart';
import '../../domain/money.dart';
import '../../models/studio_snapshot.dart';
import '../../routing/routes.dart';
import '../../theme/chapega_colors.dart';
import '../../ui/feedback.dart';
import '../../ui/product_image.dart';
import '../orders/order_tile.dart';
import '../studio/studio_chrome.dart';
import '../studio/studio_store.dart';

/// Today at a glance: orders and their value, live orders, low stock and the
/// shop's status (the web Studio's dashboard).
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: StudioAppBar(slug: slug, title: 'Home'),
      body: StudioBody(
        slug: slug,
        builder: (context, data) => RefreshIndicator(
          onRefresh: () => ref.read(studioStoreProvider(slug).notifier).refresh(),
          child: _Dashboard(slug: slug, data: data),
        ),
      ),
    );
  }
}

class _Dashboard extends ConsumerWidget {
  const _Dashboard({required this.slug, required this.data});

  final String slug;
  final StudioSnapshot data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final now = DateTime.now();
    final todayOrders = data.orders.where((order) => isSameLocalDay(order.createdAt, now)).toList();
    final todayValue = todayOrders
        .where((order) => order.status.name != 'cancelled')
        .fold<int>(0, (total, order) => total + order.totalPaise);
    final activeOrders = data.orders.where((order) => order.isActive).toList();
    final live = data.products.where((product) => product.visible).length;
    final threshold = data.settings.lowStockThreshold;
    final lowStock =
        data.products.where((product) => product.visible && product.stock <= threshold).toList()
          ..sort((a, b) => a.stock.compareTo(b.stock));
    final canEditCatalogue = data.capabilities.manageCatalogue;
    final firstName = data.user.name.split(' ').first;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Text('Welcome back, $firstName', style: text.headlineSmall),
        const SizedBox(height: 4),
        _ShopStatusLine(open: data.settings.storeOpen),
        const SizedBox(height: 16),
        Row(
          children: [
            Text('Today', style: text.titleMedium),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                formatDayHeading(now),
                style: text.bodySmall,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        _StatGrid(
          stats: [
            ('Orders', '${todayOrders.length}'),
            ('Order value', formatInr(todayValue)),
            ('Products live', '$live'),
            ('Low stock', '${lowStock.length}'),
          ],
        ),
        const SizedBox(height: 16),
        SectionCard(
          title: 'Live orders',
          subtitle:
              'Orders prepared at the kiosk. Confirm only after the shop receives the request.',
          padding: const EdgeInsets.fromLTRB(0, 16, 0, 8),
          trailing: TextButton(
            onPressed: () => context.go(Routes.orders(slug)),
            child: const Text('View all'),
          ),
          child: activeOrders.isEmpty
              ? const EmptyState(
                  icon: Icons.receipt_long_outlined,
                  title: 'No active orders',
                  message: 'New kiosk orders will appear here as soon as they are prepared.',
                )
              : Column(
                  children: [
                    for (final (index, order) in activeOrders.take(6).indexed) ...[
                      if (index > 0) const Divider(indent: 16, endIndent: 16),
                      OrderTile(
                        order: order,
                        now: now,
                        onTap: () => context.go(Routes.order(slug, order.id)),
                      ),
                    ],
                  ],
                ),
        ),
        const SizedBox(height: 16),
        SectionCard(
          title: 'Low stock',
          subtitle: 'At or below $threshold units.',
          padding: const EdgeInsets.fromLTRB(0, 16, 0, 8),
          trailing: canEditCatalogue
              ? TextButton(
                  onPressed: () => context.go(Routes.products(slug)),
                  child: const Text('View all'),
                )
              : null,
          child: lowStock.isEmpty
              ? const EmptyState(
                  icon: Icons.inventory_2_outlined,
                  title: 'Stock looks healthy',
                  message: 'No product is below the alert level.',
                )
              : Column(
                  children: [
                    for (final product in lowStock.take(4))
                      ListTile(
                        leading: ProductImage(slug: slug, path: product.image, size: 48),
                        title: Text(product.name, maxLines: 2, overflow: TextOverflow.ellipsis),
                        subtitle: Text(
                          product.stock == 0 ? 'Sold out' : '${product.stock} left',
                          style: text.bodySmall?.copyWith(
                            color: product.stock == 0 ? colors.dangerText : colors.warningText,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        trailing: canEditCatalogue
                            ? OutlinedButton(
                                onPressed: () => context.push(Routes.editProduct(slug, product.id)),
                                child: Semantics(
                                  label: 'Restock ${product.name}',
                                  excludeSemantics: true,
                                  child: const Text('Restock'),
                                ),
                              )
                            : null,
                      ),
                  ],
                ),
        ),
        const SizedBox(height: 16),
        SectionCard(
          title: 'Shop status',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ShopStatusLine(open: data.settings.storeOpen, detailed: true),
              const SizedBox(height: 12),
              _Fact(label: 'Kiosk', value: data.settings.kioskName),
              _Fact(label: 'Catalogue revision', value: '#${data.revision}'),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => launchUrl(
                  ref
                      .read(appConfigProvider)
                      .apiOrigin
                      .replace(path: '/kiosk/${Uri.encodeComponent(slug)}'),
                  mode: LaunchMode.externalApplication,
                ),
                icon: const Icon(Icons.open_in_new, size: 18),
                label: const Text('View kiosk'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ShopStatusLine extends StatelessWidget {
  const _ShopStatusLine({required this.open, this.detailed = false});

  final bool open;
  final bool detailed;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final text = Theme.of(context).textTheme;
    final label = detailed
        ? (open ? 'Open' : 'Paused')
        : (open
              ? 'Shop open: the kiosk is accepting orders.'
              : 'Shop paused: kiosk ordering is off.');
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: open ? colors.success : colors.warningText,
              shape: BoxShape.circle,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: detailed ? text.titleSmall : text.bodyMedium),
              if (detailed)
                Text(
                  open ? 'Kiosk is live and accepting orders.' : 'Ordering is currently paused.',
                  style: text.bodySmall,
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _StatGrid extends StatelessWidget {
  const _StatGrid({required this.stats});

  final List<(String, String)> stats;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 560 ? 4 : 2;
        final width = (constraints.maxWidth - (columns - 1) * 10) / columns;
        return Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final (label, value) in stats)
              SizedBox(
                width: width,
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Semantics(
                      label: '$label: $value',
                      excludeSemantics: true,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(label, style: text.bodySmall),
                          const SizedBox(height: 4),
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerLeft,
                            child: Text(
                              value,
                              style: text.headlineSmall?.copyWith(
                                fontFeatures: const [FontFeature.tabularFigures()],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(label, style: text.bodySmall)),
          Flexible(
            child: Text(value, style: text.bodyMedium, textAlign: TextAlign.end),
          ),
        ],
      ),
    );
  }
}
