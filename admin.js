const els = {
  authView: document.querySelector("#auth-view"),
  dashboard: document.querySelector("#dashboard"),
  credentialsForm: document.querySelector("#credentials-form"),
  codeForm: document.querySelector("#code-form"),
  authStatus: document.querySelector("#auth-status"),
  backToLogin: document.querySelector("#back-to-login"),
  logoutButton: document.querySelector("#logout-button"),
  refreshButton: document.querySelector("#refresh-button"),
  exportJsonButton: document.querySelector("#export-json"),
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
};

const STATUS_LABELS = {
  new: "New",
  reviewing: "Reviewing",
  contacted: "Contacted",
  qualified: "Qualified",
  closed: "Closed",
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

const state = {
  challengeId: "",
  leads: [],
  activeId: "",
  selectedIds: new Set(),
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
    lead.contactName,
    lead.email,
    lead.phone,
    lead.location,
    lead.hiringModel,
    lead.roles,
    lead.notes,
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
        return String(left.companyName || "").localeCompare(String(right.companyName || ""));
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

function badge(label, value, prefix) {
  return `<span class="badge ${prefix}-${escapeHtml(value)}">${escapeHtml(label)}</span>`;
}

function leadCard(lead) {
  const admin = adminOf(lead);
  const active = lead.id === state.activeId ? " is-active" : "";
  const unread = admin.read ? "" : " is-unread";
  const selected = state.selectedIds.has(lead.id) ? " checked" : "";

  return `
    <article class="lead-card${active}${unread}">
      <label class="select-box" aria-label="Select ${escapeHtml(lead.companyName || "lead")}">
        <input type="checkbox" data-select="${escapeHtml(lead.id)}"${selected} />
        <span></span>
      </label>
      <button class="lead-open" data-open="${escapeHtml(lead.id)}" type="button">
        <span class="lead-card-top">
          <span>${escapeHtml(formatDate(lead.submittedAt, { short: true }))}</span>
          <span>${admin.read ? "Read" : "Unread"}</span>
        </span>
        <strong>${escapeHtml(lead.companyName || "Unnamed company")}</strong>
        <span class="lead-summary">${escapeHtml(lead.roles || "No role details yet")}</span>
        <span class="lead-meta">
          ${badge(STATUS_LABELS[admin.status] || "New", admin.status, "status")}
          ${badge(PRIORITY_LABELS[admin.priority] || "Normal", admin.priority, "priority")}
          <span>${escapeHtml(lead.location || "No location")}</span>
        </span>
      </button>
      <button
        class="star-button${admin.starred ? " is-starred" : ""}"
        data-star="${escapeHtml(lead.id)}"
        type="button"
        aria-label="${admin.starred ? "Unstar" : "Star"} ${escapeHtml(lead.companyName || "lead")}"
      >
        Star
      </button>
    </article>`;
}

function renderStats() {
  const active = state.leads.filter((lead) => !adminOf(lead).archived);
  const unread = active.filter((lead) => !adminOf(lead).read);
  const priority = active.filter((lead) => ["urgent", "high"].includes(adminOf(lead).priority));

  els.totalLeads.textContent = String(active.length);
  els.unreadLeads.textContent = String(unread.length);
  els.priorityLeads.textContent = String(priority.length);
  els.latestCompany.textContent = active[0]?.companyName || "None";
}

function renderBulkBar() {
  const count = state.selectedIds.size;
  els.bulkBar.classList.toggle("is-hidden", count === 0);
  els.selectedCount.textContent = `${count} selected`;
}

function renderList() {
  const leads = visibleLeads();

  els.resultCount.textContent = `${leads.length} ${leads.length === 1 ? "result" : "results"}`;

  if (!leads.length) {
    els.leadList.innerHTML = `
      <div class="empty-state">
        <p class="eyebrow">No results</p>
        <h2>No inquiries match this view</h2>
        <p class="muted">Change the filters or refresh to load new submissions.</p>
      </div>`;
    renderBulkBar();
    return;
  }

  els.leadList.innerHTML = leads.map(leadCard).join("");
  renderBulkBar();
}

function optionsHtml(options, selectedValue) {
  return Object.entries(options)
    .map(([value, label]) => {
      const selected = value === selectedValue ? " selected" : "";
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function renderDetail() {
  const lead = activeLead();

  if (!lead) {
    els.detailPanel.innerHTML = `
      <div class="empty-state">
        <p class="eyebrow">Details</p>
        <h2>Select an inquiry</h2>
        <p class="muted">Choose a submission from the inbox to manage it.</p>
      </div>`;
    return;
  }

  const admin = adminOf(lead);

  els.detailPanel.innerHTML = `
    <div class="detail-header">
      <div>
        <p class="eyebrow">${escapeHtml(formatDate(lead.submittedAt))}</p>
        <h2>${escapeHtml(lead.companyName || "Unnamed company")}</h2>
        <div class="detail-badges">
          ${badge(STATUS_LABELS[admin.status] || "New", admin.status, "status")}
          ${badge(PRIORITY_LABELS[admin.priority] || "Normal", admin.priority, "priority")}
          ${admin.starred ? badge("Starred", "starred", "flag") : ""}
          ${admin.archived ? badge("Archived", "archived", "flag") : ""}
        </div>
      </div>
      <div class="detail-actions">
        <a class="button-link" href="mailto:${escapeHtml(lead.email || "")}">Email</a>
        <a class="button-link ghost-link" href="tel:${escapeHtml(lead.phone || "")}">Call</a>
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
          <input name="companyName" value="${escapeHtml(lead.companyName)}" required />
        </label>
        <label>
          <span>Contact</span>
          <input name="contactName" value="${escapeHtml(lead.contactName)}" required />
        </label>
      </div>

      <div class="form-row two">
        <label>
          <span>Email</span>
          <input name="email" type="email" value="${escapeHtml(lead.email)}" required />
        </label>
        <label>
          <span>Phone</span>
          <input name="phone" value="${escapeHtml(lead.phone)}" required />
        </label>
      </div>

      <div class="form-row two">
        <label>
          <span>Location</span>
          <input name="location" value="${escapeHtml(lead.location)}" required />
        </label>
        <label>
          <span>Support needed</span>
          <input name="hiringModel" value="${escapeHtml(lead.hiringModel)}" required />
        </label>
      </div>

      <label>
        <span>What they are hiring for</span>
        <textarea name="roles" rows="5" required>${escapeHtml(lead.roles)}</textarea>
      </label>

      <label>
        <span>Customer notes</span>
        <textarea name="notes" rows="4">${escapeHtml(lead.notes)}</textarea>
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

function renderAll() {
  renderStats();
  renderList();
  renderDetail();
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
  showToast(options.message || "Inquiry updated.", "success");
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
  showToast("Inquiry deleted.", "success");
}

async function loadLeads() {
  state.loading = true;
  els.leadList.innerHTML = `
    <div class="empty-state">
      <p class="eyebrow">Loading</p>
      <h2>Loading inquiries</h2>
      <p class="muted">Fetching the latest customer submissions from secure storage.</p>
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

function detailPatchFromForm(form) {
  const payload = payloadFromForm(form);

  return {
    companyName: payload.companyName,
    contactName: payload.contactName,
    email: payload.email,
    phone: payload.phone,
    location: payload.location,
    hiringModel: payload.hiringModel,
    roles: payload.roles,
    notes: payload.notes,
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
    `Company: ${lead.companyName || "-"}`,
    `Contact: ${lead.contactName || "-"}`,
    `Email: ${lead.email || "-"}`,
    `Phone: ${lead.phone || "-"}`,
    `Location: ${lead.location || "-"}`,
    `Support needed: ${lead.hiringModel || "-"}`,
    `Status: ${STATUS_LABELS[admin.status] || admin.status}`,
    `Priority: ${PRIORITY_LABELS[admin.priority] || admin.priority}`,
    "",
    "Hiring details:",
    lead.roles || "-",
    "",
    "Customer notes:",
    lead.notes || "-",
    "",
    "Internal notes:",
    admin.ownerNotes || "-",
  ].join("\n");
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
  link.download = `samer-solutions-inquiries-${data.generatedAt.slice(0, 10)}.json`;
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

els.logoutButton.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" }).catch(() => null);
  window.location.reload();
});

els.refreshButton.addEventListener("click", () => {
  loadLeads().catch((error) => showToast(error.message, "error"));
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

  const lead = activeLead();

  if (lead && !adminOf(lead).read) {
    await patchLeads([lead.id], { read: true }, { keepSelection: true, message: "Marked read." });
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
      message: "Inquiry saved.",
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
      await patchLeads([lead.id], { archived: !admin.archived }, { message: "Archive state updated." });
      return;
    }

    if (action === "delete" && window.confirm("Delete this inquiry permanently?")) {
      await deleteLeads([lead.id]);
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
      if (window.confirm(`Delete ${ids.length} selected inquiries permanently?`)) {
        await deleteLeads(ids);
      }
      return;
    }

    const patches = {
      read: { read: true },
      unread: { read: false },
      archive: { archived: true },
      unarchive: { archived: false },
    };

    await patchLeads(ids, patches[button.dataset.bulkAction], {
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

els.exportJsonButton.addEventListener("click", downloadJson);

api("/api/admin/session")
  .then(async (result) => {
    els.sessionNote.textContent = `Signed in as ${result.user}. Session expires ${formatDate(result.expiresAt, { short: true })}.`;
    showDashboard();
    await loadLeads();
  })
  .catch(() => showAuth());
