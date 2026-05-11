// public/js/views/supervisor/sup-incidencias-report.js
// Reporte global de incidencias — agrupado por categoría → grado
// ===========================================================================

let _getJSON    = null;
let _escape     = null;
let _activeType = "ALL";
let _loading    = false;

// ── Categorías conocidas ────────────────────────────────────────────────────────────────
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

// ── helpers ───────────────────────────────────────────────────────────────────────
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
    day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit",
  }).format(d);
}

// ── Paleta de colores  (saturados, claramente distintos) ──────────────────────────
// CRITICA  = rojo vivo   #ef4444
// MODERADA = naranja vivo #f97316  (claramente ≠ rojo)
// LEVE     = ámbar/dorado  #eab308  (claramente ≠ naranja)
const GRADE = [
  { key:"CRITICA",  abbr:"C", label:"CRÍTICA",
    color:"#ef4444", dimC:"rgba(239,68,68,.7)",
    bg:"rgba(239,68,68,.15)", border:"rgba(239,68,68,.5)", barBg:"rgba(239,68,68,.9)" },
  { key:"MODERADA", abbr:"M", label:"MODERADA",
    color:"#f97316", dimC:"rgba(249,115,22,.7)",
    bg:"rgba(249,115,22,.15)", border:"rgba(249,115,22,.5)", barBg:"rgba(249,115,22,.9)" },
  { key:"LEVE",     abbr:"L", label:"LEVE",
    color:"#eab308", dimC:"rgba(234,179,8,.7)",
    bg:"rgba(234,179,8,.15)",  border:"rgba(234,179,8,.45)", barBg:"rgba(234,179,8,.9)" },
];
const GRADE_MAP = Object.fromEntries(GRADE.map(g => [g.key, g]));

// Chip coloreado tipo [C 4]  mucho más legible que emoji
function chip_(abbr, count, g) {
  return "<span style=\"display:inline-flex;align-items:center;gap:2px;"
    + "background:" + g.bg + ";border:1px solid " + g.border + ";color:" + g.color
    + ";border-radius:5px;padding:1px 6px;font-size:.72em;font-weight:900;"
    + "letter-spacing:.3px;white-space:nowrap;\">"
    + abbr + " <b>" + count + "</b></span>";
}

// Barra proporcional C/M/L
function stackedBar_(C, M, L, h) {
  const total = C + M + L;
  if (!total) return "";
  h = h || 7;
  const pC = (C / total * 100).toFixed(1);
  const pM = (M / total * 100).toFixed(1);
  const pL = (L / total * 100).toFixed(1);
  const g  = GRADE_MAP;
  return "<div style=\"display:flex;height:" + h + "px;border-radius:4px;overflow:hidden;margin-top:4px;\">"
    + (C ? "<div style=\"flex:" + pC + ";background:" + g.CRITICA.barBg  + "\"></div>" : "")
    + (M ? "<div style=\"flex:" + pM + ";background:" + g.MODERADA.barBg + "\"></div>" : "")
    + (L ? "<div style=\"flex:" + pL + ";background:" + g.LEVE.barBg     + "\"></div>" : "")
    + "</div>";
}

// Chips inline (solo los que tengan valor)
function chips_(C, M, L) {
  return [
    C ? chip_("C", C, GRADE_MAP.CRITICA)  : "",
    M ? chip_("M", M, GRADE_MAP.MODERADA) : "",
    L ? chip_("L", L, GRADE_MAP.LEVE)     : "",
  ].filter(Boolean).join(" ");
}

// ── fetch ────────────────────────────────────────────────────────────────────────────
async function fetchIncReport_() {
  if (_loading) return;
  _loading = true;
  const from = String(document.getElementById("incRepFrom")?.value || "").trim();
  const to   = String(document.getElementById("incRepTo")?.value   || "").trim();
  const q    = String(document.getElementById("incRepQ")?.value    || "").trim();
  const elList    = document.getElementById("incRepList");
  const elKpis    = document.getElementById("incRepKpis");
  const elRanking = document.getElementById("incRepRanking");
  if (elList)    elList.innerHTML        = "<div style=\"padding:14px;text-align:center;opacity:.5;font-size:.9em;\">Cargando...</div>";
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
  } catch(e) {
    if (elList) elList.innerHTML = "<div style=\"padding:10px;color:var(--danger);\">Error: " + _escape(e.message) + "</div>";
  } finally {
    _loading = false;
  }
}

// ── KPI cards + barra de riesgo ─────────────────────────────────────────────────────
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
  const riskColor = pctRisk > 66 ? "#ef4444" : pctRisk > 33 ? "#f97316" : "#4ade80";

  function kpiCard(val, lbl, g) {
    return "<div style=\"flex:1 1 70px;min-width:65px;background:" + g.bg
      + ";border:1px solid " + g.border
      + ";border-radius:14px;padding:14px 10px;text-align:center;\">"
      + "<div style=\"font-size:2.1em;font-weight:1000;color:" + g.color + ";line-height:1;\">" + val + "</div>"
      + "<div style=\"font-size:.7em;font-weight:900;letter-spacing:.6px;margin-top:5px;color:" + g.dimC + ";\">" + lbl + "</div>"
      + "</div>";
  }

  const TOTAL_G = { color:"#94a3b8", dimC:"rgba(148,163,184,.7)", bg:"rgba(148,163,184,.10)", border:"rgba(148,163,184,.35)" };
  el.innerHTML =
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;\">"
    + kpiCard(total, "TOTAL",    TOTAL_G)
    + kpiCard(C,     "CRÍTICA",  GRADE_MAP.CRITICA)
    + kpiCard(M,     "MODERADA", GRADE_MAP.MODERADA)
    + kpiCard(L,     "LEVE",     GRADE_MAP.LEVE)
    + "</div>"
    + (total > 0
      ? "<div style=\"background:rgba(255,255,255,.055);border-radius:11px;padding:10px 14px;\">"
        + "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;\">"
        + "<span style=\"font-size:.73em;font-weight:900;letter-spacing:.6px;opacity:.65;\">ÍNDICE DE RIESGO</span>"
        + "<span style=\"font-size:.88em;font-weight:1000;color:" + riskColor + ";\">" + pctRisk + "%</span>"
        + "</div>"
        + stackedBar_(C, M, L, 11)
        + "<div style=\"display:flex;justify-content:space-between;margin-top:6px;font-size:.69em;\">"
        + "<span style=\"color:#ef4444;font-weight:700;\">" + C + " crítica</span>"
        + "<span style=\"color:#f97316;font-weight:700;\">" + M + " moderada</span>"
        + "<span style=\"color:#eab308;font-weight:700;\">" + L + " leve</span>"
        + "</div></div>"
      : "");
  el.style.display = "";
}

// ── Rankings ─────────────────────────────────────────────────────────────────────────
function renderRanking_(catGroups, summary) {
  const el = document.getElementById("incRepRanking");
  if (!el || !summary.total) { if (el) el.style.display = "none"; return; }

  const catStats = Object.entries(catGroups).map(([cat, gg]) => {
    const C = gg.CRITICA?.length  || 0;
    const M = gg.MODERADA?.length || 0;
    const L = gg.LEVE?.length     || 0;
    return { cat, C, M, L, total: C + M + L };
  }).sort((a, b) => b.C - a.C || b.total - a.total);

  // Fila de ranking: categorias
  function catRow(name, C, M, L, total, rank) {
    const accentColor = C ? "#ef4444" : M ? "#f97316" : "#eab308";
    return "<div style=\"display:flex;align-items:center;gap:8px;padding:7px 0;"
      + (rank > 0 ? "border-top:1px solid rgba(255,255,255,.06);" : "") + "\">"
      + "<span style=\"font-size:.68em;font-weight:900;opacity:.35;min-width:16px;text-align:right;\">#" + (rank+1) + "</span>"
      + "<div style=\"flex:1;min-width:0;\">"
      +   "<div style=\"font-size:.8em;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\">"
      +     _escape(name)
      +   "</div>"
      +   stackedBar_(C, M, L, 5)
      + "</div>"
      + "<div style=\"display:flex;gap:3px;align-items:center;flex-shrink:0;\">"
      +   chips_(C, M, L)
      +   "<span style=\"font-size:.82em;font-weight:1000;min-width:20px;text-align:right;color:" + accentColor + ";\">" + total + "</span>"
      + "</div>"
      + "</div>";
  }

  // Fila de ranking: tecnicos — con borde izquierdo de color
  function tecRow(name, C, M, L, total, rank) {
    const borderColor = C ? "#ef4444" : M ? "#f97316" : "#eab308";
    const initials = name.trim().split(/\s+/).slice(0,2).map(w => w[0] || "").join("").toUpperCase();
    return "<div style=\"display:flex;align-items:center;gap:8px;padding:7px 0;"
      + (rank > 0 ? "border-top:1px solid rgba(255,255,255,.06);" : "") + "\">"
      + "<span style=\"font-size:.67em;font-weight:900;opacity:.3;min-width:16px;text-align:right;\">#" + (rank+1) + "</span>"
      // mini avatar
      + "<div style=\"flex-shrink:0;width:26px;height:26px;border-radius:50%;background:" + borderColor
      +   ";opacity:.85;display:flex;align-items:center;justify-content:center;"
      +   "font-size:.62em;font-weight:900;color:#000;\">" + initials + "</div>"
      + "<div style=\"flex:1;min-width:0;\">"
      +   "<div style=\"font-size:.8em;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\">"
      +     _escape(name)
      +   "</div>"
      +   stackedBar_(C, M, L, 5)
      + "</div>"
      + "<div style=\"display:flex;gap:3px;align-items:center;flex-shrink:0;\">"
      +   chips_(C, M, L)
      +   "<span style=\"font-size:.82em;font-weight:1000;min-width:20px;text-align:right;color:" + borderColor + ";\">" + total + "</span>"
      + "</div>"
      + "</div>";
  }

  const catRows = catStats.slice(0, 10).map((c, i) => catRow(c.cat, c.C, c.M, c.L, c.total, i)).join("");

  let tecRows = "";
  if (summary.byTecnico?.length) {
    tecRows = summary.byTecnico.slice(0, 10).map((t, i) =>
      tecRow(t.tecnico, t.CRITICA||0, t.MODERADA||0, t.LEVE||0, t.total, i)
    ).join("");
  }

  function panel(title, rows) {
    return "<div style=\"background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.10);"
      + "border-radius:14px;padding:12px 14px;\">"
      + "<div style=\"font-weight:900;font-size:.76em;letter-spacing:.7px;margin-bottom:8px;opacity:.7;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:6px;\">"
      + title + "</div>"
      + rows
      + "</div>";
  }

  el.innerHTML =
    "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;\">"
    + panel("📊 CATEGORÍAS", catRows)
    + (tecRows ? panel("👷 TÉCNICOS", tecRows) : "")
    + "</div>";
  el.style.display = "";
}

// ── Tarjeta de incidencia individual ───────────────────────────────────────────────
function renderCard_(it) {
  const g       = GRADE_MAP[it.tipo] || GRADE_MAP.LEVE;
  const extra   = parseExtra_(it.nota);
  const hasImg  = it.fotoThumbUrl || it.fotoUrl;
  const imgSrc  = it.fotoThumbUrl || it.fotoImgUrl || it.fotoUrl || "";
  const imgFull = it.fotoImgUrl   || it.fotoUrl    || "";
  return "<div style=\"background:rgba(255,255,255,.03);"
    + "border:1px solid " + g.border + ";"
    + "border-left:4px solid " + g.color + ";"
    + "border-radius:10px;padding:8px 10px;margin-bottom:6px;"
    + "display:flex;gap:8px;align-items:flex-start;\">"
    + (hasImg
      ? "<div style=\"flex-shrink:0;\">"
        + "<img src=\"" + _escape(imgSrc) + "\" alt=\"foto\" loading=\"lazy\""
        + " style=\"width:44px;height:44px;object-fit:cover;border-radius:7px;"
        + "border:1px solid rgba(255,255,255,.12);cursor:pointer;\""
        + " onclick=\"window.open('" + _escape(imgFull) + "','_blank','noopener')\"/>"
        + "</div>"
      : "")
    + "<div style=\"flex:1;min-width:0;\">"
    +   "<div style=\"display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:3px;\">"
    +     "<code style=\"font-size:.75em;background:rgba(255,255,255,.07);border-radius:4px;padding:1px 5px;\">"
    +       _escape(it.vin || "—")
    +     "</code>"
    +     chip_(g.abbr, "", g).replace("<b></b>","").replace("abbr", g.abbr + " ").replace("gap:2px;","gap:0;")
    +     "<span style=\"margin-left:auto;font-size:.73em;opacity:.45;flex-shrink:0;\">" + fmtDateTime_(it.fecha_hora) + "</span>"
    +   "</div>"
    +   "<div style=\"font-weight:800;font-size:.84em;color:" + g.color + ";opacity:.9;\">" + _escape(it.tecnico || "—") + "</div>"
    +   (extra ? "<div style=\"font-size:.78em;opacity:.65;margin-top:3px;line-height:1.4;\">" + _escape(extra) + "</div>" : "")
    + "</div></div>";
}

// ── Lista agrupada: categoría → grado ──────────────────────────────────────────────────
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
    el.innerHTML = "<div style=\"padding:18px;text-align:center;opacity:.45;font-size:.88em;\">Sin incidencias para los filtros seleccionados.</div>";
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
    const aT = Object.values(aG).reduce((s,a)=>s+a.length,0);
    const bT = Object.values(bG).reduce((s,a)=>s+a.length,0);
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

    // Color del encabezado = peor grado
    const hdrColor  = C ? "#ef4444" : M ? "#f97316" : "#eab308";
    const hdrBorder = C ? "rgba(239,68,68,.4)" : M ? "rgba(249,115,22,.4)" : "rgba(234,179,8,.3)";
    const hdrBg     = C ? "rgba(239,68,68,.08)" : M ? "rgba(249,115,22,.08)" : "rgba(234,179,8,.06)";

    let inner = "";
    for (const { key, label, color, border, bg } of GRADE) {
      const grp = gg[key];
      if (!grp?.length) continue;
      inner += "<div style=\"margin-bottom:14px;\">"
        + "<div style=\"display:flex;align-items:center;gap:6px;font-size:.74em;font-weight:900;"
        +   "letter-spacing:.6px;color:" + color + ";padding:4px 0 7px;"
        +   "border-bottom:2px solid " + border + ";margin-bottom:8px;\">"
        +   "<div style=\"width:8px;height:8px;border-radius:50%;background:" + color + ";flex-shrink:0;\"></div>"
        +   label + " — " + grp.length
        + "</div>"
        + grp.map(renderCard_).join("")
        + "</div>";
    }

    html +=
      "<div style=\"border:1px solid " + hdrBorder + ";border-radius:14px;overflow:hidden;margin-bottom:10px;\">"
      // header toggle
      + "<button type=\"button\" data-catid=\"" + id + "\"" 
      + " style=\"width:100%;background:" + hdrBg + ";border:none;border-bottom:1px solid " + hdrBorder
      + ";padding:10px 14px;display:flex;align-items:center;gap:8px;cursor:pointer;color:inherit;text-align:left;\">"
      + "<div style=\"width:10px;height:10px;border-radius:50%;background:" + hdrColor + ";flex-shrink:0;box-shadow:0 0 6px " + hdrColor + "80;\"></div>"
      + "<span style=\"font-weight:900;font-size:.86em;letter-spacing:.4px;color:" + hdrColor + ";flex:1;\">" + _escape(cat) + "</span>"
      + "<span style=\"display:flex;gap:4px;align-items:center;\">" + chips_(C, M, L) + "</span>"
      + "<span style=\"font-size:.74em;opacity:.4;flex-shrink:0;margin-left:6px;\">" + tot + " inc.</span>"
      + "<span class=\"inc-cat-chev\" style=\"font-size:.72em;opacity:.5;margin-left:4px;\">&#9660;</span>"
      + "</button>"
      // body
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

// ── Orquestador ─────────────────────────────────────────────────────────────────────
function renderIncReport_(j) {
  renderKpis_(j.summary);
  const cats = renderList_(j.items);
  if (cats) renderRanking_(cats, j.summary);
}

// ── bind ───────────────────────────────────────────────────────────────────────────
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
