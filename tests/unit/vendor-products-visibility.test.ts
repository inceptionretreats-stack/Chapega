// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VendorProducts } from "@/components/vendor/vendor-products";
import { makeProduct } from "./portal-fixtures";

vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({ src, alt = "" }: { src: string; alt?: string }) =>
      React.createElement("img", { src, alt }),
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Products list visibility toggle (AUD-9)", () => {
  it("sends the product's current variants unchanged when hiding it", async () => {
    const variants = [
      { id: "small", name: "Small", priceAdjustmentPaise: 0, stock: 3 },
      { id: "large", name: "Large", priceAdjustmentPaise: 5_000, stock: 2 },
    ];
    const product = makeProduct({ variants });
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ product: { ...product, visible: false } }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();

    render(
      createElement(VendorProducts, {
        products: [product],
        lowStockThreshold: 5,
        openAddRequested: false,
        onAddRequestHandled: () => undefined,
        onProductSaved: onSaved,
        onProductArchived: () => undefined,
      }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /hide gift 1 on kiosk/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body.variants).toEqual(variants);
    expect(body.visible).toBe(false);
    expect(body.version).toBe(1);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
