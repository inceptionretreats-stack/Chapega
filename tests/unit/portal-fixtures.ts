import type { VendorProduct } from "@/types/vendor";

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
