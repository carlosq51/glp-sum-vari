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
// UNA CAJA PUEDE TRAER VARIAS MARCAS
// ──────────────────────────────────
// «15 Jetour y 10 V3» es UNA caja. Antes había que registrarla como dos,
// con dos códigos y dos relojes para un mismo camión, y el turno se
// gastaba dos veces. Ahora la caja tiene líneas: el formulario de
// registro empieza con una y se agregan las que hagan falta.
//
// EL REPARTO ES UNA MATRIZ, NO UNA COLA DE PREGUNTAS
// ─────────────────────────────────────────────────
// Repartir es mirar a la gente que vino y decidir en voz alta. Una fila
// por ramalero, una columna por marca, y abajo cuánto falta de cada una
// actualizándose mientras escribes. Con prompts encadenados te
// equivocabas en el segundo número y ya no podías volver; con una
// columna por marca no hace falta abrir el modal tres veces para una
// caja de tres marcas.
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

/** Primer nombre — en la cabecera de una matriz «Juan Carlos» no cabe. */
function corto_(nombre) {
  return String(nombre || "").trim().split(/\s+/)[0] || "—";
}

function opciones_(arr, sel) {
  return arr.map(o =>
    `<option value="${esc(o.v)}"${o.v === sel ? " selected" : ""}>${esc(o.t)}</option>`,
  ).join("");
}

/** Las líneas de una caja, tal como las devuelve el panel. */
function itemsDe_(loteId) {
  return (RM.raw?.items || []).filter(i => i.lote_id === loteId);
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
 * @param {string} [o.sub]       línea de contexto bajo el título
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
        <span class="modalTitle">${esc(o.titulo)}${
          o.sub ? `<small class="rmModalSub">${esc(o.sub)}</small>` : ""}</span>
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
  const s = RM.raw?.sugerido;
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
            <div class="rmTurno__label">Turno de revisión</div>
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
          <div class="rmTurno__label">Le toca la próxima caja</div>
          <div class="rmTurno__quien">
            ${avatar_(s.nombre)}
            <div>
              <div class="rmTurno__nombre">${esc(s.nombre)}</div>
              <div class="rmTurno__meta">
                ${s.veces} turno${s.veces === 1 ? "" : "s"} ·
                última vez ${s.ultima_vez ? fmtFecha_(s.ultima_vez) : "nunca"}
              </div>
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
    RECIBIDO:  ["", "Recibida"],
    REVISANDO: ["warn", "Revisando"],
    REVISADO:  ["info", "Revisada"],
    REPARTIDO: ["ok", "Repartida"],
    CERRADO:   ["", "Cerrada"],
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
    <div class="rmBar" title="verde: devuelto · ámbar: en la mesa · gris: sin repartir">
      <span class="rmBar__seg rmBar__seg--dev"  style="width:${pct(l.devueltos)}"></span>
      <span class="rmBar__seg rmBar__seg--proc" style="width:${pct(l.en_proceso)}"></span>
      <span class="rmBar__seg rmBar__seg--sin"  style="width:${pct(Math.max(0, l.sin_repartir))}"></span>
      ${descuadre ? `<span class="rmBar__seg rmBar__seg--mal" style="width:${pct(Math.abs(l.descuadre))}"></span>` : ""}
    </div>`;
}

/**
 * Lo que trajo la caja, marca por marca, con lo que falta repartir de
 * cada una. En una caja mixta el total no dice nada: 25 repartidos de 25
 * puede ser 16 Jetour y 9 V3 cuando llegaron 15 y 10.
 */
function renderMarcas_(loteId) {
  const items = itemsDe_(loteId);
  if (!items.length) {
    return `<div class="rmMarcasLinea rmMarcasLinea--vacia">
      Sin marcas anotadas · el stock por marca no cuenta esta caja
    </div>`;
  }

  return `
    <div class="rmMarcasLinea">
      ${items.map(i => {
        const falta = i.sin_repartir;
        const cls = falta < 0 ? "is-mal" : (falta > 0 ? "is-pend" : "is-ok");
        return `
          <span class="rmMarcaChip ${cls}" title="${esc(i.tipo_ramal)}: ${i.cantidad} en la caja, ${i.repartidos} repartidos, ${i.devueltos} devueltos">
            <b>${i.cantidad}</b> ${esc(i.tipo_ramal)}
            <i>${falta === 0 ? "repartida" : (falta > 0 ? `faltan ${falta}` : `${-falta} de más`)}</i>
          </span>`;
      }).join("")}
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

/**
 * Los repartos de la caja, agrupados POR PERSONA. Con marcas, un
 * ramalero tiene varias filas en la base; en pantalla es una persona con
 * su lista — que es como se le habla («Luis, ¿y los tuyos?»).
 */
function renderRepartosDe_(loteId, cerrado) {
  const reps = (RM.raw?.repartos || []).filter(r => r.lote_id === loteId);
  if (!reps.length) return "";

  const porUser = new Map();
  for (const r of reps) {
    const arr = porUser.get(r.user_id) || { nombre: r.nombre, filas: [] };
    arr.filas.push(r);
    porUser.set(r.user_id, arr);
  }

  return `<div class="rmRepartos">${[...porUser.values()].map(p => {
    const pendientes = p.filas.filter(f => !f.devuelto_at);
    const asignados = p.filas.reduce((a, f) => a + (f.cantidad_asignada || 0), 0);
    const devueltos = p.filas.reduce((a, f) => a + (f.cantidad_devuelta || 0), 0);
    const rechazados = p.filas.reduce((a, f) => a + (f.cantidad_rechazada || 0), 0);

    // Desde este panel solo recibe el supervisor. El ramalero devuelve lo
    // suyo desde su propia vista (views/ramales/mi-turno.js), donde ve
    // únicamente sus repartos.
    const puedeRecibir = pendientes.length && !cerrado && RM.puedeEditar;

    return `
      <div class="rmReparto ${pendientes.length ? "is-pendiente" : ""}">
        ${avatar_(p.nombre, true)}
        <span class="rmReparto__nombre">${esc(p.nombre)}</span>
        <span class="rmReparto__cifra">
          ${p.filas.map(f => `
            <span class="rmReparto__linea ${f.devuelto_at ? "" : "is-abierta"}">
              ${f.cantidad_asignada} ${esc(f.tipo_ramal || "s/marca")}${
                f.devuelto_at ? ` → ${f.cantidad_devuelta}${f.cantidad_rechazada ? ` (${f.cantidad_rechazada} ✕)` : ""}` : ""}
            </span>`).join("")}
        </span>
        <span class="rmReparto__acc">
          ${pendientes.length
            ? `<span class="rmChip warn">${pendientes.length} sin devolver</span>`
            : `<span class="rmChip ok">${devueltos}/${asignados}${rechazados ? ` · ${rechazados} ✕` : ""}</span>`}
          ${puedeRecibir
            ? `<button class="btn3" data-rm="recibir" data-lote="${loteId}" data-user="${p.filas[0].user_id}">
                 ${icon("trayIn", 13)} Recibir
               </button>` : ""}
        </span>
      </div>`;
  }).join("")}</div>`;
}

function renderLote_(l) {
  const corriendo = l.estado === "REVISANDO";
  const cerrado = l.estado === "CERRADO";
  const descuadre = Number(l.descuadre) !== 0;

  // El reloj: si corre, el cliente lo anima desde el timestamp del
  // servidor. Si ya cerró, se muestra el tiempo oficial
  // (registro de la caja → el supervisor la recibió revisada).
  const clock = corriendo
    ? `<span class="rmClock is-corriendo" data-clock="${l.lote_id}">—</span>`
    : (l.revision_min != null
        ? `<span class="rmClock" title="Tiempo oficial: de que llegó la caja a que el supervisor la recibió revisada">${fmtMin_(l.revision_min)}</span>`
        : "");

  const acc = [];
  if (RM.puedeEditar) {
    if (l.estado === "RECIBIDO") {
      acc.push(`<button class="btn3 rmBtn--primary" data-rm="iniciar" data-id="${l.lote_id}">${icon("timer", 14)} Arrancar tiempo</button>`);
    }
    if (corriendo) {
      acc.push(`<button class="btn3 rmBtn--primary" data-rm="recibir-caja" data-id="${l.lote_id}">${icon("trayIn", 14)} Recibí la caja revisada</button>`);
    }
    if (["REVISADO", "REPARTIDO"].includes(l.estado) && l.sin_repartir > 0) {
      acc.push(`<button class="btn3 rmBtn--primary" data-rm="repartir" data-id="${l.lote_id}">${icon("users", 14)} Repartir</button>`);
    }
    if (!cerrado) {
      acc.push(`<button class="btn3" data-rm="editar-caja" data-id="${l.lote_id}">${icon("listChecks", 14)} Qué trajo</button>`);
      acc.push(`<button class="btn3" data-rm="cerrar" data-id="${l.lote_id}">${icon("shieldCheck", 14)} Cerrar caja</button>`);
    }
  }

  return `
    <div class="rmLote ${descuadre ? "is-descuadre" : ""}" data-estado="${l.estado}">
      <div class="rmLote__head">
        <span class="rmLote__codigo">${esc(l.codigo || "—")}</span>
        ${chipEstado_(l)}
        ${clock}
        ${corriendo && l.revision_aviso_at
          ? `<span class="rmChip info" title="El encargado avisó que terminó; el reloj cierra cuando tú recibas la caja">avisó que terminó</span>`
          : ""}
        ${l.revision_observados > 0
          ? `<span class="rmChip warn" title="${esc(l.revision_nota || "")}">${l.revision_observados} observados</span>`
          : ""}
        ${l.turno_pisado ? `<span class="rmChip pisado"
            title="El supervisor eligió a alguien distinto de quien tenía el turno">turno cambiado</span>` : ""}

        <div class="rmLote__sub">
          <span>${fmtFecha_(l.fecha)}</span>
          <span>·</span>
          <span>${l.encargado ? `revisa ${esc(l.encargado)}` : "sin encargado"}</span>
        </div>
      </div>

      ${renderMarcas_(l.lote_id)}
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
              <td class="num">${r.veces}</td>
              <td>${r.ultima_vez ? fmtFecha_(r.ultima_vez) : "nunca"}</td>
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
               Cuando llegue una, regístrala arriba con lo que trae de cada
               marca: el tiempo del encargado arranca en ese momento y no lo
               puede tocar él.
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
          vuelven. Un reparto sin marca no suma a ninguna de las dos.
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
    if (!l?.revision_inicio_at) { el.textContent = "—"; continue; }
    el.textContent = fmtDur_(Date.now() - new Date(l.revision_inicio_at).getTime());
  }
}

// ─── Editor de las líneas de una caja ────────────────────────────────
//  Comparte el registro de caja nueva y la corrección de una existente:
//  es el mismo gesto («¿qué trae esta caja?») y no tiene por qué
//  aprenderse dos veces.

function filaItem_(tipo = "", cantidad = "") {
  return `
    <div class="rmItemRow">
      <select class="rmItemTipo">
        <option value="">— elige la marca —</option>
        ${opciones_(TIPOS_RAMAL.map(t => ({ v: t, t })), tipo)}
      </select>
      <input class="rmItemCant" type="number" min="1" step="1"
             placeholder="cuántos" value="${cantidad === "" ? "" : esc(String(cantidad))}" />
      <button type="button" class="rmItemDel" title="Quitar esta marca">✕</button>
    </div>`;
}

/**
 * Engancha el editor de líneas dentro de un modal ya abierto: agregar,
 * quitar y el total vivo. Devuelve un lector de lo que quedó escrito.
 */
function engancharItems_(box) {
  const lista = box.querySelector("#rmItems");
  const total = box.querySelector("#rmItemsTotal");

  const usadas = () => [...lista.querySelectorAll(".rmItemTipo")].map(s => s.value).filter(Boolean);

  const recalcular = () => {
    const n = [...lista.querySelectorAll(".rmItemCant")]
      .reduce((a, i) => a + Math.max(0, Number(i.value) || 0), 0);
    total.textContent = String(n);
    // La misma marca dos veces se suma en el servidor, pero verla
    // repetida en el formulario parece un error del que escribe.
    const vistas = new Set();
    for (const s of lista.querySelectorAll(".rmItemTipo")) {
      const dup = s.value && vistas.has(s.value);
      s.closest(".rmItemRow").classList.toggle("is-dup", dup);
      if (s.value) vistas.add(s.value);
    }
    // Con una sola fila, quitarla dejaría la caja sin nada que decir.
    const filas = lista.querySelectorAll(".rmItemRow");
    filas.forEach(f => { f.querySelector(".rmItemDel").disabled = filas.length === 1; });
  };

  lista.addEventListener("input", recalcular);
  lista.addEventListener("change", recalcular);
  lista.addEventListener("click", (e) => {
    if (!e.target.closest(".rmItemDel")) return;
    if (lista.querySelectorAll(".rmItemRow").length <= 1) return;
    e.target.closest(".rmItemRow").remove();
    recalcular();
  });

  box.querySelector("#rmItemsAdd").addEventListener("click", () => {
    // La siguiente marca que todavía no está: una fila nueva ya elegida
    // ahorra el desplegable en el caso normal (dos o tres marcas).
    const libre = TIPOS_RAMAL.find(t => !usadas().includes(t)) || "";
    lista.insertAdjacentHTML("beforeend", filaItem_(libre, ""));
    recalcular();
    lista.lastElementChild.querySelector(".rmItemCant").focus();
  });

  recalcular();

  return () => [...lista.querySelectorAll(".rmItemRow")]
    .map(f => ({
      tipo_ramal: f.querySelector(".rmItemTipo").value,
      cantidad: Number(f.querySelector(".rmItemCant").value) || 0,
    }))
    .filter(i => i.tipo_ramal && i.cantidad > 0);
}

function bloqueItems_(items) {
  const filas = items.length
    ? items.map(i => filaItem_(i.tipo_ramal, i.cantidad)).join("")
    : filaItem_("", "");

  return `
    <div class="rmField">
      <label>¿Qué trae la caja?</label>
      <div id="rmItems" class="rmItems">${filas}</div>
      <div class="rmItemsFoot">
        <button type="button" class="btn3" id="rmItemsAdd">＋ Otra marca</button>
        <span class="rmItemsTotal">Total <b id="rmItemsTotal">0</b> equipos</span>
      </div>
      <span class="rmField__hint">
        Una caja puede traer varias marcas: 15 Jetour y 10 V3 son una sola
        caja, no dos. Agrega una línea por marca — el reparto y el stock
        después salen de aquí.
      </span>
    </div>`;
}

// ─── Formularios ─────────────────────────────────────────────────────

function nuevaCaja_() {
  const rot = RM.raw?.rotacion || [];
  const sug = RM.raw?.sugerido;

  const optsPersona = rot.map(r => ({
    v: r.user_id,
    t: `${r.nombre}${r.user_id === sug?.user_id ? "  ← le toca" : ""}` +
       `${r.presente === false ? "  (no marcó hoy)" : ""}`,
  }));

  modal_({
    titulo: "Registrar caja",
    sub: "Lo que trae y quién la revisa",
    guardar: "Registrar y arrancar",
    cuerpo: `
      ${bloqueItems_([])}

      <div class="rmField">
        <label for="rmNqEnc">Quién revisa la caja</label>
        <select id="rmNqEnc">${opciones_(optsPersona, sug?.user_id)}</select>
        <span class="rmField__hint">
          Viene preseleccionado por turno. Si eliges a otro queda registrado
          que se cambió — no para reprochar nada, sino para que «se respeta la
          rotación» sea comprobable.
        </span>
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

    alAbrir: (box) => { box._leerItems = engancharItems_(box); },

    alGuardar: async (box) => {
      const items = box._leerItems();
      if (!items.length) {
        toast_("Dile qué trae la caja: al menos una marca con su cantidad.", "bad");
        return false;
      }
      const j = await accion_("/api/ramales/lote", {
        items,
        encargado_user_id: box.querySelector("#rmNqEnc").value || null,
        nota: box.querySelector("#rmNqNota").value,
        iniciar: box.querySelector("#rmNqIniciar").checked,
      });
      if (!j) return false;
      const total = items.reduce((a, i) => a + i.cantidad, 0);
      toast_(`Caja ${j.lote?.codigo || ""} registrada · ${total} equipos.`);
      return true;
    },
  });
}

/** Corregir lo que trajo una caja ya registrada. */
function editarCaja_(loteId) {
  const l = RM.raw?.lotes?.find(x => x.lote_id === loteId);
  if (!l) return;
  const items = itemsDe_(loteId).map(i => ({ tipo_ramal: i.tipo_ramal, cantidad: i.cantidad }));

  modal_({
    titulo: `Qué trajo la caja ${l.codigo}`,
    guardar: "Guardar",
    cuerpo: `
      <div class="rmAviso info">
        <strong>Se abrió la caja y trae otra cosa</strong>
        Corrígelo aquí en vez de borrar la caja: lo que ya se repartió sigue
        firmado. Lo único que no se puede es dejar una marca por debajo de lo
        que ya se repartió de ella — ahí el error está en el reparto o en el
        conteo, y cambiar el origen borra la pista de cuál de los dos fue.
      </div>
      ${bloqueItems_(items)}`,

    alAbrir: (box) => { box._leerItems = engancharItems_(box); },

    alGuardar: async (box) => {
      const nuevos = box._leerItems();
      if (!nuevos.length) {
        toast_("La caja tiene que traer algo.", "bad");
        return false;
      }
      const j = await accion_(`/api/ramales/lote/${loteId}/items`, { items: nuevos });
      if (!j) return false;
      toast_(`Caja actualizada · ${j.cantidad_equipos} equipos.`);
      return true;
    },
  });
}

/**
 * Reparto: una fila por ramalero, una columna por marca de la caja, y
 * abajo cuánto falta de cada una actualizándose mientras escribes.
 *
 * Antes era un input por persona y una sola cantidad, así que una caja
 * de tres marcas obligaba a abrir el modal tres veces sin saber, dentro
 * de cada pasada, qué se había hecho en la anterior. Con la matriz el
 * reparto entero se ve de un golpe y se corrige donde está el error, que
 * es como se reparte de verdad cuando alguien dice «a mí ponme dos menos».
 */
function repartir_(loteId) {
  const l = RM.raw?.lotes?.find(x => x.lote_id === loteId);
  if (!l) return;

  // Una caja sin marcas anotadas (registrada antes de que existieran las
  // líneas) se reparte igual, en una sola columna sin marca. Lo que
  // devuelva de ahí no suma a ningún saldo por marca — por eso la
  // tarjeta empuja a arreglarla con «Qué trajo», pero no se bloquea el
  // reparto de una caja que ya está sobre la mesa.
  const lineas = itemsDe_(loteId);
  const items = lineas.length
    ? lineas.filter(i => i.sin_repartir > 0)
    : (l.sin_repartir > 0
        ? [{ tipo_ramal: "", sin_repartir: l.sin_repartir, cantidad: l.cantidad_equipos }]
        : []);
  if (!items.length) return toast_("Esta caja ya está repartida entera.", "bad");

  const rot = RM.raw?.rotacion || [];
  if (!rot.length) return toast_("No hay ramaleros a quién repartir.", "bad");

  // Lo que cada quien ya tiene de esta caja, por marca: repartir dos
  // veces el mismo día sin ver la primera vuelta es como se duplica.
  const yaTiene = new Map();
  for (const r of (RM.raw?.repartos || []).filter(r => r.lote_id === loteId)) {
    yaTiene.set(`${r.user_id}|${r.tipo_ramal || ""}`, r.cantidad_asignada);
  }
  const yaTotal = new Map();
  for (const [k, v] of yaTiene) {
    const uid = k.split("|")[0];
    yaTotal.set(uid, (yaTotal.get(uid) || 0) + v);
  }

  const celda = (uid, tipo) => `
    <td>
      <input type="number" min="0" step="1" class="rmMatriz__in"
             data-uid="${esc(uid)}" data-tipo="${esc(tipo)}" value="0" />
    </td>`;

  modal_({
    titulo: `Repartir caja ${l.codigo}`,
    sub: items.map(i => `${i.sin_repartir} ${i.tipo_ramal || "sin marca"}`).join(" · "),
    guardar: "Repartir",
    ancho: true,
    cuerpo: `
      <div class="rmAviso info">
        <strong>Lo que asignes queda firmado a tu nombre</strong>
        Cada quien solo podrá devolver hasta esa cantidad, y de esa marca.
      </div>

      <div class="rmMatrizAcc">
        <button type="button" class="btn3" data-mat="parejo">Repartir parejo</button>
        <button type="button" class="btn3" data-mat="limpiar">Limpiar</button>
        <span class="rmMatrizAcc__hint">
          «Parejo» reparte entre los que marcaron hoy; después lo editas.
        </span>
      </div>

      <div class="rmMatrizWrap">
        <table class="rmMatriz">
          <thead>
            <tr>
              <th class="rmMatriz__quien">Ramalero</th>
              ${items.map(i => `
                <th>${esc(i.tipo_ramal || "Sin marca")}<small>${i.sin_repartir} por repartir</small></th>`).join("")}
              <th class="rmMatriz__tot">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rot.map((r, idx) => `
              <tr class="${idx === 0 ? "is-turno" : ""} ${r.presente === false ? "is-ausente" : ""}">
                <th class="rmMatriz__quien">
                  ${avatar_(r.nombre, true)}
                  <span>
                    ${esc(corto_(r.nombre))}
                    <small>${r.presente === false ? "no marcó hoy"
                      : (yaTotal.get(r.user_id) ? `ya tiene ${yaTotal.get(r.user_id)}` : `${r.veces} turnos`)}</small>
                  </span>
                </th>
                ${items.map(i => celda(r.user_id, i.tipo_ramal)).join("")}
                <td class="rmMatriz__tot" data-tot="${esc(r.user_id)}">0</td>
                <td><button type="button" class="rmMatriz__todo" data-todo="${esc(r.user_id)}"
                            title="Darle a esta persona todo lo que falta">todo</button></td>
              </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr>
              <th class="rmMatriz__quien">Sin asignar</th>
              ${items.map(i => `
                <td class="rmMatriz__falta" data-falta="${esc(i.tipo_ramal)}"
                    data-max="${i.sin_repartir}">${i.sin_repartir}</td>`).join("")}
              <td class="rmMatriz__tot" data-falta-total>${items.reduce((a, i) => a + i.sin_repartir, 0)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>`,

    alAbrir: (box) => {
      const inputs = [...box.querySelectorAll(".rmMatriz__in")];
      const valor = (i) => Math.max(0, Number(i.value) || 0);

      const recalcular = () => {
        // Falta por marca
        let faltaTotal = 0;
        for (const td of box.querySelectorAll("[data-falta]")) {
          const tipo = td.dataset.falta;
          const max = Number(td.dataset.max);
          const suma = inputs.filter(i => i.dataset.tipo === tipo).reduce((a, i) => a + valor(i), 0);
          const falta = max - suma;
          td.textContent = falta;
          td.classList.toggle("is-mal", falta < 0);
          td.classList.toggle("is-ok", falta === 0);
          faltaTotal += falta;
        }
        box.querySelector("[data-falta-total]").textContent = faltaTotal;

        // Total por persona
        for (const td of box.querySelectorAll("[data-tot]")) {
          const uid = td.dataset.tot;
          const suma = inputs.filter(i => i.dataset.uid === uid).reduce((a, i) => a + valor(i), 0);
          td.textContent = suma;
          td.classList.toggle("is-ok", suma > 0);
        }
      };

      box.addEventListener("input", (e) => {
        if (e.target.classList.contains("rmMatriz__in")) recalcular();
      });

      box.addEventListener("click", (e) => {
        const parejo = e.target.closest("[data-mat='parejo']");
        const limpiar = e.target.closest("[data-mat='limpiar']");
        const todo = e.target.closest("[data-todo]");
        if (!parejo && !limpiar && !todo) return;
        e.preventDefault();

        if (limpiar) {
          inputs.forEach(i => { i.value = 0; });
        } else if (parejo) {
          // Entre quienes vinieron; si no hay asistencia registrada,
          // entre todos. El resto se le da a los primeros del turno, que
          // ya vienen ordenados por «a quién le toca antes».
          const gente = rot.filter(r => r.presente !== false).map(r => r.user_id);
          const objetivo = gente.length ? gente : rot.map(r => r.user_id);
          inputs.forEach(i => { i.value = 0; });
          for (const it of items) {
            const base = Math.floor(it.sin_repartir / objetivo.length);
            const resto = it.sin_repartir % objetivo.length;
            objetivo.forEach((uid, k) => {
              const inp = inputs.find(i => i.dataset.uid === uid && i.dataset.tipo === it.tipo_ramal);
              if (inp) inp.value = base + (k < resto ? 1 : 0);
            });
          }
        } else if (todo) {
          const uid = todo.dataset.todo;
          for (const it of items) {
            const otros = inputs
              .filter(i => i.dataset.tipo === it.tipo_ramal && i.dataset.uid !== uid)
              .reduce((a, i) => a + valor(i), 0);
            const inp = inputs.find(i => i.dataset.uid === uid && i.dataset.tipo === it.tipo_ramal);
            if (inp) inp.value = Math.max(0, it.sin_repartir - otros);
          }
        }
        recalcular();
      });

      recalcular();
    },

    alGuardar: async (box) => {
      const repartos = [...box.querySelectorAll(".rmMatriz__in")]
        .map(i => ({
          user_id: i.dataset.uid,
          tipo_ramal: i.dataset.tipo,
          cantidad: Number(i.value) || 0,
        }))
        .filter(r => r.cantidad > 0);

      if (!repartos.length) { toast_("No asignaste nada.", "bad"); return false; }

      // Se valida por marca, igual que el servidor: en una caja mixta el
      // total puede cuadrar y una marca estar repartida de más.
      for (const it of items) {
        const suma = repartos
          .filter(r => r.tipo_ramal === it.tipo_ramal)
          .reduce((a, r) => a + r.cantidad, 0);
        if (suma > it.sin_repartir) {
          toast_(`De ${it.tipo_ramal || "la caja"} estás repartiendo ${suma} y solo quedan ${it.sin_repartir}.`, "bad");
          return false;
        }
      }

      const j = await accion_(`/api/ramales/lote/${loteId}/repartir`, { repartos });
      if (!j) return false;
      toast_(`Repartidos ${repartos.reduce((a, r) => a + r.cantidad, 0)} ramales.`);
      return true;
    },
  });
}

/**
 * Recibir la devolución de una persona: todas sus marcas abiertas de esa
 * caja en un solo formulario. Antes era un modal por fila de reparto, o
 * sea uno por marca — el ramalero llega una vez con todo.
 */
function recibir_(loteId, userId) {
  const filas = (RM.raw?.repartos || [])
    .filter(r => r.lote_id === loteId && r.user_id === userId && !r.devuelto_at);
  if (!filas.length) return;
  const l = RM.raw?.lotes?.find(x => x.lote_id === loteId);

  modal_({
    titulo: `Recibir de ${filas[0].nombre}`,
    sub: `Caja ${l?.codigo || ""}`,
    guardar: "Recibir",
    cuerpo: `
      <div class="rmAviso info">
        <strong>No se puede recibir más de lo que se le firmó</strong>
        Si trae de más, algo está mal contado antes — y eso es lo que hay que
        revisar, no el número de aquí.
      </div>

      ${filas.map(f => `
        <div class="rmDevRow" data-rep="${f.id}">
          <div class="rmDevRow__marca">
            ${esc(f.tipo_ramal || "sin marca")}
            <small>${f.cantidad_asignada} asignados</small>
          </div>
          <div class="rmField">
            <label>Devuelve</label>
            <input type="number" min="0" step="1" class="rmDevCant"
                   max="${f.cantidad_asignada}" value="${f.cantidad_asignada}" />
          </div>
          <div class="rmField">
            <label>De esos, no pasan</label>
            <input type="number" min="0" step="1" class="rmDevRech"
                   max="${f.cantidad_asignada}" value="0" />
          </div>
        </div>`).join("")}

      <div class="rmField">
        <label for="rmDevNota">Qué pasó con los rechazados</label>
        <textarea id="rmDevNota" placeholder="Obligatorio si rechazas alguno"></textarea>
        <span class="rmField__hint" id="rmDevHint">
          Solo entran al stock los que pasan, y a la marca con que se firmaron.
          Los rechazados quedan en el historial del ramalero: es el contrapeso
          de la velocidad.
        </span>
      </div>`,

    alAbrir: (box) => {
      const hint = box.querySelector("#rmDevHint");
      const revisar = () => {
        let stock = 0, malos = 0, error = "";
        for (const row of box.querySelectorAll(".rmDevRow")) {
          const c = Number(row.querySelector(".rmDevCant").value) || 0;
          const x = Number(row.querySelector(".rmDevRech").value) || 0;
          if (x > c) error = "No puedes rechazar más de lo que devolvió.";
          stock += Math.max(0, c - x);
          malos += x;
        }
        hint.textContent = error || `${stock} entran al stock, ${malos} quedan como rechazados.`;
        hint.classList.toggle("is-mal", !!error);
      };
      box.addEventListener("input", revisar);
      revisar();
    },

    alGuardar: async (box) => {
      const nota = box.querySelector("#rmDevNota").value.trim();
      const envios = [...box.querySelectorAll(".rmDevRow")].map(row => ({
        id: row.dataset.rep,
        devuelta: Number(row.querySelector(".rmDevCant").value) || 0,
        rechazada: Number(row.querySelector(".rmDevRech").value) || 0,
      }));

      if (envios.some(e => e.rechazada > e.devuelta)) {
        toast_("No puedes rechazar más de lo que devolvió.", "bad");
        return false;
      }
      if (envios.some(e => e.rechazada > 0) && !nota) {
        toast_("Escribe qué pasó con los rechazados.", "bad");
        return false;
      }

      // Una llamada por marca: cada fila de reparto se cierra contra lo
      // que se le firmó de ESA marca, que es lo que el servidor valida.
      let alStock = 0;
      for (const e of envios) {
        const j = await accion_(`/api/ramales/reparto/${e.id}/devolver`, {
          cantidad_devuelta: e.devuelta, cantidad_rechazada: e.rechazada, nota,
        });
        if (!j) return false;
        alStock += j.al_stock || 0;
      }
      toast_(`${alStock} ramales entraron al stock.`);
      return true;
    },
  });
}

/** El supervisor confirma que recibió la caja revisada: cierra el reloj. */
function recibirCaja_(loteId) {
  const l = RM.raw?.lotes?.find(x => x.lote_id === loteId);
  if (!l) return;

  modal_({
    titulo: `Recibir la caja ${l.codigo}`,
    sub: l.encargado ? `Revisada por ${l.encargado}` : "",
    guardar: "Sí, la tengo",
    cuerpo: `
      <div class="rmAviso warn">
        <strong>Esto cierra el tiempo oficial de la revisión</strong>
        Confírmalo solo cuando tengas la caja revisada delante. Si el ramalero
        avisó pero todavía no te la entrega, el reloj tiene que seguir
        corriendo — es la mitad de la medición que te toca a ti.
      </div>

      <div class="rmFieldRow">
        <div class="rmField">
          <label for="rmRecConf">Equipos conformes</label>
          <input id="rmRecConf" type="number" min="0" step="1" value="${l.cantidad_equipos}" />
        </div>
        <div class="rmField">
          <label for="rmRecObs">Observados</label>
          <input id="rmRecObs" type="number" min="0" step="1" value="0" />
        </div>
      </div>

      <div class="rmField">
        <label for="rmRecNota">Qué se observó</label>
        <textarea id="rmRecNota" placeholder="Obligatorio si hay observados"></textarea>
        <span class="rmField__hint">
          Un equipo observado que nadie escribió es un reclamo al proveedor que
          ya no se puede hacer.
        </span>
      </div>`,

    alGuardar: async (box) => {
      const obs = Number(box.querySelector("#rmRecObs").value) || 0;
      const nota = box.querySelector("#rmRecNota").value.trim();
      if (obs > 0 && !nota) {
        toast_("Escribe qué se observó en esos equipos.", "bad");
        return false;
      }
      const j = await accion_(`/api/ramales/lote/${loteId}/recibir`, {
        conformes: Number(box.querySelector("#rmRecConf").value) || 0,
        observados: obs,
        nota,
      });
      if (!j) return false;
      toast_("Caja recibida. Tiempo cerrado.");
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
          <textarea id="rmCierreMotivo" placeholder="Obligatorio si hay merma. Di también de qué marca: en una caja mixta el sistema no lo puede adivinar."></textarea>
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
    case "nueva-caja":   nuevaCaja_(); break;
    case "editar-caja":  editarCaja_(id); break;
    case "repartir":     repartir_(id); break;
    case "recibir":      recibir_(btn.dataset.lote, btn.dataset.user); break;
    case "recibir-caja": recibirCaja_(id); break;
    case "cerrar":       cerrarCaja_(id); break;
    case "stock":        ajusteStock_(btn.dataset.tipo); break;

    case "iniciar":
      accion_(`/api/ramales/lote/${id}/iniciar`).then(j => j && toast_("Tiempo corriendo."));
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
