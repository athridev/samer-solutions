const crypto = require("node:crypto");

const MAX_JSON_BODY = 20000;
const ADMIN_COOKIE = "samer_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const CODE_TTL_SECONDS = 60 * 10;
const MAX_CODE_ATTEMPTS = 5;
const LEAD_PREFIX = "leads/";
const CANDIDATE_INVITE_PREFIX = "candidates/invitations/";
const CANDIDATE_PROFILE_PREFIX = "candidates/profiles/";
const ALLOWED_STATUSES = new Set(["new", "contacted", "qualified", "closed", "archived"]);
const ALLOWED_CANDIDATE_STATUSES = new Set([
  "new",
  "reviewing",
  "shortlisted",
  "shared",
  "placed",
  "closed",
]);
const ALLOWED_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const EDITABLE_LEAD_FIELDS = new Set([
  "name",
  "company",
  "roleTitle",
  "hiringType",
  "seniority",
  "locationRequirement",
  "message",
  "companyName",
  "contactName",
  "email",
  "phone",
  "location",
  "hiringModel",
  "roles",
  "notes",
]);
const EDITABLE_CANDIDATE_FIELDS = new Set([
  "fullName",
  "email",
  "phone",
  "currentLocation",
  "nationality",
  "linkedin",
  "portfolio",
  "currentTitle",
  "experienceYears",
  "targetRoles",
  "seniority",
  "workModes",
  "preferredLocations",
  "salaryExpectation",
  "noticePeriod",
  "languages",
  "summary",
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
  return process.env.ADMIN_EMAIL_FROM || process.env.LEAD_EMAIL_FROM || "Samer Solutions <adam@samer.solutions>";
}

function siteOrigin(request) {
  if (process.env.PUBLIC_SITE_URL) {
    return process.env.PUBLIC_SITE_URL.replace(/\/+$/, "");
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/+$/, "")}`;
  }

  const host = request ? getHeader(request, "host") : "";

  if (host) {
    const proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
    return `${proto}://${host}`;
  }

  return "https://samer.solutions";
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

function candidatePathFromId(id) {
  let pathname;

  try {
    pathname = fromBase64url(id);
  } catch {
    const error = new Error("Invalid candidate id.");
    error.status = 400;
    throw error;
  }

  if (!pathname.startsWith(CANDIDATE_PROFILE_PREFIX) || !pathname.endsWith(".json")) {
    const error = new Error("Invalid candidate id.");
    error.status = 400;
    throw error;
  }

  return pathname;
}

function candidateInvitePathFromId(id) {
  let pathname;

  try {
    pathname = fromBase64url(id);
  } catch {
    const error = new Error("Invalid candidate link id.");
    error.status = 400;
    throw error;
  }

  if (!pathname.startsWith(CANDIDATE_INVITE_PREFIX) || !pathname.endsWith(".json")) {
    const error = new Error("Invalid candidate link id.");
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
  const rawStatus = admin.status === "reviewing" ? "contacted" : admin.status;

  return {
    status: ALLOWED_STATUSES.has(rawStatus) ? rawStatus : "new",
    priority: ALLOWED_PRIORITIES.has(admin.priority) ? admin.priority : "normal",
    read: normalizeBoolean(admin.read, false),
    starred: normalizeBoolean(admin.starred, false),
    archived: normalizeBoolean(admin.archived, false) || rawStatus === "archived",
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
  const companyName = sanitizeText(rawLead.company || rawLead.companyName, 180);
  const contactName = sanitizeText(rawLead.name || rawLead.contactName, 160);
  const roleTitle = sanitizeText(rawLead.roleTitle || rawLead.roles, 180);
  const hiringType = sanitizeText(rawLead.hiringType || rawLead.hiringModel, 80);
  const locationRequirement = sanitizeText(rawLead.locationRequirement || rawLead.location, 160);
  const message = sanitizeLongText(rawLead.message || rawLead.notes, 2800);

  return {
    ...rawLead,
    id: rawLead.id || (pathname ? leadIdFromPath(pathname) : ""),
    name: contactName,
    company: companyName,
    roleTitle,
    hiringType,
    seniority: sanitizeText(rawLead.seniority || "Not sure", 80),
    locationRequirement,
    message,
    companyName,
    contactName,
    email: sanitizeText(rawLead.email, 240).toLowerCase(),
    phone: sanitizeText(rawLead.phone, 80),
    location: locationRequirement,
    hiringModel: hiringType,
    roles: roleTitle,
    notes: message,
    source: sanitizeText(rawLead.source || "samer.solutions", 120),
    submittedAt: rawLead.submittedAt || "",
    admin,
  };
}

function normalizeCandidateAdmin(admin = {}) {
  return {
    status: ALLOWED_CANDIDATE_STATUSES.has(admin.status) ? admin.status : "new",
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

function normalizeCandidate(rawCandidate, blob = {}) {
  const admin = normalizeCandidateAdmin(rawCandidate.admin || {});
  const pathname = blob.pathname || rawCandidate._pathname || "";
  const cv = rawCandidate.cv && typeof rawCandidate.cv === "object" ? rawCandidate.cv : {};
  const consent = rawCandidate.consent && typeof rawCandidate.consent === "object" ? rawCandidate.consent : {};

  return {
    ...rawCandidate,
    id: rawCandidate.id || (pathname ? leadIdFromPath(pathname) : ""),
    fullName: sanitizeText(rawCandidate.fullName, 180),
    email: sanitizeText(rawCandidate.email, 240).toLowerCase(),
    phone: sanitizeText(rawCandidate.phone, 80),
    currentLocation: sanitizeText(rawCandidate.currentLocation, 180),
    nationality: sanitizeText(rawCandidate.nationality, 120),
    linkedin: sanitizeText(rawCandidate.linkedin, 300),
    portfolio: sanitizeText(rawCandidate.portfolio, 300),
    currentTitle: sanitizeText(rawCandidate.currentTitle, 180),
    experienceYears: sanitizeText(rawCandidate.experienceYears, 40),
    targetRoles: sanitizeLongText(rawCandidate.targetRoles, 2200),
    seniority: sanitizeText(rawCandidate.seniority, 80),
    workModes: sanitizeText(rawCandidate.workModes, 180),
    preferredLocations: sanitizeText(rawCandidate.preferredLocations, 240),
    salaryExpectation: sanitizeText(rawCandidate.salaryExpectation, 120),
    noticePeriod: sanitizeText(rawCandidate.noticePeriod, 120),
    languages: sanitizeText(rawCandidate.languages, 240),
    summary: sanitizeLongText(rawCandidate.summary, 2800),
    source: sanitizeText(rawCandidate.source || "candidate-intake", 120),
    submittedAt: rawCandidate.submittedAt || "",
    invitationId: sanitizeText(rawCandidate.invitationId, 180),
    cv: {
      pathname: sanitizeText(cv.pathname, 500),
      url: sanitizeText(cv.url, 800),
      filename: sanitizeText(cv.filename, 220),
      contentType: sanitizeText(cv.contentType, 160),
      size: Number(cv.size || 0),
    },
    consent: {
      shareWithClients: Boolean(consent.shareWithClients),
      storeForOpportunities: Boolean(consent.storeForOpportunities),
      accuracyConfirmed: Boolean(consent.accuracyConfirmed),
      signedName: sanitizeText(consent.signedName, 180),
      signedAt: consent.signedAt || "",
      signatureStrokes: Array.isArray(consent.signatureStrokes)
        ? consent.signatureStrokes.slice(0, 24)
        : [],
      noticeVersion: sanitizeText(consent.noticeVersion || "candidate-consent-2026-06-16", 80),
      userAgent: sanitizeText(consent.userAgent, 260),
    },
    admin,
  };
}

function normalizeCandidateInvitation(rawInvite, blob = {}) {
  const pathname = blob.pathname || rawInvite._pathname || "";

  return {
    id: rawInvite.id || (pathname ? leadIdFromPath(pathname) : ""),
    candidateName: sanitizeText(rawInvite.candidateName, 180),
    candidateEmail: sanitizeText(rawInvite.candidateEmail, 240).toLowerCase(),
    roleFocus: sanitizeText(rawInvite.roleFocus, 220),
    note: sanitizeLongText(rawInvite.note, 1200),
    publicUrl: sanitizeText(rawInvite.publicUrl, 900),
    token: rawInvite.token || "",
    tokenHash: sanitizeText(rawInvite.tokenHash, 180),
    createdAt: rawInvite.createdAt || "",
    createdBy: sanitizeText(rawInvite.createdBy, 80),
    expiresAt: rawInvite.expiresAt || "",
    revokedAt: rawInvite.revokedAt || "",
    usedAt: rawInvite.usedAt || "",
    submissionId: sanitizeText(rawInvite.submissionId, 220),
    status: rawInvite.revokedAt
      ? "revoked"
      : rawInvite.usedAt
        ? "used"
        : rawInvite.expiresAt && Date.now() > Date.parse(rawInvite.expiresAt)
          ? "expired"
          : "open",
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

    if (field === "roles" || field === "notes" || field === "message") {
      next[field] = sanitizeLongText(patch[field], field === "message" ? 2800 : 2200);
      continue;
    }

    next[field] = sanitizeText(patch[field], field === "phone" ? 80 : 180);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    next.contactName = next.name;
  } else if (Object.prototype.hasOwnProperty.call(patch, "contactName")) {
    next.name = next.contactName;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "company")) {
    next.companyName = next.company;
  } else if (Object.prototype.hasOwnProperty.call(patch, "companyName")) {
    next.company = next.companyName;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "roleTitle")) {
    next.roles = next.roleTitle;
  } else if (Object.prototype.hasOwnProperty.call(patch, "roles")) {
    next.roleTitle = next.roles;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "hiringType")) {
    next.hiringModel = next.hiringType;
  } else if (Object.prototype.hasOwnProperty.call(patch, "hiringModel")) {
    next.hiringType = next.hiringModel;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "locationRequirement")) {
    next.location = next.locationRequirement;
  } else if (Object.prototype.hasOwnProperty.call(patch, "location")) {
    next.locationRequirement = next.location;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "message")) {
    next.notes = next.message;
  } else if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
    next.message = next.notes;
  }

  next.name = sanitizeText(next.name || next.contactName, 160);
  next.contactName = sanitizeText(next.contactName || next.name, 160);
  next.company = sanitizeText(next.company || next.companyName, 180);
  next.companyName = sanitizeText(next.companyName || next.company, 180);
  next.roleTitle = sanitizeText(next.roleTitle || next.roles, 180);
  next.roles = sanitizeText(next.roles || next.roleTitle, 180);
  next.hiringType = sanitizeText(next.hiringType || next.hiringModel, 80);
  next.hiringModel = sanitizeText(next.hiringModel || next.hiringType, 80);
  next.locationRequirement = sanitizeText(next.locationRequirement || next.location, 160);
  next.location = sanitizeText(next.location || next.locationRequirement, 160);
  next.message = sanitizeLongText(next.message || next.notes, 2800);
  next.notes = sanitizeLongText(next.notes || next.message, 2800);
  next.seniority = sanitizeText(next.seniority || "Not sure", 80);

  const adminPatch = patch.admin && typeof patch.admin === "object" ? patch.admin : patch;
  const admin = normalizeLeadAdmin(existingLead.admin || {});
  const history = admin.history.slice(-29);
  const changed = [];

  if (Object.prototype.hasOwnProperty.call(adminPatch, "status")) {
    const previousStatus = admin.status;

    if (!ALLOWED_STATUSES.has(adminPatch.status)) {
      const error = new Error("Invalid lead status.");
      error.status = 400;
      throw error;
    }

    if (admin.status !== adminPatch.status) {
      changed.push(`status:${adminPatch.status}`);
    }

    admin.status = adminPatch.status;

    if (adminPatch.status === "archived") {
      admin.archived = true;
    } else if (previousStatus === "archived" && !Object.prototype.hasOwnProperty.call(adminPatch, "archived")) {
      admin.archived = false;
    }
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

function applyCandidatePatch(existingCandidate, patch, actor = "admin") {
  if (!patch || Array.isArray(patch) || typeof patch !== "object") {
    const error = new Error("Invalid candidate update.");
    error.status = 400;
    throw error;
  }

  const next = { ...existingCandidate };

  for (const field of EDITABLE_CANDIDATE_FIELDS) {
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

    if (field === "targetRoles" || field === "summary") {
      next[field] = sanitizeLongText(patch[field], field === "summary" ? 2800 : 2200);
      continue;
    }

    next[field] = sanitizeText(patch[field], 300);
  }

  const adminPatch = patch.admin && typeof patch.admin === "object" ? patch.admin : patch;
  const admin = normalizeCandidateAdmin(existingCandidate.admin || {});
  const history = admin.history.slice(-29);
  const changed = [];

  if (Object.prototype.hasOwnProperty.call(adminPatch, "status")) {
    if (!ALLOWED_CANDIDATE_STATUSES.has(adminPatch.status)) {
      const error = new Error("Invalid candidate status.");
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
      const error = new Error("Invalid candidate priority.");
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

function candidateTokenHash(token) {
  return hmac(`candidate-intake:${token}`);
}

function publicCandidateUrl(token, request) {
  return `${siteOrigin(request)}/candidate?token=${encodeURIComponent(token)}`;
}

async function createCandidateInvitation(input = {}, request, actor = "admin") {
  const token = base64url(crypto.randomBytes(32));
  const tokenHash = candidateTokenHash(token);
  const now = new Date();
  const days = Math.min(Math.max(Number(input.expiresDays || 14), 1), 90);
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const pathname = `${CANDIDATE_INVITE_PREFIX}${tokenHash}.json`;
  const invitation = {
    id: leadIdFromPath(pathname),
    token,
    tokenHash,
    publicUrl: publicCandidateUrl(token, request),
    candidateName: sanitizeText(input.candidateName, 180),
    candidateEmail: sanitizeText(input.candidateEmail, 240).toLowerCase(),
    roleFocus: sanitizeText(input.roleFocus, 220),
    note: sanitizeLongText(input.note, 1200),
    createdAt: now.toISOString(),
    createdBy: actor,
    expiresAt,
    revokedAt: "",
    usedAt: "",
    submissionId: "",
  };

  if (invitation.candidateEmail && !isEmail(invitation.candidateEmail)) {
    const error = new Error("Enter a valid candidate email.");
    error.status = 400;
    throw error;
  }

  await putPrivateJson(pathname, invitation);
  return normalizeCandidateInvitation(invitation, { pathname });
}

async function loadCandidateInvitations(limit = 5000) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  }

  const { get, list } = await import("@vercel/blob");
  const invitations = [];
  let cursor;

  do {
    const result = await list({
      prefix: CANDIDATE_INVITE_PREFIX,
      cursor,
      limit: Math.min(1000, limit - invitations.length),
    });

    for (const blob of result.blobs) {
      if (!blob.pathname || !blob.pathname.endsWith(".json")) {
        continue;
      }

      const stored = await get(blob.url, { access: "private" });

      if (stored?.statusCode === 200 && stored.stream) {
        const rawInvite = JSON.parse(await new Response(stored.stream).text());
        invitations.push(normalizeCandidateInvitation(rawInvite, { pathname: blob.pathname }));
      }

      if (invitations.length >= limit) {
        break;
      }
    }

    cursor = result.cursor;
  } while (cursor && invitations.length < limit);

  return invitations.sort((left, right) =>
    String(right.createdAt).localeCompare(String(left.createdAt)),
  );
}

async function getCandidateInvitationByToken(token) {
  const cleanToken = String(token || "").trim();

  if (cleanToken.length < 24 || cleanToken.length > 160) {
    const error = new Error("Invalid candidate link.");
    error.status = 404;
    throw error;
  }

  const pathname = `${CANDIDATE_INVITE_PREFIX}${candidateTokenHash(cleanToken)}.json`;
  const invitation = await getPrivateJson(pathname);

  if (!invitation) {
    const error = new Error("Candidate link not found.");
    error.status = 404;
    throw error;
  }

  return {
    invitation,
    pathname,
    normalized: normalizeCandidateInvitation(invitation, { pathname }),
  };
}

async function getCandidateInvitationById(id) {
  const pathname = candidateInvitePathFromId(id);
  const invitation = await getPrivateJson(pathname);

  if (!invitation) {
    const error = new Error("Candidate link not found.");
    error.status = 404;
    throw error;
  }

  return {
    invitation,
    pathname,
    normalized: normalizeCandidateInvitation(invitation, { pathname }),
  };
}

function assertCandidateInviteUsable(invitation) {
  if (invitation.revokedAt) {
    const error = new Error("This candidate link has been revoked.");
    error.status = 410;
    throw error;
  }

  if (invitation.usedAt) {
    const error = new Error("This candidate link has already been submitted.");
    error.status = 410;
    throw error;
  }

  if (Date.now() > Date.parse(invitation.expiresAt)) {
    const error = new Error("This candidate link has expired.");
    error.status = 410;
    throw error;
  }
}

async function revokeCandidateInvitation(id, actor = "admin") {
  const { invitation, pathname } = await getCandidateInvitationById(id);
  const updated = {
    ...invitation,
    revokedAt: invitation.revokedAt || new Date().toISOString(),
    revokedBy: actor,
  };

  await putPrivateJson(pathname, updated);
  return normalizeCandidateInvitation(updated, { pathname });
}

async function markCandidateInvitationUsed(token, submissionId) {
  const { invitation, pathname } = await getCandidateInvitationByToken(token);
  const updated = {
    ...invitation,
    usedAt: new Date().toISOString(),
    submissionId,
  };

  await putPrivateJson(pathname, updated);
  return normalizeCandidateInvitation(updated, { pathname });
}

async function loadCandidates(limit = 5000) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  }

  const { get, list } = await import("@vercel/blob");
  const candidates = [];
  let cursor;

  do {
    const result = await list({
      prefix: CANDIDATE_PROFILE_PREFIX,
      cursor,
      limit: Math.min(1000, limit - candidates.length),
    });

    for (const blob of result.blobs) {
      if (!blob.pathname || !blob.pathname.endsWith(".json")) {
        continue;
      }

      const stored = await get(blob.url, { access: "private" });

      if (stored?.statusCode === 200 && stored.stream) {
        const rawCandidate = JSON.parse(await new Response(stored.stream).text());
        candidates.push(normalizeCandidate(rawCandidate, { pathname: blob.pathname }));
      }

      if (candidates.length >= limit) {
        break;
      }
    }

    cursor = result.cursor;
  } while (cursor && candidates.length < limit);

  return candidates.sort((left, right) =>
    String(right.submittedAt).localeCompare(String(left.submittedAt)),
  );
}

async function getCandidateById(id) {
  const pathname = candidatePathFromId(id);
  const candidate = await getPrivateJson(pathname);

  if (!candidate) {
    const error = new Error("Candidate not found.");
    error.status = 404;
    throw error;
  }

  return {
    candidate,
    pathname,
    normalized: normalizeCandidate(candidate, { pathname }),
  };
}

async function updateCandidateById(id, patch, actor = "admin") {
  const { candidate, pathname } = await getCandidateById(id);
  const updated = applyCandidatePatch(candidate, patch, actor);
  await putPrivateJson(pathname, updated);
  return normalizeCandidate(updated, { pathname });
}

async function deleteCandidateById(id) {
  const { candidate, pathname } = await getCandidateById(id);

  await deletePrivateBlob(pathname);

  if (candidate.cv?.pathname || candidate.cv?.url) {
    await deletePrivateBlob(candidate.cv.pathname || candidate.cv.url);
  }

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
    "company",
    "name",
    "companyName",
    "contactName",
    "email",
    "phone",
    "roleTitle",
    "hiringType",
    "seniority",
    "locationRequirement",
    "message",
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

function candidatesToCsv(candidates) {
  const columns = [
    "id",
    "submittedAt",
    "fullName",
    "email",
    "phone",
    "currentLocation",
    "nationality",
    "currentTitle",
    "experienceYears",
    "targetRoles",
    "seniority",
    "workModes",
    "preferredLocations",
    "salaryExpectation",
    "noticePeriod",
    "languages",
    "linkedin",
    "portfolio",
    "summary",
    "cvFilename",
    "consentShareWithClients",
    "consentStoreForOpportunities",
    "consentAccuracyConfirmed",
    "signedName",
    "signedAt",
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
    ...candidates.map((candidate) => {
      const admin = normalizeCandidateAdmin(candidate.admin || {});
      const consent = candidate.consent || {};
      const cv = candidate.cv || {};
      const row = {
        ...candidate,
        cvFilename: cv.filename,
        consentShareWithClients: consent.shareWithClients,
        consentStoreForOpportunities: consent.storeForOpportunities,
        consentAccuracyConfirmed: consent.accuracyConfirmed,
        signedName: consent.signedName,
        signedAt: consent.signedAt,
        status: admin.status,
        priority: admin.priority,
        read: admin.read,
        starred: admin.starred,
        archived: admin.archived,
        nextStepAt: admin.nextStepAt,
        tags: admin.tags.join(", "),
        ownerNotes: admin.ownerNotes,
        updatedAt: admin.updatedAt,
      };

      return columns.map((column) => csvCell(row[column])).join(",");
    }),
  ].join("\n");
}

module.exports = {
  ADMIN_COOKIE,
  ALLOWED_CANDIDATE_STATUSES,
  ALLOWED_PRIORITIES,
  ALLOWED_STATUSES,
  adminEmail,
  assertCandidateInviteUsable,
  candidatePathFromId,
  candidatesToCsv,
  clearSessionCookie,
  createCodeChallenge,
  createCandidateInvitation,
  credentialsMatch,
  deleteCandidateById,
  deleteLeadById,
  getCandidateById,
  getCandidateInvitationById,
  getCandidateInvitationByToken,
  getLeadById,
  getSession,
  loadCandidateInvitations,
  loadCandidates,
  leadsToCsv,
  loadLeads,
  markCandidateInvitationUsed,
  parseJsonBody,
  putPrivateJson,
  requireAdmin,
  requireSameOrigin,
  revokeCandidateInvitation,
  sendCodeEmail,
  sendJson,
  setJsonHeaders,
  setSessionCookie,
  updateCandidateById,
  updateLeadById,
  verifyCodeChallenge,
};
