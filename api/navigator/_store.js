const { get, put } = require("@vercel/blob");

const LEADS_PATH = "navigator/leads.json";
const STATE_PATH = "navigator/states.json";
const MAX_LEADS = 5000;

async function readJson(pathname, fallback) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  }

  try {
    const stored = await get(pathname, { access: "private" });
    if (stored?.statusCode !== 200 || !stored.stream) return fallback;
    return JSON.parse(await new Response(stored.stream).text());
  } catch (error) {
    if (error?.message?.includes("not found") || error?.status === 404) return fallback;
    return fallback;
  }
}

async function writeJson(pathname, payload) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  }

  await put(pathname, JSON.stringify(payload), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

function clean(value, max = 4000) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, max);
}

function normalizeLead(lead, index) {
  return {
    id: clean(lead.id, 80) || `IMP-${String(index + 1).padStart(3, "0")}`,
    company: clean(lead.company, 180),
    segment: clean(lead.segment, 180) || "Imported lead",
    website: clean(lead.website, 500),
    linkedin: clean(lead.linkedin, 500),
    maps: clean(lead.maps, 700),
    location: clean(lead.location, 240),
    phone: clean(lead.phone, 120),
    email: clean(lead.email, 240),
    careersEmail: clean(lead.careersEmail, 240),
    contactUrl: clean(lead.contactUrl, 700),
    bestPerson: clean(lead.bestPerson, 180),
    employees: clean(lead.employees, 240),
    services: clean(lead.services, 1600),
    fit: clean(lead.fit, 2200),
    pain: clean(lead.pain, 1600),
    roles: Array.isArray(lead.roles) ? lead.roles.map((role) => clean(role, 160)).filter(Boolean).slice(0, 20) : [],
    signal: clean(lead.signal, 2200),
    signalSource: clean(lead.signalSource, 700),
    priority: Math.max(0, Math.min(10, Number(lead.priority || 0))),
    confidence: Math.max(0, Math.min(10, Number(lead.confidence || 0))),
    channel: clean(lead.channel, 180),
    opening: clean(lead.opening, 1200),
    subject: clean(lead.subject, 240),
    emailBody: clean(lead.emailBody, 4000),
    linkedinMessage: clean(lead.linkedinMessage, 1600),
    callOpener: clean(lead.callOpener, 1600),
    followUp: clean(lead.followUp, 1600),
    researchNotes: clean(lead.researchNotes, 1600),
    sources: Array.isArray(lead.sources) ? lead.sources.map((source) => clean(source, 700)).filter(Boolean).slice(0, 20) : [],
    verified: clean(lead.verified, 80),
  };
}

function normalizeState(state) {
  const allowed = new Set(["new", "done", "follow-up", "rejected"]);
  return {
    status: allowed.has(state?.status) ? state.status : "new",
    note: clean(state?.note, 5000),
    updatedAt: state?.updatedAt || new Date().toISOString(),
  };
}

async function loadNavigatorLeads() {
  const payload = await readJson(LEADS_PATH, { leads: [], updatedAt: "" });
  return {
    leads: Array.isArray(payload.leads) ? payload.leads.map(normalizeLead).slice(0, MAX_LEADS) : [],
    updatedAt: payload.updatedAt || "",
  };
}

async function saveNavigatorLeads(leads) {
  const normalized = leads.map(normalizeLead).filter((lead) => lead.company).slice(0, MAX_LEADS);
  const payload = { leads: normalized, updatedAt: new Date().toISOString() };
  await writeJson(LEADS_PATH, payload);
  return payload;
}

async function loadNavigatorStates() {
  const payload = await readJson(STATE_PATH, { states: {}, updatedAt: "" });
  return {
    states: payload.states && typeof payload.states === "object" ? payload.states : {},
    updatedAt: payload.updatedAt || "",
  };
}

async function saveNavigatorState(leadId, state) {
  const payload = await loadNavigatorStates();
  payload.states[leadId] = normalizeState(state);
  payload.updatedAt = new Date().toISOString();
  await writeJson(STATE_PATH, payload);
  return payload.states[leadId];
}

module.exports = {
  loadNavigatorLeads,
  saveNavigatorLeads,
  loadNavigatorStates,
  saveNavigatorState,
};
