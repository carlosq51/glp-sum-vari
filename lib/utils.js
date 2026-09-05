// Perú es UTC-5 fijo, sin horario de verano. Se usa Intl y no un offset a mano
// para que el día siga siendo correcto si eso alguna vez cambia.
const TZ_PERU = "America/Lima";

/**
 * fechaPeruMenosDias_ — "YYYY-MM-DD" de hace N días en hora Perú.
 *
 * Se resta sobre la fecha CIVIL peruana, no sobre el instante UTC: a las 21:00
 * de Lima ya es el día siguiente en UTC, y restar ahí correría la ventana un
 * día entero cada tarde.
 */
export function fechaPeruMenosDias_(dias, ahora = new Date()) {
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_PERU, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(ahora); // en-CA da directamente YYYY-MM-DD

  const [a, m, d] = hoy.split("-").map(Number);
  // Date.UTC normaliza el desbordamiento de mes y año (y los bisiestos).
  const corte = new Date(Date.UTC(a, m - 1, d - Math.max(0, Number(dias) || 0)));
  return corte.toISOString().slice(0, 10);
}

// OT válida: contiene '#' (ej: #7213) o es puramente numérica (ej: 7213).
export function isValidOT_(ot) {
  if (!ot) return false;
  const s = String(ot).trim();
  if (!s) return false;
  if (s.includes("#")) return true;
  if (/^\d+$/.test(s)) return true;
  return false;
}

export function normalizeModelo_(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase().replace(/,/g, ".").replace(/\s+/g, " ");
  if (/X70/.test(s) || /^JETOUR\s+(MEC|AUT|FULL|DELUXE|CONFORT)/.test(s)) return "Jetour X70";
  if (/NEW\s+V3|\bV3\b/.test(s)) return "KYC V3";
  if (/NEW\s+V5|\bV5\b/.test(s)) return "KYC V5";
  if (/NEW\s+V7|\bV7\b/.test(s)) return "KYC V7";
  if (/NEW\s+X5|\bX5\b/.test(s)) return "KYC X5";
  if (/\bT3\b/.test(s)) return "KYC T3";
  if (/TERA/.test(s)) return "VW Tera";
  if (/SAVEIRO/.test(s)) return "VW Saveiro";
  return null;
}

// ─── Estado de la OT a partir del estado de su asignación ─────────────────────

/**
 * Tipos de OT que llevan UNA sola asignación, y cuyo estado_general es por
 * tanto el de esa asignación. CONVERSION no está aquí a propósito: espera a
 * MOTOR *y* TANQUE, y esa regla vive en su propio sitio.
 */
export const OT_DE_UN_SOLO_ROL = ["CALIDAD", "RAMALERO"];

/** ¿Es una OT cuyo estado se decide con una sola asignación? */
export function esOtDeUnSoloRol_(tipoOt, rolTrabajo) {
  const t = String(tipoOt || "").toUpperCase();
  // El rol tiene que coincidir con el tipo: una asignación de CALIDAD sobre una
  // OT de RAMALERO no decide el estado de esa OT.
  return OT_DE_UN_SOLO_ROL.includes(t) && String(rolTrabajo || "").toUpperCase() === t;
}

/**
 * estadoGeneralDeAsignacion_ — traduce el estado de UNA asignación al
 * estado_general de su work_order.
 *
 * Existe como función aparte porque su ausencia costó 695 OTs de ramalero
 * dadas por vivas con el trabajo terminado: la rama que cerraba las OTs solo
 * contemplaba CONVERSION y CALIDAD, y RAMALERO se quedaba en el "PENDIENTE"
 * del alta para siempre.
 *
 * TRABAJANDO cuenta como EN PROCESO: es el estado que emiten de verdad las
 * asignaciones. La versión anterior solo miraba el literal "EN PROCESO", que
 * no lo escribe nadie, así que una OT en curso figuraba como PENDIENTE.
 */
export function estadoGeneralDeAsignacion_(estadoAsignacion) {
  const est = String(estadoAsignacion || "").toUpperCase();
  if (est === "FINALIZADO") return "FINALIZADO";
  if (est === "PAUSADO" || est === "TRABAJANDO" || est === "EN PROCESO") return "EN PROCESO";
  return "PENDIENTE";
}
