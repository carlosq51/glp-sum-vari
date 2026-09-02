import { describe, it, expect } from "vitest";

const {
  pesoPorEdad_, wMean_, wStd_, wMedian_,
  computeFeatures, normalizarFeatures,
  distancia_, similitud_, circHourDist_, W_SIM, KEYS,
  extraerPares_, agruparDuplas_, spearman_,
  validarCorte_, validarPorCortes_,
  DECAY_HALFLIFE_D, DESFASE_CAP_MIN,
} = await import("../lib/ml-pairing.js");

const DIA = 86400000;
const REF = Date.parse("2026-09-01T12:00:00Z");
const haceDias = d => new Date(REF - d * DIA).toISOString();

/** Una fila de asignación FINALIZADO. */
const fila = (diasAtras, { min = 120, hora = null, user = "u1", rol = "MOTOR", wo = null } = {}) => {
  let iso = haceDias(diasAtras);
  if (hora != null) iso = iso.slice(0, 11) + String(hora).padStart(2, "0") + iso.slice(13);
  return { user_id: user, rol_trabajo: rol, updated_at: iso, tiempo_trab_ms: min * 60000, work_order_id: wo };
};

describe("pesoPorEdad_", () => {
  it("vale 1 en el instante de referencia", () => {
    expect(pesoPorEdad_(REF, REF)).toBeCloseTo(1, 10);
  });

  it("vale la mitad al cumplirse una semivida", () => {
    expect(pesoPorEdad_(REF - DECAY_HALFLIFE_D * DIA, REF)).toBeCloseTo(0.5, 6);
    expect(pesoPorEdad_(REF - 2 * DECAY_HALFLIFE_D * DIA, REF)).toBeCloseTo(0.25, 6);
  });

  it("nunca llega a cero: dos semanas fuera no borran a nadie", () => {
    expect(pesoPorEdad_(REF - 365 * DIA, REF)).toBeGreaterThan(0);
  });

  it("no premia el futuro: una fila posterior a la referencia pesa 1, no más", () => {
    expect(pesoPorEdad_(REF + 10 * DIA, REF)).toBe(1);
  });
});

describe("estadísticos ponderados", () => {
  it("wMean_ con pesos iguales es la media de siempre", () => {
    expect(wMean_([1, 2, 3], [1, 1, 1])).toBeCloseTo(2);
  });

  it("wMean_ se inclina hacia lo que más pesa", () => {
    expect(wMean_([1, 10], [0, 1])).toBe(10);
    expect(wMean_([1, 10], [3, 1])).toBeCloseTo(3.25);
  });

  it("wMean_ devuelve 0 si no hay peso, en vez de NaN", () => {
    expect(wMean_([1, 2], [0, 0])).toBe(0);
    expect(wMean_([], [])).toBe(0);
  });

  it("wStd_ es cero cuando todo vale lo mismo", () => {
    expect(wStd_([5, 5, 5], [1, 1, 1], 5)).toBe(0);
  });

  it("wMedian_ parte el PESO por la mitad, no el número de datos", () => {
    // Tres valores, pero casi todo el peso está en el 100.
    expect(wMedian_([1, 2, 100], [0.01, 0.01, 5], null)).toBe(100);
    expect(wMedian_([1, 2, 100], [5, 5, 0.01], null)).toBe(2);
  });

  it("wMedian_ cae al valor por defecto sin datos", () => {
    expect(wMedian_([], [], 12)).toBe(12);
  });
});

describe("computeFeatures", () => {
  it("no perfila a quien no llega al mínimo de carros", () => {
    expect(computeFeatures([fila(1), fila(2)], REF)).toBeNull();
    expect(computeFeatures([], REF)).toBeNull();
    expect(computeFeatures(null, REF)).toBeNull();
  });

  it("cuenta carros por día trabajado, no por día del calendario", () => {
    // 6 carros en 2 días distintos → 3 por día, aunque medien semanas.
    const rows = [
      ...Array(3).fill(0).map(() => fila(1)),
      ...Array(3).fill(0).map(() => fila(20)),
    ];
    const f = computeFeatures(rows, REF);
    expect(f.workingDays).toBe(2);
    expect(f.totalRows).toBe(6);
    expect(f.dailyRate).toBeCloseTo(3, 6);
  });

  it("da más peso a lo reciente: el mismo técnico, dos historias", () => {
    // Lento hace tiempo, rápido ahora → el promedio tiene que tirar a rápido.
    const mejorando = [
      fila(90, { min: 300 }), fila(89, { min: 300 }), fila(88, { min: 300 }),
      fila(2,  { min: 60 }),  fila(1,  { min: 60 }),  fila(0, { min: 60 }),
    ];
    const empeorando = [
      fila(90, { min: 60 }),  fila(89, { min: 60 }),  fila(88, { min: 60 }),
      fila(2,  { min: 300 }), fila(1,  { min: 300 }), fila(0, { min: 300 }),
    ];
    const a = computeFeatures(mejorando, REF).avgMs / 60000;
    const b = computeFeatures(empeorando, REF).avgMs / 60000;
    expect(a).toBeLessThan(120);      // mucho más cerca de 60 que de 300
    expect(b).toBeGreaterThan(240);
    // Sin ponderar, ambos darían exactamente lo mismo (180 min).
    expect(Math.abs(a - b)).toBeGreaterThan(100);
  });

  it("descarta tiempos imposibles: cero y por encima de 8 h", () => {
    const rows = [fila(1, { min: 100 }), fila(2, { min: 100 }), fila(3, { min: 100 })];
    rows.push({ ...fila(1), tiempo_trab_ms: 0 });
    rows.push({ ...fila(1), tiempo_trab_ms: 20 * 3600000 });   // carro abierto de un día a otro
    const f = computeFeatures(rows, REF);
    expect(f.avgMs / 60000).toBeCloseTo(100, 0);
  });

  it("nEff mide desequilibrio entre pesos, no antigüedad", () => {
    // 20 carros repartidos parejo pesan como 20, sean de esta semana o de hace
    // medio año: nEff es invariante de escala. Quien mide la frescura es pesoTotal.
    const recientes = Array(20).fill(0).map((_, i) => fila(i % 5));
    const viejos    = Array(20).fill(0).map((_, i) => fila(180 + (i % 5)));
    const a = computeFeatures(recientes, REF);
    const b = computeFeatures(viejos, REF);
    expect(a.nEff).toBeLessThanOrEqual(20);
    expect(b.nEff).toBeLessThanOrEqual(20);
    expect(Math.abs(a.nEff - b.nEff)).toBeLessThan(1);
    // …y pesoTotal sí los separa, que es para lo que está.
    expect(a.pesoTotal).toBeGreaterThan(b.pesoTotal * 20);
  });

  it("nEff se desploma cuando unos pocos carros acaparan el peso", () => {
    // 19 carros viejísimos y 3 de esta semana: mandan los 3.
    const rows = [
      ...Array(19).fill(0).map((_, i) => fila(300 + i)),
      fila(0), fila(0), fila(1),
    ];
    const f = computeFeatures(rows, REF);
    expect(f.totalRows).toBe(22);
    expect(f.nEff).toBeLessThan(5);
  });

  it("consistency es cero para quien hace lo mismo cada día", () => {
    const rows = [0, 1, 2, 3].flatMap(d => [fila(d), fila(d)]);   // 2 carros cada día
    expect(computeFeatures(rows, REF).consistency).toBeCloseTo(0, 6);
  });

  it("la referencia manda: mover el corte cambia el perfil", () => {
    const rows = [fila(0, { min: 60 }), fila(1, { min: 60 }), fila(60, { min: 300 }),
                  fila(61, { min: 300 }), fila(62, { min: 300 })];
    const ahora = computeFeatures(rows, REF).avgMs;
    const antes = computeFeatures(rows, REF - 50 * DIA).avgMs;    // lo reciente aún no existía
    expect(ahora).toBeLessThan(antes);
  });
});

describe("normalizarFeatures", () => {
  it("deja el máximo en 1 y el resto por debajo", () => {
    const { maxes, normalized } = normalizarFeatures({
      a: { dailyRate: 4, avgMs: 100, peakHour: 12, hourStd: 2, consistency: 0.5 },
      b: { dailyRate: 2, avgMs: 200, peakHour: 14, hourStd: 1, consistency: 0.25 },
    });
    expect(maxes.dailyRate).toBe(4);
    expect(normalized.a.dailyRate).toBe(1);
    expect(normalized.b.dailyRate).toBe(0.5);
    expect(normalized.b.avgMs).toBe(1);
  });

  it("no divide por cero cuando un feature es cero en todos", () => {
    const { normalized } = normalizarFeatures({ a: { dailyRate: 0 }, b: { dailyRate: 0 } });
    for (const k of KEYS) expect(Number.isFinite(normalized.a[k])).toBe(true);
  });
});

describe("distancia_ y similitud_", () => {
  const tec = (n, peak) => ({ normalized: n, features: { peakHour: peak } });
  const plano = v => Object.fromEntries(KEYS.map(k => [k, v]));

  it("dos perfiles idénticos tienen similitud 1", () => {
    expect(similitud_(tec(plano(0.5), 12), tec(plano(0.5), 12))).toBe(1);
  });

  it("sin perfil devuelve 0.5, ni premio ni castigo", () => {
    expect(similitud_(null, tec(plano(0.5), 12))).toBe(0.5);
    expect(similitud_(tec(plano(0.5), 12), {})).toBe(0.5);
    expect(distancia_(undefined, undefined)).toBeNull();
  });

  it("cuanto más se parecen, menor la distancia", () => {
    const a = tec(plano(0.5), 12);
    const cerca = tec({ ...plano(0.5), avgMs: 0.55 }, 12);
    const lejos = tec({ ...plano(0.5), avgMs: 1 }, 12);
    expect(distancia_(a, cerca)).toBeLessThan(distancia_(a, lejos));
  });

  it("los pesos suman 1 y avgMs es el que más manda", () => {
    const suma = Object.values(W_SIM).reduce((s, v) => s + v, 0);
    expect(suma).toBeCloseTo(1, 10);
    expect(Math.max(...Object.values(W_SIM))).toBe(W_SIM.avgMs);
  });

  it("la hora es circular: las 23 y la 1 están cerca", () => {
    expect(circHourDist_(23, 1)).toBeCloseTo(2 / 12, 10);
    expect(circHourDist_(11, 13)).toBeCloseTo(2 / 12, 10);
    expect(circHourDist_(0, 12)).toBe(1);           // máximo posible
    const base = plano(0.5);
    const noche = distancia_(tec(base, 23), tec(base, 1));
    const dia   = distancia_(tec(base, 11), tec(base, 13));
    expect(noche).toBeCloseTo(dia, 10);
  });

  it("sin features cae a la diferencia normalizada, sin romperse", () => {
    const a = { normalized: { ...plano(0.5), peakHour: 0.2 } };
    const b = { normalized: { ...plano(0.5), peakHour: 0.9 } };
    const d = distancia_(a, b);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
  });

  it("la similitud nunca se sale de [0,1]", () => {
    const a = tec(plano(0), 0), b = tec(plano(1), 12);
    const s = similitud_(a, b);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("extraerPares_ — la etiqueta", () => {
  const esp = { m1: "MOTOR", m2: "MOTOR", t1: "TANQUE", t2: "TANQUE", q1: "CALIDAD" };

  it("empareja el MOTOR y el TANQUE del mismo carro y mide el desfase", () => {
    const asg = [
      { work_order_id: "w1", user_id: "m1", rol_trabajo: "MOTOR",  updated_at: "2026-08-01T10:00:00Z" },
      { work_order_id: "w1", user_id: "t1", rol_trabajo: "TANQUE", updated_at: "2026-08-01T10:30:00Z" },
    ];
    const p = extraerPares_(asg, esp);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ motor: "m1", tanque: "t1" });
    expect(p[0].desfaseMin).toBe(30);
  });

  it("ignora carros con un solo rol terminado", () => {
    expect(extraerPares_([
      { work_order_id: "w1", user_id: "m1", rol_trabajo: "MOTOR", updated_at: "2026-08-01T10:00:00Z" },
    ], esp)).toHaveLength(0);
  });

  it("descarta la fila cuyo rol no coincide con la especialidad de la persona", () => {
    // q1 hizo de TANQUE pero es de CALIDAD: no es una dupla MOTOR-TANQUE real.
    expect(extraerPares_([
      { work_order_id: "w1", user_id: "m1", rol_trabajo: "MOTOR",  updated_at: "2026-08-01T10:00:00Z" },
      { work_order_id: "w1", user_id: "q1", rol_trabajo: "TANQUE", updated_at: "2026-08-01T10:10:00Z" },
    ], esp)).toHaveLength(0);
  });

  it("descarta los carros que se quedaron abiertos más allá del tope", () => {
    const lejos = [
      { work_order_id: "w1", user_id: "m1", rol_trabajo: "MOTOR",  updated_at: "2026-08-01T08:00:00Z" },
      { work_order_id: "w1", user_id: "t1", rol_trabajo: "TANQUE", updated_at: "2026-08-04T08:00:00Z" },
    ];
    expect(extraerPares_(lejos, esp)).toHaveLength(0);
    expect(extraerPares_(lejos, esp, { capMin: 99999 })).toHaveLength(1);
    expect(DESFASE_CAP_MIN).toBe(480);
  });

  it("no empareja a alguien consigo mismo", () => {
    expect(extraerPares_([
      { work_order_id: "w1", user_id: "m1", rol_trabajo: "MOTOR",  updated_at: "2026-08-01T10:00:00Z" },
      { work_order_id: "w1", user_id: "m1", rol_trabajo: "TANQUE", updated_at: "2026-08-01T10:10:00Z" },
    ], { m1: "MOTOR" })).toHaveLength(0);
  });

  it("con varias filas del mismo rol se queda con la última", () => {
    const p = extraerPares_([
      { work_order_id: "w1", user_id: "m2", rol_trabajo: "MOTOR",  updated_at: "2026-08-01T09:00:00Z" },
      { work_order_id: "w1", user_id: "m1", rol_trabajo: "MOTOR",  updated_at: "2026-08-01T10:00:00Z" },
      { work_order_id: "w1", user_id: "t1", rol_trabajo: "TANQUE", updated_at: "2026-08-01T10:15:00Z" },
    ], esp);
    expect(p[0].motor).toBe("m1");
    expect(p[0].desfaseMin).toBe(15);
  });

  it("devuelve los pares ordenados por fecha ascendente", () => {
    const p = extraerPares_([
      { work_order_id: "w2", user_id: "m1", rol_trabajo: "MOTOR",  updated_at: "2026-08-05T10:00:00Z" },
      { work_order_id: "w2", user_id: "t1", rol_trabajo: "TANQUE", updated_at: "2026-08-05T10:10:00Z" },
      { work_order_id: "w1", user_id: "m1", rol_trabajo: "MOTOR",  updated_at: "2026-08-01T10:00:00Z" },
      { work_order_id: "w1", user_id: "t1", rol_trabajo: "TANQUE", updated_at: "2026-08-01T10:10:00Z" },
    ], esp);
    expect(p.map(x => x.ts)).toEqual([...p.map(x => x.ts)].sort((a, b) => a - b));
  });
});

describe("agruparDuplas_", () => {
  const par = (m, t, d) => ({ motor: m, tanque: t, ts: 0, desfaseMin: d });

  it("resume con la mediana, así un carro atascado no decide", () => {
    const g = agruparDuplas_([par("m", "t", 10), par("m", "t", 20), par("m", "t", 400)], 3);
    expect(g).toHaveLength(1);
    expect(g[0].desfaseMediano).toBe(20);
    expect(g[0].carros).toBe(3);
  });

  it("descarta las duplas que apenas han coincidido", () => {
    expect(agruparDuplas_([par("m", "t", 10), par("m", "t", 20)], 3)).toHaveLength(0);
    expect(agruparDuplas_([par("m", "t", 10), par("m", "t", 20)], 2)).toHaveLength(1);
  });

  it("separa duplas distintas", () => {
    const ps = [...Array(3)].flatMap(() => [par("m1", "t1", 10), par("m1", "t2", 90)]);
    const g = agruparDuplas_(ps, 3);
    expect(g).toHaveLength(2);
    expect(g.find(x => x.tanque === "t1").desfaseMediano).toBe(10);
  });
});

describe("spearman_", () => {
  it("vale 1 cuando el orden coincide exactamente", () => {
    expect(spearman_([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
  });

  it("vale -1 cuando el orden es el inverso", () => {
    expect(spearman_([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 10);
  });

  it("mide el ORDEN, no la escala: es inmune a la cola larga del desfase", () => {
    expect(spearman_([1, 2, 3, 4], [10, 20, 30, 99999])).toBeCloseTo(1, 10);
  });

  it("devuelve null si no hay varianza o faltan datos", () => {
    expect(spearman_([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(spearman_([1, 2], [1, 2])).toBeNull();
    expect(spearman_([1, 2, 3], [1, 2])).toBeNull();
  });

  it("reparte rango promedio entre empates", () => {
    expect(spearman_([1, 1, 2, 2], [1, 1, 2, 2])).toBeCloseTo(1, 10);
  });
});

describe("validación con corte temporal", () => {
  // Taller sintético: los técnicos rápidos cierran rápido y los lentos, lento.
  // Emparejar iguales da desfase bajo; emparejar dispares, desfase alto. Si la
  // validación no detecta ESO, no detectará nada.
  function tallerSintetico() {
    const asg = [], pares = [];
    const motores = [["mr", 60], ["mr2", 70], ["ml", 300], ["ml2", 290]];
    const tanques = [["tr", 62], ["tr2", 68], ["tl", 295], ["tl2", 305]];
    let wo = 0;
    for (let d = 120; d >= 0; d--) {
      for (const [m, mMin] of motores) {
        for (const [t, tMin] of tanques) {
          if ((d + wo) % 3) { wo++; continue; }          // no todas las combinaciones cada día
          const id = "w" + (wo++);
          const base = REF - d * DIA;
          asg.push({ work_order_id: id, user_id: m, rol_trabajo: "MOTOR",
            updated_at: new Date(base).toISOString(), tiempo_trab_ms: mMin * 60000 });
          asg.push({ work_order_id: id, user_id: t, rol_trabajo: "TANQUE",
            updated_at: new Date(base + Math.abs(mMin - tMin) * 60000).toISOString(),
            tiempo_trab_ms: tMin * 60000 });
        }
      }
    }
    const espPorId = { mr: "MOTOR", mr2: "MOTOR", ml: "MOTOR", ml2: "MOTOR",
                       tr: "TANQUE", tr2: "TANQUE", tl: "TANQUE", tl2: "TANQUE" };
    return { asg, espPorId, pares };
  }

  it("detecta la señal cuando la señal existe", () => {
    const { asg, espPorId } = tallerSintetico();
    const r = validarPorCortes_({ asignaciones: asg, espPorId, minDuplas: 4, minCarros: 2 });
    expect(r.ok).toBe(true);
    expect(r.cortes).toBeGreaterThan(0);
    // Los que el modelo llama parecidos cierran más juntos que los dispares.
    expect(r.rhoMediano).toBeGreaterThan(0.3);
    expect(r.desfaseCercaMediano).toBeLessThan(r.desfaseLejosMediano);
  });

  it("el perfil solo mira hacia atrás: el futuro no entra", () => {
    const { asg, espPorId } = tallerSintetico();
    const pares = extraerPares_(asg, espPorId);
    const corteMs = REF - 40 * DIA;
    // Si el corte filtrara mal, meter carros absurdos DESPUÉS del corte
    // cambiaría el perfil; como no los mira, el resultado no se mueve.
    const conBasura = asg.concat(
      [...Array(50)].map((_, i) => ({
        work_order_id: "z" + i, user_id: "mr", rol_trabajo: "MOTOR",
        updated_at: new Date(REF - 5 * DIA).toISOString(), tiempo_trab_ms: 7 * 3600000,
      }))
    );
    const a = validarCorte_({ asignaciones: asg, espPorId, pares, corteMs, minDuplas: 4, minCarros: 2 });
    const b = validarCorte_({ asignaciones: conBasura, espPorId, pares, corteMs, minDuplas: 4, minCarros: 2 });
    expect(a).not.toBeNull();
    expect(b.rho).toBe(a.rho);
  });

  it("informa en vez de inventar cuando no hay datos", () => {
    const r = validarPorCortes_({ asignaciones: [], espPorId: {} });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/suficientes/i);
  });

  it("no devuelve métrica si un corte no reúne duplas suficientes", () => {
    const { asg, espPorId } = tallerSintetico();
    const pares = extraerPares_(asg, espPorId);
    const r = validarCorte_({
      asignaciones: asg, espPorId, pares, corteMs: REF - 40 * DIA, minDuplas: 9999,
    });
    expect(r).toBeNull();
  });
});
