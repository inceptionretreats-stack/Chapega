import 'package:chapega_studio/app.dart';
import 'package:chapega_studio/bootstrap/app_config.dart';
import 'package:chapega_studio/core/storage/app_preferences.dart';
import 'package:chapega_studio/core/storage/secure_store.dart';
import 'package:chapega_studio/features/session/session_controller.dart';
import 'package:chapega_studio/main.dart' as app;
import 'package:chapega_studio/ui/product_image.dart';
import 'package:chapega_studio/ui/status_badge.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

// This capture harness is only for the isolated synthetic demo server. It
// refuses release builds and every other API origin before starting the app.
const _origin = String.fromEnvironment('CHAPEGA_API_ORIGIN');
const _demoOrigin = 'http://10.0.2.2:3340';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('capture the local demo Studio for the store listing', (tester) async {
    expect(kDebugMode, isTrue, reason: 'Store captures require a local demo debug build.');
    expect(defaultTargetPlatform, TargetPlatform.android);
    expect(
      _origin,
      _demoOrigin,
      reason: 'Capture only the isolated synthetic server on port 3340.',
    );
    expect(AppConfig.fromEnvironment().apiOrigin.toString(), _demoOrigin);

    await FlutterSecureStore().deleteToken();
    final preferences = await SharedAppPreferences.load();
    // A previous local demo opt-in must never trigger a system permission
    // prompt or push registration when this harness signs in.
    await preferences.setPushOptIn(false);
    try {
      await app.main();
      await _waitFor(tester, find.text('Email address'));
      // Public development fixtures only. No real shop sign-in belongs here.
      await tester.enterText(find.widgetWithText(TextField, 'Email address'), 'owner@chapega.com');
      await tester.enterText(find.widgetWithText(TextField, 'Password'), 'Chapega@2026');
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await _waitFor(tester, find.text('Live orders'));
      await binding.convertFlutterSurfaceToImage();
      await _capture(tester, binding, '01-home');

      await _openTab(tester, 'Orders');
      await _waitFor(tester, find.text('Active queue'));
      await _waitFor(tester, find.byType(OrderStatusBadge).first);
      await _capture(tester, binding, '02-orders');

      await tester.tap(find.byType(OrderStatusBadge).first);
      await _waitFor(tester, find.text('Items'));
      await _capture(tester, binding, '03-order-detail');

      await _openTab(tester, 'Products');
      await _waitFor(tester, find.byType(ProductImage).first);
      await _capture(tester, binding, '04-products');
      // Only this isolated app's sign-in/preference state changes; never
      // change a demo order, product, shop setting or notification permission.
    } finally {
      try {
        final studio = find.byType(ChapegaStudioApp);
        if (studio.evaluate().isNotEmpty) {
          final container = ProviderScope.containerOf(tester.element(studio), listen: false);
          await container.read(sessionControllerProvider.notifier).signOut();
          await tester.pump(const Duration(milliseconds: 300));
        }
      } finally {
        await FlutterSecureStore().deleteToken();
        expect(await FlutterSecureStore().readToken(), isNull);
      }
    }
  });
}

Future<void> _openTab(WidgetTester tester, String label) async {
  await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(label)));
  await tester.pump();
}

Future<void> _capture(
  WidgetTester tester,
  IntegrationTestWidgetsFlutterBinding binding,
  String name,
) async {
  // Allow local catalogue photos and the new page to finish painting.
  await tester.pump(const Duration(seconds: 2));
  expect(tester.takeException(), isNull);
  await binding.takeScreenshot(name);
}

Future<void> _waitFor(WidgetTester tester, Finder finder) async {
  final deadline = DateTime.now().add(const Duration(seconds: 45));
  while (finder.evaluate().isEmpty) {
    if (DateTime.now().isAfter(deadline)) fail('Timed out waiting for $finder');
    await tester.pump(const Duration(milliseconds: 200));
  }
  await tester.pump(const Duration(milliseconds: 300));
}
