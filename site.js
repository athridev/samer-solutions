const form = document.querySelector("#company-form");
const statusBox = document.querySelector("#form-status");
const submitButton = form?.querySelector("button[type='submit']");
const submitButtonLabel = submitButton?.textContent || "Send hiring request";
const fallbackEmail = "adam@samer.solutions";
const navActions = document.querySelector(".nav-actions");
const navToggle = document.querySelector(".nav-toggle");
const navMenu = document.querySelector("#primary-menu");
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
      rootMargin: "0px 0px -7% 0px",
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
  navMenu?.setAttribute("aria-hidden", String(!isOpen));
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
  const subject = encodeURIComponent(`Hiring request from ${payload.company}`);
  const body = encodeURIComponent(
    [
      `Name: ${payload.name}`,
      `Work email: ${payload.email}`,
      `Phone / WhatsApp: ${payload.phone || "-"}`,
      `Company: ${payload.company}`,
      `Role or title needed: ${payload.roleTitle}`,
      `Hiring type: ${payload.hiringType}`,
      `Seniority: ${payload.seniority}`,
      `Location requirement: ${payload.locationRequirement}`,
      "",
      "Hiring context:",
      payload.message,
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

function validatePayload(payload) {
  const required = [
    "name",
    "email",
    "company",
    "roleTitle",
    "hiringType",
    "seniority",
    "locationRequirement",
    "message",
  ];
  const missing = required.filter((field) => !payload[field]);

  if (missing.length) {
    return "Please complete the required fields before sending.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return "Please enter a valid work email.";
  }

  return "";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const payload = payloadFromForm(form);
  const validationError = validatePayload(payload);

  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Sending...";
  form.setAttribute("aria-busy", "true");
  setStatus("Sending your hiring request...", "info");

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
      throw new Error(result.error || "Unable to send your hiring request.");
    }

    form.reset();
    setStatus(
      "Received. The team will review the role and come back with a clear next step.",
      "success",
    );
  } catch (error) {
    setFallbackStatus(error.message || "Something went wrong.", payload);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = submitButtonLabel;
    form.removeAttribute("aria-busy");
  }
});
