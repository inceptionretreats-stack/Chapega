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
      <p>Last updated: 31 October 2026.</p>
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
          WhatsApp, when you open the WhatsApp link to prepare your message. The link contains the
          recipient number and order text. You choose whether to tap Send; opening the link does not
          confirm that the shop received your message.
        </li>
        <li>
          Our hosting and storage providers, Vercel and Supabase, which process the service’s
          requests, records and images for us.
        </li>
      </ul>

      <h2>Technical information and security</h2>
      <p>
        The kiosk and Studio also process technical information about requests, such as IP
        addresses, request identifiers, the action requested, response status, timing and errors. We
        use it to protect sign-ins, limit abuse, investigate failures and operate the service. Our
        hosting and database providers process this information for those purposes too.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Your name, phone number and notes are removed from the order record {ORDER_RETENTION_DAYS}{" "}
        days after your order is completed or cancelled. If the shop never confirms the order, they
        are removed {ORDER_RETENTION_DAYS} days after you prepared it. An order that is still being
        prepared keeps them until it is finished. The gifts, amounts and order number are kept for
        the shop’s accounts.
      </p>
      <p>
        Automatic order cleanup runs daily at 03:45 UTC (09:15 in India). Details that have passed
        the retention period are removed at the next cleanup, rather than at the exact moment the
        period ends. An earlier verified deletion request can be handled by the shop.
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
          version. Our server stores only a hash of the app’s random install number; the phone keeps
          the original number in secure device storage.
        </li>
        <li>
          What you change in the shop (products, settings, orders and the team), with the time. Your
          name appears in the timeline of each order you move forward.
        </li>
        <li>
          If you turn on new-order notifications, the address your phone receives them at (a push
          token).
        </li>
        <li>
          Product photos, descriptions, prices and other catalogue content you save, and shop
          settings such as its WhatsApp number. Photos are uploaded only when you save them. The
          phone app removes camera metadata, including location tags, before upload; the server also
          removes metadata when preparing stored photos from the app or web Studio. Published
          catalogue content is visible to people using the shop’s kiosk.
        </li>
      </ul>
      <h3>Firebase and phone notifications</h3>
      <p>
        A version of the app configured for push includes Google’s Firebase Cloud Messaging and
        Firebase Installations libraries. These can process a Firebase installation ID (FID),
        notification token and technical metadata such as app and operating-system versions, phone
        model, Firebase library versions and the app installer. The FID is separate from Chapega’s
        own random install number. Firebase uses these records to provide and maintain messaging;
        its technical user-agent information also helps Google maintain and improve the service.
        Chapega registers your notification token for your account only after you turn push on.
      </p>
      <p>
        The app includes no advertising, analytics or crash-reporting library. Firebase still
        processes the identifiers and technical information described above. Its{" "}
        <a href="https://firebase.google.com/support/privacy">privacy and retention information</a>{" "}
        explains that processing.
      </p>
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
          Vercel and Supabase, which provide hosting, database and image storage for the service.
        </li>
        <li>
          Google (Firebase Cloud Messaging) and, on iPhones, Apple, to deliver new-order alerts and
          operate their notification services. An alert shows the order number, the total and the
          number of items, never a customer’s details.
        </li>
        <li>
          An external app you choose to open: Call and WhatsApp pass the customer’s number to the
          dialler or WhatsApp. Copying or sharing newly issued team credentials passes those details
          to the clipboard or the app you choose. These transfers happen when you select those
          actions.
        </li>
      </ul>
      <h3>How long we keep them</h3>
      <p>
        A sign-in in a browser ends after 30 minutes without use (12 hours at most), and in the
        phone app after 14 days without use (30 days at most). Expired sign-in records are removed
        by the daily 03:15 UTC cleanup once they have been expired for more than a day, with that
        phone’s notification address. Signing out or revoking a session removes its record earlier.
        Your account is kept until you ask us to delete it; losing access to a shop does not delete
        it.
      </p>
      <p>
        The shop keeps its products, photos, order history and record of changes. Account deletion
        removes your account and sign-ins; the deletion procedure also removes your name from
        attributable order timeline entries. Change records retain an internal account number after
        the account it referred to has been removed. Content you published for the shop can remain,
        so identify any personal information in that content when you ask for deletion.
      </p>
      <p>
        Temporary abuse-protection records are cleared on later security checks after their
        retention window expires. Operational logs and provider backups are separate from live
        account and order records and follow the providers’ retention rules. Deleting a live record
        does not immediately erase every log or backup copy. Removing a push registration from
        Chapega also does not itself delete Google’s separate Firebase installation record;
        Firebase’s retention rules apply to that identifier.
      </p>
      <h3>On your phone and in transit</h3>
      <p>
        The phone app uses HTTPS to communicate with the service. It keeps the sign-in token and its
        random install number in secure device storage; theme and alert preferences stay on the
        phone. Downloaded customer names, phone numbers, notes and orders stay in memory and are
        cleared when you sign out, rather than being saved in an offline order database.
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
