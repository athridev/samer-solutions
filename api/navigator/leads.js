const { requireAdmin, requireSameOrigin, sendJson } = require("../admin/_lib");
const { loadNavigatorLeads, loadNavigatorStates, saveNavigatorLeads } = require("./_store");

async function parseLargeJsonBody(request) {
  const contentLength = Number(request.headers?.["content-length"] || request.headers?.["Content-Length"] || 0);
  if (contentLength > 5_000_000) {
    const error = new Error("Import is too large.");
    error.status = 413;
    throw error;
  }

  if (typeof request.body === "string") return JSON.parse(request.body);
  if (request.body && typeof request.body === "object" && !request.body.pipe) return request.body;

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

module.exports = async function handler(request, response) {
  try {
    const session = requireAdmin(request, response);
    if (!session) return;

    if (request.method === "GET") {
      const [{ leads, updatedAt }, states] = await Promise.all([loadNavigatorLeads(), loadNavigatorStates()]);
      return sendJson(response, 200, {
        leads,
        states: states.states,
        updatedAt,
        user: session.sub,
      });
    }

    if (request.method === "POST") {
      if (!requireSameOrigin(request, response)) return;
      const body = await parseLargeJsonBody(request);
      if (!Array.isArray(body.leads)) {
        return sendJson(response, 400, { error: "Upload a valid leads array." });
      }

      const payload = await saveNavigatorLeads(body.leads);
      return sendJson(response, 200, payload);
    }

    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, error.status || 500, { error: error.message || "Request failed." });
  }
};
