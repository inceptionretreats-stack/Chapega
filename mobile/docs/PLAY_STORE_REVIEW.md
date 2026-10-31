# Google Play release review — 2026-10-31

**Decision: not ready to publish.** Upload signing and store preparation
are now implemented. Public contact, reviewer access, Console declarations,
Play signing/internal testing and business-hosting cutover remain incomplete.
This is a readiness review, not a Play upload or a guarantee of approval.

The owner authorized a new upload key, required free services, and asked to
leave public contact details unchanged. Reviewer-account creation was also
explicitly deferred. No app listing was created and no bundle was uploaded.
No billing or paid upgrade was enabled. Desktop screen control was stopped
at the owner's request; subsequent captures use the app's integration tests.

Reviewed source: `d9b4b8a` plus the release preparation on
`release/play-store-preparation-20261031`. Production remains on `d9b4b8a`;
the privacy source changes require deployment before submission.

## Verified

| Area | Evidence |
|---|---|
| App identity | `com.chapega.studio`, Chapega Studio, version `1.0.0+1` |
| Android compatibility | Packaged release APK: minimum API 24; target/compile API 36 |
| Native code | ARMv7, ARM64 and x86_64 present; all 12 packaged libraries have at least 16 KB ELF LOAD alignment; APK `zipalign -P 16` passes |
| Flutter | Fresh `flutter analyze --fatal-infos` passes; all 89 tests pass |
| Web | Final `npm run check -- --coverage --maxWorkers=2`: 665 tests in 86 files; typecheck, lint and coverage thresholds pass |
| Web release checks | Production build, formatting and production dependency audit pass; zero reported vulnerabilities |
| Hosting preparation | Credential-free Netlify CLI/OpenNext packaging passes locally; no cloud deployment or service cutover |
| Signing safeguard | Release AAB task graph refuses absent/debug upload signing; configured upload key builds successfully |
| Production | Health/readiness HTTP 200, Supabase healthy, all four approved migrations applied |
| Phone API authentication | Unauthenticated session and nonexistent `.invalid` login return expected HTTP 401 |
| Firebase | FCM HTTP v1 enabled, Sensitive production service-account credential installed; Google OAuth/validation-only request HTTP 200 |
| App transport/storage | Release API origin is HTTPS; cleartext rejected; backup disabled; cloud/device-transfer exclusions present; session token uses secure storage |
| Permissions | No advertising-ID, location or broad photo/storage permissions in inspected release APK; notification permission is requested by the alerts flow |
| Store icon | Fixed RGB export to 512×512 RGBA PNG, 14,916 bytes; decoded pixels are unchanged |
| Store screenshots | Four real 1080×1920 app-view captures, visually checked and exported as RGB with unchanged pixels; local demo debug build, not Play acceptance |
| App capture flow | Flutter integration test signs in, opens Home/Orders/Order detail/Products, then signs out and verifies secure-token removal; synthetic local data only |
| Privacy links | Live privacy and account-deletion pages return HTTP 200; About links to these and open-source licences |
| Play account access | An existing organization account is accessible through the configured Google account; no Chapega result in its app search |
| Costs | Firebase Spark, Supabase Free and Vercel Hobby unchanged; existing Play account avoids new registration if selected for this app |

The previous same-day integration run passed 35 database tests and the web
browser suite passed 84 cases (16 intentional duplicate skips). Those suites
were not rerun for this review's icon/documentation changes.

## Built Android App Bundle

The upload-signed AAB is preserved at
`mobile/build/play-store/chapega-studio-1.0.0-1-upload.aab`:

- Size: 59,471,929 bytes (56.72 MiB).
- SHA-256: `110C568582371FBCDBCAC86327D099590723C50F202BC7D89B39EE0420811884`.
- Official cached bundletool 1.18.3 validation passes. Manifest confirms
  minimum API 24, target API 36, `debuggable=false` and `allowBackup=false`.
- BundleConfig uses uncompressed native libraries and `PAGE_ALIGNMENT_16K`;
  all 12 packaged libraries meet at least 16 KB ELF LOAD alignment.
- Four native Firebase resources match the ignored build configuration.
  R8 mapping and 12 native symbol files are included.
- Signature verification passes with **Chapega Studio Upload**, RSA 3072,
  alias `upload`. The certificate's SHA-256 is
  `13:51:FC:69:1D:B7:F8:65:2C:55:F7:7A:BC:EA:5F:80:AF:6D:72:2B:F9:3E:43:DF:35:63:03:33:A9:63:29:B1`.
- The matching signed APK is
  `mobile/build/play-store/chapega-studio-1.0.0-1-upload.apk`, 61,613,156 bytes,
  SHA-256 `F3AE33DAC62394424D1E15CB494D695D5BC95FEDAF024954C52463EAC7E6A8ED`.
  APK signature verification and 16 KB ZIP alignment pass.

The private key is outside Git with user-only permissions and DPAPI password
recovery; `../store/signing/` contains only the public certificate. An
encrypted off-device key/password backup is still the owner's action.
Release AAB tasks now reject missing or Android Debug signing settings;
APK-only CI checks retain their debug fallback. See RELEASE.md for recovery.
The generated build directory was moved to C: with a junction after D: filled;
the signed artifacts' hashes survived unchanged. See HANDOVER.md.

## Submission blockers

1. **Play setup and final signing identity.** Local upload signing is fixed,
   but the Play app has not been created or uploaded. Keep Play App Signing
   enabled and add Google's app-signing certificate before testing a Play
   installation. Upload and app-signing certificates are different. See
   [Android signing guidance](https://developer.android.com/studio/publish/app-signing).
2. **Real contact.** The live `/delete-account` page links to the documented
   sample WhatsApp number `919876543210`. The owner has deferred replacing
   it. A real monitored deletion channel and store support email are still
   needed; Google requires a support email for the listing. Do not assume
   the Firebase account's email is authorized as public support. See
   [store contact requirements](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en).
   The privacy source now explains Firebase identifiers/metadata, operational
   records, photo publication, providers and retention. Contacts and the
   deletion channel are unchanged. Verify the corrected notice is deployed
   and reflects actual operations before submission.
3. **Final listing and declarations.** The local `../store/` pack contains
   the 1024×500 feature graphic, corrected icon, listing text, public upload
   certificate and App content drafts. Screenshot status is recorded in its
   metadata. Owner review and actual Console declarations remain pending. See
   [asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en).
4. **Reviewer access.** Prepare a dedicated demo shop with sample products,
   sample orders and a reusable owner login whose temporary password has
   already been replaced. Provide English instructions in App access. Do
   not give reviewers a real shop's account or publish credentials in git.
   The owner explicitly chose to leave this account pending.
   See [review login requirements](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en).
5. **Play signing and Firebase restriction.** The Android API key is
   restricted to the debug and new upload certificates. Before testing a Play
   install, add the Play app-signing certificate's SHA-1 to Firebase and
   the Android key restriction. Keep the upload certificate distinct from
   Google's app-signing certificate.
6. **Commercial hosting.** Vercel Hobby is restricted to personal,
   noncommercial use. Chapega handles business shop orders, so this review
   treats compliant business hosting as a launch requirement. Preserve the
   free-only constraint by selecting hosting whose free terms permit the
   intended use; no upgrade or migration was performed. A local Netlify
   configuration, context-based client IP support and credential-free
   adapter build are prepared; live runtime, upload-size and service gates
   remain in `../../docs/deployment-netlify.md`. See
   [Vercel Hobby terms](https://vercel.com/legal/terms).

## Acceptance checks still required

- Install a properly signed build from Play's internal track on a real
  Android phone. Do not treat a locally debug-signed APK as that check.
- Review Play's bundle/SDK warnings and pre-launch report after that upload;
  local validation cannot establish the Console's final policy checks.
- Sign in, replace a temporary password, resume an existing session, switch
  shops, sign out, and verify role restrictions for owner/manager/staff.
- Exercise order updates, stock/product editing, photo capture and photo
  selection, shop settings, team changes and conflict/retry handling on a
  controlled demo shop.
- Turn push on and test foreground, background and closed-app delivery,
  notification taps, denied permission, push off and sign-out. No actual
  signed-in phone registration or notification delivery was established by
  the Google validation-only request.
- Test on Android API 24 and a current device; run on a 16 KB page-size
  device/emulator. Static ELF/ZIP checks do not establish runtime behavior.
- Check TalkBack, large text, dark mode, rotation, poor/offline network,
  camera/gallery cancellation, Call/WhatsApp handoff and account-deletion
  contact reachability. Widget accessibility tests cover main screens and
  text scaling but do not replace TalkBack or physical-device testing.
- Rehearse account deletion on disposable data using the reviewed runbook;
  never test it by deleting a real team member. Confirm all retained-data
  claims match the owner's actual operations and backup handling.

## Draft listing text

The canonical name, descriptions and release notes are in
`../store/listing/en-IN/`. They meet the checked character limits and still
need owner review before entering them in Play Console.

## Draft Data safety inventory

This inventory comes from the app/API source, not a submitted form. Confirm
each category against the final build, provider contracts and actual
operations. Collection is encrypted in transit; most server-retained data
is not ephemeral. Do not select "no data collected".

| Candidate type | Choice | Observed use |
|---|---|---|
| Email address, User IDs | Required for sign-in | Account access, session management and security; passwords are not persisted on the phone |
| Name, Phone number | Optional management features | Team names and shop WhatsApp settings; include phone-number collection where a personal number is used |
| Device or other IDs | Required install ID; optional push | Chapega's random install UUID is sent at sign-in and stored as a hash; Firebase FID/token is separate |
| Photos | Optional | Product images uploaded to shop storage after metadata removal |
| Other user-generated content | Optional editing | Product descriptions/options and shop content |
| Other actions | When managed features are used | Attributable sign-in, product, order, settings and team audit events |
| Diagnostics | Review against final logs | Platform/model/version and operational request/error metadata; no crash SDK found |

Use functionality, account management and security purposes where they
match the actual flow. On-device theme/alert preferences and in-memory
downloads are distinct from data the app sends to the server. Customer
order details are primarily downloaded; explicit Call/WhatsApp taps pass
the number to another app. Review purchase-history/message questions
against these actual flows rather than copying kiosk-form answers.

Provider processing and explicit user-requested transfers may qualify for
Google's sharing exceptions; the owner must verify those before declaring
"not shared". Removing shop access does not delete the platform account.
The full deletion procedure is manual and needs verified attribution for
historical order-event names; RUNBOOK.md now stops on ambiguous names and
uses both tenant and order IDs. No real deletion was performed to test it.

## Policy notes checked on 2026-10-31

- Google currently requires API 36 for new ordinary Android apps; the
  inspected build meets that requirement.
  [Target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- The current Android compatibility guidance requires 16 KB support and
  explains both binary alignment and runtime testing.
  [16 KB guidance](https://developer.android.com/guide/practices/page-sizes)
- The observed developer account is an organization account. Do not apply
  the newer-personal-account 12-testers/14-days rule automatically to it;
  follow the actual app's Console tasks when it is created.
  [Personal-account testing rule](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- Data safety must include applicable SDK collection, including Firebase
  Installations identifiers used by FCM. A service-provider exception may
  affect the sharing answer; it does not erase collection. The implementation
  inventory in RELEASE.md is a draft, not a submitted declaration.
  [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en),
  [Firebase SDK disclosure](https://firebase.google.com/docs/android/play-data-disclosure)
- Public privacy/deletion pages must be accurate and functional. An HTTP
  200 page with a sample contact does not establish a working request route.
  [Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)

iOS APNs/build work is outside this Android publication review.
