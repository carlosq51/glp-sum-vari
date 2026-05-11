// public/js/views/supervisor/sup-incidencias-report.js
// Reporte global de incidencias — agrupado por categoría (categoria → grado)
// ===========================================================================

let _getJSON    = null;
let _escape     = null;
let _activeType = "ALL";
let _loading    = false;

// ── Categorias conocidas (mismo set que sup-incidencias.js) ─────────────────
const INC_CATEGORIAS = new Set([
  "FALTA MARCAR AJUSTAR COMPONENTES","CABLEADO","CINTILLOS","MANGUERA","CAÑERIA",
  "REDUCTOR","FILTRO DE GAS","SENSOR MAP","EMULACIÓN INVERTIDA","CONECTORES INVERTIDOS",
  "DOCUMENTO OT INCOMPLETA","PERFORACIÓN INCORRECTA","GRAPAS","FUGA DE GAS",
  "TOMA DE CARGA","TANQUE MAL INSTALADO","DAÑO ESTÉTICO","SIN PINTURA O ANTICORROSIVO",
  "TANQUE SIN GAS","OTRO",
]);

function parseCategoria_(nota) {
  const s = String(nota || "").trim();
  if (!s) return "Sin categoría";
  const nl = s.indexOf("\n");
  const first = (nl === -1 ? s : s.slice(0, nl)).trim();
  return INC_CATEGORIAS.has(first.toUpperCase()) ? first.toUpperCase() : "Sin categoría";
}

function parseExtra_(nota) {
  const s = String(nota || "").trim();
  if (!s) return "";
  const nl = s.indexOf("\n");
  if (nl === -1) return INC_CATEGORIAS.has(s.toUpperCase()) ? "" : s;
  const first = s.slice(0, nl).trim();
  const rest  = s.slice(nl + 1).trim();
  return INC_CATEGORIAS.has(first.toUpperCase()) ? rest : s;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function pad2_(n) { return String(n).padStart(2, "0"); }
function todayStr_() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2_(d.getMonth()+1) + "-" + pad2_(d.getDate());
}
function thisMonthStr_() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2_(d.getMonth()+1);
}
function fmtDateTime_(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

// CRITICA=red, MODERADA=orange, LEVE=yellow
const GRADE = [
  { key:"CRITICA",  icon:"🔴", label:"CRÍTICA",
    color:"rgba(248,113,113,1)", dimColor:"rgba(248,113,113,.75)",
    bg:"rgba(248,113,113,.12)",  border:"rgba(248,113,113,.4)" },
  { key:"MODERADA", icon:"🟠", label:"MODERADA",
    color:"rgba(251,146,60,1)",  dimColor:"rgba(251,146,60,.75)",
    bg:"rgba(251,146,60,.12)",   border:"rgba(251,146,60,.4)" },
  { key:"LEVE",     icon:"🟡", label:"LEVE",
    color:"rgba(250,204,21,1)",  dimColor:"rgba(250,204,21,.75)",
    bg:"rgba(250,204,21,.12)",   border:"rgba(250,204,21,.4)" },
];
const GRADE_MAP = Object.fromEntries(GRADE.map(g => [g.key, g]));

function gradeTag_(tipo) {
  const g = GRADE_MAP[tipo] || { icon:"⚪", label:tipo,
    color:"var(--muted)", bg:"rgba(148,163,184,.12)", border:"rgba(148,163,184,.3)" };
  return "<span style=\"background:" + g.bg + ";border:1px solid " + g.border
    + ";color:" + g.color + ";border-radius:5px;padding:1px 7px;font-size:.72em;"
    + "font-weight:900;letter-spacing:.4px;white-space:nowrap;\">"
    + g.icon + " " + g.label + "</span>";
}

// stacked progress bar C/M/L
function stackedBar_(C, M, L) {
  const total = C + M + L;
  if (!total) return "";
  const pC = (C / total * 100).toFixed(1);
  const pM = (M / total * 100).toFixed(1);
  const pL = (L / total * 100).toFixed(1);
  return "<div style=\"display:flex;height:6px;border-radius:4px;overflow:hidden;margin-top:4px;gap:1px;\">"
    + (C ? "<div style=\"flex:" + pC + ";background:rgba(248,113,113,.85);border-radius:3px;\"></div>" : "")
    + (M ? "<div style=\"flex:" + pM + ";background:rgba(251,146,60,.85);border-radius:3px;\"></div>" : "")
    + (L ? "<div style=\"flex:" + pL + ";background:rgba(250,204,21,.85);border-radius:3px;\"></div>" : "")
    + "</div>";
}

// ── fetch ────────────────────────────────────────────────────────────────────
async function fetchIncReport_() {
  if (_loading) return;
  _loading = true;
  const from = String(document.getElementById("incRepFrom")?.value  || "").trim();
  const to   = String(document.getElementById("incRepTo")?.value    || "").trim();
  const q    = String(document.getElementById("incRepQ")?.value     || "").trim();
  const elList    = document.getElementById("incRepList");
  const elKpis    = document.getElementById("incRepKpis");
  const elRanking = document.getElementById("incRepRanking");
  if (elList)    elList.innerHTML        = "<div style=\"padding:14px;text-align:center;opacity:.55;font-size:.9em;\">Cargando...</div>";
  if (elKpis)    elKpis.style.display    = "none";
  if (elRanking) elRanking.style.display = "none";
  try {
    const url = "/api/incidencias/report"
      + "?from=" + encodeURIComponent(from)
      + "&to="   + encodeURIComponent(to)
      + "&tipo=" + encodeURIComponent(_activeType)
      + "&q="    + encodeURIComponent(q)
      + "&limit=1000";
    const j = await _getJSON(url, "Cargando incidencias...");
    if (!j?.ok) {
      if (elList) elList.innerHTML = "<div style=\"padding:10px;color:var(--danger);\">&#9888; " + _escape(j?.error || "Error al cargar") + "</div>";
      return;
    }
    renderIncReport_(j);
  } catch (e) {
    if (elList) elList.innerHTML = "<div style=\"padding:10px;color:var(--danger);\">Error: " + _escape(e.message) + "</div>";
  } finally {
    _loading = false;
  }
}

// ── KPI cards + risk bar ─────────────────────────────────────────────────────
function renderKpis_(s) {
  const el = document.getElementById("incRepKpis");
  if (!el) return;
  const total = s.total    || 0;
  const C     = s.critica  || 0;
  const M     = s.moderada || 0;
  const L     = s.leve     || 0;
  const score    = C * 3 + M * 2 + L;
  const maxScore = total * 3 || 1;
  const pctRisk  = Math.round(score / maxScore * 100);
  const riskColor = pctRisk > 66 ? "rgba(248,113,113,.9)"
    : pctRisk > 33 ? "rgba(251,146,60,.9)" : "rgba(74,222,128,.9)";

  function kpiCard(val, lbl, color, bg) {
    return "<div style=\"flex:1 1 72px;background:" + bg + ";border:1px solid " + color
      + ";border-radius:14px;padding:12px 10px;text-align:center;min-width:68px;\">"
      + "<div style=\"font-size:2em;font-weight:1000;color:" + color + ";line-height:1;\">" + val + "</div>"
      + "<div style=\"font-size:.71em;font-weight:900;letter-spacing:.5px;opacity:.85;margin-top:4px;\">" + lbl + "</div>"
      + "</div>";
  }

  const bar10 = stackedBar_(C, M, L).replace("height:6px", "height:10px").replace("margin-top:4px", "margin-top:0");

  el.innerHTML =
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;\">"
    + kpiCard(total, "TOTAL",    "rgba(148,163,184,.9)", "rgba(148,163,184,.10)")
    + kpiCard(C,     "CRÍTICA",  "rgba(248,113,113,.9)", "rgba(248,113,113,.10)")
    + kpiCard(M,     "MODERADA", "rgba(251,146,60,.9)",  "rgba(251,146,60,.10)")
    + kpiCard(L,     "LEVE",     "rgba(250,204,21,.9)",  "rgba(250,204,21,.10)")
    + "</div>"
    + (total > 0
      ? "<div style=\"background:rgba(255,255,255,.06);border-radius:10px;padding:8px 12px;\">"
        + "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;\">"
        + "<span style=\"font-size:.74em;font-weight:800;letter-spacing:.5px;opacity:.7;\">ÍNDICE DE RIESGO</span>"
        + "<span style=\"font-size:.82em;font-weight:900;color:" + riskColor + ";\">" + pctRisk + "%</span>"
        + "</div>"
        + bar10
        + "<div style=\"display:flex;justify-content:space-between;margin-top:4px;font-size:.69em;opacity:.55;\">"
        + "<span>" + C + " crítica</span><span>" + M + " moderada</span><span>" + L + " leve</span>"
        + "</div></div>"
      : "");
  el.style.display = "";
}

// ── Rankings: categories + tecnicos ──────────────────────────────────────────
function renderRanking_(catGroups, summary) {
  const el = document.getElementById("incRepRanking");
  if (!el || !summary.total) { if (el) el.style.display = "none"; return; }

  const catStats = Object.entries(catGroups).map(([cat, gg]) => {
    const C = gg.CRITICA?.length  || 0;
    const M = gg.MODERADA?.length || 0;
    const L = gg.LEVE?.length     || 0;
    return { cat, C, M, L, total: C + M + L };
  }).sort((a, b) => b.C - a.C || b.total - a.total);

  const maxCat = catStats[0]?.total || 1;

  function rankRow(name, C, M, L, total) {
    return "<div style=\"padding:5px 0;border-top:1px solid rgba(255,255,255,.06);\">"
      + "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;\">"
      + "<span style=\"font-size:.79em;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:6px;\">" + _escape(name) + "</span>"
      + "<span style=\"display:flex;gap:3px;align-items:center;flex-shrink:0;font-size:.78em;font-weight:900;\">"
      + (C ? "<span style=\"color:rgba(248,113,113,.95);\">" + C + "🔴</span>" : "")
      + (M ? "<span style=\"color:rgba(251,146,60,.95);\">"  + M + "🟠</span>" : "")
      + (L ? "<span style=\"color:rgba(250,204,21,.95);\">"  + L + "🟡</span>" : "")
      + "<span style=\"min-width:22px;text-align:right;\">" + total + "</span>"
      + "</span></div>"
      + stackedBar_(C, M, L)
      + "</div>";
  }

  function panel(icon, title, rows) {
    return "<div style=\"background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);"
      + "border-radius:14px;padding:12px;\">"
      + "<div style=\"font-weight:900;font-size:.79em;letter-spacing:.6px;margin-bottom:6px;opacity:.85;\">" + icon + " " + title + "</div>"
      + rows
      + "</div>";
  }

  const catRows = catStats.slice(0, 10).map(c => rankRow(c.cat, c.C, c.M, c.L, c.total)).join("");

  let tecRows = "";
  if (summary.byTecnico?.length) {
    tecRows = summary.byTecnico.slice(0, 10).map(t =>
      rankRow(t.tecnico, t.CRITICA || 0, t.MODERADA || 0, t.LEVE || 0, t.total)
    ).join("");
  }

  el.innerHTML =
    "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;\">"
    + panel("📊", "CATEGORÍAS", catRows)
    + (tecRows ? panel("👷", "TÉCNICOS", tecRows) : "")
    + "</div>";
  el.style.display = "";
}

// ── incident card ─────────────────────────────────────────────────────────────
function renderCard_(it) {
  const g      = GRADE_MAP[it.tipo] || GRADE_MAP.LEVE;
  const extra  = parseExtra_(it.nota);
  const hasImg = it.fotoThumbUrl || it.fotoUrl;
  const imgSrc = it.fotoThumbUrl || it.fotoImgUrl || it.fotoUrl || "";
  const imgFull = it.fotoImgUrl  || it.fotoUrl    || "";
  return "<div style=\"background:rgba(255,255,255,.035);border:1px solid " + g.border
    + ";border-left:3px solid " + g.color
    + ";border-radius:10px;padding:8px 10px;margin-bottom:6px;display:flex;gap:8px;align-items:flex-start;\">"
    + (hasImg
      ? "<div style=\"flex-shrink:0;\"><img src=\"" + _escape(imgSrc) + "\" alt=\"foto\" loading=\"lazy\""
        + " style=\"width:46px;height:46px;object-fit:cover;border-radius:7px;border:1px solid rgba(255,255,255,.12);cursor:pointer;\""
        + " onclick=\"window.open('" + _escape(imgFull) + "','_blank','noopener')\"/></div>"
      : "")
    + "<div style=\"flex:1;min-width:0;\">"
    +   "<div style=\"display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:2px;\">"
    +     "<code style=\"font-size:.76em;opacity:.9;background:rgba(255,255,255,.07);border-radius:4px;padding:1px 5px;\">" + _escape(it.vin || "—") + "</code>"
    +     "<span style=\"margin-left:auto;font-size:.74em;opacity:.5;flex-shrink:0;\">" + fmtDateTime_(it.fecha_hora) + "</span>"
    +   "</div>"
    +   "<div style=\"font-weight:800;font-size:.84em;\">" + _escape(it.tecnico || "—") + "</div>"
    +   (extra ? "<div style=\"font-size:.78em;opacity:.72;margin-top:3px;line-height:1.4;\">" + _escape(extra) + "</div>" : "")
    + "</div></div>";
}

// ── list grouped by category then grade ──────────────────────────────────────
function buildCatGroups_(items) {
  const cats = {};
  for (const it of items) {
    const cat   = parseCategoria_(it.nota);
    const grade = it.tipo || "LEVE";
    if (!cats[cat])        cats[cat] = {};
    if (!cats[cat][grade]) cats[cat][grade] = [];
    cats[cat][grade].push(it);
  }
  return cats;
}

function renderList_(items) {
  const el = document.getElementById("incRepList");
  if (!el) return null;
  if (!items.length) {
    el.innerHTML = "<div style=\"padding:16px;text-align:center;opacity:.5;font-size:.88em;\">Sin incidencias para los filtros seleccionados.</div>";
    return null;
  }

  const cats = buildCatGroups_(items);
  const SIN  = "Sin categoría";

  const sorted = Object.entries(cats).sort(([aC, aG], [bC, bG]) => {
    if (aC === SIN) return 1;
    if (bC === SIN) return -1;
    const aCrit = aG.CRITICA?.length || 0;
    const bCrit = bG.CRITICA?.length || 0;
    if (bCrit !== aCrit) return bCrit - aCrit;
    const aT = Object.values(aG).reduce((s, a) => s + a.length, 0);
    const bT = Object.values(bG).reduce((s, a) => s + a.length, 0);
    return bT - aT;
  });

  let html   = "";
  let catIdx = 0;

  for (const [cat, gg] of sorted) {
    const C   = gg.CRITICA?.length  || 0;
    const M   = gg.MODERADA?.length || 0;
    const L   = gg.LEVE?.length     || 0;
    const tot = C + M + L;
    const id  = "incCat_" + (catIdx++);

    const hdrColor  = C ? "rgba(248,113,113,.9)" : M ? "rgba(251,146,60,.9)" : "rgba(250,204,21,.8)";
    const hdrBorder = C ? "rgba(248,113,113,.35)" : M ? "rgba(251,146,60,.35)" : "rgba(250,204,21,.25)";

    const miniCnts =
        (C ? "<span style=\"color:rgba(248,113,113,.95);font-weight:900;font-size:.79em;\">" + C + "🔴</span>" : "")
      + (M ? "<span style=\"color:rgba(251,146,60,.95); font-weight:900;font-size:.79em;\">" + M + "🟠</span>" : "")
      + (L ? "<span style=\"color:rgba(250,204,21,.95); font-weight:900;font-size:.79em;\">" + L + "🟡</span>" : "");

    let inner = "";
    for (const { key, icon, label, color, border } of GRADE) {
      const grp = gg[key];
      if (!grp?.length) continue;
      inner += "<div style=\"margin-bottom:12px;\">"
        + "<div style=\"font-size:.75em;font-weight:900;letter-spacing:.6px;color:" + color
        + ";padding:3px 0 6px;border-bottom:1px solid " + border + ";margin-bottom:6px;\">"
        + icon + " " + label + " — " + grp.length
        + "</div>"
        + grp.map(renderCard_).join("")
        + "</div>";
    }

    html +=
      "<div style=\"border:1px solid " + hdrBorder + ";border-radius:14px;overflow:hidden;margin-bottom:10px;\">"
      + "<button type=\"button\" data-catid=\"" + id + "\"" 
      + " style=\"width:100%;background:rgba(255,255,255,.05);border:none;border-bottom:1px solid " + hdrBorder
      + ";padding:9px 14px;display:flex;align-items:center;gap:8px;cursor:pointer;color:inherit;text-align:left;\">"
      + "<span style=\"font-weight:900;font-size:.86em;letter-spacing:.4px;color:" + hdrColor + ";flex:1;\">📂 " + _escape(cat) + "</span>"
      + "<span style=\"display:flex;gap:5px;align-items:center;\">" + miniCnts + "</span>"
      + "<span style=\"font-size:.75em;opacity:.5;flex-shrink:0;margin-left:6px;\">" + tot + " inc.</span>"
      + "<span class=\"inc-cat-chev\" style=\"font-size:.74em;opacity:.55;\">&#9660;</span>"
      + "</button>"
      + "<div id=\"" + id + "\" style=\"padding:10px 12px;\">" + inner + "</div>"
      + "</div>";
  }

  el.innerHTML = html;

  el.querySelectorAll("button[data-catid]").forEach(btn => {
    btn.addEventListener("click", () => {
      const body = document.getElementById(btn.dataset.catid);
      const chev = btn.querySelector(".inc-cat-chev");
      if (!body) return;
      const nowOpen = body.style.display !== "none";
      body.style.display = nowOpen ? "none" : "";
      if (chev) chev.innerHTML = nowOpen ? "&#9654;" : "&#9660;";
    });
  });

  return cats;
}

// ── orchestrate ──────────────────────────────────────────────────────────────
function renderIncReport_(j) {
  renderKpis_(j.summary);
  const cats = renderList_(j.items);
  if (cats) renderRanking_(cats, j.summary);
}

// ── bind ─────────────────────────────────────────────────────────────────────
export function bindSupIncidenciasReport_({ getJSON_user, escapeHtml }) {
  _getJSON = getJSON_user;
  _escape  = escapeHtml;

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
    const f = document.getElementById("incRepFrom");
    const o = document.getElementById("incRepTo");
    if (f) f.value = t;
    if (o) o.value = t;
    fetchIncReport_();
  });

  document.getElementById("btnIncRepMes")?.addEventListener("click", () => {
    const m       = thisMonthStr_();
    const [y, mo] = m.split("-").map(Number);
    const last    = new Date(y, mo, 0).getDate();
    const f = document.getElementById("incRepFrom");
    const o = document.getElementById("incRepTo");
    if (f) f.value = m + "-01";
    if (o) o.value = m + "-" + pad2_(last);
    fetchIncReport_();
  });

  document.getElementById("btnIncRepApply")?.addEventListener("click", fetchIncReport_);
  document.getElementById("incRepQ")?.addEventListener("keydown", e => {
    if (e.key === "Enter") fetchIncReport_();
  });
}

export function enterIncReport_() {
  const f = document.getElementById("incRepFrom");
  const o = document.getElementById("incRepTo");
  if (f && !f.value) {
    const t = todayStr_();
    f.value = t;
    if (o && !o.value) o.value = t;
  }
  fetchIncReport_();
}

export function exitIncReport_() {
  _loading = false;
}
