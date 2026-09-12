// =========================
// public/js/views/ramales/ramales.js
// Panel de RAMALES — equipos del día, reparto, devolución, métricas y stock.
//
// Se pinta en dos sitios con el mismo código:
//   · página propia /ramales (el supervisor entra directo)
//   · pestaña RAMALES dentro de la vista de supervisor
//
// EL FLUJO, EN DOS GESTOS
// ───────────────────────
//   1. «Día 13: 30 Jetour, 2 VW»               → Ingresar equipos del día
//   2. «Salomón 20, Andy 10 Jetour, Gabriel 2 VW» → Repartir (se abre solo
//                                                   al guardar el paso 1)
//
// Después cada uno devuelve lo que armó y de ahí sale su tiempo: de que
// se le repartió a que devolvió, dividido entre lo que devolvió. La
// sección «Ramaleros» lo muestra por persona y un clic abre su detalle
// (ver comportamiento.js). Un día que queda redondo se cierra solo.
//
// Antes había turno rotativo y una revisión cronometrada de la caja antes
// de poder repartir; se quitó el 2026-09-12 porque el taller no lo usaba
// y solo alargaba el camino hasta el número que sí se quiere mirar.
// =========================

import { getJSON, postJSON, escapeHtml, CORE } from "../../core/core.js";
import { startPoll, stopPoll } from "../../core/poll.js";
import { icon } from "../../core/icons.js";
import {
  ramalerosHTML, detalleRamaleroHTML, trabajandoPorUser, tiempoPromedioGrupo,
  fmtDia, fmtDuracion, fmtMinRamal,
} from "./comportamiento.js";

// Espejo del enum `tipo_ramal` (supabase/schema.sql).
const TIPOS_RAMAL = ["JETOUR", "VOLKSWAGEN", "KYC V3", "KYC V5", "KYC V7", "KYC X5"];

// Estado local del panel. `raw` es la última respuesta de /api/ramales/panel.
const RM = {
  raw: null,
  root: null,
  puedeEditar: false,   // SUPERVISOR o ADMIN
  email: "",
  enVuelo: null,        // la carga en curso, para no pisarse con el poll
  verCerrados: false,   // sobrevive al re-render del poll
};

// ─── Helpers ─────────────────────────────────────────────────────────

const esc = escapeHtml;

/** Inicial del nombre para el círculo de color. */
function avatar_(nombre, sm = false) {
  const ini = String(nombre || "?").trim().charAt(0).toUpperCase() || "?";
  return `<span class="rmInicial${sm ? " rmInicial--sm" : ""}">${esc(ini)}</span>`;
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

/** Hoy en hora local, como lo quiere un <input type="date">. */
function hoyISO_() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Las líneas de un día, tal como las devuelve el panel. */
function itemsDe_(loteId) {
  return (RM.raw?.items || []).filter(i => i.lote_id === loteId);
}

/** La gente a quien se reparte: todo usuario con el módulo RAMALERO. */
function ramaleros_() {
  return [...(RM.raw?.desempeno || [])]
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
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
 * Con `silencioso` el error no se muestra: lo usa el cierre, que espera
 * el rechazo del servidor y quiere preguntar en vez de gritar.
 */
async function accion_(url, body = {}, { silencioso = false } = {}) {
  try {
    const j = await postJSON(url, { email: RM.email, ...body });
    if (!j?.ok) {
      if (!silencioso) toast_(j?.error || "No se pudo completar la acción.", "bad");
      return null;
    }
    await cargar_({ forzar: true });
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
 * @param {string} [o.sub]         línea de contexto bajo el título
 * @param {string} o.cuerpo        HTML del formulario
 * @param {string} [o.guardar]     texto del botón principal
 * @param {boolean} [o.ancho]
 * @param {boolean} [o.peligro]    el botón principal se pinta como destructivo
 * @param {boolean} [o.soloLectura] sin botón principal: solo «Cerrar»
 * @param {(box:HTMLElement)=>void} [o.alAbrir]  para enganchar listeners vivos
 * @param {(box:HTMLElement)=>Promise<boolean|void>} [o.alGuardar]
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
        <button type="button" class="btn3 rmModalCancel">${o.soloLectura ? "Cerrar" : "Cancelar"}</button>
        ${o.soloLectura ? "" : `
          <button type="button" class="btn3 ${o.peligro ? "rmBtn--danger" : "rmBtn--primary"} rmModalSave">
            ${esc(o.guardar || "Guardar")}
          </button>`}
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
  btn?.addEventListener("click", async () => {
    btn.disabled = true;
    let r;
    try { r = await o.alGuardar(box); } finally { btn.disabled = false; }
    if (r !== false) cerrar();
  });

  o.alAbrir?.(box);
  if (!o.soloLectura) setTimeout(() => box.querySelector("input,select,textarea")?.focus(), 90);
  return { box, cerrar };
}

// ─── Carga ───────────────────────────────────────────────────────────

/**
 * Trae el panel. El poll llama sin `forzar` y se salta la vuelta si ya
 * hay una en curso; una acción llama con `forzar`, espera la que esté en
 * vuelo y pide otra — si no, justo después de guardar podría quedarse
 * con la foto de antes y el reparto no encontraría el día recién creado.
 */
async function cargar_({ forzar = false } = {}) {
  if (RM.enVuelo) {
    if (!forzar) return;
    await RM.enVuelo.catch(() => {});
  }
  RM.enVuelo = (async () => {
    const j = await getJSON(forzar ? "/api/ramales/panel?fresh=1" : "/api/ramales/panel");
    if (!j?.ok) throw new Error(j?.error || "Respuesta inesperada del servidor");
    RM.raw = j;
    render_();
  })();
  try {
    await RM.enVuelo;
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
    RM.enVuelo = null;
  }
}

// ─── Render: cabecera ────────────────────────────────────────────────

function renderHead_() {
  return `
    <div class="rmTurno">
      <div>
        <div class="rmTurno__label">Ramales</div>
        <div class="rmTurno__nombre">Equipos del día y reparto</div>
        <div class="rmTurno__meta">
          Anota lo que se pidió por marca, repártelo y mira cuánto tarda cada uno.
        </div>
      </div>
      ${RM.puedeEditar ? `
        <div class="rmTurno__acciones">
          <button class="btn3 rmBtn--primary" data-rm="nuevo">
            ${icon("box", 15)} Ingresar equipos del día
          </button>
        </div>` : ""}
    </div>`;
}

// ─── Render: un día ──────────────────────────────────────────────────

/** En qué va el día, en una palabra. Pinta la franja y el chip. */
function fase_(l) {
  if (l.estado === "CERRADO") return "cerrado";
  if (l.sin_repartir > 0) return "repartir";
  if (l.en_proceso > 0) return "trabajando";
  return "listo";
}

function chipFase_(l) {
  switch (fase_(l)) {
    case "cerrado":    return `<span class="rmChip">Cerrado</span>`;
    case "repartir":   return `<span class="rmChip warn">Faltan repartir ${l.sin_repartir}</span>`;
    case "trabajando": return `<span class="rmChip info">${l.en_proceso} trabajando</span>`;
    default:           return `<span class="rmChip ok">Todo devuelto</span>`;
  }
}

/**
 * La barra es el arqueo dibujado. Si los tramos no llenan el ancho, el
 * día no cuadra — y eso se ve antes de leer un solo número.
 */
function renderBarra_(l) {
  const total = Math.max(1, l.cantidad_equipos);
  const pct = (n) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
  const descuadre = Number(l.descuadre) !== 0;

  return `
    <div class="rmBar" title="verde: devuelto · ámbar: trabajando · gris: sin repartir">
      <span class="rmBar__seg rmBar__seg--dev"  style="width:${pct(l.devueltos)}"></span>
      <span class="rmBar__seg rmBar__seg--proc" style="width:${pct(l.en_proceso)}"></span>
      <span class="rmBar__seg rmBar__seg--sin"  style="width:${pct(Math.max(0, l.sin_repartir))}"></span>
      ${descuadre ? `<span class="rmBar__seg rmBar__seg--mal" style="width:${pct(Math.abs(l.descuadre))}"></span>` : ""}
    </div>`;
}

/**
 * Lo que se pidió, marca por marca, con lo que falta repartir de cada
 * una. Con varias marcas el total no dice nada: 32 repartidos de 32 puede
 * ser 31 Jetour y 1 VW cuando se pidieron 30 y 2.
 */
function renderMarcas_(loteId) {
  const items = itemsDe_(loteId);
  if (!items.length) {
    return `<div class="rmMarcasLinea rmMarcasLinea--vacia">
      Sin marcas anotadas · el stock por marca no cuenta este día
    </div>`;
  }

  return `
    <div class="rmMarcasLinea">
      ${items.map(i => {
        const falta = i.sin_repartir;
        const cls = falta < 0 ? "is-mal" : (falta > 0 ? "is-pend" : "is-ok");
        return `
          <span class="rmMarcaChip ${cls}" title="${esc(i.tipo_ramal)}: ${i.cantidad} pedidos, ${i.repartidos} repartidos, ${i.devueltos} devueltos">
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
      ${item("Pedidos", l.cantidad_equipos)}
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
 * Los repartos del día, agrupados POR PERSONA — que es como se le habla
 * («Salomón, ¿y los tuyos?»). Cada línea cerrada dice cuánto tardó.
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

    // Desde este panel recibe el supervisor. El ramalero devuelve lo suyo
    // desde su propia vista (views/ramales/mi-turno.js).
    const puedeRecibir = pendientes.length && !cerrado && RM.puedeEditar;

    return `
      <div class="rmReparto ${pendientes.length ? "is-pendiente" : ""}">
        ${avatar_(p.nombre, true)}
        <span class="rmReparto__nombre">${esc(p.nombre)}</span>
        <span class="rmReparto__cifra">
          ${p.filas.map(f => {
            const tardo = f.devuelto_at
              ? (new Date(f.devuelto_at) - new Date(f.asignado_at)) / 60000
              : null;
            return `
              <span class="rmReparto__linea ${f.devuelto_at ? "" : "is-abierta"}">
                ${f.cantidad_asignada} ${esc(f.tipo_ramal || "s/marca")}${
                  f.devuelto_at
                    ? ` → ${f.cantidad_devuelta}${f.cantidad_rechazada ? ` (${f.cantidad_rechazada} ✕)` : ""}` +
                      ` · ${esc(fmtDuracion(tardo))}`
                    : ""}
              </span>`;
          }).join("")}
        </span>
        <span class="rmReparto__acc">
          ${pendientes.length
            ? `<span class="rmChip warn">sin devolver</span>`
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
  const cerrado = l.estado === "CERRADO";
  const descuadre = Number(l.descuadre) !== 0;

  const acc = [];
  if (RM.puedeEditar && !cerrado) {
    if (l.sin_repartir > 0) {
      acc.push(`<button class="btn3 rmBtn--primary" data-rm="repartir" data-id="${l.lote_id}">${icon("users", 14)} Repartir</button>`);
    }
    acc.push(`<button class="btn3" data-rm="editar" data-id="${l.lote_id}">${icon("listChecks", 14)} Corregir</button>`);
    acc.push(`<button class="btn3" data-rm="cerrar" data-id="${l.lote_id}">${icon("shieldCheck", 14)} Cerrar día</button>`);
  }

  return `
    <div class="rmLote ${descuadre ? "is-descuadre" : ""}" data-fase="${fase_(l)}">
      <div class="rmLote__head">
        <span class="rmLote__codigo">${esc(fmtDia(l.fecha))}</span>
        ${chipFase_(l)}
        <div class="rmLote__sub">
          <span>${l.cantidad_equipos} equipos</span>
          <span>·</span>
          <span>${esc(l.codigo || "")}</span>
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
 * «Jetour 30» hacía creer que de esa marca hay 30 en el mundo; puede
 * haber 80 con 50 en la mesa de alguien. Es la diferencia entre «hay que
 * comprar» y «hay que esperar».
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

// ─── Render general ──────────────────────────────────────────────────

function render_() {
  if (!RM.root || !RM.raw) return;

  const lotes = RM.raw.lotes || [];
  const abiertos = lotes.filter(l => l.estado !== "CERRADO");
  const cerrados = lotes.filter(l => l.estado === "CERRADO");
  const porRepartir = abiertos.reduce((a, l) => a + Math.max(0, l.sin_repartir || 0), 0);
  const trabajando = [...trabajandoPorUser(RM.raw.repartos).values()].reduce((a, n) => a + n, 0);
  const promedio = tiempoPromedioGrupo(RM.raw.desempeno);
  const stockTotal = (RM.raw.stock || []).reduce((a, s) => a + (s.disponible || 0), 0);

  RM.root.innerHTML = `
    <div class="rmRoot">
      ${renderHead_()}

      <div class="dashGrid" style="margin-bottom:14px;">
        <div class="statTile">
          <div class="statTile__label">📦 Por repartir</div>
          <div class="statTile__value" style="${porRepartir > 0 ? "color:var(--warn)" : ""}">${porRepartir}</div>
        </div>
        <div class="statTile">
          <div class="statTile__label">🔩 Trabajando</div>
          <div class="statTile__value">${trabajando}</div>
        </div>
        <div class="statTile">
          <div class="statTile__label">⏱ Tiempo promedio por ramal</div>
          <div class="statTile__value">${promedio == null ? "—" : fmtMinRamal(promedio)}</div>
        </div>
        <div class="statTile">
          <div class="statTile__label">📥 Stock listo</div>
          <div class="statTile__value">${stockTotal}</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <h3 style="margin:0 0 12px;"><span class="accentBar"></span>Días abiertos</h3>
        ${abiertos.length
          ? abiertos.map(renderLote_).join("")
          : `<div class="rmEmpty">
               <span class="rmEmpty__icon">📦</span>
               <strong>No hay nada pendiente</strong>
               ${RM.puedeEditar
                 ? "Ingresa los equipos del día con el botón de arriba y repártelos."
                 : "Cuando el supervisor ingrese los equipos del día, aparecen aquí."}
             </div>`}

        ${cerrados.length ? `
          <button type="button" class="btn3" style="margin-top:10px;width:100%;" data-rm="ver-cerrados">
            ${RM.verCerrados ? "Ocultar" : "Ver"} días cerrados (${cerrados.length})
          </button>
          <div id="rmCerrados" style="display:${RM.verCerrados ? "block" : "none"};margin-top:10px;">
            ${cerrados.map(renderLote_).join("")}
          </div>` : ""}
      </div>

      <div class="card" style="margin-bottom:12px;">
        <h3 style="margin:0 0 4px;"><span class="accentBar"></span>Ramaleros</h3>
        <p class="small" style="color:var(--muted);margin:0 0 14px;">
          Tiempo promedio por ramal: de que se le reparte a que devuelve.
          Toca un nombre para ver su detalle.
        </p>
        ${ramalerosHTML(RM.raw)}
      </div>

      <div class="card">
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
          vuelven.
        </p>
      </div>
    </div>`;
}

// ─── Editor de las líneas de un día ──────────────────────────────────
//  Lo comparten «Ingresar equipos del día» y «Corregir»: es el mismo gesto
//  («¿qué se pidió?») y no tiene por qué aprenderse dos veces.

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
    : filaItem_("JETOUR", "");

  return `
    <div class="rmField">
      <label>Equipos por marca</label>
      <div id="rmItems" class="rmItems">${filas}</div>
      <div class="rmItemsFoot">
        <button type="button" class="btn3" id="rmItemsAdd">＋ Otra marca</button>
        <span class="rmItemsTotal">Total <b id="rmItemsTotal">0</b> equipos</span>
      </div>
    </div>`;
}

// ─── Formularios ─────────────────────────────────────────────────────

/** Paso 1: «día 13: 30 Jetour, 2 VW». Al guardar abre el reparto. */
function nuevoDia_() {
  modal_({
    titulo: "Ingresar equipos del día",
    guardar: "Guardar y repartir",
    cuerpo: `
      <div class="rmField">
        <label for="rmNdFecha">Día</label>
        <input id="rmNdFecha" type="date" value="${hoyISO_()}" />
      </div>

      ${bloqueItems_([])}

      <div class="rmField">
        <label for="rmNdNota">Nota (opcional)</label>
        <input id="rmNdNota" type="text" placeholder="Guía, proveedor, observación…" />
      </div>`,

    alAbrir: (box) => { box._leerItems = engancharItems_(box); },

    alGuardar: async (box) => {
      const items = box._leerItems();
      if (!items.length) {
        toast_("Pon al menos una marca con su cantidad.", "bad");
        return false;
      }
      const j = await accion_("/api/ramales/lote", {
        fecha: box.querySelector("#rmNdFecha").value,
        items,
        nota: box.querySelector("#rmNdNota").value,
      });
      if (!j) return false;
      // El reparto se abre después de que este modal se cierre, para que
      // el cierre de este no se lleve el nuevo.
      const id = j.lote?.id;
      if (id) setTimeout(() => repartir_(id), 0);
      return true;
    },
  });
}

/** Corregir los equipos de un día ya ingresado. */
function editarDia_(loteId) {
  const l = RM.raw?.lotes?.find(x => x.lote_id === loteId);
  if (!l) return;
  const items = itemsDe_(loteId).map(i => ({ tipo_ramal: i.tipo_ramal, cantidad: i.cantidad }));

  modal_({
    titulo: `Corregir ${fmtDia(l.fecha)}`,
    guardar: "Guardar",
    cuerpo: `
      ${bloqueItems_(items)}
      <span class="rmField__hint">
        Lo ya repartido sigue firmado: no se puede dejar una marca por debajo
        de lo que ya se repartió de ella.
      </span>`,

    alAbrir: (box) => { box._leerItems = engancharItems_(box); },

    alGuardar: async (box) => {
      const nuevos = box._leerItems();
      if (!nuevos.length) {
        toast_("Tiene que haber al menos una marca.", "bad");
        return false;
      }
      const j = await accion_(`/api/ramales/lote/${loteId}/items`, { items: nuevos });
      if (!j) return false;
      toast_(`Actualizado · ${j.cantidad_equipos} equipos.`);
      return true;
    },
  });
}

/**
 * Paso 2: una fila por ramalero, una columna por marca, y abajo cuánto
 * falta de cada una actualizándose mientras escribes. Con 30 Jetour y
 * 2 VW: Salomón 20 | 0, Andy 10 | 0, Gabriel 0 | 2.
 */
function repartir_(loteId) {
  const l = RM.raw?.lotes?.find(x => x.lote_id === loteId);
  if (!l) return;

  // Un día sin marcas anotadas (de antes de que existieran las líneas)
  // se reparte igual, en una sola columna sin marca.
  const lineas = itemsDe_(loteId);
  const items = lineas.length
    ? lineas.filter(i => i.sin_repartir > 0)
    : (l.sin_repartir > 0
        ? [{ tipo_ramal: "", sin_repartir: l.sin_repartir, cantidad: l.cantidad_equipos }]
        : []);
  if (!items.length) return toast_("Este día ya está repartido entero.", "bad");

  const gente = ramaleros_();
  if (!gente.length) return toast_("No hay usuarios con el módulo RAMALERO.", "bad");

  // Lo que cada quien ya tiene de este día: repartir dos veces sin ver la
  // primera vuelta es como se duplica.
  const yaTotal = new Map();
  for (const r of (RM.raw?.repartos || []).filter(r => r.lote_id === loteId)) {
    yaTotal.set(r.user_id, (yaTotal.get(r.user_id) || 0) + (r.cantidad_asignada || 0));
  }
  const enMano = trabajandoPorUser(RM.raw?.repartos);

  const celda = (uid, tipo) => `
    <td>
      <input type="number" min="0" step="1" class="rmMatriz__in" placeholder="0"
             data-uid="${esc(uid)}" data-tipo="${esc(tipo)}" value="" />
    </td>`;

  modal_({
    titulo: `Repartir ${fmtDia(l.fecha)}`,
    sub: items.map(i => `${i.sin_repartir} ${i.tipo_ramal || "sin marca"}`).join(" · "),
    guardar: "Repartir",
    ancho: true,
    cuerpo: `
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
            ${gente.map(r => {
              const sub = yaTotal.get(r.user_id)
                ? `ya tiene ${yaTotal.get(r.user_id)} de este día`
                : (enMano.get(r.user_id) ? `${enMano.get(r.user_id)} trabajando` : "");
              return `
                <tr>
                  <th class="rmMatriz__quien">
                    ${avatar_(r.nombre, true)}
                    <span>
                      ${esc(corto_(r.nombre))}
                      ${sub ? `<small>${esc(sub)}</small>` : ""}
                    </span>
                  </th>
                  ${items.map(i => celda(r.user_id, i.tipo_ramal)).join("")}
                  <td class="rmMatriz__tot" data-tot="${esc(r.user_id)}">0</td>
                  <td><button type="button" class="rmMatriz__todo" data-todo="${esc(r.user_id)}"
                              title="Darle a esta persona todo lo que falta">todo</button></td>
                </tr>`;
            }).join("")}
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
      </div>
      <span class="rmField__hint">
        El tiempo de cada uno empieza cuando guardas el reparto, y cada quien
        solo podrá devolver hasta lo que le diste, de esa marca.
      </span>`,

    alAbrir: (box) => {
      const inputs = [...box.querySelectorAll(".rmMatriz__in")];
      const valor = (i) => Math.max(0, Number(i.value) || 0);

      const recalcular = () => {
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
        const todo = e.target.closest("[data-todo]");
        if (!todo) return;
        e.preventDefault();
        const uid = todo.dataset.todo;
        for (const it of items) {
          const otros = inputs
            .filter(i => i.dataset.tipo === it.tipo_ramal && i.dataset.uid !== uid)
            .reduce((a, i) => a + valor(i), 0);
          const inp = inputs.find(i => i.dataset.uid === uid && i.dataset.tipo === it.tipo_ramal);
          if (inp) inp.value = Math.max(0, it.sin_repartir - otros) || "";
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

      // Se valida por marca, igual que el servidor: con varias marcas el
      // total puede cuadrar y una marca estar repartida de más.
      for (const it of items) {
        const suma = repartos
          .filter(r => r.tipo_ramal === it.tipo_ramal)
          .reduce((a, r) => a + r.cantidad, 0);
        if (suma > it.sin_repartir) {
          toast_(`De ${it.tipo_ramal || "ese día"} estás repartiendo ${suma} y solo quedan ${it.sin_repartir}.`, "bad");
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
 * Recibir la devolución de una persona: todas sus marcas abiertas de ese
 * día en un solo formulario — el ramalero llega una vez con todo.
 */
function recibir_(loteId, userId) {
  const filas = (RM.raw?.repartos || [])
    .filter(r => r.lote_id === loteId && r.user_id === userId && !r.devuelto_at);
  if (!filas.length) return;
  const l = RM.raw?.lotes?.find(x => x.lote_id === loteId);

  modal_({
    titulo: `Recibir de ${filas[0].nombre}`,
    sub: l ? fmtDia(l.fecha) : "",
    guardar: "Recibir",
    cuerpo: `
      ${filas.map(f => `
        <div class="rmDevRow" data-rep="${f.id}">
          <div class="rmDevRow__marca">
            ${esc(f.tipo_ramal || "sin marca")}
            <small>le diste ${f.cantidad_asignada}</small>
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
          Solo entran al stock los que pasan. Los rechazados quedan en el
          historial del ramalero, al lado de su tiempo.
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
      let alStock = 0, cerrado = false;
      for (const e of envios) {
        const j = await accion_(`/api/ramales/reparto/${e.id}/devolver`, {
          cantidad_devuelta: e.devuelta, cantidad_rechazada: e.rechazada, nota,
        });
        if (!j) return false;
        alStock += j.al_stock || 0;
        cerrado = cerrado || !!j.lote_cerrado;
      }
      toast_(`${alStock} ramales entraron al stock.${cerrado ? " El día quedó completo y se cerró." : ""}`);
      return true;
    },
  });
}

/** Cerrar un día que no se cerró solo (le falta algo o no cuadra). */
function cerrarDia_(loteId) {
  const l = RM.raw?.lotes?.find(x => x.lote_id === loteId);
  if (!l) return;
  const cuadra = l.en_proceso === 0 && l.sin_repartir === 0;

  modal_({
    titulo: `Cerrar ${fmtDia(l.fecha)}`,
    guardar: "Cerrar día",
    peligro: !cuadra,
    cuerpo: `
      ${cuadra
        ? `<div class="rmAviso info">
             <strong>El día cuadra</strong>
             ${l.cantidad_equipos} pedidos, ${l.devueltos} devueltos. Nada pendiente.
           </div>`
        : `<div class="rmAviso warn">
             <strong>Este día no cuadra</strong>
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
          <textarea id="rmCierreMotivo" placeholder="Obligatorio si hay merma. Di también de qué marca."></textarea>
        </div>
        <label class="rmCheck">
          <input type="checkbox" id="rmCierreForzar" />
          <span class="rmCheck__txt">Cerrar igual dejando el descuadre registrado
            <small>El faltante NO se borra: queda visible en el arqueo para que
            se pueda investigar después.</small>
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

      // El servidor vuelve a validar el arqueo: si sin `forzar` el día no
      // cierra, responde NO_CUADRA y aquí se dice qué falta marcar.
      const j = await accion_(`/api/ramales/lote/${loteId}/cerrar`,
        { merma, merma_motivo: motivo || (forzar ? "Cerrado con descuadre" : ""), forzar },
        { silencioso: true });

      if (!j) {
        toast_("Sigue sin cuadrar: marca la casilla de abajo o ajusta la merma.", "bad");
        return false;
      }
      toast_(forzar ? "Día cerrado con descuadre registrado." : "Día cerrado.");
      return true;
    },
  });
}

/** El detalle de un ramalero: se abre al tocar su fila. */
async function detalleRamalero_(userId) {
  const d = (RM.raw?.desempeno || []).find(x => x.user_id === userId);
  const { box } = modal_({
    titulo: d?.nombre || "Ramalero",
    sub: "Tiempos, marcas y cada reparto",
    ancho: true,
    soloLectura: true,
    cuerpo: `<div class="rmSkel" style="height:220px;"></div>`,
  });
  const cuerpo = box.querySelector(".rmForm");

  try {
    const j = await getJSON(`/api/ramales/ramalero/${encodeURIComponent(userId)}`);
    if (!j?.ok) throw new Error(j?.error || "Respuesta inesperada del servidor");
    if (box.isConnected) cuerpo.innerHTML = detalleRamaleroHTML(j);
  } catch (e) {
    if (box.isConnected) {
      cuerpo.innerHTML = `<div class="rmAviso bad"><strong>No se pudo cargar el detalle</strong>${esc(String(e?.message || e))}</div>`;
    }
  }
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
    case "nuevo":     nuevoDia_(); break;
    case "editar":    editarDia_(id); break;
    case "repartir":  repartir_(id); break;
    case "recibir":   recibir_(btn.dataset.lote, btn.dataset.user); break;
    case "cerrar":    cerrarDia_(id); break;
    case "stock":     ajusteStock_(btn.dataset.tipo); break;
    case "ramalero":  detalleRamalero_(id); break;

    case "ver-cerrados": {
      RM.verCerrados = !RM.verCerrados;
      const box = RM.root.querySelector("#rmCerrados");
      if (box) box.style.display = RM.verCerrados ? "block" : "none";
      btn.textContent = `${RM.verCerrados ? "Ocultar" : "Ver"} días cerrados`;
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
}

/** Desmonta: para el poll, cierra el modal y suelta el DOM. */
export function unmountRamalesPanel() {
  stopPoll("RAMALES_PANEL");
  document.getElementById("rmModal")?.remove();
  RM.root?.removeEventListener("click", onClick_);
  RM.root = null;
  RM.raw = null;
}
