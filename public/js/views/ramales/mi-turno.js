// =========================
// public/js/views/ramales/mi-turno.js
// Panel compacto del RAMALERO dentro de su propia vista.
//
// Aquí el ramalero solo ve —y solo puede tocar— lo suyo:
//   · si le toca el turno de la próxima caja
//   · la caja que está desembalando ahora, con su tiempo corriendo
//   · los ramales que le repartieron y todavía no devuelve
//
// LO QUE ESTE PANEL A PROPÓSITO NO PUEDE HACER
// ────────────────────────────────────────────
// No arranca ni para el cronómetro oficial. El botón «ya terminé» manda
// un AVISO al supervisor; el reloj lo cierra él cuando tiene los cables
// principales en la mano. Si el ramalero pudiera cerrar su propio
// tiempo, la medición volvería a ser una declaración — que es justo el
// problema que este módulo existe para resolver.
//
// Devolver ramales sí lo hace él, pero contra la cantidad que el
// supervisor le firmó: no puede devolver más de lo que le asignaron.
// =========================

import { getJSON, postJSON, escapeHtml, getEmail } from "../../core/core.js";
import { startPoll, stopPoll } from "../../core/poll.js";
import { icon } from "../../core/icons.js";

const MT = { root: null, raw: null, clockTimer: null, email: "" };

const esc = escapeHtml;

function fmtDur_(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seg = Math.floor(ms / 1000);
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

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

function renderPendiente_(p) {
  return `
    <div class="rmSplit__row">
      <span class="rmSplit__nom">
        Caja ${esc(p.codigo || "—")}
        <span class="rmSplit__sub">${p.cantidad_asignada} ramales asignados</span>
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
  const d = MT.raw;
  MT.root.style.display = "block";

  const desembalando = d.mi_desembalaje;
  const pendientes = d.pendientes || [];

  // Si no le toca nada y no debe nada, el panel no ocupa espacio: una
  // línea. El ramalero tiene su cola de solicitudes al frente y eso es
  // lo que trabaja el 90% del día.
  if (!desembalando && !pendientes.length && !d.me_toca) {
    MT.root.innerHTML = `
      <div class="rmMio">
        <div class="rmMio__vacio">
          Sin caja asignada. El siguiente turno de desembalaje es de
          <strong>${esc(d.siguiente_turno || "—")}</strong>.
        </div>
      </div>`;
    return;
  }

  MT.root.innerHTML = `
    <div class="rmMio">
      ${d.me_toca && !desembalando ? `
        <div class="rmMio__turno is-mio">
          <strong>📦 Te toca la próxima caja.</strong>
          <div class="small" style="color:var(--muted);margin-top:3px;">
            Tu tiempo arranca cuando el supervisor registre que llegó.
          </div>
        </div>` : ""}

      ${desembalando ? `
        <div class="rmMio__turno is-mio">
          <div class="rmTurno__label">Estás desembalando</div>
          <div class="rmMio__head">
            <strong style="font-size:1.1rem;">${esc(desembalando.codigo)}</strong>
            <span class="rmChip">${desembalando.cantidad_equipos} equipos</span>
            <span class="rmClock is-corriendo" data-mt-clock="1">—</span>
          </div>
          ${desembalando.desembalaje_fin_at ? `
            <div class="rmAviso info" style="margin-top:10px;">
              <strong>✓ Ya avisaste</strong>
              El supervisor cierra el tiempo cuando reciba los cables principales.
            </div>` : `
            <button class="btn3 rmBtn--primary" style="margin-top:11px;width:100%;"
                    data-mt="fin" data-id="${desembalando.id}">
              ${icon("trayOut", 14)} Ya saqué todo — avisar al supervisor
            </button>`}
        </div>` : ""}

      ${pendientes.length ? `
        <div>
          <div class="rmTurno__label" style="margin-bottom:6px;">
            Ramales que te repartieron y no has devuelto
          </div>
          <div class="rmSplit">${pendientes.map(renderPendiente_).join("")}</div>
        </div>` : ""}
    </div>`;

  tick_();
}

function tick_() {
  const el = MT.root?.querySelector("[data-mt-clock]");
  const d = MT.raw?.mi_desembalaje;
  if (!el || !d?.desembalaje_inicio_at) return;
  el.textContent = fmtDur_(Date.now() - new Date(d.desembalaje_inicio_at).getTime());
}

async function onClick_(e) {
  const btn = e.target.closest("[data-mt]");
  if (!btn || !MT.root?.contains(btn)) return;
  const id = btn.dataset.id;

  try {
    if (btn.dataset.mt === "fin") {
      const j = await postJSON(`/api/ramales/lote/${id}/fin-desembalaje`, { email: MT.email });
      if (!j?.ok) return toast_(j?.error || "No se pudo avisar.", "bad");
      toast_("Avisado. El supervisor va por los cables.");
      await cargar_();
    } else if (btn.dataset.mt === "devolver") {
      const cant = Number(MT.root.querySelector(`[data-mt-cant="${id}"]`)?.value ?? 0);
      const j = await postJSON(`/api/ramales/reparto/${id}/devolver`, {
        email: MT.email,
        cantidad_devuelta: cant,
        cantidad_rechazada: 0,
      });
      if (!j?.ok) return toast_(j?.error || "No se pudo devolver.", "bad");
      toast_(`${j.al_stock} ramales entregados a oficina.`);
      await cargar_();
    }
  } catch (err) {
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
  MT.clockTimer = setInterval(tick_, 1000);
}

export function unmountMiTurno() {
  stopPoll("RAMALES_MI_TURNO");
  if (MT.clockTimer) clearInterval(MT.clockTimer);
  MT.clockTimer = null;
  MT.root?.removeEventListener("click", onClick_);
  MT.root = null;
  MT.raw = null;
}
