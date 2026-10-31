# Chapega Studio (Flutter)

The phone app for shop owners, managers and staff: the same Studio as the web
(`/vendor/<shop>`), built with Flutter for Android and iOS. It talks to the
Chapega.com API; it has no backend of its own.

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
