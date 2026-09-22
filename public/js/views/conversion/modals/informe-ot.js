// =========================
// public/js/views/conversion/modals/informe-ot.js
// Lógica del modal con el que el técnico manda el informe de su OT.
//
// Al enviarlo, el informe queda en la cola de la oficina (ADMIN/SUPERVISOR),
// que lo abre, lo revisa y lo imprime. El técnico no imprime nada: camina a
// la oficina y el papel ya está.
// =========================

import { CORE } from "../../../core/state.js";
import { getJSON, postJSON } from "../../../core/api.js";
import { escapeHtml } from "../../../core/format.js";
import { CHEQUEO_PUNTOS } from "../../../templates/views/hoja-chequeo-view.js";
import { DETALLE_TAREAS } from "../../../templates/views/informe-taller-view.js";

const $ = (id) => document.getElementById(id);

// La OT que se está informando. Se guarda al abrir para que el envío no
// dependa de qué tarjeta esté abierta cuando le den al botón.
let otActual_ = null;
let enviando_ = false;

function msg_(texto, esError = false) {
  const el = $("iotMsg");
  if (!el) return;
  el.textContent = texto || "";
  el.classList.toggle("is-error", !!esError);
  el.style.display = texto ? "block" : "none";
}

export function cerrarInformeOt_() {
  const m = $("iotModal");
  if (m) { m.classList.remove("show"); m.setAttribute("aria-hidden", "true"); }
  otActual_ = null;
}

/**
 * Abre el modal para una tarjeta de trabajo.
 * @param {object} it item normalizado de la tarjeta (conversionId, vin, …)
 */
export function abrirInformeOt_(it) {
  const m = $("iotModal");
  if (!m || !it) return;

  otActual_ = {
    ot: String(it.conversionId || "").trim(),
    vin: String(it.vin || "").trim(),
    rol: String(it.rolTrabajo || "").trim().toUpperCase(),
  };

  msg_("");
  pintarCabecera_({ cargando: true });
  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");
  $("iotPlaca")?.focus();

  // Quiénes trabajaron el carro y desde cuándo lo salen del sistema, no del
  // técnico: él ya tiene bastante con medir la batería.
  cargarContexto_();
}

/** Los dos técnicos de la OT con sus horas, traídos del sistema. */
let contexto_ = null;

async function cargarContexto_() {
  try {
    const r = await getJSON(`/api/informes/contexto?work_order_id=${encodeURIComponent(otActual_.ot)}`);
    if (!r?.ok) throw new Error(r?.error || "");
    contexto_ = r;
  } catch {
    // Si falla, el informe se puede mandar igual: la oficina completará los
    // nombres al revisar. Peor sería bloquear al técnico por esto.
    contexto_ = null;
  }
  pintarCabecera_({ cargando: false });
}

function pintarCabecera_({ cargando }) {
  const cab = $("iotCabecera");
  if (!cab) return;

  const hora = (iso) => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "—";
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const rotulo = (rol) => (rol === "MOTOR" ? "Delantero" : rol === "TANQUE" ? "Tanquero" : rol);

  const personas = (contexto_?.personas || []).map(p => `
      <div class="iotPersona${p.rol === otActual_.rol ? " is-yo" : ""}">
        <span>${escapeHtml(rotulo(p.rol))}${p.rol === otActual_.rol ? " · tú" : ""}</span>
        <b>${escapeHtml(p.nombre || "—")}</b>
        <small>desde ${escapeHtml(hora(p.inicio))}${p.fin ? ` · fin ${escapeHtml(hora(p.fin))}` : ""}</small>
      </div>`).join("");

  cab.innerHTML = `
    <div class="iotCabTop">
      <div><span>OT</span><b>${escapeHtml(otActual_.ot)}</b></div>
      <div><span>VIN</span><b>${escapeHtml(otActual_.vin)}</b></div>
    </div>
    <div class="iotPersonas">${
      cargando ? '<div class="small muted">Buscando quién trabajó este carro…</div>'
      : personas || '<div class="small muted">No pude traer los técnicos. La oficina los completará.</div>'
    }</div>`;
}

/**
 * La MITAD de este técnico. El informe es colaborativo: el servidor la
 * fusiona con la del compañero en vez de reemplazar el informe entero.
 */
function miParte_() {
  const val = (id) => ($(id)?.value || "").trim();
  const marcados = (attr, n) => Array.from({ length: n }, (_, i) => i)
    .filter(i => document.querySelector(`[data-iot-${attr}="${i}"]`)?.checked);

  const yo = (contexto_?.personas || []).find(p => p.rol === otActual_?.rol);

  return {
    nombre: yo?.nombre || CORE.state.currentProfile?.nombre || "",
    // El inicio es cuando le asignaron el carro y el fin cuando cerró: los
    // dos salen del sistema. Si sigue abierto, el fin lo pone la impresión.
    inicio: yo?.inicio || null,
    fin: yo?.fin || null,
    comun: { placa: val("iotPlaca").toUpperCase() },
    tareas: marcados("tarea", DETALLE_TAREAS.length),
    marcados: marcados("punto", CHEQUEO_PUNTOS.length),
    observaciones: $("iotObs")?.value || "",
    bateria: { v: val("iotBatV"), ai: val("iotBatAi"), af: val("iotBatAf") },
    cilindros: [val("iotCil1"), val("iotCil2"), val("iotCil3"), val("iotCil4")],
    // Las etapas del registro de producción salen del rol: el delantero
    // hace motor y el tanquero el tanque. Preguntárselo sería pedirle que
    // repita lo que el sistema ya sabe.
    etapas: otActual_?.rol === "TANQUE"
      ? { tanque: true }
      : { compresion: true, scanner: true, mecanica: true, electronica: true },
  };
}

async function enviar_() {
  if (enviando_) return;                       // doble tap en el celular
  const parte = miParte_();

  if (!parte.comun.placa) {
    msg_("Falta la placa. Es el único dato del carro que el sistema no tiene.", true);
    $("iotPlaca")?.focus();
    return;
  }
  if (!otActual_?.ot) {
    msg_("No pude identificar la OT. Cierra y vuelve a abrir la tarjeta.", true);
    return;
  }

  enviando_ = true;
  const btn = $("iotEnviar");
  if (btn) { btn.disabled = true; btn.textContent = "Enviando…"; }
  msg_("");

  try {
    const r = await postJSON("/api/informes", {
      email: CORE.state.currentProfile?.email || CORE.state.email || "",
      nombre: CORE.state.currentProfile?.nombre || "",
      work_order_id: otActual_.ot,
      placa: parte.comun.placa,
      rol: otActual_.rol,
      parte,
    });
    if (!r?.ok) throw new Error(r?.error || "No se pudo enviar.");

    // Se dice si falta la otra mitad: el informe no se imprime completo
    // hasta que los dos mandan, y el técnico tiene que saberlo para
    // avisar a su compañero en vez de irse a la oficina a esperar.
    const faltan = r.faltan || [];
    const quien = faltan.includes("MOTOR") ? "el delantero"
                : faltan.includes("TANQUE") ? "el tanquero" : "";
    msg_(quien
      ? `Enviado. AVISA A ${quien.toUpperCase()}: hasta que no mande su parte, en la oficina no pueden imprimir.`
      : "Informe completo. Ya puedes ir a la oficina por los papeles.");
    setTimeout(cerrarInformeOt_, 2200);
  } catch (err) {
    msg_(String(err?.message || err), true);
  } finally {
    enviando_ = false;
    if (btn) { btn.disabled = false; btn.textContent = "Enviar a impresión"; }
  }
}

/** Bind de listeners. Se llama una sola vez al arranque. */
export function initInformeOt_() {
  $("iotClose")?.addEventListener("click", cerrarInformeOt_);
  $("iotEnviar")?.addEventListener("click", enviar_);

  // Clic fuera de la caja cierra, como el resto de modales de la app.
  $("iotModal")?.addEventListener("click", (e) => {
    if (e.target?.id === "iotModal") cerrarInformeOt_();
  });
}
