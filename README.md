# Samer Solutions

Vercel site for [samer.solutions](https://samer.solutions), based on the Samer
Solutions LinkedIn company page.

The inquiry form posts to `/api/leads`. Successful submissions are stored in the
private Vercel Blob store connected to the production and preview deployments.

Admin dashboard:

- Admin page: `/admin`
- The login flow requires username/password first, then a one-time code sent to
  the configured admin email.
- The admin session is stored in a short-lived, HttpOnly, Secure, SameSite cookie.
- The dashboard can search, inspect, and export customer form submissions as JSON
  or CSV.

Required Vercel environment variables:

- `BLOB_READ_WRITE_TOKEN`: private Vercel Blob token for storing and reading lead
  submissions and one-time login challenges.
- `RESEND_API_KEY`: sends the one-time admin login code.
- `ADMIN_USERNAME`: use `admin`.
- `ADMIN_PASSWORD`: set this to the admin password in Vercel, not in GitHub.
- `ADMIN_EMAIL`: use `adam@samer.solutions`.
- `ADMIN_EMAIL_FROM`: verified Resend sender, for example
  `Samer Solutions <adam@samer.solutions>`.
- `ADMIN_SESSION_SECRET`: long random string for signing admin cookies.

Optional:

- `ADMIN_PASSWORD_SHA256`: SHA-256 hash of the admin password. If set, this is
  used instead of `ADMIN_PASSWORD`.
- `LEAD_WEBHOOK_URL`: HTTPS endpoint to also forward public form submissions to a
  CRM or automation service.

Security notes:

- The public lead endpoint accepts `POST` requests with `application/json` only.
- A honeypot field, payload-size guard, and strict required-field validation are
  in place.
- Webhook forwarding is HTTPS-only and times out quickly if configured.
- If the form cannot submit, the page gives customers a mail fallback to
  `adam@samer.solutions`.
- Admin lead data is only available after password plus email code verification.
- Site-wide Vercel headers include a restrictive CSP, frame protection,
  nosniff, referrer policy, and a limited permissions policy.
