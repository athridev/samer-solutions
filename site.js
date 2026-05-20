const form = document.querySelector("#company-form");
const statusBox = document.querySelector("#form-status");
const submitButton = form?.querySelector("button[type='submit']");
const submitButtonLabel = submitButton?.textContent || "Start the conversation";
const fallbackEmail = "adam@samer.solutions";
const navActions = document.querySelector(".nav-actions");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".nav-menu a");

document.documentElement.classList.add("motion-ready");

const revealItems = document.querySelectorAll("[data-reveal]");

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-revealed");
        revealObserver.unobserve(entry.target);
      });
    },
    {
      rootMargin: "0px 0px -6% 0px",
      threshold: 0.08,
    },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-revealed"));
}

function setNavOpen(isOpen) {
  navActions?.classList.toggle("is-open", isOpen);
  navToggle?.setAttribute("aria-expanded", String(isOpen));
  navActions
    ?.querySelector(".nav-menu")
    ?.setAttribute("aria-hidden", String(!isOpen));
  navLinks.forEach((link) => {
    link.tabIndex = isOpen ? 0 : -1;
  });
}

setNavOpen(false);

navToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  setNavOpen(!navActions?.classList.contains("is-open"));
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => setNavOpen(false));
});

document.addEventListener("click", (event) => {
  if (!navActions?.contains(event.target)) {
    setNavOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navActions?.classList.contains("is-open")) {
    setNavOpen(false);
    navToggle?.focus();
  }
});

function setStatus(message, type) {
  statusBox.replaceChildren(message);
  statusBox.className = `form-status is-visible is-${type}`;
}

function fallbackMailLink(payload) {
  const subject = encodeURIComponent(`Hiring request from ${payload.companyName}`);
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
  setStatus("Sending your details...", "info");

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
      throw new Error(result.error || "Unable to send your details.");
    }

    form.reset();
    setStatus(
      "Thanks. The team received your details and will come back with a clear next step.",
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
