// =========================
// public/js/core/supabase-client.js
// Cliente Supabase para lectura/escritura
// Migración paralela: AppScript + Supabase
// =========================

export const SUPABASE_CONFIG = {
  URL: import.meta.env.VITE_SUPABASE_URL || "",
  ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
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
 */
export async function supabaseGet(table, filter = {}) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}${buildQuery(filter)}`;
  
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
 * GET /api/me — Obtener perfil de usuario
 */
export async function getUsuarioPerfil(email) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");
  
  const usuarios = await supabaseGet("usuarios", { email });
  if (!usuarios || !usuarios.length) return null;
  
  const usuario = usuarios[0];
  const modulos = await supabaseGet("usuario_modulos", { user_id: usuario.id });
  
  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    especialidad: usuario.especialidad,
    activo: usuario.activo,
    modulos: Array.isArray(modulos) ? modulos.map(m => m.modulo) : [],
  };
}

/**
 * GET /api/mis-activas — Obtener trabajos activos del usuario
 * ⚡ OPTIMIZADO: Filtra EN SUPABASE (no trae todo)
 */
export async function getMisActivas(email) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");
  
  // Obtener user_id
  const usuarios = await supabaseGet("usuarios", { email });
  if (!usuarios || !usuarios.length) return [];
  
  const userId = usuarios[0].id;
  
  // 🚀 FILTRO EN SUPABASE: solo asignaciones activas de este usuario
  const asignaciones = await supabaseGet("asignaciones", {
    user_id: userId,
    activo: true, // Supabase interpreta como: activo=eq.true
  });
  
  if (!asignaciones || !asignaciones.length) return [];
  
  // Obtener work_orders (una sola query, luego filtrar local)
  const workOrderIds = asignaciones.map(a => a.work_order_id).filter(Boolean);
  const workOrders = workOrderIds.length > 0 
    ? await supabaseGet("work_orders", {})
    : [];
  
  const woMap = Object.fromEntries(
    workOrders
      .filter(wo => workOrderIds.includes(wo.id))
      .map(wo => [wo.id, wo])
  );
  
  // Enriquecer
  return asignaciones
    .map(asg => {
      const wo = woMap[asg.work_order_id] || {};
      return {
        ...asg,
        ...wo,
        tiempo_ms: Number(asg.tiempo_trab_ms || 0),
        estado: asg.estado_actual,
      };
    })
    .filter(it => it.work_order_id);
}

/**
 * GET /api/mis-finalizadas — Obtener trabajos finalizados del usuario
 * ⚡ OPTIMIZADO: Filtra EN SUPABASE (no trae todo)
 */
export async function getMisFinalizadas(email) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");
  
  // Obtener user_id
  const usuarios = await supabaseGet("usuarios", { email });
  if (!usuarios || !usuarios.length) return [];
  
  const userId = usuarios[0].id;
  
  // 🚀 FILTRO EN SUPABASE: solo asignaciones finalizadas de este usuario
  const asignaciones = await supabaseGet("asignaciones", {
    user_id: userId,
    estado_actual: "FINALIZADO",
  });
  
  if (!asignaciones || !asignaciones.length) return [];
  
  // Obtener work_orders (una sola query, luego filtrar local)
  const workOrderIds = asignaciones.map(a => a.work_order_id).filter(Boolean);
  const workOrders = workOrderIds.length > 0
    ? await supabaseGet("work_orders", {})
    : [];
  
  const woMap = Object.fromEntries(
    workOrders
      .filter(wo => workOrderIds.includes(wo.id))
      .map(wo => [wo.id, wo])
  );
  
  // Enriquecer
  return asignaciones
    .map(asg => {
      const wo = woMap[asg.work_order_id] || {};
      return {
        ...asg,
        ...wo,
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
  
  // Obtener usuario
  const usuarios = await supabaseGet("usuarios", { email });
  if (!usuarios || !usuarios.length) return null;
  
  const userId = usuarios[0].id;
  
  // Obtener work_order
  const wos = await supabaseGet("work_orders", { vin });
  if (!wos || !wos.length) return null;
  
  const workOrderId = wos[0].id;
  
  // Obtener asignación
  const asignaciones = await supabaseGet("asignaciones", {});
  const asg = asignaciones.find(a => 
    a.work_order_id === workOrderId &&
    a.user_id === userId &&
    a.rol_trabajo === rolTrabajo
  );
  
  return {
    vin,
    rolTrabajo,
    estado: asg ? asg.estado_actual : "SIN_INICIAR",
    tiempoMs: asg ? asg.tiempo_trab_ms : 0,
  };
}

/**
 * GET /api/incidencias/list — Obtener incidencias de un VIN
 */
export async function getIncidencias(vin) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");
  
  const incidencias = await supabaseGet("incidencias", { vin });
  
  return incidencias
    .map(inc => ({
      id: inc.id,
      fecha_hora: inc.fecha_hora,
      vin: inc.vin,
      type: inc.tipo,
      nota: inc.nota,
      registrado_por: inc.registrado_por,
      foto_file_id: inc.foto_file_id,
    }));
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
