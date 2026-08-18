// =========================
// public/js/views/conversion/tec-apoyo.js
// "Apoya a FRANZ en la zona 7" — la tarjeta del técnico que está trabajando en
// el carro de otro.
//
// Existe por una razón concreta: el que apoya NO tiene OT propia. El carro, la
// asignación y el crédito son del titular, así que su pantalla de Mi OT está
// vacía. Sin este cartel, la lectura obvia es "el sistema se olvidó de mí" —
// justo cuando lo que hay que hacer es caminar a una zona concreta.
//
// Por eso vive en Mi OT (donde el técnico entra a buscar su trabajo) además de
// en Mi asistencia, y por eso es UN solo módulo: dos copias del mismo texto se
// desincronizan a la primera corrección.
//
// Es SOLO para la dupla del carro extra —la que arma la regla y deshace sola
// al cerrarse ese carro—, porque es la única en la que uno de los dos trabaja
// sin OT propia. La dupla de trabajo (la que proponen los técnicos o arma el
// supervisor) recibe su carro como unidad y no necesita este cartel.
// =========================

import { getJSON } from "../../core/api.js";
import { escapeHtml } from "../../core/format.js";
import { CORE } from "../../core/core.js";

function emailActual_() {
  const p = CORE.state.currentProfile;
  return String(document.getElementById("email")?.value || p?.email || "")
    .trim().toLowerCase();
}

function primerNombre_(n) {
  return String(n || "").trim().split(/\s+/)[0] || "";
}

/** El compañero: el miembro de la dupla que no soy yo. */
export function companeroDe_(dupla, miUserId) {
  const i = (dupla?.miembros || []).findIndex(id => id !== miUserId);
  return i >= 0 ? (dupla.miembrosNombres?.[i] || "tu compañero") : "tu compañero";
}

/**
 * HTML de la tarjeta. Devuelve "" si esa dupla no es del carro extra o no está
 * activa.
 *
 * @param {object} dupla     fila de /api/despacho/duplas (con `auto`)
 * @param {string} miUserId  para saber de qué lado del carro estoy
 */
export function apoyoHTML_(dupla, miUserId) {
  if (!dupla?.auto || dupla.estado !== "ACTIVA") return "";

  const soyTitular = dupla.lider_user_id === miUserId;
  const otro  = escapeHtml(primerNombre_(companeroDe_(dupla, miUserId)));
  const zona  = dupla.zonaId != null
    ? ` en la <b>zona ${escapeHtml(String(dupla.zonaId))}</b>` : "";
  const vin   = dupla.vin ? `<div class="tecApoyoVin">${escapeHtml(dupla.vin)}</div>` : "";

  // El titular necesita saber que le llegó ayuda; el ayudante, adónde ir y de
  // quién es el carro. Son dos mensajes distintos, no el mismo con otro nombre.
  const cuerpo = soyTitular
    ? `<b>${otro}</b> te apoya en este carro${zona}.
       El carro sigue a tu nombre; al terminarlo cada uno sigue por su cuenta.`
    : `Trabajas con <b>${otro}</b>${zona}. El carro va a nombre de él —
       al cerrarlo recibes el tuyo.`;

  return `
    <div class="tecApoyo${soyTitular ? " tecApoyo--titular" : ""}">
      <div class="tecApoyoTitulo">🤝 ${soyTitular ? "Tienes apoyo" : `Apoya a ${otro}`}</div>
      <div class="tecApoyoTexto">${cuerpo}</div>
      ${vin}
    </div>`;
}

/**
 * Pinta la tarjeta en el contenedor, o lo deja vacío si no aplica.
 * Silencioso a propósito: la enorme mayoría del taller no está apoyando a
 * nadie y no tiene por qué ver un hueco ni una explicación.
 */
export async function renderApoyo_(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;

  const email = emailActual_();
  if (!email) { box.innerHTML = ""; return; }

  let d;
  try { d = await getJSON(`/api/despacho/duplas?email=${encodeURIComponent(email)}`); }
  catch { box.innerHTML = ""; return; }        // sin red: no estorbar la pantalla
  if (!d?.ok) { box.innerHTML = ""; return; }

  // El id lo resuelve el servidor a partir del email — el perfil del cliente no
  // siempre lo trae, y equivocarse aquí invierte los dos mensajes de la tarjeta.
  const miId = d.userId;
  const mia  = miId ? (d.duplas || []).find(x => x.miembros?.includes(miId)) : null;
  box.innerHTML = mia ? apoyoHTML_(mia, miId) : "";
}

/** Limpia la tarjeta (al salir del panel). */
export function limpiarApoyo_(containerId) {
  const box = document.getElementById(containerId);
  if (box) box.innerHTML = "";
}
