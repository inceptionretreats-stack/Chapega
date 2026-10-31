import 'package:chapega_studio/models/studio_snapshot.dart';
import 'package:chapega_studio/routing/app_router.dart';
import 'package:chapega_studio/routing/routes.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/fakes.dart';
import 'helpers/fonts.dart';
import 'helpers/pump_app.dart';

/// Every screen, in light and dark, at normal and the largest common text
/// size: no overflow, and Flutter's tap target, label and contrast checks.
/// A small phone gets the overflow check at both text sizes.
void main() {
  setUpAll(loadAppFonts);
  final snapshot = StudioSnapshot.fromJson(fixtureJson('bootstrap.json'));
  final screens = {
    'home': Routes.home('chapega'),
    'orders': Routes.orders('chapega'),
    'order': Routes.order('chapega', snapshot.orders.first.id),
    'products': Routes.products('chapega'),
    'product editor': Routes.editProduct('chapega', snapshot.products.first.id),
    'settings': Routes.settings('chapega'),
    'more': Routes.more('chapega'),
    'team': Routes.team('chapega'),
    'add team member': Routes.addTeamMember('chapega'),
    'change password': Routes.changePassword('chapega'),
    'notifications': Routes.notifications('chapega'),
    'about': Routes.about('chapega'),
  };

  for (final brightness in Brightness.values) {
    for (final textScale in [1.0, 2.0]) {
      testWidgets('screens pass the checks ($brightness, text ×$textScale)', (tester) async {
        tester.platformDispatcher.platformBrightnessTestValue = brightness;
        tester.platformDispatcher.textScaleFactorTestValue = textScale;
        addTearDown(tester.platformDispatcher.clearAllTestValues);
        final semantics = tester.ensureSemantics();

        await pumpStudioApp(tester, signedIn: false);
        await _expectAccessible(tester, 'sign in');

        final app = await pumpStudioApp(tester);
        final router = app.container.read(routerProvider);
        for (final MapEntry(key: name, value: location) in screens.entries) {
          router.go(location);
          await tester.pumpAndSettle();
          await _expectAccessible(tester, name);
        }
        semantics.dispose();
      });
    }
  }

  for (final textScale in [1.0, 2.0]) {
    testWidgets('screens fit a small phone (text ×$textScale)', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = textScale;
      addTearDown(tester.platformDispatcher.clearAllTestValues);
      const small = Size(360, 640);

      await pumpStudioApp(tester, signedIn: false, size: small);
      expect(tester.takeException(), isNull, reason: 'sign in: layout error');

      final app = await pumpStudioApp(tester, size: small);
      final router = app.container.read(routerProvider);
      for (final MapEntry(key: name, value: location) in screens.entries) {
        router.go(location);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: '$name: layout error');
      }
    });
  }
}

Future<void> _expectAccessible(WidgetTester tester, String screen) async {
  expect(tester.takeException(), isNull, reason: '$screen: layout error');
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline), reason: screen);
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline), reason: screen);
  await expectLater(tester, meetsGuideline(textContrastGuideline), reason: screen);
}
