# Samer Solutions

Vercel site for [samer.solutions](https://samer.solutions), based on the Samer
Solutions LinkedIn company page.

The inquiry form posts to `/api/leads`. Submissions are logged in Vercel
function logs and can be forwarded to a CRM or automation endpoint by setting
`LEAD_WEBHOOK_URL` in Vercel.

Daily CSV reporting:

- Reports are addressed to `adam@samer.solutions` by default. Override with
  `LEAD_REPORT_TO` if needed.
- Set `BLOB_READ_WRITE_TOKEN` through a private Vercel Blob store so successful
  leads are saved for reporting.
- Set `RESEND_API_KEY` and `LEAD_REPORT_FROM` so `/api/report` can email the
  daily CSV attachment.
- Vercel Cron calls `/api/report` every day at 06:00 UTC.
- Set `CRON_SECRET` to require a bearer token on manual report calls.

Security notes:

- The lead endpoint accepts `POST` requests with `application/json` only.
- A honeypot field, payload-size guard, and strict required-field validation are
  in place.
- Webhook forwarding is HTTPS-only and times out quickly if configured.
- If the form cannot submit, the page gives customers a mail fallback to
  `adam@samer.solutions`.
- Site-wide Vercel headers include a restrictive CSP, frame protection,
  nosniff, referrer policy, and a limited permissions policy.
