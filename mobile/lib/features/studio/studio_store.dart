import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../bootstrap/providers.dart';
import '../../core/api/api_failure.dart';
import '../../data/studio_api.dart';
import '../../models/studio_snapshot.dart';
import '../../models/vendor_order.dart';
import '../../models/vendor_product.dart';
import '../../models/vendor_settings.dart';
import '../session/session_controller.dart';
import '../session/session_state.dart';
import 'request_guard.dart';

enum SyncStatus { idle, syncing, error }

@immutable
class StudioState {
  const StudioState({this.data, this.sync = SyncStatus.idle, this.lastSyncedAt, this.lastError});

  /// The shop's data, in memory only. Null until the first sync finishes.
  final StudioSnapshot? data;
  final SyncStatus sync;
  final DateTime? lastSyncedAt;
  final ApiFailure? lastError;

  StudioState copyWith({
    StudioSnapshot? data,
    SyncStatus? sync,
    DateTime? lastSyncedAt,
    ApiFailure? lastError,
    bool clearError = false,
  }) => StudioState(
    data: data ?? this.data,
    sync: sync ?? this.sync,
    lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
    lastError: clearError ? null : (lastError ?? this.lastError),
  );
}

/// Called with each shop's orders after a successful sync (new-order alerts).
typedef OrdersObserver = void Function(String slug, List<VendorOrder> orders);

final ordersObserverProvider = Provider<OrdersObserver>((ref) => (_, _) {});

final studioStoreProvider = NotifierProvider.family<StudioStore, StudioState, String>(
  StudioStore.new,
);

/// One shop's Studio data: synced from `bootstrap`, updated in place by each
/// save (as the web Studio does), and dropped when the person signs out.
class StudioStore extends Notifier<StudioState> {
  StudioStore(this.slug);

  final String slug;

  /// Bumped by every refresh and every save; a refresh that started before
  /// a save is discarded, so it can't overwrite the newer saved item.
  int _sequence = 0;
  Future<void>? _inFlight;

  @override
  StudioState build() {
    // Signing out, or another person signing in, starts from nothing.
    ref.watch(
      sessionControllerProvider.select((state) => state is SignedIn ? state.user.id : null),
    );
    _sequence++;
    _inFlight = null;
    return const StudioState();
  }

  StudioApi get api => ref.read(studioApiProvider(slug));

  /// Fetches the shop's data. Only one request runs at a time; callers share
  /// it. [background] marks timer-driven syncs, which don't keep the session
  /// alive.
  Future<void> refresh({bool background = false}) =>
      _inFlight ??= _refresh(background).whenComplete(() => _inFlight = null);

  Future<void> _refresh(bool background) async {
    final started = ++_sequence;
    state = state.copyWith(sync: SyncStatus.syncing);
    try {
      final snapshot = await api.bootstrap(background: background);
      if (started != _sequence || !ref.mounted) return;
      state = StudioState(data: snapshot, sync: SyncStatus.idle, lastSyncedAt: DateTime.now());
      ref.read(sessionControllerProvider.notifier).refreshUser(snapshot.user);
      ref.read(ordersObserverProvider)(slug, snapshot.orders);
    } on ApiFailure catch (failure) {
      if (!ref.mounted) return;
      final handled = await ref
          .read(requestGuardProvider)
          .handle(slug, failure, background: background);
      if (!ref.mounted || started != _sequence) return;
      state = state.copyWith(sync: SyncStatus.error, lastError: handled);
    } on FormatException {
      if (!ref.mounted || started != _sequence) return;
      state = state.copyWith(sync: SyncStatus.error, lastError: const BadResponseFailure(null));
    }
  }

  /// Runs a save and routes its failure through the guard. Returns the
  /// failure (already handled when the guard reacted) for the screen.
  Future<ApiFailure?> guard(Future<void> Function() action) async {
    try {
      await action();
      return null;
    } on ApiFailure catch (failure) {
      return ref.read(requestGuardProvider).handle(slug, failure);
    }
  }

  void _commit(StudioSnapshot Function(StudioSnapshot data) change) {
    final data = state.data;
    if (data == null) return;
    _sequence++;
    state = state.copyWith(
      data: change(data).copyWith(revision: data.revision + 1),
      sync: SyncStatus.idle,
      lastSyncedAt: DateTime.now(),
      clearError: true,
    );
  }

  void commitOrder(VendorOrder order) => _commit(
    (data) => data.copyWith(
      orders: [
        for (final existing in data.orders)
          existing.id == order.id && existing.version <= order.version ? order : existing,
      ],
    ),
  );

  void commitProduct(VendorProduct product) => _commit((data) {
    final products = [
      product,
      for (final existing in data.products)
        if (existing.id != product.id) existing,
    ]..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return data.copyWith(products: products);
  });

  void removeProduct(String productId) => _commit(
    (data) => data.copyWith(
      products: [
        for (final product in data.products)
          if (product.id != productId) product,
      ],
    ),
  );

  void commitSettings(VendorSettings settings) => _commit(
    (data) => data.copyWith(
      settings: settings,
      // The shop's name follows its settings (as on the web).
      vendor: data.vendor.copyWith(displayName: settings.shopName),
    ),
  );
}
