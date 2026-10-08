// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement, isValidElement, Suspense, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminSkeleton,
  DelayedSkeleton,
  KioskStorefrontSkeleton,
  SKELETON_DELAY_MS,
  VendorStudioSkeleton,
} from "@/components/skeletons";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  redirect,
  notFound,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const getCurrentVendorUser = vi.fn();
const getCurrentVendorContext = vi.fn();
const getVendorBootstrap = vi.fn();
vi.mock("@/server/vendor/auth", () => ({ getCurrentVendorUser, getCurrentVendorContext }));
vi.mock("@/server/vendor/service", () => ({ getVendorBootstrap }));

const getCurrentAdmin = vi.fn();
const getAdminBootstrap = vi.fn();
vi.mock("@/server/admin/auth", () => ({ getCurrentAdmin }));
vi.mock("@/server/admin/service", () => ({ getAdminBootstrap }));

const css = readFileSync(path.join(process.cwd(), "app/atelier.css"), "utf8");

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("delayed skeletons (AUD-32)", () => {
  it("waits about 300 ms before it is shown", () => {
    expect(SKELETON_DELAY_MS).toBe(300);
    render(createElement(DelayedSkeleton, { label: "Loading orders" }, createElement("span", null, "x")));
    const status = screen.getByRole("status", { name: "Loading orders" });
    // The label is real text so the live region has something to announce
    // (aria-busy would suppress it).
    expect(status).toHaveTextContent("Loading orders");
    expect(status).not.toHaveAttribute("aria-busy");
    expect(status.style.getPropertyValue("--skeleton-delay")).toBe("300ms");
  });

  it("hides the placeholder shapes from assistive technology", () => {
    render(createElement(DelayedSkeleton, { label: "Loading" }, createElement("span", { "data-testid": "shape" })));
    expect(screen.getByTestId("shape").closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("starts invisible and reveals after the delay in CSS, so server-streamed fallbacks behave the same", () => {
    const rule = css.match(/\.skeleton-reveal\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/animation:[^;]*var\(--skeleton-delay,\s*300ms\)[^;]*both/);
    expect(css).toMatch(/@keyframes skeleton-reveal\s*\{\s*from\s*\{\s*opacity:\s*0/);
  });

  it("drops the shimmer for people who prefer reduced motion", () => {
    const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
      .map((match) => match[1])
      .join("\n");
    expect(reduced).toMatch(/\.skeleton-block[^{]*\{[^}]*animation:\s*none/);
  });

  for (const [name, Component, label] of [
    ["Vendor Studio", VendorStudioSkeleton, /loading vendor studio/i],
    ["admin", AdminSkeleton, /loading platform admin/i],
    ["kiosk", KioskStorefrontSkeleton, /preparing this storefront/i],
  ] as const) {
    it(`${name} skeleton announces itself and has nothing to focus`, () => {
      const { container } = render(createElement(Component));
      expect(screen.getByRole("status", { name: label })).toBeInTheDocument();
      expect(container.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(0);
    });
  }
});

describe("route skeletons keep real redirects and 404s (AUD-32, AUD-11)", () => {
  it("Vendor Studio checks the session before streaming the skeleton", async () => {
    const { default: Page } = await import("@/app/vendor/[vendorSlug]/page");
    getCurrentVendorUser.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ vendorSlug: "chapega" }) })).rejects.toThrow(/NEXT_REDIRECT/);

    getCurrentVendorUser.mockResolvedValue({ id: "u1" });
    getCurrentVendorContext.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ vendorSlug: "nope" }) })).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(getVendorBootstrap).not.toHaveBeenCalled();
  });

  it("Vendor Studio wraps only the data load in a Suspense boundary with the studio skeleton", async () => {
    const { default: Page } = await import("@/app/vendor/[vendorSlug]/page");
    getCurrentVendorUser.mockResolvedValue({ id: "u1" });
    getCurrentVendorContext.mockResolvedValue({ vendor: { slug: "chapega" } });
    const element = (await Page({ params: Promise.resolve({ vendorSlug: "chapega" }) })) as ReactElement<{ fallback: unknown }>;
    expect(element.type).toBe(Suspense);
    expect(isValidElement(element.props.fallback)).toBe(true);
    expect((element.props.fallback as ReactElement).type).toBe(VendorStudioSkeleton);
  });

  it("admin checks the session before streaming the skeleton", async () => {
    const { default: Page } = await import("@/app/admin/page");
    getCurrentAdmin.mockResolvedValue(null);
    await expect(Page()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(getAdminBootstrap).not.toHaveBeenCalled();

    getCurrentAdmin.mockResolvedValue({ user: { id: "a1" } });
    const element = (await Page()) as ReactElement<{ fallback: unknown }>;
    expect(element.type).toBe(Suspense);
    expect((element.props.fallback as ReactElement).type).toBe(AdminSkeleton);
  });
});
