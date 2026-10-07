// =========================
// public/js/work/informe-estado.js
// La línea "Informe: …" de la tarjeta del técnico.
//
// El papel sale solo por la impresora de la oficina (impresora/agente.mjs),
// así que el técnico no ve cuándo está. Esta línea se lo dice: esperando al
// compañero, en la impresora, o impreso a tal hora — y entonces va a la
// oficina a pedir su hoja.
//
// Las tarjetas se repintan enteras en cada sync, así que el estado vive en
// un cache y la línea se rellena desde él. Al servidor solo se pregunta:
//   · por una OT que todavía no está en el cache,
//   · cuando el servidor avisa que un informe cambió (SSE "informes"),
//   · justo después de mandar uno desde el modal.
// =========================

import { getJSON } from "../core/api.js";
import { escapeHtml } from "../core/format.js";

const cache_ = new Map();          // ot → { estado, faltan, impreso_at } | null (sin informe)
let pidiendo_ = false;
let otraVez_ = false;

const fmtHora_ = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const quien_ = (faltan = []) =>
  faltan.includes("MOTOR") && faltan.includes("TANQUE") ? "los dos"
  : faltan.includes("MOTOR") ? "el delantero"
  : faltan.includes("TANQUE") ? "el tanquero" : "";

/**
 * El texto y el tono de la línea. Null = no hay informe, no se pinta nada.
 * `rol` es el de quien mira: la misma OT se lee distinto si la mitad que
 * falta es la suya o la del compañero.
 */
function contenido_(e, rol = "") {
  if (!e) return null;
  if (e.estado === "BORRADOR") {
    return (e.faltan || []).includes(rol)
      ? { tono: "falta", texto: "📝 Tu compañero ya mandó el informe · falta tu parte" }
      : { tono: "espera", texto: `🕓 Informe enviado · esperando a ${quien_(e.faltan) || "tu compañero"}` };
  }
  if (e.estado === "ENVIADO") {
    return { tono: "cola", texto: "🖨️ Informe en la impresora…" };
  }
  if (e.estado === "IMPRESO") {
    const t = Date.parse(e.impreso_at);
    const hora = Number.isFinite(t) ? ` ${fmtHora_.format(t)}` : "";
    const medias = e.faltan?.length ? ` · la parte de ${quien_(e.faltan)} va en blanco` : "";
    return { tono: "ok", texto: `✅ Informe impreso${hora} · pídelo en la oficina${medias}` };
  }
  return null;
}

function pintarUno_(el) {
  const c = contenido_(cache_.get(el.dataset.ot), el.dataset.rol);
  el.hidden = !c;
  if (!c) return;
  const html = escapeHtml(c.texto);
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  el.dataset.tono = c.tono;
}

/** Lo que va en la tarjeta. Se rellena (o se esconde) desde el cache. */
export function informeEstadoHTML_(ot, rol = "") {
  const id = String(ot || "").trim();
  if (!id) return "";
  const r = String(rol || "").toUpperCase();
  const c = contenido_(cache_.get(id), r);
  return `<div class="jobInforme js-informe" data-ot="${escapeHtml(id)}" data-rol="${escapeHtml(r)}"${c ? ` data-tono="${c.tono}"` : " hidden"}>${c ? escapeHtml(c.texto) : ""}</div>`;
}

const otsEnPantalla_ = () =>
  [...new Set([...document.querySelectorAll(".js-informe[data-ot]")].map(el => el.dataset.ot))];

/**
 * Tras repintar las tarjetas: rellena desde el cache y pregunta solo por
 * las OT nuevas. Barato de llamar en cada render.
 */
export function pintarInformes_() {
  document.querySelectorAll(".js-informe[data-ot]").forEach(pintarUno_);
  if (otsEnPantalla_().some(ot => !cache_.has(ot))) refrescarInformes_();
}

/** Vuelve a preguntar por todas las OT que hay en pantalla. */
export async function refrescarInformes_() {
  if (pidiendo_) { otraVez_ = true; return; }
  const ots = otsEnPantalla_();
  if (!ots.length) return;
  pidiendo_ = true;
  try {
    const r = await getJSON(`/api/informes/estado?ots=${encodeURIComponent(ots.join(","))}`);
    if (r?.ok) {
      for (const ot of ots) cache_.set(ot, r.estados?.[ot] || null);
      document.querySelectorAll(".js-informe[data-ot]").forEach(pintarUno_);
    }
  } catch {
    // Sin red: la línea se queda como estaba y se reintenta en el próximo aviso.
  } finally {
    pidiendo_ = false;
    if (otraVez_) { otraVez_ = false; refrescarInformes_(); }
  }
}

/** El modal acaba de mandar: se pinta ya, sin esperar al servidor. */
export function marcarInformeEnviado_(ot, informe, faltan = []) {
  if (!ot || !informe) return;
  cache_.set(String(ot), { estado: informe.estado, faltan, impreso_at: informe.impreso_at });
  document.querySelectorAll(".js-informe[data-ot]").forEach(pintarUno_);
}

// El servidor avisa cuando un informe cambia: la laptop lo imprimió, o el
// compañero mandó su parte. Ese es el momento de mirar.
window.addEventListener("glp:live", (e) => {
  if (e.detail?.topic === "informes") refrescarInformes_();
});

// Respaldo por si el aviso se pierde (el celular bloqueado corta el SSE):
// mientras algo esté en la impresora o esperando, se mira cada minuto.
setInterval(() => {
  if (document.hidden) return;
  const vivos = otsEnPantalla_().some(ot => ["ENVIADO", "BORRADOR"].includes(cache_.get(ot)?.estado));
  if (vivos) refrescarInformes_();
}, 60_000);

// Al volver a la app (desbloquear el celular) se mira enseguida.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && otsEnPantalla_().length) refrescarInformes_();
});
