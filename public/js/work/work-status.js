// =========================
// public/js/work/work-status.js
// Estados de trabajo: finalizado, acciones permitidas, filtro por módulo
// =========================

import { CORE } from "../core/state.js";

export function isFinalizado_(it) {
  return String(it?.estado || "").toUpperCase() === "FINALIZADO";
}

export function allowedActionsByEstado(estado) {
  const e = String(estado || "").toUpperCase();
  if (e === "SIN_INICIAR") return ["INICIO", "NOTA"];
  if (e === "TRABAJANDO") return ["PAUSA", "FIN", "NOTA"];
  if (e === "PAUSADO") return ["REANUDAR", "FIN", "NOTA"];
  if (e === "FINALIZADO") return ["NOTA"];
  return ["INICIO", "NOTA"];
}

export function shouldShowItemInCurrentModule_(it) {
  const rol = String(it?.rolTrabajo || "").toUpperCase();
  if (CORE.state.currentModule === "CALIDAD") return rol === "CALIDAD";
  if (CORE.state.currentModule === "RAMALERO") return rol === "RAMALERO";
  return rol === "MOTOR" || rol === "TANQUE";
}