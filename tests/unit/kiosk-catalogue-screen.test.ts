// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createElement, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CartLine } from "@/types/kiosk";

vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({ src, alt = "" }: { src: string; alt?: string }) =>
      React.createElement("img", { src, alt }),
  };
});

import { CartScreen } from "@/components/cart-screen";
import { CatalogueScreen } from "@/components/catalogue-screen";

afterEach(cleanup);

function line(overrides: Partial<CartLine>): CartLine {
  return {
    key: "mug:small:false",
    productId: "mug",
    productName: "Photo Mug",
    productImage: "/generated-products/acrylic-sketch-lamp.png",
    quantity: 1,
    unitPricePaise: 49_900,
    giftWrapped: false,
    productStockLimit: 5,
    stockLimit: 5,
    ...overrides,
  };
}

// Two lines of the same product that differ only by option and gift wrap.
const cart = [
  line({ key: "mug:small:false", variantId: "small", variantName: "Small" }),
  line({ key: "mug:large:true", variantId: "large", variantName: "Large", giftWrapped: true }),
];
const totals = { subtotalPaise: 99_800, giftWrapPaise: 2_500, totalPaise: 102_300 };

function catalogueProps(
  overrides: Partial<ComponentProps<typeof CatalogueScreen>> = {},
): ComponentProps<typeof CatalogueScreen> {
  return {
    products: [],
    totalProducts: 2,
    categories: [],
    selectedCategory: "all",
    searchQuery: "",
    cart,
    unitCount: 2,
    maxUnits: 5,
    totals,
    onCategoryChange: vi.fn(),
    onOpenProduct: vi.fn(),
    onQuickAdd: vi.fn(),
    onQuantityChange: vi.fn(),
    onRemove: vi.fn(),
    onOpenCart: vi.fn(),
    onClearFilters: vi.fn(),
    onNeedHelp: vi.fn(),
    ...overrides,
  };
}

describe("cart lines name their option and gift wrap", () => {
  it("in the catalogue's cart rail", () => {
    render(createElement(CatalogueScreen, catalogueProps()));
    const rail = screen.getByRole("list", { name: "Selected gifts" });
    const items = within(rail).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Photo Mug, Small, quantity 1");
    expect(items[1]).toHaveTextContent("Photo Mug, Large, gift wrapped, quantity 1");
    expect(within(items[0]).getByRole("heading")).toHaveTextContent("Photo Mug · Small");
    expect(screen.getByRole("button", { name: "Remove Photo Mug, Small" })).toBeInTheDocument();
  });

  it("in the cart review", () => {
    render(
      createElement(CartScreen, {
        cart,
        products: [],
        unitCount: 2,
        maxUnits: 5,
        totals,
        giftWrapFeePaise: 2_500,
        onQuantityChange: vi.fn(),
        onRemove: vi.fn(),
        onToggleWrap: vi.fn(),
        onContinueShopping: vi.fn(),
        onCheckout: vi.fn(),
      }),
    );
    expect(screen.getByLabelText("Quantity for Photo Mug, Small")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity for Photo Mug, Large")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Photo Mug, Large" })).toBeInTheDocument();
  });
});

describe("an empty catalogue", () => {
  it("says the shop has no gifts yet instead of blaming the search", () => {
    render(createElement(CatalogueScreen, catalogueProps({ totalProducts: 0, cart: [] })));
    expect(screen.getByRole("heading", { name: "No gifts on display yet" })).toBeInTheDocument();
    expect(screen.queryByText("No gifts match that search")).not.toBeInTheDocument();
    // Nothing to filter or sort.
    expect(screen.queryByRole("group", { name: "Filter by occasion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Clear search/ })).not.toBeInTheDocument();
  });

  it("still offers to clear a search that matched nothing", () => {
    render(createElement(CatalogueScreen, catalogueProps({ searchQuery: "zzzz" })));
    expect(screen.getByRole("heading", { name: "No gifts match that search" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear search and filters" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filter by occasion" })).toBeInTheDocument();
  });
});
