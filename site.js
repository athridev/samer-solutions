const form = document.querySelector("#company-form");
const statusBox = document.querySelector("#form-status");
const submitButton = form?.querySelector("button[type='submit']");
const submitButtonLabel = submitButton?.textContent || "Send hiring brief";

function setStatus(message, type) {
  statusBox.textContent = message;
  statusBox.className = `form-status is-visible is-${type}`;
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
  setStatus("Sending your hiring brief...", "info");

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
      "Brief received. Our team will review the company details.",
      "success",
    );
  } catch (error) {
    setStatus(
      error.message || "Something went wrong. Please try again.",
      "error",
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = submitButtonLabel;
    form.removeAttribute("aria-busy");
  }
});
