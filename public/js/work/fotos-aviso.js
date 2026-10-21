// =========================
// public/js/work/fotos-aviso.js
// Aviso rojo en la tarjeta de CALIDAD: "este carro trae fotos copiadas".
//
// Calidad tiene que saberlo ANTES de abrir las fotos: la tarjeta entera se
// pone roja y dice qué foto es copia de cuál. El servidor solo marca la foto
// que se subió DESPUÉS de su igual (la copia), no la original
// (GET /api/fotos/copiadas · lib/fotos-huella.js).
//
// Mismo esquema que informe-estado.js: las tarjetas se repintan enteras en
// cada sync, así que el resultado vive en un cache y la línea se rellena desde
// él. Al servidor solo se pregunta por VINs nuevos o con el dato vencido.
// =========================

import { getJSON } from "../core/api.js";
import { escapeHtml } from "../core/format.js";

const VIGENCIA_MS = 5 * 60 * 1000;
const cache_ = new Map();          // VIN → { ts, lista }
let pidiendo_ = false;
let otraVez_ = false;

function texto_(lista) {
  const partes = lista.slice(0, 3).map(c => {
    const donde = c.igual.mismoVin
      ? (c.igual.slot === c.slot ? "este carro" : `${c.igual.etiqueta} de este carro`)
      : `${c.igual.etiqueta} del VIN …${String(c.igual.vin).slice(-6)}`;
    return `${c.etiqueta} = ${donde}`;
  });
  const mas = lista.length > 3 ? ` · y ${lista.length - 3} más` : "";
  const n = lista.length;
  return `⚠️ Posible foto manipulada: ${n} ${n === 1 ? "foto repetida" : "fotos repetidas"} — ${partes.join(" · ")}${mas}`;
}

function pintarUno_(el) {
  const lista = cache_.get(el.dataset.vin)?.lista || [];
  el.closest(".jobCard")?.classList.toggle("fotosCopiadas", lista.length > 0);
  el.hidden = !lista.length;
  if (!lista.length) return;
  const html = escapeHtml(texto_(lista));
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
}

/** La línea de la tarjeta. Se rellena (o se esconde) desde el cache. */
export function fotosAvisoHTML_(vin) {
  const v = String(vin || "").trim().toUpperCase();
  if (!v) return "";
  return `<div class="jobFotosCopiadas js-fotos-copiadas" data-vin="${escapeHtml(v)}" hidden></div>`;
}

const vinsEnPantalla_ = () =>
  [...new Set([...document.querySelectorAll(".js-fotos-copiadas[data-vin]")].map(el => el.dataset.vin))];

/** Tras repintar las tarjetas: rellena desde el cache y pregunta lo que falte. */
export function pintarFotosCopiadas_() {
  document.querySelectorAll(".js-fotos-copiadas[data-vin]").forEach(pintarUno_);
  const ahora = Date.now();
  if (vinsEnPantalla_().some(v => !cache_.has(v) || ahora - cache_.get(v).ts > VIGENCIA_MS)) refrescar_();
}

async function refrescar_() {
  if (pidiendo_) { otraVez_ = true; return; }
  const vins = vinsEnPantalla_();
  if (!vins.length) return;
  pidiendo_ = true;
  try {
    const r = await getJSON(`/api/fotos/copiadas?vins=${encodeURIComponent(vins.join(","))}`);
    if (r?.ok) {
      const ahora = Date.now();
      for (const v of vins) cache_.set(v, { ts: ahora, lista: r.copiadas?.[v] || [] });
      document.querySelectorAll(".js-fotos-copiadas[data-vin]").forEach(pintarUno_);
    }
  } catch {
    // Sin red: se queda como estaba y se reintenta en el próximo repintado.
  } finally {
    pidiendo_ = false;
    if (otraVez_) { otraVez_ = false; refrescar_(); }
  }
}
