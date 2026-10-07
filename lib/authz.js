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

// ── Padrón de usuarios ───────────────────────────────────────────────
// La tabla entera (unas decenas de filas) en UNA lectura cacheada 10 min.
// Antes cada pantalla pedía a Supabase sus nombres, emails o técnicos
// activos por separado: ~800 consultas a usuarios por día, y cada una es una
// línea de la cuota de logs. Ahora es una lectura cada 10 min.
//
// Los cambios hechos desde Admin no esperan: /api/db llama a
// invalidarUsuarios_() al escribir en usuarios o usuario_modulos. Lo que
// escribe Apps Script (el padrón) entra a más tardar en 10 min, salvo un
// email que no esté: ese fuerza una relectura (ver getUsuarioByEmail_).
const PADRON_TTL_MS = 10 * 60_000;
const RELECTURA_MIN_MS = 30_000;
const COLS_PADRON = "id,nombre,email,rol,especialidad,activo";

let _padron = null;    // { rows, porId, porEmail, ts }
let _leyendo = null;   // promesa en vuelo: las peticiones simultáneas se enganchan

/** Vacía el padrón. La llama /api/db tras escribir en usuarios. */
export function invalidarUsuarios_() {
  _padron = null;
}

async function leerPadron_() {
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/usuarios?select=${COLS_PADRON}&order=nombre.asc`,
    { headers: supabaseServiceHeaders_() },
  );
  if (!r.ok) throw new Error(`usuarios: ${r.status}`);
  const rows = (await r.json()).map(u => ({
    id:           u.id || null,
    nombre:       String(u.nombre || "").trim(),
    email:        u.email || null,
    rol:          String(u.rol || "").toUpperCase(),
    especialidad: u.especialidad ?? null,
    activo:       !!u.activo,
  }));
  return {
    rows,
    porId:    new Map(rows.map(u => [u.id, u])),
    porEmail: new Map(rows.filter(u => u.email).map(u => [String(u.email).trim().toLowerCase(), u])),
    ts:       Date.now(),
  };
}

/**
 * Todos los usuarios (activos e inactivos), ordenados por nombre.
 * `maxEdadMs` acorta la vigencia para quien necesita algo más fresco.
 * Si Supabase falla y hay un padrón viejo, se sirve el viejo.
 */
export async function padron_({ maxEdadMs = PADRON_TTL_MS } = {}) {
  if (_padron && Date.now() - _padron.ts < maxEdadMs) return _padron;
  if (!_leyendo) {
    _leyendo = leerPadron_()
      .then(p => (_padron = p))
      .finally(() => { _leyendo = null; });
  }
  try {
    return await _leyendo;
  } catch (e) {
    if (_padron) return _padron;
    throw e;
  }
}

/** Los usuarios de esos ids (los que existan), en el orden del padrón. */
export async function usuariosPorIds_(ids) {
  const set = new Set((ids || []).filter(Boolean));
  if (!set.size) return [];
  const { rows } = await padron_();
  return rows.filter(u => set.has(u.id));
}

/** user_id → campo (nombre por defecto) para esos ids. */
export async function mapaUsuarios_(ids, campo = "nombre") {
  return new Map((await usuariosPorIds_(ids)).map(u => [u.id, u[campo]]));
}

/** Usuarios activos, opcionalmente de un rol y una especialidad. */
export async function usuariosActivos_({ rol, especialidad } = {}) {
  const { rows } = await padron_();
  return rows.filter(u => u.activo
    && (!rol || u.rol === rol)
    && (!especialidad || u.especialidad === especialidad));
}

/**
 * Ficha del usuario por email. null si no existe.
 *
 * Es LA búsqueda por email del servidor: las rutas que solo necesitan el id,
 * el nombre o la especialidad de quien pide pasan por aquí en vez de
 * consultar usuarios cada vez.
 *
 * Devuelve también `id` y `nombre` porque hay endpoints que no solo
 * autorizan: tienen que dejar constancia de QUIÉN hizo la acción con un
 * nombre de persona, no con el texto que mandó el cliente. El historial de
 * zonas es el primero — ver identidadZona_() en routes/zonas.js.
 */
export async function getUsuarioByEmail_(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  try {
    let p = await padron_();
    // Un usuario recién creado por Apps Script no espera los 10 min: un email
    // que no está fuerza releer, a lo más una vez cada 30 s.
    if (!p.porEmail.has(e)) p = await padron_({ maxEdadMs: RELECTURA_MIN_MS });
    return p.porEmail.get(e) || null;
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
