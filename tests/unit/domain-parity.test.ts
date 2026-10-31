import { afterEach, describe, expect, it, vi } from "vitest";
import vectors from "../parity/domain-vectors.json";
import { formatInr } from "@/domain/money";
import { REQUEST_REDACTION_MESSAGE, RETENTION_REDACTION_MESSAGE } from "@/domain/order-privacy";
import { generateTemporaryPassword } from "@/domain/team";
import {
  canTransitionVendorOrder,
  getNextVendorOrderStatus,
  VENDOR_ORDER_LABELS,
} from "@/domain/vendor";
import {
  formatWhatsAppNumber,
  maskWhatsAppNumber,
  normalizeWhatsAppNumber,
  WhatsAppNumberError,
} from "@/domain/whatsapp";
import { relativeVendorTime } from "@/components/vendor/vendor-shared";
import type { VendorOrderStatus } from "@/types/vendor";

// The Flutter app ports these rules to Dart; mobile/test/domain/parity_test.dart
// checks the same vectors, so a change on either side fails a test.

describe("domain rules shared with the Chapega Studio app", () => {
  afterEach(() => vi.useRealTimers());

  it.each(vectors.formatInr)("formats %i paise as %s", (paise, expected) => {
    expect(formatInr(paise as number)).toBe(expected);
  });

  it.each(vectors.normalizeWhatsAppNumber.valid)(
    "normalizes %s (country %s) to %s",
    (raw, countryCode, expected) => {
      expect(normalizeWhatsAppNumber(raw, countryCode)).toBe(expected);
    },
  );

  it.each(vectors.normalizeWhatsAppNumber.invalid)(
    "refuses %s (country %s) with %s",
    (raw, countryCode, code) => {
      let caught: unknown;
      try {
        normalizeWhatsAppNumber(raw, countryCode);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(WhatsAppNumberError);
      expect((caught as WhatsAppNumberError).code).toBe(code);
    },
  );

  it.each(vectors.formatWhatsAppNumber)("shows %s as %s", (raw, expected) => {
    expect(formatWhatsAppNumber(raw)).toBe(expected);
  });

  it.each(vectors.maskWhatsAppNumber)("masks %s as %s", (raw, expected) => {
    expect(maskWhatsAppNumber(raw)).toBe(expected);
  });

  it("labels and orders statuses the same way", () => {
    expect(VENDOR_ORDER_LABELS).toEqual(vectors.orderLabels);
    for (const [status, next] of Object.entries(vectors.nextOrderStatus)) {
      expect(getNextVendorOrderStatus(status as VendorOrderStatus)).toBe(next);
    }
    for (const [from, to, allowed] of vectors.orderTransitions) {
      expect(
        canTransitionVendorOrder(from as VendorOrderStatus, to as VendorOrderStatus),
        `${from} → ${to}`,
      ).toBe(allowed);
    }
  });

  it.each(vectors.relativeVendorTimeMinutes)("%i minutes ago reads %s", (minutes, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    const then = new Date(Date.now() - (minutes as number) * 60_000).toISOString();
    expect(relativeVendorTime(then)).toBe(expected);
  });

  it("generates temporary passwords in the shared format", () => {
    const pattern = new RegExp(vectors.temporaryPassword.pattern);
    for (let index = 0; index < 50; index += 1) {
      expect(generateTemporaryPassword()).toMatch(pattern);
    }
  });

  it("writes the same customer-details removal messages", () => {
    expect(RETENTION_REDACTION_MESSAGE).toBe(vectors.redactionMessages.retention);
    expect(REQUEST_REDACTION_MESSAGE).toBe(vectors.redactionMessages.request);
  });
});
