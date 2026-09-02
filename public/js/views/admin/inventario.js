// =========================
// public/js/views/admin/inventario.js
// Sub-módulo ADMIN · Inventario de herramientas
//   4 vistas: Inventario por técnico · Totales · Kits estándar · Catálogo
// Además: traspaso entre técnicos, asignación masiva y búsqueda por
// código de empresa / número de serie (SN).
// CRUD directo contra Supabase (mismo patrón que el resto del admin).
// =========================
import {
  supabaseGet,
  supabasePost,
  supabasePatch,
  supabaseDelete,
} from "../../core/supabase-client.js";
import { icon } from "../../core/icons.js";
import { CORE, createNameSuggest_ } from "../../core/core.js";
import { exportXls_ } from "../../core/xls.js";

// ─── Estado local del módulo ─────────────────────────────────────────
const INV = {
  sub: "tecnico",        // "tecnico" | "totales" | "kits" | "catalogo"
  catalogo: [],          // herramientas_catalogo
  catMap: new Map(),     // id → herramienta
  kits: [],              // inventario_kits
  usuarios: [],          // usuarios activos
  selTecId: null,        // user_id seleccionado
  invActual: null,       // inventario_tecnico del técnico seleccionado
  invItems: [],          // items del inventario seleccionado
  // Snapshot global (todas las hojas): alimenta buscador y totales.
  hojas: [],             // inventario_tecnico (todas)
  hojaByUser: new Map(), // user_id → inventario_tecnico
  todosItems: [],        // inventario_tecnico_items (todos)
  busq: "",              // texto del buscador global (nombre / código / SN)
  // Existencias: unidades LIBRES en el almacén, por herramienta del catálogo.
  // Las ASIGNADAS no se guardan: se suman de las hojas de los técnicos.
  stock: [],             // inventario_stock (contadores de lo suelto)
  stockByHerr: new Map(),// herramienta_id → fila de inventario_stock
  // Unidades identificadas del almacén (una fila por equipo con código/SN).
  // Lo suelto va en los contadores; lo identificado, aquí. No se solapan.
  unidades: [],          // inventario_stock_unidades
  unidadesByHerr: new Map(), // herramienta_id → unidades[]
  stockFiltro: "",       // texto del filtro de la sub-vista Existencias
  // Qué se está mirando del almacén:
  //   "todo"    → todas las herramientas del catálogo
  //   "alertas" → lo agotado, bajo mínimo o descuadrado (qué reponer)
  //   "taller"  → lo malogrado y lo descontinuado (qué sacar de circulación)
  stockVista: "todo",
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

// ─── Códigos (código de empresa + serie del fabricante) ──────────────
// Un ítem "identificado" (con código o SN) es una unidad física concreta:
// no se fusiona con otras ni se traspasa por partes.
function tieneCodigo_(it) {
  return !!((it?.codigo || "").trim() || (it?.serie || "").trim());
}
// Chips de código/SN para las tablas. Vacío si el ítem no tiene ninguno.
function codigosChips_(it) {
  const out = [];
  if ((it?.codigo || "").trim()) out.push(`<span class="invCodChip" title="Código de la empresa">${esc(it.codigo.trim())}</span>`);
  if ((it?.serie || "").trim())  out.push(`<span class="invCodChip invCodChipSn" title="Número de serie">SN ${esc(it.serie.trim())}</span>`);
  return out.join(" ");
}
// ─── EXISTENCIAS (stock de almacén) ──────────────────────────────────
// Fila de stock de una herramienta (o null si el catálogo la trae sin fila:
// pasa con herramientas creadas antes de correr inventario-stock.sql).
function stockDe_(herrId) {
  return INV.stockByHerr.get(herrId) || null;
}
// Contadores "a granel": herramientas intercambiables, sin código ni SN.
function granelLibresDe_(herrId) {
  return Number(stockDe_(herrId)?.cantidad_almacen) || 0;
}
function granelMalDe_(herrId) {
  return Number(stockDe_(herrId)?.cantidad_malogrado) || 0;
}

// Unidades identificadas (con código de empresa o número de serie): cada
// una es una fila, porque es una cosa física concreta y rastreable.
function unidadesDe_(herrId, estado = null) {
  const arr = INV.unidadesByHerr.get(herrId) || [];
  if (!estado) return arr;
  return estado === "MAL" ? arr.filter(u => u.estado === "MAL") : arr.filter(u => u.estado !== "MAL");
}

// Lo que se puede entregar = suelto sano + unidades identificadas sanas.
function libresDe_(herrId) {
  return granelLibresDe_(herrId) + unidadesDe_(herrId, "OK").length;
}
// Rotas que siguen en el estante: cuentan como patrimonio, pero no se
// pueden entregar hasta que se reparen.
function malogradasDe_(herrId) {
  return granelMalDe_(herrId) + unidadesDe_(herrId, "MAL").length;
}
// Etiqueta corta de una unidad identificada, para listas y selects.
function etiquetaUnidad_(u) {
  const partes = [];
  if ((u.codigo || "").trim()) partes.push(u.codigo.trim());
  if ((u.serie  || "").trim()) partes.push(`SN ${u.serie.trim()}`);
  if ((u.marca  || "").trim()) partes.push(u.marca.trim());
  return partes.join(" · ") || "sin identificar";
}
// Una herramienta descontinuada no se borra (rompería el histórico de quién
// la tuvo): se marca inactiva y deja de ofrecerse en entregas y kits.
function descontinuada_(herr) {
  return herr?.activo === false;
}
// ¿Está cargado el módulo de existencias? (sin SQL v3 no hay filas)
function stockDisponible_() {
  return INV.stock.length > 0;
}

// Unidades ASIGNADAS por herramienta del catálogo, calculadas del snapshot
// de todas las hojas: herramienta_id → { unidades, tecnicos:Set }.
// Los ítems de descripción libre no entran (no tienen fila en el catálogo).
function asignadasPorHerr_() {
  const userByHoja = new Map(INV.hojas.map(h => [h.id, h.user_id]));
  const map = new Map();
  INV.todosItems.forEach(it => {
    if (!it.herramienta_id) return;
    let e = map.get(it.herramienta_id);
    if (!e) { e = { unidades: 0, tecnicos: new Set() }; map.set(it.herramienta_id, e); }
    e.unidades += cantidadDe_(it);
    const uid = userByHoja.get(it.inventario_id);
    if (uid) e.tecnicos.add(uid);
  });
  return map;
}

// Mueve unidades A GRANEL entre las dos pilas del almacén y deja el
// movimiento en la bitácora. Las unidades identificadas no pasan por aquí:
// esas cambian de estado o de tabla, una por una.
// `deltas` acepta { libres, malogradas }; positivo entra, negativo sale.
// Una avería es { libres: -n, malogradas: +n } — no cambia el total físico,
// solo deja de estar disponible.
// Devuelve { libres, malogradas } o null si la herramienta no tiene fila de
// stock (ítem de descripción libre, o SQL v3 sin correr): en ese caso no se
// inventa nada, simplemente el almacén no participa.
async function ajustarStock_(herrId, deltas = {}, mov = {}) {
  if (!herrId) return null;
  const fila = stockDe_(herrId);
  if (!fila) return null;

  const dLibres = Number(deltas.libres) || 0;
  const dMal    = Number(deltas.malogradas) || 0;
  if (!dLibres && !dMal) return { libres: granelLibresDe_(herrId), malogradas: granelMalDe_(herrId) };

  const data = { updated_at: new Date().toISOString() };
  if (dLibres) data.cantidad_almacen   = (Number(fila.cantidad_almacen) || 0) + dLibres;
  if (dMal)    data.cantidad_malogrado = (Number(fila.cantidad_malogrado) || 0) + dMal;

  await supabasePatch("inventario_stock", { id: fila.id }, data);
  Object.assign(fila, data);

  if (mov.tipo) {
    await logMov_({
      herramienta_id: herrId,
      descripcion: INV.catMap.get(herrId)?.nombre || "",
      // La cantidad del movimiento es cuántas unidades se tocaron, no la suma
      // de los dos deltas (en una avería las mismas n cambian de pila).
      cantidad: Math.max(Math.abs(dLibres), Math.abs(dMal)),
      ...mov,
    });
  }
  return { libres: Number(fila.cantidad_almacen) || 0, malogradas: Number(fila.cantidad_malogrado) || 0 };
}

// Atajo para el caso común: solo entran o salen unidades sanas.
// Devuelve el saldo de libres (o null si no hay ficha de almacén).
async function moverStock_(herrId, delta, mov = {}) {
  if (!delta) return null;
  const r = await ajustarStock_(herrId, { libres: delta }, mov);
  return r ? r.libres : null;
}

// Asegura que la herramienta tenga fila de stock (para catálogos viejos
// creados antes del trigger de inventario-stock.sql).
async function asegurarStock_(herrId) {
  if (!herrId || stockDe_(herrId)) return stockDe_(herrId);
  if (!stockDisponible_()) return null;
  try {
    const [fila] = await supabasePost("inventario_stock", { herramienta_id: herrId, cantidad_almacen: 0 });
    if (fila) { INV.stock.push(fila); INV.stockByHerr.set(herrId, fila); }
    return fila || null;
  } catch { return null; }
}

// Semáforo de una herramienta.
//
// Ojo con el caso que parece un problema y no lo es: 0 libres pero varias
// repartidas entre técnicos NO es "agotado", es que está toda en uso. La
// herramienta existe físicamente, solo que no queda repuesto en el estante.
// Solo hay alarma si se pidió expresamente tener repuesto (stock mínimo > 0).
//
//   descuadre → saldo negativo (se entregó más de lo registrado)
//   agotado   → se quería repuesto (mínimo > 0) y no queda ninguno
//   bajo      → por debajo del punto de pedido
//   asignado  → 0 libres, pero todas las unidades están con los técnicos
//   vacio     → está en el catálogo y no hay ninguna en ningún lado
//   ok        → hay libres para entregar
function nivelStock_(libres, minimo, total = libres) {
  if (libres < 0) return "descuadre";
  if (minimo > 0 && libres === 0) return "agotado";
  if (minimo > 0 && libres <= minimo) return "bajo";
  if (libres === 0) return total > 0 ? "asignado" : "vacio";
  return "ok";
}
const NIVEL_META = {
  descuadre: { clase: "invBadge--danger", label: "Descuadre" },
  agotado:   { clase: "invBadge--danger", label: "Agotado" },
  bajo:      { clase: "invBadge--warn",   label: "Bajo mínimo" },
  asignado:  { clase: "invBadge--ok",     label: "Todo en uso" },
  vacio:     { clase: "invBadge--muted",  label: "Sin registrar" },
  ok:        { clase: "invBadge--ok",     label: "Disponible" },
};
// Los tres que piden acción del encargado del almacén.
const NIVELES_ALERTA = ["descuadre", "agotado", "bajo"];

function nivelBadge_(libres, minimo, total) {
  const m = NIVEL_META[nivelStock_(libres, minimo, total)];
  const titulo = {
    asignado: "No queda repuesto en el estante, pero todas las unidades están con los técnicos",
    vacio:    "Está en el catálogo pero no hay ninguna unidad registrada todavía",
    agotado:  "Se pidió tener repuesto (stock mínimo) y no queda ninguno libre",
  }[nivelStock_(libres, minimo, total)] || "";
  return `<span class="invBadge ${m.clase}"${titulo ? ` title="${esc(titulo)}"` : ""}>${m.label}</span>`;
}

// ─── Usuarios / hojas ────────────────────────────────────────────────
function nombreUsuario_(userId) {
  return INV.usuarios.find(u => u.id === userId)?.nombre || "—";
}
// Quién está operando (para la bitácora).
function operador_() {
  const p = CORE?.state?.currentProfile;
  return p?.nombre || p?.email || "";
}

// Devuelve la hoja del técnico; si no tiene, la crea vacía.
// Se usa al asignar/traspasar hacia alguien que aún no tenía inventario.
async function asegurarHoja_(userId) {
  const ya = INV.hojaByUser.get(userId);
  if (ya) return ya;
  const [hoja] = await supabasePost("inventario_tecnico", {
    user_id: userId,
    formato: "NUEVO",
    fecha_entrega: new Date().toISOString().slice(0, 10),
  });
  INV.hojaByUser.set(userId, hoja);
  INV.hojas.push(hoja);
  return hoja;
}

// Inserta un ítem en una hoja, sumando la cantidad si ya existe uno
// equivalente (misma herramienta + marca + estado y ninguno identificado
// por código/SN). Devuelve { sumado: bool, cantidad }.
async function insertarOSumar_(hojaId, data, itemsDestino) {
  const clave = claveItem_(data);
  const dup = tieneCodigo_(data) ? null : (itemsDestino || []).find(x =>
    !tieneCodigo_(x) &&
    claveItem_(x) === clave &&
    (x.marca || "").trim().toLowerCase() === (data.marca || "").trim().toLowerCase() &&
    x.estado === data.estado);
  if (dup) {
    const cantidad = cantidadDe_(dup) + cantidadDe_(data);
    await supabasePatch("inventario_tecnico_items", { id: dup.id }, { cantidad });
    dup.cantidad = cantidad;
    return { sumado: true, cantidad };
  }
  const orden = (itemsDestino || []).reduce((m, x) => Math.max(m, Number(x.orden) || 0), 0) + 1;
  const [creado] = await supabasePost("inventario_tecnico_items", { ...data, inventario_id: hojaId, orden });
  if (creado) (itemsDestino || []).push(creado);
  return { sumado: false, cantidad: cantidadDe_(data) };
}

// Bitácora de movimientos. Nunca bloquea la operación: si la tabla aún
// no existe (SQL sin correr), el movimiento se pierde pero el traspaso vale.
async function logMov_(mov) {
  try {
    await supabasePost("inventario_movimientos", {
      hecho_por: operador_(),
      origen_nombre: mov.origen_user_id ? nombreUsuario_(mov.origen_user_id) : "",
      destino_nombre: mov.destino_user_id ? nombreUsuario_(mov.destino_user_id) : "",
      ...mov,
    });
  } catch (e) {
    console.warn("[inventario] movimiento no registrado:", e.message);
  }
}

// Mensaje de error legible para choques de código/SN duplicado.
function errorMsg_(e) {
  const m = e?.message || String(e);
  if (/idx_inv_items_codigo_uniq|idx_inv_stku_codigo_uniq/.test(m))
    return "Ese código de empresa ya está registrado en otra unidad.";
  if (/idx_inv_items_serie_uniq|idx_inv_stku_serie_uniq/.test(m))
    return "Ese número de serie ya está registrado en otra unidad.";
  if (/inventario_stock_unidades.*does not exist|relation .*stock_unidades/i.test(m))
    return "Falta la tabla de unidades. Ejecuta supabase/inventario-stock.sql en Supabase.";
  return m;
}

// ─── Carga base (catálogo + kits + usuarios) ─────────────────────────
async function cargarBase_() {
  const [cat, kits, usuarios, stock] = await Promise.all([
    supabaseGet("herramientas_catalogo").catch(() => []),
    supabaseGet("inventario_kits").catch(() => []),
    supabaseGet("usuarios", { activo: true }).catch(() => []),
    // Si aún no se corrió inventario-stock.sql, esto falla y el módulo de
    // existencias se muestra apagado en vez de romper toda la vista.
    supabaseGet("inventario_stock").catch(() => []),
  ]);
  INV.stock = stock || [];
  INV.stockByHerr = new Map(INV.stock.map(s => [s.herramienta_id, s]));
  INV.catalogo = (cat || []).sort((a, b) => a.nombre.localeCompare(b.nombre));
  INV.catMap = new Map(INV.catalogo.map(h => [h.id, h]));
  INV.kits = kits || [];
  INV.usuarios = (usuarios || []).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
}

// Snapshot de TODAS las hojas + ítems (buscador global, totales, traspaso).
async function cargarSnapshot_() {
  const [hojas, items, unidades] = await Promise.all([
    supabaseGet("inventario_tecnico").catch(() => []),
    supabaseGet("inventario_tecnico_items").catch(() => []),
    // Sin la v3 del SQL esta tabla no existe: el almacén sigue funcionando
    // solo con contadores a granel.
    supabaseGet("inventario_stock_unidades").catch(() => []),
  ]);
  INV.hojas = hojas || [];
  INV.hojaByUser = new Map(INV.hojas.map(h => [h.user_id, h]));
  INV.todosItems = items || [];
  indexarUnidades_(unidades || []);
  return INV.todosItems;
}

// Reagrupa las unidades identificadas por herramienta. Se llama tras cada
// carga y tras cada alta/baja, para no ir a la red por cada consulta.
function indexarUnidades_(lista) {
  INV.unidades = lista;
  const map = new Map();
  lista.forEach(u => {
    if (!map.has(u.herramienta_id)) map.set(u.herramienta_id, []);
    map.get(u.herramienta_id).push(u);
  });
  map.forEach(arr => arr.sort((a, b) => etiquetaUnidad_(a).localeCompare(etiquetaUnidad_(b))));
  INV.unidadesByHerr = map;
}

// ¿Estamos en la página propia (/inventario) o dentro del panel de Admin?
// En la página propia sobra el enlace a "ventana completa".
function enPaginaPropia_() {
  return /^\/inventario\/?$/i.test(location.pathname);
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
        <button class="invSubtab" data-sub="stock">${icon("trayIn", 15)} Existencias</button>
        <button class="invSubtab" data-sub="totales">${icon("chart", 15)} Totales</button>
        <button class="invSubtab" data-sub="kits">${icon("box", 15)} Kits estándar</button>
        <button class="invSubtab" data-sub="catalogo">${icon("clipboardList", 15)} Catálogo</button>
        ${enPaginaPropia_() ? "" : `<a class="invSubtabLink" href="/inventario" title="Abrir el inventario en su propia ventana">${icon("box", 14)} Ventana completa</a>`}
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
  if (sub === "stock")    return renderStockSub_();
  if (sub === "totales")  return renderTotalesSub_();
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
  await cargarSnapshot_();
  const todosItems = INV.todosItems;
  const invByUser = INV.hojaByUser;

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
  const identificadas = todosItems.filter(tieneCodigo_).length;

  box.innerHTML = `
    <p class="small muted">
      Cada técnico tiene su hoja. Los <strong>nuevos</strong> se generan desde un kit estándar (MOTOR/TANQUE);
      los <strong>antiguos</strong> conservan su lista libre importada del Excel.
    </p>
    <div class="invCatToolbar">
      <div class="adminSearchWrap invBuscador" style="flex:1;min-width:220px;">
        <span class="adminSearchIcon" aria-hidden="true">${icon("users", 16)}</span>
        <input id="invTecFind" type="text" autocomplete="off"
          placeholder="Busca un técnico por su nombre y abre su hoja…">
        <input type="hidden" id="invTecFindId">
        <div id="invTecFindList" class="vinSuggest hidden" role="listbox"></div>
      </div>
    </div>
    <div class="invCatToolbar">
      <div class="adminSearchWrap" style="flex:1;min-width:220px;">
        <span class="adminSearchIcon" aria-hidden="true">${icon("search", 16)}</span>
        <input id="invBusqGlobal" type="text" autocomplete="off" value="${esc(INV.busq)}"
          placeholder="Buscar por código, SN o herramienta… (¿quién la tiene?)">
      </div>
      <button id="invBtnAsignarMulti" class="adminBtnOk">${icon("users", 14)} Asignar a varios</button>
      <button id="invBtnExcelGen" class="adminBtnGhost" title="Descargar todo el inventario en Excel">${icon("download", 14)} Excel general</button>
    </div>
    <div id="invBusqResult"></div>
    <div class="invResumen">
      <span class="invResumenChip">Técnicos con hoja <strong>${tecnicosConHoja}</strong></span>
      <span class="invResumenChip">Herramientas entregadas <strong>${totalUnidades}</strong></span>
      <span class="invResumenChip">Promedio por técnico <strong>${promedio}</strong></span>
      <span class="invResumenChip">Con código/SN <strong>${identificadas}</strong></span>
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
  $id("invBtnAsignarMulti")?.addEventListener("click", abrirAsignarMultiple_);
  $id("invBtnExcelGen")?.addEventListener("click", exportarGeneralXls_);

  // Encuentra al técnico escribiendo su nombre y le abre la hoja directo:
  // con 40+ técnicos es más rápido que buscarlo en la tabla.
  wireTecnicoSuggest_("invTecFind", "invTecFindList", "invTecFindId", (item) => {
    const uid = item.userId;
    if (uid) abrirInventarioTec_(uid, INV.hojaByUser.get(uid) || null);
  });

  const busqEl = $id("invBusqGlobal");
  busqEl?.addEventListener("input", () => { INV.busq = busqEl.value; pintarBusqueda_(); });
  pintarBusqueda_();
}

// ── Buscador global: ¿quién tiene esta herramienta / este código? ──
// Busca sobre el snapshot ya cargado (sin ir a la red en cada tecla).
function pintarBusqueda_() {
  const box = $id("invBusqResult");
  if (!box) return;
  const q = (INV.busq || "").trim().toLowerCase();
  if (!q) { box.innerHTML = ""; return; }

  const userByHoja = new Map(INV.hojas.map(h => [h.id, h.user_id]));
  const hits = INV.todosItems.filter(it => {
    const cod = (it.codigo || "").toLowerCase();
    const sn  = (it.serie  || "").toLowerCase();
    // Los códigos matchean por "contiene" (los técnicos leen los últimos dígitos).
    return cod.includes(q) || sn.includes(q) ||
      nombreItem(it).toLowerCase().includes(q) ||
      (it.marca || "").toLowerCase().includes(q);
  }).slice(0, 60);

  if (!hits.length) {
    box.innerHTML = `<div class="invBusqBox"><div class="small muted">Sin resultados para “${esc(INV.busq)}”.</div></div>`;
    return;
  }

  const filas = hits.map(it => {
    const uid = userByHoja.get(it.inventario_id);
    return `
      <tr>
        <td>${esc(nombreItem(it))}</td>
        <td>${codigosChips_(it) || `<span class="small muted">—</span>`}</td>
        <td>${esc(it.marca || "—")}</td>
        <td style="text-align:center;">${cantidadDe_(it)}</td>
        <td>${estadoBadge(it.estado)}</td>
        <td><strong>${esc(nombreUsuario_(uid))}</strong></td>
        <td class="adminActionsCell">
          <button class="adminBtnEdit adminRowBtn invBusqIr" data-uid="${esc(uid || "")}" title="Abrir su hoja">
            ${icon("chevronRight", 14)}
          </button>
        </td>
      </tr>`;
  }).join("");

  box.innerHTML = `
    <div class="invBusqBox">
      <div class="invBusqHead">${hits.length} resultado(s) para “${esc(INV.busq)}”</div>
      <div class="adminTableScroll">
        <table class="adminTable">
          <thead><tr><th>Herramienta</th><th>Código / SN</th><th>Marca</th><th>Cant.</th><th>Estado</th><th>La tiene</th><th></th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    </div>`;

  box.querySelectorAll(".invBusqIr").forEach(b => b.addEventListener("click", () => {
    const uid = b.dataset.uid;
    if (uid) abrirInventarioTec_(uid, INV.hojaByUser.get(uid) || null);
  }));
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
  const identificadas = INV.invItems.filter(tieneCodigo_).length;
  const grupos = agruparItems_(INV.invItems);

  const accionesItem = it => `
    <button class="adminBtnEdit adminRowBtn invItemEdit" data-itid="${esc(it.id)}" title="Editar">${icon("pencil", 14)}</button>
    <button class="adminBtnEdit adminRowBtn invItemMover" data-itid="${esc(it.id)}" title="Traspasar a otro técnico">${icon("swap", 14)}</button>
    ${stockDisponible_() && it.herramienta_id ? `<button class="adminBtnEdit adminRowBtn invItemDevolver" data-itid="${esc(it.id)}" title="Devolver al almacén">${icon("trayIn", 14)}</button>` : ""}
    <button class="adminBtnDel adminRowBtn adminRowBtn--danger invItemDel" data-itid="${esc(it.id)}" title="Quitar">${icon("trash", 14)}</button>`;

  const filas = grupos.map(g => {
    const multi = g.items.length > 1;
    const codsGrupo = g.items.map(codigosChips_).filter(Boolean).join(" ");
    const fila = `
      <tr class="invGrupoRow${multi ? " invGrupoRowMulti" : ""}" data-key="${esc(g.key)}">
        <td>
          ${multi ? `<button class="invGrupoToggle" data-key="${esc(g.key)}" title="Ver los ${g.items.length} registros">${icon("chevronRight", 13)}</button>` : ""}
          ${esc(g.nombre)}
          ${multi ? `<span class="invGrupoN">${g.items.length} registros</span>` : ""}
        </td>
        <td>${codsGrupo || `<span class="small muted">—</span>`}</td>
        <td>${esc(g.marcas.join(", ") || "—")}</td>
        <td style="text-align:center;"><strong>${g.cantidad}</strong></td>
        <td>${estadosGrupo_(g)}</td>
        <td class="small muted">${esc(g.notas.join(" · "))}</td>
        <td class="adminActionsCell">${multi ? "" : accionesItem(g.items[0])}</td>
      </tr>`;
    if (!multi) return fila;
    const subs = g.items.map(it => `
      <tr class="invSubRow" data-key="${esc(g.key)}" hidden>
        <td class="invSubCell">↳ ${esc(nombreItem(it))}</td>
        <td>${codigosChips_(it) || `<span class="small muted">—</span>`}</td>
        <td>${esc(it.marca || "—")}</td>
        <td style="text-align:center;">${cantidadDe_(it)}</td>
        <td>${estadoBadge(it.estado)}</td>
        <td class="small muted">${esc(it.nota || "")}</td>
        <td class="adminActionsCell">${accionesItem(it)}</td>
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
          <button id="invBtnAuditar" class="adminBtnGhost" title="Pasar lista y marcar el estado de todo">${icon("listChecks", 14)} Auditoría</button>
          <button id="invBtnTraspasar" class="adminBtnGhost" title="Pasar herramientas a otro técnico">${icon("swap", 14)} Traspasar</button>
          <button id="invBtnExcelTec" class="adminBtnGhost" title="Descargar esta hoja en Excel">${icon("download", 14)} Excel</button>
          <button class="adminBtnGhost invEditCab" title="Editar datos de la hoja">${icon("settings", 14)} Datos</button>
        </div>
      </div>

      <div class="invResumen">
        <span class="invResumenChip">Total <strong>${total}</strong> uds</span>
        <span class="invResumenChip">Distintas <strong>${grupos.length}</strong></span>
        ${ESTADOS.map(e => `<span class="invResumenChip">${ESTADO_LABEL[e]} <strong>${conteo[e]}</strong></span>`).join("")}
        ${identificadas ? `<span class="invResumenChip">Con código/SN <strong>${identificadas}</strong></span>` : ""}
      </div>

      <div class="adminTableScroll" style="margin-top:10px;">
        <table class="adminTable">
          <thead><tr><th>Herramienta</th><th>Código / SN</th><th>Marca</th><th>Cant.</th><th>Estado</th><th>Nota</th><th></th></tr></thead>
          <tbody>${filas || `<tr><td colspan="7" class="small muted" style="padding:12px;">Hoja vacía. Agrega herramientas.</td></tr>`}</tbody>
        </table>
      </div>

      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
        <button id="invBtnDelInv" class="adminBtnGhost invBtnDanger">${icon("trash", 14)} Eliminar hoja completa</button>
      </div>
    </div>
  `;

  det.querySelectorAll(".invItemEdit").forEach(b => b.addEventListener("click", () => editarItem_(b.dataset.itid)));
  det.querySelectorAll(".invItemDel").forEach(b => b.addEventListener("click", () => quitarItem_(b.dataset.itid)));
  det.querySelectorAll(".invItemMover").forEach(b => b.addEventListener("click", () => abrirTraspaso_(user, [b.dataset.itid])));
  det.querySelectorAll(".invItemDevolver").forEach(b => b.addEventListener("click", () => devolverAlAlmacen_(b.dataset.itid)));
  // Desplegar/plegar los registros individuales de un grupo repetido.
  det.querySelectorAll(".invGrupoToggle").forEach(b => b.addEventListener("click", () => {
    const abierto = b.classList.toggle("invGrupoToggleOpen");
    det.querySelectorAll(`.invSubRow[data-key="${CSS.escape(b.dataset.key)}"]`)
      .forEach(tr => { tr.hidden = !abierto; });
  }));
  $id("invBtnAddItem")?.addEventListener("click", () => editarItem_(null));
  $id("invBtnAuditar")?.addEventListener("click", () => abrirAuditoria_(user, inv));
  $id("invBtnTraspasar")?.addEventListener("click", () => abrirTraspaso_(user, []));
  $id("invBtnExcelTec")?.addEventListener("click", () => exportarTecnicoXls_(user, inv));
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

      <div class="invCodGrid">
        <label class="adminLabel">Código de la empresa <span class="adminLabelHint">(etiqueta interna)</span>
          <input id="invItCodigo" type="text" value="${esc(it?.codigo || "")}" placeholder="Ej: GLP-0142" autocomplete="off">
        </label>
        <label class="adminLabel">N° de serie (SN) <span class="adminLabelHint">(del fabricante)</span>
          <input id="invItSerie" type="text" value="${esc(it?.serie || "")}" placeholder="Ej: 12A4-889231" autocomplete="off">
        </label>
      </div>
      <div class="small muted" style="margin-top:-4px;">
        Solo para equipos identificables (taladros, etc.). Al ponerle código o SN la herramienta se
        trata como <strong>una unidad concreta</strong>: no se suma con otras y se traspasa entera.
      </div>

      <label class="adminLabel">Cantidad<input id="invItCant" type="number" min="0" value="${it?.cantidad ?? 1}"></label>
      <label class="adminLabel">Estado<select id="invItEstado" class="adminInput">${opts(ESTADOS, it?.estado || "OK")}</select></label>
      ${stockDisponible_() ? `<label class="adminLabel adminLabelRow invStockCheck">
        <input id="invItDescontar" type="checkbox"> Descontar del almacén
        <span class="adminLabelHint">Márcalo si la herramienta sale del estante ahora. Déjalo sin marcar si solo estás registrando lo que el técnico <em>ya tenía</em>.</span>
      </label>` : ""}
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
    const codigo = $id("invItCodigo")?.value?.trim() || "";
    const serie  = $id("invItSerie")?.value?.trim() || "";
    const data = {
      herramienta_id: herr || null,
      descripcion_libre: herr ? "" : libre,
      marca: $id("invItMarca")?.value?.trim() || "",
      codigo,
      serie,
      cantidad: Number($id("invItCant")?.value) || 1,
      estado: $id("invItEstado")?.value || "OK",
      nota: $id("invItNota")?.value?.trim() || "",
    };
    // Una unidad identificada por código/SN es una sola: no admite cantidad > 1.
    if ((codigo || serie) && data.cantidad !== 1) {
      invMsg("Una herramienta con código o SN identifica una sola unidad: la cantidad debe ser 1.", true);
      return false;
    }
    try {
      if (itemId) {
        await supabasePatch("inventario_tecnico_items", { id: itemId }, { ...data, inventario_id: INV.invActual.id });
      } else {
        // Si ya existe la misma herramienta con igual marca y estado, sumamos
        // la cantidad en vez de crear una fila repetida (salvo con código/SN).
        const r = await insertarOSumar_(INV.invActual.id, data, INV.invItems);
        if (r.sumado) invMsg(`Ya existía: se sumó a la cantidad (ahora ${r.cantidad}).`);
        await logMov_({
          tipo: "ASIGNACION",
          herramienta_id: data.herramienta_id,
          descripcion: nombreItem(data),
          marca: data.marca, serie: data.serie, codigo: data.codigo,
          cantidad: data.cantidad,
          destino_user_id: INV.selTecId,
          destino_nombre: nombreUsuario_(INV.selTecId),
          nota: data.nota,
        });
        // El saldo del almacén solo se toca si la herramienta salió del
        // estante ahora (el movimiento ya quedó arriba como ASIGNACION).
        if ($id("invItDescontar")?.checked) await moverStock_(data.herramienta_id, -data.cantidad);
      }
      await abrirInventarioTec_(INV.selTecId, INV.invActual);
      return true;
    } catch (e) { invMsg(errorMsg_(e), true); return false; }
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
//  TRASPASO DE HERRAMIENTAS ENTRE TÉCNICOS
//  Mueve ítems de la hoja del técnico origen a la del destino. Si el
//  destino no tenía hoja, se le crea. Las unidades con código/SN se
//  mueven enteras (son una unidad física concreta); el resto admite
//  traspaso parcial (2 martillos → paso 1).
// =====================================================================
function abrirTraspaso_(origen, preseleccion = []) {
  if (!INV.invItems.length) { invMsg("La hoja está vacía: no hay nada que traspasar.", true); return; }
  const pre = new Set(preseleccion.filter(Boolean));

  const destinos = INV.usuarios.filter(u => u.id !== origen.id);
  if (!destinos.length) { invMsg("No hay otro técnico activo al que traspasar.", true); return; }

  const filas = INV.invItems.map(it => {
    const fijo = tieneCodigo_(it);
    return `
      <tr>
        <td style="width:28px;">
          <input type="checkbox" class="invTrasChk" data-itid="${esc(it.id)}"${pre.has(it.id) ? " checked" : ""}>
        </td>
        <td>${esc(nombreItem(it))}${it.marca ? `<span class="small muted"> · ${esc(it.marca)}</span>` : ""}</td>
        <td>${codigosChips_(it) || `<span class="small muted">—</span>`}</td>
        <td>${estadoBadge(it.estado)}</td>
        <td style="text-align:center;">${cantidadDe_(it)}</td>
        <td style="width:92px;">
          <input type="number" class="invTrasCant" data-itid="${esc(it.id)}" min="1"
            max="${cantidadDe_(it)}" value="${cantidadDe_(it)}"${fijo ? " disabled" : ""}
            title="${fijo ? "Con código/SN se traspasa la unidad completa" : "Cuántas unidades pasar"}">
        </td>
      </tr>`;
  }).join("");

  const body = `
    <div class="adminForm">
      <label class="adminLabel">Traspasar de <strong>${esc(origen.nombre)}</strong> a
        <select id="invTrasDestino" class="adminInput">
          <option value="">— Elige al técnico que las recibe —</option>
          ${destinos.map(u => `<option value="${esc(u.id)}">${esc(u.nombre)} · ${esc(u.especialidad)}</option>`).join("")}
        </select>
      </label>
      <div class="invTrasHead">
        <button type="button" id="invTrasTodo" class="adminBtnOk adminRowBtn">
          ${icon("swap", 13)} Traspasar TODO el inventario
        </button>
        <button type="button" id="invTrasNada" class="adminBtnGhost adminRowBtn">Ninguna</button>
        <span id="invTrasCuenta" class="invResumenChip"></span>
      </div>
      <div id="invTrasAviso"></div>
      <div class="adminTableScroll invTrasTabla">
        <table class="adminTable">
          <thead><tr><th></th><th>Herramienta</th><th>Código / SN</th><th>Estado</th><th>Tiene</th><th>Pasa</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <label class="adminLabel">Motivo / nota <span class="adminLabelHint">(queda en el historial)</span>
        <input id="invTrasNota" type="text" placeholder="Ej: cambio de cuadrilla, préstamo, cese">
      </label>
    </div>`;

  abrirModal_(`Traspasar herramientas · ${esc(origen.nombre)}`, body, async () => {
    const destinoId = $id("invTrasDestino")?.value || "";
    if (!destinoId) { invMsg("Elige al técnico que recibe las herramientas.", true); return false; }

    const elegidos = [...document.querySelectorAll(".invTrasChk")]
      .filter(chk => chk.checked)
      .map(chk => {
        const it = INV.invItems.find(x => x.id === chk.dataset.itid);
        const inp = document.querySelector(`.invTrasCant[data-itid="${CSS.escape(chk.dataset.itid)}"]`);
        const pedida = tieneCodigo_(it) ? cantidadDe_(it) : (Number(inp?.value) || 0);
        return { it, cant: Math.max(1, Math.min(pedida, cantidadDe_(it))) };
      })
      .filter(x => x.it);
    if (!elegidos.length) { invMsg("Marca al menos una herramienta.", true); return false; }

    const nota = $id("invTrasNota")?.value?.trim() || "";
    invMsg("Traspasando…");
    try {
      const hojaDestino = await asegurarHoja_(destinoId);
      const itemsDestino = await supabaseGet("inventario_tecnico_items", { inventario_id: hojaDestino.id });

      for (const { it, cant } of elegidos) {
        const total = cantidadDe_(it);
        if (cant >= total) {
          if (tieneCodigo_(it)) {
            // Unidad identificada: se mueve la fila tal cual (conserva código/SN).
            const orden = itemsDestino.reduce((m, x) => Math.max(m, Number(x.orden) || 0), 0) + 1;
            await supabasePatch("inventario_tecnico_items", { id: it.id },
              { inventario_id: hojaDestino.id, orden });
            itemsDestino.push({ ...it, inventario_id: hojaDestino.id, orden });
          } else {
            // Sin código: se funde con lo que el destino ya tenga igual.
            await insertarOSumar_(hojaDestino.id, itemPlano_(it, total), itemsDestino);
            await supabaseDelete("inventario_tecnico_items", { id: it.id });
          }
        } else {
          // Traspaso parcial: se descuenta del origen y se suma en el destino.
          await supabasePatch("inventario_tecnico_items", { id: it.id }, { cantidad: total - cant });
          await insertarOSumar_(hojaDestino.id, itemPlano_(it, cant), itemsDestino);
        }
        await logMov_({
          tipo: "TRASPASO",
          herramienta_id: it.herramienta_id || null,
          descripcion: nombreItem(it),
          marca: it.marca || "", serie: it.serie || "", codigo: it.codigo || "",
          cantidad: cant,
          origen_user_id: origen.id,
          destino_user_id: destinoId,
          nota,
        });
      }

      invMsg(`${elegidos.length} herramienta(s) traspasada(s) a ${nombreUsuario_(destinoId)}.`);
      await cargarSnapshot_();
      await abrirInventarioTec_(INV.selTecId, INV.invActual);
      return true;
    } catch (e) { invMsg(errorMsg_(e), true); return false; }
  });

  // Contador vivo + aviso cuando se lleva la hoja entera (caso cese /
  // cambio de cuadrilla): el origen queda sin herramientas.
  const recontar = () => {
    const chks = [...document.querySelectorAll(".invTrasChk")];
    const marcados = chks.filter(c => c.checked);
    const uds = marcados.reduce((s, c) => {
      const inp = document.querySelector(`.invTrasCant[data-itid="${CSS.escape(c.dataset.itid)}"]`);
      const it = INV.invItems.find(x => x.id === c.dataset.itid);
      return s + (tieneCodigo_(it) ? cantidadDe_(it) : Math.min(Number(inp?.value) || 0, cantidadDe_(it)));
    }, 0);
    const cuenta = $id("invTrasCuenta");
    if (cuenta) cuenta.innerHTML = `<strong>${marcados.length}</strong> de ${chks.length} · ${uds} uds`;
    const aviso = $id("invTrasAviso");
    const todo = chks.length && marcados.length === chks.length &&
      uds === totalUnidades_(INV.invItems);
    if (aviso) {
      aviso.innerHTML = todo
        ? `<div class="invAvisoFalta">⚠️ Se traspasa <strong>todo el inventario</strong>:
             ${esc(origen.nombre)} queda con la hoja vacía.</div>`
        : "";
    }
  };
  $id("invTrasTodo")?.addEventListener("click", () => {
    document.querySelectorAll(".invTrasChk").forEach(c => { c.checked = true; });
    // Cada ítem se va completo (por si alguien bajó una cantidad antes).
    document.querySelectorAll(".invTrasCant").forEach(inp => { inp.value = inp.max; });
    recontar();
  });
  $id("invTrasNada")?.addEventListener("click", () => {
    document.querySelectorAll(".invTrasChk").forEach(c => { c.checked = false; });
    recontar();
  });
  document.querySelectorAll(".invTrasChk").forEach(c => c.addEventListener("change", recontar));
  document.querySelectorAll(".invTrasCant").forEach(i => i.addEventListener("input", recontar));
  recontar();
}

// =====================================================================
//  AUDITORÍA / CHECK DE LA HOJA
//  Pasar lista con el técnico delante: toda la hoja en una tabla y el
//  estado de cada herramienta a un clic. Se guarda en un solo golpe y
//  solo lo que cambió.
// =====================================================================
function abrirAuditoria_(user, inv) {
  if (!INV.invItems.length) { invMsg("La hoja está vacía: nada que auditar.", true); return; }

  const filas = INV.invItems.map(it => {
    const radios = ESTADOS.map(e => `
      <label class="invAudOpt invAudOpt--${e}">
        <input type="radio" name="aud-${esc(it.id)}" value="${e}" data-itid="${esc(it.id)}"
          class="invAudRadio"${it.estado === e ? " checked" : ""}>
        <span>${esc(ESTADO_LABEL[e])}</span>
      </label>`).join("");
    return `
      <tr data-itid="${esc(it.id)}">
        <td>
          ${esc(nombreItem(it))}
          ${it.marca ? `<span class="small muted"> · ${esc(it.marca)}</span>` : ""}
          ${cantidadDe_(it) > 1 ? `<span class="invGrupoN">×${cantidadDe_(it)}</span>` : ""}
          ${codigosChips_(it) ? `<div style="margin-top:3px;">${codigosChips_(it)}</div>` : ""}
        </td>
        <td><div class="invAudEstados">${radios}</div></td>
        <td><input type="text" class="invAudNota" data-itid="${esc(it.id)}"
          value="${esc(it.nota || "")}" placeholder="Observación…"></td>
      </tr>`;
  }).join("");

  const body = `
    <div class="adminForm">
      <div class="invTrasHead">
        <button type="button" id="invAudTodoOk" class="adminBtnOk adminRowBtn">Marcar todo OK</button>
        <button type="button" id="invAudReset" class="adminBtnGhost adminRowBtn">Deshacer cambios</button>
        <span id="invAudCuenta" class="invResumenChip"></span>
      </div>
      <div class="adminTableScroll invAudTabla">
        <table class="adminTable">
          <thead><tr><th>Herramienta</th><th>Estado</th><th>Observación</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <label class="adminLabel">Auditoría hecha por
        <input id="invAudPor" type="text" value="${esc(operador_() || inv.tomado_por || "")}" placeholder="Tu nombre">
      </label>
      <label class="adminLabel">Nota general <span class="adminLabelHint">(queda en el historial)</span>
        <input id="invAudNotaGen" type="text" placeholder="Ej: auditoría mensual de taller">
      </label>
    </div>`;

  abrirModal_(`Auditoría · ${esc(user.nombre)}`, body, async () => {
    // Solo se escribe lo que cambió respecto de lo guardado.
    const cambios = INV.invItems.map(it => {
      const estado = document.querySelector(`.invAudRadio[data-itid="${CSS.escape(it.id)}"]:checked`)?.value || it.estado;
      const nota = document.querySelector(`.invAudNota[data-itid="${CSS.escape(it.id)}"]`)?.value?.trim() ?? (it.nota || "");
      return { it, estado, nota };
    }).filter(c => c.estado !== c.it.estado || c.nota !== (c.it.nota || ""));

    invMsg(cambios.length ? `Guardando ${cambios.length} cambio(s)…` : "Sin cambios; cerrando auditoría…");
    try {
      for (const c of cambios) {
        await supabasePatch("inventario_tecnico_items", { id: c.it.id },
          { estado: c.estado, nota: c.nota });
      }
      const auditor = $id("invAudPor")?.value?.trim() || operador_();
      const notaGen = $id("invAudNotaGen")?.value?.trim() || "";
      const [upd] = await supabasePatch("inventario_tecnico", { id: inv.id },
        { tomado_por: auditor, updated_at: new Date().toISOString() });
      INV.invActual = upd || inv;

      const faltantes = INV.invItems.length; // total revisado
      await logMov_({
        tipo: "AUDITORIA",
        descripcion: `Auditoría de ${faltantes} herramienta(s) · ${cambios.length} cambio(s)`,
        cantidad: cambios.length,
        destino_user_id: user.id,
        nota: notaGen,
        hecho_por: auditor,
      });

      invMsg(cambios.length
        ? `Auditoría guardada: ${cambios.length} herramienta(s) actualizada(s).`
        : "Auditoría cerrada sin cambios.");
      await abrirInventarioTec_(INV.selTecId, INV.invActual);
      return true;
    } catch (e) { invMsg(errorMsg_(e), true); return false; }
  });

  // Contador vivo por estado, para ver el resultado de la auditoría al vuelo.
  const recontar = () => {
    const conteo = ESTADOS.reduce((acc, e) => { acc[e] = 0; return acc; }, {});
    INV.invItems.forEach(it => {
      const e = document.querySelector(`.invAudRadio[data-itid="${CSS.escape(it.id)}"]:checked`)?.value || it.estado;
      conteo[e] = (conteo[e] || 0) + cantidadDe_(it);
    });
    const el = $id("invAudCuenta");
    if (el) el.innerHTML = ESTADOS.map(e => `${ESTADO_LABEL[e]} <strong>${conteo[e]}</strong>`).join(" · ");
  };
  document.querySelectorAll(".invAudRadio").forEach(r => r.addEventListener("change", recontar));
  $id("invAudTodoOk")?.addEventListener("click", () => {
    document.querySelectorAll('.invAudRadio[value="OK"]').forEach(r => { r.checked = true; });
    recontar();
  });
  $id("invAudReset")?.addEventListener("click", () => {
    INV.invItems.forEach(it => {
      const r = document.querySelector(`.invAudRadio[data-itid="${CSS.escape(it.id)}"][value="${it.estado}"]`);
      if (r) r.checked = true;
      const n = document.querySelector(`.invAudNota[data-itid="${CSS.escape(it.id)}"]`);
      if (n) n.value = it.nota || "";
    });
    recontar();
  });
  recontar();
}

// Copia "limpia" de un ítem (sin id/inventario_id) con la cantidad dada.
function itemPlano_(it, cantidad) {
  return {
    herramienta_id: it.herramienta_id || null,
    descripcion_libre: it.herramienta_id ? "" : (it.descripcion_libre || ""),
    marca: it.marca || "",
    codigo: it.codigo || "",
    serie: it.serie || "",
    cantidad,
    estado: it.estado || "OK",
    nota: it.nota || "",
  };
}

// =====================================================================
//  ASIGNAR UNA HERRAMIENTA A VARIOS TÉCNICOS DE UNA VEZ
//  (elijo un taladro → marco a los técnicos que lo reciben)
// =====================================================================
function abrirAsignarMultiple_() {
  const porEsp = new Map();
  INV.usuarios.forEach(u => {
    const k = u.especialidad || "SIN ESPECIALIDAD";
    if (!porEsp.has(k)) porEsp.set(k, []);
    porEsp.get(k).push(u);
  });
  const gruposTec = [...porEsp.entries()].map(([esp, us]) => `
    <div class="invTecPickGroup">
      <div class="invTecPickTitle">
        ${esc(esp)}
        <button type="button" class="invTecPickAll adminBtnGhost adminRowBtn" data-esp="${esc(esp)}">Todos</button>
      </div>
      <div class="invTecPickGrid">
        ${us.map(u => `
          <label class="invTecPick" data-nombre="${esc((u.nombre || "").toLowerCase())}">
            <input type="checkbox" class="invAsigTec" value="${esc(u.id)}" data-esp="${esc(esp)}">
            <span>${esc(u.nombre)}</span>
            ${INV.hojaByUser.has(u.id) ? "" : `<span class="invTecPickNew" title="Se le creará su hoja">nuevo</span>`}
          </label>`).join("")}
      </div>
    </div>`).join("");

  const body = `
    <div class="adminForm">
      <label class="adminLabel">Herramienta (del catálogo)
        <div class="invBuscador">
          <input id="invAsigSearch" type="text" autocomplete="off" placeholder="Escribe para buscar… (ej: tala → taladro)">
          <input type="hidden" id="invAsigHerr">
          <div id="invAsigList" class="invSearchList" style="display:none;"></div>
        </div>
      </label>
      <label class="adminLabel">Descripción libre <span class="adminLabelHint">(si no está en el catálogo)</span>
        <input id="invAsigLibre" type="text" placeholder="Nombre de la herramienta">
      </label>
      <div class="invCodGrid">
        <label class="adminLabel">Marca<input id="invAsigMarca" type="text"></label>
        <label class="adminLabel">Cantidad <span class="adminLabelHint">(por técnico)</span>
          <input id="invAsigCant" type="number" min="1" value="1">
        </label>
      </div>
      <label class="adminLabel">Estado<select id="invAsigEstado" class="adminInput">${opts(ESTADOS, "OK")}</select></label>
      <div class="invCodGrid">
        <label class="adminLabel">Código de la empresa <span class="adminLabelHint">(solo si es 1 técnico)</span>
          <input id="invAsigCodigo" type="text" placeholder="Ej: GLP-0142" autocomplete="off">
        </label>
        <label class="adminLabel">N° de serie (SN) <span class="adminLabelHint">(solo si es 1 técnico)</span>
          <input id="invAsigSerie" type="text" placeholder="Ej: 12A4-889231" autocomplete="off">
        </label>
      </div>
      <label class="adminLabel">Nota<input id="invAsigNota" type="text" placeholder="Ej: entrega de ampliación"></label>
      ${stockDisponible_() ? `<label class="adminLabel adminLabelRow invStockCheck">
        <input id="invAsigDescontar" type="checkbox"> Descontar del almacén
        <span class="adminLabelHint">Márcalo si las herramientas salen del estante ahora. Déjalo sin marcar si solo estás registrando lo que los técnicos <em>ya tenían</em>.</span>
      </label>` : ""}

      <div class="invTrasHead" style="margin-top:6px;">
        <span class="small muted">¿Quiénes la reciben?</span>
        <input id="invAsigFiltro" class="adminInput invTecPickFiltro" type="text" placeholder="Filtrar técnicos…" autocomplete="off">
        <span id="invAsigCuenta" class="invResumenChip">0 elegidos</span>
      </div>
      <div class="invTecPickWrap">${gruposTec || `<div class="small muted">Sin técnicos activos.</div>`}</div>
    </div>`;

  abrirModal_("Asignar herramienta a varios técnicos", body, async () => {
    const ids = [...document.querySelectorAll(".invAsigTec")].filter(c => c.checked).map(c => c.value);
    if (!ids.length) { invMsg("Marca al menos un técnico.", true); return false; }

    let herr = $id("invAsigHerr")?.value || "";
    const buscado = $id("invAsigSearch")?.value?.trim() || "";
    if (!herr && buscado) {
      const exacto = INV.catalogo.find(h => h.nombre.toLowerCase() === buscado.toLowerCase());
      if (exacto) herr = exacto.id;
    }
    const libre = $id("invAsigLibre")?.value?.trim() || "";
    if (!herr && !libre) { invMsg("Elige una herramienta del catálogo o escribe una descripción libre.", true); return false; }

    const codigo = $id("invAsigCodigo")?.value?.trim() || "";
    const serie  = $id("invAsigSerie")?.value?.trim() || "";
    if ((codigo || serie) && ids.length > 1) {
      invMsg("El código y el SN identifican una unidad concreta: asígnalos a un solo técnico.", true);
      return false;
    }
    const cantidad = Math.max(1, Number($id("invAsigCant")?.value) || 1);
    if ((codigo || serie) && cantidad !== 1) { invMsg("Con código o SN la cantidad debe ser 1.", true); return false; }

    const base = {
      herramienta_id: herr || null,
      descripcion_libre: herr ? "" : libre,
      marca: $id("invAsigMarca")?.value?.trim() || "",
      codigo,
      serie,
      cantidad,
      estado: $id("invAsigEstado")?.value || "OK",
      nota: $id("invAsigNota")?.value?.trim() || "",
    };

    const descontar = !!$id("invAsigDescontar")?.checked;
    invMsg(`Asignando a ${ids.length} técnico(s)…`);
    try {
      let sumados = 0, nuevos = 0;
      for (const uid of ids) {
        const hoja = await asegurarHoja_(uid);
        const itemsDestino = await supabaseGet("inventario_tecnico_items", { inventario_id: hoja.id });
        const r = await insertarOSumar_(hoja.id, base, itemsDestino);
        r.sumado ? sumados++ : nuevos++;
        await logMov_({
          tipo: "ASIGNACION",
          herramienta_id: base.herramienta_id,
          descripcion: nombreItem(base),
          marca: base.marca, serie: base.serie, codigo: base.codigo,
          cantidad: base.cantidad,
          destino_user_id: uid,
          destino_nombre: nombreUsuario_(uid),
          nota: base.nota,
        });
      }
      if (descontar) await moverStock_(base.herramienta_id, -base.cantidad * ids.length);
      invMsg(`Asignada a ${ids.length} técnico(s): ${nuevos} nueva(s), ${sumados} sumada(s) a lo que ya tenían.`);
      await renderTecnicoSub_();
      return true;
    } catch (e) { invMsg(errorMsg_(e), true); return false; }
  });

  wireBuscador_($id("invAsigSearch"), $id("invAsigList"), $id("invAsigHerr"),
    () => { const l = $id("invAsigLibre"); if (l) l.value = ""; });

  const cuenta = () => {
    const n = document.querySelectorAll(".invAsigTec:checked").length;
    const el = $id("invAsigCuenta");
    if (el) el.innerHTML = `<strong>${n}</strong> elegido(s)`;
  };
  document.querySelectorAll(".invAsigTec").forEach(c => c.addEventListener("change", cuenta));
  document.querySelectorAll(".invTecPickAll").forEach(b => b.addEventListener("click", () => {
    const chks = [...document.querySelectorAll(`.invAsigTec[data-esp="${CSS.escape(b.dataset.esp)}"]`)]
      .filter(c => c.closest(".invTecPick")?.hidden !== true);
    const todos = chks.every(c => c.checked);
    chks.forEach(c => { c.checked = !todos; });
    cuenta();
  }));
  $id("invAsigFiltro")?.addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll(".invTecPick").forEach(l => {
      l.hidden = !!q && !(l.dataset.nombre || "").includes(q);
    });
  });
  cuenta();
}

// =====================================================================
//  SUB-VISTA · EXISTENCIAS (el almacén)
//  ─────────────────────────────────────
//  LIBRES     = sanas en el estante, listas para entregar
//  MALOGRADAS = rotas, siguen en el estante pero no se pueden entregar
//  ASIGNADAS  = con los técnicos (se suman de sus hojas)
//  TOTAL      = las tres juntas: todo lo que la empresa posee
//
//  Cada una de esas pilas se lleva en dos formas que no se solapan:
//  a granel (contadores, para lo intercambiable) e identificadas (una fila
//  por unidad, para lo que tiene código de empresa o SN).
//  Ver supabase/inventario-stock.sql.
// =====================================================================

// Fila de la tabla, ya con todo calculado.
function filaStock_(h, asig) {
  const st = stockDe_(h.id);
  const uds = unidadesDe_(h.id);
  const libres = libresDe_(h.id);
  const malogradas = malogradasDe_(h.id);
  const a = asig.get(h.id);
  const asignadas = a?.unidades || 0;
  const minimo = Number(st?.stock_minimo) || 0;
  const total = libres + malogradas + asignadas;
  return {
    h, st, uds, libres, malogradas, asignadas, minimo, total,
    tecnicos: a?.tecnicos.size || 0,
    ubicacion: st?.ubicacion || "",
    nivel: nivelStock_(libres, minimo, total),
    baja: descontinuada_(h),
  };
}

async function renderStockSub_(recargar = true) {
  const box = $id("invSubContent");
  if (!box) return;
  if (recargar) {
    box.innerHTML = `<div class="invLoading">${icon("box", 20)} Contando existencias…</div>`;
    await cargarSnapshot_();
  }

  if (!stockDisponible_()) {
    box.innerHTML = `
      <div class="invEmpty">
        <div class="invEmptyIcon">${icon("box", 30)}</div>
        <div class="invEmptyTitle">Existencias todavía no está activo</div>
        <p class="invEmptyText">
          Falta crear las tablas del almacén. Abre el <strong>SQL Editor de Supabase</strong> y ejecuta
          <code>supabase/inventario-stock.sql</code>. Se crea una ficha por cada herramienta del catálogo
          con <strong>0 unidades libres</strong>; lo que ya tienen los técnicos se sigue contando desde
          sus hojas, así que no se pierde nada.
        </p>
      </div>`;
    return;
  }

  const asig = asignadasPorHerr_();
  const filasBase = INV.catalogo.map(h => filaStock_(h, asig));

  const libresTotal     = filasBase.reduce((n, f) => n + f.libres, 0);
  const malogradasTotal = filasBase.reduce((n, f) => n + f.malogradas, 0);
  const asignadasTotal  = filasBase.reduce((n, f) => n + f.asignadas, 0);
  const identificadas   = INV.unidades.length;

  const bajoMinimo     = filasBase.filter(f => f.nivel === "bajo" && !f.baja).length;
  const agotados       = filasBase.filter(f => f.nivel === "agotado" && !f.baja).length;
  const descuadres     = filasBase.filter(f => f.nivel === "descuadre").length;
  const conMalogradas  = filasBase.filter(f => f.malogradas > 0).length;
  const descontinuadas = filasBase.filter(f => f.baja).length;
  const bajasPendientes = filasBase.filter(f => f.baja && f.total > 0).length;

  // Ítems de hojas cargados como texto libre: no están en el catálogo, así
  // que no pueden inventariarse.
  const sueltosUds = totalUnidades_(INV.todosItems.filter(it => !it.herramienta_id));

  const q = (INV.stockFiltro || "").trim().toLowerCase();
  const enVista_ = f =>
      INV.stockVista === "alertas" ? (NIVELES_ALERTA.includes(f.nivel) && !f.baja)
    : INV.stockVista === "taller"  ? (f.malogradas > 0 || f.baja)
    : true;
  const coincide_ = f => !q || (
    `${f.h.categoria || ""} ${f.h.nombre} ${f.ubicacion}`.toLowerCase().includes(q) ||
    f.uds.some(u => etiquetaUnidad_(u).toLowerCase().includes(q))
  );
  const lista = filasBase.filter(coincide_).filter(enVista_).sort((a, b) =>
    (a.h.categoria || "ZZZ").localeCompare(b.h.categoria || "ZZZ") ||
    a.h.nombre.localeCompare(b.h.nombre));

  box.innerHTML = `
    <section class="invPanel">
      <header class="invPanelHead">
        <div>
          <h3 class="invPanelTitle">${icon("box", 18)} Existencias del almacén</h3>
          <p class="invPanelSub">
            Entregar solo se puede de las <strong>libres</strong>. Que no queden libres no es problema si
            están todas repartidas: eso sale como <span class="invBadge invBadge--ok">Todo en uso</span>.
            Para que además te avise cuándo comprar, ponle un <strong>stock mínimo</strong> en su detalle.
          </p>
        </div>
        <div class="invPanelActions">
          <button id="invStNuevaEntrada" class="invBtn invBtn--primary">${icon("trayIn", 15)} Ingresar al almacén</button>
          <button id="invStExcel" class="invBtn">${icon("download", 15)} Excel</button>
          <button id="invStRefresh" class="invBtn invBtn--icon" title="Actualizar">${icon("refresh", 15)}</button>
        </div>
      </header>

      <div class="invKpis">
        ${kpiHtml_(libresTotal + malogradasTotal + asignadasTotal, "Total físico", "total", "Todo lo que la empresa posee")}
        ${kpiHtml_(libresTotal, "Libres", "libre", "Sanas en el estante, listas para entregar")}
        ${kpiHtml_(asignadasTotal, "Asignadas", "asig", "En manos de los técnicos")}
        ${kpiHtml_(malogradasTotal, "Malogradas", malogradasTotal ? "mal" : "", "Rotas, esperando reparación")}
        ${kpiHtml_(bajoMinimo + agotados, "Por reponer", (bajoMinimo || agotados) ? "warn" : "", "Solo las que tienen stock mínimo definido y se quedaron cortas")}
        ${kpiHtml_(descuadres, "Descuadres", descuadres ? "danger" : "", "Saldo negativo: se entregó más de lo registrado")}
      </div>

      ${sueltosUds ? `<div class="invNota invNota--warn">
        ${icon("alertTriangle", 15)}
        <span>Hay <strong>${sueltosUds}</strong> unidad(es) en hojas de técnicos cargadas como texto libre.
        No están en el catálogo, así que no entran en existencias — pásalas al catálogo para contarlas.</span>
      </div>` : ""}

      <div class="invToolbar">
        <div class="invSegmented" role="tablist">
          <button class="invSeg${INV.stockVista === "todo" ? " invSegOn" : ""}" data-vista="todo">
            Todo <span class="invSegN">${filasBase.length}</span>
          </button>
          <button class="invSeg${INV.stockVista === "alertas" ? " invSegOn" : ""}" data-vista="alertas"
            title="Bajo mínimo, agotado o descuadrado">
            Por reponer <span class="invSegN">${bajoMinimo + agotados + descuadres}</span>
          </button>
          <button class="invSeg${INV.stockVista === "taller" ? " invSegOn" : ""}" data-vista="taller"
            title="Unidades rotas y herramientas fuera de uso">
            Taller <span class="invSegN">${conMalogradas + descontinuadas}</span>
          </button>
        </div>
        <div class="invSearch">
          <span class="invSearchIcon" aria-hidden="true">${icon("search", 16)}</span>
          <input id="invStFiltro" type="text" autocomplete="off" value="${esc(INV.stockFiltro)}"
            placeholder="Buscar herramienta, ubicación, código o SN…">
        </div>
      </div>

      ${INV.stockVista === "taller" ? `<div class="invNota">
        ${icon("wrench", 15)}
        <span><strong>Malograda</strong> es una unidad rota que sigue en el estante: cuenta como patrimonio
        pero no se entrega. Se repara y vuelve, o se desecha.
        <strong>Descontinuada</strong> es la herramienta entera: deja de ofrecerse, pero no se borra —
        el histórico de quién la tuvo se conserva.
        ${bajasPendientes ? `<br>Hay <strong>${bajasPendientes}</strong> descontinuada(s) con unidades sin recuperar.` : ""}</span>
      </div>` : ""}

      <div class="invTableWrap">
        <table class="invTable">
          <thead><tr>
            <th class="invThMain">Herramienta</th>
            <th class="invThNum" title="Sanas en el estante">Libres</th>
            <th class="invThNum" title="Rotas: en el estante pero fuera de servicio">Malog.</th>
            <th class="invThNum" title="En manos de técnicos">Asign.</th>
            <th class="invThNum" title="Todo lo que la empresa posee">Total</th>
            <th class="invThNum" title="Punto de pedido">Mín.</th>
            <th>Ubicación</th>
            <th>Estado</th>
            <th class="invThActions"></th>
          </tr></thead>
          <tbody>${lista.map(filaStockHtml_).join("") || filaVaciaHtml_(9, q
            ? `Ninguna herramienta coincide con “${esc(INV.stockFiltro)}”.`
            : "No hay herramientas en esta vista.")}</tbody>
        </table>
      </div>

      <p class="invTableFoot">
        Mostrando <strong>${lista.length}</strong> de ${filasBase.length} herramientas${identificadas
          ? ` · <strong>${identificadas}</strong> unidad(es) con código o SN registradas` : ""}.
      </p>
    </section>

    <div id="invMovBox" class="invPanel invPanel--flush"></div>
  `;

  // ── Listeners ──
  const filtroEl = $id("invStFiltro");
  filtroEl?.addEventListener("input", e => {
    INV.stockFiltro = e.target.value;
    renderStockSub_(false);
    const nuevo = $id("invStFiltro");
    if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); }
  });
  box.querySelectorAll(".invSeg").forEach(b => b.addEventListener("click", () => {
    INV.stockVista = b.dataset.vista;
    renderStockSub_(false);
  }));
  $id("invStNuevaEntrada")?.addEventListener("click", () => abrirEntradaStock_(null));
  $id("invStExcel")?.addEventListener("click", exportarStockXls_);
  $id("invStRefresh")?.addEventListener("click", () => renderStockSub_());
  box.querySelectorAll(".invStEntrada").forEach(b => b.addEventListener("click", () => abrirEntradaStock_(b.dataset.hid)));
  box.querySelectorAll(".invStEntregar").forEach(b => b.addEventListener("click", () => abrirEntregarStock_(b.dataset.hid)));
  box.querySelectorAll(".invStDetalle").forEach(b => b.addEventListener("click", () => abrirDetalleStock_(b.dataset.hid)));
  // Desplegar las unidades identificadas de una herramienta.
  box.querySelectorAll(".invUdsToggle").forEach(b => b.addEventListener("click", () => {
    const abierto = b.classList.toggle("invUdsToggleOpen");
    box.querySelectorAll(`.invUdsRow[data-hid="${CSS.escape(b.dataset.hid)}"]`)
      .forEach(tr => { tr.hidden = !abierto; });
  }));
  pintarMovimientos_();
}

// ── Piezas de presentación ───────────────────────────────────────────
function kpiHtml_(n, label, tono = "", titulo = "") {
  return `<div class="invKpi${tono ? ` invKpi--${tono}` : ""}"${titulo ? ` title="${esc(titulo)}"` : ""}>
      <span class="invKpiN">${n}</span>
      <span class="invKpiL">${esc(label)}</span>
    </div>`;
}

function filaVaciaHtml_(cols, texto) {
  return `<tr><td colspan="${cols}" class="invTableEmpty">${texto}</td></tr>`;
}

function numCell_(n, clase = "") {
  return n
    ? `<td class="invTdNum"><span class="${clase}">${n}</span></td>`
    : `<td class="invTdNum invTdZero">—</td>`;
}

function filaStockHtml_(f) {
  const uds = f.uds;
  const fila = `
    <tr class="invRow invRow--${f.nivel}${f.baja ? " invRow--baja" : ""}">
      <td class="invTdMain">
        <div class="invItemName">
          ${uds.length
            ? `<button class="invUdsToggle" data-hid="${esc(f.h.id)}" title="Ver las ${uds.length} unidades con código/SN">${icon("chevronRight", 13)}</button>`
            : `<span class="invUdsSpacer"></span>`}
          <span>
            ${f.h.categoria ? `<span class="invCatTag">${esc(f.h.categoria)}</span>` : ""}
            ${esc(detalleDe_(f.h))}
            ${f.baja ? `<span class="invBadge invBadge--muted" title="${esc(f.h.descontinuada_motivo || "Ya no se usa")}">Descontinuada</span>` : ""}
            ${uds.length ? `<span class="invUdsChip" title="Unidades con código de empresa o número de serie">${icon("tag", 11)} ${uds.length}</span>` : ""}
          </span>
        </div>
      </td>
      ${numCell_(f.libres, "invNumOk")}
      ${numCell_(f.malogradas, "invNumMal")}
      <td class="invTdNum">
        ${f.asignadas ? `<span>${f.asignadas}</span>${f.tecnicos ? `<span class="invTdSub">${f.tecnicos} téc.</span>` : ""}` : `<span class="invTdZero">—</span>`}
      </td>
      <td class="invTdNum"><strong>${f.total}</strong></td>
      <td class="invTdNum invTdMuted">${f.minimo || "—"}</td>
      <td class="invTdMuted">${esc(f.ubicacion || "—")}</td>
      <td>${f.baja
        ? `<span class="invBadge invBadge--muted">Descontinuada</span>`
        : nivelBadge_(f.libres, f.minimo, f.total)}</td>
      <td class="invTdActions">
        ${f.baja ? "" : `
        <button class="invRowBtn invStEntrada" data-hid="${esc(f.h.id)}" title="Ingresar unidades al almacén">${icon("trayIn", 15)}</button>
        <button class="invRowBtn invStEntregar" data-hid="${esc(f.h.id)}" title="Entregar a un técnico">${icon("trayOut", 15)}</button>`}
        <button class="invRowBtn invRowBtn--go invStDetalle" data-hid="${esc(f.h.id)}" title="Ver detalle y acciones">${icon("chevronRight", 15)}</button>
      </td>
    </tr>`;

  if (!uds.length) return fila;
  const subs = uds.map(u => `
    <tr class="invUdsRow" data-hid="${esc(f.h.id)}" hidden>
      <td class="invTdMain invTdUnit" colspan="2">
        <span class="invUdsArrow">↳</span>
        ${(u.codigo || "").trim() ? `<span class="invCodChip">${esc(u.codigo.trim())}</span>` : ""}
        ${(u.serie || "").trim() ? `<span class="invCodChip invCodChipSn">SN ${esc(u.serie.trim())}</span>` : ""}
        ${(u.marca || "").trim() ? `<span class="invTdMuted">${esc(u.marca.trim())}</span>` : ""}
      </td>
      <td colspan="5" class="invTdMuted">${esc(u.ubicacion || "")}${u.nota ? ` · ${esc(u.nota)}` : ""}</td>
      <td>${u.estado === "MAL"
        ? `<span class="invBadge invBadge--warn">Malograda</span>`
        : `<span class="invBadge invBadge--ok">Disponible</span>`}</td>
      <td class="invTdActions">
        <button class="invRowBtn invRowBtn--go invStDetalle" data-hid="${esc(f.h.id)}" title="Ver detalle">${icon("chevronRight", 15)}</button>
      </td>
    </tr>`).join("");
  return fila + subs;
}

// Bloque reutilizable: selector de herramienta del catálogo (o fijo si ya
// viene elegida desde la fila de la tabla).
function selectorHerrHtml_(herr, idSearch, idHidden, idList) {
  if (herr) {
    return `<div class="invPickShow">
        ${herr.categoria ? `<span class="invCatTag">${esc(herr.categoria)}</span>` : ""}
        <strong>${esc(detalleDe_(herr))}</strong>
        <input type="hidden" id="${idHidden}" value="${esc(herr.id)}">
      </div>`;
  }
  return `<label class="invField">
      <span class="invFieldLabel">Herramienta del catálogo</span>
      <div class="invBuscador">
        <input id="${idSearch}" type="text" autocomplete="off" placeholder="Escribe para buscar… (ej: tala → taladro)">
        <input type="hidden" id="${idHidden}">
        <div id="${idList}" class="invSearchList" style="display:none;"></div>
      </div>
    </label>`;
}

// Resumen "así está el saldo ahora mismo", para los modales de almacén.
function saldoHtml_(herrId) {
  const libres = libresDe_(herrId);
  const mal = malogradasDe_(herrId);
  const asig = asignadasPorHerr_().get(herrId)?.unidades || 0;
  return `<div class="invSaldo">
      <div class="invSaldoItem"><span class="invSaldoN invNumOk">${libres}</span><span>Libres</span></div>
      <div class="invSaldoItem"><span class="invSaldoN${mal ? " invNumMal" : ""}">${mal}</span><span>Malogradas</span></div>
      <div class="invSaldoItem"><span class="invSaldoN">${asig}</span><span>Asignadas</span></div>
      <div class="invSaldoItem invSaldoItem--total"><span class="invSaldoN">${libres + mal + asig}</span><span>Total</span></div>
    </div>`;
}

// =====================================================================
//  IDENTIFICAR UNIDADES · una fila por objeto físico
//  La herramienta del catálogo es la "clase" (kit taladro Makita 18V) y
//  cada unidad es un objeto con su propio código y su propio SN. Por eso
//  al ingresar 3 taladros salen 3 renglones que llenar, no uno solo.
//  La marca y la ubicación se piden una vez: suelen ser la misma compra.
// =====================================================================

// Renglones de identificación para `n` unidades. `base` rellena valores.
function filasUnidadHtml_(n, pref, base = []) {
  const filas = [];
  for (let i = 0; i < n; i++) {
    const b = base[i] || {};
    filas.push(`
      <div class="invUnitFormRow" data-i="${i}">
        <span class="invUnitFormN">${i + 1}</span>
        <input class="${pref}Cod" type="text" value="${esc(b.codigo || "")}"
          placeholder="Código de empresa" autocomplete="off" spellcheck="false">
        <input class="${pref}Ser" type="text" value="${esc(b.serie || "")}"
          placeholder="N° de serie (SN)" autocomplete="off" spellcheck="false">
      </div>`);
  }
  return filas.join("");
}

// Lee los renglones y devuelve { unidades, error }.
// Cada unidad necesita al menos código o SN — si no, no está identificada.
function leerUnidadesForm_(pref, { marca = "", ubicacion = "", nota = "" } = {}) {
  const cods = [...document.querySelectorAll(`.${pref}Cod`)];
  const sers = [...document.querySelectorAll(`.${pref}Ser`)];
  if (!cods.length) return { error: "No hay unidades que registrar." };
  const unidades = [];
  const vistos = new Set();

  for (let i = 0; i < cods.length; i++) {
    const codigo = (cods[i].value || "").trim();
    const serie  = (sers[i]?.value || "").trim();
    if (!codigo && !serie) return { error: `A la unidad #${i + 1} le falta el código o el número de serie.` };
    // Duplicados dentro del mismo formulario: la base los rechazaría, pero
    // mejor avisar antes de haber grabado la mitad.
    for (const v of [codigo && `c:${codigo.toLowerCase()}`, serie && `s:${serie.toLowerCase()}`]) {
      if (!v) continue;
      if (vistos.has(v)) return { error: `“${codigo || serie}” está repetido en la lista.` };
      vistos.add(v);
    }
    unidades.push({ marca, codigo, serie, estado: "OK", ubicacion, nota });
  }
  return { unidades };
}

// Bloque completo: cuántas, marca/ubicación comunes y los renglones.
// `idCant` es el input de cantidad que manda cuántos renglones se pintan.
function bloqueIdentidadHtml_(pref, { marca = "" } = {}) {
  return `
    <label class="invField">
      <span class="invFieldLabel">Marca <span class="invFieldHint">(la misma para todas las de esta entrada)</span></span>
      <input id="${pref}Marca" type="text" value="${esc(marca)}" placeholder="Ej: Makita" autocomplete="off">
    </label>

    <div class="invSwitchRow">
      <label class="invSwitch">
        <input id="${pref}Ident" type="checkbox">
        <span>Identificar cada unidad con su código y su SN</span>
      </label>
    </div>
    <p class="invHint">${icon("tag", 12)}
      <strong>Identificadas:</strong> cada unidad es un objeto rastreable — sabes cuál taladro tiene quién.
      <strong>A granel:</strong> solo cuentas cuántas hay, como con los alicates.</p>

    <div id="${pref}IdentBox" class="invUnitForm" hidden>
      <div class="invUnitFormHead">
        <span class="invUnitFormN">#</span><span>Código de la empresa</span><span>N° de serie (SN)</span>
      </div>
      <div id="${pref}Rows"></div>
    </div>`;
}

// Enlaza cantidad ↔ renglones. Al subir la cantidad aparecen más filas,
// conservando lo ya escrito.
function wireIdentidad_(pref, idCant) {
  const chk = $id(`${pref}Ident`);
  const box = $id(`${pref}IdentBox`);
  const rows = $id(`${pref}Rows`);
  const cant = $id(idCant);
  if (!chk || !box || !rows) return;

  const pintar = () => {
    if (!chk.checked) { box.hidden = true; return; }
    box.hidden = false;
    const n = Math.max(1, Math.min(50, Number(cant?.value) || 1));
    const previo = leerCrudo_(pref);
    rows.innerHTML = filasUnidadHtml_(n, pref, previo);
  };
  // Lectura tolerante: solo para no perder lo tecleado al repintar.
  const leerCrudo_ = (p) => [...document.querySelectorAll(`.${p}Cod`)].map((c, i) => ({
    codigo: c.value || "",
    serie: document.querySelectorAll(`.${p}Ser`)[i]?.value || "",
  }));

  chk.addEventListener("change", pintar);
  cant?.addEventListener("input", pintar);
  pintar();
}

// ── ENTRADA · compra o ingreso de unidades al almacén ──
function abrirEntradaStock_(herrId) {
  const herr = herrId ? INV.catMap.get(herrId) : null;
  const body = `
    <div class="invForm">
      ${selectorHerrHtml_(herr, "invEntSearch", "invEntHerr", "invEntList")}
      ${herr ? saldoHtml_(herr.id) : ""}
      <div class="invFieldRow">
        <label class="invField">
          <span class="invFieldLabel">Cantidad que entra</span>
          <input id="invEntCant" type="number" min="1" value="1">
        </label>
        <label class="invField">
          <span class="invFieldLabel">Ubicación <span class="invFieldHint">(estante, caja…)</span></span>
          <input id="invEntUbic" type="text" value="${esc(herr ? (stockDe_(herr.id)?.ubicacion || "") : "")}" placeholder="Ej: Estante B-2">
        </label>
      </div>
      ${bloqueIdentidadHtml_("invEnt")}
      <label class="invField">
        <span class="invFieldLabel">Motivo / documento <span class="invFieldHint">(guía, factura, quién trajo)</span></span>
        <input id="invEntNota" type="text" placeholder="Ej: compra guía 0042">
      </label>
    </div>`;

  abrirModal_(herr ? `Ingresar al almacén · ${esc(detalleDe_(herr))}` : "Ingresar herramientas al almacén", body, async () => {
    const hid = $id("invEntHerr")?.value || "";
    if (!hid) { invMsg("Elige una herramienta del catálogo.", true); return false; }
    const cant = Math.max(1, Number($id("invEntCant")?.value) || 0);
    const ubic = $id("invEntUbic")?.value?.trim() || "";
    const nota = $id("invEntNota")?.value?.trim() || "";
    const marca = $id("invEntMarca")?.value?.trim() || "";
    const identificar = !!$id("invEntIdent")?.checked;

    try {
      await asegurarStock_(hid);

      if (identificar) {
        // Una fila por unidad física: cada taladro con su código y su SN.
        const { unidades, error } = leerUnidadesForm_("invEnt", { marca, ubicacion: ubic, nota });
        if (error) { invMsg(error, true); return false; }
        await supabasePost("inventario_stock_unidades",
          unidades.map(u => ({ ...u, herramienta_id: hid })));
        for (const u of unidades) {
          await logMov_({
            tipo: "ENTRADA", herramienta_id: hid,
            descripcion: INV.catMap.get(hid)?.nombre || "",
            marca: u.marca, codigo: u.codigo, serie: u.serie,
            cantidad: 1, nota, hecho_por: operador_(),
          });
        }
        invMsg(`Ingresadas ${unidades.length} unidad(es) identificada(s).`);
      } else {
        const saldo = await moverStock_(hid, cant, { tipo: "ENTRADA", marca, nota, hecho_por: operador_() });
        if (saldo == null) { invMsg("Esa herramienta no tiene ficha de almacén.", true); return false; }
        invMsg(`Entraron ${cant} unidad(es) a granel.`);
      }

      if (ubic) {
        const fila = stockDe_(hid);
        if (fila) { await supabasePatch("inventario_stock", { id: fila.id }, { ubicacion: ubic }); fila.ubicacion = ubic; }
      }
      await renderStockSub_();
      return true;
    } catch (e) { invMsg(errorMsg_(e), true); return false; }
  });

  wireIdentidad_("invEnt", "invEntCant");

  if (!herr) wireBuscador_($id("invEntSearch"), $id("invEntList"), $id("invEntHerr"), (h) => {
    const u = $id("invEntUbic");
    if (u && !u.value) u.value = stockDe_(h.id)?.ubicacion || "";
  });
}

// ── IDENTIFICAR · convierte unidades sueltas en objetos rastreables ──
// Para lo que ya se cargó a granel: “tengo 3 taladros contados, ahora quiero
// saber cuál es cuál”. Baja el contador y crea una fila por unidad.
function abrirIdentificarStock_(herrId) {
  const herr = INV.catMap.get(herrId);
  if (!herr) return;
  const granel = granelLibresDe_(herrId);
  if (granel < 1) {
    invMsg("No hay unidades sueltas que identificar. Si son nuevas, usa «Ingresar al almacén».", true);
    return;
  }

  const body = `
    <div class="invForm">
      <div class="invPickShow">
        ${herr.categoria ? `<span class="invCatTag">${esc(herr.categoria)}</span>` : ""}
        <strong>${esc(detalleDe_(herr))}</strong>
      </div>
      ${saldoHtml_(herrId)}
      <p class="invHint">Tienes <strong>${granel}</strong> unidad(es) contadas a granel. Al identificarlas,
      cada una pasa a ser un objeto propio con su código y su número de serie — el total no cambia,
      solo dejas de contarlas en montón.</p>
      <div class="invFieldRow">
        <label class="invField">
          <span class="invFieldLabel">¿Cuántas vas a identificar? <span class="invFieldHint">(de ${granel})</span></span>
          <input id="invIdCant" type="number" min="1" max="${granel}" value="${Math.min(granel, 10)}">
        </label>
        <label class="invField">
          <span class="invFieldLabel">Marca <span class="invFieldHint">(la misma para todas)</span></span>
          <input id="invIdMarca" type="text" placeholder="Ej: Makita" autocomplete="off">
        </label>
      </div>
      <div class="invUnitForm">
        <div class="invUnitFormHead">
          <span class="invUnitFormN">#</span><span>Código de la empresa</span><span>N° de serie (SN)</span>
        </div>
        <div id="invIdRows"></div>
      </div>
    </div>`;

  abrirModal_(`Identificar unidades · ${esc(detalleDe_(herr))}`, body, async () => {
    const marca = $id("invIdMarca")?.value?.trim() || "";
    const { unidades, error } = leerUnidadesForm_("invId", {
      marca, ubicacion: stockDe_(herrId)?.ubicacion || "",
    });
    if (error) { invMsg(error, true); return false; }
    if (unidades.length > granel) { invMsg(`Solo hay ${granel} suelta(s) para identificar.`, true); return false; }
    try {
      await supabasePost("inventario_stock_unidades",
        unidades.map(u => ({ ...u, herramienta_id: herrId })));
      // Salen del contador: ahora se cuentan una por una. El total no cambia.
      await ajustarStock_(herrId, { libres: -unidades.length }, {
        tipo: "AJUSTE", marca,
        nota: `Identificadas ${unidades.length} unidad(es) que estaban a granel`,
        hecho_por: operador_(),
      });
      invMsg(`${unidades.length} unidad(es) ahora tienen código propio.`);
      await renderStockSub_();
      return true;
    } catch (e) { invMsg(errorMsg_(e), true); return false; }
  }, { ancho: true });

  // Renglones: uno por unidad, y se ajustan al cambiar la cantidad.
  const cant = $id("invIdCant"), rows = $id("invIdRows");
  const pintar = () => {
    const n = Math.max(1, Math.min(granel, Number(cant?.value) || 1));
    const previo = [...document.querySelectorAll(".invIdCod")].map((c, i) => ({
      codigo: c.value || "",
      serie: document.querySelectorAll(".invIdSer")[i]?.value || "",
    }));
    if (rows) rows.innerHTML = filasUnidadHtml_(n, "invId", previo);
  };
  cant?.addEventListener("input", pintar);
  pintar();
}

// ── ENTREGA · almacén → técnico ──
// Si la herramienta tiene unidades identificadas, se elige cuál se lleva:
// esa fila se mueve a la hoja del técnico con su código y su SN.
function abrirEntregarStock_(herrId) {
  const herr = INV.catMap.get(herrId);
  if (!herr) return;
  const granel = granelLibresDe_(herrId);
  const udsOk = unidadesDe_(herrId, "OK");

  const opcionesUnidad = [
    `<option value="">A granel (sin código ni SN) — quedan ${granel}</option>`,
    ...udsOk.map(u => `<option value="${esc(u.id)}">${esc(etiquetaUnidad_(u))}</option>`),
  ].join("");

  const body = `
    <div class="invForm">
      <div class="invPickShow">
        ${herr.categoria ? `<span class="invCatTag">${esc(herr.categoria)}</span>` : ""}
        <strong>${esc(detalleDe_(herr))}</strong>
      </div>
      ${saldoHtml_(herrId)}

      <label class="invField">
        <span class="invFieldLabel">¿A qué técnico?</span>
        <div class="invBuscador">
          <input id="invEgTec" type="text" autocomplete="off" placeholder="Escribe su nombre…">
          <input type="hidden" id="invEgTecId">
          <div id="invEgTecList" class="vinSuggest hidden" role="listbox"></div>
        </div>
        <span class="invFieldHint">Si aún no tiene hoja de inventario, se le crea sola.</span>
      </label>

      ${udsOk.length ? `<label class="invField">
        <span class="invFieldLabel">¿Qué unidad se lleva?</span>
        <select id="invEgUnidad">${opcionesUnidad}</select>
        <span class="invFieldHint">Al elegir una unidad identificada se lleva su código y su SN a la hoja del técnico.</span>
      </label>` : `<input type="hidden" id="invEgUnidad" value="">`}

      <div id="invEgGranel">
        <div class="invFieldRow">
          <label class="invField">
            <span class="invFieldLabel">Cantidad</span>
            <input id="invEgCant" type="number" min="1" value="1">
          </label>
          <label class="invField">
            <span class="invFieldLabel">Marca</span>
            <input id="invEgMarca" type="text" placeholder="Ej: Stanley" autocomplete="off">
          </label>
        </div>
        <div class="invFieldRow">
          <label class="invField">
            <span class="invFieldLabel">Código de la empresa <span class="invFieldHint">(opcional)</span></span>
            <input id="invEgCodigo" type="text" placeholder="Ej: GLP-0142" autocomplete="off">
          </label>
          <label class="invField">
            <span class="invFieldLabel">N° de serie (SN) <span class="invFieldHint">(opcional)</span></span>
            <input id="invEgSerie" type="text" placeholder="Ej: 12A4-889231" autocomplete="off">
          </label>
        </div>
      </div>

      <label class="invField">
        <span class="invFieldLabel">Nota de la entrega</span>
        <input id="invEgNota" type="text" placeholder="Ej: reemplazo del que se rompió">
      </label>
    </div>`;

  abrirModal_(`Entregar a un técnico · ${esc(detalleDe_(herr))}`, body, async () => {
    const uid = $id("invEgTecId")?.value || "";
    if (!uid) { invMsg("Elige al técnico de la lista de sugerencias.", true); return false; }
    const nota = $id("invEgNota")?.value?.trim() || "";
    const unidadId = $id("invEgUnidad")?.value || "";

    try {
      const hoja = await asegurarHoja_(uid);
      const itemsDestino = await supabaseGet("inventario_tecnico_items", { inventario_id: hoja.id });

      if (unidadId) {
        // Unidad identificada: se MUEVE de tabla, no se copia. Así el código
        // y el SN nunca están en el almacén y con el técnico a la vez.
        const u = INV.unidades.find(x => x.id === unidadId);
        if (!u) { invMsg("Esa unidad ya no está disponible.", true); return false; }
        await supabaseDelete("inventario_stock_unidades", { id: u.id });
        await supabasePost("inventario_tecnico_items", {
          inventario_id: hoja.id,
          herramienta_id: herrId,
          descripcion_libre: "",
          marca: u.marca || "", codigo: u.codigo || "", serie: u.serie || "",
          cantidad: 1, estado: "OK", nota,
        });
        await logMov_({
          tipo: "ENTREGA", herramienta_id: herrId, descripcion: herr.nombre,
          marca: u.marca || "", codigo: u.codigo || "", serie: u.serie || "",
          cantidad: 1, destino_user_id: uid, nota, hecho_por: operador_(),
        });
        invMsg(`${etiquetaUnidad_(u)} entregada a ${nombreUsuario_(uid)}.`);
      } else {
        const cant = Math.max(1, Number($id("invEgCant")?.value) || 0);
        const codigo = $id("invEgCodigo")?.value?.trim() || "";
        const serie = $id("invEgSerie")?.value?.trim() || "";
        if ((codigo || serie) && cant !== 1) { invMsg("Con código o SN la cantidad debe ser 1.", true); return false; }
        if (cant > granel && !confirm(`Solo hay ${granel} a granel en el almacén. ¿Entregar ${cant} igual? El saldo quedará negativo.`)) return false;
        const data = {
          herramienta_id: herrId, descripcion_libre: "",
          marca: $id("invEgMarca")?.value?.trim() || "",
          codigo, serie, cantidad: cant, estado: "OK", nota,
        };
        await insertarOSumar_(hoja.id, data, itemsDestino);
        await moverStock_(herrId, -cant, {
          tipo: "ENTREGA", marca: data.marca, codigo, serie,
          destino_user_id: uid, nota, hecho_por: operador_(),
        });
        invMsg(`Entregadas ${cant} unidad(es) a ${nombreUsuario_(uid)}.`);
      }
      await renderStockSub_();
      return true;
    } catch (e) { invMsg(errorMsg_(e), true); return false; }
  });

  wireTecnicoSuggest_("invEgTec", "invEgTecList", "invEgTecId");

  // Al elegir una unidad identificada, los campos de granel sobran.
  const selU = $id("invEgUnidad");
  const sync = () => {
    const box = $id("invEgGranel");
    if (box && selU) box.style.display = selU.value ? "none" : "";
  };
  selU?.addEventListener("change", sync);
  sync();
}

// =====================================================================
//  DETALLE DE UNA HERRAMIENTA EN EL ALMACÉN
//  Un solo sitio con todo lo de esa herramienta: saldos, sus unidades
//  identificadas, su ficha (mínimo/ubicación/conteo) y las acciones que
//  no son del día a día (avería, reparación, desecho, descontinuar).
// =====================================================================
function abrirDetalleStock_(herrId) {
  const herr = INV.catMap.get(herrId);
  const fila = stockDe_(herrId);
  if (!herr || !fila) return;

  const granel = granelLibresDe_(herrId);
  const granelMal = granelMalDe_(herrId);
  const uds = unidadesDe_(herrId);
  const baja = descontinuada_(herr);

  const udsHtml = uds.length
    ? `<div class="invUnitList">${uds.map(u => `
        <div class="invUnit${u.estado === "MAL" ? " invUnit--mal" : ""}">
          <div class="invUnitId">
            ${(u.codigo || "").trim() ? `<span class="invCodChip">${esc(u.codigo.trim())}</span>` : ""}
            ${(u.serie || "").trim() ? `<span class="invCodChip invCodChipSn">SN ${esc(u.serie.trim())}</span>` : ""}
            ${(u.marca || "").trim() ? `<span class="invTdMuted">${esc(u.marca.trim())}</span>` : ""}
          </div>
          <div class="invUnitMeta">
            ${u.estado === "MAL"
              ? `<span class="invBadge invBadge--warn">Malograda</span>`
              : `<span class="invBadge invBadge--ok">Disponible</span>`}
            ${u.ubicacion ? `<span class="invTdMuted">${esc(u.ubicacion)}</span>` : ""}
          </div>
          <div class="invUnitActions">
            ${u.estado === "MAL"
              ? `<button class="invRowBtn invUdRep" data-uid="${esc(u.id)}" title="Marcar reparada">${icon("wrench", 14)}</button>`
              : `<button class="invRowBtn invUdAve" data-uid="${esc(u.id)}" title="Marcar malograda">${icon("alertTriangle", 14)}</button>`}
            <button class="invRowBtn invRowBtn--danger invUdDel" data-uid="${esc(u.id)}" title="Desechar esta unidad">${icon("trash", 14)}</button>
          </div>
        </div>`).join("")}</div>`
    : `<p class="invHint">Ninguna unidad con código o SN todavía.</p>`;

  // Lo suelto se puede convertir en objetos rastreables cuando haga falta.
  const identificarHtml = granel > 0
    ? `<div class="invNota">
        ${icon("tag", 15)}
        <span>Hay <strong>${granel}</strong> unidad(es) contadas a granel: sabes cuántas tienes,
        pero no cuál es cuál. Si son equipos con número de serie, dales su código.</span>
        <button type="button" class="invBtn invDtIdentificar">${icon("tag", 14)} Identificar</button>
      </div>`
    : "";

  const body = `
    <div class="invForm">
      <div class="invPickShow">
        ${herr.categoria ? `<span class="invCatTag">${esc(herr.categoria)}</span>` : ""}
        <strong>${esc(detalleDe_(herr))}</strong>
        ${baja ? `<span class="invBadge invBadge--muted">Descontinuada</span>` : ""}
      </div>
      ${saldoHtml_(herrId)}
      ${baja && herr.descontinuada_motivo
        ? `<div class="invNota">${icon("inbox", 15)}<span>Descontinuada: <em>${esc(herr.descontinuada_motivo)}</em></span></div>`
        : ""}

      <div class="invSection">
        <div class="invSectionHead">${icon("tag", 15)} Unidades identificadas <span class="invSegN">${uds.length}</span></div>
        ${udsHtml}
        ${identificarHtml}
      </div>

      <div class="invSection">
        <div class="invSectionHead">${icon("settings", 15)} Ficha y conteo físico</div>
        <div class="invFieldRow">
          <label class="invField">
            <span class="invFieldLabel">Sueltas sanas <span class="invFieldHint">(sin código)</span></span>
            <input id="invFiCont" type="number" value="${granel}">
          </label>
          <label class="invField">
            <span class="invFieldLabel">Sueltas malogradas</span>
            <input id="invFiContMal" type="number" value="${granelMal}">
          </label>
        </div>
        <p class="invHint">Escribe lo que hay de verdad en el estante y se registra la diferencia
        como ajuste. Las unidades con código se cuentan arriba, una por una.</p>
        <div class="invFieldRow">
          <label class="invField">
            <span class="invFieldLabel">Stock mínimo <span class="invFieldHint">(avisa para reponer)</span></span>
            <input id="invFiMin" type="number" min="0" value="${Number(fila.stock_minimo) || 0}">
          </label>
          <label class="invField">
            <span class="invFieldLabel">Ubicación</span>
            <input id="invFiUbic" type="text" value="${esc(fila.ubicacion || "")}" placeholder="Ej: Estante B-2">
          </label>
        </div>
        <label class="invField">
          <span class="invFieldLabel">Nota interna</span>
          <input id="invFiNota" type="text" value="${esc(fila.nota || "")}" placeholder="Ej: las 2 nuevas siguen en caja">
        </label>
      </div>

      <div class="invSection">
        <div class="invSectionHead">${icon("swap", 15)} Otras acciones</div>
        <div class="invActionGrid">
          <button type="button" class="invBtn invDtAveria">${icon("alertTriangle", 14)} Reportar avería (sueltas)</button>
          ${granelMal ? `<button type="button" class="invBtn invDtReparar">${icon("wrench", 14)} Marcar reparadas (sueltas)</button>` : ""}
          ${granelMal ? `<button type="button" class="invBtn invBtn--danger invDtDesechar">${icon("trash", 14)} Desechar sueltas</button>` : ""}
          ${baja ? "" : `<button type="button" class="invBtn invBtn--danger invDtBaja">${icon("trayOut", 14)} Dar de baja sueltas</button>`}
          <button type="button" class="invBtn invDtDescont">${icon(baja ? "refresh" : "inbox", 14)} ${baja ? "Reactivar herramienta" : "Descontinuar herramienta"}</button>
        </div>
      </div>
    </div>`;

  abrirModal_(`Detalle · ${esc(detalleDe_(herr))}`, body, async () => {
    const contado = Number($id("invFiCont")?.value);
    const contadoMal = Number($id("invFiContMal")?.value);
    if (!Number.isFinite(contado) || !Number.isFinite(contadoMal)) {
      invMsg("Los conteos físicos deben ser números.", true); return false;
    }
    const data = {
      stock_minimo: Math.max(0, Number($id("invFiMin")?.value) || 0),
      ubicacion: $id("invFiUbic")?.value?.trim() || "",
      nota: $id("invFiNota")?.value?.trim() || "",
      cantidad_almacen: contado,
      cantidad_malogrado: contadoMal,
      updated_at: new Date().toISOString(),
    };
    try {
      await supabasePatch("inventario_stock", { id: fila.id }, data);
      Object.assign(fila, data);
      const d = contado - granel, dMal = contadoMal - granelMal;
      if (d !== 0 || dMal !== 0) {
        const partes = [];
        if (d !== 0)    partes.push(`sueltas sanas ${granel} → ${contado} (${d > 0 ? "+" : ""}${d})`);
        if (dMal !== 0) partes.push(`sueltas malogradas ${granelMal} → ${contadoMal} (${dMal > 0 ? "+" : ""}${dMal})`);
        await logMov_({
          tipo: "AJUSTE", herramienta_id: herrId, descripcion: herr.nombre,
          cantidad: Math.abs(d) + Math.abs(dMal),
          nota: `Conteo físico: ${partes.join(" · ")}`, hecho_por: operador_(),
        });
        invMsg(`Ajustado por conteo físico: ${partes.join(" · ")}.`);
      } else {
        invMsg("Ficha guardada.");
      }
      await renderStockSub_();
      return true;
    } catch (e) { invMsg(errorMsg_(e), true); return false; }
  }, { ancho: true });

  // ── Acciones sobre una unidad identificada concreta ──
  const tocarUnidad_ = async (uid, cambio, mov) => {
    const u = INV.unidades.find(x => x.id === uid);
    if (!u) return;
    try {
      if (cambio === "borrar") await supabaseDelete("inventario_stock_unidades", { id: uid });
      else await supabasePatch("inventario_stock_unidades", { id: uid }, cambio);
      await logMov_({
        herramienta_id: herrId, descripcion: herr.nombre,
        marca: u.marca || "", codigo: u.codigo || "", serie: u.serie || "",
        cantidad: 1, hecho_por: operador_(), ...mov,
      });
      await cargarSnapshot_();
      abrirDetalleStock_(herrId);   // el panel se refresca en el sitio
      renderStockSub_(false);
    } catch (e) { invMsg(errorMsg_(e), true); }
  };
  document.querySelectorAll(".invUdAve").forEach(b => b.addEventListener("click", () =>
    tocarUnidad_(b.dataset.uid, { estado: "MAL" }, { tipo: "AVERIA", nota: "Unidad identificada" })));
  document.querySelectorAll(".invUdRep").forEach(b => b.addEventListener("click", () =>
    tocarUnidad_(b.dataset.uid, { estado: "OK" }, { tipo: "REPARACION", nota: "Unidad identificada" })));
  document.querySelectorAll(".invUdDel").forEach(b => b.addEventListener("click", () => {
    if (!confirm("¿Desechar esta unidad? Sale del inventario y no se puede deshacer.")) return;
    tocarUnidad_(b.dataset.uid, "borrar", { tipo: "DESECHO", nota: "Unidad identificada desechada" });
  }));

  // ── Acciones a granel (abren su propio modal encima) ──
  document.querySelector(".invDtIdentificar")?.addEventListener("click", () => abrirIdentificarStock_(herrId));
  document.querySelector(".invDtAveria")?.addEventListener("click", () => abrirAveriaStock_(herrId));
  document.querySelector(".invDtReparar")?.addEventListener("click", () => abrirReparacionStock_(herrId));
  document.querySelector(".invDtDesechar")?.addEventListener("click", () => abrirDesecharStock_(herrId));
  document.querySelector(".invDtBaja")?.addEventListener("click", () => abrirBajaStock_(herrId));
  document.querySelector(".invDtDescont")?.addEventListener("click", () => abrirDescontinuar_(herrId));
}

// ── Modal corto y reutilizable para mover cantidades a granel ──
// Todas estas acciones son la misma forma: cuántas y por qué.
function modalCantidad_({ herrId, titulo, intro, maximo, obligarNota, etiqueta, valor = 1, onOk }) {
  const herr = INV.catMap.get(herrId);
  if (!herr) return;
  const body = `
    <div class="invForm">
      <div class="invPickShow">
        ${herr.categoria ? `<span class="invCatTag">${esc(herr.categoria)}</span>` : ""}
        <strong>${esc(detalleDe_(herr))}</strong>
      </div>
      ${saldoHtml_(herrId)}
      <p class="invHint">${intro}</p>
      <label class="invField">
        <span class="invFieldLabel">${esc(etiqueta)} <span class="invFieldHint">(hay ${maximo} suelta(s))</span></span>
        <input id="invQCant" type="number" min="1" value="${Math.min(valor, Math.max(1, maximo))}">
      </label>
      <label class="invField">
        <span class="invFieldLabel">Motivo ${obligarNota ? `<span class="invFieldHint">(obligatorio: queda en la bitácora)</span>` : ""}</span>
        <input id="invQNota" type="text" placeholder="Ej: se le partió el mango">
      </label>
    </div>`;
  abrirModal_(`${titulo} · ${esc(detalleDe_(herr))}`, body, async () => {
    const cant = Math.max(1, Number($id("invQCant")?.value) || 0);
    const nota = $id("invQNota")?.value?.trim() || "";
    if (obligarNota && !nota) { invMsg("Escribe el motivo: queda en la bitácora.", true); return false; }
    if (cant > maximo && !confirm(`Solo hay ${maximo} suelta(s). ¿Continuar con ${cant}? El saldo quedará negativo.`)) return false;
    try {
      await onOk(cant, nota);
      await renderStockSub_();
      return true;
    } catch (e) { invMsg(errorMsg_(e), true); return false; }
  });
}

// ── AVERÍA · sueltas sanas → sueltas malogradas ──
function abrirAveriaStock_(herrId) {
  modalCantidad_({
    herrId, titulo: "Reportar avería", etiqueta: "¿Cuántas se malograron?",
    maximo: granelLibresDe_(herrId), obligarNota: true,
    intro: "Se quedan en el almacén pero dejan de estar disponibles. El total físico no cambia: siguen siendo de la empresa hasta que se desechen.",
    async onOk(cant, nota) {
      const r = await ajustarStock_(herrId, { libres: -cant, malogradas: cant },
        { tipo: "AVERIA", nota, hecho_por: operador_() });
      invMsg(`${cant} unidad(es) pasaron a malogradas. Sueltas sanas: ${r?.libres ?? "—"}.`);
    },
  });
}

// ── REPARACIÓN · sueltas malogradas → sueltas sanas ──
function abrirReparacionStock_(herrId) {
  const mal = granelMalDe_(herrId);
  if (!mal) { invMsg("No hay unidades sueltas malogradas.", true); return; }
  modalCantidad_({
    herrId, titulo: "Marcar reparadas", etiqueta: "¿Cuántas se repararon?",
    maximo: mal, valor: mal, obligarNota: false,
    intro: "Vuelven al estante como unidades sanas y ya se pueden entregar.",
    async onOk(cant, nota) {
      await ajustarStock_(herrId, { libres: cant, malogradas: -cant },
        { tipo: "REPARACION", nota, hecho_por: operador_() });
      invMsg(`${cant} unidad(es) volvieron a estar disponibles.`);
    },
  });
}

// ── DESECHO · la unidad malograda sale del inventario para siempre ──
function abrirDesecharStock_(herrId) {
  const mal = granelMalDe_(herrId);
  if (!mal) { invMsg("No hay unidades sueltas malogradas.", true); return; }
  modalCantidad_({
    herrId, titulo: "Desechar", etiqueta: "¿Cuántas se desechan?",
    maximo: mal, obligarNota: true,
    intro: "Se botan: dejan de contar como patrimonio y el total físico baja. Esto no se puede deshacer — si todavía puede repararse, usa «Marcar reparadas».",
    async onOk(cant, nota) {
      await ajustarStock_(herrId, { malogradas: -cant }, { tipo: "DESECHO", nota, hecho_por: operador_() });
      invMsg(`${cant} unidad(es) desechadas.`);
    },
  });
}

// ── SALIDA · baja de unidades sanas del almacén ──
function abrirBajaStock_(herrId) {
  modalCantidad_({
    herrId, titulo: "Dar de baja", etiqueta: "Cantidad que sale",
    maximo: granelLibresDe_(herrId), obligarNota: true,
    intro: "Sale del almacén y no vuelve: perdida o devuelta al proveedor. Si en cambio se la llevó un técnico usa «Entregar», y si se rompió usa «Reportar avería».",
    async onOk(cant, nota) {
      await moverStock_(herrId, -cant, { tipo: "SALIDA", nota, hecho_por: operador_() });
      invMsg(`Baja registrada de ${cant} unidad(es).`);
    },
  });
}

// ── DESCONTINUAR / REACTIVAR · la herramienta entera ──
// No se borra del catálogo: se marca inactiva. Así deja de ofrecerse en
// entregas y kits nuevos (wireBuscador_ filtra por activo), pero el
// histórico de quién la tuvo sigue en pie.
function abrirDescontinuar_(herrId) {
  const herr = INV.catMap.get(herrId);
  if (!herr) return;
  const baja = descontinuada_(herr);
  const libres = libresDe_(herrId), mal = malogradasDe_(herrId);
  const asig = asignadasPorHerr_().get(herrId)?.unidades || 0;
  const pendientes = libres + mal + asig;

  const body = baja
    ? `<div class="invForm">
        <div class="invPickShow"><strong>${esc(detalleDe_(herr))}</strong></div>
        <p class="invHint">Está descontinuada desde
          ${herr.descontinuada_at ? esc(new Date(herr.descontinuada_at).toLocaleDateString("es-PE")) : "hace un tiempo"}.
          ${herr.descontinuada_motivo ? `Motivo: <em>${esc(herr.descontinuada_motivo)}</em>.` : ""}
          Al reactivarla vuelve a aparecer en entregas, kits y buscadores.</p>
      </div>`
    : `<div class="invForm">
        <div class="invPickShow"><strong>${esc(detalleDe_(herr))}</strong></div>
        ${saldoHtml_(herrId)}
        <p class="invHint">Deja de ofrecerse en entregas, kits y buscadores.
        <strong>No se borra</strong>: el histórico de quién la tuvo se conserva y las unidades que sigan
        por ahí se pueden seguir devolviendo y desechando.</p>
        ${pendientes ? `<div class="invNota invNota--warn">${icon("alertTriangle", 15)}
          <span>Todavía hay <strong>${pendientes}</strong> unidad(es) sin recuperar
          (${libres} libre(s), ${mal} malograda(s), ${asig} con técnicos). Puedes descontinuarla igual;
          quedarán listadas en «Taller» hasta que las recojas.</span></div>` : ""}
        <label class="invField">
          <span class="invFieldLabel">¿Por qué se descontinúa? <span class="invFieldHint">(obligatorio)</span></span>
          <input id="invDcNota" type="text" placeholder="Ej: se cambió por el modelo inalámbrico">
        </label>
      </div>`;

  abrirModal_(baja ? `Reactivar · ${esc(detalleDe_(herr))}` : `Descontinuar · ${esc(detalleDe_(herr))}`, body, async () => {
    try {
      if (baja) {
        await supabasePatch("herramientas_catalogo", { id: herrId },
          { activo: true, descontinuada_motivo: "", descontinuada_at: null });
        await logMov_({ tipo: "REACTIVAR", herramienta_id: herrId, descripcion: herr.nombre,
          cantidad: 0, nota: "Vuelve al catálogo activo", hecho_por: operador_() });
        invMsg("Herramienta reactivada.");
      } else {
        const nota = $id("invDcNota")?.value?.trim() || "";
        if (!nota) { invMsg("Escribe por qué se descontinúa.", true); return false; }
        await supabasePatch("herramientas_catalogo", { id: herrId },
          { activo: false, descontinuada_motivo: nota, descontinuada_at: new Date().toISOString() });
        await logMov_({ tipo: "DESCONTINUAR", herramienta_id: herrId, descripcion: herr.nombre,
          cantidad: pendientes, nota, hecho_por: operador_() });
        invMsg("Herramienta descontinuada. Ya no se ofrecerá en entregas ni kits.");
      }
      await cargarBase_();
      await renderStockSub_();
      return true;
    } catch (e) { invMsg(errorMsg_(e), true); return false; }
  });
}

// ── DEVOLUCIÓN · técnico → almacén ──
async function devolverAlAlmacen_(itemId) {
  const it = INV.invItems.find(x => x.id === itemId);
  if (!it) return;
  if (!it.herramienta_id) {
    invMsg("Ese ítem es texto libre: pásalo primero al catálogo para poder devolverlo al almacén.", true);
    return;
  }
  const total = cantidadDe_(it);
  const identificada = tieneCodigo_(it);
  const rota = it.estado === "MAL";
  const body = `
    <div class="invForm">
      <div class="invPickShow"><strong>${esc(nombreItem(it))}</strong> ${codigosChips_(it)}</div>
      <p class="invHint">Sale de la hoja del técnico y vuelve al estante del almacén.
      ${identificada ? "Como tiene código o SN, vuelve como <strong>unidad identificada</strong>." : ""}</p>
      ${saldoHtml_(it.herramienta_id)}
      ${identificada ? `<input type="hidden" id="invDevCant" value="1">` : `
      <label class="invField">
        <span class="invFieldLabel">Cantidad que devuelve <span class="invFieldHint">(tiene ${total})</span></span>
        <input id="invDevCant" type="number" min="1" max="${total}" value="${total}">
      </label>`}
      <label class="invField">
        <span class="invFieldLabel">¿En qué estado vuelve?</span>
        <select id="invDevEstado">
          <option value="OK"${rota ? "" : " selected"}>Buena — vuelve al estante lista para entregar</option>
          <option value="MAL"${rota ? " selected" : ""}>Malograda — entra a la pila de rotas</option>
        </select>
        <span class="invFieldHint">Se propone según cómo estaba marcada en su hoja (${esc(ESTADO_LABEL[it.estado] || it.estado)}).</span>
      </label>
      <label class="invField">
        <span class="invFieldLabel">Nota</span>
        <input id="invDevNota" type="text" placeholder="Ej: cambio de área">
      </label>
    </div>`;

  abrirModal_("Devolver al almacén", body, async () => {
    const cant = identificada ? 1 : Math.min(total, Math.max(1, Number($id("invDevCant")?.value) || 0));
    const nota = $id("invDevNota")?.value?.trim() || "";
    const mala = $id("invDevEstado")?.value === "MAL";
    try {
      if (cant >= total) await supabaseDelete("inventario_tecnico_items", { id: it.id });
      else await supabasePatch("inventario_tecnico_items", { id: it.id }, { cantidad: total - cant });
      await asegurarStock_(it.herramienta_id);

      if (identificada) {
        // Vuelve como fila propia: conserva su código y su SN, que es
        // justamente para lo que sirven.
        await supabasePost("inventario_stock_unidades", {
          herramienta_id: it.herramienta_id,
          marca: it.marca || "", codigo: it.codigo || "", serie: it.serie || "",
          estado: mala ? "MAL" : "OK",
          ubicacion: stockDe_(it.herramienta_id)?.ubicacion || "",
          nota,
        });
        await logMov_({
          tipo: "DEVOLUCION", herramienta_id: it.herramienta_id, descripcion: nombreItem(it),
          marca: it.marca || "", codigo: it.codigo || "", serie: it.serie || "",
          cantidad: 1, origen_user_id: INV.selTecId,
          nota: mala ? `Vuelve malograda${nota ? ` · ${nota}` : ""}` : nota,
          hecho_por: operador_(),
        });
      } else {
        // Si vuelve rota entra directo a malogradas: si entrara como libre,
        // el almacén ofrecería para entregar algo que no sirve.
        await ajustarStock_(it.herramienta_id, mala ? { malogradas: cant } : { libres: cant }, {
          tipo: "DEVOLUCION", marca: it.marca || "",
          origen_user_id: INV.selTecId,
          nota: mala ? `Vuelve malograda${nota ? ` · ${nota}` : ""}` : nota,
          hecho_por: operador_(),
        });
      }
      invMsg(`Devueltas ${cant} unidad(es) al almacén${mala ? " como malogradas" : ""}.`);
      await abrirInventarioTec_(INV.selTecId, INV.invActual);
      return true;
    } catch (e) { invMsg(errorMsg_(e), true); return false; }
  });
}

// ── Autocompletado de técnicos (name suggest) ────────────────────────
// Usa /api/name-suggest, igual que el resto de la app.
//
// Los widgets se registran para poder destruirlos: `createSuggest_` engancha
// un listener en `document` y resuelve sus elementos por ID, así que un
// widget viejo sobre un DOM ya re-renderizado seguía respondiendo y peleaba
// con el nuevo por la misma caja. Era la causa de que el suggest fallara
// de forma intermitente.
const SUGGESTS_ = new Map(); // inputId → widget vivo

function wireTecnicoSuggest_(inputId, boxId, hiddenId, onPick) {
  SUGGESTS_.get(inputId)?.destroy();
  SUGGESTS_.delete(inputId);

  const inp = $id(inputId);
  if (!inp) return null;

  const w = createNameSuggest_({
    input: inputId,
    box: boxId,
    min: 1,
    onPick(item) {
      const h = $id(hiddenId);
      if (h) h.value = item.userId || "";
      inp.value = item.name || item.email || "";
      inp.dataset.picked = "1";
      onPick?.(item);
    },
  });
  w.bind();
  // Si sigue escribiendo tras elegir, la selección deja de ser válida: no
  // se le puede entregar nada a un técnico que ya no es el del cuadro.
  const onType = () => {
    const h = $id(hiddenId);
    if (h) h.value = "";
    delete inp.dataset.picked;
  };
  inp.addEventListener("input", onType);

  const widget = {
    destroy() {
      try { w.destroy(); } catch { /* el DOM ya no está */ }
      inp.removeEventListener("input", onType);
    },
  };
  SUGGESTS_.set(inputId, widget);
  return widget;
}

// ── Excel de existencias ──
const HEADERS_STOCK = [
  "Categoría", "Herramienta", "Especialidad",
  "Libres", "Malogradas", "Asignadas", "Total",
  "Con código/SN", "Mínimo", "Ubicación", "Estado", "Motivo de baja", "Nota",
];
const HEADERS_UNIDADES = ["Categoría", "Herramienta", "Código", "N° de serie", "Marca", "Estado", "Ubicación", "Nota"];

async function exportarStockXls_() {
  if (!stockDisponible_()) { invMsg("Existencias no está activo todavía.", true); return; }
  invMsg("Generando Excel de existencias…");
  try {
    await cargarSnapshot_();
    const asig = asignadasPorHerr_();
    const filas = INV.catalogo.map(h => {
      const f = filaStock_(h, asig);
      return [
        h.categoria || "", h.nombre, h.especialidad || "",
        f.libres, f.malogradas, f.asignadas, f.total,
        f.uds.length, f.minimo, f.ubicacion,
        f.baja ? "Descontinuada" : NIVEL_META[f.nivel].label,
        f.baja ? (h.descontinuada_motivo || "") : "",
        f.st?.nota || "",
      ];
    }).sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));

    const taller = filas.filter(r => Number(r[4]) > 0 || r[10] === "Descontinuada");

    const unidades = INV.unidades.map(u => {
      const h = INV.catMap.get(u.herramienta_id);
      return [
        h?.categoria || "", h?.nombre || "", u.codigo || "", u.serie || "", u.marca || "",
        u.estado === "MAL" ? "Malograda" : "Disponible", u.ubicacion || "", u.nota || "",
      ];
    }).sort((a, b) => String(a[1]).localeCompare(String(b[1])));

    exportXls_({
      filename: `EXISTENCIAS_${fechaArchivo_()}.xls`,
      sheets: [
        { nombre: "Existencias", headers: HEADERS_STOCK, rows: filas },
        {
          nombre: "Unidades con código",
          titulo: "Equipos identificados que están en el almacén (los que tiene un técnico salen en su hoja)",
          headers: HEADERS_UNIDADES, rows: unidades,
        },
        {
          nombre: "Taller",
          titulo: "Unidades rotas esperando reparación y herramientas fuera de uso",
          headers: HEADERS_STOCK, rows: taller,
        },
      ],
    });
    invMsg("Excel de existencias generado.");
  } catch (e) { invMsg(errorMsg_(e), true); }
}


// =====================================================================
//  SUB-VISTA · TOTALES (contador global de herramientas)
//  Cuántas unidades hay de cada herramienta en la calle, en manos de
//  cuántos técnicos y en qué estado. Más la bitácora de movimientos.
// =====================================================================
async function renderTotalesSub_(filtro = "", recargar = true) {
  const box = $id("invSubContent");
  if (!box) return;
  if (recargar) {
    box.innerHTML = `<div class="small muted" style="padding:12px;">Calculando totales…</div>`;
    await cargarSnapshot_();
  }

  const userByHoja = new Map(INV.hojas.map(h => [h.id, h.user_id]));

  // Agrupar TODOS los ítems de TODAS las hojas por herramienta.
  const grupos = new Map();
  INV.todosItems.forEach(it => {
    const key = claveItem_(it);
    if (!grupos.has(key)) {
      const h = it.herramienta_id ? INV.catMap.get(it.herramienta_id) : null;
      grupos.set(key, {
        nombre: nombreItem(it),
        categoria: h?.categoria || (it.herramienta_id ? "" : "LIBRE"),
        unidades: 0, tecnicos: new Set(), conCodigo: 0,
        porEstado: {},
      });
    }
    const g = grupos.get(key);
    g.unidades += cantidadDe_(it);
    const uid = userByHoja.get(it.inventario_id);
    if (uid) g.tecnicos.add(uid);
    if (tieneCodigo_(it)) g.conCodigo++;
    g.porEstado[it.estado] = (g.porEstado[it.estado] || 0) + cantidadDe_(it);
  });

  const q = filtro.trim().toLowerCase();
  const lista = [...grupos.values()]
    .filter(g => !q || `${g.categoria} ${g.nombre}`.toLowerCase().includes(q))
    .sort((a, b) => b.unidades - a.unidades || a.nombre.localeCompare(b.nombre));

  const totalUnidades = INV.todosItems.reduce((s, it) => s + cantidadDe_(it), 0);
  const conteoEstado = ESTADOS.reduce((acc, e) => {
    acc[e] = INV.todosItems.filter(it => it.estado === e).reduce((s, it) => s + cantidadDe_(it), 0);
    return acc;
  }, {});
  const identificadas = INV.todosItems.filter(tieneCodigo_).length;

  const filas = lista.map(g => `
    <tr>
      <td>${esc(g.nombre)}${g.categoria ? `<span class="invSearchCat" style="margin-left:6px;">${esc(g.categoria)}</span>` : ""}</td>
      <td style="text-align:center;"><strong>${g.unidades}</strong></td>
      <td style="text-align:center;">${g.tecnicos.size}</td>
      <td style="text-align:center;">${g.conCodigo || `<span class="small muted">—</span>`}</td>
      <td>${ESTADOS.filter(e => g.porEstado[e]).map(e =>
        `${estadoBadge(e)}<span class="invEstadoN">×${g.porEstado[e]}</span>`).join(" ")}</td>
    </tr>`).join("");

  box.innerHTML = `
    <p class="small muted">Todo lo entregado, sumado por herramienta. Sirve para saber cuántas hay en la calle y en qué estado.</p>
    <div class="invResumen">
      <span class="invResumenChip">Unidades totales <strong>${totalUnidades}</strong></span>
      <span class="invResumenChip">Herramientas distintas <strong>${grupos.size}</strong></span>
      <span class="invResumenChip">Técnicos con hoja <strong>${INV.hojas.length}</strong></span>
      <span class="invResumenChip">Con código/SN <strong>${identificadas}</strong></span>
      ${ESTADOS.map(e => `<span class="invResumenChip">${ESTADO_LABEL[e]} <strong>${conteoEstado[e]}</strong></span>`).join("")}
    </div>
    <div class="invCatToolbar" style="margin-top:12px;">
      <div class="adminSearchWrap" style="flex:1;min-width:200px;">
        <span class="adminSearchIcon" aria-hidden="true">${icon("search", 16)}</span>
        <input id="invTotFiltro" type="text" placeholder="Filtrar herramienta…" autocomplete="off" value="${esc(filtro)}">
      </div>
      <button id="invTotExcel" class="adminBtnGhost">${icon("download", 14)} Excel general</button>
      <button id="invTotRefresh" class="adminBtnGhost">${icon("refresh", 14)} Actualizar</button>
    </div>
    <div class="adminTableScroll">
      <table class="adminTable">
        <thead><tr><th>Herramienta</th><th style="text-align:center;">Unidades</th><th style="text-align:center;">Técnicos</th><th style="text-align:center;">Con código</th><th>Estados</th></tr></thead>
        <tbody>${filas || `<tr><td colspan="5" class="small muted" style="padding:12px;">Sin herramientas entregadas.</td></tr>`}</tbody>
      </table>
    </div>
    <div id="invMovBox" style="margin-top:18px;"></div>
  `;

  const filtroEl = $id("invTotFiltro");
  filtroEl?.addEventListener("input", e => {
    // Re-render sobre el snapshot ya cargado (sin ir a la red por tecla).
    renderTotalesSub_(e.target.value, false);
    const nuevo = $id("invTotFiltro");
    if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); }
  });
  $id("invTotExcel")?.addEventListener("click", exportarGeneralXls_);
  $id("invTotRefresh")?.addEventListener("click", () => renderTotalesSub_(filtroEl?.value || ""));
  pintarMovimientos_();
}

// Bitácora: últimos traspasos/asignaciones. Si la tabla no existe todavía
// (SQL v2 sin correr), se avisa en vez de romper la vista.
async function pintarMovimientos_() {
  const box = $id("invMovBox");
  if (!box) return;
  let movs = [];
  try {
    movs = await supabaseGet("inventario_movimientos"); // se ordena en cliente
  } catch {
    box.innerHTML = `<div class="small muted">Historial de movimientos no disponible.
      ¿Ejecutaste <code>supabase/inventario-codigos-traspaso.sql</code>?</div>`;
    return;
  }
  movs = (movs || [])
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 40);
  if (!movs.length) {
    box.innerHTML = `<div class="invCatGroupTitle">Movimientos</div>
      <div class="small muted" style="padding:8px 0;">Aún no hay traspasos ni asignaciones registradas.</div>`;
    return;
  }
  const filas = movs.map(m => {
    const fecha = m.created_at ? new Date(m.created_at).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }) : "";
    const ALMACEN = `<span class="invMovAlmacen">Almacén</span>`;
    const ruta =
      m.tipo === "TRASPASO"   ? `${esc(m.origen_nombre || "—")} → <strong>${esc(m.destino_nombre || "—")}</strong>`
    : m.tipo === "ENTREGA"    ? `${ALMACEN} → <strong>${esc(m.destino_nombre || "—")}</strong>`
    : m.tipo === "DEVOLUCION" ? `${esc(m.origen_nombre || "—")} → ${ALMACEN}`
    : m.tipo === "ENTRADA"    ? `→ ${ALMACEN}`
    : m.tipo === "SALIDA"     ? `${ALMACEN} → baja`
    : m.tipo === "AJUSTE"     ? `${ALMACEN} · conteo físico`
    : m.tipo === "AVERIA"     ? `${ALMACEN} · libres → malogradas`
    : m.tipo === "REPARACION" ? `${ALMACEN} · malogradas → libres`
    : m.tipo === "DESECHO"    ? `${ALMACEN} → desechada`
    : m.tipo === "DESCONTINUAR" ? `Catálogo · fuera de uso`
    : m.tipo === "REACTIVAR"  ? `Catálogo · vuelve al uso`
    : `<strong>${esc(m.destino_nombre || "—")}</strong>`;
    const claseTipo = {
      TRASPASO:     "adminBadgeWarn",
      ASIGNACION:   "adminBadgeOk",
      ENTRADA:      "adminBadgeOk",
      DEVOLUCION:   "adminBadgeOk",
      REPARACION:   "adminBadgeOk",
      REACTIVAR:    "adminBadgeOk",
      ENTREGA:      "adminBadgeWarn",
      AVERIA:       "adminBadgeWarn",
      AJUSTE:       "adminBadgeWarn",
      SALIDA:       "adminBadgeDanger",
      DESECHO:      "adminBadgeDanger",
      DESCONTINUAR: "adminBadgeDanger",
      AUDITORIA:    "",
    }[m.tipo] ?? "";
    return `
      <tr>
        <td class="small muted">${esc(fecha)}</td>
        <td><span class="adminBadge ${claseTipo}">${esc(m.tipo)}</span></td>
        <td>${esc(m.descripcion || "—")} ${codigosChips_(m)}</td>
        <td style="text-align:center;">${Number(m.cantidad) || 0}</td>
        <td>${ruta}</td>
        <td class="small muted">${esc(m.nota || "")}${m.hecho_por ? ` · ${esc(m.hecho_por)}` : ""}</td>
      </tr>`;
  }).join("");
  box.innerHTML = `
    <div class="invCatGroupTitle">Movimientos recientes <span class="invCatCount">${movs.length}</span></div>
    <div class="adminTableScroll">
      <table class="adminTable">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Herramienta</th><th>Cant.</th><th>Quién</th><th>Nota</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

// =====================================================================
//  EXPORTAR A EXCEL
//  Siempre agrupado (2 martillos = 1 fila con cantidad 2), igual que en
//  pantalla. Un archivo por técnico, o el general con resumen + una hoja
//  por técnico (el formato con el que trabajaban en HERRAMIENTAS.xlsx).
// =====================================================================
const HEADERS_TEC = ["Herramienta", "Categoría", "Código / SN", "Marca", "Cantidad", "Estado", "Observación"];

function fechaArchivo_() { return new Date().toISOString().slice(0, 10); }

// Categoría de un grupo (del catálogo; "Libre" si es texto suelto).
function categoriaGrupo_(g) {
  const hid = g.items[0]?.herramienta_id;
  return hid ? (INV.catMap.get(hid)?.categoria || "") : "Libre";
}
// Estados de un grupo en texto ("OK ×2 · Falta ×1").
function estadosTexto_(g) {
  return ESTADOS.filter(e => g.porEstado[e])
    .map(e => `${ESTADO_LABEL[e]}${g.items.length > 1 ? ` ×${g.porEstado[e]}` : ""}`)
    .join(" · ");
}
// Códigos/SN de un grupo en texto plano (para la celda de Excel).
function codigosTexto_(g) {
  return g.items.map(it => [
    (it.codigo || "").trim(),
    (it.serie || "").trim() ? `SN ${it.serie.trim()}` : "",
  ].filter(Boolean).join(" ")).filter(Boolean).join(" | ");
}
// Filas (ya agrupadas) de una lista de ítems, listas para la hoja Excel.
function filasTecnicoXls_(items) {
  return agruparItems_(items).map(g => [
    g.nombre,
    categoriaGrupo_(g),
    codigosTexto_(g),
    g.marcas.join(", "),
    g.cantidad,
    estadosTexto_(g),
    g.notas.join(" · "),
  ]);
}

function exportarTecnicoXls_(user, inv) {
  const rows = filasTecnicoXls_(INV.invItems);
  const total = totalUnidades_(INV.invItems);
  rows.push([], ["TOTAL", "", "", "", total, "", ""]);
  exportXls_({
    filename: `inventario_${(user.nombre || "tecnico").replace(/\s+/g, "_").toLowerCase()}_${fechaArchivo_()}.xls`,
    sheets: [{
      nombre: user.nombre || "Técnico",
      titulo: `Inventario de herramientas · ${user.nombre}` +
        ` (${inv.formato === "ANTIGUO" ? "formato antiguo" : "formato nuevo"}` +
        `${inv.fecha_entrega ? `, entregado ${inv.fecha_entrega}` : ""}` +
        `${inv.tomado_por ? `, tomado por ${inv.tomado_por}` : ""})`,
      headers: HEADERS_TEC,
      rows,
    }],
  });
  invMsg("Excel del técnico descargado.");
}

// General: Resumen por herramienta + una fila por técnico + hoja de cada uno.
async function exportarGeneralXls_() {
  invMsg("Armando el Excel general…");
  try {
    await cargarSnapshot_();
    const itemsByHoja = new Map();
    INV.todosItems.forEach(it => {
      if (!itemsByHoja.has(it.inventario_id)) itemsByHoja.set(it.inventario_id, []);
      itemsByHoja.get(it.inventario_id).push(it);
    });

    // 1) Resumen: cuántas unidades de cada herramienta hay en la calle.
    const porHerr = new Map();
    INV.todosItems.forEach(it => {
      const key = claveItem_(it);
      if (!porHerr.has(key)) {
        porHerr.set(key, {
          nombre: nombreItem(it),
          categoria: it.herramienta_id ? (INV.catMap.get(it.herramienta_id)?.categoria || "") : "Libre",
          unidades: 0, tecnicos: new Set(), conCodigo: 0, porEstado: {},
        });
      }
      const g = porHerr.get(key);
      g.unidades += cantidadDe_(it);
      const hoja = INV.hojas.find(h => h.id === it.inventario_id);
      if (hoja) g.tecnicos.add(hoja.user_id);
      if (tieneCodigo_(it)) g.conCodigo++;
      g.porEstado[it.estado] = (g.porEstado[it.estado] || 0) + cantidadDe_(it);
    });
    const resumen = [...porHerr.values()]
      .sort((a, b) => b.unidades - a.unidades || a.nombre.localeCompare(b.nombre))
      .map(g => [g.nombre, g.categoria, g.unidades, g.tecnicos.size, g.conCodigo,
        ...ESTADOS.map(e => g.porEstado[e] || 0)]);

    // 2) Una fila por técnico (quién tiene cuánto y en qué estado).
    const porTecnico = INV.usuarios.map(u => {
      const hoja = INV.hojaByUser.get(u.id);
      const items = hoja ? (itemsByHoja.get(hoja.id) || []) : [];
      const grupos = agruparItems_(items);
      return [
        u.nombre, u.especialidad,
        hoja ? (hoja.formato === "ANTIGUO" ? "Antiguo" : "Nuevo") : "Sin inventario",
        totalUnidades_(items), grupos.length,
        ...ESTADOS.map(e => totalUnidades_(items.filter(it => it.estado === e))),
        hoja?.fecha_entrega || "", hoja?.tomado_por || "",
      ];
    });

    // 3) Detalle plano (técnico × herramienta agrupada) para tablas dinámicas.
    const detalle = [];
    INV.usuarios.forEach(u => {
      const hoja = INV.hojaByUser.get(u.id);
      if (!hoja) return;
      filasTecnicoXls_(itemsByHoja.get(hoja.id) || []).forEach(r => detalle.push([u.nombre, ...r]));
    });

    const sheets = [
      {
        nombre: "Resumen",
        titulo: `Inventario general de herramientas · ${fechaArchivo_()}`,
        headers: ["Herramienta", "Categoría", "Unidades", "Técnicos", "Con código/SN",
          ...ESTADOS.map(e => ESTADO_LABEL[e])],
        rows: resumen,
      },
      {
        nombre: "Por técnico",
        headers: ["Técnico", "Especialidad", "Formato", "Unidades", "Distintas",
          ...ESTADOS.map(e => ESTADO_LABEL[e]), "Fecha entrega", "Tomado por"],
        rows: porTecnico,
      },
      {
        nombre: "Detalle",
        headers: ["Técnico", ...HEADERS_TEC],
        rows: detalle,
      },
    ];

    // 4) Y la hoja individual de cada técnico (como el Excel de siempre).
    INV.usuarios.forEach(u => {
      const hoja = INV.hojaByUser.get(u.id);
      if (!hoja) return;
      const items = itemsByHoja.get(hoja.id) || [];
      if (!items.length) return;
      const rows = filasTecnicoXls_(items);
      rows.push([], ["TOTAL", "", "", "", totalUnidades_(items), "", ""]);
      sheets.push({
        nombre: u.nombre,
        titulo: `${u.nombre} · ${u.especialidad}` +
          `${hoja.fecha_entrega ? ` · entregado ${hoja.fecha_entrega}` : ""}`,
        headers: HEADERS_TEC,
        rows,
      });
    });

    exportXls_({ filename: `inventario_general_${fechaArchivo_()}.xls`, sheets });
    invMsg(`Excel general descargado (${sheets.length} hojas).`);
  } catch (e) { invMsg(errorMsg_(e), true); }
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
function abrirModal_(titulo, bodyHtml, onSave, opts = {}) {
  document.getElementById("invModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "invModal";
  modal.className = "modal show";
  modal.innerHTML = `
    <div class="modalBox adminModalBox invModalBox${opts.ancho ? " invModalBox--ancho" : ""}">
      <div class="modalHead">
        <span class="modalTitle">${esc(titulo)}</span>
        <button type="button" class="invModalClose" title="Cerrar">✕</button>
      </div>
      <div class="modalBody">${bodyHtml}</div>
      <div class="adminModalFoot">
        <button type="button" class="invBtn invModalCancel">Cancelar</button>
        <button type="button" class="invBtn invBtn--primary invModalSave">${esc(opts.guardar || "Guardar")}</button>
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
