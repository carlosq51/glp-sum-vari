// =========================
// views/conversion/tec-mapa.js
// Mapa de zonas para técnico — colorea según sugerencia ML
// =========================

import { escapeHtml, getJSON } from "../../core/core.js";
import { zonaCardHTML_, zonasGridHTML_ } from "../zonas/zonas-layout.js";

// Devuelve el color ML para una zona
function classifyZona_(z, mySlot, partnerSlot, suggestedNames, hasSuggestedAnywhere) {
  if (!z.vin || z.estado === "LIBRE") return "neutral";   // spot vacío, sin VIN
  if (z.estado === "FINALIZADO")      return "azul";      // ya convertido

  const myTech      = z.tecnicos?.[mySlot];
  const partnerTech = z.tecnicos?.[partnerSlot];

  if (myTech)                                           return "rojo";       // mi rol ya ocupado
  if (partnerTech && suggestedNames.has(partnerTech))  return "verde";      // compañero ideal aquí
  if (!partnerTech && !hasSuggestedAnywhere)           return "verde-soft"; // fallback: carro sin nadie
  if (partnerTech)                                      return "gris";       // compañero presente, no ideal
  return "neutral";  // VIN sin técnicos, pero hay sugeridos en otras zonas
}

// Colores que permiten click directo para iniciar trabajo en ese VIN.
// "rojo" (mi rol ya ocupado) y "azul" (ya finalizado) quedan bloqueados.
const CLICKABLE_COLORS = new Set(["verde", "verde-soft", "gris", "neutral"]);

// El esqueleto de tarjeta/grid vive en zonas-layout.js; aquí solo se decide
// la variante de color (por clasificación ML) y los atributos de interacción.
function renderCard_(z, color) {
  const isOcupada = !!z.vin;

  // Una sola clase maestra: el color ML controla TODO (carro + borde + fondo).
  // No mezclamos con estado para evitar conflictos de color.
  let primaryCss;
  if (!isOcupada)               primaryCss = "libre";
  else if (color !== "neutral") primaryCss = `tec-${color}`;
  else                          primaryCss = "tec-neutral";

  // Interactivo: cualquier spot vacío (para escanear/empezar) o carro con mi
  // rol libre y estado ≠ finalizado (verde/verde-soft/gris/neutral).
  const clickable = !isOcupada || CLICKABLE_COLORS.has(color);

  return zonaCardHTML_(z, {
    variant: primaryCss,
    clickable,
    attrs: `data-clickable="${clickable ? "1" : "0"}"`,
  });
}

function renderMapa_(container, zonas, colorMap) {
  const gridHTML = zonasGridHTML_(zonas, z =>
    renderCard_(z, colorMap.get(z.zona_id) || "neutral")
  );
  container.innerHTML = `<div class="zonasMapaWrap">${gridHTML}</div>`;
}

function renderLeyenda_(leyendaEl, colorMap, myRole, suggestions) {
  const colors   = [...colorMap.values()];
  const hasVerde     = colors.includes("verde");
  const hasVerdeSoft = colors.includes("verde-soft");
  const hasGris      = colors.includes("gris");
  const hasRojo      = colors.includes("rojo");
  const hasAzul      = colors.includes("azul");

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
      ${hasGris      ? `<span class="tecMapaLeyItem"><span class="tecMapaLeyDot tecMapaLeyDot--gris"></span>${partnerLabel} no ideal</span>` : ""}
      ${hasRojo      ? `<span class="tecMapaLeyItem"><span class="tecMapaLeyDot tecMapaLeyDot--rojo"></span>Mi rol (${myLabel}) ya ocupado</span>` : ""}
      ${hasAzul      ? `<span class="tecMapaLeyItem"><span class="tecMapaLeyDot tecMapaLeyDot--azul"></span>Ya convertido</span>` : ""}
    </div>`;
}

/**
 * @param {string} containerId
 * @param {string} email
 * @param {string} especialidad
 * @param {{ onStartVin?: (vin:string)=>void, onEmptyZone?: ()=>void }} [callbacks]
 *   onStartVin: se llama al tocar un carro con mi rol libre (criterios cumplidos) →
 *               el llamador debe iniciar la OT para ese VIN.
 *   onEmptyZone: se llama al tocar un spot vacío → no hay VIN con el que crear la OT
 *                directamente, el llamador debe ofrecer escanear/ingresar uno.
 */
function bindMapaClicks_(container, onStartVin, onEmptyZone) {
  const old = container._tecMapaClickHandler;
  if (old) container.removeEventListener("click", old);

  const handler = (e) => {
    const card = e.target.closest(".zonaCard[data-clickable='1']");
    if (!card) return;
    const vin = card.dataset.vin;
    if (vin && onStartVin) onStartVin(vin);
    else if (!vin && onEmptyZone) onEmptyZone();
  };

  container._tecMapaClickHandler = handler;
  container.addEventListener("click", handler);
}

export async function loadTecMapa_(containerId, email, especialidad, callbacks = {}) {
  const { onStartVin = null, onEmptyZone = null } = callbacks;
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
      bindMapaClicks_(container, onStartVin, onEmptyZone);

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
