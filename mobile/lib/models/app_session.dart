import 'package:flutter/foundation.dart';

import '../core/json.dart';
import 'vendor_user.dart';

/// Identifies this install when signing in (`device` in
/// `POST /api/studio-app/v1/login`). The server stores only a hash of
/// [installationId]; [model] is a label like "Pixel 8", never the person's
/// own device name.
@immutable
class DeviceDetails {
  const DeviceDetails({
    required this.installationId,
    required this.platform,
    this.model,
    this.appVersion,
  });

  final String installationId;

  /// "android" or "ios".
  final String platform;
  final String? model;
  final String? appVersion;

  JsonMap toJson() {
    final label = model?.trim();
    final version = appVersion?.trim();
    return {
      'installationId': installationId,
      'platform': platform,
      // The server allows 1-60 characters; omit rather than send blanks.
      if (label != null && label.isNotEmpty)
        'model': label.length > 60 ? label.substring(0, 60) : label,
      if (version != null && RegExp(r'^[0-9A-Za-z.+_-]{1,32}$').hasMatch(version))
        'appVersion': version,
    };
  }
}

/// A successful sign-in.
@immutable
class SignInResult {
  const SignInResult({
    required this.token,
    required this.user,
    required this.expiresAt,
    required this.absoluteExpiresAt,
    required this.signedOutDevices,
  });

  factory SignInResult.fromJson(JsonMap json) => SignInResult(
    token: json.str('token'),
    user: VendorUser.fromJson(json.obj('user')),
    expiresAt: DateTime.tryParse(json.optStr('expiresAt') ?? ''),
    absoluteExpiresAt: DateTime.tryParse(json.optStr('absoluteExpiresAt') ?? ''),
    signedOutDevices: json.optInt('signedOutDevices') ?? 0,
  );

  final String token;
  final VendorUser user;
  final DateTime? expiresAt;
  final DateTime? absoluteExpiresAt;

  /// Other phones signed out because the person reached the phone limit.
  final int signedOutDevices;
}

/// `GET /api/studio-app/v1/session`.
@immutable
class SessionStatus {
  const SessionStatus({
    required this.user,
    required this.expiresAt,
    required this.absoluteExpiresAt,
    required this.pushServerEnabled,
  });

  factory SessionStatus.fromJson(JsonMap json) {
    final push = json['push'];
    return SessionStatus(
      user: VendorUser.fromJson(json.obj('user')),
      expiresAt: DateTime.tryParse(json.optStr('expiresAt') ?? ''),
      absoluteExpiresAt: DateTime.tryParse(json.optStr('absoluteExpiresAt') ?? ''),
      pushServerEnabled: push is Map<String, Object?> && push['serverEnabled'] == true,
    );
  }

  final VendorUser user;
  final DateTime? expiresAt;
  final DateTime? absoluteExpiresAt;

  /// The server has push notifications configured (Firebase credentials).
  final bool pushServerEnabled;
}
