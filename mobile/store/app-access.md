# App access — saved reviewer setup

Updated 2026-11-02. Following the owner's explicit authorization, a dedicated
review shop and reusable owner account are provisioned. The initial temporary
password was replaced through the normal API flow. Credentials and
460-character English instructions are saved privately in Play Console's
sign-in details. No password, token, private account identity or real shop
account is included in this repository.

The app requires an existing Chapega shop-team account. There is no public
self-signup, purchase or subscription needed to use an assigned account.

## Verified setup and remaining acceptance

- The internal track is Active and version 1 is available only to the
  authorized owner tester. Console shows Not reviewed; this is not a public
  production release or an app-review request. Its private opt-in link and
  tester identity are retained outside this repository.

- The account has no platform role and belongs only to its isolated demo
  shop. A cross-tenant request was rejected.
- The demo has three synthetic products and three orders at confirmed,
  preparing and ready statuses. Customer phone fields are blank and product
  image requests return HTTP 200. No real customer or stock is involved.
- Phone API sign-in, permanent-password change, session, tenant isolation
  and logout were verified. The web demo dashboard was also checked.
- The public demo kiosk has its preview label enabled and ordering paused.
  Optional Google-partner device testing is off in Console.
- A physical Play installation, native image decoding, FCM delivery and
  16 KB runtime behavior are still unverified. The API/web checks and active
  track do not establish these checks.

## Keep the reviewer account usable

- Use a dedicated demo shop with fictional products, orders and customer
  details. Keep it active on the same backend origin as the submitted build.
- Give the reviewer an owner account so every management screen is visible.
  Replace its initial temporary password before supplying the credentials.
- Keep the account usable throughout review. It must not require a person
  to approve sign-in, send a one-time code or supply a second password.
- Keep the account's email and permanent password private in Console and
  owner recovery records. The general development preview account is not
  the provisioned reviewer login.
- Record the demo shop's display name in the Console instructions. If the
  account has multiple shops, identify the one reviewers should choose.
- Ensure demo-only edits are acceptable. No action should send a message to
  a real customer or change a real shop's stock.

## English walkthrough

1. Open Chapega Studio and sign in using the review email and password
   supplied in this App access form.
2. If a shop chooser appears, choose the demo shop named in this form.
3. Home shows sample orders and stock. Open Orders to inspect an order,
   its items and timeline. An order advances one status at a time.
4. Open Products to inspect or edit a sample product, its stock and photo.
5. Open Shop settings to inspect the demo kiosk's settings.
6. More contains Team, Change password, Notifications and About. About
   links to the public privacy notice, account-deletion instructions and
   open-source licences.
7. Notifications are optional. The other screens remain available when
   notification permission is denied.

The concise English Console instructions are saved with the private login.
Before public submission, verify that the same credentials and walkthrough
work on the actual Play-installed build. The public support and deletion
contact remains unchanged at the owner's request.
