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
  if (!j?.ok) return j;

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

  setTimeout(() => { if (!CORE.state.uiLocked) syncNow({ forceFull: false, showOut: false }); }, 400);
  
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
  
  // ✅ ANTI-LOOP: Si fue mismo VIN/rol en últimos 5 segundos, salir
  // Aumentado de 1200ms a 5000ms para evitar loops de sync
  if (lastAutoStart_.k === k && now - lastAutoStart_.t < 5000) return;
  lastAutoStart_ = { k, t: now };

  const c = ctx_();
  const it = [...c.itemsByKey.values()].find((x) => String(x.vin||"").toUpperCase() === v && String(x.rolTrabajo||"").toUpperCase() === rol);
  const estado = String(it?.estado || "").toUpperCase();

  // ✅ SOLO crear/iniciar si:
  // - NO existe asignación local (it === null)
  // - O existe pero está en SIN_INICIAR (nunca fue iniciada)
  // ❌ NO reiniciar si ya está TRABAJANDO, PAUSADO, FINALIZADO
  if (!it || estado === "SIN_INICIAR") {
    // ✅ PASAR VIN/ROL explícitamente para evitar que se re-lean de UI
    // Esto previene que syncNow() cree OTs duplicadas con VINs diferentes
    const result = await enviarEvento("INICIO", { vin: v, rolTrabajo: rol });
    
    // 🚨 Si da error 409 (ya asignada a otro usuario), mostrar popup
    if (result && !result.ok && result.error && result.error.includes("ya está asignada")) {
      // Mostrar popup con el error
      const titulo = "⚠️ Orden ya asignada";
      const msg = result.error;
      if (typeof confirm !== "undefined") {
        confirm(`${titulo}\n\n${msg}`);
      }
    }
  }
}
