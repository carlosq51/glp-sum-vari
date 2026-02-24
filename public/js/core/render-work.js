// =========================
// public/js/core/render-work.js
// Render de cards para TECNICO / CALIDAD / RAMALERO
// (tú ya lo tenías: lo dejamos compartido)
// =========================
import {
  CORE, el_, ctx_, cssEsc_, escapeHtml, fmtFechaCreacion_, msToHMS_, openRegistroFallas_,
} from "./core.js";

export function isFinalizado_(it) {
  return String(it?.estado || "").toUpperCase() === "FINALIZADO";
}

export function computeLiveMs_(item, nowMs = Date.now()) {
  const base = Number(item.tiempo_ms || 0);
  const rs = item.running_since ? Date.parse(item.running_since) : NaN;
  if (!isNaN(rs) && String(item.estado).toUpperCase() === "TRABAJANDO") {
    return base + Math.max(0, nowMs - rs);
  }
  return base;
}

export function allowedActionsByEstado(estado) {
  const e = String(estado || "").toUpperCase();
  if (e === "SIN_INICIAR") return ["INICIO", "NOTA"];
  if (e === "TRABAJANDO") return ["PAUSA", "FIN", "NOTA"];
  if (e === "PAUSADO") return ["REANUDAR", "FIN", "NOTA"];
  if (e === "FINALIZADO") return ["NOTA"];
  return ["INICIO", "NOTA"];
}

export function buildBotonesByEstado_(estado) {
  const e = String(estado || "").toUpperCase();
  if (e === "SIN_INICIAR") {
    return `<div class="jobActionsGrid"><button class="btnInicio" data-act="INICIO">INICIO</button></div>`;
  }
  if (e === "TRABAJANDO") {
    return `<div class="jobActionsGrid">
      <button class="btnPausa" data-act="PAUSA">PAUSA</button>
      <button class="btnFin" data-act="FIN">FIN</button>
    </div>`;
  }
  if (e === "PAUSADO") {
    return `<div class="jobActionsGrid">
      <button class="btnReanudar" data-act="REANUDAR">REANUDAR</button>
      <button class="btnFin" data-act="FIN">FIN</button>
    </div>`;
  }
  return `<div class="jobActionsGrid"><button class="btnInicio" data-act="NOTA">GUARDAR NOTA</button></div>`;
}

// (asignado/registrado) — lo dejas igual que tu versión
export function buildAsignadoHTML_(it) {
  const rol = String(it?.rolTrabajo || "").toUpperCase();
  if (rol !== "MOTOR" && rol !== "TANQUE") return "";

  const tanqueAsign = String(it?.tanque_asignado || "").trim();
  const reductAsign = String(it?.reductor_asignado || "").trim();
  const tanqueReg = String(it?.tanque_registrado || "").trim();
  const reductReg = String(it?.reductor_registrado || "").trim();

  const isTanque = rol === "TANQUE";
  const labelAsign = isTanque ? "TANQUE ASIGNADO:" : "REDUCTOR ASIGNADO:";
  const valAsign = isTanque ? tanqueAsign : reductAsign;
  const labelReg = isTanque ? "TANQUE REGISTRADO:" : "REDUCTOR REGISTRADO:";
  const valReg = isTanque ? tanqueReg : reductReg;

  const safeAsignVal = escapeHtml(valAsign || "NO ASIGNADO");
  const safeRegVal = escapeHtml(valReg || "—");

  const naAsign = valAsign ? "" : " na";
  const naReg = valReg ? "" : " na";

  return `
    <div class="asignadoRow js-asignado" data-rol="${escapeHtml(rol)}">
      <span class="asignadoLabel">${escapeHtml(labelAsign)}</span>
      <span class="asignadoValue${naAsign}">${safeAsignVal}</span>
    </div>
    <div class="asignadoRow js-registrado" data-rol="${escapeHtml(rol)}" style="margin-top:6px;">
      <span class="asignadoLabel">${escapeHtml(labelReg)}</span>
      <span class="asignadoValue${naReg}">${safeRegVal}</span>
    </div>
  `;
}

export function buildIncidenciasBtnHTML_(it) {
  if (CORE.state.currentModule !== "CALIDAD") return "";
  const vin = String(it?.vin || "").trim().toUpperCase();
  const cid = String(it?.conversionId || "").trim();
  if (!vin && !cid) return "";

  const l = Number(it?.inc_leve || 0);
  const m = Number(it?.inc_moderada || 0);
  const c = Number(it?.inc_critica || 0);

  const badge =
    (l || m || c)
      ? `<span class="pill small" style="margin-left:8px;">L:${l} M:${m} C:${c}</span>`
      : `<span class="pill small" style="margin-left:8px; opacity:.8;">L:0 M:0 C:0</span>`;

  return `
    <button class="btnRF" type="button" data-go="INC" style="margin-bottom:10px;">
      ⚠️ Registrar incidencia ${badge}
    </button>
  `;
}

export function snapshotNotasActivas_() {
  const map = new Map();
  el_("activasBox")?.querySelectorAll(".jobCard[data-key]")?.forEach((card) => {
    const k = card.dataset.key || "";
    const ta = card.querySelector("textarea.notaCard");
    if (!ta) return;
    map.set(k, String(ta.value || ""));
  });
  return map;
}
export function restoreNotasActivas_(snapMap) {
  if (!snapMap) return;
  el_("activasBox")?.querySelectorAll(".jobCard[data-key]")?.forEach((card) => {
    const k = card.dataset.key || "";
    const ta = card.querySelector("textarea.notaCard");
    if (!ta) return;
    if (snapMap.has(k)) ta.value = snapMap.get(k);
  });
}

export function shouldShowItemInCurrentModule_(it) {
  const rol = String(it?.rolTrabajo || "").toUpperCase();
  if (CORE.state.currentModule === "CALIDAD") return rol === "CALIDAD";
  if (CORE.state.currentModule === "RAMALERO") return rol === "RAMALERO";
  return rol === "MOTOR" || rol === "TANQUE";
}

export function rebuildListsFromStore_() {
  const c = ctx_();
  const all = [...c.itemsByKey.values()].filter(shouldShowItemInCurrentModule_);

  const activos = [];
  const fins = [];

  all.sort((a, b) => {
    const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
    const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
    return tb - ta;
  });

  for (const it of all) {
    const k = `${String(it.conversionId || "").trim()}|${String(it.rolTrabajo || "").toUpperCase()}`;
    if (isFinalizado_(it)) fins.push(k);
    else activos.push(k);
  }

  c.activeKeys = activos;
  c.finalKeys = fins;
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
    const cre = escapeHtml(fmtFechaCreacion_(it.created_at));

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
            </div>
          </div>
          <div class="jobRight">
            <div class="jobTimePill js-tiempo">⏱ ${live}</div>
            <div class="jobChevron"></div>
          </div>
        </div>

        <div class="jobExpand">
          ${buildAsignadoHTML_(it)}

          ${(String(it?.rolTrabajo||"").toUpperCase()==="MOTOR" || String(it?.rolTrabajo||"").toUpperCase()==="TANQUE")
            ? `<button class="btnRF" type="button" data-go="CONF" style="margin-bottom:10px;">
                ✅ Registro de conformidad de equipo
              </button>`
            : ""
          }

          ${buildIncidenciasBtnHTML_(it)}

          <div class="jobActionsSlot">${buildBotonesByEstado_(estado)}</div>

          ${
            CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD"
              ? `<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>`
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

    out += `
      <div class="card" style="margin-top:10px;">
        <div><b>${vin}</b> <span class="small">(${rol})</span></div>
        <div class="row space-between" style="margin-top:6px;">
          <div class="small"><b>Estado:</b> ${estado}</div>
          <div class="pill" style="font-size:18px; font-weight:800;">⏱ ${live}</div>
        </div>
        <div class="small">Inicio: ${cre}</div>

        ${
          CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD"
            ? `<button class="btnRF" type="button" data-go="RF" data-vin="${vin}">📸 Registrar fotos / fallas</button>`
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

    // patch asignado/registrado
    try {
      const rol = String(it.rolTrabajo || "").toUpperCase();
      if (rol === "MOTOR" || rol === "TANQUE") {
        const isTanque = rol === "TANQUE";
        const asignVal = isTanque ? String(it.tanque_asignado || "").trim() : String(it.reductor_asignado || "").trim();
        const regVal   = isTanque ? String(it.tanque_registrado || "").trim() : String(it.reductor_registrado || "").trim();

        const asgRow = card.querySelector(".js-asignado .asignadoValue");
        const regRow = card.querySelector(".js-registrado .asignadoValue");

        if (asgRow) { asgRow.textContent = asignVal || "LIBRE"; asgRow.classList.toggle("na", !asignVal); }
        if (regRow) { regRow.textContent = regVal || "—";          regRow.classList.toggle("na", !regVal); }
      }
    } catch {}

    if (wasOpen) {
      const slot = card.querySelector(".jobActionsSlot");
      if (slot) slot.innerHTML = buildBotonesByEstado_(estado);
    }
  }
}