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
 * `ajena` (la OT de CALIDAD del compañero) pierde el FIN: el cierre lo da quien
 * la registró. Se quita aquí además de no pintar el botón porque esta lista es
 * la que valida lo que llega por otras vías —el escaneo del VIN, un atajo— y
 * ahí no hay botón que esconder.
 */
export function allowedActionsByEstado(estado, { ajena = false } = {}) {
  const e = String(estado || "").toUpperCase();
  const sinCierre = (acc) => (ajena ? acc.filter(a => a !== "FIN") : acc);
  if (e === "SIN_INICIAR") return ["INICIO", "NOTA"];
  if (e === "TRABAJANDO") return sinCierre(["PAUSA", "FIN", "NOTA"]);
  if (e === "PAUSADO") return sinCierre(["REANUDAR", "FIN", "NOTA"]);
  if (e === "FINALIZADO") return ["NOTA"];
  return ["INICIO", "NOTA"];
}

export function shouldShowItemInCurrentModule_(it) {
  const rol = String(it?.rolTrabajo || "").toUpperCase();
  if (CORE.state.currentModule === "CALIDAD") return rol === "CALIDAD";
  if (CORE.state.currentModule === "RAMALERO") return rol === "RAMALERO";
  return rol === "MOTOR" || rol === "TANQUE";
}