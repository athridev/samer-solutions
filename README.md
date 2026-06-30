# Samer Solutions

Vercel site for [samer.solutions](https://samer.solutions).

Samer Solutions is positioned as a Dubai-based boutique tech recruitment
partner for SaaS, fintech, cloud, and AI companies hiring DevOps, SRE,
platform, cloud, infrastructure, security, operations, and engineering
leadership talent.

## Public hiring request flow

The homepage form posts JSON to `/api/leads`.

Successful submissions:

- Validate required fields server-side and client-side.
- Reject bots through a honeypot field.
- Apply a basic per-IP rate limit.
- Store the request in private Vercel Blob storage.
- Send a Resend email notification to the configured admin email.
- Keep a mail fallback to `adam@samer.solutions` if the browser request fails.

Stored lead records include both the current fields and legacy aliases so older
admin/export code and previous submissions stay readable.

## Admin dashboard

- Admin page: `/admin`
- Login requires username/password first, then a one-time code sent by email.
- Admin sessions use a short-lived, HttpOnly, Secure, SameSite cookie.
- Company hiring requests can be searched, opened, edited, exported, archived,
  deleted, prioritized, tagged, and updated with internal notes.
- Lead statuses: `New`, `Contacted`, `Qualified`, `Closed`, `Archived`.
- The Candidate intake tab lets an admin generate one-time public links for
  candidate profile, CV, consent, and signature collection.

## Required Vercel environment variables

- `BLOB_READ_WRITE_TOKEN`: private Vercel Blob token for lead submissions,
  admin login challenges, candidate links, candidate profiles, and CV files.
- `RESEND_API_KEY`: sends admin one-time login codes and new hiring request
  notifications.
- `ADMIN_USERNAME`: use `admin`.
- `ADMIN_PASSWORD`: set the admin password in Vercel, not in GitHub.
- `ADMIN_EMAIL`: use `adam@samer.solutions`.
- `ADMIN_EMAIL_FROM`: verified Resend sender, for example
  `Samer Solutions <adam@samer.solutions>`.
- `ADMIN_SESSION_SECRET`: long random value for signing admin cookies.

## Optional environment variables

- `ADMIN_PASSWORD_SHA256`: SHA-256 hash of the admin password. If set, this is
  used instead of `ADMIN_PASSWORD`.
- `LEAD_REPORT_TO`: overrides the lead notification recipient. Defaults to
  `ADMIN_EMAIL`, then `adam@samer.solutions`.
- `LEAD_EMAIL_FROM`: overrides the lead notification sender. Defaults to
  `ADMIN_EMAIL_FROM`.
- `LEAD_WEBHOOK_URL`: HTTPS endpoint to also forward public form submissions to
  a CRM or automation service.
- `PUBLIC_SITE_URL`: canonical production URL used when generating candidate
  links.

## Local checks

The repo has no build step because it is a static site with Vercel serverless
functions.

Run syntax checks when Node is available:

```sh
npm run check
```

For local browser QA, serve the folder with any static server and mock the API
routes if Vercel env vars are not available locally.

## Security notes

- Public lead submissions accept `POST` with `application/json` only.
- Lead payloads have a size limit, required-field validation, controlled select
  values, honeypot protection, and basic rate limiting.
- Admin data APIs require a valid signed admin session server-side.
- Admin write routes use same-origin checks.
- OTP challenges are private Blob records with expiry and limited attempts.
- Candidate intake links use high-entropy tokens, private invite records,
  expiry, revocation, and one-time-use state.
- Candidate submissions validate consent, signature data, and CV file type/size.
- Site-wide Vercel headers include a restrictive CSP, frame protection,
  nosniff, referrer policy, and a limited permissions policy.
