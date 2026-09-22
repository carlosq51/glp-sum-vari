// =========================
// public/js/templates/views/informe-taller-view.js
// HTML del Informe de Taller: el formulario que llena el técnico y la hoja
// que sale por la impresora. Funciones puras — no tocan el DOM.
//
// LA HOJA ES UNA COPIA LITERAL del Excel "INFORME TALLER" de
// CERTIFICADOS GLP.xlsx. No está maquetada a mano: se reconstruye la misma
// rejilla de 12 columnas (B..M) × 47 filas, celda por celda, con los mismos
// bordes y las mismas fuentes que trae el archivo. Las clases .x5, .x8, .x9…
// son los números de estilo del propio Excel (ver informe-taller.css).
//
// Por eso las funciones de abajo hablan en coordenadas de hoja de cálculo
// (fila 21, columna B): así se puede abrir el Excel al lado y comparar.
// =========================

import { escapeHtml } from "../../core/format.js";

// Las 7 tareas del detalle — filas 21 a 27, columna C. El texto va tal cual
// está en el Excel, con sus faltas de ortografía incluidas: es el documento
// que la empresa ya usa y firma, no nos toca corregirlo aquí.
export const DETALLE_TAREAS = [
  "* inspeccion de vehiculo, funcionamiento y revision de equipo.",
  "* compresion del motor / scanner / medicion de bateria.",
  "* instalcion GLP (CC del tecnico)",
  "* calibracion de parametros GLP.",
  "* Pruebas de estanqueidad.",
  "* configuracion de radio.",
  "* prueba emision de gases.",
];
export const DETALLE_POR_DEFECTO = [0, 1, 2];

// Los 9 tipos de trabajo: filas 14-16, etiquetas en C/G/K y la casilla
// (un cuadro con los 4 bordes, estilo x1) en E/I/L.
export const TIPOS_TRABAJO = [
  "MANTTO MAYOR ", "CONVERSION", "DIAGNOSTICO",
  "MANTTO MENOR", "RECLAMO", "OTROS",
  "MANTTO 1000 KM", "CAMBIO DE EQUIPO", "GARANTIA",
];

// Anchos de las 12 columnas B..M, en mm ya impresos.
// px = anchoExcel * 7 + 5 ;  mm = px * 25.4/96 * 0.92
const ANCHOS_MM = [10.71, 22.16, 14.12, 10.71, 6.33, 15.83, 18.75, 10.96, 9.74, 22.16, 10.96, 9.25];

const td = (clase, contenido = "", attrs = "") =>
  `<td${clase ? ` class="${clase}"` : ""}${attrs}>${contenido}</td>`;

/** Fila sin nada dentro: solo los bordes laterales del marco (B y M). */
function filaMarco_(n = 1) {
  const celdas = td("x13") + `<td colspan="10"></td>` + td("x14");
  return `<tr>${celdas}</tr>`.repeat(n);
}

/**
 * La hoja imprimible, idéntica al Excel.
 * @param {object} d
 * @param {string} d.marca       fila 8, D:E
 * @param {string} d.ot          fila 8, H:I
 * @param {string} d.modelo      fila 10, D:E
 * @param {string} d.placa       fila 10, H:I
 * @param {string} d.trabajo     uno de TIPOS_TRABAJO → marca su casilla
 * @param {number[]} d.tareas    índices de DETALLE_TAREAS con OK en la col. B
 * @param {string[]} d.observaciones  una por renglón, filas 30-37
 * @param {string[]} d.tecnicos  fila 44, F:H
 */
export function informeHojaHtml(d = {}) {
  const {
    marca = "JETOUR", modelo = "X70", ot = "", placa = "",
    trabajo = "CONVERSION", tareas = DETALLE_POR_DEFECTO,
    observaciones = "", tecnicos = [],
  } = d;

  const marcadas = new Set(tareas);
  const E = escapeHtml;
  // D() = dato escrito por la app. Azul, para distinguirlo del formulario
  // impreso (ver .dato en informe-taller.css).
  const D = (v) => (v ? `<span class="dato">${E(v)}</span>` : "");

  const cols = ANCHOS_MM.map(w => `<col style="width:${w}mm">`).join("");

  // ── Filas 1-5: el logo (anclado en C1:E5) y el título (G3, Calibri 14) ──
  const cabecera = `
      <tr>
        ${td("")}
        <td class="itLogo" colspan="3" rowspan="5"><img src="/img/logo-sum.jpg" alt="SUM Vehículos"></td>
        ${td("").repeat(8)}
      </tr>
      <tr>${td("")}${td("").repeat(8)}</tr>
      <tr class="itR3">${td("")}${td("")}<td class="x7" colspan="7">INFORME DE TALLER</td></tr>
      <tr>${td("")}${td("").repeat(8)}</tr>
      <tr>${td("")}${td("").repeat(8)}</tr>`;

  // ── Banda de título de sección: fila con borde arriba y abajo de B a M ──
  const banda = (texto) => `
      <tr>
        <td class="x116" colspan="2">${E(texto)}</td>
        ${td("x8").repeat(9)}
        ${td("x9")}
      </tr>
      <tr>${td("x10")}${td("x11").repeat(10)}${td("x12")}</tr>`;

  // ── Línea que cierra una sección (borde inferior de B a M) ──
  const cierre = `<tr>${td("x15")}${td("x6").repeat(10)}${td("x16")}</tr>`;

  // ── Filas 8 y 10: etiqueta + línea de escritura (borde inferior) ──
  const filaDatos = (lbl1, val1, lbl2, val2) => `
      <tr>
        ${td("x13")}
        ${td("", E(lbl1))}
        <td class="x6" colspan="2">${D(val1)}</td>
        ${td("")}
        ${td("", E(lbl2))}
        <td class="x6" colspan="2">${D(val2)}</td>
        ${td("").repeat(3)}
        ${td("x14")}
      </tr>`;

  // ── Filas 14-16: 3 etiquetas con su casilla a la derecha ──
  const filaTrabajo = (a, b, c) => {
    const casilla = (t) => td("x1", t === trabajo ? `<span class="dato">OK</span>` : "");
    return `
      <tr>
        ${td("x13")}
        ${td("", E(a))}${td("")}${casilla(a)}
        ${td("")}
        ${td("", E(b))}${td("")}${casilla(b)}
        ${td("")}
        ${td("", E(c))}${casilla(c)}
        ${td("x14")}
      </tr>`;
  };

  // ── Filas del bloque grande (18-37): renglón con línea arriba y abajo ──
  // La columna B es donde el técnico pone el OK; no lleva recuadro propio,
  // es el margen izquierdo del renglón (igual que en el Excel).
  // `esDato` distingue el texto impreso de la hoja (negro) del que escribe
  // el técnico (azul): los renglones de observaciones son suyos.
  const renglon = (ok, texto, esDato = false, claseB = "x5") => `
      <tr>
        <td class="${claseB} itOk">${ok ? `<span class="dato">OK</span>` : ""}</td>
        <td class="x8" colspan="10">${esDato ? D(texto) : E(texto)}</td>
        ${td("x9")}
      </tr>`;

  const obsLineas = String(observaciones || "").split(/\r?\n/).filter(l => l.trim());

  return `
  <div class="itHoja" id="itHoja">
    <table class="itTabla">
      <colgroup>${cols}</colgroup>
      <tbody>
        ${cabecera}

        ${banda("DATOS DE VEHICULO")}
        ${filaDatos("MARCA :", marca, "OT :", ot)}
        ${filaMarco_()}
        ${filaDatos("MODELO :", modelo, "PLACA :", placa)}
        ${cierre}

        ${banda("TRABAJO REALIZADO")}
        ${filaTrabajo(TIPOS_TRABAJO[0], TIPOS_TRABAJO[1], TIPOS_TRABAJO[2])}
        ${filaTrabajo(TIPOS_TRABAJO[3], TIPOS_TRABAJO[4], TIPOS_TRABAJO[5])}
        ${filaTrabajo(TIPOS_TRABAJO[6], TIPOS_TRABAJO[7], TIPOS_TRABAJO[8])}
        ${cierre}

        ${renglon(false, "DETALLE DE TRABAJO REALIZADO")}
        ${renglon(false, "")}
        ${renglon(false, "")}
        ${DETALLE_TAREAS.map((t, i) => renglon(marcadas.has(i), t)).join("")}
        ${renglon(false, "")}
        ${renglon(false, "OBSERVACION Y/O RECOMENDACIONES DEL TECNICO")}
        ${Array.from({ length: 8 }, (_, i) => renglon(false, obsLineas[i] || "", true)).join("")}
        <tr>${td("x10")}${td("x11").repeat(10)}${td("x12")}</tr>

        ${filaMarco_(2)}
        <tr>
          ${td("x13")}
          ${td("", "FIRMA :")}
          <td class="x6" colspan="4"></td>
          ${td("").repeat(5)}
          ${td("x14")}
        </tr>
        ${filaMarco_(2)}
        <tr>
          ${td("x13")}
          ${td("", "NOMBRE DE TECNICO :")}
          ${td("").repeat(2)}
          <td class="x6" colspan="3">${D(tecnicos.filter(Boolean).join("   /   "))}</td>
          ${td("").repeat(4)}
          ${td("x14")}
        </tr>
        ${filaMarco_(2)}
        ${cierre}
      </tbody>
    </table>
  </div>`;
}

/** El formulario + la hoja, que es lo que monta la página /informe-taller. */
export function informeTallerPageHtml() {
  const checks = DETALLE_TAREAS.map((t, i) => `
        <label class="itCheck">
          <input type="checkbox" data-it-tarea="${i}"${DETALLE_POR_DEFECTO.includes(i) ? " checked" : ""}>
          <span>${escapeHtml(t.replace(/^\*\s*/, ""))}</span>
        </label>`).join("");

  const opciones = TIPOS_TRABAJO.map(t =>
    `<option value="${escapeHtml(t)}"${t === "CONVERSION" ? " selected" : ""}>${escapeHtml(t.trim())}</option>`
  ).join("");

  return `
  <div class="itPage">
    <div class="itPageHead">
      <button class="btn" id="itBack" type="button">← Volver</button>
      <h2>Informe de Taller</h2>
      <div class="spacer"></div>
      <button class="btn primary" id="itPrint" type="button">Imprimir</button>
    </div>

    <div class="itForm">
      <div class="itGrid">
        <div class="itField">
          <label for="itMarca">Marca</label>
          <input id="itMarca" value="JETOUR" readonly>
        </div>
        <div class="itField">
          <label for="itModelo">Modelo</label>
          <input id="itModelo" value="X70" readonly>
        </div>
        <div class="itField">
          <label for="itOt">OT</label>
          <input id="itOt" placeholder="N° de OT" inputmode="numeric" autocomplete="off">
        </div>
        <div class="itField">
          <label for="itPlaca">Placa</label>
          <input id="itPlaca" placeholder="ABC-123" autocomplete="off">
        </div>
        <div class="itField">
          <label for="itTrabajo">Trabajo realizado</label>
          <select id="itTrabajo">${opciones}</select>
        </div>
        <div class="itField">
          <label for="itTec1">Técnico 1</label>
          <input id="itTec1" placeholder="Nombre y apellido" autocomplete="off">
        </div>
        <div class="itField">
          <label for="itTec2">Técnico 2</label>
          <input id="itTec2" placeholder="Nombre y apellido" autocomplete="off">
        </div>
      </div>

      <div class="itSub">Detalle de trabajo realizado</div>
      <div class="itChecks">${checks}</div>

      <div class="itSub">Observaciones y/o recomendaciones</div>
      <div class="itField">
        <textarea id="itObs" placeholder="Una observación por línea"></textarea>
      </div>

      <div class="itSub">Lista de chequeo — mediciones</div>
      <div class="itGrid">
        <div class="itField">
          <label for="itVin">VIN</label>
          <input id="itVin" placeholder="17 caracteres" autocomplete="off">
        </div>
        <div class="itField">
          <label for="itTanquero">Tanquero (firma el punto 28)</label>
          <input id="itTanquero" placeholder="Nombre y apellido" autocomplete="off">
        </div>
        <div class="itField">
          <label for="itBatV">Batería — V</label>
          <input id="itBatV" placeholder="12.4" autocomplete="off">
        </div>
        <div class="itField">
          <label for="itBatAi">Batería — A.i</label>
          <input id="itBatAi" placeholder="0.02" autocomplete="off">
        </div>
        <div class="itField">
          <label for="itBatAf">Batería — A.f</label>
          <input id="itBatAf" placeholder="13.9" autocomplete="off">
        </div>
        <div class="itField">
          <label for="itCil1">Compresión CIL1</label>
          <input id="itCil1" autocomplete="off">
        </div>
        <div class="itField">
          <label for="itCil2">Compresión CIL2</label>
          <input id="itCil2" autocomplete="off">
        </div>
        <div class="itField">
          <label for="itCil3">Compresión CIL3</label>
          <input id="itCil3" autocomplete="off">
        </div>
        <div class="itField">
          <label for="itCil4">Compresión CIL4</label>
          <input id="itCil4" autocomplete="off">
        </div>
      </div>

      <div class="itSub">Registro de producción</div>
      <p class="itNota">
        Cada uno tiene su propia hora de inicio y de fin. <b>La hora final que
        dejes en blanco se pone sola al imprimir</b> — que es justo cuando el
        último termina y viene a la oficina.
      </p>
      ${["itP1", "itP2", "itP3"].map((p, i) => `
        <div class="itPersona">
          <div class="itPersonaNom" id="${p}Nom">${["Técnico 1", "Técnico 2", "Tanquero"][i]}</div>
          <div class="itGrid">
            <div class="itField">
              <label for="${p}Fecha">Fecha de inicio</label>
              <input id="${p}Fecha" type="date">
            </div>
            <div class="itField">
              <label for="${p}Ini">Hora inicio</label>
              <input id="${p}Ini" type="time">
            </div>
            <div class="itField">
              <label for="${p}Fin">Hora final</label>
              <input id="${p}Fin" type="time">
            </div>
          </div>
          <div class="itEtapas">
            ${[
              ["compresion", "Compresión"], ["scanner", "Scanner"], ["mecanica", "Mecánica"],
              ["electronica", "Electrónica"], ["tanque", "Tanque"],
            ].map(([k, t]) => `
              <label class="itEtapa">
                <input type="checkbox" data-it-etapa="${p}:${k}">
                <span>${t}</span>
              </label>`).join("")}
          </div>
        </div>`).join("")}
    </div>

    <div class="itHojas" id="itHojas"></div>
  </div>`;
}

/**
 * Contenedor de la página, igual que inventarioView(): el shell lo pinta
 * oculto y app.js lo muestra cuando la URL es /informe-taller.
 */
export function informeTallerView() {
  return `
    <div id="viewInformeTaller" style="display:none;">
      <div id="itPageBody"></div>
    </div>
  `;
}
