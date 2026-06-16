const { parseJsonBody, requireAdmin, requireSameOrigin, sendJson } = require("../admin/_lib");
const { loadNavigatorStates, saveNavigatorState } = require("./_store");

module.exports = async function handler(request, response) {
  try {
    const session = requireAdmin(request, response);
    if (!session) return;

    if (request.method === "GET") {
      const payload = await loadNavigatorStates();
      return sendJson(response, 200, payload);
    }

    if (request.method === "POST") {
      if (!requireSameOrigin(request, response)) return;
      const body = await parseJsonBody(request);
      const leadId = String(body.leadId || "").trim();

      if (!leadId) {
        return sendJson(response, 400, { error: "Lead ID is required." });
      }

      const state = await saveNavigatorState(leadId, {
        status: body.status,
        note: body.note,
        updatedAt: new Date().toISOString(),
      });
      return sendJson(response, 200, { state });
    }

    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, error.status || 500, { error: error.message || "Request failed." });
  }
};
