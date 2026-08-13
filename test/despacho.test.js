import { describe, it, expect } from "vitest";

const {
  jornadaFecha_, jornadaRango_, hhmmAMinutos_,
  slotActual_, firmarSlot_, verificarToken_,
  aplicarMarca_, reconstruirJornada_, estadoEfectivo_, esAsignable_,
  unidadesDeTrabajo_, proximoResponsable_, validarDupla_,
} = await import("../lib/despacho.js");

// Instante UTC que corresponde a una hora dada de Perú (UTC-5).
const peru = (y, m, d, h, mi = 0) => new Date(Date.UTC(y, m - 1, d, h + 5, mi));

// ─────────────────────────────────────────────
// jornadaFecha_ — el corte 06:00 → 05:00
// ─────────────────────────────────────────────
describe("jornadaFecha_", () => {
  it("las 07:00 del lunes pertenecen al lunes", () => {
    expect(jornadaFecha_(peru(2026, 8, 3, 7))).toBe("2026-08-03");
  });

  it("las 23:00 del lunes siguen siendo del lunes", () => {
    expect(jornadaFecha_(peru(2026, 8, 3, 23))).toBe("2026-08-03");
  });

  it("las 02:00 del martes todavía son la jornada del lunes", () => {
    expect(jornadaFecha_(peru(2026, 8, 4, 2))).toBe("2026-08-03");
  });

  it("las 05:59 del martes son del lunes; las 06:00 ya son del martes", () => {
    expect(jornadaFecha_(peru(2026, 8, 4, 5, 59))).toBe("2026-08-03");
    expect(jornadaFecha_(peru(2026, 8, 4, 6, 0))).toBe("2026-08-04");
  });

  it("cruza fin de mes sin romperse", () => {
    expect(jornadaFecha_(peru(2026, 9, 1, 3))).toBe("2026-08-31");
  });

  it("usa hora Perú, no UTC — 20:00 de Lima es el día siguiente en UTC", () => {
    // 2026-08-03 20:00 Perú = 2026-08-04 01:00 UTC. La jornada es del día 3.
    expect(jornadaFecha_(peru(2026, 8, 3, 20))).toBe("2026-08-03");
  });
});

describe("jornadaRango_", () => {
  it("arranca a las 06:00 hora Perú y dura 23 h", () => {
    const { desde, hasta } = jornadaRango_("2026-08-03");
    expect(desde.toISOString()).toBe("2026-08-03T11:00:00.000Z"); // 06:00 -05
    expect(hasta.toISOString()).toBe("2026-08-04T10:00:00.000Z"); // 05:00 -05
  });
});

describe("hhmmAMinutos_", () => {
  it("convierte horas válidas", () => {
    expect(hhmmAMinutos_("07:00")).toBe(420);
    expect(hhmmAMinutos_("00:00")).toBe(0);
    expect(hhmmAMinutos_("23:59")).toBe(1439);
  });
  it("rechaza basura", () => {
    expect(hhmmAMinutos_("25:00")).toBe(null);
    expect(hhmmAMinutos_("")).toBe(null);
    expect(hhmmAMinutos_("7")).toBe(null);
  });
});

// ─────────────────────────────────────────────
// QR rotativo
// ─────────────────────────────────────────────
describe("token del QR", () => {
  const VENT = 300;   // 5 min, como en producción

  // Instante controlado: `seg` segundos dentro del slot actual.
  const enSlot = (seg) => {
    const base = Math.floor(Date.now() / 1000 / VENT) * VENT;
    return new Date((base + seg) * 1000);
  };

  it("acepta el token del slot actual", () => {
    const t = firmarSlot_(slotActual_(VENT));
    expect(verificarToken_(t, VENT).ok).toBe(true);
  });

  it("acepta el código anterior justo después del cambio", () => {
    const d = enSlot(5);                       // 5 s tras el cambio
    const t = firmarSlot_(slotActual_(VENT, d) - 1);
    expect(verificarToken_(t, VENT, d).ok).toBe(true);
  });

  it("deja de aceptar el anterior pasada la gracia", () => {
    const d = enSlot(60);                      // 1 min tras el cambio
    const t = firmarSlot_(slotActual_(VENT, d) - 1);
    const r = verificarToken_(t, VENT, d);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/venció/);
  });

  it("rechaza un token viejo: una captura de pantalla no sirve", () => {
    const t = firmarSlot_(slotActual_(VENT) - 10);
    const r = verificarToken_(t, VENT);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/venció/);
  });

  it("rechaza una firma alterada", () => {
    const t = firmarSlot_(slotActual_(30));
    const falso = t.slice(0, -1) + (t.slice(-1) === "a" ? "b" : "a");
    expect(verificarToken_(falso, 30).ok).toBe(false);
  });

  it("rechaza un slot futuro inventado sin firma válida", () => {
    expect(verificarToken_(`${slotActual_(30) + 5}.xxxxxxxxxxxxxxxxxxxxxx`, 30).ok).toBe(false);
  });

  it("rechaza basura", () => {
    expect(verificarToken_("", 30).ok).toBe(false);
    expect(verificarToken_("abc", 30).ok).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Máquina de estados
// ─────────────────────────────────────────────
describe("aplicarMarca_", () => {
  it("ingreso desde fuera", () => {
    expect(aplicarMarca_("FUERA", "INGRESO")).toEqual({ ok: true, siguiente: "PRESENTE" });
  });

  it("no permite marcar ingreso dos veces", () => {
    const r = aplicarMarca_("PRESENTE", "INGRESO");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ya marcaste/);
  });

  it("no permite salir sin haber entrado", () => {
    expect(aplicarMarca_("FUERA", "SALIDA").ok).toBe(false);
  });

  it("pausa y reanudación", () => {
    expect(aplicarMarca_("DISPONIBLE", "PAUSA_INI").siguiente).toBe("PAUSA");
    expect(aplicarMarca_("PAUSA", "PAUSA_FIN").siguiente).toBe("PRESENTE");
  });

  it("se puede marcar salida estando en pausa", () => {
    expect(aplicarMarca_("PAUSA", "SALIDA").siguiente).toBe("FUERA");
  });

  it("el cierre automático saca a cualquiera que quedó adentro", () => {
    for (const e of ["PRESENTE", "DISPONIBLE", "OCUPADO", "PAUSA"]) {
      expect(aplicarMarca_(e, "CIERRE_AUTO").siguiente).toBe("FUERA");
    }
  });
});

// ─────────────────────────────────────────────
// Reconstrucción desde la bitácora
// ─────────────────────────────────────────────
describe("reconstruirJornada_", () => {
  const marca = (tipo, h, mi = 0) => ({ tipo, ts: peru(2026, 8, 3, h, mi).toISOString() });

  it("jornada completa con almuerzo", () => {
    const j = reconstruirJornada_([
      marca("INGRESO", 6, 50),
      marca("PAUSA_INI", 13, 0),
      marca("PAUSA_FIN", 14, 0),
      marca("SALIDA", 17, 30),
    ]);
    expect(j.estado).toBe("FUERA");
    expect(j.minutosPausa).toBe(60);
    expect(j.salidaAuto).toBe(false);
  });

  it("sigue adentro si no marcó salida", () => {
    expect(reconstruirJornada_([marca("INGRESO", 7)]).estado).toBe("PRESENTE");
  });

  it("ordena por timestamp aunque lleguen desordenadas", () => {
    const j = reconstruirJornada_([marca("SALIDA", 17), marca("INGRESO", 7)]);
    expect(j.estado).toBe("FUERA");
  });

  it("ignora marcas incoherentes en vez de romperse", () => {
    const j = reconstruirJornada_([
      marca("INGRESO", 7),
      marca("INGRESO", 8),   // duplicada: se descarta
      marca("SALIDA", 17),
    ]);
    expect(j.estado).toBe("FUERA");
  });

  it("el cierre automático queda marcado como tal", () => {
    // El cierre corre a las 05:00 del día SIGUIENTE — sigue siendo la misma
    // jornada, pero es un instante posterior al ingreso.
    const cierre = { tipo: "CIERRE_AUTO", ts: peru(2026, 8, 4, 5).toISOString() };
    const j = reconstruirJornada_([marca("INGRESO", 7), cierre]);
    expect(j.estado).toBe("FUERA");
    expect(j.salidaAuto).toBe(true);
    expect(jornadaFecha_(new Date(cierre.ts))).toBe("2026-08-03"); // misma jornada
  });

  it("cierra la pausa abierta al salir", () => {
    const j = reconstruirJornada_([
      marca("INGRESO", 7), marca("PAUSA_INI", 13), marca("SALIDA", 13, 45),
    ]);
    expect(j.minutosPausa).toBe(45);
    expect(j.pausaDesde).toBe(null);
  });

  it("una jornada vacía es FUERA", () => {
    expect(reconstruirJornada_([]).estado).toBe("FUERA");
  });
});

// ─────────────────────────────────────────────
// Elegibilidad para recibir vehículo
// ─────────────────────────────────────────────
describe("estadoEfectivo_", () => {
  const base = { turnoInicioMin: 420, ahoraMin: 600, tieneTrabajo: false };

  it("presente antes del turno todavía no es asignable", () => {
    const e = estadoEfectivo_("PRESENTE", { ...base, ahoraMin: 390 }); // 06:30
    expect(e).toBe("PRESENTE");
    expect(esAsignable_(e)).toBe(false);
  });

  it("presente después del turno es asignable", () => {
    const e = estadoEfectivo_("PRESENTE", base); // 10:00
    expect(e).toBe("DISPONIBLE");
    expect(esAsignable_(e)).toBe(true);
  });

  it("con trabajo en curso queda ocupado", () => {
    expect(estadoEfectivo_("PRESENTE", { ...base, tieneTrabajo: true })).toBe("OCUPADO");
  });

  it("en pausa nunca es asignable, aunque no tenga trabajo", () => {
    const e = estadoEfectivo_("PAUSA", base);
    expect(e).toBe("PAUSA");
    expect(esAsignable_(e)).toBe(false);
  });

  it("quien se fue no recibe carros", () => {
    expect(esAsignable_(estadoEfectivo_("FUERA", base))).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Unidades de trabajo — el mecanismo anti-acaparamiento
// ─────────────────────────────────────────────
describe("unidadesDeTrabajo_", () => {
  const tec = (id, esp = "TANQUE", estadoEfectivo = "DISPONIBLE") =>
    ({ user_id: id, nombre: id, especialidad: esp, estadoEfectivo });

  it("dos tanqueros en dupla cuentan como UNA unidad, no dos", () => {
    const tecnicos = [tec("A"), tec("B"), tec("C")];
    const duplas = [{ id: "d1", rol_trabajo: "TANQUE", miembros: ["A", "B"] }];
    const u = unidadesDeTrabajo_(tecnicos, duplas);

    expect(u).toHaveLength(2);                       // la dupla + C
    expect(u.filter(x => x.tipo === "DUPLA")).toHaveLength(1);
    expect(u[0].miembros.map(m => m.user_id)).toEqual(["A", "B"]);
    // Lo que importa: A y B no aparecen además como unidades sueltas.
    expect(u.filter(x => x.tipo === "SOLO")).toHaveLength(1);
  });

  it("un técnico sin dupla es una unidad de uno", () => {
    const u = unidadesDeTrabajo_([tec("A")], []);
    expect(u).toHaveLength(1);
    expect(u[0].tipo).toBe("SOLO");
    expect(u[0].duplaId).toBe(null);
  });

  it("la dupla no es asignable si un miembro está en pausa", () => {
    const tecnicos = [tec("A"), tec("B", "TANQUE", "PAUSA")];
    const duplas = [{ id: "d1", rol_trabajo: "TANQUE", miembros: ["A", "B"] }];
    expect(unidadesDeTrabajo_(tecnicos, duplas)[0].asignable).toBe(false);
  });

  it("si el compañero no marcó asistencia, la dupla degrada a técnico solo", () => {
    const duplas = [{ id: "d1", rol_trabajo: "TANQUE", miembros: ["A", "B"] }];
    const u = unidadesDeTrabajo_([tec("A")], duplas);   // B no está presente
    expect(u).toHaveLength(1);
    expect(u[0].tipo).toBe("SOLO");
    expect(u[0].asignable).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Crédito alternado (en vez de medios carros)
// ─────────────────────────────────────────────
describe("proximoResponsable_", () => {
  const unidad = (ultimo = null) => ({
    tipo: "DUPLA",
    miembros: [{ user_id: "A" }, { user_id: "B" }],
    ultimoResponsable: ultimo,
  });

  it("el primer carro va al primer miembro", () => {
    expect(proximoResponsable_(unidad(null))).toBe("A");
  });

  it("alterna carro a carro: A, B, A, B", () => {
    const creditos = new Map();
    let ultimo = null;
    const orden = [];
    for (let i = 0; i < 4; i++) {
      const r = proximoResponsable_(unidad(ultimo), creditos);
      orden.push(r);
      creditos.set(r, (creditos.get(r) || 0) + 1);
      ultimo = r;
    }
    expect(orden).toEqual(["A", "B", "A", "B"]);
  });

  it("con 4 carros cada uno acredita 2 — igual que 0.5 × 4, pero enteros", () => {
    const creditos = new Map();
    let ultimo = null;
    for (let i = 0; i < 4; i++) {
      const r = proximoResponsable_(unidad(ultimo), creditos);
      creditos.set(r, (creditos.get(r) || 0) + 1);
      ultimo = r;
    }
    expect(creditos.get("A")).toBe(2);
    expect(creditos.get("B")).toBe(2);
  });

  it("NO le cobra a A los carros que hizo solo antes de la dupla", () => {
    // A trabajó 3 carros solo por la mañana; B llegó tarde. Al formar la
    // dupla, el conteo de la DUPLA arranca en cero para los dos: el primer
    // carro juntos es de A y luego alternan. Los 3 de A siguen siendo suyos.
    const creditosDupla = new Map();       // vacío: la dupla recién empieza
    let ultimo = null;
    const orden = [];
    for (let i = 0; i < 4; i++) {
      const r = proximoResponsable_(unidad(ultimo), creditosDupla);
      orden.push(r);
      creditosDupla.set(r, (creditosDupla.get(r) || 0) + 1);
      ultimo = r;
    }
    expect(orden).toEqual(["A", "B", "A", "B"]);
  });

  it("reencauza la alternancia si un carro de la dupla se anuló", () => {
    // Dentro de la dupla A va 2 y B va 1: aunque el último fue B, le toca a B
    // para volver a emparejar. Es el único caso donde el conteo manda.
    const creditosDupla = new Map([["A", 2], ["B", 1]]);
    expect(proximoResponsable_(unidad("B"), creditosDupla)).toBe("B");
  });

  it("una unidad de uno siempre se acredita a esa persona", () => {
    expect(proximoResponsable_({ miembros: [{ user_id: "Z" }] })).toBe("Z");
  });
});

// ─────────────────────────────────────────────
// Validación al formar duplas
// ─────────────────────────────────────────────
describe("validarDupla_", () => {
  const u = (id, especialidad = "TANQUE", activo = true) =>
    ({ id, nombre: id, especialidad, activo });

  it("dos tanqueros forman dupla de TANQUE", () => {
    const r = validarDupla_(u("A"), u("B"));
    expect(r.ok).toBe(true);
    expect(r.rol).toBe("TANQUE");
  });

  it("dos delanteros (MOTOR) también forman dupla", () => {
    const r = validarDupla_(u("A", "MOTOR"), u("B", "MOTOR"));
    expect(r.ok).toBe(true);
    expect(r.rol).toBe("MOTOR");
  });

  it("un motorista y un tanquero NO son dupla — ese es el flujo normal", () => {
    const r = validarDupla_(u("A", "MOTOR"), u("B", "TANQUE"));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/mismo rol/);
  });

  it("no puedes emparejarte contigo mismo", () => {
    expect(validarDupla_(u("A"), u("A")).ok).toBe(false);
  });

  it("rechaza a quien ya está en una dupla hoy", () => {
    const r = validarDupla_(u("A"), u("B"), { yaEnDupla: new Set(["B"]) });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ya está en una dupla/);
  });

  it("rechaza técnicos inactivos", () => {
    expect(validarDupla_(u("A"), u("B", "TANQUE", false)).ok).toBe(false);
  });

  it("si ambos son AMBOS, el rol queda sin definir y lo elige quien propone", () => {
    const r = validarDupla_(u("A", "AMBOS"), u("B", "AMBOS"));
    expect(r.ok).toBe(true);
    expect(r.rol).toBe(null);
    expect(r.opciones).toEqual(["MOTOR", "TANQUE"]);
  });

  it("un AMBOS puede emparejarse con un tanquero como TANQUE", () => {
    const r = validarDupla_(u("A", "AMBOS"), u("B", "TANQUE"));
    expect(r.ok).toBe(true);
    expect(r.rol).toBe("TANQUE");
  });
});
