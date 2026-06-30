const crypto = require("node:crypto");

const {
  assertCandidateInviteUsable,
  getCandidateInvitationByToken,
  markCandidateInvitationUsed,
  putPrivateJson,
  sendJson,
} = require("../admin/_lib");

const MAX_BODY_BYTES = 4_300_000;
const MAX_CV_BYTES = 3_600_000;
const MAX_FIELD_BYTES = 80_000;
const ALLOWED_CV_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_CV_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

function getHeader(request, name) {
  return request.headers?.[name] || request.headers?.[name.toLowerCase()] || "";
}

function sanitizeText(value, maxLength = 1200) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeLongText(value, maxLength = 5000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function safeFilename(value) {
  const cleaned = String(value || "candidate-cv.pdf")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .trim()
    .slice(0, 140);

  return cleaned || "candidate-cv.pdf";
}

function fileExtension(filename) {
  const parts = String(filename || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function readRequestBuffer(request) {
  if (Buffer.isBuffer(request.body)) {
    return Promise.resolve(request.body);
  }

  if (typeof request.body === "string") {
    return Promise.resolve(Buffer.from(request.body));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("The submission is too large."), { status: 413 }));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseContentDisposition(value) {
  const result = {};

  for (const part of String(value || "").split(";")) {
    const [key, raw] = part.trim().split("=");

    if (!raw) {
      continue;
    }

    result[key] = raw.replace(/^"|"$/g, "");
  }

  return result;
}

function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = {};
  let index = buffer.indexOf(delimiter);

  if (index < 0) {
    const error = new Error("Invalid form data.");
    error.status = 400;
    throw error;
  }

  while (index >= 0) {
    let partStart = index + delimiter.length;

    if (buffer.slice(partStart, partStart + 2).toString() === "--") {
      break;
    }

    if (buffer.slice(partStart, partStart + 2).toString() === "\r\n") {
      partStart += 2;
    }

    const next = buffer.indexOf(delimiter, partStart);

    if (next < 0) {
      break;
    }

    let partEnd = next;

    if (buffer.slice(partEnd - 2, partEnd).toString() === "\r\n") {
      partEnd -= 2;
    }

    const separator = buffer.indexOf(Buffer.from("\r\n\r\n"), partStart);

    if (separator > partStart && separator < partEnd) {
      const headerText = buffer.slice(partStart, separator).toString("utf8");
      const headers = {};

      for (const line of headerText.split("\r\n")) {
        const colon = line.indexOf(":");

        if (colon > 0) {
          headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
        }
      }

      const disposition = parseContentDisposition(headers["content-disposition"]);
      const content = buffer.slice(separator + 4, partEnd);

      if (disposition.name) {
        if (disposition.filename) {
          files[disposition.name] = {
            filename: disposition.filename,
            contentType: headers["content-type"] || "application/octet-stream",
            buffer: content,
          };
        } else if (content.length <= MAX_FIELD_BYTES) {
          fields[disposition.name] = content.toString("utf8");
        }
      }
    }

    index = next;
  }

  return { fields, files };
}

function parseSignatureStrokes(value) {
  let parsed;

  try {
    parsed = JSON.parse(String(value || "[]"));
  } catch {
    const error = new Error("Signature data is invalid.");
    error.status = 400;
    throw error;
  }

  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 24) {
    const error = new Error("Please add your signature before submitting.");
    error.status = 400;
    throw error;
  }

  return parsed.map((stroke) => {
    if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > 240) {
      const error = new Error("Signature data is invalid.");
      error.status = 400;
      throw error;
    }

    return stroke.map((point) => {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !Number.isFinite(Number(point[0])) ||
        !Number.isFinite(Number(point[1]))
      ) {
        const error = new Error("Signature data is invalid.");
        error.status = 400;
        throw error;
      }

      return [
        Math.max(0, Math.min(1, Number(point[0]))),
        Math.max(0, Math.min(1, Number(point[1]))),
      ];
    });
  });
}

function requireChecked(fields, name, message) {
  if (fields[name] !== "on" && fields[name] !== "true") {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
}

function candidateFromFields(fields, invitation, cv, request) {
  requireChecked(
    fields,
    "consentShare",
    "Consent to share relevant profile details with potential employer clients is required.",
  );
  requireChecked(
    fields,
    "consentStore",
    "Consent to store your profile for potential opportunities is required.",
  );
  requireChecked(fields, "consentAccuracy", "Please confirm the information is accurate.");

  const candidate = {
    fullName: sanitizeText(fields.fullName, 180),
    email: sanitizeText(fields.email, 240).toLowerCase(),
    phone: sanitizeText(fields.phone, 80),
    currentLocation: sanitizeText(fields.currentLocation, 180),
    nationality: sanitizeText(fields.nationality, 120),
    linkedin: sanitizeText(fields.linkedin, 300),
    portfolio: sanitizeText(fields.portfolio, 300),
    currentTitle: sanitizeText(fields.currentTitle, 180),
    experienceYears: sanitizeText(fields.experienceYears, 40),
    targetRoles: sanitizeLongText(fields.targetRoles, 2200),
    seniority: sanitizeText(fields.seniority, 80),
    workModes: sanitizeText(fields.workModes, 180),
    preferredLocations: sanitizeText(fields.preferredLocations, 240),
    salaryExpectation: sanitizeText(fields.salaryExpectation, 120),
    noticePeriod: sanitizeText(fields.noticePeriod, 120),
    languages: sanitizeText(fields.languages, 240),
    summary: sanitizeLongText(fields.summary, 2800),
    source: "candidate-intake",
    submittedAt: new Date().toISOString(),
    invitationId: invitation.id,
    cv,
    consent: {
      shareWithClients: true,
      storeForOpportunities: true,
      accuracyConfirmed: true,
      signedName: sanitizeText(fields.signedName || fields.fullName, 180),
      signedAt: new Date().toISOString(),
      signatureStrokes: parseSignatureStrokes(fields.signatureStrokes),
      noticeVersion: "candidate-consent-2026-06-16",
      userAgent: sanitizeText(getHeader(request, "user-agent"), 260),
    },
    admin: {
      status: "new",
      priority: "normal",
      read: false,
      starred: false,
      archived: false,
      ownerNotes: "",
      nextStepAt: "",
      tags: [],
      updatedAt: "",
      updatedBy: "",
      history: [],
    },
  };

  const required = [
    "fullName",
    "email",
    "phone",
    "currentLocation",
    "currentTitle",
    "experienceYears",
    "targetRoles",
    "preferredLocations",
    "noticePeriod",
    "summary",
  ];
  const missing = required.filter((field) => !candidate[field]);

  if (missing.length) {
    const error = new Error(`Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
    error.status = 400;
    throw error;
  }

  if (!isEmail(candidate.email)) {
    const error = new Error("Enter a valid email address.");
    error.status = 400;
    throw error;
  }

  if (!candidate.consent.signedName) {
    const error = new Error("Please type your full name beside the signature.");
    error.status = 400;
    throw error;
  }

  return candidate;
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  const contentLength = Number(getHeader(request, "content-length") || 0);

  if (contentLength > MAX_BODY_BYTES) {
    return sendJson(response, 413, {
      error: "The submission is too large. Please upload a CV under 3.6 MB.",
    });
  }

  const contentType = String(getHeader(request, "content-type"));
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1];

  if (!contentType.includes("multipart/form-data") || !boundary) {
    return sendJson(response, 415, { error: "Submit the form as multipart form data." });
  }

  try {
    const body = await readRequestBuffer(request);
    const { fields, files } = parseMultipart(body, boundary);

    if (sanitizeText(fields.website)) {
      return sendJson(response, 200, { ok: true });
    }

    const { invitation, normalized } = await getCandidateInvitationByToken(fields.token);
    assertCandidateInviteUsable(normalized);

    const cvFile = files.cv;

    if (!cvFile || !cvFile.buffer?.length) {
      return sendJson(response, 400, { error: "Please attach your CV." });
    }

    const extension = fileExtension(cvFile.filename);

    if (cvFile.buffer.length > MAX_CV_BYTES) {
      return sendJson(response, 413, { error: "Please upload a CV under 3.6 MB." });
    }

    if (!ALLOWED_CV_TYPES.has(cvFile.contentType) && !ALLOWED_CV_EXTENSIONS.has(extension)) {
      return sendJson(response, 400, { error: "Upload a PDF, DOC, or DOCX CV." });
    }

    const { put } = await import("@vercel/blob");
    const candidateId = crypto.randomUUID();
    const day = new Date().toISOString().slice(0, 10);
    const filename = safeFilename(cvFile.filename);
    const cvBlob = await put(`candidates/cv/${day}/${candidateId}-${filename}`, cvFile.buffer, {
      access: "private",
      addRandomSuffix: true,
      contentType: cvFile.contentType || "application/octet-stream",
    });

    const candidate = candidateFromFields(
      fields,
      normalized,
      {
        pathname: cvBlob.pathname,
        url: cvBlob.url,
        filename,
        contentType: cvFile.contentType,
        size: cvFile.buffer.length,
      },
      request,
    );

    const safeTimestamp = candidate.submittedAt.replace(/[:.]/g, "-");
    const profilePath = `candidates/profiles/${day}/${safeTimestamp}-${candidateId}.json`;
    candidate.id = Buffer.from(profilePath)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    await putPrivateJson(profilePath, candidate);
    await markCandidateInvitationUsed(fields.token, candidate.id);

    return sendJson(response, 200, {
      ok: true,
      submittedAt: candidate.submittedAt,
    });
  } catch (error) {
    console.error("SAMER_SOLUTIONS_CANDIDATE_SUBMIT_ERROR", error);
    return sendJson(response, error.status || 500, {
      error: error.status ? error.message : "Could not submit the candidate profile.",
      detail: error.status ? undefined : error.message,
    });
  }
};
