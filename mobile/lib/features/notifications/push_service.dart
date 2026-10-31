import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../../bootstrap/firebase_config.dart';
import '../../data/session_api.dart';
import 'notification_service.dart';

/// Runs when a push arrives while the app is closed. The system shows the
/// notification itself; this only starts Firebase, as FlutterFire requires.
/// It reads nothing and calls no API.
@pragma('vm:entry-point')
Future<void> chapegaFirebaseBackgroundHandler(RemoteMessage message) async {
  final options = FirebaseConfig.options;
  if (options != null && Firebase.apps.isEmpty) await Firebase.initializeApp(options: options);
}

/// New-order push notifications (Firebase Cloud Messaging). Built in but
/// dormant: [start] returns null unless the build has Firebase settings, and
/// a phone only registers after the person turns push on.
class PushService {
  PushService._(this._messaging);

  final FirebaseMessaging _messaging;
  StreamSubscription<String>? _tokenRefresh;
  StreamSubscription<RemoteMessage>? _foreground;
  StreamSubscription<RemoteMessage>? _opened;

  /// Starts Firebase when configured. Any failure leaves push off.
  static Future<PushService?> start() async {
    final options = FirebaseConfig.options;
    if (options == null) return null;
    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp(options: options);
      FirebaseMessaging.onBackgroundMessage(chapegaFirebaseBackgroundHandler);
      final messaging = FirebaseMessaging.instance;
      // Shown as local notifications instead, so iOS doesn't show two.
      await messaging.setForegroundNotificationPresentationOptions(
        alert: false,
        badge: false,
        sound: false,
      );
      return PushService._(messaging);
    } on Object catch (error) {
      debugPrint('Push unavailable: $error');
      return null;
    }
  }

  /// Turns push on for this phone's session: asks permission, gets the
  /// token, sends it to the server, and keeps it current. Returns whether
  /// push is now on.
  Future<bool> enable(SessionApi api) async {
    final settings = await _messaging.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) return false;
    await _messaging.setAutoInitEnabled(true);
    if (Platform.isIOS && await _messaging.getAPNSToken() == null) return false;
    // The server sends with FCM HTTP v1 `message.token`, which takes this
    // registration token; register()/onRegistered return an installation id
    // for direct send instead.
    // ignore: deprecated_member_use
    final token = await _messaging.getToken();
    if (token == null) return false;
    await api.registerPushToken(token);
    await _tokenRefresh?.cancel();
    // ignore: deprecated_member_use
    _tokenRefresh = _messaging.onTokenRefresh.listen(
      (fresh) => unawaited(api.registerPushToken(fresh).then<void>((_) {}, onError: (Object _) {})),
    );
    return true;
  }

  /// Turns push off: the server forgets this phone's token, and so does
  /// Firebase.
  Future<void> disable(SessionApi api, {bool signedOut = false}) async {
    await _tokenRefresh?.cancel();
    _tokenRefresh = null;
    if (!signedOut) {
      try {
        await api.removePushToken();
      } on Object {
        // The registration also ends with the session.
      }
    }
    // Pairs with getToken() above.
    // ignore: deprecated_member_use
    await _messaging.deleteToken();
    await _messaging.setAutoInitEnabled(false);
  }

  /// [onMessage] for pushes while the app is open (sync now), [onOpen] for
  /// taps on a push notification (go to the order).
  Future<void> listen({
    required void Function(NotificationTarget? target) onMessage,
    required void Function(NotificationTarget target) onOpen,
  }) async {
    NotificationTarget? targetOf(RemoteMessage message) =>
        NotificationTarget.from(slug: message.data['vendorSlug'], orderId: message.data['orderId']);
    _foreground = FirebaseMessaging.onMessage.listen((message) => onMessage(targetOf(message)));
    _opened = FirebaseMessaging.onMessageOpenedApp.listen((message) {
      final target = targetOf(message);
      if (target != null) onOpen(target);
    });
    final initial = await _messaging.getInitialMessage();
    final target = initial == null ? null : targetOf(initial);
    if (target != null) onOpen(target);
  }

  Future<void> dispose() async {
    await _tokenRefresh?.cancel();
    await _foreground?.cancel();
    await _opened?.cancel();
  }
}
