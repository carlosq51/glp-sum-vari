// =========================
// public/js/views/ramalero/ramalero.js
// Vista RAMALERO (sin VIN)
// - aquí dejamos solo el “shell” + hooks
// Nota: Tu RAMALERO completo (evento sin VIN + promedio) se puede mover aquí,
//       pero para que sea 100% copy/paste y no explotar el tamaño, lo dejamos “mínimo”
//       y RAMALERO se maneja por tu backend + render-work (ya muestra tipoRamal).
// =========================
import { CORE, $, el_, ctx_, withLock, setOut, requireEmailOrStop, postJSON_user } from "../../core/core.js";
import { renderActivas_, renderFinalizados_, rebuildListsFromStore_ } from "../../core/render-work.js";
import { startLoopsFor_, stopLoopsFor_, clearModuleUI_ } from "../../core/loops.js";
import { syncNow, tickClocksUI_ } from "../conversion/conversion.js";

export function init() {
  $("btnActivasR")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true }), "Refrescando...");
  });

  $("btnFinalizadosR")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizados").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      renderFinalizados_();
    }, "Cargando finalizados...");
  });

  // Crear nuevo ramal (INICIO sin VIN)
  document.getElementById("btnRamalNuevo")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;

    const ramalIdEl = document.getElementById("ramalId");
    if (ramalIdEl) ramalIdEl.value = "";

    // evento INICIO para RAMALERO
    let email;
    try { email = requireEmailOrStop(); } catch { return; }

    const tipoRamal = String(document.getElementById("tipoRamal")?.value || "").trim();
    const j = await postJSON_user("/api/evento", {
      email, rolTrabajo: "RAMALERO", accion: "INICIO", tipoRamal
    }, "Iniciando...");
    setOut(j);

    if (!j?.ok) return;
    // refresh store
    syncNow({ forceFull: true, showOut: false }).catch(() => {});
  });
}

export function enter() {
  CORE.state.currentModule = "RAMALERO";
  startLoopsFor_("RAMALERO", { syncNow, tickClocksUI: tickClocksUI_ });
}

export function exit() {
  stopLoopsFor_("RAMALERO");
  clearModuleUI_("RAMALERO");
}