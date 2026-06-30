const {
  parseJsonBody,
  requireSameOrigin,
  sendJson,
  setSessionCookie,
  verifyCodeChallenge,
} = require("./_lib");

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
    const valid = await verifyCodeChallenge(body.challengeId, body.code);

    if (!valid) {
      return sendJson(response, 401, { error: "Invalid or expired code." });
    }

    setSessionCookie(response);
    return sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error("SAMER_SOLUTIONS_ADMIN_VERIFY_ERROR", error);
    return sendJson(response, 500, { error: "Admin verification failed.", detail: error.message });
  }
};
