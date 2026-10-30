import type { Metadata } from "next";

import { ORDER_RETENTION_DAYS } from "@/domain/order-privacy";
import { formatWhatsAppNumber, normalizeWhatsAppNumber } from "@/domain/whatsapp";
import { DEFAULT_VENDOR_SLUG } from "@/server/vendor/database";
import { loadKioskShop } from "../kiosk/shop-status";

// Reads the shop from ?shop= so the contact is that shop's WhatsApp number.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "How Chapega.com and the shop use the details you enter on the gift kiosk, how long they are kept, and how to ask for them to be deleted.",
};

type PageProps = Readonly<{
  searchParams: Promise<{ shop?: string | string[] }>;
}>;

type ShopContact = Readonly<{
  slug: string;
  shopName: string;
  whatsAppDigits: string;
}>;

async function shopContact(rawShop: string | string[] | undefined): Promise<ShopContact | null> {
  const candidate = Array.isArray(rawShop) ? rawShop[0] : rawShop;
  if (!candidate) return null;
  const shop = await loadKioskShop(candidate);
  if (shop.status !== "ok") return null;
  const { settings, vendor } = shop.bootstrap;
  try {
    return {
      slug: vendor.slug,
      shopName: settings.shopName,
      whatsAppDigits: normalizeWhatsAppNumber(
        settings.ownerWhatsAppNumber,
        settings.defaultCountryCode,
      ),
    };
  } catch {
    return null;
  }
}

export default async function PrivacyPage({ searchParams }: PageProps) {
  const contact = await shopContact((await searchParams).shop);
  const shop = contact?.shopName ?? "the shop";
  // A full page load, not client navigation: the kiosk then applies its
  // freshness rule instead of restoring the previous customer's screen.
  const kioskHref =
    contact && contact.slug !== DEFAULT_VENDOR_SLUG
      ? `/kiosk/${encodeURIComponent(contact.slug)}`
      : "/";

  return (
    <main className="screen-page narrow privacy-page">
      <h1 className="screen-heading">Privacy notice</h1>
      <p>
        <strong>Chapega.com</strong> runs this gift kiosk and is responsible for the details you
        enter on it. Your order goes to {contact ? <strong>{shop}</strong> : shop}, which prepares
        it. This notice explains how your details are used. It is written with India’s Digital
        Personal Data Protection Act, 2023 (DPDP Act) in mind.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your name (optional).</li>
        <li>Your phone number (optional).</li>
        <li>A gift note for the recipient (optional).</li>
        <li>An order note for the shop (optional).</li>
        <li>Your order items: the gifts you chose, quantities and gift wrap.</li>
      </ul>

      <h2>Why we collect it</h2>
      <p>
        Only to prepare and fulfil your order through the shop’s WhatsApp. We do not use these
        details for marketing or sell them. You can leave the optional fields empty and still place
        an order.
      </p>

      <h2>Who receives it</h2>
      <ul>
        <li>
          {contact ? shop : "The shop"}, which receives your order and the details you entered so it
          can prepare it.
        </li>
        <li>Chapega.com, which runs the kiosk and keeps the order record for the shop.</li>
        <li>
          WhatsApp, only when you tap Send in WhatsApp. Nothing is sent to WhatsApp until you do.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Your name, phone number and notes are removed from the order record {ORDER_RETENTION_DAYS}{" "}
        days after your order is completed or cancelled. If the shop never confirms the order, they
        are removed {ORDER_RETENTION_DAYS} days after you prepared it. An order that is still being
        prepared keeps them until it is finished. The gifts, amounts and order number are kept for
        the shop’s accounts.
      </p>
      <p>The kiosk screen clears your details from the screen after a short time of inactivity.</p>

      <h2>Your rights and how to ask for deletion</h2>
      <p>
        Under the DPDP Act you may ask to see the data held about you, have it corrected, or have it
        erased, and you may withdraw your consent at any time.
      </p>
      {contact ? (
        <p>
          To make a request, message {shop} on WhatsApp at{" "}
          <a
            href={`https://wa.me/${contact.whatsAppDigits}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {formatWhatsAppNumber(contact.whatsAppDigits)}
          </a>
          .
        </p>
      ) : (
        <p>To make a request, message the shop on the WhatsApp number your order was sent to.</p>
      )}
      <p>
        Include your order number (it starts with GFT-) or the phone number you entered. Messages
        you already sent stay in your WhatsApp chat with the shop; ask the shop to delete that chat
        too.
      </p>

      <p>
        <a className="text-button" href={kioskHref}>
          Back to the kiosk
        </a>
      </p>
    </main>
  );
}
