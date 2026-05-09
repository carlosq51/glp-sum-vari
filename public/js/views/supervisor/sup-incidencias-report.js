// =========================
// public/js/views/supervisor/sup-incidencias-report.js
// Reporte global de incidencias â€” agrupado por categorÃ­a â†’ grado
// =========================

let _getJSON  = null;
let _escape   = null;
let _activeType = "ALL";
let _loading    = false;

// â”€â”€ CategorÃ­as conocidas (mismo set que sup-incidencias.js) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const INC_CATEGORIAS = new Set([
  "FALTA MARCAR AJUSTAR COMPONENTES","CABLEADO","CINTILLOS","MANGUERA","CAÃ‘ERIA",
  "REDUCTOR","FILTRO DE GAS","SENSOR MAP","EMULACIÃ“N INVERTIDA","CONECTORES INVERTIDOS",
  "DOCUMENTO OT INCOMPLETA","PERFORACIÃ“N INCORRECTA","GRAPAS","FUGA DE GAS",
  "TOMA DE CARGA","TANQUE MAL INSTALADO","DAÃ‘O ESTÃ‰TICO","SIN PINTURA O ANTICORROSIVO",
  "TANQUE SIN GAS","OTRO",
]);

function parseCategoria_(nota) {
  const s = String(nota || "").trim();
  if (!s) return "Sin categorÃ­a";
  const nl = s.indexOf("\n");
  const first = nl === -1 ? s : s.slice(0, nl).trim();
  return INC_CATEGORIAS.has(first.toUpperCase()) ? first.toUpperCase() : "Sin categorÃ­a";
}

function parseExtra_(nota) {
  const s = String(nota || "").trim();
  if (!s) return "";
  const nl = s.indexOf("\n");
  if (nl === -1) {
    return INC_CATEGORIAS.has(s.toUpperCase()) ? "" : s;
  }
  const first = s.slice(0, nl).trim();
  const rest  = s.slice(nl + 1).trim();
  return INC_CATEGORIAS.has(first.toUpperCase()) ? rest : s;
}

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  if (!iso) return "â€”";
  const d = new Date(iso);
  if (isNaN(d)) return "â€”";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  }).format(d);
}

const GRADE = [
  { key: "CRITICA",  icon: "ðŸ”´", label: "CRÃTICA",  color: "rgba(248,113,113,.9)",  bg: "rgba(248,113,113,.10)", border: "rgba(248,113,113,.35)" },
  { key: "MODERADA", icon: "ðŸŸ ", label: "MODERADA", color: "rgba(251,146,60,.9)",   bg: "rgba(251,146,60,.10)",  border: "rgba(251,146,60,.35)" },
  { key: "LEVE",     icon: "ðŸŸ¡", label: "LEVE",     color: "rgba(250,204,21,.9)",   bg: "rgba(250,204,21,.10)",  border: "rgba(250,204,21,.35)" },
];
const GRADE_MAP = Object.fromEntries(GRADE.map(g => [g.key, g]));

function gradePill_(tipo) {
  const g = GRADE_MAP[tipo] || { icon: "âšª", label: tipo, color: "var(--muted)", bg: "rgba(148,163,184,.1)", border: "rgba(148,163,184,.3)" };
  return `<span style="
    background:${g.bg}; border:1px solid ${g.border}; color:${g.color};
    border-radius:5px; padding:1px 7px; font-size:.73em; font-weight:800; letter-spacing:.4px; white-space:nowrap;
  ">${g.icon} ${g.label}</span>`;
}

// â”€â”€ fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchIncReport_() {
  if (_loading) return;
  _loading = true;

  const from  = String(document.getElementById("incRepFrom")?.value  || "").trim();
  const to    = String(document.getElementById("incRepTo")?.value    || "").trim();
  const q     = String(document.getElementById("incRepQ")?.value     || "").trim();

  const list    = document.getElementById("incRepList");
  const kpis    = document.getElementById("incRepKpis");
  const ranking = document.getElementById("incRepRanking");

  if (list)    list.innerHTML       = `<div class="small muted" style="padding:10px;">Cargando...</div>`;
  if (kpis)    kpis.style.display   = "none";
  if (ranking) ranking.style.display = "none";

  try {
    const url =
      `/api/incidencias/report` +
      `?from=${encodeURIComponent(from)}` +
      `&to=${encodeURIComponent(to)}` +
      `&tipo=${encodeURIComponent(_activeType)}` +
      `&q=${encodeURIComponent(q)}` +
      `&limit=1000`;

    const j = await _getJSON(url, "Cargando incidencias...");
    if (!j?.ok) {
      if (list) list.innerHTML = `<div class="small" style="color:var(--danger);">&#9888; ${_escape(j?.error || "Error al cargar")}</div>`;
      return;
    }
    renderIncReport_(j);
  } catch (e) {
    if (list) list.innerHTML = `<div class="small" style="color:var(--danger);">Error: ${_escape(e.message)}</div>`;
  } finally {
    _loading = false;
  }
}

// â”€â”€ render KPIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderKpis_(s) {
  const el = document.getElementById("incRepKpis");
  if (!el) return;

  const pills = [
    { label: "TOTAL",    value: s.total,    color: "rgba(148,163,184,.8)", bg: "rgba(148,163,184,.08)" },
    { label: "CRÃTICA",  value: s.critica,  color: "rgba(248,113,113,.9)", bg: "rgba(248,113,113,.08)" },
    { label: "MODERADA", value: s.moderada, color: "rgba(251,146,60,.9)",  bg: "rgba(251,146,60,.08)" },
    { label: "LEVE",     value: s.leve,     color: "rgba(250,204,21,.9)",  bg: "rgba(250,204,21,.08)" },
  ];

  el.innerHTML = `<div style="display:flex; gap:10px; flex-wrap:wrap;">
    ${pills.map(p => `
      <div style="flex:1 1 80px; background:${p.bg}; border:1px solid ${p.color}; border-radius:12px; padding:10px 12px; text-align:center;">
        <div style="font-size:1.7em; font-weight:1000; color:${p.color};">${p.value}</div>
        <div class="small" style="opacity:.8; font-weight:700; margin-top:2px;">${p.label}</div>
      </div>
    `).join("")}
  </div>`;
  el.style.display = "";
}

// â”€â”€ render ranking de categorÃ­as + tÃ©cnicos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderRanking_(catGroups, summary) {
  const el = document.getElementById("incRepRanking");
  if (!el) return;
  if (!summary.total) { el.style.display = "none"; return; }

  // Build category summary from catGroups
  const catSummary = Object.entries(catGroups)
    .map(([cat, gradeGroups]) => {
      const total = Object.values(gradeGroups).reduce((s, arr) => s + arr.length, 0);
      return { cat, total, CRITICA: gradeGroups.CRITICA?.length || 0, MODERADA: gradeGroups.MODERADA?.length || 0, LEVE: gradeGroups.LEVE?.length || 0 };
    })
    .sort((a, b) => b.CRITICA - a.CRITICA || b.total - a.total);

  let html = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">`;

  // Ranking por categorÃ­a
  html += `<div style="background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.12); border-radius:14px; padding:12px;">
    <div style="font-weight:900; font-size:.82em; letter-spacing:.5px; margin-bottom:8px; opacity:.9;">&#128202; CATEGORÃAS</div>
    ${catSummary.slice(0, 10).map((c, i) => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; ${i > 0 ? "border-top:1px solid rgba(255,255,255,.06);" : ""}">
        <span class="small" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:.9;">${_escape(c.cat)}</span>
        <span class="small" style="display:flex; gap:3px; flex-shrink:0; margin-left:6px;">
          ${c.CRITICA  ? `<span style="color:rgba(248,113,113,.9); font-weight:800;">${c.CRITICA}ðŸ”´</span>` : ""}
          ${c.MODERADA ? `<span style="color:rgba(251,146,60,.9);  font-weight:800;">${c.MODERADA}ðŸŸ </span>` : ""}
          ${c.LEVE     ? `<span style="color:rgba(250,204,21,.9);  font-weight:800;">${c.LEVE}ðŸŸ¡</span>` : ""}
          <b>${c.total}</b>
        </span>
      </div>
    `).join("")}
  </div>`;

  // Ranking por tÃ©cnico
  if (summary.byTecnico?.length) {
    html += `<div style="background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.12); border-radius:14px; padding:12px;">
      <div style="font-weight:900; font-size:.82em; letter-spacing:.5px; margin-bottom:8px; opacity:.9;">&#128119; TÃ‰CNICOS</div>
      ${summary.byTecnico.slice(0, 10).map((t, i) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; ${i > 0 ? "border-top:1px solid rgba(255,255,255,.06);" : ""}">
          <span class="small" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_escape(t.tecnico)}</span>
          <span class="small" style="display:flex; gap:3px; flex-shrink:0; margin-left:6px;">
            ${t.CRITICA  ? `<span style="color:rgba(248,113,113,.9); font-weight:800;">${t.CRITICA}ðŸ”´</span>` : ""}
            ${t.MODERADA ? `<span style="color:rgba(251,146,60,.9);  font-weight:800;">${t.MODERADA}ðŸŸ </span>` : ""}
            ${t.LEVE     ? `<span style="color:rgba(250,204,21,.9);  font-weight:800;">${t.LEVE}ðŸŸ¡</span>` : ""}
            <b>${t.total}</b>
          </span>
        </div>
      `).join("")}
    </div>`;
  }

  html += `</div>`;
  el.innerHTML = html;
  el.style.display = "";
}

// â”€â”€ render una card de incidencia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderCard_(it) {
  const hasPhoto = it.fotoThumbUrl || it.fotoUrl;
  const g = GRADE_MAP[it.tipo] || GRADE_MAP.LEVE;
  const extra = parseExtra_(it.nota);

  return `<div style="
    background:rgba(255,255,255,.04);
    border:1px solid ${g.border};
    border-left:3px solid ${g.color};
    border-radius:10px;
    padding:8px 10px;
    margin-bottom:6px;
    display:flex;
    gap:8px;
    align-items:flex-start;
  ">
    ${hasPhoto ? `
      <div style="flex-shrink:0;">
        <img
          src="${_escape(it.fotoThumbUrl || it.fotoImgUrl || it.fotoUrl)}"
          alt="foto" loading="lazy"
          style="width:48px;height:48px;object-fit:cover;border-radius:7px;border:1px solid rgba(255,255,255,.12);cursor:pointer;"
          onclick="window.open('${_escape(it.fotoImgUrl || it.fotoUrl)}','_blank','noopener')"
        />
      </div>
    ` : ""}
    <div style="flex:1; min-width:0;">
      <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap; margin-bottom:3px;">
        <code class="small" style="opacity:.85; font-size:.78em;">${_escape(it.vin || "â€”")}</code>
        <span class="small muted" style="margin-left:auto; flex-shrink:0; font-size:.78em;">${fmtDateTime_(it.fecha_hora)}</span>
      </div>
      <div style="font-weight:800; font-size:.85em;">${_escape(it.tecnico || "â€”")}</div>
      ${extra ? `<div class="small" style="opacity:.8; margin-top:2px; line-height:1.35;">${_escape(extra)}</div>` : ""}
    </div>
  </div>`;
}

// â”€â”€ render lista agrupada categorÃ­a â†’ grado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildCatGroups_(items) {
  // { [categoria]: { CRITICA: [...], MODERADA: [...], LEVE: [...] } }
  const cats = {};
  for (const it of items) {
    const cat   = parseCategoria_(it.nota);
    const grade = it.tipo || "LEVE";
    if (!cats[cat]) cats[cat] = {};
    if (!cats[cat][grade]) cats[cat][grade] = [];
    cats[cat][grade].push(it);
  }
  return cats;
}

function renderList_(items) {
  const el = document.getElementById("incRepList");
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<div class="small muted" style="padding:10px;text-align:center;">Sin incidencias para los filtros seleccionados.</div>`;
    return;
  }

  const cats = buildCatGroups_(items);

  // Sort categories: "Sin categorÃ­a" last, rest by CRITICA desc then total desc
  const sorted = Object.entries(cats).sort(([aCat, aG], [bCat, bG]) => {
    if (aCat === "Sin categorÃ­a") return 1;
    if (bCat === "Sin categorÃ­a") return -1;
    const aCrit = aG.CRITICA?.length || 0;
    const bCrit = bG.CRITICA?.length || 0;
    if (bCrit !== aCrit) return bCrit - aCrit;
    const aTotal = Object.values(aG).reduce((s, a) => s + a.length, 0);
    const bTotal = Object.values(bG).reduce((s, a) => s + a.length, 0);
    return bTotal - aTotal;
  });

  let html = "";
  let catIdx = 0;

  for (const [cat, gradeGroups] of sorted) {
    const catTotal = Object.values(gradeGroups).reduce((s, a) => s + a.length, 0);
    const hasCrit  = gradeGroups.CRITICA?.length || 0;
    const hasMod   = gradeGroups.MODERADA?.length || 0;
    const hasLeve  = gradeGroups.LEVE?.length || 0;
    const catId    = `incCat_${catIdx++}`;

    // Category header color based on worst grade
    const headerColor = hasCrit ? "rgba(248,113,113,.8)" : hasMod ? "rgba(251,146,60,.8)" : "rgba(250,204,21,.7)";
    const headerBorder = hasCrit ? "rgba(248,113,113,.35)" : hasMod ? "rgba(251,146,60,.35)" : "rgba(250,204,21,.3)";

    // Grade badge mini pills
    const miniPills = [
      hasCrit  ? `<span style="color:rgba(248,113,113,.9);font-weight:800;font-size:.78em;">${hasCrit}ðŸ”´</span>` : "",
      hasMod   ? `<span style="color:rgba(251,146,60,.9); font-weight:800;font-size:.78em;">${hasMod}ðŸŸ </span>` : "",
      hasLeve  ? `<span style="color:rgba(250,204,21,.9); font-weight:800;font-size:.78em;">${hasLeve}ðŸŸ¡</span>` : "",
    ].filter(Boolean).join(" ");

    // Inner grade sections
    let inner = "";
    for (const { key, icon, label, color, bg, border } of GRADE) {
      const grp = gradeGroups[key];
      if (!grp?.length) continue;
      inner += `
        <div style="margin-bottom:10px;">
          <div style="
            display:flex; align-items:center; gap:6px;
            font-size:.76em; font-weight:900; letter-spacing:.6px;
            color:${color}; padding:3px 0 6px;
            border-bottom:1px solid ${border}; margin-bottom:6px;
          ">
            ${icon} ${label} â€” ${grp.length}
          </div>
          ${grp.map(it => renderCard_(it)).join("")}
        </div>`;
    }

    html += `
      <div style="
        border:1px solid ${headerBorder};
        border-radius:14px;
        overflow:hidden;
        margin-bottom:12px;
      ">
        <!-- Category header (toggle) -->
        <button type="button" data-catid="${catId}" style="
          width:100%; background:rgba(255,255,255,.05);
          border:none; border-bottom:1px solid ${headerBorder};
          padding:10px 14px;
          display:flex; align-items:center; gap:8px;
          cursor:pointer; color:inherit; text-align:left;
        ">
          <span style="font-weight:900; font-size:.88em; letter-spacing:.5px; color:${headerColor}; flex:1;">&#128202; ${_escape(cat)}</span>
          <span style="display:flex; gap:5px; align-items:center;">${miniPills}</span>
          <span class="small muted" style="flex-shrink:0; margin-left:6px;">${catTotal} inc.</span>
          <span class="inc-cat-chevron" style="font-size:.8em; opacity:.7;">&#9660;</span>
        </button>
        <!-- Category body -->
        <div id="${catId}" style="padding:10px 12px;">
          ${inner}
        </div>
      </div>`;
  }

  el.innerHTML = html;

  // Bind toggle
  el.querySelectorAll("button[data-catid]").forEach(btn => {
    btn.addEventListener("click", () => {
      const body = document.getElementById(btn.dataset.catid);
      const chev = btn.querySelector(".inc-cat-chevron");
      if (!body) return;
      const open = body.style.display !== "none";
      body.style.display = open ? "none" : "";
      if (chev) chev.innerHTML = open ? "&#9654;" : "&#9660;";
    });
  });

  return cats; // return for ranking
}

// â”€â”€ main render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderIncReport_(j) {
  renderKpis_(j.summary);
  const cats = renderList_(j.items);
  if (cats) renderRanking_(cats, j.summary);
}

// â”€â”€ bind â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function bindSupIncidenciasReport_({ getJSON_user, escapeHtml }) {
  _getJSON = getJSON_user;
  _escape  = escapeHtml;

  // Tipo filter
  document.querySelectorAll(".inc-rep-tipo[data-tipo]").forEach(btn => {
    btn.addEventListener("click", () => {
      _activeType = btn.dataset.tipo;
      document.querySelectorAll(".inc-rep-tipo").forEach(b =>
        b.classList.toggle("active", b.dataset.tipo === _activeType)
      );
      fetchIncReport_();
    });
  });

  document.getElementById("btnIncRepHoy")?.addEventListener("click", () => {
    const t = todayStr_();
    const f  = document.getElementById("incRepFrom");
    const to = document.getElementById("incRepTo");
    if (f)  f.value  = t;
    if (to) to.value = t;
    fetchIncReport_();
  });

  document.getElementById("btnIncRepMes")?.addEventListener("click", () => {
    const m = thisMonthStr_();
    const [y, mo] = m.split("-").map(Number);
    const lastDay = new Date(y, mo, 0).getDate();
    const f  = document.getElementById("incRepFrom");
    const to = document.getElementById("incRepTo");
    if (f)  f.value  = `${m}-01`;
    if (to) to.value = `${m}-${String(lastDay).padStart(2,"0")}`;
    fetchIncReport_();
  });

  document.getElementById("btnIncRepApply")?.addEventListener("click", () => fetchIncReport_());
  document.getElementById("incRepQ")?.addEventListener("keydown", e => {
    if (e.key === "Enter") fetchIncReport_();
  });
}

export function enterIncReport_() {
  // Default: today if nothing set
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
