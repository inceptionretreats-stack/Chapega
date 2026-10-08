# Chapega Gift Atelier

## Direction

The active redesign is **Gift Atelier**: a light, architectural gift-shopping experience built from scratch. The only visual inheritance is the established ivory, blush, burgundy, and muted-gold palette. The floating selection dock remains the signature interaction because it is the one existing pattern explicitly retained.

Accepted concepts:

- `design/concepts/atelier/01-welcome.png`
- `design/concepts/atelier/02-catalogue.png`
- `design/concepts/atelier/03-checkout.png`
- `design/concepts/atelier/04-order-ready.png`
- `design/concepts/atelier/05-enhanced-catalogue.png`
- `design/concepts/atelier/06-enhanced-checkout.png`

Production art:

- `public/art/gift-atelier-hero.png`

The rejected Memory Gallery direction is not an implementation reference. Do not use scrapbook, handwriting, torn paper, stamps, ribbons, Polaroids, organic photo blobs, or dark surfaces.

## Composition

- Welcome: quiet wordmark header, editorial split hero, one architectural product scene, and a restrained four-stage journey rail.
- Catalogue: compact introduction, horizontal category rail, open product modules, and the elevated concierge-style selection dock.
- Cart, checkout, and review: a shared transaction shell with one linear stepper, an open primary workspace, and a sticky right summary derived from the selection dock.
- QR handoff: centered heading, one wide blush frame, a true-white QR zone, a connected instruction list, then timer and actions.
- Presenter and modals: the same lines, radii, fields, and surface logic; no independent visual theme.

## Color lock

| Role | Token | Value |
| --- | --- | --- |
| Main canvas | `--ivory` | `#fff9f2` |
| Elevated surface | `--paper` | `#ffffff` |
| Pale blush | `--blush-100` | `#fbe8e7` |
| Strong blush | `--blush-200` | `#f3d4d2` |
| Soft rose | `--rose` | `#ebc9c8` |
| Primary action | `--wine` | `#7a263a` |
| Primary hover | `--wine-deep` | `#5f182b` |
| Fine accent | `--gold` | `#c69b57` |
| Primary text | `--ink` | `#352a2d` |
| Muted text | `--muted` | `#766a67` |
| Standard line | `--line` | `#e8d8d1` |

Gold is an accent line, never body text or a large fill. Black is not a theme color; the QR modules are the single functional exception and remain black on true white for scan reliability.

## Typography

- Playfair Display: brand wordmark, large display headings, product names, and key totals.
- DM Sans: navigation, body copy, controls, fields, metadata, tables, statuses, and all action text.
- Welcome display: `clamp(4.15rem, 6.8vw, 7.1rem)` with tight line-height.
- Transaction display: `clamp(2.5rem, 4vw, 4rem)`.
- Body: 0.9–1.05rem at 1.5–1.65 line-height.
- Controls: 0.83–0.95rem, weight 700, minimum 44px target.
- No script or handwritten font is loaded.

## Geometry and spacing

- Page gutter: `clamp(20px, 4vw, 64px)`; main content max 1456px.
- Spacing rhythm: 4, 8, 12, 16, 20, 24, 32, 42, 48, 64, 76, 96.
- Controls: 12–15px radii.
- Media and panels: 20–30px radii.
- Signature architectural media: regular lower corners with a larger top-right corner.
- Selection dock: 30px desktop radius and soft wine-tinted elevation.
- Shadows appear only on the hero media, floating selection dock, sticky summary, QR frame, and modals.

## Component families

- `primary-button`: burgundy fill, white label, quiet lift on hover.
- `secondary-button` / `quiet-button`: warm-white surface and rose border.
- `field`: white/ivory control, rose border, burgundy focus ring.
- `product-card`: open layout; media supplies structure instead of an outer card.
- `transaction-summary`: shared cart/checkout/review summary family.
- `checkout-stepper`: one clean four-step line on every transaction screen.
- `cart-rail`: fixed desktop concierge tray; `mobile-cart-button` is its safe-area mobile counterpart.

## Responsive behavior

- Above 1180px: four product columns, full search header, desktop dock, sticky transaction summary.
- 901–1180px: three product columns, search on a second header row, compressed dock.
- 641–900px: two product columns, single-column transaction layout with summary promoted ahead of long form content, mobile selection capsule.
- 320–640px: one product column, contained horizontal category scrolling, single-column fields, 18px gutters, minimum 44px targets, scan-safe QR up to 320px.
- No root-level horizontal overflow. Scrollable category and table regions contain their own overflow.

## Motion and accessibility

- Controls: 180ms state transition.
- Product media: maximum 1.025 scale and 5px lift.
- Capacity meter: 240ms width transition.
- Never transform or animate the QR.
- Disable nonessential movement with `prefers-reduced-motion`.
- Burgundy on ivory and white on burgundy are the primary contrast pairs. Gold is decorative only.
- Preserve heading focus restoration, modal focus trap/Escape behavior, presenter return focus, progressbar semantics, visible focus rings, polite status announcements, and alert semantics.

## Behavior lock

The redesign does not change product data, prices, categories, cart limits, gift-wrap calculations, Pay Later behavior, order creation, QR/WhatsApp payloads, countdown, persistence, presenter configuration, tests, or privacy reset behavior. Original generated catalogue photography under `public/generated-products/` is the active visual source of truth.
