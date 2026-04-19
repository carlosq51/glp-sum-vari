// public/js/views/conversion/data/conversion-estado.js

import {
  CORE,
  $,
  ctx_,
  getVin,
  getRolTrabajoCurrent_,
  requireEmailOrStop,
  setEstadoText,
  setOut,
  getJSON,
  msToHMS_,
  withLock,
  keyOfItem_,
} from "../../../core/core.js";

import { getEstadoTrabajo, supabaseEnabled } from "../../../core/supabase-client.js";

import {
  computeLiveMs_,
  rebuildListsFromStore_,
  renderActivas_,
  renderFinalizados_,
} from "../../../work/index.js";

import { isWorkModule_ } from "../../../core/core.js";
import { normalizeItem_, fetchNombresParaVin_ } from "../state/conversion-store.js";
import { syncNow } from "./conversion-sync.js";
import { autoStartFromScan_ } from "./conversion-eventos.js";

let estadoDebounceTimer_ = null;

// --------------------------
// ESTADO VIN/ROL
// --------------------------
export async function refreshEstadoForVinRole({ showOut = false } = {}) {
  if (CORE.state.uiLocked) return;
  if (!isWorkModule_()) return;

  let email;
  try { email = requireEmailOrStop(); }
  catch { return; }

  if (!(CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD")) return;

  const vin = getVin();
  const rolTrabajo = getRolTrabajoCurrent_();
  if (!vin) { setEstadoText(""); return; }

  const c = ctx_();
  const v = vin.toUpperCase();
  for (const it of c.itemsByKey.values()) {
    if (
      String(it.vin || "").toUpperCase() === v &&
      String(it.rolTrabajo || "").toUpperCase() === rolTrabajo
    ) {
      // Enriquecer con nombres si Calidad y aún no los tiene
      // DESPUÉS
      if (CORE.state.currentModule === "CALIDAD" && !it.motorNombre && !it.tanqueroNombre) {
        fetchNombresParaVin_(v).then(({ motorNombre, tanqueroNombre }) => {
          it.motorNombre = motorNombre;
          it.tanqueroNombre = tanqueroNombre;
          renderActivas_();
          renderFinalizados_();
        }).catch(() => {});
      }
      setEstadoText(`Estado: ${it.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it))}`);
      return;
    }
  }

  const j = supabaseEnabled() 
    ? await getEstadoTrabajo(email, vin, rolTrabajo)
    : await getJSON(`/api/estado?email=${encodeURIComponent(email)}&vin=${encodeURIComponent(vin)}&rolTrabajo=${encodeURIComponent(rolTrabajo)}`);
  
  if (showOut) setOut(j);
  
  // ✅ Si hay error (incluso sin showOut), loguear pero no fallar
  if (!j?.ok) {
    if (!supabaseEnabled()) {
      console.warn("[refreshEstadoForVinRole] Error:", j?.error || "Error desconocido");
      setEstadoText(`⚠️ ${j?.error || "Error al obtener estado"}`);
      return;
    } else {
      // Supabase null response puede significar VIN no existe aún (será creado)
      console.log("[refreshEstadoForVinRole] VIN no existe aún (será creado al hacer INICIO)");
      setEstadoText("Listo para crear OT");
      return;
    }
  }

  const it2 = normalizeItem_(j);
  const k2 = keyOfItem_(it2);

  // Si es Calidad, enriquecemos con nombres antes de guardar
  // DESPUÉS
  if (CORE.state.currentModule === "CALIDAD" && it2.vin) {
    const { motorNombre, tanqueroNombre } = await fetchNombresParaVin_(it2.vin);
    it2.motorNombre = motorNombre;
    it2.tanqueroNombre = tanqueroNombre;
  }
  c.itemsByKey.set(k2, it2);
  rebuildListsFromStore_();
  renderActivas_();
  renderFinalizados_();
  setEstadoText(`Estado: ${it2.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it2))}`);
}

export function scheduleEstadoRefresh_(ms = 500) {
  if (!(CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD")) return;
  clearTimeout(estadoDebounceTimer_);
  estadoDebounceTimer_ = setTimeout(() => refreshEstadoForVinRole({ showOut: false }).catch(() => {}), ms);
}

export function initEstadoUI_() {
  $("btnEstado")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    
    const vin = getVin();
    if (!vin) {
      setEstadoText("❌ Ingresa un VIN primero");
      return;
    }
    const rolTrabajo = getRolTrabajoCurrent_();
    if (!rolTrabajo) {
      setEstadoText("❌ Selecciona un rol primero");
      return;
    }
    
    await withLock(async () => {
      setEstadoText("🔄 Inicializando OT...");
      await autoStartFromScan_(vin, rolTrabajo);
    }, "Creando OT...");
    
    setEstadoText("⏳ Sincronizando...");
    setTimeout(() => {
      syncNow({ forceFull: true, showOut: false })
      .then(() => {
        const c = ctx_();
        const it = [...c.itemsByKey.values()].find(x => 
          String(x.vin || "").toUpperCase() === vin.toUpperCase() &&
          String(x.rolTrabajo || "").toUpperCase() === rolTrabajo.toUpperCase()
        );
        
        if (it?.estado === "TRABAJANDO") {
          setEstadoText("✅ OT TRABAJANDO");
        } else {
          setEstadoText(`ℹ️ Estado: ${it?.estado || "SIN_INICIAR"}`);
        }
      })
      .catch(() => {});
    }, 100);
  });

  $("btnEstadoQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    
    const vin = getVin();
    if (!vin) {
      setEstadoText("❌ Ingresa un VIN primero");
      return;
    }
    const rolTrabajo = "CALIDAD";
    
    await withLock(async () => {
      setEstadoText("🔄 Inicializando OT...");
      await autoStartFromScan_(vin, rolTrabajo);
    }, "Creando OT...");
    
    setEstadoText("⏳ Sincronizando...");
    setTimeout(() => {
      syncNow({ forceFull: true, showOut: false })
        .then(() => {
          const c = ctx_();
          const it = [...c.itemsByKey.values()].find(x => 
            String(x.vin || "").toUpperCase() === vin.toUpperCase() &&
            String(x.rolTrabajo || "").toUpperCase() === rolTrabajo.toUpperCase()
          );
          
          if (it?.estado === "TRABAJANDO") {
            setEstadoText("✅ OT TRABAJANDO");
          } else if (it) {
            setEstadoText(`ℹ️ Estado: ${it.estado}`);
          } else {
            setEstadoText("ℹ️ OT creada");
          }
        })
        .catch(() => {});
    }, 100);
  });

  $("rol")?.addEventListener("change", () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    scheduleEstadoRefresh_(0);
  });
}