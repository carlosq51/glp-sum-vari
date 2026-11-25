// =========================
// public/js/core/zona-nombre.js
// Qué números de zona son plazas y cómo se nombran (copia de lib/zonas-nombre.js,
// que el navegador no puede importar). Si cambia uno, cambia el otro.
//
//   · 1–15      plazas de siempre.
//   · 116–118   zonas de emergencia E16, E17, E18, encima de la Z15. Se guardan
//               como 116 porque el 16 ya es "Zona Libre"; se muestran id − 100.
// =========================

export const ZONA_LIBRE = 16;
export const ZONAS_EMERGENCIA = [116, 117, 118];

export function esPlaza_(n) {
  n = Number(n);
  return (n >= 1 && n <= 15) || ZONAS_EMERGENCIA.includes(n);
}

export function esEmergencia_(n) {
  return ZONAS_EMERGENCIA.includes(Number(n));
}

/** "7" · "E16" */
export function etiquetaZona_(n) {
  if (n == null || n === "") return "";
  return esEmergencia_(n) ? `E${Number(n) - 100}` : String(n);
}

/** "Z7" · "E16" · "ZL" */
export function codigoZona_(n) {
  if (Number(n) === ZONA_LIBRE) return "ZL";
  return esEmergencia_(n) ? etiquetaZona_(n) : `Z${n}`;
}

/** "Zona 7" · "Zona E16" · "Zona Libre" */
export function nombreZona_(n) {
  if (Number(n) === ZONA_LIBRE) return "Zona Libre";
  return `Zona ${etiquetaZona_(n)}`;
}
