// =========================
// public/js/templates/views/hoja-chequeo-view.js
// Hoja 2 de 3: LISTA DE CHEQUEO - INSTALACIÓN EQUIPO GLP JETOUR X70.
//
// Copia literal de la hoja "CC TECNICO" de CERTIFICADOS GLP.xlsx.
// Igual que el Informe de Taller, no está maquetada a ojo: es la misma
// rejilla de 18 columnas (B..S) × 47 filas, con los mismos bordes, fuentes
// y escala de impresión (87%) que trae el archivo.
//
// Las clases .c39, .c42, .c127… son los números de estilo del Excel
// (cellXfs). Ver hoja-chequeo.css.
// =========================

import { escapeHtml } from "../../core/format.js";

// Los 32 puntos que se marcan con OK, filas 11 a 44 del Excel.
// `n` es el número impreso, que NO siempre coincide con la posición: en el
// original hay dos puntos numerados 28 (filas 37 y 39). Es una errata suya
// y se respeta — el papel tiene que salir igual al que ya archivan.
export const CHEQUEO_PUNTOS = [
  { n: 3,  t: "COMPROBAR FUNCIÓN DE CORRECTORES CON ESCANNER" },
  { n: 4,  t: "VERIFICAR APERTURA DE MALETERA JETOUR AUTOMATICO" },
  { n: 5,  t: "VERIFICAR ACCESORIOS ORIGINALES EN VEHÍCULO" },
  { n: 6,  t: "INSTALACIÓN CONTROLADOR STAG QNEXT PLUS - ECU" },
  { n: 7,  t: "INSTALACIÓN DEL RAMAL PRINCIPAL" },
  { n: 8,  t: "INSTALACIÓN CONEXIONES ECU" },
  { n: 9,  t: "INSTALACIÓN DEL RIEL DE INYECTORES (                    )" },
  { n: 10, t: "PERFORACIÓN E INSTALACIÓN DE BOQUILLAS (2.2MM)" },
  { n: 11, t: "INSTALACIÓN DEL REDUCTOR R02 - (1.25 BAR PRESIÓN)" },
  { n: 12, t: "INSTALACIÓN DEL FILTRO DE FASE GASEOSA" },
  { n: 13, t: "INSTALACIÓN DE MANGUERAS DE GAS - ABRAZADERAS" },
  { n: 14, t: "INSTALACIÓN DE MANGUERAS DE AGUA - ABRAZADERAS" },
  { n: 15, t: "INSTALACIÓN CONMUTADOR LED 600" },
  { n: 16, t: "INSTALACIÓN DEL SENSOR DE PRESIÓN MAP (PS04)" },
  { n: 17, t: "INSTALACIÓN CONEXIONES OBD" },
  { n: 18, t: "INSTALACIÓN CONEXIONES RIEL" },
  { n: 19, t: "INSTALACIÓN CONEXIÓN GENERAL DEL EQUIPO DE GAS" },
  { n: 20, t: "INSTALACIÓN PORTA FUSIBLES" },
  { separador: true },                       // fila 29: separador de 4.8pt
  { n: 21, t: "INSTALACIÓN TANQUE TOROIDAL 600X200 BE" },
  { n: 22, t: "INSTALACIÓN MULTIVÁLVULA AT02 200-0° (TOROIDAL)" },
  { n: 23, t: "INSTALACIÓN SENSOR DE NIVEL / VERIFICAR PERNOS DE FIJACION" },
  { n: 24, t: "INSTALACIÓN TOMA DE CARGA" },
  { n: 25, t: "INSTALACIÓN DE LA LÍNEA DE CAÑERIAS 6MM" },
  { n: 26, t: "INSTALACIÓN DE LA LÍNEA DE CAÑERIAS 8MM" },
  { n: 27, t: "REPOSTAJE DE GAS" },
  // El punto 28 lleva la firma del tanquero EN SU MISMA LÍNEA, detrás de
  // "FIRMA:". El texto conserva los espacios del Excel, que separan "RH"
  // de "FIRMA:" — por eso esta celda se pinta con white-space: pre.
  { n: 28, t: "AJUSTE DE NEUMATICO POST RH                       FIRMA:", firma: true },
  { firmaLinea: true },                      // fila 38: renglón en blanco bajo el punto 28
  { n: 28, t: "VERIFICAR FUNCIONAMIENTO DE INSTRUMENTOS DE TABLERO" },
  { n: 29, t: "COMPROBAR ESTANQUEIDAD DE MÚLTIPLE DE ADMISIÓN" },
  { n: 30, t: "CONTROL FINAL DEL TÉCNICO A CARGO" },
  { n: 31, t: "VERIFICAR ACCESORIOS ORIGINALES EN VEHÍCULO" },
  { n: 32, t: "REGISTRO DE DOCUMENTACIÓN OT - TIEMPOS" },
  { n: 33, t: "REGISTRO DE MANUAL OPERACIÓN GAS" },
];

// Anchos de las 18 columnas B..S en mm impresos.
// px = anchoExcel * 7 + 5 ;  mm = px * 25.4/96 * 0.87   (el 87 es pageSetup)
const ANCHOS_MM = [
  8.75,                                   // B — número del punto
  ...Array(14).fill(8.52),                // C..P — el texto va merged C:Q
  9.21,                                   // Q
  8.52,                                   // R — la columna del OK
  8.52,                                   // S — borde derecho del marco
];

const td = (clase, contenido = "", attrs = "") =>
  `<td${clase ? ` class="${clase}"` : ""}${attrs}>${contenido}</td>`;

/**
 * La Lista de Chequeo imprimible.
 * @param {object} d
 * @param {string} d.fecha       fila 5, C:H — la de hoy
 * @param {string} d.vin         fila 5, I:R
 * @param {string} d.marca       fila 6, C:J
 * @param {string} d.modelo      fila 6, K:R
 * @param {string[]} d.tecnicos  fila 7 — los dos responsables
 * @param {object} d.bateria     {v, ai, af} — fila 8
 * @param {string[]} d.cilindros 4 lecturas de compresión — fila 10
 * @param {number[]} d.marcados  índices de CHEQUEO_PUNTOS con OK
 * @param {string} d.tanquero    nombre que firma el punto 28
 */
export function hojaChequeoHtml(d = {}) {
  const {
    fecha = "", vin = "", marca = "JETOUR", modelo = "X70",
    tecnicos = [], bateria = {}, cilindros = [],
    marcados = null, tanquero = "",
  } = d;

  const E = escapeHtml;
  // Por defecto van todos marcados: el técnico entrega el carro con todo
  // hecho, y es más rápido desmarcar la excepción que marcar 32 casillas.
  const ok = new Set(marcados ?? CHEQUEO_PUNTOS
    .map((p, i) => (p.separador || p.firmaLinea ? -1 : i))
    .filter(i => i >= 0));

  const cols = ANCHOS_MM.map(w => `<col style="width:${w}mm">`).join("");
  // D() = dato escrito por la app. Va en azul para distinguirlo del
  // formulario impreso (ver .dato en informe-taller.css).
  const D = (v) => (v ? `<span class="dato">${E(v)}</span>` : "");
  const cil = (i) => D(cilindros[i]);

  // ── Filas 11-44: número | texto (merged C:Q) | casilla OK | borde ──
  const puntos = CHEQUEO_PUNTOS.map((p, i) => {
    // Fila 29: separador bajito, sin número ni casilla.
    if (p.separador) {
      return `<tr class="cSep">${td("c39")}<td class="c43" colspan="16"></td>${td("c40")}</tr>`;
    }
    // Fila 38: renglón en blanco bajo el punto 28. El "OK" de su casilla
    // viene impreso en el Excel original, así que se reproduce.
    if (p.firmaLinea) {
      return `
      <tr>
        ${td("c39")}
        <td class="c43" colspan="15"></td>
        ${td("c44", "OK")}
        ${td("c40")}
      </tr>`;
    }
    // El texto del punto 28 trae los espacios del Excel entre "RH" y
    // "FIRMA:". El HTML normal los colapsa a uno solo y las dos cosas
    // quedan pegadas, así que esa celda va con white-space: pre.
    const texto = p.firma ? `${E(p.t)} ${D(tanquero)}` : E(p.t);
    return `
      <tr>
        ${td("c39", String(p.n))}
        <td class="c127${p.firma ? " cjPre" : ""}" colspan="15">${texto}</td>
        ${td("c42", ok.has(i) ? `<span class="dato">OK</span>` : "")}
        ${td("c40")}
      </tr>`;
  }).join("");

  return `
  <div class="cjHoja">
    <table class="cjTabla">
      <colgroup>${cols}</colgroup>
      <tbody>
        <tr class="cR2"><td class="c117" colspan="16"></td>${td("c37")}${td("c38")}</tr>
        <tr><td class="c39"></td><td class="c111" colspan="16">LISTA DE CHEQUEO - INSTALACIÓN EQUIPO GLP JETOUR X70</td>${td("c40")}</tr>
        <tr>${td("c39")}<td class="c41" colspan="16"></td>${td("c40")}</tr>

        <tr>
          ${td("c39")}
          <td class="c119" colspan="6">FECHA: ${D(fecha)}</td>
          <td class="c122" colspan="10">VIN: ${D(vin)}</td>
          ${td("c40")}
        </tr>
        <tr>
          ${td("c39")}
          <td class="c119" colspan="8">MARCA: ${D(marca)}</td>
          <td class="c122" colspan="8">MODELO: ${D(modelo)}</td>
          ${td("c40")}
        </tr>
        <tr>
          ${td("c39")}
          <td class="c122" colspan="16">TÉCNICO RESPONSABLE: ${D(tecnicos.filter(Boolean).join("   /   "))}</td>
          ${td("c40")}
        </tr>

        <tr>
          ${td("c39", "1")}
          <td class="c127" colspan="11"><div class="cjBateria"><span>PRUEBA DE BATERIA:</span><span>V= ${D(bateria.v)}</span><span>A.i= ${D(bateria.ai)}</span></div></td>
          <td class="c127" colspan="5">A.f= ${D(bateria.af)}</td>
          ${td("c40")}
        </tr>
        <tr>
          <td class="c125" rowspan="2">2</td>
          <td class="c126" colspan="16">PRUEBA DE LECTURA DE COMPRESIÓN DEL MOTOR</td>
          ${td("c40")}
        </tr>
        <tr>
          <td class="c127" colspan="4">CIL1: ${cil(0)}</td>
          <td class="c127" colspan="4">CIL2: ${cil(1)}</td>
          <td class="c127" colspan="4">CIL3: ${cil(2)}</td>
          <td class="c127" colspan="4">CIL4: ${cil(3)}</td>
          ${td("c40")}
        </tr>

        ${puntos}

        <tr class="cR45">${td("c45")}<td class="c46" colspan="16"></td>${td("c47")}</tr>
        <tr class="cR46"><td class="c130" colspan="18">CONEXIÓNES PARA LA EMULACIÓN</td></tr>
        <tr class="cR47">
          <td class="c131" colspan="5">CIL-1: AMARILLO</td>
          <td class="c132" colspan="5">CIL-2: VERDE</td>
          <td class="c132" colspan="4">CIL-3: ROJO</td>
          <td class="c132" colspan="4">CIL-4: AZUL</td>
        </tr>
      </tbody>
    </table>
  </div>`;
}
