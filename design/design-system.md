# Chapega.com kiosk design system

## Source material

- The 28 root-level `WhatsApp Image … .jpeg` files are the supplied catalogue reference.
- Twenty-four complete product-detail screenshots are copied under `public/products/` for the active catalogue.
- Product records, prices, and derived categories live in `data/catalogue.ts`.

## Tokens

- Background: warm ivory `#FFF9F2`
- Primary rose surface: `#FBE8E7`
- Action and display accent: deep burgundy `#7A263A`
- Secondary accent: muted gold `#C89B5B`
- Primary text: warm charcoal `#2D2926`
- Availability: soft green `#DFF3E6`
- WhatsApp green: `#25D366`, reserved for WhatsApp actions
- QR background: true white `#FFFFFF`
- Radii: 12, 18, 24, and 32px; controls use at least 48px touch height
- Content typography: DM Sans; editorial display typography: Playfair Display
- Icons: Lucide rounded outline, normally 1.75–2px stroke

The container model is open editorial layout plus one persistent cart rail. Product media currently uses the supplied catalogue screenshots and should be replaced with original product photography when available. Avoid nested card grids, glass, color overlays on product media, and green outside the WhatsApp handoff.

## Allowed first-viewport copy

Welcome:

- `Chapega.com`
- optional `Approval preview`
- `Find the Perfect Gift`
- `Choose up to 5 gifts and send your order to us on WhatsApp.`
- `Start Shopping`
- `Presenter settings`

Catalogue:

- `Chapega.com`
- `Search gifts, occasions or recipients`
- `Find something they’ll remember.`
- `Personalized frames, hampers, resin art, and wedding keepsakes.`
- `Explore gifts`
- the five supplied catalogue category labels
- `Our products`
- `Maximum 5 gifts per order`

QR handoff:

- `Your order is ready to send`
- `Scan the QR with your phone. WhatsApp will open with your selected gifts—review the message and tap Send.`
- `Message prepared. Complete the final step in WhatsApp.`
- the supplied three scan instructions and action labels

## Motion

- Product cards lift by 3px and image scale stays below 1.03.
- Cart progress and quantity changes use short 150–180ms transitions.
- QR is never transformed, animated, obscured, or tinted.
- `prefers-reduced-motion` disables nonessential transitions.
