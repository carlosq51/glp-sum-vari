import { describe, it, expect, vi } from "vitest";

// La costura entre el payload de /api/zonas y la tarjeta: que los relojes que
// manda el servidor lleguen al cálculo, y que cada rol vea lo que le toca.
// El cálculo en sí se prueba en eta-carro.test.js.

let ROL = "ADMIN";
vi.mock("../public/js/views/zonas/zonas-despacho.js", () => ({
  puedeDespachar_: () => ROL === "ADMIN" || ROL === "SUPERVISOR",
  montarPuestos_: async () => {},
  CONSOLA_DESPACHO: "#",
}));
vi.mock("../public/js/core/config.js", () => ({
  cfg: (k) => ({
    PROYECCION_FIN_TURNO: "16:30",
    HORARIO_COMIDA_INICIO: "13:00",
    HORARIO_COMIDA_FIN: "14:00",
  }[k]),
}));
// minutosPE_ fijo a las 11:00: quedan 330 min menos la hora de almuerzo = 270.
vi.mock("../public/js/core/format.js", () => ({
  hhmmAMin_: (t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  },
  minutosPE_: () => 11 * 60,
}));

const { etaDeZona_, etaBadgeHTML_, etaLineaHTML_ } = await import("../public/js/views/zonas/zonas-eta.js");

const H = 3_600_000;
// Como lo manda armarMapaZonas_: medianas planas (los Map no sobreviven a JSON).
const MEDIANAS = { porCelda: { "Jetour X70|MOTOR": 3 * H, "Jetour X70|TANQUE": 3 * H }, porRol: { MOTOR: 3 * H, TANQUE: 3 * H } };

const zona = (relojes, extra = {}) => ({
  zona_id: 7, vin: "LVTDB11B6VH514539", estado: "EN_CONVERSION", modelo: "Jetour X70",
  tecnicos: { delantero: "JOSE", tanquero: "LUIS", relojes },
  ...extra,
});
const curro = (h) => ({ estado: "TRABAJANDO", tiempoMs: h * H, runningSince: null });

describe("etaDeZona_", () => {
  it("lee los relojes tal como los manda el servidor", () => {
    const r = etaDeZona_(zona({ MOTOR: curro(2), TANQUE: curro(2.5) }), MEDIANAS);
    expect(r.estimable).toBe(true);
    expect(r.faltaMs).toBe(1 * H);
  });

  it("usa el listón del MODELO del carro, no uno global", () => {
    const medianas = { porCelda: { "VW Tera|TANQUE": 5 * H }, porRol: { MOTOR: 3 * H, TANQUE: 3 * H } };
    const r = etaDeZona_(zona({ MOTOR: curro(3), TANQUE: curro(3) }, { modelo: "VW Tera" }), medianas);
    // Medido: el tanque de un VW Tera tarda 5 h y el de un Jetour 2,9. Con el
    // listón global este carro saldría "ya está" cuando le faltan dos horas.
    expect(r.faltaMs).toBe(2 * H);
  });

  it("plaza vacía o sin medianas: ningún estimado", () => {
    expect(etaDeZona_({ zona_id: 3, vin: null }, MEDIANAS)).toBe(null);
    expect(etaDeZona_(zona({ MOTOR: curro(2), TANQUE: curro(2) }), null)).toBe(null);
  });

  it("el carro terminado se declara listo sin mirar relojes", () => {
    const r = etaDeZona_(zona({}, { estado: "FINALIZADO" }), MEDIANAS);
    expect(r.motivo).toBe("LISTO");
  });

  it("descuenta el almuerzo que queda por delante", () => {
    // A las 11:00 quedan 330 min de turno, pero 270 útiles. Un carro al que le
    // faltan 4,5 h (270 min) entra justo; 5 h ya no.
    expect(etaDeZona_(zona({ MOTOR: curro(0), TANQUE: curro(0) }, { modelo: "x" }), { porRol: { MOTOR: 4.5 * H, TANQUE: 4.5 * H } }).alcanzaHoy).toBe(true);
    expect(etaDeZona_(zona({ MOTOR: curro(0), TANQUE: curro(0) }, { modelo: "x" }), { porRol: { MOTOR: 5 * H, TANQUE: 5 * H } }).alcanzaHoy).toBe(false);
  });
});

describe("quién ve qué", () => {
  const eta = { estimable: true, faltaMs: 1.25 * H, alcanzaHoy: true, puestoLento: "MOTOR" };

  it("supervisión ve el número", () => {
    ROL = "SUPERVISOR";
    expect(etaBadgeHTML_(eta)).toContain("~1 h 15");
    expect(etaLineaHTML_(eta)).toContain("~1 h 15");
  });

  it("el movilizador ve el veredicto y NINGÚN número", () => {
    ROL = "MOVILIZADOR";
    const badge = etaBadgeHTML_(eta);
    expect(badge).toContain("sale hoy");
    expect(badge).not.toMatch(/\d/);
    expect(etaLineaHTML_(eta)).not.toMatch(/~\d/);
  });

  it("no alcanza: lo dice sin número tampoco", () => {
    ROL = "MOVILIZADOR";
    expect(etaBadgeHTML_({ ...eta, alcanzaHoy: false })).toContain("no sale hoy");
  });

  it("redondea a cuartos de hora: no finge minutos que no tiene", () => {
    ROL = "ADMIN";
    expect(etaBadgeHTML_({ estimable: true, faltaMs: 20 * 60_000, alcanzaHoy: true })).toContain("~15 min");
    expect(etaBadgeHTML_({ estimable: true, faltaMs: 23 * 60_000, alcanzaHoy: true })).toContain("~30 min");
    expect(etaBadgeHTML_({ estimable: true, faltaMs: 2.04 * H, alcanzaHoy: true })).toContain("~2 h");
    expect(etaBadgeHTML_({ estimable: true, faltaMs: 1.3 * H, alcanzaHoy: true })).toContain("~1 h 15");
  });

  it("nunca redondea a cero: 'falta ~0 min' sería decir que ya está", () => {
    ROL = "ADMIN";
    expect(etaBadgeHTML_({ estimable: true, faltaMs: 60_000, alcanzaHoy: true })).toContain("~15 min");
  });
});

describe("los casos sin número", () => {
  it("falta UNA mitad: se avisa, porque el carro parece ocupado y no va a salir", () => {
    ROL = "MOVILIZADOR";
    const html = etaBadgeHTML_({ estimable: false, motivo: "FALTA_UNO", faltanPuestos: ["TANQUE"] });
    expect(html).toContain("falta tanquero");
  });

  it("faltan las DOS: la tarjeta ya lo dice sola, no se repite en rojo", () => {
    ROL = "ADMIN";
    expect(etaBadgeHTML_({ estimable: false, motivo: "FALTA_UNO", faltanPuestos: ["MOTOR", "TANQUE"] })).toBe("");
    // En la hoja, que se abre a propósito, sí se explica.
    expect(etaLineaHTML_({ estimable: false, motivo: "FALTA_UNO", faltanPuestos: ["MOTOR", "TANQUE"] }))
      .toContain("no tiene a nadie asignado");
  });

  it("el reloj parado no ensucia la rejilla, pero se explica al abrir", () => {
    expect(etaBadgeHTML_({ estimable: false, motivo: "EN_PAUSA" })).toBe("");
    expect(etaLineaHTML_({ estimable: false, motivo: "EN_PAUSA" })).toContain("reloj está parado");
  });

  it("sin historia del modelo se calla en vez de inventar", () => {
    expect(etaBadgeHTML_({ estimable: false, motivo: "SIN_BASE" })).toBe("");
    expect(etaLineaHTML_({ estimable: false, motivo: "SIN_BASE" })).toContain("Sin historia");
  });

  it("sin estimado no se pinta nada", () => {
    expect(etaBadgeHTML_(null)).toBe("");
    expect(etaLineaHTML_(null)).toBe("");
  });
});
