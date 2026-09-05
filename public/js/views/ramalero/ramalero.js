import { CORE } from "../../core/core.js";
import { startLoopsFor_, stopLoopsFor_, clearModuleUI_ } from "../../core/loops.js";
import { syncNow } from "../conversion/data/conversion-sync.js";
import { tickClocksUI_ } from "../conversion/conversion.js";
import { initRamaleroActions_ } from "./ramalero-actions.js";
import { initRamaleroDelegation_ } from "./ramalero-delegation.js";
import { patchVisibleCards_ } from "../../work/index.js";
import { enterSolicitudes_, exitSolicitudes_ } from "./ramalero-solicitudes.js";
import { requestNotifPermission } from "../../core/push-client.js";
import { mountMiTurno, unmountMiTurno } from "../ramales/mi-turno.js";
import { resetHistorial_ } from "./ramalero-historial.js";

export function init() {
  initRamaleroActions_();
  initRamaleroDelegation_();
}

export function enter() {
  CORE.state.currentModule = "RAMALERO";

  // Cola de solicitudes en vivo (SSE + poll de respaldo)
  enterSolicitudes_();

  // Turno de caja y ramales por devolver (ver views/ramales/mi-turno.js).
  // Si el módulo de ramales todavía no está instalado en Supabase, el
  // panel se oculta solo y la vista sigue funcionando igual.
  mountMiTurno(document.getElementById("ramalMiTurnoBody"));

  // Push nativo: el ramalero recibe notificación en el celular cuando
  // un técnico crea una solicitud nueva (ver routes/ramal.js)
  const email = String(document.getElementById("email")?.value || "").trim().toLowerCase();
  if (email) requestNotifPermission(email);

  startLoopsFor_("RAMALERO", {
    syncNow,
    tickClocksUI: () => {
      tickClocksUI_?.();
      patchVisibleCards_?.();
    },
  });
}

export function exit() {
  exitSolicitudes_();
  unmountMiTurno();
  resetHistorial_();
  stopLoopsFor_("RAMALERO");
  clearModuleUI_("RAMALERO");
}
