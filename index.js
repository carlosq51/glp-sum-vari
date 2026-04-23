import express from "express";
import dotenv from "dotenv";
import { existsSync } from "fs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

// Inyecta variables VITE_* como window.__ENV__ para que funcione sin Vite
app.get("/env-config.js", (_req, res) => {
  res.type("application/javascript");
  res.send(
    `window.__ENV__=${JSON.stringify({
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "",
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || "",
    })};`
  );
});

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

// funci�n para llamar Apps Script
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
  usersByEmail: {},  // ?? Cache espec�fico: email ? userId (TTL 30 min)
  TTL_MS: 2 * 60 * 1000, // 2 minutos
  TTL_USERS_EMAIL: 30 * 60 * 1000, // 30 minutos para email ? userId
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

// ?? CACHE para USER_ID by EMAIL (evita N+1 lookups)
function getCachedUserIdByEmail_(email) {
  const entry = CACHE.usersByEmail[email];
  if (!entry) return null;
  const age = Date.now() - entry.ts;
  if (age < CACHE.TTL_USERS_EMAIL) {
    console.log(`[CACHE HIT] user_id para email (${age}ms old)`);
    return entry.userId;
  }
  // Expirado
  delete CACHE.usersByEmail[email];
  return null;
}

function setCachedUserIdByEmail_(email, userId) {
  CACHE.usersByEmail[email] = { userId, ts: Date.now() };
  console.log(`[CACHE SET] user_id para ${email}`);
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
  // Si el filtro est� vac�o y permitimos cache, intentar desde cache
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
      return res.status(400).json({ ok: false, error: "Acci�n uploader no permitida" });
    }

    const { action: _omit, ...payload } = body;
    const j = await callAppsScript(action, payload);

    return res.json(j);
  } catch (e) {
    console.error("[UPLOADER_PROXY] ERROR:", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node ? Supabase (me) - LECTURA SOLO
app.get("/api/me", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const timings = [];
    
    if (!email) {
      addServerTiming_(res, timings);
      return res.status(400).json({ ok: false, error: "Falta ?email=" });
    }

    // ?? LECTURA DESDE SUPABASE
    const t1 = Date.now();
    const usuarios = await supabaseGet_("usuarios", { email });
    timings.push({ label: "usuarios_by_email", duration: Date.now() - t1 });
    
    if (!usuarios || !usuarios.length) {
      addServerTiming_(res, timings);
      return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    }

    const usuario = usuarios[0];
    
    // Obtener m�dulos del usuario
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

// endpoint Node ? Supabase (mis_activas) - ULTRA R�PIDO con JOINS + CACHE
// ? Filtras por: t�cnico (id/email) + estado != FINALIZADO
app.get("/api/mis-activas", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const userId = String(req.query.userId || "").trim();
    const t1 = Date.now();

    if (!email && !userId) {
      return res.status(400).json({ ok: false, error: "Env�a ?email= o ?userId=" });
    }

    // 1?? Obt�n user_id si viene email (con CACHE para evitar N+1)
    let finalUserId = userId;
    let tecnicoEmail = email;
    if (!finalUserId && email) {
      // ?? Primero intenta el cache
      finalUserId = getCachedUserIdByEmail_(email);
      
      if (!finalUserId) {
        // Cache miss ? busca en Supabase
        const usuarios = await supabaseGet_("usuarios", { email });
        if (!usuarios?.length) {
          return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
        }
        finalUserId = usuarios[0].id;
        tecnicoEmail = usuarios[0].email;
        // ?? Cachea el resultado para pr�ximas llamadas
        setCachedUserIdByEmail_(email, finalUserId);
      }
    } else if (finalUserId) {
      // Si vino userId, obt�n el email del usuario
      const usuarios = await supabaseGet_("usuarios", { id: `eq.${finalUserId}` });
      if (usuarios?.length) {
        tecnicoEmail = usuarios[0].email;
      }
    }

    // 2?? Query asignaciones ACTIVAS + usuarios + work_orders (LEFT JOIN)
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    
    let query = `${SUPABASE_URL}/rest/v1/asignaciones?`;
    query += `user_id=eq.${finalUserId}&activo=eq.true&estado_actual=neq.FINALIZADO`;
    query += `&select=id,work_order_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,updated_at,last_nota,user_id,usuarios!inner(id,email,nombre),work_orders(id,vin,tipo_ramal,fecha_creacion,vins(reductor_asignado,tanque_asignado))`;
    query += `&order=updated_at.desc`;

    const res_data = await fetch(query, { method: "GET", headers });
    
    if (!res_data.ok) {
      throw new Error(`Supabase asignaciones ${res_data.status}`);
    }

    let asignaciones = await res_data.json();
    
    // Extraer VIN, tipo_ramal y fecha_creacion desde work_orders JOIN
    asignaciones = asignaciones.map(asg => {
      const wo = Array.isArray(asg.work_orders) 
        ? asg.work_orders[0] 
        : asg.work_orders;
      asg.vin = wo?.vin || "";
      asg.tipo_ramal = wo?.tipo_ramal || "";
      asg.wo_fecha_creacion = wo?.fecha_creacion || "";
      asg.reductor_asignado = wo?.vins?.reductor_asignado || "";
      asg.tanque_asignado = wo?.vins?.tanque_asignado || "";
      return asg;
    });
    
    const duration = Date.now() - t1;

    const items = asignaciones.map(asg => {
      return {
        id: asg.id,
        work_order_id: asg.work_order_id,
        tipo_ot: asg.tipo_ot,
        rol_trabajo: asg.rol_trabajo,
        estado_actual: asg.estado_actual,
        running_since: asg.running_since,
        created_at: asg.running_since || asg.wo_fecha_creacion || "",
        fecha_creacion: asg.wo_fecha_creacion || "",
        tiempo_trab_ms: asg.tiempo_trab_ms || 0,
        updated_at: asg.updated_at,
        last_nota: asg.last_nota || "",
        vin: asg.vin || "",
        tipo_ramal: asg.tipo_ramal || "",
        tipoRamal: asg.tipo_ramal || "",
        estado: asg.estado_actual,
        tiempo_ms: asg.tiempo_trab_ms || 0,
        reductor_asignado: asg.reductor_asignado || "",
        tanque_asignado: asg.tanque_asignado || "",
        tecnico_id: asg.user_id,
        tecnico_email: asg.usuarios?.[0]?.email || tecnicoEmail || "",
        tecnico_nombre: asg.usuarios?.[0]?.nombre || "",
      };
    });

    res.set("Server-Timing", `query;dur=${duration}`);
    return res.json({
      ok: true,
      items,
      count: items.length,
      _timing: `${duration}ms`,
    });

  } catch (e) {
    console.error("[GET /api/mis-activas]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node ? Supabase (mis_finalizadas) - LECTURA OPTIMIZADA [ESTADO FILTRADO]
// ? Filtras por: t�cnico (id/email) + estado = FINALIZADO
app.get("/api/mis-finalizadas", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const userId = String(req.query.userId || "").trim();
    const t1 = Date.now();
    
    if (!email && !userId) {
      return res.status(400).json({ ok: false, error: "Env�a ?email= o ?userId=" });
    }

    // 1?? Obt�n user_id si viene email (con CACHE para evitar N+1)
    let finalUserId = userId;
    let tecnicoEmail = email;
    if (!finalUserId && email) {
      // ?? Primero intenta el cache
      finalUserId = getCachedUserIdByEmail_(email);
      
      if (!finalUserId) {
        // Cache miss ? busca en Supabase
        const usuarios = await supabaseGet_("usuarios", { email });
        if (!usuarios?.length) {
          return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
        }
        finalUserId = usuarios[0].id;
        tecnicoEmail = usuarios[0].email;
        // ?? Cachea el resultado
        setCachedUserIdByEmail_(email, finalUserId);
      }
    } else if (finalUserId) {
      // Si vino userId, obt�n el email del usuario
      const usuarios = await supabaseGet_("usuarios", { id: `eq.${finalUserId}` });
      if (usuarios?.length) {
        tecnicoEmail = usuarios[0].email;
      }
    }

    // 2?? Query asignaciones FINALIZADAS + usuarios + work_orders (LEFT JOIN)
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    
    let query = `${SUPABASE_URL}/rest/v1/asignaciones?`;
    query += `user_id=eq.${finalUserId}&estado_actual=eq.FINALIZADO`;
    query += `&select=id,work_order_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,updated_at,last_nota,user_id,usuarios!inner(id,email,nombre),work_orders(id,vin,tipo_ramal,fecha_creacion,vins(reductor_asignado,tanque_asignado))`;
    query += `&order=updated_at.desc`;

    const res_data = await fetch(query, { method: "GET", headers });
    
    if (!res_data.ok) {
      throw new Error(`Supabase asignaciones ${res_data.status}`);
    }

    let asignaciones = await res_data.json();
    
    // Extraer VIN y fecha_creacion desde work_orders JOIN
    asignaciones = asignaciones.map(asg => {
      const wo = Array.isArray(asg.work_orders) 
        ? asg.work_orders[0] 
        : asg.work_orders;
      asg.vin = wo?.vin || "";
      asg.tipo_ramal = wo?.tipo_ramal || "";
      asg.wo_fecha_creacion = wo?.fecha_creacion || "";
      asg.reductor_asignado = wo?.vins?.reductor_asignado || "";
      asg.tanque_asignado = wo?.vins?.tanque_asignado || "";
      return asg;
    });
    
    const duration = Date.now() - t1;

    const items = asignaciones.map(asg => {
      return {
        id: asg.id,
        work_order_id: asg.work_order_id,
        tipo_ot: asg.tipo_ot,
        rol_trabajo: asg.rol_trabajo,
        estado_actual: asg.estado_actual,
        running_since: asg.running_since,
        created_at: asg.running_since || asg.wo_fecha_creacion || "",
        fecha_creacion: asg.wo_fecha_creacion || "",
        tiempo_trab_ms: asg.tiempo_trab_ms || 0,
        updated_at: asg.updated_at,
        last_nota: asg.last_nota || "",
        vin: asg.vin || "",
        tipo_ramal: asg.tipo_ramal || "",
        tipoRamal: asg.tipo_ramal || "",
        estado: asg.estado_actual,
        tiempo_ms: asg.tiempo_trab_ms || 0,
        reductor_asignado: asg.reductor_asignado || "",
        tanque_asignado: asg.tanque_asignado || "",
        tecnico_id: asg.user_id,
        tecnico_email: asg.usuarios?.[0]?.email || tecnicoEmail || "",
        tecnico_nombre: asg.usuarios?.[0]?.nombre || "",
      };
    });

    res.set("Server-Timing", `query;dur=${duration}`);
    return res.json({
      ok: true,
      items,
      count: items.length,
      _timing: `${duration}ms`,
    });
  } catch (e) {
    console.error("[GET /api/mis-finalizadas]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ?? DUAL-WRITE: Apps Script + Supabase en paralelo
app.post("/api/evento", async (req, res) => {
  try {
    const body = req.body || {};
    
    const email = body.email;
    let vin = String(body.vin || "").trim().toUpperCase();
    const rolTrabajo = String(body.rolTrabajo || "").trim().toUpperCase();
    const accion = String(body.accion || "").trim().toUpperCase();
    const nota = String(body.nota || "").trim();
    const tipoRamal = String(body.tipoRamal || "").trim();
    const conversionIdBody = String(body.conversionId || "").trim();

    // RAMALERO no usa VIN: generar pseudo-VIN o buscar por conversionId
    const isRamalero = rolTrabajo === "RAMALERO";
    // Para RAMALERO con WO existente, resolver VIN o generar uno
    if (isRamalero && !vin && conversionIdBody) {
      const woExist = await supabaseGet_("work_orders", { id: conversionIdBody });
      if (woExist?.length) {
        vin = woExist[0].vin || "";
        // Si el WO existe pero no tiene VIN, generar pseudo-VIN y actualizar el WO
        if (!vin) {
          vin = `RAMAL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          // Asegurar que el VIN existe en la tabla vins
          try {
            await supabasePost_("vins", { vin, modelo: "RAMAL" });
          } catch (e) {
            if (!String(e.message || e).includes("23505") && !String(e.message || e).includes("duplicate")) throw e;
          }
          // Actualizar el work_order con el VIN generado
          try {
            await supabasePatch_("work_orders", { id: conversionIdBody }, { vin });
            console.log(`[EVENTO] VIN generado y asignado a WO ${conversionIdBody}: ${vin}`);
          } catch (e) {
            console.warn(`[EVENTO] No se pudo actualizar WO con VIN:`, e.message);
          }
        }
      }
    }
    if (isRamalero && !vin && accion === "INICIO") {
      // Nuevo ramal: generar pseudo-VIN único
      vin = `RAMAL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    }

    if (!email || !vin || !rolTrabajo || !accion) {
      return res.status(400).json({ 
        ok: false, 
        error: "Faltan campos: email, vin, rolTrabajo, accion" 
      });
    }

    const t1 = Date.now();

    // 1?? Obtener user_id
    const usuarios = await supabaseGet_("usuarios", { email });
    if (!usuarios || !usuarios.length) {
      return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    }
    const userId = usuarios[0].id;

    // 2️⃣ Mapear rolTrabajo → tipo_ot para buscar el work_order correcto
    const ROL_TO_TIPO_OT = {
      "MOTOR": "CONVERSION",
      "TANQUE": "CONVERSION",
      "CALIDAD": "CALIDAD",
      "RAMALERO": "RAMALERO",
    };
    const tipoOtBuscado = ROL_TO_TIPO_OT[rolTrabajo] || "CONVERSION";

    // Buscar work_order por VIN + tipo_ot (evita tomar el WO equivocado)
    let workOrders = await supabaseGet_("work_orders", { vin, tipo_ot: tipoOtBuscado });
    let workOrderId, tipoOt;
    
    if (!workOrders || !workOrders.length) {
      // Verificar si el VIN existe en la lista de VINs válidos
      let vins = await supabaseGet_("vins", { vin });
      
      if (!vins || !vins.length) {
        // ⚠️ VIN NO EXISTE EN LA LISTA
        // Para RAMALERO: crear pseudo-VIN automáticamente (ya generado arriba)
        // Para otros roles: ERROR - VIN debe existir en la lista
        if (isRamalero) {
          // RAMALERO puede crear VINs automáticamente (pseudo-VINs)
          try {
            const vinData = {
              vin: vin,
              modelo: "RAMAL",
            };
            await supabasePost_("vins", vinData);
            console.log(`[EVENTO] Pseudo-VIN RAMALERO creado: ${vin}`);
          } catch (vinErr) {
            const errMsg = String(vinErr.message || vinErr);
            // Si ya existe (duplicate), está bien
            if (!errMsg.includes("23505") && !errMsg.includes("duplicate") && !errMsg.includes("already exists")) {
              console.error(`[EVENTO] Error creando pseudo-VIN RAMALERO:`, errMsg);
              throw new Error(`No se pudo crear pseudo-VIN RAMALERO: ${errMsg}`);
            }
          }
        } else {
          // ❌ ERROR: VIN no existe en la lista - NO se debe crear automáticamente
          console.warn(`[EVENTO] VIN inválido: ${vin} no existe en la lista de VINs`);
          return res.status(404).json({
            ok: false,
            error: `El VIN "${vin}" no existe en la lista de vehículos registrados. Verifica que el VIN sea correcto.`,
            errorType: "VIN_NOT_FOUND",
            vin: vin,
          });
        }
      }
      
      // ✅ Ahora sí CREAR work_order con el tipo_ot correcto
      try {
        const woData = {
          tipo_ot: tipoOtBuscado,
          vin: vin,
          estado_general: "PENDIENTE",
        };
        // RAMALERO: guardar tipo_ramal en el work_order
        if (isRamalero && tipoRamal) woData.tipo_ramal = tipoRamal;
        const createdWO = await supabasePost_("work_orders", woData);
        const wo = Array.isArray(createdWO) ? createdWO[0] : createdWO;
        workOrderId = wo.id;
        tipoOt = wo.tipo_ot;
        console.log(`[EVENTO] Work Order creado: ${workOrderId} para VIN ${vin}, tipo_ot=${tipoOt}`);
      } catch (woErr) {
        const errMsg = String(woErr.message || woErr);
        console.error(`[EVENTO] CRÍTICO - No se pudo crear Work Order:`, errMsg);
        throw new Error(`No se pudo crear Work Order para VIN ${vin}: ${errMsg}`);
      }
    } else {
      workOrderId = workOrders[0].id;
      tipoOt = workOrders[0].tipo_ot;
      console.log(`[EVENTO] Work Order existente encontrado: ${workOrderId} (tipo_ot=${tipoOt})`);
    }

    // 3?? Buscar asignaci�n ACTIVA por (work_order_id, rol_trabajo) - SIN filtrar user_id
    // Esto devuelve la asignaci�n activa EXISTENTE, sea de quien sea
    let query = `${process.env.SUPABASE_URL}/rest/v1/asignaciones?`;
    query += `work_order_id=eq.${workOrderId}&rol_trabajo=eq.${rolTrabajo}&activo=eq.true`;

    const headers = supabaseHeaders_();
    const res_asg = await fetch(query, { method: "GET", headers });
    const asignacionesActivas = (await res_asg.json()) || [];
    const asignacionActiva = asignacionesActivas.length > 0 ? asignacionesActivas[0] : null;

    // 4?? Verificar si ya est� asignada a otro usuario
    if (asignacionActiva && asignacionActiva.user_id !== userId) {
      // Obtener nombre del usuario que tiene asignada
      let otroUsuario = "otro usuario";
      let otroEmail = "";
      try {
        const otrosUsuarios = await supabaseGet_("usuarios", { id: asignacionActiva.user_id });
        if (otrosUsuarios && otrosUsuarios.length) {
          otroUsuario = `${otrosUsuarios[0].nombre || ""}`.trim() || otrosUsuarios[0].email;
          otroEmail = otrosUsuarios[0].email || "";
        }
      } catch (e) { /* ignore */ }
      
      // ? Retornar m�s informaci�n para mejor manejo en frontend
      return res.status(409).json({ 
        ok: false, 
        error: `Esta OT ya est� asignada a ${otroUsuario} en rol ${rolTrabajo}`,
        errorType: "ALREADY_ASSIGNED",
        assignedTo: otroUsuario,
        assignedEmail: otroEmail,
        assignedRol: rolTrabajo,
        vin: vin,
      });
    }

    // 5?? Si existe asignaci�n del usuario actual, usarla; si no, ser� null (crearemos nueva)
    let asignacion = asignacionActiva && asignacionActiva.user_id === userId ? asignacionActiva : null;

    // 6?? Calcular nuevo estado seg�n acci�n
    const estadoActual = asignacion?.estado_actual || "SIN_INICIAR";
    let nuevoEstado = estadoActual;
    let runningSince = asignacion?.running_since || null;
    let tiempoAgregado = 0;

    // ? VALIDACI�N DE TRANSICI�N DE ESTADO (lado servidor)
    // Definir transiciones v�lidas
    const transicionesValidas = {
      "SIN_INICIAR": ["INICIO", "NOTA"],
      "TRABAJANDO": ["PAUSA", "FIN", "NOTA"],
      "PAUSADO": ["REANUDAR", "FIN", "NOTA"],
      "FINALIZADO": ["NOTA"],
    };

    const accionesValidas = transicionesValidas[estadoActual] || ["INICIO", "NOTA"];
    if (!accionesValidas.includes(accion)) {
      console.warn(
        `[EVENTO] Acci�n no permitida: estado=${estadoActual}, accion=${accion}. ` +
        `Permitidas: ${accionesValidas.join(", ")}`
      );
      return res.status(400).json({
        ok: false,
        error: `Acci�n ${accion} no permitida desde estado ${estadoActual}`,
        estadoActual: estadoActual,
        accionesPermitidas: accionesValidas,
      });
    }

    switch (accion) {
      case "INICIO":
        nuevoEstado = "TRABAJANDO";
        runningSince = new Date().toISOString();
        break;
      case "PAUSA":
        nuevoEstado = "PAUSADO";
        if (estadoActual === "TRABAJANDO" && runningSince) {
          tiempoAgregado = Date.now() - new Date(runningSince).getTime();
        }
        runningSince = null;
        break;
      case "REANUDAR":
        nuevoEstado = "TRABAJANDO";
        runningSince = new Date().toISOString();
        break;
      case "FIN":
        nuevoEstado = "FINALIZADO";
        if (estadoActual === "TRABAJANDO" && runningSince) {
          tiempoAgregado = Date.now() - new Date(runningSince).getTime();
        }
        runningSince = null;
        break;
      case "NOTA":
        // No cambia estado, solo agrega nota
        break;
    }

    // 7?? Crear evento en Supabase
    const eventoData = {
      timestamp: new Date().toISOString(),
      user_id: userId,
      work_order_id: workOrderId,
      tipo_ot: tipoOt,
      rol_trabajo: rolTrabajo,
      accion: accion,
      nota: nota || "",
    };

    await supabasePost_("eventos", eventoData);

    // 8?? Si no existe asignaci�n, crearla
    if (!asignacion) {
      const asgData = {
        work_order_id: workOrderId,
        user_id: userId,
        tipo_ot: tipoOt,
        rol_trabajo: rolTrabajo,
        estado_actual: nuevoEstado,
        running_since: runningSince,
        tiempo_trab_ms: 0,
        activo: true,
      };
      asignacion = await supabasePost_("asignaciones", asgData);
      if (Array.isArray(asignacion)) asignacion = asignacion[0];
    } else {
      // 9?? Actualizar asignaci�n existente
      const updateData = {
        estado_actual: nuevoEstado,
        running_since: runningSince,
        tiempo_trab_ms: (asignacion.tiempo_trab_ms || 0) + tiempoAgregado,
        updated_at: new Date().toISOString(),
      };
      if (accion === "NOTA") {
        updateData.last_nota = nota;
        updateData.last_nota_ts = new Date().toISOString();
      }

      const updateResult = await supabasePatch_("asignaciones", 
        { id: asignacion.id }, 
        updateData
      );
      asignacion = Array.isArray(updateResult) ? updateResult[0] : updateResult;
    }

    // 10️⃣ Actualizar estado_general del work_order (MOTOR/TANQUE)
    // Solo FINALIZADO si AMBAS asignaciones (MOTOR y TANQUE) existen y están FINALIZADO
    if ((rolTrabajo === "MOTOR" || rolTrabajo === "TANQUE") && tipoOt === "CONVERSION") {
      try {
        const allAsg = await supabaseGet_("asignaciones", {
          work_order_id: workOrderId,
          activo: true,
        });
        let motor = null, tanque = null;
        for (const a of (allAsg || [])) {
          const rol = String(a.rol_trabajo || "").toUpperCase();
          const est = String(a.estado_actual || "").toUpperCase();
          if (rol === "MOTOR") motor = est;
          if (rol === "TANQUE") tanque = est;
        }
        // Requiere AMBAS asignaciones finalizadas
        const estadoGeneral = (motor === "FINALIZADO" && tanque === "FINALIZADO")
          ? "FINALIZADO"
          : (motor || tanque) ? "EN PROCESO" : "PENDIENTE";

        await supabasePatch_("work_orders", { id: workOrderId }, { estado_general: estadoGeneral });
        console.log(`[EVENTO] estado_general actualizado: ${estadoGeneral} (motor=${motor}, tanque=${tanque})`);
      } catch (err) {
        console.warn("[EVENTO] No se pudo actualizar estado_general:", err.message);
      }
    }

    // ?? Retornar asignaci�n actualizada - CON TODOS LOS CAMPOS ESPERADOS Y NORMALIZADOS
    const duration = Date.now() - t1;
    
    // ? NORMALIZACI�N GARANTIZADA
    const respuesta = {
      ok: true,
      // Campos de asignaci�n
      id: asignacion.id,
      work_order_id: workOrderId,
      user_id: userId,
      tipo_ot: tipoOt,
      rol_trabajo: rolTrabajo,
      estado_actual: asignacion.estado_actual,
      running_since: asignacion.running_since,
      tiempo_trab_ms: asignacion.tiempo_trab_ms || 0,
      activo: asignacion.activo,
      created_at: asignacion.created_at,
      updated_at: asignacion.updated_at,
      last_nota: asignacion.last_nota || "",
      last_nota_ts: asignacion.last_nota_ts,
      
      // Campos mapeados para compatibilidad con frontend
      vin: vin,  // ? VIN GARANTIZADO
      conversionId: workOrderId,  // Alias
      estado: asignacion.estado_actual,  // Alias
      tiempo_ms: asignacion.tiempo_trab_ms || 0,  // Alias
      rolTrabajo: rolTrabajo,  // camelCase
      tipoRamal: tipoRamal || "",  // Para RAMALERO
      
      // Metadata
      _timing: `${duration}ms`,
      _source: "supabase",
      _debugInfo: {
        nuevoEstado,
        estadoActualAnterior: estadoActual,
        accion,
      },
    };
    
    console.log(`[EVENTO] ? Exitoso: ${accion} para VIN=${vin}, ROL=${rolTrabajo}, ESTADO=${nuevoEstado}`);
    return res.json(respuesta);
  } catch (e) {
    console.error("[POST /api/evento]", e.message, e.stack);
    
    // ? Retornar error m�s informativo y categorizado
    const errorMsg = String(e.message || e);
    let statusCode = 500;
    let errorType = "INTERNAL_ERROR";
    let userMsg = "Error al registrar evento";
    
    if (errorMsg.includes("404") || errorMsg.includes("no encontrado")) {
      statusCode = 404;
      errorType = "NOT_FOUND";
      userMsg = "Usuario, VIN o  elemento no encontrado";
    } else if (errorMsg.includes("Usuario")) {
      statusCode = 404;
      errorType = "USER_NOT_FOUND";
      userMsg = "Usuario no encontrado";
    } else if (errorMsg.includes("Constraint") || errorMsg.includes("conflict")) {
      statusCode = 409;
      errorType = "CONFLICT";
      userMsg = "Conflicto al crear/actualizar registro";
    } else if (errorMsg.includes("permission") || errorMsg.includes("forbidden")) {
      statusCode = 403;
      errorType = "FORBIDDEN";
      userMsg = "Permiso denegado";
    } else if (errorMsg.includes("timeout") || errorMsg.includes("timed out")) {
      statusCode = 504;
      errorType = "TIMEOUT";
      userMsg = "La operaci�n tard� demasiado. Intenta de nuevo.";
    }
    
    res.status(statusCode).json({ 
      ok: false, 
      error: userMsg,
      errorType: errorType,
      details: errorMsg,
      _debug: process.env.NODE_ENV === "development" ? e.message : undefined,
    });
  }
});

// endpoint Node ? Supabase (estado) - LECTURA SOLO
app.get("/api/estado", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const rolTrabajo = String(req.query.rolTrabajo || "").trim().toUpperCase();
    const timings = [];

    if (!email) return res.status(400).json({ ok:false, error:"Falta email" });
    if (!vin) return res.status(400).json({ ok:false, error:"Falta vin" });
    if (!rolTrabajo) return res.status(400).json({ ok:false, error:"Falta rolTrabajo" });

    // ?? LECTURA DESDE SUPABASE
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

    // 3. Obtener asignaci�n activa para este usuario + rol
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
// SUPERVISOR REPORT (Supabase directo)
// =========================
app.post("/api/supervisor/report", async (req, res) => {
  try {
    const payload = req.body || {};
    return await handleSupervisorReport_(payload, res);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/api/supervisor/report", async (req, res) => {
  try {
    const payload = {
      q:         String(req.query.q         || "").trim(),
      from:      String(req.query.from      || "").trim(),
      to:        String(req.query.to        || "").trim(),
      month:     String(req.query.month     || "").trim(),
      tipoRamal: String(req.query.tipoRamal || "").trim(),
      track:     String(req.query.track     || "CONVERSION").toUpperCase(),
    };
    return await handleSupervisorReport_(payload, res);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

async function handleSupervisorReport_(payload, res) {
  const t1 = Date.now();
  const track = String(payload.track || "CONVERSION").toUpperCase();
  const q = String(payload.q || "").trim().toLowerCase();
  const from = String(payload.from || "").trim();
  const to = String(payload.to || "").trim();
  const month = String(payload.month || "").trim(); // YYYY-MM

  const headers = supabaseHeaders_();
  const SUPABASE_URL = process.env.SUPABASE_URL;

  // Determinar tipo_ot según track
  let tipoOtFilter = "";
  if (track === "CONVERSION") tipoOtFilter = "tipo_ot=in.(CONVERSION)";
  else if (track === "CALIDAD") tipoOtFilter = "tipo_ot=eq.CALIDAD";
  else if (track === "RAMAL") tipoOtFilter = "tipo_ot=eq.RAMALERO";
  else tipoOtFilter = "tipo_ot=in.(CONVERSION)";

  // Query asignaciones con JOINs embebidos a usuarios y work_orders
  let url = `${SUPABASE_URL}/rest/v1/asignaciones?`;
  url += `select=id,work_order_id,user_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,fecha_asignacion,updated_at,last_nota,activo,`;
  url += `usuarios(id,nombre,email),`;
  url += `work_orders(id,vin,tipo_ot,tipo_ramal,fecha_creacion,estado_general)`;
  url += `&${tipoOtFilter}`;
  url += `&activo=eq.true`;

  // Filtro por fecha
  if (from) url += `&fecha_asignacion=gte.${from}T00:00:00`;
  if (to) url += `&fecha_asignacion=lte.${to}T23:59:59`;
  if (month && !from && !to) {
    url += `&fecha_asignacion=gte.${month}-01T00:00:00`;
    // Calcular fin del mes
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    url += `&fecha_asignacion=lte.${month}-${String(lastDay).padStart(2, "0")}T23:59:59`;
  }

  url += `&order=updated_at.desc`;

  const resp = await fetch(url, { method: "GET", headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("[SUPERVISOR_REPORT] Supabase error:", resp.status, text.slice(0, 300));
    return res.status(500).json({ ok: false, error: `Supabase: ${resp.status}` });
  }

  const raw = await resp.json();

  // Obtener modelos de VINs (consulta separada)
  const vinsSet = new Set();
  (raw || []).forEach(asg => {
    const wo = asg.work_orders || {};
    if (wo.vin) vinsSet.add(wo.vin);
  });

  let vinsMap = {};
  if (vinsSet.size > 0) {
    const vinsArray = Array.from(vinsSet);
    const vinsUrl = `${SUPABASE_URL}/rest/v1/vins?select=vin,modelo&vin=in.(${vinsArray.join(",")})`;
    const vinsResp = await fetch(vinsUrl, { method: "GET", headers }).catch(() => null);
    
    if (vinsResp && vinsResp.ok) {
      const vinsData = await vinsResp.json();
      (vinsData || []).forEach(v => {
        vinsMap[v.vin] = v.modelo || "";
      });
    }
  }

  // Mapear a formato esperado por el frontend
  let items = (raw || []).map(asg => {
    const user = asg.usuarios || {};
    const wo = asg.work_orders || {};
    const vin = wo.vin || "";
    return {
      // IDs
      id: asg.id,
      workId: asg.work_order_id,
      conversionId: asg.work_order_id,
      userId: asg.user_id,
      // User info
      userName: user.nombre || "",
      userEmail: user.email || "",
      // Work order info
      vin: vin,
      modelo: vinsMap[vin] || "",
      tipoRamal: wo.tipo_ramal || "",
      tipo_ot: asg.tipo_ot,
      // Assignment info
      rol: asg.rol_trabajo,
      rolTrabajo: asg.rol_trabajo,
      estado: asg.estado_actual,
      tiempo_ms: asg.tiempo_trab_ms || 0,
      running_since: asg.running_since,
      fecha_inicio: asg.fecha_asignacion,
      fecha_asignacion: asg.fecha_asignacion,
      updated_at: asg.updated_at,
      created_at: wo.fecha_creacion,
      fecha_creacion: wo.fecha_creacion,
      last_nota: asg.last_nota || "",
      activo: asg.activo,
    };
  });

  // Filtro por texto (nombre, email, vin)
  if (q) {
    items = items.filter(it => {
      const haystack = [it.userName, it.userEmail, it.vin, it.tipoRamal]
        .join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  const duration = Date.now() - t1;
  console.log(`[SUPERVISOR_REPORT] ${track}: ${items.length} items en ${duration}ms`);

  return res.json({ ok: true, items, count: items.length, _timing: `${duration}ms`, _source: "supabase" });
}

// endpoint Node ? Supabase (supervisor_conversion_detail) - LECTURA SOLO
app.get("/api/supervisor/conversion-detail", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const timings = [];
    
    if (!vin) {
      addServerTiming_(res, timings);
      return res.status(400).json({ ok: false, error: "Falta ?vin=" });
    }

    // ?? LECTURA DESDE SUPABASE
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

// endpoint Node ? Supabase (vin_suggest) - B�SQUEDA CONTAINS CON ILIKE
app.get("/api/vin-suggest", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().toUpperCase();
    const limit = Number(req.query.limit || 12);

    if (!q || q.length < 1) {
      return res.json({ ok: true, items: [] });
    }

    const t1 = Date.now();

    // ?? B�SQUEDA CONTAINS: busca cualquier VIN que contenga el patr�n
    // Ejemplo: "213" encuentra "TH500213"
    const searchPattern = encodeURIComponent(`%${q}%`);
    let query = `${process.env.SUPABASE_URL}/rest/v1/vins?`;
    query += `vin=ilike.${searchPattern}`;
    query += `&select=vin,modelo,cliente`;
    query += `&order=vin.asc&limit=${limit}`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });
    
    if (!res_data.ok) throw new Error(`Status ${res_data.status}`);
    
    const items = (await res_data.json()) || [];
    const duration = Date.now() - t1;

    return res.json({
      ok: true,
      items: items.map(v => ({ vin: v.vin, modelo: v.modelo, cliente: v.cliente })),
      count: items.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    console.error("[GET /api/vin-suggest]", e.message);
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

// REMOVED: ensureNameCache_() � Replaced with direct Supabase queries

app.get("/api/name-suggest", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 12)));

    const t1 = Date.now();

    // ?? B�SQUEDA DIRECTA EN SUPABASE (sin cache)
    let query = `${process.env.SUPABASE_URL}/rest/v1/usuarios?`;
    query += `activo=eq.true`;
    
    if (q && q !== ".") {
      // Busca en nombre email (ILIKE case-insensitive)
      const searchPattern = encodeURIComponent(`%${q}%`);
      query += `&or=(nombre.ilike.${searchPattern},email.ilike.${searchPattern})`;
    }
    
    query += `&select=id,nombre,email,rol,especialidad`;
    query += `&order=nombre.asc&limit=${limit}`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });
    
    if (!res_data.ok) throw new Error(`${res_data.status}`);
    
    const items = await res_data.json();
    const duration = Date.now() - t1;

    // Mapea al formato esperado por frontend
    const mapped = items.map(u => ({
      userId: String(u.id || ""),
      name: String(u.nombre || ""),
      email: String(u.email || ""),
      label: `${u.nombre} (${u.email})`,
    }));

    return res.json({
      ok: true,
      items: mapped,
      count: mapped.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// =========================
// ?? SYNC optimizado � Supabase directo (SIN AppScript = R�PIDO)
// =========================
app.post("/api/sync", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const userId = String(req.body?.userId || "").trim();
    const since = req.body?.since ?? null;
    const excludeFinalizados = req.body?.excludeFinalizados ?? true;
    const t1 = Date.now();

    if (!email && !userId) {
      return res.status(400).json({ ok: false, error: "Env�a email o userId" });
    }

    // 1?? Obt�n user_id si viene email
    let finalUserId = userId;
    if (!finalUserId && email) {
      const usuarios = await supabaseGet_("usuarios", { email });
      if (!usuarios?.length) {
        return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
      }
      finalUserId = usuarios[0].id;
    }

    // 2?? Query asignaciones ACTIVAS + work_orders (paralelo)
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    
    let query = `${SUPABASE_URL}/rest/v1/asignaciones?`;
    query += `user_id=eq.${finalUserId}&activo=eq.true`;
    
    if (excludeFinalizados) {
      query += `&estado_actual=neq.FINALIZADO`;
    }
    
    query += `&select=*,work_orders(*,vins(reductor_asignado,tanque_asignado))&order=updated_at.desc&limit=50`;

    const res_data = await fetch(query, { method: "GET", headers });
    
    if (!res_data.ok) {
      throw new Error(`Supabase ${res_data.status}`);
    }

    const asignaciones = await res_data.json();
    const duration = Date.now() - t1;

    // Mapea a formato que espera el frontend
    const items = asignaciones.map(asg => ({
      asignacion_id: asg.id,
      vin: asg.work_orders?.vin || "",
      conversion_id: asg.work_order_id,
      rol_trabajo: asg.rol_trabajo,
      estado_actual: asg.estado_actual,
      tiempo_ms: asg.tiempo_trab_ms || 0,
      running_since: asg.running_since,
      created_at: asg.running_since || asg.work_orders?.fecha_creacion || "",
      fecha_creacion: asg.work_orders?.fecha_creacion || "",
      last_nota: asg.last_nota || "",
      work_orders: asg.work_orders || {},
    }));

    return res.json({
      ok: true,
      items,
      count: items.length,
      full: false,
      server_time: new Date().toISOString(),
      rev: null,
      mode: "sync_supabase",
      _timing: `${duration}ms`,
      _source: "supabase_optimized",
    });

  } catch (e) {
    console.error("[POST /api/sync]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});


// ?? DUAL-WRITE: Apps Script + Supabase en paralelo
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

        // Leer checks del payload (frontend envía ck1/ck2/ck3 o checks.ck1)
        const checks = body.checks || {};
        const ck1 = !!(body.ck1 ?? body.conf_ck1 ?? checks.ck1);
        const ck2 = !!(body.ck2 ?? body.conf_ck2 ?? checks.ck2);
        const ck3 = !!(body.ck3 ?? body.conf_ck3 ?? checks.ck3);

        // Validar que los 3 checks estén marcados
        if (!ck1 || !ck2 || !ck3) {
          return res.json({ ok: false, error: "Debes marcar los 3 checks de conformidad." });
        }

        // Actualizar asignación con estado de conformidad
        const conformidadData = {
          conf_ck1: ck1,
          conf_ck2: ck2,
          conf_ck3: ck3,
          conf_ts: new Date().toISOString(),
          conf_by: body.email || userId,
        };

        // Guardar tanque/reductor registrado según el tipo de equipo
        const equipoTipo = String(body.equipoTipo || "").trim().toUpperCase();
        const equipoCodigo = String(body.equipoCodigo || "").trim().toUpperCase();
        if (equipoCodigo) {
          if (equipoTipo === "TANQUE") {
            conformidadData.tanque_registrado = equipoCodigo;
          } else if (equipoTipo === "REDUCTOR") {
            conformidadData.reductor_registrado = equipoCodigo;
          }
        }

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
    const t1 = Date.now();

    // ?? LECTURA DIRECTA DE SUPABASE: t�cnicos activos
    let query = `${process.env.SUPABASE_URL}/rest/v1/usuarios?`;
    query += `rol=eq.TECNICO&activo=eq.true`;
    query += `&select=id,nombre,email,rol,especialidad,created_at`;
    query += `&order=nombre.asc`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });
    
    if (!res_data.ok) throw new Error(`${res_data.status}`);
    
    const items = await res_data.json();
    const duration = Date.now() - t1;

    return res.json({
      ok: true,
      items,
      count: items.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// SUPABASE WRITE + Drive upload (foto async)
app.post("/api/incidencia", async (req, res) => {
  try {
    console.log("[INCIDENCIA] body =", Object.keys(req.body || {}));

    const body = { ...(req.body || {}) };
    const hasFoto = !!(body.foto && body.foto.b64);

    // Guardar foto payload antes de borrarla
    const fotoPayload = hasFoto ? { ...body.foto } : null;
    delete body.foto;

    // 1) WRITE a Supabase INMEDIATAMENTE (sin esperar Drive)
    let supabaseResult = null;
    try {
      const incidenciaData = {
        fecha_hora: new Date().toISOString(),
        mes: new Date().toISOString().substring(0, 7),
        work_order_id: body.conversionId || null,
        vin: body.vin || null,
        tecnico: body.tecnicoNombre || body.tecnicoEmail || "",
        tipo: body.tipo || "LEVE",
        registrado_por: body.email || body.registrado_por || "",
        nota: body.nota || "",
        foto_file_id: "",
        foto_folder_id: "",
        foto_batch_id: "",
      };

      supabaseResult = await supabasePost_("incidencias", incidenciaData);
    } catch (err) {
      console.error("[INCIDENCIA] Supabase write error:", err.message);
      return res.status(500).json({ ok: false, error: "Error guardando incidencia: " + err.message });
    }

    // Responder al cliente INMEDIATAMENTE
    res.json({ ok: true, saved: true });

    // 2) Si hay foto, subir a Drive en BACKGROUND y actualizar Supabase
    if (hasFoto && supabaseResult) {
      const incId = Array.isArray(supabaseResult) ? supabaseResult[0]?.id : supabaseResult?.id;
      (async () => {
        try {
          const up = await callAppsScript("uploadIncidencia", {
            vin: body.vin,
            conversionId: body.conversionId,
            tipo: body.tipo,
            nota: body.nota,
            tecnico: body.tecnicoNombre || body.tecnicoEmail || body.tecnicoUserId || "",
            file: {
              b64: fotoPayload.b64,
              mimeType: fotoPayload.mimeType || "image/jpeg",
              name: fotoPayload.name || "incidencia.jpg",
            },
          });

          // Actualizar registro en Supabase con metadata de la foto
          if (incId && up?.photoId) {
            await supabasePatch_("incidencias", { id: incId }, {
              foto_file_id: String(up.photoId || ""),
              foto_folder_id: String(up.subFolderId || up.folderId || ""),
              foto_batch_id: String(up.batchId || ""),
            });
            console.log(`[INCIDENCIA] Foto subida y actualizada en Supabase: ${incId}`);
          }
        } catch (err) {
          console.error("[INCIDENCIA] Background Drive upload error:", err.message);
        }
      })();
    }

  } catch (e) {
    console.error("[INCIDENCIA] ERROR:", e);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  }
});

// endpoint Node ? Supabase (incidencias list) - LECTURA SOLO + TIMING
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

    // ?? LECTURA DESDE SUPABASE
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
    const driveUrls = (fileId) => {
      if (!fileId) return { url: "", thumbUrl: "", imgUrl: "" };
      return {
        url: "https://drive.google.com/file/d/" + fileId + "/view",
        thumbUrl: "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w400",
        imgUrl: "https://drive.google.com/uc?export=view&id=" + fileId,
      };
    };
    const items = incidencias
      .slice(0, limit)
      .map(inc => {
        const urls = driveUrls(inc.foto_file_id);
        return {
          id: inc.id,
          fecha: inc.fecha_hora,
          fecha_hora: inc.fecha_hora,
          vin: inc.vin,
          tipo: inc.tipo,
          tecnico: inc.tecnico || "",
          nota: inc.nota || "",
          registrado_por: inc.registrado_por || "",
          fotoFileId: inc.foto_file_id || "",
          fotoUrl: urls.url,
          fotoThumbUrl: urls.thumbUrl,
          fotoImgUrl: urls.imgUrl,
          fotoFolderId: inc.foto_folder_id || "",
          fotoBatchId: inc.foto_batch_id || "",
        };
      });
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

// -----------------------------------------------------------------
// ? ENDPOINTS OPTIMIZADOS SUPABASE (queries ultra-r�pidas)
// -----------------------------------------------------------------

// 1?? GET /api/asignaciones-activas � Por rol (MOTOR, TANQUE, CALIDAD)
app.get("/api/asignaciones-activas", async (req, res) => {
  try {
    const rol = String(req.query.rol || "MOTOR").toUpperCase();
    const t1 = Date.now();

    // Obt�n asignaciones ACTIVAS por rol (ENUM = super r�pido)
    let query = `${process.env.SUPABASE_URL}/rest/v1/asignaciones?`;
    query += `rol_trabajo=eq.${rol}&activo=eq.true`;
    query += `&estado_actual=neq.FINALIZADO`;
    query += `&order=running_since.desc&limit=100`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });
    
    if (!res_data.ok) throw new Error(`${res_data.status}`);
    
    const items = await res_data.json();
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
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// 2?? GET /api/work-orders � Por estado + tipo (ENUM filtering)
app.get("/api/work-orders", async (req, res) => {
  try {
    const estado = String(req.query.estado || "EN PROCESO").trim();
    const tipo = String( req.query.tipo || "CONVERSION").toUpperCase();
    const limit = Math.min(parseInt(req.query.limit || "50"), 500);
    const t1 = Date.now();

    let query = `${process.env.SUPABASE_URL}/rest/v1/work_orders?`;
    query += `estado_general=eq.${encodeURIComponent(estado)}&tipo_ot=eq.${tipo}`;
    query += `&select=*,asignaciones(*)&order=created_at.desc&limit=${limit}`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });
    
    if (!res_data.ok) throw new Error(`${res_data.status}`);
    
    const items = await res_data.json();
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
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// 3?? GET /api/eventos � Timeline (�ltimas X horas)
app.get("/api/eventos", async (req, res) => {
  try {
    const horasAtras = Math.min(parseInt(req.query.horas || "24"), 365 * 24);
    const limit = Math.min(parseInt(req.query.limit || "50"), 500);
    const t1 = Date.now();

    const sinceDate = new Date();
    sinceDate.setHours(sinceDate.getHours() - horasAtras);

    let query = `${process.env.SUPABASE_URL}/rest/v1/eventos?`;
    query += `timestamp=gte.${sinceDate.toISOString()}`;
    query += `&select=*,usuarios(*),work_orders(vin,tipo_ot)`;
    query += `&order=timestamp.desc&limit=${limit}`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });
    
    if (!res_data.ok) throw new Error(`${res_data.status}`);
    
    const items = await res_data.json();
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
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// 4?? GET /api/usuarios-activos � Con m�dulos
app.get("/api/usuarios-activos", async (req, res) => {
  try {
    const t1 = Date.now();

    let query = `${process.env.SUPABASE_URL}/rest/v1/usuarios?`;
    query += `activo=eq.true&select=id,email,nombre,rol,especialidad,usuario_modulos(modulo)`;
    query += `&order=nombre.asc`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });
    
    if (!res_data.ok) throw new Error(`${res_data.status}`);
    
    const usuarios = await res_data.json();
    const duration = Date.now() - t1;

    // Transforma lookup en array
    const items = usuarios.map(u => ({
      ...u,
      modulos: u.usuario_modulos?.map(m => m.modulo) || [],
    }));

    return res.json({
      ok: true,
      items,
      count: items.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    console.error("[GET /api/usuarios-activos]", e.message);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// 5?? GET /api/search/incidencias � B�squeda LIKE
app.get("/api/search/incidencias", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    if (q.length < 2) {
      return res.json({ ok: true, items: [], message: "M�nimo 2 caracteres" });
    }

    const t1 = Date.now();

    let query = `${process.env.SUPABASE_URL}/rest/v1/incidencias?`;
    query += `nota=ilike.%${encodeURIComponent(q)}%`;
    query += `&select=id,fecha_hora,vin,tipo,nota,tecnico,registrado_por`;
    query += `&order=fecha_hora.desc&limit=100`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });
    
    if (!res_data.ok) throw new Error(`${res_data.status}`);
    
    const items = await res_data.json();
    const duration = Date.now() - t1;

    return res.json({
      ok: true,
      items,
      count: items.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    console.error("[GET /api/search/incidencias]", e.message);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// -----------------------------------------------------------------
// SOLICITUDES RAMAL
// -----------------------------------------------------------------

// POST /api/solicitud-ramal  — el técnico MOTOR crea una solicitud
app.post("/api/solicitud-ramal", async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const vin   = String(body.vin   || "").trim().toUpperCase();
    const conversionId = String(body.conversionId || "").trim();
    const nota  = String(body.nota  || "").trim();

    if (!email) return res.status(400).json({ ok: false, error: "Falta email" });

    // Validar: solo 1 solicitud PENDIENTE por VIN
    if (vin) {
      const SUPABASE_URL = process.env.SUPABASE_URL;
      const headers = supabaseHeaders_();
      const checkUrl = `${SUPABASE_URL}/rest/v1/solicitudes_ramal?vin=eq.${encodeURIComponent(vin)}&estado=eq.PENDIENTE&limit=1`;
      const checkRes = await fetch(checkUrl, { method: "GET", headers });
      if (checkRes.ok) {
        const existing = await checkRes.json();
        if (Array.isArray(existing) && existing.length > 0) {
          return res.status(409).json({ ok: false, error: "Ya existe una solicitud pendiente para este VIN", errorType: "DUPLICATE_VIN" });
        }
      }
    }

    // Obtener nombre del técnico
    const usuarios = await supabaseGet_("usuarios", { email });
    const tecnicoNombre = usuarios?.[0]?.nombre || email;

    const data = {
      vin:            vin || null,
      work_order_id:  conversionId || null,
      tecnico_nombre: tecnicoNombre,
      tecnico_email:  email,
      nota,
      estado:         "PENDIENTE",
    };

    const result = await supabasePost_("solicitudes_ramal", data);
    return res.json({ ok: true, item: Array.isArray(result) ? result[0] : result });
  } catch (e) {
    console.error("[POST /api/solicitud-ramal]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/solicitud-ramal/pendientes  — el ramalero lista todas (PENDIENTE + ENTREGADO recientes)
app.get("/api/solicitud-ramal/pendientes", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    // PENDIENTES (todas) + ENTREGADOS de hoy — últimos 100 ordenados por fecha
    const url = `${SUPABASE_URL}/rest/v1/solicitudes_ramal?order=created_at.desc&limit=100`;
    const r = await fetch(url, { method: "GET", headers });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const all = await r.json();
    // Filtrar: pendientes siempre + entregados solo del día de hoy (local)
    const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
    const items = all.filter(s =>
      s.estado === "PENDIENTE" ||
      (s.estado === "ENTREGADO" && (s.entregado_at || s.created_at || "").startsWith(todayStr))
    );
    // Ordenar: pendientes primero, luego entregados; dentro de cada grupo por created_at asc
    items.sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === "PENDIENTE" ? -1 : 1;
      return a.created_at < b.created_at ? -1 : 1;
    });
    return res.json({ ok: true, items });
  } catch (e) {
    console.error("[GET /api/solicitud-ramal/pendientes]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/solicitud-ramal/:id/entregar  — el ramalero marca como entregado
app.post("/api/solicitud-ramal/:id/entregar", async (req, res) => {
  try {
    const id    = String(req.params.id || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!id) return res.status(400).json({ ok: false, error: "Falta id" });

    const usuarios = await supabaseGet_("usuarios", { email });
    const nombre = usuarios?.[0]?.nombre || email;

    await supabasePatch_("solicitudes_ramal", { id }, {
      estado:        "ENTREGADO",
      entregado_at:  new Date().toISOString(),
      entregado_por: nombre,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/solicitud-ramal/:id/entregar]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// -----------------------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`�brelo desde tu celular con: http://192.168.18.121:${PORT}`);
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
