import { CORE } from "../../core/core.js";
import { startLoopsFor_, stopLoopsFor_, clearModuleUI_ } from "../../core/loops.js";
import { syncNow } from "../conversion/data/conversion-sync.js";
import { tickClocksUI_ } from "../conversion/conversion.js";
import { initRamaleroActions_ } from "./ramalero-actions.js";
import { initRamaleroDelegation_ } from "./ramalero-delegation.js";
import { patchVisibleCards_ } from "../../work/index.js";
import { enterSolicitudes_, exitSolicitudes_ } from "./ramalero-solicitudes.js";
import { montarAvisoNotif } from "../../core/push-client.js";
import { getEmail } from "../../core/auth.js";
import { mountMiTurno, unmountMiTurno } from "../ramales/mi-turno.js";
import { resetHistorial_ } from "./ramalero-historial.js";
import { initPlanos_ } from "./planos.js";

// Aviso "este celular no te avisa" + botón Activar avisos (push-client.js):
// push "Nueva solicitud de ramal" (routes/ramal.js) y, si además tiene el
// módulo MOVILIZADOR, "carro listo para salida" (lib/aviso-listos.js).
let _avisoNotif = null;

export function init() {
  initRamaleroActions_();
  initRamaleroDelegation_();

  _avisoNotif = montarAvisoNotif({
    box: "ramNotifAviso", txt: "ramNotifTxt", btn: "ramNotifBtn",
    getEmail, que: "solicitudes nuevas",
  });
}

export function enter() {
  CORE.state.currentModule = "RAMALERO";

  // Cola de solicitudes en vivo (SSE + poll de respaldo)
  enterSolicitudes_();

  // Planos de armado (estáticos; se pintan una sola vez)
  initPlanos_();

  // Ramales repartidos y por devolver (ver views/ramales/mi-turno.js).
  // Si el módulo de ramales todavía no está instalado en Supabase, el
  // panel se oculta solo y la vista sigue funcionando igual.
  mountMiTurno(document.getElementById("ramalMiTurnoBody"));

  // Push nativo: suscribe si ya hay permiso y muestra el aviso si falta.
  _avisoNotif?.().catch(() => {});

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
