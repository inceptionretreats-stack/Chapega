# Releasing Chapega Studio

How to ship the app to Google Play and the App Store. Run the commands from
`mobile/`.

## To decide before the first store release

- **Which server release builds use.** They talk to `https://chapega.vercel.app`
  (`AppConfig.productionOrigin` in `lib/bootstrap/app_config.dart`). If the
  web app moves to its own domain, change that constant (or build with
  `--dart-define=CHAPEGA_API_ORIGIN=https://<domain>`), and keep the old
  address answering until old app versions are gone.
- **Who owns the store accounts and the upload key.** Use accounts in the
  business's name. A new *personal* Google Play developer account must run a
  closed test with at least 12 testers for 14 days before it can publish to
  production. An *organisation* account skips that but needs a D-U-N-S
  number.
- **The account deletion link.** Google Play asks for a web page where people
  can ask for their account to be deleted, because owners create accounts in
  the app (Team). The web app has none yet.
- **A privacy policy for the app's users.** Both stores ask for a privacy
  policy URL. The notice at `/privacy` is written for kiosk customers; the
  stores need one that also covers the shop team's own data in the app (see
  "Privacy answers").

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

### The upload key (once)

```sh
keytool -genkeypair -v -keystore chapega-upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Keep `chapega-upload.jks` and its passwords in the business's password
manager, never in the repository (`.gitignore` blocks `*.jks`, `*.keystore`
and `key.properties`). Then create `android/key.properties`:

```properties
storeFile=C:/path/to/chapega-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

Without this file a release build is signed with the debug key. That is
fine for testing, but Google Play refuses it.

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
3. **Store listing.** Icon: `assets/branding/store-icon-512.png`. Also needed:
   a 1024×500 feature graphic and at least two phone screenshots.
4. **App access.** Reviewers can't get past sign-in on their own. Give them
   an owner's sign-in on a demo shop with sample products and orders, never
   a real shop's account.
5. **Data safety**, **Content rating** (a business tool with no public user
   content) and **Target audience** (18 and over). See "Privacy answers"
   below.
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

What the app sends, for Google's Data safety form and Apple's App Privacy.
Check these against the app's privacy policy (above) before
submitting.

| What | When | Why |
|---|---|---|
| Email address and password | Sign-in. The password is never stored on the phone. | Account |
| A random installation ID, platform, phone model and app version | Sign-in | Telling a person's phones apart, the three-phone limit |
| Push token | Only after the person turns push on | New-order notifications |
| Product photos, product, shop and team details | When the person saves them | The shop's catalogue. Camera metadata, including location, is removed on the phone first. |

- The app shows customers' names, phone numbers and notes from the server,
  but keeps them only in memory and never sends them anywhere.
- No analytics, advertising or crash-reporting SDKs. Nothing is shared with
  third parties. Firebase Cloud Messaging delivers notifications as a
  service provider, only once push is set up.
- Everything goes over HTTPS; release builds refuse plain HTTP.
- Privacy policy URL: the policy decided above (`/privacy` today covers kiosk
  customers only).
