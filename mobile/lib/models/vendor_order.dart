import 'package:flutter/foundation.dart';

import '../core/json.dart';
import '../domain/order_privacy.dart';
import '../domain/order_status.dart';

@immutable
class CustomerDetails {
  const CustomerDetails({
    required this.name,
    required this.phone,
    required this.giftNote,
    required this.orderNote,
  });

  factory CustomerDetails.fromJson(JsonMap json) => CustomerDetails(
    name: json.optStr('customerName') ?? '',
    phone: json.optStr('customerPhone') ?? '',
    giftNote: json.optStr('giftNote') ?? '',
    orderNote: json.optStr('orderNote') ?? '',
  );

  final String name;
  final String phone;
  final String giftNote;
  final String orderNote;

  /// Whether the shop can still see who placed the order.
  bool get isNotEmpty =>
      name.isNotEmpty || phone.isNotEmpty || giftNote.isNotEmpty || orderNote.isNotEmpty;
}

@immutable
class OrderItem {
  const OrderItem({
    required this.productId,
    required this.name,
    required this.image,
    required this.variantName,
    required this.quantity,
    required this.unitPricePaise,
    required this.giftWrapped,
    required this.lineTotalPaise,
  });

  factory OrderItem.fromJson(JsonMap json) => OrderItem(
    productId: json.str('productId'),
    name: json.str('name'),
    image: json.str('image'),
    variantName: json.optStr('variant'),
    quantity: json.integer('quantity'),
    unitPricePaise: json.integer('unitPricePaise'),
    giftWrapped: json.boolean('giftWrapped'),
    lineTotalPaise: json.integer('lineTotalPaise'),
  );

  final String productId;
  final String name;
  final String image;
  final String? variantName;
  final int quantity;
  final int unitPricePaise;
  final bool giftWrapped;
  final int lineTotalPaise;
}

@immutable
class OrderEvent {
  const OrderEvent({
    required this.id,
    required this.to,
    required this.actorName,
    required this.createdAt,
    this.note,
  });

  factory OrderEvent.fromJson(JsonMap json) => OrderEvent(
    id: json.str('id'),
    to: OrderStatus.parse(json.str('to')),
    actorName: json.str('actorName'),
    createdAt: json.date('createdAt'),
    note: json.optStr('note'),
  );

  final String id;
  final OrderStatus to;
  final String actorName;
  final DateTime createdAt;
  final String? note;
}

/// A kiosk order (`VendorOrder` in types/vendor.ts).
@immutable
class VendorOrder {
  const VendorOrder({
    required this.id,
    required this.orderNumber,
    required this.createdAt,
    required this.updatedAt,
    required this.customer,
    required this.kioskName,
    required this.items,
    required this.subtotalPaise,
    required this.giftWrapPaise,
    required this.totalPaise,
    required this.whatsappMessage,
    required this.status,
    required this.version,
    required this.inventoryCommitted,
    required this.events,
  });

  factory VendorOrder.fromJson(JsonMap json) => VendorOrder(
    id: json.str('id'),
    orderNumber: json.str('orderNumber'),
    createdAt: json.date('createdAt'),
    updatedAt: json.date('updatedAt'),
    customer: CustomerDetails.fromJson(json.obj('customer')),
    kioskName: json.str('kioskName'),
    items: json.list('items', OrderItem.fromJson),
    subtotalPaise: json.integer('subtotalPaise'),
    giftWrapPaise: json.integer('giftWrapPaise'),
    totalPaise: json.integer('totalPaise'),
    whatsappMessage: json.str('whatsappMessage'),
    status: OrderStatus.parse(json.str('status')),
    version: json.integer('version'),
    inventoryCommitted: json.boolean('inventoryCommitted'),
    events: json.list('events', OrderEvent.fromJson),
  );

  final String id;
  final String orderNumber;
  final DateTime createdAt;
  final DateTime updatedAt;
  final CustomerDetails customer;
  final String kioskName;
  final List<OrderItem> items;
  final int subtotalPaise;
  final int giftWrapPaise;
  final int totalPaise;

  /// The prepared WhatsApp text, or the removal notice once details are gone.
  final String whatsappMessage;
  final OrderStatus status;
  final int version;

  /// Stock was taken for this order (on confirm); cancelling gives it back.
  final bool inventoryCommitted;
  final List<OrderEvent> events;

  bool get isActive => !status.isFinished;

  int get unitCount => items.fold(0, (total, item) => total + item.quantity);

  bool get detailsRemoved => customerDetailsRemoved(whatsappMessage);

  /// The customer's name, or why there is none (`customerLabel` on the web).
  String get customerLabel {
    if (customer.name.isNotEmpty) return customer.name;
    return detailsRemoved ? 'Details removed' : 'Walk-in customer';
  }
}
