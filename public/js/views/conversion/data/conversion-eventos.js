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
    if (!nota) return setOut({ ok: false, error: "Escribe una nota antes de guardar." });
  }

  const vin = getVin();
  if (!vin) return setOut({ ok: false, error: "Pon el VIN" });

  const rolTrabajo = getRolTrabajoCurrent_();

  // validar acción en estado local
  const c = ctx_();
  const itLocal = [...c.itemsByKey.values()].find((it) => String(it.vin||"").toUpperCase() === vin && String(it.rolTrabajo||"").toUpperCase() === rolTrabajo);
  if (itLocal) {
    const allowed = allowedActionsByEstado(itLocal.estado);
    if (!allowed.includes(accion)) {
      return setOut({ ok: false, error: `Acción ${accion} no permitida desde estado ${itLocal.estado}.` });
    }
  }

  const j = await postJSON_user("/api/evento", { email, vin, rolTrabajo, accion, nota }, accion === "NOTA" ? "Guardando nota..." : "Registrando...");
  setOut(j);
  if (!j?.ok) return;

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
  if (lastAutoStart_.k === k && now - lastAutoStart_.t < 1200) return;
  lastAutoStart_ = { k, t: now };

  const c = ctx_();
  const it = [...c.itemsByKey.values()].find((x) => String(x.vin||"").toUpperCase() === v && String(x.rolTrabajo||"").toUpperCase() === rol);
  const estado = String(it?.estado || "").toUpperCase();

  if (estado === "SIN_INICIAR") await enviarEvento("INICIO");
}
