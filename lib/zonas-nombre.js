// =========================
// lib/zonas-nombre.js
// Qué números de zona son plazas y cómo se nombran.
//
// Plazas del mapa (una fila cada una en conversion_zonas):
//   · 1–15      las de siempre.
//   · 116–118   ZONAS DE EMERGENCIA E16, E17, E18 (2026-11-25). Están encima
//               de la Z15 y existen porque los carros desbordaban el taller.
//
// Por qué 116 y no 16: el 16 ya significa "Zona Libre" en el código, en
// zonas_historial y en el despacho. Se guarda 116 y se muestra "E16" — la
// cuenta es siempre id − 100, así que no hace falta tabla de traducción.
//
// Mismo contenido que public/js/core/zona-nombre.js (el cliente no puede
// importar de lib/). Si cambia uno, cambia el otro.
// =========================

export const ZONA_LIBRE = 16;
export const ZONAS_EMERGENCIA = [116, 117, 118];

/** ¿Es una plaza física del mapa (una fila de conversion_zonas)? */
export function esPlaza_(n) {
  n = Number(n);
  return (n >= 1 && n <= 15) || ZONAS_EMERGENCIA.includes(n);
}

export function esEmergencia_(n) {
  return ZONAS_EMERGENCIA.includes(Number(n));
}

/** "7" · "E16" — para frases tipo "ve a la zona …". */
export function etiquetaZona_(n) {
  if (n == null || n === "") return "";
  return esEmergencia_(n) ? `E${Number(n) - 100}` : String(n);
}

/** "Z7" · "E16" · "ZL" — el código corto de los chips. */
export function codigoZona_(n) {
  if (Number(n) === ZONA_LIBRE) return "ZL";
  return esEmergencia_(n) ? etiquetaZona_(n) : `Z${n}`;
}

/** "Zona 7" · "Zona E16" · "Zona Libre". */
export function nombreZona_(n) {
  if (Number(n) === ZONA_LIBRE) return "Zona Libre";
  return `Zona ${etiquetaZona_(n)}`;
}
