import { describe, it, expect } from "vitest";

const { autorizarDb_, esAdmin_, tablasAnidadas_ } = await import("../lib/db-permisos.js");

// /api/db es la única puerta del navegador a la base desde la fase 3. Estos
// tests fijan lo que NO se puede: si alguien abre una tabla nueva, que sea a
// propósito y no por un hueco.

const tecnico = { rol: "TECNICO", modulos: ["TECNICO"], activo: true };
const admin   = { rol: "SUPERVISOR", modulos: ["SUPERVISOR", "ADMIN"], activo: true };
const q = (s = "") => new URLSearchParams(s);

describe("esAdmin_", () => {
  it("mandan los módulos si tiene", () => {
    expect(esAdmin_({ rol: "ADMIN", modulos: ["TECNICO"] })).toBe(false);
    expect(esAdmin_({ rol: "TECNICO", modulos: ["ADMIN"] })).toBe(true);
  });
  it("sin módulos, manda el rol", () => {
    expect(esAdmin_({ rol: "ADMIN", modulos: [] })).toBe(true);
    expect(esAdmin_({ rol: "SUPERVISOR" })).toBe(false);
  });
});

describe("tablasAnidadas_", () => {
  it("encuentra los embeds a cualquier profundidad y con hint de FK", () => {
    expect(tablasAnidadas_("id,work_orders(id,vins(tanque_asignado)),usuarios!asg_user_fk(nombre)"))
      .toEqual(["work_orders", "vins", "usuarios"]);
  });
  it("un select plano no trae nada", () => {
    expect(tablasAnidadas_("id,nombre")).toEqual([]);
    expect(tablasAnidadas_(null)).toEqual([]);
  });
});

describe("autorizarDb_", () => {
  it("sin cuenta o desactivado no entra a nada", () => {
    expect(autorizarDb_({ tabla: "vins", metodo: "GET", params: q(), usuario: null }).ok).toBe(false);
    expect(autorizarDb_({
      tabla: "vins", metodo: "GET", params: q(), usuario: { ...tecnico, activo: false },
    }).ok).toBe(false);
  });

  it("el técnico lee lo de su pantalla, con sus embeds", () => {
    const params = q("user_id=eq.x&select=id,work_orders(id,vins(tanque_asignado))");
    expect(autorizarDb_({ tabla: "asignaciones", metodo: "GET", params, usuario: tecnico }).ok).toBe(true);
  });

  it("el técnico no lee el almacén ni tablas fuera de la lista", () => {
    for (const tabla of ["inventario_stock", "inventario_movimientos", "app_config", "push_subscriptions"]) {
      expect(autorizarDb_({ tabla, metodo: "GET", params: q(), usuario: tecnico }).ok).toBe(false);
    }
  });

  it("un embed no sirve para colarse a una tabla prohibida", () => {
    const params = q("select=id,app_config(key,value)");
    const r = autorizarDb_({ tabla: "usuarios", metodo: "GET", params, usuario: admin });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/app_config/);
  });

  it("el técnico no escribe nada, ni siquiera su propio usuario", () => {
    const r = autorizarDb_({ tabla: "usuarios", metodo: "PATCH", params: q("id=eq.x"), usuario: tecnico });
    expect(r.ok).toBe(false);
  });

  it("el admin escribe inventario y el CRUD del panel", () => {
    for (const tabla of ["inventario_tecnico_items", "herramientas_catalogo", "usuarios", "usuario_modulos"]) {
      expect(autorizarDb_({ tabla, metodo: "POST", params: q(), usuario: admin }).ok).toBe(true);
    }
  });

  it("ni el admin escribe fuera de la lista", () => {
    for (const tabla of ["app_config", "asignaciones", "eventos", "despacho_propuestas"]) {
      expect(autorizarDb_({ tabla, metodo: "POST", params: q(), usuario: admin }).ok).toBe(false);
    }
  });

  it("PATCH y DELETE sin filtro se niegan: tocarían la tabla entera", () => {
    for (const metodo of ["PATCH", "DELETE"]) {
      const r = autorizarDb_({ tabla: "inventario_tecnico_items", metodo, params: q("select=*"), usuario: admin });
      expect(r.ok).toBe(false);
      expect(r.status).toBe(400);
    }
    expect(autorizarDb_({
      tabla: "inventario_tecnico_items", metodo: "DELETE", params: q("id=eq.1"), usuario: admin,
    }).ok).toBe(true);
  });

  it("solo GET, POST, PATCH y DELETE", () => {
    expect(autorizarDb_({ tabla: "vins", metodo: "PUT", params: q("vin=eq.x"), usuario: admin }).status).toBe(405);
  });
});
