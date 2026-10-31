# Chapega Studio (Flutter)

The phone app for shop owners, managers and staff: the same Studio as the web
(`/vendor/<shop>`), built with Flutter for Android and iOS. It talks to the
Chapega.com API; it has no backend of its own.

What it does, by role (the same rules as the web Studio):

| | Owner | Manager | Staff |
|---|---|---|---|
| Home: today, live orders, low stock, shop status | ✓ | ✓ | ✓ |
| Orders: new-order alerts, status changes, cancelling | ✓ | ✓ | ✓ |
| Orders: removing customer details | ✓ | ✓ | |
| Products: add, edit, photos, stock, show/hide, archive | ✓ | ✓ | |
| Shop settings | ✓ | | |
| Team: add people, roles, temporary passwords | ✓ | | |
| Own password, notifications, appearance, switching shops | ✓ | ✓ | ✓ |

## Requirements

- Flutter 3.44.8 (Dart 3.12). CI clones exactly this tag.
- Android: Android SDK 36, Java 21, an emulator or a phone with USB debugging.
- iOS: a Mac with Xcode. The iOS project is maintained but only compiled in CI
  on demand (`.github/workflows/mobile.yml`, manual run with "ios").

## Commands

Run from `mobile/`:

```sh
flutter pub get
flutter analyze --fatal-infos
flutter test
flutter run                      # debug build on the connected device/emulator
flutter build apk --release      # release APK (debug-signed without android/key.properties)
```

From the repository root, `npm run check:mobile` runs analyze and test.

Run one Flutter command at a time in this folder. Each one regenerates the
Android plugin registrant for its own build mode, so a `flutter test` or
`flutter analyze` during `flutter build apk --release` breaks the release
build with "package dev.flutter.plugins.integration_test does not exist".

## Which server the app talks to

The API origin is set at build time:

```sh
flutter run --dart-define=CHAPEGA_API_ORIGIN=http://10.0.2.2:3000
```

- Release builds default to `https://chapega.vercel.app` and refuse anything
  but HTTPS.
- Debug builds default to the development server on this computer:
  `http://10.0.2.2:3000` on the Android emulator (10.0.2.2 is the host), and
  `http://localhost:3000` on the iOS simulator. Plain HTTP is allowed only for
  those hosts.

To try the app against a production build of the web app on this computer
(closer to the real thing than `next dev`):

```sh
# repository root, with the local backend's variables set (see .env.example)
npm run build
npx next start --port 3300
# mobile/
flutter run --dart-define=CHAPEGA_API_ORIGIN=http://10.0.2.2:3300
```

## Integration test

`integration_test/studio_flow_test.dart` runs the real app against a real
server: it signs in, opens every tab, a product, an order, the team and About,
then signs out. It changes nothing on the server except the phone session.
With the server running as above and an emulator started:

```sh
flutter test integration_test/studio_flow_test.dart \
  --dart-define=CHAPEGA_API_ORIGIN=http://10.0.2.2:3300 \
  --dart-define=CHAPEGA_IT_EMAIL=<an owner's sign-in on that server> \
  --dart-define=CHAPEGA_IT_PASSWORD=<its password>
```

It needs an owner (it opens Team), and a product and an order in the shop for
the full walk. In development the built-in preview account described in
`.env.example` works. Don't point it at production.

## Where things are

```
lib/
  bootstrap/        build-time config, Firebase values, provider wiring
  core/             HTTP client, secure storage, preferences, platform channel
  data/  models/    API calls and the JSON they return
  domain/           order status, money, stock and validation rules shared
                    with the web (pinned by tests/parity/domain-vectors.json)
  features/         one folder per screen group: session, studio (shell,
                    sync), orders, alerts, products, settings, team, account,
                    notifications, shops
  routing/          go_router locations and the sign-in/role gates
  theme/  ui/       colours, type and shared widgets
test/               unit and widget tests (fakes in test/helpers)
integration_test/   the end-to-end walk above
```

## Privacy

Orders carry customer names and phone numbers, so the app keeps them off the
phone as far as it can:

- Only the session token is stored, in the Android Keystore or iOS Keychain.
  Orders, products and photos stay in memory and are gone when the app closes.
- The recent-apps thumbnail (Android 13+) and the iOS app switcher show a
  cover, not the screen.
- Notifications show the order number, total and item count only, and are
  private on the lock screen.

## Notifications and push

New-order alerts work while the app is open. Push notifications for a closed
app need a Firebase project. See [docs/PUSH.md](docs/PUSH.md).

## Icons and launch screen

The launcher icons come from `assets/branding` (rendered from the SVGs there,
which are the web app's `app/icon.svg` mark). After changing them, run
`dart run flutter_launcher_icons`. Then undo two things it gets wrong in
version 0.14.4: its edit to `ios/Runner.xcodeproj/project.pbxproj` (it sets
`ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS` to `AppIcon`),
and its rewrite of `ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json`
(it adds iOS 6 sizes). Keep the regenerated PNGs.

## Releasing

Signing, version numbers, store listings and the privacy forms are in
[docs/RELEASE.md](docs/RELEASE.md).
