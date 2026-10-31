// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadKioskShop: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/app/kiosk/shop-status", () => ({ loadKioskShop: mocks.loadKioskShop }));
vi.mock("@/server/vendor/database", () => ({ DEFAULT_VENDOR_SLUG: "chapega" }));

import DeleteAccountPage, { metadata } from "@/app/delete-account/page";

function chapega(ownerWhatsAppNumber = "919876543210") {
  return {
    status: "ok" as const,
    bootstrap: {
      vendor: { id: "chapega-id", slug: "chapega", displayName: "Chapega.com" },
      revision: "1",
      products: [],
      settings: {
        shopName: "Chapega.com",
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

beforeEach(() => mocks.loadKioskShop.mockReset());
afterEach(cleanup);

describe("account deletion page", () => {
  it("is titled for the store listings", () => {
    expect(metadata.title).toBe("Delete your account");
  });

  it("sends requests to Chapega.com's WhatsApp, in three steps", async () => {
    mocks.loadKioskShop.mockResolvedValue(chapega());
    render(await DeleteAccountPage());

    expect(mocks.loadKioskShop).toHaveBeenCalledWith("chapega");
    expect(screen.getByRole("heading", { name: "Delete your Chapega account" })).toBeVisible();
    const contact = screen.getByRole("link", { name: "+91 98765 43210" });
    expect(contact).toHaveAttribute("href", "https://wa.me/919876543210");
    expect(contact).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    const steps = within(screen.getAllByRole("list")[0]).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent(/email address you sign in with/);
    expect(steps[2]).toHaveTextContent(/within 30 days/);
  });

  it("says what is deleted, what the shop keeps, and the lighter options", async () => {
    mocks.loadKioskShop.mockResolvedValue(chapega());
    render(await DeleteAccountPage());

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/becomes “Former team member”/);
    expect(text).toMatch(/Every sign-in, in browsers and on phones/);
    expect(text).toMatch(/stay with the shop, without your name/);
    expect(text).toMatch(/Team, then Remove access/);
    expect(text).toMatch(/change your password: every other sign-in ends/);
    // Customers to the notice; staff to its shop-team part.
    const notices = screen
      .getAllByRole("link", { name: "privacy notice" })
      .map((link) => link.getAttribute("href"));
    expect(notices).toEqual(["/privacy", "/privacy#shop-teams"]);
  });

  it("still explains how to ask when the number can't be loaded", async () => {
    mocks.loadKioskShop.mockResolvedValue({ status: "error" });
    render(await DeleteAccountPage());

    expect(document.querySelector('a[href^="https://wa.me/"]')).toBeNull();
    expect(document.body.textContent).toMatch(/at the number shown on the Chapega.com kiosk/);
  });
});
