// =========================
// public/js/views/informe/cola-cc.js
// Las hojas CONTROL FINAL que pidieron los inspectores de calidad, debajo de
// la cola de informes. Vive en ADMIN y en SUPERVISOR, igual que esa cola.
//
// Un botón imprime TODAS las pendientes de una vez (una hoja por papel) y
// al cerrarse el diálogo de impresión quedan marcadas como impresas. Para
// volver a sacar una ya impresa, se busca por VIN.
//
// Las hojas se imprimen desde un iframe con la página que arma el servidor
// (/api/hojas-calidad/hojas): así el papel no hereda nada de la app.
// =========================

import { getJSON, postJSON } from "../../core/api.js";
import { CORE } from "../../core/state.js";
import { escapeHtml } from "../../core/format.js";

let host_ = null;
let pendientes_ = [];
let encontradas_ = null;   // null = no se ha buscado
let aviso_ = "";
let imprimiendo_ = false;
let escuchando_ = false;

const email_ = () => CORE.state.currentProfile?.email || CORE.state.email || "";

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

function fechaHora_(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("es-PE", {
    timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function fila_(it, { reimprimir = false } = {}) {
  const estado = it.estado === "IMPRESA"
    ? `Impresa ${escapeHtml(fechaHora_(it.impresa_at))}${it.impresa_nombre ? ` por ${escapeHtml(it.impresa_nombre)}` : ""}`
    : "Pendiente";
  return `
    <div class="ciFila">
      <div class="ciDatos">
        <div class="ciOt">${escapeHtml(it.vin)}</div>
        <div class="ciSub">${it.modelo ? `<b>${escapeHtml(it.modelo)}</b>` : ""}${reimprimir ? `<span>${estado}</span>` : ""}</div>
        <div class="ciQuien small muted">Pedida por ${escapeHtml(it.solicitado_nombre || "—")} · ${escapeHtml(hace_(it.created_at))}</div>
      </div>
      <div class="ciAcciones">
        ${reimprimir
          ? `<button type="button" class="ciCompletar" data-ccq-uno="${escapeHtml(it.id)}">Reimprimir</button>`
          : `<button type="button" class="ciAnular" data-ccq-anular="${escapeHtml(it.id)}" title="Pedida por error">✕</button>`}
      </div>
    </div>`;
}

function pintar_() {
  if (!host_) return;
  const n = pendientes_.length;

  const lista = n
    ? `<div class="ciLista">${pendientes_.map(it => fila_(it)).join("")}</div>`
    : `<div class="ciVacio"><p class="small muted">No hay hojas de calidad pendientes.</p></div>`;

  const resultados = encontradas_ == null ? "" : encontradas_.length
    ? `<div class="ciLista">${encontradas_.map(it => fila_(it, { reimprimir: true })).join("")}</div>`
    : `<p class="small muted">Ninguna hoja pedida con ese VIN.</p>`;

  host_.innerHTML = `
    <div class="ciHead">
      <div class="ciCuenta">Control de calidad · ${n} pendiente${n === 1 ? "" : "s"}</div>
      <button type="button" class="ciAbrir" id="ccqImprimir" ${n && !imprimiendo_ ? "" : "disabled"}>
        ${imprimiendo_ ? "Imprimiendo…" : `🖨 Imprimir ${n || ""}`.trim()}
      </button>
    </div>
    ${aviso_ ? `<div class="ccqAviso">${escapeHtml(aviso_)}</div>` : ""}
    ${lista}
    <div class="ciSeccion">
      <div class="ciSeccionTit">Reimprimir</div>
      <form class="ccqBuscar" id="ccqBuscar">
        <input type="search" id="ccqVin" placeholder="VIN o sus últimos dígitos" autocomplete="off">
        <button type="submit">Buscar</button>
      </form>
      ${resultados}
    </div>`;
}

async function cargar_() {
  if (!host_) return;
  try {
    const r = await getJSON(`/api/hojas-calidad?email=${encodeURIComponent(email_())}`);
    if (!r?.ok) throw new Error(r?.error || "No se pudieron cargar las hojas de calidad.");
    pendientes_ = r.items || [];
    pintar_();
  } catch (err) {
    host_.innerHTML = `
      <div class="ciVacio">
        <h4>No se pudieron cargar las hojas de calidad</h4>
        <p class="small muted">${escapeHtml(String(err?.message || err))}</p>
      </div>`;
  }
}

async function buscar_(vin) {
  const q = String(vin || "").trim();
  if (!q) { encontradas_ = null; pintar_(); return; }
  try {
    const r = await getJSON(`/api/hojas-calidad?vin=${encodeURIComponent(q)}&email=${encodeURIComponent(email_())}`);
    if (!r?.ok) throw new Error(r?.error || "No se pudo buscar.");
    encontradas_ = r.items || [];
  } catch (err) {
    encontradas_ = null;
    aviso_ = String(err?.message || err);
  }
  pintar_();
  const input = host_?.querySelector("#ccqVin");
  if (input) input.value = q;
}

/**
 * Carga las hojas en un iframe oculto y abre el diálogo de impresión.
 * Resuelve cuando el diálogo se cierra (print() bloquea hasta entonces).
 */
function imprimirEnIframe_(ids) {
  return new Promise((resolve, reject) => {
    const fr = document.createElement("iframe");
    fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    fr.src = `/api/hojas-calidad/hojas?ids=${ids.map(encodeURIComponent).join(",")}&email=${encodeURIComponent(email_())}`;
    fr.onload = () => {
      try {
        fr.contentWindow.focus();
        fr.contentWindow.print();
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        // El diálogo ya se cerró; se quita después para no cortar la cola
        // de impresión de un navegador que imprime en segundo plano.
        setTimeout(() => fr.remove(), 60_000);
      }
    };
    fr.onerror = () => { fr.remove(); reject(new Error("No se pudieron cargar las hojas.")); };
    document.body.appendChild(fr);
  });
}

async function imprimir_(ids) {
  if (!ids.length || imprimiendo_) return;
  imprimiendo_ = true;
  aviso_ = "";
  pintar_();
  try {
    await imprimirEnIframe_(ids);
    const r = await postJSON("/api/hojas-calidad/impresas", { ids, email: email_() });
    if (!r?.ok) throw new Error(r?.error || "No se pudieron marcar como impresas.");
    aviso_ = `${r.n} hoja${r.n === 1 ? "" : "s"} marcada${r.n === 1 ? "" : "s"} como impresa${r.n === 1 ? "" : "s"}. Si alguna no salió, búscala por VIN.`;
  } catch (err) {
    aviso_ = String(err?.message || err);
  } finally {
    imprimiendo_ = false;
  }
  await cargar_();
  const q = host_?.querySelector("#ccqVin")?.value;
  if (encontradas_ && q) await buscar_(q);
}

async function anular_(id) {
  const it = pendientes_.find(x => x.id === id);
  if (!confirm(`¿Quitar la hoja de calidad del ${it?.vin || "carro"}?\n\nNo se imprimirá.`)) return;
  try {
    const r = await postJSON(`/api/hojas-calidad/${id}/anular`, { email: email_() });
    if (!r?.ok) throw new Error(r?.error || "No se pudo quitar.");
    pendientes_ = pendientes_.filter(x => x.id !== id);
    pintar_();
  } catch (err) {
    alert(String(err?.message || err));
  }
}

/**
 * Monta la cola de hojas de calidad dentro de un contenedor.
 * @param {HTMLElement} el
 */
export async function renderColaCc(el) {
  if (!el) return;
  host_ = el;
  host_.classList.add("ciWrap", "ccqWrap");

  if (!host_.dataset.ccqBound) {
    host_.addEventListener("click", (e) => {
      if (e.target.closest("#ccqImprimir")) { imprimir_(pendientes_.map(x => x.id)); return; }
      const uno = e.target.closest("[data-ccq-uno]");
      if (uno) { imprimir_([uno.dataset.ccqUno]); return; }
      const anular = e.target.closest("[data-ccq-anular]");
      if (anular) anular_(anular.dataset.ccqAnular);
    });
    host_.addEventListener("submit", (e) => {
      if (e.target.id !== "ccqBuscar") return;
      e.preventDefault();
      buscar_(host_.querySelector("#ccqVin")?.value);
    });
    host_.dataset.ccqBound = "1";
  }
  if (!escuchando_) {
    // Un inspector pidió una hoja (o se imprimió en otra PC).
    window.addEventListener("glp:live", (e) => {
      if (e.detail?.topic === "hojas-calidad" && host_?.isConnected && !imprimiendo_) cargar_();
    });
    escuchando_ = true;
  }

  encontradas_ = null;
  aviso_ = "";
  host_.innerHTML = `<div class="ciVacio"><p class="small muted">Cargando…</p></div>`;
  await cargar_();
}
