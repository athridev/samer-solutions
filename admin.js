const els = {
  authView: document.querySelector("#auth-view"),
  dashboard: document.querySelector("#dashboard"),
  credentialsForm: document.querySelector("#credentials-form"),
  codeForm: document.querySelector("#code-form"),
  authStatus: document.querySelector("#auth-status"),
  backToLogin: document.querySelector("#back-to-login"),
  logoutButton: document.querySelector("#logout-button"),
  dashboardTitle: document.querySelector("#dashboard-title"),
  refreshButton: document.querySelector("#refresh-button"),
  exportJsonButton: document.querySelector("#export-json"),
  leadTabCount: document.querySelector("#lead-tab-count"),
  candidateTabCount: document.querySelector("#candidate-tab-count"),
  clearLeadFilters: document.querySelector("#clear-lead-filters"),
  searchInput: document.querySelector("#search"),
  viewFilter: document.querySelector("#view-filter"),
  statusFilter: document.querySelector("#status-filter"),
  priorityFilter: document.querySelector("#priority-filter"),
  sortOrder: document.querySelector("#sort-order"),
  leadList: document.querySelector("#lead-list"),
  detailPanel: document.querySelector("#detail-panel"),
  totalLeads: document.querySelector("#total-leads"),
  unreadLeads: document.querySelector("#unread-leads"),
  priorityLeads: document.querySelector("#priority-leads"),
  latestCompany: document.querySelector("#latest-company"),
  resultCount: document.querySelector("#result-count"),
  bulkBar: document.querySelector("#bulk-bar"),
  selectedCount: document.querySelector("#selected-count"),
  selectVisible: document.querySelector("#select-visible"),
  sessionNote: document.querySelector("#session-note"),
  tabButtons: document.querySelectorAll("[data-admin-tab]"),
  leadsView: document.querySelector("#leads-view"),
  candidatesView: document.querySelector("#candidates-view"),
  totalCandidates: document.querySelector("#total-candidates"),
  unreadCandidates: document.querySelector("#unread-candidates"),
  openCandidateLinks: document.querySelector("#open-candidate-links"),
  latestCandidate: document.querySelector("#latest-candidate"),
  candidateLinkForm: document.querySelector("#candidate-link-form"),
  generatedCandidateLink: document.querySelector("#generated-candidate-link"),
  candidateLinkCount: document.querySelector("#candidate-link-count"),
  refreshCandidateLinks: document.querySelector("#refresh-candidate-links"),
  candidateLinkList: document.querySelector("#candidate-link-list"),
  candidateSearchInput: document.querySelector("#candidate-search"),
  candidateViewFilter: document.querySelector("#candidate-view-filter"),
  candidateStatusFilter: document.querySelector("#candidate-status-filter"),
  candidatePriorityFilter: document.querySelector("#candidate-priority-filter"),
  candidateSortOrder: document.querySelector("#candidate-sort-order"),
  exportCandidatesJsonButton: document.querySelector("#export-candidates-json"),
  clearCandidateFilters: document.querySelector("#clear-candidate-filters"),
  candidateBulkBar: document.querySelector("#candidate-bulk-bar"),
  candidateSelectedCount: document.querySelector("#candidate-selected-count"),
  selectVisibleCandidates: document.querySelector("#select-visible-candidates"),
  candidateList: document.querySelector("#candidate-list"),
  candidateDetailPanel: document.querySelector("#candidate-detail-panel"),
  candidateResultCount: document.querySelector("#candidate-result-count"),
};

const STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  closed: "Closed",
  archived: "Archived",
};

const HIRING_TYPE_LABELS = {
  Permanent: "Permanent",
  Contract: "Contract",
  Hybrid: "Hybrid",
  "Not sure": "Not sure",
};

const SENIORITY_LABELS = {
  Mid: "Mid",
  Senior: "Senior",
  Lead: "Lead",
  Manager: "Manager",
  Executive: "Executive",
  "Not sure": "Not sure",
};

const LOCATION_REQUIREMENT_LABELS = {
  "Dubai onsite": "Dubai onsite",
  "Dubai hybrid": "Dubai hybrid",
  "Remote but Dubai company": "Remote but Dubai company",
  "Not sure": "Not sure",
};

const PRIORITY_LABELS = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const PRIORITY_RANK = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

const CANDIDATE_STATUS_LABELS = {
  new: "New",
  reviewing: "Reviewing",
  shortlisted: "Shortlisted",
  shared: "Shared",
  placed: "Placed",
  closed: "Closed",
};

const state = {
  challengeId: "",
  leads: [],
  candidates: [],
  candidateLinks: [],
  activeId: "",
  activeCandidateId: "",
  selectedIds: new Set(),
  selectedCandidateIds: new Set(),
  activeTab: "leads",
  loading: false,
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(message, type = "info") {
  els.authStatus.textContent = message;
  els.authStatus.className = `status is-visible is-${type}`;
}

function clearStatus() {
  els.authStatus.textContent = "";
  els.authStatus.className = "status";
}

function isCompactLayout() {
  return window.matchMedia("(max-width: 1180px)").matches;
}

function scrollPanelIntoView(panel) {
  if (!panel || !isCompactLayout()) {
    return;
  }

  window.requestAnimationFrame(() => {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function showDashboard() {
  els.authView.classList.add("is-hidden");
  els.dashboard.classList.remove("is-hidden");
}

function showAuth() {
  els.dashboard.classList.add("is-hidden");
  els.authView.classList.remove("is-hidden");
}

function showToast(message, type = "info") {
  let toast = document.querySelector("#toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.append(toast);
  }

  toast.textContent = message;
  toast.className = `toast is-visible is-${type}`;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
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

function adminOf(lead) {
  return {
    status: lead.admin?.status || "new",
    priority: lead.admin?.priority || "normal",
    read: Boolean(lead.admin?.read),
    starred: Boolean(lead.admin?.starred),
    archived: Boolean(lead.admin?.archived),
    ownerNotes: lead.admin?.ownerNotes || "",
    nextStepAt: lead.admin?.nextStepAt || "",
    tags: Array.isArray(lead.admin?.tags) ? lead.admin.tags : [],
    history: Array.isArray(lead.admin?.history) ? lead.admin.history : [],
  };
}

function candidateAdminOf(candidate) {
  return {
    status: candidate.admin?.status || "new",
    priority: candidate.admin?.priority || "normal",
    read: Boolean(candidate.admin?.read),
    starred: Boolean(candidate.admin?.starred),
    archived: Boolean(candidate.admin?.archived),
    ownerNotes: candidate.admin?.ownerNotes || "",
    nextStepAt: candidate.admin?.nextStepAt || "",
    tags: Array.isArray(candidate.admin?.tags) ? candidate.admin.tags : [],
    history: Array.isArray(candidate.admin?.history) ? candidate.admin.history : [],
  };
}

function showAdminTab(tab) {
  state.activeTab = tab;
  els.leadsView.classList.toggle("is-hidden", tab !== "leads");
  els.candidatesView.classList.toggle("is-hidden", tab !== "candidates");
  els.dashboardTitle.textContent = tab === "candidates" ? "Candidate intake" : "Hiring requests";

  els.tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminTab === tab);
  });
}

function formatDate(value, options = {}) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: options.short ? "medium" : "long",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(date);
}

function toInputDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromInputDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function searchText(lead) {
  const admin = adminOf(lead);
  return [
    lead.companyName,
    lead.company,
    lead.contactName,
    lead.name,
    lead.email,
    lead.phone,
    lead.location,
    lead.locationRequirement,
    lead.hiringModel,
    lead.hiringType,
    lead.seniority,
    lead.roles,
    lead.roleTitle,
    lead.notes,
    lead.message,
    admin.status,
    admin.priority,
    admin.ownerNotes,
    admin.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function candidateSearchText(candidate) {
  const admin = candidateAdminOf(candidate);
  return [
    candidate.fullName,
    candidate.email,
    candidate.phone,
    candidate.currentLocation,
    candidate.nationality,
    candidate.currentTitle,
    candidate.experienceYears,
    candidate.targetRoles,
    candidate.seniority,
    candidate.workModes,
    candidate.preferredLocations,
    candidate.noticePeriod,
    candidate.languages,
    candidate.summary,
    admin.status,
    admin.priority,
    admin.ownerNotes,
    admin.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function currentFilters() {
  return {
    query: els.searchInput.value.trim().toLowerCase(),
    view: els.viewFilter.value,
    status: els.statusFilter.value,
    priority: els.priorityFilter.value,
    sort: els.sortOrder.value,
  };
}

function currentCandidateFilters() {
  return {
    query: els.candidateSearchInput.value.trim().toLowerCase(),
    view: els.candidateViewFilter.value,
    status: els.candidateStatusFilter.value,
    priority: els.candidatePriorityFilter.value,
    sort: els.candidateSortOrder.value,
  };
}

function visibleLeads() {
  const filters = currentFilters();

  return state.leads
    .filter((lead) => {
      const admin = adminOf(lead);

      if (filters.view === "active" && admin.archived) {
        return false;
      }

      if (filters.view === "archived" && !admin.archived) {
        return false;
      }

      if (filters.view === "unread" && (admin.read || admin.archived)) {
        return false;
      }

      if (filters.view === "starred" && (!admin.starred || admin.archived)) {
        return false;
      }

      if (filters.status !== "all" && admin.status !== filters.status) {
        return false;
      }

      if (filters.priority !== "all" && admin.priority !== filters.priority) {
        return false;
      }

      return !filters.query || searchText(lead).includes(filters.query);
    })
    .sort((left, right) => {
      const leftAdmin = adminOf(left);
      const rightAdmin = adminOf(right);

      if (filters.sort === "oldest") {
        return String(left.submittedAt).localeCompare(String(right.submittedAt));
      }

      if (filters.sort === "priority") {
        return (
          (PRIORITY_RANK[rightAdmin.priority] || 0) -
            (PRIORITY_RANK[leftAdmin.priority] || 0) ||
          String(right.submittedAt).localeCompare(String(left.submittedAt))
        );
      }

      if (filters.sort === "company") {
        return String(left.company || left.companyName || "").localeCompare(
          String(right.company || right.companyName || ""),
        );
      }

      if (filters.sort === "nextStep") {
        const leftStep = leftAdmin.nextStepAt || "9999";
        const rightStep = rightAdmin.nextStepAt || "9999";
        return leftStep.localeCompare(rightStep);
      }

      return String(right.submittedAt).localeCompare(String(left.submittedAt));
    });
}

function visibleCandidates() {
  const filters = currentCandidateFilters();

  return state.candidates
    .filter((candidate) => {
      const admin = candidateAdminOf(candidate);

      if (filters.view === "active" && admin.archived) {
        return false;
      }

      if (filters.view === "archived" && !admin.archived) {
        return false;
      }

      if (filters.view === "unread" && (admin.read || admin.archived)) {
        return false;
      }

      if (filters.view === "starred" && (!admin.starred || admin.archived)) {
        return false;
      }

      if (filters.status !== "all" && admin.status !== filters.status) {
        return false;
      }

      if (filters.priority !== "all" && admin.priority !== filters.priority) {
        return false;
      }

      return !filters.query || candidateSearchText(candidate).includes(filters.query);
    })
    .sort((left, right) => {
      const leftAdmin = candidateAdminOf(left);
      const rightAdmin = candidateAdminOf(right);

      if (filters.sort === "oldest") {
        return String(left.submittedAt).localeCompare(String(right.submittedAt));
      }

      if (filters.sort === "priority") {
        return (
          (PRIORITY_RANK[rightAdmin.priority] || 0) -
            (PRIORITY_RANK[leftAdmin.priority] || 0) ||
          String(right.submittedAt).localeCompare(String(left.submittedAt))
        );
      }

      if (filters.sort === "name") {
        return String(left.fullName || "").localeCompare(String(right.fullName || ""));
      }

      if (filters.sort === "nextStep") {
        const leftStep = leftAdmin.nextStepAt || "9999";
        const rightStep = rightAdmin.nextStepAt || "9999";
        return leftStep.localeCompare(rightStep);
      }

      return String(right.submittedAt).localeCompare(String(left.submittedAt));
    });
}

function activeLead() {
  return state.leads.find((lead) => lead.id === state.activeId) || null;
}

function activeCandidate() {
  return state.candidates.find((candidate) => candidate.id === state.activeCandidateId) || null;
}

function badge(label, value, prefix) {
  return `<span class="badge ${prefix}-${escapeHtml(value)}">${escapeHtml(label)}</span>`;
}

function leadCard(lead) {
  const admin = adminOf(lead);
  const active = lead.id === state.activeId ? " is-active" : "";
  const unread = admin.read ? "" : " is-unread";
  const selected = state.selectedIds.has(lead.id) ? " checked" : "";
  const company = lead.company || lead.companyName || "Unnamed company";
  const role = lead.roleTitle || lead.roles || "No role details yet";
  const location = lead.locationRequirement || lead.location || "No location";

  return `
    <article class="lead-card${active}${unread}">
      <label class="select-box" aria-label="Select ${escapeHtml(company)}">
        <input type="checkbox" data-select="${escapeHtml(lead.id)}"${selected} />
        <span></span>
      </label>
      <button class="lead-open" data-open="${escapeHtml(lead.id)}" type="button">
        <span class="lead-card-top">
          <span>${escapeHtml(formatDate(lead.submittedAt, { short: true }))}</span>
          <span>${admin.read ? "Read" : "Unread"}</span>
        </span>
        <strong>${escapeHtml(company)}</strong>
        <span class="lead-summary">${escapeHtml(role)}</span>
        <span class="lead-meta">
          ${badge(STATUS_LABELS[admin.status] || "New", admin.status, "status")}
          ${badge(PRIORITY_LABELS[admin.priority] || "Normal", admin.priority, "priority")}
          <span>${escapeHtml(location)}</span>
        </span>
      </button>
      <button
        class="star-button${admin.starred ? " is-starred" : ""}"
        data-star="${escapeHtml(lead.id)}"
        type="button"
        aria-label="${admin.starred ? "Unstar" : "Star"} ${escapeHtml(company)}"
      >
        Star
      </button>
    </article>`;
}

function candidateCard(candidate) {
  const admin = candidateAdminOf(candidate);
  const active = candidate.id === state.activeCandidateId ? " is-active" : "";
  const unread = admin.read ? "" : " is-unread";
  const selected = state.selectedCandidateIds.has(candidate.id) ? " checked" : "";

  return `
    <article class="lead-card${active}${unread}">
      <label class="select-box" aria-label="Select ${escapeHtml(candidate.fullName || "candidate")}">
        <input type="checkbox" data-candidate-select="${escapeHtml(candidate.id)}"${selected} />
        <span></span>
      </label>
      <button class="lead-open" data-candidate-open="${escapeHtml(candidate.id)}" type="button">
        <span class="lead-card-top">
          <span>${escapeHtml(formatDate(candidate.submittedAt, { short: true }))}</span>
          <span>${admin.read ? "Read" : "Unread"}</span>
        </span>
        <strong>${escapeHtml(candidate.fullName || "Unnamed candidate")}</strong>
        <span class="lead-summary">${escapeHtml(candidate.currentTitle || candidate.targetRoles || "No profile summary yet")}</span>
        <span class="lead-meta">
          ${badge(CANDIDATE_STATUS_LABELS[admin.status] || "New", admin.status, "status")}
          ${badge(PRIORITY_LABELS[admin.priority] || "Normal", admin.priority, "priority")}
          <span>${escapeHtml(candidate.currentLocation || "No location")}</span>
        </span>
      </button>
      <button
        class="star-button${admin.starred ? " is-starred" : ""}"
        data-candidate-star="${escapeHtml(candidate.id)}"
        type="button"
        aria-label="${admin.starred ? "Unstar" : "Star"} ${escapeHtml(candidate.fullName || "candidate")}"
      >
        Star
      </button>
    </article>`;
}

function linkStatusBadge(status) {
  return badge(status.charAt(0).toUpperCase() + status.slice(1), status, "status");
}

function candidateLinkCard(invitation) {
  const title = invitation.candidateName || invitation.candidateEmail || "Candidate link";
  const detail = [invitation.roleFocus, invitation.candidateEmail].filter(Boolean).join(" - ");

  return `
    <article class="candidate-link-card">
      <div>
        <span class="lead-card-top">
          <span>${escapeHtml(formatDate(invitation.createdAt, { short: true }))}</span>
          <span>Expires ${escapeHtml(formatDate(invitation.expiresAt, { short: true }))}</span>
        </span>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(detail || invitation.note || "Ready to share")}</p>
        <div class="detail-badges">${linkStatusBadge(invitation.status)}</div>
      </div>
      <div class="link-actions">
        <button class="ghost-button" data-copy-candidate-link="${escapeHtml(invitation.publicUrl)}" type="button">Copy link</button>
        ${invitation.status === "open" ? `<button class="danger-button" data-revoke-candidate-link="${escapeHtml(invitation.id)}" type="button">Revoke</button>` : ""}
      </div>
    </article>`;
}

function renderStats() {
  const active = state.leads.filter((lead) => !adminOf(lead).archived);
  const unread = active.filter((lead) => !adminOf(lead).read);
  const priority = active.filter((lead) => ["urgent", "high"].includes(adminOf(lead).priority));

  els.totalLeads.textContent = String(active.length);
  els.unreadLeads.textContent = String(unread.length);
  els.priorityLeads.textContent = String(priority.length);
  els.latestCompany.textContent = active[0]?.company || active[0]?.companyName || "None";
  els.leadTabCount.textContent = String(active.length);
}

function renderCandidateStats() {
  const active = state.candidates.filter((candidate) => !candidateAdminOf(candidate).archived);
  const unread = active.filter((candidate) => !candidateAdminOf(candidate).read);
  const openLinks = state.candidateLinks.filter((link) => link.status === "open");

  els.totalCandidates.textContent = String(active.length);
  els.unreadCandidates.textContent = String(unread.length);
  els.openCandidateLinks.textContent = String(openLinks.length);
  els.latestCandidate.textContent = active[0]?.fullName || "None";
  els.candidateTabCount.textContent = String(active.length);
}

function renderBulkBar() {
  const count = state.selectedIds.size;
  els.bulkBar.classList.toggle("is-hidden", count === 0);
  els.selectedCount.textContent = `${count} selected`;
}

function renderCandidateBulkBar() {
  const count = state.selectedCandidateIds.size;
  els.candidateBulkBar.classList.toggle("is-hidden", count === 0);
  els.candidateSelectedCount.textContent = `${count} selected`;
}

function renderList() {
  const leads = visibleLeads();

  els.resultCount.textContent = `${leads.length} ${leads.length === 1 ? "result" : "results"}`;

  if (!leads.length) {
    els.leadList.innerHTML = `
      <div class="empty-state">
        <p class="eyebrow">No results</p>
        <h2>No hiring requests match this view</h2>
        <p class="muted">Change the filters or refresh to load new submissions.</p>
      </div>`;
    renderBulkBar();
    return;
  }

  els.leadList.innerHTML = leads.map(leadCard).join("");
  renderBulkBar();
}

function renderCandidateLinks() {
  els.candidateLinkCount.textContent = `${state.candidateLinks.length} ${state.candidateLinks.length === 1 ? "link" : "links"}`;

  if (!state.candidateLinks.length) {
    els.candidateLinkList.innerHTML = `
      <div class="empty-state small">
        <p class="eyebrow">No links</p>
        <h2>No candidate links yet</h2>
        <p class="muted">Generate a secure intake link when you are ready to collect a candidate profile.</p>
      </div>`;
    return;
  }

  els.candidateLinkList.innerHTML = state.candidateLinks.slice(0, 12).map(candidateLinkCard).join("");
}

function renderCandidateList() {
  const candidates = visibleCandidates();

  els.candidateResultCount.textContent = `${candidates.length} ${candidates.length === 1 ? "result" : "results"}`;

  if (!candidates.length) {
    els.candidateList.innerHTML = `
      <div class="empty-state">
        <p class="eyebrow">No results</p>
        <h2>No candidate profiles match this view</h2>
        <p class="muted">Create a link, wait for a submission, or adjust the filters.</p>
      </div>`;
    renderCandidateBulkBar();
    return;
  }

  els.candidateList.innerHTML = candidates.map(candidateCard).join("");
  renderCandidateBulkBar();
}

function optionsHtml(options, selectedValue) {
  const entries = Object.entries(options);
  const hasSelected = entries.some(([value]) => value === selectedValue);
  const customOption = selectedValue && !hasSelected
    ? `<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)}</option>`
    : "";

  return customOption + entries
    .map(([value, label]) => {
      const selected = value === selectedValue ? " selected" : "";
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function signatureSvg(strokes = []) {
  const paths = strokes
    .filter((stroke) => Array.isArray(stroke) && stroke.length > 1)
    .map((stroke) => {
      const points = stroke
        .filter((point) => Array.isArray(point) && point.length === 2)
        .map(([x, y]) => [
          Math.max(0, Math.min(1, Number(x))) * 520,
          Math.max(0, Math.min(1, Number(y))) * 180,
        ]);

      if (points.length < 2) {
        return "";
      }

      const d = points
        .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
        .join(" ");

      return `<path d="${d}" />`;
    })
    .join("");

  if (!paths) {
    return `<div class="signature-preview empty">No signature recorded.</div>`;
  }

  return `
    <svg class="signature-preview" viewBox="0 0 520 180" role="img" aria-label="Candidate signature">
      ${paths}
    </svg>`;
}

function renderDetail() {
  const lead = activeLead();

  if (!lead) {
    els.detailPanel.innerHTML = `
      <div class="empty-state">
        <p class="eyebrow">Details</p>
        <h2>Select a hiring request</h2>
        <p class="muted">Choose a request from the inbox to manage it.</p>
      </div>`;
    return;
  }

  const admin = adminOf(lead);
  const company = lead.company || lead.companyName || "Unnamed company";
  const contactName = lead.name || lead.contactName || "";
  const roleTitle = lead.roleTitle || lead.roles || "";
  const hiringType = lead.hiringType || lead.hiringModel || "Not sure";
  const seniority = lead.seniority || "Not sure";
  const locationRequirement = lead.locationRequirement || lead.location || "Not sure";
  const message = lead.message || lead.notes || "";

  els.detailPanel.innerHTML = `
    <div class="detail-header">
      <div>
        <p class="eyebrow">${escapeHtml(formatDate(lead.submittedAt))}</p>
        <h2>${escapeHtml(company)}</h2>
        <div class="detail-badges">
          ${badge(STATUS_LABELS[admin.status] || "New", admin.status, "status")}
          ${badge(PRIORITY_LABELS[admin.priority] || "Normal", admin.priority, "priority")}
          ${admin.starred ? badge("Starred", "starred", "flag") : ""}
          ${admin.archived ? badge("Archived", "archived", "flag") : ""}
        </div>
      </div>
      <div class="detail-actions">
        <button class="ghost-button mobile-only" data-detail-action="back-list" type="button">Back to list</button>
        <a class="button-link" href="mailto:${escapeHtml(lead.email || "")}">Email</a>
        ${lead.phone ? `<a class="button-link ghost-link" href="tel:${escapeHtml(lead.phone)}">Call</a>` : ""}
        <button class="ghost-button" data-detail-action="copy" type="button">Copy</button>
      </div>
    </div>

    <form class="detail-form" id="detail-form">
      <div class="form-row three">
        <label>
          <span>Status</span>
          <select name="status">${optionsHtml(STATUS_LABELS, admin.status)}</select>
        </label>
        <label>
          <span>Priority</span>
          <select name="priority">${optionsHtml(PRIORITY_LABELS, admin.priority)}</select>
        </label>
        <label>
          <span>Next step</span>
          <input name="nextStepAt" type="datetime-local" value="${escapeHtml(toInputDateTime(admin.nextStepAt))}" />
        </label>
      </div>

      <div class="form-row two">
        <label>
          <span>Company</span>
          <input name="company" value="${escapeHtml(company)}" required />
        </label>
        <label>
          <span>Name</span>
          <input name="name" value="${escapeHtml(contactName)}" required />
        </label>
      </div>

      <div class="form-row two">
        <label>
          <span>Email</span>
          <input name="email" type="email" value="${escapeHtml(lead.email)}" required />
        </label>
        <label>
          <span>Phone / WhatsApp</span>
          <input name="phone" value="${escapeHtml(lead.phone)}" />
        </label>
      </div>

      <div class="form-row three">
        <label>
          <span>Hiring type</span>
          <select name="hiringType">${optionsHtml(HIRING_TYPE_LABELS, hiringType)}</select>
        </label>
        <label>
          <span>Seniority</span>
          <select name="seniority">${optionsHtml(SENIORITY_LABELS, seniority)}</select>
        </label>
        <label>
          <span>Location requirement</span>
          <select name="locationRequirement">${optionsHtml(LOCATION_REQUIREMENT_LABELS, locationRequirement)}</select>
        </label>
      </div>

      <label>
        <span>Role or title needed</span>
        <input name="roleTitle" value="${escapeHtml(roleTitle)}" required />
      </label>

      <label>
        <span>Hiring context</span>
        <textarea name="message" rows="5" required>${escapeHtml(message)}</textarea>
      </label>

      <label>
        <span>Internal notes</span>
        <textarea name="ownerNotes" rows="5" placeholder="Private notes, follow-up context, objections, next call summary...">${escapeHtml(admin.ownerNotes)}</textarea>
      </label>

      <label>
        <span>Tags</span>
        <input name="tags" value="${escapeHtml(admin.tags.join(", "))}" placeholder="enterprise, urgent, leadership" />
      </label>

      <div class="detail-footer">
        <button type="submit">Save changes</button>
        <button class="ghost-button" data-detail-action="toggle-read" type="button">
          Mark ${admin.read ? "unread" : "read"}
        </button>
        <button class="ghost-button" data-detail-action="toggle-star" type="button">
          ${admin.starred ? "Unstar" : "Star"}
        </button>
        <button class="ghost-button" data-detail-action="toggle-archive" type="button">
          ${admin.archived ? "Unarchive" : "Archive"}
        </button>
        <button class="danger-button" data-detail-action="delete" type="button">Delete</button>
      </div>
    </form>

    <div class="history">
      <p class="eyebrow">Activity</p>
      ${admin.history.length ? admin.history.slice().reverse().map((item) => `
        <p><strong>${escapeHtml(formatDate(item.at, { short: true }))}</strong> ${escapeHtml(item.action || "Updated")}</p>
      `).join("") : "<p>No admin changes yet.</p>"}
    </div>`;
}

function renderCandidateDetail() {
  const candidate = activeCandidate();

  if (!candidate) {
    els.candidateDetailPanel.innerHTML = `
      <div class="empty-state">
        <p class="eyebrow">Details</p>
        <h2>Select a candidate</h2>
        <p class="muted">Choose a profile from the inbox to manage it.</p>
      </div>`;
    return;
  }

  const admin = candidateAdminOf(candidate);
  const consent = candidate.consent || {};

  els.candidateDetailPanel.innerHTML = `
    <div class="detail-header">
      <div>
        <p class="eyebrow">${escapeHtml(formatDate(candidate.submittedAt))}</p>
        <h2>${escapeHtml(candidate.fullName || "Unnamed candidate")}</h2>
        <div class="detail-badges">
          ${badge(CANDIDATE_STATUS_LABELS[admin.status] || "New", admin.status, "status")}
          ${badge(PRIORITY_LABELS[admin.priority] || "Normal", admin.priority, "priority")}
          ${admin.starred ? badge("Starred", "starred", "flag") : ""}
          ${admin.archived ? badge("Archived", "archived", "flag") : ""}
        </div>
      </div>
      <div class="detail-actions">
        <button class="ghost-button mobile-only" data-candidate-detail-action="back-list" type="button">Back to list</button>
        <a class="button-link" href="/api/admin/candidate-cv?id=${encodeURIComponent(candidate.id)}">CV</a>
        <a class="button-link ghost-link" href="mailto:${escapeHtml(candidate.email || "")}">Email</a>
        <a class="button-link ghost-link" href="tel:${escapeHtml(candidate.phone || "")}">Call</a>
        <button class="ghost-button" data-candidate-detail-action="copy" type="button">Copy</button>
      </div>
    </div>

    <form class="detail-form" id="candidate-detail-form">
      <div class="form-row three">
        <label>
          <span>Status</span>
          <select name="status">${optionsHtml(CANDIDATE_STATUS_LABELS, admin.status)}</select>
        </label>
        <label>
          <span>Priority</span>
          <select name="priority">${optionsHtml(PRIORITY_LABELS, admin.priority)}</select>
        </label>
        <label>
          <span>Next step</span>
          <input name="nextStepAt" type="datetime-local" value="${escapeHtml(toInputDateTime(admin.nextStepAt))}" />
        </label>
      </div>

      <div class="form-row two">
        <label>
          <span>Full name</span>
          <input name="fullName" value="${escapeHtml(candidate.fullName)}" required />
        </label>
        <label>
          <span>Email</span>
          <input name="email" type="email" value="${escapeHtml(candidate.email)}" required />
        </label>
      </div>

      <div class="form-row two">
        <label>
          <span>Phone</span>
          <input name="phone" value="${escapeHtml(candidate.phone)}" required />
        </label>
        <label>
          <span>Current location</span>
          <input name="currentLocation" value="${escapeHtml(candidate.currentLocation)}" required />
        </label>
      </div>

      <div class="form-row two">
        <label>
          <span>Current title</span>
          <input name="currentTitle" value="${escapeHtml(candidate.currentTitle)}" required />
        </label>
        <label>
          <span>Experience</span>
          <input name="experienceYears" value="${escapeHtml(candidate.experienceYears)}" required />
        </label>
      </div>

      <div class="form-row two">
        <label>
          <span>Preferred locations</span>
          <input name="preferredLocations" value="${escapeHtml(candidate.preferredLocations)}" required />
        </label>
        <label>
          <span>Notice period</span>
          <input name="noticePeriod" value="${escapeHtml(candidate.noticePeriod)}" required />
        </label>
      </div>

      <div class="form-row two">
        <label>
          <span>Seniority</span>
          <input name="seniority" value="${escapeHtml(candidate.seniority)}" />
        </label>
        <label>
          <span>Work mode</span>
          <input name="workModes" value="${escapeHtml(candidate.workModes)}" />
        </label>
      </div>

      <div class="form-row two">
        <label>
          <span>LinkedIn</span>
          <input name="linkedin" value="${escapeHtml(candidate.linkedin)}" />
        </label>
        <label>
          <span>Portfolio</span>
          <input name="portfolio" value="${escapeHtml(candidate.portfolio)}" />
        </label>
      </div>

      <div class="form-row two">
        <label>
          <span>Nationality</span>
          <input name="nationality" value="${escapeHtml(candidate.nationality)}" />
        </label>
        <label>
          <span>Salary expectation</span>
          <input name="salaryExpectation" value="${escapeHtml(candidate.salaryExpectation)}" />
        </label>
      </div>

      <label>
        <span>Languages</span>
        <input name="languages" value="${escapeHtml(candidate.languages)}" />
      </label>

      <label>
        <span>Target roles</span>
        <textarea name="targetRoles" rows="4" required>${escapeHtml(candidate.targetRoles)}</textarea>
      </label>

      <label>
        <span>Profile summary</span>
        <textarea name="summary" rows="5" required>${escapeHtml(candidate.summary)}</textarea>
      </label>

      <section class="consent-card" aria-label="Consent record">
        <div>
          <p class="eyebrow">Consent record</p>
          <h3>${escapeHtml(consent.signedName || candidate.fullName || "Signed")}</h3>
          <p class="muted">Signed ${escapeHtml(formatDate(consent.signedAt, { short: true }))}. Notice version ${escapeHtml(consent.noticeVersion || "candidate-consent-2026-06-16")}.</p>
        </div>
        ${signatureSvg(consent.signatureStrokes)}
        <dl class="consent-list">
          <div><dt>Share with employer clients</dt><dd>${consent.shareWithClients ? "Yes" : "No"}</dd></div>
          <div><dt>Store for opportunities</dt><dd>${consent.storeForOpportunities ? "Yes" : "No"}</dd></div>
          <div><dt>Accuracy confirmed</dt><dd>${consent.accuracyConfirmed ? "Yes" : "No"}</dd></div>
          <div><dt>CV</dt><dd>${escapeHtml(candidate.cv?.filename || "Attached")}</dd></div>
        </dl>
      </section>

      <label>
        <span>Internal notes</span>
        <textarea name="ownerNotes" rows="5" placeholder="Private notes, shortlist thinking, client fit, follow-up context...">${escapeHtml(admin.ownerNotes)}</textarea>
      </label>

      <label>
        <span>Tags</span>
        <input name="tags" value="${escapeHtml(admin.tags.join(", "))}" placeholder="leadership, dubai, finance, available-now" />
      </label>

      <div class="detail-footer">
        <button type="submit">Save changes</button>
        <button class="ghost-button" data-candidate-detail-action="toggle-read" type="button">
          Mark ${admin.read ? "unread" : "read"}
        </button>
        <button class="ghost-button" data-candidate-detail-action="toggle-star" type="button">
          ${admin.starred ? "Unstar" : "Star"}
        </button>
        <button class="ghost-button" data-candidate-detail-action="toggle-archive" type="button">
          ${admin.archived ? "Unarchive" : "Archive"}
        </button>
        <button class="danger-button" data-candidate-detail-action="delete" type="button">Delete</button>
      </div>
    </form>

    <div class="history">
      <p class="eyebrow">Activity</p>
      ${admin.history.length ? admin.history.slice().reverse().map((item) => `
        <p><strong>${escapeHtml(formatDate(item.at, { short: true }))}</strong> ${escapeHtml(item.action || "Updated")}</p>
      `).join("") : "<p>No admin changes yet.</p>"}
    </div>`;
}

function renderAll() {
  renderStats();
  renderList();
  renderDetail();
}

function renderCandidatesAll() {
  renderCandidateStats();
  renderCandidateLinks();
  renderCandidateList();
  renderCandidateDetail();
}

function mergeUpdatedLeads(updatedLeads) {
  for (const updated of updatedLeads) {
    const index = state.leads.findIndex((lead) => lead.id === updated.id);

    if (index >= 0) {
      state.leads[index] = updated;
    } else {
      state.leads.unshift(updated);
    }
  }

  state.leads.sort((left, right) =>
    String(right.submittedAt).localeCompare(String(left.submittedAt)),
  );
}

function mergeUpdatedCandidates(updatedCandidates) {
  for (const updated of updatedCandidates) {
    const index = state.candidates.findIndex((candidate) => candidate.id === updated.id);

    if (index >= 0) {
      state.candidates[index] = updated;
    } else {
      state.candidates.unshift(updated);
    }
  }

  state.candidates.sort((left, right) =>
    String(right.submittedAt).localeCompare(String(left.submittedAt)),
  );
}

async function patchLeads(ids, patch, options = {}) {
  const result = await api("/api/admin/lead", {
    method: "PATCH",
    body: JSON.stringify({ ids, patch }),
  });

  mergeUpdatedLeads(result.leads || []);

  if (!options.keepSelection) {
    ids.forEach((id) => state.selectedIds.delete(id));
  }

  renderAll();
  showToast(options.message || "Hiring request updated.", "success");
}

async function patchCandidates(ids, patch, options = {}) {
  const result = await api("/api/admin/candidate", {
    method: "PATCH",
    body: JSON.stringify({ ids, patch }),
  });

  mergeUpdatedCandidates(result.candidates || []);

  if (!options.keepSelection) {
    ids.forEach((id) => state.selectedCandidateIds.delete(id));
  }

  renderCandidatesAll();
  showToast(options.message || "Candidate updated.", "success");
}

async function deleteLeads(ids) {
  const result = await api("/api/admin/lead", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });

  const deletedIds = new Set((result.deleted || []).map((item) => item.id));
  state.leads = state.leads.filter((lead) => !deletedIds.has(lead.id));
  deletedIds.forEach((id) => state.selectedIds.delete(id));

  if (deletedIds.has(state.activeId)) {
    state.activeId = visibleLeads()[0]?.id || "";
  }

  renderAll();
  showToast("Hiring request deleted.", "success");
}

async function deleteCandidates(ids) {
  const result = await api("/api/admin/candidate", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });

  const deletedIds = new Set((result.deleted || []).map((item) => item.id));
  state.candidates = state.candidates.filter((candidate) => !deletedIds.has(candidate.id));
  deletedIds.forEach((id) => state.selectedCandidateIds.delete(id));

  if (deletedIds.has(state.activeCandidateId)) {
    state.activeCandidateId = visibleCandidates()[0]?.id || "";
  }

  renderCandidatesAll();
  showToast("Candidate deleted.", "success");
}

async function loadLeads() {
  state.loading = true;
  els.leadList.innerHTML = `
    <div class="empty-state">
      <p class="eyebrow">Loading</p>
      <h2>Loading hiring requests</h2>
      <p class="muted">Fetching the latest company submissions from secure storage.</p>
    </div>`;

  try {
    const result = await api("/api/admin/leads?limit=10000");
    state.leads = result.leads || [];
    state.activeId = state.activeId || visibleLeads()[0]?.id || state.leads[0]?.id || "";
    els.sessionNote.textContent = `Last refreshed ${formatDate(result.generatedAt, { short: true })}`;
    renderAll();
  } finally {
    state.loading = false;
  }
}

async function loadCandidateLinks() {
  const result = await api("/api/admin/candidate-links?limit=10000");
  state.candidateLinks = result.invitations || [];
  renderCandidatesAll();
}

async function loadCandidates() {
  els.candidateList.innerHTML = `
    <div class="empty-state">
      <p class="eyebrow">Loading</p>
      <h2>Loading candidate profiles</h2>
      <p class="muted">Fetching submitted profiles, CV metadata, consent records, and admin notes.</p>
    </div>`;

  const [candidateResult, linkResult] = await Promise.all([
    api("/api/admin/candidates?limit=10000"),
    api("/api/admin/candidate-links?limit=10000"),
  ]);

  state.candidates = candidateResult.candidates || [];
  state.candidateLinks = linkResult.invitations || [];
  state.activeCandidateId =
    state.activeCandidateId || visibleCandidates()[0]?.id || state.candidates[0]?.id || "";
  renderCandidatesAll();
}

function detailPatchFromForm(form) {
  const payload = payloadFromForm(form);

  return {
    company: payload.company,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    roleTitle: payload.roleTitle,
    hiringType: payload.hiringType,
    seniority: payload.seniority,
    locationRequirement: payload.locationRequirement,
    message: payload.message,
    status: payload.status,
    priority: payload.priority,
    nextStepAt: fromInputDateTime(payload.nextStepAt),
    ownerNotes: payload.ownerNotes,
    tags: payload.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

function candidateDetailPatchFromForm(form) {
  const payload = payloadFromForm(form);

  return {
    fullName: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    currentLocation: payload.currentLocation,
    nationality: payload.nationality,
    linkedin: payload.linkedin,
    portfolio: payload.portfolio,
    currentTitle: payload.currentTitle,
    experienceYears: payload.experienceYears,
    targetRoles: payload.targetRoles,
    seniority: payload.seniority,
    workModes: payload.workModes,
    preferredLocations: payload.preferredLocations,
    salaryExpectation: payload.salaryExpectation,
    noticePeriod: payload.noticePeriod,
    languages: payload.languages,
    summary: payload.summary,
    status: payload.status,
    priority: payload.priority,
    nextStepAt: fromInputDateTime(payload.nextStepAt),
    ownerNotes: payload.ownerNotes,
    tags: payload.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

function summaryForLead(lead) {
  const admin = adminOf(lead);

  return [
    `Company: ${lead.company || lead.companyName || "-"}`,
    `Name: ${lead.name || lead.contactName || "-"}`,
    `Email: ${lead.email || "-"}`,
    `Phone: ${lead.phone || "-"}`,
    `Role / title needed: ${lead.roleTitle || lead.roles || "-"}`,
    `Hiring type: ${lead.hiringType || lead.hiringModel || "-"}`,
    `Seniority: ${lead.seniority || "-"}`,
    `Location requirement: ${lead.locationRequirement || lead.location || "-"}`,
    `Status: ${STATUS_LABELS[admin.status] || admin.status}`,
    `Priority: ${PRIORITY_LABELS[admin.priority] || admin.priority}`,
    "",
    "Hiring context:",
    lead.message || lead.notes || "-",
    "",
    "Internal notes:",
    admin.ownerNotes || "-",
  ].join("\n");
}

function summaryForCandidate(candidate) {
  const admin = candidateAdminOf(candidate);
  const consent = candidate.consent || {};

  return [
    `Candidate: ${candidate.fullName || "-"}`,
    `Email: ${candidate.email || "-"}`,
    `Phone: ${candidate.phone || "-"}`,
    `Location: ${candidate.currentLocation || "-"}`,
    `Current title: ${candidate.currentTitle || "-"}`,
    `Experience: ${candidate.experienceYears || "-"}`,
    `Preferred locations: ${candidate.preferredLocations || "-"}`,
    `Notice period: ${candidate.noticePeriod || "-"}`,
    `Status: ${CANDIDATE_STATUS_LABELS[admin.status] || admin.status}`,
    `Priority: ${PRIORITY_LABELS[admin.priority] || admin.priority}`,
    `Consent signed: ${consent.signedAt || "-"}`,
    "",
    "Target roles:",
    candidate.targetRoles || "-",
    "",
    "Profile summary:",
    candidate.summary || "-",
    "",
    "Internal notes:",
    admin.ownerNotes || "-",
  ].join("\n");
}

function downloadCandidatesJson() {
  const candidates = visibleCandidates();
  const data = {
    generatedAt: new Date().toISOString(),
    count: candidates.length,
    candidates,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `samer-solutions-candidates-${data.generatedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied.", "success");
  } catch {
    showToast("Copy failed in this browser.", "error");
  }
}

function downloadJson() {
  const leads = visibleLeads();
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
  link.download = `samer-solutions-hiring-requests-${data.generatedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

els.credentialsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();
  setStatus("Checking credentials and sending code...", "info");

  try {
    const result = await api("/api/admin/request-code", {
      method: "POST",
      body: JSON.stringify(payloadFromForm(els.credentialsForm)),
    });
    state.challengeId = result.challengeId;
    els.credentialsForm.classList.add("is-hidden");
    els.codeForm.classList.remove("is-hidden");
    setStatus(`Code sent to ${result.sentTo}.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

els.codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Verifying code...", "info");

  try {
    await api("/api/admin/verify-code", {
      method: "POST",
      body: JSON.stringify({
        challengeId: state.challengeId,
        code: payloadFromForm(els.codeForm).code,
      }),
    });
    clearStatus();
    showDashboard();
    await loadLeads();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

els.backToLogin.addEventListener("click", () => {
  state.challengeId = "";
  els.codeForm.reset();
  els.credentialsForm.classList.remove("is-hidden");
  els.codeForm.classList.add("is-hidden");
  clearStatus();
});

els.tabButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    showAdminTab(button.dataset.adminTab);

    if (state.activeTab === "candidates" && !state.candidates.length && !state.candidateLinks.length) {
      try {
        await loadCandidates();
      } catch (error) {
        showToast(error.message, "error");
      }
    }
  });
});

els.logoutButton.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" }).catch(() => null);
  window.location.reload();
});

els.refreshButton.addEventListener("click", () => {
  const loader = state.activeTab === "candidates" ? loadCandidates : loadLeads;
  loader().catch((error) => showToast(error.message, "error"));
});

for (const control of [
  els.searchInput,
  els.viewFilter,
  els.statusFilter,
  els.priorityFilter,
  els.sortOrder,
]) {
  control.addEventListener("input", renderAll);
  control.addEventListener("change", renderAll);
}

els.clearLeadFilters.addEventListener("click", () => {
  els.searchInput.value = "";
  els.viewFilter.value = "active";
  els.statusFilter.value = "all";
  els.priorityFilter.value = "all";
  els.sortOrder.value = "newest";
  renderAll();
});

for (const control of [
  els.candidateSearchInput,
  els.candidateViewFilter,
  els.candidateStatusFilter,
  els.candidatePriorityFilter,
  els.candidateSortOrder,
]) {
  control.addEventListener("input", renderCandidatesAll);
  control.addEventListener("change", renderCandidatesAll);
}

els.clearCandidateFilters.addEventListener("click", () => {
  els.candidateSearchInput.value = "";
  els.candidateViewFilter.value = "active";
  els.candidateStatusFilter.value = "all";
  els.candidatePriorityFilter.value = "all";
  els.candidateSortOrder.value = "newest";
  renderCandidatesAll();
});

els.candidateLinkForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const result = await api("/api/admin/candidate-links", {
      method: "POST",
      body: JSON.stringify(payloadFromForm(els.candidateLinkForm)),
    });

    state.candidateLinks.unshift(result.invitation);
    els.candidateLinkForm.reset();
    els.generatedCandidateLink.classList.remove("is-hidden");
    els.generatedCandidateLink.innerHTML = `
      <span>Secure link created</span>
      <strong>${escapeHtml(result.invitation.publicUrl)}</strong>
      <button class="ghost-button" data-copy-candidate-link="${escapeHtml(result.invitation.publicUrl)}" type="button">Copy link</button>`;
    renderCandidatesAll();
    showToast("Candidate link created.", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.refreshCandidateLinks.addEventListener("click", () => {
  loadCandidateLinks().catch((error) => showToast(error.message, "error"));
});

els.candidateLinkList.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy-candidate-link]");
  const revokeButton = event.target.closest("[data-revoke-candidate-link]");

  if (copyButton) {
    await copyText(copyButton.dataset.copyCandidateLink);
    return;
  }

  if (!revokeButton) {
    return;
  }

  if (!window.confirm("Revoke this candidate link? It will stop working immediately.")) {
    return;
  }

  try {
    const result = await api("/api/admin/candidate-links", {
      method: "PATCH",
      body: JSON.stringify({ id: revokeButton.dataset.revokeCandidateLink, action: "revoke" }),
    });
    const index = state.candidateLinks.findIndex((link) => link.id === result.invitation.id);

    if (index >= 0) {
      state.candidateLinks[index] = result.invitation;
    }

    renderCandidatesAll();
    showToast("Candidate link revoked.", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.generatedCandidateLink.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy-candidate-link]");

  if (copyButton) {
    await copyText(copyButton.dataset.copyCandidateLink);
  }
});

els.leadList.addEventListener("change", (event) => {
  const id = event.target.dataset.select;

  if (!id) {
    return;
  }

  if (event.target.checked) {
    state.selectedIds.add(id);
  } else {
    state.selectedIds.delete(id);
  }

  renderBulkBar();
});

els.leadList.addEventListener("click", async (event) => {
  const openButton = event.target.closest("[data-open]");
  const starButton = event.target.closest("[data-star]");

  if (starButton) {
    const id = starButton.dataset.star;
    const lead = state.leads.find((item) => item.id === id);
    await patchLeads([id], { starred: !adminOf(lead).starred }, { message: "Star updated." });
    return;
  }

  if (!openButton) {
    return;
  }

  state.activeId = openButton.dataset.open;
  renderAll();
  scrollPanelIntoView(els.detailPanel);

  const lead = activeLead();

  if (lead && !adminOf(lead).read) {
    await patchLeads([lead.id], { read: true }, { keepSelection: true, message: "Marked read." });
  }
});

els.candidateList.addEventListener("change", (event) => {
  const id = event.target.dataset.candidateSelect;

  if (!id) {
    return;
  }

  if (event.target.checked) {
    state.selectedCandidateIds.add(id);
  } else {
    state.selectedCandidateIds.delete(id);
  }

  renderCandidateBulkBar();
});

els.candidateList.addEventListener("click", async (event) => {
  const openButton = event.target.closest("[data-candidate-open]");
  const starButton = event.target.closest("[data-candidate-star]");

  if (starButton) {
    const id = starButton.dataset.candidateStar;
    const candidate = state.candidates.find((item) => item.id === id);
    await patchCandidates([id], { starred: !candidateAdminOf(candidate).starred }, { message: "Star updated." });
    return;
  }

  if (!openButton) {
    return;
  }

  state.activeCandidateId = openButton.dataset.candidateOpen;
  renderCandidatesAll();
  scrollPanelIntoView(els.candidateDetailPanel);

  const candidate = activeCandidate();

  if (candidate && !candidateAdminOf(candidate).read) {
    await patchCandidates([candidate.id], { read: true }, { keepSelection: true, message: "Marked read." });
  }
});

els.detailPanel.addEventListener("submit", async (event) => {
  if (event.target.id !== "detail-form") {
    return;
  }

  event.preventDefault();
  const lead = activeLead();

  if (!lead) {
    return;
  }

  try {
    await patchLeads([lead.id], detailPatchFromForm(event.target), {
      message: "Hiring request saved.",
    });
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.candidateDetailPanel.addEventListener("submit", async (event) => {
  if (event.target.id !== "candidate-detail-form") {
    return;
  }

  event.preventDefault();
  const candidate = activeCandidate();

  if (!candidate) {
    return;
  }

  try {
    await patchCandidates([candidate.id], candidateDetailPatchFromForm(event.target), {
      message: "Candidate saved.",
    });
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.detailPanel.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-detail-action]");

  if (!actionButton) {
    return;
  }

  const lead = activeLead();

  if (!lead) {
    return;
  }

  const admin = adminOf(lead);
  const action = actionButton.dataset.detailAction;

  try {
    if (action === "back-list") {
      scrollPanelIntoView(els.leadList.closest(".inbox-panel"));
      return;
    }

    if (action === "copy") {
      await copyText(summaryForLead(lead));
      return;
    }

    if (action === "toggle-read") {
      await patchLeads([lead.id], { read: !admin.read }, { message: "Read state updated." });
      return;
    }

    if (action === "toggle-star") {
      await patchLeads([lead.id], { starred: !admin.starred }, { message: "Star updated." });
      return;
    }

    if (action === "toggle-archive") {
      await patchLeads(
        [lead.id],
        admin.archived
          ? { archived: false, status: admin.status === "archived" ? "new" : admin.status }
          : { archived: true, status: "archived" },
        { message: "Archive state updated." },
      );
      return;
    }

    if (action === "delete" && window.confirm("Delete this hiring request permanently?")) {
      await deleteLeads([lead.id]);
    }
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.candidateDetailPanel.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-candidate-detail-action]");

  if (!actionButton) {
    return;
  }

  const candidate = activeCandidate();

  if (!candidate) {
    return;
  }

  const admin = candidateAdminOf(candidate);
  const action = actionButton.dataset.candidateDetailAction;

  try {
    if (action === "back-list") {
      scrollPanelIntoView(els.candidateList.closest(".inbox-panel"));
      return;
    }

    if (action === "copy") {
      await copyText(summaryForCandidate(candidate));
      return;
    }

    if (action === "toggle-read") {
      await patchCandidates([candidate.id], { read: !admin.read }, { message: "Read state updated." });
      return;
    }

    if (action === "toggle-star") {
      await patchCandidates([candidate.id], { starred: !admin.starred }, { message: "Star updated." });
      return;
    }

    if (action === "toggle-archive") {
      await patchCandidates([candidate.id], { archived: !admin.archived }, { message: "Archive state updated." });
      return;
    }

    if (action === "delete" && window.confirm("Delete this candidate and CV permanently?")) {
      await deleteCandidates([candidate.id]);
    }
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.bulkBar.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-bulk-action]");

  if (!button) {
    return;
  }

  const ids = Array.from(state.selectedIds);

  if (!ids.length) {
    return;
  }

  try {
    if (button.dataset.bulkAction === "delete") {
      if (window.confirm(`Delete ${ids.length} selected hiring requests permanently?`)) {
        await deleteLeads(ids);
      }
      return;
    }

    const patches = {
      read: { read: true },
      unread: { read: false },
      archive: { archived: true, status: "archived" },
      unarchive: { archived: false, status: "new" },
    };

    await patchLeads(ids, patches[button.dataset.bulkAction], {
      message: "Bulk update complete.",
    });
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.candidateBulkBar.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-candidate-bulk-action]");

  if (!button) {
    return;
  }

  const ids = Array.from(state.selectedCandidateIds);

  if (!ids.length) {
    return;
  }

  try {
    if (button.dataset.candidateBulkAction === "delete") {
      if (window.confirm(`Delete ${ids.length} selected candidates and CVs permanently?`)) {
        await deleteCandidates(ids);
      }
      return;
    }

    const patches = {
      read: { read: true },
      unread: { read: false },
      archive: { archived: true },
      unarchive: { archived: false },
    };

    await patchCandidates(ids, patches[button.dataset.candidateBulkAction], {
      message: "Bulk update complete.",
    });
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.selectVisible.addEventListener("click", () => {
  const ids = visibleLeads().map((lead) => lead.id);
  const allSelected = ids.length && ids.every((id) => state.selectedIds.has(id));

  if (allSelected) {
    ids.forEach((id) => state.selectedIds.delete(id));
  } else {
    ids.forEach((id) => state.selectedIds.add(id));
  }

  renderList();
});

els.selectVisibleCandidates.addEventListener("click", () => {
  const ids = visibleCandidates().map((candidate) => candidate.id);
  const allSelected = ids.length && ids.every((id) => state.selectedCandidateIds.has(id));

  if (allSelected) {
    ids.forEach((id) => state.selectedCandidateIds.delete(id));
  } else {
    ids.forEach((id) => state.selectedCandidateIds.add(id));
  }

  renderCandidateList();
});

els.exportJsonButton.addEventListener("click", downloadJson);
els.exportCandidatesJsonButton.addEventListener("click", downloadCandidatesJson);

api("/api/admin/session")
  .then(async (result) => {
    els.sessionNote.textContent = `Signed in as ${result.user}. Session expires ${formatDate(result.expiresAt, { short: true })}.`;
    showDashboard();
    await loadLeads();
  })
  .catch(() => showAuth());
