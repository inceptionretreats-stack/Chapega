// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VendorLoginForm } from "@/components/vendor/vendor-login-form";
import { VendorOrders } from "@/components/vendor/vendor-orders";
import { VendorPortal } from "@/components/vendor/vendor-portal";
import { VendorProductEditor } from "@/components/vendor/vendor-product-editor";
import { makeBootstrap, makeOrder, makeProduct } from "./portal-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

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
});

function stubResponse(status: number, body: object) {
  const fetchMock = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("vendor login failures (AUD-22)", () => {
  const props = {
    authenticationAvailable: true,
    previewCredentials: { email: "owner@chapega.com", password: "Chapega@2026" },
  };

  it("focuses the failing field and ties the message to it", async () => {
    stubResponse(400, {
      error: {
        message: "Check the highlighted information and try again.",
        fields: { password: ["Use at least 8 characters."] },
      },
    });
    render(createElement(VendorLoginForm, props));
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    const password = screen.getByLabelText("Password");
    await waitFor(() => expect(password).toHaveFocus());
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription(/at least 8/i);
  });

  it("focuses the alert for a non-field failure", async () => {
    stubResponse(401, { error: { message: "Email or password is incorrect." } });
    render(createElement(VendorLoginForm, props));
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  });
});

describe("Vendor Studio landmarks (AUD-22)", () => {
  it("has a main landmark and a skip link that is the first tab stop", async () => {
    render(createElement(VendorPortal, { initialData: makeBootstrap() }));
    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);

    await userEvent.tab();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(main).toHaveFocus();
  });
});

describe("order cancellation confirmation (AUD-22)", () => {
  function renderOrders(order = makeOrder(1)) {
    const onOrderSaved = vi.fn();
    render(
      createElement(VendorOrders, {
        orders: [order],
        focusOrderId: null,
        onOrderSaved,
      }),
    );
    return { onOrderSaved };
  }

  it("states the consequence for a confirmed order and cancels on Escape", async () => {
    renderOrders(makeOrder(1, { status: "confirmed", inventoryCommitted: true }));
    const cancel = screen.getByRole("button", { name: "Cancel order" });
    await userEvent.click(cancel);

    expect(screen.getByText(/restores.*stock/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Confirm cancellation" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel order" })).toHaveFocus();
  });

  it("says no stock is held for an order that was never confirmed", async () => {
    renderOrders();
    await userEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    expect(screen.getByText(/no stock was reserved/i)).toBeInTheDocument();
  });

  it("moves focus to the order detail after the cancellation is saved", async () => {
    stubResponse(200, { order: makeOrder(1, { status: "cancelled" }) });
    const { onOrderSaved } = renderOrders();
    await userEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(onOrderSaved).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "GFT-001" })).toHaveFocus(),
    );
  });
});

describe("product editor errors and archive (AUD-22)", () => {
  function renderEditor(onClose = vi.fn()) {
    render(
      createElement(VendorProductEditor, {
        product: makeProduct(),
        categories: ["Gifts"],
        onClose,
        onSaved: vi.fn(),
        onArchived: vi.fn(),
      }),
    );
    return { onClose };
  }

  it("focuses the field named in a server validation error", async () => {
    stubResponse(400, {
      error: {
        message: "Check the highlighted information and try again.",
        fields: { shortDescription: ["Keep the short description under 180 characters."] },
      },
    });
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const field = screen.getByLabelText(/short description/i);
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/under 180/i);
  });

  it("focuses the price field when local validation fails", async () => {
    renderEditor();
    const price = screen.getByLabelText(/^price/i);
    await userEvent.clear(price);
    await userEvent.type(price, "5000000");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(price).toHaveFocus());
    expect(price).toHaveAttribute("aria-invalid", "true");
  });

  it("focuses the alert summary for a non-field save failure", async () => {
    stubResponse(500, { error: { message: "The catalogue is unavailable." } });
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("states the archive consequence and Escape cancels only the confirmation", async () => {
    const { onClose } = renderEditor();
    const archive = screen.getByRole("button", { name: "Archive" });
    await userEvent.click(archive);

    expect(screen.getByRole("button", { name: "Confirm archive" })).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirm archive" })).toBeNull();
    expect(screen.getByRole("button", { name: "Archive" })).toHaveFocus();

    // A second Escape (nothing pending) closes the editor as before.
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
