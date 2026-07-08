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
