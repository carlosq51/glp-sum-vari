// ═══════════════════════════════════════════════════════════════
// REALTIME SUBSCRIPTIONS — public/js/core/realtime.js
// ═══════════════════════════════════════════════════════════════
// 
// Usa esto para actualizar la UI en TIEMPO REAL sin refrescar
// Suscríbete a cambios en Supabase y actualiza UI instantáneamente

import { supabaseEnabled, SUPABASE_CONFIG } from "./supabase-client.js";

let realtimeConnections = {};  // { channel_name: subscription }

/**
 * 🔔 PATRÓN 1: Suscribirse a updates en una tabla
 * 
 * Uso: Cuando un técnico cambia el estado de su asignación,
 * todos los supervisores lo ven al instante
 */
export function subscribeToAsignacionesActivas(userId, callback) {
  if (!supabaseEnabled()) return;

  const channelName = `asignaciones_${userId}`;
  
  // Si ya estamos suscritos, no crees nuevo
  if (realtimeConnections[channelName]) {
    return realtimeConnections[channelName];
  }

  try {
    const subscription = supabase
      .from(`asignaciones:user_id=eq.${userId}`)  // Filtra por user_id
      .on("UPDATE", (payload) => {
        console.log("⚡ Asignación actualizada:", payload.new);
        callback({
          event: "UPDATE",
          data: payload.new,
        });
      })
      .subscribe();

    realtimeConnections[channelName] = subscription;
    console.log(`✅ Suscrito a asignaciones del usuario ${userId}`);
    
    return subscription;
  } catch (err) {
    console.error("[subscribeToAsignacionesActivas] Error:", err);
    return null;
  }
}

/**
 * 🔔 PATRÓN 2: Suscribirse a INSERTs (nuevos eventos)
 * 
 * Uso: Cuando alguien registra una incidencia,
 * el supervisor lo ve en su cola de trabajo al instante
 */
export function subscribeToNuevasIncidencias(vin, callback) {
  if (!supabaseEnabled()) return;

  const channelName = `incidencias_${vin}`;
  
  if (realtimeConnections[channelName]) {
    return realtimeConnections[channelName];
  }

  try {
    const subscription = supabase
      .from(`incidencias:vin=eq.${vin}`)
      .on("INSERT", (payload) => {
        console.log("🆕 Nueva incidencia registrada:", payload.new);
        callback({
          event: "INSERT",
          data: payload.new,
        });
      })
      .subscribe();

    realtimeConnections[channelName] = subscription;
    console.log(`✅ Suscrito a nuevas incidencias del VIN ${vin}`);
    
    return subscription;
  } catch (err) {
    console.error("[subscribeToNuevasIncidencias] Error:", err);
    return null;
  }
}

/**
 * 🔔 PATRÓN 3: Suscribirse a cambios en work_orders
 * 
 * Uso: Cuando el estado de una OT cambia,
 * actualiza toda la UI relacionada
 */
export function subscribeToWorkOrderChanges(workOrderId, callback) {
  if (!supabaseEnabled()) return;

  const channelName = `work_order_${workOrderId}`;
  
  if (realtimeConnections[channelName]) {
    return realtimeConnections[channelName];
  }

  try {
    const subscription = supabase
      .from(`work_orders:id=eq.${workOrderId}`)
      .on("UPDATE", (payload) => {
        console.log("📋 Work order actualizada:", payload.new);
        callback({
          event: "UPDATE",
          data: payload.new,
        });
      })
      .subscribe();

    realtimeConnections[channelName] = subscription;
    console.log(`✅ Suscrito a cambios de OT ${workOrderId}`);
    
    return subscription;
  } catch (err) {
    console.error("[subscribeToWorkOrderChanges] Error:", err);
    return null;
  }
}

/**
 * 🔔 PATRÓN 4: Suscribirse a cualquier tabla (genérico)
 * 
 * Uso avanzado: suscríbete a cualquier tabla con filtro personalizado
 * 
 * Ejemplo:
 *   subscribeToTable("eventos", { 
 *     filter: "work_order_id=eq.123", 
 *     event: "INSERT",
 *     callback: (data) => updateUI(data) 
 *   })
 */
export function subscribeToTable(tableName, options = {}) {
  if (!supabaseEnabled()) return;

  const { filter = "", event = "*", callback } = options;
  const channelName = `${tableName}_${filter}`;
  
  if (realtimeConnections[channelName]) {
    return realtimeConnections[channelName];
  }

  try {
    let query = supabase.from(`${tableName}${filter ? `:${filter}` : ""}`);
    
    const subscription = query
      .on(event, (payload) => {
        console.log(`📡 ${tableName} ${event}:`, payload);
        if (callback) callback(payload);
      })
      .subscribe();

    realtimeConnections[channelName] = subscription;
    console.log(`✅ Suscrito a ${tableName} (${event})`);
    
    return subscription;
  } catch (err) {
    console.error("[subscribeToTable] Error:", err);
    return null;
  }
}

/**
 * ❌ Desuscribirse (limpia resources)
 */
export function unsubscribe(channelName) {
  if (realtimeConnections[channelName]) {
    realtimeConnections[channelName].unsubscribe();
    delete realtimeConnections[channelName];
    console.log(`🔇 Desuscrito de ${channelName}`);
  }
}

/**
 * ❌ Desuscribirse de todo
 */
export function unsubscribeAll() {
  Object.keys(realtimeConnections).forEach(channelName => {
    realtimeConnections[channelName].unsubscribe();
  });
  realtimeConnections = {};
  console.log("🔇 Desuscrito de todos los canales");
}

// ═══════════════════════════════════════════════════════════════
// 🎯 CASOS DE USO PRÁCTICOS
// ═══════════════════════════════════════════════════════════════

/**
 * CASO 1: Dashboard SUPERVISOR - Ver todas las asignaciones actualizándose
 */
export function initSupervEditorDashboard() {
  // Cuando supervisor abre dashboard, suscribirse a cambios
  subscribeToTable("asignaciones", {
    filter: "activo=eq.true",
    event: "*",  // INSERT, UPDATE, DELETE
    callback: (payload) => {
      // Actualizar tabla en UI
      updateTableRow(payload.new || payload.old);
    }
  });

  // También escuchar nuevas incidencias
  subscribeToTable("incidencias", {
    event: "INSERT",
    callback: (payload) => {
      // Toast: "Nueva incidencia registrada"
      showNotification("🔔 Nueva incidencia", {
        vin: payload.new.vin,
        tipo: payload.new.tipo,
        nota: payload.new.nota,
      });
    }
  });
}

/**
 * CASO 2: TECNICO - Ver su asignación actual actualizándose
 */
export function initTecnicoWorkView(userId) {
  subscribeToAsignacionesActivas(userId, (event) => {
    if (event.event === "UPDATE") {
      // Actualizar UI con tiempo_trab_ms, estado_actual, etc
      updateWorkTimerUI(event.data.tiempo_trab_ms);
      updateWorkStatusUI(event.data.estado_actual);
      
      // Si alguien editó la nota desde otra ventana, actualiza
      if (event.data.last_nota) {
        updateNotasUI(event.data.last_nota);
      }
    }
  });
}

/**
 * CASO 3: CALIDAD - Ver incidencias de un VIN en tiempo real
 */
export function initCalidadIncidenciasView(vin) {
  subscribeToNuevasIncidencias(vin, (event) => {
    if (event.event === "INSERT") {
      // Agregar a tabla de incidencias
      addIncidenciaToTable(event.data);
      
      // Toast de notificación
      showNotification("⚠️ Nueva incidencia", {
        tipo: event.data.tipo,
        tecnico: event.data.tecnico,
      });
    }
  });

  // También escuchar updates en work_orders (cambio de estado)
  subscribeToWorkOrderChanges(vin, (event) => {
    if (event.event === "UPDATE") {
      updateWorkOrderStatus(event.data.estado_general);
    }
  });
}

/**
 * CASO 4: AUDITORIA - Ver eventos en vivo (como tail -f log)
 */
export function initAuditiaTimeline() {
  subscribeToTable("eventos", {
    event: "*",
    callback: (payload) => {
      // Agregar evento a timeline
      console.log("📡 Evento en vivo:", payload);
      addEventoToTimeline(payload.new || payload.old);
      
      // Auto-scroll a más reciente
      scrollTimelineToBottom();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 💡 HELPERS UI (stub — implementa según tu app)
// ═══════════════════════════════════════════════════════════════

function updateTableRow(data) {
  // Busca <tr data-id="${data.id}"> y actualiza
  const row = document.querySelector(`[data-id="${data.id}"]`);
  if (row) {
    // Actualiza células
    Object.entries(data).forEach(([key, value]) => {
      const cell = row.querySelector(`[data-field="${key}"]`);
      if (cell) cell.textContent = value;
    });
  }
}

function showNotification(title, data) {
  // Toast / notification
  console.log(`🔔 ${title}`, data);
  // Implementa tu UI de notifications (Toastr, alert, etc)
}

function updateWorkTimerUI(timeMs) {
  const timerEl = document.getElementById("workTimer");
  if (timerEl) {
    const seconds = Math.floor(timeMs / 1000);
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    timerEl.textContent = `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}

function updateWorkStatusUI(estado) {
  const statusEl = document.getElementById("workStatus");
  if (statusEl) {
    statusEl.textContent = estado;
    statusEl.className = `status status-${estado.toLowerCase()}`;
  }
}

function updateNotasUI(nota) {
  const notasEl = document.getElementById("workNotas");
  if (notasEl) {
    notasEl.textContent = nota;
  }
}

function addIncidenciaToTable(data) {
  const table = document.querySelector("[data-table='incidencias']");
  if (table) {
    const tbody = table.querySelector("tbody");
    if (tbody) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${data.fecha_hora}</td>
        <td>${data.tipo}</td>
        <td>${data.tecnico}</td>
        <td>${data.nota}</td>
      `;
      tbody.insertBefore(tr, tbody.firstChild);
    }
  }
}

function updateWorkOrderStatus(estado) {
  const statusEl = document.getElementById("workOrderStatus");
  if (statusEl) {
    statusEl.textContent = estado;
  }
}

function addEventoToTimeline(evento) {
  const timeline = document.querySelector("[data-timeline]");
  if (timeline) {
    const item = document.createElement("div");
    item.className = "timeline-item";
    item.innerHTML = `
      <span class="time">${new Date(evento.timestamp).toLocaleTimeString()}</span>
      <span class="action">${evento.accion}</span>
      <span class="user">${evento.usuarios?.nombre || "?"}</span>
      <span class="nota">${evento.nota || ""}</span>
    `;
    timeline.appendChild(item);
  }
}

function scrollTimelineToBottom() {
  const timeline = document.querySelector("[data-timeline]");
  if (timeline) {
    timeline.scrollTop = timeline.scrollHeight;
  }
}

// ═══════════════════════════════════════════════════════════════
// 🚀 IMPORTANTE: Importa en tu app.js principal
// ═══════════════════════════════════════════════════════════════

/*
 * En public/app.js:
 * 
 * import { 
 *   subscribeToAsignacionesActivas,
 *   subscribeToNuevasIncidencias,
 *   initSupervEditorDashboard,
 *   initTecnicoWorkView,
 *   initCalidadIncidenciasView,
 *   unsubscribeAll
 * } from "./js/core/realtime.js";
 * 
 * Luego en tu función de init:
 * 
 * if (CORE.state.currentModule === "SUPERVISOR") {
 *   initSupervEditorDashboard();
 * } else if (CORE.state.currentModule === "TECNICO") {
 *   initTecnicoWorkView(userId);
 * }
 * 
 * Y cuando cierre sesión:
 * 
 * function doLogout() {
 *   unsubscribeAll();  // Limpia suscripciones
 *   clearEmail();
 *   showLoginUI();
 * }
 */
