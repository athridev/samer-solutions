const {
  adminEmail,
  createCodeChallenge,
  credentialsMatch,
  parseJsonBody,
  requireSameOrigin,
  sendCodeEmail,
  sendJson,
} = require("./_lib");

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map();

function getHeader(request, name) {
  return request.headers?.[name] || request.headers?.[name.toLowerCase()] || "";
}

function loginKey(request, username) {
  const forwarded = String(getHeader(request, "x-forwarded-for")).split(",")[0].trim();
  const ip = forwarded || getHeader(request, "x-real-ip") || request.socket?.remoteAddress || "unknown";
  return `${ip}:${String(username || "").toLowerCase()}`;
}

function isLoginAllowed(request, username) {
  const key = loginKey(request, username);
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + LOGIN_WINDOW_MS;
  }

  entry.count += 1;
  loginAttempts.set(key, entry);

  for (const [storedKey, storedEntry] of loginAttempts) {
    if (now > storedEntry.resetAt) {
      loginAttempts.delete(storedKey);
    }
  }

  return entry.count <= LOGIN_MAX_ATTEMPTS;
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  if (!requireSameOrigin(request, response)) {
    return;
  }

  let body;

  try {
    body = await parseJsonBody(request);
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message || "Invalid request." });
  }

  try {
    if (!isLoginAllowed(request, body.username)) {
      return sendJson(response, 429, {
        error: "Too many login attempts. Please wait a few minutes and try again.",
      });
    }

    if (!credentialsMatch(body)) {
      return sendJson(response, 401, { error: "Invalid credentials." });
    }

    const challenge = await createCodeChallenge();
    await sendCodeEmail(challenge.code);

    return sendJson(response, 200, {
      ok: true,
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
      sentTo: adminEmail().replace(/^(.).+(@.+)$/, "$1***$2"),
    });
  } catch (error) {
    console.error("SAMER_SOLUTIONS_ADMIN_CODE_ERROR", error);
    return sendJson(response, 500, {
      error: "Admin login is not fully configured.",
      detail: error.message,
    });
  }
};
