# Public signing certificates

This folder contains the public X.509 certificate and fingerprints for
Chapega Studio's Android upload key. It contains no private key or password.

- App: `com.chapega.studio`.
- Alias: `upload`; RSA 3072; subject: `CN=Chapega Studio Upload`.
- Public PEM: `upload-certificate.pem`; dates and fingerprints: `certificate.json`.
- The upload key signs App Bundles submitted to Play. Google's managed
  **app-signing keys**, used for Play installations, are separate.
- `play-app-signing-certificates.json` records the current Google-managed
  signer and both certificates from the previous quantum-ready beta key.
  All three SHA-1/SHA-256 pairs are registered in Firebase; their SHA-1s are
  in the Android API-key restriction alongside debug/upload certificates.
  The five package/certificate entries and existing 25-API allowlist were
  verified after saving on 2026-11-02. No Google private key was downloaded
  and no signing-key change was requested.

The private keystore is outside Git at
`%USERPROFILE%\.chapega-signing\chapega-studio-upload-20261031\`.
Read its `RECOVERY.txt` for local recovery and secure backup instructions.
The signing password is not in this store pack. Windows DPAPI recovery is
bound to the current Windows account/profile; copy the key **and password**
into an encrypted off-device backup before publishing. Do not put the
private keystore, `key.properties` or passwords into git or a Play listing.

Key creation used the installed JDK and incurred no fee. Keep the same
upload key for later releases; do not generate a fresh one per build.
