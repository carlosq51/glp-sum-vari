// =========================
// public/js/templates/views/hoja-cc-view.js
// Hoja de CONTROL FINAL que imprime el inspector de calidad.
//
// Copia literal de la hoja "CC WILMER" de CERTIFICADOS GLP.xlsx, tal como
// SALE EN PAPEL. En el Excel la columna C (el número de cada punto y el
// rótulo de cada bloque) está oculta: en el papel los bloques son solo una
// franja gris con "OK" a la derecha. Aquí igual — los números se guardan
// (n) porque son la forma de decir qué marca cambia en cada modelo, pero
// no se imprimen.
//
// Rejilla: columnas B, D..K del Excel (A, C y L no se ven o están vacías),
// impresa al 79 % como el <pageSetup scale="79"/> del archivo. Medidas y
// estilos en hoja-cc.css.
// =========================

import { escapeHtml } from "../../core/format.js";

// Las filas 6 a 88 del Excel, en orden.
//   · ok: "OK"      → franja gris de bloque; el texto es lo que lleva su casilla
//   · n             → punto numerado (columna C oculta)
//   · alto          → 10.8 / 9 pt; las demás miden 10.35
//   · tipo          → "param" (filas 51-52) y "nota" (fila 81) tienen celdas propias
export const CC_FILAS = [
  { ok: "OK" },
  { n: 1, t: "PROTECTORES DE TRABAJO PARA EL AUTO, ASI COMO EL ASIENTO Y TIMON ANTES DEL SERVICIO" },
  { n: 2, t: "UNIDAD DE CONTROL / ECU" },
  { n: 3, t: "REDUCTOR DE PRESION" },
  { n: 4, t: "SENSOR DE TEMPERATURA" },
  { n: 5, t: "SENSOR MAP" },
  { n: 6, t: "RIEL DE INYECTORES" },
  { n: 7, t: "REVISION DEL SELLO HERMETICO DE LAS TOBERAS (MULTIPLE DE ADMISION)" },
  { n: 8, t: "REVISION DE LOS PICOS DE LOS INYECTORES (PARAMETRO : 2.2 mm)" },
  { n: 9, t: "FILTRO DE FASE GASEOSA" },
  { n: 10, t: "MULTIVALVULA" },
  { n: 11, t: "TOMA DE CARGA" },
  { n: 12, t: "TANQUE TOROIDAL DE GAS (INCLINACION DE TANQUE)" },
  { n: 13, t: "SENSOR DE NIVEL" },
  { n: 14, t: "PORTAFUSIBLES" },
  { n: 15, t: "CAÑERIAS DE GAS" },
  { n: 16, t: "VERIFICAR QUE LOS PERNOS DE SUJECION DE CAÑERIA NO ROCE EL RAMAL ELECTRONICO DEL AUTO" },
  { n: 17, t: "CONMUTADOR" },
  { ok: "OK" },
  { n: 18, t: "VERIFICAR TORQUE DE AJUSTES DE ABRAZADERAS DE MANGUERA DE AGUA" },
  { n: 19, t: "VERIFICAR TORQUE DE AJUSTES DE ABRAZADERAS DE MANGUERA DE GAS" },
  { n: 20, t: "VERIFICAR TORQUE DE AJUSTES DE ABRAZADERAS DE MANGUERA VACIO" },
  { ok: "OK" },
  { n: 21, t: "MANGUERAS DE AGUA" },
  { n: 22, t: "CONEXIONES \"T\"" },
  { n: 23, t: "BRIDAS DEL REDUCTOR" },
  { n: 24, t: "VERIFICAR CONCENTRACION DEL LIQUIDO REFRIGERANTE CON EL REFRACTOMETRO" },
  { n: 25, t: "VERIFICAR NIVEL DE REFRIGERANTE DEL MOTOR Y AJUSTE DE TAPA DEL DEPOSITO DE REFRIGERANTE" },
  { ok: "OK" },
  { n: 26, t: "REDUCTOR DE PRESION" },
  { n: 27, t: "RIEL DE INYECTORES" },
  { n: 28, t: "FILTRO DE FASE GASEOSA" },
  { n: 29, t: "MULTIVALVULA" },
  { n: 30, t: "TOMA DE CARGA" },
  { n: 31, t: "TANQUE DE GAS" },
  { n: 32, t: "CAÑERIAS DE GAS" },
  { ok: "OK" },
  { n: 33, t: "RAMAL PRINCIPAL" },
  { n: 34, t: "RIEL DE INYECTORES", alto: 10.8 },
  { n: 35, t: "PORTAFUSIBLES" },
  { n: 36, t: "CONMUTADOR" },
  { n: 37, t: "SENSOR DE NIVEL", alto: 10.8 },
  { n: 38, t: "EMULADOR DE NIVEL DE GASOLINA", alto: 10.8 },
  { n: 39, t: "REVISION DEL RAMAL DE MOTOR AL INTERIOR, POR DEBAJO DEL PISO DE COPILOTO", alto: 10.8 },
  { ok: "OK" },
  // Las dos filas de parámetros llevan el valor de cada familia: V7 al
  // final del texto, V5 V3 y X70 en cajas aparte. El texto trae los
  // espacios del Excel: con ellos "1.28 BAR V7" cae al final de la celda,
  // como en el papel. Cada modelo raya los valores que no son suyos.
  { n: 40, tipo: "param", t: "VERIFICAR LONGITUD DE MANGUERAS DE INYECCION  ", v7: "(14,13,13,14 ) V7",
    v5v3: "(12.5,11.5,11.5,12.5) V5 V3", x70: "( 13,11,11,13 ) X70" },
  { n: 41, tipo: "param", t: "PRESIONDE GAS PARAMETRO                                                     ", v7: "1.28 BAR V7",
    v5v3: "1.25bar                       V5 V3", x70: "1.25bar             X70" },
  { n: 42, t: "PRESION MAP", alto: 10.8 },
  { n: 43, t: "TEMPERATURA DEL REDUCTOR", alto: 10.8 },
  { n: 44, t: "LECTURA RPM" },
  { n: 45, t: "APORTE DE GASOLINA" },
  { n: 46, t: "AUTOADAPTACION OBD ACTIVADO" },
  { n: 47, t: "TIEMPO DE INYECION DE GASOLINA" },
  { n: 48, t: "TIEMPO DE INYECCION DE GAS", alto: 10.8 },
  { n: 49, t: "LECTURA DE CORRECTORES DE CORTO Y LARGO PLAZO (LO MAS CERCANO A CERO)" },
  { n: 50, t: "VERIFICAR FUNCIONAMIENTO DEL SENSOR DE OXIGENO 1", alto: 10.8 },
  { n: 51, t: "VERIFICAR FUNCIONAMIENTO DEL SENSOR DE OXIGENO 2", alto: 10.8 },
  { n: 52, t: "VERIFICAR CONFIGURACION DEL SISTEMA DE GAS Y ESCANEAR" },
  { n: 53, t: "VERIFICAR ACTUALIZACION DEL FIRMWARE" },
  { n: 54, t: "VERIFICAR PARAMETROS DEL NIVEL DE GAS", alto: 10.8 },
  { n: 55, t: "VERIFICAR ACTIVACION DEL EMULADOR DE COMBUSTIBLE", alto: 10.8 },
  { n: 56, t: "VERIFICAR FUNCIONES DEL CONMUTADOR", alto: 10.8 },
  { n: 57, t: "VERIFICAR EL CORRECTO ANALISIS DE GASES Y ENGRAMPAR LA WINCHA EN LA ORDEN DE TRABAJO" },
  // En el Excel este bloque dice "ok" en minúscula y en 11. Errata suya: se respeta.
  { ok: "ok", grande: true },
  { n: 58, t: "MANUAL DE OPERACIÓN", alto: 10.8 },
  { n: 59, t: "VALVULA DE CARGA" },
  { n: 60, t: "ACCESORIOS ORIGINALES EN EL INTERIOR DEL VEHICULO" },
  { n: 61, t: "INSTALACION DE LA VARILLA DEL NIVEL DE ACEITE" },
  { n: 62, t: "INSTALACION DE LA TAPA DE MOTOR", alto: 10.8 },
  { n: 63, t: "INSTALACION DE LA TAPA SUPERIOR DE LA CAJA DE FUSIBLES" },
  { n: 64, t: "VERIFICAR EL CORRECTO AJUSTE DE LAS TAPAS DE BATERIA" },
  { ok: "OK" },
  { n: 65, t: "INYECTORES DE GASOLINA CONECTADOS" },
  { n: 66, t: "INYECTORES DE GAS CONECTADOS", alto: 10.8 },
  { n: 67, t: "MANGUERAS DE INYECCION DE GAS CONECTADOS", alto: 9 },
  // La bujía la firma quien midió la compresión, no el inspector: su
  // casilla va en blanco y la nota lo dice.
  { n: 68, tipo: "nota", t: "BUJIAS INSTALADAS Y CONECTADAS",
    nota: "(TECNICO ENCARGADO DE MEDIR LA COMPRESION DEL VEHICULO)", alto: 10.8 },
  { n: 69, t: "BOBINAS CONECTADAS", alto: 10.8 },
  { n: 70, t: "VARILLA DE ACEITE DEL MOTOR COLOCADA EN SU SITIO", alto: 10.8 },
  { n: 71, t: "TAPA DE CAJAS DE FUSIBLE COLOCADA EN SUS SITIO", alto: 10.8 },
  { n: 72, t: "FUSIBLE DE BOMBA DE GASOLINA CONECTADO" },
  { n: 73, t: "BORNE POSITIVO DE BATERIA CERRADO" },
  { n: 74, t: "TAPA CUBIERTA DE MOTOR COLOCADA EN SU SITIO" },
  { n: 75, t: "VERIFICAR Y COMPARAR EL INVENTARIO DE ARAÑONES Y PERTENENCIA AL FINALIZAR EL SERVICIO", alto: 10.8 },
];

// Lo que cambia de un modelo a otro: título, cómo se escribe el carro y
// qué marca lleva cada punto. Todo punto va "ok" salvo lo que diga `marcas`
// ("" = en blanco, "x" = fija, "-" = ese modelo no lo lleva). `parametros`
// es la familia cuyos valores valen en las filas 40-41 ("v7", "v5v3",
// "x70", o null si no vale ninguna): las demás salen rayadas, y la casilla
// va con ok. La clave es el modelo de normalizeModelo_ sin la marca.
//
// Los "-" son puntos que ese modelo normalmente no lleva: en el modal del
// inspector salen en rojo (ver views/conversion/modals/hoja-cc.js); en el
// papel, solo el guion. Los "x" no salen en el modal: siempre van así.
//
// Un carro de un modelo que no esté aquí no se puede pedir (ver modeloCc_).
const MARCAS_BASE = { 22: "", 38: "", 50: "x", 51: "x", 53: "", 55: "", 68: "" };
const sinLlevar_ = (...ns) => ({ ...MARCAS_BASE, ...Object.fromEntries(ns.map(n => [n, "-"])) });

export const CC_MODELOS = {
  X70: {
    titulo: "CONTROL FINAL -JETOUR X70",
    marca: "JETOUR",
    modelo: "X70 FL",
    parametros: "x70",
    marcas: MARCAS_BASE,
  },
  // V3 y V5: como el X70, pero valen los parámetros de V5 V3.
  V3: { titulo: "CONTROL FINAL -KYC V3", marca: "KYC", modelo: "V3", parametros: "v5v3", marcas: MARCAS_BASE },
  V5: { titulo: "CONTROL FINAL -KYC V5", marca: "KYC", modelo: "V5", parametros: "v5v3", marcas: MARCAS_BASE },
  // V7: valen los parámetros de V7. No lleva conexiones "T" ni emulador.
  V7: { titulo: "CONTROL FINAL -KYC V7", marca: "KYC", modelo: "V7", parametros: "v7", marcas: sinLlevar_(22, 38, 55) },
  // X5: ninguna familia de parámetros es la suya, se rayan las tres. No
  // lleva emulador.
  X5: { titulo: "CONTROL FINAL -KYC X5", marca: "KYC", modelo: "X5", parametros: null, marcas: sinLlevar_(38, 55) },
  // Volkswagen: se rayan las tres familias. No lleva conexiones "T".
  POLO: { titulo: "CONTROL FINAL -VOLKSWAGEN POLO", marca: "VOLKSWAGEN", modelo: "POLO", parametros: null, marcas: sinLlevar_(22) },
  TERA: { titulo: "CONTROL FINAL -VOLKSWAGEN TERA", marca: "VOLKSWAGEN", modelo: "TERA", parametros: null, marcas: sinLlevar_(22) },
};

/** "Jetour X70, KYC V3…" — para decir qué hojas hay cuando falta una. */
export const MODELOS_CC_TEXTO = Object.values(CC_MODELOS).map(c => `${c.marca === "JETOUR" ? "Jetour" : c.marca} ${c.modelo.split(" ")[0]}`).join(", ");

/** La hoja CC de un modelo canónico ("Jetour X70"), o null si no hay. */
/** Lo que lleva el punto n en un modelo, antes de que el inspector toque nada. */
export const marcaModelo_ = (cc, n) => cc.marcas?.[n] ?? "ok";

/**
 * Las marcas que mandó el navegador, limpias: solo puntos que existen,
 * solo ok / x / en blanco, y solo lo que difiere del modelo.
 */
export function limpiarMarcasCc_(cc, marcas) {
  const validos = new Set(CC_FILAS.filter(f => f.n).map(f => f.n));
  const out = {};
  for (const [k, v] of Object.entries(marcas && typeof marcas === "object" ? marcas : {})) {
    const n = Number(k);
    if (!validos.has(n) || !["ok", "x", "-", ""].includes(v)) continue;
    if (v !== marcaModelo_(cc, n)) out[n] = v;
  }
  return out;
}

export function modeloCc_(modeloCanon) {
  const clave = String(modeloCanon || "").trim().toUpperCase().split(" ").slice(1).join(" ");
  return CC_MODELOS[clave] || null;
}

// Anchos de B, D..K en mm impresos.
// px = anchoExcel * 7 + 5 ;  mm = px * 25.4/96 * 0.79   (el 79 es pageSetup)
const ANCHOS_MM = [
  5.11,    // B  marco izquierdo
  27.06,   // D  ┐
  43.80,   // E  │
  25.43,   // F  │ texto del punto
  6.57,    // G  │
  19.25,   // H  │
  7.22,    // I  ┘
  8.04,    // J  la casilla del ok
  10.96,   // K  marco derecho
];

const ALTOS = { 10.8: "h108", 9: "h9" };

/**
 * Una hoja CONTROL FINAL lista para el papel.
 * @param {object} d
 * @param {object} d.cc       entrada de CC_MODELOS
 * @param {string} d.fecha    dd-mm-aaaa — el día en que se pidió
 * @param {string} d.vin
 * @param {string} d.tecnico  el inspector que la pidió
 * @param {object} d.marcas   lo que el inspector cambió: { n: "ok" | "x" | "" }
 */
export function hojaCcHtml({ cc, fecha = "", vin = "", tecnico = "", marcas = {} } = {}) {
  const E = escapeHtml;
  const D = (v) => `<span class="ccDato">${E(v)}</span>`;
  const marca = (n) => marcas?.[n] ?? marcaModelo_(cc, n);
  const cols = ANCHOS_MM.map(w => `<col style="width:${w}mm">`).join("");
  const borde = (dentro, clase = "") =>
    `<tr${clase ? ` class="${clase}"` : ""}><td class="ccIzq"></td>${dentro}<td class="ccDer"></td></tr>`;

  const filas = CC_FILAS.map((f) => {
    if (f.ok) {
      return borde(`<td class="ccGris" colspan="6"></td><td class="ccGris ccOkBloque${f.grande ? " is-grande" : ""}">${E(f.ok)}</td>`);
    }
    const alto = ALTOS[f.alto] || "";
    if (f.tipo === "param") {
      const v = (fam) => (fam !== cc.parametros ? `<s class="ccRaya">${E(f[fam])}</s>` : E(f[fam]));
      return borde(`
        <td class="ccTxt" colspan="2">${E(f.t)}${v("v7")}</td>
        <td class="ccTxt ccCaja" colspan="2">${v("v5v3")}</td>
        <td class="ccTxt ccCaja" colspan="2">${v("x70")}</td>
        <td class="ccOk ccOkParam">${E(marca(f.n))}</td>`, alto);
    }
    if (f.tipo === "nota") {
      return borde(`
        <td class="ccTxt ccSinDer" colspan="2">${E(f.t)}</td>
        <td class="ccTxt ccSinIzq" colspan="4">${E(f.nota)}</td>
        <td class="ccOk">${E(marca(f.n))}</td>`, alto);
    }
    return borde(`<td class="ccTxt" colspan="6">${E(f.t)}</td><td class="ccOk">${E(marca(f.n))}</td>`, alto);
  }).join("");

  return `
  <div class="ccHoja">
    <div class="ccMarco">
      <img class="ccLogo" src="/img/logo-sum-gas.png" alt="">
      <table class="ccTabla">
        <colgroup>${cols}</colgroup>
        <tbody>
          <tr class="ccR2"><td class="ccIzq ccArriba"></td><td class="ccGris ccArriba" colspan="7"></td><td class="ccDer ccArriba"></td></tr>
          ${borde(`<td class="ccTitulo" colspan="7">${E(cc.titulo)}</td>`, "ccR3")}
          ${borde(`
            <td class="ccCab">FECHA: ${D(fecha)}</td>
            <td class="ccCab ccSinArriba" colspan="2">MARCA: ${D(cc.marca)}<span class="ccModelo">MODELO: ${D(cc.modelo)}</span></td>
            <td class="ccCab"></td>
            <td class="ccCab" colspan="3">VIN: ${D(vin)}</td>`, "ccR4")}
          ${borde(`<td class="ccGris" colspan="7"></td>`, "ccR5")}
          ${filas}
          ${borde(`
            <td class="ccPie" colspan="4">TÉCNICO: <span class="ccDato ccTecnico">${E(tecnico)}</span></td>
            <td class="ccPie" colspan="3">SEDE: ${D("SUM  CALLAO")}</td>`, "h108")}
          <tr class="ccR90"><td class="ccIzq ccAbajo"></td><td class="ccGris ccAbajo" colspan="7"></td><td class="ccDer ccAbajo"></td></tr>
        </tbody>
      </table>
    </div>
  </div>`;
}
