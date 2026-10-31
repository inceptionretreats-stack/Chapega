import 'dart:io';

import 'package:firebase_core/firebase_core.dart';

/// Firebase settings for push notifications, passed at build time with
/// `--dart-define-from-file=config/firebase.json` (git-ignored; see
/// mobile/docs/PUSH.md). Without them push is off and hidden in the app,
/// and nothing Firebase-related starts.
abstract final class FirebaseConfig {
  static const _projectId = String.fromEnvironment('CHAPEGA_FIREBASE_PROJECT_ID');
  static const _senderId = String.fromEnvironment('CHAPEGA_FIREBASE_SENDER_ID');
  static const _androidAppId = String.fromEnvironment('CHAPEGA_FIREBASE_ANDROID_APP_ID');
  static const _androidApiKey = String.fromEnvironment('CHAPEGA_FIREBASE_ANDROID_API_KEY');
  static const _iosAppId = String.fromEnvironment('CHAPEGA_FIREBASE_IOS_APP_ID');
  static const _iosApiKey = String.fromEnvironment('CHAPEGA_FIREBASE_IOS_API_KEY');
  static const _iosBundleId = String.fromEnvironment('CHAPEGA_FIREBASE_IOS_BUNDLE_ID');

  /// The options for this platform, or null when push isn't configured.
  static FirebaseOptions? get options {
    if (_projectId.isEmpty || _senderId.isEmpty) return null;
    if (Platform.isAndroid && _androidAppId.isNotEmpty && _androidApiKey.isNotEmpty) {
      return const FirebaseOptions(
        apiKey: _androidApiKey,
        appId: _androidAppId,
        messagingSenderId: _senderId,
        projectId: _projectId,
      );
    }
    if (Platform.isIOS && _iosAppId.isNotEmpty && _iosApiKey.isNotEmpty) {
      return const FirebaseOptions(
        apiKey: _iosApiKey,
        appId: _iosAppId,
        messagingSenderId: _senderId,
        projectId: _projectId,
        iosBundleId: _iosBundleId,
      );
    }
    return null;
  }
}
