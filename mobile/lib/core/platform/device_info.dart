import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../models/app_session.dart';
import '../storage/secure_store.dart';

/// Small native helpers in MainActivity.kt / AppDelegate.swift.
const platformChannel = MethodChannel('chapega/platform');

/// What the app tells the server about itself at sign-in, and in its
/// User-Agent ("ChapegaStudio/1.0.0+1 (android)").
@immutable
class DeviceInfo {
  const DeviceInfo({
    required this.platform,
    required this.appVersion,
    required this.model,
    required this.installationId,
  });

  /// "android" or "ios".
  final String platform;

  /// "1.0.0+1".
  final String appVersion;

  /// "Pixel 8", or null when the phone doesn't say.
  final String? model;
  final String installationId;

  String get userAgent => 'ChapegaStudio/$appVersion ($platform)';

  DeviceDetails get details => DeviceDetails(
    installationId: installationId,
    platform: platform,
    model: model,
    appVersion: appVersion,
  );

  static Future<DeviceInfo> load(SecureStore secure) async {
    final package = await PackageInfo.fromPlatform();
    String? model;
    try {
      model = await platformChannel.invokeMethod<String>('deviceModel');
    } on PlatformException {
      model = null;
    } on MissingPluginException {
      model = null;
    }
    return DeviceInfo(
      platform: Platform.isIOS ? 'ios' : 'android',
      appVersion: '${package.version}+${package.buildNumber}',
      model: model,
      installationId: await secure.installationId(),
    );
  }
}
