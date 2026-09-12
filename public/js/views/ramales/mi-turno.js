// =========================
// public/js/views/ramales/mi-turno.js
// Panel compacto del RAMALERO dentro de su propia vista.
//
// Solo ve —y solo puede tocar— lo suyo: los ramales que le repartieron y
// todavía no devuelve. Devuelve contra lo que el supervisor le firmó,
// marca por marca: no puede devolver más de lo que le dieron ni cambiarle
// la marca a lo que trae.
//
// Su tiempo corre de que le reparten a que devuelve. Se le dice aquí,
// porque un reloj que el medido no conoce no mejora a nadie.
// =========================

import { getJSON, postJSON, escapeHtml, getEmail } from "../../core/core.js";
import { startPoll, stopPoll } from "../../core/poll.js";
import { icon } from "../../core/icons.js";
import { fmtDia } from "./comportamiento.js";

const MT = { root: null, raw: null, email: "" };

const esc = escapeHtml;

function toast_(msg, tipo = "ok") {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:9999;
    padding:11px 18px;border-radius:12px;font-weight:700;font-size:.88rem;
    max-width:90vw;text-align:center;box-shadow:0 8px 28px rgba(0,0,0,.28);
    background:${tipo === "bad" ? "var(--bad,#ef4444)" : "var(--ok)"};color:#fff;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), tipo === "bad" ? 5000 : 2600);
}

async function cargar_() {
  if (!MT.root || !MT.email) return;
  try {
    const j = await getJSON(`/api/ramales/mi-panel?email=${encodeURIComponent(MT.email)}`);
    if (!j?.ok) throw new Error(j?.error || "Respuesta inesperada");
    MT.raw = j;
    render_();
  } catch (e) {
    // El módulo de ramales puede no estar instalado todavía. Eso no puede
    // romper la vista del ramalero, que tiene su cola de solicitudes al
    // frente y esa sí es su trabajo principal: se oculta y ya.
    MT.root.innerHTML = "";
    MT.root.style.display = "none";
    console.warn("[mi-turno] panel no disponible:", e?.message);
  }
}

/**
 * Un reparto pendiente. La marca va escrita al lado del número porque de
 * un mismo día se pueden tener dos marcas, y devolver 8 sin saber de cuál
 * es exactamente el error que el stock no perdona.
 */
function renderPendiente_(p) {
  return `
    <div class="rmSplit__row">
      <span class="rmSplit__nom">
        ${esc(p.tipo_ramal || "Sin marca")}
        <span class="rmSplit__sub">
          día ${esc(fmtDia(p.fecha || p.asignado_at))} · te dieron ${p.cantidad_asignada}
        </span>
      </span>
      <input type="number" min="0" step="1" max="${p.cantidad_asignada}"
             value="${p.cantidad_asignada}" data-mt-cant="${p.id}"
             title="Cuántos devuelves" />
      <button class="btn3 rmBtn--primary" data-mt="devolver" data-id="${p.id}">
        ${icon("trayIn", 14)} Devolver
      </button>
    </div>`;
}

function render_() {
  if (!MT.root || !MT.raw) return;
  const pendientes = MT.raw.pendientes || [];
  MT.root.style.display = "block";

  // Sin nada en la mano el panel no ocupa espacio: una línea. El ramalero
  // tiene su cola de solicitudes al frente y eso es lo que hace casi todo
  // el día.
  if (!pendientes.length) {
    MT.root.innerHTML = `
      <div class="rmMio">
        <div class="rmMio__vacio">
          No tienes ramales por devolver. Cuando el supervisor te reparta,
          aparecen aquí.
        </div>
      </div>`;
    return;
  }

  MT.root.innerHTML = `
    <div class="rmMio">
      <div>
        <div class="rmTurno__label" style="margin-bottom:6px;">
          Ramales que te dieron para trabajar
        </div>
        <div class="rmSplit">${pendientes.map(renderPendiente_).join("")}</div>
        <div class="rmMio__vacio" style="margin-top:6px;">
          Cuando termines, pon cuántos traes de vuelta a oficina. Tu tiempo
          corre desde que te repartieron hasta que devuelves.
        </div>
      </div>
    </div>`;
}

async function onClick_(e) {
  const btn = e.target.closest("[data-mt]");
  if (!btn || !MT.root?.contains(btn)) return;
  const id = btn.dataset.id;

  try {
    if (btn.dataset.mt === "devolver") {
      const cant = Number(MT.root.querySelector(`[data-mt-cant="${id}"]`)?.value ?? 0);
      btn.disabled = true;
      const j = await postJSON(`/api/ramales/reparto/${id}/devolver`, {
        email: MT.email,
        cantidad_devuelta: cant,
        cantidad_rechazada: 0,
      });
      btn.disabled = false;
      if (!j?.ok) return toast_(j?.error || "No se pudo devolver.", "bad");
      toast_(`${j.al_stock} ramales entregados a oficina.`);
      await cargar_();
    }
  } catch (err) {
    btn.disabled = false;
    toast_(String(err?.message || err), "bad");
  }
}

/** Monta el panel del ramalero. Idempotente. */
export function mountMiTurno(container) {
  if (!container) return;
  unmountMiTurno();
  MT.root = container;
  MT.email = String(getEmail() || "").trim().toLowerCase();
  if (!MT.email) return;

  container.addEventListener("click", onClick_);
  cargar_();
  startPoll("RAMALES_MI_TURNO", cargar_, { immediate: false, cfgKey: "POLL_RAMALES_MS" });
}

export function unmountMiTurno() {
  stopPoll("RAMALES_MI_TURNO");
  MT.root?.removeEventListener("click", onClick_);
  MT.root = null;
  MT.raw = null;
}
