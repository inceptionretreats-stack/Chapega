// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VendorProductEditor } from "@/components/vendor/vendor-product-editor";
import type { VendorProduct } from "@/types/vendor";

const { vendorRequestMock } = vi.hoisted(() => ({
  vendorRequestMock: vi.fn(),
}));

vi.mock("@/components/vendor/vendor-client", () => ({
  commaSeparated: (values: readonly string[]) => values.join(", "),
  parseCommaSeparated: (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  vendorRequest: vendorRequestMock,
}));

const existingProduct: VendorProduct = {
  id: "keepsake-1",
  name: "Walnut keepsake",
  shortDescription: "A polished personalised keepsake.",
  description: "A premium personalised keepsake for thoughtful gifting.",
  category: "Personalized Gifts",
  pricePaise: 50_000,
  image: "/generated-products/acrylic-sketch-lamp.png",
  availability: "available",
  stock: 12,
  featured: false,
  tags: ["keepsake"],
  recipientTags: ["For Couple"],
  occasionTags: ["Anniversary"],
  variants: [{
    id: "walnut",
    name: "Walnut finish",
    priceAdjustmentPaise: 15_000,
    stock: 4,
  }],
  preparationTime: "Ready in one business day",
  giftWrapEligible: true,
  visible: true,
  archived: false,
  version: 3,
  createdAt: "2026-09-18T09:00:00.000Z",
  updatedAt: "2026-09-18T09:00:00.000Z",
};

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: (handle: number) => window.clearTimeout(handle),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderEditor() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(createElement(VendorProductEditor, {
    product: existingProduct,
    categories: ["Personalized Gifts"],
    onClose,
    onSaved,
    onArchived: vi.fn(),
  }));
  return { onClose, onSaved };
}

describe("VendorProductEditor product options", () => {
  it("preserves existing IDs and publishes signed adjustments with optional stock", async () => {
    const user = userEvent.setup();
    const generatedVariantId = "8ac73f9e-5516-4b46-9cb8-69d763b1647a";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(generatedVariantId);
    vendorRequestMock.mockResolvedValue({ product: existingProduct });
    renderEditor();

    const existingOption = screen.getByRole("group", { name: "Walnut finish" });
    await user.clear(within(existingOption).getByLabelText("Option name"));
    await user.type(
      within(existingOption).getByLabelText("Option name"),
      "Warm walnut",
    );

    await user.click(screen.getByRole("button", { name: "Add option" }));
    const newOption = screen.getByRole("group", { name: "Option 2" });
    await user.type(within(newOption).getByLabelText("Option name"), "Matte white");
    await user.clear(
      within(newOption).getByLabelText("Price adjustment (₹)"),
    );
    await user.type(
      within(newOption).getByLabelText("Price adjustment (₹)"),
      "-50",
    );

    expect(within(newOption).getByText("₹450.00")).toBeInTheDocument();
    expect(within(newOption).getByLabelText("Option stock")).toHaveValue(null);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(vendorRequestMock).toHaveBeenCalledTimes(1));
    const [url, init] = vendorRequestMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as {
      variants: Array<{
        id: string;
        name: string;
        priceAdjustmentPaise: number;
        stock?: number;
      }>;
    };

    expect(url).toBe("/api/vendor/products/keepsake-1");
    expect(init.method).toBe("PATCH");
    expect(payload.variants).toEqual([
      {
        id: "walnut",
        name: "Warm walnut",
        priceAdjustmentPaise: 15_000,
        stock: 4,
      },
      {
        id: generatedVariantId,
        name: "Matte white",
        priceAdjustmentPaise: -5_000,
      },
    ]);
  });

  it("blocks duplicate names, negative final prices, and fractional option stock", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "328f7f36-0a7f-44b1-ae18-dbbd322a14ba",
    );
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Add option" }));
    const newOption = screen.getByRole("group", { name: "Option 2" });
    await user.type(
      within(newOption).getByLabelText("Option name"),
      "Walnut finish",
    );
    await user.clear(
      within(newOption).getByLabelText("Price adjustment (₹)"),
    );
    await user.type(
      within(newOption).getByLabelText("Price adjustment (₹)"),
      "-501",
    );
    await user.type(within(newOption).getByLabelText("Option stock"), "2.5");

    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form") as HTMLFormElement);

    expect(
      screen.getByText("Review the highlighted product options before saving."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Use a unique name for every option."),
    ).toHaveLength(2);
    expect(
      screen.getByText("The final option price cannot be less than ₹0."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Use a whole number from 0 to 100,000, or leave this blank.",
      ),
    ).toBeInTheDocument();
    expect(vendorRequestMock).not.toHaveBeenCalled();
  });
});
