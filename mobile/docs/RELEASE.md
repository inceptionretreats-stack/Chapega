# Releasing Chapega Studio

How to ship the app to Google Play and the App Store. Run the commands from
`mobile/`.

The latest Android submission decision, verified checks and remaining
blockers are in [the Google Play review](PLAY_STORE_REVIEW.md).

## Decided (2026-10-31)

- **Server.** Release builds talk to `https://chapega.vercel.app`
  (`AppConfig.productionOrigin` in `lib/bootstrap/app_config.dart`). If the
  web app later moves to its own domain, change that constant (or build with
  `--dart-define=CHAPEGA_API_ORIGIN=https://<domain>`), and keep the old
  address answering until old app versions are gone.
- **Account deletion link:** `https://chapega.vercel.app/delete-account`.
  Requests go to Chapega.com's WhatsApp (the number in the Chapega.com shop's
  settings); the procedure is in `docs/RUNBOOK.md`. The app links to it from
  More → About.
- **Privacy policy URL:** `https://chapega.vercel.app/privacy`. Its "Shop
  teams" part (`/privacy#shop-teams`) covers the team's own data in the app.
- **Firebase.** `chapega-studio` is configured under the owner's chosen
  Google account for Android and iOS (see PUSH.md).
- **Cost.** The user requires free versions only. No billing activation,
  paid upgrade or paid store enrollment is authorized. An existing Play
  organization account is accessible; no new registration was purchased.

## To decide before the first store release

- **Publisher and review setup.** An existing Play organization account
  is accessible through the configured Google account.
  The owner has deferred the public contact and reviewer account; no app
  was created or uploaded. A dedicated upload key is now configured below.
  Follow the actual app's Console tasks rather than assuming the newer
  personal-account 12-testers/14-days rule applies to this organization.

## Every release

1. `flutter analyze --fatal-infos` and `flutter test` pass, and the
   integration test passes against a production build of the web app (see
   README.md → "Integration test").
2. Raise the version in `pubspec.yaml`: `version: 1.0.1+2`. The part before
   `+` is what people see. The number after it must go up with every upload,
   to either store.
3. If push is set up, every build command below also takes
   `--dart-define-from-file=config/firebase.json` (see PUSH.md).
4. Note the release in `CHANGELOG.md`.

### Keep the API compatible with older versions

Phones keep old app versions for months. On the server:

- Adding a field to a response is fine; the app ignores fields it doesn't
  know.
- Removing or renaming a field breaks the versions that read it.
- A new order status or team role breaks every older version: the app
  refuses responses with a status or role it doesn't know. Ship an app
  version that knows the new value first, and wait until most phones have it.

## Android

### Upload signing

A dedicated upload key was created on 2026-10-31: RSA 3072, alias `upload`,
certificate subject `CN=Chapega Studio Upload`, valid for 10,000 days. Keep
using this key; do not generate a replacement for each release.

On the configured Windows machine its files are outside Git, under
`%USERPROFILE%\.chapega-signing\chapega-studio-upload-20261031\`:

- `chapega-studio-upload.p12`: the private upload keystore.
- `upload-certificate.pem` and `certificate-fingerprints.txt`: public
  certificate details for Play and Firebase configuration.
- `upload-password.dpapi`: password recovery protected with Windows DPAPI
  CurrentUser; it works only under the same Windows user/profile.
- `RECOVERY.txt`: local build and recovery instructions.

The directory and ignored `android/key.properties` allow only the current
Windows user. Gradle reads its signing password from that local file; never
display or commit it. If it is missing, run the signing directory's
`Restore-AndroidSigning.ps1` under that Windows account (optionally pass
`-ProjectRoot` for another checkout). The helper restores the settings
without displaying the password and refuses to replace existing settings.

Keep an encrypted off-device backup of the keystore **and its password** in
the business password manager. Copying the DPAPI file to another account or
machine is insufficient. The local `Copy-UploadPasswordToClipboard.ps1`
helper can copy the password for that backup without printing it; clear the
clipboard afterwards. It is not run automatically.

Release App Bundle builds refuse missing signing settings and Android
Debug certificates. Release APK checks may still use the debug fallback
when settings are absent, so CI needs no private key. Verify the signer of
the final AAB before uploading. Play-distributed builds use Google's app
signing certificate; add that certificate to Firebase/API-key restrictions
before testing a Play installation.

### Build

```sh
flutter build appbundle --release
# → build/app/outputs/bundle/release/app-release.aab
```

Code shrinking (R8) is on for release builds; `android/app/proguard-rules.pro`
keeps what the notification plugin needs. `flutter build apk --release`
makes an APK to install by hand. It holds all three CPU types, so it is
about 60 MB; Play sends each phone only its own, so downloads are smaller.

### Google Play Console (first time)

1. Create the app: "Chapega Studio", App, Free.
2. Keep **Play App Signing** on (the default). Google holds the key that
   signs the app; your upload key only signs what you upload, and Google can
   reset it if it is lost.
3. **Store listing.** Icon: `assets/branding/store-icon-512.png`. The feature
   graphic, listing drafts and screenshot status are in `store/README.md`.
4. **App access.** Reviewers can't get past sign-in on their own. Give them
   an owner's sign-in on a demo shop with sample products and orders, never
   a real shop's account.
5. **Data safety**, **Content rating** and **Target audience**: use
   `store/app-content-draft.md` and the privacy inventory below. Complete
   the current questionnaire accurately; merchant catalogue content and
   order notes exist even though there is no public social feed.
6. Upload the `.aab` to **Internal testing** first. Install it from Play on a
   real phone, sign in, place a kiosk order and check the alert. Then
   promote it to production.

## iOS

Needs a Mac with Xcode and a paid Apple developer account.

1. In App Store Connect, create the app with bundle id `com.chapega.studio`.
2. `open ios/Runner.xcworkspace`. Under Runner → Signing & Capabilities,
   choose the team. Add **Push Notifications** only once push is set up
   (PUSH.md).
3. `flutter build ipa --release`, then upload `build/ios/ipa/*.ipa` with
   Transporter or Xcode's Organizer.
4. Fill in **App Privacy** with the answers below. Give App Review the same
   demo sign-in as Google.
5. `ITSAppUsesNonExemptEncryption` is `NO` in `Info.plist` (only standard
   HTTPS), so there is no export compliance question.
6. Flutter and each plugin ship their own privacy manifest. The app's own
   code uses none of Apple's "required reason" APIs. If App Store Connect
   asks for an app-level manifest anyway, add `PrivacyInfo.xcprivacy` to the
   Runner target in Xcode.
7. Test with TestFlight, then submit for review.

## Privacy answers

Source-based notes for Google's Data safety form and Apple's App Privacy.
The owner must review the final store questions, the SDKs in the submitted
build and the actual handling of data before submitting; these notes are
not a completed declaration.

| What | When | Why |
|---|---|---|
| Email address and password; team members' names, emails and roles | Sign-in, password changes and owner-managed team changes | Account access and management. The app does not persist passwords; the server keeps salted password hashes. |
| A random installation ID, platform, phone model and app version | Sign-in | Telling a person's phones apart and enforcing the three-phone limit. The server stores a hash of this app-generated installation ID. |
| Firebase Cloud Messaging registration token | Registered with Chapega after the person turns push on | New-order notifications. Firebase Messaging also depends on Firebase Installations, which has separate identifier and metadata collection. |
| Product photos, product content and shop settings, including the shop's WhatsApp number | When an authorized person saves them | Running the shop's catalogue and order handoff. Photo metadata, including location, is removed before upload and checked again by the server. |
| Shop actions and operational request metadata | Sign-in and API requests; catalogue, order, settings and team changes | Account security, troubleshooting and the shop's audit history. This is not an advertising or analytics feature. |

- Customer names, phone numbers and notes downloaded from the server stay
  in memory on the phone and are cleared on sign-out. Tapping **Call** or
  **WhatsApp** hands the customer's number to an external app. Owners can
  also copy or share newly issued temporary team credentials explicitly.
- Firebase's [Android data-disclosure guidance](https://firebase.google.com/docs/android/play-data-disclosure)
  covers the Messaging SDK and its Installations dependency, including the
  Firebase installation ID (FID), app version and Firebase user agent.
  The FID is separate from Chapega's own random installation ID. Account
  for SDK data as well as the app's API payloads.
- No analytics, advertising or crash-reporting SDK is included in the
  app's dependencies. This does not mean that no data is collected:
  Firebase handles push delivery, and Vercel and Supabase host and store
  the service's data. Review the stores' service-provider and
  user-initiated-transfer exceptions before declaring whether any data
  is "shared"; do not use a blanket claim that nothing reaches third
  parties.
- Everything goes over HTTPS; release builds refuse plain HTTP.
- The app keeps its session token and install ID in secure storage;
  non-sensitive preferences stay on the phone. It does not use a persistent
  cache for downloaded orders or customer details.
- Privacy policy URL: `https://chapega.vercel.app/privacy`; the **Shop
  teams** section covers Vendor Studio and the phone app. Account-deletion
  instructions are at `https://chapega.vercel.app/delete-account`, also
  linked from **More → About**. Removing access through **Team** retains the
  platform account; full account deletion is a separate verified support
  request.
