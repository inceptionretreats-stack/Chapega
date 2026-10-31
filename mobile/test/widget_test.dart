import 'package:chapega_studio/core/api/api_failure.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/fakes.dart';
import 'helpers/pump_app.dart';

void main() {
  testWidgets('signs in and opens the shop', (tester) async {
    final app = await pumpStudioApp(tester, signedIn: false);
    expect(find.text('Welcome back'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Email address'), ' owner@chapega.com ');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'a long passphrase');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    expect(app.session.lastEmail, 'owner@chapega.com');
    expect(app.session.lastDevice?.installationId, 'install-one');
    expect(app.secure.token, testToken);
    expect(find.text('Welcome back, Aanya'), findsOneWidget);
    expect(find.text('Live orders'), findsOneWidget);
    expect(app.preferences.lastShopSlug, 'chapega');
  });

  testWidgets('says why sign-in failed and keeps the fields', (tester) async {
    final session = FakeSessionApi(
      signInFailure: const HttpFailure(
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'The email or password is incorrect.',
      ),
    );
    await pumpStudioApp(tester, session: session, signedIn: false);
    await tester.enterText(find.widgetWithText(TextField, 'Email address'), 'owner@chapega.com');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'wrong');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('The email or password is incorrect.'), findsOneWidget);
    expect(find.text('owner@chapega.com'), findsOneWidget);
  });

  testWidgets('counts down before another attempt when rate limited', (tester) async {
    final session = FakeSessionApi(
      signInFailure: const HttpFailure(
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Too many sign-in attempts. Wait a moment and try again.',
        retryAfter: Duration(seconds: 12),
      ),
    );
    await pumpStudioApp(tester, session: session, signedIn: false);
    await tester.enterText(find.widgetWithText(TextField, 'Email address'), 'owner@chapega.com');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'a long passphrase');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pump();
    await tester.pump();
    expect(find.textContaining('Try again in'), findsOneWidget);
    await tester.pump(const Duration(seconds: 13));
    await tester.pump();
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
  });

  testWidgets('restores a stored session at launch', (tester) async {
    final app = await pumpStudioApp(tester);
    expect(app.session.calls, contains('current'));
    expect(find.text('Welcome back, Aanya'), findsOneWidget);
  });

  testWidgets('never sends a token issued by another server', (tester) async {
    final app = await pumpStudioApp(tester, storedOrigin: 'http://10.0.2.2:3300');
    expect(app.session.calls, isNot(contains('current')));
    expect(await app.secure.readToken(), isNull);
    expect(find.text('Sign in'), findsWidgets);
  });

  testWidgets('an ended session signs out with an explanation', (tester) async {
    final session = FakeSessionApi(
      currentFailure: const HttpFailure(
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Sign in to continue.',
      ),
    );
    final app = await pumpStudioApp(tester, session: session);
    expect(find.text('Your session ended. Sign in again.'), findsOneWidget);
    expect(app.secure.token, isNull);
  });

  testWidgets('no network at launch keeps the session and offers a retry', (tester) async {
    final session = FakeSessionApi(currentFailure: const NetworkFailure());
    final app = await pumpStudioApp(tester, session: session);
    expect(find.text("Can't reach Chapega.com"), findsOneWidget);
    expect(app.secure.token, testToken);

    session.currentFailure = null;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back, Aanya'), findsOneWidget);
  });

  testWidgets('a temporary password must be replaced before the Studio opens', (tester) async {
    final session = FakeSessionApi(user: fakeUser(mustChangePassword: true));
    await pumpStudioApp(tester, session: session);
    expect(find.text('Set a new password'), findsOneWidget);
    expect(find.text('Save and open the Studio'), findsOneWidget);
  });

  testWidgets('staff see only the tabs their role can use', (tester) async {
    final session = FakeSessionApi(user: fakeUser(role: 'staff'));
    await pumpStudioApp(tester, session: session);
    final bar = find.byType(NavigationBar);
    expect(find.descendant(of: bar, matching: find.text('Home')), findsOneWidget);
    expect(find.descendant(of: bar, matching: find.text('Orders')), findsOneWidget);
    expect(find.descendant(of: bar, matching: find.text('Products')), findsNothing);
    expect(find.descendant(of: bar, matching: find.text('Settings')), findsNothing);
    expect(find.descendant(of: bar, matching: find.text('More')), findsOneWidget);
  });

  testWidgets('signing out forgets the session', (tester) async {
    final app = await pumpStudioApp(tester);
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(OutlinedButton, 'Sign out'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.pumpAndSettle();
    expect(app.session.calls, contains('signOut'));
    expect(app.secure.token, isNull);
    expect(find.text('Welcome back'), findsOneWidget);
  });
}
