// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPortal } from "@/components/admin/admin-portal";
import { makeAdminBootstrap } from "./admin-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPortal() {
  return render(createElement(AdminPortal, { initialData: makeAdminBootstrap() }));
}

describe("admin navigation destinations (AUD-40)", () => {
  for (const label of ["Overview", "Vendors", "Orders", "Accounts"]) {
    it(`${label} moves focus to a focusable section that is not a table header`, async () => {
      renderPortal();
      const sidebar = screen.getByRole("complementary", {
        name: /platform administration navigation/i,
      });
      await userEvent.click(within(sidebar).getByRole("button", { name: label }));
      await waitFor(() => {
        expect(document.activeElement).not.toBe(document.body);
      });
      const focused = document.activeElement as HTMLElement;
      expect(focused.tagName).not.toBe("TH");
      expect(focused.closest("main")).not.toBeNull();
      expect(focused.getAttribute("tabindex")).toBe("-1");
    });
  }
});
