// =========================
// public/js/work/work-templates.js
// HTML templates para cards de trabajo (botones, asignado, incidencias)
// =========================

import { CORE } from "../core/state.js";
import { escapeHtml } from "../core/format.js";
import { accionesDe_ } from "../../../lib/ot-estados.js";

// Cada acción, su botón. Antes la tarjeta repetía el mismo <button> en cada
// rama del estado y la clase CSS se elegía a mano: cambiar el texto de FIN eran
// dos sitios, y añadir una acción, cuatro.
//
// NOTA no está aquí a propósito, aunque el flujo la admita siempre: su botón no
// vive en esta rejilla, lo saca el textarea de la tarjeta cuando se escribe
// algo (ver conversion-delegation.js). El único caso en que se pinta es la OT
// ya cerrada, donde es lo ÚNICO que queda por hacer.
const BOTON = {
  INICIO:   { clase: "btnInicio",   texto: "INICIO" },
  PAUSA:    { clase: "btnPausa",    texto: "PAUSA" },
  REANUDAR: { clase: "btnReanudar", texto: "REANUDAR" },
  FIN:      { clase: "btnFin",      texto: "FIN" },
  NOTA:     { clase: "btnInicio",   texto: "GUARDAR NOTA" },
};

/**
 * Botones de acción de una tarjeta.
 *
 * Qué se puede hacer desde cada estado NO se decide aquí: lo dice la tabla que
 * también valida el servidor (lib/ot-estados.js). Esta función solo la pinta.
 *
 * `ajena` es la OT de CALIDAD del otro inspector: se ve y se acciona, pero no
 * se cierra —el FIN de una inspección es la firma de quien la hizo—. El botón
 * no se pinta en vez de pintarlo y rebotar, porque uno que siempre falla es una
 * trampa; en su sitio queda dicho de quién es el cierre, que un hueco no
 * explica nada.
 */
export function buildBotonesByEstado_(estado, { ajena = false, titularNombre = "" } = {}) {
  const cerrada = String(estado || "").toUpperCase() === "FINALIZADO";
  const botones = accionesDe_(estado, { ajena })
    .filter(a => BOTON[a] && (cerrada || a !== "NOTA"))
    .map(a => `<button class="${BOTON[a].clase}" data-act="${a}">${BOTON[a].texto}</button>`)
    .join("");

  const quien = escapeHtml(String(titularNombre || "").trim() || "su titular");
  const cierreAjeno = ajena
    ? `<div class="small jobCierreAjeno" style="text-align:center; opacity:.85; margin-top:6px;">
        🔒 El cierre es de <b>${quien}</b>
      </div>`
    : "";

  return `<div class="jobActionsGrid">${botones}</div>${cierreAjeno}`;
}

export function buildAsignadoHTML_(it) {
  const rol = String(it?.rolTrabajo || "").toUpperCase();
  if (rol !== "MOTOR" && rol !== "TANQUE") return "";

  const tanqueAsign = String(it?.tanque_asignado || "").trim();
  const reductAsign = String(it?.reductor_asignado || "").trim();
  const tanqueReg = String(it?.tanque_registrado || "").trim();
  const reductReg = String(it?.reductor_registrado || "").trim();

  const isTanque = rol === "TANQUE";
  const labelAsign = isTanque ? "TANQUE ASIGNADO:" : "REDUCTOR ASIGNADO:";
  const valAsign = isTanque ? tanqueAsign : reductAsign;
  const labelReg = isTanque ? "TANQUE REGISTRADO:" : "REDUCTOR REGISTRADO:";
  const valReg = isTanque ? tanqueReg : reductReg;

  const safeAsignVal = escapeHtml(valAsign || "NO ASIGNADO");
  const safeRegVal = escapeHtml(valReg || "—");

  const naAsign = valAsign ? "" : " na";
  const naReg = valReg ? "" : " na";

  return `
    <div class="asignadoRow js-asignado" data-rol="${escapeHtml(rol)}">
      <span class="asignadoLabel">${escapeHtml(labelAsign)}</span>
      <span class="asignadoValue${naAsign}">${safeAsignVal}</span>
    </div>
    <div class="asignadoRow js-registrado" data-rol="${escapeHtml(rol)}" style="margin-top:6px;">
      <span class="asignadoLabel">${escapeHtml(labelReg)}</span>
      <span class="asignadoValue${naReg}">${safeRegVal}</span>
    </div>
  `;
}

export function buildIncidenciasBtnHTML_(it, key = "") {
  if (CORE.state.currentModule !== "CALIDAD") return "";

  const vin = String(it?.vin || "").trim().toUpperCase();
  const cid = String(it?.conversionId || "").trim();
  if (!vin && !cid) return "";

  const l = Number(it?.inc_leve || 0);
  const m = Number(it?.inc_moderada || 0);
  const c = Number(it?.inc_critica || 0);
  const total = l + m + c;

  return `
    <div class="jobActionsGrid" style="margin-bottom:10px;">
      <button class="btnRF" type="button" data-go="INC" data-key="${escapeHtml(key)}"
        style="margin-top:0;">
        Registrar Inc.
      </button>
      <button class="btnRF" type="button" data-go="VER_INC"
        data-vin="${escapeHtml(vin)}" data-cid="${escapeHtml(cid)}"
        style="margin-top:0;">
        📋 Ver incidencias${total > 0 ? ` (${total})` : ""}
      </button>
    </div>
  `;
}