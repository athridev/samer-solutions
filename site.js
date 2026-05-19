const form = document.querySelector("#company-form");
const statusBox = document.querySelector("#form-status");
const submitButton = form?.querySelector("button[type='submit']");
const submitButtonLabel = submitButton?.textContent || "Send brief";
const fallbackEmail = "adam@samer.solutions";

function setStatus(message, type) {
  statusBox.replaceChildren(message);
  statusBox.className = `form-status is-visible is-${type}`;
}

function fallbackMailLink(payload) {
  const subject = encodeURIComponent(`Hiring brief from ${payload.companyName}`);
  const body = encodeURIComponent(
    [
      `Company name: ${payload.companyName}`,
      `Contact name: ${payload.contactName}`,
      `Work email: ${payload.email}`,
      `Phone: ${payload.phone}`,
      `Company location: ${payload.location}`,
      `Hiring model: ${payload.hiringModel}`,
      "",
      "Roles or skills needed:",
      payload.roles,
      "",
      "Timeline and notes:",
      payload.notes || "-",
    ].join("\n"),
  );

  return `mailto:${fallbackEmail}?subject=${subject}&body=${body}`;
}

function setFallbackStatus(message, payload) {
  const text = document.createTextNode(`${message} `);
  const link = document.createElement("a");

  link.className = "fallback-link";
  link.href = fallbackMailLink(payload);
  link.textContent = `Email ${fallbackEmail} instead.`;

  statusBox.replaceChildren(text, link);
  statusBox.className = "form-status is-visible is-error";
}

function payloadFromForm(formElement) {
  const formData = new FormData(formElement);
  return Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [
      key,
      String(value).trim(),
    ]),
  );
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const payload = payloadFromForm(form);
  submitButton.disabled = true;
  submitButton.textContent = "Sending...";
  form.setAttribute("aria-busy", "true");
  setStatus("Sending the brief...", "info");

  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "same-origin",
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Unable to send the brief.");
    }

    form.reset();
    setStatus(
      "Brief received. The team will review the details and come back with a practical next step.",
      "success",
    );
  } catch (error) {
    setFallbackStatus(
      error.message || "Something went wrong.",
      payload,
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = submitButtonLabel;
    form.removeAttribute("aria-busy");
  }
});
