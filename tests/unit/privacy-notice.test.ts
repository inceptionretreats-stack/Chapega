// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckoutScreen } from "@/components/checkout-screen";
import PrivacyPage, { metadata } from "@/app/privacy/page";

vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({ src, alt = "" }: { src: string; alt?: string }) =>
      React.createElement("img", { src, alt }),
  };
});

afterEach(cleanup);

describe("privacy notice (AUD-12 draft)", () => {
  it("shows a plain-words notice linking to /privacy on the details step", () => {
    render(
      createElement(CheckoutScreen, {
        customer: {
          customerName: "",
          customerPhone: "",
          giftNote: "",
          orderNote: "",
        },
        cart: [],
        totals: { subtotalPaise: 0, giftWrapPaise: 0, totalPaise: 0 },
        unitCount: 0,
        onChange: vi.fn(),
        onEditSelection: vi.fn(),
        onReview: vi.fn(),
      }),
    );
    expect(screen.getByText(/only to prepare this order on WhatsApp/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy notice/i })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  it("is a visible draft, not indexed, and uses placeholders instead of invented details", () => {
    expect(metadata.robots).toEqual(expect.objectContaining({ index: false }));
    render(createElement(PrivacyPage));
    expect(screen.getByText(/draft.*awaiting review/i)).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    for (const placeholder of [
      "[BUSINESS NAME: from owner]",
      "[RETENTION PERIOD: decided by the shop owner]",
      "[CONTACT: from the shop owner]",
    ]) {
      expect(text).toContain(placeholder);
    }
    expect(text).toMatch(/Digital Personal Data Protection Act, 2023/);
    for (const collected of ["name", "phone", "gift note", "order note", "order items"]) {
      expect(text.toLowerCase()).toContain(collected);
    }
  });
});
