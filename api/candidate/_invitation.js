const { assertCandidateInviteUsable, getCandidateInvitationByToken, sendJson } = require("../admin/_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  const url = new URL(request.url, "https://samer.solutions");
  const token = url.searchParams.get("token");

  if (!token) {
    return sendJson(response, 400, { error: "Missing candidate link." });
  }

  try {
    const { normalized } = await getCandidateInvitationByToken(token);
    assertCandidateInviteUsable(normalized);

    return sendJson(response, 200, {
      ok: true,
      invitation: {
        candidateName: normalized.candidateName,
        candidateEmail: normalized.candidateEmail,
        roleFocus: normalized.roleFocus,
        expiresAt: normalized.expiresAt,
      },
    });
  } catch (error) {
    return sendJson(response, error.status || 500, {
      error: error.status ? error.message : "Could not validate this candidate link.",
    });
  }
};
