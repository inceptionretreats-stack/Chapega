import { describe, expect, it } from "vitest";

import { calculateCartTotals, formatInr, getCartLineTotalPaise } from "@/domain/money";

describe("Indian rupee money helpers", () => {
  it.each([
    [0, "₹0.00"],
    [100, "₹1.00"],
    [123_456, "₹1,234.56"],
    [123_456_789, "₹12,34,567.89"],
  ])("formats %i paise with Indian digit grouping", (paise, expected) => {
    expect(formatInr(paise)).toBe(expected);
  });

  it("rejects negative, fractional, and unsafe paise values", () => {
    expect(() => formatInr(-1)).toThrow(RangeError);
    expect(() => formatInr(1.5)).toThrow(RangeError);
    expect(() => formatInr(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it("charges gift wrap once per wrapped unit and returns frozen totals", () => {
    const items = [
      { quantity: 2, unitPricePaise: 49_900, giftWrapped: true },
      { quantity: 1, unitPricePaise: 10_000, giftWrapped: false },
      { quantity: 3, unitPricePaise: 5_000, giftWrapped: true },
    ] as const;

    expect(getCartLineTotalPaise(items[0])).toBe(99_800);

    const totals = calculateCartTotals(items, 2_500);

    expect(totals).toEqual({
      subtotalPaise: 124_800,
      giftWrapPaise: 12_500,
      totalPaise: 137_300,
    });
    expect(Object.isFrozen(totals)).toBe(true);
  });
});
