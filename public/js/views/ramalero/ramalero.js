import { CORE } from "../../core/core.js";
import { startLoopsFor_, stopLoopsFor_, clearModuleUI_ } from "../../core/loops.js";
import { syncNow } from "../conversion/data/conversion-sync.js";
import { tickClocksUI_ } from "../conversion/conversion.js";
import { initRamaleroActions_ } from "./ramalero-actions.js";
import { initRamaleroDelegation_ } from "./ramalero-delegation.js";
import { patchVisibleCards_ } from "../../work/index.js";
import { enterSolicitudes_, exitSolicitudes_ } from "./ramalero-solicitudes.js";
import { requestNotifPermission, getNotifStatus } from "../../core/push-client.js";
import { getEmail } from "../../core/auth.js";
import { mountMiTurno, unmountMiTurno } from "../ramales/mi-turno.js";
import { resetHistorial_ } from "./ramalero-historial.js";
import { initPlanos_ } from "./planos.js";

/**
 * Muestra el aviso "este celular no te avisa" cuando falta el permiso o la
 * suscripción push. El pedido automático al entrar llega sin un toque del
 * usuario y Chrome en Android puede descartarlo en silencio: los ramaleros
 * quedaban sin suscripción y nunca recibían "Nueva solicitud de ramal".
 * El botón pide el permiso con un toque real (force: limpia el opt-out).
 */
async function pintarAvisoNotif_() {
  const box = document.getElementById("ramNotifAviso");
  const txt = document.getElementById("ramNotifTxt");
  const btn = document.getElementById("ramNotifBtn");
  if (!box) return;
  const st = await getNotifStatus();
  if (!st.soporta || (st.permiso === "granted" && st.suscrito)) {
    box.style.display = "none";
    return;
  }
  box.style.display = "flex";
  if (st.permiso === "denied") {
    txt.textContent = "🔕 Las notificaciones están bloqueadas en este celular. Actívalas en Ajustes de Chrome → Notificaciones para enterarte de solicitudes nuevas.";
    btn.style.display = "none";
  } else {
    txt.textContent = "🔕 Este celular no te avisa de solicitudes nuevas.";
    btn.style.display = "";
  }
}

export function init() {
  initRamaleroActions_();
  initRamaleroDelegation_();

  document.getElementById("ramNotifBtn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await requestNotifPermission(getEmail(), { force: true });
    } finally {
      btn.disabled = false;
      pintarAvisoNotif_();
    }
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

  // Push nativo: el ramalero recibe notificación en el celular cuando
  // un técnico crea una solicitud nueva (ver routes/ramal.js).
  // getEmail(): el input #email puede estar vacío con la sesión iniciada.
  const email = getEmail();
  if (email) requestNotifPermission(email).finally(pintarAvisoNotif_);
  else pintarAvisoNotif_();

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
