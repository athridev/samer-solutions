const MAX_EXPORT_LIMIT = 5000;
const DEFAULT_EXPORT_LIMIT = 1000;

function setResponseHeaders(response, contentType = "application/json; charset=utf-8") {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", contentType);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

function sendJson(response, status, payload) {
  setResponseHeaders(response);
  return response.status(status).json(payload);
}

function getHeader(request, name) {
  return request.headers?.[name] || request.headers?.[name.toLowerCase()] || "";
}

function isAuthorized(request) {
  const exportSecret = process.env.LEAD_EXPORT_SECRET || process.env.CRON_SECRET;
  const authorization = getHeader(request, "authorization");

  return Boolean(exportSecret && authorization === `Bearer ${exportSecret}`);
}

function parseLimit(value) {
  const limit = Number(value || DEFAULT_EXPORT_LIMIT);

  if (!Number.isFinite(limit) || limit < 1) {
    return DEFAULT_EXPORT_LIMIT;
  }

  return Math.min(Math.floor(limit), MAX_EXPORT_LIMIT);
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonScriptEscape(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

async function streamToText(stream) {
  const response = new Response(stream);
  return response.text();
}

async function loadLeads({ limit }) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  }

  const { get, list } = await import("@vercel/blob");
  const leads = [];
  let cursor;

  do {
    const result = await list({
      prefix: "leads/",
      cursor,
      limit: Math.min(1000, limit - leads.length),
    });

    for (const blob of result.blobs) {
      const stored = await get(blob.url, { access: "private" });

      if (stored?.statusCode === 200 && stored.stream) {
        leads.push(JSON.parse(await streamToText(stored.stream)));
      }

      if (leads.length >= limit) {
        break;
      }
    }

    cursor = result.cursor;
  } while (cursor && leads.length < limit);

  return leads.sort((left, right) =>
    String(right.submittedAt).localeCompare(String(left.submittedAt)),
  );
}

function leadDate(lead) {
  if (!lead.submittedAt) {
    return "Unknown";
  }

  return new Date(lead.submittedAt).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  });
}

function renderLeadCard(lead, index) {
  return `
    <article class="lead-card" data-search="${htmlEscape(JSON.stringify(lead).toLowerCase())}">
      <div class="lead-card__top">
        <div>
          <p class="eyebrow">Lead ${index + 1}</p>
          <h2>${htmlEscape(lead.companyName || "Unnamed company")}</h2>
        </div>
        <span>${htmlEscape(lead.hiringModel || "Not specified")}</span>
      </div>
      <dl>
        <div><dt>Submitted</dt><dd>${htmlEscape(leadDate(lead))}</dd></div>
        <div><dt>Contact</dt><dd>${htmlEscape(lead.contactName)}<br><a href="mailto:${htmlEscape(lead.email)}">${htmlEscape(lead.email)}</a></dd></div>
        <div><dt>Phone</dt><dd><a href="tel:${htmlEscape(lead.phone)}">${htmlEscape(lead.phone)}</a></dd></div>
        <div><dt>Location</dt><dd>${htmlEscape(lead.location)}</dd></div>
        <div class="wide"><dt>Roles or skills</dt><dd>${htmlEscape(lead.roles)}</dd></div>
        <div class="wide"><dt>Timeline and notes</dt><dd>${htmlEscape(lead.notes || "-")}</dd></div>
      </dl>
    </article>`;
}

function renderHtml({ leads, generatedAt, limit }) {
  const json = jsonScriptEscape({ generatedAt, limit, count: leads.length, leads });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Samer Solutions Lead Export</title>
  <style>
    :root { color-scheme: light; --ink:#07111f; --muted:#617086; --line:rgba(7,17,31,.12); --paper:#f6f8fb; --panel:#fff; --blue:#2166f3; --green:#0f8a68; --shadow:0 24px 70px rgba(7,17,31,.10); }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--paper); color: var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body::before { position: fixed; inset: 0; z-index: -1; content: ""; background: linear-gradient(135deg, rgba(255,255,255,.86), rgba(246,248,251,0)), linear-gradient(rgba(7,17,31,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(7,17,31,.035) 1px, transparent 1px); background-size: auto, 42px 42px, 42px 42px; }
    main { width: min(100% - 36px, 1180px); margin: 0 auto; padding: 34px 0 56px; }
    header { display: grid; gap: 22px; margin-bottom: 26px; }
    .brand { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; border-bottom:1px solid var(--line); padding-bottom:22px; }
    h1 { margin:0; font-size: clamp(2.2rem, 6vw, 5.8rem); line-height:.95; letter-spacing:0; }
    .meta { color: var(--muted); font-weight: 750; line-height: 1.7; }
    .toolbar { display:grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 10px; align-items:center; }
    input, button { min-height: 46px; border-radius: 8px; font: inherit; }
    input { width:100%; border:1px solid var(--line); padding: 0 14px; background: rgba(255,255,255,.9); }
    button { border:0; padding:0 16px; background:var(--ink); color:white; cursor:pointer; font-weight:800; }
    button.secondary { background:white; color:var(--ink); border:1px solid var(--line); }
    .stats { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:12px; margin: 24px 0; }
    .stat, .lead-card { border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.86); box-shadow:var(--shadow); }
    .stat { padding:18px; }
    .stat span, .eyebrow, dt { color:var(--muted); font-size:.76rem; font-weight:850; letter-spacing:.12em; text-transform:uppercase; }
    .stat strong { display:block; margin-top:6px; font-size:1.35rem; }
    .grid { display:grid; gap:14px; }
    .lead-card { padding:22px; }
    .lead-card__top { display:flex; justify-content:space-between; gap:16px; border-bottom:1px solid var(--line); padding-bottom:16px; margin-bottom:18px; }
    .lead-card__top h2 { margin:.25rem 0 0; font-size:1.35rem; }
    .lead-card__top span { align-self:flex-start; border:1px solid rgba(33,102,243,.24); border-radius:999px; padding:7px 10px; color:var(--blue); font-size:.82rem; font-weight:850; white-space:nowrap; }
    dl { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:16px; margin:0; }
    dt { margin-bottom:6px; }
    dd { margin:0; color:#26354b; line-height:1.55; overflow-wrap:anywhere; }
    a { color:inherit; font-weight:800; }
    .wide { grid-column: span 2; }
    .empty { border:1px dashed var(--line); border-radius:8px; padding:26px; background:white; color:var(--muted); font-weight:750; }
    pre { display:none; white-space:pre-wrap; border:1px solid var(--line); border-radius:8px; padding:18px; background:#07111f; color:#e8eef8; overflow:auto; }
    body.show-json pre { display:block; }
    body.show-json .grid { display:none; }
    @media (max-width: 760px) { .brand, .lead-card__top { flex-direction:column; } .toolbar, .stats, dl { grid-template-columns:1fr; } .wide { grid-column:auto; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand">
        <div>
          <p class="eyebrow">Samer Solutions</p>
          <h1>Lead export</h1>
        </div>
        <p class="meta">Generated ${htmlEscape(leadDate({ submittedAt: generatedAt }))}<br>${leads.length} saved customer form submission${leads.length === 1 ? "" : "s"}</p>
      </div>
      <div class="toolbar">
        <input id="search" type="search" placeholder="Search company, contact, role, phone, location..." autocomplete="off">
        <button id="toggle-json" class="secondary" type="button">View JSON</button>
        <button id="download-json" type="button">Download JSON</button>
      </div>
    </header>
    <section class="stats" aria-label="Summary">
      <div class="stat"><span>Total leads</span><strong>${leads.length}</strong></div>
      <div class="stat"><span>Latest lead</span><strong>${htmlEscape(leads[0]?.companyName || "None")}</strong></div>
      <div class="stat"><span>Export limit</span><strong>${limit}</strong></div>
    </section>
    ${leads.length ? `<section id="cards" class="grid">${leads.map(renderLeadCard).join("")}</section>` : `<section class="empty">No customer form submissions are stored yet.</section>`}
    <pre id="json"></pre>
  </main>
  <script id="lead-data" type="application/json">${json}</script>
  <script>
    const data = JSON.parse(document.getElementById('lead-data').textContent);
    const pre = document.getElementById('json');
    const search = document.getElementById('search');
    const toggle = document.getElementById('toggle-json');
    pre.textContent = JSON.stringify(data, null, 2);
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      document.querySelectorAll('.lead-card').forEach((card) => {
        card.hidden = q && !card.dataset.search.includes(q);
      });
    });
    toggle.addEventListener('click', () => {
      document.body.classList.toggle('show-json');
      toggle.textContent = document.body.classList.contains('show-json') ? 'View Cards' : 'View JSON';
    });
    document.getElementById('download-json').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'samer-solutions-leads-' + data.generatedAt.slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  </script>
</body>
</html>`;
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  if (!isAuthorized(request)) {
    return sendJson(response, 401, { error: "Unauthorized" });
  }

  const url = new URL(request.url, `https://${getHeader(request, "host") || "samer.solutions"}`);
  const format = url.searchParams.get("format") || "json";
  const limit = parseLimit(url.searchParams.get("limit"));
  const generatedAt = new Date().toISOString();

  try {
    const leads = await loadLeads({ limit });

    if (format === "html") {
      setResponseHeaders(response, "text/html; charset=utf-8");
      return response.status(200).send(renderHtml({ leads, generatedAt, limit }));
    }

    return sendJson(response, 200, {
      ok: true,
      generatedAt,
      limit,
      count: leads.length,
      leads,
    });
  } catch (error) {
    console.error("SAMER_SOLUTIONS_LEAD_EXPORT_ERROR", error);
    return sendJson(response, 500, {
      error: "Lead export could not be generated.",
      detail: error.message,
    });
  }
};
