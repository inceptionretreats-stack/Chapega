import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Non-sensitive settings kept on the phone. Nothing here identifies a
/// customer: orders, names and phone numbers stay in memory only.
abstract class AppPreferences {
  /// Set on first launch; see `wipeSecretsIfFreshInstall`.
  bool get installed;
  Future<void> markInstalled();

  ThemeMode get themeMode;
  Future<void> setThemeMode(ThemeMode mode);

  /// The shop opened last, to reopen it at the next launch.
  String? get lastShopSlug;
  Future<void> setLastShopSlug(String? slug);

  /// Sound and a notification for new orders while the app is open.
  bool get inAppAlerts;
  Future<void> setInAppAlerts(bool enabled);

  /// The person turned on push notifications on this phone.
  bool get pushOptIn;
  Future<void> setPushOptIn(bool enabled);
}

class SharedAppPreferences extends AppPreferences {
  SharedAppPreferences._(this._prefs);

  static const _installedKey = 'installed';
  static const _themeKey = 'theme_mode';
  static const _lastShopKey = 'last_shop';
  static const _inAppAlertsKey = 'in_app_alerts';
  static const _pushOptInKey = 'push_opt_in';

  static Future<SharedAppPreferences> load() async => SharedAppPreferences._(
    await SharedPreferencesWithCache.create(
      cacheOptions: const SharedPreferencesWithCacheOptions(
        allowList: {_installedKey, _themeKey, _lastShopKey, _inAppAlertsKey, _pushOptInKey},
      ),
    ),
  );

  final SharedPreferencesWithCache _prefs;

  @override
  bool get installed => _prefs.getBool(_installedKey) ?? false;

  @override
  Future<void> markInstalled() => _prefs.setBool(_installedKey, true);

  @override
  ThemeMode get themeMode => switch (_prefs.getString(_themeKey)) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };

  @override
  Future<void> setThemeMode(ThemeMode mode) => _prefs.setString(_themeKey, mode.name);

  @override
  String? get lastShopSlug => _prefs.getString(_lastShopKey);

  @override
  Future<void> setLastShopSlug(String? slug) =>
      slug == null ? _prefs.remove(_lastShopKey) : _prefs.setString(_lastShopKey, slug);

  @override
  bool get inAppAlerts => _prefs.getBool(_inAppAlertsKey) ?? true;

  @override
  Future<void> setInAppAlerts(bool enabled) => _prefs.setBool(_inAppAlertsKey, enabled);

  @override
  bool get pushOptIn => _prefs.getBool(_pushOptInKey) ?? false;

  @override
  Future<void> setPushOptIn(bool enabled) => _prefs.setBool(_pushOptInKey, enabled);
}

/// Kept in memory; for tests.
class MemoryAppPreferences extends AppPreferences {
  @override
  bool installed = false;
  @override
  ThemeMode themeMode = ThemeMode.system;
  @override
  String? lastShopSlug;
  @override
  bool inAppAlerts = true;
  @override
  bool pushOptIn = false;

  @override
  Future<void> markInstalled() async => installed = true;
  @override
  Future<void> setThemeMode(ThemeMode mode) async => themeMode = mode;
  @override
  Future<void> setLastShopSlug(String? slug) async => lastShopSlug = slug;
  @override
  Future<void> setInAppAlerts(bool enabled) async => inAppAlerts = enabled;
  @override
  Future<void> setPushOptIn(bool enabled) async => pushOptIn = enabled;
}
