const els = {
  authScreen: document.querySelector("#auth-screen"),
  authStatus: document.querySelector("#auth-status"),
  appShell: document.querySelector("#app-shell"),
  search: document.querySelector("#search"),
  importButton: document.querySelector("#import-button"),
  importFile: document.querySelector("#import-file"),
  resetButton: document.querySelector("#reset-button"),
  exportButton: document.querySelector("#export-button"),
  segmentFilter: document.querySelector("#segment-filter"),
  priorityFilter: document.querySelector("#priority-filter"),
  channelFilter: document.querySelector("#channel-filter"),
  sortButton: document.querySelector("#sort-button"),
  queueCount: document.querySelector("#queue-count"),
  leadList: document.querySelector("#lead-list"),
  emptyState: document.querySelector("#empty-state"),
  detailContent: document.querySelector("#detail-content"),
  metricTotal: document.querySelector("#metric-total"),
  metricHot: document.querySelector("#metric-hot"),
  metricEmail: document.querySelector("#metric-email"),
  metricTouched: document.querySelector("#metric-touched"),
  leadMeta: document.querySelector("#lead-meta"),
  companyName: document.querySelector("#company-name"),
  segmentLine: document.querySelector("#segment-line"),
  priorityScore: document.querySelector("#priority-score"),
  confidenceScore: document.querySelector("#confidence-score"),
  websiteLink: document.querySelector("#website-link"),
  mapLink: document.querySelector("#map-link"),
  linkedinLink: document.querySelector("#linkedin-link"),
  signalLink: document.querySelector("#signal-link"),
  fitText: document.querySelector("#fit-text"),
  signalText: document.querySelector("#signal-text"),
  painText: document.querySelector("#pain-text"),
  roleStrip: document.querySelector("#role-strip"),
  bestPerson: document.querySelector("#best-person"),
  phoneLink: document.querySelector("#phone-link"),
  emailLink: document.querySelector("#email-link"),
  careersEmailLink: document.querySelector("#careers-email-link"),
  locationText: document.querySelector("#location-text"),
  servicesText: document.querySelector("#services-text"),
  statusButtons: document.querySelector("#status-buttons"),
  leadNote: document.querySelector("#lead-note"),
  outreachCompany: document.querySelector("#outreach-company"),
  copyButton: document.querySelector("#copy-button"),
  recipientName: document.querySelector("#recipient-name"),
  messageTabs: document.querySelector("#message-tabs"),
  subjectLine: document.querySelector("#subject-line"),
  messageBox: document.querySelector("#message-box"),
  mailtoLink: document.querySelector("#mailto-link"),
  formLink: document.querySelector("#form-link"),
  toast: document.querySelector("#toast"),
};

const state = {
  leads: [],
  leadStates: {},
  activeId: "",
  sort: "priority",
  messageTab: "email",
  toggles: {},
  noteTimer: 0,
};

const STATUS_OPTIONS = [
  ["new", "New"],
  ["done", "Done"],
  ["follow-up", "Follow"],
  ["rejected", "Reject"],
];

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 1800);
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
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

function segmentGroup(segment) {
  const value = String(segment || "").toLowerCase();
  if (value.includes("hvac") || value.includes("chiller")) return "HVAC / Chiller";
  if (value.includes("mep") || value.includes("engineering")) return "MEP / Technical";
  if (value.includes("owners") || value.includes("property") || value.includes("developer") || value.includes("community")) {
    return "Property / Community";
  }
  if (value.includes("home")) return "Home Maintenance";
  return "Facilities Management";
}

function contactEmail(lead) {
  return lead.careersEmail || lead.email || "";
}

function leadState(leadId) {
  return state.leadStates[leadId] || { status: "new", note: "", updatedAt: "" };
}

function activeLead() {
  return state.leads.find((lead) => lead.id === state.activeId) || state.leads[0] || null;
}

function text(value, fallback = "Not listed") {
  return String(value || "").trim() || fallback;
}

function csvEscape(value) {
  const output = String(value || "");
  return /[",\n]/.test(output) ? `"${output.replace(/"/g, '""')}"` : output;
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function leadFromRecord(record, index) {
  const get = (name) => String(record[name] || "").trim();
  const roles = get("Roles They Likely Need")
    .replace(/;/g, ",")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);

  return {
    id: get("Lead ID") || `IMP-${String(index + 1).padStart(3, "0")}`,
    company: get("Company Name"),
    segment: get("Company Type / Segment") || "Imported lead",
    website: get("Website"),
    linkedin: get("LinkedIn Company URL"),
    maps: get("Google Maps URL if available"),
    location: get("Dubai/UAE Location"),
    phone: get("Main Phone Number"),
    email: get("Main Email / Contact Email"),
    careersEmail: get("Careers Email if available"),
    contactUrl: get("Contact Form URL"),
    bestPerson: get("Best Person to Contact? HR / Operations / Facilities / Owner"),
    employees: get("Number of Employees estimate if available"),
    services: get("Services They Provide"),
    fit: get("Why They Are a Fit for Samer Solutions"),
    pain: get("Likely Hiring Pain"),
    roles,
    signal: get("Current Hiring Signal: job posts, careers page, growth, contracts, expansion, many sites, etc."),
    signalSource: get("Source URL for Hiring Signal"),
    priority: Number(get("Priority Score 1-10") || 0),
    confidence: Number(get("Confidence Score 1-10") || 0),
    channel: get("Suggested First Outreach Channel: call / email / LinkedIn / contact form / WhatsApp"),
    opening: get("Personalized Opening Line"),
    subject: get("Suggested Email Subject"),
    emailBody: get("Short Outreach Email"),
    linkedinMessage: get("LinkedIn Connection Message"),
    callOpener: get("Call Opener"),
    followUp: get("Follow-Up Message"),
    researchNotes: get("Notes"),
    sources: get("Research Source URLs, separated by semicolon")
      .split(";")
      .map((source) => source.trim())
      .filter(Boolean),
    verified: get("Last Verified Date"),
  };
}

function filteredLeads() {
  const query = els.search.value.trim().toLowerCase();
  const segment = els.segmentFilter.value;
  const priority = els.priorityFilter.value;
  const channel = els.channelFilter.value;

  return state.leads
    .filter((lead, index) => {
      const itemState = leadState(lead.id);
      const haystack = [
        lead.company,
        lead.segment,
        lead.location,
        lead.roles.join(" "),
        lead.signal,
        lead.services,
        lead.channel,
        itemState.status,
        itemState.note,
      ]
        .join(" ")
        .toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (segment !== "all" && segmentGroup(lead.segment) !== segment) return false;
      if (priority !== "all" && Number(lead.priority) < Number(priority)) return false;
      if (channel !== "all" && !String(lead.channel).toLowerCase().includes(channel)) return false;
      if (state.toggles.top25 && index > 24) return false;
      if (state.toggles.email && !contactEmail(lead)) return false;
      if (state.toggles.careers && !String(lead.signalSource).toLowerCase().includes("career") && !lead.careersEmail) return false;
      if (state.toggles.open && itemState.status !== "new" && itemState.status !== "follow-up") return false;
      return true;
    })
    .sort((a, b) => {
      if (state.sort === "company") return a.company.localeCompare(b.company);
      return b.priority - a.priority || b.confidence - a.confidence || a.company.localeCompare(b.company);
    });
}

function setLink(element, href) {
  element.href = href || "#";
  element.classList.toggle("disabled", !href);
}

function messageFor(lead) {
  const name = els.recipientName.value.trim() || "Hiring Team";
  const replaceName = (value) => String(value || "").replace(/\{\{Name\}\}/g, name);
  if (state.messageTab === "linkedin") return replaceName(lead.linkedinMessage);
  if (state.messageTab === "call") return replaceName(lead.callOpener);
  if (state.messageTab === "follow") return replaceName(lead.followUp);
  return replaceName(lead.emailBody);
}

function renderSegments() {
  const current = els.segmentFilter.value || "all";
  const segments = ["all", ...Array.from(new Set(state.leads.map((lead) => segmentGroup(lead.segment)))).sort()];
  els.segmentFilter.innerHTML = segments
    .map((item) => `<option value="${item}">${item === "all" ? "All" : item}</option>`)
    .join("");
  els.segmentFilter.value = segments.includes(current) ? current : "all";
}

function renderList() {
  const visible = filteredLeads();
  els.queueCount.textContent = `${visible.length} leads`;
  els.leadList.innerHTML = "";

  for (const lead of visible) {
    const itemState = leadState(lead.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `lead-item ${lead.id === state.activeId ? "active" : ""}`;
    button.innerHTML = `
      <span>
        <span class="lead-name"></span>
        <span class="lead-meta"></span>
        <span class="lead-channel"></span>
        <span class="lead-location"></span>
      </span>
      <span>
        <span class="lead-badge ${lead.priority >= 9 ? "hot" : ""}">${lead.priority || "-"}</span>
        <span class="lead-state-dot ${itemState.status}"></span>
      </span>
    `;
    button.querySelector(".lead-name").textContent = lead.company;
    button.querySelector(".lead-meta").textContent = `${lead.id} · ${segmentGroup(lead.segment)}`;
    button.querySelector(".lead-channel").textContent = lead.channel || "contact path listed";
    button.querySelector(".lead-location").textContent = lead.location || "Dubai / UAE";
    button.addEventListener("click", () => {
      state.activeId = lead.id;
      render();
    });
    els.leadList.append(button);
  }
}

function renderDetail() {
  const lead = activeLead();
  els.emptyState.classList.toggle("is-hidden", Boolean(lead));
  els.detailContent.classList.toggle("is-hidden", !lead);
  els.leadNote.disabled = !lead;

  if (!lead) {
    els.outreachCompany.textContent = "No lead selected";
    els.messageBox.textContent = "";
    els.subjectLine.textContent = "";
    return;
  }

  const itemState = leadState(lead.id);
  els.leadMeta.innerHTML = "";
  [lead.id, `Rank ${state.leads.findIndex((item) => item.id === lead.id) + 1}`, segmentGroup(lead.segment)].forEach((value) => {
    const span = document.createElement("span");
    span.textContent = value;
    els.leadMeta.append(span);
  });
  els.companyName.textContent = lead.company;
  els.segmentLine.textContent = lead.segment;
  els.priorityScore.textContent = lead.priority || "-";
  els.confidenceScore.textContent = `C ${lead.confidence || "-"}`;
  setLink(els.websiteLink, lead.website);
  setLink(els.mapLink, lead.maps);
  setLink(els.linkedinLink, lead.linkedin);
  setLink(els.signalLink, lead.signalSource);
  els.fitText.textContent = text(lead.fit);
  els.signalText.textContent = text(lead.signal);
  els.painText.textContent = text(lead.pain);
  els.roleStrip.innerHTML = "";
  for (const role of lead.roles) {
    const chip = document.createElement("span");
    chip.className = "role-chip";
    chip.textContent = role;
    els.roleStrip.append(chip);
  }
  els.bestPerson.textContent = text(lead.bestPerson);
  els.phoneLink.textContent = text(lead.phone);
  els.phoneLink.href = lead.phone ? `tel:${lead.phone.replace(/[^\d+]/g, "")}` : "#";
  els.emailLink.textContent = text(lead.email);
  els.emailLink.href = lead.email ? `mailto:${lead.email}` : "#";
  els.careersEmailLink.textContent = text(lead.careersEmail);
  els.careersEmailLink.href = lead.careersEmail ? `mailto:${lead.careersEmail}` : "#";
  els.locationText.textContent = text(lead.location);
  els.servicesText.textContent = text(lead.services);
  els.leadNote.value = itemState.note || "";
  els.outreachCompany.textContent = lead.company;
  renderStatusButtons();
  renderMessage();
}

function renderStatusButtons() {
  const lead = activeLead();
  const itemState = lead ? leadState(lead.id) : { status: "new" };
  els.statusButtons.innerHTML = "";
  STATUS_OPTIONS.forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.status = value;
    button.className = itemState.status === value ? "active" : "";
    button.textContent = label;
    button.addEventListener("click", () => updateLeadState(value, els.leadNote.value, false));
    els.statusButtons.append(button);
  });
}

function renderMessage() {
  const lead = activeLead();
  if (!lead) return;
  const message = messageFor(lead);
  const recipient = els.recipientName.value.trim() || "Hiring Team";
  const emailBody = String(lead.emailBody || "").replace(/\{\{Name\}\}/g, recipient);
  els.subjectLine.textContent = state.messageTab === "email" ? lead.subject : lead.opening;
  els.messageBox.textContent = message;
  const email = contactEmail(lead);
  els.mailtoLink.href = email
    ? `mailto:${email}?subject=${encodeURIComponent(lead.subject)}&body=${encodeURIComponent(emailBody)}`
    : "#";
  els.mailtoLink.classList.toggle("disabled", !email);
  els.formLink.href = lead.contactUrl || "#";
  els.formLink.classList.toggle("disabled", !lead.contactUrl);
}

function renderMetrics() {
  els.metricTotal.textContent = state.leads.length;
  els.metricHot.textContent = state.leads.filter((lead) => lead.priority >= 8).length;
  els.metricEmail.textContent = state.leads.filter((lead) => contactEmail(lead)).length;
  els.metricTouched.textContent = Object.values(state.leadStates).filter((entry) => entry.status !== "new").length;
}

function render() {
  renderSegments();
  renderMetrics();
  renderList();
  renderDetail();
}

async function updateLeadState(status, note, debounce) {
  const lead = activeLead();
  if (!lead) return;
  const next = { status, note, updatedAt: new Date().toISOString() };
  state.leadStates[lead.id] = next;
  renderMetrics();
  renderList();
  renderStatusButtons();
  window.clearTimeout(state.noteTimer);
  const save = async () => {
    try {
      await api("/api/navigator/state", {
        method: "POST",
        body: JSON.stringify({ leadId: lead.id, status: next.status, note: next.note }),
      });
    } catch (error) {
      showToast(error.message);
    }
  };
  if (debounce) state.noteTimer = window.setTimeout(save, 650);
  else await save();
}

async function importFile(file) {
  const rows = parseCsv(await file.text());
  const headers = (rows[0] || []).map((header) => header.replace(/^\uFEFF/, ""));
  const leads = rows
    .slice(1)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])))
    .filter((record) => record["Company Name"])
    .map(leadFromRecord);

  if (!leads.length) {
    showToast("No valid leads found.");
    return;
  }

  const payload = await api("/api/navigator/leads", {
    method: "POST",
    body: JSON.stringify({ leads }),
  });
  state.leads = payload.leads || leads;
  state.activeId = state.leads[0]?.id || "";
  render();
  showToast(`Imported ${state.leads.length} leads.`);
}

function exportFiltered() {
  const headers = ["Lead ID", "Company Name", "Segment", "Priority", "Status", "Phone", "Email", "Channel", "Signal", "Note"];
  const rows = filteredLeads().map((lead) => {
    const itemState = leadState(lead.id);
    return [lead.id, lead.company, lead.segment, lead.priority, itemState.status, lead.phone, contactEmail(lead), lead.channel, lead.signal, itemState.note];
  });
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "samer_navigator_export.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function resetFilters() {
  els.search.value = "";
  els.priorityFilter.value = "all";
  els.channelFilter.value = "all";
  state.toggles = {};
  document.querySelectorAll(".toggle-pill").forEach((button) => button.classList.remove("active"));
  render();
}

function bindEvents() {
  [els.search, els.segmentFilter, els.priorityFilter, els.channelFilter].forEach((element) => element.addEventListener("input", render));
  els.importButton.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", () => {
    const file = els.importFile.files?.[0];
    if (file) importFile(file).catch((error) => showToast(error.message));
    els.importFile.value = "";
  });
  els.resetButton.addEventListener("click", resetFilters);
  els.exportButton.addEventListener("click", exportFiltered);
  els.sortButton.addEventListener("click", () => {
    state.sort = state.sort === "priority" ? "company" : "priority";
    render();
  });
  document.querySelectorAll(".toggle-pill").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toggle;
      state.toggles[key] = !state.toggles[key];
      button.classList.toggle("active", Boolean(state.toggles[key]));
      render();
    });
  });
  els.leadNote.addEventListener("input", () => {
    const current = leadState(activeLead()?.id);
    updateLeadState(current.status, els.leadNote.value, true);
  });
  els.recipientName.addEventListener("input", renderMessage);
  els.messageTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    state.messageTab = button.dataset.tab;
    document.querySelectorAll(".tab-button").forEach((tab) => tab.classList.toggle("active", tab === button));
    renderMessage();
  });
  els.copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(els.messageBox.textContent || "");
    showToast("Copied outreach copy.");
  });
}

async function boot() {
  const url = new URL(window.location.href);
  const authMessage = url.searchParams.get("auth");
  if (authMessage) {
    els.authStatus.textContent = authMessage.replace(/-/g, " ");
  }

  try {
    await api("/api/admin/session");
    els.authScreen.classList.add("is-hidden");
    els.appShell.classList.remove("is-hidden");
    const payload = await api("/api/navigator/leads");
    state.leads = payload.leads || [];
    state.leadStates = payload.states || {};
    state.activeId = state.leads[0]?.id || "";
    bindEvents();
    render();
  } catch {
    els.authScreen.classList.remove("is-hidden");
    els.appShell.classList.add("is-hidden");
  }
}

boot();
