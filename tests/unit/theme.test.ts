// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayout from "@/app/admin/layout";
import VendorLayout from "@/app/vendor/layout";
import { ThemeControl } from "@/components/theme-control";
import { ThemeRoot } from "@/components/theme-root";
import { resolveThemeChoice, THEME_COOKIE, themeCookieString } from "@/domain/theme";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  }),
}));

beforeEach(() => {
  cookieJar.clear();
  document.cookie = `${THEME_COOKIE}=; Max-Age=0; Path=/`;
});

afterEach(() => {
  cleanup();
});

describe("theme cookie resolution (AUD-32)", () => {
  it("uses a valid stored choice", () => {
    expect(resolveThemeChoice("light")).toBe("light");
    expect(resolveThemeChoice("dark")).toBe("dark");
    expect(resolveThemeChoice("system")).toBe("system");
  });

  it("falls back to the system preference for anything else", () => {
    for (const value of [undefined, null, "", "DARK", "blue", "dark;", " light", "system dark"]) {
      expect(resolveThemeChoice(value)).toBe("system");
    }
  });

  it("writes a year-long, site-wide, non-secret preference cookie", () => {
    const value = themeCookieString("dark", false);
    expect(value).toMatch(new RegExp(`^${THEME_COOKIE}=dark;`));
    expect(value).toContain("Path=/");
    expect(value).toContain("Max-Age=31536000");
    expect(value).toContain("SameSite=Lax");
    expect(value).not.toContain("Secure");
    expect(themeCookieString("light", true)).toContain("Secure");
  });
});

describe("server-rendered theme attribute (AUD-32)", () => {
  type AsyncLayout = (props: { children: React.ReactNode; params: Promise<object> }) => Promise<ReactElement>;
  for (const [surface, Layout, className] of [
    ["Vendor Studio", VendorLayout as unknown as AsyncLayout, "vendor-route"],
    ["admin", AdminLayout as unknown as AsyncLayout, "admin-route"],
  ] as const) {
    it(`${surface} renders the cookie's choice as data-theme`, async () => {
      cookieJar.set(THEME_COOKIE, "dark");
      const element = (await Layout({ children: createElement("p", null, "content"), params: Promise.resolve({}) })) as ReactElement;
      const { container } = render(element);
      const wrapper = container.querySelector(`.${className}`);
      expect(wrapper).toHaveAttribute("data-theme", "dark");
      expect(screen.getByText("content")).toBeInTheDocument();
    });

    it(`${surface} falls back to data-theme="system" for a missing or invalid cookie`, async () => {
      cookieJar.set(THEME_COOKIE, "neon");
      const element = (await Layout({ children: null, params: Promise.resolve({}) })) as ReactElement;
      const { container } = render(element);
      expect(container.querySelector(`.${className}`)).toHaveAttribute("data-theme", "system");
      cleanup();
      cookieJar.clear();
      const fresh = (await Layout({ children: null, params: Promise.resolve({}) })) as ReactElement;
      render(fresh);
      expect(document.querySelector(`.${className}`)).toHaveAttribute("data-theme", "system");
    });
  }
});

describe("System / Light / Dark control (AUD-32)", () => {
  function renderControl(initialTheme: "system" | "light" | "dark" = "system") {
    const { container } = render(
      createElement(ThemeRoot, { className: "vendor-route", initialTheme }, createElement(ThemeControl)),
    );
    return container.querySelector(".vendor-route")!;
  }

  it("shows the current choice as a radio group", () => {
    renderControl("light");
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "System" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
  });

  it("applies a choice immediately and remembers it in the cookie", async () => {
    const wrapper = renderControl("system");
    const dark = screen.getByRole("radio", { name: "Dark" });
    await userEvent.click(dark);
    expect(dark).toBeChecked();
    expect(dark).toHaveFocus();
    expect(wrapper).toHaveAttribute("data-theme", "dark");
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);

    await userEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(wrapper).toHaveAttribute("data-theme", "system");
    expect(document.cookie).toContain(`${THEME_COOKIE}=system`);
  });

  it("can be operated with the arrow keys", async () => {
    const wrapper = renderControl("system");
    await userEvent.click(screen.getByRole("radio", { name: "System" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(wrapper).toHaveAttribute("data-theme", "light");
  });
});
