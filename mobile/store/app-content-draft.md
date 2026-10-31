# Play App content — working answers

Prepared on 2026-10-31 from the application source and inspected Android
manifest. These answers have not been entered or submitted in Play Console.
Review the current questions and the final uploaded build before submission.

## Access and support

- **Sign-in:** required. The app is for existing shop-team accounts and has
  no public self-registration or purchase/subscription gate.
- **Reviewer access:** pending at the owner's request. Use the English
  walkthrough in `app-access.md` after a dedicated demo shop and stable
  owner login have been provisioned and tested. Never submit the local
  development preview login or a real shop's credentials.
- **Support and deletion contact:** deferred by the owner. No email or
  phone is invented in this pack. The live deletion page still uses a
  sample WhatsApp number; do not declare that channel verified.
- **Privacy URL:** `https://chapega.vercel.app/privacy`.
- **Deletion URL:** `https://chapega.vercel.app/delete-account`.
  The app links to it through More → About. Removing a team membership is
  different from deleting the platform account.

## Declarations to review

| Form                            | Source-based draft                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ads                             | No advertising SDK or ad-placement UI found. The manifest does not request Advertising ID access.                                                                                                                                     |
| Category                        | Business is the proposed category, subject to owner review.                                                                                                                                                                           |
| Audience                        | Intended for shop owners, managers and staff; the current release guide proposes adults. The owner must confirm the actual intended audience.                                                                                         |
| Content rating                  | Complete the IARC questionnaire accurately; do not invent a rating. There is no public social feed/chat, but merchants enter product text/images and teams see order notes. Account for those actual content features.                |
| Financial features              | No banking, credit, investing, insurance or digital-payment SDK found; shop order totals are displayed and payment is at the counter. Answer the actual Console questionnaire accordingly.                                            |
| Health / government / news      | No corresponding functionality found; confirm the current form's exact scope rather than skipping required declarations.                                                                                                              |
| Sensitive permissions           | Internet/FCM and notification-related permissions are present. No location, contacts, Advertising ID or broad photo-library/storage permissions were found in the release manifest. Product photos use the system picker/camera flow. |
| Independent security validation | No independent certification has been obtained. Automated project tests are not a certification.                                                                                                                                      |

## Data safety draft

**Data is collected.** Do not declare the app data-free merely because it
has no advertising or analytics SDK. See `../docs/PLAY_STORE_REVIEW.md` for
the category inventory and `../docs/RELEASE.md` for source-based data flows.

- Email/user identifiers support sign-in, account management and security.
- Chapega's random install identifier supports device sessions; Firebase
  has separate installation/token and metadata processing for messaging.
- Optional management features send team details, shop settings, catalogue
  text and product photos. Photos are stripped of metadata by the phone
  pipeline and by the server's stored-image pipeline.
- Changes and requests create operational/audit records. No advertising,
  analytics or crash-reporting SDK was found.
- Release API traffic uses HTTPS. Server-stored data is generally not
  ephemeral. Theme/alert preferences and in-memory order downloads are
  different from data uploaded to the service.
- Provider processing and explicit user-initiated Call/WhatsApp/Share
  transfers must be evaluated against Google's sharing exceptions; do not
  assume that no data reaches another company.
- A verified support process is needed for full account deletion. The
  runbook includes attribution checks for historical order-event names.
  Remote account deletion does not itself delete Google's Firebase
  installation record or every provider log/backup copy.

Before submission, verify the actual hosted privacy notice, monitored
request channel, provider arrangements, retention practices and final SDK
versions. The owner has deferred contact and reviewer provisioning, so
these declarations remain drafts.

Sources: [App setup and required support email](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en),
[App review access](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en),
[Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en),
[Firebase SDK disclosure](https://firebase.google.com/docs/android/play-data-disclosure),
[Content rating](https://support.google.com/googleplay/android-developer/answer/9859655?hl=en).
