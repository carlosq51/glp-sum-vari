// =========================
// lib/poll-cache.js
// Micro-cache compartido para los endpoints de POLLING.
//
// Por qué existe: /api/movilizador/status y /api/ots/vivas arman su respuesta
// con varias consultas pesadas a Supabase (cientos de KB). Cada dispositivo
// con la vista abierta las repetía enteras en cada ciclo de poll — N pantallas
// del taller = N veces el mismo tráfico, y el egress del plan se consumía en
// días. Con este cache, todos los clientes de un mismo ciclo se sirven de UNA
// sola pasada a la base.
//
// Lo que lo hace seguro: la invalidación NO depende del TTL. Toda mutación del
// sistema pasa por emitEvent_ (lib/events.js), que borra aquí las entradas del
// topic que cambió. El TTL solo cubre lo que cambia sin pasar por este
// servidor (escrituras desde Apps Script, edición manual en Supabase).
//
// Consecuencia práctica: un traslado registrado por el movilizador se ve al
// instante en las demás pantallas — el evento invalida el cache y el SSE
// dispara el refresh. El TTL nunca retrasa un cambio propio.
// =========================

const _store    = new Map(); // key → { topics: Set<string>, ts, value }
const _inflight = new Map(); // key → { promise, gen, topics: Set<string> }
const _gen      = new Map(); // key → nº de invalidaciones vistas

/**
 * cachedByTopics_ — devuelve el valor cacheado o lo produce.
 *
 * Coalesce de peticiones simultáneas: las pantallas del taller refrescan casi
 * a la vez (el SSE las despierta a todas con el mismo evento). Sin esto, N
 * clientes que llegan mientras la primera lectura sigue en vuelo lanzarían N
 * lecturas idénticas y el cache no ahorraría nada justo cuando más hace falta.
 *
 * @param {string}   key       identificador de la entrada (único por endpoint)
 * @param {string[]} topics    topics de emitEvent_ que la invalidan
 * @param {number}   ttlMs     vida máxima aunque nadie emita evento
 * @param {Function} producer  async () => valor a cachear
 * @param {object}   [opts]
 * @param {boolean}  [opts.bypass]  ignorar la entrada vigente y releer de la
 *   base, guardando el resultado. Es lo que hace el botón "↻ Actualizar": el
 *   usuario que duda de lo que ve tiene que poder forzar la lectura real, o el
 *   cache pasa de ahorro a fuente de desconfianza.
 */
export async function cachedByTopics_(key, topics, ttlMs, producer, { bypass = false } = {}) {
  if (!bypass) {
    const hit = _store.get(key);
    if (hit && (Date.now() - hit.ts) < ttlMs) return hit.value;

    // Ya hay una lectura en vuelo para esta clave: engancharse a ella, salvo
    // que haya nacido antes de una invalidación — ese resultado ya no sirve y
    // quien llega ahora merece la lectura nueva.
    const flying = _inflight.get(key);
    if (flying && flying.gen === (_gen.get(key) || 0)) return flying.promise;
  }

  const gen = _gen.get(key) || 0;
  const promise = (async () => {
    const value = await producer();
    // Si alguien invalidó MIENTRAS leíamos, el valor ya nació viejo: se
    // devuelve a quien lo pidió, pero no se guarda. Cachearlo dejaría la
    // mutación invisible hasta que venza el TTL.
    if ((_gen.get(key) || 0) === gen) {
      _store.set(key, { topics: new Set(topics), ts: Date.now(), value });
    }
    return value;
  })();

  _inflight.set(key, { promise, gen, topics: new Set(topics) });
  try {
    return await promise;
  } finally {
    if (_inflight.get(key)?.promise === promise) _inflight.delete(key);
  }
}

/** Borra toda entrada declarada sensible a ese topic. La llama emitEvent_. */
export function invalidateByTopic_(topic) {
  if (!topic) return;

  const tocadas = new Set();
  for (const [key, entry] of _store) {
    if (entry.topics.has(topic)) { _store.delete(key); tocadas.add(key); }
  }
  // También las lecturas EN VUELO, que todavía no están en _store: si la
  // mutación ocurre mientras se lee, ese resultado ya nació viejo. Al subir su
  // generación, la comprobación de cachedByTopics_ lo entrega a quien lo pidió
  // pero no lo guarda — y el siguiente cliente relee.
  for (const [key, flying] of _inflight) {
    if (flying.topics.has(topic)) tocadas.add(key);
  }

  for (const key of tocadas) _gen.set(key, (_gen.get(key) || 0) + 1);
}

/** Vacía el cache entero (tests, diagnósticos). */
export function clearPollCache_() {
  _store.clear();
  _inflight.clear();
  _gen.clear();
}
