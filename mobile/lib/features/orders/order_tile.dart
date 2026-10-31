import 'package:flutter/material.dart';

import '../../domain/dates.dart';
import '../../domain/money.dart';
import '../../models/vendor_order.dart';
import '../../theme/chapega_colors.dart';
import '../../ui/status_badge.dart';

/// One order in a list: number, when and where, customer, items and total.
class OrderTile extends StatelessWidget {
  const OrderTile({
    super.key,
    required this.order,
    required this.now,
    this.onTap,
    this.unseen = false,
  });

  final VendorOrder order;
  final DateTime now;
  final VoidCallback? onTap;

  /// A new order the person hasn't opened yet.
  final bool unseen;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final items = order.unitCount;
    return Semantics(
      button: onTap != null,
      label:
          '${unseen ? 'New. ' : ''}Order ${order.orderNumber}, ${order.status.label}, '
          '${order.customerLabel}, $items ${items == 1 ? 'item' : 'items'}, ${formatInr(order.totalPaise)}',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (unseen) ...[
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(color: colors.accent, shape: BoxShape.circle),
                          ),
                          const SizedBox(width: 6),
                        ],
                        Flexible(
                          child: Text(
                            order.orderNumber,
                            style: text.titleSmall,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${relativeVendorTime(order.createdAt, now)} · ${order.kioskName}',
                      style: text.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      order.customerLabel,
                      style: text.bodyMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      '$items ${items == 1 ? 'item' : 'items'} · ${formatInr(order.totalPaise)}',
                      style: text.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  OrderStatusBadge(order.status),
                  const SizedBox(height: 18),
                  Icon(Icons.chevron_right, color: colors.muted),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
