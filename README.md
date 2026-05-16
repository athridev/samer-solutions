# Samer Solutions

Vercel site for [samer.solutions](https://samer.solutions), based on the Samer
Solutions LinkedIn company page.

The inquiry form posts to `/api/leads`. Submissions are logged in Vercel
function logs and can be forwarded to a CRM or automation endpoint by setting
`LEAD_WEBHOOK_URL` in Vercel.
