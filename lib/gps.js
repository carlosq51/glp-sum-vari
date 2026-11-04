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
// La API no es nuestra (ngrok): responde un VIN por petición (si se mandan
// varios solo contesta el último, sin aviso), tarda 1-4 s y no tiene CORS. Por
// eso se consulta desde el servidor, en paralelo acotado y con cache
// compartido entre todos los celulares: diez movilizadores mirando la misma
// lista hacen UNA consulta por VIN cada GPS_CACHE_MS, no diez.
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
const TIMEOUT_MS = 15_000;
const CONCURRENCIA = 10;

// Si la API se cae (ngrok apagado), cada lista esperaría 15 s por VIN antes de
// rendirse. Tras FALLOS_CORTE fallos seguidos se deja de preguntar CORTE_MS.
const FALLOS_CORTE = 3;
const CORTE_MS = 60_000;
let _fallosSeguidos = 0;
let _cortadoHasta = 0;

/** vin → { at, val } — val es la posición o null (VIN sin escaneo). */
const _cache = new Map();
/** vin → Promise en vuelo, para no pedir dos veces el mismo VIN a la vez. */
const _enVuelo = new Map();

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

async function consultar_(vin) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${GPS_API_URL}?vins=${encodeURIComponent(vin)}`, {
      headers: { "ngrok-skip-browser-warning": "true", "Accept": "application/json" },
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`GPS ${resp.status}`);
    const j = await resp.json();
    const r = (j?.results || []).find(x => normVin_(x.vin) === vin);
    _fallosSeguidos = 0;
    return r ? limpiar_(r) : null;
  } catch (e) {
    if (++_fallosSeguidos >= FALLOS_CORTE) _cortadoHasta = Date.now() + CORTE_MS;
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Posición de un VIN. `undefined` = no se pudo saber (API caída); `null` = el
 * VIN no tiene ningún escaneo. La diferencia importa: "sin escaneo" es un
 * pendiente del movilizador, "no se pudo consultar" no.
 */
export async function gpsDeVin_(vinRaw, { fresh = false } = {}) {
  const vin = normVin_(vinRaw);
  if (!vin) return null;
  const c = _cache.get(vin);
  if (!fresh && c && Date.now() - c.at < GPS_CACHE_MS) return c.val;
  if (Date.now() < _cortadoHasta) return c ? c.val : undefined;
  if (_enVuelo.has(vin)) return _enVuelo.get(vin);

  const p = consultar_(vin)
    .then(val => { _cache.set(vin, { at: Date.now(), val }); return val; })
    // Con la API caída se sirve lo último que se supo, aunque esté vencido.
    .catch(() => (c ? c.val : undefined))
    .finally(() => _enVuelo.delete(vin));
  _enVuelo.set(vin, p);
  return p;
}

/**
 * Varios VINs, CONCURRENCIA a la vez. Devuelve { gps: {vin: pos|null},
 * sin_dato: [vins que no se pudieron consultar], caido }.
 */
export async function gpsDeVins_(vins, opts = {}) {
  const lista = [...new Set((vins || []).map(normVin_).filter(Boolean))];
  const gps = {};
  const sin_dato = [];
  let i = 0;
  const worker = async () => {
    while (i < lista.length) {
      const vin = lista[i++];
      const val = await gpsDeVin_(vin, opts);
      if (val === undefined) sin_dato.push(vin);
      else gps[vin] = val;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, lista.length) }, worker));
  return { gps, sin_dato, caido: Date.now() < _cortadoHasta };
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
