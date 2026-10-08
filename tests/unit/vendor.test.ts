import { describe, expect, it } from "vitest";
import {
  canTransitionVendorOrder,
  getNextVendorOrderStatus,
  VENDOR_ORDER_SEQUENCE,
} from "@/domain/vendor";
import {
  kioskOrderSubmissionSchema,
  vendorProductSchema,
  vendorSettingsSchema,
} from "@/server/vendor/schemas";
import { optionalCustomerPhoneError } from "@/domain/customer";

const product = {
  name: "Personalised Keepsake",
  shortDescription: "A thoughtful handmade keepsake.",
  description: "Made to order with the customer's chosen details.",
  category: "Personalized Gifts",
  pricePaise: 49_900,
  image: "/generated-products/acrylic-sketch-lamp.png",
  stock: 4,
  featured: false,
  tags: ["personalised"],
  recipientTags: [],
  occasionTags: ["Birthday"],
  preparationTime: "Confirm timing on WhatsApp",
  giftWrapEligible: true,
  visible: true,
};

describe("vendor order lifecycle", () => {
  it("permits only the next operational step or cancellation", () => {
    for (let index = 0; index < VENDOR_ORDER_SEQUENCE.length - 1; index += 1) {
      const current = VENDOR_ORDER_SEQUENCE[index];
      const next = VENDOR_ORDER_SEQUENCE[index + 1];
      expect(getNextVendorOrderStatus(current)).toBe(next);
      expect(canTransitionVendorOrder(current, next)).toBe(true);
      expect(canTransitionVendorOrder(current, "cancelled")).toBe(true);
      expect(canTransitionVendorOrder(current, current)).toBe(false);
    }
  });

  it("keeps terminal orders terminal", () => {
    expect(getNextVendorOrderStatus("completed")).toBeNull();
    expect(getNextVendorOrderStatus("cancelled")).toBeNull();
    expect(canTransitionVendorOrder("completed", "cancelled")).toBe(false);
    expect(canTransitionVendorOrder("cancelled", "confirmed")).toBe(false);
  });
});

describe("vendor input validation", () => {
  it("accepts common optional phone formatting and rejects implausible numbers", () => {
    expect(optionalCustomerPhoneError("")).toBeNull();
    expect(optionalCustomerPhoneError("+91 98765-43210")).toBeNull();
    expect(optionalCustomerPhoneError("123")).toMatch(/7 to 15 digits/);
    expect(optionalCustomerPhoneError("9876 CALL ME")).toMatch(/7 to 15 digits/);
  });

  it("accepts a valid product and rejects price or media tampering", () => {
    const parsed = vendorProductSchema.safeParse(product);
    expect(parsed.success).toBe(true);
    // AUD-9: an omitted variants key must stay omitted so an update keeps the
    // stored variants; the service treats it as "none" only on create.
    expect(parsed.data?.variants).toBeUndefined();
    expect(
      vendorProductSchema.safeParse({
        ...product,
        compareAtPricePaise: 40_000,
      }).success,
    ).toBe(false);
    expect(
      vendorProductSchema.safeParse({
        ...product,
        image: "https://attacker.example/product.svg",
      }).success,
    ).toBe(false);
    expect(vendorProductSchema.safeParse({ ...product, stock: -1 }).success).toBe(false);
    expect(
      vendorProductSchema.safeParse({
        ...product,
        image: `/vendor-products/00000000-0000-4000-8000-000000000001/${"a".repeat(64)}.jpg`,
      }).success,
    ).toBe(true);
  });

  it("validates bounded variants for product create and update payloads", () => {
    const variants = [
      {
        id: "standard",
        name: "Standard",
        priceAdjustmentPaise: 0,
      },
      {
        id: "framed",
        name: "Framed",
        priceAdjustmentPaise: 5_000,
        stock: 3,
      },
    ];

    expect(vendorProductSchema.safeParse({ ...product, variants }).success).toBe(true);
    expect(vendorProductSchema.safeParse({ ...product, variants, version: 2 }).success).toBe(true);
    expect(
      vendorProductSchema.safeParse({
        ...product,
        variants: Array.from({ length: 21 }, (_, index) => ({
          id: `variant-${index}`,
          name: `Variant ${index}`,
          priceAdjustmentPaise: 0,
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects variants with a negative final price", () => {
    expect(
      vendorProductSchema.safeParse({
        ...product,
        pricePaise: 1_000,
        variants: [
          {
            id: "discounted",
            name: "Discounted",
            priceAdjustmentPaise: -1_001,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate variant IDs and names after normalization", () => {
    expect(
      vendorProductSchema.safeParse({
        ...product,
        variants: [
          { id: "standard", name: "Small", priceAdjustmentPaise: 0 },
          { id: " STANDARD ", name: "Large", priceAdjustmentPaise: 0 },
        ],
      }).success,
    ).toBe(false);
    expect(
      vendorProductSchema.safeParse({
        ...product,
        variants: [
          { id: "small", name: "Standard", priceAdjustmentPaise: 0 },
          { id: "large", name: " STANDARD ", priceAdjustmentPaise: 0 },
        ],
      }).success,
    ).toBe(false);
  });

  it("enforces the five-unit kiosk order boundary", () => {
    const order = {
      idempotencyKey: "GFT-20260917-1234",
      orderNumber: "GFT-20260917-1234",
      createdAt: "2026-09-17T10:00:00.000Z",
      kioskName: "Main Entrance",
      customer: {
        customerName: "A Customer",
        customerPhone: "",
        giftNote: "",
        orderNote: "",
      },
      items: [
        {
          productId: "acrylic-sketch-lamp",
          quantity: 5,
          giftWrapped: false,
        },
      ],
    };
    expect(kioskOrderSubmissionSchema.safeParse(order).success).toBe(true);
    expect(
      kioskOrderSubmissionSchema.safeParse({
        ...order,
        customer: { ...order.customer, customerPhone: "123" },
      }).success,
    ).toBe(false);
    expect(
      kioskOrderSubmissionSchema.safeParse({
        ...order,
        items: [{ ...order.items[0], quantity: 6 }],
      }).success,
    ).toBe(false);

    // AUD-36: direction overrides, control characters and broken surrogates
    // must never reach the WhatsApp message or crash its URL encoding.
    const unsafe = kioskOrderSubmissionSchema.parse({
      ...order,
      kioskName: "Desk‮ A",
      customer: {
        ...order.customer,
        customerName: "Asha\u0085⁦ R",
        giftNote: "Love \uD800you",
        orderNote: "Gift\u0007 wrap",
      },
    });
    expect(unsafe.kioskName).toBe("Desk A");
    expect(unsafe.customer.customerName).toBe("Asha R");
    expect(unsafe.customer.giftNote).toBe("Love �you");
    expect(unsafe.customer.orderNote).toBe("Gift wrap");
    expect(() => encodeURIComponent(unsafe.customer.giftNote)).not.toThrow();
  });

  it("accepts only bounded, versioned shop settings", () => {
    const settings = {
      shopName: "Chapega.com",
      ownerWhatsAppNumber: "919876543210",
      defaultCountryCode: "91",
      kioskName: "Main Entrance",
      maxCartQuantity: 5,
      giftWrapFeePaise: 2_500,
      qrResetSeconds: 120,
      showPreviewLabel: false,
      storeOpen: true,
      lowStockThreshold: 3,
      version: 1,
    };
    expect(vendorSettingsSchema.safeParse(settings).success).toBe(true);
    expect(vendorSettingsSchema.safeParse({ ...settings, maxCartQuantity: 6 }).success).toBe(false);
    expect(vendorSettingsSchema.safeParse({ ...settings, version: 0 }).success).toBe(false);
    expect(
      vendorSettingsSchema.safeParse({
        ...settings,
        ownerWhatsAppNumber: "12345678",
      }).success,
    ).toBe(false);
    expect(
      vendorSettingsSchema.safeParse({
        ...settings,
        defaultCountryCode: "000",
      }).success,
    ).toBe(false);
  });
});
