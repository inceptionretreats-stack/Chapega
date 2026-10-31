import 'package:chapega_studio/models/studio_snapshot.dart';
import 'package:chapega_studio/routing/app_router.dart';
import 'package:chapega_studio/routing/routes.dart';
import 'package:chapega_studio/theme/chapega_colors.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/fakes.dart';
import 'helpers/fonts.dart';
import 'helpers/pump_app.dart';

/// Every screen, in light and dark, at normal and the largest common text
/// size: no overflow, and Flutter's tap target and label checks; contrast is
/// checked on the colour tokens. A small phone gets the overflow check at
/// both text sizes.
void main() {
  setUpAll(loadAppFonts);
  _tokenContrast();
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

/// Contrast is checked on the colour tokens (below), not with
/// `textContrastGuideline`: that one samples rendered pixels, and the
/// anti-aliased edges of small text differ between Windows and Linux, so it
/// measured 2.98:1 on CI for a pair that is 8.79:1.
Future<void> _expectAccessible(WidgetTester tester, String screen) async {
  expect(tester.takeException(), isNull, reason: '$screen: layout error');
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline), reason: screen);
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline), reason: screen);
}

double _contrast(Color a, Color b) {
  final (lighter, darker) = a.computeLuminance() > b.computeLuminance() ? (a, b) : (b, a);
  return (lighter.computeLuminance() + 0.05) / (darker.computeLuminance() + 0.05);
}

void _tokenContrast() {
  for (final (name, c) in [('light', ChapegaColors.light), ('dark', ChapegaColors.dark)]) {
    test('the $name colours meet WCAG AA contrast', () {
      // Text and the backgrounds it is drawn on: 4.5:1.
      final text = {
        'text on page': (c.text, c.page),
        'text on surface': (c.text, c.surface),
        'text on subtle': (c.text, c.subtle),
        'text on selected': (c.text, c.selected),
        'muted on page': (c.muted, c.page),
        'muted on surface': (c.muted, c.surface),
        'muted on subtle': (c.muted, c.subtle),
        'accent text on page': (c.textAccent, c.page),
        'accent text on surface': (c.textAccent, c.surface),
        'accent text on selected': (c.textAccent, c.selected),
        'button label on accent': (c.onAccent, c.accent),
        'success badge': (c.successText, c.successSurface),
        'warning badge': (c.warningText, c.warningSurface),
        'danger badge': (c.dangerText, c.dangerSurface),
        'success text on surface': (c.successText, c.surface),
        'danger text on surface': (c.dangerText, c.surface),
      };
      for (final MapEntry(key: pair, value: (foreground, background)) in text.entries) {
        expect(_contrast(foreground, background), greaterThanOrEqualTo(4.5), reason: pair);
      }
      // Input outlines are user-interface components: 3:1 (WCAG 1.4.11).
      expect(_contrast(c.borderControl, c.surface), greaterThanOrEqualTo(3), reason: 'outline');
      expect(_contrast(c.borderControl, c.page), greaterThanOrEqualTo(3), reason: 'outline');
    });
  }
}
