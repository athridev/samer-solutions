const crypto = require("node:crypto");

const MAX_JSON_BODY = 20000;
const ADMIN_COOKIE = "samer_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const CODE_TTL_SECONDS = 60 * 10;
const MAX_CODE_ATTEMPTS = 5;
const LEAD_PREFIX = "leads/";
const ALLOWED_STATUSES = new Set(["new", "reviewing", "contacted", "qualified", "closed"]);
const ALLOWED_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const EDITABLE_LEAD_FIELDS = new Set([
  "companyName",
  "contactName",
  "email",
  "phone",
  "location",
  "hiringModel",
  "roles",
  "notes",
]);

function getHeader(request, name) {
  return request.headers?.[name] || request.headers?.[name.toLowerCase()] || "";
}

function setJsonHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

function sendJson(response, status, payload) {
  setJsonHeaders(response);
  return response.status(status).json(payload);
}

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function hmac(value, secret = adminSecret()) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function adminSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.CRON_SECRET || requiredEnv("ADMIN_SESSION_SECRET");
}

function adminUsername() {
  return process.env.ADMIN_USERNAME || "admin";
}

function adminEmail() {
  return process.env.ADMIN_EMAIL || process.env.LEAD_REPORT_TO || "adam@samer.solutions";
}

function adminEmailFrom() {
  return process.env.ADMIN_EMAIL_FROM || process.env.LEAD_REPORT_FROM || "Samer Solutions <adam@samer.solutions>";
}

async function parseJsonBody(request) {
  const contentLength = Number(getHeader(request, "content-length") || 0);

  if (contentLength > MAX_JSON_BODY) {
    const error = new Error("Request body is too large.");
    error.status = 413;
    throw error;
  }

  const contentType = String(getHeader(request, "content-type"));

  if (!contentType.includes("application/json")) {
    const error = new Error("Send JSON.");
    error.status = 415;
    throw error;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body);
  }

  return request.body || {};
}

function passwordMatches(password) {
  if (process.env.ADMIN_PASSWORD_SHA256) {
    const hash = crypto.createHash("sha256").update(String(password || "")).digest("hex");
    return safeEqual(hash, process.env.ADMIN_PASSWORD_SHA256);
  }

  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (!configuredPassword) {
    throw new Error("ADMIN_PASSWORD is not configured.");
  }

  return safeEqual(password, configuredPassword);
}

function credentialsMatch({ username, password }) {
  return safeEqual(username, adminUsername()) && passwordMatches(password);
}

function codeHash(challengeId, code) {
  return hmac(`${challengeId}:${code}`);
}

async function putPrivateJson(pathname, payload) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  }

  const { put } = await import("@vercel/blob");

  return put(pathname, JSON.stringify(payload), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function getPrivateJson(pathname) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  }

  const { get } = await import("@vercel/blob");
  const stored = await get(pathname, { access: "private" });

  if (stored?.statusCode !== 200 || !stored.stream) {
    return null;
  }

  const text = await new Response(stored.stream).text();
  return JSON.parse(text);
}

async function deletePrivateBlob(pathname) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return;
  }

  const { del } = await import("@vercel/blob");
  await del(pathname);
}

function sanitizeText(value, maxLength = 1200) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeLongText(value, maxLength = 5000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function leadIdFromPath(pathname) {
  return base64url(pathname);
}

function leadPathFromId(id) {
  let pathname;

  try {
    pathname = fromBase64url(id);
  } catch {
    const error = new Error("Invalid lead id.");
    error.status = 400;
    throw error;
  }

  if (!pathname.startsWith(LEAD_PREFIX) || !pathname.endsWith(".json")) {
    const error = new Error("Invalid lead id.");
    error.status = 400;
    throw error;
  }

  return pathname;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

function normalizeTags(value) {
  const rawTags = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,\n]/)
        .map((tag) => tag.trim());

  return Array.from(
    new Set(
      rawTags
        .map((tag) => sanitizeText(tag, 32))
        .filter(Boolean)
        .slice(0, 12),
    ),
  );
}

function normalizeDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    const error = new Error("Invalid next step date.");
    error.status = 400;
    throw error;
  }

  return date.toISOString();
}

function normalizeLeadAdmin(admin = {}) {
  return {
    status: ALLOWED_STATUSES.has(admin.status) ? admin.status : "new",
    priority: ALLOWED_PRIORITIES.has(admin.priority) ? admin.priority : "normal",
    read: normalizeBoolean(admin.read, false),
    starred: normalizeBoolean(admin.starred, false),
    archived: normalizeBoolean(admin.archived, false),
    ownerNotes: sanitizeLongText(admin.ownerNotes || "", 5000),
    nextStepAt: admin.nextStepAt ? normalizeDate(admin.nextStepAt) : "",
    tags: normalizeTags(admin.tags || []),
    updatedAt: admin.updatedAt || "",
    updatedBy: admin.updatedBy || "",
    history: Array.isArray(admin.history) ? admin.history.slice(-30) : [],
  };
}

function normalizeLead(rawLead, blob = {}) {
  const admin = normalizeLeadAdmin(rawLead.admin || {});
  const pathname = blob.pathname || rawLead._pathname || "";

  return {
    ...rawLead,
    id: rawLead.id || (pathname ? leadIdFromPath(pathname) : ""),
    companyName: sanitizeText(rawLead.companyName, 160),
    contactName: sanitizeText(rawLead.contactName, 160),
    email: sanitizeText(rawLead.email, 240).toLowerCase(),
    phone: sanitizeText(rawLead.phone, 80),
    location: sanitizeText(rawLead.location, 160),
    hiringModel: sanitizeText(rawLead.hiringModel, 80),
    roles: sanitizeLongText(rawLead.roles, 2200),
    notes: sanitizeLongText(rawLead.notes, 2200),
    source: sanitizeText(rawLead.source || "samer.solutions", 120),
    submittedAt: rawLead.submittedAt || "",
    admin,
  };
}

function applyLeadPatch(existingLead, patch, actor = "admin") {
  if (!patch || Array.isArray(patch) || typeof patch !== "object") {
    const error = new Error("Invalid lead update.");
    error.status = 400;
    throw error;
  }

  const next = { ...existingLead };

  for (const field of EDITABLE_LEAD_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) {
      continue;
    }

    if (field === "email") {
      const email = sanitizeText(patch.email, 240).toLowerCase();

      if (email && !isEmail(email)) {
        const error = new Error("Enter a valid email address.");
        error.status = 400;
        throw error;
      }

      next.email = email;
      continue;
    }

    if (field === "roles" || field === "notes") {
      next[field] = sanitizeLongText(patch[field], 2200);
      continue;
    }

    next[field] = sanitizeText(patch[field], field === "phone" ? 80 : 160);
  }

  const adminPatch = patch.admin && typeof patch.admin === "object" ? patch.admin : patch;
  const admin = normalizeLeadAdmin(existingLead.admin || {});
  const history = admin.history.slice(-29);
  const changed = [];

  if (Object.prototype.hasOwnProperty.call(adminPatch, "status")) {
    if (!ALLOWED_STATUSES.has(adminPatch.status)) {
      const error = new Error("Invalid lead status.");
      error.status = 400;
      throw error;
    }

    if (admin.status !== adminPatch.status) {
      changed.push(`status:${adminPatch.status}`);
    }

    admin.status = adminPatch.status;
  }

  if (Object.prototype.hasOwnProperty.call(adminPatch, "priority")) {
    if (!ALLOWED_PRIORITIES.has(adminPatch.priority)) {
      const error = new Error("Invalid lead priority.");
      error.status = 400;
      throw error;
    }

    if (admin.priority !== adminPatch.priority) {
      changed.push(`priority:${adminPatch.priority}`);
    }

    admin.priority = adminPatch.priority;
  }

  for (const flag of ["read", "starred", "archived"]) {
    if (!Object.prototype.hasOwnProperty.call(adminPatch, flag)) {
      continue;
    }

    const value = Boolean(adminPatch[flag]);

    if (admin[flag] !== value) {
      changed.push(`${flag}:${value}`);
    }

    admin[flag] = value;
  }

  if (Object.prototype.hasOwnProperty.call(adminPatch, "ownerNotes")) {
    admin.ownerNotes = sanitizeLongText(adminPatch.ownerNotes, 5000);
    changed.push("ownerNotes");
  }

  if (Object.prototype.hasOwnProperty.call(adminPatch, "nextStepAt")) {
    admin.nextStepAt = normalizeDate(adminPatch.nextStepAt);
    changed.push("nextStepAt");
  }

  if (Object.prototype.hasOwnProperty.call(adminPatch, "tags")) {
    admin.tags = normalizeTags(adminPatch.tags);
    changed.push("tags");
  }

  admin.updatedAt = new Date().toISOString();
  admin.updatedBy = actor;

  if (changed.length) {
    history.push({
      at: admin.updatedAt,
      by: actor,
      action: changed.join(","),
    });
  }

  admin.history = history.slice(-30);
  next.admin = admin;

  return next;
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

async function createCodeChallenge() {
  const challengeId = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();

  await putPrivateJson(`admin/challenges/${challengeId}.json`, {
    challengeId,
    codeHash: codeHash(challengeId, code),
    attempts: 0,
    expiresAt,
    createdAt: new Date().toISOString(),
  });

  return { challengeId, code, expiresAt };
}

async function sendCodeEmail(code) {
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
      from: adminEmailFrom(),
      to: [adminEmail()],
      subject: "Samer Solutions admin login code",
      text: `Your Samer Solutions admin login code is ${code}. It expires in 10 minutes.`,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend failed with status ${response.status}: ${details}`);
  }
}

async function verifyCodeChallenge(challengeId, code) {
  const pathname = `admin/challenges/${challengeId}.json`;
  const challenge = await getPrivateJson(pathname);

  if (!challenge) {
    return false;
  }

  if (Date.now() > Date.parse(challenge.expiresAt)) {
    await deletePrivateBlob(pathname);
    return false;
  }

  if (Number(challenge.attempts || 0) >= MAX_CODE_ATTEMPTS) {
    await deletePrivateBlob(pathname);
    return false;
  }

  const isValid = safeEqual(codeHash(challengeId, String(code || "")), challenge.codeHash);

  if (!isValid) {
    await putPrivateJson(pathname, {
      ...challenge,
      attempts: Number(challenge.attempts || 0) + 1,
    });
    return false;
  }

  await deletePrivateBlob(pathname);
  return true;
}

function signSession(payload) {
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${hmac(encoded)}`;
}

function verifySessionToken(token) {
  const [encoded, signature] = String(token || "").split(".");

  if (!encoded || !signature || !safeEqual(hmac(encoded), signature)) {
    return null;
  }

  const payload = JSON.parse(fromBase64url(encoded));

  if (!payload.exp || Date.now() > payload.exp * 1000) {
    return null;
  }

  return payload;
}

function parseCookies(request) {
  return Object.fromEntries(
    String(getHeader(request, "cookie"))
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function getSession(request) {
  const cookies = parseCookies(request);
  return verifySessionToken(cookies[ADMIN_COOKIE]);
}

function setSessionCookie(response) {
  const now = Math.floor(Date.now() / 1000);
  const token = signSession({
    sub: adminUsername(),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  });

  response.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`,
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  );
}

function requireAdmin(request, response) {
  const session = getSession(request);

  if (!session) {
    sendJson(response, 401, { error: "Unauthorized" });
    return null;
  }

  return session;
}

async function loadLeads(limit = 5000) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  }

  const { get, list } = await import("@vercel/blob");
  const leads = [];
  let cursor;

  do {
    const result = await list({
      prefix: "leads/",
      cursor,
      limit: Math.min(1000, limit - leads.length),
    });

    for (const blob of result.blobs) {
      if (!blob.pathname || !blob.pathname.endsWith(".json")) {
        continue;
      }

      const stored = await get(blob.url, { access: "private" });

      if (stored?.statusCode === 200 && stored.stream) {
        const rawLead = JSON.parse(await new Response(stored.stream).text());
        leads.push(normalizeLead(rawLead, { pathname: blob.pathname }));
      }

      if (leads.length >= limit) {
        break;
      }
    }

    cursor = result.cursor;
  } while (cursor && leads.length < limit);

  return leads.sort((left, right) =>
    String(right.submittedAt).localeCompare(String(left.submittedAt)),
  );
}

async function getLeadById(id) {
  const pathname = leadPathFromId(id);
  const lead = await getPrivateJson(pathname);

  if (!lead) {
    const error = new Error("Lead not found.");
    error.status = 404;
    throw error;
  }

  return {
    lead,
    pathname,
    normalized: normalizeLead(lead, { pathname }),
  };
}

async function updateLeadById(id, patch, actor = "admin") {
  const { lead, pathname } = await getLeadById(id);
  const updated = applyLeadPatch(lead, patch, actor);
  await putPrivateJson(pathname, updated);
  return normalizeLead(updated, { pathname });
}

async function deleteLeadById(id) {
  const pathname = leadPathFromId(id);
  await deletePrivateBlob(pathname);
  return { id };
}

function csvCell(value) {
  const text = String(value || "");
  return `"${text.replace(/"/g, '""')}"`;
}

function leadsToCsv(leads) {
  const columns = [
    "id",
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
    "status",
    "priority",
    "read",
    "starred",
    "archived",
    "nextStepAt",
    "tags",
    "ownerNotes",
    "updatedAt",
  ];

  return [
    columns.join(","),
    ...leads.map((lead) =>
      columns
        .map((column) => {
          if (column in lead) {
            return csvCell(lead[column]);
          }

          const admin = normalizeLeadAdmin(lead.admin || {});
          const value = column === "tags" ? admin.tags.join(", ") : admin[column];
          return csvCell(value);
        })
        .join(","),
    ),
  ].join("\n");
}

module.exports = {
  ADMIN_COOKIE,
  ALLOWED_PRIORITIES,
  ALLOWED_STATUSES,
  adminEmail,
  clearSessionCookie,
  createCodeChallenge,
  credentialsMatch,
  deleteLeadById,
  getLeadById,
  getSession,
  leadsToCsv,
  loadLeads,
  parseJsonBody,
  requireAdmin,
  requireSameOrigin,
  sendCodeEmail,
  sendJson,
  setJsonHeaders,
  setSessionCookie,
  updateLeadById,
  verifyCodeChallenge,
};
