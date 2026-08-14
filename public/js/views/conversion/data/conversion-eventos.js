// public/js/views/conversion/data/conversion-eventos.js

import {
  CORE,
  $,
  ctx_,
  getVin,
  getRolTrabajoCurrent_,
  requireEmailOrStop,
  setOut,
  keyOfItem_,
  postJSON,
  postJSON_user,
} from "../../../core/core.js";

import { promptZonaForVin } from "../../zonas/zonas-mapa.js";

import {
  allowedActionsByEstado,
  rebuildListsFromStore_,
  snapshotNotasActivas_,
  restoreNotasActivas_,
  renderActivas_,
  renderFinalizados_,
} from "../../../work/index.js";

import { normalizeItem_, mergePrevAndCache_ } from "../state/conversion-store.js";
import { syncNow } from "./conversion-sync.js";
import { 
  showVinNotFoundError, 
  showAlreadyAssignedError,
  showErrorModal,
} from "../modals/error-modal.js";

let lastAutoStart_ = { k: "", t: 0 };

// ✅ MEJOR: Tracking de múltiples VINs recientes
const recentAutoStarts_ = new Map();  // {vin|rol: timestamp}
const ANTI_LOOP_MS = 1500;  // Reducido de 2000ms para mejor UX
const AUTO_START_TIMEOUT_MS = 15000;  // 15 segundos para limpiar

// --------------------------
// AUTO-RESUME TRAS PAUSA (máx 8 min)
// Se basa en it.updated_at del servidor → sobrevive recargas de página
// --------------------------

/** Tiempo máximo de pausa antes de reanudar automáticamente. */
export const PAUSA_AUTO_RESUME_MS = 8 * 60 * 1000;

// Las pausas por horario (almuerzo, fin de jornada) las dispara el SERVIDOR:
// ver lib/pausa-masiva.js. Aquí vivía un array [[13,0],[16,40]] hardcodeado que
// solo corría si el técnico tenía la app abierta en ese minuto exacto, y que
// además ignoraba HORARIO_COMIDA_INICIO. Lo que queda en este archivo es solo
// el auto-resume de 8 min y las ventanas donde ese auto-resume se apaga.

// --------------------------
// SCHEDULE CONFIG (configurable desde panel admin)
// Se cachea en memoria; se refresca cada 5 min.
// --------------------------
let _scheduleCache = null;
let _scheduleFetchedAt = 0;
const SCHEDULE_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function getScheduleConfig_() {
  const now = Date.now();
  if (_scheduleCache && now - _scheduleFetchedAt < SCHEDULE_TTL_MS) return _scheduleCache;
  try {
    const resp = await fetch("/api/admin/config");
    if (!resp.ok) throw new Error("config fetch failed");
    const j = await resp.json();
    const cfg = j.config || {};
    _scheduleCache = {
      pausaGlobal:  cfg.PAUSA_GLOBAL_ACTIVA    === "1",
      // Despacho dirigido: las pausas las pone el supervisor y el servidor
      // reanuda solo las que tienen reloj. El auto-resume de 8 min del cliente
      // sobra aquí y pelearía con ese vencimiento. El botón manual sigue vivo:
      // volver al trabajo es del técnico, poner la pausa no.
      despachoReal: String(cfg.DESPACHO_MODO || "OFF").toUpperCase() === "REAL",
      comidaInicio: cfg.HORARIO_COMIDA_INICIO   || "13:00",
      comidaFin:    cfg.HORARIO_COMIDA_FIN       || "14:00",
      descInicio:   cfg.HORARIO_DESCANSO_INICIO  || "16:30",
      descFin:      cfg.HORARIO_DESCANSO_FIN     || "07:00",
    };
    _scheduleFetchedAt = now;
    // También persistir en localStorage como fallback offline
    try { localStorage.setItem("glp_app_config_cache", JSON.stringify({ ..._scheduleCache, ts: now })); } catch {}
  } catch {
    // Intentar leer desde cache localStorage
    try {
      const raw = localStorage.getItem("glp_app_config_cache");
      if (raw) { const parsed = JSON.parse(raw); const { ts, ...rest } = parsed; _scheduleCache = rest; }
    } catch {}
    // Si aún no hay cache, usar defaults
    _scheduleCache = _scheduleCache || {
      pausaGlobal: false,
      comidaInicio: "13:00", comidaFin: "14:00",
      descInicio: "16:30", descFin: "07:00",
    };
  }
  return _scheduleCache;
}

/** Fuerza refresco del caché (llamado tras cambios en admin). */
export function invalidateScheduleCache_() { _scheduleCache = null; _scheduleFetchedAt = 0; }

/**
 * Parsea "HH:MM" → minutos desde medianoche.
 * @param {string} t
 * @returns {number}
 */
function hhmm_(t) {
  const [h, m] = String(t || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Devuelve true si la hora actual cae en una ventana de pausa infinita
 * (sin auto-resume de 8 min).
 * Lee la configuración del servidor (con caché de 5 min).
 * Es async; conversion.js debe usar "await isInfinitePauseWindow_()".
 */
export async function isInfinitePauseWindow_() {
  const cfg = await getScheduleConfig_();
  if (cfg.pausaGlobal) return true;          // Pausa global forzada desde admin
  if (cfg.despachoReal) return true;         // Pausas del supervisor: sin auto-resume local

  const now = new Date();
  const t = now.getHours() * 60 + now.getMinutes();

  // Ventana de comida
  const ci = hhmm_(cfg.comidaInicio);
  const cf = hhmm_(cfg.comidaFin);
  if (ci <= cf) {
    if (t >= ci && t < cf) return true;
  } else {
    if (t >= ci || t < cf) return true;      // cruza medianoche (raro para comida, pero por si acaso)
  }

  // Ventana de descanso nocturno
  const di = hhmm_(cfg.descInicio);
  const df = hhmm_(cfg.descFin);
  if (di <= df) {
    if (t >= di && t < df) return true;
  } else {
    // cruza medianoche, ej 16:30 → 07:00
    if (t >= di || t < df) return true;
  }

  return false;
}

/** Keys que ya tienen un REANUDAR en vuelo, para no disparar dos veces. */
export const autoResumingKeys_ = new Set();

// Limpiar entradas expiradas de recentAutoStarts_
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of recentAutoStarts_.entries()) {
    if (now - ts > AUTO_START_TIMEOUT_MS) {
      recentAutoStarts_.delete(key);
    }
  }
}, 5000);

// --------------------------
// EVENTO (TECNICO/CALIDAD)
// --------------------------
export async function enviarEvento(accionOverride, opts = {}) {
  if (!(CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD")) return;

  let email;
  try { email = requireEmailOrStop(); }
  catch { return; }

  const accion = String(accionOverride || $("accion")?.value || "").toUpperCase();
  let nota = "";
  if (accion === "NOTA") {
    nota = String($("nota")?.value || "").trim();
    if (!nota && opts?.nota) nota = String(opts.nota || "").trim();
    if (!nota) {
      const err = { ok: false, error: "Escribe una nota antes de guardar." };
      setOut(err);
      return err;
    }
  }

  // ✅ PERMITIR VIN/ROL OPCIONALES desde autoStartFromScan_
  // Si vienen en opts, usarlos en lugar de re-leer de la UI
  let vin = opts?.vin || getVin();
  if (!vin) {
    const err = { ok: false, error: "Pon el VIN" };
    setOut(err);
    return err;
  }

  let rolTrabajo = opts?.rolTrabajo || getRolTrabajoCurrent_();

  // validar acción en estado local
  const c = ctx_();
  const itLocal = [...c.itemsByKey.values()].find((it) => String(it.vin||"").toUpperCase() === vin && String(it.rolTrabajo||"").toUpperCase() === rolTrabajo);
  if (itLocal) {
    const allowed = allowedActionsByEstado(itLocal.estado);
    if (!allowed.includes(accion)) {
      const err = { ok: false, error: `Acción ${accion} no permitida desde estado ${itLocal.estado}.` };
      setOut(err);
      return err;
    }
  }

  // Si ya estamos dentro de un withLock (skipLock), usar postJSON directo para evitar deadlock
  const j = opts?.skipLock
    ? await postJSON("/api/evento", { email, vin, rolTrabajo, accion, nota })
    : await postJSON_user("/api/evento", { email, vin, rolTrabajo, accion, nota }, accion === "NOTA" ? "Guardando nota..." : "Registrando...");
  setOut(j);
  
  // 🔄 Retornar resultado para que autoStartFromScan_ pueda analizarlo
  if (!j?.ok) {
    console.warn(`[EVENTO] ❌ Falla en acción ${accion}:`, j?.error);
    return j;
  }

  console.log(`[EVENTO] ✅ Acción ${accion} exitosa. Estado: ${j?.estado || j?.estado_actual}`);

  const it2 = normalizeItem_(j);
  const k2 = keyOfItem_(it2);
  const prev = c.itemsByKey.get(k2);
  if (prev) mergePrevAndCache_(it2, prev);

  c.itemsByKey.set(k2, it2);
  rebuildListsFromStore_();

  const snapNotas = snapshotNotasActivas_();
  if (accion === "NOTA" && opts?.clearKey) snapNotas.set(String(opts.clearKey), "");

  renderActivas_();
  renderFinalizados_();
  restoreNotasActivas_(snapNotas);

  if (accion === "NOTA" && $("nota")) $("nota").value = "";

  // ✅ MEJOR: Sincronización mejorada después de evento
  // Aumenta el timeout y usa forceFull si es INICIO
  setTimeout(() => {
    if (!CORE.state.uiLocked) {
      const forceFull = accion === "INICIO";  // Fuerza full sync después de crear OT
      syncNow({ forceFull, showOut: false }).catch(() => {});
    }
  }, accion === "INICIO" ? 800 : 400);  // 800ms para INICIO, 400ms para otros

  // Si es INICIO exitoso y el VIN no tiene zona asignada →
  // popup OBLIGATORIO (no se puede cerrar hasta elegir una zona o Zona Libre).
  // Excluido para CALIDAD: el inspector no gestiona zonas.
  if (accion === "INICIO" && CORE.state.currentModule !== "CALIDAD") {
    const vinParaZona = String(vin || "").trim().toUpperCase();
    if (vinParaZona) {
      fetch(`/api/zonas/vin/${encodeURIComponent(vinParaZona)}`)
        .then(r => r.json())
        .then(z => {
          if (z?.ok && z.zona_id == null) {
            const nombre = CORE.state.currentProfile?.nombre || CORE.state.currentProfile?.email || "";
            promptZonaForVin(vinParaZona, nombre, null, false); // false = no dismissible
          }
        })
        .catch(() => {});
    }
  }

  return j;
}

// --------------------------
// AUTO START “suave” (simple)
// --------------------------

export async function autoStartFromScan_(vin, rolTrabajo) {
  const v = String(vin || "").trim().toUpperCase();
  const rol = String(rolTrabajo || "").trim().toUpperCase();
  if (!v) return;

  const k = `${v}|${rol}`;
  const now = Date.now();
  const startTime = now;
  
  // ✅ MEJOR ANTI-LOOP: Usar Map para múltiples VINs
  const lastTs = recentAutoStarts_.get(k);
  if (lastTs && now - lastTs < ANTI_LOOP_MS) {
    console.log(`[AUTO_START] ⏸️ Ignorando: ${k} (último intento hace ${now - lastTs}ms)`);
    return;
  }
  
  // Registrar este intento
  recentAutoStarts_.set(k, now);
  console.log(`[AUTO_START] 🚀 Iniciando: ${v} | Rol: ${rol} | Tiempo: ${new Date().toISOString()}`);

  const c = ctx_();
  const it = [...c.itemsByKey.values()].find((x) => 
    String(x.vin||"").toUpperCase() === v && 
    String(x.rolTrabajo||"").toUpperCase() === rol
  );
  const estado = String(it?.estado || "").toUpperCase();

  // ✅ SOLO crear/iniciar si:
  // - NO existe asignación local (it === null)
  // - O existe pero está en SIN_INICIAR (nunca fue iniciada)
  // ❌ NO reiniciar si ya está TRABAJANDO, PAUSADO, FINALIZADO
  if (!it || estado === "SIN_INICIAR") {
    console.log(`[AUTO_START] Estado encontrado: ${estado || "NO EXISTE"} → Ejecutando INICIO`);
    
    // ✅ PASAR VIN/ROL explícitamente para evitar que se re-lean de UI
    const eventoStartTime = Date.now();
    const result = await enviarEvento("INICIO", { vin: v, rolTrabajo: rol, skipLock: true });
    const eventoDuration = Date.now() - eventoStartTime;
    
    console.log(`[AUTO_START] enviarEvento completada en ${eventoDuration}ms`);
    
    // 🚨 Mejor manejo de errores
    if (result && !result.ok) {
      const error = result.error || "";
      const errorType = result.errorType || "UNKNOWN";
      const statusCode = result._statusCode || 500;
      
      console.error(`[AUTO_START] ❌ Error (${errorType}):`, error);
      
      // CASO 1: OT ya asignada a otro usuario (409)
      if (errorType === "ALREADY_ASSIGNED" || error.includes("ya está asignada")) {
        const assignedTo = result.assignedTo || "otro usuario";
        
        setOut({ 
          ok: false, 
          error: `OT ya asignada a: ${assignedTo}`, 
          severity: "warning",
          errorType: "ALREADY_ASSIGNED",
        });
        
        // Mostrar popup modal
        showAlreadyAssignedError(v, assignedTo);
      }
      // CASO 2: VIN no existe en la lista
      else if (errorType === "VIN_NOT_FOUND" || error.includes("no existe en la lista")) {
        const vinFromError = result.vin || v;
        
        setOut({ 
          ok: false, 
          error: `VIN "${vinFromError}" no encontrado`, 
          severity: "error",
          errorType: "VIN_NOT_FOUND",
        });
        
        // Mostrar popup modal
        showVinNotFoundError(vinFromError);
      }
      // CASO 3: Validación de transición de estado fallida (400)
      else if (statusCode === 400 && error.includes("Acción")) {
        const msg = `${error}\n\nIntenta nuevamente con la acción correcta.`;
        setOut({ 
          ok: false, 
          error: msg, 
          severity: "warning",
          errorType: "INVALID_ACTION",
        });
        
        showErrorModal({
          title: "Acción No Permitida",
          message: error,
          details: "Intenta nuevamente con la acción correcta.",
          type: "warning",
        });
      }
      // CASO 4: Timeout
      else if (errorType === "TIMEOUT") {
        setOut({ 
          ok: false, 
          error: `La operación tardó demasiado. Intenta nuevamente.`, 
          severity: "error",
          errorType: "TIMEOUT",
        });
        
        showErrorModal({
          title: "Tiempo Agotado",
          message: "La operación tardó demasiado.",
          details: "Por favor, intenta nuevamente.",
          type: "warning",
        });
      }
      // CASO 5: Otros errores
      else {
        setOut({ 
          ok: false, 
          error: `Error al iniciar: ${error}`, 
          severity: "error",
          errorType: "GENERIC_ERROR",
        });
        
        showErrorModal({
          title: "Error",
          message: error || "Ha ocurrido un error inesperado.",
          type: "error",
        });
      }
    } else if (result?.ok) {
      console.log(`[AUTO_START] ✅ OT iniciada: ${v} | ROL: ${rol} | Estado: ${result.estado || result.estado_actual}`);
    }
  } else {
    console.log(`[AUTO_START] ⚠️ OT ya en estado ${estado}, no se reinicia`);
  }
  
  const totalDuration = Date.now() - startTime;
  console.log(`[AUTO_START] ⏱️ TOTAL autoStartFromScan_: ${totalDuration}ms`);
}
