import 'package:chapega_studio/bootstrap/app_config.dart';
import 'package:chapega_studio/bootstrap/providers.dart';
import 'package:chapega_studio/core/json.dart';
import 'package:chapega_studio/core/platform/device_info.dart';
import 'package:chapega_studio/core/storage/app_preferences.dart';
import 'package:chapega_studio/core/storage/secure_store.dart';
import 'package:chapega_studio/features/alerts/new_order_alerts.dart';
import 'package:chapega_studio/models/vendor_order.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/fakes.dart';

VendorOrder order(String id, {String status = 'prepared'}) {
  final json = Map<String, Object?>.from(
    (fixtureJson('bootstrap.json')['orders']! as List<Object?>).first! as JsonMap,
  );
  json['id'] = id;
  json['orderNumber'] = 'GFT-20261031-$id';
  json['status'] = status;
  return VendorOrder.fromJson(json);
}

void main() {
  late ProviderContainer container;
  final announced = <NewOrderBatch>[];

  setUp(() {
    announced.clear();
    container = ProviderContainer(
      overrides: [
        appConfigProvider.overrideWithValue(AppConfig(apiOrigin: Uri.parse('https://x.example'))),
        preferencesProvider.overrideWithValue(MemoryAppPreferences()),
        secureStoreProvider.overrideWithValue(MemorySecureStore()),
        deviceInfoProvider.overrideWithValue(
          const DeviceInfo(platform: 'android', appVersion: '1', model: null, installationId: 'i'),
        ),
        sessionApiProvider.overrideWithValue(FakeSessionApi()),
        newOrderAnnouncerProvider.overrideWithValue(announced.add),
      ],
    );
    addTearDown(container.dispose);
  });

  test('the first sync of a shop only records what is there', () {
    final alerts = container.read(newOrderAlertsProvider.notifier);
    alerts.observe('chapega', [order('0001'), order('0002')]);
    expect(container.read(newOrderAlertsProvider).latest, isNull);
    expect(announced, isEmpty);
  });

  test('later syncs alert once for each new prepared order', () {
    final alerts = container.read(newOrderAlertsProvider.notifier);
    alerts.observe('chapega', [order('0001')]);
    alerts.observe('chapega', [order('0002'), order('0003', status: 'confirmed'), order('0001')]);
    final batch = container.read(newOrderAlertsProvider).latest!;
    expect(batch.orders.map((o) => o.id), ['0002']);
    expect(container.read(newOrderAlertsProvider).unseen, {'0002'});
    expect(announced, hasLength(1));

    // The same orders again: nothing new.
    alerts.observe('chapega', [order('0002'), order('0001')]);
    expect(announced, hasLength(1));

    alerts.markSeen('0002');
    expect(container.read(newOrderAlertsProvider).unseen, isEmpty);
  });

  test('each shop is seeded on its own first sync', () {
    final alerts = container.read(newOrderAlertsProvider.notifier);
    alerts.observe('chapega', [order('0001')]);
    alerts.observe('second-shop', [order('0009')]);
    expect(announced, isEmpty);
  });
}
