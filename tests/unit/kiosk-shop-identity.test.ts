// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KioskHeader } from "@/components/kiosk-header";
import { WelcomeScreen } from "@/components/welcome-screen";

vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({ src, alt = "" }: { src: string; alt?: string }) =>
      React.createElement("img", { src, alt }),
  };
});

afterEach(cleanup);

function welcome(shopName: string) {
  return render(
    createElement(WelcomeScreen, {
      shopName,
      kioskName: "Main Entrance",
      showPreviewLabel: false,
      online: true,
      onStart: vi.fn(),
      vendorLoginHref: "/vendor/login",
    }),
  );
}

function header(shopName: string) {
  return render(
    createElement(KioskHeader, {
      shopName,
      cartUnits: 0,
      maxUnits: 5,
      online: true,
      onCart: vi.fn(),
      onSettings: vi.fn(),
    }),
  );
}

describe("shop name beside the Chapega logo", () => {
  it("is not repeated when the shop is Chapega.com itself", () => {
    const { container } = welcome("Chapega.com");
    expect(container.querySelector(".kiosk-store-identity strong")).toBeNull();
    expect(screen.getByText("Main Entrance")).toBeVisible();

    cleanup();
    const second = header("chapega.com ");
    expect(second.container.querySelector(".kiosk-header__store-name")).toBeNull();
  });

  it("is shown for every other shop", () => {
    welcome("Blue Door Gifts");
    expect(screen.getByText("Blue Door Gifts")).toBeVisible();

    cleanup();
    header("Blue Door Gifts");
    expect(screen.getByText("Blue Door Gifts")).toBeVisible();
  });
});
