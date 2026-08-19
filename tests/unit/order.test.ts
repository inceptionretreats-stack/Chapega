import { describe, expect, it } from "vitest";

import { addCartItem } from "@/domain/cart";
import { createOrder, createOrderNumber } from "@/domain/order";
import type {
  CartLine,
  CustomerDetails,
  PresenterSettings,
  Product,
} from "@/types/kiosk";

const settings: PresenterSettings = {
  shopName: "Chapega.com",
  ownerWhatsAppNumber: "919876543210",
  defaultCountryCode: "91",
  kioskName: "Approval Counter",
  maxCartQuantity: 5,
  giftWrapFeePaise: 2_500,
  qrResetSeconds: 120,
  showPreviewLabel: false,
};

const customer: CustomerDetails = {
  customerName: "  Rahul  ",
  customerPhone: " 98765 43210 ",
  giftNote: " Happy birthday! ",
  orderNote: " Collect after 6 PM ",
};

const TEST_PRODUCT: Product = Object.freeze({
  id: "engraved-photo-clock-11x11",
  name: "11x11 Engraved Wooden Photo Clock",
  shortDescription: "A personalised wooden photo clock.",
  description: "A deterministic product fixture for order tests.",
  category: "Personalized Gifts",
  pricePaise: 99_900,
  image: "/products/engraved-photo-clock-11x11.jpeg",
  availability: "available",
  stock: 10,
  featured: true,
  tags: Object.freeze(["chocolate", "celebration"]),
  recipientTags: Object.freeze(["friends", "family"]),
  occasionTags: Object.freeze(["birthday"]),
  variants: Object.freeze([]),
  preparationTime: "Ready in 15 minutes",
  giftWrapEligible: true,
});

function cartWithTwoWrappedGifts(product: Product): readonly CartLine[] {
  const result = addCartItem([], product, { quantity: 2, giftWrapped: true });
  if (!result.ok) {
    throw new Error(`Expected cart setup to succeed, received ${result.error.code}`);
  }
  return result.value.items;
}

describe("order numbers", () => {
  it("uses the GFT date and four-digit suffix format", () => {
    const now = new Date(2026, 7, 10, 12, 0, 0);

    expect(createOrderNumber(now, () => 0)).toBe("GFT-20260810-1000");
    expect(createOrderNumber(now, () => 0.5)).toBe("GFT-20260810-5500");
    expect(createOrderNumber(now, () => 1)).toBe("GFT-20260810-9999");
    expect(createOrderNumber(now, () => 0.321)).toMatch(
      /^GFT-\d{8}-\d{4}$/,
    );
  });
});

describe("immutable order creation", () => {
  it("creates an authoritative frozen snapshot without changing the submitted cart", () => {
    const product = TEST_PRODUCT;
    const validCart = cartWithTwoWrappedGifts(product);
    const submittedCart: CartLine[] = [
      {
        ...validCart[0],
        productName: "Tampered product name",
        unitPricePaise: 1,
        stockLimit: 999,
      },
    ];
    const submittedBefore = structuredClone(submittedCart);
    const now = new Date(2026, 7, 10, 14, 30, 0);

    const result = createOrder({
      cartItems: submittedCart,
      products: [product],
      customer,
      settings,
      now,
      random: () => 0.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const order = result.value;
    expect(order).toMatchObject({
      id: "GFT-20260810-5500",
      orderNumber: "GFT-20260810-5500",
      createdAt: now.toISOString(),
      customerName: "Rahul",
      customerPhone: "98765 43210",
      giftNote: "Happy birthday!",
      orderNote: "Collect after 6 PM",
      kioskName: "Approval Counter",
      paymentMethod: "pay_later",
      subtotalPaise: 199_800,
      giftWrapPaise: 5_000,
      totalPaise: 204_800,
      status: "prepared_for_whatsapp",
    });
    expect(order.items).toEqual([
      expect.objectContaining({
        productId: product.id,
        name: product.name,
        quantity: 2,
        unitPricePaise: 99_900,
        giftWrapped: true,
        lineTotalPaise: 199_800,
      }),
    ]);
    expect(order.whatsappMessage).toContain(`Order: ${order.orderNumber}`);
    expect(new URL(order.whatsappUrl).pathname).toBe("/919876543210");
    expect(new URL(order.whatsappUrl).searchParams.get("text")).toBe(
      order.whatsappMessage,
    );

    expect(submittedCart).toEqual(submittedBefore);
    expect(Object.isFrozen(order)).toBe(true);
    expect(Object.isFrozen(order.items)).toBe(true);
    expect(Object.isFrozen(order.items[0])).toBe(true);
    expect(Reflect.set(order, "totalPaise", 1)).toBe(false);
    expect(Reflect.set(order.items[0], "quantity", 99)).toBe(false);
    expect(order.totalPaise).toBe(204_800);
    expect(order.items[0].quantity).toBe(2);
  });
});
