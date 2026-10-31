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
      // The click itself focuses the sidebar button; wait for the portal to
      // move focus into the main content before asserting on the target.
      await waitFor(() => {
        expect((document.activeElement as HTMLElement | null)?.closest("main")).not.toBeNull();
      });
      const focused = document.activeElement as HTMLElement;
      expect(focused.tagName).not.toBe("TH");
      expect(focused.closest("main")).not.toBeNull();
      expect(focused.getAttribute("tabindex")).toBe("-1");
    });
  }
});

describe("admin vendor collection", () => {
  it("Accounts still has a destination when the search matches no vendor", async () => {
    const user = userEvent.setup();
    renderPortal();
    await user.type(screen.getByRole("searchbox", { name: "Search vendors" }), "no such vendor");
    expect(screen.getByText("No vendors match")).toBeInTheDocument();

    const sidebar = screen.getByRole("complementary", {
      name: /platform administration navigation/i,
    });
    await user.click(within(sidebar).getByRole("button", { name: "Accounts" }));
    await waitFor(() => expect(document.activeElement?.id).toBe("vendor-accounts"));
  });

  it("labels the mobile suspend action with a pause icon, not a navigation arrow", () => {
    renderPortal();
    const list = screen.getByRole("list", { name: "Platform vendors" });
    const action = within(list).getAllByRole("button", { name: /^(Suspend|Reactivate) / })[0];
    expect(action.querySelector(".lucide-chevron-right")).toBeNull();
    expect(action.querySelector(".lucide-circle-pause, .lucide-circle-play")).not.toBeNull();
  });
});
