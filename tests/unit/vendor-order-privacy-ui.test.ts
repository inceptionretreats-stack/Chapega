// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ vendorRequest: vi.fn() }));

vi.mock("@/components/vendor/vendor-client", () => ({
  vendorRequest: client.vendorRequest,
  VendorClientError: class VendorClientError extends Error {},
}));
vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({ src, alt = "" }: { src: string; alt?: string }) =>
      React.createElement("img", { src, alt }),
  };
});

import { VendorDashboard } from "@/components/vendor/vendor-dashboard";
import { VendorOrders } from "@/components/vendor/vendor-orders";
import { REQUEST_REDACTION_MESSAGE } from "@/domain/order-privacy";
import { makeBootstrap, makeOrder, makeProduct, makeSettings } from "./portal-fixtures";

const withDetails = makeOrder(1, {
  customer: {
    customerName: "Asha",
    customerPhone: "98765 43210",
    giftNote: "Happy birthday",
    orderNote: "",
  },
  whatsappUrl: "https://wa.me/919876543210?text=Hello",
});

beforeEach(() => {
  client.vendorRequest.mockReset();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("removing a customer's details from an order", () => {
  it("is only offered to roles that may erase customer data", () => {
    render(
      createElement(VendorOrders, {
        orders: [withDetails],
        focusOrderId: null,
        onOrderSaved: vi.fn(),
      }),
    );
    expect(screen.queryByRole("button", { name: /Remove details/ })).toBeNull();
  });

  it("confirms, then sends the order version and reports the saved order", async () => {
    const user = userEvent.setup();
    const onOrderSaved = vi.fn();
    const removed = {
      ...withDetails,
      customer: { customerName: "", customerPhone: "", giftNote: "", orderNote: "" },
      whatsappMessage: REQUEST_REDACTION_MESSAGE,
      whatsappUrl: "https://wa.me/919876543210",
      version: 2,
    };
    client.vendorRequest.mockResolvedValue({ order: removed });
    render(
      createElement(VendorOrders, {
        apiBase: "/api/vendor/chapega",
        orders: [withDetails],
        focusOrderId: null,
        onOrderSaved,
        canRemoveCustomerDetails: true,
      }),
    );

    await user.click(screen.getByRole("button", { name: /Remove details/ }));
    const dialog = screen.getByRole("alertdialog", {
      name: `Remove customer details from ${withDetails.orderNumber}?`,
    });
    expect(dialog).toHaveTextContent(/cannot be undone/);
    expect(dialog).toHaveTextContent(/no longer see who placed this order/);
    await user.click(within(dialog).getByRole("button", { name: "Remove details" }));

    expect(client.vendorRequest).toHaveBeenCalledWith(
      "/api/vendor/chapega/orders/order-1/customer",
      { method: "DELETE", body: JSON.stringify({ version: 1 }) },
    );
    expect(onOrderSaved).toHaveBeenCalledWith(
      removed,
      `Customer details removed from ${withDetails.orderNumber}.`,
    );
  });

  it("shows a removed order as such, without the WhatsApp link", () => {
    const removed = makeOrder(2, {
      whatsappMessage: REQUEST_REDACTION_MESSAGE,
      customer: { customerName: "", customerPhone: "", giftNote: "", orderNote: "" },
    });
    render(
      createElement(VendorOrders, {
        orders: [removed],
        focusOrderId: null,
        onOrderSaved: vi.fn(),
        canRemoveCustomerDetails: true,
      }),
    );
    expect(screen.getAllByText("Details removed").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /WhatsApp conversation/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove details/ })).toBeNull();
  });

  it("finds an order by phone number in any format", async () => {
    const user = userEvent.setup();
    render(
      createElement(VendorOrders, {
        orders: [withDetails, makeOrder(2)],
        focusOrderId: null,
        onOrderSaved: vi.fn(),
      }),
    );
    const search = screen.getByPlaceholderText("Search number, customer, or gift");
    for (const query of ["+91 98765 43210", "9876543210", "98765-43210"]) {
      await user.clear(search);
      await user.type(search, query);
      expect(screen.getByText("1 order in this view")).toBeInTheDocument();
    }
  });
});

describe("dashboard restock", () => {
  it("asks to open that product's editor", async () => {
    const user = userEvent.setup();
    const onRestockProduct = vi.fn();
    const lowStock = makeProduct({ id: "product-9", name: "Gift 9", stock: 1 });
    render(
      createElement(VendorDashboard, {
        data: makeBootstrap({
          products: [lowStock],
          settings: makeSettings({ lowStockThreshold: 3 }),
        }),
        onViewOrders: vi.fn(),
        onViewProducts: vi.fn(),
        onOpenOrder: vi.fn(),
        onRestockProduct,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Restock Gift 9" }));
    expect(onRestockProduct).toHaveBeenCalledWith(lowStock);
  });
});

describe("after removing details found by a phone search", () => {
  it("keeps the same order in view", async () => {
    const user = userEvent.setup();
    const removed = {
      ...withDetails,
      customer: { customerName: "", customerPhone: "", giftNote: "", orderNote: "" },
      whatsappMessage: REQUEST_REDACTION_MESSAGE,
      whatsappUrl: "https://wa.me/919876543210",
      version: 2,
    };
    client.vendorRequest.mockResolvedValue({ order: removed });
    const other = makeOrder(2, {
      customer: { customerName: "Ravi", customerPhone: "", giftNote: "", orderNote: "" },
    });

    function Harness() {
      const [orders, setOrders] = useState([withDetails, other]);
      return createElement(VendorOrders, {
        orders,
        focusOrderId: null,
        onOrderSaved: (saved: typeof removed) =>
          setOrders((current) => current.map((order) => (order.id === saved.id ? saved : order))),
        canRemoveCustomerDetails: true,
      });
    }

    render(createElement(Harness));
    await user.type(
      screen.getByPlaceholderText("Search number, customer, or gift"),
      "+91 98765 43210",
    );
    await user.click(screen.getByRole("button", { name: /Remove details/ }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove details" }),
    );

    expect(screen.getByPlaceholderText("Search number, customer, or gift")).toHaveValue("");
    expect(screen.getByRole("heading", { name: withDetails.orderNumber, level: 2 })).toBeVisible();
  });
});
