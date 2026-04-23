// public/js/views/conversion/ui/conversion-delegation.js
import {
  CORE,
  $,
  el_,
  ctx_,
  enforceRolLock_,
  requireEmailOrStop,
  getJSON,
  postJSON,
  escapeHtml,
  fmtShort_,
} from "../../../core/core.js";

import { enviarEvento } from "../data/conversion-eventos.js";
import { openIncidenciaModalForKey_ } from "../modals/incidencias.js";
import { openRFModalForVin_ } from "../modals/rf-modal.js";
import { openRFTecModalForVin_ } from "../modals/rf-tecnico-modal.js";
import { openConformidadModalForKey_ } from "../modals/conformidad.js";
import { askConfirmFinish_ } from "../modals/confirm-finish.js";

import { openSupIncModal_, fetchIncidencias_, renderIncidencias_ } from "../../supervisor/sup-incidencias.js";

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

        // ✅ Confirmación de seguridad antes de finalizar
        if (accion === "FIN") {

          // ── Pre-requisitos de cierre (MOTOR y TANQUE) ──────────────────
          const rolUp = String(it.rolTrabajo || "").toUpperCase();
          if (rolUp === "MOTOR" || rolUp === "TANQUE") {
            const today = new Date().toISOString().slice(0, 10);
            try {
              const check = await postJSON("/api/fin-prerequisites", {
                vin: it.vin,
                rol: it.rolTrabajo,
                workOrderId: it.work_order_id,
                dateStr: today,
              });
              if (check.ok && !check.canFin && check.blockers?.length) {
                const lista = check.blockers.map(b => `• ${b}`).join("<br>");
                await askConfirmFinish_({
                  title: "⛔ No puedes finalizar aún",
                  message: `Completa los siguientes requisitos antes de cerrar:<br><br>${lista}`,
                  blockMode: true,
                });
                return;   // bloquear FIN
              }
            } catch (e) {
              console.warn("[FIN] No se pudo verificar requisitos previos:", e);
              // soft fail: si la red falla, dejamos pasar con el confirm normal
            }
          }

        const ok = await askConfirmFinish_({
            title: "Confirmar finalización",
            message: "¿Seguro que quieres finalizar este trabajo? Esta acción puede cerrar la tarea actual.",
            acceptText: "Sí, finalizar",
            cancelText: "Cancelar",
        });

        if (!ok) return;
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

      if (go === "VER_INC") {
        e.stopPropagation();
        const vin = String(goBtn.dataset.vin || it?.vin || "").trim().toUpperCase();
        const cid = String(goBtn.dataset.cid || it?.conversionId || "").trim();
        openSupIncModal_();
        const msg = document.getElementById("supIncMsg");
        if (msg) msg.textContent = "Cargando...";
        fetchIncidencias_(vin, cid, { getJSON_user: getJSON })
          .then(j => renderIncidencias_(j, { vin, conversionId: cid, who: vin }, { escapeHtml, fmtShort_ }))
          .catch(err => renderIncidencias_({ ok: false, error: String(err?.message || err) }, { vin }, { escapeHtml, fmtShort_ }));
        return;
      }

      if (go === "CONF") {
        e.stopPropagation();
        await openConformidadModalForKey_(k);
        return;
      }
    });

    // ✅ 3) SOLICITAR RAMAL
    box.addEventListener("click", async (e) => {
      const btn = e.target.closest('[data-solicitar-ramal]');
      if (!btn) return;
      e.stopPropagation();

      const vin = String(btn.dataset.vin || "").trim().toUpperCase();
      const cid = String(btn.dataset.cid || "").trim();

      let email;
      try { email = requireEmailOrStop(); } catch { return; }

      btn.disabled = true;
      btn.textContent = "Enviando...";

      try {
        const res = await postJSON("/api/solicitud-ramal", { email, vin, conversionId: cid, nota: "" });
        if (res?.ok) {
          btn.textContent = "✓ Solicitado";
          showSolRamalToast_(vin);
        } else if (res?.errorType === "DUPLICATE_VIN") {
          btn.textContent = "⚠ Ya solicitado";
          btn.disabled = true;
        } else {
          btn.textContent = "🔩 Solicitar Ramal";
          btn.disabled = false;
          alert(res?.error || "Error al solicitar ramal");
        }
      } catch (err) {
        btn.textContent = "🔩 Solicitar Ramal";
        btn.disabled = false;
      }
    });
  } finally {
    CORE.state.currentModule = prev;
  }
}

function showSolRamalToast_(vin) {
  const now = new Date();
  const hhmm = now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  const toast = document.createElement("div");
  toast.style.cssText = [
    "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;",
    "background:#1e1e2e;color:#cdd6f4;border:1px solid #a6e3a1;",
    "border-radius:12px;padding:16px 20px;max-width:340px;width:90%;display:flex;",
    "flex-direction:column;gap:8px;box-shadow:0 8px 24px rgba(0,0,0,.5);",
  ].join("");

  toast.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <strong style="color:#a6e3a1;font-size:1rem;">🔩 Solicitud creada con éxito</strong>
      <button id="solRamalToastClose" style="
        background:none;border:none;cursor:pointer;
        font-size:1.3rem;color:#cdd6f4;line-height:1;padding:0 4px;
      ">×</button>
    </div>
    <div style="font-size:.85rem;opacity:.8;">
      ${vin ? `VIN: <code style="color:#89b4fa;">${vin}</code><br>` : ""}
      Enviado a las <strong>${hhmm}</strong>
    </div>
  `;

  document.body.appendChild(toast);

  const close = () => toast.remove();
  toast.querySelector("#solRamalToastClose")?.addEventListener("click", close);
  setTimeout(close, 8000);
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

      if (go === "VER_INC") {
        e.stopPropagation();
        const vin = String(btn.dataset.vin || it?.vin || "").trim().toUpperCase();
        const cid = String(btn.dataset.cid || it?.conversionId || "").trim();
        openSupIncModal_();
        const msg = document.getElementById("supIncMsg");
        if (msg) msg.textContent = "Cargando...";
        fetchIncidencias_(vin, cid, { getJSON_user: getJSON })
          .then(j => renderIncidencias_(j, { vin, conversionId: cid, who: vin }, { escapeHtml, fmtShort_ }))
          .catch(err => renderIncidencias_({ ok: false, error: String(err?.message || err) }, { vin }, { escapeHtml, fmtShort_ }));
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