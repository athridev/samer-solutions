const REQUIRED_FIELDS = [
  "companyName",
  "contactName",
  "email",
  "phone",
  "location",
  "hiringModel",
  "roles",
];

const ALLOWED_HIRING_MODELS = new Set([
  "Permanent",
  "Contracting",
  "Hybrid",
  "Multiple roles",
]);

const MAX_CONTENT_LENGTH = 10000;
const WEBHOOK_TIMEOUT_MS = 5000;

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitize(value, maxLength = 1200) {
  return String(value || "")
    .replace(/\s+/g, " ")
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

  let response;

  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "samer-solutions-lead-form",
      },
      body: JSON.stringify(lead),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Webhook failed with status ${response.status}`);
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  const contentLength = Number(getHeader(request, "content-length") || 0);

  if (contentLength > MAX_CONTENT_LENGTH) {
    return sendJson(response, 413, { error: "The brief is too large." });
  }

  const contentType = String(getHeader(request, "content-type"));

  if (!contentType.includes("application/json")) {
    return sendJson(response, 415, { error: "Send the brief as JSON." });
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

  const lead = {
    companyName: sanitize(body.companyName, 160),
    contactName: sanitize(body.contactName, 160),
    email: sanitize(body.email, 240).toLowerCase(),
    phone: sanitize(body.phone, 80),
    location: sanitize(body.location, 160),
    hiringModel: sanitize(body.hiringModel, 80),
    roles: sanitize(body.roles),
    notes: sanitize(body.notes),
    submittedAt: new Date().toISOString(),
    source: "samer.solutions",
  };

  const missing = REQUIRED_FIELDS.filter((field) => !lead[field]);

  if (missing.length) {
    return sendJson(response, 400, {
      error: `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    });
  }

  if (!isEmail(lead.email)) {
    return sendJson(response, 400, { error: "Enter a valid work email." });
  }

  if (!ALLOWED_HIRING_MODELS.has(lead.hiringModel)) {
    return sendJson(response, 400, { error: "Select a valid hiring model." });
  }

  console.log("SAMER_SOLUTIONS_LEAD", JSON.stringify(lead));

  try {
    await forwardToWebhook(lead);
  } catch (error) {
    console.error("SAMER_SOLUTIONS_LEAD_WEBHOOK_ERROR", error);
    return sendJson(response, 502, {
      error: "The brief was received but could not be forwarded. Please try again.",
    });
  }

  return sendJson(response, 200, { ok: true });
};
