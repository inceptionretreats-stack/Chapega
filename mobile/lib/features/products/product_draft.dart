import '../../core/storage/secure_store.dart';
import '../../domain/money.dart';
import '../../models/vendor_product.dart';

const maxOptions = 20;

/// One option row as typed (`VariantDraft` in the web editor).
class OptionDraft {
  OptionDraft({required this.id, this.name = '', this.adjustment = '0', this.stock = ''});

  factory OptionDraft.fromVariant(ProductVariant variant) => OptionDraft(
    id: variant.id,
    name: variant.name,
    adjustment: _signedRupees(variant.priceAdjustmentPaise),
    stock: variant.stock?.toString() ?? '',
  );

  /// Option ids are UUIDs made on the device, as in the web editor.
  factory OptionDraft.blank() => OptionDraft(id: uuidV4());

  final String id;
  String name;
  String adjustment;
  String stock;

  static String _signedRupees(int paise) =>
      paise < 0 ? '-${paiseToRupeeInput(-paise)}' : paiseToRupeeInput(paise);
}

class OptionErrors {
  String? name;
  String? adjustment;
  String? stock;
  String? row;

  bool get isEmpty => name == null && adjustment == null && stock == null && row == null;
}

/// The editor's fields as typed. Text stays text until saving, so the person
/// can type freely; [validate] turns it into a [ProductInput] or field errors
/// with the web Studio's wording.
class ProductDraft {
  ProductDraft({
    required this.name,
    required this.shortDescription,
    required this.description,
    required this.category,
    required this.price,
    required this.compareAtPrice,
    required this.stock,
    required this.preparationTime,
    required this.tags,
    required this.recipientTags,
    required this.occasionTags,
    required this.options,
    required this.visible,
    required this.featured,
    required this.giftWrapEligible,
  });

  /// New products start like the web editor's.
  factory ProductDraft.forProduct(VendorProduct? product) => ProductDraft(
    name: product?.name ?? '',
    shortDescription: product?.shortDescription ?? '',
    description: product?.description ?? '',
    category: product?.category ?? 'Personalized Gifts',
    price: product == null ? '' : paiseToRupeeInput(product.pricePaise),
    compareAtPrice: product?.compareAtPricePaise == null
        ? ''
        : paiseToRupeeInput(product!.compareAtPricePaise!),
    stock: product == null ? '1' : '${product.stock}',
    preparationTime: product?.preparationTime ?? 'Confirm timing on WhatsApp',
    tags: product?.tags.join(', ') ?? '',
    recipientTags: product?.recipientTags.join(', ') ?? '',
    occasionTags: product?.occasionTags.join(', ') ?? '',
    options: [
      for (final variant in product?.variants ?? const <ProductVariant>[])
        OptionDraft.fromVariant(variant),
    ],
    visible: product?.visible ?? true,
    featured: product?.featured ?? false,
    giftWrapEligible: product?.giftWrapEligible ?? true,
  );

  String name;
  String shortDescription;
  String description;
  String category;
  String price;
  String compareAtPrice;
  String stock;
  String preparationTime;
  String tags;
  String recipientTags;
  String occasionTags;
  List<OptionDraft> options;
  bool visible;
  bool featured;
  bool giftWrapEligible;

  /// A signature of everything typed, to tell whether anything changed.
  String get signature => [
    name,
    shortDescription,
    description,
    category,
    price,
    compareAtPrice,
    stock,
    preparationTime,
    tags,
    recipientTags,
    occasionTags,
    for (final option in options)
      '${option.id}|${option.name}|${option.adjustment}|${option.stock}',
    visible,
    featured,
    giftWrapEligible,
  ].join('\u0000');

  /// "personalised, wooden" → ["personalised", "wooden"], duplicates removed.
  static List<String> splitTags(String value) {
    final seen = <String>{};
    return [
      for (final part in value.split(','))
        if (part.trim().isNotEmpty && seen.add(part.trim())) part.trim(),
    ];
  }

  /// The price customers pay for an option, or null while it can't be worked out.
  String? optionCustomerPrice(OptionDraft option) {
    final base = rupeesToPaise(price);
    final adjustment = signedRupeesToPaise(option.adjustment);
    if (base == null || adjustment == null || base + adjustment < 0) return null;
    return formatInr(base + adjustment);
  }
}

/// The outcome of [validateDraft]: an input to send, or what to fix.
class DraftCheck {
  DraftCheck({
    this.input,
    this.message,
    Map<String, String>? fields,
    Map<String, OptionErrors>? options,
  }) : fields = fields ?? {},
       options = options ?? {};

  final ProductInput? input;
  final String? message;

  /// Errors by field key: name, shortDescription, description, category,
  /// price, compareAtPrice, stock, preparationTime, tags, occasionTags,
  /// recipientTags, image.
  final Map<String, String> fields;

  /// Errors by option id.
  final Map<String, OptionErrors> options;
}

/// Mirrors the web editor's checks (`vendor-product-editor.tsx`) and the
/// server's limits, so most mistakes are caught before sending.
DraftCheck validateDraft(ProductDraft draft, {required String? image, required int? version}) {
  final fields = <String, String>{};
  void required(String key, String value, int max, String label) {
    if (value.trim().isEmpty) {
      fields[key] = 'Enter a $label.';
    } else if (value.trim().length > max) {
      fields[key] = 'Use at most $max characters.';
    }
  }

  required('name', draft.name, 120, 'name');
  required('shortDescription', draft.shortDescription, 180, 'short description');
  required('description', draft.description, 2000, 'description');
  required('category', draft.category, 80, 'category');
  required('preparationTime', draft.preparationTime, 120, 'preparation note');

  final pricePaise = rupeesToPaise(draft.price);
  final stock = int.tryParse(draft.stock.trim());
  if (pricePaise == null) fields['price'] = 'Enter a price from ₹0 to ₹10,00,000.';
  if (stock == null || stock < 0 || stock > maxStock) {
    fields['stock'] = 'Use a whole number from 0 to 100,000.';
  }
  int? compareAt;
  if (draft.compareAtPrice.trim().isNotEmpty) {
    compareAt = rupeesToPaise(draft.compareAtPrice);
    if (compareAt == null || (pricePaise != null && compareAt <= pricePaise)) {
      fields['compareAtPrice'] = 'Must be higher than the selling price.';
    }
  }

  final tagLists = {
    'tags': ProductDraft.splitTags(draft.tags),
    'occasionTags': ProductDraft.splitTags(draft.occasionTags),
    'recipientTags': ProductDraft.splitTags(draft.recipientTags),
  };
  for (final MapEntry(:key, :value) in tagLists.entries) {
    if (value.length > 20) {
      fields[key] = 'Use at most 20 entries.';
    } else if (value.any((tag) => tag.length > 48)) {
      fields[key] = 'Keep each entry to 48 characters.';
    }
  }

  if (image == null) fields['image'] = 'Choose a product image.';

  // Options: unique names, sensible amounts, optional stock.
  final optionErrors = <String, OptionErrors>{};
  final names = <String, int>{};
  for (final option in draft.options) {
    final name = option.name.trim().toLowerCase();
    if (name.isNotEmpty) names[name] = (names[name] ?? 0) + 1;
  }
  final variants = <ProductVariant>[];
  for (final option in draft.options) {
    final errors = OptionErrors();
    final name = option.name.trim();
    final adjustment = signedRupeesToPaise(option.adjustment);
    final stockText = option.stock.trim();
    final optionStock = stockText.isEmpty ? null : int.tryParse(stockText);
    if (name.isEmpty) {
      errors.name = 'Enter a name customers can recognise.';
    } else if ((names[name.toLowerCase()] ?? 0) > 1) {
      errors.name = 'Use a unique name for every option.';
    } else if (name.length > 120) {
      errors.name = 'Use at most 120 characters.';
    }
    if (adjustment == null) {
      errors.adjustment =
          'Enter an amount between −₹10,00,000 and ₹10,00,000; use 0 for no change.';
    } else if (pricePaise != null && pricePaise + adjustment < 0) {
      errors.adjustment = 'The final option price cannot be less than ₹0.';
    }
    if (stockText.isNotEmpty &&
        (optionStock == null || optionStock < 0 || optionStock > maxStock)) {
      errors.stock = 'Use a whole number from 0 to 100,000, or leave this blank.';
    }
    if (!errors.isEmpty) {
      optionErrors[option.id] = errors;
      continue;
    }
    variants.add(
      ProductVariant(
        id: option.id,
        name: name,
        priceAdjustmentPaise: adjustment!,
        stock: optionStock,
      ),
    );
  }

  if (draft.options.length > maxOptions) {
    return DraftCheck(
      message: 'Keep this product to $maxOptions options or fewer.',
      fields: fields,
    );
  }
  if (fields.isNotEmpty || optionErrors.isNotEmpty) {
    final message = fields.containsKey('image') && fields.length == 1 && optionErrors.isEmpty
        ? 'Add a clear product image before publishing this gift.'
        : optionErrors.isNotEmpty && fields.isEmpty
        ? 'Review the highlighted product options before saving.'
        : 'Check the highlighted information and try again.';
    return DraftCheck(message: message, fields: fields, options: optionErrors);
  }

  return DraftCheck(
    input: ProductInput(
      name: draft.name.trim(),
      shortDescription: draft.shortDescription.trim(),
      description: draft.description.trim(),
      category: draft.category.trim(),
      pricePaise: pricePaise!,
      compareAtPricePaise: compareAt,
      image: image!,
      stock: stock!,
      featured: draft.featured,
      tags: tagLists['tags']!,
      recipientTags: tagLists['recipientTags']!,
      occasionTags: tagLists['occasionTags']!,
      variants: variants,
      preparationTime: draft.preparationTime.trim(),
      giftWrapEligible: draft.giftWrapEligible,
      visible: draft.visible,
      version: version,
    ),
  );
}

/// Server field names that differ from the editor's.
String productFieldFromServer(String field) => switch (field) {
  'pricePaise' => 'price',
  'compareAtPricePaise' => 'compareAtPrice',
  _ => field,
};
