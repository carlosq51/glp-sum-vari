// =========================
// public/js/views/conversion/modals/calibracion.js
// Calibración STAG desde la tarjeta de Calidad.
//
// El VIN sale de la tarjeta; el inspector pone el km y confirma el mapa
// (viene sugerido: el último que se usó con ese modelo). La laptop de
// calibración (stag-auto) lo toma en ~2 s y arranca. Mientras el modal está
// abierto se pide el avance cada 1.5 s: paso en curso, presión, G1–G4, y si
// la laptop pregunta algo (falta de gas, un paso que falló) se responde
// desde aquí con los mismos botones que en la laptop.
//
// Servidor: routes/calibracion.js.
// =========================

import { CORE } from "../../../core/state.js";
import { getJSON, postJSON } from "../../../core/api.js";
import { escapeHtml } from "../../../core/format.js";

const $ = (id) => document.getElementById(id);
const email_ = () => CORE.state.currentProfile?.email || CORE.state.email || "";
const q_ = () => `email=${encodeURIComponent(email_())}`;

const POLL_MS = 1500;
const ABIERTAS = new Set(["PENDIENTE", "EN_CURSO"]);
// Los colores del banner de stag-auto (VERDE, ROJO, AMBAR, GRIS, AZUL en automatico.py).
const COLORES = { "#1a7f37": "ok", "#c62828": "danger", "#b26a00": "warn", "#666666": "muted", "#1f4e9e": "note" };

let vin_ = "";
let calId_ = null;
let timer_ = null;
let enviando_ = false;
let ultimaPregunta_ = null;

const fmtT_ = (seg) => {
  const s = Math.max(0, Math.round(Number(seg) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function msg_(id, texto, esError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = texto || "";
  el.classList.toggle("is-error", !!esError);
}

function cabecera_({ modelo, agente, estado } = {}) {
  const chipLaptop = agente == null ? ""
    : agente.enLinea
      ? `<span class="calChip is-ok">● Laptop conectada${agente.equipo ? ` · ${escapeHtml(agente.equipo)}` : ""}</span>`
      : `<span class="calChip is-danger">● Laptop sin conexión</span>`;
  const chipEstado = estado ? `<span class="calChip is-${{
    PENDIENTE: "warn", EN_CURSO: "note", TERMINADA: "ok", DETENIDA: "muted", CANCELADA: "muted", ERROR: "danger",
  }[estado] || "muted"}">${escapeHtml({
    PENDIENTE: "Esperando a la laptop", EN_CURSO: "Calibrando", TERMINADA: "Terminada",
    DETENIDA: "Detenida", CANCELADA: "Cancelada", ERROR: "Error",
  }[estado] || estado)}</span>` : "";
  $("calCab").innerHTML = `
    <div class="calVin">${escapeHtml(vin_)}</div>
    <div class="calCabFila">${modelo ? `<span class="small muted">${escapeHtml(modelo)}</span>` : ""}${chipLaptop}${chipEstado}</div>`;
}

function verForm_(on) {
  $("calForm").hidden = !on;
  $("calAvance").hidden = on;
}

function parar_() {
  clearTimeout(timer_);
  timer_ = null;
}

export function cerrarCalibracion_() {
  parar_();
  calId_ = null;
  vin_ = "";
  const m = $("calModal");
  m?.classList.remove("show");
  m?.setAttribute("aria-hidden", "true");
}

/** Abre el modal para el carro de la tarjeta. */
export async function abrirCalibracion_(vinRaw) {
  const m = $("calModal");
  const vin = String(vinRaw || "").trim().toUpperCase();
  if (!m || !vin) return;
  parar_();
  vin_ = vin;
  calId_ = null;
  ultimaPregunta_ = null;
  cabecera_();
  verForm_(true);
  msg_("calMsg", "Cargando…");
  $("calIniciar").disabled = true;
  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");

  try {
    const r = await getJSON(`/api/calibracion/preparar?vin=${encodeURIComponent(vin)}&${q_()}`);
    if (vin_ !== vin) return;
    if (!r?.ok) throw new Error(r?.error || "No se pudo preparar la calibración.");

    // Una del mismo carro abierta o recién terminada: se muestra su avance.
    const u = r.ultima;
    const reciente = u && (ABIERTAS.has(u.estado) || Date.now() - Date.parse(u.terminada_at || u.created_at) < 30 * 60_000);
    if (reciente) {
      calId_ = u.id;
      pintarAvance_(u);
      if (ABIERTAS.has(u.estado)) programar_();
      return;
    }

    cabecera_({ modelo: r.modelo, agente: r.agente });
    const sel = $("calMapa");
    const mapas = r.agente?.mapas || [];
    sel.innerHTML = `<option value="">— elige el mapa —</option>` +
      mapas.map(mp => `<option value="${escapeHtml(mp)}"${mp === r.mapaSugerido ? " selected" : ""}>${escapeHtml(mp)}</option>`).join("");
    $("calKm").value = "";

    if (!r.agente?.enLinea) {
      msg_("calMsg", "La laptop de calibración no está conectada: prende la laptop y abre Calibrar.bat.", true);
    } else if (r.agente.ocupado) {
      msg_("calMsg", r.agente.ocupadoCon
        ? `La laptop está ocupada con ${r.agente.ocupadoCon.vin.slice(-8)}. Espera a que termine.`
        : "La laptop está ocupada con una calibración que se empezó allí.", true);
    } else {
      msg_("calMsg", r.mapaSugerido ? "" : "Elige el mapa: no hay uno usado antes con este modelo.");
      $("calIniciar").disabled = false;
      setTimeout(() => $("calKm")?.focus(), 50);
    }
  } catch (err) {
    msg_("calMsg", String(err?.message || err), true);
  }
}

async function iniciar_() {
  if (enviando_) return;
  const km = String($("calKm").value || "").replace(/[.,\s]/g, "");
  const mapa = $("calMapa").value;
  if (!/^\d{1,7}$/.test(km)) return msg_("calMsg", "Escribe el kilometraje (solo números).", true);
  if (!mapa) return msg_("calMsg", "Elige el mapa.", true);

  enviando_ = true;
  $("calIniciar").disabled = true;
  msg_("calMsg", "Enviando a la laptop…");
  try {
    const r = await postJSON("/api/calibracion", { email: email_(), vin: vin_, kilometraje: km, mapa });
    if (!r?.ok) throw new Error(r?.error || "No se pudo iniciar.");
    calId_ = r.calibracion.id;
    pintarAvance_(r.calibracion);
    programar_();
  } catch (err) {
    msg_("calMsg", String(err?.message || err), true);
    $("calIniciar").disabled = false;
  } finally {
    enviando_ = false;
  }
}

function programar_() {
  parar_();
  timer_ = setTimeout(refrescar_, POLL_MS);
}

async function refrescar_() {
  if (!calId_) return;
  const id = calId_;
  try {
    const r = await getJSON(`/api/calibracion/${encodeURIComponent(id)}?${q_()}`);
    if (calId_ !== id) return;
    if (r?.ok) {
      pintarAvance_(r.calibracion);
      if (!ABIERTAS.has(r.calibracion.estado)) return;   // terminó: no se pide más
    }
  } catch { /* red que se cae: se reintenta */ }
  if (calId_ === id) programar_();
}

function valor_(nombre, v, ok, fmt = (x) => x.toFixed(2)) {
  const txt = v == null ? "--" : fmt(Number(v));
  return `<div class="calValor ${v == null ? "" : ok ? "is-ok" : "is-danger"}"><span>${nombre}</span><b>${txt}</b></div>`;
}

function pintarAvance_(c) {
  verForm_(false);
  cabecera_({ modelo: c.modelo, agente: c.agente, estado: c.estado });
  const v = c.vivo || {};
  const abierta = ABIERTAS.has(c.estado);

  // Banner: lo mismo que dice la ventanita de la laptop
  const ban = $("calBanner");
  let texto = v.banner || "";
  if (c.estado === "PENDIENTE") texto = "Esperando a que la laptop la tome…";
  if (!abierta) {
    const r = c.resumen || {};
    texto = {
      TERMINADA: `✔ Calibración terminada${r.total_s ? ` en ${fmtT_(r.total_s)}` : ""}` +
        `${r.fotos != null ? ` · ${r.fotos}/5 fotos` : ""}${r.presion_final ? ` · ${r.presion_final} bar` : ""}`,
      DETENIDA: "■ Se detuvo la calibración.",
      CANCELADA: `Cancelada${r.motivo ? `: ${r.motivo}` : ""}.`,
      ERROR: `✘ ${r.error || "La laptop no pudo calibrar."}`,
    }[c.estado] || texto;
  }
  ban.textContent = texto;
  ban.dataset.tono = !abierta ? ({ TERMINADA: "ok", ERROR: "danger" }[c.estado] || "muted")
    : (v.pausado ? "warn" : COLORES[String(v.color || "").toLowerCase()] || "note");
  if (v.total && abierta) ban.insertAdjacentHTML("afterbegin", `<span class="calReloj">⏱ ${fmtT_(v.total)}</span>`);

  // Pregunta de la laptop → botones aquí
  const pq = $("calPregunta");
  const p = abierta ? v.pregunta : null;
  if (p) {
    if (ultimaPregunta_ !== p.n) {
      ultimaPregunta_ = p.n;
      try { navigator.vibrate?.([500, 200, 500]); } catch {}
      pq.innerHTML = `<div class="calPregTexto">${escapeHtml(p.texto).replace(/\n/g, "<br>")}</div>
        <div class="calPregOps">${p.opciones.map(o =>
          `<button type="button" class="btn" data-cal-op="${escapeHtml(o)}" data-cal-n="${p.n}">${escapeHtml(o)}</button>`).join("")}</div>`;
    }
    pq.hidden = false;
  } else {
    pq.hidden = true;
    pq.innerHTML = "";
    ultimaPregunta_ = null;
  }

  // Valores del Monitor
  const val = v.valores || {};
  const enR = (x, lo, hi) => x != null && x >= lo - 0.001 && x <= hi + 0.001;
  $("calValores").innerHTML = abierta && Object.keys(val).length ? [
    valor_("Presión", val.Gas, enR(val.Gas, 1.25, 1.26)),
    ...["G1", "G2", "G3", "G4"].map(k => valor_(k, val[k], enR(val[k], 3.5, 4.0))),
    valor_("STFT", val.STFT, val.STFT != null && val.STFT <= 0.871, (x) => `±${x.toFixed(2)}`),
    valor_("RPM", val.RPM, val.RPM != null && val.RPM >= 400, (x) => x.toFixed(0)),
  ].join("") + (val.estado ? `<div class="calEstadoStag small muted">AC STAG: <b>${escapeHtml(val.estado)}</b></div>` : "") : "";

  const avisos = (abierta ? v.avisos : c.resumen?.avisos) || [];
  $("calAvisos").innerHTML = avisos.length ? avisos.slice(-3).map(a => `<div>⚠ ${escapeHtml(a)}</div>`).join("") : "";

  // Pasos (tipo speed run, como la laptop)
  const pasos = v.pasos?.length ? v.pasos : (c.resumen?.splits || []).map(s => ({ nombre: s.paso, estado: s.estado, seg: s.seg }));
  const ico = { pend: "·", run: "▶", ok: "✔", manual: "✋" };
  $("calPasos").innerHTML = pasos.map(s => {
    const dif = s.seg != null && s.record != null && s.estado !== "run" ? s.seg - s.record : null;
    return `<li class="calPaso is-${escapeHtml(s.estado || "pend")}">
      <span class="calPasoIco">${ico[s.estado] || "·"}</span>
      <span class="calPasoNom">${escapeHtml(s.nombre)}</span>
      <span class="calPasoT">${s.seg != null ? fmtT_(s.seg) : ""}</span>
      <span class="calPasoD ${dif == null ? "" : dif > 0.5 ? "is-danger" : "is-ok"}">${dif == null ? "" : `${dif >= 0 ? "+" : "-"}${fmtT_(Math.abs(dif))}`}</span>
    </li>`;
  }).join("");

  $("calLog").innerHTML = abierta && v.logs?.length ? v.logs.slice(-3).map(escapeHtml).join("<br>") : "";

  // Acciones
  const ac = $("calAcciones");
  if (c.estado === "PENDIENTE") {
    ac.innerHTML = `<button type="button" class="btn" data-cal-acc="cancelar">Cancelar</button>`;
  } else if (c.estado === "EN_CURSO") {
    ac.innerHTML = `<button type="button" class="btn" data-cal-acc="pausa">${v.pausado ? "▶ Continuar" : "⏸ Pausa"}</button>
      <button type="button" class="btn calBtnPeligro" data-cal-acc="detener">■ Detener</button>`;
  } else {
    ac.innerHTML = `<button type="button" class="btn" data-cal-acc="nueva">Calibrar de nuevo</button>`;
  }
}

async function comando_(cuerpo) {
  if (!calId_ || enviando_) return;
  enviando_ = true;
  msg_("calMsg2", "");
  try {
    const r = await postJSON(`/api/calibracion/${encodeURIComponent(calId_)}/comando`, { email: email_(), ...cuerpo });
    if (!r?.ok) throw new Error(r?.error || "No se pudo enviar.");
    if (r.calibracion) pintarAvance_(r.calibracion);
    msg_("calMsg2", cuerpo.accion === "responder" ? "Enviado a la laptop." : "");
    clearTimeout(timer_);
    refrescar_();
  } catch (err) {
    msg_("calMsg2", String(err?.message || err), true);
  } finally {
    enviando_ = false;
  }
}

/** Bind de listeners. Se llama una sola vez al arranque. */
export function initCalibracion_() {
  $("calClose")?.addEventListener("click", cerrarCalibracion_);
  $("calModal")?.addEventListener("click", (e) => {
    if (e.target?.id === "calModal") cerrarCalibracion_();
  });
  $("calIniciar")?.addEventListener("click", iniciar_);
  $("calKm")?.addEventListener("keydown", (e) => { if (e.key === "Enter") iniciar_(); });

  $("calPregunta")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cal-op]");
    if (!b) return;
    $("calPregunta").querySelectorAll("button").forEach(x => { x.disabled = true; });
    comando_({ accion: "responder", opcion: b.dataset.calOp, pregunta: Number(b.dataset.calN) });
  });

  $("calAcciones")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cal-acc]");
    if (!b) return;
    const acc = b.dataset.calAcc;
    if (acc === "nueva") { abrirNueva_(); return; }
    if (acc === "detener" && !confirm("¿Detener la calibración en la laptop?")) return;
    if (acc === "cancelar" && !confirm("¿Cancelar el pedido?")) return;
    comando_({ accion: acc });
  });

  // Cambio de estado avisado por el servidor: refresca al instante.
  window.addEventListener("glp:live", (e) => {
    if (e.detail?.topic === "calibracion" && calId_ && e.detail.id === calId_) {
      clearTimeout(timer_);
      refrescar_();
    }
  });
}

/** "Calibrar de nuevo": vuelve al formulario saltándose la última. */
async function abrirNueva_() {
  const vin = vin_;
  parar_();
  calId_ = null;
  verForm_(true);
  msg_("calMsg", "Cargando…");
  $("calIniciar").disabled = true;
  try {
    const r = await getJSON(`/api/calibracion/preparar?${q_()}&vin=${encodeURIComponent(vin)}`);
    if (!r?.ok) throw new Error(r?.error || "No se pudo preparar.");
    cabecera_({ modelo: r.modelo, agente: r.agente });
    const ultimaMapa = r.ultima?.mapa;
    const pref = ultimaMapa || r.mapaSugerido;
    $("calMapa").innerHTML = `<option value="">— elige el mapa —</option>` +
      (r.agente?.mapas || []).map(mp => `<option value="${escapeHtml(mp)}"${mp === pref ? " selected" : ""}>${escapeHtml(mp)}</option>`).join("");
    $("calKm").value = r.ultima?.kilometraje ?? "";
    const libre = r.agente?.enLinea && !r.agente.ocupado;
    msg_("calMsg", !r.agente?.enLinea ? "La laptop de calibración no está conectada." : r.agente.ocupado ? "La laptop está ocupada." : "", !libre);
    $("calIniciar").disabled = !libre;
  } catch (err) {
    msg_("calMsg", String(err?.message || err), true);
  }
}
