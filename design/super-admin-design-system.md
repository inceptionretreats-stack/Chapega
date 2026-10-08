# Chapega Platform Admin design specification

Source concepts:

- `design/concepts/super-admin-desktop.png` (1440 × 1000 desktop reference)
- `design/concepts/super-admin-mobile.png` (390 × 844 mobile reference)

## Product surface

The platform admin is a light, premium operations dashboard for supervising independent vendor businesses. It extends the existing Chapega visual language; it is not a separate dark enterprise theme.

The primary workflow is: sign in as a platform administrator → scan platform totals → search/filter vendors → open a vendor → create or suspend a vendor → inspect platform orders and accounts → sign out.

## Visible copy lock

First viewport copy is limited to:

- `Chapega.com`
- `PLATFORM ADMIN`
- `Platform overview`
- `Monitor every vendor, storefront, and order from one place.`
- `Overview`, `Vendors`, `Orders`, `Accounts`
- `Add vendor`
- `Total vendors`, `Active stores`, `Orders`, `Products`
- `Search vendors`, `All statuses`
- Table labels: `Vendor`, `Owner`, `Store status`, `Products`, `Orders`, `Last activity`
- `Recent platform activity`
- `Super admin`, `Sign out`

Mobile may shorten `Total vendors` to `Vendors` and `Active stores` to `Active`. Empty, loading, validation, and confirmation copy may be added only where the workflow requires it.

## Tokens

- Page background: ivory `#fff9f2`
- Raised surface: white `#ffffff`
- Soft surface: blush `#fbe8e7`
- Strong blush: `#f3d4d2`
- Primary: burgundy `#7a263a`
- Display text: deep burgundy `#5f182b`
- Body text: warm charcoal `#352a2d`
- Muted text: `#736963`
- Detail/divider: antique gold `#c89b5b` / soft gold `#ead4af`
- Border: `#e5d5ca`
- Open/healthy: `#25683d` on `#dff3e6`
- Paused: warm amber on pale amber
- Suspended: burgundy/red on pale rose
- Shadows reuse `--shadow-sm` and `--shadow-md`; no black shadows.
- Radii use 9px controls, 12–18px panels, and pill geometry only for semantic status.

No black surfaces, dark sidebar, neon, glassmorphism, bento grid, fake charts, decorative metric filler, or unrelated gradients.

## Typography

- Wordmark and headings: Playfair Display through `--font-display`.
- UI, table, form, body and metadata: DM Sans through `--font-ui` / `--font-body`.
- Desktop H1: 54–64px, weight 500, tight tracking.
- Mobile H1: 42–48px, weight 500.
- Section heading: 30–38px desktop, 30–34px mobile.
- Control/table text: explicitly 13–15px; never browser defaults.

## Component inventory

- `AdminShell`: ivory canvas, desktop sidebar, quiet topbar, mobile bottom navigation.
- `AdminSidebar`: wordmark, four navigation items, selected blush row, restrained footer motif.
- `AdminAccountMenu`: administrator name and sign-out action.
- `PlatformMetricBand`: one continuous blush band with four divided metrics; 4-up desktop and 2×2 mobile.
- `VendorToolbar`: heading, primary add button, search and status filter.
- `VendorTable`: dominant desktop surface with semantic table markup and a selected/hover row.
- `VendorList`: mobile replacement with the same data labels and 44px touch targets.
- `VendorStatus`: semantic text plus dot; never color-only.
- `ActivityRail`: narrow desktop list; moves below vendors on smaller screens.
- `VendorDialog`: create/edit vendor, owner identity and temporary credential fields.
- `ConfirmDialog`: suspension/reactivation confirmation with explicit vendor name.
- Loading, empty and error states reuse the same open layout without placeholder cards.

## Container and responsive rules

- Desktop: 248px sidebar; flexible main content; vendor table and 300–340px activity rail.
- Below 1100px: activity moves beneath the vendor surface.
- Below 760px: sidebar/topbar navigation becomes a sticky bottom bar; table becomes vendor rows; metrics become 2×2; toolbar wraps without horizontal scrolling.
- Minimum viewport is 320px; all primary actions are at least 44px high.
- Table remains the desktop information architecture. Do not turn desktop data into a decorative card grid.

## Icons and motion

- Use existing Lucide line icons at 1.8–2px optical stroke with consistent 18–22px sizing.
- Status dots are 8–10px and accompanied by visible text.
- Hover lift is at most 1px; transitions are 140–180ms.
- Respect `prefers-reduced-motion`.

## Implementation architecture

- Code-native UI only; the concept images are specifications, not shipped interface assets.
- Split shell, navigation, metrics, vendor collection, activity, dialogs and API state into focused components.
- Fetch one admin bootstrap payload, then apply mutation responses locally and refresh in the background.
- Every platform mutation is server-authorized as `super_admin`; hiding a control is not authorization.
- Vendor-role navigation is separate and hides controls that the active membership cannot use.
