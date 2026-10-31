import 'package:chapega_studio/core/storage/secure_store.dart';
import 'package:chapega_studio/main.dart' as app;
import 'package:chapega_studio/ui/status_badge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// The real app against a real Chapega.com server: sign in, every tab, a
/// product and an order, the team, then sign out. It changes nothing on the
/// server except the phone session. See mobile/README.md → "Integration test".
const _email = String.fromEnvironment('CHAPEGA_IT_EMAIL');
const _password = String.fromEnvironment('CHAPEGA_IT_PASSWORD');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('sign in, walk the Studio, sign out', (tester) async {
    expect(
      _email.isNotEmpty && _password.isNotEmpty,
      isTrue,
      reason: 'Pass --dart-define=CHAPEGA_IT_EMAIL=… and CHAPEGA_IT_PASSWORD=…',
    );
    // Start signed out, whatever an earlier run left behind.
    await FlutterSecureStore().deleteToken();
    await app.main();

    await _waitFor(tester, find.text('Email address'));
    await tester.enterText(find.widgetWithText(TextField, 'Email address'), _email);
    await tester.enterText(find.widgetWithText(TextField, 'Password'), _password);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await _waitFor(tester, find.widgetWithText(AppBar, 'Home'));

    await _openTab(tester, 'Orders');
    await _waitFor(tester, find.widgetWithText(AppBar, 'Orders'));
    final orders = find.byType(OrderStatusBadge);
    if (orders.evaluate().isNotEmpty) {
      await tester.tap(orders.first);
      await _waitFor(tester, find.text('Items'));
      await _back(tester, find.widgetWithText(AppBar, 'Orders'));
    }

    await _openTab(tester, 'Products');
    await _waitFor(tester, find.widgetWithText(AppBar, 'Products'));
    final products = find.textContaining('Updated ');
    if (products.evaluate().isNotEmpty) {
      await tester.tap(products.first);
      await _waitFor(tester, find.text('Edit product'));
      await _back(tester, find.widgetWithText(AppBar, 'Products'));
    }

    await _openTab(tester, 'Settings');
    await _waitFor(tester, find.widgetWithText(AppBar, 'Shop settings'));

    await _openTab(tester, 'More');
    await tester.tap(find.text('Team'));
    await _waitFor(tester, find.text(_email));
    await _back(tester, find.text('About'));
    await tester.tap(find.text('About'));
    await _waitFor(tester, find.text('Open-source licences'));
    await _back(tester, find.text('Notifications'));

    final signOut = find.text('Sign out');
    await tester.scrollUntilVisible(signOut, 200, scrollable: find.byType(Scrollable).first);
    // The last scroll is laid out on the next frame; tap after it.
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(signOut);
    await _waitFor(tester, find.byType(AlertDialog));
    await tester.tap(
      find.descendant(of: find.byType(AlertDialog), matching: find.text('Sign out')),
    );
    await _waitFor(tester, find.text('Email address'));
    expect(await FlutterSecureStore().readToken(), isNull);
  });
}

Future<void> _openTab(WidgetTester tester, String label) async {
  await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(label)));
  await tester.pump();
}

/// The system back button, then wait for where it leads.
Future<void> _back(WidgetTester tester, Finder destination) async {
  await tester.binding.handlePopRoute();
  await _waitFor(tester, destination);
}

/// Pumps real frames until [finder] matches: the server answers in its own time.
Future<void> _waitFor(WidgetTester tester, Finder finder) async {
  final deadline = DateTime.now().add(const Duration(seconds: 30));
  while (finder.evaluate().isEmpty) {
    if (DateTime.now().isAfter(deadline)) fail('Timed out waiting for $finder');
    await tester.pump(const Duration(milliseconds: 200));
  }
  await tester.pump(const Duration(milliseconds: 300));
}
