// =========================
// public/js/views/conversion/modals/ot-calidad.js
// "Registro de OT" dentro del modal Registro de Calidad (rf-modal.js).
//
// El inspector escribe el N.º de OT del papel y confirma, mirando el carro,
// que el tanque y el reductor que lleva son los del equipo virtual
// (los asignados en ASIGNACIONES). Con las dos casillas marcadas se aprueba:
// el servidor (routes/ot-calidad.js) guarda la OT y Apps Script la sube a
// la hoja con la fecha y los técnicos.
//
// Si un equipo no coincide no se aprueba: lo que toca es registrar la falla.
// =========================

import { CORE } from "../../../core/state.js";
import { getJSON, postJSON } from "../../../core/api.js";
import { escapeHtml } from "../../../core/format.js";

const email_ = () => CORE.state.currentProfile?.email || CORE.state.email || "";
const norm_ = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Una fila del checklist: el equipo virtual en grande, lo que registró el
 * técnico debajo (si lo registró) y si coinciden. La casilla la marca el
 * inspector: el registro del técnico es una pista, no la verificación.
 */
function filaEquipo_(id, nombre, virtual, registrado) {
  const hay = !!virtual;
  const difiere = hay && registrado && norm_(registrado) !== norm_(virtual);
  const pista = !registrado
    ? `<small>El técnico no lo registró.</small>`
    : difiere
      ? `<small class="otcDifiere">⚠ El técnico registró <b>${escapeHtml(registrado)}</b>: no coincide.</small>`
      : `<small>El técnico registró ${escapeHtml(registrado)} ✓</small>`;
  return `
    <label class="iotCk otcEquipo${hay ? "" : " is-sinVirtual"}">
      <input type="checkbox" id="${id}"${hay ? "" : " disabled"}>
      <span>
        <b>${nombre}</b> virtual: <strong>${hay ? escapeHtml(virtual) : "NO ASIGNADO"}</strong><br>
        ${hay ? `El del carro coincide con el virtual.<br>${pista}` : `<small>Sin equipo virtual no se puede verificar: que la oficina lo asigne.</small>`}
      </span>
    </label>`;
}

/**
 * Pinta el registro en `stage` para `vin`. `volver` regresa al menú del
 * modal Registro.
 */
export async function abrirOtCalidad_(stage, vin, volver) {
  if (!stage || !vin) return;
  stage.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:12px;">
      <button type="button" id="btnOtcBack" class="btn" style="height:44px; padding:0 14px; font-weight:900;">← Volver</button>
      <div class="pill small" style="opacity:.95;">REGISTRO DE OT</div>
    </div>
    <div id="otcBody"><p class="small muted">Cargando…</p></div>
    <div class="iotMsg" id="otcMsg"></div>`;
  stage.querySelector("#btnOtcBack")?.addEventListener("click", volver);

  const msg = (t, err = false) => {
    const el = stage.querySelector("#otcMsg");
    if (!el) return;
    el.textContent = t || "";
    el.classList.toggle("is-error", !!err);
    el.style.display = t ? "block" : "none";
  };

  let r;
  try {
    r = await getJSON(`/api/ot-calidad?vin=${encodeURIComponent(vin)}&email=${encodeURIComponent(email_())}`);
    if (!r?.ok) throw new Error(r?.error || "No se pudo cargar el carro.");
  } catch (err) {
    stage.querySelector("#otcBody").innerHTML = "";
    msg(String(err?.message || err), true);
    return;
  }

  const ap = r.aprobada;
  const estadoHoja = !ap ? ""
    : ap.hoja_at ? `✅ Ya está en ASIGNACIONES (OT ${escapeHtml(ap.numero_ot)}). Si la corriges, se vuelve a subir.`
    : ap.hoja_error ? `⚠ Aprobada, pero no se pudo subir a la hoja: ${escapeHtml(ap.hoja_error)}`
    : `⏳ Aprobada (OT ${escapeHtml(ap.numero_ot)}); sube a ASIGNACIONES en unos minutos.`;

  stage.querySelector("#otcBody").innerHTML = `
    <div class="iotCabecera">
      <div class="iotCabTop">
        <div><span>VIN</span><b>${escapeHtml(r.vin)}</b></div>
        <div><span>Modelo</span><b>${escapeHtml(r.modelo || "—")}</b></div>
      </div>
      <div class="iotCabTop" style="margin-bottom:0;">
        <div><span>Delantero</span><b>${escapeHtml(r.delantero || "—")}</b></div>
        <div><span>Tanquero</span><b>${escapeHtml(r.tanquero || "—")}</b></div>
      </div>
      ${estadoHoja ? `<div class="small" style="margin-top:8px;">${estadoHoja}</div>` : ""}
    </div>

    <div class="iotSec">Orden de trabajo</div>
    <label class="iotCampo">
      <span>N.º de OT</span>
      <input id="otcNumero" placeholder="Ej. 9801" autocomplete="off" inputmode="numeric" value="${escapeHtml(r.otActual || "")}">
      <small class="muted">El número de la OT en papel. Va a la columna E de ASIGNACIONES.</small>
    </label>

    <div class="iotSec">Verificación del equipo</div>
    <div class="iotCks" style="padding:0;">
      ${filaEquipo_("otcTanque", "Tanque", r.tanqueVirtual, r.tanqueRegistrado)}
      ${filaEquipo_("otcReductor", "Reductor", r.reductorVirtual, r.reductorRegistrado)}
    </div>

    <div class="small muted" style="margin-top:10px;">
      Se sube con fecha <b>${escapeHtml(r.hoy.split("-").reverse().join("-"))}</b> y técnicos <b>${escapeHtml(r.tecnicos || "—")}</b>.
    </div>

    <div class="iotEnvios" style="grid-template-columns:1fr;">
      <button id="otcAprobar" type="button" class="btnInicio iotEnviar" disabled>
        ${ap ? "Corregir y aprobar" : "Aprobar"}
        <small>marca el número de OT y las dos casillas</small>
      </button>
    </div>`;

  const $ = (id) => stage.querySelector(`#${id}`);
  const listo = () => /^#?\d{1,10}$/.test(String($("otcNumero").value).replace(/\s+/g, ""))
    && $("otcTanque").checked && $("otcReductor").checked;
  const refrescar = () => { $("otcAprobar").disabled = !listo(); };
  ["otcNumero", "otcTanque", "otcReductor"].forEach(id => $(id).addEventListener("input", refrescar));
  ["otcTanque", "otcReductor"].forEach(id => $(id).addEventListener("change", refrescar));

  let enviando = false;
  $("otcAprobar").addEventListener("click", async () => {
    if (enviando || !listo()) return;
    enviando = true;
    $("otcAprobar").disabled = true;
    msg("Guardando…");
    try {
      const res = await postJSON("/api/ot-calidad", {
        email: email_(), vin: r.vin,
        numero_ot: $("otcNumero").value,
        tanque_ok: $("otcTanque").checked,
        reductor_ok: $("otcReductor").checked,
      });
      if (!res?.ok) throw new Error(res?.error || "No se pudo aprobar.");
      msg(res.yaEstaba
        ? "Listo: OT corregida. Se vuelve a subir a ASIGNACIONES en unos minutos."
        : "Listo: OT aprobada. Sube a ASIGNACIONES en unos minutos.");
      setTimeout(volver, 1600);
    } catch (err) {
      msg(String(err?.message || err), true);
      refrescar();
    } finally {
      enviando = false;
    }
  });
}
