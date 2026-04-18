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
  postJSON_user,
} from "../../../core/core.js";

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

let lastAutoStart_ = { k: "", t: 0 };

// ✅ MEJOR: Tracking de múltiples VINs recientes
const recentAutoStarts_ = new Map();  // {vin|rol: timestamp}
const ANTI_LOOP_MS = 1500;  // Reducido de 2000ms para mejor UX
const AUTO_START_TIMEOUT_MS = 15000;  // 15 segundos para limpiar

// Limpiar entradas expiradas
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of recentAutoStarts_.entries()) {
    if (now - ts > AUTO_START_TIMEOUT_MS) {
      recentAutoStarts_.delete(key);
    }
  }
}, 5000);  // Limpiar cada 5 segundos

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

  const j = await postJSON_user("/api/evento", { email, vin, rolTrabajo, accion, nota }, accion === "NOTA" ? "Guardando nota..." : "Registrando...");
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
    const result = await enviarEvento("INICIO", { vin: v, rolTrabajo: rol });
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
        const titulo = "⚠️ Orden ya asignada";
        const assignedTo = result.assignedTo || "otro usuario";
        const msg = `${error}\n\nAsignado a: ${assignedTo}`;
        
        setOut({ 
          ok: false, 
          error: msg, 
          severity: "warning",
          errorType: "ALREADY_ASSIGNED",
        });
        
        if (typeof confirm !== "undefined") {
          confirm(`${titulo}\n\n${msg}`);
        }
      }
      // CASO 2: Validación de transición de estado fallida (400)
      else if (statusCode === 400 && error.includes("Acción")) {
        const msg = `${error}\n\nIntenta nuevamente con la acción correcta.`;
        setOut({ 
          ok: false, 
          error: msg, 
          severity: "warning",
          errorType: "INVALID_ACTION",
        });
      }
      // CASO 3: VIN no existe (pero ya se crea automáticamente)
      else if (error.includes("VIN") || error.includes("no encontrado")) {
        setOut({ 
          ok: false, 
          error: `No se pudo crear OT: ${error}`, 
          severity: "error",
          errorType: "VIN_NOT_FOUND",
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
      }
      // CASO 5: Otros errores
      else {
        setOut({ 
          ok: false, 
          error: `Error al iniciar: ${error}`, 
          severity: "error",
          errorType: "GENERIC_ERROR",
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
