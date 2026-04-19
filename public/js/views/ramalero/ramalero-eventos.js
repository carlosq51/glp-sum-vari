import {
  $,
  ctx_,
  keyOfItem_,
  requireEmailOrStop,
  setOut,
  postJSON_user,
} from "../../core/core.js";

import { normalizeItem_, mergePrevAndCache_ } from "../conversion/state/conversion-store.js";
import {
  rebuildListsFromStore_,
  renderActivas_,
  renderFinalizados_,
} from "../../work/index.js";

/** Aplica la respuesta del server al store local sin full sync */
function patchStoreFromResponse_(j) {
  const c = ctx_();
  const it = normalizeItem_(j);
  const k = keyOfItem_(it);
  const prev = c.itemsByKey.get(k);
  mergePrevAndCache_(it, prev);
  c.itemsByKey.set(k, it);
  rebuildListsFromStore_();
  renderActivas_();
  renderFinalizados_();
}

export async function crearNuevoRamal_() {
  const ramalIdEl = $("ramalId");
  if (ramalIdEl) ramalIdEl.value = "";

  let email;
  try { email = requireEmailOrStop(); } catch { return; }

  const tipoRamal = String($("tipoRamal")?.value || "").trim();
  if (!tipoRamal) {
    setOut({ ok: false, error: "Selecciona tipo de ramal" });
    return;
  }

  let j;
  try {
    j = await postJSON_user(
      "/api/evento",
      {
        email,
        rolTrabajo: "RAMALERO",
        accion: "INICIO",
        tipoRamal,
      },
      "Iniciando..."
    );
  } catch (err) {
    setOut({ ok: false, error: err?.message || "Error de conexión" });
    return;
  }

  setOut(j);
  if (!j?.ok) return;

  patchStoreFromResponse_(j);
}

export async function enviarEventoRamalero_(it, accion, nota = "") {
  let email;
  try { email = requireEmailOrStop(); } catch { return; }

  const tipoRamal = String(it?.tipoRamal || $("tipoRamal")?.value || "").trim();

  const body = {
    email,
    rolTrabajo: "RAMALERO",
    accion,
    conversionId: String(it?.conversionId || "").trim(),
    tipoRamal,
    nota,
  };

  let j;
  try {
    j = await postJSON_user("/api/evento", body, `Enviando ${accion}...`);
  } catch (err) {
    setOut({ ok: false, error: err?.message || "Error de conexión" });
    return;
  }
  setOut(j);
  if (!j?.ok) return;

  patchStoreFromResponse_(j);
}