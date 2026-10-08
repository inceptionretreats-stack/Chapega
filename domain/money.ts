import type { CartLine, CartTotals } from "@/types/kiosk";

function assertPaise(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${fieldName} must be a non-negative integer in paise.`);
  }
}

export function formatInr(paise: number): string {
  assertPaise(paise, "Amount");

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function getCartLineTotalPaise(line: Pick<CartLine, "quantity" | "unitPricePaise">): number {
  assertPaise(line.unitPricePaise, "Unit price");

  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
    throw new RangeError("Cart quantity must be a positive integer.");
  }

  const lineTotalPaise = line.unitPricePaise * line.quantity;
  assertPaise(lineTotalPaise, "Cart line total");
  return lineTotalPaise;
}

export function calculateCartTotals(
  items: readonly Pick<CartLine, "quantity" | "unitPricePaise" | "giftWrapped">[],
  giftWrapFeePaise: number,
): CartTotals {
  assertPaise(giftWrapFeePaise, "Gift-wrap fee");

  let subtotalPaise = 0;
  let giftWrapPaise = 0;

  for (const item of items) {
    subtotalPaise += getCartLineTotalPaise(item);
    if (item.giftWrapped) {
      giftWrapPaise += giftWrapFeePaise * item.quantity;
    }
  }

  assertPaise(subtotalPaise, "Cart subtotal");
  assertPaise(giftWrapPaise, "Gift-wrap total");

  const totalPaise = subtotalPaise + giftWrapPaise;
  assertPaise(totalPaise, "Cart total");

  return Object.freeze({
    subtotalPaise,
    giftWrapPaise,
    totalPaise,
  });
}
