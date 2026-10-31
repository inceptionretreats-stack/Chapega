import 'package:chapega_studio/features/alerts/new_order_alerts.dart';
import 'package:chapega_studio/features/notifications/notification_service.dart';
import 'package:chapega_studio/models/studio_snapshot.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

void main() {
  test('alert text names the order, never the customer', () {
    final order = StudioSnapshot.fromJson(fixtureJson('bootstrap.json')).orders.first;
    final body = newOrderBody(NewOrderBatch(slug: 'chapega', orders: [order], serial: 1));
    expect(body, '${order.orderNumber} · ₹5,050.00 · 3 items');
    for (final private in [order.customer.name, order.customer.phone, order.customer.giftNote]) {
      expect(body, isNot(contains(private)));
    }
    final two = newOrderBody(NewOrderBatch(slug: 'chapega', orders: [order, order], serial: 2));
    expect(two, '2 orders · ₹10,100.00');
  });

  test('notification taps only route to well-formed shop orders', () {
    const target = NotificationTarget(slug: 'chapega', orderId: 'order-1');
    expect(NotificationTarget.fromPayload(target.payload)?.orderId, 'order-1');
    expect(NotificationTarget.from(slug: '../admin', orderId: 'x'), isNull);
    expect(NotificationTarget.from(slug: 'chapega', orderId: 'a/b'), isNull);
    expect(NotificationTarget.from(slug: 7, orderId: 'x'), isNull);
    expect(NotificationTarget.fromPayload('not json'), isNull);
    expect(NotificationTarget.fromPayload(null), isNull);
  });

  testWidgets('without Firebase settings the app says alerts need it open', (tester) async {
    await pumpStudioApp(tester);
    GoRouter.of(tester.element(find.byType(Navigator).first)).go('/s/chapega/more/notifications');
    await tester.pumpAndSettle();
    expect(find.textContaining('Alerts arrive only while the app is open'), findsOneWidget);
    expect(find.text('Push notifications'), findsNothing);
    expect(find.text('Alert me while the app is open'), findsOneWidget);
  });
}
