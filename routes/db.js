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
import { getUsuarioByEmail_ } from "../lib/authz.js";
import { autorizarDb_ } from "../lib/db-permisos.js";

const router = express.Router();

// Módulos por usuario, 60 s: mismo TTL que la ficha de lib/authz.js. Cada
// pantalla de técnico pasa por aquí en cada ciclo del poll.
const _modulos = new Map(); // user_id → { modulos, ts }
async function modulosDe_(userId) {
  const hit = _modulos.get(userId);
  if (hit && Date.now() - hit.ts < 60_000) return hit.modulos;
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/usuario_modulos?user_id=eq.${encodeURIComponent(userId)}&select=modulo`,
    { headers: supabaseServiceHeaders_() },
  );
  if (!r.ok) throw new Error(`usuario_modulos: ${r.status}`);
  const modulos = (await r.json()).map((m) => m.modulo);
  _modulos.set(userId, { modulos, ts: Date.now() });
  return modulos;
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
    res.status(r.status).type(r.headers.get("content-type") || "application/json").send(await r.text());
  } catch (e) {
    console.error(`[db] ${metodo} ${tabla}:`, e.message);
    res.status(502).json({ ok: false, error: "No se pudo consultar la base. Intenta de nuevo." });
  }
});

export default router;
