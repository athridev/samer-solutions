const {
  deleteCandidateById,
  parseJsonBody,
  requireAdmin,
  requireSameOrigin,
  sendJson,
  updateCandidateById,
} = require("./_lib");

function idsFromBody(body) {
  const ids = Array.isArray(body.ids) ? body.ids : [body.id];
  return Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)));
}

async function readBodyOrQuery(request) {
  const contentType = String(
    request.headers?.["content-type"] || request.headers?.["Content-Type"] || "",
  );

  if (request.method === "DELETE" && !contentType.includes("application/json")) {
    const url = new URL(request.url, "https://samer.solutions");
    return { id: url.searchParams.get("id") };
  }

  return parseJsonBody(request);
}

module.exports = async function handler(request, response) {
  if (!["PATCH", "DELETE"].includes(request.method)) {
    response.setHeader("Allow", "PATCH, DELETE");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  const session = requireAdmin(request, response);

  if (!session || !requireSameOrigin(request, response)) {
    return;
  }

  let body;

  try {
    body = await readBodyOrQuery(request);
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message || "Invalid request." });
  }

  const ids = idsFromBody(body);

  if (!ids.length) {
    return sendJson(response, 400, { error: "Choose at least one candidate." });
  }

  try {
    if (request.method === "DELETE") {
      const deleted = [];

      for (const id of ids) {
        deleted.push(await deleteCandidateById(id));
      }

      return sendJson(response, 200, { ok: true, deleted });
    }

    const patch = body.patch && typeof body.patch === "object" ? body.patch : body;
    const updated = [];

    for (const id of ids) {
      updated.push(await updateCandidateById(id, patch, session.sub));
    }

    return sendJson(response, 200, { ok: true, candidates: updated });
  } catch (error) {
    console.error("SAMER_SOLUTIONS_ADMIN_CANDIDATE_WRITE_ERROR", error);
    return sendJson(response, error.status || 500, {
      error: error.status ? error.message : "Could not update this candidate.",
      detail: error.status ? undefined : error.message,
    });
  }
};
