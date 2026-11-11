// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadKioskShop: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/app/kiosk/shop-status", () => ({ loadKioskShop: mocks.loadKioskShop }));
vi.mock("@/server/vendor/database", () => ({ DEFAULT_VENDOR_SLUG: "chapega" }));

import DeleteAccountPage, { metadata } from "@/app/delete-account/page";

const deletionEmailVariable = "CHAPEGA_ACCOUNT_DELETION_EMAIL";

beforeEach(() => mocks.loadKioskShop.mockReset());
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("account deletion page", () => {
  it("is titled for the store listings", () => {
    expect(metadata.title).toBe("Delete your account");
  });

  it("links to one configured email and explains the three request steps", () => {
    vi.stubEnv(deletionEmailVariable, "  deletion+studio@example.test  ");
    render(DeleteAccountPage());

    expect(mocks.loadKioskShop).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Delete your Chapega account" })).toBeVisible();
    const contact = screen.getByRole("link", { name: "deletion+studio@example.test" });
    expect(contact).toHaveAttribute("href", "mailto:deletion%2Bstudio@example.test");
    expect(document.querySelector('a[href^="https://wa.me/"]')).toBeNull();
    const steps = within(screen.getAllByRole("list")[0]).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent(/subject “Delete my account”/);
    expect(steps[0]).toHaveTextContent(/email address you sign in with/);
    expect(steps[1]).toHaveTextContent(/confirm the request/);
    expect(steps[2]).toHaveTextContent(/within 30 days/);
  });

  it("says what is deleted, what the shop keeps, and the lighter options", () => {
    vi.stubEnv(deletionEmailVariable, undefined);
    render(DeleteAccountPage());

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/becomes “Former team member”/);
    expect(text).toMatch(/Every sign-in, in browsers and on phones/);
    expect(text).toMatch(/stay with the shop, without your name/);
    expect(text).toMatch(/Team, then Remove access/);
    expect(text).toMatch(/change your password to end every other sign-in/);
    // Customers to the notice; staff to its shop-team part.
    const notices = screen
      .getAllByRole("link", { name: "privacy notice" })
      .map((link) => link.getAttribute("href"));
    expect(notices).toEqual(["/privacy", "/privacy#shop-teams"]);
  });

  it.each([
    { label: "missing", value: undefined },
    { label: "blank", value: "  " },
    { label: "invalid", value: "not-an-email" },
    { label: "multiple recipients", value: "one@example.test,two@example.test" },
    { label: "mail headers", value: "one@example.test?bcc=two@example.test" },
  ])("shows an unavailable message for $label contact configuration", ({ value }) => {
    vi.stubEnv(deletionEmailVariable, value);
    render(DeleteAccountPage());

    expect(screen.getByText(/online request address is currently unavailable/)).toHaveTextContent(
      "Ask your shop owner for help with account deletion.",
    );
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(document.querySelector('a[href^="https://wa.me/"]')).toBeNull();
    expect(screen.queryByText(/delete your account within 30 days/)).not.toBeInTheDocument();
    expect(mocks.loadKioskShop).not.toHaveBeenCalled();
  });
});
