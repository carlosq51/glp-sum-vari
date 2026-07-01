// =========================
// views/conversion/tec-mapa.js
// Mapa de zonas para técnico — colorea según sugerencia ML
// =========================

import { escapeHtml, getJSON } from "../../core/core.js";

const COL_IZQUIERDA = [15, 14, 13, 12, 11, 10];
const COL_DERECHA   = [9, 8, 7, 6, 5, 4, 3, 2, 1];

function fmtElapsed_(isoStr) {
  if (!isoStr) return "";
  const mins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
  if (mins < 0) return "";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Devuelve el color ML para una zona: verde | verde-soft | gris | rojo | neutral
function classifyZona_(z, mySlot, partnerSlot, suggestedNames, hasSuggestedAnywhere) {
  if (!z.vin || z.estado === "LIBRE" || z.estado === "FINALIZADO") return "neutral";
  const myTech      = z.tecnicos?.[mySlot];
  const partnerTech = z.tecnicos?.[partnerSlot];

  if (myTech)                                            return "rojo";        // mi rol ya ocupado
  if (partnerTech && suggestedNames.has(partnerTech))   return "verde";       // compañero ideal aquí
  if (!partnerTech && !hasSuggestedAnywhere)            return "verde-soft";  // fallback: carro vacío
  if (partnerTech)                                       return "gris";        // compañero no ideal
  return "neutral";
}

function renderCard_(z, color) {
  const isOcupada  = !!z.vin;
  const vinShort   = z.vin ? z.vin.slice(-8) : "";
  const delantero  = z.tecnicos?.delantero || "";
  const tanquero   = z.tecnicos?.tanquero  || "";
  const modelo     = z.modelo || "";
  const tiempo     = isOcupada ? fmtElapsed_(z.registrado_at) : "";

  const estadoCss  = isOcupada
    ? (z.estado === "FINALIZADO" ? "finalizado" : "en_conversion")
    : "libre";
  const colorCss   = color !== "neutral" ? ` zonaCard--tec-${color}` : "";

  return `
    <div class="zonaCard zonaCard--${estadoCss}${colorCss} readOnly"
         data-zona="${z.zona_id}" role="presentation" tabindex="-1">
      <span class="zonaNum">Z${z.zona_id}</span>
      ${isOcupada ? `
        <div class="zonaCarOuter">
          <div class="zonaCarShape">
            <span class="zonaCarLabel">${escapeHtml(delantero)}</span>
            ${modelo ? `<span class="zonaCarModelo">${escapeHtml(modelo)}</span>` : ""}
            <span class="zonaCarLabel">${escapeHtml(tanquero)}</span>
          </div>
          <span class="zonaCarWheel zonaCarWheelFL"></span>
          <span class="zonaCarWheel zonaCarWheelFR"></span>
          <span class="zonaCarWheel zonaCarWheelBL"></span>
          <span class="zonaCarWheel zonaCarWheelBR"></span>
        </div>
        <span class="zonaVin">${escapeHtml(vinShort)}</span>
        ${tiempo ? `<span class="zonaTime">${tiempo}</span>` : ""}
      ` : `<span class="zonaEmptyP">P</span>`}
    </div>`;
}

function renderMapa_(container, zonas, colorMap) {
  const byId = new Map(zonas.map(z => [z.zona_id, z]));

  const colIzqHTML = COL_IZQUIERDA.map(n =>
    renderCard_(byId.get(n) || { zona_id: n, vin: null, estado: "LIBRE" }, colorMap.get(n) || "neutral")
  ).join("");

  const colDerHTML = COL_DERECHA.map(n =>
    renderCard_(byId.get(n) || { zona_id: n, vin: null, estado: "LIBRE" }, colorMap.get(n) || "neutral")
  ).join("");

  container.innerHTML = `
    <div class="zonasMapaWrap">
      <div class="zonasGrid">
        <div class="zonasCol">${colIzqHTML}</div>
        <div class="zonasPasillo">
          <span class="zonasPasilloArrowDown">▼</span>
          <div class="zonasPasilloLine"></div>
          <span class="zonasPasilloArrowUp">▲</span>
        </div>
        <div class="zonasCol">${colDerHTML}</div>
      </div>
    </div>`;
}

function renderLeyenda_(leyendaEl, colorMap, myRole, suggestions) {
  const colors   = [...colorMap.values()];
  const hasVerde     = colors.includes("verde");
  const hasVerdeSoft = colors.includes("verde-soft");
  const hasGris      = colors.includes("gris");
  const hasRojo      = colors.includes("rojo");

  const partnerLabel = myRole === "MOTOR" ? "tanquero" : "delantero";
  const myLabel      = myRole === "MOTOR" ? "delantero" : "tanquero";

  const topNames = suggestions.slice(0, 3).map(s => escapeHtml(s.nombre)).join(", ");

  leyendaEl.innerHTML = `
    <div class="tecMapaInfoBox">
      <div class="tecMapaInfoRole">Eres <strong>${myRole}</strong> — buscas <strong>${partnerLabel}</strong></div>
      ${topNames ? `<div class="tecMapaInfoSug">Top sugeridos: ${topNames}</div>` : ""}
    </div>
    <div class="tecMapaLeyInner">
      ${hasVerde     ? `<span class="tecMapaLeyItem"><span class="tecMapaLeyDot tecMapaLeyDot--verde"></span>Ir aquí — ${partnerLabel} ideal</span>` : ""}
      ${hasVerdeSoft ? `<span class="tecMapaLeyItem"><span class="tecMapaLeyDot tecMapaLeyDot--verde-soft"></span>Carro vacío — empezar solo</span>` : ""}
      ${hasGris      ? `<span class="tecMapaLeyItem"><span class="tecMapaLeyDot tecMapaLeyDot--gris"></span>${partnerLabel} disponible (no ideal)</span>` : ""}
      ${hasRojo      ? `<span class="tecMapaLeyItem"><span class="tecMapaLeyDot tecMapaLeyDot--rojo"></span>${myLabel} ya ocupado</span>` : ""}
    </div>`;
}

export async function loadTecMapa_(containerId, email, especialidad) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div class="small muted" style="padding:16px 0 8px;">Analizando zonas…</div>`;

  const myRole      = String(especialidad || "").toUpperCase();
  const mySlot      = myRole === "MOTOR" ? "delantero" : "tanquero";
  const partnerSlot = myRole === "MOTOR" ? "tanquero"  : "delantero";

  const doLoad = async () => {
    try {
      const [zonaRes, mlRes] = await Promise.all([
        fetch("/api/zonas").then(r => r.json()).catch(() => null),
        getJSON(`/api/ml/suggest-next?email=${encodeURIComponent(email)}`).catch(() => null),
      ]);

      if (!zonaRes?.ok) {
        container.innerHTML = `<div class="small muted">No se pudo cargar el mapa.</div>`;
        return;
      }

      const zonas          = zonaRes.zonas || [];
      const suggestions    = mlRes?.suggestions || [];
      const suggestedNames = new Set(suggestions.map(s => s.nombre).filter(Boolean));

      const hasSuggestedAnywhere = zonas.some(z => {
        const partner = z.tecnicos?.[partnerSlot];
        const me      = z.tecnicos?.[mySlot];
        return partner && suggestedNames.has(partner) && !me;
      });

      const colorMap = new Map();
      for (const z of zonas) {
        colorMap.set(z.zona_id, classifyZona_(z, mySlot, partnerSlot, suggestedNames, hasSuggestedAnywhere));
      }

      renderMapa_(container, zonas, colorMap);

      const leyendaEl = document.getElementById("tecMapaLeyenda");
      if (leyendaEl) renderLeyenda_(leyendaEl, colorMap, myRole, suggestions);

      const ts = document.getElementById("tecMapaTs");
      if (ts) {
        const d = new Date();
        ts.textContent = `Act. ${d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`;
      }
    } catch (e) {
      container.innerHTML = `<div class="small muted">Error al cargar el mapa.</div>`;
      console.error("[TEC-MAPA]", e);
    }
  };

  // Bind refresh button (guard: replace handler each load)
  const refreshBtn = document.getElementById("tecMapaRefreshBtn");
  if (refreshBtn) {
    const old = refreshBtn._tecMapaHandler;
    if (old) refreshBtn.removeEventListener("click", old);
    refreshBtn._tecMapaHandler = () => doLoad().catch(() => {});
    refreshBtn.addEventListener("click", refreshBtn._tecMapaHandler);
  }

  await doLoad();
}
