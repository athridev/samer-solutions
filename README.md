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

Local Mac export automation:

- `/api/export?format=html` returns a protected HTML lead dashboard with the raw
  JSON embedded inside the file.
- The Mac LaunchAgent `com.samer-solutions.download-leads` can download that
  HTML file into `~/Downloads` once a day.
- The local script expects `~/.samer-solutions-report.env` to contain
  `SAMER_SOLUTIONS_EXPORT_SECRET`, using the same value as `LEAD_EXPORT_SECRET`
  or `CRON_SECRET` in Vercel.

Security notes:

- The lead endpoint accepts `POST` requests with `application/json` only.
- A honeypot field, payload-size guard, and strict required-field validation are
  in place.
- Webhook forwarding is HTTPS-only and times out quickly if configured.
- If the form cannot submit, the page gives customers a mail fallback to
  `adam@samer.solutions`.
- The lead export endpoint requires a bearer secret and is not publicly readable.
- Site-wide Vercel headers include a restrictive CSP, frame protection,
  nosniff, referrer policy, and a limited permissions policy.
