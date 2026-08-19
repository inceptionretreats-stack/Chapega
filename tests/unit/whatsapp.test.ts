import { describe, expect, it } from "vitest";

import {
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  normalizeWhatsAppNumber,
  WhatsAppNumberError,
  type WhatsAppNumberErrorCode,
} from "@/domain/whatsapp";

function expectNumberError(
  action: () => unknown,
  code: WhatsAppNumberErrorCode,
): void {
  try {
    action();
    throw new Error("Expected WhatsApp number validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(WhatsAppNumberError);
    expect((error as WhatsAppNumberError).code).toBe(code);
  }
}

describe("Indian WhatsApp number normalization", () => {
  it.each([
    ["98765 43210", "919876543210"],
    ["098765-43210", "919876543210"],
    ["+91 (98765) 43210", "919876543210"],
    ["0091 98765 43210", "919876543210"],
  ])("normalizes %s to country-code-prefixed digits", (raw, expected) => {
    expect(normalizeWhatsAppNumber(raw)).toBe(expected);
  });

  it("reports empty, invalid country-code, short, and overlong values", () => {
    expectNumberError(() => normalizeWhatsAppNumber(" -- "), "NUMBER_REQUIRED");
    expectNumberError(
      () => normalizeWhatsAppNumber("9876543210", "0000"),
      "INVALID_COUNTRY_CODE",
    );
    expectNumberError(() => normalizeWhatsAppNumber("123"), "INVALID_LENGTH");
    expectNumberError(
      () => normalizeWhatsAppNumber("+91 12345678901234"),
      "INVALID_LENGTH",
    );
  });
});

describe("WhatsApp handoff content", () => {
  it("builds the complete Pay Later message with compact optional fields", () => {
    const message = buildWhatsAppMessage({
      shopName: "  Chapega.com ",
      orderNumber: "GFT-20260810-1234",
      kioskName: " Main   Entrance ",
      customerName: "  Rahul   Sharma ",
      items: [
        {
          name: "Wooden Hamper",
          variant: "Initial Letter",
          quantity: 2,
          lineTotalPaise: 139_800,
        },
        {
          name: "Acrylic Magnet",
          quantity: 1,
          lineTotalPaise: 99_900,
        },
      ],
      giftWrapPaise: 2_500,
      totalPaise: 242_200,
      orderNote: " Collect   after 6 PM ",
    });

    expect(message).toContain("Hello Chapega.com,");
    expect(message).toContain("Order: GFT-20260810-1234");
    expect(message).toContain("1. Wooden Hamper / Initial Letter × 2 — ₹1,398.00");
    expect(message).toContain("2. Acrylic Magnet × 1 — ₹999.00");
    expect(message).toContain("Gift wrap: ₹25.00");
    expect(message).toContain("Total: ₹2,422.00");
    expect(message).toContain("Payment: Pay at Counter");
    expect(message).toContain("Kiosk: Main Entrance");
    expect(message).toContain("Customer: Rahul Sharma");
    expect(message).toContain("Note: Collect after 6 PM");
    expect(message).toMatch(/Please confirm availability\. I will pay later\.$/);
  });

  it("percent-encodes the exact message in a wa.me URL", () => {
    const message = "Order: GFT-20260810-1234\nGift: Frame & Hamper #1";
    const handoff = buildWhatsAppUrl({
      rawNumber: "09876543210",
      message,
    });
    const url = new URL(handoff);

    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/919876543210");
    expect(url.searchParams.get("text")).toBe(message);
    expect(handoff).toContain("%0A");
    expect(handoff).toContain("%26");
    expect(handoff).toContain("%23");
    expect(handoff).not.toContain(" ");
  });
});
