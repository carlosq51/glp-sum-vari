import express from "express";
import dotenv from "dotenv";
import { existsSync } from "fs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

// Serve Vite build output if available, otherwise fallback to source
const staticDir = existsSync("dist") ? "dist" : "public";
app.use(express.static(staticDir));

// Helper para medir tiempos
function measureTime_(fn, label) {
  const start = Date.now();
  return async () => {
    try {
      const result = await fn();
      const duration = Date.now() - start;
      return { result, duration, label };
    } catch (err) {
      const duration = Date.now() - start;
      throw { err, duration, label };
    }
  };
}

// Helper para agregar Server Timing headers
function addServerTiming_(res, measurements = []) {
  const timings = measurements
    .filter(m => m && m.duration)
    .map(m => `${m.label};dur=${m.duration}`)
    .join(", ");
  
  if (timings) {
    res.set("Server-Timing", timings);
  }
}

// función para llamar Apps Script
async function callAppsScript(action, payload = {}) {
  const APS_URL = process.env.APS_URL;
  const APS_KEY = process.env.APS_KEY;

  if (!APS_URL) throw new Error("Falta APS_URL en .env");
  if (!APS_KEY) throw new Error("Falta APS_KEY en .env");

  const reqBody = { action, key: APS_KEY, ...payload };

  const r = await fetch(APS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(reqBody),
  });

  const text = await r.text();

  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("Respuesta no-JSON desde Apps Script: " + text.slice(0, 500));
  }

  if (!j.ok) {
    throw new Error(`[APS:${action}] ${j.error || "Error Apps Script"}`);
  }

  return j;
}

// =========================
// SUPABASE FUNCTIONS (Lectura desde BD)
// =========================

// Cache en memoria para reducir queries a Supabase
const CACHE = {
  work_orders: { data: [], ts: 0 },
  usuarios: { data: [], ts: 0 },
  asignaciones: { data: [], ts: 0 },
  TTL_MS: 2 * 60 * 1000, // 2 minutos
};

function getCachedData_(table) {
  const cache = CACHE[table];
  if (!cache) return null;
  const age = Date.now() - cache.ts;
  if (age < CACHE.TTL_MS && cache.data.length > 0) {
    console.log(`[CACHE HIT] ${table} (${age}ms old)`);
    return cache.data;
  }
  return null;
}

function setCachedData_(table, data) {
  if (CACHE[table]) {
    CACHE[table].data = data;
    CACHE[table].ts = Date.now();
    console.log(`[CACHE SET] ${table} (${data.length} items)`);
  }
}

function supabaseHeaders_() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  // Prioridad: SUPABASE_ANON_KEY > VITE_SUPABASE_ANON_KEY
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  
  return {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

function buildSupabaseQuery_(filter = {}) {
  const parts = [];
  Object.entries(filter || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    parts.push(`${encodeURIComponent(key)}=eq.${encodeURIComponent(String(value))}`);
  });
  return parts.length ? ("?" + parts.join("&")) : "";
}

async function supabaseGet_(table, filter = {}, opts = {}) {
  // Si el filtro está vacío y permitimos cache, intentar desde cache
  if (Object.keys(filter).length === 0 && opts.useCache !== false) {
    const cached = getCachedData_(table);
    if (cached) return cached;
  }

  const headers = supabaseHeaders_();
  if (!headers) throw new Error("Supabase no configurado (.env)");

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const url = `${SUPABASE_URL}/rest/v1/${table}${buildSupabaseQuery_(filter)}`;
  
  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase GET ${table}: ${res.status} ${text.slice(0, 200)}`);
  }

  const result = await res.json();
  
  // Cachear si no hay filtros
  if (Object.keys(filter).length === 0) {
    setCachedData_(table, result);
  }

  return result;
}

async function supabasePost_(table, data) {
  const headers = supabaseHeaders_();
  if (!headers) throw new Error("Supabase no configurado (.env)");

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Prefer": "return=representation" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase POST ${table}: ${res.status} ${text.slice(0, 200)}`);
  }

  const result = await res.json();
  return Array.isArray(result) ? result[0] : result;
}

async function supabasePatch_(table, filter = {}, data) {
  const headers = supabaseHeaders_();
  if (!headers) throw new Error("Supabase no configurado (.env)");

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const url = `${SUPABASE_URL}/rest/v1/${table}${buildSupabaseQuery_(filter)}`;
  
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...headers, "Prefer": "return=representation" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase PATCH ${table}: ${res.status} ${text.slice(0, 200)}`);
  }

  const result = await res.json();
  return Array.isArray(result) ? result[0] : result;
}

// =========================
// UPLOADER PROXY (frontend -> Node -> Apps Script)
// =========================
const UPLOADER_ACTIONS = new Set([
  "getStatus",
  "uploadOne",
  "uploadFalla",
  "uploadCalidad",
  "uploadConformidad",
]);

app.post("/api/uploader/proxy", async (req, res) => {
  try {
    const body = req.body || {};
    const action = String(body.action || "").trim();

    console.log("[UPLOADER_PROXY] action:", action);
    console.log("[UPLOADER_PROXY] keys:", Object.keys(body || {}));

    if (!UPLOADER_ACTIONS.has(action)) {
      return res.status(400).json({ ok: false, error: "Acción uploader no permitida" });
    }

    const { action: _omit, ...payload } = body;
    const j = await callAppsScript(action, payload);

    return res.json(j);
  } catch (e) {
    console.error("[UPLOADER_PROXY] ERROR:", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node → Supabase (me) - LECTURA SOLO
app.get("/api/me", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const timings = [];
    
    if (!email) {
      addServerTiming_(res, timings);
      return res.status(400).json({ ok: false, error: "Falta ?email=" });
    }

    // 🔍 LECTURA DESDE SUPABASE
    const t1 = Date.now();
    const usuarios = await supabaseGet_("usuarios", { email });
    timings.push({ label: "usuarios_by_email", duration: Date.now() - t1 });
    
    if (!usuarios || !usuarios.length) {
      addServerTiming_(res, timings);
      return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    }

    const usuario = usuarios[0];
    
    // Obtener módulos del usuario
    const t2 = Date.now();
    const modulos = await supabaseGet_("usuario_modulos", { user_id: usuario.id });
    timings.push({ label: "user_modulos", duration: Date.now() - t2 });
    
    addServerTiming_(res, timings);
    return res.json({
      ok: true,
      profile: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol,
        especialidad: usuario.especialidad,
        activo: usuario.activo,
        modulos: Array.isArray(modulos) ? modulos.map(m => m.modulo) : [],
      }
    });
  } catch (e) {
    console.error("[GET /api/me]", e.message);
    addServerTiming_(res, timings || []);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node → Supabase (mis_activas) - LECTURA SOLO [OPTIMIZADO + TIMING]
app.get("/api/mis-activas", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const userId = String(req.query.userId || "").trim();
    const timings = [];

    if (!email && !userId) {
      return res.status(400).json({ ok: false, error: "Envía ?email= o ?userId=" });
    }

    // 🚀 LECTURA DESDE SUPABASE: obtener asignaciones activas del usuario
    let asignaciones = [];
    
    if (userId) {
      const t1 = Date.now();
      asignaciones = await supabaseGet_("asignaciones", { user_id: userId, activo: true });
      timings.push({ label: "asg_filter_userid", duration: Date.now() - t1 });
    } else if (email) {
      // Primero obtener el ID del usuario por email
      const t1 = Date.now();
      const usuarios = await supabaseGet_("usuarios", { email });
      timings.push({ label: "usuarios_by_email", duration: Date.now() - t1 });
      
      if (usuarios && usuarios.length) {
        const user = usuarios[0];
        const t2 = Date.now();
        asignaciones = await supabaseGet_("asignaciones", { user_id: user.id, activo: true });
        timings.push({ label: "asg_filter_user", duration: Date.now() - t2 });
      }
    }

    // Optimización: traer todos los work_orders en paralelo por IDs
    const workOrderIds = asignaciones
      .map(a => a.work_order_id)
      .filter(Boolean);

    let workOrderMap = {};
    if (workOrderIds.length > 0) {
      const t3 = Date.now();
      // Traer todos los work_orders de una vez (no en bucle)
      const wos = await supabaseGet_("work_orders", {});
      timings.push({ label: "work_orders_all", duration: Date.now() - t3 });
      
      const t4 = Date.now();
      // Filtrar localmente (más rápido que múltiples queries)
      workOrderMap = Object.fromEntries(
        wos.filter(wo => workOrderIds.includes(wo.id))
          .map(wo => [wo.id, wo])
      );
      timings.push({ label: "enrich_local_filter", duration: Date.now() - t4 });
    }

    // Enriquecer asignaciones con info de work_orders (sin esperas)
    const items = asignaciones
      .map(asg => {
        const wo = workOrderMap[asg.work_order_id] || {};
        return {
          ...asg,
          ...wo,
          tiempo_ms: Number(asg.tiempo_trab_ms || wo.tiempo_trab_ms || 0),
          estado: asg.estado_actual || wo.estado_general,
        };
      })
      .filter(it => it.work_order_id); // Filtrar inválidos

    addServerTiming_(res, timings);
    return res.json({
      ok: true,
      items,
    });
  } catch (e) {
    console.error("[GET /api/mis-activas]", e.message);
    addServerTiming_(res, timings || []);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node → Supabase (mis_finalizadas) - LECTURA SOLO [OPTIMIZADO]
app.get("/api/mis-finalizadas", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const userId = String(req.query.userId || "").trim();
    const timings = [];
    
    if (!email && !userId) {
      return res.status(400).json({ ok: false, error: "Envía ?email= o ?userId=" });
    }

    // 🔍 LECTURA DESDE SUPABASE: obtener asignaciones finalizadas del usuario
    let asignaciones = [];
    
    if (userId) {
      const t1 = Date.now();
      asignaciones = await supabaseGet_("asignaciones", { user_id: userId, estado_actual: "FINALIZADO" });
      timings.push({ label: "asg_finalizadas_userid", duration: Date.now() - t1 });
    } else if (email) {
      // Primero obtener el ID del usuario por email
      const t1 = Date.now();
      const usuarios = await supabaseGet_("usuarios", { email });
      timings.push({ label: "usuarios_by_email", duration: Date.now() - t1 });
      
      if (usuarios && usuarios.length) {
        const user = usuarios[0];
        const t2 = Date.now();
        asignaciones = await supabaseGet_("asignaciones", { user_id: user.id, estado_actual: "FINALIZADO" });
        timings.push({ label: "asg_finalizadas_user", duration: Date.now() - t2 });
      }
    }

    // Optimización: traer todos los work_orders en paralelo por IDs
    const workOrderIds = asignaciones
      .map(a => a.work_order_id)
      .filter(Boolean);

    let workOrderMap = {};
    if (workOrderIds.length > 0) {
      const t3 = Date.now();
      // Traer todos los work_orders de una vez (no en bucle)
      const wos = await supabaseGet_("work_orders", {});
      timings.push({ label: "work_orders_all", duration: Date.now() - t3 });
      
      const t4 = Date.now();
      // Filtrar localmente (más rápido que múltiples queries)
      workOrderMap = Object.fromEntries(
        wos.filter(wo => workOrderIds.includes(wo.id))
          .map(wo => [wo.id, wo])
      );
      timings.push({ label: "enrich_local_filter", duration: Date.now() - t4 });
    }

    // Enriquecer con info de work_orders (sin esperas)
    const items = asignaciones
      .map(asg => {
        const wo = workOrderMap[asg.work_order_id] || {};
        return {
          ...asg,
          ...wo,
          tiempo_ms: Number(asg.tiempo_trab_ms || wo.tiempo_trab_ms || 0),
          estado: asg.estado_actual || wo.estado_general,
        };
      })
      .filter(it => it.work_order_id); // Filtrar inválidos

    addServerTiming_(res, timings);
    return res.json({
      ok: true,
      items,
    });
  } catch (e) {
    console.error("[GET /api/mis-finalizadas]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ✍️ DUAL-WRITE: Apps Script + Supabase en paralelo
app.post("/api/evento", async (req, res) => {
  try {
    const body = req.body || {};
    
    // Parallel writes
    const writeApsPromise = callAppsScript("evento", body).catch(err => {
      console.warn("[EVENTO] Apps Script error (continuando):", err.message);
      return null;
    });

    const writeSupabasePromise = (async () => {
      try {
        // Obtener user_id si viene email
        let userId = body.userId || body.user_id;
        if (!userId && body.email) {
          const usuarios = await supabaseGet_("usuarios", { email: body.email });
          if (usuarios && usuarios.length) {
            userId = usuarios[0].id;
          }
        }

        const eventoData = {
          timestamp: new Date().toISOString(),
          user_id: userId || null,
          work_order_id: body.conversionId || body.work_order_id || null,
          tipo_ot: body.tipo_ot || "CONVERSION",
          rol_trabajo: body.rolTrabajo || "TECNICO",
          accion: (body.accion || "NOTA").toUpperCase(),
          nota: body.nota || "",
        };

        return await supabasePost_("eventos", eventoData);
      } catch (err) {
        console.warn("[EVENTO] Supabase error (continuando):", err.message);
        return null;
      }
    })();

    const [apsResult, supabaseResult] = await Promise.all([writeApsPromise, writeSupabasePromise]);

    // Retornar resultado de Apps Script (es el primario)
    return res.json(apsResult || { ok: true, _supabase: true });
  } catch (e) {
    console.error("[POST /api/evento]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node → Supabase (estado) - LECTURA SOLO
app.get("/api/estado", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const rolTrabajo = String(req.query.rolTrabajo || "").trim().toUpperCase();
    const timings = [];

    if (!email) return res.status(400).json({ ok:false, error:"Falta email" });
    if (!vin) return res.status(400).json({ ok:false, error:"Falta vin" });
    if (!rolTrabajo) return res.status(400).json({ ok:false, error:"Falta rolTrabajo" });

    // 🔍 LECTURA DESDE SUPABASE
    // 1. Obtener usuario
    const t1 = Date.now();
    const usuarios = await supabaseGet_("usuarios", { email });
    timings.push({ label: "usuarios_by_email", duration: Date.now() - t1 });
    
    if (!usuarios || !usuarios.length) {
      addServerTiming_(res, timings);
      return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    }
    const userId = usuarios[0].id;

    // 2. Obtener work_order por VIN
    const t2 = Date.now();
    const workOrders = await supabaseGet_("work_orders", { vin });
    timings.push({ label: "work_order_by_vin", duration: Date.now() - t2 });
    
    if (!workOrders || !workOrders.length) {
      addServerTiming_(res, timings);
      return res.status(404).json({ ok: false, error: "VIN no encontrado" });
    }
    const workOrder = workOrders[0];

    // 3. Obtener asignación activa para este usuario + rol
    const t3 = Date.now();
    const asignaciones = await supabaseGet_("asignaciones", { 
      work_order_id: workOrder.id,
      user_id: userId,
      rol_trabajo: rolTrabajo,
    });
    timings.push({ label: "asignacion_by_triple", duration: Date.now() - t3 });

    const asignacion = asignaciones && asignaciones.length ? asignaciones[0] : null;

    addServerTiming_(res, timings);
    return res.json({
      ok: true,
      vin,
      rolTrabajo,
      estado: asignacion?.estado_actual || "SIN_INICIAR",
      tiempoMs: asignacion?.tiempo_trab_ms || 0,
      asignacion: asignacion || null,
    });
  } catch (e) {
    console.error("[GET /api/estado]", e.message);
    addServerTiming_(res, timings || []);
    res.status(500).json({ ok:false, error: String(e.message || e) });
  }
});

// =========================
// SUPERVISOR REPORT
// =========================
app.post("/api/supervisor/report", async (req, res) => {
  try {
    // filtros opcionales: role, q (nombre/email), from, to, month
    const payload = req.body || {};
    const j = await callAppsScript("supervisor_report", payload);
    res.json(j);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Alias GET para que el frontend actual (GET) funcione sin cambiar app.js
app.get("/api/supervisor/report", async (req, res) => {
  try {
    const track = String(req.query.track || "CONVERSION").toUpperCase();

    const payload = {
      q:         String(req.query.q         || "").trim(),
      from:      String(req.query.from      || "").trim(),
      to:        String(req.query.to        || "").trim(),
      month:     String(req.query.month     || "").trim(),
      tipoRamal: String(req.query.tipoRamal || "").trim(),
      track,   // ✅ esta línea faltaba — pasar track a Apps Script
    };

    const j = await callAppsScript("supervisor_report", payload);
    if (!j.ok) return res.json(j);

    // El filtro por track ahora lo hace Apps Script directamente,
    // así que Node ya no necesita volver a filtrar
    return res.json({ ok: true, items: j.items, count: j.count });

  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node → Supabase (supervisor_conversion_detail) - LECTURA SOLO
app.get("/api/supervisor/conversion-detail", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const timings = [];
    
    if (!vin) {
      addServerTiming_(res, timings);
      return res.status(400).json({ ok: false, error: "Falta ?vin=" });
    }

    // 🔍 LECTURA DESDE SUPABASE
    const t1 = Date.now();
    const workOrders = await supabaseGet_("work_orders", { vin });
    timings.push({ label: "work_order_by_vin", duration: Date.now() - t1 });
    
    if (!workOrders || !workOrders.length) {
      addServerTiming_(res, timings);
      return res.status(404).json({ ok: false, error: "VIN no encontrado" });
    }

    const wo = workOrders[0];

    // Obtener todas las asignaciones para este work_order
    const t2 = Date.now();
    const asignaciones = await supabaseGet_("asignaciones", { work_order_id: wo.id });
    timings.push({ label: "asignaciones_by_wo", duration: Date.now() - t2 });

    // Separar por rol
    const motorAsg = asignaciones?.find(a => a.rol_trabajo === "MOTOR");
    const tanqueAsg = asignaciones?.find(a => a.rol_trabajo === "TANQUE");

    addServerTiming_(res, timings);
    return res.json({
      ok: true,
      vin,
      motor: motorAsg ? {
        tecnico: motorAsg.user_id,
        inicio: motorAsg.running_since,
        fin: motorAsg.updated_at,
        estado: motorAsg.estado_actual,
      } : null,
      tanque: tanqueAsg ? {
        tecnico: tanqueAsg.user_id,
        inicio: tanqueAsg.running_since,
        fin: tanqueAsg.updated_at,
        estado: tanqueAsg.estado_actual,
      } : null,
    });
  } catch (e) {
    console.error("[GET /api/supervisor/conversion-detail]", e.message);
    addServerTiming_(res, timings || []);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node → Supabase (vin_suggest) - LECTURA SOLO + TIMING
app.get("/api/vin-suggest", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().toUpperCase();
    const limit = Number(req.query.limit || 12);
    const timings = [];

    if (!q) {
      addServerTiming_(res, timings);
      return res.json({ ok: true, items: [] });
    }

    // 🔍 LECTURA DESDE SUPABASE: buscar VINs que empiecen con q
    const t1 = Date.now();
    const vins = await supabaseGet_("vins", {});
    timings.push({ label: "vins_all", duration: Date.now() - t1 });
    
    // Filtro local (Supabase no tiene LIKE directo con anon key en REST API)
    const t2 = Date.now();
    const items = vins
      .filter(v => v.vin && v.vin.startsWith(q))
      .slice(0, limit)
      .map(v => ({
        vin: v.vin,
        modelo: v.modelo,
        cliente: v.cliente,
      }));
    timings.push({ label: "filter_and_map", duration: Date.now() - t2 });

    addServerTiming_(res, timings);
    return res.json({ ok: true, items });
  } catch (e) {
    console.error("[GET /api/vin-suggest]", e.message);
    addServerTiming_(res, timings || []);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});


// =========================
// NAME SUGGEST (FAST: cache + local filter)
// =========================
let NAME_CACHE = { ts: 0, items: [] };
const NAME_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

function norm_(s) {
  return String(s || "").trim().toLowerCase();
}

function hay_(u) {
  return norm_([u.name, u.email, u.label].filter(Boolean).join(" "));
}

async function ensureNameCache_() {
  const now = Date.now();
  if (NAME_CACHE.items.length && (now - NAME_CACHE.ts) < NAME_CACHE_TTL_MS) return;

  // ✅ pide TODO una vez (q="." o all:true)
  const j = await callAppsScript("name_suggest", { q: ".", limit: 200, all: true });

  const items = Array.isArray(j.items) ? j.items : [];
  NAME_CACHE.items = items.map(x => ({
    userId: String(x.userId || x.id || ""),
    name: String(x.name || x.nombre || ""),
    email: String(x.email || ""),
    label: String(x.label || ""),
  }));
  NAME_CACHE.ts = now;
}

app.get("/api/name-suggest", async (req, res) => {
  try {
    const q = norm_(req.query.q);
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 12)));

    await ensureNameCache_();

    // ✅ si q vacío o "." => devuelve lista base
    if (!q || q === ".") {
      return res.json({ ok: true, items: NAME_CACHE.items.slice(0, limit) });
    }

    // ✅ filtro local instantáneo
    const out = [];
    for (const u of NAME_CACHE.items) {
      if (hay_(u).includes(q)) {
        out.push(u);
        if (out.length >= limit) break;
      }
    }
    return res.json({ ok: true, items: out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// =========================
// SYNC (frontend espera POST /api/sync)
// =========================
app.post("/api/sync", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const userId = String(req.body?.userId || "").trim();
    const since = req.body?.since ?? null;

    if (!email && !userId) {
      return res.status(400).json({ ok: false, error: "Envía email o userId" });
    }

    // intenta action "sync" si existe en tu .gs
    try {
      const excludeFinalizados = req.body?.excludeFinalizados ?? true;
      const forceRefresh = !!req.body?.forceRefresh;
      const j = await callAppsScript("sync", { email, userId, since, excludeFinalizados, forceRefresh });
      return res.json(j);
    } catch (e1) {
      // fallback: usa mis_activas y envuelve como sync
      const excludeFinalizados = req.body?.excludeFinalizados ?? true;
      const j2 = await callAppsScript("mis_activas", { email, userId, excludeFinalizados });
      const items = Array.isArray(j2.items) ? j2.items : [];
      return res.json({
        ok: true,
        full: true,
        items,
        server_time: new Date().toISOString(),
        rev: null,
        mode: "wrapped_mis_activas",
      });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});


// ✍️ DUAL-WRITE: Apps Script + Supabase en paralelo
app.post("/api/equipo-conformidad", async (req, res) => {
  try {
    const body = req.body || {};

    // Parallel writes
    const writeApsPromise = callAppsScript("equipo_conformidad", body).catch(err => {
      console.warn("[EQUIPO_CONFORMIDAD] Apps Script error (continuando):", err.message);
      return null;
    });

    const writeSupabasePromise = (async () => {
      try {
        // Obtener user_id si viene email
        let userId = body.userId || body.user_id;
        if (!userId && body.email) {
          const usuarios = await supabaseGet_("usuarios", { email: body.email });
          if (usuarios && usuarios.length) {
            userId = usuarios[0].id;
          }
        }

        // Actualizar asignación con estado de conformidad
        const conformidadData = {
          conf_ck1: !!body.conf_ck1,
          conf_ck2: !!body.conf_ck2,
          conf_ck3: !!body.conf_ck3,
          conf_ck4: !!body.conf_ck4,
          conf_ts: new Date().toISOString(),
          conf_by: body.email || userId,
        };

        // Actualizar el work_order con datos de conformidad
        await supabasePatch_("work_orders", 
          { id: body.conversionId }, 
          conformidadData
        );

        return { ok: true, _supabase: true };
      } catch (err) {
        console.warn("[EQUIPO_CONFORMIDAD] Supabase error (continuando):", err.message);
        return null;
      }
    })();

    const [apsResult, supabaseResult] = await Promise.all([writeApsPromise, writeSupabasePromise]);

    return res.json(apsResult || { ok: true, _supabase: true });
  } catch (e) {
    console.error("[POST /api/equipo-conformidad]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/api/tecnicos-list", async (req, res) => {
  try {
    const j = await callAppsScript("tecnicos_list", {});
    res.json(j);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ✍️ DUAL-WRITE: Apps Script + Supabase en paralelo (con foto)
app.post("/api/incidencia", async (req, res) => {
  try {
    console.log("[INCIDENCIA] body =", Object.keys(req.body || {}));

    const body = { ...(req.body || {}) };
    let fotoResult = null;

    // ✅ Si viene foto, la subimos primero a Drive (Apps Script)
    if (body.foto && body.foto.b64) {
      const up = await callAppsScript("uploadIncidencia", {
        vin: body.vin,
        conversionId: body.conversionId,
        tipo: body.tipo,
        nota: body.nota,
        tecnico: body.tecnicoNombre || body.tecnicoEmail || body.tecnicoUserId || "",
        file: {
          b64: body.foto.b64,
          mimeType: body.foto.mimeType || "image/jpeg",
          name: body.foto.name || "incidencia.jpg",
        },
      });

      fotoResult = up;

      // ✅ adjuntamos metadata para guardar en sheet y Supabase
      body.fotoFileId = String(up.photoId || "");
      body.fotoUrl = String(up.photoUrl || "");
      body.fotoThumbUrl = String(up.photoThumbUrl || "");
      body.fotoImgUrl = String(up.photoImgUrl || "");
      body.fotoFolderId = String(up.subFolderId || up.folderId || "");
      body.fotoBatchId = String(up.batchId || "");

      // ✅ quitamos base64 antes de guardar
      delete body.foto;
    }

    // PARALLEL WRITES: Apps Script + Supabase
    const writeApsPromise = callAppsScript("incidencia_add", body).catch(err => {
      console.warn("[INCIDENCIA] Apps Script error (continuando):", err.message);
      return null;
    });

    const writeSupabasePromise = (async () => {
      try {
        // Obtener user_id si viene email
        let userId = body.tecnicoUserId;
        if (!userId && body.tecnicoEmail) {
          const usuarios = await supabaseGet_("usuarios", { email: body.tecnicoEmail });
          if (usuarios && usuarios.length) {
            userId = usuarios[0].id;
          }
        }

        const incidenciaData = {
          fecha_hora: new Date().toISOString(),
          mes: new Date().toISOString().substring(0, 7), // 'yyyy-MM'
          work_order_id: body.conversionId || null,
          vin: body.vin || null,
          tecnico: body.tecnicoNombre || body.tecnicoEmail || "",
          tipo: body.tipo || "LEVE",
          registrado_por: body.email || body.registrado_por || "",
          nota: body.nota || "",
          foto_file_id: body.fotoFileId || "",
          foto_folder_id: body.fotoFolderId || "",
          foto_batch_id: body.fotoBatchId || "",
        };

        return await supabasePost_("incidencias", incidenciaData);
      } catch (err) {
        console.warn("[INCIDENCIA] Supabase error (continuando):", err.message);
        return null;
      }
    })();

    const [apsResult, supabaseResult] = await Promise.all([writeApsPromise, writeSupabasePromise]);

    // devolvemos también info de foto si hubo
    return res.json({
      ...(apsResult || { ok: true }),
      foto: fotoResult
        ? {
            photoId: fotoResult.photoId,
            photoUrl: fotoResult.photoUrl,
            photoThumbUrl: fotoResult.photoThumbUrl,
            photoImgUrl: fotoResult.photoImgUrl,
            folderId: fotoResult.subFolderId || fotoResult.folderId,
            batchId: fotoResult.batchId,
          }
        : null,
    });

  } catch (e) {
    console.error("[INCIDENCIA] ERROR:", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node → Supabase (incidencias list) - LECTURA SOLO + TIMING
app.get("/api/incidencias/list", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const conversionId = String(req.query.conversionId || "").trim();
    const email = String(req.query.email || "").trim().toLowerCase();
    const limit = Number(req.query.limit || 200);
    const timings = [];

    if (!vin && !conversionId) {
      addServerTiming_(res, timings);
      return res.status(400).json({ ok:false, error:"Falta vin o conversionId" });
    }

    // 🔍 LECTURA DESDE SUPABASE
    let incidencias = [];
    
    if (vin) {
      const t1 = Date.now();
      incidencias = await supabaseGet_("incidencias", { vin });
      timings.push({ label: "incidencias_by_vin", duration: Date.now() - t1 });
    } else if (conversionId) {
      const t1 = Date.now();
      incidencias = await supabaseGet_("incidencias", { work_order_id: conversionId });
      timings.push({ label: "incidencias_by_conversion", duration: Date.now() - t1 });
    }

    const t2 = Date.now();
    const items = incidencias
      .slice(0, limit)
      .map(inc => ({
        id: inc.id,
        fecha_hora: inc.fecha_hora,
        vin: inc.vin,
        type: inc.tipo,
        nota: inc.nota,
        registrado_por: inc.registrado_por,
        foto_file_id: inc.foto_file_id,
        foto_folder_id: inc.foto_folder_id,
        foto_batch_id: inc.foto_batch_id,
      }));
    timings.push({ label: "map_response", duration: Date.now() - t2 });

    addServerTiming_(res, timings);
    return res.json({
      ok: true,
      items,
    });
  } catch (e) {
    console.error("[GET /api/incidencias/list]", e.message);
    addServerTiming_(res, timings || []);
    return res.status(500).json({ ok:false, error: String(e.message || e) });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Ábrelo desde tu celular con: http://192.168.18.121:${PORT}`);
});

app.get("/api/ping-aps", async (req, res) => {
  try {
    const j = await callAppsScript("ping", {});
    return res.json({
      ok: true,
      via: "node_to_apps_script",
      aps: j
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      via: "node_to_apps_script",
      error: String(e.message || e)
    });
  }
});