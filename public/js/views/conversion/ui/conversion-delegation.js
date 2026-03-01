// public/js/views/conversion/ui/conversion-delegation.js
import {
  CORE,
  $,
  el_,
  ctx_,
  enforceRolLock_,
} from "../../../core/core.js";

import { enviarEvento } from "../data/conversion-eventos.js";
import { openIncidenciaModalForKey_ } from "../modals/incidencias.js";
import { openRFModalForVin_ } from "../modals/rf-modal.js";
import { openRFTecModalForVin_ } from "../modals/rf-tecnico-modal.js";
import { openConformidadModalForKey_ } from "../modals/conformidad.js";

function attachWorkDelegationOnce_(mod) {
  const prev = CORE.state.currentModule;
  CORE.state.currentModule = mod;
  try {
    const box = el_("activasBox");
    if (!box) return;

    const markKey = `bound_${mod}`;
    if (box.dataset[markKey] === "1") return;
    box.dataset[markKey] = "1";

    // mostrar botón guardar nota
    box.addEventListener("input", (e) => {
      const ta = e.target.closest("textarea.notaCard");
      if (!ta) return;
      const btn = ta.closest(".jobCard")?.querySelector(".btnNota");
      if (btn) btn.style.display = ta.value.trim() ? "block" : "none";
    });

    box.addEventListener("click", async (e) => {
      const card = e.target.closest(".jobCard");
      if (!card) return;

      // ✅ 1) ACCIONES (PAUSA/FIN/REANUDAR/INICIO/NOTA)
      const actBtn = e.target.closest('button[data-act]');
      if (actBtn) {
        e.stopPropagation();
        const accion = String(actBtn.dataset.act || "").toUpperCase();

        const c = ctx_();
        const k = card.dataset.key || "";
        const it = c.itemsByKey.get(k);
        if (!it) return;

        // si quieres reflejar VIN/ROL como antes:
        const vinEl = el_("vin");
        if (vinEl) vinEl.value = it.vin || "";
        if (CORE.state.currentModule === "TECNICO" && !CORE.state.rolLock) {
          if ($("rol")) $("rol").value = it.rolTrabajo || "MOTOR";
          enforceRolLock_();
        }
        if (accion === "NOTA" && $("nota")) {
          $("nota").value = String(card.querySelector("textarea.notaCard")?.value || "");
        }

        await enviarEvento(accion, { clearKey: k });
        return;
      }

      // ✅ 2) BOTONES data-go (INC / RF / CONF)
      const goBtn = e.target.closest('button[data-go]');
      if (!goBtn) return;

      const go = String(goBtn.dataset.go || "").toUpperCase();
      const c = ctx_();
      const k = card.dataset.key || "";
      const it = c.itemsByKey.get(k);
      if (!it) return;

      if (go === "RF") {
        const vin = String(goBtn.dataset.vin || it.vin || "").trim().toUpperCase();
        if (!vin) return;

        if (CORE.state.currentModule === "TECNICO") {
          if ($("vin")) $("vin").value = vin;
          openRFTecModalForVin_(vin);   // ✅ ahora abre modal con 2 opciones
          return;
        }

        if (CORE.state.currentModule === "CALIDAD") {
          if ($("vinQ")) $("vinQ").value = vin;
          openRFModalForVin_(vin); // ✅ CALIDAD abre modal
          return;
        }
      }

      if (go === "INC") {
        e.stopPropagation();
        const key = String(goBtn.dataset.key || k || "").trim();
        if (!key) return;
        await openIncidenciaModalForKey_(key);
        return;
      }

      if (go === "CONF") {
        e.stopPropagation();
        await openConformidadModalForKey_(k);
        return;
      }
    });
  } finally {
    CORE.state.currentModule = prev;
  }
}

function attachFinalizadosDelegationOnce_(mod) {
  const prev = CORE.state.currentModule;
  CORE.state.currentModule = mod;
  try {
    const box = el_("finalizadosBox");
    if (!box) return;

    const markKey = `boundFin_${mod}`;
    if (box.dataset[markKey] === "1") return;
    box.dataset[markKey] = "1";

    box.addEventListener("click", async (e) => {
      const btn = e.target?.closest?.("button[data-go]");
      if (!btn) return;

      const go = String(btn.dataset.go || "").toUpperCase();
      const c = ctx_();
      const k = String(btn.dataset.key || btn.closest("[data-key]")?.dataset?.key || "").trim();
      const it = k ? c.itemsByKey.get(k) : null;

      // --------------------------
      // INC (registrar incidencia)
      // --------------------------
      if (go === "INC") {
        e.stopPropagation();
        if (!k) return;
        await openIncidenciaModalForKey_(k);
        return;
      }

      // --------------------------
      // RF (fotos/fallas)
      // --------------------------
      if (go === "RF") {
        e.stopPropagation();

        const vin = String(btn.dataset.vin || it?.vin || "").trim().toUpperCase();
        if (!vin) return;

        if (CORE.state.currentModule === "TECNICO") {
          if ($("vin")) $("vin").value = vin;
          openRFTecModalForVin_(vin);
          return;
        }

        if (CORE.state.currentModule === "CALIDAD") {
          if ($("vinQ")) $("vinQ").value = vin;
          openRFModalForVin_(vin);
          return;
        }
      }
    });
  } finally {
    CORE.state.currentModule = prev;
  }
}

export function initConversionDelegation_() {
  attachWorkDelegationOnce_("TECNICO");
  attachWorkDelegationOnce_("CALIDAD");
  attachFinalizadosDelegationOnce_("TECNICO");
  attachFinalizadosDelegationOnce_("CALIDAD");
}