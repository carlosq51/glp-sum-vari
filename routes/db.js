// =========================
// routes/db.js
// /api/db/:tabla — la única puerta del navegador a Supabase.
//
// Recibe el mismo pedido que antes iba directo a PostgREST (misma
// querystring, mismo cuerpo), decide con lib/db-permisos.js si quien lo
// pide puede hacerlo, y lo reenvía con la service key. Así el navegador ya
// no necesita ninguna key de Supabase, y la base puede cerrarle la puerta a
// la anon key (supabase/migrations/001_cerrar-acceso-anon.sql).
//
// La identidad es el email de x-user-email, igual que en el resto de
// endpoints (lib/authz.js). No prueba que quien manda el email sea su
// dueño; eso es un problema aparte (login sin contraseña), pero ya no hay
// un camino a la base que se salte esta revisión.
// =========================
import express from "express";
import { supabaseServiceHeaders_ } from "../lib/supabase.js";
import { getUsuarioByEmail_, invalidarUsuarios_ } from "../lib/authz.js";
import { autorizarDb_ } from "../lib/db-permisos.js";

const router = express.Router();

// Módulos de TODOS los usuarios en una lectura, 10 min: mismo TTL que el
// padrón de lib/authz.js. Cada pantalla de técnico pasa por aquí en cada ciclo
// del poll, y por usuario eran ~280 consultas al día. Una escritura en
// usuarios o usuario_modulos por esta misma ruta vacía las dos caches.
let _modulos = null; // { porUser: Map(user_id → [modulo]), ts }
async function modulosDe_(userId) {
  if (!_modulos || Date.now() - _modulos.ts >= 10 * 60_000) {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/usuario_modulos?select=user_id,modulo`,
      { headers: supabaseServiceHeaders_() },
    );
    if (!r.ok) throw new Error(`usuario_modulos: ${r.status}`);
    const porUser = new Map();
    for (const { user_id, modulo } of await r.json()) {
      if (!porUser.has(user_id)) porUser.set(user_id, []);
      porUser.get(user_id).push(modulo);
    }
    _modulos = { porUser, ts: Date.now() };
  }
  return _modulos.porUser.get(userId) || [];
}

router.all("/api/db/:tabla", async (req, res) => {
  const tabla = String(req.params.tabla || "");
  const metodo = req.method.toUpperCase();
  const qs = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?") + 1) : "";
  const params = new URLSearchParams(qs);

  try {
    const email = req.get("x-user-email") || "";
    const ficha = await getUsuarioByEmail_(email);
    const usuario = ficha && { ...ficha, modulos: await modulosDe_(ficha.id) };

    const permiso = autorizarDb_({ tabla, metodo, params, usuario });
    if (!permiso.ok) {
      if (metodo !== "GET") console.warn(`[db] NEGADO ${metodo} ${tabla} (${email || "sin email"}): ${permiso.error}`);
      return res.status(permiso.status).json({ ok: false, error: permiso.error });
    }

    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${tabla}${qs ? "?" + qs : ""}`, {
      method: metodo,
      headers: { ...supabaseServiceHeaders_(), Prefer: "return=representation" },
      body: metodo === "GET" || metodo === "DELETE" ? undefined : JSON.stringify(req.body ?? {}),
    });

    if (metodo !== "GET") console.log(`[db] ${metodo} ${tabla} por ${email} → ${r.status}`);
    if (metodo !== "GET" && (tabla === "usuarios" || tabla === "usuario_modulos")) {
      invalidarUsuarios_();
      _modulos = null;
    }
    res.status(r.status).type(r.headers.get("content-type") || "application/json").send(await r.text());
  } catch (e) {
    console.error(`[db] ${metodo} ${tabla}:`, e.message);
    res.status(502).json({ ok: false, error: "No se pudo consultar la base. Intenta de nuevo." });
  }
});

export default router;
