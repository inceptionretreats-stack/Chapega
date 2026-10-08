import type { VendorBootstrap, VendorOrder, VendorProduct, VendorSettings } from "@/types/vendor";

export function makeSettings(overrides: Partial<VendorSettings> = {}): VendorSettings {
  return {
    shopName: "Chapega.com",
    ownerWhatsAppNumber: "9876543210",
    defaultCountryCode: "91",
    kioskName: "Studio kiosk",
    maxCartQuantity: 5,
    giftWrapFeePaise: 5_000,
    qrResetSeconds: 90,
    showPreviewLabel: false,
    storeOpen: true,
    lowStockThreshold: 5,
    version: 1,
    updatedAt: "2026-09-18T09:00:00.000Z",
    ...overrides,
  };
}

export function makeOrder(index = 1, overrides: Partial<VendorOrder> = {}): VendorOrder {
  const createdAt = `2026-09-18T09:0${index}:00.000Z`;
  return {
    id: `order-${index}`,
    orderNumber: `GFT-00${index}`,
    idempotencyKey: `order-${index}`,
    createdAt,
    updatedAt: createdAt,
    customer: {
      customerName: `Customer ${index}`,
      customerPhone: "",
      giftNote: "",
      orderNote: "",
    },
    kioskName: "Studio kiosk",
    paymentMethod: "pay_later",
    items: [
      {
        productId: "product-1",
        name: "Gift 1",
        image: "/generated-products/acrylic-sketch-lamp.png",
        quantity: 1,
        unitPricePaise: 20_000,
        giftWrapped: false,
        lineTotalPaise: 20_000,
      },
    ],
    subtotalPaise: 20_000,
    giftWrapPaise: 0,
    totalPaise: 20_000,
    whatsappMessage: "Prepared order",
    whatsappUrl: "https://wa.me/919876543210",
    status: "prepared",
    version: 1,
    inventoryCommitted: false,
    events: [
      {
        id: `event-${index}`,
        from: null,
        to: "prepared",
        actorName: "Kiosk",
        createdAt,
      },
    ],
    ...overrides,
  };
}

export function makeBootstrap(overrides: Partial<VendorBootstrap> = {}): VendorBootstrap {
  const vendor = {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "chapega",
    displayName: "Chapega.com",
    status: "active" as const,
  };
  const capabilities = {
    view_dashboard: true,
    manage_orders: true,
    manage_catalogue: true,
    manage_settings: true,
    manage_team: true,
  };
  return {
    user: {
      id: "owner-1",
      email: "owner@example.com",
      name: "Owner",
      platformRole: null,
      role: "owner",
      activeVendor: vendor,
      memberships: [{ vendor, role: "owner", active: true, isDefault: true }],
      capabilities,
    },
    vendor,
    capabilities,
    revision: 1,
    products: [makeProduct()],
    orders: [makeOrder(1)],
    settings: makeSettings(),
    ...overrides,
  };
}

export function makeProduct(overrides: Partial<VendorProduct> = {}): VendorProduct {
  return {
    id: "product-1",
    name: "Gift 1",
    shortDescription: "A thoughtful gift.",
    description: "A thoughtful handmade gift.",
    category: "Gifts",
    pricePaise: 20_000,
    image: "/generated-products/acrylic-sketch-lamp.png",
    availability: "available",
    stock: 10,
    featured: false,
    tags: [],
    recipientTags: [],
    occasionTags: [],
    variants: [],
    preparationTime: "Confirm on WhatsApp",
    giftWrapEligible: true,
    visible: true,
    archived: false,
    version: 1,
    createdAt: "2026-09-18T09:00:00.000Z",
    updatedAt: "2026-09-18T09:00:00.000Z",
    ...overrides,
  };
}
