const {
  createCandidateInvitation,
  loadCandidateInvitations,
  parseJsonBody,
  requireAdmin,
  requireSameOrigin,
  revokeCandidateInvitation,
  sendJson,
} = require("./_lib");

function parseLimit(value) {
  const limit = Number(value || 5000);

  if (!Number.isFinite(limit) || limit < 1) {
    return 5000;
  }

  return Math.min(Math.floor(limit), 10000);
}

module.exports = async function handler(request, response) {
  if (!["GET", "POST", "PATCH"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST, PATCH");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  const session = requireAdmin(request, response);

  if (!session) {
    return;
  }

  try {
    if (request.method === "GET") {
      const url = new URL(request.url, "https://samer.solutions");
      const invitations = await loadCandidateInvitations(parseLimit(url.searchParams.get("limit")));

      return sendJson(response, 200, {
        ok: true,
        generatedAt: new Date().toISOString(),
        count: invitations.length,
        invitations,
      });
    }

    if (!requireSameOrigin(request, response)) {
      return;
    }

    const body = await parseJsonBody(request);

    if (request.method === "PATCH") {
      if (body.action !== "revoke") {
        return sendJson(response, 400, { error: "Unsupported candidate link action." });
      }

      const invitation = await revokeCandidateInvitation(body.id, session.sub);
      return sendJson(response, 200, { ok: true, invitation });
    }

    const invitation = await createCandidateInvitation(body, request, session.sub);
    return sendJson(response, 201, { ok: true, invitation });
  } catch (error) {
    console.error("SAMER_SOLUTIONS_CANDIDATE_LINKS_ERROR", error);
    return sendJson(response, error.status || 500, {
      error: error.status ? error.message : "Could not manage candidate links.",
      detail: error.status ? undefined : error.message,
    });
  }
};
