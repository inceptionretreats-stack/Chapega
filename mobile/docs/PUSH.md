# Push notifications for Chapega Studio

New kiosk orders can reach staff phones even when the app is closed. Push
requires Firebase settings in the app build and a server credential:

- **Without Firebase**, the app alerts only while it is open: a banner,
  a vibration and a notification with sound for each new order. The
  Notifications screen says so.
- **With Firebase**, the Notifications screen shows a "Push notifications"
  switch. Turning it on registers this phone's push token with its own
  session (`PUT /api/studio-app/v1/push-token`). The server sends one
  notification per new kiosk order to every signed-in phone of the shop's
  team, and only the order number, total and number of items. No customer
  names, phone numbers or notes.

A phone stops getting pushes when its person signs out, changes their
password elsewhere, loses access to the shop, or doesn't open the app for 14
days (the session's idle limit).

## Current connection (2026-10-31)

- Firebase project: `chapega-studio` (Chapega Studio), on Spark ($0/month),
  under the owner's chosen Google account. Both app identifiers are
  `com.chapega.studio`.
- FCM HTTP v1 is enabled. The dedicated `chapega-fcm-sender` service account
  has only Firebase Cloud Messaging API Admin. Its key is installed as a
  Sensitive Production variable on Inception's existing Vercel `chapega`
  project. Production was redeployed and reports push on.
- Google authentication and an FCM validation-only request passed (HTTP
  200), without delivering a notification. A configured Android release
  APK builds; actual phone registration and delivery remain to be tested.
- Production has all four approved migrations (`20261030120000`,
  `20261030121000`, `20261030122000`, `20261101120000`), with no pending
  migrations. Phone session columns, push tables, forced RLS and restricted
  function grants are verified. The approved 30-day customer redaction is
  scheduled nightly at 03:45 UTC (09:15 IST); it was not invoked manually.
- The ignored `config/firebase.json` contains Android and iOS build settings.
  Android's key is restricted to the package and both the debug and upload
  certificates; iOS's key is restricted to the bundle. The upload SHA-1 is
  `9D:02:E3:15:11:BB:AF:20:2D:48:18:84:FD:E7:DC:51:61:93:FB:6C`.
  Firebase also has the upload SHA-256; public fingerprints are in
  `../store/signing/certificate.json`. Google's Play app-signing certificate
  is separate and still needs adding before testing a Play installation.
  Apple APNs credentials are still required for iOS.
- Keep this setup on free versions. Firebase remains on Spark, Vercel on
  Hobby and Supabase on Free; no billing was activated or plan upgraded.
  Do not enroll in paid Apple/Google store programs under the current
  authorization. Install the configured Android APK directly for testing.
  Hobby is the unchanged current plan, not a recommendation for business
  launch: see the commercial-hosting blocker in
  [the Play review](PLAY_STORE_REVIEW.md).

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com>, add a project (Google
   Analytics is not needed), and open **Project settings**.
2. **Cloud Messaging**: check that "Firebase Cloud Messaging API (V1)" is
   enabled.
3. Add an **Android app** with package name `com.chapega.studio`. Skip the
   `google-services.json` download: the app reads the same values from a
   git-ignored file instead (below).
4. For iOS, add an **Apple app** with bundle id `com.chapega.studio`, then
   under **Cloud Messaging → Apple app configuration** upload an APNs
   authentication key (`.p8`) from your Apple developer account.

## 2. Give the server its key

1. In Google Cloud console → IAM → Service accounts, create a service account
   with only the **Firebase Cloud Messaging API Admin** role, and create a
   JSON key for it.
2. In Vercel, add `FCM_SERVICE_ACCOUNT_JSON` (the key file's JSON, or the same
   base64-encoded) as a **Sensitive** environment variable, then redeploy.
   "Push notifications (Chapega Studio app)" in `docs/RUNBOOK.md` has the log
   checks, the database checks and key rotation.

## 3. Give the app its settings

1. Copy `mobile/config/firebase.example.json` to `mobile/config/firebase.json`.
   That file is git-ignored. CI refuses it if it is ever committed.
2. Fill it from Project settings → General → Your apps:

   | Key | Where |
   |---|---|
   | `CHAPEGA_FIREBASE_PROJECT_ID` | Project ID |
   | `CHAPEGA_FIREBASE_SENDER_ID` | Cloud Messaging → Sender ID |
   | `CHAPEGA_FIREBASE_ANDROID_APP_ID` | Android app → App ID (`1:…:android:…`) |
   | `CHAPEGA_FIREBASE_ANDROID_API_KEY` | Android app's `current_key` in its google-services.json, or Google Cloud → Credentials |
   | `CHAPEGA_FIREBASE_IOS_APP_ID` | Apple app → App ID (`1:…:ios:…`) |
   | `CHAPEGA_FIREBASE_IOS_API_KEY` | Apple app's API key |
   | `CHAPEGA_FIREBASE_IOS_BUNDLE_ID` | `com.chapega.studio` |

3. In Google Cloud console → Credentials, **restrict each API key**: the
   Android key to the package `com.chapega.studio` plus your signing
   certificate's SHA-1, the iOS key to the bundle id. These keys identify
   the app, not a secret, but restricting them stops reuse elsewhere.
4. Build with the settings:

   ```sh
   flutter build apk --release --dart-define-from-file=config/firebase.json
   ```

   On Android, Gradle turns the same values into the string resources the
   Google Services plugin would generate (`android/app/build.gradle.kts`),
   so Firebase can start when a push opens the app from closed.

## 4. iOS only

- In Xcode, add the **Push Notifications** capability to the Runner target.
  That adds the `aps-environment` entitlement. A paid Apple developer
  account is needed.
- `FirebaseMessagingAutoInitEnabled` is `NO` in Info.plist: no token is made
  until the person turns push on.

## Checking it works

1. Sign in on a phone, open More → Notifications, turn on push, allow the
   system prompt.
2. Place a kiosk order. The phone shows "New kiosk order" with the order
   number, total and number of items. Tapping it opens the order.
3. The server log shows `push.order_alert` with `sent` at least 1.

If nothing arrives:

- The server may not have `FCM_SERVICE_ACCOUNT_JSON`. The app then shows
  "Alerts start once Chapega.com switches push on".
- The phone may have notifications blocked for Chapega Studio.
- On iOS, the APNs key may be missing in Firebase. The server logs
  `push.apns_not_configured`.
