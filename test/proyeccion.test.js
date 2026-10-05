// La proyección del día (lib/proyeccion.js). Lo que fija:
//
//   · el turno normal se proyecta con presentes × tasa, y la tasa sale de los
//     días pasados — no de un número escrito a mano
//   · lo de después del fin de turno NO se le atribuye a la asistencia: es
//     hora extra y solo cuenta si alguien se queda
//   · un carro necesita las dos mitades: si solo se quedan delanteros, la hora
//     extra suma cero y se dice qué puesto falta
import { describe, it, expect } from "vitest";
import {
  bloquesJornada_, calibrarProyeccion_, proyectarJornada_, horasExtraParaMeta_,
  minutoJornada_, tipoDia_, metaVentana_, ritmosPorTecnico_, proyeccionPorTecnico_,
} from "../lib/proyeccion.js";

const bloques = bloquesJornada_("05:00-10:30,10:30-13:00,13:00-16:30,16:30-19:30,19:30-23:00,23:00-02:00");
const FIN = 990; // 16:30

/** Un lunes con `presentes` técnicos y esos carros por corte. */
const dia = (presentes, carros, extra = {}) => ({
  dow: 1, presentes, carrosPorBloque: carros,
  extra: { MOTOR: { mitades: 0, horas: 0 }, TANQUE: { mitades: 0, horas: 0 }, ...extra },
});

describe("calibrarProyeccion_", () => {
  it("mide la tasa del turno normal y deja fuera los cortes de la tarde", () => {
    const dias = Array.from({ length: 6 }, () => dia(20, [7, 6, 7, 5, 3, 2]));
    const c = calibrarProyeccion_({ dias, bloques, finTurnoMin: FIN });
    expect(c.habil.tasa).toBeCloseTo(1, 5);           // 20 carros / 20 presentes
    expect(c.habil.pesos.slice(3)).toEqual([0, 0, 0]); // la tarde no pesa
    expect(c.habil.pesos[0]).toBeCloseTo(0.35, 5);
    expect(c.habil.error).toBe(1);                     // días idénticos → el piso
  });

  it("no proyecta con pocos días", () => {
    const c = calibrarProyeccion_({ dias: [dia(20, [7, 6, 7, 0, 0, 0])], bloques, finTurnoMin: FIN });
    expect(c.habil).toBeNull();
    expect(proyectarJornada_({ calib: c, dow: 1, presentes: { MOTOR: 10, TANQUE: 10 }, bloques, finTurnoMin: FIN })).toBeNull();
  });

  it("mide la hora extra por puesto", () => {
    const dias = Array.from({ length: 6 }, () => dia(20, [7, 6, 7, 0, 0, 0], {
      MOTOR: { mitades: 4, horas: 10 }, TANQUE: { mitades: 3, horas: 10 },
    }));
    const c = calibrarProyeccion_({ dias, bloques, finTurnoMin: FIN });
    expect(c.extraHora.MOTOR).toBeCloseTo(0.4, 5);
    expect(c.extraHora.TANQUE).toBeCloseTo(0.3, 5);
  });
});

describe("proyectarJornada_", () => {
  const dias = Array.from({ length: 6 }, (_, i) => dia(20, [7, 6, 7, 0, 0, 0], {
    MOTOR: { mitades: 5, horas: 10 }, TANQUE: { mitades: 5, horas: 10 },
  }));
  dias[0] = dia(10, [3, 3, 4, 0, 0, 0], dias[0].extra);
  const calib = calibrarProyeccion_({ dias, bloques, finTurnoMin: FIN });

  it("escala con la gente que vino", () => {
    const p19 = proyectarJornada_({ calib, dow: 1, presentes: { MOTOR: 9, TANQUE: 10 }, bloques, finTurnoMin: FIN });
    const p10 = proyectarJornada_({ calib, dow: 1, presentes: { MOTOR: 5, TANQUE: 5 }, bloques, finTurnoMin: FIN });
    expect(p19.turno.esperado).toBeCloseTo(19, 5);
    expect(p10.turno.esperado).toBeCloseTo(10, 5);
    expect(p19.turno.min).toBeLessThan(19);
    expect(p19.turno.max).toBeGreaterThan(19);
    expect(p19.porBloque[3]).toBeNull();               // nadie se queda: tarde vacía
  });

  it("suma la hora extra en los cortes donde cae", () => {
    const p = proyectarJornada_({
      calib, dow: 1, presentes: { MOTOR: 10, TANQUE: 10 }, bloques, finTurnoMin: FIN,
      extras: [{ rol: "MOTOR", hastaMin: 1170 }, { rol: "TANQUE", hastaMin: 1170 }],  // hasta 19:30
    });
    expect(p.extra.esperado).toBeCloseTo(1.5, 5);      // 3 h × 0,5 mitades/h
    expect(p.porBloque[3].extra).toBeCloseTo(1.5, 5);
    expect(p.porBloque[4]).toBeNull();
    expect(p.total.esperado).toBeCloseTo(21.5, 5);
  });

  it("sin el otro puesto la hora extra no saca carros", () => {
    const p = proyectarJornada_({
      calib, dow: 1, presentes: { MOTOR: 10, TANQUE: 10 }, bloques, finTurnoMin: FIN,
      extras: [{ rol: "MOTOR", hastaMin: 1380 }],
    });
    expect(p.extra.esperado).toBe(0);
    expect(p.extra.falta).toBe("TANQUE");
  });

  it("el domingo no se proyecta", () => {
    expect(tipoDia_(0)).toBeNull();
    expect(proyectarJornada_({ calib, dow: 0, presentes: { MOTOR: 10, TANQUE: 10 }, bloques, finTurnoMin: FIN })).toBeNull();
  });

  it("dice cuántas parejas faltan para la meta guía", () => {
    const p = proyectarJornada_({ calib, dow: 1, presentes: { MOTOR: 10, TANQUE: 10 }, bloques, finTurnoMin: FIN });
    const m = horasExtraParaMeta_({ proyeccion: p, meta: 23, bloques, finTurnoMin: FIN });
    expect(m.faltan).toBeCloseTo(3, 5);
    expect(m.parejas).toBe(2);                          // 1,5 carros por pareja hasta 19:30
    expect(m.hastaMin).toBe(1170);
    expect(m.alcanza).toBe(true);
    expect(horasExtraParaMeta_({ proyeccion: p, meta: 20, bloques, finTurnoMin: FIN })).toBeNull();
  });

  it("si no caben las parejas, alarga la hora en vez de pedir gente que no hay", () => {
    const p = proyectarJornada_({ calib, dow: 1, presentes: { MOTOR: 3, TANQUE: 10 }, bloques, finTurnoMin: FIN });
    // Faltan 7: hasta las 19:30 serían 5 parejas (solo hay 3 delanteros);
    // hasta las 23:00 (6,5 h → 3,25 por pareja) bastan 3.
    const m = horasExtraParaMeta_({ proyeccion: p, meta: 20, bloques, finTurnoMin: FIN });
    expect(m.parejas).toBe(3);
    expect(m.hastaMin).toBe(1380);
    expect(m.alcanza).toBe(true);
    const imposible = horasExtraParaMeta_({ proyeccion: p, meta: 60, bloques, finTurnoMin: FIN });
    expect(imposible.alcanza).toBe(false);
  });
});

describe("metaVentana_", () => {
  const base = { meta: 33, inicioTurnoMin: 420, finTurnoMin: FIN };   // 07:00–16:30

  it("sin horas extra, la meta guía hasta el fin de turno", () => {
    expect(metaVentana_(base)).toMatchObject({ meta: 33, hastaMin: FIN, extendida: false });
  });

  it("regla de 3 hasta la salida más tardía", () => {
    const m = metaVentana_({ ...base, extras: [{ hastaMin: 1170 }, { hastaMin: 1080 }] });
    expect(m.hastaMin).toBe(1170);                     // 19:30, la más tardía
    expect(m.meta).toBe(Math.round(33 * 750 / 570));   // 12,5 h / 9,5 h → 43
    expect(m.extendida).toBe(true);
    expect(metaVentana_({ ...base, extras: [{ hastaMin: 1500 }] }).meta).toBe(Math.round(33 * 1080 / 570)); // hasta la 01:00
  });
});

describe("minutoJornada_", () => {
  it("la madrugada es de la misma jornada", () => {
    expect(minutoJornada_("19:30")).toBe(1170);
    expect(minutoJornada_("01:00")).toBe(1500);
    expect(minutoJornada_("x")).toBeNull();
  });
});

describe("proyección por técnico", () => {
  const regs = [
    ...Array.from({ length: 10 }, () => ({ userId: "a", rol: "MOTOR", mitades: 3 })),
    ...Array.from({ length: 10 }, () => ({ userId: "b", rol: "MOTOR", mitades: 1 })),
    { userId: "c", rol: "TANQUE", mitades: 2 },
  ];
  const ritmos = ritmosPorTecnico_(regs);

  it("el ritmo se encoge hacia la media de su puesto", () => {
    expect(ritmos.mediaRol.MOTOR).toBe(2);
    expect(ritmos.porTecnico.a.media).toBeCloseTo((30 + 10) / 15, 5);
    expect(ritmos.porTecnico.b.media).toBeCloseTo((10 + 10) / 15, 5);
  });

  it("lo de cada puesto suma los carros del turno y la hora extra va aparte", () => {
    const proyeccion = { turno: { esperado: 10 }, extraHora: { MOTOR: 0.5, TANQUE: 0.5 } };
    const out = proyeccionPorTecnico_({
      tecnicos: [
        { userId: "a", rol: "MOTOR", presente: true, hastaMin: 1170 },
        { userId: "b", rol: "MOTOR", presente: true },
        { userId: "c", rol: "TANQUE", presente: true },
        { userId: "d", rol: "TANQUE", presente: false },
      ],
      proyeccion, ritmos, finTurnoMin: 990,
    });
    const de = (id) => out.find(x => x.userId === id);
    expect(de("a").turno + de("b").turno).toBeCloseTo(10, 5);
    expect(de("a").turno).toBeGreaterThan(de("b").turno);
    expect(de("c").turno).toBeCloseTo(10, 5);
    expect(de("d").turno).toBe(0);                     // no vino
    expect(de("a").extra).toBeCloseTo(1.5, 5);         // 3 h × 0,5
  });
});
