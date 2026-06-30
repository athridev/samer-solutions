const { candidatesToCsv, loadCandidates, requireAdmin, sendJson } = require("./_lib");

function parseLimit(value) {
  const limit = Number(value || 5000);

  if (!Number.isFinite(limit) || limit < 1) {
    return 5000;
  }

  return Math.min(Math.floor(limit), 10000);
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  if (!requireAdmin(request, response)) {
    return;
  }

  const url = new URL(request.url, "https://samer.solutions");
  const format = url.searchParams.get("format") || "json";
  const limit = parseLimit(url.searchParams.get("limit"));

  try {
    const candidates = await loadCandidates(limit);

    if (format === "csv") {
      const csv = candidatesToCsv(candidates);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="samer-solutions-candidates-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return response.status(200).send(csv);
    }

    return sendJson(response, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      count: candidates.length,
      candidates,
    });
  } catch (error) {
    console.error("SAMER_SOLUTIONS_ADMIN_CANDIDATES_ERROR", error);
    return sendJson(response, 500, {
      error: "Could not load candidate submissions.",
      detail: error.message,
    });
  }
};
