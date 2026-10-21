// =========================
// lib/fotos-huella.js
// Fotos repetidas: guardar la huella de cada foto y preguntar cuáles se parecen.
//
// La huella la calcula huellaImagen (lib/image-optimize.js) y la compara la
// base (glp_fotos_repetidas, migración 008): con miles de fotos no conviene
// traerlas todas al servidor para comparar aquí.
//
// Nada de esto puede tumbar una subida: si la tabla no existe todavía o
// Supabase no responde, la foto se guarda igual y solo se pierde el aviso.
// =========================

import { supabaseServiceHeaders_ } from "./supabase.js";

/** Bits distintos hasta los que dos fotos se consideran la misma (ver 008). */
export const UMBRAL_REPETIDA = 16;

/** Nombre de cada casilla, para decir "igual a Cilindro 2" y no "comp_2". */
export const ETIQUETA_SLOT = {
  vin:               "Foto del VIN",
  comp_1:            "Cilindro 1",
  comp_2:            "Cilindro 2",
  comp_3:            "Cilindro 3",
  comp_4:            "Cilindro 4",
  corr_pre:          "Amperaje ANTES",
  corr_post:         "Amperaje DESPUÉS",
  voltaje:           "Voltaje",
  scan_carro:        "Scan del carro",
  sold_sensor_antes: "Sensor nivel · ANTES",
  sold_sensor_post:  "Sensor nivel · DESPUÉS",
  sold_cabina_antes: "Cabina · ANTES",
  sold_cabina_post:  "Cabina · DESPUÉS",
  calidad_1:         "Calidad 1",
  calidad_2:         "Calidad 2",
  calidad_3:         "Calidad 3",
  calidad_4:         "Calidad 4",
};

function base_() {
  const h = supabaseServiceHeaders_();
  return h ? { h, url: process.env.SUPABASE_URL } : null;
}

/** Guarda (o reemplaza, si la casilla se volvió a subir) la huella de una foto. */
export async function registrarHuella_({ clave, vin, slot, huella, subidoPor = "" }) {
  const b = base_();
  if (!b) return;
  const res = await fetch(`${b.url}/rest/v1/fotos_huella?on_conflict=clave`, {
    method: "POST",
    headers: { ...b.h, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      clave,
      vin: String(vin).trim().toUpperCase(),
      slot,
      huella,
      subido_por: subidoPor || null,
      created_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`fotos_huella ${res.status} ${t.slice(0, 200)}`);
  }
}

/**
 * Deja escrito de qué foto anterior es copia (null = de ninguna). Va aparte
 * de registrarHuella_ para que, si falla, la huella quede guardada igual.
 */
export async function marcarCopia_(clave, copiaDe) {
  const b = base_();
  if (!b) return;
  const res = await fetch(`${b.url}/rest/v1/fotos_huella?clave=eq.${encodeURIComponent(clave)}`, {
    method: "PATCH",
    headers: { ...b.h, Prefer: "return=minimal" },
    body: JSON.stringify({ copia_de: copiaDe || null }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`fotos_huella copia_de ${res.status} ${t.slice(0, 200)}`);
  }
}

/**
 * Fotos de este VIN que se parecen a otra, agrupadas por la clave R2 de la
 * foto del VIN: { "registro/…/comp_1.jpg": [{ vin, slot, etiqueta, … }] }.
 */
export async function fotosRepetidas_(vin) {
  const b = base_();
  if (!b || !vin) return {};
  const res = await fetch(`${b.url}/rest/v1/rpc/glp_fotos_repetidas`, {
    method: "POST",
    headers: b.h,
    body: JSON.stringify({ p_vin: vin, p_umbral: UMBRAL_REPETIDA }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`glp_fotos_repetidas ${res.status} ${t.slice(0, 200)}`);
  }
  const filas = await res.json();
  const porClave = {};
  for (const f of filas || []) {
    (porClave[f.clave] ||= []).push({
      clave:     f.igual_clave,
      vin:       f.igual_vin,
      slot:      f.igual_slot,
      etiqueta:  ETIQUETA_SLOT[f.igual_slot] || f.igual_slot,
      email:     f.igual_subido_por || "",
      nombre:    f.igual_nombre || "",
      fecha:     f.igual_created_at,
      distancia: f.distancia,
      mismoVin:  f.igual_vin === String(vin).trim().toUpperCase(),
    });
  }
  return porClave;
}

// ─── Aviso en la tarjeta de CALIDAD ─────────────────────────────────────────
// Calidad tiene que ver ANTES de abrir las fotos que el carro trae una
// repetida. Aquí no basta con "se parece a otra": la foto original también se
// parece a su copia, y pintar de rojo el carro que la tomó de verdad sería
// injusto. Cuenta como copia solo la que coincide con una subida ANTES.

const TTL_COPIAS_MS = 10 * 60 * 1000;
const copias_ = new Map();   // VIN → { ts, lista }

/** Al subir una foto de ese VIN, su aviso se recalcula en la próxima consulta. */
export function olvidarCopias_(vin) {
  copias_.delete(String(vin || "").trim().toUpperCase());
}

async function copiasDeVin_(vin) {
  const b = base_();
  if (!b) return [];
  const res = await fetch(
    `${b.url}/rest/v1/fotos_huella?select=clave,slot,created_at&vin=eq.${encodeURIComponent(vin)}`,
    { headers: b.h }
  );
  if (!res.ok) throw new Error(`fotos_huella ${res.status}`);
  const filas = await res.json();
  if (!filas.length) return [];

  // La foto vigente de cada casilla es la más nueva (un carro puede tener la
  // misma casilla en dos meses si cruzó de mes).
  const vigente = {};
  for (const f of filas) {
    if (!vigente[f.slot] || f.created_at > vigente[f.slot].created_at) vigente[f.slot] = f;
  }

  const repetidas = await fotosRepetidas_(vin);
  const lista = [];
  for (const f of Object.values(vigente)) {
    const propia = Date.parse(f.created_at);
    const original = (repetidas[f.clave] || []).find(r => Date.parse(r.fecha) < propia);
    if (!original) continue;
    lista.push({
      slot: f.slot,
      etiqueta: ETIQUETA_SLOT[f.slot] || f.slot,
      igual: { vin: original.vin, slot: original.slot, etiqueta: original.etiqueta, mismoVin: original.mismoVin },
    });
  }
  return lista;
}

/**
 * fotosCopiadas_ — { VIN: [{ slot, etiqueta, igual }] } con las fotos de cada
 * VIN que copian una subida antes. Lista vacía = nada que avisar.
 */
export async function fotosCopiadas_(vins = []) {
  const ahora = Date.now();
  const out = {};
  await Promise.all(vins.map(async (v) => {
    const vin = String(v || "").trim().toUpperCase();
    if (!vin) return;
    const c = copias_.get(vin);
    if (c && ahora - c.ts < TTL_COPIAS_MS) { out[vin] = c.lista; return; }
    const lista = await copiasDeVin_(vin);
    copias_.set(vin, { ts: ahora, lista });
    out[vin] = lista;
  }));
  return out;
}

// ─── % de copias para el LIVE ───────────────────────────────────────────────
// Lo cuenta la base (glp_fotos_copias_resumen / _detalle, migración 009) sobre
// la columna copia_de. Se cachea poco: cambia con cada foto que se sube.

const TTL_RESUMEN_MS = 2 * 60 * 1000;
const resumen_ = new Map();   // jornada → { ts, valor }

async function rpc_(fn, body) {
  const b = base_();
  if (!b) return [];
  const res = await fetch(`${b.url}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: b.h, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`${fn} ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * copiasDelLive_ — { resumen: { jornada|mes|general: { parametros, soldadura } },
 * detalle: [...] } para la jornada dada ("YYYY-MM-DD"). Cada grupo trae
 * { carros, carrosConCopia, fotos, fotosCopiadas }. El detalle es del mes.
 */
export async function copiasDelLive_(jornada) {
  const c = resumen_.get(jornada);
  if (c && Date.now() - c.ts < TTL_RESUMEN_MS) return c.valor;

  const [filas, det] = await Promise.all([
    rpc_("glp_fotos_copias_resumen", { p_jornada: jornada }),
    rpc_("glp_fotos_copias_detalle", { p_jornada: jornada }),
  ]);
  const vacio = () => ({ carros: 0, carrosConCopia: 0, fotos: 0, fotosCopiadas: 0 });
  const resumen = {};
  for (const a of ["jornada", "mes", "general"]) resumen[a] = { parametros: vacio(), soldadura: vacio() };
  for (const f of filas || []) {
    if (!resumen[f.alcance]?.[f.grupo]) continue;
    resumen[f.alcance][f.grupo] = {
      carros: f.carros, carrosConCopia: f.carros_con_copia, fotos: f.fotos, fotosCopiadas: f.fotos_copiadas,
    };
  }
  const detalle = (det || []).map(d => ({
    jornada: d.jornada, vin: d.vin, slot: d.slot, grupo: d.grupo,
    etiqueta: ETIQUETA_SLOT[d.slot] || d.slot,
    quien: d.nombre || String(d.subido_por || "").split("@")[0] || "",
    igualVin: d.igual_vin || "", igualSlot: d.igual_slot || "",
    igualEtiqueta: ETIQUETA_SLOT[d.igual_slot] || d.igual_slot || "",
    igualQuien: d.igual_nombre || String(d.igual_subido_por || "").split("@")[0] || "",
    at: d.created_at,
  }));
  const valor = { resumen, detalle };
  resumen_.set(jornada, { ts: Date.now(), valor });
  return valor;
}
