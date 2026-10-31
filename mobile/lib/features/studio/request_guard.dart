import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_failure.dart';
import '../session/session_controller.dart';
import 'shop_access.dart';

final requestGuardProvider = Provider<RequestGuard>(RequestGuard.new);

/// Central reactions to failures from shop endpoints, so every screen
/// behaves the same way. Returns the failure marked `handled` when the guard
/// already did something visible (signed out, opened the password screen,
/// left the shop), so screens don't show a second error.
class RequestGuard {
  RequestGuard(this._ref);

  final Ref _ref;

  Future<ApiFailure> handle(String slug, ApiFailure failure, {bool background = false}) async {
    if (failure is! HttpFailure) return failure;
    final session = _ref.read(sessionControllerProvider.notifier);
    if (failure.status == 401) {
      // A shop endpoint also answers 401 when the shop is suspended or the
      // person's access was removed; only the session check can tell.
      final stillSignedIn = await session.confirmSession(background: background);
      if (stillSignedIn) {
        _ref
            .read(shopAccessProvider.notifier)
            .lose(slug, 'You no longer have access to that shop. Choose another one.');
      }
      return failure.markHandled();
    }
    if (failure.status == 403 && failure.code == 'PASSWORD_CHANGE_REQUIRED') {
      session.requirePasswordChange();
      return failure.markHandled();
    }
    if (failure.status == 403 && failure.code == 'VENDOR_SUSPENDED') {
      _ref.read(shopAccessProvider.notifier).lose(slug, failure.message);
      return failure.markHandled();
    }
    return failure;
  }
}
