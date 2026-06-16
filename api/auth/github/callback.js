const { sendJson, setSessionCookie } = require("../../admin/_lib");

function getHeader(request, name) {
  return request.headers?.[name] || request.headers?.[name.toLowerCase()] || "";
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

function originFor(request) {
  const proto = getHeader(request, "x-forwarded-proto") || "https";
  const host = getHeader(request, "host");
  return `${proto}://${host}`;
}

function splitList(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function allowedUser(user, emails) {
  const allowedLogins = splitList(process.env.AUTH_ALLOWED_GITHUB_LOGINS);
  const allowedEmails = splitList(process.env.AUTH_ALLOWED_EMAILS || process.env.ADMIN_EMAIL || process.env.LEAD_REPORT_TO);
  const login = String(user?.login || "").toLowerCase();
  const emailSet = new Set(
    [
      String(user?.email || "").toLowerCase(),
      ...emails.map((entry) => String(entry.email || "").toLowerCase()),
    ].filter(Boolean),
  );

  if (allowedLogins.length && allowedLogins.includes(login)) return true;
  if (allowedEmails.length && allowedEmails.some((email) => emailSet.has(email))) return true;
  return false;
}

async function exchangeCode(request, code) {
  const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI || `${originFor(request)}/api/auth/github/callback`;
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new Error("GitHub OAuth token exchange failed.");
  }
  return tokenPayload.access_token;
}

async function githubGet(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "samer-solutions-navigator",
    },
  });
  if (!response.ok) throw new Error(`GitHub API failed: ${path}`);
  return response.json();
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  try {
    const url = new URL(request.url, originFor(request));
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookies = parseCookies(request);

    if (!code || !state || cookies.samer_github_oauth_state !== state) {
      response.writeHead(302, { Location: "/navigator?auth=github-state-failed" });
      return response.end();
    }

    const token = await exchangeCode(request, code);
    const [user, emails] = await Promise.all([githubGet("/user", token), githubGet("/user/emails", token)]);

    if (!allowedUser(user, emails)) {
      response.writeHead(302, { Location: "/navigator?auth=github-not-allowed" });
      return response.end();
    }

    setSessionCookie(response);
    const sessionCookie = response.getHeader("Set-Cookie");
    response.setHeader("Set-Cookie", [
      sessionCookie,
      "samer_github_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    ]);
    response.writeHead(302, { Location: "/navigator" });
    return response.end();
  } catch (error) {
    response.writeHead(302, { Location: `/navigator?auth=${encodeURIComponent(error.message || "github-failed")}` });
    return response.end();
  }
};
