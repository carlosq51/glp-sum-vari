// =========================
// public/js/views/consulta/consulta.js
// Vista CONSULTA DE VIN
//
// El mismo veredicto que ve PDI en /invitado, más el detrás: en qué zona está
// el carro, quién trabajó cada etapa y cuánto tardó.
//
// El detalle (nombres y tiempos) es solo para SUPERVISOR y ADMIN. El resto ve
// el veredicto, la zona y la ficha del carro. Ojo: el filtro es de cliente —
// este servidor no autentica ninguna ruta, aquí ni en admin. Esconde la
// información, no la protege.
// =========================

import { CORE, escapeHtml, fmtShort_, getJSON, postJSON, createVinSuggest_ } from "../../core/core.js";
import { createScanner } from "../../core/qr-scanner.js";

// Sobre el modal compartido #qrModal, igual que conversión y supervisor: cada
// vista trae su propia instancia y abre solo cuando su módulo está delante.
const _scanner = createScanner("qrReader");

/** ¿El usuario puede ver nombres y tiempos? */
function puedeVerDetalle_() {
  const rol = String(CORE.state.currentProfile?.rol || "").toUpperCase();
  if (rol === "SUPERVISOR" || rol === "ADMIN") return true;
  // Quien tiene el módulo concedido manda sobre el rol: hay supervisores
  // dados de alta como TECNICO con los módulos abiertos a mano.
  const mods = (CORE.state.currentProfile?.modulos || [])
    .map(m => String(m || "").toUpperCase());
  return mods.includes("ADMIN") || mods.includes("SUPERVISOR") || mods.includes("ALL");
}

function aviso_(msg, esError) {
  const el = document.getElementById("cqAviso");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("error", !!esError);
}

/** "2 h 15 min" — los ms crudos no le dicen nada a nadie. */
function dur_(ms) {
  const min = Math.round((Number(ms) || 0) / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, "0")} min`;
}

const ETIQUETA_ROL = {
  MOTOR: "Motor", TANQUE: "Tanque", CALIDAD: "Calidad",
  RAMALERO: "Ramal", MOVILIZADOR: "Movilizador",
};

const ETIQUETA_ESTADO = {
  SIN_INICIAR: "Sin iniciar", TRABAJANDO: "Trabajando",
  PAUSADO: "Pausado", FINALIZADO: "Terminado",
};

/**
 * Chip de una etapa, pintado según en qué punto está.
 *
 * El tono lo decide el servidor (`etapas_tono`), no esta función: el texto y
 * el color salen del mismo sitio y no pueden desmentirse. Si la respuesta es
 * vieja y no trae el campo, el chip sale neutro como siempre.
 */
function chipEtapa_(icono, nombre, etiqueta, tono) {
  const clase = tono ? ` cqChip--${tono}` : "";
  return `<span class="cqChip${clase}">${icono} ${nombre}: ${escapeHtml(etiqueta)}</span>`;
}

/**
 * Chip de planificación.
 *
 * Tres respuestas, y la tercera importa: `null` es "no se pudo consultar la
 * lista". Ahí no se enseña nada, porque decir "no planificado" cuando no se
 * sabe frenaría un carro que sí se podía trabajar.
 */
function chipListaDiaria_(enLista) {
  if (enLista === true)  return `<span class="cqChip cqChip--listo">📋 En lista diaria</span>`;
  if (enLista === false) return `<span class="cqChip cqChip--alerta">⛔ Fuera de lista diaria · sin equipos asignados</span>`;
  return "";
}

// ─── Consulta ─────────────────────────────────────────────────────────

async function consultar_(vinCrudo) {
  const vin = String(vinCrudo || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (vin.length < 11) {
    aviso_("Escriba o escanee un VIN completo.", true);
    return;
  }
  aviso_("Consultando…");
  try {
    const d = await getJSON(`/api/vin/ficha/${encodeURIComponent(vin)}`);
    if (!d?.ok) throw new Error(d?.error || "No se pudo consultar.");
    pintar_(d);
    aviso_("");
  } catch (e) {
    aviso_(e.message || "Sin conexión. Intente de nuevo.", true);
  }
}

function pintar_(d) {
  document.getElementById("cqRVin").textContent    = d.vin || "";
  document.getElementById("cqTitulo").textContent  = d.titulo || "";
  document.getElementById("cqDetalle").textContent = d.detalle || "";
  document.getElementById("cqVeredicto").className = "cqVeredicto " + (d.tono || "duda");

  // Chips: lo que se lee de un vistazo.
  //
  // La planificación va primero, delante incluso de la zona, porque manda
  // sobre el veredicto: un "FALTA GLP" de un carro que no está en la lista
  // diaria no es una orden de trabajarlo — es un carro sin equipos asignados
  // que hay que dejar en paz hasta que almacén los traiga.
  const chips = [];
  const lista = chipListaDiaria_(d.lista_diaria);
  if (lista) chips.push(lista);
  if (d.zona) chips.push(`<span class="cqChip cqChip--zona">📍 ${escapeHtml(d.zona.nombre)}</span>`);
  const tonos = d.etapas_tono || {};
  chips.push(chipEtapa_("🔧", "Conversión", d.etapas.conversion, tonos.conversion));
  chips.push(chipEtapa_("🛡️", "Revisión",   d.etapas.calidad,    tonos.calidad));
  document.getElementById("cqChips").innerHTML = chips.join("");

  const f = d.ficha;
  document.getElementById("cqFicha").innerHTML = f ? `
    <div class="cqFichaGrid">
      ${f.modelo    ? `<span>Modelo</span><b>${escapeHtml(f.modelo)}</b>` : ""}
      ${f.cliente   ? `<span>Cliente</span><b>${escapeHtml(f.cliente)}</b>` : ""}
      ${f.tanque    ? `<span>Tanque</span><b>${escapeHtml(f.tanque)}</b>` : ""}
      ${f.reductor  ? `<span>Reductor</span><b>${escapeHtml(f.reductor)}</b>` : ""}
      ${f.ubicacion ? `<span>Ubicación</span><b>${escapeHtml(f.ubicacion)}</b>` : ""}
    </div>` : "";

  document.getElementById("cqDetalleBloque").innerHTML =
    puedeVerDetalle_() ? detalleHtml_(d) : "";

  const box = document.getElementById("cqResultado");
  box.style.display = "block";
  // Viniendo de una fila de la lista, la ficha nace fuera de pantalla.
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function detalleHtml_(d) {
  const bloques = [];

  if (d.zona) {
    bloques.push(panel_("Ubicación en el taller", `
      <div class="cqLinea">
        <b>${escapeHtml(d.zona.nombre)}</b>
        <span>desde ${fmtShort_(d.zona.desde)}${d.zona.por ? ` · por ${escapeHtml(d.zona.por)}` : ""}</span>
      </div>`));
  }

  for (const ot of (d.ots || [])) {
    const trabajos = (ot.trabajos || []).length
      ? ot.trabajos.map(t => `
          <div class="cqTrabajo${t.anulada ? " anulada" : ""}">
            <span class="cqRol">${escapeHtml(ETIQUETA_ROL[t.rol] || t.rol)}</span>
            <span class="cqQuien">${escapeHtml(t.usuario)}</span>
            <span class="cqCuando">${escapeHtml(ETIQUETA_ESTADO[t.estado] || t.estado)} · ${dur_(t.tiempo_ms)}</span>
            <span class="cqFecha">${fmtShort_(t.actualizado)}</span>
            ${t.anulada ? `<span class="cqAnulada">asignación anulada</span>` : ""}
          </div>`).join("")
      : `<div class="cqVacio">Sin técnicos asignados todavía.</div>`;

    bloques.push(panel_(
      `OT de ${ot.tipo === "CONVERSION" ? "conversión" : ot.tipo.toLowerCase()}` +
      (ot.numero ? ` · #${escapeHtml(ot.numero)}` : ""),
      `<div class="cqLinea"><b>${escapeHtml(ot.estado)}</b><span>creada ${fmtShort_(ot.fecha)}</span></div>
       ${trabajos}
       ${ot.nota ? `<div class="cqNota">${escapeHtml(ot.nota)}</div>` : ""}`
    ));
  }

  const m = d.movilizador;
  if (m) {
    bloques.push(panel_("Movilizador", `
      ${m.ingreso_at ? `<div class="cqLinea"><b>Ingreso</b><span>${fmtShort_(m.ingreso_at)}${m.ingreso_por ? ` · ${escapeHtml(m.ingreso_por)}` : ""}</span></div>` : ""}
      ${m.salida_at  ? `<div class="cqLinea"><b>Entrega</b><span>${fmtShort_(m.salida_at)}${m.salida_por ? ` · ${escapeHtml(m.salida_por)}` : ""}</span></div>` : ""}
      <div class="cqLinea"><b>Estado</b><span>${escapeHtml(m.estado)}</span></div>`));
  }

  if (!bloques.length) {
    return `<div class="cqVacio" style="margin-top:10px;">Este carro no tiene todavía ningún movimiento registrado.</div>`;
  }
  return bloques.join("");
}

/** Panel plegable. Abierto por defecto: se abre para leerlo, no para plegarlo. */
function panel_(titulo, cuerpo) {
  return `
    <details class="cqPanel" open>
      <summary>${titulo}</summary>
      <div class="cqPanelBody">${cuerpo}</div>
    </details>`;
}

// ─── Modo lista ───────────────────────────────────────────────────────

function setModo_(modo) {
  const uno = modo === "uno";
  document.getElementById("cqBloqueUno").style.display    = uno ? "flex" : "none";
  document.getElementById("cqBloqueLista").style.display  = uno ? "none" : "grid";
  document.getElementById("cqResultado").style.display    = "none";
  document.getElementById("cqResultadoLista").style.display = "none";
  document.getElementById("btnCqModoUno").classList.toggle("activo", uno);
  document.getElementById("btnCqModoLista").classList.toggle("activo", !uno);
  aviso_("");
  if (!uno) cerrarQr_();
}

/**
 * Trocea por todo lo que no sea alfanumérico: da igual si la lista viene de
 * un Excel (tabulaciones), de un correo (comas, viñetas) o con cabecera. El
 * servidor descarta lo que no sea un VIN y lo devuelve aparte.
 */
function extraerVins_(texto) {
  return String(texto || "").split(/[^A-Za-z0-9]+/).map(t => t.toUpperCase()).filter(Boolean);
}

// Peor primero: quien pega 40 carros busca los que NO pueden salir.
const ORDEN_TONO = { danger: 0, warn: 1, duda: 2, ok: 3 };

async function consultarLista_() {
  const vins = extraerVins_(document.getElementById("cqVinsLista").value);
  if (!vins.length) { aviso_("Pegue al menos un VIN.", true); return; }

  aviso_(`Consultando ${vins.length}…`);
  const btn = document.getElementById("btnCqLista");
  if (btn) btn.disabled = true;
  try {
    const d = await postJSON("/api/invitado/lote", { vins });
    if (!d?.ok) throw new Error(d?.error || "No se pudo consultar.");
    pintarLista_(d);
    aviso_("");
  } catch (e) {
    aviso_(e.message || "Sin conexión. Intente de nuevo.", true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function pintarLista_(d) {
  const filas = (d.resultados || []).slice().sort(
    (a, b) => (ORDEN_TONO[a.tono] ?? 9) - (ORDEN_TONO[b.tono] ?? 9));

  let html = `
    <div class="cqResumen">
      <div class="cqResTile malo"><span class="cqResNum">${d.frenan}</span><span class="cqResLbl">NO PUEDEN SALIR</span></div>
      <div class="cqResTile duda"><span class="cqResNum">${d.dudosos}</span><span class="cqResLbl">POR CONFIRMAR</span></div>
      <div class="cqResTile bueno"><span class="cqResNum">${d.pueden}</span><span class="cqResLbl">PUEDEN SALIR</span></div>
    </div>`;

  if (d.invalidos?.length) {
    html += `<div class="cqVacio">No se consultaron (${d.invalidos.length}): no parecen VIN — ${
      d.invalidos.map(escapeHtml).join(", ")}</div>`;
  }

  // Cada fila abre la ficha completa. Es la razón de tener la lista aquí
  // dentro y no solo en /invitado: se pega el lote, se ve cuáles fallan y se
  // entra a ver quién tiene ese carro, sin volver a escribir nada.
  html += filas.map(r => `
    <button class="cqFila ${r.tono}" data-cq-vin="${escapeHtml(r.vin)}" type="button">
      <span class="cqFilaVin">${escapeHtml(r.vin)}</span>
      <span class="cqFilaTit">${escapeHtml(r.titulo)}</span>
      <span class="cqFilaSub">Conversión: ${escapeHtml(r.etapas.conversion)} · Revisión: ${escapeHtml(r.etapas.calidad)}</span>
    </button>`).join("");

  const box = document.getElementById("cqResultadoLista");
  box.innerHTML = html;
  box.style.display = "block";
}

// ─── QR ───────────────────────────────────────────────────────────────

async function abrirQr_() {
  document.getElementById("qrModal")?.classList?.add("show");
  try {
    await _scanner.start({
      mode: "QR",
      msgEl: document.getElementById("qrMsg"),
      onDecoded: async (code) => {
        await cerrarQr_();
        const inp = document.getElementById("cqVin");
        if (inp) inp.value = String(code || "").toUpperCase();
        consultar_(code);
      },
    });
  } catch { /* el propio scanner ya pintó el error en msgEl */ }
}

async function cerrarQr_() {
  document.getElementById("qrModal")?.classList?.remove("show");
  await _scanner.stop();
}

// ─── API pública ──────────────────────────────────────────────────────

export function init() {
  // Escribir 17 caracteres a mano no tiene sentido: el autocompletado
  // resuelve con 3 o 4, que es como se busca un carro de verdad.
  createVinSuggest_({
    input: "cqVin", box: "cqVinSuggest",
    min: 1, debounce: 220, limit: 12,
    onPick: item => {
      const inp = document.getElementById("cqVin");
      if (inp) inp.value = item.vin;
      consultar_(item.vin);
    },
  }).bind();

  document.getElementById("cqVin")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); consultar_(e.target.value); }
  });
  // Un lector Bluetooth escribe el VIN de golpe y no siempre manda Enter.
  document.getElementById("cqVin")?.addEventListener("input", e => {
    const v = String(e.target.value || "").replace(/[^A-Za-z0-9]/g, "");
    if (v.length === 17) consultar_(v);
  });

  // Modo
  document.getElementById("btnCqModoUno")?.addEventListener("click", () => setModo_("uno"));
  document.getElementById("btnCqModoLista")?.addEventListener("click", () => setModo_("lista"));
  document.getElementById("btnCqLista")?.addEventListener("click", () => consultarLista_());

  // De una fila de la lista a la ficha completa, sin reescribir el VIN.
  // NO se cambia de modo: la ficha aparece debajo y la lista se queda, para
  // poder ir mirando uno por uno los que fallan sin volver a pegarla.
  document.getElementById("cqResultadoLista")?.addEventListener("click", e => {
    const fila = e.target.closest("[data-cq-vin]");
    if (!fila) return;
    const inp = document.getElementById("cqVin");
    if (inp) inp.value = fila.dataset.cqVin;
    consultar_(fila.dataset.cqVin);
  });

  // QR sobre el modal compartido #qrModal. El guard de módulo es obligatorio:
  // conversión y supervisor enganchan sus propios handlers al MISMO botón de
  // cerrar, así que sin él un clic en cualquiera de esas vistas pararía este
  // escáner (y al revés).
  document.getElementById("btnCqQr")?.addEventListener("click", () => {
    if (CORE.state.currentModule !== "CONSULTA") return;
    abrirQr_().catch(() => {});
  });
  document.getElementById("btnCloseQR")?.addEventListener("click", () => {
    if (CORE.state.currentModule !== "CONSULTA") return;
    cerrarQr_().catch(() => {});
  });
  document.getElementById("qrModal")?.addEventListener("click", e => {
    if (CORE.state.currentModule !== "CONSULTA") return;
    if (e.target === e.currentTarget) cerrarQr_().catch(() => {});
  });
}

export function enter() {
  setModo_("uno");
  document.getElementById("cqVin")?.focus();
}

export function exit() {
  cerrarQr_().catch(() => {});
}
