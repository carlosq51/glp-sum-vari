// =========================
// public/js/views/supervisor/sup-render.js
// RENDER: avg card + tabla (group + normal)
// =========================

import { fmtDur_ } from "../../core/format.js";
import { durationMsFromItem_, isFinalizado_ } from "./sup-filters.js";
import { cfg } from "../../core/config.js";

function isFin_(estado) {
  return isFinalizado_(estado);
}

// Tiempo objetivo por rol — minutos desde config central (editable en Admin)
function targetMs_(rol) {
  const r = String(rol || "").toUpperCase();
  const min = (r === "CALIDAD")                   ? cfg("TARGET_CALIDAD_MIN")
            : (r === "RAMAL" || r === "RAMALERO") ? cfg("TARGET_RAMAL_MIN")
            : cfg("TARGET_CONVERSION_MIN"); // motor/tanque/conversión/técnico
  return Number(min) * 60_000;
}

function realElapsedMs_(it) {
  let ms = Number(it?.tiempo_ms ?? 0);
  if (String(it?.estado || "").toUpperCase() === "TRABAJANDO" && it?.running_since) {
    const delta = Date.now() - new Date(it.running_since).getTime();
    if (delta > 0 && delta < 24 * 3_600_000) ms += delta;
  }
  return Math.max(0, ms);
}

function renderProgressBar_(it) {
  const estado = String(it?.estado || "").toUpperCase();
  const rol = String(it?.rol || it?.rolTrabajo || "MOTOR").toUpperCase();
  const targetMs = targetMs_(rol);
  const ms = realElapsedMs_(it);

  if (isFin_(estado)) {
    const durMs = durationMsFromItem_(it) || ms;
    return `
      <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
        <div style="flex:1; height:5px; background:var(--ring-track); border-radius:3px; overflow:hidden;">
          <div style="height:100%; width:100%; background:var(--dv-good); border-radius:3px;"></div>
        </div>
        <span style="font-size:.7em; color:var(--dv-good); font-weight:700; white-space:nowrap;">✓ ${durMs ? fmtDur_(durMs) : "—"}</span>
      </div>`;
  }

  if (!ms) return "";

  const pct = Math.min(Math.round(ms / targetMs * 100), 99);
  const isOver = ms > targetMs;
  const barColor = isOver ? "var(--dv-bad)" : pct >= 60 ? "var(--dv-warn)" : "var(--accent)";
  const statusDot = estado === "TRABAJANDO" ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ok);margin-right:3px;animation:livePulse 1.4s ease-in-out infinite;"></span>` : `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--warn);margin-right:3px;"></span>`;

  return `
    <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
      <div style="flex:1; height:5px; background:var(--ring-track); border-radius:3px; overflow:hidden;">
        <div style="height:100%; width:${pct}%; background:${barColor}; border-radius:3px; transition:width .4s;"></div>
      </div>
      <span style="font-size:.7em; color:${barColor}; font-weight:700; white-space:nowrap;">${statusDot}${pct}% · ${fmtDur_(ms)}</span>
    </div>`;
}

export function renderAvgCard_(avgCardEl, {
  stats,
  techName,
  motorCount,
  tanqueCount,
  finalizedCount,
  isHistorical,
  supTrack,
  vinSinCalidad,
  escapeHtml
}) {
  if (!avgCardEl) return;

  // Badge de modo de consulta
  const modeBadge = isHistorical
    ? `<span style="font-size:.68em;font-weight:800;background:var(--noteBg);border:1px solid var(--note);color:var(--note);border-radius:5px;padding:2px 7px;letter-spacing:.4px;">📅 HISTÓRICO · por fecha de cierre</span>`
    : `<span style="font-size:.68em;font-weight:800;background:var(--okBg);border:1px solid var(--ok);color:var(--ok);border-radius:5px;padding:2px 7px;letter-spacing:.4px;">🔴 HOY · en tiempo real</span>`;

  // Píldora extra solo en track CONVERSION: VINs con motor+tanque ambos finalizados
  const sinCalidadPill = (supTrack === "CONVERSION" && vinSinCalidad != null)
    ? `<div class="pill small" style="opacity:.9;">SIN CAL.: <b>${vinSinCalidad}</b></div>`
    : "";

  if (stats?.used > 0) {
    const nameUp = String(techName || "TÉCNICO").toUpperCase();

    avgCardEl.innerHTML = `
      <div class="card" style="
        border:1px solid var(--surfaceLine);
        border-radius:22px;
        padding:18px 18px;
        background: var(--grad-surface-v);
        box-shadow: var(--elev-2);
      ">
        <div class="row space-between" style="gap:12px; align-items:flex-start;">
          <div>
            <div class="small" style="opacity:.8; letter-spacing:.5px;">TIEMPO PROMEDIO DE CONVERSIÓN</div>
            <div style="font-weight:1000; font-size:20px; letter-spacing:1px; margin-top:4px;">
              ${escapeHtml(nameUp)}
            </div>
            <div style="margin-top:6px;">${modeBadge}</div>
          </div>

          <div class="pill small" style="opacity:.95;">
            FINALIZADOS: <b>${finalizedCount || 0}</b>
          </div>
        </div>

        <div class="row" style="gap:12px; align-items:center; margin-top:14px;">
          <div style="
            width:44px; height:44px;
            display:flex; align-items:center; justify-content:center;
            border-radius:14px;
            background: var(--pillBg);
            border:1px solid var(--pillLine);
          ">⏱</div>

          <div>
            <div style="font-weight:1000; font-size:40px; letter-spacing:.8px; line-height:1;">
              ${escapeHtml(fmtDur_(stats.avgMs))}
            </div>
            <div class="small" style="opacity:.78; margin-top:6px;">
              Promedio robusto (outliers pesan menos)
            </div>
          </div>
        </div>

        <div class="row" style="gap:10px; margin-top:14px; flex-wrap:wrap;">
          <div class="pill small" style="opacity:.9;">
            MOTOR: <b>${motorCount}</b>
          </div>
          <div class="pill small" style="opacity:.9;">
            TANQUE: <b>${tanqueCount}</b>
          </div>
          ${sinCalidadPill}
        </div>

        <div class="small" style="margin-top:12px; opacity:.75;">
          ${isHistorical
            ? "Producción contada por <b>fecha de cierre</b> — el carro aparece en el día que se terminó."
            : "Incluye trabajos activos del día. Cross-day (⬛½) empezaron ayer y cuentan 0.5."}
        </div>
      </div>
    `;
  } else {
    avgCardEl.innerHTML = `
      <div class="card" style="border:1px solid var(--surfaceLine); border-radius:18px; padding:14px;">
        <div style="margin-bottom:8px;">${modeBadge}</div>
        <div class="small">Sin FINALIZADOS con tiempo válido.</div>
      </div>
    `;
  }
}

export function renderTable_(boxEl, {
  uiList,
  escapeHtml,
  fmtShort_
}) {
  if (!boxEl) return;

  boxEl.innerHTML = uiList.map((row) => {
    if (row && row._kind === "group") {
      return renderRowGroup_(row, { escapeHtml, fmtShort_ });
    }
    return renderRowNormal_(row, { escapeHtml, fmtShort_ });
  }).join("");
}

export function renderRowGroup_(row, { escapeHtml, fmtShort_ }) {
  const vin = row.vin || "-";
  const motor = row.motor;
  const tanque = row.tanque;

  const isCrossDay = !!(motor?.crossDay || tanque?.crossDay);

  const motorWho = motor?.userName || motor?.userEmail || motor?.userId || "-";
  const tanqueWho = tanque?.userName || tanque?.userEmail || tanque?.userId || "-";

  const motorDur = motor ? (durationMsFromItem_(motor) ? fmtDur_(durationMsFromItem_(motor)) : "-") : "-";
  const tanqueDur = tanque ? (durationMsFromItem_(tanque) ? fmtDur_(durationMsFromItem_(tanque)) : "-") : "-";

  const motorIni = motor ? fmtShort_(motor.fecha_inicio || motor.fecha_asignacion || "") : "";
  const motorFinTs = (motor && isFin_(motor.estado)) ? fmtShort_(motor.updated_at || "") : "";
  const tanqueIni = tanque ? fmtShort_(tanque.fecha_inicio || tanque.fecha_asignacion || "") : "";
  const tanqueFinTs = (tanque && isFin_(tanque.estado)) ? fmtShort_(tanque.updated_at || "") : "";

  const cidAny = String(motor?.workId || tanque?.workId || "").trim();

  // Etiqueta descriptiva: indica qué rol falta cuando el grupo no está completo
  const motorOk  = isFin_(motor?.estado);
  const tanqueOk = isFin_(tanque?.estado);
  let estadoLabel, estadoColor;
  if (motorOk && tanqueOk) {
    estadoLabel = "✅ FINALIZADO";
    estadoColor = "var(--okBg)";
  } else if (motorOk && !tanqueOk) {
    estadoLabel = "⚙️ EN PROCESO · falta TANQUE";
    estadoColor = "var(--warnBg)";
  } else if (!motorOk && tanqueOk) {
    estadoLabel = "⚙️ EN PROCESO · falta MOTOR";
    estadoColor = "var(--warnBg)";
  } else {
    estadoLabel = "⏳ " + (row.estado || "EN PROCESO");
    estadoColor = "var(--pillBg)";
  }

  return `
    <div class="card" style="margin-top:10px;${isCrossDay ? ' border-left: 3px solid var(--warn);' : ''}">
      <div style="font-weight:900;">
        VIN: ${escapeHtml(vin)} <span class="small">(MOTOR + TANQUE)</span>
        ${isCrossDay ? `<span class="live-half-badge" title="Iniciado el día anterior">½ día ant.</span>` : ""}
      </div>

      <div class="row space-between" style="margin-top:8px; gap:10px;">
        <div class="small" style="padding:4px 10px;border-radius:8px;background:${estadoColor};font-weight:700;">
          ${escapeHtml(estadoLabel)}
        </div>
      </div>

      <div class="card" style="margin-top:10px; border:1px solid var(--surfaceLine);">
        <div class="small" style="font-weight:900;">🔧 MOTOR: ${escapeHtml(motorWho)}</div>
        ${motor ? renderProgressBar_(motor) : ""}
        <div class="small" style="margin-top:6px;"><b>Duración:</b> ${escapeHtml(motorDur)}</div>
        <div class="small" style="margin-top:4px;">
          <b>Inicio:</b> ${escapeHtml(motorIni)}${motorFinTs ? ` &nbsp;|&nbsp; <b>Fin:</b> ${escapeHtml(motorFinTs)}` : ""}
        </div>
        ${motor && String(motor.estado||'').toUpperCase() === 'TRABAJANDO' ? `
        <button type="button" class="btn3" style="margin-top:8px;width:100%;"
          data-sup-pausa="1"
          data-email="${escapeHtml(motor.userEmail||'')}"
          data-vin="${escapeHtml(vin)}"
          data-rol="MOTOR"
          data-cid="${escapeHtml(String(motor.workId||motor.conversionId||''))}"
          data-who="${escapeHtml(motorWho)}"
          data-estado="${escapeHtml(motor.estado||'')}"
        >⏸ Pausar ${escapeHtml(motorWho)}</button>` : ''}
      </div>

      <div class="card" style="margin-top:10px; border:1px solid var(--surfaceLine);">
        <div class="small" style="font-weight:900;">⛽ TANQUE: ${escapeHtml(tanqueWho)}</div>
        ${tanque ? renderProgressBar_(tanque) : ""}
        <div class="small" style="margin-top:6px;"><b>Duración:</b> ${escapeHtml(tanqueDur)}</div>
        <div class="small" style="margin-top:4px;">
          <b>Inicio:</b> ${escapeHtml(tanqueIni)}${tanqueFinTs ? ` &nbsp;|&nbsp; <b>Fin:</b> ${escapeHtml(tanqueFinTs)}` : ""}
        </div>
        ${tanque && String(tanque.estado||'').toUpperCase() === 'TRABAJANDO' ? `
        <button type="button" class="btn3" style="margin-top:8px;width:100%;"
          data-sup-pausa="1"
          data-email="${escapeHtml(tanque.userEmail||'')}"
          data-vin="${escapeHtml(vin)}"
          data-rol="TANQUE"
          data-cid="${escapeHtml(String(tanque.workId||tanque.conversionId||''))}"
          data-who="${escapeHtml(tanqueWho)}"
          data-estado="${escapeHtml(tanque.estado||'')}"
        >⏸ Pausar ${escapeHtml(tanqueWho)}</button>` : ''}
      </div>

      ${
        vin && cidAny
          ? `
            <div class="row" style="margin-top:10px; gap:6px; flex-wrap:wrap;">
              <button
                type="button"
                class="btn3"
                data-sup-inc="1"
                data-vin="${escapeHtml(vin)}"
                data-cid="${escapeHtml(cidAny)}"
                data-who="${escapeHtml("VIN " + vin)}"
              >
                📋 Incidencias
              </button>
            </div>
          `
          : ""
      }
    </div>
  `;
}

export function renderRowNormal_(it, { escapeHtml, fmtShort_ }) {
  const who = it?.userName || it?.userEmail || it?.userId || "-";
  const rol = String(it?.rol || it?.rolTrabajo || "").toUpperCase() || "-";
  const isRamal = rol === "RAMALERO" || rol === "RAMAL";
  const vinOrTipo = isRamal ? `RAMAL: ${it?.tipoRamal || "-"}` : (it?.vin || "-");
  const isCrossDay   = !!it?.crossDay;
  const isMedioCarro = !!it?._esMedioCarro;

  const vinCard = String(it?.vin || "").trim().toUpperCase();
  const conversionIdCard = String(it?.workId || it?.conversionId || it?.conversion_id || "").trim();

  const durMsItem = durationMsFromItem_(it);
  const durTxtItem = durMsItem ? fmtDur_(durMsItem) : "-";

  return `
    <div class="card" style="margin-top:10px;${isCrossDay || isMedioCarro ? ' border-left: 3px solid var(--warn);' : ''}">
      <div style="font-weight:900;">
        ${escapeHtml(who)} <span class="small">(${escapeHtml(rol)})</span>
        ${isCrossDay   ? `<span class="live-half-badge" title="Iniciado el día anterior">½ día ant.</span>` : ""}
        ${isMedioCarro ? `<span class="live-half-badge" title="Finalizado el día anterior al corte — cuenta 0.5">½ carro</span>` : ""}
      </div>

      <div class="row space-between" style="margin-top:8px; gap:10px;">
        <div class="small"><b>Trabajo:</b> ${escapeHtml(vinOrTipo)}</div>
        <div class="pill small"><b>${escapeHtml(it?.estado || "")}</b></div>
      </div>

      ${renderProgressBar_(it)}

      <div class="small" style="margin-top:6px;">
        <b>Duración:</b> ${escapeHtml(durTxtItem)}
      </div>

      <div class="small" style="margin-top:6px;">
        <b>Inicio:</b> ${escapeHtml(fmtShort_(it?.fecha_inicio || it?.fecha_asignacion || it?.created_at || it?.fecha_creacion))}
        ${isFin_(it?.estado) ? `&nbsp;|&nbsp; <b>Fin:</b> ${escapeHtml(fmtShort_(it?.updated_at))}` : ""}
      </div>

      ${
        (!isRamal && (vinCard || conversionIdCard))
          ? `
            <div class="row" style="margin-top:10px; gap:6px; flex-wrap:wrap;">
              <button
                type="button"
                class="btn3"
                data-sup-inc="1"
                data-vin="${escapeHtml(vinCard)}"
                data-cid="${escapeHtml(conversionIdCard)}"
                data-who="${escapeHtml(who)}"
              >
                📋 Incidencias
              </button>
              ${String(it?.estado||'').toUpperCase() === 'TRABAJANDO' ? `
              <button type="button" class="btn3"
                data-sup-pausa="1"
                data-email="${escapeHtml(it?.userEmail||'')}"
                data-vin="${escapeHtml(vinCard)}"
                data-rol="${escapeHtml(rol)}"
                data-cid="${escapeHtml(conversionIdCard)}"
                data-who="${escapeHtml(who)}"
                data-estado="${escapeHtml(it?.estado||'')}"
              >⏸ Pausa indefinida</button>` : ''}
            </div>
          `
          : (isRamal && String(it?.estado||'').toUpperCase() === 'TRABAJANDO' ? `
            <div class="row" style="margin-top:10px;">
              <button type="button" class="btn3"
                data-sup-pausa="1"
                data-email="${escapeHtml(it?.userEmail||'')}"
                data-vin=""
                data-rol="RAMALERO"
                data-cid="${escapeHtml(conversionIdCard)}"
                data-who="${escapeHtml(who)}"
                data-estado="${escapeHtml(it?.estado||'')}"
              >⏸ Pausa indefinida</button>
            </div>
          ` : '')
      }
    </div>
  `;
}