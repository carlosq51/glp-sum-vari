// =========================
// public/js/views/informe/cola-impresion.js
// La cola de la oficina: los informes que los técnicos mandaron desde el
// taller, esperando a que alguien los imprima.
//
// Vive en ADMIN y en SUPERVISOR, así que es un módulo que se monta sobre el
// contenedor que le den, sin saber en cuál de los dos está. Por eso no toca
// nada fuera de su `host`.
//
// Un solo botón por fila: ABRIR. Lleva a /informe-taller?id=… , que es la
// pantalla que ya existe — ahí se ven las 3 hojas, se corrige lo que venga
// mal y se imprime. Revisar y modificar son la misma cosa, y separarlas en
// dos pantallas solo obligaría a mantener dos.
// =========================

import { getJSON, postJSON } from "../../core/api.js";
import { CORE } from "../../core/state.js";
import { escapeHtml } from "../../core/format.js";

const $ = (id) => document.getElementById(id);

let host_ = null;
let items_ = [];
let incompletos_ = [];

/** "hace 5 min", "hace 2 h" — en la cola importa la espera, no la hora. */
function hace_(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function email_() {
  return CORE.state.currentProfile?.email || CORE.state.email || "";
}

/** Una fila de la cola. `lista` = está completa y se puede imprimir. */
function fila_(it, lista) {
  const falta = !lista ? faltaDe_(it) : "";
  return `
    <div class="ciFila${lista ? "" : " is-incompleta"}">
      <div class="ciDatos">
        <div class="ciOt">OT ${escapeHtml(it.ot_fisica || "—")}</div>
        <div class="ciSub">
          ${it.placa ? `<b>${escapeHtml(it.placa)}</b>` : ""}
          ${it.vin ? `<span class="ciVin">${escapeHtml(it.vin)}</span>` : ""}
        </div>
        <div class="ciQuien small muted">
          ${escapeHtml(it.creado_nombre || it.creado_por || "—")} · ${escapeHtml(hace_(it.created_at))}
        </div>
        ${falta ? `<div class="ciFalta">Falta la parte ${escapeHtml(falta)}</div>` : ""}
      </div>
      <div class="ciAcciones">
        <button type="button" class="${lista ? "ciAbrir" : "ciCompletar"}" data-ci-abrir="${escapeHtml(it.id)}">
          ${lista ? "Abrir" : "Completar"}
        </button>
        <button type="button" class="ciAnular" data-ci-anular="${escapeHtml(it.id)}" title="Descartar este informe">✕</button>
      </div>
    </div>`;
}

// La cola no sabe qué mitad falta —eso vive en el servidor— pero sí quién
// mandó. Con eso basta para decir a quién hay que ir a buscar.
function faltaDe_(it) {
  const quien = String(it.creado_nombre || "").trim();
  return quien ? `del compañero de ${quien}` : "de uno de los dos técnicos";
}

function pintar_() {
  if (!host_) return;

  if (!items_.length && !incompletos_.length) {
    host_.innerHTML = `
      <div class="ciVacio">
        <h4>No hay informes esperando</h4>
        <p class="small muted">Cuando los dos técnicos manden su parte desde el taller, el informe aparecerá aquí listo para imprimir.</p>
      </div>`;
    return;
  }

  const listos = items_.length
    ? `<div class="ciLista">${items_.map(it => fila_(it, true)).join("")}</div>`
    : `<div class="ciVacio"><p class="small muted">Ninguno listo para imprimir ahora mismo.</p></div>`;

  // Los incompletos se ven aunque no se puedan imprimir: si no, un informe
  // cuyo compañero nunca envía quedaría invisible y en la oficina no
  // sabrían a quién ir a buscar.
  const medias = incompletos_.length ? `
    <div class="ciSeccion">
      <div class="ciSeccionTit">A medias · ${incompletos_.length}</div>
      <p class="small muted">Falta que el otro técnico mande su parte. No se pueden imprimir hasta que esté completo, pero se pueden completar a mano.</p>
      <div class="ciLista">${incompletos_.map(it => fila_(it, false)).join("")}</div>
    </div>` : "";

  host_.innerHTML = `
    <div class="ciHead">
      <div class="ciCuenta">${items_.length} listo${items_.length === 1 ? "" : "s"} para imprimir</div>
      <button type="button" id="ciRefrescar">Refrescar</button>
    </div>
    ${listos}
    ${medias}`;
}

async function cargar_() {
  if (!host_) return;
  try {
    const r = await getJSON(`/api/informes?email=${encodeURIComponent(email_())}`);
    if (!r?.ok) throw new Error(r?.error || "No se pudo cargar la cola.");
    items_ = r.items || [];
    incompletos_ = r.incompletos || [];
    pintar_();
  } catch (err) {
    host_.innerHTML = `
      <div class="ciVacio">
        <h4>No se pudo cargar la cola</h4>
        <p class="small muted">${escapeHtml(String(err?.message || err))}</p>
      </div>`;
  }
}

async function anular_(id) {
  // Descartar un informe borra trabajo de un técnico: se pregunta.
  const it = [...items_, ...incompletos_].find(x => x.id === id);
  if (!confirm(`¿Descartar el informe de la OT ${it?.ot_fisica || ""}?\n\nEl técnico tendría que volver a mandarlo.`)) return;
  try {
    const r = await postJSON(`/api/informes/${id}/anular`, { email: email_() });
    if (!r?.ok) throw new Error(r?.error || "No se pudo anular.");
    items_ = items_.filter(x => x.id !== id);
    incompletos_ = incompletos_.filter(x => x.id !== id);
    pintar_();
  } catch (err) {
    alert(String(err?.message || err));
  }
}

/**
 * Monta la cola dentro de un contenedor.
 * @param {HTMLElement} el donde pintarla
 */
export async function renderColaImpresion(el) {
  if (!el) return;
  host_ = el;
  host_.classList.add("ciWrap");

  if (!host_.dataset.ciBound) {
    host_.addEventListener("click", (e) => {
      const abrir = e.target.closest("[data-ci-abrir]");
      if (abrir) {
        // A la pantalla que ya existe, con el informe cargado.
        window.location.href = `/informe-taller?id=${encodeURIComponent(abrir.dataset.ciAbrir)}`;
        return;
      }
      const anular = e.target.closest("[data-ci-anular]");
      if (anular) { anular_(anular.dataset.ciAnular); return; }
      if (e.target.closest("#ciRefrescar")) cargar_();
    });
    host_.dataset.ciBound = "1";
  }

  host_.innerHTML = `<div class="ciVacio"><p class="small muted">Cargando…</p></div>`;
  await cargar_();
}

/** Para que quien la monte pueda refrescarla desde fuera (SSE, poll…). */
export function refrescarColaImpresion() {
  if (host_ && host_.isConnected) cargar_();
}
