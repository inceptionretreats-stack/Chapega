// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderReadyScreen } from "@/components/order-ready-screen";
import type { Order } from "@/types/kiosk";

vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({ src, alt = "" }: { src: string; alt?: string }) =>
      React.createElement("img", { src, alt }),
  };
});

beforeEach(() => {
  // jsdom has no matchMedia; the dialog's focus handling asks about motion.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

const order: Order = {
  id: "order-1",
  orderNumber: "GFT-20261008-4321",
  createdAt: "2026-10-08T10:00:00.000Z",
  kioskName: "Main Entrance",
  paymentMethod: "pay_later",
  items: [
    {
      productId: "frame",
      name: "Table Frame",
      quantity: 1,
      unitPricePaise: 49_900,
      giftWrapped: false,
      lineTotalPaise: 49_900,
    },
  ],
  subtotalPaise: 49_900,
  giftWrapPaise: 0,
  totalPaise: 49_900,
  whatsappMessage: "Hello Chapega.com,\nOrder GFT-20261008-4321",
  whatsappUrl: "https://wa.me/919876543210?text=Hello",
  status: "prepared_for_whatsapp",
};

function renderScreen(onStartNewOrder = vi.fn()) {
  render(
    createElement(OrderReadyScreen, {
      shopName: "Chapega.com",
      order,
      products: [],
      secondsRemaining: 90,
      extended: false,
      copied: false,
      copyError: null,
      onCopy: vi.fn(),
      onKeepOpen: vi.fn(),
      onStartNewOrder,
    }),
  );
  return onStartNewOrder;
}

describe("starting a new order from the QR screen (owner decision)", () => {
  it("asks first, with keeping the QR as the focused choice", async () => {
    const onStartNewOrder = renderScreen();
    await userEvent.click(screen.getByRole("button", { name: /start new order/i }));

    const dialog = await screen.findByRole("alertdialog", { name: /start a new order/i });
    expect(dialog).toHaveAccessibleDescription(/clears this QR code/i);
    await waitFor(() => expect(screen.getByRole("button", { name: /keep this qr/i })).toHaveFocus());
    expect(onStartNewOrder).not.toHaveBeenCalled();
  });

  it("keeps the QR on Escape or Keep, and starts over only on confirm", async () => {
    const onStartNewOrder = renderScreen();
    const opener = screen.getByRole("button", { name: /start new order/i });

    await userEvent.click(opener);
    await screen.findByRole("alertdialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    await userEvent.click(opener);
    await userEvent.click(await screen.findByRole("button", { name: /keep this qr/i }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onStartNewOrder).not.toHaveBeenCalled();

    await userEvent.click(opener);
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      Array.from(dialog.querySelectorAll("button")).find((button) =>
        /start new order/i.test(button.textContent ?? ""),
      )!,
    );
    expect(onStartNewOrder).toHaveBeenCalledTimes(1);
  });
});
