// =========================
// lib/events.js
// Bus de eventos en vivo (Server-Sent Events).
//
// Todas las mutaciones del sistema pasan por este servidor Express, así que
// él es la fuente de verdad de "algo cambió". Cada ruta de mutación llama
// emitEvent_(topic) tras escribir en Supabase, y todos los clientes
// conectados a GET /api/events reciben el aviso en <1s. El frontend
// (core/live.js) mapea cada topic a sus polls (pollNow) → la vista se
// refresca al instante en vez de esperar el siguiente intervalo.
//
// Topics: "asignaciones" | "ramal" | "incidencias" | "zonas" | "movilizador" | "config"
// =========================

import { invalidateByTopic_ } from "./poll-cache.js";

const _clients = new Set(); // Set<res>
let _nextId = 1;

/** Handler de GET /api/events — mantiene la conexión abierta (SSE). */
export function sseHandler_(req, res) {
  // setHeader (no writeHead) para que el middleware `compression` vea el
  // no-transform y NO bufferice/gzipee este stream.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // proxies (Render/nginx): no bufferizar
  res.flushHeaders?.();
  res.write(`retry: 5000\n\n`); // reconexión automática del EventSource

  _clients.add(res);

  // Heartbeat: mantiene viva la conexión a través de proxies (comentario SSE)
  const hb = setInterval(() => {
    try { res.write(`: hb\n\n`); } catch { /* cerrado */ }
  }, 25_000);

  req.on("close", () => {
    clearInterval(hb);
    _clients.delete(res);
  });
}

/**
 * emitEvent_ — notifica a todos los clientes conectados.
 * Nunca lanza: un cliente muerto se limpia y no afecta la respuesta HTTP.
 * @param {string} topic  dominio que cambió (ver lista arriba)
 * @param {object} [data] payload opcional (vin, id, accion…) para afinar el refresh
 */
export function emitEvent_(topic, data = {}) {
  // Antes del early-return: el micro-cache de polling tiene que caducar aunque
  // en este instante no haya nadie escuchando SSE. Si no, el primer cliente que
  // entre después de la mutación se llevaría la respuesta vieja del cache.
  invalidateByTopic_(topic);
  if (!_clients.size) return;
  const payload = `id: ${_nextId++}\ndata: ${JSON.stringify({ topic, ...data, ts: Date.now() })}\n\n`;
  for (const res of _clients) {
    try { res.write(payload); } catch { _clients.delete(res); }
  }
}

/** Nº de clientes conectados (para diagnósticos). */
export function sseClientCount_() {
  return _clients.size;
}
