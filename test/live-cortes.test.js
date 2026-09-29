// La tabla de cortes se ha rehecho tres veces porque cada versión se leía mal
// con datos reales. Esto fija lo que costó descubrir mirando el taller:
//
//   · un ramalero NO es un técnico de conversión, y mezclarlos hacía que el
//     que armó 8 ramales encabezara el día por encima de quien cerró 3 carros
//   · un carro lo cierran DOS personas, así que la suma de mitades nunca es el
//     número de carros
//   · quien está dentro del taller se marca, y no saber dónde está alguien no
//     es lo mismo que saber que se fue
import { describe, it, expect, beforeAll } from "vitest";

let cortesHTML_;

beforeAll(async () => {
  // sup-live.js es un módulo de vista: sus dependencias tocan document al
  // cargarse. Aquí solo se ejercita la generación de HTML, que es una función
  // pura de sus argumentos, así que basta con que el módulo pueda importarse.
  globalThis.document = {
    getElementById: () => null, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
  };
  globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ({ cortesHTML_ } = await import("../public/js/views/supervisor/sup-live.js"));
});

// 13:00Z = 08:00 en Lima → primera franja (05:00–10:00)
const MANANA = "2026-09-29T13:00:00Z";
// 16:00Z = 11:00 en Lima → segunda franja (10:00–13:00)
const MEDIODIA = "2026-09-29T16:00:00Z";
// 21:30Z = 16:30 en Lima → cuarta franja (16:20–19:20), justo pasado el corte
const TARDE = "2026-09-29T21:30:00Z";

const cierre = (updated_at) => ({ estado: "FINALIZADO", updated_at });

function tec(nombre, rol, cierres = [], extra = {}) {
  return {
    userId: nombre, nombre, rol, estadoActivo: "TRABAJANDO",
    asignacionesHoy: cierres.map(cierre), ...extra,
  };
}

describe("cortesHTML_", () => {
  it("separa a los de conversión de los de apoyo en dos tablas", () => {
    const html = cortesHTML_({ cierres: { conv: [], cal: [] } }, [
      tec("MOTORISTA UNO", "MOTOR", [MANANA]),
      tec("RAMALERO UNO", "RAMALERO", [MANANA, MANANA, MANANA]),
      tec("INSPECTOR UNO", "CALIDAD", [MANANA]),
    ]);

    expect(html).toContain("Técnicos de conversión");
    expect(html).toContain("Apoyo");
    // Dos tablas, no una con secciones: es lo que hace que los 3 ramales del
    // ramalero no compitan en el mismo ranking que las mitades del motorista.
    expect(html.match(/<table/g)).toHaveLength(2);
  });

  it("el ramalero no entra en la tabla de conversión", () => {
    const html = cortesHTML_({ cierres: { conv: [], cal: [] } }, [
      tec("MOTORISTA UNO", "MOTOR", [MANANA]),
      tec("RAMALERO UNO", "RAMALERO", [MANANA, MANANA, MANANA]),
    ]);
    const conversion = html.slice(html.indexOf("Técnicos de conversión"), html.indexOf("🤝 Apoyo"));
    expect(conversion).toContain("MOTORISTA UNO");
    expect(conversion).not.toContain("RAMALERO UNO");
  });

  it("los ramales no engordan el subtotal de mitades de carro", () => {
    const html = cortesHTML_({ cierres: { conv: [], cal: [] } }, [
      tec("MOTORISTA UNO", "MOTOR", [MANANA]),
      tec("RAMALERO UNO", "RAMALERO", [MANANA, MANANA, MANANA]),
    ]);
    const pie = html.slice(html.indexOf("Mitades cerradas"));
    // Una sola mitad en la primera franja: el 3 del ramalero no está aquí.
    expect(pie.slice(0, 200)).toContain(">1<");
    expect(pie.slice(0, 200)).not.toContain(">4<");
  });

  it("los carros completos van aparte de las mitades: los cierran dos personas", () => {
    const html = cortesHTML_(
      { cierres: { conv: [Date.parse(MANANA)], cal: [] } },
      [tec("MOTOR UNO", "MOTOR", [MANANA]), tec("TANQUE UNO", "TANQUE", [MANANA])],
    );
    expect(html).toContain("Mitades cerradas");
    expect(html).toContain("Carros completos");
  });

  it("cada cierre cae en su franja, incluido el corte en :20", () => {
    const html = cortesHTML_({ cierres: { conv: [], cal: [] } }, [
      tec("SOLO UNO", "MOTOR", [MANANA, MEDIODIA, TARDE]),
    ]);
    // Tres franjas distintas con 1, y el total a 3. Si el bucketeo colapsara
    // por hora, las 16:30 caerían en la franja de las 13:00.
    const fila = html.slice(html.indexOf("SOLO UNO"));
    expect(fila.slice(0, 400).match(/>1</g) || []).toHaveLength(3);
  });

  it("marca con un punto vivo a quien está en el taller", () => {
    const html = cortesHTML_({ cierres: { conv: [], cal: [] } }, [
      tec("DENTRO", "MOTOR", [MANANA], { asistencia: "PRESENTE", asistenciaAt: MANANA }),
    ]);
    expect(html).toContain('class="lvVivo"');
    expect(html).toContain("En el taller");
  });

  it("distingue estar en pausa de estar trabajando", () => {
    const html = cortesHTML_({ cierres: { conv: [], cal: [] } }, [
      tec("PARADO", "MOTOR", [MANANA], { asistencia: "PAUSA" }),
    ]);
    expect(html).toContain("lvVivo is-pausa");
    expect(html).toContain("En pausa");
  });

  it("sin marca no pinta nada: no saber dónde está alguien no es saber que se fue", () => {
    // Es el caso del módulo de despacho apagado. Marcar a todo el taller como
    // ausente sería afirmar algo que nadie ha comprobado.
    // Se mira solo la tabla: la nota del pie lleva un punto de muestra como
    // leyenda, y ese sí tiene que estar siempre.
    const tabla_ = (h) => h.slice(0, h.indexOf("lvCortes__nota"));
    const sinDato = cortesHTML_({ cierres: { conv: [], cal: [] } }, [tec("X", "MOTOR", [MANANA])]);
    const fuera   = cortesHTML_({ cierres: { conv: [], cal: [] } },
      [tec("Y", "MOTOR", [MANANA], { asistencia: "FUERA" })]);
    expect(tabla_(sinDato)).not.toContain("lvVivo");
    expect(tabla_(fuera)).not.toContain("lvVivo");
  });

  it("quien no vino hoy no ocupa una fila", () => {
    const html = cortesHTML_({ cierres: { conv: [], cal: [] } }, [
      tec("PRESENTE UNO", "MOTOR", [MANANA]),
      tec("AUSENTE UNO", "MOTOR", [], { estadoActivo: "DESCONECTADO" }),
    ]);
    expect(html).toContain("PRESENTE UNO");
    expect(html).not.toContain("AUSENTE UNO");
  });

  it("quien vino y no cerró nada sale, pero atenuado", () => {
    const html = cortesHTML_({ cierres: { conv: [], cal: [] } }, [
      tec("SIN PRODUCCION", "MOTOR", []),
    ]);
    expect(html).toContain("SIN PRODUCCION");
    expect(html).toContain("is-cero");
  });

  it("un cierre fuera de las franjas se avisa en vez de desaparecer", () => {
    // 08:00Z = 03:00 en Lima, entre el fin (01:00) y el inicio (05:00).
    const html = cortesHTML_({ cierres: { conv: [], cal: [] } }, [
      tec("NOCTURNO", "MOTOR", ["2026-09-29T08:00:00Z"]),
    ]);
    expect(html).toContain("fuera de las franjas");
  });

  it("sin nadie en pista no se pinta la tabla", () => {
    expect(cortesHTML_({ cierres: { conv: [], cal: [] } }, [])).toBe("");
    expect(cortesHTML_({ cierres: { conv: [], cal: [] } },
      [tec("A", "MOTOR", [], { estadoActivo: "DESCONECTADO" })])).toBe("");
  });

  it("sin gente de apoyo solo se pinta una tabla", () => {
    const html = cortesHTML_({ cierres: { conv: [], cal: [] } }, [tec("SOLO MOTOR", "MOTOR", [MANANA])]);
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html).not.toContain("🤝 Apoyo");
  });
});
