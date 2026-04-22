// =========================
// public/js/views/supervisor/sup-render.js
// RENDER: avg card + tabla (group + normal)
// =========================

import { fmtDur_ } from "./sup-stats.js";
import { durationMsFromItem_, isFinalizado_ } from "./sup-filters.js";

function isFin_(estado) {
  return isFinalizado_(estado);
}

export function renderAvgCard_(avgCardEl, {
  stats,
  techName,
  motorCount,
  tanqueCount,
  finalizedCount,
  escapeHtml
}) {
  if (!avgCardEl) return;

  if (stats?.used > 0) {
    const nameUp = String(techName || "TÉCNICO").toUpperCase();

    avgCardEl.innerHTML = `
      <div class="card" style="
        border:1px solid rgba(255,255,255,.18);
        border-radius:22px;
        padding:18px 18px;
        background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.08));
        box-shadow: 0 10px 24px rgba(0,0,0,.22);
      ">
        <div class="row space-between" style="gap:12px; align-items:flex-start;">
          <div>
            <div class="small" style="opacity:.8; letter-spacing:.5px;">TIEMPO PROMEDIO DE CONVERSIÓN</div>
            <div style="font-weight:1000; font-size:20px; letter-spacing:1px; margin-top:4px;">
              ${escapeHtml(nameUp)}
            </div>
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
            background: rgba(255,255,255,.08);
            border:1px solid rgba(255,255,255,.14);
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
        </div>

        <div class="small" style="margin-top:12px; opacity:.75;">
          (Solo se consideran trabajos en estado <b>FINALIZADO</b>)
        </div>
      </div>
    `;
  } else {
    avgCardEl.innerHTML = `
      <div class="card" style="border:1px solid rgba(255,255,255,.14); border-radius:18px; padding:14px;">
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

  const motorWho = motor?.userName || motor?.userEmail || motor?.userId || "-";
  const tanqueWho = tanque?.userName || tanque?.userEmail || tanque?.userId || "-";

  const motorDur = motor ? (durationMsFromItem_(motor) ? fmtDur_(durationMsFromItem_(motor)) : "-") : "-";
  const tanqueDur = tanque ? (durationMsFromItem_(tanque) ? fmtDur_(durationMsFromItem_(tanque)) : "-") : "-";

  const motorIni = motor ? fmtShort_(motor.fecha_inicio || motor.fecha_asignacion || "") : "";
  const motorFin = (motor && isFin_(motor.estado)) ? fmtShort_(motor.updated_at || "") : "";
  const tanqueIni = tanque ? fmtShort_(tanque.fecha_inicio || tanque.fecha_asignacion || "") : "";
  const tanqueFin = (tanque && isFin_(tanque.estado)) ? fmtShort_(tanque.updated_at || "") : "";

  const cidAny = String(motor?.workId || tanque?.workId || "").trim();

  return `
    <div class="card" style="margin-top:10px;">
      <div style="font-weight:900;">
        VIN: ${escapeHtml(vin)} <span class="small">(MOTOR + TANQUE)</span>
      </div>

      <div class="row space-between" style="margin-top:8px; gap:10px;">
        <div class="small"><b>Estado:</b> ${escapeHtml(row.estado || "-")}</div>
        <div class="pill small"><b>${escapeHtml(row.estado || "")}</b></div>
      </div>

      <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.14);">
        <div class="small" style="font-weight:900;">MOTOR: ${escapeHtml(motorWho)}</div>
        <div class="small" style="margin-top:6px;"><b>Duración:</b> ${escapeHtml(motorDur)}</div>
        <div class="small" style="margin-top:6px;">
          <b>Inicio:</b> ${escapeHtml(motorIni)}${motorFin ? ` &nbsp;|&nbsp; <b>Fin:</b> ${escapeHtml(motorFin)}` : ""}
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

      <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.14);">
        <div class="small" style="font-weight:900;">TANQUE: ${escapeHtml(tanqueWho)}</div>
        <div class="small" style="margin-top:6px;"><b>Duración:</b> ${escapeHtml(tanqueDur)}</div>
        <div class="small" style="margin-top:6px;">
          <b>Inicio:</b> ${escapeHtml(tanqueIni)}${tanqueFin ? ` &nbsp;|&nbsp; <b>Fin:</b> ${escapeHtml(tanqueFin)}` : ""}
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
            <div class="row" style="margin-top:10px; gap:10px;">
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

  const vinCard = String(it?.vin || "").trim().toUpperCase();
  const conversionIdCard = String(it?.workId || it?.conversionId || it?.conversion_id || "").trim();

  const durMsItem = durationMsFromItem_(it);
  const durTxtItem = durMsItem ? fmtDur_(durMsItem) : "-";

  return `
    <div class="card" style="margin-top:10px;">
      <div style="font-weight:900;">
        ${escapeHtml(who)} <span class="small">(${escapeHtml(rol)})</span>
      </div>

      <div class="row space-between" style="margin-top:8px; gap:10px;">
        <div class="small"><b>Trabajo:</b> ${escapeHtml(vinOrTipo)}</div>
        <div class="pill small"><b>${escapeHtml(it?.estado || "")}</b></div>
      </div>

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
            <div class="row" style="margin-top:10px; gap:10px;">
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