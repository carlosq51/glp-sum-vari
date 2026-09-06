import { describe, it, expect } from "vitest";

const { theilSen_, lineaTendencia_, lecturaTendencia_, mediana_ } =
  await import("../lib/regresion.js");

// El motivo de que esto no sea mínimos cuadrados: los datos del taller traen
// carros de catorce horas que son OLVIDOS DE CERRAR, no trabajo lento. Estos
// tests fijan justo eso — que un puñado de basura no mueva la recta.

describe("mediana_", () => {
  it("impares y pares", () => {
    expect(mediana_([3, 1, 2])).toBe(2);
    expect(mediana_([4, 1, 3, 2])).toBe(2.5);
  });
  it("ignora lo que no es número", () => {
    expect(mediana_([1, null, 2, undefined, 3, NaN])).toBe(2);
  });
  it("sin datos devuelve NaN, no 0 — que sería una mentira", () => {
    expect(mediana_([])).toBeNaN();
    expect(mediana_(null)).toBeNaN();
  });
});

describe("theilSen_", () => {
  it("recupera una recta perfecta", () => {
    // y = 10 - 2x
    const p = [0, 1, 2, 3, 4].map(x => ({ x, y: 10 - 2 * x }));
    const m = theilSen_(p);
    expect(m.ok).toBe(true);
    expect(m.pendiente).toBeCloseTo(-2, 10);
    expect(m.intercepto).toBeCloseTo(10, 10);
  });

  it("AGUANTA el carro de 14 horas que nadie cerró", () => {
    // Tendencia real: baja 2 por día. Un punto disparatado en medio.
    const p = [0, 1, 2, 3, 4, 5, 6].map(x => ({ x, y: 10 - 2 * x }));
    p[3] = { x: 3, y: 840 };                       // 14 h en minutos
    const m = theilSen_(p);
    expect(m.pendiente).toBeCloseTo(-2, 6);        // la recta ni se entera
  });

  it("aguanta VARIOS outliers (hasta ~29% de los datos)", () => {
    const p = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(x => ({ x, y: 100 - 5 * x }));
    p[2] = { x: 2, y: 900 };
    p[7] = { x: 7, y: 950 };
    expect(theilSen_(p).pendiente).toBeCloseTo(-5, 6);
  });

  it("con una sola jornada NO inventa tendencia", () => {
    // Todos el mismo día: no hay eje sobre el que medir mejora.
    const m = theilSen_([{ x: 5, y: 100 }, { x: 5, y: 200 }, { x: 5, y: 150 }]);
    expect(m.ok).toBe(false);
  });

  it("con menos de dos puntos tampoco", () => {
    expect(theilSen_([]).ok).toBe(false);
    expect(theilSen_([{ x: 1, y: 1 }]).ok).toBe(false);
    expect(theilSen_(null).ok).toBe(false);
  });

  it("descarta puntos con datos rotos en vez de propagar NaN", () => {
    const p = [
      { x: 0, y: 10 }, { x: 1, y: 8 }, { x: 2, y: 6 },
      { x: NaN, y: 4 }, { x: 3, y: null },
    ];
    const m = theilSen_(p);
    expect(m.ok).toBe(true);
    expect(m.n).toBe(3);
    expect(m.pendiente).toBeCloseTo(-2, 10);
  });
});

describe("lineaTendencia_", () => {
  it("da los dos extremos para dibujar", () => {
    const m = theilSen_([0, 1, 2].map(x => ({ x, y: 10 - 2 * x })));
    const [a, b] = lineaTendencia_(m, 0, 4);
    expect(a).toEqual({ x: 0, y: 10 });
    expect(b.y).toBeCloseTo(2, 10);
  });

  it("sin modelo utilizable no dibuja nada", () => {
    expect(lineaTendencia_({ ok: false }, 0, 4)).toEqual([]);
    expect(lineaTendencia_(null, 0, 4)).toEqual([]);
  });
});

describe("lecturaTendencia_ contra el objetivo de 3 h", () => {
  const UMBRAL = 180; // minutos

  it("por debajo del objetivo lo dice, sin anunciar cruces", () => {
    const m = theilSen_([0, 1, 2, 3].map(x => ({ x, y: 170 - x })));
    const r = lecturaTendencia_(m, UMBRAL, 3);
    expect(r.cumple).toBe(true);
    expect(r.texto).toContain("Por debajo");
  });

  it("bajando y con el cruce cerca: da los días", () => {
    // 200 min hoy, bajando 2/día → 10 días para llegar a 180.
    const m = theilSen_([0, 1, 2, 3, 4].map(x => ({ x, y: 208 - 2 * x })));
    const r = lecturaTendencia_(m, UMBRAL, 4);
    expect(r.cumple).toBe(false);
    expect(r.cruzaEn).toBeCloseTo(10, 6);
    expect(r.texto).toMatch(/10 días/);
  });

  it("bajando tan lento que anunciar una fecha sería mentir", () => {
    // Ritmo de 0.01/día: el cruce cae fuera del horizonte.
    const m = theilSen_([0, 1, 2, 3].map(x => ({ x, y: 300 - 0.01 * x })));
    const r = lecturaTendencia_(m, UMBRAL, 3);
    // null y no undefined a propósito: dice "se calculó y no cruza", que no
    // es lo mismo que "no se miró".
    expect(r.cruzaEn).toBeNull();
    expect(r.texto).toContain("muy lento");
  });

  it("subiendo lo dice sin adornos", () => {
    const m = theilSen_([0, 1, 2, 3].map(x => ({ x, y: 200 + 3 * x })));
    const r = lecturaTendencia_(m, UMBRAL, 3);
    expect(r.cumple).toBe(false);
    expect(r.texto).toContain("subiendo");
  });

  it("sin datos no finge una lectura", () => {
    const r = lecturaTendencia_({ ok: false }, UMBRAL, 0);
    expect(r.hay).toBe(false);
    expect(r.texto).toContain("Faltan datos");
  });
});
