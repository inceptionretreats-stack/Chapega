import type {
  CartError,
  CartLine,
  CartMutation,
  CartResult,
  Product,
  ProductVariant,
} from "@/types/kiosk";

export const MAX_CART_UNITS = 5;

export type AddCartItemOptions = Readonly<{
  variantId?: string;
  quantity?: number;
  giftWrapped?: boolean;
}>;

export function getEffectiveMaxCartUnits(configuredMax = MAX_CART_UNITS): number {
  if (!Number.isInteger(configuredMax) || configuredMax < 1) {
    return MAX_CART_UNITS;
  }

  return Math.min(configuredMax, MAX_CART_UNITS);
}

export function getCartUnitCount(items: readonly Pick<CartLine, "quantity">[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function getRemainingCartCapacity(
  items: readonly Pick<CartLine, "quantity">[],
  maxQuantity = MAX_CART_UNITS,
): number {
  return Math.max(0, getEffectiveMaxCartUnits(maxQuantity) - getCartUnitCount(items));
}

export function getCartLineKey(
  productId: string,
  variantId: string | undefined,
  giftWrapped: boolean,
): string {
  return JSON.stringify([productId, variantId ?? null, giftWrapped]);
}

function mutation(items: readonly CartLine[], maxUnits: number): CartResult {
  const nextItems = Object.freeze([...items]);
  const unitCount = getCartUnitCount(nextItems);

  return {
    ok: true,
    value: Object.freeze({
      items: nextItems,
      unitCount,
      remainingCapacity: Math.max(0, maxUnits - unitCount),
    }),
  };
}

function failure(error: CartError): CartResult {
  return { ok: false, error: Object.freeze(error) };
}

function maxUnitsFailure(items: readonly CartLine[], maxUnits: number): CartResult {
  return failure({
    code: "MAX_UNITS_EXCEEDED",
    message:
      `You can choose a maximum of ${maxUnits} gifts in one kiosk order. ` +
      "Remove an item or reduce a quantity to add another gift.",
    maxUnits,
    remainingCapacity: getRemainingCartCapacity(items, maxUnits),
  });
}

function findVariant(product: Product, variantId: string | undefined): ProductVariant | undefined {
  return product.variants.find((variant) => variant.id === variantId);
}

function getVariantQuantity(
  items: readonly CartLine[],
  productId: string,
  variantId: string | undefined,
  excludingKey?: string,
): number {
  return items.reduce((total, item) => {
    if (item.key !== excludingKey && item.productId === productId && item.variantId === variantId) {
      return total + item.quantity;
    }

    return total;
  }, 0);
}

function getProductQuantity(
  items: readonly CartLine[],
  productId: string,
  excludingKey?: string,
): number {
  return items.reduce(
    (total, item) =>
      item.key !== excludingKey && item.productId === productId ? total + item.quantity : total,
    0,
  );
}

export function addCartItem(
  items: readonly CartLine[],
  product: Product,
  options: AddCartItemOptions = {},
  configuredMaxUnits = MAX_CART_UNITS,
): CartResult {
  const maxUnits = getEffectiveMaxCartUnits(configuredMaxUnits);
  const quantity = options.quantity ?? 1;
  const giftWrapped = options.giftWrapped ?? false;

  if (!Number.isInteger(quantity) || quantity < 1) {
    return failure({
      code: "INVALID_QUANTITY",
      message: "Choose a whole-number quantity of at least one.",
    });
  }

  if (product.availability === "unavailable" || product.stock < 1) {
    return failure({
      code: "PRODUCT_UNAVAILABLE",
      message: `${product.name} is currently unavailable.`,
      availableStock: 0,
    });
  }

  let variant: ProductVariant | undefined;
  if (product.variants.length > 0) {
    if (!options.variantId) {
      return failure({
        code: "VARIANT_REQUIRED",
        message: `Choose a variant for ${product.name} before adding it.`,
      });
    }

    variant = findVariant(product, options.variantId);
    if (!variant) {
      return failure({
        code: "INVALID_VARIANT",
        message: "The selected product variant is not available.",
      });
    }
  } else if (options.variantId) {
    return failure({
      code: "INVALID_VARIANT",
      message: "This product does not have selectable variants.",
    });
  }

  if (giftWrapped && !product.giftWrapEligible) {
    return failure({
      code: "GIFT_WRAP_NOT_ALLOWED",
      message: `${product.name} already has presentation packaging and cannot be gift wrapped.`,
    });
  }

  if (getCartUnitCount(items) + quantity > maxUnits) {
    return maxUnitsFailure(items, maxUnits);
  }

  const productQuantity = getProductQuantity(items, product.id);
  if (productQuantity + quantity > product.stock) {
    return failure({
      code: "OUT_OF_STOCK",
      message: `Only ${product.stock} total units of ${product.name} are available.`,
      availableStock: Math.max(0, product.stock - productQuantity),
    });
  }

  const stockLimit = variant?.stock ?? product.stock;
  const quantityForVariant = getVariantQuantity(items, product.id, variant?.id);
  if (quantityForVariant + quantity > stockLimit) {
    return failure({
      code: "OUT_OF_STOCK",
      message: `Only ${stockLimit} unit${stockLimit === 1 ? " is" : "s are"} available for this selection.`,
      availableStock: Math.max(0, stockLimit - quantityForVariant),
    });
  }

  const key = getCartLineKey(product.id, variant?.id, giftWrapped);
  const existingIndex = items.findIndex((item) => item.key === key);
  const unitPricePaise = product.pricePaise + (variant?.priceAdjustmentPaise ?? 0);
  const nextItems = [...items];

  if (existingIndex >= 0) {
    const existing = nextItems[existingIndex];
    nextItems[existingIndex] = Object.freeze({
      ...existing,
      quantity: existing.quantity + quantity,
    });
  } else {
    nextItems.push(
      Object.freeze({
        key,
        productId: product.id,
        productName: product.name,
        productImage: product.image,
        variantId: variant?.id,
        variantName: variant?.name,
        quantity,
        unitPricePaise,
        giftWrapped,
        productStockLimit: product.stock,
        variantStockLimit: variant?.stock,
        stockLimit,
      }),
    );
  }

  return mutation(nextItems, maxUnits);
}

export function setCartLineQuantity(
  items: readonly CartLine[],
  lineKey: string,
  quantity: number,
  configuredMaxUnits = MAX_CART_UNITS,
): CartResult {
  const maxUnits = getEffectiveMaxCartUnits(configuredMaxUnits);
  const lineIndex = items.findIndex((item) => item.key === lineKey);

  if (lineIndex < 0) {
    return failure({
      code: "LINE_NOT_FOUND",
      message: "That cart item is no longer available.",
    });
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    return failure({
      code: "INVALID_QUANTITY",
      message: "Quantity cannot be lower than one. Remove the item instead.",
    });
  }

  const current = items[lineIndex];
  const nextUnitCount = getCartUnitCount(items) - current.quantity + quantity;
  if (nextUnitCount > maxUnits) {
    return maxUnitsFailure(items, maxUnits);
  }

  const otherProductUnits = getProductQuantity(items, current.productId, current.key);
  if (otherProductUnits + quantity > current.productStockLimit) {
    return failure({
      code: "OUT_OF_STOCK",
      message: `Only ${current.productStockLimit} total units of this gift are available.`,
      availableStock: Math.max(0, current.productStockLimit - otherProductUnits),
    });
  }

  const otherVariantUnits = getVariantQuantity(
    items,
    current.productId,
    current.variantId,
    current.key,
  );
  if (
    current.variantStockLimit !== undefined &&
    otherVariantUnits + quantity > current.variantStockLimit
  ) {
    return failure({
      code: "OUT_OF_STOCK",
      message: `Only ${current.variantStockLimit} units are available for this selection.`,
      availableStock: Math.max(0, current.variantStockLimit - otherVariantUnits),
    });
  }

  const nextItems = [...items];
  nextItems[lineIndex] = Object.freeze({ ...current, quantity });
  return mutation(nextItems, maxUnits);
}

export function setCartLineGiftWrapped(
  items: readonly CartLine[],
  lineKey: string,
  giftWrapped: boolean,
  product: Product,
  configuredMaxUnits = MAX_CART_UNITS,
): CartResult {
  const maxUnits = getEffectiveMaxCartUnits(configuredMaxUnits);
  const lineIndex = items.findIndex((item) => item.key === lineKey);

  if (lineIndex < 0) {
    return failure({
      code: "LINE_NOT_FOUND",
      message: "That cart item is no longer available.",
    });
  }

  const current = items[lineIndex];
  if (current.productId !== product.id) {
    return failure({
      code: "PRODUCT_NOT_FOUND",
      message: "The product for this cart item could not be found.",
    });
  }

  if (giftWrapped && !product.giftWrapEligible) {
    return failure({
      code: "GIFT_WRAP_NOT_ALLOWED",
      message: `${product.name} is not eligible for additional gift wrap.`,
    });
  }

  if (current.giftWrapped === giftWrapped) {
    return mutation(items, maxUnits);
  }

  const nextKey = getCartLineKey(current.productId, current.variantId, giftWrapped);
  const matchingIndex = items.findIndex((item) => item.key === nextKey);
  const nextItems = [...items];

  if (matchingIndex >= 0) {
    const matching = items[matchingIndex];
    const merged = Object.freeze({
      ...matching,
      quantity: matching.quantity + current.quantity,
    });
    const lowerIndex = Math.min(lineIndex, matchingIndex);
    const higherIndex = Math.max(lineIndex, matchingIndex);
    nextItems.splice(higherIndex, 1);
    nextItems.splice(lowerIndex, 1, merged);
  } else {
    nextItems[lineIndex] = Object.freeze({
      ...current,
      key: nextKey,
      giftWrapped,
    });
  }

  return mutation(nextItems, maxUnits);
}

export function removeCartLine(
  items: readonly CartLine[],
  lineKey: string,
  configuredMaxUnits = MAX_CART_UNITS,
): CartResult {
  const lineIndex = items.findIndex((item) => item.key === lineKey);
  if (lineIndex < 0) {
    return failure({
      code: "LINE_NOT_FOUND",
      message: "That cart item is no longer available.",
    });
  }

  return mutation(
    items.filter((item) => item.key !== lineKey),
    getEffectiveMaxCartUnits(configuredMaxUnits),
  );
}

export function isCartWithinUnitLimit(
  items: readonly Pick<CartLine, "quantity">[],
  configuredMaxUnits = MAX_CART_UNITS,
): boolean {
  return getCartUnitCount(items) <= getEffectiveMaxCartUnits(configuredMaxUnits);
}

export type { CartMutation };
