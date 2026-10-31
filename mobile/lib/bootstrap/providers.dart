import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../core/api/chapega_http.dart';
import '../core/platform/device_info.dart';
import '../core/storage/app_preferences.dart';
import '../core/storage/secure_store.dart';
import '../data/session_api.dart';
import '../data/studio_api.dart';
import 'app_config.dart';

/// Root dependencies, created in main.dart (or by tests) and passed in as
/// overrides, so nothing reads platform storage at import time.
final appConfigProvider = Provider<AppConfig>((ref) => throw UnimplementedError('override'));
final preferencesProvider = Provider<AppPreferences>((ref) => throw UnimplementedError('override'));
final secureStoreProvider = Provider<SecureStore>((ref) => throw UnimplementedError('override'));
final deviceInfoProvider = Provider<DeviceInfo>((ref) => throw UnimplementedError('override'));

/// The current session token, shared by the HTTP client (which reads it) and
/// the session controller (which writes it). A plain holder avoids a provider
/// cycle between the two.
class SessionTokenHolder {
  String? token;
}

final sessionTokenProvider = Provider<SessionTokenHolder>((ref) => SessionTokenHolder());

/// The underlying HTTP client; tests override it with a mock.
final httpClientProvider = Provider<http.Client>((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  return client;
});

final chapegaHttpProvider = Provider<ChapegaHttp>((ref) {
  final holder = ref.watch(sessionTokenProvider);
  return ChapegaHttp(
    origin: ref.watch(appConfigProvider).apiOrigin,
    client: ref.watch(httpClientProvider),
    userAgent: ref.watch(deviceInfoProvider).userAgent,
    token: () => holder.token,
  );
});

final sessionApiProvider = Provider<SessionApi>(
  (ref) => HttpSessionApi(ref.watch(chapegaHttpProvider)),
);

final studioApiProvider = Provider.family<StudioApi, String>(
  (ref, slug) => HttpStudioApi(ref.watch(chapegaHttpProvider), slug),
);
