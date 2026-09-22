// =========================
// public/js/templates/views/hoja-produccion-view.js
// Hoja 3 de 3: REGISTRO DE TIEMPOS DE PRODUCCION.
//
// Copia literal de la hoja "REGISTRO DE HORAS" de CERTIFICADOS GLP.xlsx.
// Ojo: esta hoja es HORIZONTAL (landscape), las otras dos verticales. Es la
// única de las tres que cambia de orientación y por eso la impresión de las
// tres juntas usa páginas con nombre (ver hoja-produccion.css).
//
// Las 20 filas de técnicos vienen con el nombre ya impreso en el Excel, más
// 3 filas en blanco al final para quien no esté en la lista.
// =========================

import { escapeHtml } from "../../core/format.js";

// Los 20 nombres impresos en el Excel, filas 9 a 28, en su orden exacto.
export const PRODUCCION_TECNICOS = [
  "FRANZ COSTILLA", "GROBERT GARCIA", "ANA LUCIA", "MICHAEL CAHUANA",
  "LUIS URIBE", "JUNIOR ALVARADO", "JESUS FLORES", "JONATAN RAMOS",
  "SALVADOR CARMEN", "MIGUEL MEJIA", "WILMER VICENTE", "VICTOR BAYLON",
  "JORGE NOLASCO", "IVAN ABAD", "HEINER TORRES", "ANTHONY RAMOS",
  "PEPE JEANS", "GREYSSON ALCARRAZ", "BERNALDO CONTRERAS", "HENRY LUZA",
];

// Filas 29, 30 y 31: los tres huecos para un técnico que no esté arriba.
const FILAS_LIBRES = 3;

// Las columnas del checklist, en el orden del Excel. Las dos primeras van
// con el texto girado 90° porque sus columnas son muy angostas.
//
// `llenable` marca las 5 que rellena el técnico con un "OK". Las otras tres
// —ARMADO CABLEADO, CALIBRACION y CONTROL DE CALIDAD— van SIEMPRE en blanco:
// las firma otra área más adelante, no quien entrega el carro.
export const PRODUCCION_COLUMNAS = [
  { k: "compresion",  t: "COMPRESION",         girado: true, llenable: true },
  { k: "scanner",     t: "SCANNER",            girado: true, llenable: true },
  { k: "mecanica",    t: "MECANICA",                         llenable: true },
  { k: "electronica", t: "ELECTRONICA",                      llenable: true },
  { k: "tanque",      t: "TANQUE",                           llenable: true },
  { k: "cableado",    t: "ARMADO CABLEADO" },
  { k: "calibracion", t: "CALIBRACION" },
  { k: "calidad",     t: "CONTROL DE CALIDAD" },
];

/** Lo que se escribe en una casilla marcada. En el Excel es literalmente OK. */
const MARCA = "OK";

// Anchos de las 12 columnas A..L en mm impresos.
// px = anchoExcel * 7 + 5 ;  mm = px * 25.4/96   (esta hoja imprime al 100%)
const ANCHOS_MM = [
  16.93,   // A  FECHA
  39.42,   // B  TECNICOS
  10.05,   // C  COMPRESION  (girado)
   9.26,   // D  SCANNER     (girado)
  19.31,   // E  MECANICA
  24.61,   // F  ELECTRONICA
  16.93,   // G  TANQUE
  19.84,   // H  ARMADO CABLEADO
  24.34,   // I  CALIBRACION
  21.69,   // J  CONTROL DE CALIDAD
  21.69,   // K  HORA INICIO
  20.90,   // L  HORA FINAL
];

const td = (clase, contenido = "", attrs = "") =>
  `<td${clase ? ` class="${clase}"` : ""}${attrs}>${contenido}</td>`;

/**
 * El Registro de Tiempos de Producción imprimible.
 * @param {object} d
 * @param {string} d.ot            fila 5, celda A
 * @param {object[]} d.filas       una por técnico que trabajó el carro:
 *                                 {nombre, fecha, marcas:{}, inicio, fin}
 *                                 `nombre` se busca entre los 20 impresos;
 *                                 si no aparece, cae en una fila libre.
 */
export function hojaProduccionHtml(d = {}) {
  const { ot = "", filas = [] } = d;
  const E = escapeHtml;

  const cols = ANCHOS_MM.map(w => `<col style="width:${w}mm">`).join("");
  // D() = dato escrito por la app. Azul (ver .dato en informe-taller.css).
  const D = (v) => (v ? `<span class="dato">${E(v)}</span>` : "");

  // Reparte cada técnico: o cae en su fila impresa, o en uno de los 3 huecos.
  const porFila = new Map();
  const sobrantes = [];
  const norm = (s) => String(s || "").trim().toUpperCase();
  for (const f of filas) {
    const i = PRODUCCION_TECNICOS.findIndex(n => norm(n) === norm(f.nombre));
    if (i >= 0) porFila.set(i, f);
    else if (f.nombre) sobrantes.push(f);
  }

  // Una fila de técnico: fecha | nombre | 8 casillas | hora inicio | hora fin
  //
  // Los 20 nombres de arriba van en NEGRO: vienen impresos en el formulario,
  // no los escribimos nosotros. Solo los de los 3 huecos libres van en azul,
  // junto con fechas, marcas y horas.
  const filaTecnico = (nombre, datos, claseNombre, nombreEsDato = false) => {
    const m = datos?.marcas || {};
    const casillas = PRODUCCION_COLUMNAS
      .map(c => td("p1", c.llenable && m[c.k] ? `<span class="dato">${MARCA}</span>` : ""))
      .join("");
    return `
      <tr>
        ${td("p1", D(datos?.fecha))}
        ${td(claseNombre, nombreEsDato ? D(nombre) : E(nombre))}
        ${casillas}
        ${td("p1", D(datos?.inicio))}
        ${td("p1", D(datos?.fin))}
      </tr>`;
  };

  const impresas = PRODUCCION_TECNICOS
    .map((n, i) => filaTecnico(n, porFila.get(i), "pNombre"))
    .join("");

  // Los 3 huecos del final: se llenan con quien no estaba en la lista.
  const libres = Array.from({ length: FILAS_LIBRES }, (_, i) =>
    filaTecnico(sobrantes[i]?.nombre || "", sobrantes[i], "pLibre", true)
  ).join("");

  // Cabeceras: COMPRESION y SCANNER giradas 90°, las demás normales.
  const cabeceras = PRODUCCION_COLUMNAS.map(c =>
    `<td class="pHead${c.girado ? " pGirado" : ""}" rowspan="${c.girado ? 3 : 2}">${E(c.t)}</td>`
  );

  return `
  <div class="pdHoja">
    <table class="pdTabla">
      <colgroup>${cols}</colgroup>
      <tbody>
        <tr class="pR4">
          ${td("")}${td("")}${td("")}
          <td class="pTitulo" colspan="7">REGISTRO DE TIEMPOS DE PRODUCCION</td>
          ${td("")}${td("")}
        </tr>
        <!-- Filas 5 y 6: en el Excel casi ninguna celda tiene borde. Solo
             la del OT y las dos cabeceras giradas, que ya vienen de la 6. -->
        <tr><td class="p1 pOt">OT: ${D(ot)}</td>${td("").repeat(11)}</tr>

        <tr class="pR6">
          ${td("")}${td("")}
          ${cabeceras[0]}${cabeceras[1]}
          ${td("").repeat(8)}
        </tr>
        <tr class="pR7">
          ${td("")}${td("")}
          ${cabeceras.slice(2).join("")}
          <td class="pHead" colspan="2">REGISTRO</td>
        </tr>
        <tr class="pR8">
          ${td("pHead", "FECHA")}${td("pHead", "TECNICOS")}
          ${td("pHead", "HORA INICIO")}${td("pHead", "HORA FINAL")}
        </tr>

        ${impresas}
        ${libres}
      </tbody>
    </table>
  </div>`;
}
