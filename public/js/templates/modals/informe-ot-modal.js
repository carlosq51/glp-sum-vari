// =========================
// public/js/templates/modals/informe-ot-modal.js
// Template HTML: el técnico manda el informe de su OT desde el taller.
//
// QUÉ PREGUNTA Y QUÉ NO
// El sistema ya sabe la OT, el VIN, quién es el técnico y desde cuándo
// trabaja. Nada de eso se pregunta: sale pintado arriba, de solo lectura.
// Solo se pide lo que no existe en ninguna tabla:
//
//   · la placa       — no está en el sistema, hay que mirarla en el carro
//   · la batería     — V, A.i, A.f
//   · la compresión  — los 4 cilindros
//   · observaciones
//   · los puntos del chequeo que NO se hicieron (vienen todos marcados)
//
// El criterio del "viene todo marcado" es el mismo del papel: el técnico
// entrega el carro con todo hecho, así que es más rápido desmarcar la
// excepción que marcar 32 casillas en un celular.
// =========================

import { escapeHtml } from "../../core/format.js";
import { CHEQUEO_PUNTOS } from "../views/hoja-chequeo-view.js";
import { DETALLE_TAREAS, DETALLE_POR_DEFECTO } from "../views/informe-taller-view.js";

export function informeOtModal() {
  // Cada punto lleva su rol en data-iot-rol. El modal los pinta todos y al
  // abrirse esconde los que no son de quien entra: el delantero ve 24 y el
  // tanquero 11, en vez de 32 casillas que en su mayoría no le tocan.
  const puntos = CHEQUEO_PUNTOS
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.separador && !p.firmaLinea)
    .map(({ p, i }) => `
            <label class="iotCk" data-iot-rol="${p.rol}">
              <input type="checkbox" data-iot-punto="${i}" checked>
              <span><b>${p.n}</b> ${escapeHtml(p.t.replace(/\s{2,}FIRMA:.*$/, ""))}</span>
            </label>`).join("");

  const tareas = DETALLE_TAREAS.map((t, i) => `
            <label class="iotCk">
              <input type="checkbox" data-iot-tarea="${i}"${DETALLE_POR_DEFECTO.includes(i) ? " checked" : ""}>
              <span>${escapeHtml(t.replace(/^\*\s*/, ""))}</span>
            </label>`).join("");

  return `
    <!-- =========================
        MODAL INFORME DE OT
        ========================= -->
    <div id="iotModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Informe de la OT</div>
          <button id="iotClose" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <!-- Lo que el sistema ya sabe. No se toca. -->
          <div class="iotCabecera" id="iotCabecera"></div>

          <div class="iotSec">Datos del carro</div>
          <div class="iotGrid iotGrid1">
            <label class="iotCampo">
              <span>N.º de OT</span>
              <input id="iotOtFisica" placeholder="Ej. 9801" autocomplete="off" inputmode="numeric">
              <small>El número de la orden de trabajo en papel, no el del sistema.</small>
            </label>
          </div>

          <div class="iotSec">Prueba de batería</div>
          <div class="iotGrid iotGrid3">
            <label class="iotCampo"><span>V</span><input id="iotBatV" inputmode="decimal" placeholder="12.4"></label>
            <label class="iotCampo"><span>A.i</span><input id="iotBatAi" inputmode="decimal" placeholder="0.02"></label>
            <label class="iotCampo"><span>A.f</span><input id="iotBatAf" inputmode="decimal" placeholder="13.9"></label>
          </div>

          <div class="iotSec">Compresión del motor</div>
          <div class="iotGrid iotGrid4">
            <label class="iotCampo"><span>CIL1</span><input id="iotCil1" inputmode="decimal"></label>
            <label class="iotCampo"><span>CIL2</span><input id="iotCil2" inputmode="decimal"></label>
            <label class="iotCampo"><span>CIL3</span><input id="iotCil3" inputmode="decimal"></label>
            <label class="iotCampo"><span>CIL4</span><input id="iotCil4" inputmode="decimal"></label>
          </div>

          <div class="iotSec">Observaciones</div>
          <textarea id="iotObs" placeholder="Una observación por línea. Déjalo vacío si no hay nada."></textarea>

          <!-- Los dos checklists van plegados: son 39 casillas y vienen
               todas bien. Quien no tenga nada que desmarcar no los abre. -->
          <details class="iotPlegable">
            <summary>Detalle de trabajo <small>(7 puntos · las 3 primeras marcadas)</small></summary>
            <div class="iotCks">${tareas}</div>
          </details>

          <details class="iotPlegable">
            <summary>Lista de chequeo <small id="iotCuenta">· lo que te toca, todo marcado</small></summary>
            <div class="iotCks">${puntos}</div>
          </details>

          <div class="iotMsg" id="iotMsg"></div>

          <button id="iotEnviar" type="button" class="btnInicio iotEnviar">
            Enviar a impresión
          </button>
        </div>
      </div>
    </div>
  `;
}
