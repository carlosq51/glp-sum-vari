import { CORE, ctx_ } from "../core/state.js";
import { el_ } from "../core/dom.js";
import { cssEsc_, escapeHtml, fmtFechaCreacion_, msToHMS_ } from "../core/format.js";
import { computeLiveMs_ } from "./work-time.js";
import { buildAsignadoHTML_, buildBotonesByEstado_, buildIncidenciasBtnHTML_ } from "./work-templates.js";

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
    const cre = escapeHtml(fmtFechaCreacion_(it.created_at));
    const motorNombre = escapeHtml(it.motorNombre || "");
    const tanqueroNombre = escapeHtml(it.tanqueroNombre || "");

    const title =
      CORE.state.currentModule === "RAMALERO"
        ? `RAMAL: ${tipo || "-"}`
        : vin || "<span class='small'>(sin VIN)</span>";

    out += `
      <div class="jobCard card state-${estado}" data-key="${escapeHtml(k)}">
        <div class="jobTop">
          <div class="jobMeta">
            <div class="jobTitle">${title} <span>(${rol})</span></div>
            <div class="jobSub">
              <span><b>Estado:</b> <span class="js-estado">${estado}</span></span>
              <span class="small">Inicio: ${cre}</span>
              ${CORE.state.currentModule === "CALIDAD" && (motorNombre || tanqueroNombre) ? `
                <span class="small js-personal">
                  ${motorNombre ? `🔧 MOTOR: <b>${motorNombre}</b>` : ""}
                  ${motorNombre && tanqueroNombre ? " &nbsp;|&nbsp; " : ""}
                  ${tanqueroNombre ? `🛢️ TANQUERO: <b>${tanqueroNombre}</b>` : ""}
                </span>` : ""}
            </div>
          </div>
          <div class="jobRight">
            <div class="jobTimePill js-tiempo">⏱ ${live}</div>
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

          ${buildIncidenciasBtnHTML_(it, k)}

          <div class="jobActionsSlot">${buildBotonesByEstado_(estado)}</div>

          ${
            CORE.state.currentModule === "TECNICO"
              ? `<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>`
              : CORE.state.currentModule === "CALIDAD"
                ? `<button class="btnRF" type="button" data-go="RF">📸 Registrar calidad / fallas</button>`
                : ""
          }

          <div class="jobNoteBlock">
            <textarea class="notaCard" rows="2" placeholder="Escribe una nota..."></textarea>
            <button class="btnNota" data-act="NOTA" style="margin-top:10px; width:100%; height:66px; font-weight:900; display:none;">
              Guardar nota
            </button>
          </div>
        </div>
      </div>
    `;
  }

  box.innerHTML = out;
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
    const estado = escapeHtml(String(it.estado || "FINALIZADO").toUpperCase());
    const live = msToHMS_(computeLiveMs_(it, nowMs));
    const cre = escapeHtml(fmtFechaCreacion_(it.created_at));
    const motorNombre = escapeHtml(it.motorNombre || "");
    const tanqueroNombre = escapeHtml(it.tanqueroNombre || "");

    out += `
      <div class="card" style="margin-top:10px;" data-key="${escapeHtml(k)}">
        <div><b>${vin}</b> <span class="small">(${rol})</span></div>
        <div class="row space-between" style="margin-top:6px;">
          <div class="small"><b>Estado:</b> ${estado}</div>
          <div class="pill" style="font-size:18px; font-weight:800;">⏱ ${live}</div>
        </div>
        <div class="small">Inicio: ${cre}</div>
        ${CORE.state.currentModule === "CALIDAD" && (motorNombre || tanqueroNombre) ? `
          <div class="small js-personal" style="margin-top:4px;">
            ${motorNombre ? `🔧 MOTOR: <b>${motorNombre}</b>` : ""}
            ${motorNombre && tanqueroNombre ? " &nbsp;|&nbsp; " : ""}
            ${tanqueroNombre ? `🛢️ TANQUERO: <b>${tanqueroNombre}</b>` : ""}
          </div>` : ""}

        ${buildIncidenciasBtnHTML_(it, k)}

        ${
          CORE.state.currentModule === "TECNICO"
            ? `<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>`
            : CORE.state.currentModule === "CALIDAD"
              ? `<button class="btnRF" type="button" data-go="RF">📸 Registrar calidad / fallas</button>`
              : ""
        }
      </div>
    `;
  }

  box.innerHTML = avgTopHTML + out;
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
          const m = escapeHtml(it.motorNombre || "");
          const t = escapeHtml(it.tanqueroNombre || "");
          personalEl.innerHTML = [
            m ? `🔧 MOTOR: <b>${m}</b>` : "",
            m && t ? "&nbsp;|&nbsp;" : "",
            t ? `🛢️ TANQUERO: <b>${t}</b>` : "",
          ].join("");
        }
      }
    } catch {}

    if (wasOpen) {
      const slot = card.querySelector(".jobActionsSlot");
      if (slot) slot.innerHTML = buildBotonesByEstado_(estado);
    }
  }
}