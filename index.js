import express from "express";
import dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";
import webpush from "web-push";
import {
  r2UploadOne,
  r2UploadFalla,
  r2UploadCalidad,
  r2UploadConformidad,
  r2UploadIncidencia,
  r2GetStatus,
  r2DeleteSlot,
  photoUrls,
} from "./r2-uploads.js";

dotenv.config();

// ── Web Push (VAPID) ──────────────────────────────────────────────────────────
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

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
      R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || "",
    })};`
  );
});

// Serve Vite build output if available, otherwise fallback to source
const staticDir = existsSync("dist") ? "dist" : "public";

// Headers especiales para PWA (Service Worker + Manifest)
app.get(["/sw.js", "/sw-custom.js"], (_req, res, next) => {
  res.setHeader("Service-Worker-Allowed", "/");
  res.setHeader("Cache-Control", "no-cache");
  next();
});
app.use((_req, res, next) => {
  if (/^\/workbox-[^/]+\.js$/.test(_req.path)) {
    res.setHeader("Cache-Control", "no-cache");
  }
  if (_req.path === "/manifest.webmanifest") {
    res.setHeader("Content-Type", "application/manifest+json");
  }
  next();
});

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

// OT valida: contiene '#' (ej: #7213) o es puramente numerica (ej: 7213).
// Invalida: formato fecha (02-06), texto libre, vacio.
function isValidOT_(ot) {
  if (!ot) return false;
  const s = String(ot).trim();
  if (!s) return false;
  if (s.includes("#")) return true;
  if (/^\d+$/.test(s)) return true;
  return false;
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

async function supabaseDelete_(table, filter = {}) {
  const headers = supabaseHeaders_();
  if (!headers) throw new Error("Supabase no configurado (.env)");
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const url = `${SUPABASE_URL}/rest/v1/${table}${buildSupabaseQuery_(filter)}`;
  const res = await fetch(url, { method: "DELETE", headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase DELETE ${table}: ${res.status} ${text.slice(0, 200)}`);
  }
}

// =========================
// =========================
// UPLOADER → Cloudflare R2  (reemplaza Apps Script / Google Drive)
// =========================
const R2_ACTIONS = new Set(["getStatus", "uploadOne", "uploadFalla", "uploadCalidad", "uploadConformidad", "deleteSlot"]);

app.post("/api/uploader/proxy", async (req, res) => {
  try {
    const body   = req.body || {};
    const action = String(body.action || "").trim();
    const { action: _omit, ...payload } = body;

    console.log("[R2_UPLOADER] action:", action);

    if (!R2_ACTIONS.has(action)) {
      return res.status(400).json({ ok: false, error: "Acción no permitida" });
    }

    let result;
    switch (action) {
      case "getStatus":
        result = await r2GetStatus(payload);
        break;
      case "uploadOne":
        result = await r2UploadOne(payload);
        break;
      case "uploadFalla":
        result = await r2UploadFalla(payload);
        break;
      case "uploadCalidad":
        result = await r2UploadCalidad(payload);
        break;
      case "uploadConformidad":
        result = await r2UploadConformidad(payload);
        break;
      case "deleteSlot":
        result = await r2DeleteSlot(payload);
        break;
      default:
        return res.status(400).json({ ok: false, error: "Acción desconocida" });
    }

    return res.json(result);
  } catch (e) {
    console.error("[R2_UPLOADER] ERROR:", e.message);
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
    query += `&order=updated_at.desc&limit=5000`;

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

    // 9b. Verificar omisión al hacer INICIO (fire-and-forget, no bloquea respuesta)
    if (accion === "INICIO" && (rolTrabajo === "MOTOR" || rolTrabajo === "TANQUE")) {
      const nombreTech = usuarios[0]?.nombre || email;
      checkAndRecordOmision_(userId, nombreTech, rolTrabajo, workOrderId, vin).catch(() => {});
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

        const woPatch = { estado_general: estadoGeneral };
        // Registrar fecha en que el último técnico (motor o tanque) finalizó.
        // Solo se escribe la primera vez (cuando transiciona a FINALIZADO).
        if (estadoGeneral === "FINALIZADO") {
          woPatch.fecha_sin_calidad = new Date().toISOString();
        }
        await supabasePatch_("work_orders", { id: workOrderId }, woPatch);
        console.log(`[EVENTO] estado_general actualizado: ${estadoGeneral} (motor=${motor}, tanque=${tanque})`);
      } catch (err) {
        console.warn("[EVENTO] No se pudo actualizar estado_general:", err.message);
      }
    }

    // 10b. Actualizar estado_general del work_order para OTs de CALIDAD
    if (rolTrabajo === "CALIDAD" && tipoOt === "CALIDAD") {
      try {
        const estadoGeneral = nuevoEstado === "FINALIZADO" ? "FINALIZADO"
          : nuevoEstado === "PAUSADO" ? "EN PROCESO"
          : nuevoEstado === "EN PROCESO" ? "EN PROCESO"
          : "PENDIENTE";
        await supabasePatch_("work_orders", { id: workOrderId }, { estado_general: estadoGeneral });
        console.log(`[EVENTO] CALIDAD estado_general actualizado: ${estadoGeneral}`);
      } catch (err) {
        console.warn("[EVENTO] No se pudo actualizar estado_general CALIDAD:", err.message);
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

  // Calcular fecha efectiva de inicio (para cross-day logic)
  let effectiveFrom = from;
  let effectiveTo = to;
  if (!effectiveFrom && month) {
    effectiveFrom = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    effectiveTo = effectiveTo || `${month}-${String(lastDay).padStart(2, "0")}`;
  }
  // Fecha actual en hora Perú (UTC-5) para que "hoy" coincida con el horario local
  const todayStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());

  // ¿Es un rango puramente histórico? (el día final es antes de hoy)
  // Si es histórico → usamos fecha de CIERRE (updated_at) como criterio de producción.
  // Si es hoy o el rango incluye hoy → comportamiento LIVE (fecha de inicio + cross-day).
  const effectiveToForCheck = effectiveTo || (effectiveFrom ? effectiveFrom : todayStr);
  const isHistorical = !!(effectiveFrom) && effectiveToForCheck < todayStr;

  // Campo select compartido
  const selectFields =
    `id,work_order_id,user_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,fecha_asignacion,updated_at,last_nota,activo,` +
    `usuarios(id,nombre,email),` +
    `work_orders(id,vin,tipo_ot,tipo_ramal,fecha_creacion,estado_general)`;

  // ── Límites UTC equivalentes a un día en hora Perú (UTC-5, sin DST) ────────
  // Medianoche Lima = 05:00 UTC ; fin del día Lima = 04:59:59 UTC del día siguiente
  function _peruDayStart_(d) { return `${d}T05:00:00`; }
  function _peruDayEnd_(d) {
    const dt = new Date(d + "T12:00:00");
    dt.setDate(dt.getDate() + 1);
    return `${dt.toISOString().slice(0, 10)}T04:59:59`;
  }

  let urlMain, urlCrossFin = null, urlCrossActive = null;

  if (isHistorical) {
    // ── MODO HISTÓRICO: producción por fecha de cierre ──────────────────────
    // Filtramos updated_at con límites en hora Perú para no perder items
    // finalizados entre las 7 PM y medianoche Lima (cuyo UTC ya es el día siguiente).
    const toDay = effectiveTo || effectiveFrom;
    urlMain = `${SUPABASE_URL}/rest/v1/asignaciones?` +
      `select=${selectFields}` +
      `&${tipoOtFilter}` +
      `&activo=eq.true` +
      `&estado_actual=eq.FINALIZADO` +
      `&updated_at=gte.${_peruDayStart_(effectiveFrom)}` +
      `&updated_at=lte.${_peruDayEnd_(toDay)}` +
      `&order=updated_at.desc`;
    // No Q2 ni Q5: ya están incluidos en Q1 por el filtro updated_at
  } else {
    // ── MODO HOY / RANGO ACTUAL: igual que LIVE ──────────────────────────────
    // Q1: asignaciones iniciadas dentro del rango (límites en hora Perú)
    urlMain = `${SUPABASE_URL}/rest/v1/asignaciones?` +
      `select=${selectFields}` +
      `&${tipoOtFilter}` +
      `&activo=eq.true`;

    if (effectiveFrom) urlMain += `&fecha_asignacion=gte.${_peruDayStart_(effectiveFrom)}`;
    if (effectiveTo)   urlMain += `&fecha_asignacion=lte.${_peruDayEnd_(effectiveTo)}`;
    if (month && !from && !to) {
      urlMain += `&fecha_asignacion=gte.${month}-01T05:00:00`;
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const lastDayStr = `${month}-${String(lastDay).padStart(2, "0")}`;
      urlMain += `&fecha_asignacion=lte.${_peruDayEnd_(lastDayStr)}`;
    }
    urlMain += `&order=updated_at.desc`;

    // Q2: finalizados dentro del rango pero iniciados ANTES (cross-day fin)
    // Usamos límite Perú: items que terminen entre las 7 PM-medianoche Lima
    // tienen UTC del día siguiente, por eso la frontera es T05:00:00.
    if (effectiveFrom) {
      urlCrossFin = `${SUPABASE_URL}/rest/v1/asignaciones?` +
        `select=${selectFields}` +
        `&${tipoOtFilter}` +
        `&activo=eq.true` +
        `&estado_actual=eq.FINALIZADO` +
        `&updated_at=gte.${_peruDayStart_(effectiveFrom)}` +
        `&fecha_asignacion=lt.${_peruDayStart_(effectiveFrom)}` +
        `&order=updated_at.desc`;
      if (effectiveTo) urlCrossFin += `&updated_at=lte.${_peruDayEnd_(effectiveTo)}`;
    }

    // Q5: aún activos pero iniciados ANTES del rango (cross-day activo)
    if (effectiveFrom) {
      urlCrossActive = `${SUPABASE_URL}/rest/v1/asignaciones?` +
        `select=${selectFields}` +
        `&${tipoOtFilter}` +
        `&activo=eq.true` +
        `&estado_actual=in.(TRABAJANDO,PAUSADO,SIN_INICIAR)` +
        `&fecha_asignacion=lt.${_peruDayStart_(effectiveFrom)}` +
        `&order=updated_at.desc`;
    }
  }

  // Q_histStart: en modo histórico + búsqueda de técnico específico, traer también
  // los items que EMPEZARON en el rango pero terminaron FUERA de él (o siguen activos).
  // Estos son los "½ carro del día de inicio" que el frontend pesa como 0.5.
  // Filtro: fecha_asignacion en rango Y (no FINALIZADO O updated_at > fin del rango).
  let urlHistStart = null;
  if (isHistorical && q && effectiveFrom) {
    const toDay = effectiveTo || effectiveFrom;
    const rangeEnd = _peruDayEnd_(toDay);
    urlHistStart = `${SUPABASE_URL}/rest/v1/asignaciones?` +
      `select=${selectFields}` +
      `&${tipoOtFilter}` +
      `&activo=eq.true` +
      `&fecha_asignacion=gte.${_peruDayStart_(effectiveFrom)}` +
      `&fecha_asignacion=lte.${rangeEnd}` +
      `&or=(estado_actual.neq.FINALIZADO,updated_at.gt.${rangeEnd})` +
      `&order=updated_at.desc`;
  }

  const fetches = [
    fetch(urlMain, { method: "GET", headers }),
    urlCrossFin    ? fetch(urlCrossFin,    { method: "GET", headers }) : Promise.resolve(null),
    urlCrossActive ? fetch(urlCrossActive, { method: "GET", headers }) : Promise.resolve(null),
    urlHistStart   ? fetch(urlHistStart,   { method: "GET", headers }) : Promise.resolve(null),
  ];

  const [resp, respCrossFin, respCrossActive, respHistStart] = await Promise.all(fetches);

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("[SUPERVISOR_REPORT] Supabase error:", resp.status, text.slice(0, 300));
    return res.status(500).json({ ok: false, error: `Supabase: ${resp.status}` });
  }

  const [rawMain, rawCrossFin, rawCrossActive, rawHistStart] = await Promise.all([
    resp.json(),
    respCrossFin    ? respCrossFin.json().catch(() => [])    : [],
    respCrossActive ? respCrossActive.json().catch(() => []) : [],
    respHistStart   ? respHistStart.json().catch(() => [])   : [],
  ]);

  // Merge deduplicando por id; marcar cross-day
  // - Histórico Q1: items cerrados dentro del rango (_crossDay: false)
  // - Histórico Q_histStart: items iniciados en el rango pero cerrados fuera (_crossDay: true → ½ carro)
  // - Live Q2/Q5: cross-day clásico
  const seenIds = new Set();
  const raw = [];
  for (const asg of (rawMain || [])) {
    if (!seenIds.has(asg.id)) { seenIds.add(asg.id); raw.push({ ...asg, _crossDay: false }); }
  }
  if (isHistorical) {
    for (const asg of (rawHistStart || [])) {
      if (!seenIds.has(asg.id)) { seenIds.add(asg.id); raw.push({ ...asg, _crossDay: true }); }
    }
  } else {
    for (const asg of [...(rawCrossFin || []), ...(rawCrossActive || [])]) {
      if (!seenIds.has(asg.id)) { seenIds.add(asg.id); raw.push({ ...asg, _crossDay: true }); }
    }
  }

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
      // Cross-day flag: started before range start, finalized/active within range
      crossDay: asg._crossDay === true,
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
  console.log(`[SUPERVISOR_REPORT] ${track} ${isHistorical ? "HISTÓRICO(updated_at)" : "HOY(fecha_asignacion)"}: ${items.length} items en ${duration}ms`);

  return res.json({ ok: true, items, count: items.length, isHistorical, _timing: `${duration}ms`, _source: "supabase" });
}

// =========================
// SUPERVISOR LIVE (resumen en tiempo real de técnicos del día)
// =========================
app.get("/api/supervisor/live", async (req, res) => {
  try {
    const t1 = Date.now();
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // Fecha actual en hora Perú (UTC-5) para que el LIVE funcione hasta medianoche local
    const todayStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
    const thirtyDaysAgo = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" })
      .format(new Date(Date.now() - 30 * 24 * 3600 * 1000));

    const selectFields =
      `id,work_order_id,user_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,fecha_asignacion,updated_at,activo,` +
      `usuarios!inner(id,nombre,email),` +
      `work_orders(id,vin,tipo_ramal,tipo_ot,estado_general)`;

    // Q1: Asignaciones creadas hoy (activas o no)
    let url1 = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}&activo=eq.true&fecha_asignacion=gte.${todayStr}T00:00:00&order=updated_at.desc`;

    // Q2: Trabajos de días anteriores finalizados HOY (cross-day: ½ carro)
    let url2 = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}&estado_actual=eq.FINALIZADO&updated_at=gte.${todayStr}T00:00:00&fecha_asignacion=lt.${todayStr}T00:00:00&order=updated_at.desc`;

    // Q3: Todos los usuarios activos con rol técnico (para mostrar DESCONECTADO)
    const url3 = `${SUPABASE_URL}/rest/v1/usuarios?select=id,nombre,email,rol,especialidad&activo=eq.true&rol=in.(TECNICO,CALIDAD,RAMALERO)&order=nombre.asc`;

    // Q4: Última asignación reciente por usuario (para rol_trabajo de TECNICO AMBOS)
    const url4 = `${SUPABASE_URL}/rest/v1/asignaciones?select=user_id,rol_trabajo,updated_at&fecha_asignacion=gte.${thirtyDaysAgo}T00:00:00&order=updated_at.desc&limit=2000`;

    // Q5: Trabajos de días anteriores que siguen ACTIVOS hoy ("virtual" — en progreso, no finalizados)
    const url5 = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}&activo=eq.true&estado_actual=in.(TRABAJANDO,PAUSADO,SIN_INICIAR)&fecha_asignacion=lt.${todayStr}T00:00:00&order=updated_at.desc`;

    // Q6: Metas diarias (META_DIARIA, META_CALIDAD) desde app_config
    const url6 = `${SUPABASE_URL}/rest/v1/app_config?select=key,value&key=in.(META_DIARIA,META_CALIDAD,META_CONVERSION)`;

    const [resp1, resp2, resp3, resp4, resp5, resp6] = await Promise.all([
      fetch(url1, { method: "GET", headers }),
      fetch(url2, { method: "GET", headers }),
      fetch(url3, { method: "GET", headers }),
      fetch(url4, { method: "GET", headers }),
      fetch(url5, { method: "GET", headers }),
      fetch(url6, { method: "GET", headers }).catch(() => null),
    ]);
    if (!resp1.ok) {
      const text = await resp1.text().catch(() => "");
      throw new Error(`Supabase Q1: ${resp1.status} ${text.slice(0, 200)}`);
    }
    const [raw1, raw2, allUsers, recentAsg, raw5, cfgRows] = await Promise.all([
      resp1.json(),
      resp2.json().catch(() => []),
      resp3.json().catch(() => []),
      resp4.json().catch(() => []),
      resp5.json().catch(() => []),
      resp6 && resp6.ok ? resp6.json().catch(() => []) : Promise.resolve([]),
    ]);
    const _cfgMap = {};
    (cfgRows || []).forEach(r => { _cfgMap[r.key] = r.value; });
    // META_DIARIA = objetivo grupal diario (Live). Fallback a META_CONVERSION por compatibilidad.
    const metaConv = Number(_cfgMap.META_DIARIA || _cfgMap.META_CONVERSION) || 25;
    const metaCal  = Number(_cfgMap.META_CALIDAD) || 22;

    // Mapa: user_id → último rol_trabajo conocido (para TECNICO AMBOS)
    const lastRolMap = new Map();
    for (const a of (recentAsg || [])) {
      if (a.user_id && a.rol_trabajo && !lastRolMap.has(a.user_id)) {
        lastRolMap.set(a.user_id, a.rol_trabajo);
      }
    }

    // Rol_trabajo por defecto según perfil del usuario
    function defaultRolTrabajo_(u) {
      if (u.rol === "CALIDAD")   return "CALIDAD";
      if (u.rol === "RAMALERO")  return "RAMALERO";
      if (u.rol === "TECNICO") {
        if (u.especialidad === "MOTOR")  return "MOTOR";
        if (u.especialidad === "TANQUE") return "TANQUE";
        // AMBOS: usar último rol conocido, si no MOTOR por defecto
        return lastRolMap.get(u.id) || "MOTOR";
      }
      return null; // otros roles no se muestran
    }

    // Merge deduplicando por id:
    // raw1 = hoy activos, raw2 = cross-day FINALIZADO hoy, raw5 = cross-day aún ACTIVOS (virtual)
    const seenIds = new Set();
    const raw = [];
    for (const asg of [...(raw1 || []), ...(raw2 || []), ...(raw5 || [])]) {
      if (!seenIds.has(asg.id)) { seenIds.add(asg.id); raw.push(asg); }
    }

    // ── VIN-level summary: CONVERSION = MOTOR+TANQUE ambos FINALIZADO; CALIDAD = CALIDAD FINALIZADO ──
    const vinConv = {}; // vin → { motorFin, tanqueFin, hasActive }
    const vinCal  = {}; // vin → { done, active }
    for (const asg of raw) {
      const wo     = Array.isArray(asg.work_orders) ? asg.work_orders[0] : (asg.work_orders || {});
      const vin    = wo.vin || "";
      if (!vin) continue;
      const tipoOt = (asg.tipo_ot || "").toUpperCase();
      const rol    = (asg.rol_trabajo || "").toUpperCase();
      const done   = asg.estado_actual === "FINALIZADO";
      if (tipoOt === "CONVERSION") {
        if (!vinConv[vin]) vinConv[vin] = { motorFin: false, tanqueFin: false, hasActive: false };
        if (rol === "MOTOR")  { if (done) vinConv[vin].motorFin  = true; else vinConv[vin].hasActive = true; }
        if (rol === "TANQUE") { if (done) vinConv[vin].tanqueFin = true; else vinConv[vin].hasActive = true; }
      } else if (tipoOt === "CALIDAD") {
        if (!vinCal[vin])  vinCal[vin] = { done: false, active: false };
        if (done) vinCal[vin].done = true; else vinCal[vin].active = true;
      }
    }
    const convDone   = Object.values(vinConv).filter(v => v.motorFin && v.tanqueFin).length;
    const convActive = Object.values(vinConv).filter(v => !(v.motorFin && v.tanqueFin)).length;
    const calDone    = Object.values(vinCal).filter(v => v.done).length;
    const calActive  = Object.values(vinCal).filter(v => v.active && !v.done).length;
    const vinsSummary = { convDone, convActive, calDone, calActive, metaConv, metaCal };

    // 2. Agrupar por user_id + rol_trabajo
    const techMap = new Map();
    for (const asg of (raw || [])) {
      const user = Array.isArray(asg.usuarios) ? asg.usuarios[0] : (asg.usuarios || {});
      const wo   = Array.isArray(asg.work_orders) ? asg.work_orders[0] : (asg.work_orders || {});
      const key  = `${asg.user_id}__${asg.rol_trabajo}`;

      if (!techMap.has(key)) {
        techMap.set(key, {
          userId: asg.user_id,
          nombre: user.nombre || "",
          email: user.email || "",
          rol: asg.rol_trabajo || "",
          assignments: [],
        });
      }

      techMap.get(key).assignments.push({
        id: asg.id,
        vin: wo.vin || "",
        tipo_ramal: wo.tipo_ramal || "",
        tipo_ot: asg.tipo_ot || "",
        estado: asg.estado_actual,
        tiempo_ms: asg.tiempo_trab_ms || 0,
        running_since: asg.running_since,
        updated_at: asg.updated_at,
        fecha_asignacion: asg.fecha_asignacion,
        work_order_id: asg.work_order_id,
      });
    }

    // 3. Construir resultado por técnico
    const estadoOrder = { "TRABAJANDO": 0, "PAUSADO": 1, "SIN_INICIAR": 2, "FINALIZADO": 3, "DESCONECTADO": 9 };
    const techs = [];

    for (const tech of techMap.values()) {
      const asgList = tech.assignments;
      const finalizados = asgList.filter(a => a.estado === "FINALIZADO");
      const activos     = asgList.filter(a => a.estado !== "FINALIZADO");

      // El VIN/estado activo actual (el más reciente no finalizado)
      const current = [...activos].sort((a, b) =>
        new Date(b.updated_at) - new Date(a.updated_at)
      )[0] || null;

      // carsHoy: trabajos finalizados contando 0.5 si empezaron un día anterior
      const carsHoy = finalizados.reduce((sum, a) => {
        const d = (a.fecha_asignacion || "").slice(0, 10);
        return sum + (d < todayStr ? 0.5 : 1.0);
      }, 0);

      // virtualHoy: trabajos aún en progreso (no finalizados) — incluye cross-day activos
      const virtualHoy = activos.length;

      techs.push({
        userId: tech.userId,
        nombre: tech.nombre,
        email: tech.email,
        rol: tech.rol,
        vinActivo: current?.vin || "",
        estadoActivo: current?.estado || (finalizados.length > 0 ? "FINALIZADO" : "SIN_ACTIVIDAD"),
        totalHoy: asgList.length,
        finalizadosHoy: finalizados.length,
        activosHoy: activos.length,
        carsHoy,
        virtualHoy,
        vinsHoy: [...new Set(asgList.map(a => a.vin).filter(Boolean))],
        asignacionesHoy: asgList,
      });
    }

    // 4. Agregar usuarios DESCONECTADO (activos pero sin actividad hoy)
    const seenUserRols = new Set(Array.from(techMap.keys())); // "userId__rol"
    for (const u of (allUsers || [])) {
      const rol = defaultRolTrabajo_(u);
      if (!rol) continue;
      const key = `${u.id}__${rol}`;
      if (seenUserRols.has(key)) continue; // ya tiene actividad hoy
      techs.push({
        userId: u.id,
        nombre: u.nombre || "",
        email: u.email || "",
        rol,
        vinActivo: "",
        estadoActivo: "DESCONECTADO",
        totalHoy: 0,
        finalizadosHoy: 0,
        activosHoy: 0,
        carsHoy: 0,
        vinsHoy: [],
        asignacionesHoy: [],
      });
    }

    // Ordenar: TRABAJANDO → PAUSADO → SIN_INICIAR → FINALIZADO → otros; luego por nombre
    techs.sort((a, b) => {
      const oa = estadoOrder[a.estadoActivo] ?? 8;
      const ob = estadoOrder[b.estadoActivo] ?? 8;
      if (oa !== ob) return oa - ob;
      return (a.nombre || "").localeCompare(b.nombre || "");
    });

    const duration = Date.now() - t1;
    return res.json({ ok: true, techs, fecha: todayStr, vinsSummary, _timing: `${duration}ms` });
  } catch (e) {
    console.error("[GET /api/supervisor/live]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

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

// =========================
// FIN PREREQUISITES — valida antes de finalizar OT
// POST /api/fin-prerequisites
// Body: { vin, rol, workOrderId, dateStr }
// Returns: { ok, canFin, blockers: string[] }
// =========================
app.post("/api/fin-prerequisites", async (req, res) => {
  try {
    const { vin, rol, workOrderId, dateStr } = req.body || {};
    const rolUp = String(rol || "").trim().toUpperCase();
    const blockers = [];

    // Solo aplica a MOTOR y TANQUE
    if (rolUp !== "MOTOR" && rolUp !== "TANQUE") {
      return res.json({ ok: true, canFin: true, blockers: [] });
    }

    // 1) Conformidad de equipos
    if (workOrderId) {
      try {
        const wos = await supabaseGet_("work_orders", { id: workOrderId });
        const wo = wos?.[0] || {};

        if (rolUp === "TANQUE" && !wo.tanque_registrado) {
          blockers.push("Falta registrar la serie del TANQUE (Conformidad equipo → TANQUE).");
        }

        if (rolUp === "MOTOR" && !wo.reductor_registrado) {
          blockers.push("Falta registrar la serie del REDUCTOR (Conformidad equipo → REDUCTOR).");
        }
      } catch (e) {
        console.warn("[FIN-PREREQ] Error consultando work_order:", e.message);
      }
    }

    // 2) Fotos de soldadura en R2
    if (vin) {
      // Usar siempre hora Lima para evitar desfase UTC vs Peru (bug al finalizar después de 7 PM)
      const limaToday = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
      // Mes anterior como fallback: trabajos iniciados el último día del mes previo
      const prevMonthDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
      prevMonthDate.setDate(0); // día 0 = último día del mes anterior
      const limaPrev = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-${String(prevMonthDate.getDate()).padStart(2, "0")}`;

      try {
        const [r2Cur, r2Prev] = await Promise.all([
          r2GetStatus({ vin, dateStr: limaToday }),
          r2GetStatus({ vin, dateStr: limaPrev }),
        ]);
        // Combinar: foto presente en cualquiera de los dos meses cuenta
        const s = {};
        for (const key of Object.keys(r2Cur.status || {})) {
          s[key] = !!(r2Cur.status[key] || (r2Prev.status || {})[key]);
        }

        if (rolUp === "MOTOR") {
          if (!s.sold_cabina_antes || !s.sold_cabina_post) {
            blockers.push("Falta registrar fotos de soldadura de CABINA (antes y después).");
          }
        }

        if (rolUp === "TANQUE") {
          if (!s.sold_sensor_antes || !s.sold_sensor_post) {
            blockers.push("Falta registrar fotos de soldadura del SENSOR DE NIVEL (antes y después).");
          }
        }
      } catch (e) {
        console.warn("[FIN-PREREQ] Error consultando R2 status:", e.message);
      }
    }

    return res.json({
      ok: true,
      canFin: blockers.length === 0,
      blockers,
    });
  } catch (e) {
    console.error("[POST /api/fin-prerequisites]", e.message);
    res.status(500).json({ ok: false, canFin: true, blockers: [], error: String(e.message || e) });
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

    // 2) Si hay foto, subir a R2 en BACKGROUND y actualizar Supabase
    if (hasFoto && supabaseResult) {
      const incId = Array.isArray(supabaseResult) ? supabaseResult[0]?.id : supabaseResult?.id;
      (async () => {
        try {
          const up = await r2UploadIncidencia({
            vin:  body.vin,
            tipo: body.tipo,
            file: {
              b64:      fotoPayload.b64,
              mimeType: fotoPayload.mimeType || "image/jpeg",
            },
          });

          if (incId && up?.photoId) {
            await supabasePatch_("incidencias", { id: incId }, {
              foto_file_id:   String(up.photoId || ""),  // clave R2
              foto_folder_id: "",
              foto_batch_id:  String(up.batchId || ""),
            });
            console.log(`[INCIDENCIA] Foto subida a R2 y actualizada: ${incId}`);
          }
        } catch (err) {
          console.error("[INCIDENCIA] R2 upload error:", err.message);
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

// endpoint: mis incidencias por email (vista TECNICO)
app.get("/api/incidencias/by-tecnico", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const days  = Math.min(Number(req.query.days || 90), 365);
    if (!email) return res.status(400).json({ ok: false, error: "Falta email" });

    // 1) Obtener nombre del técnico desde tabla usuarios
    const usuarios = await supabaseGet_("usuarios", { email });
    const nombre = String(usuarios?.[0]?.nombre || "").trim();
    if (!nombre) return res.json({ ok: true, items: [], nombre: "" });

    // 2) Incidencias de los últimos `days` días
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

    // supabaseGet_ solo soporta eq., construimos la URL directamente para gte
    const headers = supabaseHeaders_();
    if (!headers) throw new Error("Supabase no configurado (.env)");
    const qUrl = `${process.env.SUPABASE_URL}/rest/v1/incidencias`
      + `?tecnico=eq.${encodeURIComponent(nombre)}`
      + `&fecha_hora=gte.${encodeURIComponent(since)}`
      + `&order=fecha_hora.desc&limit=500`;
    const qRes = await fetch(qUrl, { method: "GET", headers });
    if (!qRes.ok) {
      const t = await qRes.text().catch(() => "");
      throw new Error(`Supabase incidencias: ${qRes.status} ${t.slice(0, 200)}`);
    }
    const rows = await qRes.json();

    const items = rows
      .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora))
      .map(inc => {
        const urls = photoUrls(inc.foto_file_id);
        return {
          id:            inc.id,
          fecha:         inc.fecha_hora,
          fecha_hora:    inc.fecha_hora,
          vin:           inc.vin,
          tipo:          inc.tipo,
          tecnico:       inc.tecnico || "",
          nota:          inc.nota || "",
          registrado_por: inc.registrado_por || "",
          fotoFileId:    inc.foto_file_id || "",
          fotoUrl:       urls.url,
          fotoThumbUrl:  urls.thumbUrl,
          fotoImgUrl:    urls.imgUrl,
        };
      });

    return res.json({ ok: true, items, nombre });
  } catch (e) {
    console.error("[GET /api/incidencias/by-tecnico]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
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
    const items = incidencias
      .slice(0, limit)
      .map(inc => {
        const urls = photoUrls(inc.foto_file_id);  // R2 si key tiene "/", Drive si no
        return {
          id: inc.id,
          fecha: inc.fecha_hora,
          fecha_hora: inc.fecha_hora,
          vin: inc.vin,
          tipo: inc.tipo,
          tecnico: inc.tecnico || "",
          nota: inc.nota || "",
          registrado_por: inc.registrado_por || "",
          fotoFileId:   inc.foto_file_id || "",
          fotoUrl:      urls.url,
          fotoThumbUrl: urls.thumbUrl,
          fotoImgUrl:   urls.imgUrl,
          fotoFolderId: inc.foto_folder_id || "",
          fotoBatchId:  inc.foto_batch_id  || "",
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
// GET /api/incidencias/report — reporte global con resumen
// -----------------------------------------------------------------
app.get("/api/incidencias/report", async (req, res) => {
  try {
    const from  = String(req.query.from  || "").trim();   // YYYY-MM-DD
    const to    = String(req.query.to    || "").trim();   // YYYY-MM-DD
    const month = String(req.query.month || "").trim();   // YYYY-MM
    const tipo  = String(req.query.tipo  || "ALL").toUpperCase(); // LEVE|MODERADA|CRITICA|ALL
    const q     = String(req.query.q     || "").trim().toLowerCase();
    const limit = Math.min(Number(req.query.limit || 1000), 2000);

    const headers = supabaseHeaders_();
    if (!headers) throw new Error("Supabase no configurado (.env)");

    // Build date filter
    let dateFrom = "", dateTo = "";
    if (month) {
      dateFrom = `${month}-01T00:00:00.000Z`;
      // Last day of month
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      dateTo = `${month}-${String(lastDay).padStart(2,"0")}T23:59:59.999Z`;
    } else if (from || to) {
      if (from) dateFrom = `${from}T00:00:00.000Z`;
      if (to)   dateTo   = `${to}T23:59:59.999Z`;
    }

    let qUrl = `${process.env.SUPABASE_URL}/rest/v1/incidencias?order=fecha_hora.desc&limit=${limit}`;
    if (dateFrom) qUrl += `&fecha_hora=gte.${encodeURIComponent(dateFrom)}`;
    if (dateTo)   qUrl += `&fecha_hora=lte.${encodeURIComponent(dateTo)}`;
    if (tipo !== "ALL") qUrl += `&tipo=eq.${encodeURIComponent(tipo)}`;

    const t1 = Date.now();
    const qRes = await fetch(qUrl, { method: "GET", headers });
    if (!qRes.ok) {
      const t = await qRes.text().catch(() => "");
      throw new Error(`Supabase incidencias: ${qRes.status} ${t.slice(0,200)}`);
    }
    let rows = await qRes.json();
    const queryMs = Date.now() - t1;

    // Text filter (nota or vin or tecnico)
    if (q) {
      rows = rows.filter(r =>
        String(r.nota || "").toLowerCase().includes(q) ||
        String(r.vin  || "").toLowerCase().includes(q) ||
        String(r.tecnico || "").toLowerCase().includes(q)
      );
    }

    // Map items
    const items = rows.map(inc => {
      const urls = photoUrls(inc.foto_file_id);
      return {
        id:             inc.id,
        fecha_hora:     inc.fecha_hora,
        mes:            inc.mes,
        vin:            inc.vin || "",
        tecnico:        inc.tecnico || "",
        tipo:           inc.tipo,
        registrado_por: inc.registrado_por || "",
        nota:           inc.nota || "",
        fotoFileId:     inc.foto_file_id || "",
        fotoUrl:        urls.url,
        fotoThumbUrl:   urls.thumbUrl,
        fotoImgUrl:     urls.imgUrl,
      };
    });

    // Summary
    const byTipo = { CRITICA: 0, MODERADA: 0, LEVE: 0 };
    const byTecnico = {};
    const byVin = {};
    for (const it of items) {
      if (it.tipo === "CRITICA")  byTipo.CRITICA++;
      else if (it.tipo === "MODERADA") byTipo.MODERADA++;
      else if (it.tipo === "LEVE") byTipo.LEVE++;

      if (it.tecnico) {
        if (!byTecnico[it.tecnico]) byTecnico[it.tecnico] = { tecnico: it.tecnico, total: 0, CRITICA: 0, MODERADA: 0, LEVE: 0 };
        byTecnico[it.tecnico].total++;
        byTecnico[it.tecnico][it.tipo] = (byTecnico[it.tecnico][it.tipo] || 0) + 1;
      }
      if (it.vin) {
        if (!byVin[it.vin]) byVin[it.vin] = { vin: it.vin, total: 0, CRITICA: 0, MODERADA: 0, LEVE: 0 };
        byVin[it.vin].total++;
        if (it.tipo === "CRITICA")       byVin[it.vin].CRITICA++;
        else if (it.tipo === "MODERADA") byVin[it.vin].MODERADA++;
        else if (it.tipo === "LEVE")     byVin[it.vin].LEVE++;
      }
    }

    const vinValues = Object.values(byVin);
    const totalVins      = vinValues.length;
    const vinsConCritica = vinValues.filter(v => v.CRITICA > 0).length;
    const vinsConReinci  = vinValues.filter(v => v.total > 1).length;

    const summary = {
      total:    items.length,
      critica:  byTipo.CRITICA,
      moderada: byTipo.MODERADA,
      leve:     byTipo.LEVE,
      totalVins,
      vinsConCritica,
      vinsConReinci,
      byTecnico: Object.values(byTecnico).sort((a,b) => b.total - a.total).slice(0,20),
      byVin:     vinValues.sort((a,b) => b.CRITICA - a.CRITICA || b.total - a.total).slice(0,20),
    };

    return res.json({ ok: true, items, summary, _queryMs: queryMs });
  } catch (e) {
    console.error("[GET /api/incidencias/report]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
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
// WEB PUSH
// -----------------------------------------------------------------

// GET /api/push/vapid-public-key  — el cliente obtiene la clave pública VAPID
app.get("/api/push/vapid-public-key", (_req, res) => {
  res.json({ ok: true, key: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe  — el cliente guarda su suscripción
app.post("/api/push/subscribe", async (req, res) => {
  try {
    const { email, subscription } = req.body || {};
    if (!email || !subscription?.endpoint) {
      return res.status(400).json({ ok: false, error: "Faltan datos" });
    }
    const record = {
      email:    String(email).trim().toLowerCase(),
      endpoint: subscription.endpoint,
      p256dh:   subscription.keys?.p256dh || "",
      auth:     subscription.keys?.auth   || "",
    };
    // Upsert por endpoint (evitar duplicados si el mismo browser re-suscribe)
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`,
      {
        method: "POST",
        headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify(record),
      }
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/push/subscribe]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
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

    // Enriquecer con modelo_normalizado desde tabla vins
    const vins = [...new Set(items.map(s => s.vin).filter(Boolean))];
    if (vins.length) {
      const vinsUrl = `${SUPABASE_URL}/rest/v1/vins?vin=in.(${vins.map(encodeURIComponent).join(",")})&select=vin,modelo_normalizado`;
      const vr = await fetch(vinsUrl, { method: "GET", headers });
      if (vr.ok) {
        const vinsData = await vr.json();
        const modeloMap = {};
        vinsData.forEach(v => { if (v.vin) modeloMap[v.vin] = v.modelo_normalizado || ""; });
        items.forEach(s => { s.modelo_normalizado = modeloMap[s.vin] || ""; });
      }
    }

    return res.json({ ok: true, items });
  } catch (e) {
    console.error("[GET /api/solicitud-ramal/pendientes]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/solicitud-ramal/:id/notificar  — el ramalero avisa que el ramal está listo
app.post("/api/solicitud-ramal/:id/notificar", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Falta id" });

    // 1. Marcar notificado_at en la solicitud
    const updated = await supabasePatch_("solicitudes_ramal", { id }, { notificado_at: new Date().toISOString() });
    const sol = Array.isArray(updated) ? updated[0] : null;
    const techEmail = sol?.tecnico_email || "";
    const vin       = sol?.vin || "";

    // 2. Enviar Web Push a todas las suscripciones del técnico
    if (techEmail) {
      try {
        const subs = await supabaseGet_("push_subscriptions", { email: techEmail });
        const payload = JSON.stringify({
          title: "🔩 ¡Tu ramal está listo!",
          body:  vin ? `VIN: ${vin} — Acércate a recoger tu ramal.` : "Acércate a recoger tu ramal.",
          tag:   "ramal-listo",
        });
        await Promise.allSettled(
          (subs || []).map(s =>
            webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
            ).catch(err => {
              // 410 = suscripción caducada → limpiar
              if (err.statusCode === 410) {
                supabaseDelete_("push_subscriptions", { endpoint: s.endpoint }).catch(() => {});
              }
              console.warn("[PUSH] send error:", err.statusCode, err.message);
            })
          )
        );
      } catch (pushErr) {
        console.warn("[PUSH] fetch subs error:", pushErr.message);
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/solicitud-ramal/:id/notificar]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/solicitud-ramal/mi-ramal  — el técnico consulta si su ramal está listo
app.get("/api/solicitud-ramal/mi-ramal", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: "Falta email" });
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const url = `${SUPABASE_URL}/rest/v1/solicitudes_ramal` +
      `?tecnico_email=eq.${encodeURIComponent(email)}` +
      `&estado=eq.PENDIENTE` +
      `&notificado_at=not.is.null` +
      `&order=notificado_at.desc&limit=1`;
    const r = await fetch(url, { method: "GET", headers });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const items = await r.json();
    return res.json({ ok: true, listo: items.length > 0, item: items[0] || null });
  } catch (e) {
    console.error("[GET /api/solicitud-ramal/mi-ramal]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/solicitud-ramal/mi-posicion  — posición del técnico en la cola PENDIENTE
app.get("/api/solicitud-ramal/mi-posicion", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: "Falta email" });
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const url = `${SUPABASE_URL}/rest/v1/solicitudes_ramal` +
      `?estado=eq.PENDIENTE&order=created_at.asc&select=id,tecnico_email`;
    const r = await fetch(url, { method: "GET", headers });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const items = await r.json();
    const idx = items.findIndex(it => String(it.tecnico_email || "").toLowerCase() === email);
    if (idx === -1) return res.json({ ok: true, enCola: false, posicion: null, total: items.length });
    return res.json({ ok: true, enCola: true, posicion: idx + 1, total: items.length });
  } catch (e) {
    console.error("[GET /api/solicitud-ramal/mi-posicion]", e.message);
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
// ─── ADMIN CONFIG ────────────────────────────────────────────────────
// GET /api/admin/config  → { ok, config: { KEY: "value", ... } }
app.get("/api/admin/config", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/app_config?select=key,value`, { method: "GET", headers });
    if (!resp.ok) throw new Error(`Supabase: ${resp.status}`);
    const rows = await resp.json();
    const config = {};
    (rows || []).forEach(r => { config[r.key] = r.value; });
    return res.json({ ok: true, config });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// POST /api/admin/config  body: { key, value } OR { configs: [{key,value},...] }
app.post("/api/admin/config", async (req, res) => {
  try {
    const body = req.body || {};
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // Permite guardar múltiples claves en un solo POST
    const pairs = Array.isArray(body.configs)
      ? body.configs
      : [{ key: body.key, value: body.value }];

    for (const { key, value } of pairs) {
      if (!key) return res.status(400).json({ ok: false, error: "Falta key" });
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/app_config`, {
        method: "POST",
        headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ key, value: String(value ?? "") }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Supabase: ${resp.status} ${text.slice(0, 200)}`);
      }
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// POST /api/admin/pausa-masiva
// body: { accion: "PAUSA" | "REANUDAR", nota?: string }
// Pausa o reanuda TODAS las asignaciones activas en estado TRABAJANDO (o PAUSADO para reanudar)
app.post("/api/admin/pausa-masiva", async (req, res) => {
  try {
    const { accion, nota } = req.body || {};
    if (!["PAUSA", "REANUDAR"].includes(accion)) {
      return res.status(400).json({ ok: false, error: "accion debe ser PAUSA o REANUDAR" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const now = new Date().toISOString();
    const estadoBuscar  = accion === "PAUSA" ? "TRABAJANDO" : "PAUSADO";
    const estadoNuevo   = accion === "PAUSA" ? "PAUSADO"    : "TRABAJANDO";
    const notaFinal     = nota || (accion === "PAUSA" ? "__ADMIN_PAUSA_MASIVA" : "__ADMIN_REANUDAR_MASIVA");

    // 1. Obtener todas las asignaciones en el estado objetivo
    const url = `${SUPABASE_URL}/rest/v1/asignaciones?activo=eq.true&estado_actual=eq.${estadoBuscar}&select=id,running_since,tiempo_trab_ms`;
    const resp = await fetch(url, { method: "GET", headers });
    if (!resp.ok) throw new Error(`Supabase GET asignaciones: ${resp.status}`);
    const asignaciones = await resp.json();

    if (!asignaciones.length) {
      return res.json({ ok: true, afectadas: 0, mensaje: `No hay OTs en estado ${estadoBuscar}` });
    }

    let afectadas = 0;
    const errors = [];

    for (const asg of asignaciones) {
      try {
        const updateData = { estado_actual: estadoNuevo, updated_at: now, last_nota: notaFinal };
        if (accion === "PAUSA") {
          // Acumular tiempo transcurrido
          const extraMs = asg.running_since
            ? Math.max(0, Date.now() - new Date(asg.running_since).getTime())
            : 0;
          updateData.tiempo_trab_ms = (asg.tiempo_trab_ms || 0) + extraMs;
          updateData.running_since  = null;
        } else {
          // Reanudar
          updateData.running_since = now;
        }
        const patchUrl = `${SUPABASE_URL}/rest/v1/asignaciones?id=eq.${asg.id}`;
        const pr = await fetch(patchUrl, {
          method: "PATCH",
          headers: { ...headers, "Prefer": "return=minimal" },
          body: JSON.stringify(updateData),
        });
        if (!pr.ok) errors.push(asg.id);
        else afectadas++;
      } catch {
        errors.push(asg.id);
      }
    }

    // 2. Guardar estado en app_config para que el frontend lo muestre
    await fetch(`${SUPABASE_URL}/rest/v1/app_config`, {
      method: "POST",
      headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ key: "PAUSA_GLOBAL_ACTIVA", value: accion === "PAUSA" ? "1" : "0" }),
    }).catch(() => {});

    return res.json({ ok: true, afectadas, errors: errors.length ? errors : undefined });
  } catch (e) {
    console.error("[PAUSA_MASIVA]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/admin/asignaciones?vin=XXX
// Devuelve asignaciones activas para un VIN con nombres de técnicos
app.get("/api/admin/asignaciones", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    if (!vin) return res.status(400).json({ ok: false, error: "VIN requerido" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // 1. Work orders para este VIN
    const woResp = await fetch(
      `${SUPABASE_URL}/rest/v1/work_orders?vin=eq.${encodeURIComponent(vin)}&select=id,tipo_ot,estado_general,numero_ot`,
      { method: "GET", headers }
    );
    if (!woResp.ok) throw new Error(`Supabase work_orders: ${woResp.status}`);
    const wos = await woResp.json();
    if (!wos.length) return res.json({ ok: true, asignaciones: [], work_orders: [] });

    const woIds = wos.map(w => w.id).join(",");
    const woMap = Object.fromEntries(wos.map(w => [w.id, w]));

    // 2. Asignaciones activas para esos work_orders
    const asgResp = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?work_order_id=in.(${encodeURIComponent(woIds)})&activo=eq.true&select=*`,
      { method: "GET", headers }
    );
    if (!asgResp.ok) throw new Error(`Supabase asignaciones: ${asgResp.status}`);
    const asgs = await asgResp.json();

    if (!asgs.length) return res.json({ ok: true, asignaciones: [], work_orders: wos });

    // 3. Usuarios para esos user_ids
    const userIds = [...new Set(asgs.map(a => a.user_id))].join(",");
    const usrResp = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?id=in.(${encodeURIComponent(userIds)})&select=id,nombre,email`,
      { method: "GET", headers }
    );
    const usrs = usrResp.ok ? await usrResp.json() : [];
    const userMap = Object.fromEntries(usrs.map(u => [u.id, u]));

    const result = asgs.map(a => ({
      ...a,
      tecnico_nombre: userMap[a.user_id]?.nombre || "—",
      tecnico_email:  userMap[a.user_id]?.email  || "—",
      tipo_ot:        woMap[a.work_order_id]?.tipo_ot        || a.tipo_ot,
      estado_general: woMap[a.work_order_id]?.estado_general,
      numero_ot:      woMap[a.work_order_id]?.numero_ot,
    }));

    return res.json({ ok: true, asignaciones: result, work_orders: wos });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// PATCH /api/admin/asignaciones/:id  body: { user_id }
app.patch("/api/admin/asignaciones/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body || {};
    if (!id || !user_id) return res.status(400).json({ ok: false, error: "id y user_id requeridos" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ user_id, updated_at: new Date().toISOString() }),
      }
    );
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Supabase PATCH: ${resp.status} ${txt.slice(0, 200)}`);
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/admin/usuarios-activos
// Lista de técnicos activos para picker de reasignación
app.get("/api/admin/usuarios-activos", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?activo=eq.true&select=id,nombre,email,especialidad&order=nombre.asc`,
      { method: "GET", headers }
    );
    if (!resp.ok) throw new Error(`Supabase: ${resp.status}`);
    const usuarios = await resp.json();
    return res.json({ ok: true, usuarios });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ─── CLASIFICADOR DE VINs POR MODELO ─────────────────────────────────────────
// Tabla de prefijos (8 chars) → nombre canónico.
// JAC V-series comparte prefijo → se extrae V3/V5/V7 del modelo actual.
const VIN_BRAND_MAP_ = {
  "HJRPBGFA": "Jetour MEC",   // X70 transmisión manual
  "HJRPBGFB": "Jetour AUT",   // X70 automático
  "LVTDB11B": "Jetour MEC",   // X70FL 6MT
  "LVTDB21B": "Jetour AUT",   // X70FL 6DCT
  "LSCAB33E": "KYC X5 DC",    // JAC X5 Doble Cabina
  "LSCABN3E": "KYC X5",       // JAC X5 / T3 (cabina simple / cargo)
  "9BWBL6DF": "VW Tera",      // VW Tarek ensamblado en Brasil
  "9BWAL5BZ": "VW Polo",      // VW Polo Track Brasil
  "9BWAH5BZ": "VW Polo",      // VW Polo (otra variante)
  "9BWJL45U": "VW Saveiro",   // VW Saveiro
  "VSSZZZKJ": "SEAT",         // SEAT (modelo por confirmar)
};

function classifyVin_(vin, modeloActual) {
  if (!vin || vin.length < 8) return modeloActual || "";
  const pref = vin.substring(0, 8).toUpperCase();

  // JAC V-series: V3, V5, V7 comparten el mismo prefijo → leer del modelo actual
  if (pref === "LS4ASL2E") {
    const mu = (modeloActual || "").toUpperCase();
    if (mu.includes("V7")) return "KYC V7";
    if (mu.includes("V5")) return "KYC V5";
    if (mu.includes("V3")) return "KYC V3";
    return "KYC V-series"; // sin info suficiente para distinguir
  }

  return VIN_BRAND_MAP_[pref] || modeloActual || "";
}

// POST /api/admin/normalize-modelos
// Migración batch: reclasifica todos los VINs con nombre canónico.
// Devuelve reporte de cuántos cambiaron por modelo.
app.post("/api/admin/normalize-modelos", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const hdrs = supabaseHeaders_();

    // Leer todos los VINs paginado
    let allVins = [];
    let offset  = 0;
    const LIMIT = 500;
    while (true) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vins?select=vin,modelo&limit=${LIMIT}&offset=${offset}`,
        { method: "GET", headers: hdrs }
      );
      if (!r.ok) throw new Error(`Supabase read: ${r.status}`);
      const page = await r.json();
      allVins = allVins.concat(page);
      if (page.length < LIMIT) break;
      offset += LIMIT;
    }

    // Clasificar y agrupar cambios
    const cambios   = [];   // {vin, antes, despues}
    const reporte   = {};   // canonico -> count
    const sinClasif = [];   // VINs que quedaron sin clasificar

    for (const row of allVins) {
      const canonico = classifyVin_(row.vin, row.modelo);
      if (canonico === (row.modelo || "")) continue;  // sin cambio
      cambios.push({ vin: row.vin, antes: row.modelo || "", despues: canonico });
      reporte[canonico] = (reporte[canonico] || 0) + 1;
      if (!canonico || canonico === (row.modelo || "")) sinClasif.push(row.vin);
    }

    // Aplicar en lotes de 100 via upsert
    const BATCH = 100;
    let actualizados = 0;
    for (let i = 0; i < cambios.length; i += BATCH) {
      const lote = cambios.slice(i, i + BATCH).map(c => ({ vin: c.vin, modelo: c.despues }));
      const rUp = await fetch(`${SUPABASE_URL}/rest/v1/vins`, {
        method: "POST",
        headers: { ...hdrs, "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(lote),
      });
      if (!rUp.ok) throw new Error(`Supabase upsert: ${rUp.status} ${await rUp.text()}`);
      actualizados += lote.length;
    }

    console.log(`[NORMALIZE] ${actualizados} VINs reclasificados de ${allVins.length} totales.`);
    return res.json({ ok: true, total: allVins.length, actualizados, reporte, cambios: cambios.slice(0, 50) });
  } catch (e) {
    console.error("[NORMALIZE]", e.message);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ─── MOVILIZADOR STATUS ───────────────────────────────────────────────
// GET /api/movilizador/status
// Devuelve las 3 listas del flujo movilizador + fecha_corte activa
app.get("/api/movilizador/status", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // 1. Fecha de corte desde app_config
    const cfgResp = await fetch(
      `${SUPABASE_URL}/rest/v1/app_config?key=eq.FECHA_CORTE_MOVILIZADOR`,
      { method: "GET", headers }
    );
    const cfgRows = cfgResp.ok ? await cfgResp.json() : [];
    const fechaCorte = cfgRows[0]?.value || "";

    // 2. CONVERSION FINALIZADO

    let convUrl = `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=eq.FINALIZADO&select=vin,fecha_creacion,created_at,numero_ot,asignaciones(updated_at,estado_actual,rol_trabajo)`;
    if (fechaCorte) convUrl += `&created_at=gte.${fechaCorte}T00:00:00`;
    convUrl += `&order=fecha_creacion.asc`;
    const convResp = await fetch(convUrl, { method: "GET", headers });
    const convRows = convResp.ok ? await convResp.json() : [];

    // 3. Traslados movilizador — solo estados activos (excluye ENTREGADO_FINAL).
    // La tabla acumula un registro por VIN histórico; sin filtro, Supabase trunca
    // a 1000 filas y VINs "viejos" desaparecen del trasMap aunque tengan estado activo.
    // Los ENTREGADO_FINAL se chequean por separado en list3 (ver abajo).
    const trasResp = await fetch(
      `${SUPABASE_URL}/rest/v1/movilizador_traslados?estado=neq.ENTREGADO_FINAL&select=vin,estado,trasladado_at,trasladado_por,entregado_at,entregado_por`,
      { method: "GET", headers }
    );
    const trasRows = trasResp.ok ? await trasResp.json() : [];
    const trasMap = new Map();
    for (const t of (trasRows || [])) {
      if (t.vin) trasMap.set(t.vin, t);
    }

    // 4. CALIDAD FINALIZADO (con filtro de fecha de corte)
    let calUrl = `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CALIDAD&estado_general=eq.FINALIZADO&select=vin,fecha_creacion,created_at`;
    if (fechaCorte) calUrl += `&fecha_creacion=gte.${fechaCorte}T00:00:00`;
    calUrl += `&order=fecha_creacion.desc`;
    const calResp = await fetch(calUrl, { method: "GET", headers });
    const calRows = calResp.ok ? await calResp.json() : [];
    const calidadDoneMap = new Map();
    for (const wo of (calRows || [])) {
      if (wo.vin && !calidadDoneMap.has(wo.vin)) calidadDoneMap.set(wo.vin, wo);
    }

    // 4b. CALIDAD ACTIVA (PENDIENTE o EN PROCESO) — para saber si el inspector está trabajando
    const calActivaResp = await fetch(
      `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CALIDAD&estado_general=in.(PENDIENTE,EN PROCESO)&select=vin,fecha_creacion,created_at`,
      { method: "GET", headers }
    );
    const calActivaRows = calActivaResp.ok ? await calActivaResp.json() : [];
    // Map vin → OT data para VINs con CALIDAD activa
    const calidadActivaMap = new Map();
    for (const wo of (calActivaRows || [])) {
      if (wo.vin && !calidadActivaMap.has(wo.vin)) calidadActivaMap.set(wo.vin, wo);
    }

    // 4c. CONVERSION ACTIVA (PENDIENTE o EN PROCESO) — para saber si técnico ya inició
    let convActivaUrl = `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=in.(PENDIENTE,EN%20PROCESO)&select=vin,created_at`;
    if (fechaCorte) convActivaUrl += `&created_at=gte.${fechaCorte}T00:00:00`;
    const convActivaResp = await fetch(convActivaUrl, { method: "GET", headers });
    const convActivaRows = convActivaResp.ok ? await convActivaResp.json() : [];
    const convActivaMap = new Set();
    for (const wo of (convActivaRows || [])) {
      if (wo.vin) convActivaMap.add(wo.vin);
    }

    // ─── Lista 1: conversión finalizada + sin traslado (o en EN_ESPERA_CONVERSION) + sin OT de CALIDAD
    const convVinMap = new Map();
    // convAllMap: todos los CONVERSION FINALIZADO para lookup de numero_ot (incluye list3 VINs)
    const convAllMap = new Map();
    for (const wo of (convRows || [])) {
      if (!wo.vin) continue;
      const prev = convAllMap.get(wo.vin);
      if (!prev || new Date(wo.fecha_creacion) > new Date(prev.fecha_creacion)) {
        convAllMap.set(wo.vin, wo);
      }
      if (calidadDoneMap.has(wo.vin) || calidadActivaMap.has(wo.vin)) continue;
      const trasEntry = trasMap.get(wo.vin);
      // Excluir solo si ya fue trasladado/entregado (no si está en espera de conversión)
      if (trasEntry && trasEntry.estado !== "EN_ESPERA_CONVERSION") continue;
      const prev2 = convVinMap.get(wo.vin);
      if (!prev2 || new Date(wo.fecha_creacion) > new Date(prev2.fecha_creacion)) {
        convVinMap.set(wo.vin, wo);
      }
    }
    const list1 = Array.from(convVinMap.values())
      .map(wo => {
        // Fecha fin = max updated_at de asignaciones FINALIZADAS (MOTOR/TANQUE)
        const fechaFin = (wo.asignaciones || [])
          .filter(a => a.estado_actual === "FINALIZADO")
          .reduce((max, a) => (!max || new Date(a.updated_at) > new Date(max)) ? a.updated_at : max, null);
        return { vin: wo.vin, fecha: fechaFin || wo.fecha_creacion, fecha_updated: wo.created_at };
      })
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // ─── Lista 0: en espera de conversión + en conversión activa
    const list0 = [];
    const list0Vins = new Set();

    // a) Registrados por movilizador como EN_ESPERA_CONVERSION
    for (const [vin, t] of trasMap) {
      if (t.estado !== "EN_ESPERA_CONVERSION") continue;
      if (convVinMap.has(vin)) continue; // conversión ya finalizada → aparece en list1
      list0.push({
        vin,
        fecha_entrada: t.trasladado_at,
        registrado_por: t.trasladado_por || "",
        en_conversion: convActivaMap.has(vin),
      });
      list0Vins.add(vin);
    }

    // b) VINs con OT de conversión activa pero sin registro de entrada (movilizador no los registró)
    for (const vin of convActivaMap) {
      if (list0Vins.has(vin)) continue; // ya está por traslado
      if (convVinMap.has(vin)) continue; // conversión finalizada → va a list1
      list0.push({
        vin,
        fecha_entrada: null,
        registrado_por: "",
        en_conversion: true,
        sin_registro: true,
      });
    }

    // Orden: primero En Espera (newest first), luego En Conversión
    list0.sort((a, b) => {
      if (a.en_conversion !== b.en_conversion) return a.en_conversion ? 1 : -1;
      // Dentro de En Espera: más reciente arriba
      if (!a.en_conversion) return new Date(b.fecha_entrada || 0) - new Date(a.fecha_entrada || 0);
      return 0;
    });

    // ─── Lista 2: VINs trasladados (sin calidad done) + VINs con OT CALIDAD activa
    const list2 = [];
    const list2Vins = new Set();

    // 2a. Trasladados manualmente por el movilizador (TRASLADADO o ENTREGADO_CALIDAD)
    for (const [vin, t] of trasMap) {
      if (calidadDoneMap.has(vin)) continue;
      if (t.estado === "ENTREGADO_FINAL") continue;
      if (t.estado === "TRASLADADO" || t.estado === "ENTREGADO_CALIDAD") {
        // Si ya tiene OT de calidad activa, mostrar como EN_REVISION aunque traslado diga TRASLADADO
        const estadoReal = calidadActivaMap.has(vin) ? "EN_REVISION" : t.estado;
        list2.push({
          vin,
          estado: estadoReal,
          trasladado_at: t.trasladado_at,
          trasladado_por: t.trasladado_por || "",
          entregado_at: t.entregado_at || null,
          entregado_por: t.entregado_por || "",
        });
        list2Vins.add(vin);
      }
    }

    // 2b. OT CALIDAD activa sin traslado registrado (inspector abrió OT directo)
    for (const [vin] of calidadActivaMap) {
      if (list2Vins.has(vin)) continue; // ya incluido por traslado
      if (calidadDoneMap.has(vin)) continue;
      const t = trasMap.get(vin);
      if (t?.estado === "ENTREGADO_FINAL") continue;
      list2.push({
        vin,
        estado: "EN_REVISION",
        trasladado_at: null,
        trasladado_por: "",
        entregado_at: null,
        entregado_por: "",
      });
    }
    list2.sort((a, b) => new Date(a.trasladado_at || 0) - new Date(b.trasladado_at || 0));

    // Consulta targeted: qué VINs de calidadDoneMap ya fueron entregados (ENTREGADO_FINAL).
    // No usamos trasMap para esto porque trasMap excluye ENTREGADO_FINAL (ver query arriba).
    let entregadoFinalSet = new Set();
    if (calidadDoneMap.size > 0) {
      try {
        const calVinList = [...calidadDoneMap.keys()].map(v => `"${v}"`).join(",");
        const efResp = await fetch(
          `${SUPABASE_URL}/rest/v1/movilizador_traslados?estado=eq.ENTREGADO_FINAL&vin=in.(${calVinList})&select=vin`,
          { method: "GET", headers }
        );
        if (efResp.ok) {
          const efRows = await efResp.json();
          entregadoFinalSet = new Set((efRows || []).map(r => r.vin));
        }
      } catch (_) { /* silencioso */ }
    }

    // ─── Lista 3: calidad finalizada (con o sin traslado registrado, excluye ENTREGADO_FINAL)
    const list3 = [];
    for (const [vin, wo] of calidadDoneMap) {
      if (entregadoFinalSet.has(vin)) continue;
      const tL3 = trasMap.get(vin);
      list3.push({
        vin,
        fecha_calidad: wo.fecha_creacion || wo.created_at,
        trasladado_por: tL3?.trasladado_por || "",
        destino: "",  // enriquecido abajo si la columna existe en vins
        tiene_ot: isValidOT_(convAllMap.get(vin)?.numero_ot),
      });
    }
    list3.sort((a, b) => new Date(b.fecha_calidad) - new Date(a.fecha_calidad));

    // Fallback sin-fecha para VINs sin OT: el convAllMap aplica fechaCorte sobre created_at,
    // por lo que WOs de conversión anteriores al corte quedan fuera aunque tengan numero_ot.
    // Esta consulta adicional (sin filtro de fecha) cubre esos casos.
    try {
      const sinOT = list3.filter(r => !r.tiene_ot);
      if (sinOT.length > 0) {
        const vinList = sinOT.map(r => `"${r.vin}"`).join(",");
        const otFallbackResp = await fetch(
          `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=eq.FINALIZADO&vin=in.(${vinList})&select=vin,numero_ot&order=fecha_creacion.desc`,
          { method: "GET", headers }
        );
        if (otFallbackResp.ok) {
          const otFallbackRows = await otFallbackResp.json();
          const otFallbackMap = new Map();
          for (const row of (otFallbackRows || [])) {
            if (row.vin && !otFallbackMap.has(row.vin)) otFallbackMap.set(row.vin, row.numero_ot);
          }
          for (const item of list3) {
            if (!item.tiene_ot) item.tiene_ot = isValidOT_(otFallbackMap.get(item.vin));
          }
        }
      }
    } catch (_) { /* silencioso */ }

    // Enriquecer list3 con ultima_ubicacion desde tabla vins (fallback silencioso)
    try {
      if (list3.length > 0) {
        const vinList = list3.map(r => `"${r.vin}"`).join(",");
        const destiResp = await fetch(
          `${SUPABASE_URL}/rest/v1/vins?vin=in.(${vinList})&select=vin,ultima_ubicacion`,
          { method: "GET", headers }
        );
        if (destiResp.ok) {
          const destiRows = await destiResp.json();
          if (Array.isArray(destiRows)) {
            const destiMap = new Map(destiRows.map(r => [r.vin, r.ultima_ubicacion || ""]));
            for (const item of list3) {
              item.destino = destiMap.get(item.vin) || "";
            }
          }
        }
      }
    } catch (_) { /* columna ultima_ubicacion aún no existe en vins, se omite */ }

    // ─── Lista Diaria: todos los VINs del flujo de conversión del día ───
    const allConvVins = new Set();
    for (const wo of (convRows || [])) { if (wo.vin) allConvVins.add(wo.vin); }
    for (const vin of convActivaMap) { allConvVins.add(vin); }
    // Incluir también los registrados por el movilizador aunque no tengan OT aún
    // (trasMap ya excluye ENTREGADO_FINAL, así que todos sus VINs son activos)
    for (const [vin] of trasMap) {
      allConvVins.add(vin);
    }

    const listDiaria = [];
    for (const vin of allConvVins) {
      const t = trasMap.get(vin);
      if (entregadoFinalSet.has(vin)) continue; // ya entregado, no mostrar

      let flow_status;
      const fecha_ot = convVinMap.get(vin)?.fecha_creacion || null;

      if (calidadDoneMap.has(vin)) {
        flow_status = "LISTA_SALIDA";
      } else if (calidadActivaMap.has(vin) || t?.estado === "ENTREGADO_CALIDAD") {
        flow_status = "EN_REVISION";
      } else if (t?.estado === "TRASLADADO") {
        flow_status = "EN_ZONA";
      } else if (convVinMap.has(vin)) {
        flow_status = "CONVERSION_DONE";
      } else if (convActivaMap.has(vin)) {
        flow_status = "EN_CONVERSION";
      } else if (t?.estado === "EN_ESPERA_CONVERSION") {
        flow_status = "EN_ESPERA";
      } else {
        flow_status = "PENDIENTE_ENTRADA";
      }

      listDiaria.push({
        vin,
        flow_status,
        fecha_ot,
        registrado: !!t,
        fecha_entrada: t?.trasladado_at || null,
      });
    }
    const flowOrder = { PENDIENTE_ENTRADA: 0, EN_ESPERA: 1, EN_CONVERSION: 2, CONVERSION_DONE: 3, EN_ZONA: 4, EN_REVISION: 5, LISTA_SALIDA: 6 };
    listDiaria.sort((a, b) => (flowOrder[a.flow_status] ?? 9) - (flowOrder[b.flow_status] ?? 9));

    return res.json({
      ok: true,
      fechaCorte,
      list0,
      list1,
      list2,
      list3,
      listDiaria,
      counts: {
        list0: list0.length,
        list0_espera: list0.filter(r => !r.en_conversion).length,
        list0_conversion: list0.filter(r => r.en_conversion).length,
        list1: list1.length,
        list2: list2.length,
        list3: list3.length,
        listDiaria: listDiaria.length,
        listDiariaPendientes: listDiaria.filter(r => r.flow_status === "PENDIENTE_ENTRADA").length,
      },
    });
  } catch (e) {
    console.error("[MOVILIZADOR_STATUS]", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// POST /api/movilizador/traslado
// body: { vin, accion: "TRASLADAR" | "ENTREGAR_CALIDAD" | "ENTREGAR_FINAL", usuario }
app.post("/api/movilizador/traslado", async (req, res) => {
  try {
    const { vin, accion, usuario } = req.body || {};
    if (!vin) return res.status(400).json({ ok: false, error: "Falta vin" });
    if (!["TRASLADAR", "ENTREGAR_CALIDAD", "ENTREGAR_FINAL", "REGISTRAR_ENTRADA", "REGISTRAR_SALIDA"].includes(accion)) {
      return res.status(400).json({ ok: false, error: "accion inválida: use TRASLADAR, ENTREGAR_CALIDAD, ENTREGAR_FINAL, REGISTRAR_ENTRADA o REGISTRAR_SALIDA" });
    }
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const now = new Date().toISOString();
    const userName = String(usuario || "").trim();
    const vinNorm = String(vin || "").trim().toUpperCase();

    // ── Validación #OT antes de confirmar salida final ──────────────────
    if (accion === "ENTREGAR_FINAL") {
      const otCheckResp = await fetch(
        `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&vin=eq.${encodeURIComponent(vinNorm)}&estado_general=eq.FINALIZADO&select=id,numero_ot&order=fecha_creacion.desc&limit=1`,
        { method: "GET", headers }
      );
      const otCheckRows = otCheckResp.ok ? await otCheckResp.json() : [];
      if (!isValidOT_(otCheckRows[0]?.numero_ot)) {
        return res.status(400).json({
          ok: false,
          error: "❌ #OT no registrado: registre el número de OT en ASIGNACIONES (columna E) antes de confirmar la salida del vehículo."
        });
      }
    }
    // ────────────────────────────────────────────────────────────────────

    const data = accion === "TRASLADAR"
      ? { vin: vinNorm, estado: "TRASLADADO", trasladado_at: now, trasladado_por: userName }
      : accion === "ENTREGAR_CALIDAD"
        ? { vin: vinNorm, estado: "ENTREGADO_CALIDAD", entregado_at: now, entregado_por: userName }
        : accion === "REGISTRAR_ENTRADA"
          ? { vin: vinNorm, estado: "EN_ESPERA_CONVERSION", trasladado_at: now, trasladado_por: userName }
          : accion === "REGISTRAR_SALIDA"
            ? { vin: vinNorm, estado: "TRASLADADO", trasladado_at: now, trasladado_por: userName }
            : { vin: vinNorm, estado: "ENTREGADO_FINAL", entregado_at: now, entregado_por: userName };

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/movilizador_traslados?on_conflict=vin`, {
      method: "POST",
      headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("[MOVILIZADOR_TRASLADO_SUPABASE]", resp.status, text);
      return res.status(resp.status >= 400 && resp.status < 500 ? resp.status : 502).json({
        ok: false,
        error: `No se pudo guardar el traslado (${resp.status}).`,
        detail: text.slice(0, 500),
      });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("[MOVILIZADOR_TRASLADO]", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/movilizador/pendientes  (misma lógica, accesible al movilizador)
app.get("/api/movilizador/pendientes", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const [listaResp, trasResp, vinsResp] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/lista_diaria_activa?select=vin,fecha_asignacion&order=fecha_asignacion.asc,vin.asc`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/movilizador_traslados?select=vin,estado`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/vins?ultima_ubicacion=neq.&select=vin,ultima_ubicacion`, { method: "GET", headers }),
    ]);
    const listaRows = listaResp.ok ? await listaResp.json() : [];
    const trasRows  = trasResp.ok  ? await trasResp.json()  : [];
    const vinsRows  = vinsResp.ok  ? await vinsResp.json()  : [];
    const registrado = new Set((trasRows || []).map(t => t.vin));
    const ubicMap    = new Map((vinsRows || []).map(v => [v.vin, v.ultima_ubicacion || ""]));
    const sin_registrar = (listaRows || [])
      .filter(r => !registrado.has(r.vin))
      .map(r => ({ vin: r.vin, fecha: r.fecha_asignacion, ubicacion: ubicMap.get(r.vin) || "" }));
    return res.json({ ok: true, sin_registrar });
  } catch (e) {
    console.error("[MOV_PENDIENTES]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/movilizador/revalidate-ot?vins=VIN1,VIN2,...
// Consulta ligera: dado un set de VINs sin OT, devuelve cuáles ya tienen OT válida.
// Usado por el re-validador de 8 min del frontend para actualizar el estado sin
// llamar al endpoint completo /status.
app.get("/api/movilizador/revalidate-ot", async (req, res) => {
  try {
    const raw = String(req.query.vins || "").trim();
    if (!raw) return res.json({ ok: true, vins_con_ot: [] });

    const vins = raw.split(",")
      .map(v => v.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 50); // máx 50 VINs por llamada

    if (!vins.length) return res.json({ ok: true, vins_con_ot: [] });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    const vinFilter = vins.map(v => encodeURIComponent(v)).join(",");
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/work_orders` +
      `?tipo_ot=eq.CONVERSION&estado_general=eq.FINALIZADO` +
      `&vin=in.(${vinFilter})` +
      `&select=vin,numero_ot`,
      { method: "GET", headers }
    );
    const rows = resp.ok ? await resp.json() : [];

    // Para cada VIN tomar la fila con OT válida (puede haber varias OTs por VIN)
    const vins_con_ot = [];
    const seen = new Set();
    for (const row of (rows || [])) {
      if (!row.vin || seen.has(row.vin)) continue;
      if (isValidOT_(row.numero_ot)) {
        vins_con_ot.push(row.vin);
        seen.add(row.vin);
      }
    }

    return res.json({ ok: true, vins_con_ot });
  } catch (e) {
    console.error("[MOV_REVALIDATE_OT]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/supervisor/lista-pendientes
// VINs de LISTA DIARIA que el movilizador aun no ha registrado en GLP
app.get("/api/supervisor/lista-pendientes", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    const [listaResp, trasResp, vinsResp] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/lista_diaria_activa?select=vin,fecha_asignacion&order=fecha_asignacion.asc,vin.asc`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/movilizador_traslados?select=vin,estado`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/vins?ultima_ubicacion=neq.&select=vin,ultima_ubicacion`, { method: "GET", headers }),
    ]);

    const listaRows = listaResp.ok ? await listaResp.json() : [];
    const trasRows  = trasResp.ok  ? await trasResp.json()  : [];
    const vinsRows  = vinsResp.ok  ? await vinsResp.json()  : [];

    const registradoMap = new Map();  // vin → estado traslado
    for (const t of (trasRows || [])) { if (t.vin) registradoMap.set(t.vin, t.estado); }

    const ubicMap = new Map();
    for (const v of (vinsRows || [])) { if (v.vin) ubicMap.set(v.vin, v.ultima_ubicacion || ""); }

    const sin_registrar  = [];  // en lista diaria, movilizador NO los ha traido
    const en_proceso     = [];  // movilizador ya los registró (EN_ESPERA o TRASLADADO)

    for (const row of (listaRows || [])) {
      const estado = registradoMap.get(row.vin) || null;
      const item = {
        vin:    row.vin,
        fecha:  row.fecha_asignacion,
        ubicacion: ubicMap.get(row.vin) || "",
        estado_traslado: estado || "",
      };
      if (!estado || estado === "ENTREGADO_FINAL") {
        if (!estado) sin_registrar.push(item);  // no registrado aun
      } else {
        en_proceso.push(item);
      }
    }

    return res.json({ ok: true, sin_registrar, en_proceso });
  } catch (e) {
    console.error("[LISTA_PENDIENTES]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/vin-validar — Verifica si un VIN está registrado para conversión
app.get("/api/vin-validar", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    if (!vin) return res.json({ ok: false, error: "VIN requerido" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // 1. Buscar VIN en tabla vins
    const vinResp = await fetch(
      `${SUPABASE_URL}/rest/v1/vins?vin=eq.${encodeURIComponent(vin)}&select=vin,modelo,cliente,reductor_asignado,tanque_asignado`,
      { method: "GET", headers }
    );
    const vins = vinResp.ok ? await vinResp.json() : [];

    if (!vins?.length) {
      return res.json({ ok: true, found: false, vin: null, workOrders: [] });
    }

    // 2. Buscar work orders con sus asignaciones activas
    const woResp = await fetch(
      `${SUPABASE_URL}/rest/v1/work_orders?vin=eq.${encodeURIComponent(vin)}`
      + `&select=id,tipo_ot,fecha_creacion,asignaciones(id,rol_trabajo,estado_actual,activo,usuarios(nombre))`
      + `&order=fecha_creacion.desc&limit=5`,
      { method: "GET", headers }
    );
    const workOrders = woResp.ok ? await woResp.json() : [];

    return res.json({ ok: true, found: true, vin: vins[0], workOrders: workOrders || [] });
  } catch (e) {
    console.error("[GET /api/vin-validar]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ── GET /api/tecnico/cola ─────────────────────────────────────────────
// Devuelve compañeros libres (especialidad par) + VINs disponibles para la especialidad dada
app.get("/api/tecnico/cola", async (req, res) => {
  try {
    const esp = String(req.query.especialidad || "").toUpperCase().trim();
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    if (!headers) throw new Error("Supabase no configurado");

    const pairEsp = esp === "MOTOR" ? "TANQUE" : esp === "TANQUE" ? "MOTOR" : null;

    // ── 1. Compañeros libres ───────────────────────────────────────────
    let companeros = [];
    if (pairEsp) {
      const [rComp, rBusy] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/usuarios?rol=eq.TECNICO&especialidad=eq.${pairEsp}&activo=eq.true&select=id,nombre`, { method: "GET", headers }),
        fetch(`${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${pairEsp}&activo=eq.true&estado_actual=neq.FINALIZADO&select=user_id`, { method: "GET", headers }),
      ]);
      const allPairs = rComp.ok ? await rComp.json() : [];
      const busyIds  = new Set((rBusy.ok ? await rBusy.json() : []).map(a => a.user_id));
      companeros = allPairs.filter(u => !busyIds.has(u.id)).map(u => ({ id: u.id, nombre: u.nombre }));
    }

    // ── 2. VINs en proceso: par activo pero mi especialidad libre ──────
    let vins = [];
    if (pairEsp) {
      const [rPairAct, rMyAct] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${pairEsp}&activo=eq.true&estado_actual=neq.FINALIZADO&select=work_order_id,estado_actual,usuarios(nombre),work_orders(id,vin)`, { method: "GET", headers }),
        fetch(`${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${esp}&activo=eq.true&estado_actual=neq.FINALIZADO&select=work_order_id`, { method: "GET", headers }),
      ]);
      const pairRows = rPairAct.ok ? await rPairAct.json() : [];
      const myActIds = new Set((rMyAct.ok ? await rMyAct.json() : []).map(a => a.work_order_id));
      vins = pairRows
        .filter(a => a.work_orders?.vin && !myActIds.has(a.work_order_id))
        .map(a => ({
          vin:     a.work_orders.vin,
          tecnico: a.usuarios?.nombre || "—",
          estado:  a.estado_actual || "",
        }));
    }

    // ── 3. Fallback: VINs sin convertir ───────────────────────────────
    let vinsFallback = [];
    if (!vins.length) {
      const rPend = await fetch(
        `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=eq.PENDIENTE&select=vin&limit=30&order=created_at.asc`,
        { method: "GET", headers }
      );
      const pendRows = rPend.ok ? await rPend.json() : [];
      if (pendRows.length) {
        vinsFallback = pendRows.map(w => ({ vin: w.vin, tecnico: "Sin asignar", estado: "PENDIENTE" }));
      } else {
        const rMovil = await fetch(
          `${SUPABASE_URL}/rest/v1/movilizador_traslados?estado=neq.ENTREGADO_FINAL&select=vin,estado,trasladado_por&limit=30&order=trasladado_at.asc`,
          { method: "GET", headers }
        );
        vinsFallback = (rMovil.ok ? await rMovil.json() : []).map(t => ({
          vin:     t.vin,
          tecnico: t.trasladado_por || "Movilizador",
          estado:  t.estado || "EN ESPERA",
        }));
      }
    }

    return res.json({ ok: true, companeros, vins, vinsFallback, fallbackUsed: !vins.length, especialidad: esp, pairEsp: pairEsp || null });
  } catch (e) {
    console.error("[GET /api/tecnico/cola]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ── GET /api/tecnico/equipo-stats ────────────────────────────────────────────
// Compara por tasa diaria (conv / días trabajados) solo entre técnicos activos
// para una comparación justa (excluye inactivos con 0 conversiones).
app.get("/api/tecnico/equipo-stats", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const esp = String(req.query.especialidad || "").toUpperCase();
    if (!["MOTOR", "TANQUE"].includes(esp))
      return res.json({ ok: true, avgDailyRate: 0, activeTechs: 0, totalTechs: 0 });

    const now = new Date();
    const day = now.getDay();
    const daysBack = day === 0 ? 6 : day - 1;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
    const mondaySince = monday.toISOString().split("T")[0] + "T00:00:00";

    const rUsers = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?rol=eq.TECNICO&especialidad=eq.${esp}&activo=eq.true&select=id`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const users = rUsers.ok ? await rUsers.json() : [];
    if (!users.length) return res.json({ ok: true, avgDailyRate: 0, activeTechs: 0, totalTechs: 0 });

    // Fetch with updated_at so we can count distinct working days per tech
    const rFin = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${esp}&estado_actual=eq.FINALIZADO&updated_at=gte.${encodeURIComponent(mondaySince)}&select=user_id,updated_at&limit=5000`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const finRows = rFin.ok ? await rFin.json() : [];

    // Group by user: count finalizadas + distinct working days
    const byUser = {};
    for (const row of finRows) {
      if (!byUser[row.user_id]) byUser[row.user_id] = { count: 0, days: new Set() };
      byUser[row.user_id].count++;
      if (row.updated_at) byUser[row.user_id].days.add(row.updated_at.split("T")[0]);
    }

    // Daily rate per active tech (only those with >= 1 conversion this week)
    const rates = Object.values(byUser).map(u => u.count / Math.max(u.days.size, 1));
    const activeTechs = rates.length;
    const avgDailyRate = activeTechs
      ? Math.round((rates.reduce((s, r) => s + r, 0) / activeTechs) * 10) / 10
      : 0;
    const medianDailyRate = activeTechs
      ? (() => { const s = [...rates].sort((a,b) => a-b); const m = Math.floor(s.length/2); return s.length % 2 ? s[m] : (s[m-1]+s[m])/2; })()
      : 0;

    return res.json({
      ok: true,
      avgDailyRate,
      medianDailyRate: Math.round(medianDailyRate * 10) / 10,
      activeTechs,
      totalTechs: users.length,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── POST /api/ml/train-vin-model ──────────────────────────────────────────────
// Entrena el modelo de inferencia de modelo vehicular desde la base de VINs.
// Estrategia: tabla de frecuencia por prefijo VIN (posiciones 1-9, 1-8, ..., 1-3).
// Dos VINs con el mismo prefijo de 9 chars son el mismo modelo/variante.
const VIN_MODEL_PATH = "./vin-model.json";

app.post("/api/ml/train-vin-model", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    // Fetch all VINs with known modelo
    let offset = 0, allVins = [];
    while (true) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vins?modelo=not.is.null&select=vin,modelo&limit=1000&offset=${offset}`,
        { method: "GET", headers: supabaseHeaders_() }
      );
      if (!r.ok) break;
      const batch = await r.json();
      if (!Array.isArray(batch) || !batch.length) break;
      allVins.push(...batch);
      if (batch.length < 1000) break;
      offset += 1000;
    }

    if (!allVins.length) return res.json({ ok: false, error: "Sin VINs con modelo conocido" });

    // Build prefix frequency table for lengths 3-9
    const prefixes = {};
    for (let len = 3; len <= 9; len++) prefixes[len] = {};

    for (const { vin, modelo } of allVins) {
      if (!vin || !modelo || vin.length < 3) continue;
      for (let len = 3; len <= Math.min(9, vin.length); len++) {
        const key = vin.slice(0, len).toUpperCase();
        if (!prefixes[len][key]) prefixes[len][key] = {};
        prefixes[len][key][modelo] = (prefixes[len][key][modelo] || 0) + 1;
      }
    }

    // Count unique models and prefixes
    const uniqueModels = new Set(allVins.map(v => v.modelo)).size;
    const model = {
      trained_at: new Date().toISOString(),
      total_vins: allVins.length,
      unique_models: uniqueModels,
      prefixes,
    };
    writeFileSync(VIN_MODEL_PATH, JSON.stringify(model));

    return res.json({ ok: true, total_vins: allVins.length, unique_models: uniqueModels });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── GET /api/ml/infer-vin-model?vin=XYZ ──────────────────────────────────────
app.get("/api/ml/infer-vin-model", (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    if (vin.length < 3) return res.json({ ok: false, error: "VIN demasiado corto" });
    if (!existsSync(VIN_MODEL_PATH))
      return res.json({ ok: false, error: "Modelo no entrenado aún. Ejecuta el entrenamiento primero." });

    const model = JSON.parse(readFileSync(VIN_MODEL_PATH, "utf8"));
    const prefixes = model.prefixes || {};

    // Longest-prefix match: try 9 chars down to 3
    for (let len = Math.min(9, vin.length); len >= 3; len--) {
      const key = vin.slice(0, len);
      const dist = prefixes[len]?.[key];
      if (!dist) continue;

      const total = Object.values(dist).reduce((s, c) => s + c, 0);
      const [bestModel, bestCount] = Object.entries(dist).sort((a, b) => b[1] - a[1])[0];
      const confidence = Math.round((bestCount / total) * 100);
      return res.json({
        ok: true,
        vin,
        modelo: bestModel,
        confidence,
        match_len: len,
        candidates: Object.entries(dist)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([m, c]) => ({ modelo: m, count: c, pct: Math.round(c/total*100) })),
      });
    }

    return res.json({ ok: true, vin, modelo: null, confidence: 0, match_len: 0, candidates: [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── POST /api/ml/train-pairing ────────────────────────────────────────────────
// Entrena el modelo de emparejamiento de técnicos por similitud de producción.
// Algoritmo: distancia euclidiana ponderada en espacio de 5 features normalizados.
// Features: tasa_diaria (40%), hora_pico (30%), tiempo_promedio (15%),
//           dispersión_horaria (10%), consistencia_diaria (5%).
const PAIRING_MODEL_PATH  = "./pairing-model.json";
const OMISIONES_PATH      = "./omisiones.json";

// ── Persistencia del modelo en Supabase (sobrevive reinicios de Render) ───────
// El filesystem efímero de Render borra archivos al reiniciar el dyno.
// Guardamos el modelo en la tabla ml_models de Supabase como respaldo.

async function savePairingModelToSupabase_(modelObj) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    await fetch(`${SUPABASE_URL}/rest/v1/ml_models`, {
      method:  "POST",
      headers: { ...supabaseHeaders_(), "Prefer": "resolution=merge-duplicates,return=minimal" },
      body:    JSON.stringify({ key: "pairing-model", data: modelObj, updated_at: new Date().toISOString() }),
    });
    console.log("[ML] Modelo de emparejamiento guardado en Supabase.");
  } catch (e) {
    console.warn("[ML] No se pudo guardar modelo en Supabase:", e.message);
  }
}

async function loadPairingModelFromSupabase_() {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/ml_models?key=eq.pairing-model&select=data,updated_at&limit=1`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    if (!r.ok) return false;
    const rows = await r.json();
    if (!rows.length || !rows[0]?.data) return false;
    writeFileSync(PAIRING_MODEL_PATH, JSON.stringify(rows[0].data));
    console.log(`[ML] Modelo restaurado desde Supabase (entrenado: ${rows[0].data.trained_at})`);
    return true;
  } catch (e) {
    console.warn("[ML] No se pudo restaurar modelo desde Supabase:", e.message);
    return false;
  }
}

// Distancia circular entre horas del día (0-23): normalizada a [0,1], máximo a 12h de diferencia.
const circHourDist_ = (ha, hb) => Math.min(Math.abs(ha - hb), 24 - Math.abs(ha - hb)) / 12;

// Próximo re-entrenamiento automático (ISO string, se actualiza al programar).
let nextAutoRetrainAt_ = null;

// ── Normalización canónica de modelo de vehículo ─────────────────────────────
// Convierte cualquier variante de texto (con comas, puntos, full/deluxe/etc.)
// al nombre canónico que usamos para agrupar en el ML.
function normalizeModelo_(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase().replace(/,/g, ".").replace(/\s+/g, " ");
  if (/X70/.test(s) || /^JETOUR\s+(MEC|AUT|FULL|DELUXE|CONFORT)/.test(s)) return "Jetour X70";
  if (/NEW\s+V3|\bV3\b/.test(s)) return "KYC V3";
  if (/NEW\s+V5|\bV5\b/.test(s)) return "KYC V5";
  if (/NEW\s+V7|\bV7\b/.test(s)) return "KYC V7";
  if (/NEW\s+X5|\bX5\b/.test(s)) return "KYC X5";
  if (/\bT3\b/.test(s)) return "KYC T3";
  if (/TERA/.test(s)) return "VW Tera";
  if (/SAVEIRO/.test(s)) return "VW Saveiro";
  return null; // no se puede normalizar
}

// Sugerencias pendientes por userId: qué vio el técnico en el popup.
// { suggestedIds: string[], mode: "pair"|"new_car", ts: number }
// Se guarda cuando suggest-next se llama; se consume en checkAndRecordOmision_.
const pendingSuggestions_ = new Map();

// Registra omisión en Supabase (tabla pairing_omisiones).
// Reglas:
//   mode="pair"    → omisión solo si el complementario del carro NO está en los IDs sugeridos.
//   mode="new_car" → omisión si el carro ya tiene un complementario trabajando.
//   sin sugerencia → complementario activo = omisión directa.
async function checkAndRecordOmision_(userId, nombre, rolTrabajo, workOrderId, vin) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const hdrs         = supabaseHeaders_();
    const complemento  = rolTrabajo === "MOTOR" ? "TANQUE" : rolTrabajo === "TANQUE" ? "MOTOR" : null;
    if (!complemento) return;

    // ¿Hay un complementario ACTIVO en este work_order?
    const rComp = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?work_order_id=eq.${workOrderId}&rol_trabajo=eq.${complemento}&activo=eq.true&estado_actual=neq.FINALIZADO&select=id,user_id`,
      { method: "GET", headers: hdrs }
    );
    const compRows = rComp.ok ? await rComp.json() : [];

    if (!compRows.length) { pendingSuggestions_.delete(userId); return; }

    const complementUserId = compRows[0]?.user_id;
    const suggestion = pendingSuggestions_.get(userId);
    const TWO_HOURS  = 2 * 60 * 60 * 1000;
    const isRecent   = suggestion && (Date.now() - suggestion.ts) < TWO_HOURS;

    let isOmision = false;
    let modeUsed  = "sin_sugerencia";

    if (isRecent) {
      modeUsed = suggestion.mode;
      isOmision = suggestion.mode === "new_car"
        ? true
        : !suggestion.suggestedIds.includes(complementUserId);
    } else {
      isOmision = true;
    }

    pendingSuggestions_.delete(userId);
    if (!isOmision) {
      console.log(`[OMISION] ${nombre} ok — complementario sugerido (modo: ${modeUsed})`);
      return;
    }

    // Obtener modelo del VIN para enriquecer el registro
    let modelo = null;
    try {
      const rVin = await fetch(
        `${SUPABASE_URL}/rest/v1/vins?vin=eq.${encodeURIComponent(vin)}&select=modelo&limit=1`,
        { method: "GET", headers: hdrs }
      );
      modelo = rVin.ok ? (await rVin.json())[0]?.modelo || null : null;
    } catch {}

    await fetch(`${SUPABASE_URL}/rest/v1/pairing_omisiones`, {
      method:  "POST",
      headers: { ...hdrs, "Prefer": "return=minimal" },
      body:    JSON.stringify({
        user_id:       userId,
        nombre,
        rol_trabajo:   rolTrabajo,
        work_order_id: workOrderId,
        vin,
        modelo,
        mode:          modeUsed,
        suggested_ids: suggestion?.suggestedIds || [],
        complement_id: complementUserId || null,
      }),
    });
    console.log(`[OMISION] ${nombre} (${rolTrabajo}) VIN=${vin} modelo=${modelo} modo=${modeUsed}`);
  } catch (err) {
    console.warn("[OMISION] Error al registrar:", err.message);
  }
}

app.post("/api/ml/train-pairing", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;

    const rUsers = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?rol=eq.TECNICO&activo=eq.true&select=id,nombre,email,especialidad`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const users = rUsers.ok ? await rUsers.json() : [];
    if (!users.length) return res.json({ ok: false, error: "Sin técnicos activos" });

    const since90 = new Date(Date.now() - 90 * 86400000).toISOString();
    const rFin = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?estado_actual=eq.FINALIZADO&updated_at=gte.${encodeURIComponent(since90)}&select=user_id,updated_at,tiempo_trab_ms,work_order_id&limit=5000`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const finRows = rFin.ok ? await rFin.json() : [];

    // Enriquecer con modelo del carro: asignaciones → work_orders → vins
    const woIds = [...new Set(finRows.map(r => r.work_order_id).filter(Boolean))];
    const woVinMap = {};
    for (let i = 0; i < woIds.length; i += 200) {
      const batch = woIds.slice(i, i + 200);
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/work_orders?id=in.(${batch.join(",")})&select=id,vin`,
        { method: "GET", headers: supabaseHeaders_() }
      );
      if (r.ok) (await r.json()).forEach(wo => { woVinMap[wo.id] = wo.vin; });
    }
    const vinList = [...new Set(Object.values(woVinMap).filter(Boolean))];
    const vinModelMap = {};
    for (let i = 0; i < vinList.length; i += 200) {
      const batch = vinList.slice(i, i + 200);
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vins?vin=in.(${batch.map(v => encodeURIComponent(v)).join(",")})&select=vin,modelo,modelo_normalizado`,
        { method: "GET", headers: supabaseHeaders_() }
      );
      if (r.ok) (await r.json()).forEach(v => {
        // Preferir modelo_normalizado; si no existe, normalizar on-the-fly desde modelo
        vinModelMap[v.vin] = v.modelo_normalizado || normalizeModelo_(v.modelo) || v.modelo || null;
      });
    }
    // Fallback: para VINs sin modelo en DB, intentar inferir con el modelo VIN entrenado
    if (existsSync(VIN_MODEL_PATH)) {
      try {
        const vinInfModel = JSON.parse(readFileSync(VIN_MODEL_PATH, "utf8"));
        const vinPrefixes = vinInfModel.prefixes || {};
        let inferred = 0;
        for (const vin of vinList) {
          if (vinModelMap[vin]) continue;
          for (let len = Math.min(9, vin.length); len >= 3; len--) {
            const key = vin.slice(0, len).toUpperCase();
            const dist = vinPrefixes[len]?.[key];
            if (!dist) continue;
            const total = Object.values(dist).reduce((s, c) => s + c, 0);
            const [bestModel, bestCount] = Object.entries(dist).sort((a, b) => b[1] - a[1])[0];
            if (Math.round((bestCount / total) * 100) >= 70) { vinModelMap[vin] = bestModel; inferred++; }
            break;
          }
        }
        if (inferred) console.log(`[ML-TRAIN] ${inferred} VINs sin modelo inferidos con vin-model.json`);
      } catch {}
    }

    for (const row of finRows) {
      const woVin = woVinMap[row.work_order_id];
      row.modelo = woVin ? (vinModelMap[woVin] || null) : null;
    }

    const byUser     = {};
    const byUserModel = {};   // { userId: { modelo: [rows] } }
    for (const row of finRows) {
      if (!byUser[row.user_id]) byUser[row.user_id] = [];
      byUser[row.user_id].push(row);
      if (row.modelo) {
        if (!byUserModel[row.user_id]) byUserModel[row.user_id] = {};
        if (!byUserModel[row.user_id][row.modelo]) byUserModel[row.user_id][row.modelo] = [];
        byUserModel[row.user_id][row.modelo].push(row);
      }
    }

    // ── Feature extraction (reutilizable para base y reciente) ──────────────
    function computeFeatures(rows) {
      if (rows.length < 3) return null;
      const byDay = {};
      rows.forEach(r => { const d = r.updated_at?.split("T")[0]; if (d) byDay[d] = (byDay[d] || 0) + 1; });
      const dayCounts = Object.values(byDay);
      if (!dayCounts.length) return null;
      const dailyRate = dayCounts.reduce((s, c) => s + c, 0) / dayCounts.length;
      const dayStd = Math.sqrt(dayCounts.reduce((s, c) => s + (c - dailyRate) ** 2, 0) / dayCounts.length);
      const consistency = dailyRate > 0 ? dayStd / dailyRate : 1;
      const times = rows.map(r => Number(r.tiempo_trab_ms)).filter(t => t > 0 && t < 28800000);
      const avgMs = times.length ? times.reduce((s, t) => s + t, 0) / times.length : 0;
      const hours = rows.map(r => r.updated_at ? new Date(r.updated_at).getHours() : -1).filter(h => h >= 0);
      const sortedHours = [...hours].sort((a, b) => a - b);
      const peakHour = sortedHours[Math.floor(sortedHours.length / 2)] ?? 12;
      const hourMean = hours.reduce((s, h) => s + h, 0) / (hours.length || 1);
      const hourStd = Math.sqrt(hours.reduce((s, h) => s + (h - hourMean) ** 2, 0) / (hours.length || 1));
      return { dailyRate, consistency, avgMs, peakHour, hourStd, totalRows: rows.length, workingDays: dayCounts.length };
    }

    // ── Recency blending: mezcla modelo base (90d) con últimos 7 días ────────
    // Idea: los últimos 7 días tienen mayor peso (α=0.65) porque reflejan
    // la forma actual del técnico. El modelo base (0.35) aporta estabilidad
    // ante semanas atípicas. Si no hay datos recientes suficientes, usa base.
    const BLEND_ALPHA   = 0.65;   // peso de los últimos 7 días
    const MIN_RECENT    = 5;      // mínimo de asignaciones recientes para blend
    const TREND_UP_THR  = 1.10;   // +10% respecto a base → tendencia ascendente
    const TREND_DN_THR  = 0.90;   // −10% → tendencia descendente
    const since7ms      = Date.now() - 7 * 86400000;

    const techFeatures = [];
    for (const user of users) {
      const allRows    = byUser[user.id] || [];
      const baseFeats  = computeFeatures(allRows);
      if (!baseFeats) continue;

      const recentRows  = allRows.filter(r => new Date(r.updated_at).getTime() >= since7ms);
      const recentFeats = recentRows.length >= MIN_RECENT ? computeFeatures(recentRows) : null;

      // Blend adaptivo: más datos recientes → más peso reciente (escala MIN_RECENT→0.35 hasta 30→BLEND_ALPHA)
      const adaptiveAlpha = recentFeats
        ? Math.min(BLEND_ALPHA, 0.35 + (recentRows.length - MIN_RECENT) / Math.max(30 - MIN_RECENT, 1) * (BLEND_ALPHA - 0.35))
        : 0;
      const features = recentFeats
        ? Object.fromEntries(
            ["dailyRate", "consistency", "avgMs", "peakHour", "hourStd"].map(k => [
              k, adaptiveAlpha * (recentFeats[k] ?? baseFeats[k]) + (1 - adaptiveAlpha) * baseFeats[k],
            ])
          )
        : { ...baseFeats };
      features.workingDays  = baseFeats.workingDays;
      features.totalRows    = baseFeats.totalRows;
      features.recentRows   = recentRows.length;

      // Tendencia: compara tasa diaria reciente vs histórica
      const trend = recentFeats
        ? (recentFeats.dailyRate > baseFeats.dailyRate * TREND_UP_THR ? "up"
          : recentFeats.dailyRate < baseFeats.dailyRate * TREND_DN_THR ? "down"
          : "stable")
        : "unknown";

      const trendPct = recentFeats
        ? Math.round(((recentFeats.dailyRate - baseFeats.dailyRate) / Math.max(baseFeats.dailyRate, 0.1)) * 100)
        : 0;

      // Features por modelo: mismo blend pero segmentado por tipo de carro
      const modelFeatsMap = {};
      for (const [modelo, rows] of Object.entries(byUserModel[user.id] || {})) {
        if (rows.length < 8) continue;   // mínimo 8 asignaciones para features confiables por modelo
        const mBase   = computeFeatures(rows);
        const mRecent = rows.filter(r => new Date(r.updated_at).getTime() >= since7ms);
        const mRF     = mRecent.length >= MIN_RECENT ? computeFeatures(mRecent) : null;
        if (!mBase) continue;
        const mAlpha = mRF
          ? Math.min(BLEND_ALPHA, 0.35 + (mRecent.length - MIN_RECENT) / Math.max(30 - MIN_RECENT, 1) * (BLEND_ALPHA - 0.35))
          : 0;
        modelFeatsMap[modelo] = mRF
          ? Object.fromEntries(
              ["dailyRate","consistency","avgMs","peakHour","hourStd"].map(k => [
                k, mAlpha * (mRF[k] ?? mBase[k]) + (1 - mAlpha) * mBase[k],
              ])
            )
          : { ...mBase };
        modelFeatsMap[modelo].sampleCount = rows.length;
      }

      techFeatures.push({
        id: user.id, nombre: user.nombre, email: user.email, especialidad: user.especialidad,
        features, trend, trendPct,
        baseFeatures: baseFeats, recentFeatures: recentFeats,
        modelFeatures: modelFeatsMap,
      });
    }
    if (!techFeatures.length) return res.json({ ok: false, error: "Sin datos suficientes para entrenar" });

    // Normalizar features globales a [0,1] usando maxes entre todos los técnicos
    const KEYS = ["dailyRate", "avgMs", "peakHour", "hourStd", "consistency"];
    const maxes = {};
    for (const k of KEYS) maxes[k] = Math.max(...techFeatures.map(t => t.features[k] || 0), 1e-9);
    for (const tech of techFeatures) {
      tech.normalized = {};
      for (const k of KEYS) tech.normalized[k] = (tech.features[k] || 0) / maxes[k];

      // Normalizar features por modelo usando los MISMOS maxes globales → comparables
      tech.modelNormalized = {};
      for (const [modelo, mf] of Object.entries(tech.modelFeatures || {})) {
        tech.modelNormalized[modelo] = {};
        for (const k of KEYS) tech.modelNormalized[modelo][k] = (mf[k] || 0) / maxes[k];
        tech.modelNormalized[modelo].sampleCount = mf.sampleCount || 0;
      }
    }

    // Construir índice modelFeatures: { userId: { modelo: normalizedFeatures } }
    const modelFeaturesIndex = {};
    for (const tech of techFeatures) {
      if (Object.keys(tech.modelNormalized).length) {
        modelFeaturesIndex[tech.id] = tech.modelNormalized;
      }
    }

    const modelPayload = {
      trained_at: new Date().toISOString(),
      blend_alpha: BLEND_ALPHA,
      recent_days: 7,
      total_techs: techFeatures.length,
      maxes,
      modelFeaturesIndex,
      techs: techFeatures.map(t => ({
        user_id: t.id, nombre: t.nombre, email: t.email, especialidad: t.especialidad,
        features: t.features, normalized: t.normalized,
        trend: t.trend, trendPct: t.trendPct,
        baseFeatures: t.baseFeatures, recentFeatures: t.recentFeatures,
        modelFeatures: t.modelFeatures, modelNormalized: t.modelNormalized,
      })),
    };
    writeFileSync(PAIRING_MODEL_PATH, JSON.stringify(modelPayload));
    // Persistir en Supabase para sobrevivir reinicios de Render
    await savePairingModelToSupabase_(modelPayload);

    const trends = { up: 0, down: 0, stable: 0, unknown: 0 };
    for (const t of techFeatures) trends[t.trend] = (trends[t.trend] || 0) + 1;

    return res.json({
      ok: true,
      total_techs: techFeatures.length,
      motor:  techFeatures.filter(t => t.especialidad === "MOTOR").length,
      tanque: techFeatures.filter(t => t.especialidad === "TANQUE").length,
      blend_alpha: BLEND_ALPHA,
      trends,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── GET /api/ml/suggest-pair?email=xxx ───────────────────────────────────────
// Devuelve TODOS los candidatos de especialidad opuesta rankeados por similitud
// + la sugerencia principal si hay un candidato claramente mejor.
app.get("/api/ml/suggest-pair", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.json({ ok: false, error: "Email requerido" });
    if (!existsSync(PAIRING_MODEL_PATH)) await loadPairingModelFromSupabase_();
    if (!existsSync(PAIRING_MODEL_PATH))
      return res.json({ ok: true, suggestion: null, ranked: [], reason: "model_not_trained" });

    const model = JSON.parse(readFileSync(PAIRING_MODEL_PATH, "utf8"));
    const techs = model.techs || [];

    const me = techs.find(t => t.email?.toLowerCase() === email);
    if (!me) return res.json({ ok: true, suggestion: null, ranked: [], reason: "not_in_model" });

    const myEsp   = me.especialidad?.toUpperCase();
    const pairEsp = myEsp === "MOTOR" ? "TANQUE" : myEsp === "TANQUE" ? "MOTOR" : null;
    if (!pairEsp) return res.json({ ok: true, suggestion: null, ranked: [] });

    const candidates = techs.filter(t => t.especialidad?.toUpperCase() === pairEsp);
    if (!candidates.length) return res.json({ ok: true, suggestion: null, ranked: [] });

    const W = { dailyRate: 0.40, peakHour: 0.30, avgMs: 0.15, hourStd: 0.10, consistency: 0.05 };
    const calcDist = (a, b) => Math.sqrt(
      Object.entries(W).reduce((s, [k, w]) => {
        const d = k === 'peakHour'
          ? circHourDist_(a.features?.peakHour || 0, b.features?.peakHour || 0)
          : (a.normalized[k]||0) - (b.normalized[k]||0);
        return s + w * d * d;
      }, 0)
    );

    const ranked = candidates
      .map(c => {
        const d = calcDist(me, c);
        const sim = Math.round((1 - d) * 100);
        const bF = c.features, myF = me.features;
        const reasons = [];
        if (bF && myF) {
          if (Math.abs(myF.dailyRate - bF.dailyRate) / Math.max(myF.dailyRate, 1) < 0.25)
            reasons.push(`ritmo ~${bF.dailyRate.toFixed(1)} conv./día`);
          if (Math.abs(myF.peakHour - bF.peakHour) <= 2)
            reasons.push(`horario ~${bF.peakHour}:00h`);
          if (bF.avgMs && Math.abs(myF.avgMs - bF.avgMs) / Math.max(myF.avgMs, 1) < 0.30)
            reasons.push(`velocidad ~${Math.round(bF.avgMs/60000)}min/conv.`);
        }
        return {
          user_id: c.user_id,
          nombre: c.nombre,
          especialidad: c.especialidad,
          similarity: sim,
          distance: Math.round(d * 1000) / 1000,
          features: c.features ? {
            dailyRate:  Math.round((c.features.dailyRate || 0) * 10) / 10,
            peakHour:   c.features.peakHour || 0,
            avgMs:      Math.round((c.features.avgMs || 0) / 60000),
            workingDays: c.features.workingDays || 0,
            totalRows:   c.features.totalRows || 0,
          } : null,
          reasons,
        };
      })
      .sort((a, b) => a.distance - b.distance);

    // Best suggestion: only if clear winner
    let suggestion = null;
    if (ranked.length >= 2) {
      const best = ranked[0], second = ranked[1];
      if (best.distance <= 0.45 && best.distance < second.distance * 0.78)
        suggestion = ranked[0];
    } else if (ranked.length === 1 && ranked[0].distance <= 0.45) {
      suggestion = ranked[0];
    }

    return res.json({ ok: true, suggestion, ranked, myFeatures: me.features });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── GET /api/ml/suggest-next?email=xxx ───────────────────────────────────────
// Lógica de sugerencia:
//   1. Encuentra complementarios YA TRABAJANDO en un carro que AÚN NO TIENE su dupla.
//   2. Calcula el top-3 del ML para el técnico solicitante (todos los complementarios).
//   3. Intersección: solo sugiere a quien esté trabajando solo Y esté en el top-3 ML.
//   4. Si la intersección es vacía → mode="new_car" (nadie compatible está solo).
//   Sin modelo ML: muestra hasta 3 trabajando-solos sin filtro de similitud (fallback).
app.get("/api/ml/suggest-next", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.json({ ok: false, error: "Email requerido" });

    // Cargar modelo (puede no existir)
    let model = null;
    let me    = null;
    if (existsSync(PAIRING_MODEL_PATH)) {
      try { model = JSON.parse(readFileSync(PAIRING_MODEL_PATH, "utf8")); } catch {}
      me = model?.techs?.find(t => t.email?.toLowerCase() === email);
    }

    // Obtener userId y especialidad del técnico solicitante
    const rUser = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}&activo=eq.true&select=id,nombre,especialidad`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const userRows = rUser.ok ? await rUser.json() : [];
    const userRow  = userRows[0];
    if (!userRow) return res.json({ ok: false, error: "Usuario no encontrado" });

    const myUserId = userRow.id;
    const myEsp    = (userRow.especialidad || me?.especialidad || "").toUpperCase();
    const pairEsp  = myEsp === "MOTOR" ? "TANQUE" : myEsp === "TANQUE" ? "MOTOR" : null;
    if (!pairEsp) return res.json({ ok: true, suggestions: [], mode: "new_car" });

    // ── Paso 1: complementarios trabajando en carros sin su dupla ────────────
    const [rPairActive, rMyActive] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${pairEsp}&activo=eq.true&estado_actual=neq.FINALIZADO&select=user_id,work_order_id`,
        { method: "GET", headers: supabaseHeaders_() }),
      fetch(`${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${myEsp}&activo=eq.true&estado_actual=neq.FINALIZADO&select=work_order_id`,
        { method: "GET", headers: supabaseHeaders_() }),
    ]);
    const pairActiveRows = rPairActive.ok ? await rPairActive.json() : [];
    const myActiveWoIds  = new Set((rMyActive.ok ? await rMyActive.json() : []).map(a => a.work_order_id));

    const soloRows = pairActiveRows.filter(a => !myActiveWoIds.has(a.work_order_id));
    const soloByUser = {};   // userId → work_order_id
    soloRows.forEach(a => { soloByUser[a.user_id] = a.work_order_id; });
    const soloUserIds = new Set(Object.keys(soloByUser));

    // ── Paso 1b: obtener el modelo del carro de cada trabajador-solo ──────────
    // work_order_id → vin → modelo (para usar features por modelo en la similitud)
    const soloWoIds = [...new Set(Object.values(soloByUser))];
    const soloWoVin = {};   // work_order_id → vin
    const soloWoModelo = {}; // work_order_id → modelo
    if (soloWoIds.length) {
      const rWo = await fetch(
        `${SUPABASE_URL}/rest/v1/work_orders?id=in.(${soloWoIds.join(",")})&select=id,vin`,
        { method: "GET", headers: supabaseHeaders_() }
      );
      if (rWo.ok) (await rWo.json()).forEach(wo => { soloWoVin[wo.id] = wo.vin; });

      const soloVins = [...new Set(Object.values(soloWoVin).filter(Boolean))];
      if (soloVins.length) {
        const rVins = await fetch(
          `${SUPABASE_URL}/rest/v1/vins?vin=in.(${soloVins.map(v => encodeURIComponent(v)).join(",")})&select=vin,modelo,modelo_normalizado`,
          { method: "GET", headers: supabaseHeaders_() }
        );
        const vinModelMap = {};
        if (rVins.ok) (await rVins.json()).forEach(v => {
          // Usar modelo_normalizado si existe, si no normalizar on-the-fly, si no usar raw
          vinModelMap[v.vin] = v.modelo_normalizado || normalizeModelo_(v.modelo) || v.modelo || null;
        });
        for (const [woId, vin] of Object.entries(soloWoVin)) {
          soloWoModelo[woId] = vinModelMap[vin] || null;
        }
      }
    }

    // ── Paso 2: ML con features por modelo ────────────────────────────────────
    const W = { dailyRate: 0.40, peakHour: 0.30, avgMs: 0.15, hourStd: 0.10, consistency: 0.05 };
    const calcDist = (aNorm, bNorm, aPeakH, bPeakH) => Math.sqrt(
      Object.entries(W).reduce((s, [k, w]) => {
        const d = k === 'peakHour'
          ? circHourDist_(aPeakH || 0, bPeakH || 0)
          : (aNorm[k]||0) - (bNorm[k]||0);
        return s + w * d * d;
      }, 0)
    );

    // Devuelve features normalizadas para un técnico, prefiriendo las del modelo si existen
    const mfi = model?.modelFeaturesIndex || {};
    const getNorm  = (techEntry, modelo) =>
      (modelo && mfi[techEntry?.user_id]?.[modelo]) || techEntry?.normalized || {};
    const getPeakH = (techEntry, modelo) =>
      (modelo && techEntry?.modelFeatures?.[modelo]?.peakHour) ?? techEntry?.features?.peakHour ?? 0;

    let suggestions = [];

    if (me && model) {
      const mlCandidates = model.techs?.filter(t => t.especialidad?.toUpperCase() === pairEsp) || [];

      // Para cada candidato que trabaja solo, calcular similitud usando el modelo de SU carro
      const rankedSolo = mlCandidates
        .filter(t => t.user_id && soloUserIds.has(t.user_id))
        .map(t => {
          const woId    = soloByUser[t.user_id];
          const modelo  = soloWoModelo[woId] || null;
          // Similitud: mis features para ese modelo vs. las del candidato para ese modelo
          const myNorm   = getNorm(me,  modelo);
          const canNorm  = getNorm(t,   modelo);
          const myPeakH  = getPeakH(me, modelo);
          const canPeakH = getPeakH(t,  modelo);
          const sim      = Math.round((1 - calcDist(myNorm, canNorm, myPeakH, canPeakH)) * 100);
          return { userId: t.user_id, sim, modelo, ml: t };
        })
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 3);

      const candIds = rankedSolo.map(c => c.userId);
      const rCandUsers = candIds.length ? await fetch(
        `${SUPABASE_URL}/rest/v1/usuarios?id=in.(${candIds.join(",")})&select=id,nombre`,
        { method: "GET", headers: supabaseHeaders_() }
      ) : null;
      const candUserMap = {};
      if (rCandUsers?.ok) (await rCandUsers.json()).forEach(u => { candUserMap[u.id] = u.nombre; });

      for (const { userId, sim, modelo, ml } of rankedSolo) {
        const f = ml?.features;
        suggestions.push({
          id:           userId,
          nombre:       candUserMap[userId] || ml?.nombre || "",
          especialidad: pairEsp,
          modelo:       modelo,
          similarity:   sim,
          quality:      sim >= 85 ? "great" : sim >= 75 ? "good" : "ok",
          trend:        ml?.trend    || "unknown",
          trendPct:     ml?.trendPct || 0,
          features: f ? {
            dailyRate:   Math.round((f.dailyRate || 0) * 10) / 10,
            peakHour:    f.peakHour  || 0,
            avgMs:       Math.round((f.avgMs || 0) / 60000),
            workingDays: f.workingDays || 0,
          } : null,
          hasMLData: true,
        });
      }
    } else if (soloUserIds.size > 0) {
      // Sin modelo ML: fallback — mostrar trabajando-solos sin filtro
      const rSoloUsers = await fetch(
        `${SUPABASE_URL}/rest/v1/usuarios?id=in.(${[...soloUserIds].join(",")})&select=id,nombre`,
        { method: "GET", headers: supabaseHeaders_() }
      );
      (rSoloUsers.ok ? await rSoloUsers.json() : []).slice(0, 3).forEach(u => {
        const woId = soloByUser[u.id];
        suggestions.push({
          id: u.id, nombre: u.nombre || "", especialidad: pairEsp,
          modelo: soloWoModelo[woId] || null,
          similarity: 50, quality: "ok", trend: "unknown", trendPct: 0,
          features: null, hasMLData: false,
        });
      });
    }

    const mode         = suggestions.length === 0 ? "new_car" : "pair";
    const suggestedIds = suggestions.map(s => s.id).filter(Boolean);

    pendingSuggestions_.set(myUserId, { suggestedIds, mode, ts: Date.now() });

    return res.json({ ok: true, suggestions, pairEsp, totalSolo: soloUserIds.size, mode });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── GET /api/omisiones ───────────────────────────────────────────────────────
// Devuelve el conteo de omisiones por técnico (+ historial reciente).
app.get("/api/omisiones", (req, res) => {
  try {
    const data = readOmisiones_();
    const list = Object.entries(data)
      .map(([userId, d]) => ({ userId, nombre: d.nombre, total: d.total, history: (d.history || []).slice(-10) }))
      .sort((a, b) => b.total - a.total);
    res.json({ ok: true, omisiones: list });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// DELETE /api/omisiones/:userId  — resetea el contador de un técnico (uso admin)
app.delete("/api/omisiones/:userId", (req, res) => {
  try {
    const data = readOmisiones_();
    delete data[req.params.userId];
    writeOmisiones_(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── GET /api/ml/pairing-overview ─────────────────────────────────────────────
// Vista admin: matriz completa de similitud MOTOR × TANQUE + mejores pares
// + resultados por modelo de vehículo.
app.get("/api/ml/pairing-overview", async (req, res) => {
  try {
    if (!existsSync(PAIRING_MODEL_PATH)) await loadPairingModelFromSupabase_();
    if (!existsSync(PAIRING_MODEL_PATH))
      return res.json({ ok: false, error: "Modelo no entrenado. Ve a Admin → Configuración → Entrenar emparejamiento." });

    const model = JSON.parse(readFileSync(PAIRING_MODEL_PATH, "utf8"));
    const techs = model.techs || [];
    const motors  = techs.filter(t => t.especialidad?.toUpperCase() === "MOTOR");
    const tanques = techs.filter(t => t.especialidad?.toUpperCase() === "TANQUE");

    const W = { dailyRate: 0.40, peakHour: 0.30, avgMs: 0.15, hourStd: 0.10, consistency: 0.05 };
    const calcDistNorm = (na, nb, aPeakH, bPeakH) => Math.sqrt(
      Object.entries(W).reduce((s, [k, w]) => {
        const d = k === 'peakHour'
          ? circHourDist_(aPeakH || 0, bPeakH || 0)
          : (na[k]||0) - (nb[k]||0);
        return s + w * d * d;
      }, 0)
    );

    // Similarity matrix global [motorIdx][tanqueIdx]
    const matrix = motors.map(m =>
      tanques.map(t => Math.round((1 - calcDistNorm(m.normalized, t.normalized, m.features?.peakHour, t.features?.peakHour)) * 100))
    );

    // Best pair for each motor (global)
    const motorPairs = motors.map((m, mi) => {
      const sorted = tanques.map((t, ti) => ({ ...t, sim: matrix[mi][ti] })).sort((a, b) => b.sim - a.sim);
      return { motor: { user_id: m.user_id, nombre: m.nombre, features: m.features, trend: m.trend, trendPct: m.trendPct },
               best: sorted[0] ? { user_id: sorted[0].user_id, nombre: sorted[0].nombre, sim: sorted[0].sim, features: sorted[0].features, trend: sorted[0].trend, trendPct: sorted[0].trendPct } : null,
               all: sorted.map(t => ({ user_id: t.user_id, nombre: t.nombre, sim: t.sim })) };
    }).sort((a, b) => (b.best?.sim || 0) - (a.best?.sim || 0));

    // Best pair for each tanque (global)
    const tanquePairs = tanques.map((t, ti) => {
      const sorted = motors.map((m, mi) => ({ ...m, sim: matrix[mi][ti] })).sort((a, b) => b.sim - a.sim);
      return { tanque: { user_id: t.user_id, nombre: t.nombre, features: t.features, trend: t.trend, trendPct: t.trendPct },
               best: sorted[0] ? { user_id: sorted[0].user_id, nombre: sorted[0].nombre, sim: sorted[0].sim, features: sorted[0].features, trend: sorted[0].trend, trendPct: sorted[0].trendPct } : null };
    });

    // ── Resultados por modelo de vehículo ──────────────────────────────────
    const allModelos = new Set();
    for (const tech of techs) {
      for (const modelo of Object.keys(tech.modelNormalized || {})) allModelos.add(modelo);
    }

    const byModel = {};
    for (const modelo of allModelos) {
      const mMotors  = motors.filter(m => m.modelNormalized?.[modelo]);
      const mTanques = tanques.filter(t => t.modelNormalized?.[modelo]);
      if (!mMotors.length || !mTanques.length) continue;

      const mMatrix = mMotors.map(m =>
        mTanques.map(t => Math.round((1 - calcDistNorm(
          m.modelNormalized[modelo], t.modelNormalized[modelo],
          m.modelFeatures?.[modelo]?.peakHour, t.modelFeatures?.[modelo]?.peakHour
        )) * 100))
      );

      const mMotorPairs = mMotors.map((m, mi) => {
        const sorted = mTanques.map((t, ti) => ({ ...t, sim: mMatrix[mi][ti] })).sort((a, b) => b.sim - a.sim);
        return {
          motor: { user_id: m.user_id, nombre: m.nombre, features: m.modelFeatures?.[modelo], samples: m.modelNormalized[modelo]?.sampleCount || 0, trend: m.trend, trendPct: m.trendPct },
          best: sorted[0] ? { user_id: sorted[0].user_id, nombre: sorted[0].nombre, sim: sorted[0].sim, features: sorted[0].modelFeatures?.[modelo], trend: sorted[0].trend, trendPct: sorted[0].trendPct } : null,
          all: sorted.map(t => ({ user_id: t.user_id, nombre: t.nombre, sim: t.sim })),
        };
      }).sort((a, b) => (b.best?.sim || 0) - (a.best?.sim || 0));

      byModel[modelo] = {
        motors:    mMotors.map(m  => ({ user_id: m.user_id,  nombre: m.nombre,  features: m.modelFeatures?.[modelo],  samples: m.modelNormalized[modelo]?.sampleCount || 0, trend: m.trend,  trendPct: m.trendPct })),
        tanques:   mTanques.map(t => ({ user_id: t.user_id,  nombre: t.nombre,  features: t.modelFeatures?.[modelo],  samples: t.modelNormalized[modelo]?.sampleCount || 0, trend: t.trend,  trendPct: t.trendPct })),
        matrix:    mMatrix,
        motorPairs: mMotorPairs,
      };
    }

    return res.json({
      ok: true,
      trained_at: model.trained_at,
      next_auto_retrain: nextAutoRetrainAt_,
      total_techs: techs.length,
      motors:  motors.map(m => ({ user_id: m.user_id, nombre: m.nombre, features: m.features })),
      tanques: tanques.map(t => ({ user_id: t.user_id, nombre: t.nombre, features: t.features })),
      matrix,
      motorPairs,
      tanquePairs,
      byModel,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── GET /api/vins-sin-modelo ──────────────────────────────────────────────────
app.get("/api/vins-sin-modelo", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/vins?modelo=is.null&select=vin,cliente&limit=200&order=vin.asc`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const items = r.ok ? await r.json() : [];
    return res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// Lógica interna de normalización (reutilizada por el endpoint y el scheduler diario).
async function runNormalizarVins_(soloNuevos = false) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const hdrs = supabaseHeaders_();

  // Verificar que la columna existe
  const testR = await fetch(
    `${SUPABASE_URL}/rest/v1/vins?select=vin,modelo_normalizado&limit=1`,
    { method: "GET", headers: hdrs }
  );
  if (!testR.ok) return { ok: false, need_migration: true,
    sql: "ALTER TABLE vins ADD COLUMN IF NOT EXISTS modelo_normalizado text;\nCREATE INDEX IF NOT EXISTS idx_vins_modelo_normalizado ON vins(modelo_normalizado);",
    error: "Columna modelo_normalizado no existe. Ejecuta el SQL en Supabase Dashboard → SQL Editor." };

  // Filtro: todos los VINs con modelo, o solo los que aún no tienen normalizado
  const filter = soloNuevos
    ? "modelo=not.is.null&modelo_normalizado=is.null"
    : "modelo=not.is.null";

  let all = [], offset = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/vins?select=vin,modelo&${filter}&limit=1000&offset=${offset}`,
      { method: "GET", headers: hdrs }
    );
    const batch = r.ok ? await r.json() : [];
    if (!Array.isArray(batch) || !batch.length) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }

  // Agrupar por canónico → 1 PATCH por grupo
  const groups = {};
  let skipped = 0;
  for (const { vin, modelo } of all) {
    const norm = normalizeModelo_(modelo);
    if (!norm) { skipped++; continue; }
    if (!groups[norm]) groups[norm] = [];
    groups[norm].push(vin);
  }

  let updated = 0, failed = 0;
  const byNorm = {};
  const patchHdrs = { ...hdrs, "Content-Type": "application/json", "Prefer": "return=minimal" };
  for (const [norm, vins] of Object.entries(groups)) {
    byNorm[norm] = vins.length;
    for (let i = 0; i < vins.length; i += 200) {
      const batch = vins.slice(i, i + 200);
      const inClause = batch.map(v => encodeURIComponent(v)).join(",");
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vins?vin=in.(${inClause})`,
        { method: "PATCH", headers: patchHdrs, body: JSON.stringify({ modelo_normalizado: norm }) }
      );
      if (r.ok) updated += batch.length; else failed += batch.length;
    }
  }
  return { ok: true, total: all.length, updated, skipped, failed, byNorm };
}

// ── POST /api/admin/normalizar-vins ──────────────────────────────────────────
// ?solo_nuevos=1 → solo normaliza VINs donde modelo_normalizado IS NULL (incremental)
app.post("/api/admin/normalizar-vins", async (req, res) => {
  try {
    const soloNuevos = req.query.solo_nuevos === "1";
    const result = await runNormalizarVins_(soloNuevos);
    return res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});


// ── GET /api/admin/preview-normalizacion ─────────────────────────────────────
// Vista previa de cómo quedarían los modelos normalizados (sin modificar BD).
app.get("/api/admin/preview-normalizacion", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const hdrs = supabaseHeaders_();
    let rows = [], offset = 0;
    while (true) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vins?select=modelo&modelo=not.is.null&limit=1000&offset=${offset}`,
        { method: "GET", headers: hdrs }
      );
      const batch = r.ok ? await r.json() : [];
      if (!Array.isArray(batch) || !batch.length) break;
      rows.push(...batch);
      if (batch.length < 1000) break;
      offset += 1000;
    }
    const counts = {};
    for (const { modelo } of rows) {
      const norm = normalizeModelo_(modelo) || "⚠ sin mapeo";
      if (!counts[norm]) counts[norm] = { count: 0, examples: [] };
      counts[norm].count++;
      if (counts[norm].examples.length < 3) counts[norm].examples.push(modelo);
    }
    return res.json({ ok: true, total: rows.length, byNorm: counts });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── Auto-normalización diaria de VINs sin modelo_normalizado ─────────────────
// Corre cada 24h y solo toca los VINs nuevos (modelo_normalizado IS NULL).
function scheduleAutoNormalize_() {
  const DAILY_MS = 24 * 60 * 60 * 1000;
  setTimeout(async () => {
    try {
      console.log("[NORM-AUTO] Normalizando VINs nuevos sin modelo_normalizado…");
      const r = await runNormalizarVins_(true); // soloNuevos=true
      if (r.ok) {
        console.log(`[NORM-AUTO] OK · ${r.updated} actualizados · ${r.skipped} sin mapeo`);
      } else if (r.need_migration) {
        console.warn("[NORM-AUTO] Columna modelo_normalizado no existe, salteando.");
      } else {
        console.warn(`[NORM-AUTO] Error: ${r.error}`);
      }
    } catch (e) {
      console.error("[NORM-AUTO] Falla:", e.message);
    }
    scheduleAutoNormalize_(); // re-programar para mañana
  }, DAILY_MS);
}

// ── Auto re-entrenamiento de emparejamiento cada 3 días ──────────────────────
// El scheduler se re-programa a sí mismo tras cada ejecución para mantenerse
// alineado con el intervalo real (no con el uptime del servidor).
const RETRAIN_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 72 horas

function scheduleAutoRetrain_() {
  let delayMs = RETRAIN_INTERVAL_MS;
  if (existsSync(PAIRING_MODEL_PATH)) {
    try {
      const { trained_at } = JSON.parse(readFileSync(PAIRING_MODEL_PATH, "utf8"));
      const elapsed = Date.now() - new Date(trained_at).getTime();
      delayMs = Math.max(60_000, RETRAIN_INTERVAL_MS - elapsed); // mínimo 1 min
    } catch {}
  }
  nextAutoRetrainAt_ = new Date(Date.now() + delayMs).toISOString();
  const h = Math.round(delayMs / 3600000);
  console.log(`[ML-AUTO] Próximo re-entrenamiento en ${h}h (${new Date(nextAutoRetrainAt_).toLocaleString("es-PE")})`);

  setTimeout(async () => {
    try {
      console.log("[ML-AUTO] Iniciando re-entrenamiento automático de emparejamiento…");
      const r = await fetch(`http://localhost:${PORT}/api/ml/train-pairing`, { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        console.log(`[ML-AUTO] OK · ${j.total_techs} técnicos (motor:${j.motor} tanque:${j.tanque}) · tendencias up:${j.trends?.up} down:${j.trends?.down}`);
      } else {
        console.warn(`[ML-AUTO] Falla: ${j.error}`);
      }
    } catch (e) {
      console.error("[ML-AUTO] Error en re-entrenamiento:", e.message);
    }
    scheduleAutoRetrain_(); // re-programar para dentro de 3 días
  }, delayMs);
}

// ─── CONVERSION ZONAS ──────────────────────────────────────────────────────
// GET /api/zonas
// 15 zonas físicas + zona 16 virtual (VINs sin zona asignada).
// El estado de cada zona se computa desde work_orders en tiempo real.
app.get("/api/zonas", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // Fetch zones + active conversion OTs in parallel
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [zResp, convResp, finResp] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/conversion_zonas?select=zona_id,vin,registrado_por,registrado_at&order=zona_id.asc`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=neq.FINALIZADO&select=id,vin,estado_general&limit=200`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=eq.FINALIZADO&fecha_sin_calidad=gte.${todayStart.toISOString()}&select=id,vin,estado_general&limit=100`, { method: "GET", headers }),
    ]);

    const zonaRows = zResp.ok ? await zResp.json() : [];
    const convRows = convResp.ok ? await convResp.json() : [];
    const finRows  = finResp.ok  ? await finResp.json()  : [];

    // Build VIN → work_order estado map (latest OT wins)
    const woEstadoMap = new Map();
    for (const wo of [...convRows, ...finRows]) {
      if (wo.vin && !woEstadoMap.has(wo.vin)) woEstadoMap.set(wo.vin, wo.estado_general);
    }

    // Todos los VINs activos (en zonas físicas + en zona libre)
    const allVins = [...new Set([
      ...zonaRows.map(z => z.vin).filter(Boolean),
      ...[...woEstadoMap.keys()],
    ])];
    const allWos = [...convRows, ...finRows].filter(w => w.id && w.vin);

    // Fetch en paralelo: asignaciones activas + modelo_normalizado de VINs
    const [tecnicosMap, modeloMap] = await Promise.all([
      // VIN → { delantero, tanquero }
      (async () => {
        const map = new Map();
        if (!allWos.length) return map;
        try {
          const woIds = allWos.map(w => w.id).join(",");
          const asgResp = await fetch(
            `${SUPABASE_URL}/rest/v1/asignaciones?work_order_id=in.(${encodeURIComponent(woIds)})&activo=eq.true&select=work_order_id,user_id,rol_trabajo`,
            { method: "GET", headers }
          );
          const asgs = asgResp.ok ? await asgResp.json() : [];
          if (asgs.length) {
            const userIds = [...new Set(asgs.map(a => a.user_id))].join(",");
            const usrResp = await fetch(
              `${SUPABASE_URL}/rest/v1/usuarios?id=in.(${encodeURIComponent(userIds)})&select=id,nombre`,
              { method: "GET", headers }
            );
            const usrs = usrResp.ok ? await usrResp.json() : [];
            const userNombreMap = new Map(usrs.map(u => [u.id, u.nombre]));
            const woIdToVin = new Map(allWos.map(w => [w.id, w.vin]));
            for (const a of asgs) {
              const vin = woIdToVin.get(a.work_order_id);
              const nombre = userNombreMap.get(a.user_id);
              if (!vin || !nombre) continue;
              const primerNombre = String(nombre).trim().split(/\s+/)[0];
              const rol = String(a.rol_trabajo || "").toUpperCase();
              if (!map.has(vin)) map.set(vin, {});
              const entry = map.get(vin);
              if (rol === "MOTOR") entry.delantero = primerNombre;
              else if (rol === "TANQUE") entry.tanquero = primerNombre;
            }
          }
        } catch {}
        return map;
      })(),

      // VIN → modelo_normalizado
      (async () => {
        const map = new Map();
        if (!allVins.length) return map;
        try {
          const vinQ = allVins.map(v => encodeURIComponent(v)).join(",");
          const r = await fetch(
            `${SUPABASE_URL}/rest/v1/vins?vin=in.(${vinQ})&select=vin,modelo_normalizado&limit=200`,
            { method: "GET", headers }
          );
          const rows = r.ok ? await r.json() : [];
          for (const row of rows) {
            if (row.vin && row.modelo_normalizado) map.set(row.vin, row.modelo_normalizado);
          }
        } catch {}
        return map;
      })(),
    ]);

    // Compute estado for a zone
    function zonaEstado_(vin) {
      if (!vin) return "LIBRE";
      const eg = (woEstadoMap.get(vin) || "").toUpperCase();
      if (!eg) return "ESPERANDO";
      if (eg === "FINALIZADO") return "FINALIZADO";
      return "EN_CONVERSION";
    }

    const vinZonaSet = new Set();
    const zonas = zonaRows.map(z => {
      if (z.vin) vinZonaSet.add(z.vin);
      return {
        zona_id:       z.zona_id,
        vin:           z.vin || null,
        estado:        zonaEstado_(z.vin),
        registrado_por: z.registrado_por || "",
        registrado_at: z.registrado_at || null,
        tecnicos:      z.vin ? (tecnicosMap.get(z.vin) || null) : null,
        modelo:        z.vin ? (modeloMap.get(z.vin) || null) : null,
      };
    });

    // Zone 16: VINs in conversion flow but not assigned to any physical zone
    const sin_zona = [];
    for (const [vin, eg] of woEstadoMap) {
      if (!vinZonaSet.has(vin)) {
        sin_zona.push({
          vin,
          estado: (eg || "").toUpperCase() === "FINALIZADO" ? "FINALIZADO" : "EN_CONVERSION",
          tecnicos: tecnicosMap.get(vin) || null,
          modelo:   modeloMap.get(vin) || null,
        });
      }
    }

    return res.json({ ok: true, zonas, sin_zona });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/zonas/asignar
// body: { zona_id (1-15 o 16=sin ubicación), vin, usuario }
app.post("/api/zonas/asignar", async (req, res) => {
  try {
    const { vin, zona_id, usuario } = req.body || {};
    if (!vin) return res.status(400).json({ ok: false, error: "Falta vin" });
    const vinNorm = String(vin).trim().toUpperCase();
    const zonaNum = Number(zona_id);
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const now = new Date().toISOString();
    const userName = String(usuario || "").trim() || "Sistema";

    // 1. Quitar el VIN de cualquier zona donde esté actualmente
    await fetch(
      `${SUPABASE_URL}/rest/v1/conversion_zonas?vin=eq.${encodeURIComponent(vinNorm)}`,
      {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ vin: null, registrado_por: "", registrado_at: null, updated_at: now }),
      }
    );

    // 2. Si zona 1-15, asignar a esa zona (desplaza al anterior si la ocupa)
    if (zonaNum >= 1 && zonaNum <= 15) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/conversion_zonas?zona_id=eq.${zonaNum}`,
        {
          method: "PATCH",
          headers: { ...headers, "Prefer": "return=minimal" },
          body: JSON.stringify({ vin: vinNorm, registrado_por: userName, registrado_at: now, updated_at: now }),
        }
      );
      if (!r.ok) throw new Error("Error al asignar zona");
    }
    // zona_id=16 = sin ubicación → ya se limpió en paso 1, no hay más acción

    return res.json({ ok: true, zona_id: zonaNum >= 1 && zonaNum <= 15 ? zonaNum : 16 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/zonas/liberar
// body: { zona_id (1-15), usuario }
app.post("/api/zonas/liberar", async (req, res) => {
  try {
    const { zona_id } = req.body || {};
    const zonaNum = Number(zona_id);
    if (!zonaNum || zonaNum < 1 || zonaNum > 15)
      return res.status(400).json({ ok: false, error: "zona_id inválido (1-15)" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const now = new Date().toISOString();

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/conversion_zonas?zona_id=eq.${zonaNum}`,
      {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ vin: null, registrado_por: "", registrado_at: null, updated_at: now }),
      }
    );
    if (!r.ok) throw new Error("Error al liberar zona");
    return res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/zonas/vin/:vin
// Devuelve la zona asignada a un VIN (null = zona 16 / sin ubicación)
app.get("/api/zonas/vin/:vin", async (req, res) => {
  try {
    const vin = String(req.params.vin || "").trim().toUpperCase();
    if (!vin) return res.status(400).json({ ok: false, error: "Falta vin" });
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/conversion_zonas?vin=eq.${encodeURIComponent(vin)}&select=zona_id`,
      { method: "GET", headers }
    );
    const rows = r.ok ? await r.json() : [];
    return res.json({ ok: true, vin, zona_id: rows.length ? rows[0].zona_id : null });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// -----------------------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Ábrelo desde tu celular con: http://192.168.18.121:${PORT}`);
  // Restaurar modelo de emparejamiento desde Supabase si el FS efímero lo borró
  if (!existsSync(PAIRING_MODEL_PATH)) {
    loadPairingModelFromSupabase_().catch(() => {});
  }
  scheduleAutoRetrain_();   // re-entrenamiento cada 3 días
  scheduleAutoNormalize_(); // normalización incremental cada 24h
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
