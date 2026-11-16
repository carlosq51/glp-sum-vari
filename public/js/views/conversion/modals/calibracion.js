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
// En los pasos del técnico el celular sirve de manómetro: refresco rápido.
const POLL_RAPIDO_MS = 600;
const PASOS_TECNICO = new Set(["Encender el carro", "Regular presión 1.25"]);
let pasoVivo_ = "";
const ABIERTAS = new Set(["PENDIENTE", "EN_CURSO"]);
// Los colores del banner de stag-auto (VERDE, ROJO, AMBAR, GRIS, AZUL en automatico.py).
const COLORES = { "#1a7f37": "ok", "#c62828": "danger", "#b26a00": "warn", "#666666": "muted", "#1f4e9e": "note" };

let vin_ = "";
let calId_ = null;
let timer_ = null;
let timerPrep_ = null;
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

const ESTADOS = {
  PENDIENTE: ["warn", "Esperando a la laptop"], EN_CURSO: ["note", "Calibrando"],
  TERMINADA: ["ok", "Terminada"], DETENIDA: ["muted", "Detenida"],
  CANCELADA: ["muted", "Cancelada"], ERROR: ["danger", "Error"],
};

const hace_ = (seg) => seg == null ? "" : seg < 60 ? `hace ${seg} s` : seg < 3600 ? `hace ${Math.round(seg / 60)} min` : `hace ${Math.round(seg / 3600)} h`;

function cabecera_({ modelo, agente, estado } = {}) {
  const corte = Math.max(0, vin_.length - 8);
  const [tono, txt] = ESTADOS[estado] || [];
  // Durante el avance la laptop va como chip; en el formulario tiene su bloque.
  const chipLaptop = estado && agente && !agente.enLinea
    ? `<span class="calChip is-danger">● Laptop sin señal</span>` : "";
  $("calCab").innerHTML = `
    <div class="calVin"><span>${escapeHtml(vin_.slice(0, corte))}</span>${escapeHtml(vin_.slice(corte))}</div>
    <div class="calCabFila">${modelo ? `<span class="calModelo">${escapeHtml(modelo)}</span>` : ""}${
      txt ? `<span class="calChip is-${tono}">${txt}</span>` : ""}${chipLaptop}</div>`;
}

/**
 * Estado de la laptop explicado: conectada, rechazada (correo de glp.json sin
 * permiso), callada desde hace rato, o nunca vista desde que arrancó el servidor.
 */
function laptop_(agente) {
  const el = $("calLaptop");
  if (!el) return;
  if (!agente) { el.hidden = true; return; }
  let tono, titulo, detalle;
  if (agente.enLinea) {
    tono = agente.ocupado ? "warn" : "ok";
    titulo = agente.ocupado ? "Laptop ocupada" : "Laptop lista";
    detalle = agente.ocupadoCon
      ? `Está con el ${escapeHtml(agente.ocupadoCon.vin.slice(-8))}. Espera a que termine.`
      : agente.ocupado ? "Tiene una calibración que se empezó en la misma laptop. Cuando termine, podrás iniciar desde aquí."
      : escapeHtml(agente.equipo || "Conectada");
  } else if (agente.rechazo) {
    tono = "danger";
    titulo = "La laptop llega, pero el servidor la rechaza";
    detalle = `${escapeHtml(agente.rechazo.error)}<br><small>Revisa el correo de <code>glp.json</code> en la laptop: tiene que ser una cuenta activa ADMIN, SUPERVISOR o CALIDAD. · ${hace_(agente.rechazo.haceS)}</small>`;
  } else if (agente.vistoHaceS != null) {
    tono = "danger";
    titulo = "La laptop dejó de responder";
    detalle = `Última señal ${hace_(agente.vistoHaceS)}${agente.equipo ? ` (${escapeHtml(agente.equipo)})` : ""}. Revisa que tenga internet y que stag-auto siga abierto.`;
  } else {
    tono = "danger";
    titulo = "La laptop no se ha comunicado";
    detalle = `No llegó ninguna señal${agente.servidorDesdeS != null ? ` desde que el servidor se reinició (${hace_(agente.servidorDesdeS)})` : ""}. ` +
      `Tener stag-auto abierto no basta: en la laptop tiene que existir <code>glp.json</code> y la ventana debe decir <b>GLP: conectado</b>. Si no lo dice, mira <code>errores.log</code>.`;
  }
  el.dataset.tono = tono;
  el.innerHTML = `<span class="calLaptopPunto"></span><div><div class="calLaptopTit">${titulo}</div><div class="calLaptopDet">${detalle}</div></div>`;
  el.hidden = false;
}

function verForm_(on) {
  $("calForm").hidden = !on;
  $("calAvance").hidden = on;
  if (!on) { $("calLaptop").hidden = true; clearTimeout(timerPrep_); }
}

/**
 * Pinta el formulario con lo que devolvió /preparar. `pref`: mapa a dejar
 * elegido (si no, se respeta lo que el inspector ya eligió, y si nada, el
 * sugerido). Mientras la laptop no esté libre se vuelve a preguntar cada 4 s,
 * así el botón se habilita solo cuando la laptop se conecta.
 */
function aplicarPreparar_(r, { pref = "" } = {}) {
  cabecera_({ modelo: r.modelo });
  laptop_(r.agente);
  const sel = $("calMapa");
  const elegido = pref || sel.value || r.mapaSugerido || "";
  const mapas = r.agente?.mapas || [];
  sel.innerHTML = `<option value="">${mapas.length ? "— elige el mapa —" : "— sin mapas (laptop desconectada) —"}</option>` +
    mapas.map(mp => `<option value="${escapeHtml(mp)}"${mp === elegido ? " selected" : ""}>${escapeHtml(mp)}</option>`).join("");
  sel.disabled = !mapas.length;
  mapaSugerido_ = r.mapaSugerido || "";
  marcarSugerido_();

  const libre = r.agente?.enLinea && !r.agente.ocupado;
  $("calIniciar").disabled = !libre;
  $("calIniciarSub").textContent = libre ? "arranca en la laptop de calibración"
    : !r.agente?.enLinea ? "esperando a que la laptop se conecte…" : "la laptop está ocupada";
  msg_("calMsg", libre && !r.mapaSugerido && !sel.value ? "Elige el mapa: no hay uno usado antes con este modelo." : "");

  clearTimeout(timerPrep_);
  if (!libre) timerPrep_ = setTimeout(reprepar_, 4000);
}

async function reprepar_() {
  const vin = vin_;
  if (!vin || calId_ || $("calForm").hidden) return;
  try {
    const r = await getJSON(`/api/calibracion/preparar?vin=${encodeURIComponent(vin)}&${q_()}`);
    if (vin_ !== vin || calId_ || !r?.ok) return;
    aplicarPreparar_(r);
  } catch {
    clearTimeout(timerPrep_);
    timerPrep_ = setTimeout(reprepar_, 4000);
  }
}

let mapaSugerido_ = "";
function marcarSugerido_() {
  const b = $("calSugerido");
  if (b) b.hidden = !mapaSugerido_ || $("calMapa").value !== mapaSugerido_;
}

function parar_() {
  clearTimeout(timer_);
  clearTimeout(timerPrep_);
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
  laptop_(null);
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

    $("calKm").value = "";
    $("calMapa").value = "";
    aplicarPreparar_(r, { pref: r.mapaSugerido });
    if (!$("calIniciar").disabled) setTimeout(() => $("calKm")?.focus(), 50);
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
  timer_ = setTimeout(refrescar_, PASOS_TECNICO.has(pasoVivo_) ? POLL_RAPIDO_MS : POLL_MS);
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

/**
 * Paso del técnico en grande: la presión con flecha mientras regula el
 * reductor, o el aviso de encender. Se lee a un metro, con el celular en la mano.
 */
function grande_(v) {
  const el = $("calGrande");
  if (!el) return;
  const paso = v?.paso || "";
  if (paso === "Regular presión 1.25") {
    const p = v.valores?.Gas;
    const ok = p != null && Math.abs(p - 1.25) <= 0.011;
    const dir = p == null ? "" : ok ? "✔ MANTÉN" : p < 1.25 ? "▲ SUBIR" : "▼ BAJAR";
    el.dataset.tono = p == null ? "muted" : ok ? "ok" : "danger";
    el.innerHTML = `<div class="calGrandeLbl">Presión del reductor</div>
      <div class="calGrandeNum">${p == null ? "--" : Number(p).toFixed(2)}<small>bar</small></div>
      <div class="calGrandeDir">${dir}${ok ? "" : " a 1.25"}</div>`;
    el.hidden = false;
  } else if (paso === "Encender el carro") {
    el.dataset.tono = "danger";
    el.innerHTML = `<div class="calGrandeNum calGrandeTxt">🔑 Enciende el carro</div><div class="calGrandeDir">debe arrancar en GAS</div>`;
    el.hidden = false;
  } else {
    el.hidden = true;
    el.innerHTML = "";
  }
}

function pintarAvance_(c) {
  verForm_(false);
  cabecera_({ modelo: c.modelo, agente: c.agente, estado: c.estado });
  const v = c.vivo || {};
  const abierta = ABIERTAS.has(c.estado);
  pasoVivo_ = abierta ? (v.paso || "") : "";
  grande_(abierta ? v : null);

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

  // Barra de avance: pasos hechos / total.
  const lista = v.pasos?.length ? v.pasos : (c.resumen?.splits || []);
  const hechos = c.estado === "TERMINADA" ? lista.length : lista.filter(x => x.estado === "ok" || x.estado === "manual").length;
  const pct = lista.length ? Math.round(100 * hechos / lista.length) : 0;
  $("calProg").innerHTML = lista.length
    ? `<div class="calProgBar"><i style="width:${pct}%"></i></div><span>${hechos}/${lista.length} pasos</span>` : "";

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
  $("calMapa")?.addEventListener("change", marcarSugerido_);

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
    $("calKm").value = r.ultima?.kilometraje ?? "";
    aplicarPreparar_(r, { pref: r.ultima?.mapa || r.mapaSugerido });
  } catch (err) {
    msg_("calMsg", String(err?.message || err), true);
  }
}
