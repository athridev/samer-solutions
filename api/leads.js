const REQUIRED_FIELDS = [
  "companyName",
  "contactName",
  "email",
  "phone",
  "location",
  "hiringModel",
  "roles",
];

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitize(value, maxLength = 1200) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

async function forwardToWebhook(lead) {
  if (!process.env.LEAD_WEBHOOK_URL) {
    return;
  }

  const response = await fetch(process.env.LEAD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
  });

  if (!response.ok) {
    throw new Error(`Webhook failed with status ${response.status}`);
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const body = request.body || {};

  if (sanitize(body.website)) {
    return response.status(200).json({ ok: true });
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
    return response.status(400).json({
      error: `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    });
  }

  if (!isEmail(lead.email)) {
    return response.status(400).json({ error: "Enter a valid work email." });
  }

  console.log("SAMER_SOLUTIONS_LEAD", JSON.stringify(lead));

  try {
    await forwardToWebhook(lead);
  } catch (error) {
    console.error("SAMER_SOLUTIONS_LEAD_WEBHOOK_ERROR", error);
    return response.status(502).json({
      error: "The brief was received but could not be forwarded. Please try again.",
    });
  }

  return response.status(200).json({ ok: true });
};
