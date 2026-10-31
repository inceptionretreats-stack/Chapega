import 'package:chapega_studio/app.dart';
import 'package:chapega_studio/bootstrap/app_config.dart';
import 'package:chapega_studio/bootstrap/providers.dart';
import 'package:chapega_studio/core/platform/device_info.dart';
import 'package:chapega_studio/core/storage/app_preferences.dart';
import 'package:chapega_studio/core/storage/secure_store.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

class TestApp {
  TestApp({
    required this.session,
    required this.studio,
    required this.secure,
    required this.preferences,
    required this.container,
  });

  final FakeSessionApi session;
  final FakeStudioApi studio;
  final MemorySecureStore secure;
  final MemoryAppPreferences preferences;
  final ProviderContainer container;
}

/// The whole app against in-memory fakes. [signedIn] stores a token so the
/// app restores a session at launch.
Future<TestApp> pumpStudioApp(
  WidgetTester tester, {
  FakeSessionApi? session,
  FakeStudioApi? studio,
  bool signedIn = true,
  MemoryAppPreferences? preferences,
  Size size = const Size(412, 915),
}) async {
  tester.view.physicalSize = size * tester.view.devicePixelRatio;
  addTearDown(tester.view.resetPhysicalSize);
  final sessionApi = session ?? FakeSessionApi();
  final studioApi = studio ?? FakeStudioApi(user: sessionApi.user);
  final secure = MemorySecureStore()..token = signedIn ? testToken : null;
  final prefs = preferences ?? MemoryAppPreferences();
  final container = ProviderContainer(
    retry: (retryCount, error) => null,
    overrides: [
      appConfigProvider.overrideWithValue(
        AppConfig(apiOrigin: Uri.parse('https://chapega.example')),
      ),
      preferencesProvider.overrideWithValue(prefs),
      secureStoreProvider.overrideWithValue(secure),
      deviceInfoProvider.overrideWithValue(
        const DeviceInfo(
          platform: 'android',
          appVersion: '1.0.0+1',
          model: 'Test phone',
          installationId: 'install-one',
        ),
      ),
      sessionApiProvider.overrideWithValue(sessionApi),
      studioApiProvider.overrideWith((ref, slug) => studioApi),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(container: container, child: const ChapegaStudioApp()),
  );
  await tester.pumpAndSettle();
  return TestApp(
    session: sessionApi,
    studio: studioApi,
    secure: secure,
    preferences: prefs,
    container: container,
  );
}
