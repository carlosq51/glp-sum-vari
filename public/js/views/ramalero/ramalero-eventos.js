import {
  $,
  requireEmailOrStop,
  setOut,
  postJSON_user,
} from "../../core/core.js";

import { syncNow } from "../conversion/conversion.js";
import {
  rebuildListsFromStore_,
  renderActivas_,
  renderFinalizados_,
} from "../../work/index.js";

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

  const j = await postJSON_user(
    "/api/evento",
    {
      email,
      rolTrabajo: "RAMALERO",
      accion: "INICIO",
      tipoRamal,
    },
    "Iniciando..."
  );

  setOut(j);
  if (!j?.ok) return;

  await syncNow({ forceFull: true, showOut: false });
  rebuildListsFromStore_();
  renderActivas_();
  renderFinalizados_();
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

  const j = await postJSON_user("/api/evento", body, `Enviando ${accion}...`);
  setOut(j);
  if (!j?.ok) return;

  await syncNow({ forceFull: true, showOut: false });
  rebuildListsFromStore_();
  renderActivas_();
  renderFinalizados_();
}