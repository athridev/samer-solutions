const { getCandidateById, requireAdmin, sendJson } = require("./_lib");

function safeDownloadName(value) {
  return String(value || "candidate-cv")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .slice(0, 160) || "candidate-cv";
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
  const id = url.searchParams.get("id");

  if (!id) {
    return sendJson(response, 400, { error: "Missing candidate id." });
  }

  try {
    const { normalized } = await getCandidateById(id);
    const cvRef = normalized.cv?.pathname || normalized.cv?.url;

    if (!cvRef) {
      return sendJson(response, 404, { error: "This candidate has no CV file." });
    }

    const { get } = await import("@vercel/blob");
    const stored = await get(cvRef, { access: "private" });

    if (stored?.statusCode !== 200 || !stored.stream) {
      return sendJson(response, 404, { error: "CV file not found." });
    }

    const arrayBuffer = await new Response(stored.stream).arrayBuffer();
    const filename = safeDownloadName(normalized.cv.filename || `${normalized.fullName}-cv.pdf`);

    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", normalized.cv.contentType || "application/octet-stream");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
    return response.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("SAMER_SOLUTIONS_ADMIN_CANDIDATE_CV_ERROR", error);
    return sendJson(response, error.status || 500, {
      error: error.status ? error.message : "Could not download this CV.",
      detail: error.status ? undefined : error.message,
    });
  }
};
