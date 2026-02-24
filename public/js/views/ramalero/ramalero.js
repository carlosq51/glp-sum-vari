// =========================
// public/js/views/ramalero/ramalero.js
// RAMALERO (sin VIN) - FIX: actions wiring (data-act)
// =========================
import {
  CORE, $, el_, ctx_, withLock, setOut, requireEmailOrStop, postJSON_user
} from "../../core/core.js";

import {
  renderActivas_, renderFinalizados_, rebuildListsFromStore_, patchVisibleCards_
} from "../../core/render-work.js";

import { startLoopsFor_, stopLoopsFor_, clearModuleUI_ } from "../../core/loops.js";
import { syncNow, tickClocksUI_ } from "../conversion/conversion.js";

let boundOnce = false;

function closest_(node, sel) {
  return node?.closest ? node.closest(sel) : null;
}

function bindOnce_() {
  if (boundOnce) return;
  boundOnce = true;

  // 🔄 Refrescar
  $("btnActivasR")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true }), "Refrescando...");
  });

  // 👀 Finalizados toggle
  $("btnFinalizadosR")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;

      const btn = el_("btnFinalizados"); // en RAMALERO resuelve btnFinalizadosR
      if (btn) btn.textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";

      renderFinalizados_();
    }, "Cargando finalizados...");
  });

  // ✅ Crear nuevo ramal (INICIO sin VIN)
  $("btnRamalNuevo")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;

    const ramalIdEl = $("ramalId");
    if (ramalIdEl) ramalIdEl.value = "";

    let email;
    try { email = requireEmailOrStop(); } catch { return; }

    const tipoRamal = String($("tipoRamal")?.value || "").trim();
    if (!tipoRamal) {
      setOut({ ok: false, error: "Selecciona tipo de ramal" });
      return;
    }

    const j = await postJSON_user("/api/evento", {
      email,
      rolTrabajo: "RAMALERO",
      accion: "INICIO",
      tipoRamal,
    }, "Iniciando...");

    setOut(j);
    if (!j?.ok) return;

    syncNow({ forceFull: true, showOut: false }).catch(() => {});
  });

  // ✅ Delegación de eventos sobre el contenedor de cards activas (R)
  document.addEventListener("click", async (ev) => {
    if (CORE.state.currentModule !== "RAMALERO") return;

    const box = el_("activasBox"); // -> activasBoxR por tu el_()
    if (!box) return;

    const target = ev.target;

    // 1) Click en botones de acción (INICIO/PAUSA/REANUDAR/FIN/NOTA)
    const btnAct = closest_(target, "button[data-act]");
    if (btnAct && box.contains(btnAct)) {
      ev.preventDefault();
      ev.stopPropagation();

      const card = closest_(btnAct, ".jobCard[data-key]");
      const key = card?.dataset?.key || "";
      if (!key) return;

      const it = ctx_().itemsByKey.get(key);
      if (!it) return;

      const accion = String(btnAct.dataset.act || "").toUpperCase();
      if (!accion) return;

      let email;
      try { email = requireEmailOrStop(); } catch { return; }

      // Nota (si aplica)
      let nota = "";
      if (accion === "NOTA") {
        const ta = card.querySelector("textarea.notaCard");
        nota = String(ta?.value || "").trim();
      }

      // tipoRamal: para RAMALERO lo mandamos siempre por seguridad
      const tipoRamal = String(it.tipoRamal || $("tipoRamal")?.value || "").trim();

      const body = {
        email,
        rolTrabajo: "RAMALERO",
        accion,
        conversionId: String(it.conversionId || "").trim(),
        tipoRamal,
        nota,
      };

      const j = await postJSON_user("/api/evento", body, `Enviando ${accion}...`);
      setOut(j);

      if (j?.ok) {
        syncNow({ forceFull: true, showOut: false }).catch(() => {});
      }
      return;
    }

    // 2) Toggle abrir/cerrar card al tocar header (no en inputs)
    const card = closest_(target, ".jobCard");
    if (card && box.contains(card)) {
      const isInteractive =
        closest_(target, "button") ||
        closest_(target, "textarea") ||
        closest_(target, "input") ||
        closest_(target, "select") ||
        closest_(target, "a");

      if (isInteractive) return;

      card.classList.toggle("open");
      return;
    }
  });

  // ✅ Mostrar botón "Guardar nota" cuando escribes (delegación input)
  document.addEventListener("input", (ev) => {
    if (CORE.state.currentModule !== "RAMALERO") return;

    const box = el_("activasBox"); // activasBoxR
    if (!box) return;

    const ta = closest_(ev.target, "textarea.notaCard");
    if (!ta || !box.contains(ta)) return;

    const card = closest_(ta, ".jobCard");
    if (!card) return;

    const btnNota = card.querySelector("button.btnNota[data-act='NOTA']");
    if (!btnNota) return;

    const hasText = String(ta.value || "").trim().length > 0;
    btnNota.style.display = hasText ? "block" : "none";
  });
}

export function init() {
  bindOnce_();
}

export function enter() {
  CORE.state.currentModule = "RAMALERO";
  startLoopsFor_("RAMALERO", {
    syncNow,
    tickClocksUI: () => {
      // clocks + patch UI si ya hay data
      tickClocksUI_?.();
      patchVisibleCards_?.();
    },
  });
}

export function exit() {
  stopLoopsFor_("RAMALERO");
  clearModuleUI_("RAMALERO");
}