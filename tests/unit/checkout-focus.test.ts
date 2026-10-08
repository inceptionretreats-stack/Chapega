// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckoutScreen } from "@/components/checkout-screen";

vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({ src, alt = "" }: { src: string; alt?: string }) =>
      React.createElement("img", { src, alt }),
  };
});

afterEach(cleanup);

function renderCheckout(customerPhone: string, onReview = vi.fn()) {
  render(
    createElement(CheckoutScreen, {
      customer: {
        customerName: "",
        customerPhone,
        giftNote: "",
        orderNote: "",
      },
      cart: [],
      totals: { subtotalPaise: 0, giftWrapPaise: 0, totalPaise: 0 },
      unitCount: 0,
      onChange: vi.fn(),
      onEditSelection: vi.fn(),
      onReview,
    }),
  );
  return onReview;
}

describe("checkout validation focus and announcements (AUD-22)", () => {
  it("moves focus to the invalid phone field and announces the error", async () => {
    const onReview = renderCheckout("123");
    await userEvent.click(screen.getByRole("button", { name: /review order/i }));

    const phone = screen.getByLabelText(/mobile number/i);
    expect(onReview).not.toHaveBeenCalled();
    expect(phone).toHaveFocus();
    expect(phone).toHaveAttribute("aria-invalid", "true");
    const error = document.getElementById("customer-phone-error");
    expect(error).toBeInTheDocument();
    expect(phone).toHaveAttribute("aria-describedby", "customer-phone-error");
    expect(error?.closest("[aria-live]")).not.toBeNull();
  });

  it("keeps the live region mounted before any error so announcements are reliable", () => {
    renderCheckout("");
    const region = document.querySelector("[data-phone-error-region]");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
  });

  it("continues to review when the phone is valid", async () => {
    const onReview = renderCheckout("9876543210");
    await userEvent.click(screen.getByRole("button", { name: /review order/i }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });
});
