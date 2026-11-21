// =========================
// lib/esum.js — zona ACTUAL de un VIN en eSUM, consultada al momento
//
// Para qué existe: `vins.ultima_ubicacion` NO es la zona actual. Es la zona
// que tenía el carro en eSUM justo antes de entrar a GLP, la que Apps Script
// (REPORTE_PRINCIPAL, enrichActualizarEsum_) guarda para devolverlo ahí al
// terminar. Es el "destino" de Salida.
//
// Los carros trabajados de forma extraordinaria (convertidos antes de que
// empezara su proceso eSUM) no estaban en eSUM al entrar, así que no tienen
// destino. La regla (Carlos, 2026-11-21):
//   terminado + sin destino → se pide a eSUM la zona de ahora:
//     · dice INGRESO → se muestra (vuelve a quien lo trajo, VARI)
//     · cualquier otra cosa, o no aparece → "Consultar ubicación con supervisor"
//
// Solo LECTURA: hace lo mismo que esumLogin_ + esumGetAutoMap_ de Apps Script
// (login y lista de autos del taller). Nunca cambia zonas; eso sigue siendo
// de Apps Script. No escribe en Supabase.
//
// La lista del taller viene entera en un HTML (todos los autos a la vez), así
// que se guarda en cache un rato y se comparte entre todos los celulares.
// =========================

import crypto from "node:crypto";

const BASE_URL = (process.env.ESUM_URL || "https://esum.red.pe").replace(/\/+$/, "");
const TALLER_ID = process.env.ESUM_TALLER_ID || "3";
// Las mismas credenciales que usa Apps Script (CFG_ESUM). Solo por entorno
// (.env y Render): no se escriben en el código.
const USER = process.env.ESUM_USER || "";
const PASSWORD = process.env.ESUM_PASSWORD || "";

/** Cuánto vale la lista leída. Es "la última actualización", no seguimiento en vivo. */
const CACHE_MS = Number(process.env.ESUM_CACHE_MS) || 3 * 60_000;
const TIMEOUT_MS = 25_000;

/** Zona que significa "todavía en ingreso": se devuelve a quien lo trajo. */
export const esZonaIngreso = (zona) => /INGRESO/i.test(String(zona || ""));

let _cache = null;     // { at, map: Map<vin, zona> }
let _enVuelo = null;   // Promise<Map> mientras se consulta

const normVin_ = (v) => String(v || "").trim().toUpperCase();

function timeout_(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, fin: () => clearTimeout(t) };
}

async function login_() {
  if (!USER || !PASSWORD) throw new Error("faltan ESUM_USER / ESUM_PASSWORD en el servidor");
  const passHex = crypto.createHash("sha512").update(PASSWORD).digest("hex");
  const to = timeout_(TIMEOUT_MS);
  try {
    const resp = await fetch(`${BASE_URL}/includes/process_login.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `promotores_l=${encodeURIComponent(USER)}&p_l=${passHex}`,
      redirect: "manual",
      signal: to.signal,
    });
    const crudas = typeof resp.headers.getSetCookie === "function"
      ? resp.headers.getSetCookie()
      : [resp.headers.get("set-cookie") || ""];
    const cookie = crudas.map(c => c.split(";")[0].trim()).filter(Boolean).join("; ");
    if (!cookie) throw new Error(`login sin cookie (HTTP ${resp.status})`);
    return cookie;
  } finally { to.fin(); }
}

/** Mismo parseo que esumGetAutoMap_ de Apps Script: VIN → auto_id → zona seleccionada. */
export function parsearListaAutos_(html) {
  const vinToId = new Map();
  const vinRe = /celdarotacionauto_(\d+)[^>]*>[\s\S]*?imagen_auto_vin[^>]*>([A-HJ-NPR-Z0-9]{17})/g;
  let m;
  while ((m = vinRe.exec(html)) !== null) vinToId.set(normVin_(m[2]), m[1]);

  const zonaPorId = new Map();
  const zonaRe = /S_Cambio_FlujoTrabajo_(\d+)[\s\S]*?<option value="([^"]+)"[^>]*selected/g;
  while ((m = zonaRe.exec(html)) !== null) zonaPorId.set(m[1], m[2]);

  const map = new Map();
  for (const [vin, id] of vinToId) map.set(vin, zonaPorId.get(id) || "");
  return map;
}

async function leerLista_() {
  const cookie = await login_();
  const to = timeout_(TIMEOUT_MS);
  try {
    const resp = await fetch(`${BASE_URL}/includes/consultallerautosresum_lista_autos_flujo_vista_gen.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
      body: `VIdTaller=${encodeURIComponent(TALLER_ID)}`,
      signal: to.signal,
    });
    if (!resp.ok) throw new Error(`lista HTTP ${resp.status}`);
    const raw = await resp.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error("la lista no vino en JSON (¿sesión rechazada?)"); }
    const map = parsearListaAutos_(String((Array.isArray(parsed) ? parsed[1] : "") || ""));
    if (!map.size) throw new Error("la lista vino vacía");
    return map;
  } finally { to.fin(); }
}

/** Lista del taller (cache CACHE_MS; `fresh` la vuelve a pedir). Una sola consulta a la vez. */
async function lista_({ fresh = false } = {}) {
  if (!fresh && _cache && Date.now() - _cache.at < CACHE_MS) return _cache;
  if (!_enVuelo) {
    const t0 = Date.now();
    _enVuelo = leerLista_()
      .then(map => {
        _cache = { at: Date.now(), map };
        console.log(`[ESUM] lista leída: ${map.size} autos en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        return _cache;
      })
      .finally(() => { _enVuelo = null; });
  }
  return _enVuelo;
}

/**
 * Zona actual en eSUM de cada VIN.
 * → { leido_at, zonas: { VIN: { encontrado, zona, ingreso } } }
 */
export async function zonasActuales(vins, opts = {}) {
  const { at, map } = await lista_(opts);
  const zonas = {};
  for (const v of vins.map(normVin_).filter(Boolean)) {
    const encontrado = map.has(v);
    const zona = encontrado ? map.get(v) : "";
    zonas[v] = { encontrado, zona, ingreso: esZonaIngreso(zona) };
  }
  return { leido_at: new Date(at).toISOString(), zonas };
}
