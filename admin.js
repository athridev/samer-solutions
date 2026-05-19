const authView = document.querySelector("#auth-view");
const dashboard = document.querySelector("#dashboard");
const credentialsForm = document.querySelector("#credentials-form");
const codeForm = document.querySelector("#code-form");
const authStatus = document.querySelector("#auth-status");
const backToLogin = document.querySelector("#back-to-login");
const logoutButton = document.querySelector("#logout-button");
const refreshButton = document.querySelector("#refresh-button");
const exportJsonButton = document.querySelector("#export-json");
const searchInput = document.querySelector("#search");
const leadList = document.querySelector("#lead-list");
const detailPanel = document.querySelector("#detail-panel");
const totalLeads = document.querySelector("#total-leads");
const latestCompany = document.querySelector("#latest-company");
const lastLoaded = document.querySelector("#last-loaded");

let challengeId = "";
let leads = [];
let activeIndex = -1;

function setStatus(message, type = "info") {
  authStatus.textContent = message;
  authStatus.className = `status is-visible is-${type}`;
}

function clearStatus() {
  authStatus.textContent = "";
  authStatus.className = "status";
}

function payloadFromForm(form) {
  return Object.fromEntries(
    Array.from(new FormData(form).entries()).map(([key, value]) => [
      key,
      String(value).trim(),
    ]),
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...options,
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || "Request failed.");
  }

  return result;
}

function showDashboard() {
  authView.classList.add("is-hidden");
  dashboard.classList.remove("is-hidden");
}

function showAuth() {
  dashboard.classList.add("is-hidden");
  authView.classList.remove("is-hidden");
}

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(new Date(value));
}

function leadSearchText(lead) {
  return JSON.stringify(lead).toLowerCase();
}

function filteredLeads() {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    return leads.map((lead, index) => ({ lead, index }));
  }

  return leads
    .map((lead, index) => ({ lead, index }))
    .filter(({ lead }) => leadSearchText(lead).includes(query));
}

function renderLeadList() {
  const items = filteredLeads();

  if (!items.length) {
    leadList.innerHTML = `<div class="empty-state">No customer form submissions match this search.</div>`;
    return;
  }

  leadList.replaceChildren(
    ...items.map(({ lead, index }) => {
      const button = document.createElement("button");
      button.className = `lead-card${index === activeIndex ? " is-active" : ""}`;
      button.type = "button";
      button.innerHTML = `
        <p class="eyebrow">${formatDate(lead.submittedAt)}</p>
        <h2>${escapeHtml(lead.companyName || "Unnamed company")}</h2>
        <p>${escapeHtml(lead.roles || "No role details")}</p>
        <div class="lead-meta">
          <span>${escapeHtml(lead.hiringModel || "Model missing")}</span>
          <span>${escapeHtml(lead.location || "Location missing")}</span>
          <span>${escapeHtml(lead.contactName || "Contact missing")}</span>
        </div>`;
      button.addEventListener("click", () => showLead(index));
      return button;
    }),
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showLead(index) {
  const lead = leads[index];
  activeIndex = index;

  if (!lead) {
    return;
  }

  detailPanel.innerHTML = `
    <p class="eyebrow">${escapeHtml(formatDate(lead.submittedAt))}</p>
    <h2>${escapeHtml(lead.companyName || "Unnamed company")}</h2>
    <dl>
      <div><dt>Contact</dt><dd>${escapeHtml(lead.contactName)}<br><a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a></dd></div>
      <div><dt>Phone</dt><dd><a href="tel:${escapeHtml(lead.phone)}">${escapeHtml(lead.phone)}</a></dd></div>
      <div><dt>Location</dt><dd>${escapeHtml(lead.location)}</dd></div>
      <div><dt>Hiring model</dt><dd>${escapeHtml(lead.hiringModel)}</dd></div>
      <div><dt>Roles or skills needed</dt><dd>${escapeHtml(lead.roles)}</dd></div>
      <div><dt>Timeline and notes</dt><dd>${escapeHtml(lead.notes || "-")}</dd></div>
      <div><dt>Source</dt><dd>${escapeHtml(lead.source || "samer.solutions")}</dd></div>
    </dl>`;

  renderLeadList();
}

function updateSummary() {
  totalLeads.textContent = String(leads.length);
  latestCompany.textContent = leads[0]?.companyName || "None";
  lastLoaded.textContent = new Intl.DateTimeFormat("en-GB", {
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(new Date());
}

async function loadLeads() {
  leadList.innerHTML = `<div class="empty-state">Loading customer submissions...</div>`;
  const result = await api("/api/admin/leads?limit=10000");
  leads = result.leads || [];
  activeIndex = leads.length ? 0 : -1;
  updateSummary();
  renderLeadList();

  if (leads.length) {
    showLead(0);
  } else {
    detailPanel.innerHTML = `
      <p class="eyebrow">Details</p>
      <h2>No leads yet</h2>
      <p class="muted">Customer submissions will appear here after Vercel Blob storage is configured and the public form receives leads.</p>`;
  }
}

function downloadJson() {
  const data = {
    generatedAt: new Date().toISOString(),
    count: leads.length,
    leads,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `samer-solutions-leads-${data.generatedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

credentialsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();
  const payload = payloadFromForm(credentialsForm);
  setStatus("Checking credentials and sending code...", "info");

  try {
    const result = await api("/api/admin/request-code", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    challengeId = result.challengeId;
    credentialsForm.classList.add("is-hidden");
    codeForm.classList.remove("is-hidden");
    setStatus(`Code sent to ${result.sentTo}.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = payloadFromForm(codeForm);
  setStatus("Verifying code...", "info");

  try {
    await api("/api/admin/verify-code", {
      method: "POST",
      body: JSON.stringify({ challengeId, code: payload.code }),
    });
    clearStatus();
    showDashboard();
    await loadLeads();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

backToLogin.addEventListener("click", () => {
  challengeId = "";
  codeForm.reset();
  credentialsForm.classList.remove("is-hidden");
  codeForm.classList.add("is-hidden");
  clearStatus();
});

logoutButton.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" }).catch(() => null);
  window.location.reload();
});

refreshButton.addEventListener("click", () => loadLeads().catch((error) => {
  leadList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
}));

searchInput.addEventListener("input", renderLeadList);
exportJsonButton.addEventListener("click", downloadJson);

api("/api/admin/session")
  .then(async () => {
    showDashboard();
    await loadLeads();
  })
  .catch(() => showAuth());
