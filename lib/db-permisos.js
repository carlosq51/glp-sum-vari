// =========================
// lib/db-permisos.js
// Qué tablas puede tocar el navegador a través de /api/db (routes/db.js).
//
// Hasta la fase 3 del orden de la base, el navegador hablaba DIRECTO con
// Supabase usando la anon key que viaja en el bundle, y las políticas RLS
// dejaban a esa key leer, escribir y borrar cualquier tabla. Cualquiera que
// abriera el JavaScript podía cambiarse el rol en `usuarios`.
//
// Ahora el navegador pasa por el servidor, y esta lista es la frontera:
// una tabla que no está aquí no se alcanza desde el navegador, ni siquiera
// anidada en un `select=...,tabla(...)`. Lo demás va por endpoints propios.
// =========================

// Cualquier usuario activo: lo que pintan las pantallas de técnico, calidad,
// supervisor y "mi inventario".
const LECTURA_TODOS = new Set([
  "usuarios", "usuario_modulos",
  "asignaciones", "work_orders", "vins", "conversion_zonas", "incidencias",
  "herramientas_catalogo", "inventario_tecnico", "inventario_tecnico_items",
]);

// Solo quien tiene el módulo ADMIN: el almacén y el CRUD del panel de Admin.
const LECTURA_ADMIN = new Set([
  "inventario_kits", "inventario_kit_items",
  "inventario_stock", "inventario_stock_unidades", "inventario_stock_lotes",
  "inventario_movimientos",
]);

const ESCRITURA_ADMIN = new Set([
  "usuarios", "usuario_modulos", "vins", "work_orders", "incidencias",
  "herramientas_catalogo", "inventario_kits", "inventario_kit_items",
  "inventario_tecnico", "inventario_tecnico_items",
  "inventario_stock", "inventario_stock_unidades", "inventario_stock_lotes",
  "inventario_movimientos",
]);

/**
 * ¿Este usuario tiene el módulo ADMIN? Misma regla que effectiveModulos()
 * del navegador (public/js/core/auth.js): si tiene módulos asignados mandan
 * ellos; si no, su rol.
 */
export function esAdmin_({ rol, modulos = [] }) {
  const mods = modulos.map((m) => String(m || "").toUpperCase());
  if (mods.length) return mods.includes("ADMIN");
  return String(rol || "").toUpperCase() === "ADMIN";
}

/**
 * Tablas que un `select` de PostgREST trae anidadas:
 * "id,work_orders(id,vins(tanque_asignado)),usuarios!fk(nombre)"
 *   → ["work_orders", "vins", "usuarios"]
 */
export function tablasAnidadas_(select) {
  const out = [];
  for (const m of String(select || "").matchAll(/([A-Za-z_][\w]*)(?:![\w]+)?\s*\(/g)) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Decide si se deja pasar un pedido a /api/db.
 *
 * @param {object} p
 * @param {string} p.tabla
 * @param {string} p.metodo     GET | POST | PATCH | DELETE
 * @param {URLSearchParams} p.params  la querystring tal cual
 * @param {{rol:string, modulos:string[], activo:boolean}|null} p.usuario
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function autorizarDb_({ tabla, metodo, params, usuario }) {
  if (!usuario) return { ok: false, status: 403, error: "Tu sesión no corresponde a ninguna cuenta." };
  if (!usuario.activo) return { ok: false, status: 403, error: "Tu cuenta está desactivada." };

  const admin = esAdmin_(usuario);
  const puedeLeer = (t) => LECTURA_TODOS.has(t) || (admin && LECTURA_ADMIN.has(t));

  if (metodo === "GET") {
    for (const t of [tabla, ...tablasAnidadas_(params.get("select"))]) {
      if (!puedeLeer(t)) return { ok: false, status: 403, error: `No tienes acceso a ${t}.` };
    }
    return { ok: true };
  }

  if (!["POST", "PATCH", "DELETE"].includes(metodo)) {
    return { ok: false, status: 405, error: `Método ${metodo} no permitido.` };
  }
  if (!admin || !ESCRITURA_ADMIN.has(tabla)) {
    return { ok: false, status: 403, error: `No puedes modificar ${tabla}.` };
  }
  // Un PATCH o DELETE sin filtro toca la tabla ENTERA. PostgREST lo permite;
  // aquí no. Todo lo que no es select/order/limit/offset/columns es filtro.
  if (metodo !== "POST") {
    const NO_FILTRO = new Set(["select", "order", "limit", "offset", "columns", "on_conflict"]);
    if (![...params.keys()].some((k) => !NO_FILTRO.has(k))) {
      return { ok: false, status: 400, error: `${metodo} sin filtro sobre ${tabla}: se negó para no tocar la tabla entera.` };
    }
  }
  // Lo que devuelve una escritura (return=representation) también se lee.
  for (const t of tablasAnidadas_(params.get("select"))) {
    if (!puedeLeer(t)) return { ok: false, status: 403, error: `No tienes acceso a ${t}.` };
  }
  return { ok: true };
}
