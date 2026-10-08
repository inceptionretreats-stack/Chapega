import type { Metadata } from "next";
import Link from "next/link";

// Not indexed until the shop owner has approved the wording.
export const metadata: Metadata = {
  title: "Privacy notice (draft)",
  description: "How this gift kiosk uses the details you enter.",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <main className="screen-page narrow privacy-page">
      <div className="offline-notice" role="note">
        <strong>Draft — awaiting review.</strong> This text is a working draft and is not yet
        approved by the shop owner or a legal adviser.
      </div>
      <h1 className="screen-heading">Privacy notice</h1>
      <p>
        This notice explains how <strong>[BUSINESS NAME: from owner]</strong> (“the shop”) uses the
        details you enter on this gift kiosk. It is written with India’s Digital Personal Data
        Protection Act, 2023 (DPDP Act) in mind.
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
          The shop, which receives your order and the details you entered so it can prepare it.
        </li>
        <li>
          WhatsApp, only when you tap Send in WhatsApp. Nothing is sent to WhatsApp until you do.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <p>[RETENTION PERIOD: decided by the shop owner]</p>
      <p>The kiosk screen clears your details from the screen after a short time of inactivity.</p>

      <h2>Your rights and how to ask for deletion</h2>
      <p>
        Under the DPDP Act you may ask to see the data held about you, have it corrected, or have it
        erased, and you may withdraw your consent at any time. To make a request, contact: [CONTACT:
        from the shop owner]
      </p>

      <p>
        <Link className="text-button" href="/">
          Back to the kiosk
        </Link>
      </p>
    </main>
  );
}
