import 'package:flutter/foundation.dart';

import '../core/json.dart';

/// Shop settings (`VendorSettings`): what the kiosk shows and its ordering rules.
@immutable
class VendorSettings {
  const VendorSettings({
    required this.shopName,
    required this.ownerWhatsAppNumber,
    required this.defaultCountryCode,
    required this.kioskName,
    required this.maxCartQuantity,
    required this.giftWrapFeePaise,
    required this.qrResetSeconds,
    required this.showPreviewLabel,
    required this.storeOpen,
    required this.lowStockThreshold,
    required this.version,
    required this.updatedAt,
  });

  factory VendorSettings.fromJson(JsonMap json) => VendorSettings(
    shopName: json.str('shopName'),
    ownerWhatsAppNumber: json.str('ownerWhatsAppNumber'),
    defaultCountryCode: json.str('defaultCountryCode'),
    kioskName: json.str('kioskName'),
    maxCartQuantity: json.integer('maxCartQuantity'),
    giftWrapFeePaise: json.integer('giftWrapFeePaise'),
    qrResetSeconds: json.integer('qrResetSeconds'),
    showPreviewLabel: json.boolean('showPreviewLabel'),
    storeOpen: json.boolean('storeOpen'),
    lowStockThreshold: json.integer('lowStockThreshold'),
    version: json.integer('version'),
    updatedAt: json.date('updatedAt'),
  );

  final String shopName;
  final String ownerWhatsAppNumber;
  final String defaultCountryCode;
  final String kioskName;
  final int maxCartQuantity;
  final int giftWrapFeePaise;
  final int qrResetSeconds;
  final bool showPreviewLabel;

  /// False while kiosk ordering is paused.
  final bool storeOpen;
  final int lowStockThreshold;
  final int version;
  final DateTime updatedAt;

  VendorSettings copyWith({
    String? shopName,
    String? ownerWhatsAppNumber,
    String? defaultCountryCode,
    String? kioskName,
    int? maxCartQuantity,
    int? giftWrapFeePaise,
    int? qrResetSeconds,
    bool? showPreviewLabel,
    bool? storeOpen,
    int? lowStockThreshold,
  }) => VendorSettings(
    shopName: shopName ?? this.shopName,
    ownerWhatsAppNumber: ownerWhatsAppNumber ?? this.ownerWhatsAppNumber,
    defaultCountryCode: defaultCountryCode ?? this.defaultCountryCode,
    kioskName: kioskName ?? this.kioskName,
    maxCartQuantity: maxCartQuantity ?? this.maxCartQuantity,
    giftWrapFeePaise: giftWrapFeePaise ?? this.giftWrapFeePaise,
    qrResetSeconds: qrResetSeconds ?? this.qrResetSeconds,
    showPreviewLabel: showPreviewLabel ?? this.showPreviewLabel,
    storeOpen: storeOpen ?? this.storeOpen,
    lowStockThreshold: lowStockThreshold ?? this.lowStockThreshold,
    version: version,
    updatedAt: updatedAt,
  );

  /// The PATCH body: every field plus the version being replaced. The
  /// server's schema is strict, so `updatedAt` is not sent.
  JsonMap toPatch() => {
    'shopName': shopName,
    'ownerWhatsAppNumber': ownerWhatsAppNumber,
    'defaultCountryCode': defaultCountryCode,
    'kioskName': kioskName,
    'maxCartQuantity': maxCartQuantity,
    'giftWrapFeePaise': giftWrapFeePaise,
    'qrResetSeconds': qrResetSeconds,
    'showPreviewLabel': showPreviewLabel,
    'storeOpen': storeOpen,
    'lowStockThreshold': lowStockThreshold,
    'version': version,
  };
}
