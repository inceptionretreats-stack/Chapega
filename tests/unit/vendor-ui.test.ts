// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VendorDashboard } from "@/components/vendor/vendor-dashboard";
import { VendorOrders } from "@/components/vendor/vendor-orders";
import { VendorSettings } from "@/components/vendor/vendor-settings";
import type {
  VendorBootstrap,
  VendorOrder,
  VendorProduct,
  VendorSettings as VendorSettingsType,
} from "@/types/vendor";

vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({ src, alt = "" }: { src: string; alt?: string }) =>
      React.createElement("img", { src, alt }),
  };
});

afterEach(cleanup);

// The confirmation dialog's focus handling reads (pointer: coarse); jsdom has
// no matchMedia.
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

const settings: VendorSettingsType = {
  shopName: "Chapega.com",
  ownerWhatsAppNumber: "919876543210",
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
};

function product(index: number, stock: number): VendorProduct {
  return {
    id: `product-${index}`,
    name: `Gift ${index}`,
    shortDescription: "A thoughtful gift.",
    description: "A thoughtful handmade gift.",
    category: "Gifts",
    pricePaise: 20_000,
    image: "/generated-products/acrylic-sketch-lamp.png",
    availability: stock === 0 ? "unavailable" : "low_stock",
    stock,
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
  };
}

function order(index: number): VendorOrder {
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
  };
}

describe("Vendor Studio state safeguards", () => {
  it("reports the complete low-stock count while limiting the preview list", () => {
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
    const data: VendorBootstrap = {
      user: {
        id: "owner-1",
        email: "owner@example.com",
        name: "Owner",
        platformRole: "super_admin",
        role: "owner",
        activeVendor: vendor,
        memberships: [
          {
            vendor,
            role: "owner",
            active: true,
            isDefault: true,
          },
        ],
        capabilities,
      },
      vendor,
      capabilities,
      revision: 1,
      products: Array.from({ length: 6 }, (_, index) =>
        product(index + 1, index),
      ),
      orders: [],
      settings,
    };

    const { container } = render(
      createElement(VendorDashboard, {
        data,
        onViewOrders: vi.fn(),
        onViewProducts: vi.fn(),
        onAddProduct: vi.fn(),
        onOpenOrder: vi.fn(),
      }),
    );

    const lowStockSummary = [
      ...container.querySelectorAll(".vendor-summary-stat"),
    ].find((element) => element.textContent?.includes("Low stock"));
    expect(lowStockSummary).toHaveTextContent("6Low stock");
    expect(container.querySelectorAll(".vendor-stock-list li")).toHaveLength(4);
  });

  it("does not carry a cancellation confirmation to another selected order", async () => {
    const user = userEvent.setup();
    render(
      createElement(VendorOrders, {
        orders: [order(1), order(2)],
        focusOrderId: null,
        onOrderSaved: vi.fn(),
      }),
    );

    expect(screen.getByRole("button", { name: "Active 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // AUD-22: the confirmation is now an alertdialog named for the order.
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    expect(
      screen.getByRole("alertdialog", { name: /GFT-001/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /GFT-002/ }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel order" }),
    ).toBeInTheDocument();
  });

  it("keeps a dirty settings draft when fresher server props arrive", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      createElement(VendorSettings, {
        settings,
        onSettingsSaved: vi.fn(),
      }),
    );
    const shopName = screen.getByRole("textbox", { name: "Shop name" });
    await user.clear(shopName);
    await user.type(shopName, "My draft shop");

    rerender(
      createElement(VendorSettings, {
        settings: {
          ...settings,
          shopName: "Changed elsewhere",
          version: 2,
          updatedAt: "2026-09-18T10:00:00.000Z",
        },
        onSettingsSaved: vi.fn(),
      }),
    );

    expect(screen.getByRole("textbox", { name: "Shop name" })).toHaveValue(
      "My draft shop",
    );
    expect(
      screen.getByText(/newer settings revision is available/i),
    ).toBeInTheDocument();
    const publishCard = screen.getByText("Publish changes").closest("section");
    expect(
      within(publishCard as HTMLElement).getByRole("button", {
        name: "Publish settings",
      }),
    ).toBeDisabled();
  });
});
