const crypto = require("node:crypto");

const REQUIRED_FIELDS = [
  "name",
  "email",
  "company",
  "roleTitle",
  "hiringType",
  "seniority",
  "locationRequirement",
  "message",
];

const ALLOWED_HIRING_TYPES = new Set(["Permanent", "Contract", "Hybrid", "Not sure"]);
const ALLOWED_SENIORITY = new Set([
  "Mid",
  "Senior",
  "Lead",
  "Manager",
  "Executive",
  "Not sure",
]);
const ALLOWED_LOCATION_REQUIREMENTS = new Set([
  "Dubai onsite",
  "Dubai hybrid",
  "Remote but Dubai company",
  "Not sure",
]);

const MAX_CONTENT_LENGTH = 12000;
const WEBHOOK_TIMEOUT_MS = 5000;
const EMAIL_TIMEOUT_MS = 7000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitStore = new Map();

function reportToEmail() {
  return process.env.LEAD_REPORT_TO || process.env.ADMIN_EMAIL || "adam@samer.solutions";
}

function reportFromEmail() {
  return (
    process.env.LEAD_EMAIL_FROM ||
    process.env.ADMIN_EMAIL_FROM ||
    "Samer Solutions <adam@samer.solutions>"
  );
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitize(value, maxLength = 1200) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeLong(value, maxLength = 2800) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLength);
}

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

function parseBody(body) {
  if (typeof body === "string") {
    return JSON.parse(body);
  }

  return body || {};
}

function requireSameOrigin(request, response) {
  const origin = getHeader(request, "origin");

  if (!origin) {
    return true;
  }

  const host = getHeader(request, "host");

  try {
    if (new URL(origin).host === host) {
      return true;
    }
  } catch {
    // Fall through to the 403 response.
  }

  sendJson(response, 403, { error: "Invalid request origin." });
  return false;
}

function clientKey(request) {
  const forwarded = String(getHeader(request, "x-forwarded-for")).split(",")[0].trim();
  const ip = forwarded || getHeader(request, "x-real-ip") || request.socket?.remoteAddress || "unknown";
  return crypto.createHash("sha256").update(`lead:${ip}`).digest("hex").slice(0, 32);
}

function rateLimit(request) {
  const key = clientKey(request);
  const now = Date.now();
  const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  entry.count += 1;
  rateLimitStore.set(key, entry);

  for (const [storedKey, storedEntry] of rateLimitStore) {
    if (now > storedEntry.resetAt) {
      rateLimitStore.delete(storedKey);
    }
  }

  return entry.count <= RATE_LIMIT_MAX;
}

function normalizeHiringType(value) {
  const clean = sanitize(value, 80);
  const aliases = {
    Contracting: "Contract",
    "Contract or project team": "Contract",
    "Not sure yet": "Not sure",
    "Still shaping the need": "Not sure",
    "One important hire": "Permanent",
    "Multiple hires": "Permanent",
    "Multiple roles": "Permanent",
  };

  return aliases[clean] || clean;
}

function normalizeLead(body, request) {
  const hiringType = normalizeHiringType(body.hiringType || body.hiringModel);
  const roleTitle = sanitize(body.roleTitle || body.roles, 180);
  const message = sanitizeLong(body.message || body.notes || body.roles, 2600);
  const locationRequirement = sanitize(body.locationRequirement || body.location, 120);
  const submittedAt = new Date().toISOString();

  return {
    name: sanitize(body.name || body.contactName, 160),
    contactName: sanitize(body.name || body.contactName, 160),
    email: sanitize(body.email, 240).toLowerCase(),
    phone: sanitize(body.phone, 80),
    company: sanitize(body.company || body.companyName, 180),
    companyName: sanitize(body.company || body.companyName, 180),
    roleTitle,
    roles: roleTitle,
    hiringType,
    hiringModel: hiringType,
    seniority: sanitize(body.seniority || "Not sure", 80),
    locationRequirement,
    location: locationRequirement,
    message,
    notes: message,
    submittedAt,
    source: "samer.solutions",
    userAgent: sanitize(getHeader(request, "user-agent"), 280),
    admin: {
      status: "new",
      priority: "normal",
      read: false,
      starred: false,
      archived: false,
      ownerNotes: "",
      nextStepAt: "",
      tags: [],
      updatedAt: "",
      updatedBy: "",
      history: [],
    },
  };
}

function validateLead(lead) {
  const missing = REQUIRED_FIELDS.filter((field) => !lead[field]);

  if (missing.length) {
    return `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`;
  }

  if (!isEmail(lead.email)) {
    return "Enter a valid work email.";
  }

  if (!ALLOWED_HIRING_TYPES.has(lead.hiringType)) {
    return "Select a valid hiring type.";
  }

  if (!ALLOWED_SENIORITY.has(lead.seniority)) {
    return "Select a valid seniority.";
  }

  if (!ALLOWED_LOCATION_REQUIREMENTS.has(lead.locationRequirement)) {
    return "Select a valid location requirement.";
  }

  return "";
}

function getWebhookUrl() {
  if (!process.env.LEAD_WEBHOOK_URL) {
    return "";
  }

  const url = new URL(process.env.LEAD_WEBHOOK_URL);

  if (url.protocol !== "https:") {
    throw new Error("LEAD_WEBHOOK_URL must use HTTPS.");
  }

  return url.toString();
}

async function forwardToWebhook(lead) {
  const webhookUrl = getWebhookUrl();

  if (!webhookUrl) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "samer-solutions-lead-form",
      },
      body: JSON.stringify(lead),
      signal: controller.signal,
    });

    if (!webhookResponse.ok) {
      throw new Error(`Webhook failed with status ${webhookResponse.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function storeLead(lead) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  }

  const { put } = await import("@vercel/blob");
  const day = lead.submittedAt.slice(0, 10);
  const safeTimestamp = lead.submittedAt.replace(/[:.]/g, "-");

  await put(`leads/${day}/${safeTimestamp}.json`, JSON.stringify({ ...lead, reportTo: reportToEmail() }), {
    access: "private",
    addRandomSuffix: true,
    contentType: "application/json",
  });
}

function emailText(lead) {
  return [
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Phone / WhatsApp: ${lead.phone || "-"}`,
    `Company: ${lead.company}`,
    `Role / title needed: ${lead.roleTitle}`,
    `Hiring type: ${lead.hiringType}`,
    `Seniority: ${lead.seniority}`,
    `Location requirement: ${lead.locationRequirement}`,
    `Submitted at: ${lead.submittedAt}`,
    "",
    "Message:",
    lead.message,
  ].join("\n");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailHtml(lead) {
  const rows = [
    ["Name", lead.name],
    ["Email", lead.email],
    ["Phone / WhatsApp", lead.phone || "-"],
    ["Company", lead.company],
    ["Role / title needed", lead.roleTitle],
    ["Hiring type", lead.hiringType],
    ["Seniority", lead.seniority],
    ["Location requirement", lead.locationRequirement],
    ["Submitted at", lead.submittedAt],
  ]
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e7e0d2;color:#6a655b;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e7e0d2;color:#171612;"><strong>${escapeHtml(value)}</strong></td>
        </tr>`,
    )
    .join("");

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f1ea;color:#171612;padding:24px;">
      <div style="max-width:680px;margin:0 auto;background:#fffaf0;border:1px solid #e0d8c9;border-radius:8px;overflow:hidden;">
        <div style="padding:22px 24px;border-bottom:1px solid #e0d8c9;">
          <p style="margin:0 0 8px;color:#6a655b;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Samer Solutions</p>
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:500;line-height:1.05;">New hiring request</h1>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>
        <div style="padding:22px 24px;">
          <p style="margin:0 0 10px;color:#6a655b;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Message</p>
          <p style="margin:0;white-space:pre-wrap;line-height:1.6;">${escapeHtml(lead.message)}</p>
        </div>
      </div>
    </div>`;
}

async function sendLeadEmail(lead) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("SAMER_SOLUTIONS_LEAD_EMAIL_SKIPPED RESEND_API_KEY missing");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);

  try {
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: reportFromEmail(),
        to: [reportToEmail()],
        reply_to: lead.email,
        subject: `New Samer Solutions hiring request - ${lead.company}`,
        text: emailText(lead),
        html: emailHtml(lead),
      }),
      signal: controller.signal,
    });

    if (!emailResponse.ok) {
      const details = await emailResponse.text();
      throw new Error(`Resend failed with status ${emailResponse.status}: ${details}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  if (!requireSameOrigin(request, response)) {
    return;
  }

  const contentLength = Number(getHeader(request, "content-length") || 0);

  if (contentLength > MAX_CONTENT_LENGTH) {
    return sendJson(response, 413, { error: "The request is too large." });
  }

  const contentType = String(getHeader(request, "content-type"));

  if (!contentType.includes("application/json")) {
    return sendJson(response, 415, { error: "Send the request as JSON." });
  }

  if (!rateLimit(request)) {
    return sendJson(response, 429, {
      error: "Too many requests. Please wait a few minutes or email adam@samer.solutions.",
    });
  }

  let body;

  try {
    body = parseBody(request.body);
  } catch {
    return sendJson(response, 400, { error: "Invalid JSON." });
  }

  if (!body || Array.isArray(body) || typeof body !== "object") {
    return sendJson(response, 400, { error: "Invalid request body." });
  }

  if (sanitize(body.website)) {
    return sendJson(response, 200, { ok: true });
  }

  const lead = normalizeLead(body, request);
  const validationError = validateLead(lead);

  if (validationError) {
    return sendJson(response, 400, { error: validationError });
  }

  console.log("SAMER_SOLUTIONS_LEAD", JSON.stringify({
    company: lead.company,
    email: lead.email,
    roleTitle: lead.roleTitle,
    submittedAt: lead.submittedAt,
  }));

  try {
    await storeLead(lead);
  } catch (error) {
    console.error("SAMER_SOLUTIONS_LEAD_STORAGE_ERROR", error);
    return sendJson(response, 502, {
      error: "The request could not be saved. Please try again or email adam@samer.solutions.",
    });
  }

  try {
    await sendLeadEmail(lead);
  } catch (error) {
    console.error("SAMER_SOLUTIONS_LEAD_EMAIL_ERROR", error);
  }

  try {
    await forwardToWebhook(lead);
  } catch (error) {
    console.error("SAMER_SOLUTIONS_LEAD_WEBHOOK_ERROR", error);
  }

  return sendJson(response, 200, { ok: true });
};
