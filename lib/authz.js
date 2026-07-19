// =========================
// lib/authz.js
// Verificación de rol server-side para endpoints sensibles.
//
// ⚠️ ALCANCE HONESTO: esto NO es autenticación real — el email viene del
// cliente y no hay contraseña/token que pruebe identidad. Es la primera
// barrera (paso 1 del plan de seguridad): un desconocido ya no puede llamar
// endpoints admin sin además conocer el email de un admin activo. La
// autenticación real (Supabase Auth / OTP) es el paso 3 del plan.
// =========================

import { supabaseServiceHeaders_ } from "./supabase.js";

const _cache = new Map(); // email → { rol, activo, ts }
const CACHE_TTL_MS = 60_000;

/** Rol y estado de un usuario por email (cache 60s). null si no existe. */
export async function getRolByEmail_(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;

  const hit = _cache.get(e);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit;

  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(e)}&select=rol,activo&limit=1`,
      { headers: supabaseServiceHeaders_() },
    );
    const rows = r.ok ? await r.json() : [];
    if (!rows[0]) return null;
    const rec = {
      rol:    String(rows[0].rol || "").toUpperCase(),
      activo: !!rows[0].activo,
      ts:     Date.now(),
    };
    _cache.set(e, rec);
    return rec;
  } catch {
    return null; // Supabase caído → denegar (fail-closed)
  }
}

/**
 * Middleware: exige que el email del request (body.email, query.email o
 * header x-user-email) sea un usuario ACTIVO con uno de los roles dados.
 * Uso: router.post("/api/admin/config", requireRol_("ADMIN"), handler)
 */
export function requireRol_(...roles) {
  return async (req, res, next) => {
    // Header primero: es el canal explícito de identidad (adminFetch_);
    // body/query pueden llevar "email" como dato del recurso, no como identidad.
    const email = req.get("x-user-email") || req.body?.email || req.query?.email || "";
    const u = await getRolByEmail_(email);
    if (!u || !u.activo || !roles.includes(u.rol)) {
      return res.status(403).json({ ok: false, error: "No autorizado" });
    }
    next();
  };
}
