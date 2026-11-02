# Chapega gift-ribbon logo

The canonical artwork is `mark.svg`: a cream C shaped like a gift box, wrapped
with a gold ribbon and bow. It uses the existing burgundy (`#7a263a`),
cream (`#fff9f2`) and gold (`#c69b57`) palette. The artwork is flat and
editable; no generated raster is embedded in the production SVG.

## Exports

Run from `mobile/`:

```sh
node assets/branding/render-branding.cjs
dart run flutter_launcher_icons
```

The renderer derives the SVG/PNG wrappers, 512px Play icon, website icon,
notification vector and iOS launch images from the same mark. It also exports
`app/favicon.ico`, `app/apple-icon.png` and the three `public/icons/` PWA
images, so browser fallbacks and saved web shortcuts use the same identity.
Use `node assets/branding/render-branding.cjs --web-only` from `mobile/` to
refresh only those web assets. Adaptive
foreground and monochrome wrappers use the expanded `-128 -128 1280 1280`
viewBox. The transparent foreground fits Android's central two-thirds safe
circle. Keep the full-bleed store icon square; Google applies its own mask.

The launcher generator also updates platform PNGs. Version 0.14.4 has the
two documented iOS metadata side effects in `../../README.md`; restore
those metadata files from their pre-generation contents while keeping PNGs.
Regenerate the feature banner from the repository root with
`node mobile/store/render-assets.cjs`.

Visual checks cover 32px and 64px color/monochrome marks under circular and
squircle masks. A new Android binary is required to update an installed
launcher icon; updating the Play listing alone does not change version 1.

## Design provenance

The built-in `image_gen` tool was used for a new concept. Its ribbon-and-C
idea was then redrawn as the clean, deterministic production vector.
No paid API workflow or additional dependency was introduced.

Concept prompt:

> Use case: logo-brand. Asset type: final master symbol for the Chapega Studio Android app and Google Play icon. Create ONE polished, original, compact logo mark on a genuinely transparent background, square composition. The business is a premium gift-shop operations app. Evolve the idea of a capital C into an elegant wrapped-gift emblem: a bold warm-ivory custom C-shaped ribbon forms the main gift-box body, with a restrained muted-gold folded bow and gift-ribbon detail integrated above it. The C must remain immediately legible and the gift association clear, with confident thick forms and generous negative space. Main mark warm ivory #fff8ee, accent muted gold #c69a4d. Intended final background is deep burgundy #7a263a, but DO NOT render that background: keep every area outside the mark transparent. Center the complete emblem within the central 62 percent of the square, with consistent safe clear space on every side for Android adaptive masks. Style: precise flat vector-like geometry, contemporary luxury retail identity, smooth clean curves, excellent silhouette at 32 pixels, no gradients, no shadow, no texture, no glow, no 3D. No written brand name, no small text, no extra dots or sparkles, no border or rounded-square app tile, no mockup, no presentation grid, no watermark. Output only the finished transparent symbol.
