const {
  adminEmail,
  createCodeChallenge,
  credentialsMatch,
  parseJsonBody,
  sendCodeEmail,
  sendJson,
} = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  let body;

  try {
    body = await parseJsonBody(request);
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message || "Invalid request." });
  }

  try {
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
