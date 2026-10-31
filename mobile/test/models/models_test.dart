import 'dart:convert';
import 'dart:io';

import 'package:chapega_studio/core/json.dart';
import 'package:chapega_studio/domain/order_status.dart';
import 'package:chapega_studio/domain/team.dart';
import 'package:chapega_studio/models/app_session.dart';
import 'package:chapega_studio/models/studio_snapshot.dart';
import 'package:chapega_studio/models/team_member.dart';
import 'package:chapega_studio/models/vendor_user.dart';
import 'package:flutter_test/flutter_test.dart';

/// Fixtures are real responses captured from the local backend (synthetic
/// shop and customer), so these tests break if the API shape changes.
JsonMap fixture(String name) =>
    jsonDecode(File('test/fixtures/$name').readAsStringSync()) as JsonMap;

void main() {
  test('reads a whole Studio bootstrap', () {
    final snapshot = StudioSnapshot.fromJson(fixture('bootstrap.json'));
    expect(snapshot.vendor.slug, 'chapega');
    expect(snapshot.user.role, VendorRole.owner);
    expect(snapshot.capabilities.manageTeam, isTrue);
    expect(snapshot.products, hasLength(25));
    expect(snapshot.settings.giftWrapFeePaise, 2500);
    expect(snapshot.settings.storeOpen, isTrue);

    final order = snapshot.orders.single;
    expect(order.orderNumber, startsWith('GFT-'));
    expect(order.status, OrderStatus.confirmed);
    expect(order.inventoryCommitted, isTrue);
    expect(order.customer.phone, '+91 98765 43210');
    expect(order.customerLabel, 'Riya Sharma');
    expect(order.unitCount, 3);
    expect(order.items.last.giftWrapped, isTrue);
    expect(order.events.map((event) => event.to), [OrderStatus.prepared, OrderStatus.confirmed]);
    expect(order.detailsRemoved, isFalse);

    final necklace = snapshot.product('engraved-name-necklace')!;
    expect(necklace.compareAtPricePaise, 159900);
    expect(necklace.variants.map((variant) => variant.name), ['Silver finish', 'Gold finish']);
    expect(necklace.variants.first.stock, isNull);
    expect(necklace.variants.last.stock, 1);
    expect(snapshot.categories, contains('Personalized Gifts'));
  });

  test('sends a full product replacement without nulls', () {
    final snapshot = StudioSnapshot.fromJson(fixture('bootstrap.json'));
    final necklace = snapshot.product('engraved-name-necklace')!;
    final body = necklace.toInput(visible: false).toJson();
    expect(body['visible'], isFalse);
    expect(body['version'], necklace.version);
    expect(body.values, isNot(contains(null)));
    expect((body['variants']! as List<Object?>).first, isNot(contains('stock')));

    final plain = snapshot.products.firstWhere((product) => product.compareAtPricePaise == null);
    expect(plain.toInput().toJson().containsKey('compareAtPricePaise'), isFalse);
  });

  test('sends settings without updatedAt (the server schema is strict)', () {
    final snapshot = StudioSnapshot.fromJson(fixture('bootstrap.json'));
    final body = snapshot.settings.copyWith(storeOpen: false).toPatch();
    expect(body.containsKey('updatedAt'), isFalse);
    expect(body['storeOpen'], isFalse);
    expect(body['version'], snapshot.settings.version);
  });

  test('reads the signed-in person and their shops', () {
    final user = VendorUser.fromJson(fixture('login_user.json'));
    expect(user.isPlatformAdmin, isTrue);
    expect(user.mustChangePassword, isFalse);
    expect(user.usableShops.single.vendor.slug, 'chapega');
    expect(user.capabilities, VendorCapabilities.forRole(VendorRole.owner));
  });

  test('reads the team', () {
    final members = fixture('team.json').list('members', TeamMember.fromJson);
    expect(members.first.isCurrentUser, isTrue);
    expect(members.first.stateLabel, 'Active');
    final staff = members.last;
    expect(staff.role, VendorRole.staff);
    expect(staff.stateLabel, 'Waiting for their own password');
    expect(staff.canManage, isTrue);
  });

  test('describes the device without blanks or oversized labels', () {
    const device = DeviceDetails(
      installationId: '5f0c7c58-4a39-4d8e-9a43-7f5a3a1f1c11',
      platform: 'android',
      model: '   ',
      appVersion: '1.0.0+1',
    );
    expect(device.toJson(), {
      'installationId': '5f0c7c58-4a39-4d8e-9a43-7f5a3a1f1c11',
      'platform': 'android',
      'appVersion': '1.0.0+1',
    });
    final long = DeviceDetails(installationId: 'x', platform: 'ios', model: 'M' * 80);
    expect((long.toJson()['model']! as String).length, 60);
    expect(
      const DeviceDetails(installationId: 'x', platform: 'ios', appVersion: '1.0 beta').toJson(),
      isNot(contains('appVersion')),
    );
  });

  test('names a missing field when the API shape changes', () {
    final broken = fixture('bootstrap.json')..remove('settings');
    expect(
      () => StudioSnapshot.fromJson(broken),
      throwsA(
        isA<FormatException>().having((error) => error.message, 'message', contains('settings')),
      ),
    );
  });
}
