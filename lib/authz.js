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

const _cache = new Map(); // email → { id, nombre, rol, activo, ts }
const CACHE_TTL_MS = 60_000;

/**
 * Ficha del usuario por email (cache 60s). null si no existe.
 *
 * Devuelve también `id` y `nombre` porque hay endpoints que no solo
 * autorizan: tienen que dejar constancia de QUIÉN hizo la acción con un
 * nombre de persona, no con el texto que mandó el cliente. El historial de
 * zonas es el primero — ver identidadZona_() en routes/zonas.js.
 */
export async function getUsuarioByEmail_(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;

  const hit = _cache.get(e);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit;

  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(e)}&select=id,nombre,rol,activo&limit=1`,
      { headers: supabaseServiceHeaders_() },
    );
    const rows = r.ok ? await r.json() : [];
    if (!rows[0]) return null;
    const rec = {
      id:     rows[0].id || null,
      nombre: String(rows[0].nombre || "").trim(),
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
 * Alias histórico: casi todas las llamadas solo quieren el rol. Es la MISMA
 * ficha (y la misma cache) que getUsuarioByEmail_.
 */
export const getRolByEmail_ = getUsuarioByEmail_;

/**
 * Middleware: exige que el email del request (body.email, query.email o
 * header x-user-email) sea un usuario ACTIVO con uno de los roles dados.
 * Uso: router.post("/api/admin/config", requireRol_("ADMIN"), handler)
 */
export function requireRol_(...roles) {
  return async (req, res, next) => {
    const email = req.body?.email || req.query?.email || req.get("x-user-email") || "";
    const u = await getRolByEmail_(email);

    // El motivo del rechazo se dice explícito. Un "No autorizado" genérico
    // hacía indistinguibles tres causas muy distintas —la sesión no mandó
    // email, la cuenta está desactivada, o el rol no alcanza— y la única
    // pista que le llegaba a quien estaba en piso era "no tienes permisos".
    if (!email) {
      return res.status(403).json({
        ok: false, error: "Tu sesión no envió tu identidad. Cierra sesión y vuelve a entrar.",
        motivo: "SIN_EMAIL",
      });
    }
    if (!u) {
      return res.status(403).json({
        ok: false, error: `La cuenta ${email} no existe en el sistema.`,
        motivo: "SIN_CUENTA",
      });
    }
    if (!u.activo) {
      return res.status(403).json({
        ok: false, error: `La cuenta ${email} está desactivada.`,
        motivo: "INACTIVO",
      });
    }
    if (!roles.includes(u.rol)) {
      return res.status(403).json({
        ok: false,
        error: `Esta acción es para ${roles.join(" o ")}, y tu rol es ${u.rol}.`,
        motivo: "ROL_INSUFICIENTE",
        rol: u.rol,
      });
    }
    next();
  };
}
