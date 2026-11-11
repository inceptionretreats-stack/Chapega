import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

// Read the public deletion address from the server environment at request time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Delete your account",
  description:
    "How shop owners, managers and staff ask Chapega.com to delete their Vendor Studio and Chapega Studio account, and what is removed.",
};

const deletionEmail = z.email().max(254);

export default function DeleteAccountPage() {
  const contact = deletionEmail.safeParse(process.env.CHAPEGA_ACCOUNT_DELETION_EMAIL?.trim());

  return (
    <main className="screen-page narrow privacy-page">
      <h1 className="screen-heading">Delete your Chapega account</h1>
      <p>
        This page is for shop owners, managers and staff who sign in to Vendor Studio or the Chapega
        Studio app. Customers who order at a kiosk have no account: the{" "}
        <a href="/privacy">privacy notice</a> explains how to have order details removed.
      </p>

      <h2>How to ask</h2>
      {contact.success ? (
        <ol>
          <li>
            Email{" "}
            <a href={`mailto:${encodeURIComponent(contact.data).replace("%40", "@")}`}>
              {contact.data}
            </a>{" "}
            with the subject “Delete my account”. Include the email address you sign in with and the
            shop you work for.
          </li>
          <li>We confirm the request with you before deleting anything.</li>
          <li>We delete your account within 30 days and tell you when it is done.</li>
        </ol>
      ) : (
        <p>
          The online request address is currently unavailable. Ask your shop owner for help with
          account deletion.
        </p>
      )}
      <p>
        {contact.success
          ? "You can also email this address to ask to see or correct your details. "
          : null}
        The <a href="/privacy#shop-teams">privacy notice</a> lists the data we keep about you.
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
        for any other shop. To sign out a lost phone, change your password to end every other
        sign-in.
      </p>

      <h2>Shop owners</h2>
      <p>
        If you are a shop’s only owner, arrange for someone to take over or for the shop to close
        before your account is deleted.
      </p>

      <p>
        <Link className="text-button" href="/" prefetch={false}>
          Back to Chapega.com
        </Link>
      </p>
    </main>
  );
}
