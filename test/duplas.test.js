import { describe, it, expect } from "vitest";

const { clasificarDuplas_, cumplioMeta_, renderDuplasPanel_ } =
  await import("../public/js/views/supervisor/sup-duplas.js");

const tech = (nombre, rol, carsHoy, virtualHoy = 0, estadoActivo = "SIN_INICIAR") =>
  ({ userId: nombre, nombre, rol, carsHoy, virtualHoy, estadoActivo });

// ─────────────────────────────────────────────
// cumplioMeta_
// ─────────────────────────────────────────────
describe("cumplioMeta_", () => {
  it("marca al técnico de conversión que llegó a la meta", () => {
    expect(cumplioMeta_(tech("pepe", "TANQUE", 2), 2)).toBe(true);
    expect(cumplioMeta_(tech("pepe", "TANQUE", 1.5), 2)).toBe(false);
  });

  it("ignora roles que no son de conversión", () => {
    expect(cumplioMeta_(tech("ana", "CALIDAD", 5), 2)).toBe(false);
    expect(cumplioMeta_(tech("luis", "RAMALERO", 5), 2)).toBe(false);
  });

  it("ignora desconectados", () => {
    expect(cumplioMeta_(tech("juan", "MOTOR", 3, 0, "DESCONECTADO"), 2)).toBe(false);
  });
});

// ─────────────────────────────────────────────
// clasificarDuplas_
// ─────────────────────────────────────────────
describe("clasificarDuplas_", () => {
  it("empareja dos tanqueros libres y proyecta el carro entero (2+2+1=5)", () => {
    const m = clasificarDuplas_([
      tech("pepe", "TANQUE", 2),
      tech("contreras", "TANQUE", 2),
    ], 2);

    const tanque = m.porRol.find(r => r.rol === "TANQUE");
    expect(tanque.duplas).toHaveLength(1);

    const d = tanque.duplas[0];
    expect(d.carrosBase).toBe(4);
    expect(d.proyectado).toBe(5);
    expect(d.finalA).toBe(2.5);
    expect(d.finalB).toBe(2.5);
    expect(tanque.sinPareja).toBeNull();
    expect(m.carrosProyectados).toBe(1);
  });

  it("no cruza roles: un motorista y un tanquero no forman dupla", () => {
    const m = clasificarDuplas_([
      tech("pepe", "TANQUE", 2),
      tech("juan", "MOTOR", 2),
    ], 2);

    expect(m.totalDuplas).toBe(0);
    expect(m.totalLibres).toBe(2);
    expect(m.porRol.find(r => r.rol === "TANQUE").sinPareja.nombre).toBe("pepe");
    expect(m.porRol.find(r => r.rol === "MOTOR").sinPareja.nombre).toBe("juan");
  });

  it("deja al impar esperando pareja", () => {
    const m = clasificarDuplas_([
      tech("a", "MOTOR", 2), tech("b", "MOTOR", 2), tech("c", "MOTOR", 3),
    ], 2);

    const motor = m.porRol.find(r => r.rol === "MOTOR");
    expect(motor.duplas).toHaveLength(1);
    // orden por carros desc: c(3) + a(2) → sobra b
    expect(motor.duplas[0].carrosA).toBe(3);
    expect(motor.sinPareja.nombre).toBe("b");
  });

  it("separa a quien llegó a la meta pero sigue con trabajo abierto", () => {
    const m = clasificarDuplas_([
      tech("pepe", "TANQUE", 2, 1, "TRABAJANDO"),
      tech("contreras", "TANQUE", 2),
    ], 2);

    const tanque = m.porRol.find(r => r.rol === "TANQUE");
    expect(tanque.enExtra.map(t => t.nombre)).toEqual(["pepe"]);
    expect(tanque.libres.map(t => t.nombre)).toEqual(["contreras"]);
    expect(tanque.duplas).toHaveLength(0);
    expect(m.totalMeta).toBe(2);   // ambos cerraron meta
    expect(m.totalLibres).toBe(1); // solo uno emparejable
  });

  it("lista a quienes están a 1 carro de la meta", () => {
    const m = clasificarDuplas_([tech("luis", "MOTOR", 1)], 2);
    const motor = m.porRol.find(r => r.rol === "MOTOR");
    expect(motor.cerca.map(t => t.nombre)).toEqual(["luis"]);
    expect(motor.libres).toHaveLength(0);
  });

  it("tolera entrada vacía o inválida", () => {
    expect(clasificarDuplas_(null, 2).totalDuplas).toBe(0);
    expect(clasificarDuplas_([], 2).porRol).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────
// renderDuplasPanel_
// ─────────────────────────────────────────────
describe("renderDuplasPanel_", () => {
  it("no pinta nada si nadie llegó ni está cerca de la meta", () => {
    const m = clasificarDuplas_([tech("x", "MOTOR", 0)], 2);
    expect(renderDuplasPanel_(m)).toBe("");
  });

  it("pinta la dupla con el total proyectado", () => {
    const m = clasificarDuplas_([
      tech("pepe", "TANQUE", 2),
      tech("contreras", "TANQUE", 2),
    ], 2);
    const html = renderDuplasPanel_(m);
    expect(html).toContain("pepe");
    expect(html).toContain("contreras");
    expect(html).toContain("(2.5 / 2.5 c/u)");
    expect(html).toContain("1 dupla");
  });

  it("escapa el nombre del técnico", () => {
    const m = clasificarDuplas_([
      tech("<img>", "TANQUE", 2),
      tech("contreras", "TANQUE", 2),
    ], 2);
    expect(renderDuplasPanel_(m)).not.toContain("<img>");
  });
});
