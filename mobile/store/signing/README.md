# Public upload certificate

This folder contains the public X.509 certificate and fingerprints for
Chapega Studio's Android upload key. It contains no private key or password.

- App: `com.chapega.studio`.
- Alias: `upload`; RSA 3072; subject: `CN=Chapega Studio Upload`.
- Public PEM: `upload-certificate.pem`; dates and fingerprints: `certificate.json`.
- The upload key is used to sign App Bundles submitted to Play. Google's
  eventual **app-signing certificate**, used for Play installations, is
  separate and still needs to be added to Firebase/API-key restrictions.

The private keystore is outside Git at
`%USERPROFILE%\.chapega-signing\chapega-studio-upload-20261031\`.
Read its `RECOVERY.txt` for local recovery and secure backup instructions.
The signing password is not in this store pack. Windows DPAPI recovery is
bound to the current Windows account/profile; copy the key **and password**
into an encrypted off-device backup before publishing. Do not put the
private keystore, `key.properties` or passwords into git or a Play listing.

Key creation used the installed JDK and incurred no fee. Keep the same
upload key for later releases; do not generate a fresh one per build.
