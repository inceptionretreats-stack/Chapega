import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/order_status.dart';
import '../../models/vendor_order.dart';
import '../session/session_controller.dart';
import '../session/session_state.dart';

/// Orders that arrived in one sync, for the in-app banner and notification.
@immutable
class NewOrderBatch {
  const NewOrderBatch({required this.slug, required this.orders, required this.serial});

  final String slug;

  /// Newest first.
  final List<VendorOrder> orders;

  /// Changes with every batch, so the same orders never alert twice.
  final int serial;
}

@immutable
class NewOrderAlertsState {
  const NewOrderAlertsState({this.unseen = const {}, this.latest});

  /// New orders the person hasn't opened yet (shown with a dot).
  final Set<String> unseen;
  final NewOrderBatch? latest;
}

/// Called for each new batch (sound and system notification); replaced in
/// main.dart once notifications are set up.
typedef NewOrderAnnouncer = void Function(NewOrderBatch batch);

final newOrderAnnouncerProvider = Provider<NewOrderAnnouncer>((ref) => (_) {});

final newOrderAlertsProvider = NotifierProvider<NewOrderAlerts, NewOrderAlertsState>(
  NewOrderAlerts.new,
);

/// Spots kiosk orders that weren't there at the previous sync. The first
/// sync of a shop only records what exists, so opening the app never
/// floods the person with alerts for old orders.
class NewOrderAlerts extends Notifier<NewOrderAlertsState> {
  final Map<String, Set<String>> _known = {};
  int _serial = 0;

  @override
  NewOrderAlertsState build() {
    ref.watch(
      sessionControllerProvider.select((state) => state is SignedIn ? state.user.id : null),
    );
    _known.clear();
    return const NewOrderAlertsState();
  }

  void observe(String slug, List<VendorOrder> orders) {
    final ids = {for (final order in orders) order.id};
    final known = _known[slug];
    _known[slug] = {...?known, ...ids};
    if (known == null) return;
    final fresh = [
      for (final order in orders)
        if (!known.contains(order.id) && order.status == OrderStatus.prepared) order,
    ];
    if (fresh.isEmpty) return;
    final batch = NewOrderBatch(slug: slug, orders: fresh, serial: ++_serial);
    state = NewOrderAlertsState(
      unseen: {...state.unseen, for (final order in fresh) order.id},
      latest: batch,
    );
    ref.read(newOrderAnnouncerProvider)(batch);
  }

  void markSeen(String orderId) {
    if (!state.unseen.contains(orderId)) return;
    state = NewOrderAlertsState(unseen: {...state.unseen}..remove(orderId), latest: state.latest);
  }
}
