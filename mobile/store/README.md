# Chapega Studio store pack

Prepared on 2026-10-31; verification follow-up on 2026-11-02.
The Website Google account has the free Chapega Studio app and an active
owner-only internal-testing release with the accepted signed version 2 AAB,
`1.0.1 (2) - Gift-ribbon logo`, released 2 November at 11:07 AM IST. Console
shows Active / Available to internal testers and Not reviewed.
The listing, Business category, reviewer sign-in details, Advertising ID
answer, IARC ratings and owner-confirmed 13+ audience are saved in Console.
Data safety is a partial draft. Public production is not released and no
app-review request was sent. No billing or public-support-contact change
occurred. Git/Vercel remain on Inception; PRs #39 and #40 are merged and
deployed. See `../docs/PLAY_STORE_REVIEW.md` for completed steps and the
remaining contact, moderation, data-handling, hosting and device gates.
Asset generation itself uses local tools only. The new gift-ribbon logo
icon and feature banner are saved in the Play listing draft and verified
after reload. Source version `1.0.1+2` prepares the installed-logo update;
its signed AAB is verified (59,481,555 bytes, bundletool/signature/current
upload certificate, package/version/API/debug/backup, 16 KB alignment and
15 packaged native icons). Google accepted its three ABIs, R8 mapping and
native symbols; the final release preview had no errors/warnings and
unchanged supported-device counts. The existing single owner tester group
is unchanged. The matching signed APK is verified (61,622,704 bytes, exact
upload certificate, 16 KB ZIP/ELF alignment, 15 matching icons and four
matching Firebase client resources). See the release review for both
version 2 artifact paths, sizes and SHA-256 values. Version 1 artifacts
are historical; no iOS build or real-device acceptance is claimed.

## Files

| File | Purpose | Status |
|---|---|---|
| `../assets/branding/store-icon-512.png` | 512 × 512 RGBA gift-ribbon C listing icon | Saved in Play listing draft and reloaded; 14,792 bytes |
| `feature-graphic-1024x500.png` | 1024 × 500 RGB feature graphic, no alpha | New canonical logo saved in Play listing draft and reloaded; 37,769 bytes |
| `feature-graphic-1024x500.svg` | Editable vector source generated from the same design | Not a Play upload format |
| `listing/en-IN/title.txt` | App name | Draft; limit 30 characters |
| `listing/en-IN/short-description.txt` | Short description | Draft; limit 80 characters |
| `listing/en-IN/full-description.txt` | Full description | Draft; limit 4,000 characters |
| `listing/en-IN/release-notes.txt` | Version 1.0.1 logo-update notes | Saved with the Active version 2 internal release; limit 500 characters per language |
| `app-access.md` | Reviewer-account setup and English instructions | Isolated owner account and instructions saved privately; no credentials included |
| `metadata.json` | Paths, draft declarations and explicit pending fields | IARC completed; Data safety partial; public app review pending |
| `screenshots/` | Four genuine 1080 × 1920 RGB app captures | Local demo debug build; visually checked, no fabricated UI |
| `signing/` | Public upload certificate and registered Google Play fingerprints | Private keys and passwords excluded |

The canonical artwork is `../assets/branding/mark.svg`: a cream gift-box C
with a gold ribbon on burgundy. The feature graphic now uses this same mark,
a geometric gift illustration and capability copy in the established palette.
It contains no screenshot,
ranking, pricing, delivery, payment or performance claim. Text uses the
bundled DM Sans and Playfair Display fonts; their OFL licences are retained
in `../assets/fonts/`.

The local branding renderer exports Android legacy/adaptive/monochrome and
notification assets, iOS icons/launch images and website/PWA icons from the
same editable vector. Color and monochrome marks were checked at 32px and
64px with circle/squircle masks and the adaptive foreground safe area. See
`../assets/branding/README.md` for regeneration. A new signed binary is
required for installed launcher changes; saved listing artwork does not
replace a launcher. Version 2 is available internally with the packaged
new icons; verify its actual installed appearance on the tester device.

Regenerate the feature graphic and validate text/asset constraints from the
repository root, with the project's existing Node dependencies installed:

```sh
node mobile/store/render-assets.cjs
```

The script uses the already installed `sharp` package, the bundled fonts
and local files only. It creates the SVG and PNG, checks dimensions and
colour mode, then prints character counts. No network or paid service is used.

## Screenshot handoff

Four screenshots are included: Home, Orders, Order detail and Products.
They show the real Flutter UI on the dedicated Android API 36 emulator,
with six fictional orders, 24 demo products and no customer phone numbers.
The app-only integration test passed, signed out and verified token removal.
Desktop capture, device input automation and permission grants were not used.

The capture build is **local-demo-debug**, pointed only at
`http://10.0.2.2:3340`. It is separate from the signed production AAB/APK;
confirm these images still represent the final Play build, including the
new version 2 branding, before submission.
This is not physical-device, Play-distribution or push-delivery acceptance.
Catalogue photos show placeholders in these local captures. Verify photo
decoding in the final signed build before choosing the submission screenshots;
an HTTP 200 image response alone did not establish device rendering.
`screenshots/capture-metadata.json` records alt text, provenance and hashes.
Only opaque alpha removal/PNG re-encoding was applied; decoded pixels are
unchanged. There was no crop, composition or alteration of app controls.

To repeat, first start an isolated local JSON server on `127.0.0.1:3340`
with its own `CHAPEGA_DATA_DIR`, the published development preview account,
and FCM credentials disabled. Never use production or real shop credentials.
Run `node mobile/store/seed-local-demo.mjs --seed-local-capture` from the
repository root; it refuses non-local backends and unexpected identities.
Use a dedicated, verified emulator on `emulator-5556`, then from `mobile/`
run one Flutter command at a time:

```powershell
$env:CHAPEGA_CAPTURE_DEVICE = 'emulator-5556'
$env:CHAPEGA_SCREENSHOT_DIR = Join-Path $env:TEMP ('chapega-store-captures-' + [guid]::NewGuid())
flutter drive --driver=test_driver/store_listing_capture_driver.dart --target=integration_test/store_listing_capture_test.dart -d emulator-5556 --dart-define=CHAPEGA_API_ORIGIN=http://10.0.2.2:3340
```

The driver preserves original app-view PNGs and refuses to overwrite files.
Convert opaque exports to 24-bit RGB PNG for Play, checking decoded pixel
identity; keep the raw hashes in the provenance file.

Google accepts JPEG or 24-bit RGB PNG with no alpha,
320–3,840 pixels per side; the longest side must be at most twice the
shortest. The four included 1080 × 1920 images meet these constraints.
Keep customer details, credentials, personal notifications and unrelated
apps out of the captures. Provide short alt text for each image.

## Still required before submission

The owner has asked to leave public contact details unchanged. The current
sample WhatsApp destination does not establish a monitored deletion channel,
and no support email is selected in this pack. Keep these blockers visible.
Do not invent contacts, reuse the Firebase account email as public support
without authorization, or put review credentials in git.

Confirm the Play-installed reviewer login, content-policy/reporting controls,
hosting, screenshots, real-device acceptance and remaining Console forms using
`../docs/PLAY_STORE_REVIEW.md`. Draft copy describes implemented features;
it does not certify push delivery, policy compliance or Google approval.

Source requirements checked on 2026-10-31:

- [Play listing content and contact fields](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)
- [Play image and screenshot requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
- [Review access instructions](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en)
- [Release-note format and limit](https://support.google.com/googleplay/android-developer/answer/9859348?hl=en)
