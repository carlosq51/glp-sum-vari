// =========================
// test/pausa-horario.test.js
// La pausa de comida se dispara UNA vez al día, a la hora del taller.
//
// Los dos bugs que estas pruebas fijan:
//   · la comparación se hacía contra el reloj del proceso (getHours()), no
//     contra la hora Perú: un servidor en UTC pausaba el almuerzo a las 08:00;
//   · la ventana de disparo era de 5 minutos, así que cualquier reinicio o
//     minuto de red caída a las 12:50 se comía el almuerzo entero, en silencio.
// =========================

import { describe, it, expect } from "vitest";
import { eventosHorario_, tocaDisparar_ } from "../lib/pausa-masiva.js";

const CFG = { HORARIO_COMIDA_INICIO: "12:50", HORARIO_COMIDA_FIN: "14:00" };
const HOY = "2026-8-25";
const ev_ = (cfg, clave) => eventosHorario_(cfg).find(e => e.clave === clave);
const min_ = (h, m) => h * 60 + m;

describe("eventosHorario_", () => {
  it("lee la hora de app_config, no una constante", () => {
    const [ini, fin] = eventosHorario_(CFG);
    expect(ini.min).toBe(min_(12, 50));
    expect(fin.min).toBe(min_(14, 0));
  });

  it("la comida es recuperable hasta que termina la comida", () => {
    expect(ev_(CFG, "COMIDA_INI").hasta).toBe(min_(14, 0));
  });

  it("si el fin de comida no se entiende, la ventana no se queda abierta", () => {
    const ev = ev_({ HORARIO_COMIDA_INICIO: "12:50", HORARIO_COMIDA_FIN: "nada" }, "COMIDA_INI");
    expect(ev.hasta).toBe(min_(13, 20)); // 30 min de gracia
  });

  it("no inventa horas si la config viene vacía", () => {
    const [ini, fin] = eventosHorario_({});
    expect(ini.min).toBeNull();
    expect(fin.min).toBeNull();
  });

  it("las 16:20 (descanso) NO son un evento: el fin del día lo marca la salida", () => {
    const claves = eventosHorario_({ ...CFG, HORARIO_DESCANSO_INICIO: "16:20" }).map(e => e.clave);
    expect(claves).toEqual(["COMIDA_INI", "COMIDA_FIN"]);
  });
});

describe("tocaDisparar_", () => {
  const ini = ev_(CFG, "COMIDA_INI");
  const fin = ev_(CFG, "COMIDA_FIN");

  it("dispara en su minuto exacto", () => {
    expect(tocaDisparar_(ini, min_(12, 50), "", HOY)).toBe(true);
  });

  it("no dispara antes de su hora", () => {
    expect(tocaDisparar_(ini, min_(12, 49), "", HOY)).toBe(false);
  });

  it("recupera la comida tras un reinicio a media hora de almuerzo", () => {
    expect(tocaDisparar_(ini, min_(13, 20), "", HOY)).toBe(true);
  });

  it("ya no pausa la comida cuando la comida terminó", () => {
    expect(tocaDisparar_(ini, min_(14, 0), "", HOY)).toBe(false);
    expect(tocaDisparar_(ini, min_(16, 20), "", HOY)).toBe(false);
  });

  it("la reanudación se recupera media hora y no más", () => {
    expect(tocaDisparar_(fin, min_(14, 29), "", HOY)).toBe(true);
    expect(tocaDisparar_(fin, min_(14, 30), "", HOY)).toBe(false);
  });

  it("con la marca de hoy puesta no vuelve a disparar (reinicio en bucle)", () => {
    expect(tocaDisparar_(ini, min_(13, 20), `${HOY} 12:50 · 7 OT`, HOY)).toBe(false);
  });

  it("la marca de ayer no bloquea la de hoy", () => {
    expect(tocaDisparar_(ini, min_(12, 50), "2026-8-24 12:51 · 7 OT", HOY)).toBe(true);
  });

  it("un día que empieza igual no cuenta como el mismo día", () => {
    // "2026-8-2" es prefijo textual de "2026-8-25": sin el separador, el día 2
    // bloquearía al 25. Por eso la marca lleva el espacio detrás.
    expect(tocaDisparar_(ini, min_(12, 50), "2026-8-2 12:51 · 3 OT", "2026-8-25")).toBe(true);
  });

  it("sin hora configurada no dispara nunca", () => {
    const vacio = eventosHorario_({})[0];
    expect(tocaDisparar_(vacio, min_(12, 50), "", HOY)).toBe(false);
  });
});
