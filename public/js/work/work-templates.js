// =========================
// public/js/work/work-templates.js
// HTML templates para cards de trabajo (botones, asignado, incidencias)
// =========================

import { CORE } from "../core/state.js";
import { escapeHtml } from "../core/format.js";

export function buildBotonesByEstado_(estado) {
  const e = String(estado || "").toUpperCase();

  if (e === "SIN_INICIAR") {
    return `<div class="jobActionsGrid"><button class="btnInicio" data-act="INICIO">INICIO</button></div>`;
  }

  if (e === "TRABAJANDO") {
    return `<div class="jobActionsGrid">
      <button class="btnPausa" data-act="PAUSA">PAUSA</button>
      <button class="btnFin" data-act="FIN">FIN</button>
    </div>`;
  }

  if (e === "PAUSADO") {
    return `<div class="jobActionsGrid">
      <button class="btnReanudar" data-act="REANUDAR">REANUDAR</button>
      <button class="btnFin" data-act="FIN">FIN</button>
    </div>`;
  }

  return `<div class="jobActionsGrid"><button class="btnInicio" data-act="NOTA">GUARDAR NOTA</button></div>`;
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