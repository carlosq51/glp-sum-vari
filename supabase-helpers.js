/**
 * ═══════════════════════════════════════════════════════════════
 * SUPABASE QUERY HELPERS — Funciones optimizadas para index.js
 * ═══════════════════════════════════════════════════════════════
 * 
 * Copia estas funciones a tu index.js
 * Úsalas en reemplazo de los endpoints que hacían dual-read
 */

import { supabase } from "./supabase-node.js";

// ═══════════════════════════════════════════════════════════════
// 1️⃣ MIS ACTIVAS (TECNICO)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/mis-activas
 * 
 * Retorna asignaciones ACTIVAS del usuario (EN PROCESO / PAUSADA, NO finalizadas)
 * ⏱️ Latencia: ~30-50ms
 * 🎯 Índices: idx_asg_user + idx_asg_updated
 * 
 * Query SELECT:
 *   id, work_order_id, estado_actual, tiempo_trab_ms, running_since
 *   + work_orders(vin, tipo_ot, estado_general)
 * 
 * Filtros (todos con índices):
 *   user_id = X (idx_asg_user)
 *   activo = true (cheap)
 *   estado_actual != FINALIZADO (neq filter)
 *   rol_trabajo = TECNICO/MOTOR/TANQUE (ENUM fast)
 * 
 * Order: updated_at DESC (idx_asg_updated reverse)
 */
export async function queryMisActivas(userId, rolTrabajo = "TECNICO") {
  const { data, error } = await supabase
    .from("asignaciones")
    .select(`
      id,
      work_order_id,
      estado_actual,
      tiempo_trab_ms,
      running_since,
      last_nota,
      last_nota_ts,
      work_orders!inner(
        id,
        vin,
        tipo_ot,
        estado_general,
        observaciones
      )
    `)
    .eq("user_id", userId)
    .eq("rol_trabajo", rolTrabajo)
    .eq("activo", true)
    .neq("estado_actual", "FINALIZADO")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`queryMisActivas: ${error.message}`);
  return data;
}

/**
 * Endpoint de Express
 */
export function setupMisActivasEndpoint(app) {
  app.get("/api/mis-activas", async (req, res) => {
    try {
      const email = String(req.query.email || "").trim().toLowerCase();
      const rolTrabajo = String(req.query.rolTrabajo || "TECNICO").toUpperCase();

      if (!email) {
        return res.status(400).json({ ok: false, error: "Falta email" });
      }

      // 1. Obtén user_id
      const { data: usuarios, error: userError } = await supabase
        .from("usuarios")
        .select("id")
        .eq("email", email)
        .limit(1);

      if (userError || !usuarios?.length) {
        return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
      }

      const userId = usuarios[0].id;

      // 2. Obtén mis activas
      const t1 = Date.now();
      const items = await queryMisActivas(userId, rolTrabajo);
      const duration = Date.now() - t1;

      return res.json({
        ok: true,
        items,
        count: items.length,
        _timing: `${duration}ms`,
        _source: "supabase",
      });

    } catch (e) {
      console.error("[GET /api/mis-activas]", e.message);
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 2️⃣ INCIDENCIAS POR VIN + FILTRO TIPO
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/incidencias/list
 * 
 * ⏱️ Latencia: ~20-30ms
 * 🎯 Índices: idx_inc_vin, idx_inc_tipo
 * 
 * Query:
 *   id, fecha_hora, tipo, tecnico, nota, foto_file_id, registrado_por
 * 
 * Filtros:
 *   vin = X (idx_inc_vin)
 *   tipo = CRITICA/MODERADA/LEVE (idx_inc_tipo + ENUM fast)
 *   work_order_id = X (idx_inc_wo, si viene)
 */
export async function queryIncidenciasPorVin(vin, tipo = null, limit = 100) {
  let query = supabase
    .from("incidencias")
    .select(`
      id,
      fecha_hora,
      tipo,
      tecnico,
      nota,
      foto_file_id,
      registrado_por,
      mes
    `)
    .eq("vin", vin.toUpperCase());

  if (tipo) {
    query = query.eq("tipo", tipo);  // ENUM filtering
  }

  const { data, error } = await query
    .order("fecha_hora", { ascending: false })
    .limit(Math.min(limit, 1000));

  if (error) throw new Error(`queryIncidenciasPorVin: ${error.message}`);
  return data;
}

export function setupIncidenciasListEndpoint(app) {
  app.get("/api/incidencias/list", async (req, res) => {
    try {
      const vin = String(req.query.vin || "").trim().toUpperCase();
      const tipo = String(req.query.tipo || "").trim().toUpperCase() || null;
      const limit = Math.min(parseInt(req.query.limit || "50"), 1000);

      if (!vin) {
        return res.status(400).json({ ok: false, error: "Falta vin" });
      }

      const t1 = Date.now();
      const items = await queryIncidenciasPorVin(vin, tipo, limit);
      const duration = Date.now() - t1;

      return res.json({
        ok: true,
        items,
        count: items.length,
        _timing: `${duration}ms`,
        _source: "supabase",
      });

    } catch (e) {
      console.error("[GET /api/incidencias/list]", e.message);
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 3️⃣ WORK ORDERS POR ESTADO (SUPERVISOR)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/work-orders
 * 
 * ⏱️ Latencia: ~30-40ms
 * 🎯 Índices: idx_wo_estado, idx_wo_tipo
 * 
 * ENUM filtering = SUPER RÁPIDO
 */
export async function queryWorkOrdersByEstado(
  estadoGeneral = "EN PROCESO",
  tipoOt = "CONVERSION",
  limit = 100
) {
  const { data, error } = await supabase
    .from("work_orders")
    .select(`
      id,
      vin,
      tipo_ot,
      estado_general,
      observaciones,
      created_at,
      asignaciones!inner(
        id,
        user_id,
        rol_trabajo,
        estado_actual,
        tiempo_trab_ms,
        usuarios!inner(
          id,
          nombre,
          email
        )
      )
    `)
    .eq("tipo_ot", tipoOt)
    .eq("estado_general", estadoGeneral)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 500));

  if (error) throw new Error(`queryWorkOrdersByEstado: ${error.message}`);
  return data;
}

export function setupWorkOrdersEndpoint(app) {
  app.get("/api/work-orders", async (req, res) => {
    try {
      const estado = String(req.query.estado || "EN PROCESO").trim();
      const tipo = String(req.query.tipo || "CONVERSION").toUpperCase();
      const limit = Math.min(parseInt(req.query.limit || "50"), 500);

      const t1 = Date.now();
      const items = await queryWorkOrdersByEstado(estado, tipo, limit);
      const duration = Date.now() - t1;

      return res.json({
        ok: true,
        items,
        count: items.length,
        _timing: `${duration}ms`,
        _source: "supabase",
      });

    } catch (e) {
      console.error("[GET /api/work-orders]", e.message);
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 4️⃣ ASIGNACIONES ACTIVAS POR ROL
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/asignaciones-activas
 * 
 * ⏱️ Latencia: ~20-30ms
 * 🎯 Índices: ENUM rol_trabajo, idx_asg_user implícito vía joins
 */
export async function queryAsignacionesActivasPorRol(rolTrabajo = "MOTOR") {
  const { data, error } = await supabase
    .from("asignaciones")
    .select(`
      id,
      work_order_id,
      user_id,
      rol_trabajo,
      estado_actual,
      running_since,
      tiempo_trab_ms,
      usuarios!inner(
        id,
        nombre,
        email
      ),
      work_orders!inner(
        id,
        vin,
        tipo_ot,
        estado_general
      )
    `)
    .eq("rol_trabajo", rolTrabajo)
    .eq("activo", true)
    .neq("estado_actual", "FINALIZADO")
    .order("running_since", { ascending: false })
    .limit(100);

  if (error) throw new Error(`queryAsignacionesActivasPorRol: ${error.message}`);
  return data;
}

export function setupAsignacionesActivasEndpoint(app) {
  app.get("/api/asignaciones-activas", async (req, res) => {
    try {
      const rol = String(req.query.rol || "MOTOR").toUpperCase();

      const t1 = Date.now();
      const items = await queryAsignacionesActivasPorRol(rol);
      const duration = Date.now() - t1;

      return res.json({
        ok: true,
        items,
        count: items.length,
        _timing: `${duration}ms`,
        _source: "supabase",
      });

    } catch (e) {
      console.error("[GET /api/asignaciones-activas]", e.message);
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 5️⃣ EVENTOS RECIENTES (TIMELINE / AUDITORÍA)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/eventos
 * 
 * ⏱️ Latencia: ~15-25ms
 * 🎯 Índice: idx_evt_ts DESC (optimizado para timelines)
 */
export async function queryEventosRecientes(horasAtras = 24, limit = 50) {
  const sinceDateTime = new Date();
  sinceDateTime.setHours(sinceDateTime.getHours() - horasAtras);

  const { data, error } = await supabase
    .from("eventos")
    .select(`
      id,
      timestamp,
      accion,
      nota,
      tipo_ot,
      rol_trabajo,
      usuarios!inner(
        id,
        nombre,
        email
      ),
      work_orders!inner(
        id,
        vin,
        tipo_ot,
        estado_general
      )
    `)
    .gte("timestamp", sinceDateTime.toISOString())
    .order("timestamp", { ascending: false })
    .limit(Math.min(limit, 500));

  if (error) throw new Error(`queryEventosRecientes: ${error.message}`);
  return data;
}

export function setupEventosEndpoint(app) {
  app.get("/api/eventos", async (req, res) => {
    try {
      const horasAtras = Math.min(parseInt(req.query.horas || "24"), 365*24);
      const limit = Math.min(parseInt(req.query.limit || "50"), 500);

      const t1 = Date.now();
      const items = await queryEventosRecientes(horasAtras, limit);
      const duration = Date.now() - t1;

      return res.json({
        ok: true,
        items,
        count: items.length,
        _timing: `${duration}ms`,
        _source: "supabase",
      });

    } catch (e) {
      console.error("[GET /api/eventos]", e.message);
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 6️⃣ USUARIOS ACTIVOS + MÓDULOS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/usuarios-activos
 * 
 * ⏱️ Latencia: ~25-35ms
 * 🎯 Índice: idx_usuarios_activo (WHERE activo = true)
 */
export async function queryUsuariosActivos() {
  const { data, error } = await supabase
    .from("usuarios")
    .select(`
      id,
      email,
      nombre,
      rol,
      especialidad,
      usuario_modulos(modulo)
    `)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) throw new Error(`queryUsuariosActivos: ${error.message}`);

  // Transforma lookup en array de módulos
  return data.map(u => ({
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    especialidad: u.especialidad,
    modulos: u.usuario_modulos.map(m => m.modulo),
  }));
}

export function setupUsuariosEndpoint(app) {
  app.get("/api/usuarios-activos", async (req, res) => {
    try {
      const t1 = Date.now();
      const items = await queryUsuariosActivos();
      const duration = Date.now() - t1;

      return res.json({
        ok: true,
        items,
        count: items.length,
        _timing: `${duration}ms`,
        _source: "supabase",
      });

    } catch (e) {
      console.error("[GET /api/usuarios-activos]", e.message);
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 7️⃣ SEARCHS AVANZADOS (LIKE)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/search/incidencias
 * 
 * Busca incidencias por nota (LIKE)
 * Ej: /api/search/incidencias?q=calibración
 */
export async function queryBuscaIncidencias(palabraClave) {
  if (!palabraClave || palabraClave.length < 2) {
    return [];
  }

  const { data, error } = await supabase
    .from("incidencias")
    .select(`
      id,
      fecha_hora,
      vin,
      tipo,
      nota,
      tecnico
    `)
    .ilike("nota", `%${palabraClave}%`)  // LIKE insensitive
    .order("fecha_hora", { ascending: false })
    .limit(50);

  if (error) throw new Error(`queryBuscaIncidencias: ${error.message}`);
  return data;
}

export function setupSearchEndpoint(app) {
  app.get("/api/search/incidencias", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();

      if (q.length < 2) {
        return res.json({ ok: true, items: [], message: "Mínimo 2 caracteres" });
      }

      const items = await queryBuscaIncidencias(q);
      return res.json({ ok: true, items, count: items.length });

    } catch (e) {
      console.error("[GET /api/search/incidencias]", e.message);
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 🎯 SETUP TODOS LOS ENDPOINTS
// ═══════════════════════════════════════════════════════════════

/**
 * Llama esta función en tu index.js para registrar todos los endpoints
 */
export function setupSupabaseEndpoints(app) {
  setupMisActivasEndpoint(app);
  setupIncidenciasListEndpoint(app);
  setupWorkOrdersEndpoint(app);
  setupAsignacionesActivasEndpoint(app);
  setupEventosEndpoint(app);
  setupUsuariosEndpoint(app);
  setupSearchEndpoint(app);
  
  console.log("✅ Endpoints Supabase optimizados registrados");
}

/*
 * ═══════════════════════════════════════════════════════════════
 * CÓMO USAR EN index.js
 * ═══════════════════════════════════════════════════════════════
 * 
 * 1. Importa este archivo:
 *    import { setupSupabaseEndpoints } from "./supabase-helpers.js";
 * 
 * 2. En tu bootstrap (después de crear app):
 *    setupSupabaseEndpoints(app);
 * 
 * 3. Listo! Tendrás 7 endpoints nuevos:
 *    GET /api/mis-activas?email=X&rolTrabajo=TECNICO
 *    GET /api/incidencias/list?vin=X&tipo=CRITICA
 *    GET /api/work-orders?estado=EN PROCESO&tipo=CONVERSION
 *    GET /api/asignaciones-activas?rol=MOTOR
 *    GET /api/eventos?horas=24&limit=50
 *    GET /api/usuarios-activos
 *    GET /api/search/incidencias?q=calibración
 * 
 * Todos retornan:
 *   { ok: true, items: [...], count: N, _timing: "Xms" }
 * ═══════════════════════════════════════════════════════════════
 */
