// =========================
// public/js/work/work-status.js
// Estados de trabajo: finalizado, acciones permitidas, filtro por módulo
// =========================

import { CORE } from "../core/state.js";

export function isFinalizado_(it) {
  return String(it?.estado || "").toUpperCase() === "FINALIZADO";
}

/**
 * Acciones que la pantalla deja lanzar sobre una OT.
 *
 * La tabla es la MISMA que valida el servidor (lib/ot-estados.js). Esta
 * comprobación sigue aquí porque hay acciones que no entran por un botón —el
 * escaneo del VIN, un atajo— y ahí no hay nada que esconder, solo que rechazar.
 */
export { accionesDe_ as allowedActionsByEstado } from "../../../lib/ot-estados.js";

export function shouldShowItemInCurrentModule_(it) {
  const rol = String(it?.rolTrabajo || "").toUpperCase();
  if (CORE.state.currentModule === "CALIDAD") return rol === "CALIDAD";
  if (CORE.state.currentModule === "RAMALERO") return rol === "RAMALERO";
  return rol === "MOTOR" || rol === "TANQUE";
}