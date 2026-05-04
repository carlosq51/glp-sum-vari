// =========================
// public/js/views/supervisor/sup-live.js
// Panel LIVE de técnicos: estado en tiempo real del día, agrupado por especialidad
// =========================

import { getJSON } from "../../core/api.js";
import { escapeHtml } from "../../core/format.js";

let liveTimer_ = null;
let liveActive_ = false;
const REFRESH_MS = 30_000; // refresco cada 30 s

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

function fmtTiempo_(ms, runningSince) {
  let total = Number(ms) || 0;
  if (runningSince) total += Date.now() - new Date(runningSince).getTime();
  total = Math.max(0, total);
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
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

  let html = `<div class="live-refresh-bar">
    <span class="live-fecha small">📅 ${escapeHtml(data.fecha || "")}</span>
    <span id="liveLastUpdate" class="live-last-update small">Actualizado: ${fmtHora_(new Date().toISOString())}</span>
  </div>`;

  for (const rol of allRoles) {
    const meta  = ROL_META[rol] || { label: rol, icon: "👤", color: "#94a3b8" };
    const group = groups[rol];
    const countTrabajando = group.filter(t => t.estadoActivo === "TRABAJANDO").length;
    const totalCars = group.reduce((s, t) => s + (Number(t.carsHoy) || 0), 0);
    const totalCarsStr = fmtCars_(totalCars);
    const hasHalfGroup = totalCars !== Math.floor(totalCars);

    html += `
    <div class="live-group" data-rol="${escapeHtml(rol)}">
      <div class="live-group-header live-group-toggle" style="border-left: 3px solid ${meta.color};">
        <span class="live-group-icon">${meta.icon}</span>
        <span class="live-group-label">${escapeHtml(meta.label)}</span>
        <span class="live-cars-pill${hasHalfGroup ? " half" : ""}" title="Total carros ${escapeHtml(meta.label)}">🚗 ${totalCarsStr}</span>
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

function renderTechCard_(t) {
  const em = ESTADO_META[t.estadoActivo] || ESTADO_META.SIN_ACTIVIDAD;
  const nombre = t.nombre || t.email || "Técnico";
  const vinActivo = t.vinActivo || "";
  const currentAsg = (t.asignacionesHoy || []).find(a => a.vin === vinActivo && a.estado !== "FINALIZADO");
  const cars = Number(t.carsHoy ?? t.finalizadosHoy ?? 0);
  const carsStr = fmtCars_(cars);
  const hasHalf = cars !== Math.floor(cars);

  return `
  <div class="live-tech-card" data-techkey="${escapeHtml(t.userId + "__" + t.rol)}" title="Click: ver detalle completo del día">
    <div class="live-tech-header">
      <span class="live-tech-dot" style="background:${em.dot};"></span>
      <span class="live-tech-name">${escapeHtml(nombre)}</span>
      <span class="live-badge ${escapeHtml(em.badge)}">${escapeHtml(em.label)}</span>
      <span class="live-cars-pill${hasHalf ? " half" : ""}" title="${hasHalf ? "Incluye trabajos del día anterior (½)" : "Carros finalizados hoy"}">🚗 ${carsStr}</span>
    </div>

    ${vinActivo ? `<div class="live-vin-compact">
      <span class="live-vin-abbr">VIN</span>
      <span class="live-vin-value">${escapeHtml(vinActivo)}</span>
    </div>` : ""}

    <div class="live-extra" aria-hidden="true">
      <div class="live-extra-row">
        ${currentAsg?.running_since ? `<span>⏱ ${fmtTiempo_(currentAsg.tiempo_ms, currentAsg.running_since)}</span>` : ""}
        ${t.activosHoy > 0 ? `<span>🔧 ${t.activosHoy} en proceso</span>` : ""}
      </div>
    </div>

    <button type="button" class="live-expand-btn" title="Mostrar/ocultar datos del turno">▼ más</button>
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
  if (!asgList.length) {
    body.innerHTML = `<div class="small">Sin asignaciones hoy.</div>`;
  } else {
    const summary = `<div class="live-detail-summary small">
      🚗 <b>${carsStr}</b>
      ${cars !== Math.floor(cars) ? `<span class="live-half-legend" title="Incluye trabajos iniciados el día anterior">½ = día anterior</span>` : ""}
      · ✅ <b>${tech.finalizadosHoy || 0} finalizado${(tech.finalizadosHoy || 0) !== 1 ? "s" : ""}</b>
      · 🔧 <b>${tech.activosHoy || 0} en proceso</b>
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

  return `
  <div class="live-detail-row${isYesterday ? " live-detail-row--half" : ""}">
    <div class="live-detail-top">
      <span class="live-detail-vin-text">${escapeHtml(vin)}</span>
      ${isYesterday ? `<span class="live-half-badge" title="Empezó el día anterior → cuenta ½ carro">½</span>` : ""}
      <span class="live-detail-conv">⏱ ${escapeHtml(tiempoTotal)}</span>
    </div>
    <div class="live-detail-meta small">
      <span class="live-badge ${escapeHtml(em.badge)}">${escapeHtml(em.label)}</span>
      ${a.running_since ? `<span>🕐 ${fmtHora_(a.running_since)}</span>` : ""}
    </div>
  </div>`;
}

function closeLiveDetail_() {
  const modal = document.getElementById("liveDetailModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("show");
}

// ── Ciclo de vida ─────────────────────────────────────────────────────
async function refreshLive_() {
  if (!liveActive_) return;
  const container = document.getElementById("liveContainer");
  if (!container) return;
  const data = await fetchLive_();
  renderLive_(container, data);
  // Actualizar timestamp si está visible
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
