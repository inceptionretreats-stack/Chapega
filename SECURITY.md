# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

- **GitHub:** [report a vulnerability](https://github.com/inceptionretreats-stack/Chapega/security/advisories/new)
  (private to the maintainers), or
- **Email:** inceptionretreats@gmail.com

Include the page or API route, the steps to reproduce, and what an attacker
could do. You will get a reply when the report has been read.

## Testing rules

- Use your own test shop or a local copy (`npm run dev`). Do not read, change
  or delete another shop's products, orders or customer details.
- No denial-of-service, spam, or automated scanning of the live site.
- Do not send real orders to a shop's WhatsApp number.

## Supported versions

Only the current `main` branch, which is what is deployed, gets fixes.

The same contact is published at `/.well-known/security.txt`. Renew its
`Expires` date before 2027-10-09.
