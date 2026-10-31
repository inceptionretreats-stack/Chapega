import 'package:flutter/foundation.dart';

import '../core/json.dart';

@immutable
class ProductVariant {
  const ProductVariant({
    required this.id,
    required this.name,
    required this.priceAdjustmentPaise,
    this.stock,
  });

  factory ProductVariant.fromJson(JsonMap json) => ProductVariant(
    id: json.str('id'),
    name: json.str('name'),
    priceAdjustmentPaise: json.integer('priceAdjustmentPaise'),
    stock: json.optInt('stock'),
  );

  final String id;
  final String name;

  /// Added to the product price; negative for a cheaper option.
  final int priceAdjustmentPaise;

  /// Its own stock, or null to share the product's.
  final int? stock;

  JsonMap toJson() => {
    'id': id,
    'name': name,
    'priceAdjustmentPaise': priceAdjustmentPaise,
    if (stock != null) 'stock': stock,
  };
}

/// A catalogue product as the Studio sees it (`VendorProduct`).
@immutable
class VendorProduct {
  const VendorProduct({
    required this.id,
    required this.name,
    required this.shortDescription,
    required this.description,
    required this.category,
    required this.pricePaise,
    required this.compareAtPricePaise,
    required this.image,
    required this.stock,
    required this.featured,
    required this.tags,
    required this.recipientTags,
    required this.occasionTags,
    required this.variants,
    required this.preparationTime,
    required this.giftWrapEligible,
    required this.visible,
    required this.version,
    required this.createdAt,
    required this.updatedAt,
  });

  factory VendorProduct.fromJson(JsonMap json) => VendorProduct(
    id: json.str('id'),
    name: json.str('name'),
    shortDescription: json.str('shortDescription'),
    description: json.str('description'),
    category: json.str('category'),
    pricePaise: json.integer('pricePaise'),
    compareAtPricePaise: json.optInt('compareAtPricePaise'),
    image: json.str('image'),
    stock: json.integer('stock'),
    featured: json.boolean('featured'),
    tags: json.strings('tags'),
    recipientTags: json.strings('recipientTags'),
    occasionTags: json.strings('occasionTags'),
    variants: json.list('variants', ProductVariant.fromJson),
    preparationTime: json.str('preparationTime'),
    giftWrapEligible: json.boolean('giftWrapEligible'),
    visible: json.boolean('visible'),
    version: json.integer('version'),
    createdAt: json.date('createdAt'),
    updatedAt: json.date('updatedAt'),
  );

  final String id;
  final String name;
  final String shortDescription;
  final String description;
  final String category;
  final int pricePaise;
  final int? compareAtPricePaise;
  final String image;
  final int stock;
  final bool featured;
  final List<String> tags;
  final List<String> recipientTags;
  final List<String> occasionTags;
  final List<ProductVariant> variants;
  final String preparationTime;
  final bool giftWrapEligible;
  final bool visible;
  final int version;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// The full replacement the PATCH endpoint expects, with one change.
  ProductInput toInput({bool? visible}) => ProductInput(
    name: name,
    shortDescription: shortDescription,
    description: description,
    category: category,
    pricePaise: pricePaise,
    compareAtPricePaise: compareAtPricePaise,
    image: image,
    stock: stock,
    featured: featured,
    tags: tags,
    recipientTags: recipientTags,
    occasionTags: occasionTags,
    variants: variants,
    preparationTime: preparationTime,
    giftWrapEligible: giftWrapEligible,
    visible: visible ?? this.visible,
    version: version,
  );
}

/// What the Studio sends to create or replace a product (`VendorProductInput`).
/// The server's schema is strict, so absent values are left out, never null.
@immutable
class ProductInput {
  const ProductInput({
    required this.name,
    required this.shortDescription,
    required this.description,
    required this.category,
    required this.pricePaise,
    required this.compareAtPricePaise,
    required this.image,
    required this.stock,
    required this.featured,
    required this.tags,
    required this.recipientTags,
    required this.occasionTags,
    required this.variants,
    required this.preparationTime,
    required this.giftWrapEligible,
    required this.visible,
    this.version,
  });

  final String name;
  final String shortDescription;
  final String description;
  final String category;
  final int pricePaise;
  final int? compareAtPricePaise;
  final String image;
  final int stock;
  final bool featured;
  final List<String> tags;
  final List<String> recipientTags;
  final List<String> occasionTags;
  final List<ProductVariant> variants;
  final String preparationTime;
  final bool giftWrapEligible;
  final bool visible;

  /// The version being replaced; null when creating.
  final int? version;

  JsonMap toJson() => {
    'name': name,
    'shortDescription': shortDescription,
    'description': description,
    'category': category,
    'pricePaise': pricePaise,
    if (compareAtPricePaise != null) 'compareAtPricePaise': compareAtPricePaise,
    'image': image,
    'stock': stock,
    'featured': featured,
    'tags': tags,
    'recipientTags': recipientTags,
    'occasionTags': occasionTags,
    'variants': [for (final variant in variants) variant.toJson()],
    'preparationTime': preparationTime,
    'giftWrapEligible': giftWrapEligible,
    'visible': visible,
    if (version != null) 'version': version,
  };
}
