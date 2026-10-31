import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'app_preferences.dart';

/// A session token and the API origin that issued it.
typedef StoredToken = ({String token, String origin});

/// The only secrets the app keeps: the session token (with the origin that
/// issued it, so it is never sent to another server) and a random id for
/// this install. Android stores them with a Keystore-backed key; iOS in the
/// Keychain, readable only while the phone is unlocked and never synced or
/// restored to another device.
abstract interface class SecureStore {
  Future<StoredToken?> readToken();
  Future<void> writeToken(String token, {required String origin});
  Future<void> deleteToken();

  /// A random id for this install, created on first use. The server stores
  /// only a hash of it, to replace this phone's old session at sign-in.
  Future<String> installationId();

  Future<void> deleteAll();
}

class FlutterSecureStore implements SecureStore {
  FlutterSecureStore([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(accessibility: KeychainAccessibility.unlocked_this_device),
          );

  final FlutterSecureStorage _storage;

  static const _tokenKey = 'session_token';
  static const _originKey = 'session_origin';
  static const _installationKey = 'installation_id';

  @override
  Future<StoredToken?> readToken() async {
    final token = await _storage.read(key: _tokenKey);
    if (token == null) return null;
    // A token saved without its origin can't be trusted to any server.
    final origin = await _storage.read(key: _originKey) ?? '';
    return (token: token, origin: origin);
  }

  @override
  Future<void> writeToken(String token, {required String origin}) async {
    await _storage.write(key: _originKey, value: origin);
    await _storage.write(key: _tokenKey, value: token);
  }

  @override
  Future<void> deleteToken() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _originKey);
  }

  @override
  Future<String> installationId() async {
    final existing = await _storage.read(key: _installationKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final created = uuidV4();
    await _storage.write(key: _installationKey, value: created);
    return created;
  }

  @override
  Future<void> deleteAll() => _storage.deleteAll();
}

/// Keychain items survive uninstalling an iOS app. A missing first-run
/// marker in the (uninstall-cleared) preferences means a fresh install, so
/// anything left in secure storage belongs to a previous install and goes.
Future<void> wipeSecretsIfFreshInstall(SecureStore secure, AppPreferences preferences) async {
  if (preferences.installed) return;
  await secure.deleteAll();
  await preferences.markInstalled();
}

/// Kept in memory; for tests.
class MemorySecureStore implements SecureStore {
  String? token;
  String origin = '';
  String? _installation;

  @override
  Future<StoredToken?> readToken() async {
    final stored = token;
    return stored == null ? null : (token: stored, origin: origin);
  }

  @override
  Future<void> writeToken(String token, {required String origin}) async {
    this.token = token;
    this.origin = origin;
  }

  @override
  Future<void> deleteToken() async {
    token = null;
    origin = '';
  }

  @override
  Future<String> installationId() async => _installation ??= uuidV4();

  @override
  Future<void> deleteAll() async {
    token = null;
    origin = '';
    _installation = null;
  }
}

/// A random (version 4) UUID from a cryptographically secure source.
String uuidV4([Random? random]) {
  final source = random ?? Random.secure();
  final bytes = List<int>.generate(16, (_) => source.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-'
      '${hex.substring(16, 20)}-${hex.substring(20)}';
}
