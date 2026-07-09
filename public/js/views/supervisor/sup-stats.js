// =========================
// public/js/views/supervisor/sup-stats.js
// STATS: mediana + MAD + prior contextual con fallback
// =========================

export function median_(arr) {
  const v = [...arr].sort((a, b) => a - b);
  const n = v.length;
  if (!n) return 0;
  const m = Math.floor(n / 2);
  return n % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function mad_(arr, med) {
  const devs = arr.map((x) => Math.abs(x - med));
  return median_(devs);
}

export function weightByMad_(x, med, mad, k = 2.5) {
  const scale = mad || 1;
  const z = Math.abs(x - med) / scale;

  if (z <= k) return 1;

  const t = z - k;
  return 1 / (1 + t * t);
}

export function normalizeTrack_(track) {
  const t = String(track || "").toUpperCase();
  if (t === "CALIDAD") return "CALIDAD";
  if (t === "RAMAL" || t === "RAMALERO") return "RAMAL";
  return "CONVERSION";
}

export function normalizeRol_(rol) {
  const r = String(rol || "").toUpperCase();

  if (r === "TANQUE" || r === "TANQUERO") return "TANQUE";
  if (r === "MOTOR") return "MOTOR";
  if (r === "RAMAL" || r === "RAMALERO") return "RAMAL";
  if (r === "CALIDAD") return "CALIDAD";
  if (r === "TECNICO" || r === "CONVERSION") return "MOTOR";

  return r || "UNKNOWN";
}

export function normalizeMarca_(marca) {
  const m = String(marca || "").trim().toUpperCase();
  return m || "ALL";
}

function validMs_(x) {
  return Number.isFinite(x) && x > 0;
}

/**
 * Construye estadísticas contextuales robustas desde items históricos.
 *
 * Cada bucket guarda:
 * - count
 * - medianMs
 * - madMs
 *
 * Claves creadas:
 * - track
 * - track|rol
 * - track|marca
 * - track|rol|marca
 * - global
 */
export function buildContextStats_(items, getDurationMs) {
  const buckets = new Map();

  function push_(key, ms) {
    if (!validMs_(ms)) return;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(ms);
  }

  for (const it of items || []) {
    const ms = Number(getDurationMs(it) || 0);
    if (!validMs_(ms)) continue;

    const track = normalizeTrack_(it.track || it.trackType || it.modulo || it.area || it._track);
    const rol = normalizeRol_(it.rol || it.rolTrabajo);
    const marca = normalizeMarca_(it.marca || it.brand);

    push_("GLOBAL", ms);
    push_(`T:${track}`, ms);
    push_(`T:${track}|R:${rol}`, ms);
    push_(`T:${track}|M:${marca}`, ms);
    push_(`T:${track}|R:${rol}|M:${marca}`, ms);
  }

  const statsMap = new Map();

  for (const [key, arr] of buckets.entries()) {
    const vals = arr.filter(validMs_);
    if (!vals.length) continue;

    const med = median_(vals);
    const mad = mad_(vals, med) || 1;

    statsMap.set(key, {
      key,
      count: vals.length,
      medianMs: med,
      madMs: mad,
    });
  }

  return statsMap;
}

/**
 * Busca un prior contextual con fallback.
 *
 * Orden de preferencia:
 * 1) track + rol + marca
 * 2) track + rol
 * 3) track + marca
 * 4) track
 * 5) global
 */
export function getContextPrior_(statsMap, ctx = {}, minCount = 4) {
  const track = normalizeTrack_(ctx.track);
  const rol = normalizeRol_(ctx.rol);
  const marca = normalizeMarca_(ctx.marca);

  const candidates = [
    { key: `T:${track}|R:${rol}|M:${marca}`, level: "track+rol+marca" },
    { key: `T:${track}|R:${rol}`, level: "track+rol" },
    { key: `T:${track}|M:${marca}`, level: "track+marca" },
    { key: `T:${track}`, level: "track" },
    { key: "GLOBAL", level: "global" },
  ];

  for (const c of candidates) {
    const found = statsMap?.get?.(c.key);
    if (found && Number(found.count || 0) >= minCount) {
      return {
        found: true,
        key: c.key,
        level: c.level,
        count: found.count,
        priorMs: found.medianMs,
        priorMadMs: found.madMs || 1,
      };
    }
  }

  const global = statsMap?.get?.("GLOBAL");
  if (global) {
    return {
      found: true,
      key: "GLOBAL",
      level: "global-fallback",
      count: global.count,
      priorMs: global.medianMs,
      priorMadMs: global.madMs || 1,
    };
  }

  return {
    found: false,
    key: "",
    level: "none",
    count: 0,
    priorMs: 0,
    priorMadMs: 1,
  };
}

/**
 * Promedio robusto local de una muestra.
 */
export function robustLocalAverage_(arrMs, k = 2.5) {
  const vals = (arrMs || []).filter(validMs_);

  if (!vals.length) {
    return {
      avgMs: 0,
      medianMs: 0,
      madMs: 0,
      used: 0,
      total: 0,
      sumW: 0,
      minW: 0,
      maxW: 0,
    };
  }

  if (vals.length < 3) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return {
      avgMs: avg,
      medianMs: median_(vals),
      madMs: 0,
      used: vals.length,
      total: vals.length,
      sumW: vals.length,
      minW: 1,
      maxW: 1,
    };
  }

  const med = median_(vals);
  const mad = mad_(vals, med) || 1;

  let sumW = 0;
  let sumWX = 0;
  let minW = Infinity;
  let maxW = -Infinity;

  for (const x of vals) {
    const w = weightByMad_(x, med, mad, k);
    sumW += w;
    sumWX += w * x;
    if (w < minW) minW = w;
    if (w > maxW) maxW = w;
  }

  const avgMs = sumW > 0 ? (sumWX / sumW) : med;

  return {
    avgMs,
    medianMs: med,
    madMs: mad,
    used: vals.length,
    total: vals.length,
    sumW,
    minW: Number.isFinite(minW) ? minW : 0,
    maxW: Number.isFinite(maxW) ? maxW : 0,
  };
}

/**
 * Estimación robusta con prior contextual.
 *
 * Mezcla:
 * - robusto local de la muestra filtrada actual
 * - prior contextual (mediana histórica)
 */
export function avgRobustWithContextPrior_(arrMs, contextPrior, opts = {}) {
  const {
    k = 2.5,
    priorWeight = 6,
  } = opts;

  const local = robustLocalAverage_(arrMs, k);

  const priorMs = Number(contextPrior?.priorMs || 0);
  const hasPrior = Number.isFinite(priorMs) && priorMs > 0;

  if (!hasPrior) {
    return {
      ...local,
      rawRobustMs: local.avgMs,
      priorMs: 0,
      priorWeight: 0,
      priorLevel: "none",
      priorCount: 0,
      source: "local-only",
    };
  }

  // Si hay muy pocos datos locales, que el prior pese más
  const effectivePriorWeight =
    local.used >= 12 ? Math.max(2, priorWeight * 0.45) :
    local.used >= 8  ? Math.max(3, priorWeight * 0.65) :
    local.used >= 4  ? Math.max(4, priorWeight * 0.85) :
                       Math.max(6, priorWeight * 1.25);

  const avgMs =
    ((local.avgMs * (local.sumW || local.used || 1)) + (priorMs * effectivePriorWeight)) /
    ((local.sumW || local.used || 1) + effectivePriorWeight);

  return {
    ...local,
    avgMs,
    rawRobustMs: local.avgMs,
    priorMs,
    priorWeight: effectivePriorWeight,
    priorLevel: contextPrior?.level || "unknown",
    priorCount: Number(contextPrior?.count || 0),
    priorKey: contextPrior?.key || "",
    source: "local+context-prior",
  };
}
