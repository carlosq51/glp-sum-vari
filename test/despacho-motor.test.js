import { describe, it, expect } from "vitest";

const {
  distanciaZonas_, construirPool_, familiaridad_, equidad_, cercania_,
  compatibilidad_, puntuar_, generarPropuestas_, PESOS,
} = await import("../lib/despacho-motor.js");

const tec = (id, esp = "TANQUE") => ({ user_id: id, nombre: id, especialidad: esp });

const unidad = (ids, rol = "TANQUE", extra = {}) => ({
  tipo: ids.length > 1 ? "DUPLA" : "SOLO",
  duplaId: ids.length > 1 ? "d-" + ids.join("") : null,
  rol,
  miembros: ids.map(i => tec(i, rol)),
  asignable: true,
  ultimoResponsable: null,
  ...extra,
});

const zona = (zona_id, vin, extra = {}) => ({
  zona_id, vin, estado: "ESPERANDO",
  registrado_at: "2026-08-07T12:00:00.000Z", ...extra,
});

// ─────────────────────────────────────────────
// Distancia física
// ─────────────────────────────────────────────
describe("distanciaZonas_", () => {
  it("la misma zona es distancia 0", () => {
    expect(distanciaZonas_(4, 4)).toBe(0);
  });

  it("zonas contiguas de la misma fila distan 1", () => {
    expect(distanciaZonas_(4, 5)).toBe(1);
    expect(distanciaZonas_(11, 12)).toBe(1);
  });

  // El caso que definió operaciones: los vecinos de Z2 son Z1, Z3, Z10, Z11 y
  // Z12. Incluye el de enfrente y los dos en diagonal, cruzando el pasillo.
  it("Z2 es vecina de Z1, Z3, Z10, Z11 y Z12", () => {
    for (const v of [1, 3, 10, 11, 12]) {
      expect(distanciaZonas_(2, v)).toBe(1);
    }
  });

  it("Z13 ya NO es vecina de Z2 — se aleja dos columnas", () => {
    expect(distanciaZonas_(2, 13)).toBe(2);
  });

  it("cruzar el pasillo de frente cuesta lo mismo que moverse al lado", () => {
    expect(distanciaZonas_(1, 10)).toBe(distanciaZonas_(1, 2));
  });

  it("la diagonal cuesta lo mismo que el frente, no la suma", () => {
    expect(distanciaZonas_(2, 10)).toBe(distanciaZonas_(2, 11));
  });

  it("el peor caso del taller es de punta a punta de la fila larga", () => {
    expect(distanciaZonas_(1, 9)).toBe(8);
  });

  it("es simétrica", () => {
    expect(distanciaZonas_(3, 12)).toBe(distanciaZonas_(12, 3));
  });

  it("devuelve null si alguna zona no existe", () => {
    expect(distanciaZonas_(4, 99)).toBe(null);
    expect(distanciaZonas_(null, 4)).toBe(null);
  });
});

// ─────────────────────────────────────────────
// Pool
// ─────────────────────────────────────────────
describe("construirPool_", () => {
  it("un carro en zona, en lista, sin asignar, es elegible", () => {
    const r = construirPool_({
      zonas: [zona(4, "VIN1")],
      listaDiaria: new Set(["VIN1"]),
    });
    expect(r.elegibles).toHaveLength(1);
    expect(r.elegibles[0].rolesLibres).toEqual(["MOTOR", "TANQUE"]);
  });

  it("una zona vacía no es exclusión, simplemente no aporta carro", () => {
    const r = construirPool_({ zonas: [zona(4, null)] });
    expect(r.elegibles).toHaveLength(0);
    expect(Object.keys(r.excluidos)).toHaveLength(0);
  });

  it("excluye lo finalizado, con motivo", () => {
    const r = construirPool_({ zonas: [zona(4, "VIN1", { estado: "FINALIZADO" })] });
    expect(r.elegibles).toHaveLength(0);
    expect(r.excluidos.VIN1).toBe("FINALIZADO");
  });

  it("excluye lo que no está en la lista diaria", () => {
    const r = construirPool_({
      zonas: [zona(4, "VIN1")],
      listaDiaria: new Set(["OTRO"]),
    });
    expect(r.excluidos.VIN1).toBe("NO_EN_LISTA_DIARIA");
  });

  it("si ya tiene MOTOR, solo queda libre el puesto de TANQUE", () => {
    const r = construirPool_({
      zonas: [zona(4, "VIN1")],
      ocupados: [{ vin: "VIN1", rol_trabajo: "MOTOR" }],
    });
    expect(r.elegibles[0].rolesLibres).toEqual(["TANQUE"]);
  });

  it("con los dos puestos tomados sale del pool", () => {
    const r = construirPool_({
      zonas: [zona(4, "VIN1")],
      ocupados: [{ vin: "VIN1", rol_trabajo: "MOTOR" }, { vin: "VIN1", rol_trabajo: "TANQUE" }],
    });
    expect(r.elegibles).toHaveLength(0);
    expect(r.excluidos.VIN1).toBe("PUESTOS_OCUPADOS");
  });

  // El bug del 13-ago-2026: un puesto FINALIZADO (que conserva activo=true)
  // no contaba como ocupado, el motor lo proponía y el INSERT chocaba contra
  // idx_asg_active. El error moría en un console.warn y el motor reintentaba
  // en bucle sin asignar nada.
  it("un puesto ya terminado no se vuelve a repartir", () => {
    const r = construirPool_({
      zonas: [zona(4, "VIN1")],
      ocupados: [{ vin: "VIN1", rol_trabajo: "MOTOR", terminado: true }],
    });
    expect(r.elegibles[0].rolesLibres).toEqual(["TANQUE"]);
  });

  it("distingue trabajo completo de puestos en curso", () => {
    const completo = construirPool_({
      zonas: [zona(4, "VIN1")],
      ocupados: [
        { vin: "VIN1", rol_trabajo: "MOTOR",  terminado: true },
        { vin: "VIN1", rol_trabajo: "TANQUE", terminado: true },
      ],
    });
    expect(completo.excluidos.VIN1).toBe("TRABAJO_COMPLETO");

    const mixto = construirPool_({
      zonas: [zona(4, "VIN1")],
      ocupados: [
        { vin: "VIN1", rol_trabajo: "MOTOR",  terminado: true },
        { vin: "VIN1", rol_trabajo: "TANQUE" },
      ],
    });
    expect(mixto.excluidos.VIN1).toBe("PUESTOS_OCUPADOS");
  });

  it("ordena FIFO: el carro que lleva más esperando va primero", () => {
    const r = construirPool_({
      zonas: [
        zona(4, "NUEVO", { registrado_at: "2026-08-07T14:00:00.000Z" }),
        zona(5, "VIEJO", { registrado_at: "2026-08-07T08:00:00.000Z" }),
      ],
    });
    expect(r.elegibles.map(e => e.vin)).toEqual(["VIEJO", "NUEVO"]);
  });

  it("ni la incidencia ni el ramal excluyen — así lo definió operaciones", () => {
    const r = construirPool_({
      zonas: [zona(4, "VIN1", { incidenciaAbierta: true, ramalPendiente: true })],
    });
    expect(r.elegibles).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────
// Criterios individuales
// ─────────────────────────────────────────────
describe("familiaridad_", () => {
  const indice = { A: { "Jetour X70": { dailyRate: 0.9 } }, B: { "Jetour X70": { dailyRate: 0.3 } } };

  it("premia a quien es rápido en ese modelo", () => {
    expect(familiaridad_(unidad(["A"]), "Jetour X70", indice)).toBe(0.9);
    expect(familiaridad_(unidad(["B"]), "Jetour X70", indice)).toBe(0.3);
  });

  it("sin historia del modelo devuelve neutro, no cero", () => {
    expect(familiaridad_(unidad(["A"]), "KYC V5", indice)).toBe(0.5);
    expect(familiaridad_(unidad(["Z"]), "Jetour X70", indice)).toBe(0.5);
  });

  it("en dupla manda el más rápido", () => {
    expect(familiaridad_(unidad(["A", "B"]), "Jetour X70", indice)).toBe(0.9);
  });
});

describe("equidad_", () => {
  it("quien no ha hecho nada tiene prioridad máxima", () => {
    expect(equidad_(unidad(["A"]), new Map(), 2)).toBe(1);
  });

  it("quien ya cumplió la meta baja a cero", () => {
    expect(equidad_(unidad(["A"]), new Map([["A", 2]]), 2)).toBe(0);
  });

  it("a mitad de meta queda a la mitad", () => {
    expect(equidad_(unidad(["A"]), new Map([["A", 1]]), 2)).toBe(0.5);
  });
});

describe("cercania_", () => {
  it("estar en la misma zona da el máximo", () => {
    expect(cercania_(unidad(["A"], "TANQUE", { zonaUltima: 4 }), 4)).toBe(1);
  });

  it("cruzar el taller puntúa menos que la zona de al lado", () => {
    const lejos = cercania_(unidad(["A"], "TANQUE", { zonaUltima: 1 }), 15);
    const cerca = cercania_(unidad(["A"], "TANQUE", { zonaUltima: 1 }), 2);
    expect(cerca).toBeGreaterThan(lejos);
  });

  it("sin zona previa es neutro", () => {
    expect(cercania_(unidad(["A"]), 4)).toBe(0.5);
  });
});

describe("compatibilidad_", () => {
  const techs = {
    A: { normalized: { dailyRate: .5, peakHour: .5, avgMs: .5, hourStd: .5, consistency: .5 } },
    B: { normalized: { dailyRate: .5, peakHour: .5, avgMs: .5, hourStd: .5, consistency: .5 } },
    C: { normalized: { dailyRate: 1,  peakHour: 0,  avgMs: 1,  hourStd: 0,  consistency: 1  } },
  };

  it("dos técnicos de ritmo idéntico son máximamente compatibles", () => {
    expect(compatibilidad_(unidad(["A"]), unidad(["B"]), techs)).toBe(1);
  });

  it("ritmos opuestos puntúan menos", () => {
    expect(compatibilidad_(unidad(["A"]), unidad(["C"]), techs))
      .toBeLessThan(compatibilidad_(unidad(["A"]), unidad(["B"]), techs));
  });

  it("sin datos del modelo es neutro", () => {
    expect(compatibilidad_(unidad(["X"]), unidad(["Y"]), techs)).toBe(0.5);
  });
});

// ─────────────────────────────────────────────
// Puntuación combinada
// ─────────────────────────────────────────────
describe("puntuar_", () => {
  const carro = { vin: "V1", zona: 4, modelo: "Jetour X70" };
  const ctx = {
    indiceModelos: { A: { "Jetour X70": { dailyRate: 0.9 } } },
    creditosHoy: new Map(),
    metaCarros: 2,
  };

  it("devuelve score, desglose y razón legible", () => {
    const p = puntuar_(unidad(["A"]), carro, ctx);
    expect(p.score).toBeGreaterThan(0);
    expect(p.score).toBeLessThanOrEqual(1);
    expect(Object.keys(p.detalle).sort()).toEqual(
      ["cercania", "compatibilidad", "equidad", "familiaridad"]);
    expect(p.razon).toContain("Zona 4");
  });

  it("la razón nombra el modelo cuando la familiaridad pesó", () => {
    expect(puntuar_(unidad(["A"]), carro, ctx).razon).toContain("Jetour X70");
  });

  it("quien conoce el modelo puntúa más que quien no, todo lo demás igual", () => {
    const conocido    = puntuar_(unidad(["A"]), carro, ctx).score;
    const desconocido = puntuar_(unidad(["Z"]), carro, ctx).score;
    expect(conocido).toBeGreaterThan(desconocido);
  });

  it("los pesos suman 1 — si no, los scores no serían comparables", () => {
    const suma = Object.values(PESOS).reduce((a, b) => a + b, 0);
    expect(suma).toBeCloseTo(1, 5);
  });
});

// ─────────────────────────────────────────────
// Reparto completo
// ─────────────────────────────────────────────
describe("generarPropuestas_", () => {
  const ctx = { indiceModelos: {}, creditosHoy: new Map(), metaCarros: 2, techsPorId: {} };

  it("cubre los dos puestos de un carro con las unidades de cada rol", () => {
    const pool = construirPool_({ zonas: [zona(4, "V1")] });
    const r = generarPropuestas_(pool, [unidad(["M1"], "MOTOR"), unidad(["T1"], "TANQUE")], ctx);

    expect(r.propuestas).toHaveLength(2);
    expect(r.propuestas.map(p => p.rol_trabajo).sort()).toEqual(["MOTOR", "TANQUE"]);
    // Las dos filas del mismo carro comparten carro_id.
    expect(new Set(r.propuestas.map(p => p.carro_id)).size).toBe(1);
  });

  it("UNA unidad no recibe dos carros en la misma corrida", () => {
    const pool = construirPool_({ zonas: [zona(4, "V1"), zona(5, "V2")] });
    const r = generarPropuestas_(pool, [unidad(["T1"], "TANQUE")], ctx);
    expect(r.propuestas).toHaveLength(1);
  });

  it("una dupla ocupa un solo carro, no dos — el anti-acaparamiento", () => {
    const pool = construirPool_({ zonas: [zona(4, "V1"), zona(5, "V2")] });
    // A y B juntos: si el motor los tratara como dos técnicos, tomarían 2 carros.
    const r = generarPropuestas_(pool, [unidad(["A", "B"], "TANQUE")], ctx);
    expect(r.propuestas).toHaveLength(1);
    expect(r.propuestas[0].miembros).toEqual(["A", "B"]);
  });

  it("en dupla, el responsable es uno solo y sale de la alternancia", () => {
    const pool = construirPool_({ zonas: [zona(4, "V1")] });
    const r = generarPropuestas_(pool, [unidad(["A", "B"], "TANQUE")], ctx);
    const p = r.propuestas[0];
    expect(p.user_id).toBe("A");                 // primer carro de la dupla
    expect(p.miembros).toEqual(["A", "B"]);      // pero los dos quedan registrados
    expect(p.unidad_dupla_id).toBe("d-AB");
  });

  it("no propone nada para unidades no asignables (en pausa o fuera)", () => {
    const pool = construirPool_({ zonas: [zona(4, "V1")] });
    const enPausa = { ...unidad(["T1"], "TANQUE"), asignable: false };
    expect(generarPropuestas_(pool, [enPausa], ctx).propuestas).toHaveLength(0);
  });

  it("respeta el FIFO: el carro más viejo se reparte primero", () => {
    const pool = construirPool_({
      zonas: [
        zona(4, "NUEVO", { registrado_at: "2026-08-07T14:00:00.000Z" }),
        zona(5, "VIEJO", { registrado_at: "2026-08-07T08:00:00.000Z" }),
      ],
    });
    const r = generarPropuestas_(pool, [unidad(["T1"], "TANQUE")], ctx);
    expect(r.propuestas[0].vin).toBe("VIEJO");
  });

  it("solo cubre el puesto libre si el otro ya está tomado", () => {
    const pool = construirPool_({
      zonas: [zona(4, "V1")],
      ocupados: [{ vin: "V1", rol_trabajo: "MOTOR" }],
    });
    const r = generarPropuestas_(pool, [unidad(["M1"], "MOTOR"), unidad(["T1"], "TANQUE")], ctx);
    expect(r.propuestas).toHaveLength(1);
    expect(r.propuestas[0].rol_trabajo).toBe("TANQUE");
  });

  it("informa cuántas unidades quedaron libres y cuántos carros sin cubrir", () => {
    const pool = construirPool_({ zonas: [zona(4, "V1"), zona(5, "V2")] });
    const r = generarPropuestas_(pool, [unidad(["T1"], "TANQUE"), unidad(["T2"], "TANQUE")], ctx);
    expect(r.unidadesLibres).toBe(0);
    expect(r.carrosSinCubrir).toBe(0);
  });

  it("con el pool vacío no propone nada y no revienta", () => {
    const r = generarPropuestas_({ elegibles: [], excluidos: {} }, [unidad(["T1"])], ctx);
    expect(r.propuestas).toHaveLength(0);
    expect(r.unidadesLibres).toBe(1);
  });

  it("prefiere al técnico que domina el modelo del carro", () => {
    const pool = construirPool_({ zonas: [zona(4, "V1")], modelos: new Map([["V1", "Jetour X70"]]) });
    const ctx2 = { ...ctx, indiceModelos: { EXPERTO: { "Jetour X70": { dailyRate: 0.95 } } } };
    const r = generarPropuestas_(pool, [unidad(["NOVATO"], "TANQUE"), unidad(["EXPERTO"], "TANQUE")], ctx2);
    expect(r.propuestas[0].user_id).toBe("EXPERTO");
  });

  it("a igualdad de todo, prefiere a quien va atrasado en su meta", () => {
    const pool = construirPool_({ zonas: [zona(4, "V1")] });
    const ctx2 = { ...ctx, creditosHoy: new Map([["ADELANTADO", 2], ["ATRASADO", 0]]) };
    const r = generarPropuestas_(pool, [unidad(["ADELANTADO"], "TANQUE"), unidad(["ATRASADO"], "TANQUE")], ctx2);
    expect(r.propuestas[0].user_id).toBe("ATRASADO");
  });

  it("a igualdad de todo, prefiere a quien está más cerca", () => {
    const pool = construirPool_({ zonas: [zona(4, "V1")] });
    const lejos = unidad(["LEJOS"], "TANQUE", { zonaUltima: 15 });
    const cerca = unidad(["CERCA"], "TANQUE", { zonaUltima: 5 });
    const r = generarPropuestas_(pool, [lejos, cerca], ctx);
    expect(r.propuestas[0].user_id).toBe("CERCA");
  });
});
