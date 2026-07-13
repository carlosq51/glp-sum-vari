// public/js/views/supervisor/sup-incidencias-report.js
// Reporte global de incidencias — agrupado por categoría → grado
// ===========================================================================

import { INC_TITULOS } from "../../templates/modals/incidencias-modal.js";

let _getJSON    = null;
let _escape     = null;
let _activeType = "ALL";
let _loading    = false;
let _lastItems  = [];

// ── Categorías conocidas (fuente única: incidencias-modal.js) ───────────────
const INC_CATEGORIAS = new Set(INC_TITULOS);

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
    day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit",
  }).format(d);
}
function fmtMin_(min) {
  const m = Math.round(min);
  if (m < 60) return m + "m";
  return Math.floor(m / 60) + "h " + (m % 60) + "m";
}

// ── Tiempo promedio de resolución (por categoría y por técnico) ─────────────
// Solo cuenta incidencias resueltas (duracion_min viene de tiempo_fin - tiempo_inicio).
function buildTimeStats_(items) {
  const resueltas = items.filter(it => Number.isFinite(it.duracion_min) && it.duracion_min >= 0);

  const byCat = {};
  const byTec = {};
  const byMes = {};
  let sumAll = 0;

  for (const it of resueltas) {
    const cat = parseCategoria_(it.nota);
    const tec = String(it.tecnico || "").trim() || "Sin técnico";
    const mes = String(it.fecha_hora || "").slice(0, 7) || "—"; // YYYY-MM

    (byCat[cat] ||= { n: 0, sum: 0 }).n++;
    byCat[cat].sum += it.duracion_min;

    (byTec[tec] ||= { n: 0, sum: 0 }).n++;
    byTec[tec].sum += it.duracion_min;

    (byMes[mes] ||= { n: 0, sum: 0 }).n++;
    byMes[mes].sum += it.duracion_min;

    sumAll += it.duracion_min;
  }

  const toRanked = (map) => Object.entries(map)
    .map(([name, { n, sum }]) => ({ name, n, sum, avg: sum / n }))
    .sort((a, b) => b.avg - a.avg);

  // Por mes: orden cronológico (no por promedio) — es una línea de tiempo, no un ranking.
  const porMes = Object.entries(byMes)
    .map(([mes, { n, sum }]) => ({ mes, n, sum, avg: sum / n }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  return {
    nResueltas:   resueltas.length,
    avgGlobal:    resueltas.length ? sumAll / resueltas.length : 0,
    totalGlobal:  sumAll,
    porCategoria: toRanked(byCat),
    porTecnico:   toRanked(byTec),
    porMes,
  };
}

const MESES_ES_ = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function fmtMesLabel_(mes) {
  const [y, m] = String(mes).split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return String(mes);
  return MESES_ES_[m - 1] + " " + y;
}

// ── Paleta de colores ───────────────────────────────────────────────────────────────
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

function chip_(abbr, count, g) {
  return "<span style=\"display:inline-flex;align-items:center;gap:2px;"
    + "background:" + g.bg + ";border:1px solid " + g.border + ";color:" + g.color
    + ";border-radius:5px;padding:1px 6px;font-size:.72em;font-weight:900;"
    + "letter-spacing:.3px;white-space:nowrap;\">"
    + abbr + " <b>" + count + "</b></span>";
}

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

function chips_(C, M, L) {
  return [
    C ? chip_("C", C, GRADE_MAP.CRITICA)  : "",
    M ? chip_("M", M, GRADE_MAP.MODERADA) : "",
    L ? chip_("L", L, GRADE_MAP.LEVE)     : "",
  ].filter(Boolean).join(" ");
}

// ── fetch ──────────────────────────────────────────────────────────────────────
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
    if (elList) elList.innerHTML = "<div style=\"padding:10px;color:var(--danger);\">⚠️ Error: " + _escape(e.message) + "</div>";
  } finally {
    _loading = false;
  }
}

// ── Informe: stat tiles + índice de riesgo + impacto VIN ──────────────────────────
function renderKpis_(s, timeStats) {
  const el = document.getElementById("incRepKpis");
  if (!el) return;
  const total = s.total    || 0;
  const C     = s.critica  || 0;
  const M     = s.moderada || 0;
  const L     = s.leve     || 0;
  const score    = C * 3 + M * 2 + L;
  const maxScore = total * 3 || 1;
  const pctRisk  = Math.round(score / maxScore * 100);
  const riskTone = pctRisk > 66 ? "--dv-bad" : pctRisk > 33 ? "--dv-serious" : "--dv-good";
  const gc = GRADE_MAP;

  const totalVins  = s.totalVins      || 0;
  const vinsCrit   = s.vinsConCritica || 0;
  const vinsReinc  = s.vinsConReinci  || 0;
  const pctVinCrit = totalVins ? Math.round(vinsCrit / totalVins * 100) : 0;

  function tile(val, label, color) {
    const c = color ? ` style="color:${color}"` : "";
    return `<div class="statTile"><div class="statTile__label">${label}</div>`
      + `<div class="statTile__value"${c}>${val}</div></div>`;
  }

  const tiles = [
    tile(total, "Total"),
    tile(C, "🔴 Crítica",  gc.CRITICA.color),
    tile(M, "🟠 Moderada", gc.MODERADA.color),
    tile(L, "🟡 Leve",     gc.LEVE.color),
    totalVins ? tile(totalVins, "🚗 VINs") : "",
    (timeStats?.nResueltas ? tile(fmtMin_(timeStats.avgGlobal),   "⏱ T. resol.") : ""),
    (timeStats?.nResueltas ? tile(fmtMin_(timeStats.totalGlobal), "⏱ T. total")  : ""),
  ].join("");

  const riskBlock = total > 0 ? `
    <div class="statTile" style="margin-top:12px;">
      <div class="statTile__label">⚠️ Índice de riesgo
        <span style="margin-left:auto;font-size:1.15em;font-weight:900;color:var(${riskTone});">${pctRisk}%</span>
      </div>
      <div class="meter" style="margin-top:8px;">
        <div class="meter__track">
          ${C ? `<div class="meter__seg" style="width:${(C/total*100).toFixed(1)}%;background:${gc.CRITICA.barBg};"></div>` : ""}
          ${M ? `<div class="meter__seg" style="width:${(M/total*100).toFixed(1)}%;background:${gc.MODERADA.barBg};"></div>` : ""}
          ${L ? `<div class="meter__seg" style="width:${(L/total*100).toFixed(1)}%;background:${gc.LEVE.barBg};"></div>` : ""}
        </div>
        <div class="meter__legend">
          <span class="meter__key"><span class="meter__dot" style="background:${gc.CRITICA.color};"></span>Crítica <span class="meter__num">${C}</span></span>
          <span class="meter__key"><span class="meter__dot" style="background:${gc.MODERADA.color};"></span>Moderada <span class="meter__num">${M}</span></span>
          <span class="meter__key"><span class="meter__dot" style="background:${gc.LEVE.color};"></span>Leve <span class="meter__num">${L}</span></span>
        </div>
      </div>
    </div>` : "";

  let vinBlock = "";
  if (totalVins > 0) {
    const heroStat = (val, lbl, color) =>
      `<div style="display:flex;flex-direction:column;gap:2px;">
        <span style="font-size:26px;font-weight:900;line-height:1;${color ? `color:${color};` : ""}">${val}</span>
        <span class="statTile__foot">${lbl}</span>
      </div>`;
    vinBlock = `
      <div class="statTile" style="margin-top:12px;">
        <div class="statTile__label">🚗 Impacto por VIN</div>
        <div style="display:flex;gap:22px;flex-wrap:wrap;">
          ${heroStat(totalVins, "afectados")}
          ${heroStat(vinsCrit, "con crítica", gc.CRITICA.color)}
          ${vinsReinc > 0 ? heroStat(vinsReinc, "reincidentes", gc.MODERADA.color) : ""}
        </div>
        ${pctVinCrit > 0 ? `
          <div class="meter" style="margin-top:10px;">
            <div class="meter__track"><div class="meter__seg" style="width:${pctVinCrit}%;background:${gc.CRITICA.barBg};"></div></div>
            <div class="statTile__foot">1 de cada <b style="color:${gc.CRITICA.color};">${Math.round(100 / pctVinCrit)}</b> VINs tiene una incidencia crítica (${pctVinCrit}%)</div>
          </div>` : `<div class="statTile__foot" style="margin-top:8px;">Sin VINs con incidencia crítica 👍</div>`}
        ${vinsReinc > 0 ? `<div class="statTile__foot" style="margin-top:10px;color:${gc.MODERADA.color};">⚠️ ${vinsReinc} vehículo${vinsReinc > 1 ? "s" : ""} con incidencias repetidas — revisar acciones correctivas</div>` : ""}
      </div>`;
  }

  el.innerHTML =
    `<div class="sectionHead"><h4 class="sectionHead__title"><span class="accentBar"></span>Informe de incidencias</h4></div>`
    + `<div class="dashGrid">${tiles}</div>`
    + riskBlock
    + vinBlock;
  el.style.display = "";
}

// ── Columnas PROM / TOTAL — cabecera compartida por los 3 paneles de tiempo ─────
const TIME_COL_W = 46; // px, ancho fijo de cada columna numérica
function timeColsHeader_() {
  return "<div style=\"display:flex;align-items:center;gap:8px;padding:0 0 6px;\">"
    + "<span style=\"min-width:16px;\"></span>"
    + "<span style=\"flex:1;\"></span>"
    + "<span style=\"font-size:.62em;font-weight:800;letter-spacing:.4px;opacity:.4;min-width:" + TIME_COL_W + "px;text-align:right;\">PROM</span>"
    + "<span style=\"font-size:.62em;font-weight:800;letter-spacing:.4px;opacity:.4;min-width:" + TIME_COL_W + "px;text-align:right;\">TOTAL</span>"
    + "</div>";
}
function timeCol_(val, color) {
  return "<span style=\"font-size:.8em;font-weight:900;color:" + color + ";flex-shrink:0;min-width:" + TIME_COL_W + "px;text-align:right;\">" + val + "</span>";
}

// ── Fila de ranking de tiempo (categoría o técnico) — dos columnas: prom · total ─
function timeRow(name, avgMin, sumMin, n, maxAvg, rank) {
  const pct   = maxAvg > 0 ? Math.max(6, Math.round(avgMin / maxAvg * 100)) : 0;
  const color = avgMin <= 15 ? "#4ade80" : avgMin <= 45 ? "#f97316" : "#ef4444";
  return "<div style=\"display:flex;align-items:center;gap:8px;padding:7px 0;"
    + (rank > 0 ? "border-top:1px solid var(--surfaceLine);" : "") + "\">"
    + "<span style=\"font-size:.67em;font-weight:900;opacity:.3;min-width:16px;text-align:right;\">#" + (rank+1) + "</span>"
    + "<div style=\"flex:1;min-width:0;\">"
    +   "<div style=\"font-size:.8em;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\">"
    +     _escape(name)
    +     "<span style=\"opacity:.35;font-weight:600;font-size:.85em;\"> · " + n + " res.</span>"
    +   "</div>"
    +   "<div style=\"height:5px;background:var(--ring-track);border-radius:3px;margin-top:4px;overflow:hidden;\">"
    +     "<div style=\"height:100%;width:" + pct + "%;background:" + color + ";border-radius:3px;\"></div>"
    +   "</div>"
    + "</div>"
    + timeCol_(fmtMin_(avgMin), color)
    + timeCol_(fmtMin_(sumMin), "#22d3ee")
    + "</div>";
}

// ── Fila de tendencia mensual — mismas dos columnas: prom · total ───────────────
function monthRow_(mes, avgMin, sumMin, n, maxSum, rank) {
  const pct = maxSum > 0 ? Math.max(6, Math.round(sumMin / maxSum * 100)) : 0;
  return "<div style=\"display:flex;align-items:center;gap:8px;padding:7px 0;"
    + (rank > 0 ? "border-top:1px solid var(--surfaceLine);" : "") + "\">"
    + "<span style=\"font-size:.67em;font-weight:900;opacity:.3;min-width:16px;text-align:right;\">#" + (rank+1) + "</span>"
    + "<div style=\"flex:1;min-width:0;\">"
    +   "<div style=\"font-size:.8em;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\">"
    +     _escape(fmtMesLabel_(mes))
    +     "<span style=\"opacity:.35;font-weight:600;font-size:.85em;\"> · " + n + " res.</span>"
    +   "</div>"
    +   "<div style=\"height:5px;background:var(--ring-track);border-radius:3px;margin-top:4px;overflow:hidden;\">"
    +     "<div style=\"height:100%;width:" + pct + "%;background:#22d3ee;border-radius:3px;\"></div>"
    +   "</div>"
    + "</div>"
    + timeCol_(fmtMin_(avgMin), "#94a3b8")
    + timeCol_(fmtMin_(sumMin), "#22d3ee")
    + "</div>";
}

// ── Rankings ─────────────────────────────────────────────────────────────────────
function renderRanking_(catGroups, summary, timeStats) {
  const el = document.getElementById("incRepRanking");
  if (!el || !summary.total) { if (el) el.style.display = "none"; return; }

  const catStats = Object.entries(catGroups).map(([cat, gg]) => {
    const C = gg.CRITICA?.length  || 0;
    const M = gg.MODERADA?.length || 0;
    const L = gg.LEVE?.length     || 0;
    return { cat, C, M, L, total: C + M + L };
  }).sort((a, b) => b.C - a.C || b.total - a.total);

  // Fila de categoría
  function catRow(name, C, M, L, total, rank) {
    const accentColor = C ? "#ef4444" : M ? "#f97316" : "#eab308";
    return "<div style=\"display:flex;align-items:center;gap:8px;padding:7px 0;"
      + (rank > 0 ? "border-top:1px solid var(--surfaceLine);" : "") + "\">"
      + "<span style=\"font-size:.68em;font-weight:900;opacity:.35;min-width:16px;text-align:right;\">#" + (rank+1) + "</span>"
      + "<div style=\"flex:1;min-width:0;\">"
      +   "<div style=\"font-size:.8em;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\">" + _escape(name) + "</div>"
      +   stackedBar_(C, M, L, 5)
      + "</div>"
      + "<div style=\"display:flex;gap:3px;align-items:center;flex-shrink:0;\">"
      +   chips_(C, M, L)
      +   "<span style=\"font-size:.82em;font-weight:1000;min-width:20px;text-align:right;color:" + accentColor + ";\">" + total + "</span>"
      + "</div></div>";
  }

  // Fila de técnico — avatar con iniciales
  function tecRow(name, C, M, L, total, rank) {
    const color = C ? "#ef4444" : M ? "#f97316" : "#eab308";
    const initials = name.trim().split(/\s+/).slice(0,2).map(w => w[0]||"").join("").toUpperCase();
    return "<div style=\"display:flex;align-items:center;gap:8px;padding:7px 0;"
      + (rank > 0 ? "border-top:1px solid var(--surfaceLine);" : "") + "\">"
      + "<span style=\"font-size:.67em;font-weight:900;opacity:.3;min-width:16px;text-align:right;\">#" + (rank+1) + "</span>"
      + "<div style=\"flex-shrink:0;width:26px;height:26px;border-radius:50%;background:" + color
      +   ";opacity:.85;display:flex;align-items:center;justify-content:center;"
      +   "font-size:.62em;font-weight:900;color:#000;\">" + initials + "</div>"
      + "<div style=\"flex:1;min-width:0;\">"
      +   "<div style=\"font-size:.8em;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\">" + _escape(name) + "</div>"
      +   stackedBar_(C, M, L, 5)
      + "</div>"
      + "<div style=\"display:flex;gap:3px;align-items:center;flex-shrink:0;\">"
      +   chips_(C, M, L)
      +   "<span style=\"font-size:.82em;font-weight:1000;min-width:20px;text-align:right;color:" + color + ";\">" + total + "</span>"
      + "</div></div>";
  }

  // Fila de VIN
  function vinRow(vin, C, M, L, total, rank) {
    const color    = C ? "#ef4444" : M ? "#f97316" : "#eab308";
    const isReinc  = total > 1;
    // Mostrar solo últimos 8 chars del VIN para no ocupar espacio
    const shortVin = vin.length > 9 ? "…" + vin.slice(-9) : vin;
    return "<div style=\"display:flex;align-items:center;gap:8px;padding:7px 0;"
      + (rank > 0 ? "border-top:1px solid var(--surfaceLine);" : "") + "\">"
      + "<span style=\"font-size:.67em;font-weight:900;opacity:.3;min-width:16px;text-align:right;\">#" + (rank+1) + "</span>"
      // indicador cuadrado con color
      + "<div style=\"flex-shrink:0;width:8px;height:28px;border-radius:3px;background:" + color + ";opacity:.85;\"></div>"
      + "<div style=\"flex:1;min-width:0;\">"
      +   "<div style=\"font-size:.76em;font-weight:800;font-family:monospace;overflow:hidden;text-overflow:ellipsis;"
      +     "white-space:nowrap;color:" + color + ";\">" + _escape(shortVin) + "</div>"
      +   (isReinc
          ? "<div style=\"font-size:.65em;color:#f97316;font-weight:700;margin-top:1px;\">"
            + "↻ reincidente • " + total + " inc."
            + "</div>"
          : stackedBar_(C, M, L, 4))
      + "</div>"
      + "<div style=\"display:flex;gap:3px;align-items:center;flex-shrink:0;\">"
      +   chips_(C, M, L)
      + "</div></div>";
  }

  function panel(title, rows, accentColor) {
    accentColor = accentColor || "var(--surfaceLine)";
    return "<div style=\"background:var(--glass);border:1px solid var(--surfaceLine);"
      + "border-top:2px solid " + accentColor + ";"
      + "border-radius:14px;padding:12px 14px;min-width:0;\">"
      + "<div style=\"font-weight:900;font-size:.76em;letter-spacing:.7px;margin-bottom:8px;"
      + "opacity:.7;border-bottom:1px solid var(--ring-track);padding-bottom:6px;\">"
      + title + "</div>"
      + rows
      + "</div>";
  }

  const catRows = catStats.slice(0, 10).map((c, i) => catRow(c.cat, c.C, c.M, c.L, c.total, i)).join("");

  let tecRows = "";
  if (summary.byTecnico?.length) {
    tecRows = summary.byTecnico.slice(0, 10).map((t, i) =>
      tecRow(t.tecnico, t.CRITICA||0, t.MODERADA||0, t.LEVE||0, t.total, i)
    ).join("");
  }

  let vinRows = "";
  if (summary.byVin?.length) {
    // Solo mostrar VINs que tienen crítica o reincidencia (los que requieren acción)
    const relevantVins = summary.byVin.filter(v => v.CRITICA > 0 || v.total > 1).slice(0, 10);
    if (relevantVins.length) {
      vinRows = relevantVins.map((v, i) =>
        vinRow(v.vin, v.CRITICA||0, v.MODERADA||0, v.LEVE||0, v.total, i)
      ).join("");
    }
  }

  // Ranking de tiempo de resolución (solo incidencias con tiempo_fin) — prom · total
  let catTimeRows = "";
  let tecTimeRows = "";
  let mesRows     = "";
  if (timeStats?.nResueltas) {
    const maxCatAvg = Math.max(...timeStats.porCategoria.map(c => c.avg), 1);
    const maxTecAvg = Math.max(...timeStats.porTecnico.map(t => t.avg), 1);
    catTimeRows = timeColsHeader_() + timeStats.porCategoria.slice(0, 10)
      .map((c, i) => timeRow(c.name, c.avg, c.sum, c.n, maxCatAvg, i)).join("");
    tecTimeRows = timeColsHeader_() + timeStats.porTecnico.slice(0, 10)
      .map((t, i) => timeRow(t.name, t.avg, t.sum, t.n, maxTecAvg, i)).join("");

    // Tendencia mensual: agrupa según el intervalo de búsqueda (1 mes seleccionado
    // → 1 fila con el total del período; rango amplio → varias filas, una por mes).
    const maxMesSum = Math.max(...timeStats.porMes.map(m => m.sum), 1);
    mesRows = timeColsHeader_() + timeStats.porMes
      .map((m, i) => monthRow_(m.mes, m.avg, m.sum, m.n, maxMesSum, i)).join("");
  }

  // Layout: paneles apilados verticalmente — evita overflow en contenedores estrechos
  el.innerHTML =
    panel("📊 CATEGORÍAS", catRows, "#818cf8")
    + "<div style=\"height:10px;\"></div>"
    + (tecRows ? panel("👷 TÉCNICOS", tecRows, "#f97316") + "<div style=\"height:10px;\"></div>" : "")
    + (mesRows     ? panel("⏱ TENDENCIA DE TIEMPOS (por mes / intervalo)", mesRows, "#22d3ee") + "<div style=\"height:10px;\"></div>" : "")
    + (catTimeRows ? panel("⏱ TIEMPO PROMEDIO POR CATEGORÍA", catTimeRows, "#22d3ee") + "<div style=\"height:10px;\"></div>" : "")
    + (tecTimeRows ? panel("⏱ TIEMPO PROMEDIO POR TÉCNICO", tecTimeRows, "#22d3ee") + "<div style=\"height:10px;\"></div>" : "")
    + (vinRows
        ? panel(
            "🚗 VINs CON INCIDENCIAS CRÍTICAS O REINCIDENTES",
            "<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0 14px;\">"
            + vinRows + "</div>",
            "#ef4444"
          )
        : "");
  el.style.display = "";
}

// ── Tarjeta de incidencia individual ───────────────────────────────────────────
function renderCard_(it) {
  const g       = GRADE_MAP[it.tipo] || GRADE_MAP.LEVE;
  const extra   = parseExtra_(it.nota);
  const hasImg  = it.fotoThumbUrl || it.fotoUrl;
  const imgSrc  = it.fotoThumbUrl || it.fotoImgUrl || it.fotoUrl || "";
  const imgFull = it.fotoImgUrl   || it.fotoUrl    || "";
  return "<div style=\"background:var(--glass);"
    + "border:1px solid " + g.border + ";"
    + "border-left:4px solid " + g.color + ";"
    + "border-radius:10px;padding:8px 10px;margin-bottom:6px;"
    + "display:flex;gap:8px;align-items:flex-start;\">"
    + (hasImg
      ? "<div style=\"flex-shrink:0;\">"
        + "<img src=\"" + _escape(imgSrc) + "\" alt=\"foto\" loading=\"lazy\""
        + " style=\"width:44px;height:44px;object-fit:cover;border-radius:7px;"
        + "border:1px solid var(--surfaceLine);cursor:pointer;\""
        + " onclick=\"window.open('" + _escape(imgFull) + "','_blank','noopener')\"/>"
        + "</div>"
      : "")
    + "<div style=\"flex:1;min-width:0;\">"
    +   "<div style=\"display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:3px;\">"
    +     "<code style=\"font-size:.75em;background:var(--ring-track);border-radius:4px;padding:1px 5px;\">" + _escape(it.vin || "—") + "</code>"
    +     chip_(g.abbr, g.label, g)
    +     "<span style=\"margin-left:auto;font-size:.73em;opacity:.45;flex-shrink:0;\">" + fmtDateTime_(it.fecha_hora) + "</span>"
    +   "</div>"
    +   "<div style=\"font-weight:800;font-size:.84em;color:" + g.color + ";opacity:.9;\">" + _escape(it.tecnico || "—") + "</div>"
    +   (extra ? "<div style=\"font-size:.78em;opacity:.65;margin-top:3px;line-height:1.4;\">" + _escape(extra) + "</div>" : "")
    + "</div></div>";
}

// ── Lista agrupada ────────────────────────────────────────────────────────────────
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

    const hdrColor  = C ? "#ef4444" : M ? "#f97316" : "#eab308";
    const hdrBorder = C ? "rgba(239,68,68,.4)"  : M ? "rgba(249,115,22,.4)"  : "rgba(234,179,8,.3)";
    const hdrBg     = C ? "rgba(239,68,68,.08)" : M ? "rgba(249,115,22,.08)" : "rgba(234,179,8,.06)";

    let inner = "";
    for (const { key, label, color, border } of GRADE) {
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
      + "<button type=\"button\" data-catid=\"" + id + "\"" 
      + " style=\"width:100%;background:" + hdrBg + ";border:none;border-bottom:1px solid " + hdrBorder
      + ";padding:10px 14px;display:flex;align-items:center;gap:8px;cursor:pointer;color:inherit;text-align:left;\">"
      + "<div style=\"width:10px;height:10px;border-radius:50%;background:" + hdrColor + ";flex-shrink:0;"
      +   "box-shadow:0 0 6px " + hdrColor + "80;\"></div>"
      + "<span style=\"font-weight:900;font-size:.86em;letter-spacing:.4px;color:" + hdrColor + ";flex:1;\">" + _escape(cat) + "</span>"
      + "<span style=\"display:flex;gap:4px;align-items:center;\">" + chips_(C, M, L) + "</span>"
      + "<span style=\"font-size:.74em;opacity:.4;flex-shrink:0;margin-left:6px;\">" + tot + " inc.</span>"
      + "<span class=\"inc-cat-chev\" style=\"font-size:.72em;opacity:.5;margin-left:4px;\">&#9660;</span>"
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

// ── Orquestador ──────────────────────────────────────────────────────────────
// ── Daily trend mini bar chart ──────────────────────────────────────────────
function renderTrend_(items) {
  const el = document.getElementById("incRepKpis");
  if (!el || !items?.length) return;

  // Group by date
  const days = {};
  for (const it of items) {
    const d = String(it.fecha_hora || "").slice(0, 10);
    if (!d || d.length < 10) continue;
    if (!days[d]) days[d] = { C: 0, M: 0, L: 0 };
    if      (it.tipo === "CRITICA")  days[d].C++;
    else if (it.tipo === "MODERADA") days[d].M++;
    else if (it.tipo === "LEVE")     days[d].L++;
  }

  const entries = Object.entries(days).sort(([a],[b]) => a.localeCompare(b));
  if (entries.length < 2) return; // not useful with a single day

  const maxDay = Math.max(...entries.map(([,v]) => v.C + v.M + v.L), 1);
  const barW   = Math.max(26, Math.min(52, Math.floor(260 / entries.length)));

  const bars = entries.map(([d, v]) => {
    const tot = v.C + v.M + v.L;
    const hTot = Math.max(2, Math.round(tot / maxDay * 60));
    const hC = Math.round(v.C / maxDay * 60);
    const hM = Math.round(v.M / maxDay * 60);
    const hL = Math.max(0, hTot - hC - hM);
    const dayLabel = d.slice(8); // DD
    return "<div style=\"display:flex;flex-direction:column;align-items:center;gap:0;min-width:" + barW + "px;\">"
      + "<span style=\"font-size:.6em;opacity:.5;margin-bottom:2px;\">" + tot + "</span>"
      + "<div style=\"display:flex;flex-direction:column-reverse;width:" + (barW - 4) + "px;height:60px;justify-content:flex-start;\">"
      + (hC > 0 ? "<div style=\"height:" + hC + "px;background:#ef4444;border-radius:2px 2px 0 0;\"></div>" : "")
      + (hM > 0 ? "<div style=\"height:" + hM + "px;background:#f97316;\"></div>" : "")
      + (hL > 0 ? "<div style=\"height:" + hL + "px;background:#eab308;\"></div>" : "")
      + "</div>"
      + "<span style=\"font-size:.6em;opacity:.45;margin-top:3px;\">" + dayLabel + "</span>"
      + "</div>";
  }).join("");

  const monthLabel = entries[0]?.[0]?.slice(0, 7) || "";
  const trendHtml = "<div style=\"margin-top:10px;background:var(--glass);border:1px solid var(--surfaceLine);border-radius:11px;padding:10px 14px;\">"
    + "<div style=\"font-size:.72em;font-weight:900;letter-spacing:.6px;opacity:.65;margin-bottom:8px;\">TENDENCIA DIARIA " + monthLabel + "</div>"
    + "<div style=\"display:flex;gap:3px;align-items:flex-end;overflow-x:auto;padding-bottom:4px;\">"
    + bars
    + "</div>"
    + "<div style=\"display:flex;gap:12px;margin-top:6px;font-size:.65em;\">"
    + "<span style=\"color:#ef4444;font-weight:700;\">&#9632; CR&#205;TICA</span>"
    + "<span style=\"color:#f97316;font-weight:700;\">&#9632; MODERADA</span>"
    + "<span style=\"color:#eab308;font-weight:700;\">&#9632; LEVE</span>"
    + "</div>"
    + "</div>";

  el.innerHTML += trendHtml;
}

function exportCsv_() {
  if (!_lastItems.length) return;
  const headers = ["Fecha", "VIN", "Técnico", "Tipo", "Categoría", "Duración (min)", "Nota extra", "Foto URL"];
  const rows = _lastItems.map(it => [
    it.fecha_hora ? new Date(it.fecha_hora).toLocaleString("es-PE") : "",
    it.vin        || "",
    it.tecnico    || "",
    it.tipo       || "",
    parseCategoria_(it.nota),
    Number.isFinite(it.duracion_min) ? it.duracion_min : "",
    parseExtra_(it.nota),
    it.fotoUrl || it.fotoImgUrl || "",
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url,
    download: `incidencias_${new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderIncReport_(j) {
  _lastItems = Array.isArray(j.items) ? j.items : [];
  const timeStats = buildTimeStats_(_lastItems);
  renderKpis_(j.summary, timeStats);
  renderTrend_(_lastItems);
  const cats = renderList_(_lastItems);
  if (cats) renderRanking_(cats, j.summary, timeStats);
}

// ── bind ────────────────────────────────────────────────────────────────────────
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
  document.getElementById("btnIncRepExport")?.addEventListener("click", exportCsv_);
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
