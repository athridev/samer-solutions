const els = {
  loadingView: document.querySelector("#loading-view"),
  unavailableView: document.querySelector("#unavailable-view"),
  unavailableMessage: document.querySelector("#unavailable-message"),
  successView: document.querySelector("#success-view"),
  formView: document.querySelector("#form-view"),
  form: document.querySelector("#candidate-form"),
  formTitle: document.querySelector("#form-title"),
  expiryNote: document.querySelector("#expiry-note"),
  tokenField: document.querySelector("#token-field"),
  fullName: document.querySelector("#full-name"),
  email: document.querySelector("#email"),
  signedName: document.querySelector("#signed-name"),
  cv: document.querySelector("#cv"),
  fileNote: document.querySelector("#file-note"),
  signaturePad: document.querySelector("#signature-pad"),
  clearSignature: document.querySelector("#clear-signature"),
  submitButton: document.querySelector("#submit-button"),
  formStatus: document.querySelector("#form-status"),
};

const MAX_CV_BYTES = 3_600_000;
const strokes = [];
let activeStroke = null;

function show(view) {
  for (const item of [els.loadingView, els.unavailableView, els.successView, els.formView]) {
    item.classList.add("is-hidden");
  }

  view.classList.remove("is-hidden");
}

function setStatus(message, type = "info") {
  els.formStatus.textContent = message;
  els.formStatus.className = `status is-${type}`;
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Secure one-time link";
  }

  return `Link expires ${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(date)}`;
}

function tokenFromUrl() {
  return new URLSearchParams(window.location.search).get("token") || "";
}

async function loadInvitation() {
  const token = tokenFromUrl();

  if (!token) {
    els.unavailableMessage.textContent = "This page needs a valid candidate link.";
    show(els.unavailableView);
    return;
  }

  try {
    const response = await fetch(`/api/candidate/invitation?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "This candidate link cannot be used.");
    }

    const invitation = result.invitation || {};
    els.tokenField.value = token;
    els.expiryNote.textContent = formatDate(invitation.expiresAt);

    if (invitation.candidateName) {
      els.fullName.value = invitation.candidateName;
      els.signedName.value = invitation.candidateName;
      els.formTitle.textContent = `Share your profile, ${invitation.candidateName.split(" ")[0]}.`;
    }

    if (invitation.candidateEmail) {
      els.email.value = invitation.candidateEmail;
    }

    show(els.formView);
  } catch (error) {
    els.unavailableMessage.textContent = error.message;
    show(els.unavailableView);
  }
}

function resizeCanvas() {
  const canvas = els.signaturePad;
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  drawSignature();
}

function canvasPoint(event) {
  const rect = els.signaturePad.getBoundingClientRect();

  return [
    Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  ];
}

function drawSignature() {
  const canvas = els.signaturePad;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = Math.max(2, width / 260);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#171612";

  for (const stroke of strokes) {
    if (stroke.length < 2) {
      continue;
    }

    ctx.beginPath();
    stroke.forEach(([x, y], index) => {
      const px = x * width;
      const py = y * height;

      if (index === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.stroke();
  }
}

els.signaturePad.addEventListener("pointerdown", (event) => {
  els.signaturePad.setPointerCapture(event.pointerId);
  activeStroke = [canvasPoint(event)];
  strokes.push(activeStroke);
  drawSignature();
});

els.signaturePad.addEventListener("pointermove", (event) => {
  if (!activeStroke) {
    return;
  }

  activeStroke.push(canvasPoint(event));
  drawSignature();
});

for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
  els.signaturePad.addEventListener(eventName, () => {
    activeStroke = null;
  });
}

els.clearSignature.addEventListener("click", () => {
  strokes.splice(0, strokes.length);
  drawSignature();
});

els.fullName.addEventListener("input", () => {
  if (!els.signedName.value.trim()) {
    els.signedName.value = els.fullName.value;
  }
});

els.cv.addEventListener("change", () => {
  const file = els.cv.files[0];

  if (!file) {
    els.fileNote.textContent = "PDF, DOC, or DOCX under 3.6 MB.";
    return;
  }

  const sizeMb = file.size / 1024 / 1024;
  els.fileNote.textContent = `${file.name} - ${sizeMb.toFixed(1)} MB`;

  if (file.size > MAX_CV_BYTES) {
    els.fileNote.textContent = `${file.name} is too large. Please upload a CV under 3.6 MB.`;
  }
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = els.cv.files[0];

  if (!file) {
    setStatus("Please attach your CV.", "error");
    return;
  }

  if (file.size > MAX_CV_BYTES) {
    setStatus("Please upload a CV under 3.6 MB.", "error");
    return;
  }

  if (!strokes.some((stroke) => stroke.length > 1)) {
    setStatus("Please add your signature before submitting.", "error");
    return;
  }

  const formData = new FormData(els.form);
  formData.set("signatureStrokes", JSON.stringify(strokes));
  els.submitButton.disabled = true;
  setStatus("Submitting securely...", "info");

  try {
    const response = await fetch("/api/candidate/submit", {
      method: "POST",
      body: formData,
      headers: { Accept: "application/json" },
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Could not submit your profile.");
    }

    els.form.reset();
    strokes.splice(0, strokes.length);
    drawSignature();
    show(els.successView);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    els.submitButton.disabled = false;
  }
});

window.addEventListener("resize", resizeCanvas);
loadInvitation().then(() => requestAnimationFrame(resizeCanvas));
