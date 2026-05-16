const REPORT_TO_EMAIL = process.env.LEAD_REPORT_TO || "adam@samer.solutions";
const REPORT_FROM_EMAIL =
  process.env.LEAD_REPORT_FROM || "Samer Solutions <noreply@samer.solutions>";
const REPORT_LOOKBACK_DAYS = 1;

function setResponseHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

function sendJson(response, status, payload) {
  setResponseHeaders(response);
  return response.status(status).json(payload);
}

function getHeader(request, name) {
  return request.headers?.[name] || request.headers?.[name.toLowerCase()] || "";
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function reportDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - REPORT_LOOKBACK_DAYS);
  return dateKey(date);
}

function csvCell(value) {
  const text = String(value || "");
  return `"${text.replace(/"/g, '""')}"`;
}

function leadsToCsv(leads) {
  const columns = [
    "submittedAt",
    "companyName",
    "contactName",
    "email",
    "phone",
    "location",
    "hiringModel",
    "roles",
    "notes",
    "source",
  ];
  const rows = leads.map((lead) => columns.map((column) => csvCell(lead[column])));

  return [columns.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

async function streamToText(stream) {
  const response = new Response(stream);
  return response.text();
}

async function loadLeadsForDay(day) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  }

  const { get, list } = await import("@vercel/blob");
  const leads = [];
  let cursor;

  do {
    const result = await list({
      prefix: `leads/${day}/`,
      cursor,
      limit: 1000,
    });

    for (const blob of result.blobs) {
      const stored = await get(blob.url, { access: "private" });

      if (stored?.statusCode === 200 && stored.stream) {
        leads.push(JSON.parse(await streamToText(stored.stream)));
      }
    }

    cursor = result.cursor;
  } while (cursor);

  return leads.sort((left, right) =>
    String(left.submittedAt).localeCompare(String(right.submittedAt)),
  );
}

async function sendReportEmail({ day, csv, count }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: REPORT_FROM_EMAIL,
      to: [REPORT_TO_EMAIL],
      subject: `Samer Solutions lead report - ${day}`,
      text:
        count === 1
          ? `Attached is 1 customer form submission for ${day}.`
          : `Attached are ${count} customer form submissions for ${day}.`,
      attachments: [
        {
          filename: `samer-solutions-leads-${day}.csv`,
          content: Buffer.from(csv).toString("base64"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend failed with status ${response.status}: ${details}`);
  }
}

function isAuthorized(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = getHeader(request, "authorization");

  if (cronSecret) {
    return authorization === `Bearer ${cronSecret}`;
  }

  return getHeader(request, "user-agent").includes("vercel-cron");
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  if (!isAuthorized(request)) {
    return sendJson(response, 401, { error: "Unauthorized" });
  }

  const day = reportDate();

  try {
    const leads = await loadLeadsForDay(day);
    const csv = leadsToCsv(leads);

    await sendReportEmail({ day, csv, count: leads.length });

    return sendJson(response, 200, {
      ok: true,
      day,
      leads: leads.length,
      sentTo: REPORT_TO_EMAIL,
    });
  } catch (error) {
    console.error("SAMER_SOLUTIONS_DAILY_REPORT_ERROR", error);
    return sendJson(response, 500, {
      error: "Daily report could not be sent.",
      detail: error.message,
    });
  }
};
