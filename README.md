# Chapega.com

A touchscreen-friendly kiosk for browsing supplied products, building an order of up to five units, choosing **Pay Later / Pay at Counter**, and handing the exact order to a shop owner through a WhatsApp Click-to-Chat QR code.

This frontend-only phase prepares a WhatsApp message but never claims that the message was sent automatically: the customer must review it and tap **Send** in WhatsApp.

## Implemented features

- Premium responsive flow for kiosk, laptop, tablet, and phone layouts
- 24 supplied products across Gift Hampers, Personalized Gifts, Photo Frames, Resin Art, and Varmala Preservation
- Product search, data-driven category filtering, availability states, details, and comparison pricing
- Cart quantities, stock checks, optional gift wrap, integer-paise totals, and a hard five-unit limit
- Optional customer name, mobile number, gift note, and order note
- Pay Later / Pay at Counter review flow and local `GFT-YYYYMMDD-NNNN` order numbers
- Validated WhatsApp number normalization, including Indian 10-digit numbers
- Per-order `wa.me` URL, message preview, scannable QR, direct-open link, and copy-message fallback
- QR privacy countdown, pause control, clean-session reset, and manual approval summary
- Presenter Settings, first-use setup, redacted recent-order history, online/offline feedback, and recovery states
- Unit tests for cart, money, order, and WhatsApp logic, plus a Playwright critical-flow test

Product names, prices, descriptions, and categories were transcribed from the 28 supplied `WhatsApp Image … .jpeg` files in the project root. The 24 complete product-detail screenshots are copied under `public/products/` with clean filenames and referenced from `data/catalogue.ts`; four catalogue-overview screenshots remain untouched as source references. The original 28 supplied files are preserved exactly.

## Architecture

The application is a single Next.js App Router page with a client-side kiosk screen flow. There are no API routes or production services in this phase.

```text
app/                 App Router entry, metadata, global styles, and route states
components/          Welcome, catalogue, cart, checkout, review, QR, and presenter UI
data/                Supplied catalogue and derived category metadata
domain/              Pure cart, INR money, order, and WhatsApp utilities
store/               Zustand state, validation, hydration, and browser persistence
types/               Shared kiosk and order types
public/              Local copies of supplied product screenshots
tests/unit/           Vitest domain tests
tests/e2e/            Playwright welcome-to-QR critical flow
design/               Design-system notes
```

`domain/` owns the business rules; `store/kiosk-store.ts` coordinates UI state and browser storage; components render the screens. Prices are kept in integer paise. The final QR is rendered from the current order's exact WhatsApp URL, not from a saved QR asset.

## Local setup

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To open settings directly, use [http://localhost:3000/?presenter=1](http://localhost:3000/?presenter=1).

The kiosk requires no secret or backend configuration. `.env.example` contains only public defaults. If you copy it to `.env.local`, never place private keys or sensitive data in a `NEXT_PUBLIC_` variable because those values are exposed to the browser. The owner's phone number should be entered in Presenter Settings instead.

## Presenter Settings and the real owner number

On first use, the setup dialog asks for the shop name and owner WhatsApp number. You can also use the gear button or visit `/?presenter=1` to configure:

- Shop and kiosk names
- Owner WhatsApp number and default country code
- Maximum cart quantity from 1 to 5 (the application never permits more than 5)
- Gift-wrap fee
- QR reset timeout
- Preview-label visibility

For an Indian owner, entering `9876543210`, `+91 98765 43210`, or the digits-only international form saves the normalized destination as `919876543210`. Use **Test WhatsApp link** to confirm the destination. Settings are saved only for the current browser and site origin, so configure them again for a different browser, device, domain, or Vercel preview URL. After configuring through `?presenter=1`, return to the site root to run the customer flow.

### When the real WhatsApp details arrive

Provide the shop owner's **WhatsApp-enabled phone number with country code**, then enter it in Presenter Settings. A WhatsApp **My Code** contact QR (`wa.me/qr/...`) only opens or adds that contact; it does not carry the changing order text, so a static QR image is neither required nor consumed by this project.

Each prepared order contains different items, quantities, prices, notes, total, kiosk name, and order number. The app therefore generates a new QR for every order from:

```text
https://wa.me/<normalized-owner-number>?text=<encoded-current-order-message>
```

Do not replace the generated QR with a supplied QR image; that would lose the per-order message and weaken the approval proof.

## Quality commands

```bash
npm run typecheck  # TypeScript, no emitted files
npm run lint       # ESLint across app, domain, store, and tests
npm test           # Vitest unit suite, one run
npm run build      # Next.js production build
```

For the browser flow, install Playwright's Chromium once and run:

```bash
npx playwright install chromium
npm run test:e2e
```

`test:e2e` starts or reuses the local Next.js server and verifies the five-unit flow, order creation, generated `wa.me` data, QR rendering, and clean-session reset. It cannot prove that a physical phone opens WhatsApp or that the owner receives the message; use the acceptance procedure below.

## Browser storage and reset behavior

| Browser storage | Key | Contents and lifetime |
| --- | --- | --- |
| `localStorage` | `gift-kiosk-presenter-settings` | Normalized presenter settings; preserved across sessions |
| `localStorage` | `gift-kiosk-orders` | Up to 20 redacted order summaries; no customer name, phone, notes, or item details |
| `localStorage` | `gift-kiosk-setup-dismissed-v2` | Whether the first-use setup dialog was dismissed |
| `localStorage` | `gift-kiosk-catalogue-revision` | Non-personal marker used once to discard data from the removed seeded catalogue |
| `sessionStorage` | `gift-kiosk-active-session` | Current screen, filters, cart, optional customer data, prepared order, and countdown |

**Start new order**, the QR timeout, and **Reset active session** clear the active cart, customer details, current order, search/filter state, and session-storage key. Presenter settings and redacted order history remain. **Clear order history** removes only the history key. **Reset all local data** removes the customer/settings keys and restores the first-use setup; clearing all site data in the browser has the same effect. On the first load of this supplied catalogue, the revision marker automatically discards any cart, order, or settings left by the removed seeded catalogue.

Pausing the QR countdown is intentionally not restored after a reload; the countdown resumes to avoid leaving customer details on a public kiosk indefinitely. If browser storage is unavailable, the app can continue in memory but the data may disappear when the page closes.

## Physical-phone WhatsApp acceptance test

Automated browser tests are not a substitute for this final approval check.

1. Keep the owner's phone visible with WhatsApp or WhatsApp Business active.
2. In Presenter Settings, save the real owner number and use **Test WhatsApp link** to verify the destination.
3. On the kiosk, select one or more products, review quantities and totals, choose Pay at Counter, and create the order.
4. Scan the displayed QR with a separate physical phone. If camera scanning is unavailable, use **Open WhatsApp** on a suitable device; it uses the same URL.
5. Confirm that the correct owner chat opens and the draft contains the displayed order number, gift names, variants, quantities, prices, gift-wrap total, grand total, payment method, kiosk name, and entered notes.
6. Tap **Send** manually on the scanning phone. QR display or scanning alone does not send anything.
7. Confirm receipt by viewing the message on the owner's phone. Only then mark owner receipt in the approval summary.
8. Tap **Start new order** and verify that the welcome screen returns and the previous cart/customer session is gone.

Record the test phone OS, WhatsApp app type, destination-number result, message-content result, manual-send result, and observed owner receipt. Test the final deployed URL again before the approval meeting.

## Deploy to Vercel

Run the production check first:

```bash
npm run build
npx vercel
```

Alternatively, import the repository in Vercel and use the detected Next.js settings. No secret environment variables or database are required. After deployment:

1. Open the final HTTPS URL with `?presenter=1` on the presentation browser.
2. Save the real shop and WhatsApp details for that deployed origin.
3. Return to the root URL and complete the physical-phone acceptance test.
4. Verify local product images, direct page loading, the exact `wa.me` destination, and the manual owner receipt.

Do not put the owner's number in a public environment variable unless the owner explicitly wants it bundled into the public app. Presenter Settings is the intended configuration path.

## Current limitations

- Products, prices, and descriptions are static data transcribed from the supplied screenshots; nothing is reserved.
- The current product media are catalogue screenshots and may contain source-app chrome or text. Replace them with original product photographs when available for cleaner crops.
- Orders and settings exist only in the current browser. There is no shared database, server reconciliation, or guaranteed globally unique order sequence.
- Pay at Counter is a workflow choice, not an online payment or reservation confirmation.
- WhatsApp Click-to-Chat opens a pre-filled draft. It cannot auto-send, verify delivery, or confirm owner receipt.
- The scanning phone needs a compatible camera/browser, internet access, and WhatsApp or WhatsApp Web.
- There are no customer accounts, staff authentication, admin product tools, invoices, printers, analytics, or delivery integrations.
- Browser storage is suitable for an attended kiosk preview, not for production handling of personal information.

## Production roadmap

1. Add a secured database for products, categories, settings, kiosks, orders, order items, and audit logs.
2. Move pricing, stock validation, idempotency, and order-number generation to a server-authoritative order API.
3. Add staff authentication, an order dashboard, confirmation and preparation statuses, inventory tools, and product management.
4. Add optional UPI or gateway payments, keeping any payment QR visually distinct from the WhatsApp order QR.
5. Integrate the WhatsApp Business Platform for approved templates, inbound-message matching, status webhooks, and pickup notifications.
6. Add production privacy controls, retention rules, monitoring, accessibility/device testing, and multi-kiosk operations.
