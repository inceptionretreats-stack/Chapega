# Google Play release review — 2026-11-02

**Decision: not ready for public production.** Upload signing and store preparation
are implemented, PR #39 is merged and the web fixes are deployed. A Play
app record has been created in the owner's selected Google account.
Version 1 is published on the active internal-testing track for the single
authorized owner tester; its AAB is accepted and signing certificates are
configured. A dedicated reviewer shop and reusable owner login are created,
verified through the phone API and web dashboard, and saved privately in Play
Console. Public contact, final Data safety, UGC safeguards, installed-build
acceptance and business-hosting cutover remain publication gates.
This is a readiness review, not a guarantee of Google approval.

Verification and deployment follow-up on 2026-11-02 is recorded in
`../../HANDOVER.md` and merged PR
[#39](https://github.com/inceptionretreats-stack/Chapega/pull/39).

The owner authorized a new upload key, required free services, and asked to
leave public contact details unchanged. The owner subsequently authorized
creating the isolated reviewer account and providing its credentials privately
to Google Play. Git/Vercel remain on Inception; Play Console uses the
owner's selected Website Google account. No public Play release is live.
No billing or paid upgrade was enabled. Browser work uses Chrome's tab
extension; desktop/full-screen control remains excluded.

Reviewed runtime source: release head `dad0ac8`, merged without tree changes
as `71ea80f`. Documentation PR
[#40](https://github.com/inceptionretreats-stack/Chapega/pull/40) is now merged
as `e3ea0f64fa305f4ff02828df6360094f5608e086`. Inception's production
deployment `dpl_2QfHPx1MaLRA21ByShf84LyvtiAm` is READY at
`https://chapega.vercel.app`; the corrected privacy notice is live. The
earlier production and "source-only" statements in historical notes are
superseded.

## Verified

| Area | Evidence |
|---|---|
| App identity | `com.chapega.studio`, Chapega Studio, version `1.0.0+1` |
| Android compatibility | Packaged release APK: minimum API 24; target/compile API 36 |
| Native code | ARMv7, ARM64 and x86_64 present; all 12 packaged libraries have at least 16 KB ELF LOAD alignment; APK `zipalign -P 16` passes |
| Flutter | Fresh `flutter analyze --fatal-infos` passes; all 89 tests pass |
| Web | Follow-up `npm run check -- --coverage --maxWorkers=2`: 667 tests in 87 files; typecheck, lint and coverage thresholds pass |
| Web release checks | Production build, formatting and production dependency audit pass; zero reported vulnerabilities |
| Hosting preparation | Credential-free Netlify CLI/OpenNext packaging passes locally; no cloud deployment or service cutover |
| Signing safeguard | Release AAB task graph refuses absent/debug upload signing; configured upload key builds successfully |
| Production | Documentation merge `e3ea0f6` is deployed; runtime fixes from `71ea80f` remain live; health/readiness pass with Supabase ready; all four approved migrations were already applied |
| Post-deploy logs | Zero error rows in the bounded deployment query; startup reports push on; no actual push delivery was tested |
| Phone API authentication | Isolated reviewer sign-in, permanent-password change, session and logout verified; cross-tenant access rejected; signed-out session returns HTTP 401. This does not establish a Play/native installation |
| Reviewer shop | Dedicated owner account has no platform role and only its demo-shop membership; three synthetic products and three orders (confirmed/preparing/ready), blank customer phone fields and HTTP 200 product images; web dashboard verified. Preview label is on and public kiosk ordering is paused |
| Play sign-in details | Reusable credentials and 460-character English instructions saved privately; optional Google-partner device testing is off. No credentials or private account identifiers are included here |
| Firebase | FCM HTTP v1 enabled, Sensitive production service-account credential installed; Google OAuth/validation-only request HTTP 200; all three Play signing certificates registered and persisted |
| App transport/storage | Release API origin is HTTPS; cleartext rejected; backup disabled; cloud/device-transfer exclusions present; session token uses secure storage |
| Permissions | No advertising-ID, location or broad photo/storage permissions in inspected release APK; notification permission is requested by the alerts flow |
| Store icon | Fixed RGB export to 512×512 RGBA PNG, 14,916 bytes; decoded pixels are unchanged |
| Store screenshots | Four real 1080×1920 app-view captures, visually checked and exported as RGB with unchanged pixels; local demo debug build, not Play acceptance |
| App capture flow | Flutter integration test signs in, opens Home/Orders/Order detail/Products, then signs out and verifies secure-token removal; synthetic local data only |
| Privacy links | Live privacy and account-deletion pages return HTTP 200; About links to these and open-source licences |
| Play account access | The existing organization account is accessible through the selected Google account, and a Chapega Studio app record is now created |
| Play internal release | Track Active and version 1 (1.0.0) available to the single authorized owner tester, released 2 November at 10:32 AM IST; API 24/36, three ABIs, R8 mapping and native symbols. Final preview had zero errors/warnings; Console status Not reviewed; no public production release or app-review request |
| Play signing configuration | Google-managed signing active; current and two previous certificates registered in Firebase with SHA-1/SHA-256; Android key has five package/certificate entries and its unchanged 25-API allowlist |
| Console listing | en-IN title, 61-character short description, 1,112-character full description, icon, feature graphic and four ordered phone screenshots saved |
| Saved App content | Privacy URL, No ads, No government affiliation, No financial features, No health features and No Advertising ID saved; IARC ratings and 13+ audience saved; final Data safety remains incomplete |
| IARC ratings | Owner approved the IARC terms; saved ratings include ESRB Everyone, PEGI 3, USK 16 (Increased Communication Risks), other displayed regional ratings 3, and Users Interact |
| Target audience | Ages 13–15, 16–17 and 18+ saved; the target audience does not override regional content ratings |
| Data safety progress | Partial draft saved: collection Yes, encryption in transit Yes and username/password account creation. Deletion URL remains blank because the live route uses a sample contact; data types, handling and remaining answers are incomplete |
| Store settings | Business category saved separately; store contact email, phone and website remain blank and untouched |
| Costs | Firebase Spark and Supabase Free unchanged; Inception's Vercel team is verified Hobby; the existing Play account is used without a new registration purchase |

Final release-branch CI (`dad0ac8`) passed 667 unit tests, 35 database tests,
84 browser cases (16 intentional duplicate skips), 89 Flutter tests and the
Android release build. Browser logs contain no hydration/uncaught-browser
errors. The merged production tree is identical to that tested head.

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

Google-managed Play signing is active. The current in-use app-signing
certificate and both previous quantum-ready beta certificates are recorded
in `../store/signing/play-app-signing-certificates.json`. All six SHA-1/
SHA-256 fingerprints were registered in Firebase and persisted after reload.
Google's Android API-key settings were reopened to verify five certificate
entries (debug, upload and the three Play certificates) with the same
25-API allowlist. Neither the client key nor Google's signing key changed.
This does not replace a test of a build actually installed through Play.

## Submission blockers

1. **Installed signing identity.** Play accepted version 1 and the internal
   track is now Active, available only to the single authorized owner tester.
   Console shows Released 2 November at 10:32 AM IST and Not reviewed; the
   final release preview had zero errors and warnings. Google-managed app
   signing and certificate registration are complete. Verify a real Play
   installation before treating installed acceptance as complete. The existing
   release name `1.0.0 (1) - internal draft` is only a label; it no longer
   describes the track state. Until setup/review completes, the temporary
   download name is `com.chapega.studio (unreviewed)`. No public production
   release or Google app-review request was made. See
   [Android signing guidance](https://developer.android.com/studio/publish/app-signing).
2. **Real contact.** The live `/delete-account` page links to the documented
   sample WhatsApp number `919876543210`. The owner has deferred replacing
   it. A real monitored deletion channel and store support email are still
   needed; Google requires a support email for the listing. Do not assume
   the Firebase account's email is authorized as public support. See
   [store contact requirements](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en).
   The deployed privacy notice now explains Firebase identifiers/metadata, operational
   records, photo publication, providers and retention. Contacts and the
   deletion channel are unchanged. Confirm the notice reflects actual
   operations before submission; deployment alone does not establish a
   monitored request route.
3. **Final listing and declarations.** The en-IN main listing, icon,
   1024×500 feature graphic and four phone screenshots are saved in Console.
   Business category and five App content forms are saved: Privacy URL,
   No ads, No government affiliation, No financial features and No health
   features. No Advertising ID, IARC ratings, 13+ audience and restricted
   sign-in instructions are now saved. Data safety remains a partial draft,
   with collection/encryption/account-creation answers saved and its deletion
   URL deliberately blank. Final categories, sharing/provider handling and
   an operational deletion route still need completion. The local
   `../store/` pack retains the assets and declaration drafts. Screenshot
   acceptance limitations are recorded in its metadata. See
   [asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en).
4. **Installed reviewer acceptance.** Reviewer provisioning is complete
   following the owner's new authorization. The isolated owner account has
   a permanent password and synthetic products/orders; phone API and browser
   checks pass, and English sign-in instructions and credentials are saved
   privately in Console. Verify that this same account works in the actual
   Play-installed binary, including native photo and notification flows.
   No real shop or customer account is supplied to Google.
   See [review login requirements](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en).
5. **Commercial hosting.** Vercel Hobby is restricted to personal,
   noncommercial use. Chapega handles business shop orders, so this review
   treats compliant business hosting as a launch requirement. Preserve the
   free-only constraint by selecting hosting whose free terms permit the
   intended use; no upgrade or migration was performed. A local Netlify
   configuration, context-based client IP support and credential-free
   adapter build are prepared; live runtime, upload-size and service gates
   remain in `../../docs/deployment-netlify.md`. See
   [Vercel Hobby terms](https://vercel.com/legal/terms).
6. **User-generated content safeguards.** The app permits native exchange
   of product text/photos and order information among shop teams, as
   disclosed by Users Interact in the saved IARC questionnaire. Google's
   UGC policy also covers a defined company user set. The current app has
   no in-app content/user reporting path or moderation workflow, and a
   reviewed objectionable-content policy and terms-acceptance flow remain
   missing. Owner access removal and product archiving do not establish
   these safeguards. Implement and verify proportionate terms, reporting
   and moderation before public submission; no such runtime change was
   made in this documentation update. See
   [Google Play UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en).

## Acceptance checks still required

- Use the private owner-only test opt-in link to install the signed build
  from the now-active internal track on a real Android phone. The authorized
  tester identity and link stay in private delivery records. Do not treat a
  locally debug-signed APK or Console availability as an installed check.
- Review Play's bundle/SDK warnings and pre-launch report after that upload;
  local validation cannot establish the Console's final policy checks.
- Sign in, replace a temporary password, resume an existing session, switch
  shops, sign out, and verify role restrictions for owner/manager/staff.
- Exercise order updates, stock/product editing, photo capture and photo
  selection, shop settings, team changes and conflict/retry handling on a
  controlled demo shop.
- Verify catalogue-photo decoding on the signed build. The genuine local
  screenshots show placeholders; valid API paths and HTTP 200 PNG responses
  were verified, but an additional device image probe could not run.
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
`../store/listing/en-IN/`. The main listing text and graphics have been saved
in Play Console and meet the checked limits. Final submission review and
real-device screenshot acceptance remain pending.

## Draft Data safety inventory

Console has only a partial draft: collection Yes, encryption Yes and
username/password account creation. No deletion URL was supplied while its
contact route remains a sample. This inventory comes from the app/API
source and does not complete the remaining form answers. Confirm
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

## Policy notes checked on 2026-11-02

- Google currently requires API 36 for new ordinary Android apps; the
  inspected build meets that requirement.
  [Target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- The current Android compatibility guidance requires 16 KB support and
  explains both binary alignment and runtime testing.
  [16 KB guidance](https://developer.android.com/guide/practices/page-sizes)
- The observed developer account is an organization account. Do not apply
  the newer-personal-account 12-testers/14-days rule automatically to it;
  follow the actual app's Console tasks.
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
