// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ vendorRequest: vi.fn() }));

vi.mock("@/components/vendor/vendor-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/vendor/vendor-client")>()),
  vendorRequest: client.vendorRequest,
}));

import { VendorClientError } from "@/components/vendor/vendor-client";
import { VendorSettings } from "@/components/vendor/vendor-settings";
import { vendorSettingsSchema } from "@/server/vendor/schemas";
import { makeSettings } from "./portal-fixtures";

afterEach(() => {
  cleanup();
  client.vendorRequest.mockReset();
});

describe("shop settings errors", () => {
  it("highlights the field the server refused, with its message, and focuses it", async () => {
    const user = userEvent.setup();
    const message = "Enter a valid WhatsApp number with 10 to 15 digits.";
    client.vendorRequest.mockRejectedValueOnce(
      new VendorClientError(
        400,
        "VALIDATION_ERROR",
        "Check the highlighted information and try again.",
        {
          ownerWhatsAppNumber: [message],
        },
      ),
    );
    render(
      createElement(VendorSettings, {
        apiBase: "/api/vendor/chapega",
        settings: makeSettings(),
        onSettingsSaved: vi.fn(),
      }),
    );
    const number = screen.getByLabelText("Owner WhatsApp number");
    await user.clear(number);
    await user.type(number, "12345");
    await user.click(screen.getByRole("button", { name: "Publish settings" }));

    await waitFor(() => expect(number).toHaveAttribute("aria-invalid", "true"));
    expect(number).toHaveAccessibleDescription(message);
    expect(screen.getByRole("alert")).toHaveTextContent("Check the highlighted information");
    await waitFor(() => expect(number).toHaveFocus());

    // Editing the field clears its error.
    await user.type(number, "67890");
    expect(number).not.toHaveAttribute("aria-invalid");
  });

  it("explains a short WhatsApp number in words a shop owner can act on", () => {
    const parsed = vendorSettingsSchema.safeParse({
      shopName: "Chapega.com",
      ownerWhatsAppNumber: "12345",
      defaultCountryCode: "91",
      kioskName: "Main kiosk",
      maxCartQuantity: 5,
      giftWrapFeePaise: 2_500,
      qrResetSeconds: 120,
      showPreviewLabel: false,
      storeOpen: true,
      lowStockThreshold: 3,
      version: 1,
    });
    expect(parsed.success).toBe(false);
    const messages = parsed.error?.issues.map((issue) => issue.message) ?? [];
    expect(messages).toEqual(["Enter a valid WhatsApp number with 10 to 15 digits."]);
  });
});
