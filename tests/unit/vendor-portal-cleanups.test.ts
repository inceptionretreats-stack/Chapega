// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminActivityRail } from "@/components/admin/admin-activity-rail";
import { VendorPortal } from "@/components/vendor/vendor-portal";
import { VendorSettings } from "@/components/vendor/vendor-settings";
import { VendorSignOutButton } from "@/components/vendor/vendor-sign-out-button";
import type { AdminActivityItem } from "@/types/admin";
import { makeBootstrap, makeOrder, makeSettings } from "./portal-fixtures";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({ src, alt = "" }: { src: string; alt?: string }) =>
      React.createElement("img", { src, alt }),
  };
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderPortal(data = makeBootstrap()) {
  return render(createElement(VendorPortal, { initialData: data }));
}

describe("admin activity icons (AUD-35)", () => {
  it("gives a created vendor its own icon rather than the generic store icon", () => {
    const items: AdminActivityItem[] = [
      {
        id: "a",
        kind: "vendor_created",
        title: "Created",
        detail: "",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "b",
        kind: "settings",
        title: "Settings",
        detail: "",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ];
    const { container } = render(createElement(AdminActivityRail, { items }));
    const icons = [...container.querySelectorAll(".admin-activity__icon svg")].map((svg) =>
      svg.getAttribute("class"),
    );
    expect(icons).toHaveLength(2);
    expect(icons[0]).not.toEqual(icons[1]);
  });
});

describe("Vendor Studio copy (AUD-35)", () => {
  it("does not claim it is morning regardless of the time of day", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-18T20:30:00"));
    renderPortal();
    for (const heading of screen.getAllByRole("heading", { level: 1 })) {
      expect(heading).not.toHaveTextContent(/good morning/i);
    }
    expect(screen.getAllByRole("heading", { level: 1 })[0]).toHaveTextContent(/owner/i);
  });

  it("labels the bottom-nav settings tab as Settings, not More", () => {
    renderPortal();
    const bottom = screen.getByRole("navigation", { name: /mobile vendor navigation/i });
    expect(within(bottom).getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(within(bottom).queryByRole("button", { name: "More" })).toBeNull();
  });
});

describe("Switch shop link (AUD-35)", () => {
  const second = (status: "active" | "suspended") => ({
    vendor: { id: "vendor-2", slug: "other", displayName: "Other", status },
    role: "owner" as const,
    active: true,
    isDefault: false,
  });

  it("is hidden when the only other shop is suspended", () => {
    const base = makeBootstrap();
    renderPortal({
      ...base,
      user: { ...base.user, memberships: [...base.user.memberships, second("suspended")] },
    });
    expect(screen.queryByRole("link", { name: /switch shop/i })).toBeNull();
  });

  it("is shown when another active shop exists", () => {
    const base = makeBootstrap();
    renderPortal({
      ...base,
      user: { ...base.user, memberships: [...base.user.memberships, second("active")] },
    });
    expect(screen.getByRole("link", { name: /switch shop/i })).toHaveAttribute(
      "href",
      "/vendor/select",
    );
  });
});

describe("session redirects keep the vendor slug (AUD-35)", () => {
  it("keeps ?vendor= when the session expires during a refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "Expired" } }), { status: 401 }),
      ),
    );
    renderPortal();
    await userEvent.click(screen.getByRole("button", { name: /refresh vendor data/i }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/vendor/login?vendor=chapega"),
    );
  });

  it("keeps ?vendor= after signing out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    renderPortal();
    await userEvent.click(screen.getAllByRole("button", { name: /sign out of vendor studio/i })[0]);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/vendor/login?vendor=chapega"),
    );
  });
});

describe("opening an order from the dashboard (AUD-35)", () => {
  it("does not keep forcing that order after the vendor navigates away and back", async () => {
    const base = makeBootstrap({ orders: [makeOrder(1), makeOrder(2)] });
    renderPortal(base);
    await userEvent.click(screen.getByRole("button", { name: "Open GFT-002" }));
    expect(await screen.findByRole("heading", { name: "GFT-002", level: 2 })).toBeInTheDocument();

    const sidebar = screen.getByRole("complementary", { name: /vendor studio navigation/i });
    await userEvent.click(within(sidebar).getByRole("button", { name: /dashboard/i }));
    await userEvent.click(within(sidebar).getByRole("button", { name: /^orders/i }));
    expect(await screen.findByRole("heading", { name: "GFT-001", level: 2 })).toBeInTheDocument();
  });
});

describe("settings WhatsApp test link (AUD-35)", () => {
  function renderSettings(overrides: Parameters<typeof makeSettings>[0]) {
    render(
      createElement(VendorSettings, {
        settings: makeSettings(overrides),
        onSettingsSaved: vi.fn(),
      }),
    );
    // An anchor without href has no link role, so find it by its text.
    return screen.getByText(/test whatsapp destination/i).closest("a") as HTMLAnchorElement;
  }

  it("applies the configured country code like the real order handoff", () => {
    const link = renderSettings({ defaultCountryCode: "44", ownerWhatsAppNumber: "7911123456" });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/447911123456\?text=/);
  });

  it("keeps working for the default Indian number", () => {
    const link = renderSettings({ defaultCountryCode: "91", ownerWhatsAppNumber: "98765 43210" });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
  });

  it("is disabled when the number is not valid", () => {
    const link = renderSettings({ ownerWhatsAppNumber: "123" });
    expect(link).not.toHaveAttribute("href");
    expect(link).toHaveAttribute("aria-disabled", "true");
  });
});

describe("workspace picker sign-out (AUD-35)", () => {
  it("signs out and returns to the vendor login", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(VendorSignOutButton));
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/vendor/login"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/vendor/logout");
  });
});
