// =========================
// public/js/views/supervisor/sup-ot-control.js
// Panel CONTROL del Supervisor — consola de OTs en vivo.
//
// Sustituye al antiguo panel UBICACIONES, que era solo lectura del estado del
// movilizador. Aquí el supervisor ve las OTs abiertas, busca cualquier VIN
// (esté abierto o cerrado, de hoy o de hace meses) y actúa sobre ellas:
//
//   · pausar / reanudar la OT de un técnico concreto
//   · reasignar el trabajo a otro técnico
//   · crear, editar y eliminar la OT (el borrado arrastra eventos,
//     asignaciones, incidencias y solicitudes de ramal)
//
// Toda búsqueda viaja al servidor (/api/ots?vin=): filtrar en el navegador
// sobre la lista ya cargada es lo que hacía imposible encontrar un VIN viejo.
// =========================

import { getJSON } from "../../core/api.js";
import { escapeHtml, fmtTiempo_, fmtShort_ } from "../../core/format.js";
import { startPoll, stopPoll } from "../../core/poll.js";
import { rolMeta, estadoMeta } from "../../core/domain-meta.js";
import { createVinSuggest_, getEmail } from "../../core/core.js";
import { icon } from "../../core/icons.js";
import {
  formOt, collectFormOt_, validarOt_, bindOtVinSuggest_,
  guardarOt_, borrarOt_, confirmBorradoOt_,
} from "../admin/admin.js";

// Nota interna que marca la pausa como puesta por supervisión: el tick del
// técnico la reconoce y no dispara el auto-resume, y el guard de despacho
// dirigido (routes/trabajo.js) la deja pasar.
const SUP_PAUSA_NOTA = "__SUP_PAUSA_INDEFINIDA";

const S = {
  active:  false,
  vin:     "",       // VIN buscado; vacío = listado de OTs vivas
  ots:     [],
  vehiculo: null,
  registrado: true,
  editId:  null,     // OT abierta en el modal ("" = nueva)
  usuarios: null,    // cache del picker de reasignación
  pausaGlobal: false, // hay una parada de taller vigente
};

const $ = id => document.getElementById(id);

// ─── Fetch con identidad (los endpoints mutadores exigen ADMIN/SUPERVISOR) ──
function mandoFetch_(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), "x-user-email": getEmail() || "" },
  });
}

async function mandoJson_(url, opts) {
  const r = await mandoFetch_(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!j?.ok) throw new Error(j?.error || `Error ${r.status}`);
  return j;
}

function setMsg_(text, isErr = false) {
  const el = $("otCtrlMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isErr ? "var(--danger)" : "var(--muted)";
}

function setTimestamp_() {
  const el = $("otCtrlLastUpdate");
  if (!el) return;
  el.textContent = `Actualizado: ${new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
}

// ─── Render ──────────────────────────────────────────────────────────────────

function badgeEstadoOt_(estado) {
  const e = String(estado || "").toUpperCase();
  const cls = e === "FINALIZADO" ? "adminBadgeOk"
            : e === "TRABAJANDO" ? "adminBadge"
            : "adminBadgeMuted";
  return `<span class="${cls}">${escapeHtml(e || "—")}</span>`;
}

/** Fila de una asignación con sus acciones (pausa/reanuda/reasigna). */
function renderAsignacion_(a) {
  const rm = rolMeta(a.rol_trabajo);
  const em = estadoMeta(a.estado_actual);
  const estado = String(a.estado_actual || "").toUpperCase();
  const cerrada = estado === "FINALIZADO";

  // El botón alterna: solo hay una acción posible por estado, y las demás las
  // rechazaría la máquina de estados del servidor.
  const accion = estado === "TRABAJANDO" ? "PAUSA"
               : estado === "PAUSADO"    ? "REANUDAR"
               : null;
  const btnAccion = accion
    ? `<button class="btn3 otCtrlAccion" data-accion="${accion}"
         data-email="${escapeHtml(a.tecnico_email)}" data-vin="${escapeHtml(a.vin || "")}"
         data-rol="${escapeHtml(a.rol_trabajo)}" data-wo="${escapeHtml(a.work_order_id)}">
         ${accion === "PAUSA" ? "⏸ Pausar" : "▶ Reanudar"}
       </button>`
    : "";

  return `
    <div class="otCtrlAsg" data-asgid="${escapeHtml(a.id)}">
      <div class="otCtrlAsgTop">
        <span class="otCtrlRol" style="color:${rm.color};">${rm.icon} ${escapeHtml(rm.label)}</span>
        <span class="otCtrlEstado ${em.badge}" style="color:${em.color};background:${em.bg};">${escapeHtml(em.label)}</span>
      </div>
      <div class="otCtrlAsgSub small muted">
        ${escapeHtml(a.tecnico_nombre)} · ${escapeHtml(fmtTiempo_(a.tiempo_trab_ms, a.running_since))}
        ${a.updated_at ? ` · ${escapeHtml(fmtShort_(a.updated_at))}` : ""}
      </div>
      ${a.last_nota ? `<div class="otCtrlNota small muted">“${escapeHtml(a.last_nota)}”</div>` : ""}
      <div class="otCtrlAsgActions">
        ${btnAccion}
        ${cerrada ? "" : `<button class="btn3 otCtrlReasignar" data-asgid="${escapeHtml(a.id)}">${icon("refresh", 13)} Reasignar</button>`}
      </div>
      <div class="otCtrlReasigBox hidden" id="otCtrlReasig-${escapeHtml(a.id)}"></div>
    </div>`;
}

/** Card de una OT con sus asignaciones y las acciones CRUD. */
function renderOt_(ot) {
  const asgs = ot.asignaciones || [];
  // El VIN vive en la OT, no en la asignación: se propaga para que el botón de
  // pausa pueda llamar a /api/evento, que resuelve el trabajo por VIN+rol.
  const conVin = asgs.map(a => ({ ...a, vin: ot.vin, work_order_id: ot.id }));

  return `
    <div class="otCtrlCard" data-otid="${escapeHtml(ot.id)}">
      <div class="otCtrlCardHead">
        <div class="otCtrlCardTitle">
          <code class="otCtrlVin">${escapeHtml(ot.vin || "— sin VIN —")}</code>
          <span class="adminBadge">${escapeHtml(ot.tipo_ot)}</span>
          ${badgeEstadoOt_(ot.estado_general)}
        </div>
        <div class="otCtrlCardActions">
          <button class="adminRowBtn otCtrlEditar" data-otid="${escapeHtml(ot.id)}" title="Editar OT" aria-label="Editar OT">${icon("pencil", 15)}</button>
          <button class="adminRowBtn adminRowBtn--danger otCtrlBorrar" data-otid="${escapeHtml(ot.id)}" data-vin="${escapeHtml(ot.vin || "")}" title="Eliminar OT y todo lo relacionado" aria-label="Eliminar OT">${icon("trash", 15)}</button>
        </div>
      </div>
      <div class="otCtrlCardSub small muted">
        ${ot.numero_ot ? `OT ${escapeHtml(ot.numero_ot)} · ` : ""}Creada ${escapeHtml(fmtShort_(ot.fecha_creacion))}
        ${ot.observaciones ? ` · ${escapeHtml(ot.observaciones)}` : ""}
      </div>
      ${conVin.length
        ? `<div class="otCtrlAsgList">${conVin.map(renderAsignacion_).join("")}</div>`
        : `<div class="otCtrlEmptyAsg small muted">Sin asignaciones: nadie ha tomado esta OT todavía.</div>`}
    </div>`;
}

function render_() {
  const box = $("otCtrlBody");
  if (!box) return;

  const cabecera = S.vin
    ? `<div class="otCtrlHeader">
         <div>
           <div class="otCtrlHeaderVin"><code>${escapeHtml(S.vin)}</code></div>
           <div class="small muted">
             ${S.registrado
               ? escapeHtml([S.vehiculo?.modelo, S.vehiculo?.cliente].filter(Boolean).join(" · ") || "Sin datos de modelo")
               : "⚠️ Este VIN no está en la lista de vehículos registrados."}
           </div>
         </div>
         <button class="btn3" id="btnOtCtrlLimpiar">✕ Ver todas</button>
       </div>`
    : "";

  if (!S.ots.length) {
    box.innerHTML = `${cabecera}
      <div class="adminEmpty">
        <div class="adminEmptyTitle">${S.vin ? "Este VIN no tiene ninguna OT" : "No hay OTs abiertas"}</div>
        <div class="small muted">${S.vin
          ? "Puedes crear una con el botón “Nueva OT”."
          : "Cuando un técnico abra un trabajo aparecerá aquí."}</div>
      </div>`;
    bindDinamico_();
    return;
  }

  box.innerHTML = cabecera + `<div class="otCtrlList">${S.ots.map(renderOt_).join("")}</div>`;
  bindDinamico_();
}

// ─── Carga ───────────────────────────────────────────────────────────────────

/**
 * refresh_ — recarga la consola.
 * @param {object}  [opts]
 * @param {boolean} [opts.fresh]  saltar el cache del servidor (botón manual).
 *   El poll periódico se sirve del cache compartido entre supervisores; el
 *   botón exige la lectura real.
 */
async function refresh_({ fresh = false } = {}) {
  if (!S.active) return;
  const btn = $("btnOtCtrlRefresh");
  if (btn) btn.disabled = true;
  try {
    if (S.vin) {
      const j = await getJSON(`/api/ots?vin=${encodeURIComponent(S.vin)}`);
      if (!j?.ok) throw new Error(j?.error || "Error");
      S.ots        = j.ots || [];
      S.vehiculo   = j.vehiculo;
      S.registrado = !!j.registrado;
    } else {
      const j = await getJSON(`/api/ots/vivas${fresh ? "?fresh=1" : ""}`);
      if (!j?.ok) throw new Error(j?.error || "Error");
      S.ots = j.ots || [];
      S.vehiculo = null;
      S.registrado = true;
    }
    render_();
    setTimestamp_();
    setMsg_("");
    // La parada puede haberla puesto el admin (o el propio supervisor desde
    // otro dispositivo): el botón se resincroniza en cada poll, no solo al entrar.
    syncPausaGlobal_().catch(() => {});
  } catch (e) {
    setMsg_(`⚠️ ${e.message}`, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function buscarVin_(vin) {
  S.vin = String(vin || "").trim().toUpperCase();
  const inp = $("otCtrlVin");
  if (inp) inp.value = S.vin;
  refresh_().catch(() => {});
}

// ─── Acciones ────────────────────────────────────────────────────────────────

/**
 * Pausa o reanuda el trabajo de UN técnico sobre UN VIN.
 * Va por /api/evento (y no por un PATCH directo) para que quede el evento en
 * la línea de tiempo y el tiempo acumulado se calcule como en el resto del app.
 */
async function togglePausa_(btn) {
  const { accion, email, vin, rol } = btn.dataset;
  if (!email || !rol) { setMsg_("Falta el técnico de esta asignación.", true); return; }

  const verbo = accion === "PAUSA" ? "Pausar" : "Reanudar";
  if (accion === "PAUSA" && !confirm(`¿Pausar la OT de ${rol} del VIN ${vin}?\n\nEl técnico deberá reanudarla, o tú desde aquí.`)) return;

  btn.disabled = true;
  btn.textContent = accion === "PAUSA" ? "Pausando…" : "Reanudando…";
  try {
    await mandoJson_("/api/evento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, vin, rolTrabajo: rol, accion, nota: SUP_PAUSA_NOTA }),
    });
    setMsg_(`${verbo}: hecho.`);
    await refresh_();
  } catch (e) {
    setMsg_(`No se pudo ${verbo.toLowerCase()}: ${e.message}`, true);
    btn.disabled = false;
    btn.textContent = accion === "PAUSA" ? "⏸ Pausar" : "▶ Reanudar";
  }
}

// ─── Parada de taller (pausa masiva) ─────────────────────────────────────────

/**
 * Refleja en el botón si hay parada vigente. El estado no se deduce de las OTs
 * cargadas —la búsqueda por VIN muestra una sola— sino de PAUSA_GLOBAL_ACTIVA,
 * que es la misma bandera que apaga el auto-resume de 8 min en el técnico.
 */
function pintarBotonPausaTodo_() {
  const btn = $("btnOtCtrlPausaTodo");
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = S.pausaGlobal ? "▶ Reanudar todas" : "⏸ Pausar todas";
  btn.title = S.pausaGlobal
    ? "Reanudar todas las OTs que quedaron pausadas por la parada"
    : "Pausar todas las OTs que estén trabajando ahora mismo";
  btn.classList.toggle("otCtrlPausaTodo--activa", S.pausaGlobal);
}

async function syncPausaGlobal_() {
  try {
    // Con cache-buster: /api/config se sirve con max-age=60 y justo después de
    // pulsar el botón el navegador devolvería la copia vieja, dejando el botón
    // diciendo lo contrario de lo que acaba de pasar.
    const j = await getJSON(`/api/config?_=${Date.now()}`);
    S.pausaGlobal = String(j?.config?.PAUSA_GLOBAL_ACTIVA || "0") === "1";
  } catch {
    // Sin config no se inventa estado: se deja el último conocido.
  }
  pintarBotonPausaTodo_();
}

/**
 * Pausa (o reanuda) TODAS las asignaciones activas del taller de un golpe.
 * Va al mismo endpoint que usa Admin → Configuración, así que la parada se ve
 * igual en los dos sitios y deja la bandera PAUSA_GLOBAL_ACTIVA coherente.
 */
async function pausaMasiva_() {
  const btn = $("btnOtCtrlPausaTodo");
  const accion = S.pausaGlobal ? "REANUDAR" : "PAUSA";

  const pregunta = accion === "PAUSA"
    ? "¿Pausar TODAS las OTs que están trabajando ahora?\n\nEs para parar el taller entero (simulacro, corte, charla). Los técnicos no podrán reanudar solos hasta que tú reanudes desde aquí."
    : "¿Reanudar TODAS las OTs pausadas?\n\nVolverán a correr el reloj las que estén en PAUSADO, incluidas las que pausaste una por una.";
  if (!confirm(pregunta)) return;

  if (btn) { btn.disabled = true; btn.textContent = accion === "PAUSA" ? "Pausando…" : "Reanudando…"; }
  try {
    const j = await mandoJson_("/api/admin/pausa-masiva", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion }),
    });
    S.pausaGlobal = accion === "PAUSA";
    // El técnico cachea la config 5 min; el supervisor no debe verla vieja.
    try { localStorage.removeItem("glp_app_config_cache"); } catch {}
    await refresh_();
    // Después del refresh: refresh_ limpia el mensaje al terminar bien.
    setMsg_(accion === "PAUSA"
      ? `Taller detenido: ${j.afectadas} OT(s) pausadas.`
      : `Taller reanudado: ${j.afectadas} OT(s) en marcha.`);
  } catch (e) {
    setMsg_(`No se pudo ${accion === "PAUSA" ? "pausar" : "reanudar"} todo: ${e.message}`, true);
  } finally {
    pintarBotonPausaTodo_();
  }
}

async function usuariosActivos_() {
  if (S.usuarios) return S.usuarios;
  const j = await getJSON("/api/admin/usuarios-activos");
  S.usuarios = j?.usuarios || [];
  return S.usuarios;
}

async function abrirReasignar_(asgId) {
  const box = $(`otCtrlReasig-${asgId}`);
  if (!box) return;
  if (!box.classList.contains("hidden")) { box.classList.add("hidden"); return; }

  box.classList.remove("hidden");
  box.innerHTML = `<div class="small muted">Cargando técnicos…</div>`;
  try {
    const usuarios = await usuariosActivos_();
    box.innerHTML = `
      <select class="adminInput otCtrlReasigSel">
        ${usuarios.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.nombre)} (${escapeHtml(u.especialidad)})</option>`).join("")}
      </select>
      <button class="btn3 otCtrlReasigOk" data-asgid="${escapeHtml(asgId)}">Confirmar</button>
      <button class="btn3 otCtrlReasigCancel" data-asgid="${escapeHtml(asgId)}">Cancelar</button>`;
  } catch (e) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">${escapeHtml(e.message)}</div>`;
  }
}

async function confirmarReasignar_(asgId, btn) {
  const sel = btn.closest(".otCtrlReasigBox")?.querySelector(".otCtrlReasigSel");
  const userId = sel?.value;
  if (!userId) return;
  btn.disabled = true;
  try {
    await mandoJson_(`/api/admin/asignaciones/${encodeURIComponent(asgId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    setMsg_("Técnico reasignado.");
    await refresh_();
  } catch (e) {
    setMsg_(`No se pudo reasignar: ${e.message}`, true);
    btn.disabled = false;
  }
}

async function borrar_(otId, vin) {
  if (!confirmBorradoOt_(vin)) return;
  setMsg_("Eliminando OT y registros relacionados…");
  try {
    const r = await borrarOt_(otId);
    setMsg_(`OT eliminada (${r.asignaciones_borradas} asignación(es) y sus eventos, incidencias y solicitudes de ramal).`);
    await refresh_();
  } catch (e) {
    setMsg_(`No se pudo eliminar: ${e.message}`, true);
  }
}

// ─── Modal crear / editar ────────────────────────────────────────────────────

function abrirModal_(ot = null) {
  S.editId = ot?.id || "";
  $("otCtrlModalTitle").textContent = ot ? "Editar OT" : "Nueva OT";
  $("otCtrlModalBody").innerHTML = `<div class="adminForm">${formOt(ot || (S.vin ? { vin: S.vin } : {}))}</div>`;
  const modal = $("otCtrlModal");
  modal.classList.add("show");
  modal.removeAttribute("aria-hidden");
  document.body.classList.add("modal-open");
  setTimeout(() => {
    $("otCtrlModalBody").querySelector("input,select,textarea")?.focus();
    bindOtVinSuggest_();
  }, 80);
}

function cerrarModal_() {
  const modal = $("otCtrlModal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  S.editId = null;
}

async function guardarModal_() {
  const data = collectFormOt_();
  const err = validarOt_(data);
  if (err) { setMsg_(err, true); return; }

  const btn = $("btnOtCtrlModalSave");
  btn.disabled = true;
  try {
    await guardarOt_(S.editId, data);
    const eraNueva = !S.editId;
    cerrarModal_();
    setMsg_(eraNueva ? "OT creada." : "OT actualizada.");
    // Una OT nueva casi siempre se crea mirando un VIN concreto: quedarse en su
    // ficha evita tener que volver a buscarlo para comprobar que salió bien.
    if (eraNueva && data.vin) buscarVin_(data.vin);
    else await refresh_();
  } catch (e) {
    setMsg_(e.message, true);
  } finally {
    btn.disabled = false;
  }
}

// ─── Binding ─────────────────────────────────────────────────────────────────

/** Handlers de los elementos que se re-crean en cada render. */
function bindDinamico_() {
  const box = $("otCtrlBody");
  if (!box || box.dataset.bound) return;
  box.dataset.bound = "1";

  // Delegación: el contenido se reemplaza entero en cada refresh.
  box.addEventListener("click", e => {
    const t = e.target;
    const accion   = t.closest(".otCtrlAccion");
    const editar   = t.closest(".otCtrlEditar");
    const borrarEl = t.closest(".otCtrlBorrar");
    const reasig   = t.closest(".otCtrlReasignar");
    const reasigOk = t.closest(".otCtrlReasigOk");
    const reasigNo = t.closest(".otCtrlReasigCancel");
    const limpiar  = t.closest("#btnOtCtrlLimpiar");

    if (accion)   return void togglePausa_(accion);
    if (reasig)   return void abrirReasignar_(reasig.dataset.asgid);
    if (reasigOk) return void confirmarReasignar_(reasigOk.dataset.asgid, reasigOk);
    if (reasigNo) return void $(`otCtrlReasig-${reasigNo.dataset.asgid}`)?.classList.add("hidden");
    if (borrarEl) return void borrar_(borrarEl.dataset.otid, borrarEl.dataset.vin);
    if (limpiar)  return void buscarVin_("");
    if (editar) {
      const ot = S.ots.find(o => String(o.id) === editar.dataset.otid);
      if (ot) abrirModal_(ot);
    }
  });
}

export function bindSupOtControl_() {
  $("btnOtCtrlRefresh")?.addEventListener("click", () => refresh_({ fresh: true }).catch(() => {}));
  $("btnOtCtrlBuscar")?.addEventListener("click", () => buscarVin_($("otCtrlVin")?.value));
  $("btnOtCtrlNueva")?.addEventListener("click", () => abrirModal_(null));
  $("btnOtCtrlPausaTodo")?.addEventListener("click", () => void pausaMasiva_());

  $("otCtrlVin")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.defaultPrevented) buscarVin_(e.target.value);
  });

  createVinSuggest_({
    input: "otCtrlVin", box: "otCtrlVinSuggest",
    min: 2, debounce: 220, limit: 8,
    onPick: item => buscarVin_(item.vin),
  }).bind();

  $("btnOtCtrlModalClose")?.addEventListener("click", cerrarModal_);
  $("btnOtCtrlModalCancel")?.addEventListener("click", cerrarModal_);
  $("btnOtCtrlModalSave")?.addEventListener("click", () => guardarModal_());
  $("otCtrlModal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) cerrarModal_();
  });
}

export async function enterOtControl_() {
  S.active = true;
  await syncPausaGlobal_();
  await refresh_();
  startPoll("POLL_SUP_OT_CONTROL_MS", () => refresh_().catch(() => {}), { immediate: false });
}

export function exitOtControl_() {
  S.active = false;
  stopPoll("POLL_SUP_OT_CONTROL_MS");
}
