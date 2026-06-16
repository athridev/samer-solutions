const crypto = require("node:crypto");
const { sendJson } = require("../../admin/_lib");

function getHeader(request, name) {
  return request.headers?.[name] || request.headers?.[name.toLowerCase()] || "";
}

function originFor(request) {
  const proto = getHeader(request, "x-forwarded-proto") || "https";
  const host = getHeader(request, "host");
  return `${proto}://${host}`;
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    response.writeHead(302, { Location: "/navigator?auth=github-not-configured" });
    return response.end();
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI || `${originFor(request)}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state,
  });

  response.setHeader(
    "Set-Cookie",
    `samer_github_oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  );
  response.writeHead(302, { Location: `https://github.com/login/oauth/authorize?${params}` });
  return response.end();
};
