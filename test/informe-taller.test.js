// =========================
// test/informe-taller.test.js
// La hoja del Informe de Taller es una copia literal del Excel. Estos tests
// vigilan lo que no se ve hasta que sale el papel: que la rejilla cuadre.
//
// Una fila con una columna de más o de menos no rompe nada en pantalla —
// el navegador la acomoda igual — pero desalinea toda la hoja impresa.
// Sin este test, el error aparece recién con la hoja en la mano.
// =========================

import { describe, it, expect } from "vitest";
import {
  informeHojaHtml,
  DETALLE_TAREAS,
  TIPOS_TRABAJO,
} from "../public/js/templates/views/informe-taller-view.js";

const COLUMNAS = 12;   // B..M del Excel (la A no la usa ninguna celda)
const FILAS = 47;      // la hoja llega hasta la fila 47

/** Cuenta columnas reales por fila, respetando colspan y rowspan. */
function columnasPorFila(html) {
  const filas = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
  const arrastre = new Array(filas.length + 10).fill(0);

  return filas.map((f, i) => {
    let n = arrastre[i];
    for (const c of f.matchAll(/<td([^>]*)>/g)) {
      const cs = +((c[1].match(/colspan="(\d+)"/) || [])[1] || 1);
      const rs = +((c[1].match(/rowspan="(\d+)"/) || [])[1] || 1);
      n += cs;
      for (let k = 1; k < rs; k++) arrastre[i + k] += cs;
    }
    return n;
  });
}

/** Texto plano de la hoja. Deja afirmar sobre el CONTENIDO sin atarse al
 *  marcado: los datos van envueltos en <span class="dato"> para salir en
 *  azul, y eso no debería romper un test de contenido. */
function texto(html) {
  return html.replace(/<[^>]+>/g, "");
}

/** Cuenta las celdas de una clase que llevan OK escrito dentro. */
function cuentaOk(html, clase) {
  return [...html.matchAll(/<td class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)]
    .filter(m => m[1].split(/\s+/).includes(clase) && m[2].includes("OK"))
    .length;
}

const hoja = (extra = {}) => informeHojaHtml({
  ot: "12345", placa: "ABC-123",
  tecnicos: ["JUAN PEREZ", "LUIS RAMOS"],
  ...extra,
});

describe("Informe de Taller — rejilla de la hoja", () => {
  it("tiene las 47 filas del Excel", () => {
    expect(columnasPorFila(hoja())).toHaveLength(FILAS);
  });

  it("cada fila suma exactamente 12 columnas", () => {
    const desalineadas = columnasPorFila(hoja())
      .map((n, i) => (n === COLUMNAS ? null : `fila ${i + 1}: ${n}`))
      .filter(Boolean);
    expect(desalineadas).toEqual([]);
  });

  it("no se descuadra al crecer las observaciones", () => {
    // Más renglones de los que caben: los de sobra se descartan, la hoja no
    // puede estirarse o dejaría de ser una sola página.
    const html = hoja({ observaciones: Array.from({ length: 30 }, (_, i) => `obs ${i}`).join("\n") });
    expect(columnasPorFila(html)).toHaveLength(FILAS);
    expect(columnasPorFila(html).every(n => n === COLUMNAS)).toBe(true);
  });
});

describe("Informe de Taller — contenido", () => {
  it("pinta los datos del vehículo que le pasan", () => {
    const t = texto(hoja());
    expect(t).toContain("JETOUR");
    expect(t).toContain("X70");
    expect(t).toContain("12345");
    expect(t).toContain("ABC-123");
  });

  it("marca con OK solo la casilla del trabajo elegido", () => {
    const html = hoja({ trabajo: "GARANTIA" });
    // Una sola casilla (clase x1) puede llevar OK dentro.
    expect(cuentaOk(html, "x1")).toBe(1);
    expect(html).toContain("GARANTIA");
  });

  it("marca con OK las tareas indicadas y solo esas", () => {
    const html = hoja({ tareas: [0, 3] });
    expect(cuentaOk(html, "itOk")).toBe(2);
  });

  it("junta a los dos técnicos en la única línea de nombres del Excel", () => {
    expect(texto(hoja())).toContain("JUAN PEREZ   /   LUIS RAMOS");
  });

  it("escapa el texto: una placa con HTML no rompe la hoja", () => {
    const html = hoja({ placa: '<script>alert(1)</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("conserva el texto del Excel tal cual, con sus erratas", () => {
    // El documento es el que la empresa firma; corregirlo aquí lo haría
    // dejar de coincidir con el que ya tienen archivado en papel.
    expect(DETALLE_TAREAS[2]).toBe("* instalcion GLP (CC del tecnico)");
    expect(TIPOS_TRABAJO).toHaveLength(9);
  });
});

// =========================
// Las otras dos hojas del juego: Lista de Chequeo y Registro de Producción.
// Mismo criterio que arriba — lo que se vigila es la rejilla, porque un
// descuadre no se ve hasta que sale el papel.
// =========================

import { hojaChequeoHtml, CHEQUEO_PUNTOS, puntosDeRol_ } from "../public/js/templates/views/hoja-chequeo-view.js";
import { hojaProduccionHtml, PRODUCCION_TECNICOS } from "../public/js/templates/views/hoja-produccion-view.js";

const chequeo = (extra = {}) => hojaChequeoHtml({
  fecha: "21-09-2026", vin: "LVUDB11B0RF021419",
  tecnicos: ["JUAN PEREZ", "LUIS RAMOS"],
  bateria: { v: "12.4", ai: "0.02", af: "13.9" },
  cilindros: ["180", "182", "179", "181"],
  tanquero: "PEPE JEANS",
  ...extra,
});

describe("Lista de Chequeo — rejilla", () => {
  it("tiene las 46 filas del Excel (de la 2 a la 47)", () => {
    expect(columnasPorFila(chequeo())).toHaveLength(46);
  });

  it("cada fila suma exactamente 18 columnas", () => {
    const malas = columnasPorFila(chequeo())
      .map((n, i) => (n === 18 ? null : `fila ${i + 1}: ${n}`))
      .filter(Boolean);
    expect(malas).toEqual([]);
  });
});

describe("Lista de Chequeo — contenido", () => {
  it("marca los 32 puntos por defecto", () => {
    expect(cuentaOk(chequeo(), "c42")).toBe(32);
  });

  it("respeta los puntos que el técnico desmarca", () => {
    expect(cuentaOk(chequeo({ marcados: [0, 1] }), "c42")).toBe(2);
  });

  it("pone las mediciones donde van", () => {
    const t = texto(chequeo());
    expect(t).toContain("V= 12.4");
    expect(t).toContain("A.f= 13.9");
    expect(t).toContain("CIL3: 179");
    expect(t).toContain("LVUDB11B0RF021419");
  });

  it("el tanquero firma el punto 28", () => {
    expect(texto(chequeo())).toContain("PEPE JEANS");
  });

  it("conserva la errata del Excel: dos puntos numerados 28", () => {
    // No es un descuido nuestro. El Excel que la empresa archiva los tiene
    // así, y el papel nuevo tiene que poder compararse con los viejos.
    const veintiocho = CHEQUEO_PUNTOS.filter(p => p.n === 28);
    expect(veintiocho).toHaveLength(2);
  });
});

describe("Registro de Producción — rejilla", () => {
  it("tiene las 28 filas del Excel (de la 4 a la 31)", () => {
    expect(columnasPorFila(hojaProduccionHtml({}))).toHaveLength(28);
  });

  it("cada fila suma exactamente 12 columnas", () => {
    const malas = columnasPorFila(hojaProduccionHtml({ ot: "1" }))
      .map((n, i) => (n === 12 ? null : `fila ${i + 1}: ${n}`))
      .filter(Boolean);
    expect(malas).toEqual([]);
  });

  it("trae los 20 nombres ya impresos", () => {
    const html = hojaProduccionHtml({});
    const t = texto(html);
    for (const n of PRODUCCION_TECNICOS) expect(t).toContain(n);
  });
});

describe("Registro de Producción — reparto de técnicos", () => {
  it("pone las horas en la fila del técnico que ya está impreso", () => {
    const html = hojaProduccionHtml({
      filas: [{ nombre: "HENRY LUZA", inicio: "08:00", fin: "12:00" }],
    });
    expect(texto(html)).toContain("08:00");
    // No debe duplicar el nombre: usa su fila, no un hueco libre.
    expect([...html.matchAll(/HENRY LUZA/g)]).toHaveLength(1);
  });

  it("al que no está en la lista lo manda a un hueco libre", () => {
    const html = hojaProduccionHtml({ filas: [{ nombre: "ALGUIEN NUEVO", inicio: "09:00" }] });
    const t = texto(html);
    expect(t).toContain("ALGUIEN NUEVO");
    expect(t).toContain("09:00");
  });

  it("no le importan mayúsculas ni espacios al buscar el nombre", () => {
    const html = hojaProduccionHtml({ filas: [{ nombre: "  henry luza ", inicio: "07:30" }] });
    expect([...html.matchAll(/HENRY LUZA/g)]).toHaveLength(1);
    expect(texto(html)).toContain("07:30");
  });
});

describe("Registro de Producción — qué se marca y qué queda en blanco", () => {
  it("escribe OK, no una X ni la hora", () => {
    const html = hojaProduccionHtml({
      filas: [{ nombre: "HENRY LUZA", marcas: { mecanica: true } }],
    });
    expect(cuentaOk(html, "p1")).toBe(1);
  });

  it("deja SIEMPRE en blanco cableado, calibración y control de calidad", () => {
    // Esas tres las firma otra área, no quien entrega el carro. Aunque
    // alguien las mande marcadas por error, no deben salir impresas.
    const html = hojaProduccionHtml({
      filas: [{ nombre: "HENRY LUZA", marcas: { cableado: true, calibracion: true, calidad: true } }],
    });
    expect(cuentaOk(html, "p1")).toBe(0);
  });

  it("marca solo las etapas que le pasan, no todas", () => {
    const html = hojaProduccionHtml({
      filas: [{ nombre: "HENRY LUZA", marcas: { compresion: true, tanque: true } }],
    });
    expect(cuentaOk(html, "p1")).toBe(2);
  });

  it("cada técnico lleva sus propias horas, no las comparte", () => {
    const html = hojaProduccionHtml({
      filas: [
        { nombre: "HENRY LUZA", inicio: "08:00", fin: "12:00" },
        { nombre: "PEPE JEANS", inicio: "09:15", fin: "13:40" },
      ],
    });
    const t = texto(html);
    for (const h of ["08:00", "12:00", "09:15", "13:40"]) expect(t).toContain(h);
  });
});

describe("Lista de Chequeo — la firma del punto 28", () => {
  it("pone el nombre del tanquero en la MISMA línea que FIRMA:", () => {
    // Estuvo cayendo en el renglón de abajo. En el papel eso se lee como si
    // la firma no correspondiera a ese punto.
    const filas = chequeo().match(/<tr>[\s\S]*?<\/tr>/g);
    const laDeFirma = filas.find(f => f.includes("FIRMA:"));
    expect(texto(laDeFirma)).toContain("PEPE JEANS");
  });

  it("el renglón de debajo queda vacío, solo con su OK impreso", () => {
    const filas = chequeo().match(/<tr>[\s\S]*?<\/tr>/g);
    const i = filas.findIndex(f => f.includes("FIRMA:"));
    expect(texto(filas[i + 1])).not.toContain("PEPE JEANS");
    expect(cuentaOk(filas[i + 1], "c44")).toBe(1);
  });

  it("conserva los espacios que separan RH de FIRMA:", () => {
    // Sin white-space:pre el HTML los colapsa y sale "POST RH FIRMA:".
    const html = chequeo();
    expect(texto(html)).toMatch(/POST RH {5,}FIRMA:/);
    expect(html).toContain("cjPre");
  });
});

describe("El dato escrito va en azul, el formulario en negro", () => {
  // Sirve para que en el papel se distinga de un vistazo qué venía impreso
  // y qué se rellenó. La clase .dato es la que lleva el color.
  const enAzul = (html) =>
    [...html.matchAll(/<span class="dato">([\s\S]*?)<\/span>/g)].map(m => m[1]);

  it("el Informe pinta OT, placa y técnicos, pero no sus rótulos", () => {
    const azules = enAzul(hoja());
    expect(azules).toContain("12345");
    expect(azules).toContain("ABC-123");
    expect(azules.some(a => a.includes("JUAN PEREZ"))).toBe(true);
    expect(azules).not.toContain("MARCA :");
    expect(azules).not.toContain("INFORME DE TALLER");
  });

  it("la Lista de Chequeo pinta VIN, mediciones y tanquero", () => {
    const azules = enAzul(chequeo());
    expect(azules).toContain("LVUDB11B0RF021419");
    expect(azules).toContain("12.4");
    expect(azules).toContain("179");
    expect(azules).toContain("PEPE JEANS");
    // El texto de los puntos es del formulario: va en negro.
    expect(azules.some(a => a.includes("REPOSTAJE"))).toBe(false);
  });

  it("en Producción los 20 nombres impresos siguen en negro", () => {
    // Son parte del formulario, no los escribimos nosotros. Si salieran en
    // azul, el papel mentiría sobre quién rellenó qué.
    const html = hojaProduccionHtml({
      filas: [{ nombre: "HENRY LUZA", inicio: "08:00" }],
    });
    const azules = enAzul(html);
    expect(azules).not.toContain("HENRY LUZA");
    expect(azules).toContain("08:00");
  });

  it("en Producción el técnico que va a un hueco libre SÍ va en azul", () => {
    const azules = enAzul(hojaProduccionHtml({ filas: [{ nombre: "ALGUIEN NUEVO" }] }));
    expect(azules).toContain("ALGUIEN NUEVO");
  });

  it("no pinta de azul los huecos vacíos", () => {
    // Un <span> vacío en cada celda en blanco ensuciaría el HTML sin aportar.
    expect(enAzul(hojaProduccionHtml({})).filter(a => a === "")).toHaveLength(0);
  });
});

describe("Lista de Chequeo — la línea de la batería", () => {
  it("mantiene las tres lecturas: V, A.i y A.f", () => {
    // Se perdieron V y A.i cuando el flex se puso en el <td>: el navegador
    // sacaba la celda del layout de tabla y partía la fila. El flex tiene
    // que ir en un <div> dentro de la celda.
    const t = texto(chequeo());
    expect(t).toContain("PRUEBA DE BATERIA:");
    expect(t).toContain("V= 12.4");
    expect(t).toContain("A.i= 0.02");
    expect(t).toContain("A.f= 13.9");
  });

  it("no pone display:flex en la celda, sino en un div dentro", () => {
    const html = chequeo();
    expect(html).not.toMatch(/<td[^>]*class="[^"]*cjBateria/);
    expect(html).toMatch(/<td[^>]*><div class="cjBateria">/);
  });

  it("la fila de la batería sigue cuadrando en 18 columnas", () => {
    const filas = columnasPorFila(chequeo());
    expect(filas.every(n => n === 18)).toBe(true);
  });
});

describe("Lista de Chequeo — quién marca cada punto", () => {
  // El reparto sale del papel: el bloque del tanque va del 21 al 28 y acaba
  // justo donde el tanquero firma. Enseñar los 32 a los dos hacía fácil
  // desmarcar por error algo del compañero.
  it("lo exclusivo del tanquero va del 21 al 28", () => {
    // puntosDeRol_ incluye a propósito los de AMBOS (3-5), así que aquí se
    // miran solo los que son suyos y de nadie más.
    const suyos = puntosDeRol_("TANQUE")
      .map(i => CHEQUEO_PUNTOS[i])
      .filter(p => p.rol === "TANQUE")
      .map(p => p.n);
    expect(Math.min(...suyos)).toBe(21);
    expect(Math.max(...suyos)).toBe(28);
    expect(suyos).toHaveLength(8);
  });

  it("el delantero ve todo lo demás", () => {
    const suyos = puntosDeRol_("MOTOR").map(i => CHEQUEO_PUNTOS[i].n);
    expect(suyos).toContain(6);
    expect(suyos).toContain(33);
    expect(suyos).not.toContain(21);
  });

  it("los puntos 3, 4 y 5 los ven los dos", () => {
    const m = puntosDeRol_("MOTOR").map(i => CHEQUEO_PUNTOS[i].n);
    const t = puntosDeRol_("TANQUE").map(i => CHEQUEO_PUNTOS[i].n);
    for (const n of [3, 4, 5]) {
      expect(m).toContain(n);
      expect(t).toContain(n);
    }
  });

  it("entre los dos cubren los 32 puntos, sin dejar ninguno huérfano", () => {
    const todos = new Set([...puntosDeRol_("MOTOR"), ...puntosDeRol_("TANQUE")]);
    const marcables = CHEQUEO_PUNTOS.filter(p => !p.separador && !p.firmaLinea).length;
    expect(todos.size).toBe(marcables);
  });

  it("de los dos puntos 28, el de la FIRMA es del tanquero", () => {
    // La errata del Excel: hay dos numerados 28. El primero es donde firma
    // el tanquero; el segundo, instrumentos de tablero, es del delantero.
    const dos = CHEQUEO_PUNTOS.filter(p => p.n === 28);
    expect(dos[0].rol).toBe("TANQUE");
    expect(dos[0].firma).toBe(true);
    expect(dos[1].rol).toBe("MOTOR");
  });
});
