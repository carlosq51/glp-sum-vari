// =========================
// public/js/views/supervisor/sup-live.js
// Panel LIVE de técnicos: estado en tiempo real del día, agrupado por especialidad
// =========================

import { getJSON } from "../../core/api.js";
import { escapeHtml, fmtTiempo_ } from "../../core/format.js";

let liveTimer_    = null;
let liveActive_   = false;
let liveLastData_ = null;   // último fetch, para re-abrir detalle actualizado
let _liveFilter_  = null;   // "TRABAJANDO"|"PAUSADO"|"SIN_INICIAR"|"STALLED"|"CUMPL_LOW"|null
const REFRESH_MS  = 300_000; // refresco cada 5 min

// ── Colores y etiquetas por especialidad ──────────────────────────────
const ROL_META = {
  MOTOR:    { label: "Motor",    icon: "🔧", color: "var(--c-motor,   #38bdf8)" },
  TANQUE:   { label: "Tanque",   icon: "⛽", color: "var(--c-tanque,  #fb923c)" },
  CALIDAD:  { label: "Calidad",  icon: "✅", color: "var(--c-calidad, #4ade80)" },
  RAMALERO: { label: "Ramal",    icon: "🔗", color: "var(--c-ramal,   #c084fc)" },
};

const ESTADO_META = {
  TRABAJANDO:    { label: "TRABAJANDO",   badge: "badge-trabajando",   dot: "#22c55e" },
  PAUSADO:       { label: "PAUSADO",      badge: "badge-pausado",      dot: "#f59e0b" },
  SIN_INICIAR:   { label: "SIN INICIAR",  badge: "badge-sin-iniciar",  dot: "#94a3b8" },
  FINALIZADO:    { label: "FINALIZADO",   badge: "badge-finalizado",   dot: "#60a5fa" },
  SIN_ACTIVIDAD: { label: "SIN ACTIVIDAD",badge: "badge-sin-actividad",dot: "#475569" },
  DESCONECTADO:  { label: "DESCON.",      badge: "badge-desconectado", dot: "#64748b" },
};

// ── API ───────────────────────────────────────────────────────────────
async function fetchLive_() {
  const j = await getJSON("/api/supervisor/live").catch(() => null);
  return j;
}

// ── Formato de tiempo ─────────────────────────────────────────────────
function fmtHora_(iso) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (isNaN(d)) return "--:--";
  return new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(d);
}

// ── Render principal ──────────────────────────────────────────────────
function renderLive_(container, data) {
  if (!container) return;
  if (!data?.ok) {
    container.innerHTML = `<div class="live-error small">⚠️ ${escapeHtml(data?.error || "Error cargando datos.")}</div>`;
    return;
  }

  const techs = Array.isArray(data.techs) ? data.techs : [];
  if (!techs.length) {
    container.innerHTML = `<div class="live-empty small">Sin actividad registrada hoy.</div>`;
    return;
  }

  // Agrupar por rol
  const groups = {};
  const ORDER = ["MOTOR", "TANQUE", "CALIDAD", "RAMALERO"];
  for (const t of techs) {
    const rol = String(t.rol || "OTRO").toUpperCase();
    if (!groups[rol]) groups[rol] = [];
    groups[rol].push(t);
  }

  // Renderizar grupos en orden definido
  const allRoles = [...ORDER.filter(r => groups[r]), ...Object.keys(groups).filter(r => !ORDER.includes(r))];

  // ── KPI header globals ────────────────────────────────────────────────
  const countWorking = techs.filter(t => t.estadoActivo === "TRABAJANDO").length;
  const countPaused  = techs.filter(t => t.estadoActivo === "PAUSADO").length;
  const countSinIni  = techs.filter(t => t.estadoActivo === "SIN_INICIAR").length;
  const countTotal   = techs.filter(t => t.estadoActivo !== "DESCONECTADO").length;
  const countStalled = techs.filter(t => {
    if (t.estadoActivo !== "PAUSADO" && t.estadoActivo !== "SIN_INICIAR") return false;
    const r = (t.asignacionesHoy||[]).filter(a=>a.estado!=="FINALIZADO").sort((a,b)=>new Date(b.updated_at||0)-new Date(a.updated_at||0))[0];
    const ms = r?.updated_at ? Date.now()-new Date(r.updated_at).getTime() : 0;
    return (t.estadoActivo==="PAUSADO" && ms>40*60_000)||(t.estadoActivo==="SIN_INICIAR" && ms>60*60_000);
  }).length;

  // VIN-level goals from server
  const vsum     = data.vinsSummary || {};
  const metaConv = vsum.metaConv || 25;
  const metaCal  = vsum.metaCal  || 22;
  const convDone = vsum.convDone || 0;
  const calDone  = vsum.calDone  || 0;
  const convActive = vsum.convActive || 0;
  const calActive  = vsum.calActive  || 0;
  const pctConv  = metaConv > 0 ? Math.min(Math.round(convDone / metaConv * 100), 100) : 0;
  const pctCal   = metaCal  > 0 ? Math.min(Math.round(calDone  / metaCal  * 100), 100) : 0;
  const convBarColor = pctConv >= 100 ? "#4ade80" : "#38bdf8";
  const calBarColor  = pctCal  >= 100 ? "#4ade80" : "#a78bfa";
  const convNumColor = pctConv >= 100 ? "#4ade80" : pctConv >= 70 ? "#fbbf24" : "#e2e8f0";
  const calNumColor  = pctCal  >= 100 ? "#4ade80" : pctCal  >= 70 ? "#fbbf24" : "#e2e8f0";

  let html = `<div class="live-refresh-bar">
    <span class="live-fecha small">\uD83D\uDCC5 ${escapeHtml(data.fecha || "")}</span>
    <span id="liveLastUpdate" class="live-last-update small">Actualizado: ${fmtHora_(new Date().toISOString())}</span>
    <button type="button" id="btnLiveRefresh" class="live-refresh-btn" title="Actualizar ahora">\u21bb</button>
  </div>
  <div style="margin:8px 0 12px;padding:10px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;">

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
      <div style="flex:1;min-width:120px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
          <span style="font-size:.7em;font-weight:900;letter-spacing:.5px;color:#38bdf8;">\uD83D\uDD27 CONVERSI\u00d3N</span>
          <span style="font-size:.88em;font-weight:1000;color:${convNumColor};">${convDone} <span style="opacity:.4;font-size:.8em;font-weight:700;">/ ${metaConv}</span></span>
        </div>
        <div style="height:7px;background:rgba(255,255,255,.1);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${pctConv}%;background:${convBarColor};border-radius:4px;transition:width .6s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.62em;margin-top:2px;opacity:.4;">
          <span>${pctConv}%</span>
          ${convActive > 0 ? `<span>\u2699\ufe0f ${convActive} en proc.</span>` : ""}
        </div>
      </div>
      <div style="flex:1;min-width:120px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
          <span style="font-size:.7em;font-weight:900;letter-spacing:.5px;color:#a78bfa;">\u2705 CALIDAD</span>
          <span style="font-size:.88em;font-weight:1000;color:${calNumColor};">${calDone} <span style="opacity:.4;font-size:.8em;font-weight:700;">/ ${metaCal}</span></span>
        </div>
        <div style="height:7px;background:rgba(255,255,255,.1);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${pctCal}%;background:${calBarColor};border-radius:4px;transition:width .6s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.62em;margin-top:2px;opacity:.4;">
          <span>${pctCal}%</span>
          ${calActive > 0 ? `<span>\u2699\ufe0f ${calActive} en proc.</span>` : ""}
        </div>
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;border-top:1px solid rgba(255,255,255,.06);padding-top:7px;">
      <span style="display:inline-flex;align-items:center;gap:4px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);color:#4ade80;border-radius:6px;padding:2px 8px;font-size:.72em;font-weight:900;cursor:pointer;user-select:none;" data-live-filter="TRABAJANDO" title="Click para filtrar activos">&#x1F7E2; ${countWorking} activo${countWorking!==1?"s":""}</span>
      ${countPaused > 0 ? `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);color:#fbbf24;border-radius:6px;padding:2px 8px;font-size:.72em;font-weight:900;cursor:pointer;user-select:none;" data-live-filter="PAUSADO" title="Click para filtrar pausados">&#x23F8; ${countPaused} pausado${countPaused!==1?"s":""}</span>` : ""}
      ${countSinIni > 0 ? `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(148,163,184,.10);border:1px solid rgba(148,163,184,.3);color:#94a3b8;border-radius:6px;padding:2px 8px;font-size:.72em;font-weight:900;cursor:pointer;user-select:none;" data-live-filter="SIN_INICIAR" title="Click para filtrar sin iniciar">&#x25CB; ${countSinIni} sin ini.</span>` : ""}
      ${countStalled > 0 ? `<span style="background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.5);color:#fb923c;border-radius:6px;padding:2px 8px;font-size:.72em;font-weight:900;cursor:pointer;user-select:none;" data-live-filter="STALLED" title="Click para filtrar sin movimiento">&#x26A0;&#xFE0F; ${countStalled} sin mov.</span>` : ""}
      <span style="margin-left:auto;font-size:.62em;opacity:.3;">${countTotal} t\u00e9cnico${countTotal!==1?"s":""} hoy</span>
    </div>

  </div>`;

  for (const rol of allRoles) {
    const meta  = ROL_META[rol] || { label: rol, icon: "👤", color: "#94a3b8" };
    const group = groups[rol];
    const countTrabajando = group.filter(t => t.estadoActivo === "TRABAJANDO").length;
    const totalCars = group.reduce((s, t) => s + (Number(t.carsHoy) || 0), 0);
    const totalVirtual = group.reduce((s, t) => s + (Number(t.virtualHoy) || 0), 0);
    const totalCarsStr = fmtCars_(totalCars);
    const hasHalfGroup = totalCars !== Math.floor(totalCars);
    const _totAssG = totalCars + totalVirtual;
    const pctCumplGroup = _totAssG > 0 ? Math.round(totalCars / _totAssG * 100) : null;
    const _cumplColorG = pctCumplGroup >= 80 ? "#4ade80" : pctCumplGroup >= 50 ? "#fbbf24" : "#f87171";

    html += `
    <div class="live-group" data-rol="${escapeHtml(rol)}">
      <div class="live-group-header live-group-toggle" style="border-left: 3px solid ${meta.color};">
        <span class="live-group-icon">${meta.icon}</span>
        <span class="live-group-label">${escapeHtml(meta.label)}</span>
        <span class="live-cars-pill${hasHalfGroup ? " half" : ""}" title="Carros finalizados ${escapeHtml(meta.label)}">🚗 ${totalCarsStr}</span>
        ${totalVirtual > 0 ? `<span class="live-virtual-pill" title="${totalVirtual} trabajo${totalVirtual !== 1 ? "s" : ""} en progreso sin finalizar">⚙️ ${totalVirtual} virt.</span>` : ""}
        ${pctCumplGroup !== null && _totAssG > 0 ? `<span style="font-size:.7em;font-weight:900;color:${_cumplColorG};background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:1px 7px;">${pctCumplGroup}% cumpl.</span>` : ""}
        <span class="live-group-count pill small">${group.length} téc.</span>
        ${countTrabajando > 0 ? `<span class="live-dot-working"></span><span class="small">${countTrabajando} activo${countTrabajando !== 1 ? "s" : ""}</span>` : ""}
        <span class="live-group-chevron">▶</span>
      </div>
      <div class="live-cards live-group-body" style="display:none;">
        ${group.map(t => renderTechCard_(t)).join("")}
      </div>
    </div>`;
  }

  container.innerHTML = html;

  // ── Bind: filtros interactivos KPI ─────────────────────────────────
  container.querySelectorAll("[data-live-filter]").forEach(pill => {
    pill.addEventListener("click", e => {
      e.stopPropagation();
      const f = pill.dataset.liveFilter;
      _liveFilter_ = _liveFilter_ === f ? null : f;
      // Visual: highlight active pill
      container.querySelectorAll("[data-live-filter]").forEach(p => {
        p.style.outline = p.dataset.liveFilter === _liveFilter_ ? "2px solid rgba(255,255,255,.6)" : "";
        p.style.outlineOffset = p.dataset.liveFilter === _liveFilter_ ? "2px" : "";
      });
      applyLiveFilter_(container);
    });
  });
  // Re-apply filter if it was already set (e.g. after a refresh)
  if (_liveFilter_) applyLiveFilter_(container);

  // ── Bind: botón actualizar manual ──────────────────────────────
  container.querySelector("#btnLiveRefresh")?.addEventListener("click", () => refreshLive_().catch(() => {}));

  // Bind: toggle de grupo
  container.querySelectorAll(".live-group-toggle").forEach(header => {
    header.addEventListener("click", () => {
      const body = header.closest(".live-group")?.querySelector(".live-group-body");
      const chev = header.querySelector(".live-group-chevron");
      if (!body) return;
      const opening = body.style.display === "none";
      body.style.display = opening ? "" : "none";
      if (chev) chev.textContent = opening ? "▼" : "▶";
    });
  });

  // Bind: clic en card → modal detalle; clic en expand-btn → toggle extra
  container.querySelectorAll(".live-tech-card[data-techkey]").forEach(card => {
    if (card.classList.contains("disconnected")) return; // sin detalle para desconectados
    card.addEventListener("click", (e) => {
      if (e.target.closest(".live-expand-btn")) return;
      const techKey = card.dataset.techkey;
      const tech = techs.find(t => `${t.userId}__${t.rol}` === techKey);
      if (tech) openLiveDetail_(tech);
    });

    card.querySelector(".live-expand-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isExpanded = card.classList.toggle("expanded");
      e.currentTarget.textContent = isExpanded ? "▲ menos" : "▼ más";
    });
  });
}

function fmtCars_(n) {
  const v = Number(n) || 0;
  return v === Math.floor(v) ? String(v) : v.toFixed(1);
}

// Primer nombre (primera palabra) + truncado a maxLen caracteres
function firstName_(nombre, maxLen = 10) {
  const first = String(nombre || "").trim().split(/\s+/)[0] || "Técnico";
  return first.length > maxLen ? first.slice(0, maxLen) : first;
}

// Primera palabra del label de estado, truncado a maxLen
function shortEstado_(label, maxLen = 4) {
  const word = String(label || "").trim().split(/\s+/)[0] || "";
  return word.length > maxLen ? word.slice(0, maxLen) : word;
}

function renderTechCard_(t) {
  const em = ESTADO_META[t.estadoActivo] || ESTADO_META.SIN_ACTIVIDAD;
  const nombre = t.nombre || t.email || "Técnico";
  const vinActivo = t.vinActivo || "";
  const currentAsg = (t.asignacionesHoy || []).find(a => a.vin === vinActivo && a.estado !== "FINALIZADO");
  // Stall detection: last non-finalized assignment state unchanged for too long
  const _recentNF = (t.asignacionesHoy||[]).filter(a=>a.estado!=="FINALIZADO").sort((a,b)=>new Date(b.updated_at||0)-new Date(a.updated_at||0))[0];
  const _sinceMs  = _recentNF?.updated_at ? Date.now()-new Date(_recentNF.updated_at).getTime() : 0;
  const isStalled = (t.estadoActivo==="PAUSADO" && _sinceMs>40*60_000)||(t.estadoActivo==="SIN_INICIAR" && _sinceMs>60*60_000);
  const stallMins = Math.floor(_sinceMs/60_000);
  const cars = Number(t.carsHoy ?? t.finalizadosHoy ?? 0);
  const carsStr = fmtCars_(cars);
  const hasHalf = cars !== Math.floor(cars);
  const virtual = Number(t.virtualHoy ?? t.activosHoy ?? 0);
  const _totAss = cars + virtual;
  const pctTech = _totAss > 0 ? Math.round(cars / _totAss * 100) : null;
  const _cumplColor = pctTech !== null ? (pctTech >= 80 ? "#4ade80" : pctTech >= 50 ? "#fbbf24" : "#f87171") : "#94a3b8";
  const displayName = firstName_(nombre);
  const displayEstado = shortEstado_(em.label);
  const isDisconnected = t.estadoActivo === "DESCONECTADO";

  return `
  <div class="live-tech-card${isDisconnected ? " disconnected" : ""}${isStalled ? " stalled" : ""}"
    data-techkey="${escapeHtml(t.userId + "__" + t.rol)}"
    data-estado="${escapeHtml(t.estadoActivo)}"
    data-stalled="${isStalled ? "1" : "0"}"
    data-pct="${pctTech !== null ? pctTech : ""}"
    title="${escapeHtml(nombre)} \u2014 ${isDisconnected ? "Sin actividad hoy" : "Click: ver detalle"}"${isStalled ? ` style="border-color:#f97316;background:rgba(249,115,22,.07);"` : ""}>
    <div class="live-tech-main">
      <div class="live-tech-identity">
        <span class="live-tech-dot" style="background:${em.dot};"></span>
        <span class="live-tech-name">${escapeHtml(displayName)}</span>
        <span class="live-badge ${escapeHtml(em.badge)}">${escapeHtml(displayEstado)}</span>
        ${isStalled ? `<span style="font-size:.66em;background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.4);color:#fb923c;border-radius:4px;padding:1px 5px;white-space:nowrap;font-weight:900;">&#x26A0;&#xFE0F; ${stallMins}m</span>` : ""}
      </div>
      <div class="live-vin-section">
        ${vinActivo && !isDisconnected
          ? `<span class="live-vin-abbr">VIN</span><span class="live-vin-value">${escapeHtml(vinActivo)}</span>`
          : `<span style="opacity:.25;font-size:.75em;">\u2014</span>`}
      </div>
      <div class="live-tech-stats">
        ${!isDisconnected ? `<span class="live-cars-pill${hasHalf ? " half" : ""}" title="${hasHalf ? "Incluye trabajos del d\u00EDa anterior (\u00BD)" : "Carros finalizados hoy"}">\uD83D\uDE97 ${carsStr}</span>` : ""}
        ${!isDisconnected && virtual > 0 ? `<span class="live-virtual-pill" title="${virtual} en progreso">\u2699\uFE0F ${virtual}</span>` : ""}
        ${!isDisconnected && pctTech !== null ? `<span style="font-size:.68em;font-weight:900;color:${_cumplColor};background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:4px;padding:1px 5px;white-space:nowrap;" title="Cumplimiento: ${cars} finalizado${cars!==1?"s":""} de ${_totAss} asignado${_totAss!==1?"s":""}">${pctTech}%</span>` : ""}
        ${!isDisconnected && currentAsg?.running_since ? `<span style="font-size:.68em;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);color:#86efac;border-radius:4px;padding:1px 5px;white-space:nowrap;">&#x23F1; ${fmtTiempo_(currentAsg.tiempo_ms, currentAsg.running_since)}</span>` : ""}
      </div>
    </div>
    ${!isDisconnected ? `
    <div class="live-extra" aria-hidden="true">
      <div class="live-extra-row">
        ${currentAsg?.running_since ? `<span>\u23F1 ${fmtTiempo_(currentAsg.tiempo_ms, currentAsg.running_since)}</span>` : ""}
        ${t.activosHoy > 0 ? `<span>\uD83D\uDD27 ${t.activosHoy} en proceso</span>` : ""}
      </div>
    </div>
    <button type="button" class="live-expand-btn" title="Mostrar/ocultar datos del turno">\u25bc m\u00e1s</button>
    ` : ""}
  </div>`;
}

// ── Modal de detalle del día ───────────────────────────────────────────
function openLiveDetail_(tech) {
  const modal = document.getElementById("liveDetailModal");
  const title = document.getElementById("liveDetailTitle");
  const body  = document.getElementById("liveDetailBody");
  if (!modal || !title || !body) return;

  const nombre = tech.nombre || tech.email || "Técnico";
  const meta   = ROL_META[tech.rol] || { label: tech.rol, icon: "👤" };
  title.textContent = `${meta.icon} ${nombre} — ${meta.label}`;

  const asgList = Array.isArray(tech.asignacionesHoy) ? tech.asignacionesHoy : [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const cars = Number(tech.carsHoy ?? tech.finalizadosHoy ?? 0);
  const carsStr = fmtCars_(cars);
  const virtual = Number(tech.virtualHoy ?? tech.activosHoy ?? 0);
  if (!asgList.length) {
    body.innerHTML = `<div class="small">Sin asignaciones hoy.</div>`;
  } else {
    const summary = `<div class="live-detail-summary small">
      🚗 <b>${carsStr}</b> finalizado${cars !== 1 ? "s" : ""}
      ${cars !== Math.floor(cars) ? `<span class="live-half-legend" title="Incluye trabajos iniciados el día anterior">½ = día anterior</span>` : ""}
      ${virtual > 0 ? `· <span class="live-virtual-pill" style="font-size:inherit;">⚙️ <b>${virtual}</b> en progreso</span>` : ""}
    </div>`;
    body.innerHTML = summary + asgList.map(a => renderDetailRow_(a, todayStr)).join("");
  }

  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("show");
}

function renderDetailRow_(a, todayStr) {
  const em  = ESTADO_META[a.estado] || ESTADO_META.SIN_ACTIVIDAD;
  const vin = a.vin || (a.tipo_ramal ? `RAMAL: ${a.tipo_ramal}` : "–");
  const tiempoTotal = fmtTiempo_(a.tiempo_ms, a.estado === "TRABAJANDO" ? a.running_since : null);
  const asgDate = (a.fecha_asignacion || "").slice(0, 10);
  const isYesterday = asgDate && asgDate < todayStr;

  // Fechas de inicio y fin
  const inicioStr = a.fecha_asignacion ? fmtFechaHora_(a.fecha_asignacion) : null;
  const finStr    = a.estado === "FINALIZADO" && a.updated_at ? fmtFechaHora_(a.updated_at) : null;

  return `
  <div class="live-detail-row${isYesterday ? " live-detail-row--half" : ""}">
    <div class="live-detail-top">
      <span class="live-detail-vin-text">${escapeHtml(vin)}</span>
      ${isYesterday ? `<span class="live-half-badge" title="Empezó el día anterior → cuenta ½ carro">½</span>` : ""}
      <span class="live-detail-conv">⏱ ${escapeHtml(tiempoTotal)}</span>
    </div>
    <div class="live-detail-meta small">
      <span class="live-badge ${escapeHtml(em.badge)}">${escapeHtml(em.label)}</span>
      ${inicioStr ? `<span>🟢 ${escapeHtml(inicioStr)}</span>` : ""}
      ${finStr    ? `<span>🏁 ${escapeHtml(finStr)}</span>`    : ""}
    </div>
  </div>`;
}

// Formatea ISO → "DD/MM HH:MM" (omite la fecha si es hoy)
function fmtFechaHora_(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayStr   = d.toISOString().slice(0, 10);
  const hhmm     = new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(d);
  if (dayStr === todayStr) return hhmm;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm} ${hhmm}`;
}

function closeLiveDetail_() {
  const modal = document.getElementById("liveDetailModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("show");
  // Si hubo actualización mientras el modal estaba abierto, aplicarla ahora
  if (liveLastData_) {
    const container = document.getElementById("liveContainer");
    if (container) renderLive_(container, liveLastData_);
  }
}

// ── Ciclo de vida ─────────────────────────────────────────────────────
async function refreshLive_() {
  if (!liveActive_) return;
  const container = document.getElementById("liveContainer");
  if (!container) return;
  const data = await fetchLive_();
  liveLastData_ = data;

  // Si hay un modal abierto, NO re-renderizar para no interrumpir al usuario
  const modalOpen = document.getElementById("liveDetailModal")?.classList.contains("show");
  if (!modalOpen) {
    renderLive_(container, data);
  }

  // Actualizar solo el timestamp (siempre, silenciosamente)
  const ts = document.getElementById("liveLastUpdate");
  if (ts) ts.textContent = `Actualizado: ${fmtHora_(new Date().toISOString())}`;
}

export function bindSupLive_() {
  // Botón cerrar modal detalle
  document.getElementById("btnCloseLiveDetail")?.addEventListener("click", closeLiveDetail_);
  document.getElementById("liveDetailModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeLiveDetail_();
  });
}

export async function enterLive_() {
  liveActive_ = true;
  await refreshLive_();
  // Arrancar polling
  clearInterval(liveTimer_);
  liveTimer_ = setInterval(() => refreshLive_(), REFRESH_MS);
}

export function exitLive_() {
  liveActive_ = false;
  clearInterval(liveTimer_);
  liveTimer_ = null;
}
