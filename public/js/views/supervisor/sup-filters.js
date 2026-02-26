// =========================
// public/js/views/supervisor/sup-filters.js
// FILTERS: finalizado, marca/vin family, duraciones
// =========================

export function parseTimeMs_(x) {
  const t = Date.parse(String(x || ""));
  return Number.isFinite(t) ? t : 0;
}

export function durationMsFromItem_(it) {
  const ms = Number(it?.tiempo_ms ?? 0);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

export function isFinalizado_(estadoRaw) {
  const e = String(estadoRaw || "").trim().toUpperCase();
  return e === "FINALIZADO" || e === "FIN" || e === "COMPLETADO";
}

export function vinFamily_(vinRaw) {
  const v = String(vinRaw || "").toUpperCase();
  if (!v) return "JETOUR";
  if (v.includes("TE")) return "KYC";
  if (v.includes("TT")) return "VW";
  return "JETOUR";
}

export function matchMarca_(it, marcaSel) {
  const sel = String(marcaSel || "ALL").toUpperCase();
  if (!sel || sel === "ALL") return true;

  const rol = String(it.rol || it.rolTrabajo || "").toUpperCase();
  const isRamal = rol === "RAMALERO" || rol === "RAMAL";
  if (isRamal) return true;

  const fam = vinFamily_(it.vin);
  return (sel === fam);
}