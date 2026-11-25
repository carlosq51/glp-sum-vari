import { describe, it, expect } from "vitest";

const {
  salidaEstimada_, presenciaDelUsuario_, tiempoCorregido_, estandaresDe_, normalDe_,
  enDia_, jornadaDeMs_, MIN_N_TECNICO, finesDeCortes_,
} = await import("../lib/tiempo-real.js");
const { proyeccionEnVivoTecnico_ } = await import("../lib/proyeccion.js");
const { relojesPorPuesto_ } = await import("../lib/eta-carro.js");

const H = 3_600_000, MIN = 60_000;
const D = "2026-11-24", D2 = "2026-11-25";
const at = (ymd, hhmm) => { const [h, m] = hhmm.split(":").map(Number); return enDia_(ymd, h * 60 + m); };
const iso = (ms) => new Date(ms).toISOString();
const COMIDA = { iniMin: 770, finMin: 840 };   // 12:50–14:00

describe("jornadaDeMs_", () => {
  it("la madrugada es de la jornada de ayer", () => {
    expect(jornadaDeMs_(at(D2, "04:59"))).toBe(D);
    expect(jornadaDeMs_(at(D2, "06:00"))).toBe(D2);
  });
});

describe("salidaEstimada_", () => {
  it("toma la última actividad, con piso en el fin de turno", () => {
    const s = salidaEstimada_({
      desdeMs: at(D, "07:00"), hastaMs: at(D2, "05:00"),
      actividadMs: [at(D, "09:00"), at(D, "15:10")], pisoMs: at(D, "16:30"),
    });
    expect(s).toBe(at(D, "16:30"));
  });
  it("si trabajó hasta tarde, vale su última actividad", () => {
    const s = salidaEstimada_({
      desdeMs: at(D, "07:00"), hastaMs: at(D2, "05:00"),
      actividadMs: [at(D, "19:45")], pisoMs: at(D, "16:30"),
    });
    expect(s).toBe(at(D, "19:45"));
  });
});

describe("presenciaDelUsuario_", () => {
  it("con CIERRE_AUTO corta en la salida estimada, no a las 05:00", () => {
    const p = presenciaDelUsuario_({
      marcas: [
        { tipo: "INGRESO", ts: iso(at(D, "07:00")), jornada_fecha: D },
        { tipo: "CIERRE_AUTO", ts: iso(at(D2, "05:18")), jornada_fecha: D },
      ],
      actividadMs: [at(D, "11:00")], ahoraMs: at(D2, "12:00"),
    });
    expect(p).toHaveLength(1);
    expect(p[0].b).toBe(at(D, "16:30"));
    expect(p[0].estimada).toBe(true);
  });

  it("un día sin marcas usa el turno y su actividad", () => {
    const p = presenciaDelUsuario_({
      marcas: [], actividadMs: [at(D, "08:10"), at(D, "17:30")], ahoraMs: at(D2, "12:00"),
    });
    expect(p[0].a).toBe(at(D, "07:00"));
    expect(p[0].b).toBe(at(D, "17:30"));
    expect(p[0].sinMarcas).toBe(true);
  });

  it("la hora extra anotada sube el piso", () => {
    const p = presenciaDelUsuario_({
      marcas: [{ tipo: "INGRESO", ts: iso(at(D, "07:00")), jornada_fecha: D }],
      actividadMs: [], ahoraMs: at(D2, "12:00"), extraHasta: { [D]: "19:30" },
    });
    expect(p[0].b).toBe(at(D, "19:30"));
  });
});

describe("tiempoCorregido_", () => {
  it("el caso de la salida olvidada: 16:30 → 05:00 no cuenta", () => {
    // Empezó a las 14:00, se fue a las 16:30 sin marcar, el reloj corrió hasta
    // el cierre de las 05:00 y al día siguiente terminó en 1 h.
    const presencia = [
      { a: at(D, "07:00"), b: at(D, "16:30") },
      { a: at(D2, "07:00"), b: at(D2, "16:30") },
    ];
    const raw = (at(D2, "05:00") - at(D, "14:00")) + 1 * H;   // 16 h de reloj
    const c = tiempoCorregido_({
      rawMs: raw, desdeMs: at(D, "14:00"), hastaMs: at(D2, "08:00"), presencia, comida: COMIDA,
    });
    expect(c.ms).toBe(3.5 * H);       // 2,5 h ayer + 1 h hoy
    expect(c.descontadoMs).toBe(raw - 3.5 * H);
  });

  it("si el reloj cuenta menos que la presencia, se respeta el reloj", () => {
    const c = tiempoCorregido_({
      rawMs: 2 * H, desdeMs: at(D, "08:00"), hastaMs: at(D, "12:00"),
      presencia: [{ a: at(D, "07:00"), b: at(D, "16:30") }],
    });
    expect(c).toMatchObject({ ms: 2 * H, descontadoMs: 0 });
  });

  it("la hora de comida no es presencia", () => {
    const c = tiempoCorregido_({
      rawMs: 5 * H, desdeMs: at(D, "11:00"), hastaMs: at(D, "15:00"),
      presencia: [{ a: at(D, "07:00"), b: at(D, "16:30") }], comida: COMIDA,
    });
    expect(c.ms).toBe(4 * H - 70 * MIN);
  });

  it("sin un solo tramo de presencia no se recorta (falta el dato, no el trabajo)", () => {
    const c = tiempoCorregido_({ rawMs: 9 * H, desdeMs: at(D, "08:00"), hastaMs: at(D, "18:00"), presencia: [] });
    expect(c).toMatchObject({ ms: 9 * H, conEvidencia: false });
  });
});

describe("estandaresDe_ / normalDe_", () => {
  const filas = [];
  for (let i = 0; i < 20; i++) filas.push({ userId: "rapido", rol: "MOTOR", modelo: "Jetour X70", ms: 2 * H });
  for (let i = 0; i < 20; i++) filas.push({ userId: "lento", rol: "MOTOR", modelo: "Jetour X70", ms: 4 * H });
  for (let i = 0; i < 30; i++) filas.push({ userId: "medio" + (i % 6), rol: "MOTOR", modelo: "Jetour X70", ms: 3 * H });
  for (let i = 0; i < 3; i++) filas.push({ userId: "nuevo", rol: "MOTOR", modelo: "Jetour X70", ms: 6 * H });
  const est = estandaresDe_(filas);

  it("el ritmo del rápido es < 1 y el del lento > 1, encogidos hacia 1", () => {
    const r = est.porTecnico.rapido.MOTOR.indice, l = est.porTecnico.lento.MOTOR.indice;
    expect(r).toBeLessThan(1);
    expect(l).toBeGreaterThan(1);
    expect(r).toBeGreaterThan(2 * H / est.porRol.MOTOR);   // encogido, no la razón cruda
  });

  it("con pocos carros se dice el normal del taller", () => {
    const n = normalDe_(est, { userId: "nuevo", modelo: "Jetour X70", rol: "MOTOR" });
    expect(n.propio).toBe(false);
    expect(n.ms).toBe(n.tallerMs);
    expect(3).toBeLessThan(MIN_N_TECNICO);
  });

  it("con carros suficientes, el normal propio = taller × su ritmo", () => {
    const n = normalDe_(est, { userId: "rapido", modelo: "Jetour X70", rol: "MOTOR" });
    expect(n.propio).toBe(true);
    expect(n.ms).toBeLessThan(n.tallerMs);
  });

  it("el mapa usa el ritmo de quien hace la mitad", () => {
    const medianas = { porCelda: {}, porRol: { MOTOR: 3 * H } };
    const r = relojesPorPuesto_({
      puestos: { MOTOR: { estado: "PAUSADO", tiempoMs: 2 * H, indice: 0.8 } }, medianas, modelo: "", ahoraMs: 0,
    });
    expect(r.MOTOR.baseMs).toBeCloseTo(2.4 * H);
  });
});

describe("proyeccionEnVivoTecnico_", () => {
  const base = { ritmoTurno: 3, turnoUtilMin: 510, extraHora: 0.4 };

  it("un carro de ayer casi terminado cuenta hoy y deja tiempo para más", () => {
    const sinArrastre = proyeccionEnVivoTecnico_({ ...base, cerradas: 0, abierta: null, restaTurnoMin: 510 });
    const conArrastre = proyeccionEnVivoTecnico_({
      ...base, cerradas: 0, restaTurnoMin: 510,
      abierta: { hechoMs: 2.5 * H, normalMs: 3 * H },   // le falta media hora
    });
    expect(conArrastre.abierta).toBe(1);
    expect(conArrastre.total).toBeGreaterThan(sinArrastre.total);
  });

  it("lo cerrado ya cuenta, y sin tiempo no se promete nada nuevo", () => {
    const v = proyeccionEnVivoTecnico_({ ...base, cerradas: 2, abierta: null, restaTurnoMin: 0 });
    expect(v.total).toBe(2);
  });

  it("una mitad que no cabe entera cuenta en proporción y no deja sitio a otra", () => {
    const v = proyeccionEnVivoTecnico_({
      ...base, cerradas: 1, restaTurnoMin: 60, abierta: { hechoMs: 0, normalMs: 3 * H },
    });
    expect(v.abierta).toBeCloseTo(1 / 3);
    expect(v.turno).toBeCloseTo(1 + 1 / 3);
  });

  it("si no le alcanza el turno, la termina en su hora extra", () => {
    const v = proyeccionEnVivoTecnico_({
      ...base, cerradas: 0, restaTurnoMin: 30, restaExtraMin: 120, abierta: { hechoMs: 2 * H, normalMs: 3 * H },
    });
    expect(v.abierta).toBe(1);
    expect(v.extra).toBeGreaterThan(0.5);
  });
});

describe("la regla de operaciones: fin del corte de su última actividad", () => {

  const CORTES = "05:00-10:30|07:00–10:30,10:30-13:00,13:00-16:30,16:30-19:30,19:30-23:00,23:00-02:00|23:00–01:00";
  const fines = finesDeCortes_(CORTES);
  const COMIDAS = [COMIDA, { iniMin: 1160, finMin: 1230 }];   // + cena 19:20–20:30
  const pres_ = (ini, extra = {}) => presenciaDelUsuario_({
    marcas: [], actividadMs: ini, ahoraMs: at("2026-11-30", "12:00"), finesCorteMin: fines,
    finTurnoSabadoMin: 690, ...extra,
  });

  it("empezó a las 14:00 y cerró a las 08:00 → se fue a las 16:30", () => {
    const p = pres_([at(D, "14:00"), at(D2, "08:00")]);
    const c = tiempoCorregido_({ rawMs: 18 * H, desdeMs: at(D, "14:00"), hastaMs: at(D2, "08:00"), presencia: p, comida: COMIDAS });
    expect(c.ms).toBe(2.5 * H + 1 * H);
  });

  it("empezó a las 17:00 (hora extra) y cerró a las 08:00 → se fue a las 19:30", () => {
    const p = pres_([at(D, "17:00"), at(D2, "08:00")]);
    const c = tiempoCorregido_({ rawMs: 15 * H, desdeMs: at(D, "17:00"), hastaMs: at(D2, "08:00"), presencia: p, comida: COMIDAS });
    // 17:00–19:30 menos la cena desde 19:20, y 07:00–08:00 al día siguiente
    expect(c.ms).toBe(2.5 * H - 10 * MIN + 1 * H);
  });

  it("quien se queda hasta la 1 sin anotar nada: su último botón manda", () => {
    const p = pres_([at(D, "08:00"), at(D, "23:40")]);
    expect(p[0].b).toBe(enDia_(D, 26 * 60));   // 02:00, fin del corte de noche
  });

  it("sábado: empezó a las 10:00 y cerró el lunes → se fue a las 11:30", () => {
    const SAB = "2026-11-28", LUN = "2026-11-30";
    const p = pres_([at(SAB, "10:00"), at(LUN, "08:00")]);
    expect(p[0].b).toBe(at(SAB, "11:30"));
  });
});
