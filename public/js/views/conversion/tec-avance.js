// =========================
// public/js/views/conversion/tec-avance.js
// Botón "Avanzar siguiente carro".
//
// Para qué existe: una dupla no rinde el doble por tener dos personas en un
// mismo carro — rinde el doble si mientras uno cierra el que tienen, el otro
// abre el siguiente. El motor no puede repartir eso solo: desde fuera, una
// unidad con un carro abierto está ocupada, y darle un segundo por criterio
// automático sería el acaparamiento que el modelo de unidades existe para
// evitar. Así que no lo decide el motor, lo piden ellos.
//
// Quién lo ve:
//   · las duplas ACTIVAS, y
//   · todo técnico con su ingreso marcado, mientras DESPACHO_AVANCE_SOLO
//     sea "*" (lo es desde 2026-08-17). Antes era un permiso nominal para
//     quien trabaja con ayudantes que no marcan asistencia; resultó que esa
//     situación la tiene cualquiera, así que el permiso es de todos.
//
// El crédito NO es de quien pulsa: va al que le toca por alternancia (A, B,
// A, B…). Eso lo decide el servidor; aquí solo se anuncia, porque un botón
// que no dice a nombre de quién va se convierte en una discusión.
//
// Vive en dos pantallas (Mi OT y Mi asistencia) montado desde este único
// módulo: dos copias del mismo botón se desincronizan a la primera.
// =========================

import { getJSON, postJSON } from "../../core/api.js";
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

/**
 * Pinta el botón dentro del contenedor, o lo deja vacío si no aplica.
 * Silencioso a propósito cuando no hay derecho: quien no marcó ingreso, o
 * tiene una dupla sin confirmar, no gana nada con un botón deshabilitado —
 * lo que le falta se lo dice la pantalla de asistencia, no este botón.
 *
 * @param {string} containerId  id del div donde montarlo
 * @param {object} opts.onAsignado  callback tras avanzar (refrescar la OT)
 */
export async function renderAvance_(containerId, { onAsignado } = {}) {
  const box = document.getElementById(containerId);
  if (!box) return;

  const email = emailActual_();
  if (!email) { box.innerHTML = ""; return; }

  let d;
  try { d = await getJSON(`/api/despacho/avance?email=${encodeURIComponent(email)}`); }
  catch { box.innerHTML = ""; return; }      // sin red: no estorbar la pantalla

  if (!d?.ok || !d.puede) { box.innerHTML = ""; return; }

  const quien = primerNombre_(d.tocaANombre);
  const turno = d.esMiTurno
    ? "el crédito es tuyo"
    : `el crédito va para <b>${escapeHtml(quien || "tu compañero")}</b>`;
  const sub = d.modo === "DUPLA"
    ? `Dupla con <b>${escapeHtml(primerNombre_(d.companeroNombre) || "tu compañero")}</b> · ${turno}`
    : "Sin dupla · el crédito es tuyo";

  box.innerHTML = `
    <div class="tecAvance">
      <button id="tecAvanceBtn" class="tecAvanceBtn" type="button">
        ⏭ Avanzar siguiente carro
      </button>
      <div class="tecAvanceSub small muted">${sub}</div>
      <div id="tecAvanceMsg" class="tecAvanceMsg"></div>
    </div>`;

  const btn = document.getElementById("tecAvanceBtn");
  const msg = document.getElementById("tecAvanceMsg");

  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "Buscando carro…";
    msg.className = "tecAvanceMsg";
    msg.innerHTML = "";
    try {
      const r = await postJSON("/api/despacho/avanzar", { email });
      if (!r?.ok) throw new Error(r?.error || "No se pudo avanzar");

      msg.className = "tecAvanceMsg ok";
      msg.innerHTML = `Zona <b>${escapeHtml(String(r.zonaId ?? "?"))}</b> ·
        ${escapeHtml(r.modelo || "Vehículo")} · ${escapeHtml(r.rol || "")}
        <div class="small">a nombre de ${escapeHtml(primerNombre_(r.nombre) || "—")}</div>`;

      onAsignado?.(r);
      // Se repinta para que el turno mostrado sea el nuevo: acaba de rotar.
      setTimeout(() => renderAvance_(containerId, { onAsignado }), 1200);
    } catch (e) {
      msg.className = "tecAvanceMsg err";
      msg.textContent = e?.message || "No se pudo avanzar";
      btn.disabled = false;
      btn.textContent = "⏭ Avanzar siguiente carro";
    }
  };
}

/** Limpia el botón (al salir del panel). */
export function limpiarAvance_(containerId) {
  const box = document.getElementById(containerId);
  if (box) box.innerHTML = "";
}
