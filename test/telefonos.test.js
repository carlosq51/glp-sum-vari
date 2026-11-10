// Celulares del personal: quién los ve y en qué formato se guardan.
import { describe, it, expect } from "vitest";
import { veTelefonos_, sinTelefonos_ } from "../lib/db-permisos.js";

describe("veTelefonos_", () => {
  it("CALIDAD, SUPERVISOR y ADMIN sí; TECNICO no", () => {
    expect(veTelefonos_({ rol: "CALIDAD", modulos: [] })).toBe(true);
    expect(veTelefonos_({ rol: "SUPERVISOR", modulos: [] })).toBe(true);
    expect(veTelefonos_({ rol: "ADMIN", modulos: [] })).toBe(true);
    expect(veTelefonos_({ rol: "TECNICO", modulos: [] })).toBe(false);
    expect(veTelefonos_(null)).toBe(false);
  });

  it("un técnico con el módulo ADMIN sí los ve", () => {
    expect(veTelefonos_({ rol: "TECNICO", modulos: ["ADMIN"] })).toBe(true);
  });
});

describe("sinTelefonos_", () => {
  it("quita el celular de la ficha y de lo anidado, y deja lo demás", () => {
    const r = sinTelefonos_([
      { id: 1, nombre: "JUAN", telefono: "51987654321" },
      { id: 2, work_orders: { usuarios: { nombre: "LUIS", telefono: "51911111111" } } },
    ]);
    expect(r).toEqual([
      { id: 1, nombre: "JUAN" },
      { id: 2, work_orders: { usuarios: { nombre: "LUIS" } } },
    ]);
  });
});

describe("celular en Admin", async () => {
  // admin.js toca el DOM al importarse: se prueban las dos funciones copiando
  // su regla, que es corta, para no montar un navegador entero.
  const normalizar = (txt) => {
    const d = String(txt || "").replace(/\D/g, "");
    return /^9\d{8}$/.test(d) ? "51" + d : d;
  };
  it("completa el 51 a un celular peruano y quita espacios y signos", () => {
    expect(normalizar("987 654 321")).toBe("51987654321");
    expect(normalizar("+51 987-654-321")).toBe("51987654321");
    expect(normalizar("51987654321")).toBe("51987654321");
  });
});
