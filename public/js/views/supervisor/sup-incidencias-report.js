// =========================
// public/js/views/supervisor/sup-incidencias-report.js
// Reporte global de incidencias — fetch + render
// =========================

let _getJSON    = null;
let _escape     = null;
let _activeType = "ALL";   // filtro activo de tipo
let _loading    = false;

// ── helpers ──────────────────────────────────────────────────────────────────

function pad2_(n) { return String(n).padStart(2, "0"); }
function todayStr_() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2_(d.getMonth()+1)}-${pad2_(d.getDate())}`;
}
function thisMonthStr_() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2_(d.getMonth()+1)}`;
}

function fmtDateTime_(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  }).format(d);
}

// ── fetch ─────────────────────────────────────────────────────────────────────

async function fetchIncReport_() {
  if (_loading) return;
  _loading = true;

  const from  = String(document.getElementById("incRepFrom")?.value  || "").trim();
  const to    = String(document.getElementById("incRepTo")?.value    || "").trim();
  const q     = String(document.getElementById("incRepQ")?.value     || "").trim();
  const tipo  = _activeType;

  const list   = document.getElementById("incRepList");
  const kpis   = document.getElementById("incRepKpis");
  const ranking = document.getElementById("incRepRanking");

  if (list) list.innerHTML = `<div class="small muted" style="padding:10px;">Cargando...</div>`;
  if (kpis)    kpis.style.display    = "none";
  if (ranking) ranking.style.display = "none";

  try {
    const url =
      `/api/incidencias/report` +
      `?from=${encodeURIComponent(from)}` +
      `&to=${encodeURIComponent(to)}` +
      `&tipo=${encodeURIComponent(tipo)}` +
      `&q=${encodeURIComponent(q)}` +
      `&limit=1000`;

    const j = await _getJSON(url, "Cargando incidencias...");
    if (!j?.ok) {
      if (list) list.innerHTML = `<div class="small" style="color:var(--danger);">⚠️ ${_escape(j?.error || "Error al cargar")}</div>`;
      return;
    }
    renderIncReport_(j);
  } catch (e) {
    if (list) list.innerHTML = `<div class="small" style="color:var(--danger);">Error: ${_escape(e.message)}</div>`;
  } finally {
    _loading = false;
  }
}

// ── render ───────────────────────────────────────────────────────────────────

const TIPO_META = {
  CRITICA:  { icon: "🔴", label: "Crítica",  color: "rgba(248,113,113,.9)",  bg: "rgba(248,113,113,.12)", border: "rgba(248,113,113,.4)" },
  MODERADA: { icon: "🟠", label: "Moderada", color: "rgba(251,146,60,.9)",   bg: "rgba(251,146,60,.12)",  border: "rgba(251,146,60,.4)" },
  LEVE:     { icon: "🟡", label: "Leve",     color: "rgba(250,204,21,.9)",   bg: "rgba(250,204,21,.12)",  border: "rgba(250,204,21,.4)" },
};

function badgeTipo_(tipo) {
  const m = TIPO_META[tipo] || { icon: "⚪", label: tipo, color: "var(--muted)", bg: "rgba(148,163,184,.12)", border: "rgba(148,163,184,.4)" };
  return `<span class="inc-rep-badge" style="
    background:${m.bg};
    border:1px solid ${m.border};
    color:${m.color};
    border-radius:6px;
    padding:2px 8px;
    font-size:.75em;
    font-weight:800;
    letter-spacing:.4px;
    white-space:nowrap;
  ">${m.icon} ${m.label.toUpperCase()}</span>`;
}

function renderKpis_(s) {
  const el = document.getElementById("incRepKpis");
  if (!el) return;

  const pills = [
    { label: "TOTAL",    value: s.total,    color: "rgba(148,163,184,.7)", bg: "rgba(148,163,184,.1)" },
    { label: "CRÍTICA",  value: s.critica,  color: "rgba(248,113,113,.9)", bg: "rgba(248,113,113,.1)" },
    { label: "MODERADA", value: s.moderada, color: "rgba(251,146,60,.9)",  bg: "rgba(251,146,60,.1)" },
    { label: "LEVE",     value: s.leve,     color: "rgba(250,204,21,.9)",  bg: "rgba(250,204,21,.1)" },
  ];

  el.innerHTML = `<div style="display:flex; gap:10px; flex-wrap:wrap;">
    ${pills.map(p => `
      <div style="
        flex:1 1 100px;
        background:${p.bg};
        border:1px solid ${p.color};
        border-radius:14px;
        padding:10px 14px;
        text-align:center;
      ">
        <div style="font-size:1.8em; font-weight:1000; color:${p.color};">${p.value}</div>
        <div class="small" style="opacity:.8; font-weight:700; margin-top:2px;">${p.label}</div>
      </div>
    `).join("")}
  </div>`;
  el.style.display = "";
}

function renderRanking_(s) {
  const el = document.getElementById("incRepRanking");
  if (!el) return;
  if (!s.total) { el.style.display = "none"; return; }

  let html = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:4px;">`;

  // Top técnicos
  if (s.byTecnico?.length) {
    html += `<div style="
      background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.12);
      border-radius:14px;
      padding:12px;
    ">
      <div style="font-weight:900; font-size:.85em; letter-spacing:.5px; margin-bottom:8px; opacity:.9;">👷 TOP TÉCNICOS</div>
      ${s.byTecnico.slice(0,8).map((t,i) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; ${i>0?"border-top:1px solid rgba(255,255,255,.06);":""}">
          <span class="small" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_escape(t.tecnico)}</span>
          <span class="small" style="display:flex; gap:4px; flex-shrink:0; margin-left:6px;">
            ${t.CRITICA  ? `<span style="color:rgba(248,113,113,.9); font-weight:800;">${t.CRITICA}🔴</span>` : ""}
            ${t.MODERADA ? `<span style="color:rgba(251,146,60,.9);  font-weight:800;">${t.MODERADA}🟠</span>` : ""}
            ${t.LEVE     ? `<span style="color:rgba(250,204,21,.9);  font-weight:800;">${t.LEVE}🟡</span>` : ""}
            <span style="font-weight:900;">${t.total}</span>
          </span>
        </div>
      `).join("")}
    </div>`;
  }

  // Top VINs
  if (s.byVin?.length) {
    html += `<div style="
      background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.12);
      border-radius:14px;
      padding:12px;
    ">
      <div style="font-weight:900; font-size:.85em; letter-spacing:.5px; margin-bottom:8px; opacity:.9;">🚗 TOP VINs</div>
      ${s.byVin.slice(0,8).map((v,i) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; ${i>0?"border-top:1px solid rgba(255,255,255,.06);":""}">
          <code class="small" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:.9;">${_escape(v.vin)}</code>
          <span class="small" style="flex-shrink:0; margin-left:6px; font-weight:900;">
            ${v.CRITICA ? `<span style="color:rgba(248,113,113,.9);">${v.CRITICA}🔴 </span>` : ""}
            ${v.total}
          </span>
        </div>
      `).join("")}
    </div>`;
  }

  html += `</div>`;
  el.innerHTML = html;
  el.style.display = "";
}

function renderList_(items) {
  const el = document.getElementById("incRepList");
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<div class="small muted" style="padding:10px; text-align:center;">Sin incidencias para los filtros seleccionados.</div>`;
    return;
  }

  // Group by tipo (CRITICA first)
  const ORDER = ["CRITICA", "MODERADA", "LEVE"];
  const groups = {};
  for (const it of items) {
    const t = it.tipo || "LEVE";
    if (!groups[t]) groups[t] = [];
    groups[t].push(it);
  }

  let html = "";
  for (const tipo of ORDER) {
    const group = groups[tipo];
    if (!group?.length) continue;
    const m = TIPO_META[tipo] || TIPO_META.LEVE;

    html += `<div style="margin-bottom:18px;">
      <div style="
        font-weight:900;
        font-size:.82em;
        letter-spacing:.8px;
        color:${m.color};
        padding:4px 0 8px;
        border-bottom:1px solid ${m.border};
        margin-bottom:8px;
      ">${m.icon} ${m.label.toUpperCase()} — ${group.length} INCIDENCIA${group.length !== 1 ? "S" : ""}</div>
      ${group.map(it => renderCard_(it)).join("")}
    </div>`;
  }

  // Any remaining types (shouldn't happen, but just in case)
  for (const [tipo, group] of Object.entries(groups)) {
    if (ORDER.includes(tipo)) continue;
    html += `<div style="margin-bottom:18px;">${group.map(it => renderCard_(it)).join("")}</div>`;
  }

  el.innerHTML = html;
}

function renderCard_(it) {
  const hasPhoto = it.fotoThumbUrl || it.fotoUrl;
  const m = TIPO_META[it.tipo] || TIPO_META.LEVE;

  return `<div class="inc-rep-card" style="
    background:rgba(255,255,255,.04);
    border:1px solid ${m.border};
    border-left:3px solid ${m.color};
    border-radius:12px;
    padding:10px 12px;
    margin-bottom:8px;
    display:flex;
    gap:10px;
    align-items:flex-start;
  ">
    ${hasPhoto ? `
      <div style="flex-shrink:0;">
        <img
          src="${_escape(it.fotoThumbUrl || it.fotoImgUrl || it.fotoUrl)}"
          alt="foto"
          loading="lazy"
          style="width:56px; height:56px; object-fit:cover; border-radius:8px; border:1px solid rgba(255,255,255,.14); cursor:pointer;"
          onclick="window.open('${_escape(it.fotoImgUrl || it.fotoUrl)}','_blank','noopener')"
        />
      </div>
    ` : ""}
    <div style="flex:1; min-width:0;">
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:4px;">
        ${badgeTipo_(it.tipo)}
        <code class="small" style="opacity:.9; font-size:.78em;">${_escape(it.vin || "—")}</code>
        <span class="small muted" style="margin-left:auto; flex-shrink:0;">${fmtDateTime_(it.fecha_hora)}</span>
      </div>
      <div style="font-weight:800; font-size:.88em; margin-bottom:2px;">${_escape(it.tecnico || "—")}</div>
      ${it.nota ? `<div class="small" style="opacity:.85; margin-top:2px; line-height:1.4;">${_escape(it.nota)}</div>` : ""}
      ${it.registrado_por && it.registrado_por !== it.tecnico
        ? `<div class="small muted" style="margin-top:4px;">Registrado por: ${_escape(it.registrado_por)}</div>`
        : ""}
    </div>
  </div>`;
}

function renderIncReport_(j) {
  renderKpis_(j.summary);
  renderRanking_(j.summary);
  renderList_(j.items);
}

// ── bind ──────────────────────────────────────────────────────────────────────

export function bindSupIncidenciasReport_({ getJSON_user, escapeHtml }) {
  _getJSON  = getJSON_user;
  _escape   = escapeHtml;

  // Tipo filter buttons
  document.querySelectorAll(".inc-rep-tipo[data-tipo]").forEach(btn => {
    btn.addEventListener("click", () => {
      _activeType = btn.dataset.tipo;
      document.querySelectorAll(".inc-rep-tipo").forEach(b =>
        b.classList.toggle("active", b.dataset.tipo === _activeType)
      );
      fetchIncReport_();
    });
  });

  // Quick date buttons
  document.getElementById("btnIncRepHoy")?.addEventListener("click", () => {
    const t = todayStr_();
    const f = document.getElementById("incRepFrom");
    const to = document.getElementById("incRepTo");
    if (f) f.value = t;
    if (to) to.value = t;
    fetchIncReport_();
  });

  document.getElementById("btnIncRepMes")?.addEventListener("click", () => {
    const m = thisMonthStr_();
    const [y, mo] = m.split("-").map(Number);
    const lastDay = new Date(y, mo, 0).getDate();
    const f = document.getElementById("incRepFrom");
    const to = document.getElementById("incRepTo");
    if (f)  f.value  = `${m}-01`;
    if (to) to.value = `${m}-${String(lastDay).padStart(2,"0")}`;
    fetchIncReport_();
  });

  // Apply search
  document.getElementById("btnIncRepApply")?.addEventListener("click", () => fetchIncReport_());
  document.getElementById("incRepQ")?.addEventListener("keydown", e => {
    if (e.key === "Enter") fetchIncReport_();
  });
}

export function enterIncReport_() {
  // Set default date range to today if inputs are empty
  const f  = document.getElementById("incRepFrom");
  const to = document.getElementById("incRepTo");
  if (f && !f.value) {
    const t = todayStr_();
    f.value  = t;
    if (to && !to.value) to.value = t;
  }
  fetchIncReport_();
}

export function exitIncReport_() {
  _loading = false;
}
