import { describe, expect, it } from "vitest";

import {
  addCartItem,
  getCartUnitCount,
  getEffectiveMaxCartUnits,
  getRemainingCartCapacity,
  setCartLineQuantity,
} from "@/domain/cart";
import type { CartLine, Product } from "@/types/kiosk";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "test-gift",
    name: "Test Gift",
    shortDescription: "A test gift",
    description: "A deterministic gift used by the unit tests.",
    category: "Test Catalogue",
    pricePaise: 10_000,
    image: "/products/table-frame-5x7.jpeg",
    availability: "available",
    stock: 10,
    featured: false,
    tags: [],
    recipientTags: [],
    occasionTags: [],
    variants: [],
    preparationTime: "Ready now",
    giftWrapEligible: true,
    ...overrides,
  };
}

function itemsFrom(result: ReturnType<typeof addCartItem>): readonly CartLine[] {
  if (!result.ok) {
    throw new Error(`Expected cart mutation to succeed, received ${result.error.code}`);
  }
  return result.value.items;
}

describe("combined cart unit limit", () => {
  it("counts quantities across different lines and blocks the sixth unit", () => {
    const firstProduct = makeProduct({ id: "first", name: "First Gift" });
    const secondProduct = makeProduct({ id: "second", name: "Second Gift" });
    const thirdProduct = makeProduct({ id: "third", name: "Third Gift" });

    const afterThree = addCartItem([], firstProduct, { quantity: 3 });
    const afterFive = addCartItem(itemsFrom(afterThree), secondProduct, { quantity: 2 });
    const atLimit = itemsFrom(afterFive);
    const sixthUnit = addCartItem(atLimit, thirdProduct);

    expect(getCartUnitCount(atLimit)).toBe(5);
    expect(getRemainingCartCapacity(atLimit)).toBe(0);
    expect(afterFive).toMatchObject({
      ok: true,
      value: { unitCount: 5, remainingCapacity: 0 },
    });
    expect(sixthUnit).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "MAX_UNITS_EXCEEDED",
        maxUnits: 5,
        remainingCapacity: 0,
      }),
    });
    expect(getCartUnitCount(atLimit)).toBe(5);
  });

  it("never permits presenter configuration to raise the hard five-unit cap", () => {
    expect(getEffectiveMaxCartUnits(20)).toBe(5);
    expect(getEffectiveMaxCartUnits(3)).toBe(3);
    expect(getEffectiveMaxCartUnits(0)).toBe(5);
  });

  it("rejects a quantity update that would push the combined cart above five", () => {
    const firstProduct = makeProduct({ id: "first", name: "First Gift" });
    const secondProduct = makeProduct({ id: "second", name: "Second Gift" });
    const afterThree = addCartItem([], firstProduct, { quantity: 3 });
    const afterFive = addCartItem(itemsFrom(afterThree), secondProduct, { quantity: 2 });
    const items = itemsFrom(afterFive);

    expect(setCartLineQuantity(items, items[0].key, 4)).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "MAX_UNITS_EXCEEDED",
        maxUnits: 5,
        remainingCapacity: 0,
      }),
    });
    expect(getCartUnitCount(items)).toBe(5);
  });
});

describe("stock and variant behavior", () => {
  const variantProduct = makeProduct({
    stock: 10,
    variants: [
      {
        id: "ruby",
        name: "Ruby",
        priceAdjustmentPaise: 1_500,
        stock: 2,
      },
      {
        id: "sapphire",
        name: "Sapphire",
        priceAdjustmentPaise: 2_500,
        stock: 3,
      },
    ],
  });

  it("requires a real variant and applies its price and stock", () => {
    expect(addCartItem([], variantProduct)).toMatchObject({
      ok: false,
      error: { code: "VARIANT_REQUIRED" },
    });
    expect(addCartItem([], variantProduct, { variantId: "missing" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_VARIANT" },
    });

    const result = addCartItem([], variantProduct, {
      variantId: "ruby",
      quantity: 2,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            variantId: "ruby",
            variantName: "Ruby",
            quantity: 2,
            unitPricePaise: 11_500,
            stockLimit: 2,
          },
        ],
      },
    });
  });

  it("shares stock across wrapped/plain lines of one variant but keeps variants independent", () => {
    const ruby = addCartItem([], variantProduct, {
      variantId: "ruby",
      quantity: 2,
    });
    const rubyItems = itemsFrom(ruby);

    expect(
      addCartItem(rubyItems, variantProduct, {
        variantId: "ruby",
        quantity: 1,
        giftWrapped: true,
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "OUT_OF_STOCK",
        availableStock: 0,
      }),
    });

    const withSapphire = addCartItem(rubyItems, variantProduct, {
      variantId: "sapphire",
      quantity: 3,
    });
    expect(withSapphire).toMatchObject({
      ok: true,
      value: { unitCount: 5, remainingCapacity: 0 },
    });
  });

  it("enforces stock when changing an existing quantity", () => {
    const scarce = makeProduct({ stock: 2 });
    const added = addCartItem([], scarce, { quantity: 1 });
    const items = itemsFrom(added);

    expect(setCartLineQuantity(items, items[0].key, 2)).toMatchObject({ ok: true });
    expect(setCartLineQuantity(items, items[0].key, 3)).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "OUT_OF_STOCK",
        availableStock: 2,
      }),
    });
  });

  it("rejects a product marked unavailable even when it reports stock", () => {
    const unavailable = makeProduct({ availability: "unavailable", stock: 10 });

    expect(addCartItem([], unavailable)).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "PRODUCT_UNAVAILABLE",
        availableStock: 0,
      }),
    });
  });
});
