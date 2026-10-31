import type { Metadata } from "next";

import { ORDER_RETENTION_DAYS } from "@/domain/order-privacy";
import { formatWhatsAppNumber } from "@/domain/whatsapp";
import { DEFAULT_VENDOR_SLUG } from "@/server/vendor/database";
import { loadShopContact } from "../shop-contact";

// Reads the shop from ?shop= so the contact is that shop's WhatsApp number.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "How Chapega.com and the shop use the details you enter on the gift kiosk, and what Chapega.com keeps about shop teams: how long, and how to ask for deletion.",
};

type PageProps = Readonly<{
  searchParams: Promise<{ shop?: string | string[] }>;
}>;

export default async function PrivacyPage({ searchParams }: PageProps) {
  const contact = await loadShopContact((await searchParams).shop);
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

      <h2 id="shop-teams">Shop teams: Vendor Studio and the Chapega Studio app</h2>
      <p>
        This part is for shop owners, managers and staff who sign in to Vendor Studio or the Chapega
        Studio phone app. Chapega.com is responsible for these details too.
      </p>
      <h3>What we keep about you</h3>
      <ul>
        <li>
          Your name, email address and role in each shop. Your password is kept only as a scrambled
          value (a hash) that cannot be turned back into the password.
        </li>
        <li>
          Your sign-ins: when they started and, in the phone app, the phone’s model, system and app
          version. The app’s install number is kept only in scrambled form.
        </li>
        <li>
          What you change in the shop (products, settings, orders and the team), with the time. Your
          name appears in the timeline of each order you move forward.
        </li>
        <li>
          If you turn on new-order notifications, the address your phone receives them at (a push
          token).
        </li>
      </ul>
      <h3>Why</h3>
      <p>
        To let you sign in and keep your account secure, to show the shop who did what, and to send
        new-order alerts to your phone. We do not use these details for marketing or sell them.
      </p>
      <h3>Who receives them</h3>
      <ul>
        <li>The owner of your shop, who sees the team list and the order timelines.</li>
        <li>Chapega.com, which runs the service.</li>
        <li>
          Google (Firebase Cloud Messaging) and, on iPhones, Apple, only to deliver new-order
          alerts. An alert shows the order number, the total and the number of items, never a
          customer’s details.
        </li>
      </ul>
      <h3>How long we keep them</h3>
      <p>
        A sign-in in a browser ends after 30 minutes without use (12 hours at most), and in the
        phone app after 14 days without use (30 days at most). It is deleted a day after it ends,
        with that phone’s notification address. Your account is kept until you ask us to delete it;
        losing access to a shop does not delete it.
      </p>
      <h3>Your rights and deleting your account</h3>
      <p>
        You may ask to see, correct or erase the details we keep about you.{" "}
        <a href="/delete-account">Delete your Chapega account</a> explains how to ask and what is
        removed.
      </p>

      <p>
        <a className="text-button" href={kioskHref}>
          Back to the kiosk
        </a>
      </p>
    </main>
  );
}
