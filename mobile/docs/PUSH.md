# Push notifications for Chapega Studio

New kiosk orders can reach staff phones even when the app is closed. The
whole path is built in, but it stays off until a Firebase project exists:

- **Without Firebase** (today), the app alerts only while it is open: a banner,
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
