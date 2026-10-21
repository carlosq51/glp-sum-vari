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
