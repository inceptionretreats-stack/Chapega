import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'bootstrap/app_config.dart';
import 'bootstrap/providers.dart';
import 'core/platform/device_info.dart';
import 'core/storage/app_preferences.dart';
import 'core/storage/secure_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = AppConfig.fromEnvironment();
  if (config.problem != null) {
    runApp(ConfigurationProblemApp(config.problem!));
    return;
  }
  final preferences = await SharedAppPreferences.load();
  final secure = FlutterSecureStore();
  await wipeSecretsIfFreshInstall(secure, preferences);
  final device = await DeviceInfo.load(secure);

  runApp(
    ProviderScope(
      // Failed requests are shown and retried by people, never silently.
      retry: (retryCount, error) => null,
      overrides: [
        appConfigProvider.overrideWithValue(config),
        preferencesProvider.overrideWithValue(preferences),
        secureStoreProvider.overrideWithValue(secure),
        deviceInfoProvider.overrideWithValue(device),
      ],
      child: const ChapegaStudioApp(),
    ),
  );
}
