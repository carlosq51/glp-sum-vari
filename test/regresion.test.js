import { describe, it, expect } from "vitest";

const { theilSen_, lineaTendencia_, lecturaTendencia_, mediana_, medianaPonderada_ } =
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

  it("con 4 jornadas SÍ contrasta, por reparto exacto — pero no le da para afirmar", () => {
    // Cuatro jornadas subiendo son la ordenación más extrema posible y aun así
    // pasan una vez de cada doce por puro azar: se contrasta y se dice que no.
    const r = mannKendall_([1, 2, 3, 4]);
    expect(r.ok).toBe(true);
    expect(r.exacto).toBe(true);
    expect(r.p).toBeCloseTo(2 / 24, 6);
    expect(r.significativa).toBe(false);
  });

  it("con 5 jornadas monótonas el reparto exacto ya alcanza para afirmar", () => {
    // Antes esto caía en el corte seco de 8 y la tendencia no se dibujaba: es
    // el caso de un modelo con pocos carros al día.
    const r = mannKendall_([10, 8, 7, 5, 4]);
    expect(r.ok).toBe(true);
    expect(r.exacto).toBe(true);
    expect(r.p).toBeCloseTo(2 / 120, 6);
    expect(r.significativa).toBe(true);
    expect(r.sentido).toBe(-1);
  });

  it("por debajo de 4 jornadas no hay test que valga", () => {
    expect(mannKendall_([1, 2, 3]).ok).toBe(false);
  });

  it("con empates y serie corta no se inventa un exacto que no existe", () => {
    // El reparto exacto supone que no hay repetidos; con 6 puntos y empates no
    // hay ni exacto ni normal, y se dice que no se sabe.
    expect(mannKendall_([2, 2, 3, 3, 4, 4]).ok).toBe(false);
  });

  it("el exacto y la normal coinciden en el veredicto cuando ambos valen", () => {
    const baja = [9, 8.5, 8.2, 7.9, 7.4, 7.1, 6.8, 6.2, 5.9, 5.5];
    expect(mannKendall_(baja).significativa).toBe(true);
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

describe("medianaPonderada_", () => {
  it("con todos los pesos iguales es la mediana de siempre", () => {
    const w1 = (arr) => arr.map(v => ({ v, w: 1 }));
    expect(medianaPonderada_(w1([3, 1, 2]))).toBe(2);
    expect(medianaPonderada_(w1([4, 1, 3, 2]))).toBe(2.5);
  });

  it("el valor con más peso arrastra la mediana hacia él", () => {
    // Una jornada de 40 carros y dos de 1: manda la de 40.
    expect(medianaPonderada_([
      { v: 1, w: 1 }, { v: 5, w: 40 }, { v: 9, w: 1 },
    ])).toBe(5);
  });

  it("ignora pesos rotos o nulos en vez de propagar NaN", () => {
    expect(medianaPonderada_([
      { v: 1, w: 0 }, { v: 4, w: 2 }, { v: 9, w: NaN }, { v: 4, w: 1 },
    ])).toBe(4);
  });

  it("sin datos devuelve NaN, no 0", () => {
    expect(medianaPonderada_([])).toBeNaN();
    expect(medianaPonderada_(null)).toBeNaN();
  });
});

describe("theilSen_ ponderado", () => {
  it("sin pesos da exactamente lo mismo que antes", () => {
    const p = [0, 1, 2, 3, 4].map(x => ({ x, y: 10 - 2 * x }));
    expect(theilSen_(p).pendiente).toBeCloseTo(-2, 10);
  });

  it("las jornadas flojas cuentan, pero no mandan", () => {
    // Cuatro jornadas grandes bajando 2 por día y dos jornadas de un carro que
    // dicen cualquier cosa. Antes las flojas se descartaban enteras; ahora
    // votan poco y la recta sigue siendo la de las grandes.
    const p = [
      { x: 0, y: 10, w: 6 }, { x: 1, y: 8, w: 6 },
      { x: 2, y: 40, w: 1 }, { x: 3, y: 4, w: 6 },
      { x: 4, y: -30, w: 1 }, { x: 5, y: 0, w: 6 },
    ];
    expect(theilSen_(p).pendiente).toBeCloseTo(-2, 6);
  });
});

describe("lecturaTendencia_ cuando el test no pudo hacerse", () => {
  it("con Mann–Kendall sin veredicto NO anuncia mejora, solo sitúa el objetivo", () => {
    const modelo = theilSen_([{ x: 0, y: 5 }, { x: 1, y: 4 }, { x: 2, y: 3.5 }]);
    const mk = mannKendall_([5, 4, 3.5]);          // 3 puntos: no hay test
    const l = lecturaTendencia_(modelo, 3, 2, 30, mk);
    expect(mk.ok).toBe(false);
    expect(l.insuficiente).toBe(true);
    expect(l.cruzaEn).toBeUndefined();
    expect(l.texto).toMatch(/pocas jornadas/i);
  });
});

const { elegirVentana_, agruparEnVentanas_, MIN_PUNTOS_TENDENCIA } =
  await import("../lib/regresion.js");

describe("ventana adaptativa", () => {
  /** Genera carros: `porDia` por jornada durante `dias`, bajando `pend` h/día. */
  const taller_ = (dias, porDia, pend = -0.01, base = 3.5) => {
    const out = [];
    for (let d = 0; d < dias; d++) {
      for (let k = 0; k < porDia; k++) {
        // Ruido determinista, para que el test no dependa del azar.
        const ruido = ((d * 7 + k * 13) % 11) / 40;
        out.push({ x: d, y: base + pend * d + ruido });
      }
    }
    return out;
  };

  it("con volumen de sobra se queda en la jornada, que es el máximo detalle", () => {
    // El caso Jetour delantero: decenas de carros al día.
    expect(elegirVentana_(taller_(60, 12)).ancho).toBe(1);
  });

  it("con dos carros al día sube de escalón en vez de quedarse sin tendencia", () => {
    // El caso que fallaba: ninguna jornada llegaba a 5 carros y la recta no
    // llegaba a existir. Ahora agrupa hasta reunir puntos con cuerpo.
    const { ancho, cubos } = elegirVentana_(taller_(60, 2));
    expect(ancho).toBeGreaterThan(1);
    expect(cubos.length).toBeGreaterThanOrEqual(MIN_PUNTOS_TENDENCIA);
    expect(mediana_(cubos.map(c => c.n))).toBeGreaterThanOrEqual(5);
  });

  it("un modelo muy raro NO se queda mudo: coge el paso más grueso que deje serie", () => {
    // Un carro cada dos días durante mes y medio: ni la quincena reúne cinco
    // carros por punto, pero sigue habiendo serie y es mejor que nada.
    const raros = Array.from({ length: 22 }, (_, i) => ({ x: i * 2, y: 4 - i * 0.02 }));
    const { cubos } = elegirVentana_(raros);
    expect(cubos.length).toBeGreaterThanOrEqual(MIN_PUNTOS_TENDENCIA);
  });

  it("la tendencia real sobrevive al agrupamiento", () => {
    // Baja 0,01 h/día = 0,6 min/día. Agrupado por semana debe seguir saliendo.
    const { cubos } = elegirVentana_(taller_(70, 2, -0.01));
    const m = theilSen_(cubos.map(c => ({ x: c.x, y: c.mediana, w: Math.sqrt(c.n) })));
    expect(m.ok).toBe(true);
    expect(m.pendiente).toBeCloseTo(-0.01, 2);
    expect(mannKendall_(cubos.map(c => c.mediana)).significativa).toBe(true);
  });

  it("la x del grupo es la de sus carros, no el centro teórico de la ventana", () => {
    // Última semana a medias: si se pusiera en su centro nominal (día 45) la
    // recta se extrapolaría hacia días que aún no han ocurrido.
    const pts = [{ x: 42, y: 3 }, { x: 43, y: 3.2 }];
    const [c] = agruparEnVentanas_(pts, 7);
    expect(c.x).toBe(42.5);
    expect(c.n).toBe(2);
  });

  it("sin datos no revienta ni inventa cubos", () => {
    expect(elegirVentana_([]).cubos).toEqual([]);
  });
});
