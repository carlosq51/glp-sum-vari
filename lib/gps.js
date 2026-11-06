// =========================
// lib/gps.js — última posición GPS de un VIN (API de escaneos del patio)
//
// Dos ubicaciones distintas conviven en GLP y NO se mezclan:
//   · ESUM (`vins.ultima_ubicacion`, la escribe Apps Script): ubicación
//     ADMINISTRATIVA, a qué proceso o área está asignado el carro. La controla
//     la oficina.
//   · GPS (esta API): dónde está FÍSICAMENTE, según el último escaneo con la
//     app móvil. La registra el movilizador y es la que usa para encontrarlo.
//
// La API no es nuestra (ngrok) y no tiene CORS: se consulta desde el
// servidor, con cache compartido entre todos los celulares (diez
// movilizadores mirando la misma lista hacen UNA consulta por VIN cada
// GPS_CACHE_MS, no diez).
//
// Desde el 2026-11-06 acepta hasta 50 VINs por petición (`?vins=A&vins=B…`,
// el parámetro repetido) y responde { results, not_found }: cada VIN enviado
// sale en uno de los dos. Un bloque de 50 tarda ~4 s, lo mismo que antes
// costaba UN solo VIN; por eso la cola de abajo junta lo pendiente en bloques
// y los pide uno tras otro, como indica quien administra la API.
// =========================

const GPS_API_URL = process.env.GPS_API_URL
  || "https://mocker-cheese-surround.ngrok-free.dev/cortes-api/tools/vehiculos/ubicacion-gps";

// La app de registro (ajena, Next.js en Vercel). No tiene endpoint de escritura
// documentado: se escribe contra su API interna `/api/scans/save`, la misma que
// usa su propio frontend. El `usuario` viaja como texto plano (no hay token),
// así que GLP manda el nombre real de quien registra. FRÁGIL A PROPÓSITO: si el
// dueño cambia la app esto se rompe; se eligió a sabiendas (ver memoria).
const GPS_APP_URL = (process.env.GPS_APP_URL || "https://gps-ubicaciones-app.vercel.app").replace(/\/+$/, "");

/** Cuánto vale una posición leída. No es seguimiento en vivo: cambia solo al escanear. */
const GPS_CACHE_MS = Number(process.env.GPS_CACHE_MS) || 5 * 60_000;
const TIMEOUT_MS = 20_000;
/** Un bloque de 50 tarda 2-4 s, pero varía con la carga del servidor de la API. */
const TIMEOUT_LOTE_MS = 45_000;
/** Máximo de la API: con 51 responde 422. Cuenta repetidos y vacíos, por eso se limpian antes. */
const LOTE_MAX = 50;
/**
 * Bloques en vuelo a la vez: uno tras otro, como indica la API. Antes (de a
 * un VIN) se aprendió que la API atiende en serie: 10 a la vez tardaban ~33 s
 * cada una y vencían todas. No subir sin medir.
 */
const EN_VUELO = 1;
/**
 * Cuánto espera una lista los VINs que no tiene en cache antes de responder
 * con lo que haya. Caben dos bloques holgados; lo que no llegue sale en
 * `pendientes` y el celular vuelve a preguntar.
 */
const ESPERA_LISTA_MS = 9_000;

// Si la API se cae (ngrok apagado) se deja de preguntar CORTE_MS tras
// FALLOS_CORTE bloques fallidos seguidos; la cola se pausa en vez de vaciarse.
const FALLOS_CORTE = 3;
const CORTE_MS = 30_000;
let _fallosSeguidos = 0;
let _cortadoHasta = 0;

/** vin → { at, val } — val es la posición o null (VIN sin escaneo). */
const _cache = new Map();

export function normVin_(v) {
  return String(v || "").trim().toUpperCase();
}

/** Lo que devuelve la API, recortado a lo que usa GLP. */
function limpiar_(r) {
  return {
    zona: r.zona || null,
    fila: r.numero_fila != null && r.numero_fila !== "" ? String(r.numero_fila) : null,
    lat: typeof r.latitude === "number" ? r.latitude : null,
    lng: typeof r.longitude === "number" ? r.longitude : null,
    maps_url: r.maps_url || null,
    scanned_at: r.scanned_at || null,
  };
}

/**
 * Un bloque de hasta LOTE_MAX VINs (ya normalizados y sin repetir).
 * Devuelve Map vin → posición | null (null = la API dice que no tiene
 * escaneos). Un VIN que no sale ni en `results` ni en `not_found` NO entra al
 * Map: no se sabe nada de él y no se debe guardar como "Sin GPS".
 */
async function consultarLote_(vins) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_LOTE_MS);
  try {
    const qs = vins.map(v => `vins=${encodeURIComponent(v)}`).join("&");
    const resp = await fetch(`${GPS_API_URL}?${qs}`, {
      headers: { "ngrok-skip-browser-warning": "true", "Accept": "application/json" },
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      // 502 de ngrok trae una página HTML: no vale la pena loguearla.
      const txt = await resp.text().catch(() => "");
      throw new Error(`GPS ${resp.status}${txt && !txt.trimStart().startsWith("<") ? `: ${txt.slice(0, 160)}` : ""}`);
    }
    const j = await resp.json();
    const out = new Map();
    for (const r of j?.results || []) {
      const vin = normVin_(r?.vin);
      if (vin) out.set(vin, limpiar_(r));
    }
    for (const v of j?.not_found || []) {
      const vin = normVin_(v);
      if (vin && !out.has(vin)) out.set(vin, null);
    }
    const faltan = vins.filter(v => !out.has(v));
    if (faltan.length) {
      // No debería pasar: algún punto del camino no reenvió los `vins` repetidos.
      console.warn(`[GPS] ${faltan.length} de ${vins.length} VINs sin respuesta (ni results ni not_found), ej. ${faltan[0]}`);
    }
    _fallosSeguidos = 0;
    return out;
  } catch (e) {
    if (++_fallosSeguidos >= FALLOS_CORTE && Date.now() >= _cortadoHasta) {
      _cortadoHasta = Date.now() + CORTE_MS;
      console.warn(`[GPS] ${_fallosSeguidos} bloques fallidos seguidos (último: ${e?.name === "AbortError" ? "tiempo límite" : e?.message}); pausa ${CORTE_MS / 1000} s`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// ─── Cola de consultas ────────────────────────────────────────────────
//
// Un VIN entra una sola vez aunque lo pidan diez celulares. Lo que se encola
// en el mismo momento (una lista entera) sale junto en bloques de LOTE_MAX.
// Los urgentes ("acabo de registrar este carro") se ponen adelante y van en
// el próximo bloque.

/** VINs esperando turno, en orden. */
const _cola = [];
/** vin → [resolve] de quienes esperan su resultado. Está aquí = encolado o en vuelo. */
const _esperas = new Map();
let _activos = 0;

function encolar_(vin, urgente = false) {
  if (!_esperas.has(vin)) {
    _esperas.set(vin, []);
    if (urgente) _cola.unshift(vin); else _cola.push(vin);
  } else if (urgente) {
    const i = _cola.indexOf(vin);
    if (i > 0) { _cola.splice(i, 1); _cola.unshift(vin); }
  }
  programar_();
}

/** Resultado de un VIN cuando le toque. `undefined` = no se pudo consultar. */
function esperar_(vin, urgente = false) {
  return new Promise(resolve => {
    encolar_(vin, urgente);
    _esperas.get(vin).push(resolve);
  });
}

// El bombeo va al final del turno: así los 40 VINs de una lista, que se
// encolan uno por uno en el mismo bucle, salen en UN bloque y no en 40.
let _programado = false;
function programar_() {
  if (_programado) return;
  _programado = true;
  setImmediate(() => { _programado = false; bombear_(); });
}

let _reintento = null;
function bombear_() {
  while (_activos < EN_VUELO && _cola.length) {
    if (Date.now() < _cortadoHasta) {
      // API caída: la cola espera a que termine el corte, no se descarta.
      if (!_reintento) {
        _reintento = setTimeout(() => { _reintento = null; bombear_(); }, _cortadoHasta - Date.now() + 50);
        _reintento.unref?.();
      }
      return;
    }
    const lote = _cola.splice(0, LOTE_MAX);
    _activos++;
    consultarLote_(lote)
      .then(vals => {
        const at = Date.now();
        for (const [vin, val] of vals) _cache.set(vin, { at, val });
        return vals;
      })
      .catch(() => new Map())
      .then(vals => {
        for (const vin of lote) {
          // Sin respuesta (API caída, o un VIN que no volvió): lo último que
          // se supo, aunque esté vencido; si no hay nada, undefined.
          const val = vals.has(vin) ? vals.get(vin) : _cache.get(vin)?.val;
          const ws = _esperas.get(vin) || [];
          _esperas.delete(vin);
          ws.forEach(fn => fn(val));
        }
      })
      .finally(() => { _activos--; bombear_(); });
  }
}

const dormir_ = ms => new Promise(r => { const t = setTimeout(r, ms); t.unref?.(); });

/**
 * Varios VINs. Lo que está en cache sale al instante (aunque esté vencido,
 * mientras se refresca por detrás); lo que no, se espera hasta
 * ESPERA_LISTA_MS y lo que no alcance queda en `pendientes`.
 *
 * Devuelve { gps: {vin: pos|null}, pendientes: [vins aún sin dato], caido }.
 * El celular vuelve a preguntar por los `pendientes` en unos segundos.
 *
 * Con `fresh` (pocos VINs: "acabo de registrar") se salta el cache, se espera
 * hasta 25 s y esos VINs pasan delante de la cola.
 */
export async function gpsDeVins_(vins, { fresh = false } = {}) {
  const lista = [...new Set((vins || []).map(normVin_).filter(Boolean))];
  const gps = {};
  const pendientes = [];
  const ahora = Date.now();

  const esperarVarios_ = async (vs, ms, urgente) => {
    const limite = dormir_(ms).then(() => undefined);
    const vals = await Promise.all(vs.map(v => Promise.race([esperar_(v, urgente), limite])));
    vs.forEach((v, i) => {
      const val = vals[i] !== undefined ? vals[i] : _cache.get(v)?.val;
      if (val !== undefined) gps[v] = val; else pendientes.push(v);
    });
  };

  if (fresh) {
    await esperarVarios_(lista, 25_000, true);
  } else {
    const sinCache = [];
    for (const vin of lista) {
      const c = _cache.get(vin);
      if (!c) { sinCache.push(vin); continue; }
      gps[vin] = c.val;
      if (ahora - c.at >= GPS_CACHE_MS) encolar_(vin);
    }
    if (sinCache.length) {
      if (Date.now() < _cortadoHasta) {
        // API cortada: no tiene sentido esperar; quedan en cola para cuando vuelva.
        sinCache.forEach(v => encolar_(v));
        pendientes.push(...sinCache);
      } else {
        await esperarVarios_(sinCache, ESPERA_LISTA_MS, false);
      }
    }
  }
  return { gps, pendientes, sin_dato: pendientes, caido: Date.now() < _cortadoHasta };
}

/** Borra un VIN del cache: tras registrar, la próxima lectura va a la API. */
export function olvidarGps_(vinRaw) {
  _cache.delete(normVin_(vinRaw));
}

/**
 * registrarGps_ — guarda la posición de un VIN en la app de escaneos.
 *
 * Dos modos, como en la app original:
 *   · GPS: { lat, lng, acc } numéricos → la app calcula la zona por la posición.
 *   · Manual: { zonaManual } ("ISLA 20 - 3") → sin coordenadas, para bajo techo
 *     donde el GPS no agarra.
 *
 * Devuelve { ok, zona, raw }. `zona` es la que resolvió la app (puede diferir
 * de la pedida en manual, o venir de la posición en GPS). Deja el cache de ese
 * VIN optimista para que el ✓ salga al instante; la próxima lectura real lo
 * corrige.
 */
export async function registrarGps_(vinRaw, { lat, lng, acc, zonaManual, usuario } = {}) {
  const vin = normVin_(vinRaw);
  if (!vin) throw new Error("Falta VIN");
  const manual = zonaManual != null && String(zonaManual).trim() !== "";
  const body = manual
    ? { qr: vin, lat: "", lng: "", acc: "", zonaManual: String(zonaManual).trim(), usuario: usuario || "" }
    : { qr: vin, lat: Number(lat), lng: Number(lng), acc: acc == null ? "" : Number(acc), usuario: usuario || "" };

  if (!manual && (!Number.isFinite(body.lat) || !Number.isFinite(body.lng))) {
    throw new Error("Posición inválida: faltan lat/lng");
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let raw;
  try {
    const resp = await fetch(`${GPS_APP_URL}/api/scans/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const txt = await resp.text();
    try { raw = JSON.parse(txt); } catch { raw = { _text: txt }; }
    if (!resp.ok) throw new Error(raw?.error || `No se pudo registrar (HTTP ${resp.status})`);
  } finally {
    clearTimeout(t);
  }

  const zona = raw?.zona || (manual ? String(zonaManual).trim() : null);
  // Optimista: dejar el cache con lo que acabamos de escribir, para que la
  // vista muestre la posición sin esperar a que la API de lectura la refleje.
  _cache.set(vin, {
    at: Date.now(),
    val: {
      zona: zona || null,
      fila: null,
      lat: manual ? null : body.lat,
      lng: manual ? null : body.lng,
      maps_url: manual ? null : `https://maps.google.com/?q=${body.lat},${body.lng}`,
      scanned_at: new Date().toISOString(),
    },
  });
  return { ok: true, zona: zona || null, raw };
}

/** Lista de zonas de la app, para el modo manual. Cache simple en memoria. */
let _zonasCache = { at: 0, val: null };
export async function zonasApp_() {
  if (_zonasCache.val && Date.now() - _zonasCache.at < 10 * 60_000) return _zonasCache.val;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${GPS_APP_URL}/api/zones`, {
      headers: { "Accept": "application/json" }, signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`zones HTTP ${resp.status}`);
    const j = await resp.json();
    const zonas = (j?.zonas || []).map(z => z?.nombre).filter(Boolean);
    _zonasCache = { at: Date.now(), val: zonas };
    return zonas;
  } catch {
    return _zonasCache.val || [];
  } finally {
    clearTimeout(t);
  }
}

// Para que el cache no crezca sin fin con VINs que ya salieron.
setInterval(() => {
  const lim = Date.now() - 6 * GPS_CACHE_MS;
  for (const [k, v] of _cache) if (v.at < lim) _cache.delete(k);
}, 10 * 60_000).unref?.();
