// =========================
// public/js/views/supervisor/sup-stats.js
// STATS: Mediana + MAD + promedio ponderado (sin eliminar outliers)
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

// Peso suave: 1 cerca de la mediana, cae gradual en outliers (sin cortar)
export function weightByMad_(x, med, mad, k = 3.5) {
  const z = Math.abs(x - med) / (mad || 1);
  if (z <= k) return 1;
  const t = (z - k);
  return 1 / (1 + t * t);
}

/**
 * Promedio ponderado robusto usando Mediana+MAD (NO elimina outliers)
 * @param {number[]} arrMs - tiempos en ms
 * @param {number} k - umbral robusto (3.0–4.0 recomendado)
 */
export function avgWeightedByMedianMad_(arrMs, k = 3.5) {
  const vals = arrMs.filter((x) => Number.isFinite(x) && x > 0);

  if (!vals.length) {
    return { avgMs: 0, medianMs: 0, madMs: 0, used: 0, total: 0 };
  }

  if (vals.length < 3) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { avgMs: avg, medianMs: median_(vals), madMs: 0, used: vals.length, total: vals.length };
  }

  const med = median_(vals);
  const mad = mad_(vals, med) || 1;

  let sumW = 0;
  let sumWX = 0;
  let minW = 1, maxW = 0;

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
    minW,
    maxW
  };
}

export function fmtDur_(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${hh}h ${pad(mm)}m ${pad(ss)}s`;
}