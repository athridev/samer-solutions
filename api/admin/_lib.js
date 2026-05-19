const crypto = require("node:crypto");

const MAX_JSON_BODY = 4096;
const ADMIN_COOKIE = "samer_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const CODE_TTL_SECONDS = 60 * 10;
const MAX_CODE_ATTEMPTS = 5;

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
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
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
      const stored = await get(blob.url, { access: "private" });

      if (stored?.statusCode === 200 && stored.stream) {
        leads.push(JSON.parse(await new Response(stored.stream).text()));
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

  return [
    columns.join(","),
    ...leads.map((lead) => columns.map((column) => csvCell(lead[column])).join(",")),
  ].join("\n");
}

module.exports = {
  ADMIN_COOKIE,
  adminEmail,
  clearSessionCookie,
  createCodeChallenge,
  credentialsMatch,
  getSession,
  leadsToCsv,
  loadLeads,
  parseJsonBody,
  requireAdmin,
  sendCodeEmail,
  sendJson,
  setJsonHeaders,
  setSessionCookie,
  verifyCodeChallenge,
};
