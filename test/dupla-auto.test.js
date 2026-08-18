import { describe, it, expect } from "vitest";

const {
  pareoCarroExtra_, esDuplaAuto_, motivoDuplaAuto_, vinDeDuplaAuto_,
} = await import("../lib/despacho.js");

// El caso que originó la regla: Franz va en su tercer carro, Ana acaba el
// segundo y entra a apoyarlo en vez de abrir uno propio.
const FRANZ = { user_id: "franz", nombre: "FRANZ", especialidad: "MOTOR",  estadoEfectivo: "OCUPADO" };
const ANA   = { user_id: "ana",   nombre: "ANA",   especialidad: "MOTOR",  estadoEfectivo: "DISPONIBLE" };
const BETO  = { user_id: "beto",  nombre: "BETO",  especialidad: "TANQUE", estadoEfectivo: "DISPONIBLE" };

const carro = (vin, rol = "MOTOR", desde = "2026-08-18T14:00:00Z", zona_id = 7) =>
  ({ vin, rol_trabajo: rol, zona_id, desde });

const base = (over = {}) => ({
  tecnicos: [FRANZ, ANA],
  duplasVivas: [],
  yaParearon: new Set(),
  abiertas: new Map([["franz", carro("VIN3")]]),
  creditos: new Map([["franz", 2], ["ana", 2]]),
  meta: 2,
  ...over,
});

describe("pareoCarroExtra_ · formación", () => {
  it("manda al que cerró su meta al carro extra del compañero de su rol", () => {
    const { formar } = pareoCarroExtra_(base());
    expect(formar).toHaveLength(1);
    expect(formar[0]).toMatchObject({
      rol: "MOTOR", anclaId: "franz", ayudanteId: "ana", vin: "VIN3", zonaId: 7,
    });
  });

  it("no empareja roles distintos: la dupla cubre UN puesto del carro", () => {
    const { formar } = pareoCarroExtra_(base({
      tecnicos: [FRANZ, BETO],
      creditos: new Map([["franz", 2], ["beto", 2]]),
    }));
    expect(formar).toEqual([]);
  });

  it("el AMBOS cubre el puesto del ancla", () => {
    const { formar } = pareoCarroExtra_(base({
      tecnicos: [FRANZ, { ...ANA, especialidad: "AMBOS" }],
    }));
    expect(formar[0]).toMatchObject({ ayudanteId: "ana", rol: "MOTOR" });
  });

  it("exige la cuenta EXACTA: el que ya va por el cuarto no es ancla ni ayudante", () => {
    expect(pareoCarroExtra_(base({
      creditos: new Map([["franz", 3], ["ana", 2]]),   // Franz en su 4.º
    })).formar).toEqual([]);

    expect(pareoCarroExtra_(base({
      creditos: new Map([["franz", 2], ["ana", 3]]),   // Ana ya pasó su 3.º
    })).formar).toEqual([]);
  });

  it("no empareja a quien no llegó a la meta", () => {
    const { formar } = pareoCarroExtra_(base({
      creditos: new Map([["franz", 2], ["ana", 1]]),
    }));
    expect(formar).toEqual([]);
  });

  it("no toma de ayudante a quien no está disponible (pausa, fuera de turno)", () => {
    const { formar } = pareoCarroExtra_(base({
      tecnicos: [FRANZ, { ...ANA, estadoEfectivo: "PAUSA" }],
    }));
    expect(formar).toEqual([]);
  });

  it("solo una vez por jornada: quien ya pasó por una dupla auto no vuelve", () => {
    expect(pareoCarroExtra_(base({ yaParearon: new Set(["ana"]) })).formar).toEqual([]);
    expect(pareoCarroExtra_(base({ yaParearon: new Set(["franz"]) })).formar).toEqual([]);
  });

  it("respeta las duplas que los técnicos armaron a mano", () => {
    const { formar } = pareoCarroExtra_(base({
      duplasVivas: [{ id: "d1", lider_user_id: "ana", miembros: ["ana"], motivo: "" }],
    }));
    expect(formar).toEqual([]);
  });

  it("con varios en carro extra, ayuda al que lleva más rato en el suyo", () => {
    const otro = { user_id: "hugo", nombre: "HUGO", especialidad: "MOTOR", estadoEfectivo: "OCUPADO" };
    const { formar } = pareoCarroExtra_(base({
      tecnicos: [FRANZ, otro, ANA],
      abiertas: new Map([
        ["franz", carro("VIN3", "MOTOR", "2026-08-18T15:30:00Z")],
        ["hugo",  carro("VIN9", "MOTOR", "2026-08-18T13:10:00Z")],
      ]),
      creditos: new Map([["franz", 2], ["hugo", 2], ["ana", 2]]),
    }));
    expect(formar).toHaveLength(1);
    expect(formar[0].anclaId).toBe("hugo");
  });

  it("un ancla recibe un solo ayudante; el sobrante queda para su propio carro", () => {
    const luz = { user_id: "luz", nombre: "LUZ", especialidad: "MOTOR", estadoEfectivo: "DISPONIBLE" };
    const { formar } = pareoCarroExtra_(base({
      tecnicos: [FRANZ, ANA, luz],
      creditos: new Map([["franz", 2], ["ana", 2], ["luz", 2]]),
    }));
    expect(formar).toHaveLength(1);
  });

  it("no hace nada si la meta viene en cero", () => {
    expect(pareoCarroExtra_(base({ meta: 0 })).formar).toEqual([]);
  });
});

describe("pareoCarroExtra_ · disolución", () => {
  const activa = { id: "d1", lider_user_id: "franz", miembros: ["franz", "ana"], motivo: motivoDuplaAuto_("VIN3") };

  it("la deshace cuando el carro compartido ya se cerró", () => {
    const { disolver } = pareoCarroExtra_(base({
      duplasVivas: [activa], abiertas: new Map(),
    }));
    expect(disolver).toHaveLength(1);
    expect(disolver[0].id).toBe("d1");
  });

  it("la deshace si el ancla ya está en OTRO carro", () => {
    const { disolver } = pareoCarroExtra_(base({
      duplasVivas: [activa],
      abiertas: new Map([["franz", carro("VIN4")]]),
    }));
    expect(disolver).toHaveLength(1);
  });

  it("la mantiene mientras el carro sigue abierto", () => {
    const { disolver } = pareoCarroExtra_(base({ duplasVivas: [activa] }));
    expect(disolver).toEqual([]);
  });

  it("nunca deshace una dupla armada a mano, aunque nadie tenga carro", () => {
    const { disolver } = pareoCarroExtra_(base({
      duplasVivas: [{ id: "m1", lider_user_id: "franz", miembros: ["franz", "ana"], motivo: "" }],
      abiertas: new Map(),
    }));
    expect(disolver).toEqual([]);
  });

  it("al disolver libera a los dos para el reparto, no para otra dupla auto", () => {
    const plan = pareoCarroExtra_(base({
      duplasVivas: [activa],
      abiertas: new Map(),
      yaParearon: new Set(["franz", "ana"]),   // ya pasaron por ella
      creditos: new Map([["franz", 3], ["ana", 2]]),
    }));
    expect(plan.disolver).toHaveLength(1);
    expect(plan.formar).toEqual([]);
  });
});

describe("marca de la dupla automática", () => {
  it("distingue las automáticas de las manuales y recupera su VIN", () => {
    const d = { motivo: motivoDuplaAuto_("LSJA24U97PZ041882") };
    expect(esDuplaAuto_(d)).toBe(true);
    expect(vinDeDuplaAuto_(d)).toBe("LSJA24U97PZ041882");
    expect(esDuplaAuto_({ motivo: "se fue a almorzar" })).toBe(false);
    expect(vinDeDuplaAuto_({ motivo: "" })).toBe(null);
  });
});
