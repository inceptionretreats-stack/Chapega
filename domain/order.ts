import { getEffectiveMaxCartUnits, getCartUnitCount } from "@/domain/cart";
import { optionalCustomerPhoneError } from "@/domain/customer";
import { calculateCartTotals } from "@/domain/money";
import {
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  normalizeWhatsAppNumber,
  WhatsAppNumberError,
} from "@/domain/whatsapp";
import type {
  CartLine,
  CustomerDetails,
  Order,
  OrderError,
  OrderHistoryItem,
  OrderItem,
  OrderResult,
  PresenterSettings,
  Product,
} from "@/types/kiosk";

export type CreateOrderInput = Readonly<{
  cartItems: readonly CartLine[];
  products: readonly Product[];
  customer: CustomerDetails;
  settings: PresenterSettings;
  now?: Date;
  random?: () => number;
}>;

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function error(errorValue: OrderError): OrderResult {
  return { ok: false, error: Object.freeze(errorValue) };
}

export function createOrderNumber(
  now = new Date(),
  random: () => number = Math.random,
): string {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const randomValue = Math.max(0, Math.min(0.999_999_999, random()));
  const suffix = Math.floor(1000 + randomValue * 9000);

  return `GFT-${date}-${suffix}`;
}

function rebuildCartFromCatalogue(
  cartItems: readonly CartLine[],
  products: readonly Product[],
): readonly CartLine[] | undefined {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const rebuilt: CartLine[] = [];
  const productQuantities = new Map<string, number>();
  const variantQuantities = new Map<string, number>();

  for (const line of cartItems) {
    const product = productsById.get(line.productId);
    if (
      !product ||
      product.availability === "unavailable" ||
      product.stock < 1 ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1
    ) {
      return undefined;
    }

    const variant = line.variantId
      ? product.variants.find((candidate) => candidate.id === line.variantId)
      : undefined;
    if (
      (product.variants.length > 0 && !variant) ||
      (product.variants.length === 0 && line.variantId)
    ) {
      return undefined;
    }

    if (line.giftWrapped && !product.giftWrapEligible) {
      return undefined;
    }

    const nextProductQuantity =
      (productQuantities.get(product.id) ?? 0) + line.quantity;
    if (nextProductQuantity > product.stock) {
      return undefined;
    }
    productQuantities.set(product.id, nextProductQuantity);

    const stockLimit = variant?.stock ?? product.stock;
    const stockKey = JSON.stringify([product.id, variant?.id ?? null]);
    const nextVariantQuantity =
      (variantQuantities.get(stockKey) ?? 0) + line.quantity;
    if (variant?.stock !== undefined && nextVariantQuantity > variant.stock) {
      return undefined;
    }
    variantQuantities.set(stockKey, nextVariantQuantity);

    rebuilt.push(
      Object.freeze({
        key: line.key,
        productId: product.id,
        productName: product.name,
        productImage: product.image,
        variantId: variant?.id,
        variantName: variant?.name,
        quantity: line.quantity,
        unitPricePaise:
          product.pricePaise + (variant?.priceAdjustmentPaise ?? 0),
        giftWrapped: line.giftWrapped,
        productStockLimit: product.stock,
        variantStockLimit: variant?.stock,
        stockLimit,
      }),
    );
  }

  return Object.freeze(rebuilt);
}

function freezeOrder(order: Order): Order {
  return Object.freeze({
    ...order,
    items: Object.freeze(
      order.items.map((item) => Object.freeze({ ...item })),
    ),
  });
}

export function createOrder(input: CreateOrderInput): OrderResult {
  if (input.cartItems.length === 0) {
    return error({
      code: "EMPTY_CART",
      message: "Add at least one gift before creating the order.",
    });
  }

  const maxUnits = getEffectiveMaxCartUnits(input.settings.maxCartQuantity);
  if (getCartUnitCount(input.cartItems) > maxUnits) {
    return error({
      code: "MAX_UNITS_EXCEEDED",
      message: `This kiosk order can contain at most ${maxUnits} gift units.`,
    });
  }

  const customerPhoneError = optionalCustomerPhoneError(
    input.customer.customerPhone,
  );
  if (customerPhoneError) {
    return error({
      code: "INVALID_CUSTOMER_PHONE",
      message: customerPhoneError,
    });
  }

  if (!input.settings.ownerWhatsAppNumber.trim()) {
    return error({
      code: "OWNER_NUMBER_REQUIRED",
      message: "Configure the shop owner's WhatsApp number before showing the QR.",
    });
  }

  let normalizedOwnerNumber: string;
  try {
    normalizedOwnerNumber = normalizeWhatsAppNumber(
      input.settings.ownerWhatsAppNumber,
      input.settings.defaultCountryCode,
    );
  } catch (caught) {
    return error({
      code: "INVALID_OWNER_NUMBER",
      message:
        caught instanceof WhatsAppNumberError
          ? caught.message
          : "The shop owner's WhatsApp number is invalid.",
    });
  }

  const authoritativeCart = rebuildCartFromCatalogue(
    input.cartItems,
    input.products,
  );
  if (!authoritativeCart) {
    return error({
      code: "INVALID_CART",
      message:
        "One of the selected gifts has changed or is no longer available. Please review the cart.",
    });
  }

  try {
    const now = input.now ?? new Date();
    const orderNumber = createOrderNumber(now, input.random);
    const totals = calculateCartTotals(
      authoritativeCart,
      input.settings.giftWrapFeePaise,
    );
    const items: readonly OrderItem[] = Object.freeze(
      authoritativeCart.map((line) =>
        Object.freeze({
          productId: line.productId,
          name: line.productName,
          variant: line.variantName,
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
          giftWrapped: line.giftWrapped,
          lineTotalPaise: line.unitPricePaise * line.quantity,
        }),
      ),
    );
    const customerName = optionalText(input.customer.customerName);
    const customerPhone = optionalText(input.customer.customerPhone);
    const giftNote = optionalText(input.customer.giftNote);
    const orderNote = optionalText(input.customer.orderNote);
    const whatsappMessage = buildWhatsAppMessage({
      shopName: input.settings.shopName,
      orderNumber,
      kioskName: input.settings.kioskName,
      customerName,
      items,
      giftWrapPaise: totals.giftWrapPaise,
      totalPaise: totals.totalPaise,
      giftNote,
      orderNote,
    });
    const whatsappUrl = buildWhatsAppUrl({
      rawNumber: normalizedOwnerNumber,
      defaultCountryCode: input.settings.defaultCountryCode,
      message: whatsappMessage,
    });

    return {
      ok: true,
      value: freezeOrder({
        id: orderNumber,
        orderNumber,
        createdAt: now.toISOString(),
        customerName,
        customerPhone,
        giftNote,
        orderNote,
        kioskName: input.settings.kioskName.trim() || "Main Entrance",
        paymentMethod: "pay_later",
        items,
        subtotalPaise: totals.subtotalPaise,
        giftWrapPaise: totals.giftWrapPaise,
        totalPaise: totals.totalPaise,
        whatsappMessage,
        whatsappUrl,
        status: "prepared_for_whatsapp",
      }),
    };
  } catch {
    return error({
      code: "INVALID_CART",
      message: "The order could not be prepared. Please review the cart.",
    });
  }
}

export function redactOrderForHistory(order: Order): OrderHistoryItem {
  return Object.freeze({
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    kioskName: order.kioskName,
    itemCount: order.items.reduce(
      (total, item) => total + item.quantity,
      0,
    ),
    totalPaise: order.totalPaise,
    status: order.status,
  });
}

export function markOrderAsPresenterSent(order: Order): Order {
  return freezeOrder({ ...order, status: "presenter_marked_sent" });
}
