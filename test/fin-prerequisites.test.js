import { describe, it, expect } from "vitest";

const { bloqueosDeFotos, fusionarStatus, SLOTS_REGISTRO } =
  await import("../lib/fin-prerequisites.js");

/** Estado con TODO presente, para ir quitando lo que cada caso quiere probar. */
function todoListo(rol = "MOTOR") {
  const s = {};
  for (const sl of SLOTS_REGISTRO) s[sl] = true;
  s.sold_cabina_antes = s.sold_cabina_post = true;
  s.sold_sensor_antes = s.sold_sensor_post = true;
  return { rol, status: s };
}

describe("bloqueosDeFotos — registro de parámetros", () => {
  it("con todo subido no bloquea", () => {
    expect(bloqueosDeFotos(todoListo("MOTOR"))).toEqual([]);
    expect(bloqueosDeFotos(todoListo("TANQUE"))).toEqual([]);
  });

  it("sin la foto del VIN no se cierra, en cualquiera de los dos roles", () => {
    for (const rol of ["MOTOR", "TANQUE"]) {
      const caso = todoListo(rol);
      caso.status.vin = false;
      expect(bloqueosDeFotos(caso).join(" ")).toContain("VIN");
    }
  });

  it("dice CUÁNTAS compresiones faltan, no solo que faltan", () => {
    const caso = todoListo("MOTOR");
    caso.status.comp_3 = false;
    const txt = bloqueosDeFotos(caso).join(" ");
    expect(txt).toContain("Faltan 1 de las 4");

    caso.status.comp_1 = false;
    caso.status.comp_2 = false;
    expect(bloqueosDeFotos(caso).join(" ")).toContain("Faltan 3 de las 4");
  });

  it("una compresión incompleta bloquea aunque la soldadura esté lista", () => {
    const caso = todoListo("TANQUE");
    caso.status.comp_4 = false;
    const b = bloqueosDeFotos(caso);
    expect(b).toHaveLength(1);
    expect(b[0]).toContain("COMPRESIÓN");
  });

  it("acumula el VIN y las compresiones como motivos distintos", () => {
    const caso = todoListo("MOTOR");
    caso.status.vin = false;
    caso.status.comp_2 = false;
    expect(bloqueosDeFotos(caso)).toHaveLength(2);
  });
});

describe("bloqueosDeFotos — soldadura por rol", () => {
  it("MOTOR responde por la cabina y no por el sensor", () => {
    const caso = todoListo("MOTOR");
    caso.status.sold_sensor_antes = false;
    expect(bloqueosDeFotos(caso)).toEqual([]);

    caso.status.sold_cabina_post = false;
    expect(bloqueosDeFotos(caso).join(" ")).toContain("CABINA");
  });

  it("TANQUE responde por el sensor y no por la cabina", () => {
    const caso = todoListo("TANQUE");
    caso.status.sold_cabina_antes = false;
    expect(bloqueosDeFotos(caso)).toEqual([]);

    caso.status.sold_sensor_post = false;
    expect(bloqueosDeFotos(caso).join(" ")).toContain("SENSOR DE NIVEL");
  });
});

describe("bloqueosDeFotos — roles que no cierran el carro", () => {
  it("CALIDAD no queda atrapada por requisitos que no son suyos", () => {
    // Calidad tiene su propio bloqueo (incidencias activas) en otro sitio.
    // Si aquí le exigiéramos las compresiones, no podría cerrar nunca.
    expect(bloqueosDeFotos({ rol: "CALIDAD", status: {} })).toEqual([]);
    expect(bloqueosDeFotos({ rol: "", status: {} })).toEqual([]);
  });

  it("el rol llega en cualquier caja y se entiende igual", () => {
    const caso = todoListo("MOTOR");
    caso.status.vin = false;
    expect(bloqueosDeFotos({ rol: " motor ", status: caso.status })).toHaveLength(1);
  });
});

describe("bloqueosDeFotos — entradas degeneradas", () => {
  it("sin argumentos no revienta ni deja pasar un cierre a ciegas", () => {
    expect(bloqueosDeFotos()).toEqual([]);
  });

  it("un estado vacío en MOTOR bloquea por todo lo que falta", () => {
    const b = bloqueosDeFotos({ rol: "MOTOR", status: {} });
    expect(b).toHaveLength(3);   // soldadura + VIN + compresiones
  });
});

describe("fusionarStatus", () => {
  it("una foto en el mes anterior cuenta igual que una de este mes", () => {
    // El carro que empieza el 31 y se cierra el 1 tiene las fotos repartidas
    // entre dos carpetas de R2; mirar solo el mes en curso lo bloqueaba sin
    // que el técnico hubiera hecho nada mal.
    const r = fusionarStatus({ vin: false, comp_1: true }, { vin: true, comp_1: false });
    expect(r.vin).toBe(true);
    expect(r.comp_1).toBe(true);
  });

  it("lo que falta en los dos meses sigue faltando", () => {
    expect(fusionarStatus({ vin: false }, { vin: false }).vin).toBe(false);
  });

  it("aguanta que uno de los dos meses no haya devuelto nada", () => {
    expect(fusionarStatus({ vin: true }, null, undefined)).toEqual({ vin: true });
    expect(fusionarStatus()).toEqual({});
  });
});
