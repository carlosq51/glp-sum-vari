// =========================
// public/js/core/live.js
// Cliente de eventos en vivo (SSE) — el "sistema nervioso" del frontend.
//
// Se conecta a GET /api/events. Cuando el servidor emite un topic
// (una mutación real ocurrió), esto:
//   1. dispara pollNow() de los polls asociados → la vista activa se
//      refresca en <1s (el poll periódico queda como heartbeat de respaldo)
//   2. re-emite el evento como CustomEvent "glp:live" para vistas que
//      quieran reaccionar de forma más fina (badges, banners, animaciones)
//
// EventSource reconecta solo (retry: 5000 del servidor) y el navegador lo
// pausa/reanuda con el ciclo de vida de la página — cero mantenimiento.
// =========================

import { pollNowByCfg } from "./poll.js";
import { loadConfig } from "./config.js";

// Topic del servidor → claves de config de los polls que deben refrescarse ya.
// (pollNowByCfg solo dispara los que estén ACTIVOS — vista abierta.)
const TOPIC_TO_POLLS = {
  asignaciones: ["POLL_SUP_LIVE_MS", "POLL_SUP_OT_CONTROL_MS", "POLL_ZONAS_MAPA_MS", "POLL_MOVILIZADOR_MS", "POLL_COLA_BADGE_MS", "POLL_VIN_READY_MS", "POLL_PAIR_SUGGEST_MS"],
  ramal:        ["POLL_RAMAL_LISTO_MS", "POLL_COLA_POSICION_MS", "POLL_RAMALERO_SOL_MS"],
  zonas:        ["POLL_ZONAS_MAPA_MS"],
  movilizador:  ["POLL_MOVILIZADOR_MS", "POLL_ZONAS_MAPA_MS"],
  work_orders:  ["POLL_SUP_OT_CONTROL_MS", "POLL_SUP_LIVE_MS"],
  incidencias:  [],  // las vistas de incidencias escuchan "glp:live" directamente
  config:       [],  // manejado abajo: recarga la config
};

let _es = null;

/** Conecta el stream de eventos (idempotente — una sola conexión). */
export function initLive() {
  if (_es || typeof EventSource === "undefined") return;
  try {
    _es = new EventSource("/api/events");

    _es.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      const topic = msg?.topic;
      if (!topic) return;

      // Config cambió desde Admin → re-sincronizar sin esperar re-login
      if (topic === "config") { loadConfig(); return; }

      for (const cfgKey of (TOPIC_TO_POLLS[topic] || [])) pollNowByCfg(cfgKey);

      // Canal fino para las vistas (badges, banners, sonidos…)
      window.dispatchEvent(new CustomEvent("glp:live", { detail: msg }));
    };

    _es.onerror = () => { /* EventSource reintenta solo (retry del servidor) */ };
  } catch { /* navegador sin SSE → los polls siguen funcionando igual */ }
}

/** Cierra el stream (logout). */
export function stopLive() {
  try { _es?.close(); } catch { /* ya cerrado */ }
  _es = null;
}
