import 'package:chapega_studio/core/json.dart';
import 'package:chapega_studio/models/studio_snapshot.dart';
import 'package:chapega_studio/models/vendor_order.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

/// The fixture shop with its order still prepared (no stock taken yet).
StudioSnapshot preparedShop() {
  final json = fixtureJson('bootstrap.json');
  final order = (json['orders']! as List<Object?>).first! as JsonMap;
  order['status'] = 'prepared';
  order['version'] = 1;
  order['inventoryCommitted'] = false;
  order['events'] = [(order['events']! as List<Object?>).first];
  return StudioSnapshot.fromJson(json);
}

Future<void> openFirstOrder(WidgetTester tester, TestApp app) async {
  final order = app.studio.snapshot.orders.first;
  GoRouter.of(tester.element(find.byType(NavigationBar))).go('/s/chapega/orders/${order.id}');
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('confirms a prepared order and shows its next step', (tester) async {
    final studio = FakeStudioApi(snapshot: preparedShop());
    final app = await pumpStudioApp(tester, studio: studio);
    await openFirstOrder(tester, app);

    expect(find.textContaining('Prepared does not mean sent.'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Confirm order'));
    await tester.pumpAndSettle();

    final order = studio.snapshot.orders.first;
    expect(studio.calls, contains('order:${order.id}:confirmed'));
    expect(find.textContaining('is now confirmed'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Mark as preparing'), findsOneWidget);
  });

  testWidgets('a change made elsewhere is explained, never retried blindly', (tester) async {
    final studio = FakeStudioApi(snapshot: preparedShop());
    final app = await pumpStudioApp(tester, studio: studio);
    await openFirstOrder(tester, app);
    // Another device confirms it first.
    final order = studio.snapshot.orders.first;
    await studio.updateOrderStatus(order.id, order.status.next!, order.version);
    studio.calls.clear();

    await tester.tap(find.widgetWithText(FilledButton, 'Confirm order'));
    await tester.pumpAndSettle();

    expect(
      find.text('This order was updated on another device. It is now confirmed.'),
      findsOneWidget,
    );
    expect(studio.calls.where((call) => call.startsWith('order:')), hasLength(1));
    expect(find.widgetWithText(FilledButton, 'Mark as preparing'), findsOneWidget);
  });

  testWidgets('cancelling asks first and says what happens to stock', (tester) async {
    final app = await pumpStudioApp(tester);
    await openFirstOrder(tester, app);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Cancel order'));
    await tester.pumpAndSettle();
    expect(find.textContaining('restores this order’s stock'), findsOneWidget);
    await tester.tap(find.text('Keep order'));
    await tester.pumpAndSettle();
    expect(app.studio.calls.where((call) => call.contains(':cancelled')), isEmpty);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Cancel order'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Cancel order'));
    await tester.pumpAndSettle();
    expect(app.studio.snapshot.orders.first.status.wire, 'cancelled');
    expect(find.widgetWithText(OutlinedButton, 'Cancel order'), findsNothing);
  });

  testWidgets('removes customer details on request', (tester) async {
    final app = await pumpStudioApp(tester);
    await openFirstOrder(tester, app);
    expect(find.text('Riya Sharma'), findsOneWidget);

    await tester.tap(find.byTooltip('More actions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove customer details'));
    await tester.pumpAndSettle();
    expect(find.textContaining('does not delete WhatsApp chats'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Remove details'));
    await tester.pumpAndSettle();

    expect(find.text('Details removed'), findsOneWidget);
    expect(find.text('Removed on request or after 30 days'), findsOneWidget);
    expect(find.text('Call'), findsNothing);
  });

  testWidgets('staff cannot remove customer details', (tester) async {
    final session = FakeSessionApi(user: fakeUser(role: 'staff'));
    final app = await pumpStudioApp(tester, session: session);
    await openFirstOrder(tester, app);
    await tester.tap(find.byTooltip('More actions'));
    await tester.pumpAndSettle();
    expect(find.text('View prepared message'), findsOneWidget);
    expect(find.text('Remove customer details'), findsNothing);
  });

  testWidgets('finds an order by the phone digits a customer reads out', (tester) async {
    final app = await pumpStudioApp(tester);
    GoRouter.of(tester.element(find.byType(NavigationBar))).go('/s/chapega/orders');
    await tester.pumpAndSettle();
    await tester.tap(find.text('All orders (1)'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), '98765 43210');
    await tester.pumpAndSettle();
    expect(find.text('1 order in this view'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '11111');
    await tester.pumpAndSettle();
    expect(find.text('No orders here yet'), findsOneWidget);
    expect(app.studio.calls, contains('bootstrap'));
  });

  testWidgets('a new kiosk order raises a banner, but old ones never do', (tester) async {
    final studio = FakeStudioApi(snapshot: preparedShop());
    final original = studio.snapshot;
    studio.snapshot = original.copyWith(orders: const <VendorOrder>[]);
    await pumpStudioApp(tester, studio: studio);
    expect(find.textContaining('New order'), findsNothing);

    // The next background sync brings the order.
    studio.snapshot = original;
    await tester.pump(const Duration(seconds: 31));
    await tester.pumpAndSettle();
    expect(find.text('New order ${original.orders.first.orderNumber}'), findsOneWidget);
    expect(studio.calls, contains('bootstrap:background'));

    await tester.tap(find.byTooltip('Dismiss'));
    await tester.pumpAndSettle();
    expect(find.textContaining('New order'), findsNothing);
  });
}
