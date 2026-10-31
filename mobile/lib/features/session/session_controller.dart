import 'dart:async';

import 'package:flutter/painting.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../bootstrap/providers.dart';
import '../../core/api/api_failure.dart';
import '../../models/app_session.dart';
import '../../models/vendor_user.dart';
import 'session_state.dart';

const sessionEndedNotice = 'Your session ended. Sign in again.';

final sessionControllerProvider = NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);

/// Whether the server has push notifications configured (from
/// `GET /api/studio-app/v1/session`); null until known.
final pushServerEnabledProvider = NotifierProvider<PushServerEnabled, bool?>(PushServerEnabled.new);

class PushServerEnabled extends Notifier<bool?> {
  @override
  bool? build() => null;

  void set(bool enabled) => state = enabled;
}

/// Signing in and out, and checking the stored session. Network problems
/// never sign anyone out; only the server saying the session ended (401)
/// does.
class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() {
    scheduleMicrotask(restore);
    return const SessionRestoring();
  }

  VendorUser? get user => switch (state) {
    SignedIn(:final user) => user,
    PasswordChangeRequired(:final user) => user,
    _ => null,
  };

  void _apply(VendorUser user) {
    state = user.mustChangePassword ? PasswordChangeRequired(user) : SignedIn(user);
  }

  /// At launch: is there a stored session, and is it still valid?
  Future<void> restore() async {
    state = const SessionRestoring();
    final token = await ref.read(secureStoreProvider).readToken();
    if (token == null) {
      state = const SignedOut();
      return;
    }
    ref.read(sessionTokenProvider).token = token;
    try {
      final status = await ref.read(sessionApiProvider).current();
      ref.read(pushServerEnabledProvider.notifier).set(status.pushServerEnabled);
      _apply(status.user);
    } on HttpFailure catch (failure) {
      if (failure.status == 401) {
        await _forget();
        state = const SignedOut(notice: sessionEndedNotice);
      } else {
        state = SessionUnreachable(failure);
      }
    } on ApiFailure catch (failure) {
      state = SessionUnreachable(failure);
    } on FormatException {
      state = const SessionUnreachable(BadResponseFailure(null));
    }
  }

  /// Signs in and keeps the token in secure storage. Errors are thrown for
  /// the sign-in screen to show.
  Future<SignInResult> signIn({
    required String email,
    required String password,
    String? vendorSlug,
  }) async {
    final api = ref.read(sessionApiProvider);
    final device = ref.read(deviceInfoProvider).details;
    SignInResult result;
    try {
      result = await api.signIn(
        email: email,
        password: password,
        device: device,
        vendorSlug: vendorSlug,
      );
    } on HttpFailure catch (failure) {
      // A shop named by a stale link blocks sign-in even when the person has
      // other shops; try once more without it.
      if (vendorSlug == null || failure.code != 'VENDOR_ACCESS_UNAVAILABLE') rethrow;
      result = await api.signIn(email: email, password: password, device: device);
    }
    await ref.read(secureStoreProvider).writeToken(result.token);
    ref.read(sessionTokenProvider).token = result.token;
    _apply(result.user);
    return result;
  }

  /// Signs this phone out: stops push for it and ends the session on the
  /// server (best effort), then forgets everything kept on the phone.
  Future<void> signOut({String? notice}) async {
    final api = ref.read(sessionApiProvider);
    if (ref.read(sessionTokenProvider).token != null) {
      const limit = Duration(seconds: 5);
      if (ref.read(preferencesProvider).pushOptIn) {
        try {
          await api.removePushToken().timeout(limit);
        } on Object {
          // The session's push registration ends with the session anyway.
        }
      }
      try {
        await api.signOut().timeout(limit);
      } on Object {
        // Offline: the session expires on its own; the phone forgets it now.
      }
    }
    await ref.read(preferencesProvider).setPushOptIn(false);
    await _forget();
    state = SignedOut(notice: notice);
  }

  /// The server says the session ended (401 on the session itself).
  Future<void> sessionEnded() async {
    await _forget();
    state = const SignedOut(notice: sessionEndedNotice);
  }

  /// After a 401 from a shop endpoint: is the session itself still valid?
  /// Returns false (and signs out) only when the server says it ended; a
  /// 401 for one shop can just mean the shop is suspended or access was
  /// removed.
  Future<bool> confirmSession({bool background = false}) async {
    try {
      final status = await ref.read(sessionApiProvider).current(background: background);
      _apply(status.user);
      return true;
    } on HttpFailure catch (failure) {
      if (failure.status == 401) {
        await sessionEnded();
        return false;
      }
      return true;
    } on ApiFailure {
      return true;
    } on FormatException {
      return true;
    }
  }

  /// The server refused a request until the temporary password is replaced.
  void requirePasswordChange() {
    final current = user;
    if (current != null) state = PasswordChangeRequired(current);
  }

  /// After the person replaced their password: reload who they are.
  Future<void> passwordChanged() async {
    final status = await ref.read(sessionApiProvider).current();
    _apply(status.user);
  }

  /// Fresher details of the signed-in person (each Studio sync carries them).
  void refreshUser(VendorUser fresh) {
    if (state is SignedIn || state is PasswordChangeRequired) _apply(fresh);
  }

  Future<void> _forget() async {
    ref.read(sessionTokenProvider).token = null;
    await ref.read(secureStoreProvider).deleteToken();
    // Product photos stay in memory only; drop them with the session.
    try {
      PaintingBinding.instance.imageCache.clear();
    } on Object {
      // No painting binding in plain unit tests.
    }
  }
}
