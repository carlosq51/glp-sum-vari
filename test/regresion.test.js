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

// ─── Percentiles y significancia ─────────────────────────────────────────────
// El eje del gráfico ya no lo fijan el mínimo y el máximo: el taller tiene
// registros de 7 segundos y de 947 horas, y con esos extremos la banda donde
// vive el 40% de los carros ocupaba el 0,4% del alto. Los límites salen de
// percentiles, y la tendencia solo habla si Mann–Kendall la respalda.

const { percentil_, mannKendall_ } = await import("../lib/regresion.js");

describe("percentil_", () => {
  it("los extremos son el mínimo y el máximo", () => {
    const xs = [1, 2, 3, 4, 5];
    expect(percentil_(xs, 0)).toBe(1);
    expect(percentil_(xs, 100)).toBe(5);
  });

  it("interpola entre dos valores en vez de saltar", () => {
    expect(percentil_([0, 10], 25)).toBeCloseTo(2.5, 6);
  });

  it("la mediana coincide con mediana_", () => {
    const xs = [3, 1, 4, 1, 5, 9, 2, 6];
    expect(percentil_(xs, 50)).toBeCloseTo(mediana_(xs), 9);
  });

  it("NO se mueve con el carro de 947 horas, que es lo que se le pide", () => {
    const sanos = Array.from({ length: 100 }, (_, i) => 2 + i / 100);
    const p95 = percentil_(sanos, 95);
    expect(percentil_([...sanos, 947], 95)).toBeCloseTo(p95, 1);
  });

  it("sin datos devuelve NaN, no 0", () => {
    expect(Number.isNaN(percentil_([], 50))).toBe(true);
  });
});

describe("mannKendall_", () => {
  it("una serie que baja siempre es tendencia significativa hacia abajo", () => {
    const r = mannKendall_(Array.from({ length: 20 }, (_, i) => 10 - i * 0.3));
    expect(r.ok).toBe(true);
    expect(r.significativa).toBe(true);
    expect(r.sentido).toBe(-1);
    expect(r.p).toBeLessThan(0.01);
  });

  it("un sube y baja simétrico NO es tendencia, aunque Theil–Sen dé pendiente", () => {
    const zigzag = [3, 2.8, 3.1, 2.9, 3.05, 2.85, 3.02, 2.95, 3.08, 2.9, 3, 2.98];
    const r = mannKendall_(zigzag);
    expect(r.ok).toBe(true);
    expect(r.significativa).toBe(false);
    expect(r.sentido).toBe(0);
  });

  it("con menos de 8 jornadas no finge saber", () => {
    expect(mannKendall_([1, 2, 3, 4]).ok).toBe(false);
  });

  it("una serie plana no tiene varianza y no inventa tendencia", () => {
    const r = mannKendall_(Array(15).fill(2.8));
    expect(r.significativa).toBe(false);
  });

  it("solo mira SIGNOS: un outlier absurdo no cambia el veredicto", () => {
    const base = Array.from({ length: 20 }, (_, i) => 10 - i * 0.3);
    const conBasura = [...base];
    conBasura[7] = 947;   // la OT que nadie cerró
    expect(mannKendall_(conBasura).sentido).toBe(-1);
  });
});

describe("lecturaTendencia_ con Mann–Kendall", () => {
  const UMBRAL = 3;

  it("si la pendiente es ruido, se calla la mejora y solo sitúa contra el objetivo", () => {
    const m = theilSen_([{ x: 0, y: 4 }, { x: 10, y: 3.6 }]);
    const r = lecturaTendencia_(m, UMBRAL, 10, 30, { ok: true, significativa: false, p: 0.6 });
    expect(r.ruido).toBe(true);
    expect(r.texto).toContain("sin tendencia clara");
    expect(r.texto).not.toContain("alcanzaría");
  });

  it("con significancia sigue anunciando el cruce como antes", () => {
    const m = theilSen_([{ x: 0, y: 4 }, { x: 10, y: 3.5 }]);
    const r = lecturaTendencia_(m, UMBRAL, 10, 30, { ok: true, significativa: true, p: 0.001 });
    expect(r.ruido).toBeUndefined();
    expect(r.texto).toContain("objetivo");
  });

  it("sin pasarle Mann–Kendall se comporta igual que siempre", () => {
    const m = theilSen_([{ x: 0, y: 4 }, { x: 10, y: 3.5 }]);
    expect(lecturaTendencia_(m, UMBRAL, 10).texto).toBe(lecturaTendencia_(m, UMBRAL, 10, 30, null).texto);
  });
});
