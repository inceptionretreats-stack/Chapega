// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadKioskShop: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/app/kiosk/shop-status", () => ({ loadKioskShop: mocks.loadKioskShop }));
vi.mock("@/server/vendor/database", () => ({ DEFAULT_VENDOR_SLUG: "chapega" }));
vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({ src, alt = "" }: { src: string; alt?: string }) =>
      React.createElement("img", { src, alt }),
  };
});

import { CheckoutScreen } from "@/components/checkout-screen";
import { WelcomeScreen } from "@/components/welcome-screen";
import PrivacyPage, { metadata } from "@/app/privacy/page";

function shop(slug: string, shopName: string, ownerWhatsAppNumber = "919876543210") {
  return {
    status: "ok" as const,
    bootstrap: {
      vendor: { id: `${slug}-id`, slug, displayName: shopName },
      revision: "1",
      products: [],
      settings: {
        shopName,
        ownerWhatsAppNumber,
        defaultCountryCode: "91",
        kioskName: "Main kiosk",
        maxCartQuantity: 5,
        giftWrapFeePaise: 2_500,
        qrResetSeconds: 120,
        showPreviewLabel: false,
      },
      storeOpen: true,
      syncedAt: new Date(0).toISOString(),
    },
  };
}

async function renderPage(shopParam?: string | string[]) {
  render(
    await PrivacyPage({
      searchParams: Promise.resolve(shopParam === undefined ? {} : { shop: shopParam }),
    }),
  );
}

beforeEach(() => mocks.loadKioskShop.mockReset());
afterEach(cleanup);

describe("privacy notice links", () => {
  it("points the checkout notice at the shop's privacy page", () => {
    render(
      createElement(CheckoutScreen, {
        customer: { customerName: "", customerPhone: "", giftNote: "", orderNote: "" },
        cart: [],
        totals: { subtotalPaise: 0, giftWrapPaise: 0, totalPaise: 0 },
        unitCount: 0,
        onChange: vi.fn(),
        onEditSelection: vi.fn(),
        onReview: vi.fn(),
        privacyHref: "/privacy?shop=rose-gifts",
      }),
    );
    expect(screen.getByText(/only to prepare this order on WhatsApp/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy notice/i })).toHaveAttribute(
      "href",
      "/privacy?shop=rose-gifts",
    );
  });

  it("points the welcome screen at the shop's privacy page", () => {
    render(
      createElement(WelcomeScreen, {
        shopName: "Rose Gifts",
        kioskName: "Main kiosk",
        showPreviewLabel: false,
        online: true,
        onStart: vi.fn(),
        vendorLoginHref: "/vendor/login",
        privacyHref: "/privacy?shop=rose-gifts",
      }),
    );
    expect(screen.getByRole("link", { name: /privacy notice/i })).toHaveAttribute(
      "href",
      "/privacy?shop=rose-gifts",
    );
  });
});

describe("privacy notice page", () => {
  it("is final and indexable, with no draft banner or placeholders", async () => {
    expect(metadata.robots).toBeUndefined();
    expect(String(metadata.title)).not.toMatch(/draft/i);
    await renderPage();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/draft|awaiting review/i);
    expect(text).not.toMatch(/\[[A-Z ]+:/);
    expect(text).toMatch(/Chapega\.com runs this gift kiosk and is responsible/);
    expect(text).toMatch(/Digital Personal Data Protection Act, 2023/);
    for (const collected of ["name", "phone", "gift note", "order note", "order items"]) {
      expect(text.toLowerCase()).toContain(collected);
    }
  });

  it("states the 30-day retention rule the database applies", async () => {
    await renderPage();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(
      /removed from the order record 30 days after your order is completed or cancelled/,
    );
    expect(text).toMatch(
      /never confirms the order, they are removed 30 days after you prepared it/,
    );
    expect(text).toMatch(/still being prepared keeps them until it is finished/);
  });

  it("names the shop and its WhatsApp number when opened from its kiosk", async () => {
    mocks.loadKioskShop.mockResolvedValue(shop("rose-gifts", "Rose Gifts"));
    await renderPage("rose-gifts");
    expect(mocks.loadKioskShop).toHaveBeenCalledWith("rose-gifts");
    const contact = screen.getByRole("link", { name: "+91 98765 43210" });
    expect(contact).toHaveAttribute("href", "https://wa.me/919876543210");
    expect(contact).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    expect(document.body.textContent).toMatch(/message Rose Gifts on WhatsApp/);
    expect(screen.getByRole("link", { name: "Back to the kiosk" })).toHaveAttribute(
      "href",
      "/kiosk/rose-gifts",
    );
  });

  it("sends the default shop back to the home kiosk", async () => {
    mocks.loadKioskShop.mockResolvedValue(shop("chapega", "Chapega.com"));
    await renderPage(["chapega", "ignored"]);
    expect(mocks.loadKioskShop).toHaveBeenCalledWith("chapega");
    expect(screen.getByRole("link", { name: "Back to the kiosk" })).toHaveAttribute("href", "/");
  });

  it("falls back to general wording without a known shop", async () => {
    await renderPage();
    expect(mocks.loadKioskShop).not.toHaveBeenCalled();
    expect(document.body.textContent).toMatch(
      /message the shop on the WhatsApp number your order was sent to/,
    );
    expect(document.querySelector('a[href^="https://wa.me/"]')).toBeNull();

    cleanup();
    mocks.loadKioskShop.mockResolvedValue({ status: "not-found" });
    await renderPage("no-such-shop");
    expect(document.querySelector('a[href^="https://wa.me/"]')).toBeNull();
    expect(screen.getByRole("link", { name: "Back to the kiosk" })).toHaveAttribute("href", "/");
  });
});
