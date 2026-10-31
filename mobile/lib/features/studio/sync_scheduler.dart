import 'dart:async';

import 'package:flutter/widgets.dart';

import '../../core/api/api_failure.dart';

/// Keeps one shop's data fresh while the app is in use: a sync every 30 s
/// while the app is on screen (sent as background, so it doesn't keep an
/// idle session alive), an immediate one when the app comes back, and a
/// growing pause after failures (30 s up to 5 min, or the server's
/// Retry-After). It is a plain object owned by the Studio shell, so it never
/// depends on which screen is showing.
class SyncScheduler {
  SyncScheduler({
    required this.refresh,
    required this.lastFailure,
    this.interval = const Duration(seconds: 30),
  });

  /// Syncs now; [background] marks timer-driven syncs.
  final Future<void> Function({required bool background}) refresh;

  /// The failure of the last sync, or null when it worked.
  final ApiFailure? Function() lastFailure;
  final Duration interval;

  static const _backoff = [
    Duration(seconds: 30),
    Duration(seconds: 60),
    Duration(seconds: 120),
    Duration(seconds: 300),
  ];

  Timer? _timer;
  AppLifecycleListener? _lifecycle;
  bool _visible = true;
  int _failures = 0;
  bool _disposed = false;

  void start() {
    _lifecycle = AppLifecycleListener(onStateChange: _onLifecycle);
    // Not synchronously: the shell starts this while the tree is building.
    _timer = Timer(Duration.zero, () => unawaited(_run(background: false)));
  }

  /// A person asked to sync (pull to refresh, "Retry sync").
  Future<void> syncNow() {
    _failures = 0;
    return _run(background: false);
  }

  void _onLifecycle(AppLifecycleState state) {
    final visible = state == AppLifecycleState.resumed || state == AppLifecycleState.inactive;
    if (visible == _visible) return;
    _visible = visible;
    if (visible) {
      // Coming back to the app counts as using it, like the web's focus refresh.
      unawaited(_run(background: false));
    } else {
      _timer?.cancel();
      _timer = null;
    }
  }

  Future<void> _run({required bool background}) async {
    _timer?.cancel();
    _timer = null;
    await refresh(background: background);
    if (_disposed) return;
    final failure = lastFailure();
    Duration next;
    if (failure == null) {
      _failures = 0;
      next = interval;
    } else {
      final retryAfter = failure is HttpFailure ? failure.retryAfter : null;
      next = retryAfter ?? _backoff[_failures.clamp(0, _backoff.length - 1)];
      _failures++;
    }
    if (_visible) _timer = Timer(next, () => unawaited(_run(background: true)));
  }

  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _lifecycle?.dispose();
  }
}
