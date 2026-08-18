// =========================
// public/js/views/conversion/tec-asistencia.js
// Card "Mi asistencia" del técnico.
//
// Mismo contrato que public/marcar.html (la página que abre la cámara nativa
// al escanear el QR de la TV), pero dentro de la PWA: el técnico que ya tiene
// la app abierta no necesita salir a otra pestaña.
//
// La regla que no se negocia: marcar SIEMPRE exige escanear el QR de la TV.
// El token va firmado y vive ~30 s, así que el escaneo es lo que prueba que
// estuvo parado en el taller. Un botón que marque sin cámara convertiría esto
// en "marco desde el paradero".
// =========================
import { CORE } from "../../core/core.js";
import { getJSON, postJSON } from "../../core/api.js";
import { escapeHtml } from "../../core/format.js";
import { createScanner } from "../../core/qr-scanner.js";
import { renderAvance_, limpiarAvance_ } from "./tec-avance.js";
import { apoyoHTML_ } from "./tec-apoyo.js";

const READER_ID = "tecAsisReader";

let scanner_    = null;
let escaneando_ = false;
let miUserId_   = "";

function $(id) { return document.getElementById(id); }

function emailActual_() {
  const p = CORE.state.currentProfile;
  return String($("email")?.value || p?.email || "").trim().toLowerCase();
}

function horaPeru_(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-PE", {
    timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function msg_(tipo, html) {
  const el = $("tecAsisMsg");
  if (!el) return;
  el.className = "tecAsisMsg " + (tipo ? "on " + tipo : "");
  el.innerHTML = html || "";
}

// ─── Token ───
// El QR de la TV codifica `<base>/marcar?t=<slot>.<firma>`. Aceptamos también
// un token pelado por si algún día el QR se acorta y deja de llevar la URL.
function tokenDesdeEscaneo_(texto) {
  const s = String(texto || "").trim();
  try {
    const t = new URL(s).searchParams.get("t");
    if (t) return t;
  } catch { /* no era URL absoluta */ }
  const m = s.match(/[?&]t=([^&\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  return /^\d+\.[A-Za-z0-9_-]+$/.test(s) ? s : "";
}

// ─── Estado de la jornada ───

export async function loadTecAsistencia_() {
  const box = $("tecAsisEstado");
  if (!box) return;

  await detenerScanner_();
  msg_("", "");

  const email = emailActual_();
  if (!email) {
    box.innerHTML = `<div class="small muted">No se pudo identificar tu usuario.</div>`;
    return;
  }

  box.innerHTML = `<div class="small muted">Cargando tu jornada…</div>`;

  let d;
  try {
    d = await getJSON(`/api/despacho/mi-estado?email=${encodeURIComponent(email)}`);
  } catch {
    box.innerHTML = `<div class="small muted">Sin conexión. Intenta de nuevo.</div>`;
    return;
  }
  if (!d?.ok) {
    box.innerHTML = `<div class="small muted">${escapeHtml(d?.error || "No se pudo leer tu asistencia")}</div>`;
    return;
  }

  miUserId_ = d.userId || "";
  const dentro = d.estado && d.estado !== "FUERA";
  const tipo   = dentro ? "SALIDA" : "INGRESO";

  box.innerHTML = `
    <div class="tecAsisEstado ${dentro ? "dentro" : "fuera"}">
      <div class="tecAsisPunto" aria-hidden="true"></div>
      <div class="tecAsisTexto">
        <div class="tecAsisTitulo">${dentro ? "Estás en el taller" : "Fuera del taller"}</div>
        <div class="tecAsisSub">${
          dentro
            ? `Ingresaste a las <b>${escapeHtml(horaPeru_(d.ingreso))}</b>`
            : "Aún no marcas ingreso hoy"
        }</div>
      </div>
    </div>
    <button id="tecAsisBtn" class="tecAsisBtn ${dentro ? "salida" : ""}" type="button">
      📷 ${dentro ? "Marcar salida" : "Marcar ingreso"}
    </button>
    <div class="tecAsisHint small muted">
      Apunta la cámara al QR de la pantalla del taller.
    </div>
  `;

  $("tecAsisBtn").addEventListener("click", () => abrirCamara_(tipo));

  // La dupla solo tiene sentido si ya está adentro.
  if (dentro) cargarDupla_(); else limpiarDupla_();
}

// ─── Escaneo ───

async function abrirCamara_(tipo) {
  if (escaneando_) { await detenerScanner_(); msg_("", ""); return; }

  const reader = $(READER_ID);
  const btn    = $("tecAsisBtn");
  if (!reader) return;

  reader.classList.add("on");
  msg_("info", "Buscando el QR de la pantalla…");
  if (btn) btn.textContent = "✕ Cancelar";

  scanner_ = scanner_ || createScanner(READER_ID);
  escaneando_ = true;

  try {
    await scanner_.start({
      mode: "QR",
      msgEl: $("tecAsisMsg"),
      // El token es sensible a mayúsculas: no dejar que el scanner lo normalice.
      normalize: false,
      onDecoded: (texto) => registrar_(texto, tipo),
    });
  } catch {
    escaneando_ = false;
    reader.classList.remove("on");
    if (btn) btn.textContent = `📷 ${tipo === "SALIDA" ? "Marcar salida" : "Marcar ingreso"}`;
  }
}

async function detenerScanner_() {
  if (!scanner_) return;
  try { await scanner_.stop(); } catch { /* ya estaba detenido */ }
  escaneando_ = false;
  $(READER_ID)?.classList.remove("on");
}

async function registrar_(texto, tipo) {
  if (!escaneando_) return;          // evita doble disparo del decoder
  const token = tokenDesdeEscaneo_(texto);
  if (!token) {
    msg_("err", "Ese QR no es el de asistencia. Escanea el de la pantalla del taller.");
    return;
  }

  escaneando_ = false;               // corta lecturas repetidas mientras postea
  await detenerScanner_();
  msg_("info", "Registrando…");

  try {
    const d = await postJSON("/api/despacho/marcar", { email: emailActual_(), token, tipo });
    if (!d?.ok) {
      msg_("err", escapeHtml(d?.error || "No se pudo registrar"));
      await loadTecAsistencia_();
      return;
    }

    msg_("ok",
      `${d.tipo === "SALIDA" ? "Salida registrada" : "Ingreso registrado"}
       <span class="tecAsisHora">${escapeHtml(d.hora || "")}</span>` +
      (d.pausados ? `<div class="small">Se pausaron ${d.pausados} carro(s) en curso.</div>` : ""));

    const okHtml = $("tecAsisMsg").innerHTML;
    await loadTecAsistencia_();
    msg_("ok", okHtml);              // loadTec… limpia el mensaje; lo devolvemos
  } catch (e) {
    msg_("err", escapeHtml(e?.message || "Sin conexión. Pide al supervisor que te marque."));
  }
}

// ─── Dupla de trabajo ───
// Dos técnicos del mismo rol que reciben un carro a la vez y alternan el
// crédito. Se ofrece DESPUÉS de marcar ingreso: primero lo obligatorio.

function limpiarDupla_() {
  const box = $("tecAsisDupla");
  if (box) box.innerHTML = "";
  limpiarAvance_("tecAvanceAsis");
}

async function cargarDupla_() {
  const box = $("tecAsisDupla");
  if (!box) return;
  const email = emailActual_();
  if (!email) return;

  let d;
  try { d = await getJSON(`/api/despacho/duplas?email=${encodeURIComponent(email)}`); }
  catch { return; }
  if (!d?.ok) return;

  // El botón de avanzar se decide aparte (el servidor sabe a quién le toca) y
  // solo aparece si hay dupla ACTIVA o excepción por ayudantes.
  renderAvance_("tecAvanceAsis");

  const mia = (d.duplas || []).find(x => x.miembros?.includes(miUserId_));
  const otroDe = m => m.miembrosNombres?.find((_, i) => m.miembros[i] !== miUserId_) || "tu compañero";

  const marco = cuerpo => `
    <h4 class="tecAsisDuplaH">¿Trabajas en dupla hoy?</h4>
    <div class="tecAsisDuplaBody">${cuerpo}</div>`;

  // Mientras la invitación está en el aire, NINGUNO de los dos recibe carro:
  // si el motor le diera uno al que propuso, el otro aceptaría y se lo
  // encontraría ya metido en un carro. Decirlo aquí evita la lectura fácil y
  // equivocada ("el sistema me tiene olvidado") y empuja a resolverla ya.
  const avisoBloqueo = `<div class="tecAsisAviso tecAsisAviso--warn">
    ⏸ Mientras se decide, ninguno de los dos recibe carros nuevos.</div>`;

  // Me invitaron y falta que yo confirme.
  if (mia?.estado === "PENDIENTE" && mia.lider_user_id !== miUserId_) {
    box.innerHTML = marco(`
      <div class="tecAsisAviso"><b>${escapeHtml(otroDe(mia))}</b> quiere trabajar en dupla contigo.
        Reciben un carro a la vez y el crédito alterna: uno para cada uno.</div>
      ${avisoBloqueo}
      <button id="tecAsisDupOk" class="tecAsisBtn" type="button">Aceptar dupla</button>
      <button id="tecAsisDupNo" class="tecAsisBtn sec" type="button">Rechazar</button>`);
    $("tecAsisDupOk").onclick = () => accionDupla_("confirmar", mia.id);
    $("tecAsisDupNo").onclick = () => accionDupla_("disolver", mia.id);
    return;
  }

  // Propuse yo y espero respuesta.
  if (mia?.estado === "PENDIENTE") {
    box.innerHTML = marco(`
      <div class="tecAsisAviso">Esperando que <b>${escapeHtml(otroDe(mia))}</b> acepte.</div>
      ${avisoBloqueo}
      <button id="tecAsisDupNo" class="tecAsisBtn sec" type="button">Cancelar</button>`);
    $("tecAsisDupNo").onclick = () => accionDupla_("disolver", mia.id);
    return;
  }

  // Dupla del carro extra (la que arma la regla sola): la misma tarjeta que en
  // Mi OT, desde el mismo módulo — dos copias del texto
  // se desincronizan a la primera corrección. Sin "Deshacer": no la armó él, y
  // para salirse está el supervisor. El botón de avanzar tampoco aplica (lo
  // cierra el servidor).
  if (mia?.auto && mia.estado === "ACTIVA") {
    // Sin el marco "¿Trabajas en dupla hoy?": esa pregunta ofrece elegir, y
    // esto no se eligió — se lo asignaron.
    box.innerHTML = apoyoHTML_(mia, miUserId_);
    return;
  }

  // Dupla activa.
  if (mia?.estado === "ACTIVA") {
    box.innerHTML = marco(`
      <div class="tecAsisAviso">Trabajando en dupla con <b>${escapeHtml(otroDe(mia))}</b>
        (${escapeHtml(mia.rol_trabajo || "")}). Reciben un carro a la vez.</div>
      <button id="tecAsisDupNo" class="tecAsisBtn sec" type="button">Deshacer dupla</button>`);
    $("tecAsisDupNo").onclick = () => accionDupla_("disolver", mia.id);
    return;
  }

  // Sin dupla: ofrecer armarla con quien ya marcó asistencia.
  let cands = [];
  try {
    const c = await getJSON(`/api/despacho/companeros?email=${encodeURIComponent(email)}`);
    cands = c?.candidatos || [];
  } catch { /* sin candidatos */ }

  if (!cands.length) {
    box.innerHTML = marco(`<div class="tecAsisAviso">No hay compañeros de tu rol
      que ya hayan marcado asistencia.</div>`);
    return;
  }

  box.innerHTML = marco(`
    <select id="tecAsisSocio" class="tecAsisSelect">
      <option value="">Trabajo solo</option>
      ${cands.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.nombre)}</option>`).join("")}
    </select>
    <button id="tecAsisProp" class="tecAsisBtn" type="button">Proponer dupla</button>`);

  $("tecAsisProp").onclick = async () => {
    const socioUserId = $("tecAsisSocio").value;
    if (!socioUserId) { limpiarDupla_(); return; }
    const b = $("tecAsisProp");
    b.disabled = true;
    b.textContent = "Enviando…";
    try {
      const r = await postJSON("/api/despacho/dupla/proponer", { email, socioUserId });
      if (!r?.ok) throw new Error(r?.error);
      box.innerHTML = marco(`<div class="tecAsisAviso">Listo. Esperando que
        <b>${escapeHtml(r.esperandoA || "tu compañero")}</b> acepte desde su celular.</div>`);
    } catch (e) {
      box.innerHTML = marco(`<div class="tecAsisAviso">${escapeHtml(e?.message || "No se pudo proponer")}</div>`);
    }
  };
}

async function accionDupla_(accion, duplaId) {
  try { await postJSON(`/api/despacho/dupla/${accion}`, { email: emailActual_(), duplaId }); }
  catch { /* se refleja al recargar */ }
  cargarDupla_();
}

/** Apaga la cámara al salir del panel: si queda viva, se come la batería. */
export async function stopTecAsistencia_() {
  await detenerScanner_();
}
