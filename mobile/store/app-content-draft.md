# Play App content — working answers

Prepared on 2026-10-31 from the application source and inspected Android
manifest; status updated 2026-11-02. Privacy URL, No ads, No government
affiliation, No financial features and No health features are now saved in
Play Console, along with the Business category. No Advertising ID, IARC
ratings, 13+ audience and private sign-in details are now saved too.
Data safety remains a partial draft, and public contact/deletion, UGC
safeguards, business hosting and installed-device acceptance remain pending.
Version 2 (`1.0.1 (2) - Gift-ribbon logo`) is the latest Active internal
release, available only to the same authorized owner tester and released
2 November at 11:07 AM IST. It is Not reviewed and has no public production
release or Google app-review request. Version 1 is an earlier historical
release. Its private tester identity and opt-in
link are not included here. Review the current questions and the final
uploaded build before public submission.

## Access and support

- **Sign-in:** required. The app is for existing shop-team accounts and has
  no public self-registration or purchase/subscription gate.
- **Reviewer access:** now provisioned after the owner's new authorization.
  The isolated demo owner has a permanent password and only its demo-shop
  membership, with no platform role. API and web dashboard checks pass;
  private credentials and English instructions are saved in Console. See
  `app-access.md` for setup and remaining Play/native acceptance. Never
  substitute the local preview login or a real shop's credentials.
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
| Category                        | Business is saved in Play Console; final listing review remains pending.                                                                                                                                                                           |
| Audience                        | Ages 13–15, 16–17 and 18+ are saved for the shop-team audience. Regional content ratings still apply.                                                                                         |
| Content rating                  | Owner-approved IARC questionnaire saved: ESRB Everyone, PEGI 3, USK 16 Increased Communication Risks, other displayed regional ratings 3; Users Interact.                |
| Financial features              | No banking, credit, investing, insurance or digital-payment SDK found; shop order totals are displayed and payment is at the counter. Answer the actual Console questionnaire accordingly.                                            |
| Health / government / news      | No corresponding functionality found; confirm the current form's exact scope rather than skipping required declarations.                                                                                                              |
| Sensitive permissions           | Internet/FCM and notification-related permissions are present. No location, contacts, Advertising ID or broad photo-library/storage permissions were found in the release manifest. Product photos use the system picker/camera flow. |
| Independent security validation | No independent certification has been obtained. Automated project tests are not a certification.                                                                                                                                      |

## UGC safeguards still required

The IARC answers disclose native user interaction through shared team
content. The current app has no in-app reporting or moderation workflow;
owner access administration and product archiving do not establish these
features. A reviewed objectionable-content policy and terms-acceptance flow
are also still required. Google's UGC policy explicitly covers apps shared
within a defined company user set. Implement and verify proportionate
terms, reporting and moderation before public submission.
[UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en).

## Data safety draft

Only the initial collection Yes, encryption-in-transit Yes and
username/password account-creation answers are saved. The deletion URL is
blank because the live route still uses a sample contact. Data types,
sharing/handling and remaining answers are incomplete.

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
versions. The owner has deferred public contact details; reviewer access
is now saved. The Data safety declaration remains incomplete.

Sources: [App setup and required support email](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en),
[App review access](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en),
[Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en),
[Firebase SDK disclosure](https://firebase.google.com/docs/android/play-data-disclosure),
[Content rating](https://support.google.com/googleplay/android-developer/answer/9859655?hl=en).
