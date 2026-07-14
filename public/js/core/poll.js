// =========================
// public/js/core/poll.js
// Polling adaptativo — reemplaza los setInterval dispersos de las vistas.
//
// Diferencias vs setInterval crudo:
//   • El intervalo viene de cfg(key) y se relee en CADA ciclo → el Admin
//     puede cambiarlo en app_config y aplica en vivo, sin redeploy.
//   • Se PAUSA cuando la app está en background (document.hidden) — antes
//     los timers seguían quemando batería y datos del técnico toda la noche.
//   • Al volver a primer plano ejecuta de inmediato si el tick estaba vencido.
//   • pollNow(key) fuerza un tick (lo usa el cliente SSE para refrescar
//     una vista al instante cuando el servidor emite un evento).
// =========================

import { cfg } from "./config.js";

const _polls = new Map(); // key → { fn, cfgKey, timer, lastRun, stopped, pending }

function _interval(p) {
  return Math.max(1000, Number(cfg(p.cfgKey)) || 60_000);
}

function _schedule(p, key) {
  clearTimeout(p.timer);
  if (p.stopped) return;
  p.timer = setTimeout(() => _tick(key), _interval(p));
}

async function _tick(key) {
  const p = _polls.get(key);
  if (!p || p.stopped) return;
  if (document.hidden) { p.pending = true; return; } // pausa en background
  p.pending = false;
  p.lastRun = Date.now();
  try { await p.fn(); } catch { /* el poll nunca rompe la vista */ }
  _schedule(p, key);
}

/**
 * startPoll — registra un poll gobernado por una clave de config.
 * @param {string} key         identificador del poll (normalmente la clave de config)
 * @param {Function} fn        callback (sync o async)
 * @param {boolean} immediate  ejecutar ya además de programar (default true)
 * @param {string} [cfgKey]    clave de config si difiere del identificador
 *                             (ej. varias instancias del mismo mapa: key único
 *                             por contenedor, cfgKey compartida)
 * @returns {() => void}       stop()
 */
export function startPoll(key, fn, { immediate = true, cfgKey = key } = {}) {
  stopPoll(key); // idempotente: re-entrar a una vista no duplica timers
  const p = { fn, cfgKey, timer: null, lastRun: 0, stopped: false, pending: false };
  _polls.set(key, p);
  if (immediate) _tick(key); else _schedule(p, key);
  return () => stopPoll(key);
}

/** Detiene un poll por clave (no falla si no existe). */
export function stopPoll(key) {
  const p = _polls.get(key);
  if (!p) return;
  p.stopped = true;
  clearTimeout(p.timer);
  _polls.delete(key);
}

/** Fuerza un tick inmediato (SSE, eventos de dominio, pull-to-refresh). */
export function pollNow(key) {
  const p = _polls.get(key);
  if (p && !p.stopped) _tick(key);
}

/**
 * Fuerza el tick de TODOS los polls activos con esa clave de config
 * (cubre instancias múltiples, ej. "POLL_ZONAS_MAPA_MS:contenedor").
 * Si la vista no está abierta no hay poll registrado → no-op.
 */
export function pollNowByCfg(cfgKey) {
  for (const [key, p] of _polls) {
    if (!p.stopped && p.cfgKey === cfgKey) _tick(key);
  }
}

// Al volver a primer plano: ejecutar de inmediato los ticks vencidos o pendientes
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  for (const [key, p] of _polls) {
    if (p.stopped) continue;
    const overdue = (Date.now() - p.lastRun) >= _interval(p);
    if (p.pending || overdue) _tick(key);
    else _schedule(p, key);
  }
});
