// =========================
// public/js/core/supabase-client.js
// Cliente Supabase para lectura/escritura
// Migración paralela: AppScript + Supabase
// =========================

import { cfg } from "./config.js";

const _env = (typeof window !== "undefined" && window.__ENV__) || {};
export const SUPABASE_CONFIG = {
  URL: import.meta.env?.VITE_SUPABASE_URL || _env.VITE_SUPABASE_URL || "",
  ANON_KEY: import.meta.env?.VITE_SUPABASE_ANON_KEY || _env.VITE_SUPABASE_ANON_KEY || "",
};

/**
 * Chequea si Supabase está configurado
 */
export function supabaseEnabled() {
  return !!(SUPABASE_CONFIG.URL && SUPABASE_CONFIG.ANON_KEY);
}

/**
 * Headers estándar para Supabase
 */
function supabaseHeaders() {
  return {
    "apikey": SUPABASE_CONFIG.ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
}

/**
 * Construye query string para Supabase REST API
 * Soporta operadores: eq, neq, gt, gte, lt, lte, in, is, like
 * 
 * Ejemplo:
 *   buildQuery({ user_id: 'xxx', activo: true })
 *     → "?user_id=eq.xxx&activo=eq.true"
 * 
 *   buildQuery({ 
 *     user_id: 'xxx', 
 *     estado: { op: 'neq', val: 'FINALIZADO' }
 *   })
 *     → "?user_id=eq.xxx&estado=neq.FINALIZADO"
 */
function buildQuery(filter = {}) {
  const parts = [];
  Object.entries(filter || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    
    let op = "eq";
    let val = value;
    
    // Soportar filtros complejos: { op: "neq", val: "..." }
    if (value && typeof value === "object" && value.op && value.val !== undefined) {
      op = value.op;
      val = value.val;
    }
    
    // Operadores especiales
    if (Array.isArray(val) && op === "in") {
      // in filter para arrays
      val = `(${val.map(v => `"${v}"`).join(",")})`;
    } else if (typeof val === "boolean") {
      val = String(val);
    } else if (op !== "in") {
      val = String(val);
    }
    
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(op)}.${encodeURIComponent(val)}`);
  });
  return parts.length ? ("?" + parts.join("&")) : "";
}

/**
 * GET desde Supabase
 *
 * @param {string} table
 * @param {object} filter  filtros (ver buildQuery)
 * @param {object} [opts]
 * @param {string} [opts.order]  ej. "created_at.desc" — ordenar EN la base
 * @param {number} [opts.limit]  tope de filas
 *
 * order/limit existen para no traer tablas enteras y recortarlas en el
 * navegador: la bitácora de inventario bajaba sus 185 filas (77 KB) para
 * pintar 40, y ese número solo sube con el tiempo.
 */
export async function supabaseGet(table, filter = {}, opts = {}) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const extra = [];
  if (opts.order) extra.push(`order=${encodeURIComponent(opts.order)}`);
  if (opts.limit) extra.push(`limit=${Number(opts.limit)}`);
  const qs = buildQuery(filter);
  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}${qs}` +
    (extra.length ? (qs ? "&" : "?") + extra.join("&") : "");

  const res = await fetch(url, {
    method: "GET",
    headers: supabaseHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase GET ${table}: ${res.status} ${text}`);
  }

  return await res.json();
}

/**
 * POST a Supabase (insertar)
 */
export async function supabasePost(table, data) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase POST ${table}: ${res.status} ${text}`);
  }

  return await res.json();
}

/**
 * PATCH a Supabase (actualizar)
 */
export async function supabasePatch(table, filter = {}, data) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}${buildQuery(filter)}`;
  
  const res = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders(),
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase PATCH ${table}: ${res.status} ${text}`);
  }

  return await res.json();
}

/**
 * DELETE a Supabase
 */
export async function supabaseDelete(table, filter = {}) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}${buildQuery(filter)}`;
  
  const res = await fetch(url, {
    method: "DELETE",
    headers: supabaseHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase DELETE ${table}: ${res.status} ${text}`);
  }

  return { ok: true };
}

/**
 * REALTIME SUBSCRIPTIONS (WebSockets)
 * Suscripción a cambios en tablas Supabase en tiempo real
 */

let realtimeSubscriptions = {}; // { tableName: { ws, listeners: [callbacks] } }

export async function subscribeToChanges(table, callback) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");
  
  // Si ya existe suscripción, solo agregar listener
  if (realtimeSubscriptions[table]) {
    realtimeSubscriptions[table].listeners.push(callback);
    return () => {
      realtimeSubscriptions[table].listeners = 
        realtimeSubscriptions[table].listeners.filter(l => l !== callback);
    };
  }
  
  // Crear nueva suscripción WebSocket
  const wsUrl = SUPABASE_CONFIG.URL.replace("https://", "wss://").replace("http://", "ws://") + "/realtime/v1";
  
  try {
    const ws = new WebSocket(`${wsUrl}?apikey=${SUPABASE_CONFIG.ANON_KEY}`);
    
    realtimeSubscriptions[table] = {
      ws,
      listeners: [callback],
      connected: false,
    };
    
    ws.onopen = () => {
      realtimeSubscriptions[table].connected = true;
      // Suscribirse al canal
      const subscribeMsg = {
        type: "subscribe",
        topic: `realtime:${table}`,
      };
      ws.send(JSON.stringify(subscribeMsg));
    };
    
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        // Filtrar mensajes del canal que nos interesa
        if (msg.topic !== `realtime:${table}`) return;
        
        // Eventos: INSERT, UPDATE, DELETE
        if (msg.type === "broadcast" || msg.type === "postgres_changes") {
          const payload = msg.payload || msg;
          if (payload.new || payload.old) {
            // Notificar a todos los listeners
            realtimeSubscriptions[table].listeners.forEach(cb => {
              try {
                cb(payload);
              } catch (e) {
                console.error(`[Realtime ${table}] Callback error:`, e.message);
              }
            });
          }
        }
      } catch (e) {
        console.warn(`[Realtime ${table}] Parse error:`, e.message);
      }
    };
    
    ws.onerror = (error) => {
      console.error(`[Realtime ${table}] WebSocket error:`, error);
      realtimeSubscriptions[table].connected = false;
    };
    
    ws.onclose = () => {
      console.warn(`[Realtime ${table}] Desconectado, reintentando en 5s...`);
      realtimeSubscriptions[table].connected = false;
      // Reintentar en 5 segundos
      setTimeout(() => subscribeToChanges(table, callback).catch(() => {}), 5000);
    };
    
    // Retornar función para cancelar la suscripción
    return () => {
      realtimeSubscriptions[table].listeners = 
        realtimeSubscriptions[table].listeners.filter(l => l !== callback);
      if (realtimeSubscriptions[table].listeners.length === 0) {
        realtimeSubscriptions[table].ws.close();
        delete realtimeSubscriptions[table];
      }
    };
  } catch (e) {
    console.error(`[Realtime ${table}] Error:`, e.message);
    throw e;
  }
}

/**
 * Obtener estado de todas las suscripciones
 */
export function getRealtimeStatus() {
  const status = {};
  Object.entries(realtimeSubscriptions).forEach(([table, sub]) => {
    status[table] = {
      connected: sub.connected,
      listeners: sub.listeners.length,
    };
  });
  return status;
}

// =========================
// HIGH-LEVEL QUERIES (reemplazan /api/*)
// =========================

/**
 * usuarioPorEmail_ — fila de `usuarios` del técnico, cacheada en memoria.
 *
 * Cuatro funciones de este archivo empezaban resolviendo el MISMO usuario por
 * email, y ninguna guardaba el resultado: getMisActivas corre cada 60 s y
 * getEstadoTrabajo cada 8 s cuando el VIN no está en la lista. Eran cientos de
 * viajes al día, por técnico, para releer una fila que no cambia — y el
 * comentario de getMisActivas ya afirmaba que el userId estaba cacheado
 * cuando no lo estaba.
 *
 * Lleva TTL en vez de ser eterno porque el Admin puede cambiar la especialidad
 * de alguien en caliente, y esa fila decide qué carros se le ofrecen: con un
 * cache de por vida, el técnico seguiría viendo la cola del rol equivocado
 * hasta cerrar sesión.
 */
const _usuarioCache = new Map(); // email → { row, ts }

async function usuarioPorEmail_(email) {
  const key = String(email || "").trim().toLowerCase();
  if (!key) return null;

  const ttl = Math.max(0, Number(cfg("CACHE_USUARIO_MS")) || 0);
  const hit = _usuarioCache.get(key);
  if (hit && (Date.now() - hit.ts) < ttl) return hit.row;

  const usuarios = await supabaseGet("usuarios", { email: key });
  const row = (usuarios && usuarios.length) ? usuarios[0] : null;
  // El fallo NO se cachea: si la fila no vino por un corte de red, cachear el
  // null dejaría al técnico sin app hasta que venza el TTL.
  if (row) _usuarioCache.set(key, { row, ts: Date.now() });
  return row;
}

/** Olvida el usuario cacheado (logout, cambio de cuenta). */
export function limpiarCacheUsuario_(email) {
  if (email) _usuarioCache.delete(String(email).trim().toLowerCase());
  else _usuarioCache.clear();
}

/**
 * GET /api/me — Obtener perfil de usuario
 */
export async function getUsuarioPerfil(email) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");
  
  const usuario = await usuarioPorEmail_(email);
  if (!usuario) return null;

  const modulos = await supabaseGet("usuario_modulos", { user_id: usuario.id });
  
  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    especialidad: usuario.especialidad,
    activo: usuario.activo,
    avatar_url: usuario.avatar_url || "",
    modulos: Array.isArray(modulos) ? modulos.map(m => m.modulo) : [],
  };
}

/**
 * GET /api/mis-activas — Obtener trabajos activos del usuario
 * ⚡ OPTIMIZADO: Filtra EN SUPABASE (no trae todo)
 */
export async function getMisActivas(email) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");
  
  // Obtener user_id (cacheado: no se relee en cada ciclo del poll)
  const usuario = await usuarioPorEmail_(email);
  if (!usuario) return [];

  const userId = usuario.id;
  
  // 🚀 Query REST con embedded resource (JOIN) a work_orders
  const select = "id,work_order_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,updated_at,last_nota,work_orders(id,vin,tipo_ramal,estado_general,tanque_registrado,reductor_registrado,fecha_creacion,vins(reductor_asignado,tanque_asignado))";
  const url = `${SUPABASE_CONFIG.URL}/rest/v1/asignaciones?user_id=eq.${userId}&activo=eq.true&estado_actual=neq.FINALIZADO&select=${encodeURIComponent(select)}&order=updated_at.desc`;

  const res = await fetch(url, { method: "GET", headers: supabaseHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase GET asignaciones: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (!data || !data.length) return [];
  
  // Enriquecer: extraer work_order info del JOIN
  return data
    .map(asg => {
      const wo = Array.isArray(asg.work_orders) 
        ? asg.work_orders[0] 
        : asg.work_orders;
      return {
        id: asg.id,
        work_order_id: asg.work_order_id,
        tipo_ot: asg.tipo_ot,
        rol_trabajo: asg.rol_trabajo,
        estado_actual: asg.estado_actual,
        running_since: asg.running_since,
        created_at: asg.running_since || wo?.fecha_creacion || "",
        fecha_creacion: wo?.fecha_creacion || "",
        tiempo_trab_ms: asg.tiempo_trab_ms || 0,
        updated_at: asg.updated_at,
        last_nota: asg.last_nota || "",
        vin: wo?.vin || "",
        tipo_ramal: wo?.tipo_ramal || "",
        tipoRamal: wo?.tipo_ramal || "",
        estado_general: wo?.estado_general,
        tanque_registrado: wo?.tanque_registrado,
        reductor_registrado: wo?.reductor_registrado,
        tanque_asignado: wo?.vins?.tanque_asignado || "",
        reductor_asignado: wo?.vins?.reductor_asignado || "",
        tiempo_ms: Number(asg.tiempo_trab_ms || 0),
        estado: asg.estado_actual,
      };
    })
    .filter(it => it.work_order_id);
}

/**
 * GET /api/mis-finalizadas — Obtener trabajos finalizados del usuario
 *
 * Acotado por VENTANA y TOPE, no por "todo lo del usuario". Sin ellos esta
 * consulta bajaba el historial completo del técnico —360 filas y 219 KB para
 * uno de los veteranos— cada vez que alguien tocaba "Ver finalizados", directo
 * del navegador a Supabase y sin pasar por ningún cache del servidor. Y crecía
 * sola: el mismo botón costaba más cada mes que pasaba.
 *
 * Ambos límites viven en config (LIM_FINALIZADOS_DIAS / LIM_FINALIZADOS), así
 * que se pueden abrir desde Admin si alguna vez hace falta mirar más atrás.
 */
export async function getMisFinalizadas(email) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  // Obtener user_id (cacheado)
  const usuario = await usuarioPorEmail_(email);
  if (!usuario) return [];

  const userId = usuario.id;

  const dias  = Math.max(1, Number(cfg("LIM_FINALIZADOS_DIAS")) || 30);
  const tope  = Math.max(1, Number(cfg("LIM_FINALIZADOS")) || 100);
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  // 🚀 Query REST con embedded resource (JOIN) a work_orders
  const select = "id,work_order_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,updated_at,last_nota,work_orders(id,vin,tipo_ramal,estado_general,tanque_registrado,reductor_registrado,fecha_creacion,vins(reductor_asignado,tanque_asignado))";
  const url = `${SUPABASE_CONFIG.URL}/rest/v1/asignaciones?user_id=eq.${userId}&estado_actual=eq.FINALIZADO` +
    `&updated_at=gte.${encodeURIComponent(desde)}` +
    `&select=${encodeURIComponent(select)}&order=updated_at.desc&limit=${tope}`;

  const res = await fetch(url, { method: "GET", headers: supabaseHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase GET asignaciones finalizadas: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (!data || !data.length) return [];
  
  // Enriquecer: extraer work_order info del JOIN
  return data
    .map(asg => {
      const wo = Array.isArray(asg.work_orders) 
        ? asg.work_orders[0] 
        : asg.work_orders;
      return {
        id: asg.id,
        work_order_id: asg.work_order_id,
        tipo_ot: asg.tipo_ot,
        rol_trabajo: asg.rol_trabajo,
        estado_actual: asg.estado_actual,
        running_since: asg.running_since,
        created_at: asg.running_since || wo?.fecha_creacion || "",
        fecha_creacion: wo?.fecha_creacion || "",
        tiempo_trab_ms: asg.tiempo_trab_ms || 0,
        updated_at: asg.updated_at,
        last_nota: asg.last_nota || "",
        vin: wo?.vin || "",
        tipo_ramal: wo?.tipo_ramal || "",
        tipoRamal: wo?.tipo_ramal || "",
        estado_general: wo?.estado_general,
        tanque_registrado: wo?.tanque_registrado,
        reductor_registrado: wo?.reductor_registrado,
        tanque_asignado: wo?.vins?.tanque_asignado || "",
        reductor_asignado: wo?.vins?.reductor_asignado || "",
        tiempo_ms: Number(asg.tiempo_trab_ms || 0),
        estado: asg.estado_actual,
      };
    })
    .filter(it => it.work_order_id);
}

/**
 * GET /api/estado — Obtener estado de un trabajo específico
 */
export async function getEstadoTrabajo(email, vin, rolTrabajo) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");
  
  // Obtener usuario (cacheado: esto corre cada 8 s mientras hay VIN escrito)
  const usuario = await usuarioPorEmail_(email);
  if (!usuario) return null;

  const userId = usuario.id;
  
  // Resolver work_order a partir del VIN.
  const wos = await supabaseGet("work_orders", { vin });
  if (!wos || !wos.length) return null;
  
  const workOrder = wos[0];
  
  // Query REST: asignación relevante
  const select = "id,work_order_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,updated_at,last_nota,last_nota_ts,activo";
  const url = `${SUPABASE_CONFIG.URL}/rest/v1/asignaciones?work_order_id=eq.${workOrder.id}&user_id=eq.${userId}&rol_trabajo=eq.${encodeURIComponent(rolTrabajo)}&select=${encodeURIComponent(select)}&limit=1`;

  const res = await fetch(url, { method: "GET", headers: supabaseHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase GET estado: ${res.status} ${text}`);
  }

  const data = await res.json();
  const asg = Array.isArray(data) && data.length ? data[0] : null;
  
  return {
    id: asg?.id || null,
    work_order_id: workOrder.id,
    tipo_ot: asg?.tipo_ot || workOrder.tipo_ot || "CONVERSION",
    rol_trabajo: rolTrabajo,
    estado_actual: asg?.estado_actual || "SIN_INICIAR",
    running_since: asg?.running_since || null,
    tiempo_trab_ms: Number(asg?.tiempo_trab_ms || 0),
    updated_at: asg?.updated_at || workOrder.updated_at || null,
    last_nota: asg?.last_nota || "",
    last_nota_ts: asg?.last_nota_ts || null,
    activo: asg?.activo ?? false,
    vin: String(workOrder.vin || vin || "").trim().toUpperCase(),
    conversionId: workOrder.id,
    rolTrabajo,
    estado: asg?.estado_actual || "SIN_INICIAR",
    tiempoMs: Number(asg?.tiempo_trab_ms || 0),
    tiempo_ms: Number(asg?.tiempo_trab_ms || 0),
  };
}

/**
 * GET incidencias de un VIN — lectura directa Supabase
 * @param {string} vin
 * @param {{ soloActivas?: boolean }} opts - soloActivas=true filtra las no resueltas (tiempo_fin IS NULL)
 */
export async function getIncidencias(vin, { soloActivas = false } = {}) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const filter = { vin };
  if (soloActivas) filter.tiempo_fin = { op: "is", val: "null" };
  const incidencias = await supabaseGet("incidencias", filter);

  // R2 keys contienen "/" (ej: incidencias/2026-04/VIN/archivo.jpg)
  // Drive legacy IDs NO contienen "/"
  const R2_BASE = "https://pub-c7d6e000a03d4913b0694c761ea901d2.r2.dev";
  const photoUrls = (fileId) => {
    if (!fileId) return { url: "", thumbUrl: "", imgUrl: "" };
    if (fileId.includes("/")) {
      const url = `${R2_BASE}/${fileId}`;
      return { url, thumbUrl: url, imgUrl: url };
    }
    // Legacy Drive
    return {
      url: "https://drive.google.com/file/d/" + fileId + "/view",
      thumbUrl: "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w400",
      imgUrl: "https://drive.google.com/uc?export=view&id=" + fileId,
    };
  };

  return incidencias
    .map(inc => {
      const urls = photoUrls(inc.foto_file_id);
      const tInicio = inc.tiempo_inicio ? new Date(inc.tiempo_inicio) : null;
      const tFin    = inc.tiempo_fin    ? new Date(inc.tiempo_fin)    : null;
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
        tiempo_inicio: inc.tiempo_inicio || null,
        tiempo_fin:    inc.tiempo_fin    || null,
        resuelta_por:  inc.resuelta_por  || null,
        duracion_min: (tInicio && tFin) ? Math.round((tFin - tInicio) / 60000) : null,
      };
    })
    .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
}

/**
 * Marca una incidencia como resuelta vía el backend.
 * @param {string} id    - UUID de la incidencia
 * @param {string} email - email del usuario que la resuelve
 */
export async function resolverIncidencia(id, email) {
  const res = await fetch(`/api/incidencia/${encodeURIComponent(id)}/resolver`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/**
 * GET nombre del técnico a partir de su email (tabla usuarios).
 * @param {string} email
 * @returns {Promise<string|null>}
 */
export async function getNombreByEmail(email) {
  if (!supabaseEnabled()) return null;
  const usuario = await usuarioPorEmail_(email);
  return usuario?.nombre?.trim() || null;
}

/**
 * GET incidencias recientes para un técnico por nombre (columna `tecnico`).
 * @param {string} nombre    - nombre del técnico tal como está en usuarios.nombre
 * @param {string} sinceIso  - ISO date string (ej. hace 12h)
 */
export async function getIncidenciasByTecnico(nombre, sinceIso) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");
  return supabaseGet("incidencias", {
    tecnico: nombre,
    fecha_hora: { op: "gte", val: sinceIso },
    tiempo_fin: { op: "is", val: "null" },
  });
}

/**
 * GET /api/vin-suggest — Sugerir VINs por búsqueda
 * ✅ Enrutado a través del backend para evitar CORS
 */
export async function getVinSuggest(q = "", limit = 12) {
  if (!q || q.length < 1) return [];
  
  try {
    // 🔍 Usar el endpoint del backend (proxy a Supabase)
    const res = await fetch(`/api/vin-suggest?q=${encodeURIComponent(q)}&limit=${limit}`, {
      method: "GET",
    });

    if (!res.ok) {
      throw new Error(`Backend getVinSuggest: ${res.status}`);
    }

    const data = await res.json();
    return (data?.items || []).map(v => ({
      vin: v.vin,
      modelo: v.modelo,
      cliente: v.cliente,
    }));
  } catch (err) {
    console.error("[getVinSuggest] Error:", err.message);
    return [];
  }
}
