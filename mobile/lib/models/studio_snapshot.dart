import 'package:flutter/foundation.dart';

import '../core/json.dart';
import 'vendor_order.dart';
import 'vendor_product.dart';
import 'vendor_settings.dart';
import 'vendor_user.dart';

/// Everything one shop's Studio shows, from `GET /api/vendor/{slug}/bootstrap`.
/// Kept in memory only: orders carry customer names and phone numbers.
@immutable
class StudioSnapshot {
  const StudioSnapshot({
    required this.user,
    required this.vendor,
    required this.capabilities,
    required this.revision,
    required this.products,
    required this.orders,
    required this.settings,
  });

  factory StudioSnapshot.fromJson(JsonMap json) => StudioSnapshot(
    user: VendorUser.fromJson(json.obj('user')),
    vendor: VendorIdentity.fromJson(json.obj('vendor')),
    capabilities: VendorCapabilities.fromJson(json.obj('capabilities')),
    revision: json.integer('revision'),
    products: json.list('products', VendorProduct.fromJson),
    orders: json.list('orders', VendorOrder.fromJson),
    settings: VendorSettings.fromJson(json.obj('settings')),
  );

  final VendorUser user;
  final VendorIdentity vendor;
  final VendorCapabilities capabilities;

  /// Bumped by every catalogue, order or settings change.
  final int revision;

  /// Newest first, as the server sends them; archived products are left out.
  final List<VendorProduct> products;

  /// Newest first.
  final List<VendorOrder> orders;
  final VendorSettings settings;

  StudioSnapshot copyWith({
    VendorIdentity? vendor,
    int? revision,
    List<VendorProduct>? products,
    List<VendorOrder>? orders,
    VendorSettings? settings,
  }) => StudioSnapshot(
    user: user,
    vendor: vendor ?? this.vendor,
    capabilities: capabilities,
    revision: revision ?? this.revision,
    products: products ?? this.products,
    orders: orders ?? this.orders,
    settings: settings ?? this.settings,
  );

  VendorOrder? order(String id) {
    for (final order in orders) {
      if (order.id == id) return order;
    }
    return null;
  }

  VendorProduct? product(String id) {
    for (final product in products) {
      if (product.id == id) return product;
    }
    return null;
  }

  /// Categories in use, alphabetical.
  List<String> get categories {
    final set = {for (final product in products) product.category}.toList()..sort();
    return set;
  }
}
