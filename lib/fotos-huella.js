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

import { supabaseServiceHeaders_, supabaseFetchAll_, supabaseGet_ } from "./supabase.js";

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
 * Quita la huella de una foto borrada: un carro cuenta como "con copia" por
 * las fotos que TIENE, no por las que alguien subió y después borró.
 */
export async function borrarHuella_(clave) {
  const b = base_();
  if (!b) return;
  const res = await fetch(`${b.url}/rest/v1/fotos_huella?clave=eq.${encodeURIComponent(clave)}`, {
    method: "DELETE",
    headers: { ...b.h, Prefer: "return=minimal" },
  });
  if (!res.ok) throw new Error(`fotos_huella borrar ${res.status}`);
  resumen_.clear();
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

  const [filas, detalle] = await Promise.all([
    rpc_("glp_fotos_copias_resumen", { p_jornada: jornada }),
    detalleCopias_(jornada),
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
  const valor = { resumen, detalle };
  resumen_.set(jornada, { ts: Date.now(), valor });
  return valor;
}

const GRUPO_SLOT = Object.fromEntries([
  ...["comp_1", "comp_2", "comp_3", "comp_4", "vin", "corr_pre", "corr_post", "voltaje", "scan_carro"].map(s => [s, "parametros"]),
  ...["sold_sensor_antes", "sold_sensor_post", "sold_cabina_antes", "sold_cabina_post"].map(s => [s, "soldadura"]),
]);

/** La jornada de un instante, con la misma regla que glp_jornada_fecha (Lima − 6 h). */
const jornadaDe_ = (iso) => new Date(Date.parse(iso) - 11 * 3600e3).toISOString().slice(0, 10);

function urlFoto_(clave) {
  const pub = String(process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  return pub && clave ? `${pub}/${clave}` : "";
}

/**
 * Las copias del mes de la jornada (hasta esa jornada), cada una con la URL de
 * la foto y la de su original, para verlas lado a lado en el LIVE. Se lee la
 * tabla directo y no glp_fotos_copias_detalle porque hace falta la clave R2.
 */
async function detalleCopias_(jornada) {
  const b = base_();
  if (!b) return [];
  const [a, m, d] = jornada.split("-").map(Number);
  const desde = `${jornada.slice(0, 7)}-01T06:00:00-05:00`;
  const manana = new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
  const hasta = `${manana}T06:00:00-05:00`;

  const r = await supabaseFetchAll_(
    `${b.url}/rest/v1/fotos_huella?select=clave,vin,slot,subido_por,created_at,copia_de`
    + `&copia_de=not.is.null&created_at=gte.${encodeURIComponent(desde)}&created_at=lt.${encodeURIComponent(hasta)}`
    + "&order=created_at.desc",
    b.h, { pageSize: 1000, maxRows: 20_000 }
  );
  if (!r.ok) throw new Error(`fotos_huella detalle ${r.status} ${r.error}`);
  const copias = r.rows.filter(f => GRUPO_SLOT[f.slot]);

  // Las originales, de a tandas: una lista "in" con cientos de claves no cabe en la URL.
  const claves = [...new Set(copias.map(f => f.copia_de))];
  const tandas = [];
  for (let i = 0; i < claves.length; i += 80) tandas.push(claves.slice(i, i + 80));
  const [porTanda, usuarios] = await Promise.all([
    Promise.all(tandas.map(async (t) => {
      const lista = t.map(k => `"${k.replace(/"/g, "")}"`).join(",");
      const res = await fetch(
        `${b.url}/rest/v1/fotos_huella?select=clave,vin,slot,subido_por,created_at&clave=in.(${encodeURIComponent(lista)})`,
        { headers: b.h }
      );
      if (!res.ok) throw new Error(`fotos_huella originales ${res.status}`);
      return res.json();
    })),
    supabaseGet_("usuarios").catch(() => []),
  ]);
  const originales = new Map(porTanda.flat().map(o => [o.clave, o]));

  const nombre = Object.fromEntries((usuarios || []).map(u => [String(u.email || "").trim().toLowerCase(), u.nombre || ""]));
  const quien_ = (email) => nombre[String(email || "").toLowerCase()] || String(email || "").split("@")[0] || "";

  return copias.map(f => {
    const o = originales.get(f.copia_de) || {};
    return {
      jornada: jornadaDe_(f.created_at), vin: f.vin, slot: f.slot, grupo: GRUPO_SLOT[f.slot],
      etiqueta: ETIQUETA_SLOT[f.slot] || f.slot,
      quien: quien_(f.subido_por),
      at: f.created_at,
      url: urlFoto_(f.clave),
      igualVin: o.vin || "", igualSlot: o.slot || "",
      igualEtiqueta: ETIQUETA_SLOT[o.slot] || o.slot || "",
      igualQuien: quien_(o.subido_por),
      igualAt: o.created_at || null,
      igualUrl: urlFoto_(f.copia_de),
    };
  });
}
