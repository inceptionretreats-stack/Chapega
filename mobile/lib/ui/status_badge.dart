import 'package:flutter/material.dart';

import '../domain/order_status.dart';
import '../theme/chapega_colors.dart';

/// An order status pill, coloured like the web Studio (`.vendor-status--*`).
class OrderStatusBadge extends StatelessWidget {
  const OrderStatusBadge(this.status, {super.key});

  final OrderStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final (background, foreground, icon) = switch (status) {
      OrderStatus.prepared => (colors.warningSurface, colors.warningText, Icons.error_outline),
      OrderStatus.confirmed => (colors.selected, colors.textAccent, Icons.schedule),
      OrderStatus.preparing => (colors.subtle, colors.text, Icons.inventory_2_outlined),
      OrderStatus.ready => (colors.successSurface, colors.successText, Icons.check_circle_outline),
      OrderStatus.completed => (colors.successSurface, colors.successText, Icons.check_circle),
      OrderStatus.cancelled => (colors.subtle, colors.muted, Icons.cancel_outlined),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(6)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: foreground),
          const SizedBox(width: 5),
          Flexible(
            child: Text(
              status.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(
                context,
              ).textTheme.labelSmall?.copyWith(color: foreground, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

/// Stock wording from the web product list: "Sold out", "Low · 2", "In stock · 9".
class StockBadge extends StatelessWidget {
  const StockBadge({super.key, required this.stock, required this.lowStockThreshold});

  final int stock;
  final int lowStockThreshold;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final (label, color) = stock == 0
        ? ('Sold out', colors.dangerText)
        : stock <= lowStockThreshold
        ? ('Low · $stock', colors.warningText)
        : ('In stock · $stock', colors.successText);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: color, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }
}
