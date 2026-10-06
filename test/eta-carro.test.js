import { describe, it, expect } from "vitest";

const {
  medianasPorCelda_, medianaDe_, minutosUtiles_, etaCarro_, MOTIVO_ETA,
} = await import("../lib/eta-carro.js");

const H = 3_600_000;
const reps = (n, r) => Array.from({ length: n }, () => r);

describe("medianasPorCelda_", () => {
  it("mide cada modelo por separado cuando hay con qué", () => {
    const m = medianasPorCelda_([
      ...reps(10, { modelo: "Jetour MEC", rol: "MOTOR", ms: 2 * H }),
      ...reps(10, { modelo: "VW Polo",    rol: "MOTOR", ms: 4 * H }),
    ]);
    expect(medianaDe_(m, "Jetour MEC", "MOTOR")).toBe(2 * H);
    expect(medianaDe_(m, "VW Polo", "MOTOR")).toBe(4 * H);
  });

  it("un modelo con pocos carros cae al listón de su puesto", () => {
    // Tres carros de un modelo dicen más de esos tres carros que del modelo.
    const m = medianasPorCelda_([
      ...reps(20, { modelo: "Jetour MEC", rol: "MOTOR", ms: 3 * H }),
      ...reps(3,  { modelo: "Novedad",    rol: "MOTOR", ms: 9 * H }),
    ]);
    expect(m.porCelda.has("Novedad|MOTOR")).toBe(false);
    expect(medianaDe_(m, "Novedad", "MOTOR")).toBe(medianaDe_(m, "", "MOTOR"));
  });

  it("las mitades que nadie cerró no mueven la mediana de su modelo", () => {
    // En la historia real hay mitades de 49 h: no son trabajo, son OTs abiertas.
    const sanas = reps(10, { modelo: "Jetour MEC", rol: "TANQUE", ms: 3 * H });
    const conZombis = medianasPorCelda_([
      ...sanas,
      ...reps(40, { modelo: "Otro", rol: "TANQUE", ms: 3 * H }),   // el listón del puesto
      ...reps(3,  { modelo: "Jetour MEC", rol: "TANQUE", ms: 49 * H }),
    ]);
    expect(medianaDe_(conZombis, "Jetour MEC", "TANQUE")).toBe(3 * H);
  });

  it("sin historia no se inventa un listón", () => {
    const m = medianasPorCelda_([]);
    expect(medianaDe_(m, "Jetour MEC", "MOTOR")).toBe(null);
    expect(medianaDe_(m, "", "TANQUE")).toBe(null);
  });

  it("ignora basura sin romperse", () => {
    const m = medianasPorCelda_([
      { modelo: "X", rol: "MOTOR", ms: 0 },
      { modelo: "X", rol: "CALIDAD", ms: 2 * H },   // CALIDAD no es mitad de carro
      null, undefined,
      ...reps(9, { modelo: "X", rol: "MOTOR", ms: 2 * H }),
    ]);
    expect(medianaDe_(m, "X", "MOTOR")).toBe(2 * H);
  });
});

describe("minutosUtiles_", () => {
  const FIN = 16 * 60 + 30;   // 16:30

  it("cuenta lo que queda hasta el fin del turno", () => {
    expect(minutosUtiles_({ ahoraMin: 15 * 60, finTurnoMin: FIN })).toBe(90);
  });

  it("descuenta la comida si cae por delante", () => {
    const u = minutosUtiles_({ ahoraMin: 11 * 60, finTurnoMin: FIN, comidaIniMin: 13 * 60, comidaFinMin: 14 * 60 });
    expect(u).toBe(330 - 60);
  });

  it("la comida ya pasada no se descuenta dos veces", () => {
    const u = minutosUtiles_({ ahoraMin: 15 * 60, finTurnoMin: FIN, comidaIniMin: 13 * 60, comidaFinMin: 14 * 60 });
    expect(u).toBe(90);
  });

  it("a mitad del almuerzo solo descuenta lo que queda de almuerzo", () => {
    const u = minutosUtiles_({ ahoraMin: 13 * 60 + 30, finTurnoMin: FIN, comidaIniMin: 13 * 60, comidaFinMin: 14 * 60 });
    expect(u).toBe(180 - 30);
  });

  it("pasado el turno no quedan minutos: la hora extra no se da por hecha", () => {
    expect(minutosUtiles_({ ahoraMin: 18 * 60, finTurnoMin: FIN })).toBe(0);
    expect(minutosUtiles_({ ahoraMin: FIN, finTurnoMin: FIN })).toBe(0);
  });
});

describe("etaCarro_", () => {
  const AHORA = Date.parse("2026-10-06T15:00:00Z");
  const medianas = medianasPorCelda_([
    ...reps(10, { modelo: "Jetour MEC", rol: "MOTOR",  ms: 3 * H }),
    ...reps(10, { modelo: "Jetour MEC", rol: "TANQUE", ms: 3 * H }),
  ]);
  const trabajando = (horasHechas) => ({
    estado: "TRABAJANDO", tiempoMs: horasHechas * H, runningSince: null,
  });
  const eta = (puestos, minutosUtiles = 300) =>
    etaCarro_({ puestos, medianas, modelo: "Jetour MEC", ahoraMs: AHORA, minutosUtiles });

  it("con la dupla trabajando dice cuánto falta", () => {
    const r = eta({ MOTOR: trabajando(2), TANQUE: trabajando(2.5) });
    expect(r.estimable).toBe(true);
    expect(r.faltaMs).toBe(1 * H);        // manda la mitad más atrasada: MOTOR
    expect(r.puestoLento).toBe("MOTOR");
  });

  it("el carro acaba con la mitad de atrás, no con el promedio", () => {
    // Promediar (0,5 h y 2,5 h) prometería el carro a la hora y media: no sale.
    const r = eta({ MOTOR: trabajando(0.5), TANQUE: trabajando(2.5) });
    expect(r.faltaMs).toBe(2.5 * H);
    expect(r.puestoLento).toBe("MOTOR");
  });

  it("suma lo que lleva corriendo desde el último REANUDAR", () => {
    const r = eta({
      MOTOR:  { estado: "TRABAJANDO", tiempoMs: 1 * H, runningSince: new Date(AHORA - 1 * H).toISOString() },
      TANQUE: trabajando(2),
    });
    expect(r.faltaMs).toBe(1 * H);        // 1 h guardada + 1 h corriendo = 2 h hechas
  });

  it("la mitad ya cerrada no arrastra al carro", () => {
    const r = eta({ MOTOR: { estado: "FINALIZADO", tiempoMs: 9 * H }, TANQUE: trabajando(2) });
    expect(r.faltaMs).toBe(1 * H);
    expect(r.puestoLento).toBe("TANQUE");
  });

  it("si ya pasó lo normal, el carro sale en cualquier momento", () => {
    const r = eta({ MOTOR: trabajando(5), TANQUE: trabajando(6) });
    expect(r.estimable).toBe(true);
    expect(r.faltaMs).toBe(0);
    expect(r.pasado).toBe(true);
  });

  it("dice si cabe en lo que queda de turno", () => {
    expect(eta({ MOTOR: trabajando(2), TANQUE: trabajando(2) }, 90).alcanzaHoy).toBe(true);
    expect(eta({ MOTOR: trabajando(0), TANQUE: trabajando(0) }, 90).alcanzaHoy).toBe(false);
  });

  // ── Los casos en que NO se da número ─────────────────────────────────────
  it("falta una mitad: eso lo arregla el despacho, no el ritmo", () => {
    const r = eta({ MOTOR: trabajando(2), TANQUE: null });
    expect(r.estimable).toBe(false);
    expect(r.motivo).toBe(MOTIVO_ETA.FALTA_UNO);
    expect(r.faltanPuestos).toEqual(["TANQUE"]);
  });

  it("el reloj parado no se estima: la pausa la levanta una persona", () => {
    const r = eta({ MOTOR: trabajando(2), TANQUE: { estado: "PAUSADO", tiempoMs: 2 * H } });
    expect(r.motivo).toBe(MOTIVO_ETA.EN_PAUSA);
  });

  it("sin empezar tampoco es trabajo en curso", () => {
    const r = eta({ MOTOR: trabajando(2), TANQUE: { estado: "SIN_INICIAR", tiempoMs: 0 } });
    expect(r.motivo).toBe(MOTIVO_ETA.EN_PAUSA);
  });

  it("las dos cerradas: el carro está listo", () => {
    const r = eta({ MOTOR: { estado: "FINALIZADO" }, TANQUE: { estado: "FINALIZADO" } });
    expect(r.motivo).toBe(MOTIVO_ETA.LISTO);
  });

  it("sin historia de ese trabajo no se estima nada", () => {
    const r = etaCarro_({
      puestos: { MOTOR: trabajando(2), TANQUE: trabajando(2) },
      medianas: medianasPorCelda_([]), modelo: "Lo que sea", ahoraMs: AHORA, minutosUtiles: 300,
    });
    expect(r.motivo).toBe(MOTIVO_ETA.SIN_BASE);
  });

  it("sin argumentos no afirma nada", () => {
    expect(etaCarro_().estimable).toBe(false);
    expect(etaCarro_({}).estimable).toBe(false);
  });
});
