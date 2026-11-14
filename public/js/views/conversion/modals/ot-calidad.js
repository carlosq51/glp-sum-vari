// =========================
// public/js/views/conversion/modals/ot-calidad.js
// "Registro de OT" dentro del modal Registro de Calidad (rf-modal.js).
//
// El inspector escribe el N.º de OT del papel y, mirando el carro, dice
// por el tanque y por el reductor si coinciden con el equipo virtual (los
// asignados en ASIGNACIONES). El servidor (routes/ot-calidad.js):
//   · los dos coinciden → aprobada: la OT sube a ASIGNACIONES (col E).
//   · alguno no         → queda guardado y la calidad no se puede cerrar
//                         hasta corregirlo y volver aquí a aprobar.
//   · OT repetida       → avisa; se guarda solo con el doble check.
// =========================

import { CORE } from "../../../core/state.js";
import { getJSON, postJSON } from "../../../core/api.js";
import { escapeHtml } from "../../../core/format.js";

const email_ = () => CORE.state.currentProfile?.email || CORE.state.email || "";
const norm_ = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const otValida_ = (v) => /^#?\d{1,10}$/.test(String(v || "").replace(/\s+/g, ""));

/**
 * Un equipo: el virtual en grande, lo que registró el técnico como pista
 * y dos botones, Coincide / No coincide. La pista no decide: decide el
 * inspector mirando el carro.
 */
function filaEquipo_(clave, nombre, virtual, registrado, previo) {
  const difiere = registrado && norm_(registrado) !== norm_(virtual);
  const pista = !registrado
    ? `El técnico no lo registró.`
    : difiere
      ? `<span class="otcDifiere">⚠ El técnico registró <b>${escapeHtml(registrado)}</b>: distinto al virtual.</span>`
      : `El técnico registró ${escapeHtml(registrado)} ✓`;
  const marca = (v) => (previo === v ? " checked" : "");
  return `
    <div class="otcEquipo">
      <div><b>${nombre}</b> virtual: <strong>${escapeHtml(virtual)}</strong></div>
      <small>${pista}</small>
      <div class="otcOpciones" role="radiogroup" aria-label="${nombre}">
        <label class="otcOp is-si"><input type="radio" name="otc_${clave}" value="si"${marca(true)}> Coincide</label>
        <label class="otcOp is-no"><input type="radio" name="otc_${clave}" value="no"${marca(false)}> No coincide</label>
      </div>
    </div>`;
}

function estadoRegistro_(reg) {
  if (!reg) return "";
  if (!reg.tanque_ok || !reg.reductor_ok) {
    const malos = [!reg.tanque_ok && "el tanque", !reg.reductor_ok && "el reductor"].filter(Boolean).join(" y ");
    return `<div class="otcAviso is-no">⛔ Guardado con ${malos} que NO coincide. La calidad no se puede cerrar hasta corregirlo y aprobar aquí.</div>`;
  }
  if (reg.hoja_at) return `<div class="otcAviso">✅ OT ${escapeHtml(reg.numero_ot)} ya está en ASIGNACIONES. Si la corriges, se vuelve a subir.</div>`;
  if (reg.hoja_error) return `<div class="otcAviso is-no">⚠ Aprobada, pero no se pudo subir a la hoja: ${escapeHtml(reg.hoja_error)}</div>`;
  return `<div class="otcAviso">⏳ OT ${escapeHtml(reg.numero_ot)} aprobada; sube a ASIGNACIONES en unos minutos.</div>`;
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

  const $ = (id) => stage.querySelector(`#${id}`);
  const msg = (t, err = false) => {
    const el = $("otcMsg");
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
    $("otcBody").innerHTML = "";
    msg(String(err?.message || err), true);
    return;
  }

  // Sin equipo virtual no hay contra qué comparar.
  const faltan = [!r.tanqueVirtual && "tanque", !r.reductorVirtual && "reductor"].filter(Boolean);
  const reg = r.registro;

  $("otcBody").innerHTML = `
    <div class="iotCabecera">
      <div class="iotCabTop" style="margin-bottom:0;">
        <div><span>VIN</span><b>${escapeHtml(r.vin)}</b></div>
        <div><span>Modelo</span><b>${escapeHtml(r.modelo || "—")}</b></div>
      </div>
    </div>
    ${estadoRegistro_(reg)}

    <div class="iotSec">Orden de trabajo</div>
    <label class="iotCampo">
      <span>N.º de OT</span>
      <input id="otcNumero" placeholder="Ej. 9801" autocomplete="off" inputmode="numeric" value="${escapeHtml(r.otActual || "")}">
      <small class="muted">El número de la OT en papel. Va a la columna E de ASIGNACIONES.</small>
    </label>

    <div class="iotSec">Verificación del equipo</div>
    ${faltan.length
      ? `<div class="otcAviso is-no">El carro no tiene ${faltan.join(" ni ")} virtual asignado en ASIGNACIONES. Que la oficina lo asigne para poder verificar.</div>`
      : `${filaEquipo_("tanque", "Tanque", r.tanqueVirtual, r.tanqueRegistrado, reg ? reg.tanque_ok : undefined)}
         ${filaEquipo_("reductor", "Reductor", r.reductorVirtual, r.reductorRegistrado, reg ? reg.reductor_ok : undefined)}`}

    <!-- OT repetida: aparece cuando el servidor avisa. -->
    <div id="otcRepetida" class="otcAviso is-no" style="display:none;"></div>

    <div class="iotEnvios" style="grid-template-columns:1fr;">
      <button id="otcGuardar" type="button" class="btnInicio iotEnviar" disabled>Aprobar</button>
    </div>`;

  if (faltan.length) return;

  const valor = (clave) => {
    const el = stage.querySelector(`input[name="otc_${clave}"]:checked`);
    return el ? el.value === "si" : null;
  };
  let repetida = null;   // { ot, otrosVins } cuando el servidor avisó
  const confirmoRepetida = () => !!$("otcConfirmaRep")?.checked;

  const refrescar = () => {
    const t = valor("tanque"), rd = valor("reductor");
    const ot = String($("otcNumero").value).replace(/\s+/g, "");
    // Si cambian la OT, el aviso de repetida ya no vale.
    if (repetida && repetida.ot !== ot) { repetida = null; $("otcRepetida").style.display = "none"; }
    const aprobar = t === true && rd === true;
    const btn = $("otcGuardar");
    btn.innerHTML = aprobar
      ? `${reg ? "Corregir y aprobar" : "Aprobar"}<small>la OT sube a ASIGNACIONES</small>`
      : `Guardar: no coincide<small>la calidad no se podrá cerrar hasta corregirlo</small>`;
    btn.classList.toggle("is-noCoincide", !aprobar && t !== null && rd !== null);
    btn.disabled = !otValida_(ot) || t === null || rd === null || (repetida && !confirmoRepetida());
  };
  stage.querySelectorAll('input[name^="otc_"]').forEach(el => el.addEventListener("change", refrescar));
  $("otcNumero").addEventListener("input", refrescar);
  refrescar();

  let enviando = false;
  $("otcGuardar").addEventListener("click", async () => {
    if (enviando || $("otcGuardar").disabled) return;
    enviando = true;
    $("otcGuardar").disabled = true;
    msg("Guardando…");
    try {
      const ot = String($("otcNumero").value).replace(/\s+/g, "");
      const res = await postJSON("/api/ot-calidad", {
        email: email_(), vin: r.vin,
        numero_ot: ot,
        tanque_ok: valor("tanque"),
        reductor_ok: valor("reductor"),
        confirmar_repetida: !!repetida && confirmoRepetida(),
      });
      if (res?.repetida) {
        // Doble check: se muestra en qué carro está y se pide confirmar.
        repetida = { ot, otrosVins: res.otrosVins || [] };
        const box = $("otcRepetida");
        box.innerHTML = `
          ⚠ ${escapeHtml(res.error)}<br>
          <label class="otcConfirma"><input type="checkbox" id="otcConfirmaRep">
            Revisé el papel: la OT ${escapeHtml(ot)} es correcta para este carro. Subirla igual.</label>`;
        box.style.display = "block";
        $("otcConfirmaRep").addEventListener("change", refrescar);
        msg("");
        return;
      }
      if (!res?.ok) throw new Error(res?.error || "No se pudo guardar.");
      msg(res.aprobada
        ? (res.yaEstaba ? "Listo: OT corregida. Se vuelve a subir a ASIGNACIONES en unos minutos." : "Listo: OT aprobada. Sube a ASIGNACIONES en unos minutos.")
        : "Guardado: no coincide. La calidad de este carro no se podrá cerrar hasta corregirlo y aprobar aquí.", !res.aprobada);
      setTimeout(volver, res.aprobada ? 1600 : 3000);
    } catch (err) {
      msg(String(err?.message || err), true);
    } finally {
      enviando = false;
      refrescar();
    }
  });
}
