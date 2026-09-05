// =========================
// public/js/views/ramales/ramales.js
// Panel de RAMALES — control de cajas, turno rotativo, reparto y stock.
//
// Se pinta en dos sitios con el mismo código:
//   · página propia /ramales (el supervisor entra directo)
//   · pestaña RAMALES dentro de la vista de supervisor
//
// QUÉ MUESTRA Y POR QUÉ EN ESE ORDEN
// ──────────────────────────────────
//   1. De quién es el turno   → es la decisión del día
//   2. Cajas abiertas         → lo que está corriendo ahora mismo
//   3. Comportamiento         → cómo trabaja cada uno (ver comportamiento.js)
//   4. Stock por marca        → qué hay para entregar y qué está en proceso
//   5. Rotación               → la lectura larga, al final
//
// Comportamiento va tercero y no último a propósito: es el parámetro que
// el taller quiere medir, y una sección al pie del panel es una sección
// que nadie abre. Lo que sí queda antes son las cajas — quien entra a
// registrar una que acaba de llegar no debería tener que pasar por
// cuatro gráficos para hacerlo.
//
// TODO GESTO PASA POR UN FORMULARIO, NO POR UN prompt()
// ────────────────────────────────────────────────────
// Repartir 20 ramales entre tres personas con prompts encadenados es
// imposible de corregir a mitad de camino: te equivocas en el segundo y
// ya no puedes volver. El modal de reparto muestra las tres filas a la
// vez con el contador de lo que falta actualizándose en vivo, que es
// como se reparte de verdad. Lo mismo con el cierre de caja: el arqueo
// se ve antes de decidir, no después.
//
// El cronómetro de cada caja abierta corre en vivo en el cliente, pero
// los timestamps son del servidor: si alguien cambia la hora de su
// celular, la métrica no se mueve.
// =========================

import { getJSON, postJSON, escapeHtml, CORE } from "../../core/core.js";
import { startPoll, stopPoll } from "../../core/poll.js";
import { icon } from "../../core/icons.js";
import { comportamientoHTML } from "./comportamiento.js";

// Espejo del enum `tipo_ramal` (supabase/schema.sql).
const TIPOS_RAMAL = ["JETOUR", "VOLKSWAGEN", "KYC V3", "KYC V5", "KYC V7", "KYC X5"];

// Estado local del panel. `raw` es la última respuesta de /api/ramales/panel.
const RM = {
  raw: null,
  root: null,
  puedeEditar: false,   // SUPERVISOR o ADMIN
  email: "",
  clockTimer: null,
  cargando: false,
  verCerradas: false,   // sobrevive al re-render del poll
};

// ─── Helpers ─────────────────────────────────────────────────────────

const esc = escapeHtml;

function $(sel) { return RM.root?.querySelector(sel) || null; }
function $$(sel) { return [...(RM.root?.querySelectorAll(sel) || [])]; }

/** mm:ss / h:mm:ss — el formato cambia solo según cuánto lleve corriendo. */
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

function fmtMin_(min) {
  if (min == null || !Number.isFinite(Number(min))) return "—";
  const n = Number(min);
  return n >= 60 ? `${Math.floor(n / 60)}h ${Math.round(n % 60)}m` : `${Math.round(n)}m`;
}

function fmtFecha_(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

/** Inicial del nombre para el círculo de color. */
function inicial_(nombre) {
  return String(nombre || "?").trim().charAt(0).toUpperCase() || "?";
}

function avatar_(nombre, sm = false) {
  return `<span class="rmInicial${sm ? " rmInicial--sm" : ""}">${esc(inicial_(nombre))}</span>`;
}

function opciones_(arr, sel) {
  return arr.map(o =>
    `<option value="${esc(o.v)}"${o.v === sel ? " selected" : ""}>${esc(o.t)}</option>`,
  ).join("");
}

/** Aviso flotante — mismo gesto que usa el inventario. */
function toast_(msg, tipo = "ok") {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:9999;
    padding:11px 18px;border-radius:12px;font-weight:700;font-size:.88rem;
    max-width:90vw;text-align:center;box-shadow:0 8px 28px rgba(0,0,0,.28);
    background:${tipo === "bad" ? "var(--bad,#ef4444)" : "var(--ok)"};color:#fff;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), tipo === "bad" ? 5200 : 2800);
}

/**
 * POST con el email de sesión ya puesto.
 * Devuelve la respuesta si salió bien, o `null` tras avisar del error.
 * Con `silencioso` el error no se muestra: lo usa el cierre de caja, que
 * espera el rechazo del servidor y quiere preguntar en vez de gritar.
 */
async function accion_(url, body = {}, { silencioso = false } = {}) {
  try {
    const j = await postJSON(url, { email: RM.email, ...body });
    if (!j?.ok) {
      if (!silencioso) toast_(j?.error || "No se pudo completar la acción.", "bad");
      return null;
    }
    await cargar_();
    return j;
  } catch (e) {
    if (!silencioso) toast_(String(e?.message || e), "bad");
    return null;
  }
}

// ─── Modal genérico del módulo ───────────────────────────────────────
//  Autocontenido, igual que el del inventario: no toca #adminModal para
//  no pisar el listener de guardado del CRUD del panel de Admin.

/**
 * @param {object} o
 * @param {string} o.titulo
 * @param {string} o.cuerpo      HTML del formulario
 * @param {string} [o.guardar]   texto del botón principal
 * @param {boolean} [o.ancho]
 * @param {boolean} [o.peligro]  el botón principal se pinta como destructivo
 * @param {(box:HTMLElement)=>void} [o.alAbrir]  para enganchar listeners vivos
 * @param {(box:HTMLElement)=>Promise<boolean|void>} o.alGuardar
 *        devolver false deja el modal abierto (validación fallida)
 */
function modal_(o) {
  document.getElementById("rmModal")?.remove();
  const m = document.createElement("div");
  m.id = "rmModal";
  m.className = "modal show";
  m.innerHTML = `
    <div class="modalBox rmModalBox${o.ancho ? " rmModalBox--ancho" : ""}">
      <div class="modalHead">
        <span class="modalTitle">${esc(o.titulo)}</span>
        <button type="button" class="rmModalClose" title="Cerrar"
                style="background:none;border:none;color:inherit;font-size:1.1rem;cursor:pointer;">✕</button>
      </div>
      <div class="modalBody"><div class="rmForm">${o.cuerpo}</div></div>
      <div class="rmModalFoot">
        <button type="button" class="btn3 rmModalCancel">Cancelar</button>
        <button type="button" class="btn3 ${o.peligro ? "rmBtn--danger" : "rmBtn--primary"} rmModalSave">
          ${esc(o.guardar || "Guardar")}
        </button>
      </div>
    </div>`;
  document.body.appendChild(m);
  document.body.classList.add("modal-open");

  const box = m.querySelector(".modalBox");
  const cerrar = () => {
    m.remove();
    if (!document.querySelector(".modal.show")) document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onEsc);
  };
  const onEsc = (e) => { if (e.key === "Escape") cerrar(); };
  document.addEventListener("keydown", onEsc);

  m.querySelector(".rmModalClose").addEventListener("click", cerrar);
  m.querySelector(".rmModalCancel").addEventListener("click", cerrar);
  m.addEventListener("click", (e) => { if (e.target === m) cerrar(); });

  const btn = m.querySelector(".rmModalSave");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    let r;
    try { r = await o.alGuardar(box); } finally { btn.disabled = false; }
    if (r !== false) cerrar();
  });

  o.alAbrir?.(box);
  setTimeout(() => box.querySelector("input,select,textarea")?.focus(), 90);
  return { box, cerrar };
}

/** Confirmación con texto propio — reemplaza a `confirm()`. */
function confirmar_(titulo, cuerpoHtml, textoBoton, onOk, peligro = true) {
  modal_({
    titulo,
    cuerpo: cuerpoHtml,
    guardar: textoBoton,
    peligro,
    alGuardar: onOk,
  });
}

// ─── Carga ───────────────────────────────────────────────────────────

async function cargar_() {
  if (RM.cargando) return;
  RM.cargando = true;
  try {
    const j = await getJSON("/api/ramales/panel");
    if (!j?.ok) throw new Error(j?.error || "Respuesta inesperada del servidor");
    RM.raw = j;
    render_();
  } catch (e) {
    if (RM.root) {
      RM.root.innerHTML = `
        <div class="card" style="padding:22px;">
          <h3 style="margin:0 0 6px;">No se pudo cargar el panel de ramales</h3>
          <p class="small" style="color:var(--muted);">${esc(String(e?.message || e))}</p>
          <p class="small" style="color:var(--muted);">
            Si dice que falta una tabla o una vista, ejecuta
            <code>supabase/ramales.sql</code> en Supabase → SQL Editor.
          </p>
        </div>`;
    }
  } finally {
    RM.cargando = false;
  }
}

// ─── Render: barra de turno ──────────────────────────────────────────

function renderTurno_() {
  const s = RM.raw?.sugerido_desembalaje;
  const sr = RM.raw?.sugerido_revision;
  const filtrado = RM.raw?.filtrado_por_asistencia;

  const boton = RM.puedeEditar
    ? `<div class="rmTurno__acciones">
         <button class="btn3 rmBtn--primary" data-rm="nueva-caja">
           ${icon("box", 15)} Registrar caja
         </button>
       </div>`
    : "";

  // Sin nadie en rotación el módulo no puede sugerir turno. Se dice qué
  // falta en vez de mostrar un hueco: el arreglo está a un clic.
  if (!s) {
    return `
      <div class="rmTurno">
        <div class="rmTurno__cols">
          <div>
            <div class="rmTurno__label">Turno de desembalaje</div>
            <div class="rmTurno__nombre">Sin ramaleros en rotación</div>
            <div class="rmTurno__meta">
              Nadie tiene el módulo RAMALERO activo, o a todos se les sacó del turno.
            </div>
          </div>
        </div>
        ${boton}
      </div>`;
  }

  return `
    <div class="rmTurno">
      <div class="rmTurno__cols">
        <div>
          <div class="rmTurno__label">Le toca desembalar</div>
          <div class="rmTurno__quien">
            ${avatar_(s.nombre)}
            <div>
              <div class="rmTurno__nombre">${esc(s.nombre)}</div>
              <div class="rmTurno__meta">
                ${s.veces_desembalaje} turno${s.veces_desembalaje === 1 ? "" : "s"} ·
                última vez ${s.ultimo_desembalaje ? fmtFecha_(s.ultimo_desembalaje) : "nunca"}
              </div>
            </div>
          </div>
        </div>
        <div>
          <div class="rmTurno__label">Revisión de equipos</div>
          <div class="rmTurno__quien">
            ${sr ? avatar_(sr.nombre, true) : ""}
            <div>
              <div class="rmTurno__nombre rmTurno__nombre--sec">${esc(sr?.nombre || "—")}</div>
              <div class="rmTurno__meta">${sr ? `${sr.veces_revision} turnos` : "sin candidato"}</div>
            </div>
          </div>
        </div>
        ${filtrado ? `
          <div>
            <div class="rmTurno__label">Criterio</div>
            <div class="rmChip info">${icon("users", 12)} solo quienes marcaron hoy</div>
          </div>` : ""}
      </div>
      ${boton}
    </div>`;
}

// ─── Render: una caja ────────────────────────────────────────────────

function chipEstado_(l) {
  const map = {
    RECIBIDO:     ["", "Recibida"],
    DESEMBALANDO: ["warn", "Desembalando"],
    DESEMBALADO:  ["info", "Cables recibidos"],
    REPARTIDO:    ["ok", "Repartida"],
    CERRADO:      ["", "Cerrada"],
  };
  const [cls, txt] = map[l.estado] || ["", l.estado];
  return `<span class="rmChip ${cls}">${esc(txt)}</span>`;
}

/**
 * La barra es el arqueo dibujado. Si los tres tramos no llenan el ancho,
 * la caja no cuadra — y eso se ve antes de leer un solo número.
 */
function renderBarra_(l) {
  const total = Math.max(1, l.cantidad_equipos);
  const pct = (n) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
  const descuadre = Number(l.descuadre) !== 0;

  return `
    <div class="rmBar" title="verde: devuelto · ámbar: en la calle · gris: sin repartir">
      <span class="rmBar__seg rmBar__seg--dev"  style="width:${pct(l.devueltos)}"></span>
      <span class="rmBar__seg rmBar__seg--proc" style="width:${pct(l.en_proceso)}"></span>
      <span class="rmBar__seg rmBar__seg--sin"  style="width:${pct(Math.max(0, l.sin_repartir))}"></span>
      ${descuadre ? `<span class="rmBar__seg rmBar__seg--mal" style="width:${pct(Math.abs(l.descuadre))}"></span>` : ""}
    </div>`;
}

function renderArqueo_(l) {
  const item = (k, v, cls = "") =>
    `<div class="rmArqueo__item">
       <span class="rmArqueo__k">${k}</span>
       <span class="rmArqueo__v ${cls}">${v}</span>
     </div>`;

  return `
    <div class="rmArqueo">
      ${item("Equipos", l.cantidad_equipos)}
      ${item("Repartidos", l.repartidos)}
      ${item("Devueltos", l.devueltos, l.devueltos > 0 ? "is-bien" : "")}
      ${item("Trabajando", l.en_proceso, l.en_proceso > 0 ? "is-warn" : "")}
      ${item("Sin repartir", l.sin_repartir, l.sin_repartir < 0 ? "is-mal" : "")}
      ${l.rechazados > 0 ? item("Rechazados", l.rechazados, "is-mal") : ""}
      ${l.merma > 0 ? item("Merma", l.merma, "is-mal") : ""}
      ${Number(l.descuadre) !== 0 ? item("DESCUADRE", l.descuadre, "is-mal") : ""}
    </div>`;
}

function renderRepartosDe_(loteId, cerrado) {
  const reps = (RM.raw?.repartos || []).filter(r => r.lote_id === loteId);
  if (!reps.length) return "";

  return `<div class="rmRepartos">${reps.map(r => {
    const pendiente = !r.devuelto_at;
    // Desde este panel solo recibe el supervisor. El ramalero devuelve lo
    // suyo desde su propia vista (views/ramales/mi-turno.js), donde ve
    // únicamente sus repartos.
    const puedeRecibir = pendiente && !cerrado && RM.puedeEditar;

    return `
      <div class="rmReparto ${pendiente ? "is-pendiente" : ""}">
        ${avatar_(r.nombre, true)}
        <span class="rmReparto__nombre">${esc(r.nombre)}</span>
        <span class="rmReparto__cifra">
          ${r.cantidad_asignada} asignados${
            r.devuelto_at
              ? ` · ${r.cantidad_devuelta} devueltos${r.cantidad_rechazada ? ` · ${r.cantidad_rechazada} rechazados` : ""}`
              : ""}
        </span>
        <span class="rmReparto__acc">
          ${pendiente ? `<span class="rmChip warn">pendiente</span>`
                      : `<span class="rmChip ok">cerrado</span>`}
          ${puedeRecibir
            ? `<button class="btn3" data-rm="recibir" data-id="${r.id}">
                 ${icon("trayIn", 13)} Recibir
               </button>` : ""}
        </span>
      </div>`;
  }).join("")}</div>`;
}

function renderLote_(l) {
  const corriendo = l.estado === "DESEMBALANDO";
  const cerrado = l.estado === "CERRADO";
  const descuadre = Number(l.descuadre) !== 0;

  // El reloj: si corre, el cliente lo anima desde el timestamp del
  // servidor. Si ya cerró, se muestra el tiempo oficial (inicio → cables).
  const clock = corriendo
    ? `<span class="rmClock is-corriendo" data-clock="${l.lote_id}">—</span>`
    : (l.desembalaje_min != null
        ? `<span class="rmClock" title="Tiempo oficial: de que llegó la caja a que el supervisor recibió los cables">${fmtMin_(l.desembalaje_min)}</span>`
        : "");

  const acc = [];
  if (RM.puedeEditar) {
    if (l.estado === "RECIBIDO") {
      acc.push(`<button class="btn3 rmBtn--primary" data-rm="iniciar" data-id="${l.lote_id}">${icon("timer", 14)} Arrancar tiempo</button>`);
    }
    if (corriendo) {
      acc.push(`<button class="btn3 rmBtn--primary" data-rm="cables" data-id="${l.lote_id}">${icon("trayIn", 14)} Recibí los cables</button>`);
    }
    if (["DESEMBALADO", "REPARTIDO"].includes(l.estado) && l.sin_repartir > 0) {
      acc.push(`<button class="btn3 rmBtn--primary" data-rm="repartir" data-id="${l.lote_id}">${icon("users", 14)} Repartir</button>`);
    }
    if (!cerrado) {
      acc.push(`<button class="btn3" data-rm="revision" data-id="${l.lote_id}">${icon("listChecks", 14)} Revisión</button>`);
      acc.push(`<button class="btn3" data-rm="cerrar" data-id="${l.lote_id}">${icon("shieldCheck", 14)} Cerrar caja</button>`);
    }
  }

  return `
    <div class="rmLote ${descuadre ? "is-descuadre" : ""}" data-estado="${l.estado}">
      <div class="rmLote__head">
        <span class="rmLote__codigo">${esc(l.codigo || "—")}</span>
        ${chipEstado_(l)}
        ${clock}
        ${l.revisor ? `<span class="rmChip ${l.revision_fin_at ? "ok" : ""}">
            ${icon("listChecks", 12)} revisa ${esc(l.revisor)}
          </span>` : ""}
        ${l.turno_pisado ? `<span class="rmChip pisado"
            title="El supervisor eligió a alguien distinto de quien tenía el turno">turno cambiado</span>` : ""}

        <div class="rmLote__sub">
          <span>${fmtFecha_(l.fecha)}</span>
          <span>·</span>
          <span>${l.encargado ? `desembala ${esc(l.encargado)}` : "sin encargado"}</span>
          ${l.tipo_ramal ? `<span>·</span><span>${esc(l.tipo_ramal)}</span>` : ""}
        </div>
      </div>

      ${renderBarra_(l)}
      ${renderArqueo_(l)}
      ${renderRepartosDe_(l.lote_id, cerrado)}

      ${l.merma > 0 && l.merma_motivo
        ? `<div class="rmNota">⚠️ Merma: ${esc(l.merma_motivo)}</div>` : ""}

      ${acc.length ? `<div class="rmLote__acciones">${acc.join("")}</div>` : ""}
    </div>`;
}

// ─── Render: stock ───────────────────────────────────────────────────

/**
 * Stock por marca, en tres cifras: TOTAL = TRABAJANDO + DISPONIBLE.
 *
 * «Jetour 30» hacía creer que de esa marca hay 30 en el mundo. En
 * realidad puede haber 80 con 50 en la mesa de alguien. Es la diferencia
 * entre «hay que comprar» y «hay que esperar», que llevan a decisiones
 * opuestas — por eso las tres van juntas y no escondidas en un tooltip.
 */
function renderStock_() {
  const stock = RM.raw?.stock || [];
  if (!stock.length) {
    return `<div class="rmEmpty"><span class="rmEmpty__icon">📥</span>Sin datos de stock.</div>`;
  }

  return `
    <div class="rmStockGrid">
      ${stock.map(s => {
        const total = s.total ?? (s.disponible + (s.trabajando || 0));
        const trab = s.trabajando || 0;
        const disp = s.disponible || 0;
        const pct = (n) => `${total > 0 ? (n / total) * 100 : 0}%`;

        return `
          <div class="rmMarca ${disp <= 0 ? "is-cero" : (s.bajo_minimo ? "is-bajo" : "")}">
            <div class="rmMarca__top">
              <span class="rmMarca__nom">${esc(s.tipo_ramal)}</span>
              <span class="rmMarca__tot">${total}</span>
            </div>

            <div class="rmMarca__bar" aria-hidden="true">
              ${trab > 0 ? `<i style="width:${pct(trab)};background:var(--dv-3)"></i>` : ""}
              ${disp > 0 ? `<i style="width:${pct(disp)};background:var(--dv-1)"></i>` : ""}
            </div>

            <div class="rmMarca__cifras">
              <span class="rmMarca__c">
                <span class="rmMarca__ck"><i style="background:var(--dv-3)"></i>Trabajando</span>
                <span class="rmMarca__cv">${trab}</span>
              </span>
              <span class="rmMarca__c">
                <span class="rmMarca__ck"><i style="background:var(--dv-1)"></i>Disponibles</span>
                <span class="rmMarca__cv">${disp}</span>
              </span>
            </div>

            <div class="rmMarca__foot">
              mínimo ${s.stock_minimo}${s.bajo_minimo ? " · bajo mínimo" : ""}
            </div>

            ${RM.puedeEditar ? `
              <button class="btn3 rmStockCard__btn" style="width:100%;" data-rm="stock"
                      data-tipo="${esc(s.tipo_ramal)}">Ajustar</button>` : ""}
          </div>`;
      }).join("")}
    </div>`;
}


// ─── Render: rotación ────────────────────────────────────────────────

function renderRotacion_() {
  const rot = RM.raw?.rotacion || [];
  if (!rot.length) {
    return `<div class="rmEmpty">
      <span class="rmEmpty__icon">🔁</span>
      <strong>Nadie en rotación</strong>
      Dale el módulo RAMALERO a alguien y aparecerá aquí.
    </div>`;
  }

  return `
    <div class="rmTableWrap">
      <table class="rmTable">
        <thead>
          <tr>
            <th>Ramalero</th><th class="num">Turnos</th><th>Última vez</th>
            <th>Hoy</th>${RM.puedeEditar ? "<th></th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${rot.map((r, i) => `
            <tr class="${i === 0 ? "is-turno" : ""}">
              <td><div class="who">
                ${avatar_(r.nombre, true)}${esc(r.nombre)}
                ${i === 0 ? `<span class="rmChip info">le toca</span>` : ""}
              </div></td>
              <td class="num">${r.veces_desembalaje}</td>
              <td>${r.ultimo_desembalaje ? fmtFecha_(r.ultimo_desembalaje) : "nunca"}</td>
              <td>${r.presente === null
                    ? `<span class="small" style="color:var(--muted)">—</span>`
                    : (r.presente ? `<span class="rmChip ok">vino</span>`
                                  : `<span class="rmChip">no marcó</span>`)}</td>
              ${RM.puedeEditar ? `<td>
                <button class="btn3" data-rm="rot-off" data-id="${r.user_id}"
                        data-nombre="${esc(r.nombre)}">Sacar</button>
              </td>` : ""}
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="rmNota">
      El turno no es un círculo fijo: le toca al que menos veces le tocó, y a
      igualdad al que hace más tiempo que no le toca. Quien faltó se salta sin
      quedar debiendo — mañana entra primero solo.
    </p>`;
}

// ─── Render general ──────────────────────────────────────────────────

function render_() {
  if (!RM.root || !RM.raw) return;

  const lotes = RM.raw.lotes || [];
  const abiertas = lotes.filter(l => l.estado !== "CERRADO");
  const cerradas = lotes.filter(l => l.estado === "CERRADO");
  const descuadres = lotes.filter(l => Number(l.descuadre) !== 0);
  const enProceso = lotes.reduce((a, l) => a + (l.en_proceso || 0), 0);
  const stockTotal = (RM.raw.stock || []).reduce((a, s) => a + (s.disponible || 0), 0);

  RM.root.innerHTML = `
    <div class="rmRoot">
      ${renderTurno_()}

      <div class="dashGrid" style="margin-bottom:14px;">
        <div class="statTile">
          <div class="statTile__label">📦 Cajas abiertas</div>
          <div class="statTile__value">${abiertas.length}</div>
        </div>
        <div class="statTile">
          <div class="statTile__label">🔩 Ramales trabajando</div>
          <div class="statTile__value" style="${enProceso > 0 ? "color:var(--warn)" : ""}">${enProceso}</div>
        </div>
        <div class="statTile">
          <div class="statTile__label">📥 Stock listo</div>
          <div class="statTile__value">${stockTotal}</div>
        </div>
        <div class="statTile">
          <div class="statTile__label">⚠️ No cuadran</div>
          <div class="statTile__value" style="${descuadres.length ? "color:var(--bad,#ef4444)" : ""}">${descuadres.length}</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <h3 style="margin:0 0 12px;"><span class="accentBar"></span>Cajas</h3>
        ${abiertas.length
          ? abiertas.map(renderLote_).join("")
          : `<div class="rmEmpty">
               <span class="rmEmpty__icon">📦</span>
               <strong>No hay cajas abiertas</strong>
               Cuando llegue una, regístrala arriba: el tiempo del encargado
               arranca en ese momento y no lo puede tocar él.
             </div>`}

        ${cerradas.length ? `
          <button type="button" class="btn3" style="margin-top:10px;width:100%;" data-rm="ver-cerradas">
            ${RM.verCerradas ? "Ocultar" : "Ver"} cajas cerradas (${cerradas.length})
          </button>
          <div id="rmCerradas" style="display:${RM.verCerradas ? "block" : "none"};margin-top:10px;">
            ${cerradas.map(renderLote_).join("")}
          </div>` : ""}
      </div>

      <!-- Comportamiento va antes que stock y rotación a propósito: es el
           parámetro que se quiere medir, no una nota al pie del panel. -->
      <div class="card" style="margin-bottom:12px;">
        <h3 style="margin:0 0 4px;"><span class="accentBar"></span>Comportamiento</h3>
        <p class="small" style="color:var(--muted);margin:0 0 14px;">
          Cómo trabaja cada ramalero, medido con lo que el sistema ya registra.
        </p>
        ${comportamientoHTML(RM.raw)}
      </div>

      <div class="card" style="margin-bottom:12px;">
        <h3 style="margin:0 0 4px;"><span class="accentBar"></span>Stock por marca</h3>
        <p class="small" style="color:var(--muted);margin:0 0 14px;">
          El total de cada marca es lo que está trabajando más lo que hay listo
          para entregar.
        </p>
        ${renderStock_()}
        <p class="rmNota">
          <strong>Disponibles</strong> son los que entraron al devolverse a
          oficina y salen cuando un técnico pide uno en su cola; ese saldo no se
          escribe a mano, es la suma del historial de movimientos.
          <strong>Trabajando</strong> son los que están repartidos y todavía no
          vuelven. Una caja registrada sin marca no suma a ninguna de las dos.
        </p>
      </div>

      <div class="card">
        <h3 style="margin:0 0 12px;"><span class="accentBar"></span>Rotación del turno</h3>
        ${renderRotacion_()}
      </div>
    </div>`;

  tickClocks_();
}

// ─── Cronómetros en vivo ─────────────────────────────────────────────
//  El número que corre es cosmético: el tiempo oficial lo calcula el
//  servidor con sus propios timestamps. Aquí solo se anima para que
//  quien mira sepa que la caja sigue abierta.
function tickClocks_() {
  for (const el of $$("[data-clock]")) {
    const l = RM.raw?.lotes?.find(x => x.lote_id === el.dataset.clock);
    if (!l?.desembalaje_inicio_at) { el.textContent = "—"; continue; }
    el.textContent = fmtDur_(Date.now() - new Date(l.desembalaje_inicio_at).getTime());
  }
}

// ─── Formularios ─────────────────────────────────────────────────────

function nuevaCaja_() {
  const rot = RM.raw?.rotacion || [];
  const sug = RM.raw?.sugerido_desembalaje;
  const sugRev = RM.raw?.sugerido_revision;

  const optsPersona = (marcarTurno) => rot.map(r => ({
    v: r.user_id,
    t: `${r.nombre}${marcarTurno && r.user_id === marcarTurno ? "  ← le toca" : ""}` +
       `${r.presente === false ? "  (no marcó hoy)" : ""}`,
  }));

  modal_({
    titulo: "Registrar caja",
    guardar: "Registrar y arrancar",
    cuerpo: `
      <div class="rmFieldRow">
        <div class="rmField">
          <label for="rmNqEquipos">¿Cuántos equipos trae?</label>
          <input id="rmNqEquipos" type="number" min="1" step="1" value="20" />
        </div>
        <div class="rmField">
          <label for="rmNqTipo">Tipo de ramal</label>
          <select id="rmNqTipo">
            <option value="">— sin especificar —</option>
            ${opciones_(TIPOS_RAMAL.map(t => ({ v: t, t })))}
          </select>
        </div>
      </div>

      <div class="rmField">
        <label for="rmNqEnc">Quién desembala</label>
        <select id="rmNqEnc">${opciones_(optsPersona(sug?.user_id), sug?.user_id)}</select>
        <span class="rmField__hint">
          Viene preseleccionado por turno. Si eliges a otro queda registrado
          que se cambió — no para reprochar nada, sino para que «se respeta la
          rotación» sea comprobable.
        </span>
      </div>

      <div class="rmField">
        <label for="rmNqRev">Quién revisa los equipos de conversión</label>
        <select id="rmNqRev">
          <option value="">— asignar después —</option>
          ${opciones_(optsPersona(sugRev?.user_id), sugRev?.user_id)}
        </select>
      </div>

      <label class="rmCheck">
        <input type="checkbox" id="rmNqIniciar" checked />
        <span class="rmCheck__txt">Arrancar el tiempo ahora
          <small>Es lo normal: el cronómetro lo abres tú al registrar la caja,
          no el ramalero. Destíldalo solo si la caja llegó pero nadie la va a
          tocar todavía.</small>
        </span>
      </label>

      <div class="rmField">
        <label for="rmNqNota">Nota (opcional)</label>
        <input id="rmNqNota" type="text" placeholder="Guía, proveedor, observación…" />
      </div>`,

    alGuardar: async (box) => {
      const cantidad = Number(box.querySelector("#rmNqEquipos").value);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        toast_("Pon un número de equipos válido.", "bad");
        return false;
      }
      const j = await accion_("/api/ramales/lote", {
        cantidad_equipos: cantidad,
        tipo_ramal: box.querySelector("#rmNqTipo").value || null,
        encargado_user_id: box.querySelector("#rmNqEnc").value || null,
        revisor_user_id: box.querySelector("#rmNqRev").value || null,
        nota: box.querySelector("#rmNqNota").value,
        iniciar: box.querySelector("#rmNqIniciar").checked,
      });
      if (!j) return false;
      toast_(`Caja ${j.lote?.codigo || ""} registrada.`);
      return true;
    },
  });
}

/**
 * Reparto: todas las filas a la vez, con el contador de lo que falta
 * actualizándose en vivo. Encadenar prompts hacía imposible corregir el
 * segundo número sin volver a empezar, que es justo lo que pasa cuando
 * repartes de verdad y alguien te dice «a mí ponme dos menos».
 */
function repartir_(loteId) {
  const l = RM.raw?.lotes?.find(x => x.lote_id === loteId);
  if (!l) return;
  const disponibles = l.sin_repartir;
  if (disponibles <= 0) return toast_("Esta caja ya está repartida entera.", "bad");

  const rot = RM.raw?.rotacion || [];
  if (!rot.length) return toast_("No hay ramaleros a quién repartir.", "bad");

  const yaTiene = new Map(
    (RM.raw?.repartos || [])
      .filter(r => r.lote_id === loteId)
      .map(r => [r.user_id, r.cantidad_asignada]),
  );

  // Sugerencia proporcional: parejo, y el resto a los primeros del turno.
  // Es un punto de partida, no una imposición — el supervisor escribe
  // encima. Quitarle la decisión es la forma más rápida de que deje de
  // usar la app.
  const base = Math.floor(disponibles / rot.length);
  const resto = disponibles % rot.length;

  modal_({
    titulo: `Repartir caja ${l.codigo}`,
    guardar: "Repartir",
    ancho: true,
    cuerpo: `
      <div class="rmAviso info">
        <strong>${disponibles} ramales por repartir</strong>
        Lo que asignes queda firmado a tu nombre. Cada quien solo podrá
        devolver hasta esa cantidad.
      </div>

      <div class="rmSplit">
        ${rot.map((r, i) => `
          <div class="rmSplit__row ${i === 0 ? "is-turno" : ""}">
            ${avatar_(r.nombre, true)}
            <span class="rmSplit__nom">
              ${esc(r.nombre)}
              <span class="rmSplit__sub">
                ${yaTiene.has(r.user_id) ? `ya tiene ${yaTiene.get(r.user_id)} de esta caja · ` : ""}
                ${r.presente === false ? "no marcó hoy" : `${r.veces_desembalaje} turnos`}
              </span>
            </span>
            <input type="number" min="0" step="1" data-rep="${r.user_id}"
                   value="${base + (i < resto ? 1 : 0)}" />
          </div>`).join("")}
      </div>

      <div class="rmSplit__tally" id="rmRepTally">
        <span>Sin asignar</span><b>0</b>
      </div>`,

    alAbrir: (box) => {
      const tally = box.querySelector("#rmRepTally");
      const inputs = [...box.querySelectorAll("[data-rep]")];
      const recalcular = () => {
        const suma = inputs.reduce((a, i) => a + (Number(i.value) || 0), 0);
        const falta = disponibles - suma;
        tally.querySelector("b").textContent = String(falta);
        tally.querySelector("span").textContent =
          falta === 0 ? "Cuadra exacto" : (falta > 0 ? "Sin asignar" : "Te pasaste por");
        tally.classList.toggle("is-mal", falta < 0);
        tally.classList.toggle("is-ok", falta === 0);
      };
      inputs.forEach(i => i.addEventListener("input", recalcular));
      recalcular();
    },

    alGuardar: async (box) => {
      const repartos = [...box.querySelectorAll("[data-rep]")]
        .map(i => ({ user_id: i.dataset.rep, cantidad: Number(i.value) || 0 }))
        .filter(r => r.cantidad > 0);

      if (!repartos.length) { toast_("No asignaste nada.", "bad"); return false; }
      const total = repartos.reduce((a, r) => a + r.cantidad, 0);
      if (total > disponibles) {
        toast_(`Estás repartiendo ${total} y solo quedan ${disponibles}.`, "bad");
        return false;
      }

      const j = await accion_(`/api/ramales/lote/${loteId}/repartir`, { repartos });
      if (!j) return false;
      toast_(`Repartidos ${total} ramales.`);
      return true;
    },
  });
}

/** Recibir la devolución de un reparto (supervisor) o del propio ramalero. */
function recibir_(repartoId) {
  const r = (RM.raw?.repartos || []).find(x => x.id === repartoId);
  if (!r) return;
  const l = RM.raw?.lotes?.find(x => x.lote_id === r.lote_id);

  modal_({
    titulo: `Recibir de ${r.nombre}`,
    guardar: "Recibir",
    cuerpo: `
      <div class="rmAviso info">
        <strong>Caja ${esc(l?.codigo || "")} · ${r.cantidad_asignada} asignados</strong>
        No se puede recibir más de lo que se le firmó. Si trae de más, algo
        está mal contado antes — y eso es lo que hay que revisar.
      </div>

      <div class="rmFieldRow">
        <div class="rmField">
          <label for="rmDevCant">Cuántos devuelve</label>
          <input id="rmDevCant" type="number" min="0" step="1"
                 max="${r.cantidad_asignada}" value="${r.cantidad_asignada}" />
        </div>
        <div class="rmField">
          <label for="rmDevRech">De esos, cuántos NO pasan</label>
          <input id="rmDevRech" type="number" min="0" step="1"
                 max="${r.cantidad_asignada}" value="0" />
        </div>
      </div>

      <div class="rmField">
        <label for="rmDevNota">Qué pasó con los rechazados</label>
        <textarea id="rmDevNota" placeholder="Obligatorio si rechazas alguno"></textarea>
        <span class="rmField__hint" id="rmDevHint">
          Solo entran al stock los que pasan. Los rechazados quedan en el
          historial del ramalero: es el contrapeso de la velocidad.
        </span>
      </div>`,

    alAbrir: (box) => {
      const cant = box.querySelector("#rmDevCant");
      const rech = box.querySelector("#rmDevRech");
      const hint = box.querySelector("#rmDevHint");
      const revisar = () => {
        const c = Number(cant.value) || 0;
        const x = Number(rech.value) || 0;
        if (x > c) {
          hint.textContent = "No puedes rechazar más de lo que devolvió.";
          hint.classList.add("is-mal");
        } else {
          hint.textContent = `${c - x} entran al stock, ${x} quedan como rechazados.`;
          hint.classList.remove("is-mal");
        }
      };
      cant.addEventListener("input", revisar);
      rech.addEventListener("input", revisar);
      revisar();
    },

    alGuardar: async (box) => {
      const devuelta = Number(box.querySelector("#rmDevCant").value) || 0;
      const rechazada = Number(box.querySelector("#rmDevRech").value) || 0;
      const nota = box.querySelector("#rmDevNota").value.trim();

      if (rechazada > devuelta) {
        toast_("No puedes rechazar más de lo que devolvió.", "bad");
        return false;
      }
      if (rechazada > 0 && !nota) {
        toast_("Escribe qué pasó con los rechazados.", "bad");
        return false;
      }

      const j = await accion_(`/api/ramales/reparto/${repartoId}/devolver`, {
        cantidad_devuelta: devuelta, cantidad_rechazada: rechazada, nota,
      });
      if (!j) return false;
      toast_(`${j.al_stock} ramales entraron al stock.`);
      return true;
    },
  });
}

function cerrarCaja_(loteId) {
  const l = RM.raw?.lotes?.find(x => x.lote_id === loteId);
  if (!l) return;
  const cuadra = l.en_proceso === 0 && l.sin_repartir === 0;

  modal_({
    titulo: `Cerrar caja ${l.codigo}`,
    guardar: "Cerrar caja",
    peligro: !cuadra,
    cuerpo: `
      ${cuadra
        ? `<div class="rmAviso info">
             <strong>La caja cuadra</strong>
             ${l.cantidad_equipos} equipos, ${l.devueltos} devueltos. Nada pendiente.
           </div>`
        : `<div class="rmAviso warn">
             <strong>Esta caja no cuadra</strong>
             ${l.en_proceso} sin devolver · ${l.sin_repartir} sin repartir.<br>
             Si la diferencia es merma (se rompió, se perdió), anótala abajo con
             el motivo. Un descuadre explicado es información; uno borrado es
             un agujero en el inventario.
           </div>`}

      ${!cuadra ? `
        <div class="rmField">
          <label for="rmCierreMerma">Merma (cuántos se perdieron o rompieron)</label>
          <input id="rmCierreMerma" type="number" min="0" step="1" value="0" />
        </div>
        <div class="rmField">
          <label for="rmCierreMotivo">Motivo de la merma</label>
          <textarea id="rmCierreMotivo" placeholder="Obligatorio si hay merma"></textarea>
        </div>
        <label class="rmCheck">
          <input type="checkbox" id="rmCierreForzar" />
          <span class="rmCheck__txt">Cerrar igual dejando el descuadre registrado
            <small>El faltante NO se borra: queda visible en el arqueo y en el
            historial de la caja para que se pueda investigar después.</small>
          </span>
        </label>` : ""}`,

    alGuardar: async (box) => {
      const merma = cuadra ? 0 : (Number(box.querySelector("#rmCierreMerma").value) || 0);
      const motivo = cuadra ? "" : box.querySelector("#rmCierreMotivo").value.trim();
      const forzar = cuadra ? false : box.querySelector("#rmCierreForzar").checked;

      if (merma > 0 && !motivo) {
        toast_("Una merma sin motivo escrito no se puede cerrar.", "bad");
        return false;
      }

      // El servidor vuelve a validar el arqueo: si sin `forzar` la caja no
      // cierra, responde NO_CUADRA y aquí se dice qué falta marcar.
      const j = await accion_(`/api/ramales/lote/${loteId}/cerrar`,
        { merma, merma_motivo: motivo || (forzar ? "Cerrada con descuadre" : ""), forzar },
        { silencioso: true });

      if (!j) {
        toast_("Sigue sin cuadrar: marca la casilla de abajo o ajusta la merma.", "bad");
        return false;
      }
      toast_(forzar ? "Caja cerrada con descuadre registrado." : "Caja cerrada.");
      return true;
    },
  });
}

function revision_(loteId) {
  const l = RM.raw?.lotes?.find(x => x.lote_id === loteId);
  if (!l) return;
  const rot = RM.raw?.rotacion || [];
  const sugRev = RM.raw?.sugerido_revision;
  const yaCerrada = !!l.revision_fin_at;

  modal_({
    titulo: `Revisión de equipos · ${l.codigo}`,
    guardar: yaCerrada ? "Actualizar" : (l.revisor ? "Cerrar revisión" : "Asignar revisor"),
    cuerpo: `
      <div class="rmField">
        <label for="rmRevQuien">Quién revisa</label>
        <select id="rmRevQuien">
          <option value="">— por turno (${esc(sugRev?.nombre || "nadie")}) —</option>
          ${opciones_(rot.map(r => ({ v: r.user_id, t: r.nombre })), l.revisor_user_id || "")}
        </select>
        <span class="rmField__hint">
          La revisión de los insumos de conversión rota aparte del desembalaje:
          son dos trabajos distintos dentro de la misma caja.
        </span>
      </div>

      <div class="rmFieldRow">
        <div class="rmField">
          <label for="rmRevConf">Equipos conformes</label>
          <input id="rmRevConf" type="number" min="0" step="1" value="${l.revision_conformes || 0}" />
        </div>
        <div class="rmField">
          <label for="rmRevObs">Observados</label>
          <input id="rmRevObs" type="number" min="0" step="1" value="${l.revision_observados || 0}" />
        </div>
      </div>

      <div class="rmField">
        <label for="rmRevNota">Qué se observó</label>
        <textarea id="rmRevNota" placeholder="Obligatorio si hay observados">${esc(l.revision_nota || "")}</textarea>
      </div>

      <label class="rmCheck">
        <input type="checkbox" id="rmRevCerrar" ${yaCerrada ? "checked" : ""} />
        <span class="rmCheck__txt">Dar la revisión por terminada
          <small>Al cerrarla se le suma el turno de revisión a quien la hizo.
          Déjalo sin marcar para solo asignar el revisor.</small>
        </span>
      </label>`,

    alGuardar: async (box) => {
      const quien = box.querySelector("#rmRevQuien").value;
      const cerrar = box.querySelector("#rmRevCerrar").checked;
      const obs = Number(box.querySelector("#rmRevObs").value) || 0;
      const nota = box.querySelector("#rmRevNota").value.trim();

      if (cerrar && obs > 0 && !nota) {
        toast_("Escribe qué se observó en esos equipos.", "bad");
        return false;
      }

      // Asignar primero: cerrar sin revisor no tiene a quién sumarle el turno.
      if (quien || !l.revisor_user_id) {
        const a = await accion_(`/api/ramales/lote/${loteId}/revision`, {
          accion: "asignar", revisor_user_id: quien || null,
        });
        if (!a) return false;
      }
      if (cerrar) {
        const c = await accion_(`/api/ramales/lote/${loteId}/revision`, {
          accion: "cerrar",
          conformes: Number(box.querySelector("#rmRevConf").value) || 0,
          observados: obs,
          nota,
        });
        if (!c) return false;
        toast_("Revisión cerrada.");
      } else {
        toast_("Revisor asignado.");
      }
      return true;
    },
  });
}

function ajusteStock_(tipo) {
  const s = (RM.raw?.stock || []).find(x => x.tipo_ramal === tipo);

  modal_({
    titulo: `Stock · ${tipo}`,
    guardar: "Guardar",
    cuerpo: `
      <div class="rmAviso info">
        <strong>Hay ${s?.disponible ?? 0} disponibles</strong>
        El saldo no se edita directamente: se corrige con un ajuste que queda
        en el historial. Un número cambiado que nadie sabe por qué es peor que
        el número equivocado — ese al menos se podía investigar.
      </div>

      <div class="rmFieldRow">
        <div class="rmField">
          <label for="rmAjCant">Diferencia (con signo)</label>
          <input id="rmAjCant" type="number" step="1" value="0" placeholder="5 o -3" />
          <span class="rmField__hint" id="rmAjHint">0 no cambia nada.</span>
        </div>
        <div class="rmField">
          <label for="rmAjMin">Punto de pedido</label>
          <input id="rmAjMin" type="number" min="0" step="1" value="${s?.stock_minimo ?? 0}" />
          <span class="rmField__hint">Por debajo de esto se marca «bajo mínimo».</span>
        </div>
      </div>

      <div class="rmField">
        <label for="rmAjNota">Motivo del ajuste</label>
        <textarea id="rmAjNota" placeholder="Conteo físico, rotura, hallazgo…"></textarea>
      </div>`,

    alAbrir: (box) => {
      const cant = box.querySelector("#rmAjCant");
      const hint = box.querySelector("#rmAjHint");
      cant.addEventListener("input", () => {
        const n = Number(cant.value) || 0;
        hint.textContent = n === 0
          ? "0 no cambia nada."
          : `Quedaría en ${(s?.disponible ?? 0) + n}.`;
      });
    },

    alGuardar: async (box) => {
      const cantidad = Number(box.querySelector("#rmAjCant").value) || 0;
      const minimo = Number(box.querySelector("#rmAjMin").value) || 0;
      const nota = box.querySelector("#rmAjNota").value.trim();

      if (cantidad !== 0 && !nota) {
        toast_("Un ajuste sin motivo no se guarda.", "bad");
        return false;
      }

      if (minimo !== (s?.stock_minimo ?? 0)) {
        const r = await accion_("/api/ramales/stock/minimo", {
          tipo_ramal: tipo, stock_minimo: minimo, ubicacion: s?.ubicacion || "",
        });
        if (!r) return false;
      }
      if (cantidad !== 0) {
        const r = await accion_("/api/ramales/stock/ajuste", {
          tipo_ramal: tipo, cantidad, nota,
        });
        if (!r) return false;
      }
      toast_("Stock actualizado.");
      return true;
    },
  });
}

// ─── Delegación de eventos ───────────────────────────────────────────

function onClick_(e) {
  const btn = e.target.closest("[data-rm]");
  if (!btn || !RM.root?.contains(btn)) return;
  const id = btn.dataset.id;

  switch (btn.dataset.rm) {
    case "nueva-caja": nuevaCaja_(); break;
    case "repartir":   repartir_(id); break;
    case "recibir":    recibir_(id); break;
    case "cerrar":     cerrarCaja_(id); break;
    case "revision":   revision_(id); break;
    case "stock":      ajusteStock_(btn.dataset.tipo); break;

    case "iniciar":
      accion_(`/api/ramales/lote/${id}/iniciar`).then(j => j && toast_("Tiempo corriendo."));
      break;

    case "cables":
      confirmar_(
        "Confirmar recepción de cables",
        `<div class="rmAviso warn">
           <strong>Esto cierra el tiempo oficial del desembalaje</strong>
           Confírmalo solo cuando tengas los cables principales en la mano.
           Si el ramalero avisó pero todavía no te los entregó, el reloj tiene
           que seguir corriendo — es la mitad de la medición que te toca a ti.
         </div>`,
        "Sí, los tengo",
        async () => {
          const j = await accion_(`/api/ramales/lote/${id}/cables`);
          if (!j) return false;
          toast_("Cables recibidos. Tiempo cerrado.");
        },
        false,
      );
      break;

    case "rot-off":
      confirmar_(
        "Sacar del turno",
        `<div class="rmAviso warn">
           <strong>${esc(btn.dataset.nombre || "Esta persona")} dejará de recibir turnos</strong>
           No se borra su historial ni sus cajas anteriores. Puedes volver a
           meterla ejecutando de nuevo el bloque de rotación, o desde la base.
         </div>`,
        "Sacar del turno",
        async () => {
          const j = await accion_("/api/ramales/rotacion", { user_id: id, activo: false });
          if (!j) return false;
          toast_("Fuera de la rotación.");
        },
      );
      break;

    case "ver-cerradas": {
      RM.verCerradas = !RM.verCerradas;
      const box = RM.root.querySelector("#rmCerradas");
      if (box) box.style.display = RM.verCerradas ? "block" : "none";
      btn.textContent = `${RM.verCerradas ? "Ocultar" : "Ver"} cajas cerradas`;
      break;
    }
  }
}

// ─── API pública ─────────────────────────────────────────────────────

/**
 * Monta el panel dentro de `container`. Idempotente: volver a llamarlo
 * re-monta sin duplicar timers ni listeners.
 */
export function mountRamalesPanel(container) {
  if (!container) return;
  unmountRamalesPanel();

  RM.root = container;
  const perfil = CORE.state.currentProfile;
  RM.email = String(perfil?.email || document.getElementById("email")?.value || "")
    .trim().toLowerCase();
  RM.puedeEditar = ["SUPERVISOR", "ADMIN"].includes(
    String(perfil?.rol || "").toUpperCase(),
  );

  // Esqueleto en vez de un texto: la vista no salta de altura al cargar.
  container.innerHTML = `
    <div class="rmRoot">
      <div class="rmSkel" style="height:86px;margin-bottom:14px;"></div>
      <div class="rmSkel" style="height:74px;margin-bottom:14px;"></div>
      <div class="rmSkel" style="height:190px;"></div>
    </div>`;
  container.addEventListener("click", onClick_);

  cargar_();
  startPoll("RAMALES_PANEL", cargar_, { immediate: false, cfgKey: "POLL_RAMALES_MS" });
  RM.clockTimer = setInterval(tickClocks_, 1000);
}

/** Desmonta: para los timers, cierra el modal y suelta el DOM. */
export function unmountRamalesPanel() {
  stopPoll("RAMALES_PANEL");
  if (RM.clockTimer) clearInterval(RM.clockTimer);
  RM.clockTimer = null;
  document.getElementById("rmModal")?.remove();
  RM.root?.removeEventListener("click", onClick_);
  RM.root = null;
  RM.raw = null;
}
