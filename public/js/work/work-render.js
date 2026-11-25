// =========================
// public/js/work/work-render.js
// Render de cards: activas, finalizados, patch visible
// =========================

import { CORE, ctx_ } from "../core/state.js";
import { el_ } from "../core/dom.js";
import { cssEsc_, escapeHtml, fmtFechaCreacion_, msToHMS_, diaPeru_ } from "../core/format.js";
import { computeLiveMs_ } from "./work-time.js";

/** 9 900 000 → "2 h 45" · 2 400 000 → "40 min" */
function durCorta_(ms) {
  const min = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

/**
 * Debajo del cronómetro: lo normal para ESTA persona en ESTE carro (su ritmo
 * × lo que tarda el taller en ese modelo), o cuánto lleva de más. Es la misma
 * cuenta que usa el supervisor en el LIVE: el técnico ve lo mismo que le miden.
 */
function normalTexto_(it, ms) {
  const n = it?.normal;
  if (!n?.ms || String(it.estado || "").toUpperCase() === "FINALIZADO") return "";
  if (ms > n.ms + 60_000) return `${durCorta_(ms - n.ms)} más de lo normal`;
  return `${n.propio ? "Tu normal" : "Normal"} ~${durCorta_(n.ms)}`;
}
function normalHTML_(it, ms) {
  const txt = normalTexto_(it, ms);
  if (!txt) return "";
  const n = it.normal;
  const ayuda = n.propio
    ? `Lo que sueles tardar tú en este modelo. El taller tarda ${durCorta_(n.tallerMs)}.`
    : "Lo que tarda el taller en este modelo (aún no hay carros tuyos suficientes para medir tu ritmo).";
  const pasado = computeLiveMs_(it) > n.ms + 60_000;
  return `<div class="small js-normal" title="${escapeHtml(ayuda)}" style="text-align:right;margin-top:4px;${pasado ? "color:var(--danger,#f87171);font-weight:700;" : "opacity:.75;"}">${escapeHtml(txt)}</div>`;
}
import { buildAsignadoHTML_, buildBotonesByEstado_ } from "./work-templates.js";
import { personalCalidadHTML_ } from "./llamado-voz.js";
import { informeEstadoHTML_, pintarInformes_ } from "./informe-estado.js";
import { fotosAvisoHTML_, pintarFotosCopiadas_ } from "./fotos-aviso.js";

/** La línea del informe, solo donde hay informe: técnico de MOTOR o TANQUE. */
function informeDe_(it) {
  const rol = String(it?.rolTrabajo || "").toUpperCase();
  if (CORE.state.currentModule !== "TECNICO" || (rol !== "MOTOR" && rol !== "TANQUE")) return "";
  return informeEstadoHTML_(it.conversionId, rol);
}

// "Ver más" de CALIDAD: qué tarjetas lo tienen abierto. Las tarjetas se
// repintan con cada sync; sin esto se cerraría solo bajo el dedo.
const _masAbiertos = new Set();
let _masEscuchando = false;

function escucharVerMas_(box) {
  if (_masEscuchando) return;
  _masEscuchando = true;
  // "toggle" no burbujea: se escucha en captura desde la caja.
  box.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!d?.matches?.("details.jobMas")) return;
    const k = d.dataset.masKey || "";
    if (d.open) _masAbiertos.add(k); else _masAbiertos.delete(k);
  }, true);
}

/**
 * Botón-baldosa de CALIDAD: ícono arriba, texto corto abajo. Van de a varios
 * por fila en vez de uno por fila a todo el ancho — con diez botones de 56 px
 * apilados, cada tarjeta medía una pantalla y la lista no se podía recorrer.
 * `attrs` lleva data-go / data-act y lo que el manejador necesite (vin, key…).
 */
function tile_(ico, lbl, attrs, badge = "") {
  return `<button class="jobTile" type="button" ${attrs}>
      <span class="jobTile__ico" aria-hidden="true">${ico}</span>
      <span class="jobTile__lbl">${lbl}</span>
      ${badge ? `<span class="jobTile__badge">${badge}</span>` : ""}
    </button>`;
}

/** Lo de cada carro en CALIDAD: fotos de calidad, registrar y ver incidencias. */
function tilesCalidadHTML_(it, k, extra = "") {
  const vin = escapeHtml(String(it?.vin || "").trim().toUpperCase());
  const cid = escapeHtml(String(it?.conversionId || "").trim());
  const total = Number(it?.inc_leve || 0) + Number(it?.inc_moderada || 0) + Number(it?.inc_critica || 0);
  const inc = vin || cid;
  const n = 1 + (inc ? 2 : 0) + (extra ? 1 : 0);
  return `
    <div class="jobTiles${n === 4 ? " jobTiles--4" : ""}">
      ${tile_("📸", "Calidad / fallas", `data-go="RF"`)}
      ${inc ? tile_("⚠️", "Registrar inc.", `data-go="INC" data-key="${escapeHtml(k)}"`) : ""}
      ${inc ? tile_("📋", "Incidencias", `data-go="VER_INC" data-vin="${vin}" data-cid="${cid}"`, total > 0 ? String(total) : "") : ""}
      ${extra}
    </div>`;
}

/**
 * Lo ocasional de la tarjeta de CALIDAD, plegado. A la vista queda lo de cada
 * carro (estado, incidencias, 📸 calidad/fallas); esto se usa a veces.
 */
function verMasCalidadHTML_(it, k) {
  const abierto = _masAbiertos.has(k) ? " open" : "";
  return `
    <details class="jobMas" data-mas-key="${escapeHtml(k)}"${abierto}>
      <summary><span class="jobMas__lbl-abrir">Más herramientas</span><span class="jobMas__lbl-cerrar">Menos</span></summary>
      <div class="jobTiles jobTiles--4">
        ${tile_("🔩", "Soldadura", `data-go="SOLD" data-vin="${escapeHtml(it.vin || "")}"`)}
        ${tile_("🖨", "Hoja CC", `data-go="HOJA_CC"`)}
        ${tile_("🔧", "Calibrar STAG", `data-go="CALIB"`)}
        ${tile_("📄", "Informe OT", `data-act="INFORME"`)}
      </div>
      <div class="jobNoteBlock">
        <textarea class="notaCard" rows="2" placeholder="Escribe una nota..."></textarea>
        <button class="btnNota" data-act="NOTA" style="margin-top:8px; width:100%; height:52px; font-weight:900; display:none;">
          Guardar nota
        </button>
      </div>
    </details>
  `;
}

export function renderActivas_() {
  const c = ctx_();
  const box = el_("activasBox");
  if (!box) return;

  if (!c.activeKeys.length) {
    box.innerHTML = `<div class="small">No tienes trabajos activos.</div>`;
    return;
  }

  const nowMs = Date.now();
  let out = "";

  for (const k of c.activeKeys) {
    const it = c.itemsByKey.get(k);
    if (!it) continue;

    const estado = String(it.estado || "").toUpperCase();
    const rol = escapeHtml(it.rolTrabajo || "");
    const vin = escapeHtml(it.vin || "");
    const tipo = escapeHtml(it.tipoRamal || "");
    const live = msToHMS_(computeLiveMs_(it, nowMs));
    const cre = escapeHtml(fmtFechaCreacion_(it.running_since || it.created_at || it.fecha_creacion));

    // OT de CALIDAD que abrió el OTRO inspector. Se acciona igual —el permiso ya
    // existía— menos el cierre, que es de su titular. Sin este aviso la tarjeta
    // ajena es idéntica a la propia y el inspector no sabe que está entrando al
    // carro de otro.
    const ajena = it.ajena
      ? `<span class="small jobAjena">👥 Registró: <b>${escapeHtml(it.titularNombre || "otro inspector")}</b></span>`
      : "";

    const motorNombre = escapeHtml(it.motorNombre || "");
    const tanqueroNombre = escapeHtml(it.tanqueroNombre || "");

    // La plaza va pegada al VIN porque las dos responden a lo mismo: a qué
    // carro voy y dónde está. En RAMALERO no se pone: ahí el título es el tipo
    // de ramal, no un carro, y una zona colgando de un ramal no significa nada.
    // Si el carro aún no está registrado en ninguna zona, no se muestra nada:
    // "(ZONA -)" ocupa sitio para no decir nada.
    const zona = Number.isFinite(it.zona)
      ? ` <span class="jobZona">(ZONA ${it.zona})</span>`
      : "";

    const title =
      CORE.state.currentModule === "RAMALERO"
        ? `RAMAL: ${tipo || "-"}`
        : (vin ? `${vin}${zona}` : "<span class='small'>(sin VIN)</span>");

    out += `
      <div class="jobCard card state-${estado}" data-key="${escapeHtml(k)}">
        <div class="jobTop">
          <div class="jobMeta">
            <div class="jobTitle">${title} <span>(${rol})</span></div>
            <div class="jobSub">
              <span><b>Estado:</b> <span class="js-estado">${estado}</span></span>
              <span class="small">Inicio: ${cre}</span>
              ${ajena}
              ${CORE.state.currentModule === "CALIDAD" && (motorNombre || tanqueroNombre) ? `
                <span class="small js-personal">${personalCalidadHTML_(it)}</span>` : ""}
            </div>
            ${informeDe_(it)}
            ${CORE.state.currentModule === "CALIDAD" ? fotosAvisoHTML_(it.vin) : ""}
          </div>
          <div class="jobRight">
            <div class="jobTimePill js-tiempo">⏱ ${live}</div>
            ${normalHTML_(it, computeLiveMs_(it, nowMs))}
            <div class="jobChevron"></div>
          </div>
        </div>

        <div class="jobExpand">
          ${buildAsignadoHTML_(it)}

          ${(String(it?.rolTrabajo || "").toUpperCase() === "MOTOR" ||
            String(it?.rolTrabajo || "").toUpperCase() === "TANQUE")
              ? `<button class="btnRF" type="button" data-go="CONF" style="margin-bottom:10px;">
                  ✅ Registro de conformidad de equipo
                </button>`
              : ""}

          ${String(it?.rolTrabajo || "").toUpperCase() === "MOTOR" &&
            ["TRABAJANDO", "PAUSADO"].includes(String(it?.estado || "").toUpperCase()) &&
            CORE.state.currentModule === "TECNICO"
              ? `<button class="btn btnSolicitarRamal" type="button"
                  data-solicitar-ramal="1"
                  data-vin="${escapeHtml(it.vin || "")}"
                  data-cid="${escapeHtml(it.conversionId || "")}"
                  style="margin-bottom:10px; width:100%; background:#7c3aed; color:#fff; font-weight:800;">
                  🔩 Solicitar Ramal
                </button>`
              : ""}

          ${CORE.state.currentModule === "CALIDAD" ? tilesCalidadHTML_(it, k) : ""}

          <div class="jobActionsSlot">${buildBotonesByEstado_(estado, { ajena: it.ajena, titularNombre: it.titularNombre })}</div>

          ${estado === "PAUSADO" ? `<div class="js-pausa-countdown small" style="text-align:center; opacity:.85; margin-top:4px; color:#f59e0b;">⏳ Calculando...</div>` : ""}

          ${
            CORE.state.currentModule === "TECNICO"
              ? `<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>`
              : ""
          }

          ${CORE.state.currentModule === "CALIDAD" ? verMasCalidadHTML_(it, k) : `
          <button class="btnInforme" data-act="INFORME">
            Informe de esta OT
          </button>

          <div class="jobNoteBlock">
            <textarea class="notaCard" rows="2" placeholder="Escribe una nota..."></textarea>
            <button class="btnNota" data-act="NOTA" style="margin-top:10px; width:100%; height:66px; font-weight:900; display:none;">
              Guardar nota
            </button>
          </div>`}
        </div>
      </div>
    `;
  }

  box.innerHTML = out;
  if (CORE.state.currentModule === "CALIDAD") escucharVerMas_(box);
  pintarInformes_();
  pintarFotosCopiadas_();
}

export function renderFinalizados_(avgTopHTML = "") {
  const c = ctx_();
  const wrap = el_("finalizadosWrap");
  const box = el_("finalizadosBox");
  if (!wrap || !box) return;

  if (!c.showFinalizados) {
    wrap.style.display = "none";
    box.innerHTML = "";
    return;
  }

  wrap.style.display = "block";

  if (!c.finalKeys.length) {
    box.innerHTML = avgTopHTML + `<div class="small">No tienes finalizados.</div>`;
    return;
  }

  const nowMs = Date.now();
  let out = "";

  for (const k of c.finalKeys) {
    const it = c.itemsByKey.get(k);
    if (!it) continue;

    const vin = escapeHtml(String(it.vin || "").toUpperCase());
    const rol = escapeHtml(String(it.rolTrabajo || ""));
    const tipo = escapeHtml(String(it.tipoRamal || ""));
    const estado = escapeHtml(String(it.estado || "FINALIZADO").toUpperCase());
    const live = msToHMS_(computeLiveMs_(it, nowMs));
    const fin = escapeHtml(fmtFechaCreacion_(it.updated_at || ""));
    const motorNombre = escapeHtml(it.motorNombre || "");
    const tanqueroNombre = escapeHtml(it.tanqueroNombre || "");

    const displayTitle =
      CORE.state.currentModule === "RAMALERO"
        ? `RAMAL: ${tipo || "-"}`
        : vin || "(sin VIN)";

    // `data-tipo` y `data-fin` (día de término en Perú) los usa el historial
    // del ramalero para filtrar por marca y por fechas sin que este
    // renderer, que es de todos, sepa de esos filtros.
    out += `
      <div class="card" style="margin-top:10px;" data-key="${escapeHtml(k)}" data-tipo="${tipo}"
           data-fin="${escapeHtml(diaPeru_(it.updated_at))}">
        <div><b>${displayTitle}</b> <span class="small">(${rol})</span></div>
        <div class="row space-between" style="margin-top:6px;">
          <div class="small"><b>Estado:</b> ${estado}</div>
          <div class="pill" style="font-size:18px; font-weight:800;">⏱ ${live}</div>
        </div>
        <div class="small">Término: ${fin}</div>
        ${informeDe_(it)}
        ${CORE.state.currentModule === "CALIDAD" && (motorNombre || tanqueroNombre) ? `
          <div class="small js-personal" style="margin-top:4px;">${personalCalidadHTML_(it)}</div>` : ""}

        ${
          CORE.state.currentModule === "TECNICO"
            ? `<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>`
            : CORE.state.currentModule === "CALIDAD"
              ? tilesCalidadHTML_(it, k, tile_("🖨", "Hoja CC", `data-go="HOJA_CC"`))
              : ""
        }
      </div>
    `;
  }

  box.innerHTML = avgTopHTML + out;
  pintarInformes_();

  // Aviso de que las tarjetas se repintaron. El historial del ramalero lo
  // escucha para volver a aplicar su filtro por marca: sin esto, un FIN
  // que llega por sync reaparece filas que ya estaban ocultas.
  document.dispatchEvent(new CustomEvent("glp:finalizados-render"));
}

export function patchVisibleCards_() {
  const c = ctx_();
  const box = el_("activasBox");
  if (!box) return;

  const nowMs = Date.now();

  for (const k of c.activeKeys) {
    const it = c.itemsByKey.get(k);
    if (!it) continue;

    const card = box.querySelector(`.jobCard[data-key="${cssEsc_(k)}"]`);
    if (!card) continue;

    const wasOpen = card.classList.contains("open");
    const estado = String(it.estado || "").toUpperCase();

    card.className = `jobCard card state-${estado}` + (wasOpen ? " open" : "");

    const estadoEl = card.querySelector(".js-estado");
    if (estadoEl) estadoEl.textContent = estado;

    const timeEl = card.querySelector(".js-tiempo");
    if (timeEl) timeEl.textContent = `⏱ ${msToHMS_(computeLiveMs_(it, nowMs))}`;
    const normalEl = card.querySelector(".js-normal");
    if (normalEl) {
      const ms = computeLiveMs_(it, nowMs);
      normalEl.textContent = normalTexto_(it, ms);
      const pasado = it.normal?.ms && ms > it.normal.ms + 60_000;
      normalEl.style.color = pasado ? "var(--danger,#f87171)" : "";
      normalEl.style.fontWeight = pasado ? "700" : "";
      normalEl.style.opacity = pasado ? "1" : ".75";
    }

    try {
      const rol = String(it.rolTrabajo || "").toUpperCase();
      if (rol === "MOTOR" || rol === "TANQUE") {
        const isTanque = rol === "TANQUE";
        const asignVal = isTanque
          ? String(it.tanque_asignado || "").trim()
          : String(it.reductor_asignado || "").trim();
        const regVal = isTanque
          ? String(it.tanque_registrado || "").trim()
          : String(it.reductor_registrado || "").trim();

        const asgRow = card.querySelector(".js-asignado .asignadoValue");
        const regRow = card.querySelector(".js-registrado .asignadoValue");

        if (asgRow) {
          asgRow.textContent = asignVal || "LIBRE";
          asgRow.classList.toggle("na", !asignVal);
        }

        if (regRow) {
          regRow.textContent = regVal || "—";
          regRow.classList.toggle("na", !regVal);
        }
      }
    } catch {}

    try {
      if (CORE.state.currentModule === "CALIDAD") {
        const personalEl = card.querySelector(".js-personal");
        if (personalEl) {
          // Solo si cambió: reescribirlo en cada sync reemplaza el botón de
          // llamar bajo el dedo y el toque se pierde.
          const html = personalCalidadHTML_(it);
          if (personalEl.dataset.html !== html) {
            personalEl.innerHTML = html;
            personalEl.dataset.html = html;
          }
        }
      }
    } catch {}

    if (wasOpen) {
      const slot = card.querySelector(".jobActionsSlot");
      if (slot) slot.innerHTML = buildBotonesByEstado_(estado, { ajena: it.ajena, titularNombre: it.titularNombre });
    }
  }
}