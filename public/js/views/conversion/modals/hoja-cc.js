// =========================
// public/js/views/conversion/modals/hoja-cc.js
// Lógica del modal con el que el inspector valida y pide su hoja CONTROL
// FINAL (la "CC WILMER").
//
// La hoja viene marcada según el modelo del carro (CC_MODELOS). Lo que el
// modelo deja en blanco o con "x" sale primero, sin marcar: marcarlo es
// poner "ok". Lo demás va plegado y todo marcado; desmarcar uno lo deja en
// blanco. Al pedirla queda PENDIENTE en la oficina (routes/hojas-calidad.js)
// y sale con las demás cuando le den a Imprimir.
// =========================

import { CORE } from "../../../core/state.js";
import { getJSON, postJSON } from "../../../core/api.js";
import { escapeHtml } from "../../../core/format.js";
import { CC_FILAS, modeloCc_, marcaModelo_, MODELOS_CC_TEXTO } from "../../../templates/views/hoja-cc-view.js";

const $ = (id) => document.getElementById(id);

let actual_ = null;     // { vin, cc, modelo }
let enviando_ = false;

const email_ = () => CORE.state.currentProfile?.email || CORE.state.email || "";

function msg_(texto, esError = false) {
  const el = $("hccMsg");
  if (!el) return;
  el.textContent = texto || "";
  el.classList.toggle("is-error", !!esError);
  el.style.display = texto ? "block" : "none";
}

export function cerrarHojaCc_() {
  const m = $("hccModal");
  if (m) { m.classList.remove("show"); m.setAttribute("aria-hidden", "true"); }
  actual_ = null;
}

function cabecera_(modelo, pendiente) {
  const cab = $("hccCabecera");
  if (!cab) return;
  cab.innerHTML = `
    <div class="iotCabTop">
      <div><span>VIN</span><b>${escapeHtml(actual_?.vin || "")}</b></div>
      <div><span>Modelo</span><b>${escapeHtml(modelo || "—")}</b></div>
    </div>
    ${pendiente ? `<div class="small muted">Ya la pediste y sigue en la oficina sin imprimir. Si cambias algo, se corrige esa misma.</div>` : ""}`;
}

/** Una casilla. `marcada` = sale "ok". */
function casilla_(f, marcada, sinMarcar) {
  return `
    <label class="iotCk">
      <input type="checkbox" data-hcc-punto="${f.n}"${marcada ? " checked" : ""}>
      <span><b>${f.n}</b> ${escapeHtml(f.t.trim())}${sinMarcar === "x" || sinMarcar === "-" ? ` <small class="muted">(sin marcar: ${sinMarcar})</small>` : ""}</span>
    </label>`;
}

function pintarPuntos_(cc, previas = {}) {
  const puntos = CC_FILAS.filter(f => f.n);
  const valor = (n) => previas[n] ?? marcaModelo_(cc, n);
  // Lo que el modelo no da por hecho: es lo que hay que revisar.
  const revisar = puntos.filter(f => marcaModelo_(cc, f.n) !== "ok");
  const resto = puntos.filter(f => marcaModelo_(cc, f.n) === "ok");

  $("hccPuntos").innerHTML = `
    <div class="iotSec">Por revisar · ${revisar.length}</div>
    <p class="small muted" style="margin:0 0 8px;">Marca lo que sí hiciste: sale con ok en el papel.</p>
    <div class="iotCks">${revisar.map(f => casilla_(f, valor(f.n) === "ok", marcaModelo_(cc, f.n))).join("")}</div>

    <details class="iotPlegable">
      <summary>Los demás puntos <small>(${resto.length} · todos con ok)</small></summary>
      <div class="iotCks">${resto.map(f => casilla_(f, valor(f.n) === "ok", "")).join("")}</div>
    </details>`;
}

/**
 * Abre el modal para un carro.
 * @param {string} vinRaw
 */
export async function abrirHojaCc_(vinRaw) {
  const m = $("hccModal");
  const vin = String(vinRaw || "").trim().toUpperCase();
  if (!m || !vin) return;

  actual_ = { vin, cc: null };
  msg_("");
  cabecera_("…", null);
  $("hccPuntos").innerHTML = `<p class="small muted">Cargando…</p>`;
  $("hccEnviar").disabled = true;
  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");

  try {
    const r = await getJSON(`/api/hojas-calidad/carro?vin=${encodeURIComponent(vin)}&email=${encodeURIComponent(email_())}`);
    if (!r?.ok) throw new Error(r?.error || "No se pudo cargar el carro.");
    if (actual_?.vin !== vin) return;   // cerraron o abrieron otro mientras tanto

    cabecera_(r.modelo, r.pendiente);
    const cc = modeloCc_(r.modelo);
    if (!cc) {
      $("hccPuntos").innerHTML = "";
      msg_(r.modelo
        ? `Todavía no está cargada la hoja CC del ${r.modelo}. Hay hoja para: ${MODELOS_CC_TEXTO}.`
        : `No sé qué modelo es el ${vin}: no está en el padrón de carros.`, true);
      return;
    }
    actual_.cc = cc;
    pintarPuntos_(cc, r.pendiente?.marcas || {});
    $("hccEnviar").disabled = false;
  } catch (err) {
    $("hccPuntos").innerHTML = "";
    msg_(String(err?.message || err), true);
  }
}

async function enviar_() {
  if (enviando_ || !actual_?.cc) return;
  const { vin, cc } = actual_;

  // Marcada = ok. Sin marcar = lo que el modelo deja ("x" en los sensores
  // de oxígeno), o en blanco si el modelo lo daba por ok.
  const marcas = {};
  document.querySelectorAll("#hccPuntos [data-hcc-punto]").forEach(el => {
    const n = Number(el.dataset.hccPunto);
    const modelo = marcaModelo_(cc, n);
    marcas[n] = el.checked ? "ok" : (modelo === "ok" ? "" : modelo);
  });

  enviando_ = true;
  $("hccEnviar").disabled = true;
  msg_("Enviando…");
  try {
    const r = await postJSON("/api/hojas-calidad", { email: email_(), vin, marcas });
    if (!r?.ok) throw new Error(r?.error || "No se pudo pedir la hoja.");
    msg_(r.yaEstaba ? "Listo: se corrigió la hoja que ya estaba en la oficina." : "Listo: la hoja está en la oficina para imprimir.");
    setTimeout(() => { if (actual_?.vin === vin) cerrarHojaCc_(); }, 1500);
  } catch (err) {
    msg_(String(err?.message || err), true);
    $("hccEnviar").disabled = false;
  } finally {
    enviando_ = false;
  }
}

/** Bind de listeners. Se llama una sola vez al arranque. */
export function initHojaCc_() {
  $("hccClose")?.addEventListener("click", cerrarHojaCc_);
  $("hccEnviar")?.addEventListener("click", enviar_);
  $("hccModal")?.addEventListener("click", (e) => {
    if (e.target?.id === "hccModal") cerrarHojaCc_();
  });
}
