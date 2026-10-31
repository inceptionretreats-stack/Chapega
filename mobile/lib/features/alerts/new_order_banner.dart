import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/money.dart';
import '../../routing/routes.dart';
import '../../theme/chapega_colors.dart';
import 'new_order_alerts.dart';

/// A banner over the Studio when kiosk orders arrive while the app is open,
/// with a vibration and a screen-reader announcement. No customer names:
/// order number, items and total only.
class NewOrderBannerHost extends ConsumerStatefulWidget {
  const NewOrderBannerHost({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<NewOrderBannerHost> createState() => _NewOrderBannerHostState();
}

class _NewOrderBannerHostState extends ConsumerState<NewOrderBannerHost> {
  NewOrderBatch? _showing;
  Timer? _hide;

  @override
  void dispose() {
    _hide?.cancel();
    super.dispose();
  }

  void _show(NewOrderBatch batch) {
    setState(() => _showing = batch);
    unawaited(HapticFeedback.heavyImpact());
    SemanticsService.sendAnnouncement(View.of(context), _title(batch), Directionality.of(context));
    _hide?.cancel();
    _hide = Timer(const Duration(seconds: 12), _dismiss);
  }

  void _dismiss() {
    if (mounted) setState(() => _showing = null);
  }

  String _title(NewOrderBatch batch) => batch.orders.length == 1
      ? 'New order ${batch.orders.single.orderNumber}'
      : '${batch.orders.length} new orders';

  String _detail(NewOrderBatch batch) {
    final units = batch.orders.fold<int>(0, (total, order) => total + order.unitCount);
    final total = batch.orders.fold<int>(0, (sum, order) => sum + order.totalPaise);
    return '$units ${units == 1 ? 'item' : 'items'} · ${formatInr(total)}';
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(newOrderAlertsProvider.select((state) => state.latest), (previous, next) {
      if (next != null && next.serial != previous?.serial) _show(next);
    });
    final batch = _showing;
    final colors = context.colors;
    final text = Theme.of(context).textTheme;
    return Stack(
      children: [
        widget.child,
        if (batch != null)
          Positioned(
            left: 12,
            right: 12,
            top: 0,
            child: SafeArea(
              child: Material(
                elevation: 6,
                color: colors.surface,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                  side: BorderSide(color: colors.accent, width: 1.5),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
                  child: Row(
                    children: [
                      Icon(Icons.notifications_active_outlined, color: colors.textAccent),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_title(batch), style: text.titleSmall),
                            Text(_detail(batch), style: text.bodySmall),
                          ],
                        ),
                      ),
                      TextButton(
                        onPressed: () {
                          _dismiss();
                          context.go(
                            batch.orders.length == 1
                                ? Routes.order(batch.slug, batch.orders.single.id)
                                : Routes.orders(batch.slug),
                          );
                        },
                        child: const Text('View'),
                      ),
                      IconButton(
                        tooltip: 'Dismiss',
                        onPressed: _dismiss,
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
