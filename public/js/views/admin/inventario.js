// =========================
// public/js/views/admin/inventario.js
// Sub-módulo ADMIN · Inventario de herramientas
//   3 vistas: Inventario por técnico · Kits estándar · Catálogo
// CRUD directo contra Supabase (mismo patrón que el resto del admin).
// =========================
import {
  supabaseGet,
  supabasePost,
  supabasePatch,
  supabaseDelete,
} from "../../core/supabase-client.js";
import { icon } from "../../core/icons.js";

// ─── Estado local del módulo ─────────────────────────────────────────
const INV = {
  sub: "tecnico",        // "tecnico" | "kits" | "catalogo"
  catalogo: [],          // herramientas_catalogo
  catMap: new Map(),     // id → herramienta
  kits: [],              // inventario_kits
  usuarios: [],          // usuarios activos
  selTecId: null,        // user_id seleccionado
  invActual: null,       // inventario_tecnico del técnico seleccionado
  invItems: [],          // items del inventario seleccionado
};

const ESTADOS = ["OK", "FALTA", "MAL", "NO_STOCK"];
const ESTADO_LABEL = { OK: "OK", FALTA: "Falta", MAL: "Malo", NO_STOCK: "No stock" };
const ESPECIALIDADES = ["AMBOS", "MOTOR", "TANQUE"];

// ─── Helpers ─────────────────────────────────────────────────────────
function $id(id) { return document.getElementById(id); }
function esc(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function opts(arr, sel = "") {
  return arr.map(v => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(v)}</option>`).join("");
}
function invMsg(text, isErr = false) {
  const el = $id("invMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isErr ? "var(--danger)" : "var(--muted)";
}
function estadoBadge(estado) {
  const map = {
    OK:       "adminBadgeOk",
    FALTA:    "adminBadgeWarn",
    MAL:      "adminBadgeDanger",
    NO_STOCK: "adminBadgeMuted",
  };
  return `<span class="adminBadge ${map[estado] || ""}">${esc(ESTADO_LABEL[estado] || estado)}</span>`;
}
// Nombre visible de un ítem de inventario (catálogo o texto libre).
function nombreItem(it) {
  if (it.herramienta_id && INV.catMap.has(it.herramienta_id)) {
    return INV.catMap.get(it.herramienta_id).nombre;
  }
  return it.descripcion_libre || "—";
}
// Clave de agrupación: misma herramienta del catálogo o misma descripción libre.
function claveItem_(it) {
  return it.herramienta_id || `libre:${(it.descripcion_libre || "").trim().toLowerCase()}`;
}
function cantidadDe_(it) { return Number(it.cantidad) || 0; }
// Suma las unidades de una lista de ítems (el "contador" de herramientas).
function totalUnidades_(items) {
  return (items || []).reduce((s, it) => s + cantidadDe_(it), 0);
}
// Agrupa ítems repetidos (2 martillos = 1 fila con cantidad 2).
// Conserva el orden de aparición (que ya viene ordenado por `orden`).
function agruparItems_(items) {
  const grupos = new Map();
  items.forEach(it => {
    const key = claveItem_(it);
    if (!grupos.has(key)) grupos.set(key, { key, nombre: nombreItem(it), items: [] });
    grupos.get(key).items.push(it);
  });
  return [...grupos.values()].map(g => {
    g.cantidad = totalUnidades_(g.items);
    g.marcas = [...new Set(g.items.map(it => (it.marca || "").trim()).filter(Boolean))];
    g.notas  = [...new Set(g.items.map(it => (it.nota || "").trim()).filter(Boolean))];
    g.porEstado = g.items.reduce((acc, it) => {
      acc[it.estado] = (acc[it.estado] || 0) + cantidadDe_(it);
      return acc;
    }, {});
    return g;
  });
}
// Badges de estado de un grupo (con ×n cuando hay estados mezclados).
function estadosGrupo_(g) {
  const usados = ESTADOS.filter(e => g.porEstado[e]);
  if (usados.length <= 1) return estadoBadge(usados[0] || g.items[0]?.estado);
  return usados.map(e => `${estadoBadge(e)}<span class="invEstadoN">×${g.porEstado[e]}</span>`).join(" ");
}

// ─── Carga base (catálogo + kits + usuarios) ─────────────────────────
async function cargarBase_() {
  const [cat, kits, usuarios] = await Promise.all([
    supabaseGet("herramientas_catalogo").catch(() => []),
    supabaseGet("inventario_kits").catch(() => []),
    supabaseGet("usuarios", { activo: true }).catch(() => []),
  ]);
  INV.catalogo = (cat || []).sort((a, b) => a.nombre.localeCompare(b.nombre));
  INV.catMap = new Map(INV.catalogo.map(h => [h.id, h]));
  INV.kits = kits || [];
  INV.usuarios = (usuarios || []).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
}

// ─── Punto de entrada (llamado desde admin.js loadTab) ───────────────
export async function renderInventarioTab(wrap) {
  wrap.innerHTML = `<div class="small muted" style="padding:12px;">Cargando inventario…</div>`;
  try {
    await cargarBase_();
  } catch (e) {
    wrap.innerHTML = `<div class="small" style="color:var(--danger);padding:12px;">
      ${esc(e.message)}<br><br>
      ¿Ejecutaste <code>supabase/inventario.sql</code> en el SQL Editor de Supabase?
    </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="adminConfigPanel">
      <div class="invSubtabs" role="tablist">
        <button class="invSubtab" data-sub="tecnico">${icon("users", 15)} Inventario por técnico</button>
        <button class="invSubtab" data-sub="kits">${icon("box", 15)} Kits estándar</button>
        <button class="invSubtab" data-sub="catalogo">${icon("clipboardList", 15)} Catálogo</button>
      </div>
      <div id="invSubContent" style="margin-top:14px;"></div>
      <div id="invMsg" class="small muted" style="margin-top:10px;"></div>
    </div>
  `;

  wrap.querySelectorAll(".invSubtab").forEach(btn => {
    btn.addEventListener("click", () => setSub_(btn.dataset.sub));
  });
  setSub_(INV.sub);
}

function setSub_(sub) {
  INV.sub = sub;
  document.querySelectorAll(".invSubtab").forEach(b => {
    b.classList.toggle("invSubtabActive", b.dataset.sub === sub);
  });
  invMsg("");
  if (sub === "tecnico")  return renderTecnicoSub_();
  if (sub === "kits")     return renderKitsSub_();
  if (sub === "catalogo") return renderCatalogoSub_();
}

// =====================================================================
//  SUB-VISTA 1 · INVENTARIO POR TÉCNICO
// =====================================================================
async function renderTecnicoSub_() {
  const box = $id("invSubContent");
  if (!box) return;

  // Traer qué técnicos ya tienen inventario (+ sus ítems) para el contador.
  let inventarios = [], todosItems = [];
  try { inventarios = await supabaseGet("inventario_tecnico"); } catch { inventarios = []; }
  try { todosItems = await supabaseGet("inventario_tecnico_items"); } catch { todosItems = []; }
  const invByUser = new Map(inventarios.map(iv => [iv.user_id, iv]));

  // inventario_id → { unidades, tipos }
  const statsByInv = new Map();
  todosItems.forEach(it => {
    let s = statsByInv.get(it.inventario_id);
    if (!s) { s = { unidades: 0, claves: new Set() }; statsByInv.set(it.inventario_id, s); }
    s.unidades += cantidadDe_(it);
    s.claves.add(claveItem_(it));
  });

  let totalUnidades = 0, tecnicosConHoja = 0;

  const filasTec = INV.usuarios.map(u => {
    const iv = invByUser.get(u.id);
    const chip = iv
      ? `<span class="adminBadge ${iv.formato === "ANTIGUO" ? "adminBadgeWarn" : "adminBadgeOk"}">${iv.formato === "ANTIGUO" ? "Antiguo" : "Nuevo"}</span>`
      : `<span class="adminBadgeMuted">Sin inventario</span>`;
    const st = iv ? statsByInv.get(iv.id) : null;
    if (iv) { tecnicosConHoja++; totalUnidades += st?.unidades || 0; }
    const contador = iv
      ? `<span class="invContador" title="${st?.claves.size || 0} herramientas distintas">
           <strong>${st?.unidades || 0}</strong> uds
           <span class="invContadorSub">· ${st?.claves.size || 0} tipos</span>
         </span>`
      : `<span class="small muted">—</span>`;
    return `
      <tr>
        <td>${esc(u.nombre)}</td>
        <td><span class="adminBadge">${esc(u.especialidad)}</span></td>
        <td>${chip}</td>
        <td style="text-align:center;">${contador}</td>
        <td class="adminActionsCell">
          <button class="adminBtnEdit adminRowBtn adminRowBtn--wide invVerTec" data-uid="${esc(u.id)}">
            ${icon("chevronRight", 14)} ${iv ? "Ver / editar" : "Crear"}
          </button>
        </td>
      </tr>`;
  }).join("");

  const promedio = tecnicosConHoja ? Math.round(totalUnidades / tecnicosConHoja) : 0;

  box.innerHTML = `
    <p class="small muted">
      Cada técnico tiene su hoja. Los <strong>nuevos</strong> se generan desde un kit estándar (MOTOR/TANQUE);
      los <strong>antiguos</strong> conservan su lista libre importada del Excel.
    </p>
    <div class="invResumen">
      <span class="invResumenChip">Técnicos con hoja <strong>${tecnicosConHoja}</strong></span>
      <span class="invResumenChip">Herramientas entregadas <strong>${totalUnidades}</strong></span>
      <span class="invResumenChip">Promedio por técnico <strong>${promedio}</strong></span>
    </div>
    <div class="adminTableScroll" style="margin-top:10px;">
      <table class="adminTable">
        <thead><tr><th>Técnico</th><th>Especialidad</th><th>Inventario</th><th style="text-align:center;">Herramientas</th><th></th></tr></thead>
        <tbody>${filasTec || `<tr><td colspan="5" class="small muted" style="padding:12px;">Sin técnicos activos.</td></tr>`}</tbody>
      </table>
    </div>
  `;

  box.querySelectorAll(".invVerTec").forEach(btn => {
    btn.addEventListener("click", () => abrirInventarioTec_(btn.dataset.uid, invByUser.get(btn.dataset.uid) || null));
  });
}

// Modal grande que aloja la hoja del técnico (antes era un div al pie).
function abrirTecModal_(titulo = "Inventario") {
  let modal = document.getElementById("invTecModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "invTecModal";
    modal.className = "modal show";
    modal.innerHTML = `
      <div class="modalBox adminModalBox invTecModalBox">
        <div class="modalHead">
          <span class="modalTitle" id="invTecModalTitle">${esc(titulo)}</span>
          <button type="button" class="invTecModalClose" title="Cerrar">✕</button>
        </div>
        <div class="modalBody" id="invTecModalBody"></div>
      </div>`;
    document.body.appendChild(modal);
    document.body.classList.add("modal-open");
    modal.querySelector(".invTecModalClose")?.addEventListener("click", cerrarTecModal_);
    modal.addEventListener("click", e => { if (e.target === modal) cerrarTecModal_(); });
  } else {
    const t = $id("invTecModalTitle");
    if (t) t.textContent = titulo;
  }
  return $id("invTecModalBody");
}

function cerrarTecModal_() {
  document.getElementById("invTecModal")?.remove();
  if (!document.querySelector(".modal.show")) document.body.classList.remove("modal-open");
  INV.invActual = null;
  INV.invItems = [];
  INV.selTecId = null;
  renderTecnicoSub_();
}

async function abrirInventarioTec_(userId, inv) {
  INV.selTecId = userId;
  const user = INV.usuarios.find(u => u.id === userId);
  if (!user) return;
  const det = abrirTecModal_(user.nombre);
  if (!det) return;

  // Sin inventario aún → ofrecer generar desde kit o lista libre.
  if (!inv) {
    const kitsSugeridos = INV.kits.filter(k =>
      k.especialidad === "AMBOS" || user.especialidad === "AMBOS" || k.especialidad === user.especialidad
    );
    const kitOpts = (kitsSugeridos.length ? kitsSugeridos : INV.kits)
      .map(k => `<option value="${esc(k.id)}">${esc(k.nombre)}</option>`).join("");
    det.innerHTML = `
      <div class="adminConfigSection">
        <h4 class="adminConfigTitle">${esc(user.nombre)} · sin inventario</h4>
        <p class="small muted">Elige cómo crear su hoja:</p>
        <div class="invCrearGrid">
          <div class="invCrearCard">
            <div class="invCrearTitle">${icon("box", 16)} Desde kit estándar <span class="adminBadgeOk">Nuevo</span></div>
            <p class="small muted">Copia todas las herramientas del kit con estado OK.</p>
            <select id="invKitSel" class="adminInput">${kitOpts}</select>
            <button id="invBtnGenKit" class="adminBtnOk" style="margin-top:8px;">Generar desde kit</button>
          </div>
          <div class="invCrearCard">
            <div class="invCrearTitle">${icon("pencil", 16)} Lista libre <span class="adminBadgeWarn">Antiguo</span></div>
            <p class="small muted">Hoja vacía para cargar herramientas a mano (formato antiguo).</p>
            <button id="invBtnGenLibre" class="adminBtnGhost" style="margin-top:8px;">Crear lista libre</button>
          </div>
        </div>
      </div>
    `;
    $id("invBtnGenKit")?.addEventListener("click", () => generarDesdeKit_(userId, $id("invKitSel")?.value));
    $id("invBtnGenLibre")?.addEventListener("click", () => crearListaLibre_(userId));
    return;
  }

  // Con inventario → cargar items y pintar tabla editable.
  INV.invActual = inv;
  det.innerHTML = `<div class="small muted" style="padding:12px;">Cargando herramientas…</div>`;
  try {
    INV.invItems = await supabaseGet("inventario_tecnico_items", { inventario_id: inv.id });
    INV.invItems.sort((a, b) => (a.orden || 0) - (b.orden || 0));
  } catch (e) {
    det.innerHTML = `<div class="small" style="color:var(--danger);padding:12px;">${esc(e.message)}</div>`;
    return;
  }
  pintarInventarioTec_(user, inv);
}

function pintarInventarioTec_(user, inv) {
  const det = $id("invTecModalBody");
  if (!det) return;

  // Conteos por unidades (no por fila), para que cuadren con las cantidades.
  const conteo = ESTADOS.reduce((acc, e) => {
    acc[e] = totalUnidades_(INV.invItems.filter(it => it.estado === e));
    return acc;
  }, {});
  const total = totalUnidades_(INV.invItems);
  const grupos = agruparItems_(INV.invItems);

  const filas = grupos.map(g => {
    const multi = g.items.length > 1;
    const fila = `
      <tr class="invGrupoRow${multi ? " invGrupoRowMulti" : ""}" data-key="${esc(g.key)}">
        <td>
          ${multi ? `<button class="invGrupoToggle" data-key="${esc(g.key)}" title="Ver los ${g.items.length} registros">${icon("chevronRight", 13)}</button>` : ""}
          ${esc(g.nombre)}
          ${multi ? `<span class="invGrupoN">${g.items.length} registros</span>` : ""}
        </td>
        <td>${esc(g.marcas.join(", ") || "—")}</td>
        <td style="text-align:center;"><strong>${g.cantidad}</strong></td>
        <td>${estadosGrupo_(g)}</td>
        <td class="small muted">${esc(g.notas.join(" · "))}</td>
        <td class="adminActionsCell">
          ${multi ? "" : `
            <button class="adminBtnEdit adminRowBtn invItemEdit" data-itid="${esc(g.items[0].id)}" title="Editar">${icon("pencil", 14)}</button>
            <button class="adminBtnDel adminRowBtn adminRowBtn--danger invItemDel" data-itid="${esc(g.items[0].id)}" title="Quitar">${icon("trash", 14)}</button>`}
        </td>
      </tr>`;
    if (!multi) return fila;
    const subs = g.items.map(it => `
      <tr class="invSubRow" data-key="${esc(g.key)}" hidden>
        <td class="invSubCell">↳ ${esc(nombreItem(it))}</td>
        <td>${esc(it.marca || "—")}</td>
        <td style="text-align:center;">${cantidadDe_(it)}</td>
        <td>${estadoBadge(it.estado)}</td>
        <td class="small muted">${esc(it.nota || "")}</td>
        <td class="adminActionsCell">
          <button class="adminBtnEdit adminRowBtn invItemEdit" data-itid="${esc(it.id)}" title="Editar">${icon("pencil", 14)}</button>
          <button class="adminBtnDel adminRowBtn adminRowBtn--danger invItemDel" data-itid="${esc(it.id)}" title="Quitar">${icon("trash", 14)}</button>
        </td>
      </tr>`).join("");
    return fila + subs;
  }).join("");

  det.innerHTML = `
    <div class="adminConfigSection">
      <div class="invDetHead">
        <div>
          <h4 class="adminConfigTitle" style="margin:0;">${esc(user.nombre)}</h4>
          <div class="small muted">
            Formato <strong>${inv.formato === "ANTIGUO" ? "Antiguo (lista libre)" : "Nuevo (kit)"}</strong>
            ${inv.fecha_entrega ? ` · entregado ${esc(inv.fecha_entrega)}` : ""}
            ${inv.tomado_por ? ` · tomado por ${esc(inv.tomado_por)}` : ""}
          </div>
        </div>
        <div class="invDetActions">
          <button id="invBtnAddItem" class="adminBtnOk">${icon("plus", 14)} Agregar herramienta</button>
          <button class="adminBtnGhost invEditCab" title="Editar datos de la hoja">${icon("settings", 14)} Datos</button>
        </div>
      </div>

      <div class="invResumen">
        <span class="invResumenChip">Total <strong>${total}</strong> uds</span>
        <span class="invResumenChip">Distintas <strong>${grupos.length}</strong></span>
        ${ESTADOS.map(e => `<span class="invResumenChip">${ESTADO_LABEL[e]} <strong>${conteo[e]}</strong></span>`).join("")}
      </div>

      <div class="adminTableScroll" style="margin-top:10px;">
        <table class="adminTable">
          <thead><tr><th>Herramienta</th><th>Marca</th><th>Cant.</th><th>Estado</th><th>Nota</th><th></th></tr></thead>
          <tbody>${filas || `<tr><td colspan="6" class="small muted" style="padding:12px;">Hoja vacía. Agrega herramientas.</td></tr>`}</tbody>
        </table>
      </div>

      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
        <button id="invBtnDelInv" class="adminBtnGhost invBtnDanger">${icon("trash", 14)} Eliminar hoja completa</button>
      </div>
    </div>
  `;

  det.querySelectorAll(".invItemEdit").forEach(b => b.addEventListener("click", () => editarItem_(b.dataset.itid)));
  det.querySelectorAll(".invItemDel").forEach(b => b.addEventListener("click", () => quitarItem_(b.dataset.itid)));
  // Desplegar/plegar los registros individuales de un grupo repetido.
  det.querySelectorAll(".invGrupoToggle").forEach(b => b.addEventListener("click", () => {
    const abierto = b.classList.toggle("invGrupoToggleOpen");
    det.querySelectorAll(`.invSubRow[data-key="${CSS.escape(b.dataset.key)}"]`)
      .forEach(tr => { tr.hidden = !abierto; });
  }));
  $id("invBtnAddItem")?.addEventListener("click", () => editarItem_(null));
  $id("invBtnDelInv")?.addEventListener("click", () => eliminarInventario_(inv, user));
  det.querySelector(".invEditCab")?.addEventListener("click", () => editarCabecera_(inv, user));
}

// ── Generar hoja desde kit ──
async function generarDesdeKit_(userId, kitId) {
  if (!kitId) return;
  invMsg("Generando hoja desde kit…");
  try {
    const kitItems = await supabaseGet("inventario_kit_items", { kit_id: kitId });
    const [inv] = await supabasePost("inventario_tecnico", {
      user_id: userId, formato: "NUEVO", kit_id: kitId,
      fecha_entrega: new Date().toISOString().slice(0, 10),
    });
    if (kitItems.length) {
      await supabasePost("inventario_tecnico_items", kitItems.map(ki => ({
        inventario_id: inv.id,
        herramienta_id: ki.herramienta_id,
        cantidad: ki.cantidad_esperada || 1,
        estado: "OK",
        orden: ki.orden || 0,
      })));
    }
    invMsg("Hoja creada desde kit.");
    await renderTecnicoSub_();
    abrirInventarioTec_(userId, inv);
  } catch (e) { invMsg(e.message, true); }
}

async function crearListaLibre_(userId) {
  invMsg("Creando lista libre…");
  try {
    const [inv] = await supabasePost("inventario_tecnico", {
      user_id: userId, formato: "ANTIGUO",
      fecha_entrega: new Date().toISOString().slice(0, 10),
    });
    invMsg("Lista libre creada.");
    await renderTecnicoSub_();
    abrirInventarioTec_(userId, inv);
  } catch (e) { invMsg(e.message, true); }
}

async function eliminarInventario_(inv, user) {
  if (!confirm(`¿Eliminar TODA la hoja de inventario de ${user.nombre}? Esta acción no se puede deshacer.`)) return;
  invMsg("Eliminando hoja…");
  try {
    await supabaseDelete("inventario_tecnico_items", { inventario_id: inv.id });
    await supabaseDelete("inventario_tecnico", { id: inv.id });
    cerrarTecModal_();
    invMsg("Hoja eliminada.");
  } catch (e) { invMsg(e.message, true); }
}

// Buscador "contiene" sobre el catálogo. Recibe elementos ya en el DOM.
// Al elegir un ítem fija el hidden con su id y muestra el nombre completo.
function wireBuscador_(searchEl, listEl, hiddenEl, onPick, onCreate) {
  if (!searchEl || !listEl) return;
  const render = (q) => {
    const raw = q.trim();
    const query = raw.toLowerCase();
    if (!query) { listEl.style.display = "none"; listEl.innerHTML = ""; return; }
    const matches = INV.catalogo
      .filter(h => h.activo !== false && `${h.categoria || ""} ${h.nombre}`.toLowerCase().includes(query))
      .slice(0, 25);
    listEl.innerHTML = matches.length
      ? matches.map(h => `<div class="invSearchItem" data-hid="${esc(h.id)}">
          <span class="invSearchCat">${esc(h.categoria || "")}</span>${esc(detalleDe_(h))}</div>`).join("")
      : (onCreate
          ? `<div class="invSearchCreate" data-q="${esc(raw)}">${icon("plus", 13)} Crear <strong>“${esc(raw)}”</strong> en el catálogo</div>`
          : `<div class="invSearchEmpty">Sin coincidencias.</div>`);
    listEl.style.display = "block";
    listEl.querySelectorAll(".invSearchItem").forEach(row => {
      row.addEventListener("mousedown", (e) => {
        e.preventDefault(); // evita blur antes del click
        const h = INV.catMap.get(row.dataset.hid);
        if (!h) return;
        if (hiddenEl) hiddenEl.value = h.id;
        searchEl.value = h.nombre;
        listEl.style.display = "none";
        onPick?.(h);
      });
    });
    listEl.querySelector(".invSearchCreate")?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      listEl.style.display = "none";
      onCreate?.(raw);
    });
  };
  searchEl.addEventListener("input", () => { if (hiddenEl) hiddenEl.value = ""; render(searchEl.value); });
  searchEl.addEventListener("focus", () => { if (searchEl.value.trim()) render(searchEl.value); });
  searchEl.addEventListener("blur", () => setTimeout(() => { listEl.style.display = "none"; }, 150));
}

// ── Modal de ítem (agregar/editar) ──
function editarItem_(itemId) {
  const it = itemId ? INV.invItems.find(x => x.id === itemId) : null;
  const herrActual = it?.herramienta_id ? INV.catMap.get(it.herramienta_id) : null;
  const cats = categoriasDistintas_();

  const body = `
    <div class="adminForm">
      <label class="adminLabel">Herramienta (del catálogo)
        <div class="invBuscador">
          <input id="invItHerrSearch" type="text" autocomplete="off"
            placeholder="Escribe para buscar… (ej: cate → alicate)"
            value="${esc(herrActual?.nombre || "")}">
          <input type="hidden" id="invItHerr" value="${esc(it?.herramienta_id || "")}">
          <div id="invItHerrList" class="invSearchList" style="display:none;"></div>
        </div>
        <span class="adminLabelHint">Si no existe, búscala y usa “Crear … en el catálogo”.</span>
      </label>

      <details class="invNuevaHerr" id="invNuevaHerrWrap">
        <summary>${icon("plus", 13)} Crear nueva herramienta en el catálogo</summary>
        <div class="invNuevaHerrForm">
          <label class="adminLabel">Categoría <span class="adminLabelHint">(elige o escribe una nueva)</span>
            <input id="invNHCat" type="text" list="invNHCatList" placeholder="Ej: ALICATE, LLAVE…" autocomplete="off">
            <datalist id="invNHCatList">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
          </label>
          <label class="adminLabel">Nombre
            <input id="invNHNombre" type="text" placeholder="Ej: alicate de presión" autocomplete="off">
          </label>
          <label class="adminLabel">Especialidad
            <select id="invNHEsp" class="adminInput">${opts(ESPECIALIDADES, "AMBOS")}</select>
          </label>
          <div class="invNuevaHerrFoot">
            <button type="button" id="invNHCrear" class="adminBtnOk">${icon("plus", 13)} Crear y usar</button>
            <span id="invNHMsg" class="small muted"></span>
          </div>
        </div>
      </details>

      <label class="adminLabel">Descripción libre <span class="adminLabelHint">(fuera del catálogo)</span>
        <input id="invItLibre" type="text" value="${esc(it?.descripcion_libre || "")}" placeholder="Nombre de la herramienta">
      </label>
      <label class="adminLabel">Marca<input id="invItMarca" type="text" value="${esc(it?.marca || "")}"></label>
      <label class="adminLabel">Cantidad<input id="invItCant" type="number" min="0" value="${it?.cantidad ?? 1}"></label>
      <label class="adminLabel">Estado<select id="invItEstado" class="adminInput">${opts(ESTADOS, it?.estado || "OK")}</select></label>
      <label class="adminLabel">Nota<input id="invItNota" type="text" value="${esc(it?.nota || "")}"></label>
    </div>
  `;
  abrirModal_(itemId ? "Editar herramienta" : "Agregar herramienta", body, async () => {
    let herr = $id("invItHerr")?.value || "";
    const buscado = $id("invItHerrSearch")?.value?.trim() || "";
    // Si escribió el nombre exacto pero no clickeó, resolverlo igual.
    if (!herr && buscado) {
      const exacto = INV.catalogo.find(h => h.nombre.toLowerCase() === buscado.toLowerCase());
      if (exacto) herr = exacto.id;
    }
    const libre = $id("invItLibre")?.value?.trim() || "";
    if (!herr && !libre) { invMsg("Busca una herramienta del catálogo o escribe una descripción libre.", true); return false; }
    const data = {
      inventario_id: INV.invActual.id,
      herramienta_id: herr || null,
      descripcion_libre: herr ? "" : libre,
      marca: $id("invItMarca")?.value?.trim() || "",
      cantidad: Number($id("invItCant")?.value) || 1,
      estado: $id("invItEstado")?.value || "OK",
      nota: $id("invItNota")?.value?.trim() || "",
    };
    try {
      if (itemId) {
        await supabasePatch("inventario_tecnico_items", { id: itemId }, data);
      } else {
        // Si ya existe la misma herramienta con igual marca y estado, sumamos
        // la cantidad en vez de crear una fila repetida.
        const clave = claveItem_(data);
        const dup = INV.invItems.find(x =>
          claveItem_(x) === clave &&
          (x.marca || "").trim().toLowerCase() === data.marca.toLowerCase() &&
          x.estado === data.estado);
        if (dup) {
          const nueva = cantidadDe_(dup) + data.cantidad;
          await supabasePatch("inventario_tecnico_items", { id: dup.id },
            { cantidad: nueva, nota: data.nota || dup.nota || "" });
          invMsg(`Ya existía: se sumó a la cantidad (ahora ${nueva}).`);
        } else {
          data.orden = INV.invItems.length + 1;
          await supabasePost("inventario_tecnico_items", data);
        }
      }
      await abrirInventarioTec_(INV.selTecId, INV.invActual);
      return true;
    } catch (e) { invMsg(e.message, true); return false; }
  });
  wireBuscador_($id("invItHerrSearch"), $id("invItHerrList"), $id("invItHerr"),
    () => { const l = $id("invItLibre"); if (l) l.value = ""; },
    (q) => { // no encontrada → abrir el bloque de creación con el nombre prellenado
      const wrap = $id("invNuevaHerrWrap"); if (wrap) wrap.open = true;
      const cat = adivinarCategoria_(q);
      const catEl = $id("invNHCat"); if (catEl && cat && !catEl.value) catEl.value = cat;
      const nom = $id("invNHNombre");
      if (nom) { nom.value = q; nom.focus(); nom.setSelectionRange(nom.value.length, nom.value.length); }
    });

  // Crear herramienta en el catálogo sin salir de la hoja del técnico.
  const nhMsg = (t, err = false) => {
    const el = $id("invNHMsg"); if (!el) return;
    el.textContent = t || ""; el.style.color = err ? "var(--danger)" : "var(--muted)";
  };
  $id("invNHCrear")?.addEventListener("click", async () => {
    const nombre = $id("invNHNombre")?.value?.trim();
    if (!nombre) { nhMsg("Escribe un nombre.", true); return; }
    const btn = $id("invNHCrear"); if (btn) btn.disabled = true;
    try {
      const [nueva] = await supabasePost("herramientas_catalogo", {
        nombre,
        categoria: ($id("invNHCat")?.value?.trim() || "").toUpperCase(),
        especialidad: $id("invNHEsp")?.value || "AMBOS",
        activo: true,
      });
      await cargarBase_(); // refresca catálogo + catMap (ya buscable)
      const h = nueva || INV.catalogo.find(x => x.nombre.toLowerCase() === nombre.toLowerCase());
      if (h) {
        const hidden = $id("invItHerr"); if (hidden) hidden.value = h.id;
        const search = $id("invItHerrSearch"); if (search) search.value = h.nombre;
        const libre = $id("invItLibre"); if (libre) libre.value = "";
      }
      $id("invNuevaHerrWrap")?.removeAttribute("open");
      nhMsg("Creada y seleccionada ✓");
    } catch (e) {
      nhMsg(/duplicate|unique/i.test(e.message) ? "Ya existe una herramienta con ese nombre." : e.message, true);
    } finally {
      const b = $id("invNHCrear"); if (b) b.disabled = false;
    }
  });
}

// Adivina la categoría a partir del primer token del nombre (ej "alicate de..." → ALICATE)
// buscando entre las categorías existentes. Solo una ayuda; el usuario puede cambiarla.
function adivinarCategoria_(nombre) {
  const n = (nombre || "").trim().toLowerCase();
  if (!n) return "";
  const cats = categoriasDistintas_();
  return cats.find(c => n.startsWith(c.toLowerCase())) || "";
}

async function quitarItem_(itemId) {
  if (!confirm("¿Quitar esta herramienta de la hoja?")) return;
  try {
    await supabaseDelete("inventario_tecnico_items", { id: itemId });
    await abrirInventarioTec_(INV.selTecId, INV.invActual);
  } catch (e) { invMsg(e.message, true); }
}

function editarCabecera_(inv, user) {
  const body = `
    <div class="adminForm">
      <label class="adminLabel">Formato
        <select id="invCabFormato" class="adminInput">${opts(["NUEVO", "ANTIGUO"], inv.formato)}</select>
      </label>
      <label class="adminLabel">Fecha de entrega<input id="invCabFecha" type="date" value="${esc(inv.fecha_entrega || "")}"></label>
      <label class="adminLabel">Inventario tomado por<input id="invCabTomado" type="text" value="${esc(inv.tomado_por || "")}"></label>
      <label class="adminLabel">Observación<input id="invCabObs" type="text" value="${esc(inv.observacion || "")}"></label>
    </div>
  `;
  abrirModal_(`Datos de la hoja · ${esc(user.nombre)}`, body, async () => {
    const data = {
      formato: $id("invCabFormato")?.value || "NUEVO",
      fecha_entrega: $id("invCabFecha")?.value || null,
      tomado_por: $id("invCabTomado")?.value?.trim() || "",
      observacion: $id("invCabObs")?.value?.trim() || "",
      updated_at: new Date().toISOString(),
    };
    try {
      const [upd] = await supabasePatch("inventario_tecnico", { id: inv.id }, data);
      INV.invActual = upd || { ...inv, ...data };
      await abrirInventarioTec_(INV.selTecId, INV.invActual);
      return true;
    } catch (e) { invMsg(e.message, true); return false; }
  });
}

// =====================================================================
//  SUB-VISTA 2 · KITS ESTÁNDAR
// =====================================================================
async function renderKitsSub_() {
  const box = $id("invSubContent");
  if (!box) return;
  box.innerHTML = `<div class="small muted" style="padding:12px;">Cargando kits…</div>`;

  // Traer items de todos los kits de una vez.
  let allItems = [];
  try { allItems = await supabaseGet("inventario_kit_items"); } catch { allItems = []; }
  const itemsByKit = new Map();
  allItems.forEach(ki => {
    if (!itemsByKit.has(ki.kit_id)) itemsByKit.set(ki.kit_id, []);
    itemsByKit.get(ki.kit_id).push(ki);
  });

  const kitsHtml = INV.kits.map(k => {
    const items = (itemsByKit.get(k.id) || []).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const chips = items.map(ki => {
      const h = INV.catMap.get(ki.herramienta_id);
      return `<span class="invKitChip">${esc(h?.nombre || "—")}
        <button class="invKitChipDel" data-kiid="${esc(ki.id)}" title="Quitar del kit">✕</button></span>`;
    }).join("");
    return `
      <div class="adminConfigSection">
        <div class="invDetHead">
          <div>
            <h4 class="adminConfigTitle" style="margin:0;">${esc(k.nombre)}</h4>
            <div class="small muted"><span class="adminBadge">${esc(k.especialidad)}</span> · ${items.length} herramientas</div>
          </div>
          <button class="adminBtnGhost invKitDel" data-kid="${esc(k.id)}">${icon("trash", 14)} Eliminar kit</button>
        </div>
        <div class="invKitChips">${chips || `<span class="small muted">Kit vacío.</span>`}</div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;">
          <div class="invBuscador" style="flex:1;min-width:200px;max-width:320px;">
            <input class="invKitAddSearch" data-kid="${esc(k.id)}" type="text" autocomplete="off"
              placeholder="Buscar herramienta del catálogo…">
            <input type="hidden" class="invKitAddHidden" data-kid="${esc(k.id)}">
            <div class="invSearchList invKitAddList" data-kid="${esc(k.id)}" style="display:none;"></div>
          </div>
          <button class="adminBtnOk invKitAddBtn" data-kid="${esc(k.id)}">Agregar</button>
        </div>
      </div>`;
  }).join("");

  box.innerHTML = `
    <div class="invCatToolbar">
      <p class="small muted" style="flex:1;min-width:180px;margin:0;">
        Kits estándar por especialidad. Edítalos cuando cambien las herramientas que se entregan.
      </p>
      <button id="invBtnNuevoKit" class="adminBtnOk">${icon("plus", 14)} Nuevo kit</button>
    </div>
    ${kitsHtml || `<div class="small muted" style="padding:12px;">No hay kits. Crea uno.</div>`}
  `;

  box.querySelectorAll(".invKitChipDel").forEach(b =>
    b.addEventListener("click", () => quitarDeKit_(b.dataset.kiid)));
  // Buscador por kit
  box.querySelectorAll(".invKitAddSearch").forEach(search => {
    const kid = search.dataset.kid;
    const list   = box.querySelector(`.invKitAddList[data-kid="${kid}"]`);
    const hidden = box.querySelector(`.invKitAddHidden[data-kid="${kid}"]`);
    wireBuscador_(search, list, hidden);
  });
  box.querySelectorAll(".invKitAddBtn").forEach(b =>
    b.addEventListener("click", () => {
      const hidden = box.querySelector(`.invKitAddHidden[data-kid="${b.dataset.kid}"]`);
      const search = box.querySelector(`.invKitAddSearch[data-kid="${b.dataset.kid}"]`);
      let herrId = hidden?.value || "";
      if (!herrId && search?.value?.trim()) {
        const exacto = INV.catalogo.find(h => h.nombre.toLowerCase() === search.value.trim().toLowerCase());
        if (exacto) herrId = exacto.id;
      }
      if (!herrId) { invMsg("Busca y selecciona una herramienta del catálogo.", true); return; }
      agregarAKit_(b.dataset.kid, herrId);
    }));
  box.querySelectorAll(".invKitDel").forEach(b =>
    b.addEventListener("click", () => eliminarKit_(b.dataset.kid)));
  $id("invBtnNuevoKit")?.addEventListener("click", nuevoKit_);
}

async function agregarAKit_(kitId, herrId) {
  if (!herrId) return;
  invMsg("Agregando al kit…");
  try {
    await supabasePost("inventario_kit_items", { kit_id: kitId, herramienta_id: herrId, orden: 999 });
    invMsg("Herramienta agregada al kit.");
    await renderKitsSub_();
  } catch (e) {
    // Violación de UNIQUE (ya existe en el kit) u otro error.
    invMsg(/duplicate|unique/i.test(e.message) ? "Esa herramienta ya está en el kit." : e.message, true);
  }
}

async function quitarDeKit_(kitItemId) {
  try {
    await supabaseDelete("inventario_kit_items", { id: kitItemId });
    await renderKitsSub_();
  } catch (e) { invMsg(e.message, true); }
}

function nuevoKit_() {
  const body = `
    <div class="adminForm">
      <label class="adminLabel">Nombre del kit<input id="invKitNombre" type="text" placeholder="Ej: Mecánica delantera (MOTOR)"></label>
      <label class="adminLabel">Especialidad<select id="invKitEsp" class="adminInput">${opts(ESPECIALIDADES, "AMBOS")}</select></label>
    </div>`;
  abrirModal_("Nuevo kit", body, async () => {
    const nombre = $id("invKitNombre")?.value?.trim();
    if (!nombre) { invMsg("El nombre es requerido.", true); return false; }
    try {
      await supabasePost("inventario_kits", { nombre, especialidad: $id("invKitEsp")?.value || "AMBOS" });
      await cargarBase_();
      await renderKitsSub_();
      return true;
    } catch (e) { invMsg(e.message, true); return false; }
  });
}

async function eliminarKit_(kitId) {
  if (!confirm("¿Eliminar este kit? Los inventarios ya generados NO se tocan.")) return;
  try {
    await supabaseDelete("inventario_kit_items", { kit_id: kitId });
    await supabaseDelete("inventario_kits", { id: kitId });
    await cargarBase_();
    await renderKitsSub_();
  } catch (e) { invMsg(e.message, true); }
}

// =====================================================================
//  SUB-VISTA 3 · CATÁLOGO
// =====================================================================
// Devuelve las categorías distintas del catálogo (para datalist / agrupar).
function categoriasDistintas_() {
  return [...new Set(INV.catalogo.map(h => (h.categoria || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}
// Detalle = nombre sin el prefijo de la categoría (solo para mostrar más limpio).
function detalleDe_(h) {
  const cat = (h.categoria || "").trim();
  const nom = h.nombre || "";
  if (cat && nom.toLowerCase().startsWith(cat.toLowerCase() + " ")) return nom.slice(cat.length + 1);
  return nom;
}

function renderCatalogoSub_(filtro = "") {
  const box = $id("invSubContent");
  if (!box) return;

  const q = filtro.trim().toLowerCase();
  const items = q
    ? INV.catalogo.filter(h => `${h.categoria || ""} ${h.nombre}`.toLowerCase().includes(q))
    : INV.catalogo;

  // Agrupar por categoría.
  const grupos = new Map();
  items.forEach(h => {
    const cat = (h.categoria || "SIN CATEGORÍA").trim() || "SIN CATEGORÍA";
    if (!grupos.has(cat)) grupos.set(cat, []);
    grupos.get(cat).push(h);
  });
  const catsOrden = [...grupos.keys()].sort((a, b) => a.localeCompare(b));

  const gruposHtml = catsOrden.map(cat => {
    const filas = grupos.get(cat)
      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
      .map(h => `
        <tr>
          <td>${esc(detalleDe_(h))}</td>
          <td><span class="adminBadge">${esc(h.especialidad)}</span></td>
          <td>${h.activo ? `<span class="adminBadgeOk">Activo</span>` : `<span class="adminBadgeMuted">Inactivo</span>`}</td>
          <td class="adminActionsCell">
            <button class="adminBtnEdit adminRowBtn invCatEdit" data-hid="${esc(h.id)}" title="Editar">${icon("pencil", 14)}</button>
            <button class="adminBtnDel adminRowBtn adminRowBtn--danger invCatDel" data-hid="${esc(h.id)}" title="Eliminar">${icon("trash", 14)}</button>
          </td>
        </tr>`).join("");
    return `
      <div class="invCatGroup">
        <div class="invCatGroupTitle">${esc(cat)} <span class="invCatCount">${grupos.get(cat).length}</span></div>
        <div class="adminTableScroll">
          <table class="adminTable">
            <thead><tr><th>Detalle</th><th>Especialidad</th><th>Estado</th><th></th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </div>`;
  }).join("");

  box.innerHTML = `
    <p class="small muted">Herramientas agrupadas por categoría. Se comparten entre kits y hojas de técnicos.</p>
    <div class="invCatToolbar">
      <div class="adminSearchWrap" style="flex:1;min-width:180px;">
        <span class="adminSearchIcon" aria-hidden="true">${icon("search", 16)}</span>
        <input id="invCatFilter" type="text" placeholder="Buscar (ej: cate → alicate)…" autocomplete="off" value="${esc(filtro)}">
      </div>
      <button id="invBtnNuevaHerr" class="adminBtnOk">${icon("plus", 14)} Nueva herramienta</button>
    </div>
    <div id="invCatGroups">${gruposHtml || `<div class="small muted" style="padding:12px;">Sin resultados.</div>`}</div>
  `;

  const filterEl = $id("invCatFilter");
  filterEl?.addEventListener("input", e => {
    renderCatalogoSub_(e.target.value);
    // Restaurar foco/cursor tras el re-render.
    const nuevo = $id("invCatFilter");
    if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); }
  });
  box.querySelectorAll(".invCatEdit").forEach(b => b.addEventListener("click", () => editarHerramienta_(b.dataset.hid)));
  box.querySelectorAll(".invCatDel").forEach(b => b.addEventListener("click", () => eliminarHerramienta_(b.dataset.hid)));
  $id("invBtnNuevaHerr")?.addEventListener("click", () => editarHerramienta_(null));
}

function editarHerramienta_(hid) {
  const h = hid ? INV.catMap.get(hid) : null;
  const cats = categoriasDistintas_();
  const body = `
    <div class="adminForm">
      <label class="adminLabel">Categoría <span class="adminLabelHint">(elige una o escribe una nueva)</span>
        <input id="invHCat" type="text" list="invHCatList" value="${esc(h?.categoria || "")}"
          placeholder="Ej: ALICATE, DADO, LLAVE MIXTA…" autocomplete="off">
        <datalist id="invHCatList">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      </label>
      <label class="adminLabel">Nombre completo <span class="adminLabelHint">(al elegir categoría se autocompleta el prefijo)</span>
        <input id="invHNombre" type="text" value="${esc(h?.nombre || "")}" placeholder="Ej: alicate de presión" autocomplete="off">
      </label>
      <label class="adminLabel">Especialidad<select id="invHEsp" class="adminInput">${opts(ESPECIALIDADES, h?.especialidad || "AMBOS")}</select></label>
      <label class="adminLabel adminLabelRow"><input id="invHActivo" type="checkbox"${h?.activo !== false ? " checked" : ""}> Activo</label>
    </div>`;
  abrirModal_(hid ? "Editar herramienta" : "Nueva herramienta", body, async () => {
    const nombre = $id("invHNombre")?.value?.trim();
    if (!nombre) { invMsg("El nombre es requerido.", true); return false; }
    const data = {
      nombre,
      especialidad: $id("invHEsp")?.value || "AMBOS",
      categoria: ($id("invHCat")?.value?.trim() || "").toUpperCase(),
      activo: !!$id("invHActivo")?.checked,
    };
    try {
      if (hid) await supabasePatch("herramientas_catalogo", { id: hid }, data);
      else await supabasePost("herramientas_catalogo", data);
      await cargarBase_();
      renderCatalogoSub_();
      return true;
    } catch (e) {
      invMsg(/duplicate|unique/i.test(e.message) ? "Ya existe una herramienta con ese nombre." : e.message, true);
      return false;
    }
  });
  // Al elegir/escribir categoría, si el nombre está vacío, prefijar para no reescribirla.
  const catEl = $id("invHCat"), nomEl = $id("invHNombre");
  const prefijar = () => {
    const c = (catEl?.value || "").trim();
    if (c && nomEl && !nomEl.value.trim()) {
      nomEl.value = c.toLowerCase() + " ";
      nomEl.focus();
      nomEl.setSelectionRange(nomEl.value.length, nomEl.value.length);
    }
  };
  catEl?.addEventListener("change", prefijar);
}

async function eliminarHerramienta_(hid) {
  if (!confirm("¿Eliminar esta herramienta del catálogo? Se quitará de los kits que la usen.")) return;
  try {
    await supabaseDelete("herramientas_catalogo", { id: hid });
    await cargarBase_();
    renderCatalogoSub_();
  } catch (e) { invMsg(e.message, true); }
}

// =====================================================================
//  Modal propio autocontenido (no toca el #adminModal del panel para
//  no pisar el listener de guardado del CRUD normal).
// =====================================================================
function abrirModal_(titulo, bodyHtml, onSave) {
  document.getElementById("invModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "invModal";
  modal.className = "modal show";
  modal.innerHTML = `
    <div class="modalBox adminModalBox">
      <div class="modalHead">
        <span class="modalTitle">${esc(titulo)}</span>
        <button type="button" class="invModalClose" title="Cerrar">✕</button>
      </div>
      <div class="modalBody">${bodyHtml}</div>
      <div class="adminModalFoot">
        <button type="button" class="adminBtnGhost invModalCancel">Cancelar</button>
        <button type="button" class="adminBtnOk invModalSave">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  const close = () => {
    modal.remove();
    // Puede haber otro modal debajo (la hoja del técnico) → no quitar modal-open aún.
    if (!document.querySelector(".modal.show")) document.body.classList.remove("modal-open");
  };
  modal.querySelector(".invModalClose")?.addEventListener("click", close);
  modal.querySelector(".invModalCancel")?.addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });

  const saveBtn = modal.querySelector(".invModalSave");
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    let ok = false;
    try { ok = await onSave(); } finally { saveBtn.disabled = false; }
    if (ok !== false) close();
  });
  setTimeout(() => modal.querySelector("input,select,textarea")?.focus(), 80);
}
