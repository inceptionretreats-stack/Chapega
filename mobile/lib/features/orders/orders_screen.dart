import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/order_status.dart';
import '../../domain/phone_search.dart';
import '../../models/studio_snapshot.dart';
import '../../models/vendor_order.dart';
import '../../routing/routes.dart';
import '../../ui/feedback.dart';
import '../alerts/new_order_alerts.dart';
import '../studio/studio_chrome.dart';
import '../studio/studio_store.dart';
import 'order_tile.dart';

/// The order queue: active orders first, or the whole history, searchable
/// by number, customer, phone digits or gift.
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key, required this.slug});

  final String slug;

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  bool _activeOnly = true;
  OrderStatus? _status;
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<VendorOrder> _filter(List<VendorOrder> orders) {
    final query = _search.text.trim().toLowerCase();
    return [
      for (final order in orders)
        if ((!_activeOnly || order.isActive) &&
            (_status == null || order.status == _status) &&
            (query.isEmpty ||
                phoneMatches(order.customer.phone, query) ||
                [
                  order.orderNumber,
                  order.customer.name,
                  order.customer.phone,
                  order.kioskName,
                  for (final item in order.items) item.name,
                ].join(' ').toLowerCase().contains(query)))
          order,
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: StudioAppBar(slug: widget.slug, title: 'Orders'),
      body: StudioBody(slug: widget.slug, builder: _list),
    );
  }

  Widget _list(BuildContext context, StudioSnapshot data) {
    final text = Theme.of(context).textTheme;
    final unseen = ref.watch(newOrderAlertsProvider.select((state) => state.unseen));
    final filtered = _filter(data.orders);
    final activeCount = data.orders.where((order) => order.isActive).length;
    final now = DateTime.now();

    return RefreshIndicator(
      onRefresh: () => ref.read(studioStoreProvider(widget.slug).notifier).refresh(),
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            sliver: SliverList.list(
              children: [
                SegmentedButton<bool>(
                  segments: [
                    ButtonSegment(value: true, label: Text('Active ($activeCount)')),
                    ButtonSegment(value: false, label: Text('All orders (${data.orders.length})')),
                  ],
                  selected: {_activeOnly},
                  showSelectedIcon: false,
                  onSelectionChanged: (selection) => setState(() {
                    _activeOnly = selection.first;
                    if (_activeOnly && (_status?.isFinished ?? false)) _status = null;
                  }),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _search,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Search number, customer, phone or gift',
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
                      for (final status in <OrderStatus?>[null, ...OrderStatus.values])
                        if (!(_activeOnly && (status?.isFinished ?? false)))
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: Text(status?.label ?? 'All statuses'),
                              selected: _status == status,
                              onSelected: (_) => setState(() => _status = status),
                            ),
                          ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Semantics(
                  header: true,
                  child: Text(
                    _activeOnly ? 'Active queue' : 'Order history',
                    style: text.titleLarge,
                  ),
                ),
                Text(
                  '${filtered.length} ${filtered.length == 1 ? 'order' : 'orders'} in this view',
                  style: text.bodySmall,
                ),
              ],
            ),
          ),
          if (filtered.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(
                icon: Icons.receipt_long_outlined,
                title: 'No orders here yet',
                message: 'Adjust the filters, or prepare a test order on the kiosk.',
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              sliver: DecoratedSliver(
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  border: Border.all(color: Theme.of(context).dividerColor),
                  borderRadius: BorderRadius.circular(8),
                ),
                sliver: SliverList.separated(
                  itemCount: filtered.length,
                  separatorBuilder: (context, index) => const Divider(indent: 16, endIndent: 16),
                  itemBuilder: (context, index) {
                    final order = filtered[index];
                    return OrderTile(
                      order: order,
                      now: now,
                      unseen: unseen.contains(order.id),
                      onTap: () => context.go(Routes.order(widget.slug, order.id)),
                    );
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }
}
