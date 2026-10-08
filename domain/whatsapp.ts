import { formatInr } from "@/domain/money";

export type WhatsAppNumberErrorCode =
  | "NUMBER_REQUIRED"
  | "INVALID_COUNTRY_CODE"
  | "INVALID_LENGTH";

export class WhatsAppNumberError extends Error {
  readonly code: WhatsAppNumberErrorCode;

  constructor(code: WhatsAppNumberErrorCode, message: string) {
    super(message);
    this.name = "WhatsAppNumberError";
    this.code = code;
  }
}

export type WhatsAppItem = Readonly<{
  name: string;
  variant?: string | null;
  quantity: number;
  lineTotalPaise: number;
}>;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeWhatsAppNumber(
  rawNumber: string,
  defaultCountryCode = "91",
): string {
  const digits = digitsOnly(rawNumber).replace(/^0+/, "");
  const countryCode = digitsOnly(defaultCountryCode).replace(/^0+/, "");

  if (!digits) {
    throw new WhatsAppNumberError(
      "NUMBER_REQUIRED",
      "Owner WhatsApp number is required.",
    );
  }

  if (digits.length < 10 || digits.length > 15) {
    throw new WhatsAppNumberError(
      "INVALID_LENGTH",
      "Enter a valid WhatsApp number with 10 to 15 digits.",
    );
  }

  if (countryCode.length < 1 || countryCode.length > 3) {
    throw new WhatsAppNumberError(
      "INVALID_COUNTRY_CODE",
      "Enter a valid one-to-three digit country code.",
    );
  }

  if (countryCode === "91") {
    const nationalNumber =
      digits.length === 10
        ? digits
        : digits.length === 12 && digits.startsWith("91")
          ? digits.slice(2)
          : digits.length === 13 && digits.startsWith("910")
            ? digits.slice(3)
            : "";

    if (!/^[6-9]\d{9}$/.test(nationalNumber)) {
      throw new WhatsAppNumberError(
        "INVALID_LENGTH",
        "Enter a valid 10-digit Indian mobile number, with or without country code 91.",
      );
    }

    return `91${nationalNumber}`;
  }

  let normalized: string;
  if (digits.startsWith(countryCode)) {
    normalized = digits;
  } else {
    normalized = `${countryCode}${digits}`;
  }

  if (normalized.length < 10 || normalized.length > 15) {
    throw new WhatsAppNumberError(
      "INVALID_LENGTH",
      "Enter a valid WhatsApp number with 10 to 15 digits including country code.",
    );
  }

  return normalized;
}

export function maskWhatsAppNumber(
  rawNumber: string,
  visibleDigits = 4,
): string {
  const digits = digitsOnly(rawNumber);
  if (!digits) {
    return "Not configured";
  }

  const visible = Math.max(1, Math.min(4, Math.floor(visibleDigits)));
  const suffix = digits.slice(-visible);
  const hiddenCount = Math.max(4, digits.length - suffix.length);
  return `${"•".repeat(hiddenCount)}${suffix}`;
}

// Bidi embedding/override (U+202A-202E) and isolate (U+2066-2069) controls can
// visually reorder the shop owner's WhatsApp text, so they are dropped.
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/g;
// C0 and C1 controls other than tab/LF/CR (which \s collapses), including NEL.
const OTHER_CONTROLS = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g;
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Removes invisible/unsafe characters and makes the string URL-encodable. */
function sanitizeText(value: string): string {
  return value
    .replace(LONE_SURROGATE, "�")
    .replace(BIDI_CONTROLS, "")
    .replace(OTHER_CONTROLS, " ");
}

function compactText(value: string): string {
  return sanitizeText(value).replace(/\s+/g, " ").trim();
}

export function buildWhatsAppMessage(input: {
  shopName: string;
  orderNumber: string;
  kioskName: string;
  customerName?: string;
  items: readonly WhatsAppItem[];
  giftWrapPaise: number;
  totalPaise: number;
  giftNote?: string;
  orderNote?: string;
}): string {
  const shopName = compactText(input.shopName) || "Chapega.com";
  const orderNumber = compactText(input.orderNumber);
  const kioskName = compactText(input.kioskName) || "Main Entrance";

  if (!orderNumber) {
    throw new Error("An order number is required to build the WhatsApp message.");
  }

  if (input.items.length === 0) {
    throw new Error("At least one gift is required to build the WhatsApp message.");
  }

  const itemLines = input.items.map((item, index) => {
    const name = compactText(item.name);
    const variant = item.variant ? ` / ${compactText(item.variant)}` : "";
    return `${index + 1}. ${name}${variant} × ${item.quantity} — ${formatInr(
      item.lineTotalPaise,
    )}`;
  });

  const customerName = input.customerName
    ? compactText(input.customerName)
    : "";
  const orderNote = input.orderNote ? compactText(input.orderNote) : "";
  const giftNote = input.giftNote ? compactText(input.giftNote) : "";
  const optionalLines = [
    customerName ? `Customer: ${customerName}` : null,
    giftNote ? `Gift note: ${giftNote}` : null,
    orderNote ? `Note: ${orderNote}` : null,
  ].filter((line): line is string => Boolean(line));

  return [
    `Hello ${shopName},`,
    "",
    "I selected these gifts on your kiosk:",
    "",
    `Order: ${orderNumber}`,
    ...itemLines,
    "",
    `Gift wrap: ${formatInr(input.giftWrapPaise)}`,
    `Total: ${formatInr(input.totalPaise)}`,
    "Payment: Pay at Counter",
    `Kiosk: ${kioskName}`,
    ...optionalLines,
    "",
    "Please confirm availability. I will pay later.",
  ].join("\n");
}

export function buildWhatsAppUrl(input: {
  rawNumber: string;
  defaultCountryCode?: string;
  message: string;
}): string {
  const message = sanitizeText(input.message).trim();
  if (!message) {
    throw new Error("A WhatsApp order message is required.");
  }

  const phone = normalizeWhatsAppNumber(
    input.rawNumber,
    input.defaultCountryCode ?? "91",
  );

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
