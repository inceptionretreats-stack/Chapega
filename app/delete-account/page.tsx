import type { Metadata } from "next";
import Link from "next/link";

import { formatWhatsAppNumber } from "@/domain/whatsapp";
import { DEFAULT_VENDOR_SLUG } from "@/server/vendor/database";
import { loadShopContact } from "../shop-contact";

// Shows Chapega.com's current WhatsApp number from its shop settings.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Delete your account",
  description:
    "How shop owners, managers and staff ask Chapega.com to delete their Vendor Studio and Chapega Studio account, and what is removed.",
};

/**
 * The account-deletion page the app stores link to. Requests go to
 * Chapega.com on WhatsApp; the procedure is in docs/RUNBOOK.md ("A shop team
 * member asks to delete their account").
 */
export default async function DeleteAccountPage() {
  const contact = await loadShopContact(DEFAULT_VENDOR_SLUG);

  return (
    <main className="screen-page narrow privacy-page">
      <h1 className="screen-heading">Delete your Chapega account</h1>
      <p>
        This page is for shop owners, managers and staff who sign in to Vendor Studio or the Chapega
        Studio app. Customers who order at a kiosk have no account: the{" "}
        <a href="/privacy">privacy notice</a> explains how to have order details removed.
      </p>

      <h2>How to ask</h2>
      <ol>
        <li>
          {contact ? (
            <>
              Message Chapega.com on WhatsApp at{" "}
              <a
                href={`https://wa.me/${contact.whatsAppDigits}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                {formatWhatsAppNumber(contact.whatsAppDigits)}
              </a>
              .
            </>
          ) : (
            <>Message Chapega.com on WhatsApp, at the number shown on the Chapega.com kiosk.</>
          )}{" "}
          Write “Delete my account”, with the email address you sign in with and the shop you work
          for.
        </li>
        <li>We confirm the request with you before deleting anything.</li>
        <li>We delete your account within 30 days and tell you when it is done.</li>
      </ol>
      <p>
        You can ask to see or correct the details we keep about you the same way. The{" "}
        <a href="/privacy#shop-teams">privacy notice</a> lists them.
      </p>

      <h2>What is deleted</h2>
      <ul>
        <li>Your account: your name, email address and password.</li>
        <li>
          Every sign-in, in browsers and on phones, with each phone’s address for notifications.
        </li>
        <li>
          Your name in the timelines of your shops’ orders, which becomes “Former team member”.
        </li>
      </ul>

      <h2>What the shop keeps</h2>
      <p>
        Orders, products and photos you worked on stay with the shop, without your name. The shop’s
        record of changes keeps an internal account number that no longer leads to you.
      </p>

      <h2>Only leaving one shop?</h2>
      <p>
        Ask the shop’s owner to remove your access (Team, then Remove access). Your account stays
        for any other shop, and you can still ask us to delete it later. To sign out a lost phone,
        change your password: every other sign-in ends.
      </p>

      <h2>Shop owners</h2>
      <p>
        If you are a shop’s only owner, tell us who should take over the shop, or that it should
        close, when you ask.
      </p>

      <p>
        <Link className="text-button" href="/" prefetch={false}>
          Back to Chapega.com
        </Link>
      </p>
    </main>
  );
}
