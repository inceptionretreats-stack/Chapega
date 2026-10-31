import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'bootstrap/app_config.dart';
import 'bootstrap/providers.dart';
import 'core/platform/device_info.dart';
import 'core/storage/app_preferences.dart';
import 'core/storage/secure_store.dart';
import 'features/alerts/new_order_alerts.dart';
import 'features/notifications/notification_providers.dart';
import 'features/notifications/notification_service.dart';
import 'features/notifications/push_service.dart';
import 'features/session/session_controller.dart';
import 'features/session/session_state.dart';
import 'features/studio/studio_store.dart';
import 'routing/app_router.dart';
import 'routing/routes.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = AppConfig.fromEnvironment();
  if (config.problem != null) {
    runApp(ConfigurationProblemApp(config.problem!));
    return;
  }
  _registerFontLicences();
  final preferences = await SharedAppPreferences.load();
  final secure = FlutterSecureStore();
  await wipeSecretsIfFreshInstall(secure, preferences);
  final device = await DeviceInfo.load(secure);
  final notifications = NotificationService();
  await notifications.initialize();
  final push = await PushService.start();

  final container = ProviderContainer(
    // Failed requests are shown and retried by people, never silently.
    retry: (retryCount, error) => null,
    overrides: [
      appConfigProvider.overrideWithValue(config),
      preferencesProvider.overrideWithValue(preferences),
      secureStoreProvider.overrideWithValue(secure),
      deviceInfoProvider.overrideWithValue(device),
      notificationServiceProvider.overrideWithValue(notifications),
      pushServiceProvider.overrideWithValue(push),
      newOrderAnnouncerProvider.overrideWithValue((batch) {
        if (preferences.inAppAlerts) unawaited(notifications.showNewOrders(batch));
      }),
    ],
  );

  // A tap on an alert opens that order (or the list, for several). Before
  // sign-in the router keeps the location and opens it afterwards.
  void open(NotificationTarget target) => container
      .read(routerProvider)
      .go(
        target.orderId == '_list'
            ? Routes.orders(target.slug)
            : Routes.order(target.slug, target.orderId),
      );
  notifications.onTap = open;

  container.listen<SessionState>(sessionControllerProvider, (previous, next) {
    final api = container.read(sessionApiProvider);
    final wasIn = previous is SignedIn || previous is PasswordChangeRequired;
    if (next is SignedOut && wasIn) {
      unawaited(notifications.cancelAll());
      if (push != null) unawaited(push.disable(api, signedOut: true).catchError((Object _) {}));
    }
    // A new session needs this phone's push token again.
    if (next is SignedIn && previous is! SignedIn && preferences.pushOptIn && push != null) {
      unawaited(push.enable(api).then<void>((_) {}, onError: (Object _) {}));
    }
  });

  await push?.listen(
    // A push while the app is open: sync now; the in-app alert follows.
    onMessage: (target) {
      if (target != null) {
        unawaited(
          container.read(studioStoreProvider(target.slug).notifier).refresh(background: true),
        );
      }
    },
    onOpen: open,
  );

  runApp(UncontrolledProviderScope(container: container, child: const ChapegaStudioApp()));

  final launchedBy = await notifications.launchTarget();
  if (launchedBy != null) open(launchedBy);
}

/// The bundled fonts' licences, shown on the licences page.
void _registerFontLicences() {
  LicenseRegistry.addLicense(() async* {
    for (final (font, file) in const [
      ('DM Sans', 'assets/fonts/OFL-DMSans.txt'),
      ('Playfair Display', 'assets/fonts/OFL-PlayfairDisplay.txt'),
    ]) {
      yield LicenseEntryWithLineBreaks([font], await rootBundle.loadString(file));
    }
  });
}
