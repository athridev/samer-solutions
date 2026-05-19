const { getSession, sendJson } = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  const session = getSession(request);

  if (!session) {
    return sendJson(response, 401, { error: "Unauthorized" });
  }

  return sendJson(response, 200, {
    ok: true,
    user: session.sub,
    expiresAt: new Date(session.exp * 1000).toISOString(),
  });
};
