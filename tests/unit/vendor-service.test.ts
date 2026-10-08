import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorDatabase } from "@/server/vendor/database";
import type {
  KioskOrderSubmission,
  VendorProduct,
  VendorProductInput,
  VendorUser,
} from "@/types/vendor";

const memory = vi.hoisted(() => ({
  auditCounter: 0,
  database: null as unknown,
  imageCheck: vi.fn(),
  mutationActive: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/config", () => ({
  usesSupabaseBackend: () => false,
}));
vi.mock("@/server/vendor/image-lifecycle", () => ({
  assertProductImageExists: memory.imageCheck,
}));
vi.mock("@/server/vendor/database", () => ({
  DEFAULT_VENDOR_SLUG: "chapega",
  findVendorBySlug: (database: VendorDatabase, slug: string) =>
    database.vendors.find((vendor) => vendor.slug === slug),
  findVendorSettings: (database: VendorDatabase, vendorId: string) =>
    database.settings.find((settings) => settings.vendorId === vendorId),
  newAuditRecord: (
    actorId: string,
    action: string,
    entityType:
      | "auth"
      | "product"
      | "order"
      | "settings"
      | "vendor"
      | "membership"
      | "platform",
    entityId: string,
    vendorId: string | null = null,
  ) => ({
    id: `audit-${++memory.auditCounter}`,
    vendorId,
    actorId,
    action,
    entityType,
    entityId,
    createdAt: new Date().toISOString(),
  }),
  readVendorDatabase: async () => structuredClone(memory.database),
  updateVendorDatabase: async <T>(
    mutation: (draft: VendorDatabase) => T | Promise<T>,
  ) => {
    const draft = structuredClone(memory.database) as VendorDatabase;
    memory.mutationActive = true;
    try {
      const result = await mutation(draft);
      memory.database = draft;
      return structuredClone(result);
    } finally {
      memory.mutationActive = false;
    }
  },
}));

import {
  createVendorProduct,
  getVendorBootstrap,
  recordKioskOrder,
  transitionVendorOrder,
  updateVendorProduct,
} from "@/server/vendor/service";

const vendor: VendorUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.com",
  name: "Shop owner",
  platformRole: "super_admin",
  role: "owner",
  activeVendor: {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "chapega",
    displayName: "Chapega.com",
    status: "active",
  },
  memberships: [
    {
      vendor: {
        id: "00000000-0000-4000-8000-000000000001",
        slug: "chapega",
        displayName: "Chapega.com",
        status: "active",
      },
      role: "owner",
      active: true,
      isDefault: true,
    },
  ],
  capabilities: {
    view_dashboard: true,
    manage_orders: true,
    manage_catalogue: true,
    manage_settings: true,
    manage_team: true,
  },
};

const product: VendorProduct = {
  id: "test-keepsake",
  name: "Test Keepsake",
  shortDescription: "A test keepsake.",
  description: "A keepsake used for service-level tests.",
  category: "Keepsakes",
  pricePaise: 10_000,
  image: "/generated-products/acrylic-sketch-lamp.png",
  availability: "available",
  stock: 100_000,
  featured: false,
  tags: [],
  recipientTags: [],
  occasionTags: [],
  variants: [
    {
      id: "standard",
      name: "Standard",
      priceAdjustmentPaise: 0,
      stock: 100_000,
    },
  ],
  preparationTime: "One day",
  giftWrapEligible: true,
  visible: true,
  archived: false,
  version: 1,
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

const submission: KioskOrderSubmission = {
  idempotencyKey: "service-test-order",
  orderNumber: "GFT-20260918-4321",
  createdAt: "2026-09-18T08:00:00.000Z",
  kioskName: "Main Entrance",
  customer: {
    customerName: "Test Customer",
    customerPhone: "",
    giftNote: "",
    orderNote: "",
  },
  items: [
    {
      productId: product.id,
      variantId: "standard",
      quantity: 2,
      giftWrapped: false,
    },
  ],
};

function database(): VendorDatabase {
  const vendorId = vendor.activeVendor.id;
  return {
    version: 2,
    revision: 1,
    vendors: [
      {
        ...vendor.activeVendor,
        revision: 1,
        createdAt: "2026-09-18T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    users: [],
    memberships: [],
    sessions: [],
    products: [{ ...structuredClone(product), vendorId }],
    orders: [],
    settings: [
      {
        vendorId,
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
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    audit: [],
  };
}

function currentDatabase(): VendorDatabase {
  return memory.database as VendorDatabase;
}

beforeEach(() => {
  memory.auditCounter = 0;
  memory.database = database();
  memory.imageCheck.mockReset().mockResolvedValue(undefined);
  memory.mutationActive = false;
});

describe("vendor service persistence rules", () => {
  it("checks image existence inside the create/update serialization lock", async () => {
    const input: VendorProductInput = {
      name: "Guarded Keepsake",
      shortDescription: "A guarded image reference.",
      description: "A product used to verify image reference validation.",
      category: "Keepsakes",
      pricePaise: 12_000,
      image: "/generated-products/acrylic-sketch-lamp.png",
      stock: 9,
      featured: false,
      tags: [],
      recipientTags: [],
      occasionTags: [],
      variants: [],
      preparationTime: "Two days",
      giftWrapEligible: true,
      visible: true,
    };
    memory.imageCheck.mockImplementation(async () => {
      expect(memory.mutationActive).toBe(true);
    });

    const created = await createVendorProduct(input, vendor);
    await updateVendorProduct(
      created.id,
      { ...input, version: created.version },
      vendor,
    );

    expect(memory.imageCheck).toHaveBeenNthCalledWith(
      1,
      input.image,
      vendor.activeVendor.id,
    );
    expect(memory.imageCheck).toHaveBeenNthCalledWith(
      2,
      input.image,
      vendor.activeVendor.id,
    );
  });

  it("does not persist a create when the referenced image is missing", async () => {
    memory.imageCheck.mockRejectedValueOnce(new Error("IMAGE_NOT_FOUND"));
    const before = structuredClone(currentDatabase());

    await expect(
      createVendorProduct(
        {
          name: "Missing Image Keepsake",
          shortDescription: "A missing image.",
          description: "This product should never be stored.",
          category: "Keepsakes",
          pricePaise: 12_000,
          image: "/generated-products/missing-image.png",
          stock: 1,
          featured: false,
          tags: [],
          recipientTags: [],
          occasionTags: [],
          variants: [],
          preparationTime: "Two days",
          giftWrapEligible: true,
          visible: true,
        },
        vendor,
      ),
    ).rejects.toThrow("IMAGE_NOT_FOUND");

    expect(currentDatabase()).toEqual(before);
  });

  it("enforces membership capabilities before catalogue mutations", async () => {
    const staff: VendorUser = {
      ...vendor,
      role: "staff",
      capabilities: {
        ...vendor.capabilities,
        manage_catalogue: false,
        manage_settings: false,
        manage_team: false,
      },
    };
    const before = structuredClone(currentDatabase());

    await expect(
      createVendorProduct(
        {
          name: "Forbidden product",
          shortDescription: "Staff cannot add this.",
          description: "Capability enforcement test.",
          category: "Keepsakes",
          pricePaise: 1_000,
          image: "/generated-products/acrylic-sketch-lamp.png",
          stock: 1,
          featured: false,
          tags: [],
          recipientTags: [],
          occasionTags: [],
          variants: [],
          preparationTime: "One day",
          giftWrapEligible: false,
          visible: true,
        },
        staff,
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(currentDatabase()).toEqual(before);
  });

  it("normalizes and round-trips variants through product create and update", async () => {
    const input: VendorProductInput = {
      name: " Variant Keepsake ",
      shortDescription: " A variant-backed keepsake. ",
      description: " A product used to verify variant persistence. ",
      category: " Keepsakes ",
      pricePaise: 12_000,
      image: "/generated-products/acrylic-sketch-lamp.png",
      stock: 9,
      featured: false,
      tags: [" custom "],
      recipientTags: [],
      occasionTags: [],
      variants: [
        {
          id: " framed ",
          name: " Framed ",
          priceAdjustmentPaise: 2_500,
          stock: 4,
        },
      ],
      preparationTime: " Two days ",
      giftWrapEligible: true,
      visible: true,
    };

    const created = await createVendorProduct(input, vendor);

    expect(created.variants).toEqual([
      {
        id: "framed",
        name: "Framed",
        priceAdjustmentPaise: 2_500,
        stock: 4,
      },
    ]);
    const storedCreated = currentDatabase().products.find(
      (candidate) => candidate.id === created.id,
    );
    expect(storedCreated?.variants).toEqual(created.variants);
    expect(Object.isFrozen(storedCreated?.variants)).toBe(true);
    expect(Object.isFrozen(storedCreated?.variants[0])).toBe(true);

    const updated = await updateVendorProduct(
      created.id,
      {
        ...input,
        pricePaise: 13_000,
        version: created.version,
        variants: [
          {
            id: " framed ",
            name: " Framed XL ",
            priceAdjustmentPaise: 3_000,
          },
          {
            id: "unframed",
            name: "Unframed",
            priceAdjustmentPaise: 0,
            stock: 5,
          },
        ],
      },
      vendor,
    );

    expect(updated.variants).toEqual([
      {
        id: "framed",
        name: "Framed XL",
        priceAdjustmentPaise: 3_000,
      },
      {
        id: "unframed",
        name: "Unframed",
        priceAdjustmentPaise: 0,
        stock: 5,
      },
    ]);
    expect(
      currentDatabase().products.find(
        (candidate) => candidate.id === created.id,
      )?.variants,
    ).toEqual(updated.variants);
  });

  it("returns an existing idempotent order after the shop is paused", async () => {
    const first = await recordKioskOrder(submission);
    currentDatabase().settings[0] = {
      ...currentDatabase().settings[0],
      storeOpen: false,
    };

    const retry = await recordKioskOrder(submission);

    expect(retry).toEqual(first);
    expect(currentDatabase().orders).toHaveLength(1);
  });

  it("keeps products, idempotency keys, and order numbers isolated per vendor", async () => {
    const otherId = "00000000-0000-4000-8000-000000000002";
    const otherUser: VendorUser = {
      ...vendor,
      role: "manager",
      activeVendor: {
        id: otherId,
        slug: "second-shop",
        displayName: "Second Shop",
        status: "active",
      },
      memberships: [
        ...vendor.memberships,
        {
          vendor: {
            id: otherId,
            slug: "second-shop",
            displayName: "Second Shop",
            status: "active",
          },
          role: "manager",
          active: true,
          isDefault: false,
        },
      ],
      capabilities: {
        ...vendor.capabilities,
        manage_settings: false,
        manage_team: false,
      },
    };
    currentDatabase().vendors.push({
      ...otherUser.activeVendor,
      revision: 1,
      createdAt: "2026-09-18T00:00:00.000Z",
      updatedAt: "2026-09-18T00:00:00.000Z",
    });
    currentDatabase().settings.push({
      ...currentDatabase().settings[0],
      vendorId: otherId,
      shopName: "Second Shop",
    });
    currentDatabase().products.push({
      ...structuredClone(currentDatabase().products[0]),
      vendorId: otherId,
      name: "Second Shop Keepsake",
      pricePaise: 20_000,
    });

    const first = await recordKioskOrder(submission, "chapega");
    const second = await recordKioskOrder(submission, "second-shop");
    const secondBootstrap = await getVendorBootstrap(otherUser);

    expect(first.totalPaise).toBe(20_000);
    expect(second.totalPaise).toBe(40_000);
    expect(currentDatabase().orders).toHaveLength(2);
    expect(
      new Set(currentDatabase().orders.map((order) => order.vendorId)),
    ).toEqual(new Set([vendor.activeVendor.id, otherId]));
    expect(secondBootstrap.products.map((item) => item.name)).toEqual([
      "Second Shop Keepsake",
    ]);
    expect(secondBootstrap.orders).toHaveLength(1);
  });

  it("caps restored product and variant stock when a confirmed order is cancelled", async () => {
    const prepared = await recordKioskOrder(submission);
    const confirmed = await transitionVendorOrder(
      prepared.id,
      "confirmed",
      prepared.version,
      vendor,
    );
    const currentProduct = currentDatabase().products[0];
    currentDatabase().products[0] = {
      ...currentProduct,
      stock: 100_000,
      variants: currentProduct.variants.map((variant) => ({
        ...variant,
        stock: 100_000,
      })),
    };

    const cancelled = await transitionVendorOrder(
      confirmed.id,
      "cancelled",
      confirmed.version,
      vendor,
    );

    expect(cancelled.inventoryCommitted).toBe(false);
    expect(currentDatabase().products[0].stock).toBe(100_000);
    expect(currentDatabase().products[0].variants[0].stock).toBe(100_000);
  });
});
