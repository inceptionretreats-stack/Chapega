import 'package:chapega_studio/core/api/api_failure.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

Future<void> go(WidgetTester tester, String location) async {
  GoRouter.of(tester.element(find.byType(Navigator).first)).go(location);
  await tester.pumpAndSettle();
}

Finder field(String label) => find.widgetWithText(TextFormField, label);

void main() {
  group('shop settings', () {
    testWidgets('publishes a change and renames the shop everywhere', (tester) async {
      final app = await pumpStudioApp(tester);
      await go(tester, '/s/chapega/settings');
      final publish = find.widgetWithText(FilledButton, 'Publish settings');

      await tester.enterText(field('Shop name'), 'Chapega Gifts');
      await tester.pump();
      await tester.scrollUntilVisible(publish, 400, scrollable: find.byType(Scrollable).first);
      await tester.tap(publish);
      await tester.pumpAndSettle();

      expect(app.studio.snapshot.settings.shopName, 'Chapega Gifts');
      expect(find.text('Shop settings published to the kiosk.'), findsOneWidget);
      expect(find.text('Chapega Gifts'), findsWidgets);
    });

    testWidgets('shows the server\'s message on the field it refused', (tester) async {
      final app = await pumpStudioApp(tester);
      await go(tester, '/s/chapega/settings');
      app.studio.nextFailure = const HttpFailure(
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Check the highlighted information and try again.',
        fields: {
          'ownerWhatsAppNumber': ['Enter a valid WhatsApp number with 10 to 15 digits.'],
        },
      );
      await tester.enterText(field('Owner WhatsApp number'), '12345');
      await tester.pump();
      final publish = find.widgetWithText(FilledButton, 'Publish settings');
      await tester.scrollUntilVisible(publish, 400, scrollable: find.byType(Scrollable).first);
      await tester.tap(publish);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        field('Owner WhatsApp number'),
        -400,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Enter a valid WhatsApp number with 10 to 15 digits.'), findsOneWidget);
    });

    testWidgets('a newer revision from elsewhere must be loaded first', (tester) async {
      final app = await pumpStudioApp(tester);
      await go(tester, '/s/chapega/settings');
      await tester.enterText(field('Kiosk name'), 'Front desk');
      await tester.pump();
      // Someone publishes on the web meanwhile, and the next sync brings it.
      await app.studio.updateSettings(app.studio.snapshot.settings.copyWith(storeOpen: false));
      await tester.pump(const Duration(seconds: 31));
      await tester.pumpAndSettle();

      expect(find.textContaining('A newer settings revision is available'), findsOneWidget);
      final publish = find.widgetWithText(FilledButton, 'Publish settings');
      await tester.scrollUntilVisible(publish, 400, scrollable: find.byType(Scrollable).first);
      expect(tester.widget<FilledButton>(publish).onPressed, isNull);
      await tester.scrollUntilVisible(
        find.text('Load latest settings'),
        -400,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Load latest settings'));
      await tester.pumpAndSettle();
      expect(find.textContaining('A newer settings revision is available'), findsNothing);
    });
  });

  group('team', () {
    testWidgets('adds a staff member and hands over their details', (tester) async {
      final app = await pumpStudioApp(tester);
      await go(tester, '/s/chapega/more/team');
      expect(find.text('Kabir Staff'), findsOneWidget);
      expect(find.text('Waiting for their own password'), findsOneWidget);

      await tester.tap(find.text('Add member'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Meera Shah');
      await tester.enterText(find.widgetWithText(TextField, 'Email'), 'meera@example.com');
      await tester.tap(find.text('Generate'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Add to team'));
      await tester.pumpAndSettle();

      expect(find.text('Meera Shah was added'), findsOneWidget);
      expect(find.text('meera@example.com'), findsOneWidget);
      expect(app.studio.calls, contains('addTeamMember'));
      await tester.tap(find.widgetWithText(FilledButton, 'Done'));
      await tester.pumpAndSettle();
      expect(find.text('Meera Shah'), findsOneWidget);
    });

    testWidgets('removes access after asking', (tester) async {
      final app = await pumpStudioApp(tester);
      await go(tester, '/s/chapega/more/team');
      await tester.tap(find.text('Remove access'));
      await tester.pumpAndSettle();
      expect(find.text("Remove Kabir Staff's access?"), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Remove access'));
      await tester.pumpAndSettle();
      expect(find.text('No access'), findsOneWidget);
      expect(find.text('Give access again'), findsOneWidget);
      expect(app.studio.calls.last, startsWith('active:'));
    });

    testWidgets('only owners see Team', (tester) async {
      final session = FakeSessionApi(user: fakeUser(role: 'manager'));
      await pumpStudioApp(tester, session: session);
      await go(tester, '/s/chapega/more');
      expect(find.text('Team'), findsNothing);
      expect(find.text('Change password'), findsOneWidget);
    });
  });
}
