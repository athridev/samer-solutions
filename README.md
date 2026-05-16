# Samer Solutions

Vercel site for [samer.solutions](https://samer.solutions), based on the Samer
Solutions LinkedIn company page.

The inquiry form posts to `/api/leads`. Submissions are logged in Vercel
function logs and can be forwarded to a CRM or automation endpoint by setting
`LEAD_WEBHOOK_URL` in Vercel.

Security notes:

- The lead endpoint accepts `POST` requests with `application/json` only.
- A honeypot field, payload-size guard, and strict required-field validation are
  in place.
- Webhook forwarding is HTTPS-only and times out quickly if configured.
- Site-wide Vercel headers include a restrictive CSP, frame protection,
  nosniff, referrer policy, and a limited permissions policy.
