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
