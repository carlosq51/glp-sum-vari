// =========================
// public/js/views/admin/admin.js
// Vista ADMIN – CRUD completo: Usuarios, VINs, OTs, Incidencias
// =========================
import { CORE, MODULES } from "../../core/core.js";
import {
  supabaseGet,
  supabasePost,
  supabasePatch,
  supabaseDelete,
} from "../../core/supabase-client.js";
import { createScanner } from "../../core/qr-scanner.js";

// ─── Scanners para QR en Admin ────────────────────────────────────────
const adminVinScanner_     = createScanner("adminVinQrReader");
const reasignarScanner_    = createScanner("reasignarQrReader");

// ─── Mini vinSuggest para Reasignar ──────────────────────────────────
let rSugTimer_  = null;
let rSugItems_  = [];
let rSugIdx_    = -1;

function rSugBox_()   { return $id("reasignarVinSuggest"); }
function rSugInput_() { return $id("reasignarVinInput"); }

function rSugHide_() {
  const box = rSugBox_();
  if (box) { box.classList.add("hidden"); box.innerHTML = ""; }
  rSugItems_ = []; rSugIdx_ = -1;
}

function rSugRender_() {
  const box = rSugBox_();
  if (!box) return;
  if (!rSugItems_.length) { rSugHide_(); return; }
  box.innerHTML = rSugItems_.map((vin, i) =>
    `<div class="vsItem ${i === rSugIdx_ ? "active" : ""}" data-idx="${i}" role="option"
       aria-selected="${i === rSugIdx_}">
       <div class="vsVin">${vin}</div>
     </div>`
  ).join("");
  box.classList.remove("hidden");
}

async function rSugFetch_(q) {
  try {
    const r = await fetch(`/api/vin-suggest?q=${encodeURIComponent(q)}&limit=10`);
    const j = r.ok ? await r.json() : {};
    const items = Array.isArray(j?.items) ? j.items : [];
    return items.map(it => (typeof it === "string" ? it : it?.vin || "")).filter(Boolean);
  } catch { return []; }
}

function rSugOnInput_() {
  const q = String(rSugInput_()?.value || "").trim().toUpperCase();
  if (q.length < 3) { rSugHide_(); return; }
  clearTimeout(rSugTimer_);
  rSugTimer_ = setTimeout(async () => {
    rSugItems_ = await rSugFetch_(q);
    rSugIdx_ = -1;
    rSugRender_();
  }, 220);
}

function rSugPick_(vin) {
  rSugHide_();
  const inp = rSugInput_();
  if (inp) { inp.value = vin; loadReasignarPanel_(); }
}

// ─── State ───────────────────────────────────────────────────────────
const S = {
  tab: "usuarios",
  rows: [],
  editId: null,
  searchTimer: null,
  userModulos: [],
};

// ─── Metadata de secciones ───────────────────────────────────────────
const SECTION_META = {
  usuarios:    { emoji: "👥", label: "Usuarios",       desc: "Cuentas y permisos" },
  vins:        { emoji: "🚘", label: "VINs",           desc: "Vehículos registrados" },
  ots:         { emoji: "📋", label: "OTs",            desc: "Órdenes de trabajo" },
  incidencias: { emoji: "⚠️", label: "Incidencias",    desc: "Registro de fallas" },
  reasignar:   { emoji: "🔄", label: "Reasignar",      desc: "Cambiar técnico asignado" },
  config:      { emoji: "⚙️", label: "Configuración",  desc: "Parámetros del sistema" },
};

// ─── Enums (mirror schema.sql) ───────────────────────────────────────
const ROLES        = ["TECNICO","SUPERVISOR","ADMIN","CALIDAD","MOVILIZADOR","RAMALERO"];
const ESPECIALIDADES = ["AMBOS","MOTOR","TANQUE"];
const TIPOS_OT     = ["CONVERSION","CALIDAD","RAMALERO"];
const ESTADOS_GEN  = ["PENDIENTE","EN PROCESO","TRABAJANDO","FINALIZADO"];
const SEVERIDADES  = ["LEVE","MODERADA","CRITICA"];

// ─── Helpers ─────────────────────────────────────────────────────────
function $id(id) { return document.getElementById(id); }

function msg(text, isErr = false) {
  const el = $id("adminMsg");
  if (!el) return;
  el.textContent = text;
  el.style.color = isErr ? "var(--danger)" : "var(--muted)";
}

function opts(arr, selected = "") {
  return arr.map(v => `<option value="${v}"${v === selected ? " selected" : ""}>${v}</option>`).join("");
}

function escHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Table renderers ─────────────────────────────────────────────────
const TABLE_DEF = {
  usuarios: {
    cols: ["Nombre","Email","Rol","Especialidad","Activo"],
    row: r => [
      escHtml(r.nombre),
      escHtml(r.email),
      `<span class="adminBadge">${escHtml(r.rol)}</span>`,
      escHtml(r.especialidad),
      r.activo ? `<span class="adminBadgeOk">✔ Activo</span>` : `<span class="adminBadgeMuted">Inactivo</span>`,
    ],
  },
  vins: {
    cols: ["VIN","Modelo","DUA","Cliente","Reductor","Tanque"],
    row: r => [
      `<code>${escHtml(r.vin)}</code>`,
      escHtml(r.modelo),
      escHtml(r.dua),
      escHtml(r.cliente),
      escHtml(r.reductor_asignado),
      escHtml(r.tanque_asignado),
    ],
  },
  ots: {
    cols: ["Tipo","VIN","Estado","Observaciones","Fecha"],
    row: r => [
      `<span class="adminBadge">${escHtml(r.tipo_ot)}</span>`,
      `<code>${escHtml(r.vin || "—")}</code>`,
      escHtml(r.estado_general),
      escHtml(r.observaciones),
      r.fecha_creacion ? new Date(r.fecha_creacion).toLocaleDateString("es-PE") : "—",
    ],
  },
  incidencias: {
    cols: ["VIN","Técnico","Tipo","Mes","Nota","Fecha"],
    row: r => [
      `<code>${escHtml(r.vin || "—")}</code>`,
      escHtml(r.tecnico),
      `<span class="adminBadge${r.tipo === "CRITICA" ? " adminBadgeDanger" : r.tipo === "MODERADA" ? " adminBadgeWarn" : ""}">${escHtml(r.tipo)}</span>`,
      escHtml(r.mes),
      escHtml(r.nota),
      r.fecha_hora ? new Date(r.fecha_hora).toLocaleDateString("es-PE") : "—",
    ],
  },
};

function renderTable(rows, query = "") {
  const def = TABLE_DEF[S.tab];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(r => JSON.stringify(r).toLowerCase().includes(q))
    : rows;

  if (!filtered.length) {
    return `<div class="adminEmpty small muted">Sin resultados.</div>`;
  }

  const head = def.cols.map(c => `<th>${c}</th>`).join("");
  const body = filtered.map(r => {
    const cells = def.row(r).map(c => `<td>${c}</td>`).join("");
    const rowId = r.id ?? r.vin;
    return `<tr data-id="${escHtml(String(rowId))}">
      ${cells}
      <td class="adminActionsCell">
        <button class="adminBtnEdit adminRowBtn" data-id="${escHtml(String(rowId))}" title="Editar">✏️</button>
        <button class="adminBtnDel adminRowBtn" data-id="${escHtml(String(rowId))}" title="Eliminar">🗑️</button>
      </td>
    </tr>`;
  }).join("");

  return `<div class="adminTableScroll"><table class="adminTable">
    <thead><tr>${head}<th></th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

// ─── Load data ───────────────────────────────────────────────────────
const TABLE_MAP = {
  usuarios: "usuarios",
  vins: "vins",
  ots: "work_orders",
  incidencias: "incidencias",
};

// ─── Reasignar técnico ───────────────────────────────────────────────
async function loadReasignarPanel_() {
  const wrap = $id("reasignarResults");
  if (!wrap) return;

  const vin = ($id("reasignarVinInput")?.value || "").trim().toUpperCase();
  if (!vin) return;

  wrap.innerHTML = `<div class="small muted" style="padding:12px;">Buscando asignaciones…</div>`;

  try {
    const [asgResp, usrResp] = await Promise.all([
      fetch(`/api/admin/asignaciones?vin=${encodeURIComponent(vin)}`),
      fetch("/api/admin/usuarios-activos"),
    ]);
    const asgData = asgResp.ok ? await asgResp.json() : { ok: false };
    const usrData = usrResp.ok ? await usrResp.json() : { ok: false };

    if (!asgData.ok) { wrap.innerHTML = `<div class="small" style="color:var(--danger);padding:12px;">${escHtml(asgData.error || "Error al buscar")}</div>`; return; }

    const asgs = asgData.asignaciones || [];
    const usuarios = usrData.usuarios || [];

    if (!asgs.length) {
      wrap.innerHTML = `<div class="adminEmpty small muted">Sin asignaciones activas para VIN <strong>${escHtml(vin)}</strong>.</div>`;
      return;
    }

    const usrOpts = usuarios.map(u => `<option value="${escHtml(u.id)}">${escHtml(u.nombre)} (${escHtml(u.especialidad)})</option>`).join("");

    const rows = asgs.map(a => `
      <tr data-asgid="${escHtml(a.id)}">
        <td><span class="adminBadge">${escHtml(a.tipo_ot)}</span></td>
        <td>${escHtml(a.rol_trabajo)}</td>
        <td id="reasigTecnico-${escHtml(a.id)}">${escHtml(a.tecnico_nombre)}</td>
        <td><span class="adminBadge${a.estado_actual === "TRABAJANDO" ? " adminBadgeOk" : ""}">${escHtml(a.estado_actual)}</span></td>
        <td>
          <div id="reasigCtrl-${escHtml(a.id)}" class="reasigCtrl">
            <button class="adminBtnEdit adminRowBtn btnReasignarTecnico" data-asgid="${escHtml(a.id)}" title="Cambiar técnico">✏️ Cambiar</button>
          </div>
        </td>
      </tr>
      <tr id="reasigRow-${escHtml(a.id)}" style="display:none;">
        <td colspan="5">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;">
            <select id="reasigSelect-${escHtml(a.id)}" class="adminInput" style="flex:1;min-width:160px;">
              ${usrOpts}
            </select>
            <button class="adminBtnOk btnConfirmarReasignar" data-asgid="${escHtml(a.id)}" style="height:36px;">Confirmar</button>
            <button class="adminBtnGhost btnCancelarReasignar" data-asgid="${escHtml(a.id)}" style="height:36px;">Cancelar</button>
            <span id="reasigMsg-${escHtml(a.id)}" class="small muted"></span>
          </div>
        </td>
      </tr>
    `).join("");

    wrap.innerHTML = `
      <div class="adminTableScroll">
        <table class="adminTable">
          <thead><tr><th>Tipo OT</th><th>Rol</th><th>Técnico actual</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    wrap.querySelectorAll(".btnReasignarTecnico").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.asgid;
        const row = $id(`reasigRow-${id}`);
        if (row) row.style.display = row.style.display === "none" ? "" : "none";
      });
    });

    wrap.querySelectorAll(".btnCancelarReasignar").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = $id(`reasigRow-${btn.dataset.asgid}`);
        if (row) row.style.display = "none";
      });
    });

    wrap.querySelectorAll(".btnConfirmarReasignar").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.asgid;
        const sel = $id(`reasigSelect-${id}`);
        const msgEl = $id(`reasigMsg-${id}`);
        const userId = sel?.value;
        if (!userId) return;

        btn.disabled = true;
        if (msgEl) msgEl.textContent = "Guardando…";
        try {
          const resp = await fetch(`/api/admin/asignaciones/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId }),
          });
          const j = await resp.json();
          if (!j?.ok) throw new Error(j?.error || "Error");

          const nombreNuevo = usuarios.find(u => u.id === userId)?.nombre || userId;
          const tecEl = $id(`reasigTecnico-${id}`);
          if (tecEl) tecEl.textContent = nombreNuevo;
          const row = $id(`reasigRow-${id}`);
          if (row) row.style.display = "none";
          if (msgEl) { msgEl.textContent = ""; }
          msg("Técnico actualizado correctamente.");
        } catch (e) {
          if (msgEl) { msgEl.textContent = `Error: ${e.message}`; msgEl.style.color = "var(--danger)"; }
          btn.disabled = false;
        }
      });
    });

  } catch (e) {
    wrap.innerHTML = `<div class="small" style="color:var(--danger);padding:12px;">${escHtml(e.message)}</div>`;
  }
}

async function loadTab() {
  const wrap = $id("adminTableContent");
  if (!wrap) return;

  // ─── Tab Reasignar ────────────────────────────────────────────────
  if (S.tab === "reasignar") {
    $id("adminToolbar") && ($id("adminToolbar").style.display = "none");
    wrap.innerHTML = `
      <div class="adminConfigPanel">
        <div class="adminConfigSection">
          <h4 class="adminConfigTitle">Reasignar técnico</h4>
          <p class="small muted">Busca un VIN para ver sus asignaciones activas y cambiar el técnico asignado (CONVERSION o CALIDAD).</p>
          <div style="position:relative;">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <input id="reasignarVinInput" type="text" class="adminInput"
                placeholder="Ingresa VIN o escanea QR…"
                autocomplete="off" autocapitalize="characters" spellcheck="false"
                style="flex:1;min-width:160px;max-width:260px;" />
              <button id="btnReasignarQr" type="button" class="adminBtnGhost" title="Escanear QR" style="padding:6px 12px;">📷</button>
              <button id="btnReasignarBuscar" type="button" class="adminBtnOk">Buscar</button>
            </div>
            <div id="reasignarVinSuggest" class="vinSuggest hidden" role="listbox"
              style="max-width:280px;"></div>
          </div>
          <div id="reasignarQrReader" style="margin-top:8px;max-width:340px;"></div>
          <div id="reasignarResults" style="margin-top:16px;"></div>
        </div>
      </div>
    `;

    $id("btnReasignarBuscar")?.addEventListener("click", () => { rSugHide_(); loadReasignarPanel_(); });
    $id("reasignarVinInput")?.addEventListener("input", rSugOnInput_);
    $id("reasignarVinInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        const pick = rSugIdx_ >= 0 ? rSugItems_[rSugIdx_] : null;
        if (pick) { rSugPick_(pick); return; }
        rSugHide_(); loadReasignarPanel_();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        rSugIdx_ = Math.min(rSugIdx_ + 1, rSugItems_.length - 1); rSugRender_();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        rSugIdx_ = Math.max(rSugIdx_ - 1, -1); rSugRender_();
      }
    });
    $id("reasignarVinSuggest")?.addEventListener("click", e => {
      const item = e.target.closest(".vsItem");
      if (item) rSugPick_(rSugItems_[parseInt(item.dataset.idx, 10)]);
    });
    $id("btnReasignarQr")?.addEventListener("click", async () => {
      try {
        await reasignarScanner_.start({
          mode: "QR",
          onDecoded: async code => {
            await reasignarScanner_.stop().catch(() => {});
            const inp = rSugInput_();
            if (inp) inp.value = code;
            rSugHide_();
            loadReasignarPanel_();
          },
        });
      } catch {}
    });
    return;
  }

  // ─── Tab Configuración ─────────────────────────────────────────────
  if (S.tab === "config") {
    $id("adminToolbar") && ($id("adminToolbar").style.display = "none");
    wrap.innerHTML = `<div class="small muted" style="padding:12px;">Cargando configuración…</div>`;
    try {
      const resp = await fetch("/api/admin/config");
      const j = resp.ok ? await resp.json() : { ok: false };
      const cfg = j.config || {};
      const fechaCorte    = cfg.FECHA_CORTE_MOVILIZADOR || "";
      const pausaActiva   = cfg.PAUSA_GLOBAL_ACTIVA === "1";
      const comidaInicio  = cfg.HORARIO_COMIDA_INICIO   || "13:00";
      const comidaFin     = cfg.HORARIO_COMIDA_FIN       || "14:00";
      const descInicio    = cfg.HORARIO_DESCANSO_INICIO  || "16:30";
      const descFin       = cfg.HORARIO_DESCANSO_FIN     || "07:00";
      const metaConv      = cfg.META_CONVERSION          || "25";
      const metaCal       = cfg.META_CALIDAD             || "22";

      wrap.innerHTML = `
        <div class="adminConfigPanel">

          <!-- PAUSA MAESTRA -->
          <div class="adminConfigSection">
            <h4 class="adminConfigTitle">Control de pausa global</h4>
            <p class="small muted">
              Pausar todas las OTs que estén en estado <strong>TRABAJANDO</strong> en este momento.
              Reanudar las que estén en <strong>PAUSADO</strong>.
            </p>
            <div class="adminPausaStatus ${pausaActiva ? "pausaActiva" : "pausaInactiva"}">
              ${pausaActiva
                ? "⏸ Pausa global activa — las OTs están detenidas"
                : "▶ Sin pausa global — las OTs corren normalmente"}
            </div>
            <div style="display:flex;gap:10px;margin-top:10px;align-items:center;flex-wrap:wrap;">
              <button id="btnPausarTodo" type="button"
                class="adminBtnPausa ${pausaActiva ? "hidden" : ""}">
                ⏸ Pausar todas las OTs
              </button>
              <button id="btnReanudarTodo" type="button"
                class="adminBtnReanudar ${pausaActiva ? "" : "hidden"}">
                ▶ Reanudar todas las OTs
              </button>
              <span id="cfgPausaMsg" class="small muted"></span>
            </div>
          </div>

          <!-- HORARIOS -->
          <div class="adminConfigSection">
            <h4 class="adminConfigTitle">Horarios de pausa automática</h4>
            <p class="small muted">
              Durante estos intervalos las OTs en pausa <strong>no se reanudan automáticamente</strong>
              (pausa indefinida). Los cambios se aplican en el próximo ciclo de polling del técnico.
            </p>

            <div class="adminHorarioGrid">
              <div class="adminHorarioGroup">
                <span class="adminHorarioLabel">🍽 Hora de comida</span>
                <div class="adminHorarioRow">
                  <label class="adminLabel adminLabelInline">
                    Inicio
                    <input id="cfgComidaInicio" type="time" value="${escHtml(comidaInicio)}" style="width:120px;">
                  </label>
                  <label class="adminLabel adminLabelInline">
                    Fin
                    <input id="cfgComidaFin" type="time" value="${escHtml(comidaFin)}" style="width:120px;">
                  </label>
                </div>
              </div>

              <div class="adminHorarioGroup">
                <span class="adminHorarioLabel">🌙 Horario nocturno / descanso</span>
                <p class="small muted" style="margin:2px 0 6px;">
                  Puede cruzar la medianoche (ej. 16:30 → 07:00).
                </p>
                <div class="adminHorarioRow">
                  <label class="adminLabel adminLabelInline">
                    Inicio
                    <input id="cfgDescInicio" type="time" value="${escHtml(descInicio)}" style="width:120px;">
                  </label>
                  <label class="adminLabel adminLabelInline">
                    Fin
                    <input id="cfgDescFin" type="time" value="${escHtml(descFin)}" style="width:120px;">
                  </label>
                </div>
              </div>
            </div>

            <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
              <button id="btnSaveHorarios" type="button" class="adminBtnOk">Guardar horarios</button>
              <span id="cfgHorariosMsg" class="small muted"></span>
            </div>
          </div>

          <!-- OBJETIVOS DIARIOS -->
          <div class="adminConfigSection">
            <h4 class="adminConfigTitle">Objetivos diarios de producci\u00f3n</h4>
            <p class="small muted">
              Metas de VINs completados por d\u00eda. Se muestran como barras de progreso en el panel LIVE.
            </p>
            <div class="adminHorarioGrid">
              <label class="adminLabel adminLabelInline">
                🔧 Conversi\u00f3n (motor+tanque)
                <input id="cfgMetaConv" type="number" min="1" max="200" value="${escHtml(metaConv)}" style="width:100px;">
              </label>
              <label class="adminLabel adminLabelInline">
                ✅ Calidad
                <input id="cfgMetaCal" type="number" min="1" max="200" value="${escHtml(metaCal)}" style="width:100px;">
              </label>
            </div>
            <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
              <button id="btnSaveMetas" type="button" class="adminBtnOk">Guardar objetivos</button>
              <span id="cfgMetasMsg" class="small muted"></span>
            </div>
          </div>

          <!-- FECHA CORTE MOVILIZADOR -->
          <div class="adminConfigSection">
            <h4 class="adminConfigTitle">Configuración del Movilizador</h4>
            <p class="small muted">
              Solo se muestran conversiones y calidades finalizadas
              <strong>a partir de esta fecha</strong>. Vacío = sin filtro.
            </p>
            <label class="adminLabel">
              Fecha de corte movilizador
              <input id="cfgFechaCorte" type="date" value="${escHtml(fechaCorte)}" style="max-width:220px;">
            </label>
            <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
              <button id="btnSaveConfig" type="button" class="adminBtnOk">Guardar</button>
              <span id="cfgMsg" class="small muted"></span>
            </div>
          </div>

          <!-- MODELO VIN (IA) -->
          <div class="adminConfigSection">
            <h4 class="adminConfigTitle">🤖 Inferencia de modelo vehicular</h4>
            <p class="small muted">
              Entrena el modelo con los VINs existentes en la base de datos que ya tienen modelo conocido.
              Luego podrás inferir el modelo para VINs sin información, usando coincidencia de prefijos VIN (WMI + VDS).
            </p>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <button id="btnTrainVinModel" type="button" class="adminBtnOk">Entrenar modelo</button>
              <button id="btnInferVins" type="button" class="adminBtnOk" style="background:var(--glass);border:1px solid var(--surfaceLine);">Ver VINs sin modelo</button>
              <span id="mlMsg" class="small muted"></span>
            </div>
            <div id="mlResult" style="margin-top:12px;"></div>
          </div>

        </div>
      `;

      // --- eventos ---
      $id("btnSaveConfig")?.addEventListener("click", saveConfig_);
      $id("btnSaveHorarios")?.addEventListener("click", saveHorarios_);
      $id("btnSaveMetas")?.addEventListener("click", saveMetas_);

      $id("btnTrainVinModel")?.addEventListener("click", async () => {
        const msg = $id("mlMsg");
        const res = $id("mlResult");
        msg.textContent = "Entrenando…";
        res.innerHTML = "";
        try {
          const r = await fetch("/api/ml/train-vin-model", { method: "POST" });
          const j = await r.json();
          if (j.ok) {
            msg.textContent = `✅ Modelo entrenado: ${j.total_vins} VINs · ${j.unique_models} modelos distintos`;
          } else {
            msg.textContent = `⚠️ ${j.error}`;
          }
        } catch (e) { msg.textContent = `Error: ${e.message}`; }
      });

      $id("btnInferVins")?.addEventListener("click", async () => {
        const res = $id("mlResult");
        const msg = $id("mlMsg");
        msg.textContent = "Buscando VINs sin modelo…";
        res.innerHTML = `<div class="small muted">Cargando…</div>`;
        try {
          const SUPABASE_URL = "/api"; // use own backend
          const r = await fetch("/api/vins-sin-modelo");
          const j = await r.json();
          if (!j?.ok) { res.innerHTML = `<div class="small" style="color:var(--danger);">${escHtml(j?.error||"Error")}</div>`; msg.textContent=""; return; }
          const vins = j.items || [];
          msg.textContent = `${vins.length} VINs sin modelo`;
          if (!vins.length) { res.innerHTML = `<div class="small muted">Todos los VINs tienen modelo asignado.</div>`; return; }
          const rows = await Promise.all(vins.slice(0, 50).map(async v => {
            try {
              const ri = await fetch(`/api/ml/infer-vin-model?vin=${encodeURIComponent(v.vin)}`);
              const ji = await ri.json();
              return { vin: v.vin, inferred: ji.modelo, confidence: ji.confidence, candidates: ji.candidates };
            } catch { return { vin: v.vin, inferred: null, confidence: 0 }; }
          }));
          res.innerHTML = `
            <div class="adminTable" style="margin-top:10px;font-size:var(--fs-xs);">
              <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:6px;padding:6px 10px;font-weight:var(--fw-extrabold);opacity:.6;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--surfaceLine);">
                <span>VIN</span><span>Modelo inferido</span><span>Confianza</span>
              </div>
              ${rows.map(r => `
                <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:6px;padding:6px 10px;border-bottom:1px solid var(--surfaceLine);">
                  <span style="font-family:monospace;">${escHtml(r.vin)}</span>
                  <span>${r.inferred ? escHtml(r.inferred) : '<span style="color:var(--muted);">Sin coincidencia</span>'}</span>
                  <span style="color:${r.confidence >= 80 ? "#4ade80" : r.confidence >= 50 ? "#fbbf24" : "var(--muted)"};">${r.inferred ? r.confidence + "%" : "—"}</span>
                </div>`).join("")}
            </div>
          `;
        } catch (e) { res.innerHTML = `<div class="small" style="color:var(--danger);">Error: ${e.message}</div>`; msg.textContent=""; }
      });
      $id("btnPausarTodo")?.addEventListener("click", () => pausaMasiva_("PAUSA"));
      $id("btnReanudarTodo")?.addEventListener("click", () => pausaMasiva_("REANUDAR"));

    } catch (e) {
      wrap.innerHTML = `<div class="small" style="color:var(--danger);padding:12px;">${escHtml(e.message)}</div>`;
    }
    return;
  }

  // ─── Tabs CRUD normales ─────────────────────────────────────────
  $id("adminToolbar") && ($id("adminToolbar").style.display = "");
  wrap.innerHTML = `<div class="small muted" style="padding:12px;">Cargando…</div>`;
  msg("");

  try {
    const table = TABLE_MAP[S.tab];
    S.rows = await supabaseGet(table);
    wrap.innerHTML = renderTable(S.rows, $id("adminSearch")?.value || "");
    bindTableActions();
  } catch (e) {
    wrap.innerHTML = `<div class="small" style="color:var(--danger);padding:12px;">${escHtml(e.message)}</div>`;
    msg(e.message, true);
  }
}

async function saveConfig_() {
  const btn = $id("btnSaveConfig");
  const msgEl = $id("cfgMsg");
  const value = $id("cfgFechaCorte")?.value?.trim() || "";
  if (btn) btn.disabled = true;
  if (msgEl) msgEl.textContent = "Guardando…";
  try {
    const resp = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "FECHA_CORTE_MOVILIZADOR", value }),
    });
    const j = await resp.json();
    if (!j?.ok) throw new Error(j?.error || "Error");
    if (msgEl) { msgEl.textContent = "✔ Guardado"; msgEl.style.color = "var(--ok)"; }
  } catch (e) {
    if (msgEl) { msgEl.textContent = `Error: ${e.message}`; msgEl.style.color = "var(--danger)"; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveMetas_() {
  const btn   = $id("btnSaveMetas");
  const msgEl = $id("cfgMetasMsg");
  const conv  = String(Number($id("cfgMetaConv")?.value) || 25);
  const cal   = String(Number($id("cfgMetaCal")?.value)  || 22);
  if (btn) btn.disabled = true;
  if (msgEl) msgEl.textContent = "Guardando\u2026";
  try {
    const resp = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configs: [
        { key: "META_CONVERSION", value: conv },
        { key: "META_CALIDAD",    value: cal  },
      ]}),
    });
    const j = await resp.json();
    if (!j?.ok) throw new Error(j?.error || "Error");
    if (msgEl) { msgEl.textContent = "\u2714 Guardado"; msgEl.style.color = "var(--ok)"; }
  } catch (e) {
    if (msgEl) { msgEl.textContent = `Error: ${e.message}`; msgEl.style.color = "var(--danger)"; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveHorarios_() {
  const btn    = $id("btnSaveHorarios");
  const msgEl  = $id("cfgHorariosMsg");
  const ci     = $id("cfgComidaInicio")?.value?.trim() || "13:00";
  const cf     = $id("cfgComidaFin")?.value?.trim()    || "14:00";
  const di     = $id("cfgDescInicio")?.value?.trim()   || "16:30";
  const df     = $id("cfgDescFin")?.value?.trim()      || "07:00";
  if (btn) btn.disabled = true;
  if (msgEl) msgEl.textContent = "Guardando…";
  try {
    const resp = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        configs: [
          { key: "HORARIO_COMIDA_INICIO",   value: ci },
          { key: "HORARIO_COMIDA_FIN",       value: cf },
          { key: "HORARIO_DESCANSO_INICIO",  value: di },
          { key: "HORARIO_DESCANSO_FIN",     value: df },
        ],
      }),
    });
    const j = await resp.json();
    if (!j?.ok) throw new Error(j?.error || "Error");
    if (msgEl) { msgEl.textContent = "✔ Guardado"; msgEl.style.color = "var(--ok)"; }
    // Limpiar caché del frontend para que los técnicos lean el nuevo horario
    try { localStorage.removeItem("glp_app_config_cache"); } catch {}
  } catch (e) {
    if (msgEl) { msgEl.textContent = `Error: ${e.message}`; msgEl.style.color = "var(--danger)"; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function pausaMasiva_(accion) {
  const btn    = accion === "PAUSA" ? $id("btnPausarTodo") : $id("btnReanudarTodo");
  const msgEl  = $id("cfgPausaMsg");
  if (btn) btn.disabled = true;
  if (msgEl) { msgEl.textContent = accion === "PAUSA" ? "Pausando…" : "Reanudando…"; msgEl.style.color = ""; }
  try {
    const resp = await fetch("/api/admin/pausa-masiva", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion }),
    });
    const j = await resp.json();
    if (!j?.ok) throw new Error(j?.error || "Error");
    const txt = accion === "PAUSA"
      ? `✔ ${j.afectadas} OT(s) pausadas`
      : `✔ ${j.afectadas} OT(s) reanudadas`;
    if (msgEl) { msgEl.textContent = txt; msgEl.style.color = "var(--ok)"; }
    // Reload config tab to flip the button and status banner
    await loadTab();
  } catch (e) {
    if (msgEl) { msgEl.textContent = `Error: ${e.message}`; msgEl.style.color = "var(--danger)"; }
    if (btn) btn.disabled = false;
  }
}

// ─── Form definitions ────────────────────────────────────────────────
function formUsuario(r = {}) {
  const checksHtml = MODULES.map(m =>
    `<label class="adminCheckLabel"><input type="checkbox" class="fModulo" value="${m}"> ${m}</label>`
  ).join("");
  return `
    <label class="adminLabel">Nombre<input id="fNombre" type="text" value="${escHtml(r.nombre || "")}" placeholder="Nombre completo"></label>
    <label class="adminLabel">Email<input id="fEmail" type="email" value="${escHtml(r.email || "")}" placeholder="correo@empresa.com"></label>
    <label class="adminLabel">Rol<select id="fRol">${opts(ROLES, r.rol || "TECNICO")}</select></label>
    <label class="adminLabel">Especialidad<select id="fEsp">${opts(ESPECIALIDADES, r.especialidad || "AMBOS")}</select></label>
    <label class="adminLabel adminLabelRow"><input id="fActivo" type="checkbox"${r.activo !== false ? " checked" : ""}> Activo</label>
    <div class="adminLabel">
      <span class="adminLabelText">Módulos asignados <span class="adminLabelHint">(vacío = default del rol)</span></span>
      <div class="adminCheckGroup" id="fModulosGroup">${checksHtml}</div>
    </div>
  `;
}

function formVin(r = {}) {
  const isNew = !r.vin;
  return `
    <label class="adminLabel">VIN
      <div style="display:flex;gap:6px;align-items:center;">
        <input id="fVin" type="text" value="${escHtml(r.vin || "")}" placeholder="17 caracteres"
          ${r.vin ? "readonly" : ""}
          autocomplete="off" autocapitalize="characters" spellcheck="false"
          style="flex:1;min-width:0;" />
        ${isNew ? `<button id="btnAdminVinQr" type="button" class="adminBtnGhost"
          style="flex:0 0 auto;padding:6px 10px;" title="Escanear QR">📷</button>` : ""}
      </div>
    </label>
    ${isNew ? `<div id="adminVinQrReader" style="margin-top:-4px;margin-bottom:8px;"></div>` : ""}
    <label class="adminLabel">Modelo<input id="fModelo" type="text" value="${escHtml(r.modelo || "")}"></label>
    <label class="adminLabel">DUA<input id="fDua" type="text" value="${escHtml(r.dua || "")}"></label>
    <label class="adminLabel">Cliente<input id="fCliente" type="text" value="${escHtml(r.cliente || "")}"></label>
    <label class="adminLabel">Reductor asignado<input id="fReductor" type="text" value="${escHtml(r.reductor_asignado || "")}"></label>
    <label class="adminLabel">Tanque asignado<input id="fTanque" type="text" value="${escHtml(r.tanque_asignado || "")}"></label>
  `;
}

function formOt(r = {}) {
  return `
    <label class="adminLabel">Tipo OT<select id="fTipoOt">${opts(TIPOS_OT, r.tipo_ot || "CONVERSION")}</select></label>
    <label class="adminLabel">VIN<input id="fOtVin" type="text" value="${escHtml(r.vin || "")}" placeholder="Ej: 1HGBH41JXMN109186"></label>
    <label class="adminLabel">Estado<select id="fEstado">${opts(ESTADOS_GEN, r.estado_general || "PENDIENTE")}</select></label>
    <label class="adminLabel">Observaciones<textarea id="fObs">${escHtml(r.observaciones || "")}</textarea></label>
    <label class="adminLabel">Tanque registrado<input id="fTanqueReg" type="text" value="${escHtml(r.tanque_registrado || "")}"></label>
    <label class="adminLabel">Reductor registrado<input id="fReductorReg" type="text" value="${escHtml(r.reductor_registrado || "")}"></label>
  `;
}

function formIncidencia(r = {}) {
  return `
    <label class="adminLabel">VIN<input id="fIncVin" type="text" value="${escHtml(r.vin || "")}"></label>
    <label class="adminLabel">Técnico<input id="fTecnico" type="text" value="${escHtml(r.tecnico || "")}"></label>
    <label class="adminLabel">Tipo / Severidad<select id="fTipo">${opts(SEVERIDADES, r.tipo || "LEVE")}</select></label>
    <label class="adminLabel">Registrado por<input id="fRegPor" type="text" value="${escHtml(r.registrado_por || "")}"></label>
    <label class="adminLabel">Nota<textarea id="fNota">${escHtml(r.nota || "")}</textarea></label>
  `;
}

const FORM_MAP = {
  usuarios: formUsuario,
  vins: formVin,
  ots: formOt,
  incidencias: formIncidencia,
};

const TITLE_MAP = {
  usuarios: "Usuario",
  vins: "VIN",
  ots: "Orden de Trabajo",
  incidencias: "Incidencia",
};

// ─── Collect form data ───────────────────────────────────────────────
function collectForm() {
  const v = id => $id(id)?.value?.trim() ?? "";
  const b = id => !!$id(id)?.checked;

  if (S.tab === "usuarios") {
    const _modulos = [...document.querySelectorAll(".fModulo:checked")].map(cb => cb.value);
    return {
      nombre: v("fNombre"),
      email: v("fEmail"),
      rol: v("fRol"),
      especialidad: v("fEsp"),
      activo: b("fActivo"),
      _modulos,
    };
  }
  if (S.tab === "vins") return {
    vin: v("fVin"),
    modelo: v("fModelo"),
    dua: v("fDua"),
    cliente: v("fCliente"),
    reductor_asignado: v("fReductor"),
    tanque_asignado: v("fTanque"),
  };
  if (S.tab === "ots") return {
    tipo_ot: v("fTipoOt"),
    vin: v("fOtVin") || null,
    estado_general: v("fEstado"),
    observaciones: v("fObs"),
    tanque_registrado: v("fTanqueReg"),
    reductor_registrado: v("fReductorReg"),
  };
  if (S.tab === "incidencias") {
    const vinRaw = v("fIncVin");
    const now = new Date();
    return {
      vin: vinRaw || null,
      tecnico: v("fTecnico"),
      tipo: v("fTipo"),
      registrado_por: v("fRegPor"),
      nota: v("fNota"),
      mes: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    };
  }
  return {};
}

// ─── Validate ────────────────────────────────────────────────────────
function validate(data) {
  if (S.tab === "usuarios") {
    if (!data.nombre) return "El nombre es requerido.";
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "Email inválido.";
  }
  if (S.tab === "vins") {
    if (!data.vin || data.vin.length !== 17) return "El VIN debe tener exactamente 17 caracteres.";
  }
  if (S.tab === "ots") {
    if (data.tipo_ot !== "RAMALERO" && !data.vin) return "El VIN es requerido para este tipo de OT.";
  }
  if (S.tab === "incidencias") {
    if (!data.tecnico) return "El técnico es requerido.";
    if (!data.registrado_por) return "Quién registra es requerido.";
  }
  return null;
}

// ─── Modal open/close ────────────────────────────────────────────────
function openModal(titleText, formHtml) {
  $id("adminModalTitle").textContent = titleText;
  $id("adminModalBody").innerHTML = `<div class="adminForm">${formHtml}</div>`;
  const modal = $id("adminModal");
  modal.classList.add("show");
  modal.removeAttribute("aria-hidden");
  document.body.classList.add("modal-open");
  setTimeout(() => {
    $id("adminModalBody").querySelector("input,select,textarea")?.focus();
    bindModalExtras_();
  }, 80);
}

function bindModalExtras_() {
  // Cámara QR para el campo VIN en "Nuevo VIN"
  if (S.tab === "vins" && !S.editId) {
    $id("btnAdminVinQr")?.addEventListener("click", async () => {
      try {
        await adminVinScanner_.start({
          mode: "QR",
          onDecoded: async code => {
            await adminVinScanner_.stop().catch(() => {});
            const inp = $id("fVin");
            if (inp && !inp.readOnly) inp.value = code;
          },
        });
      } catch {}
    });
  }
}

function closeModal() {
  adminVinScanner_.stop().catch(() => {});
  const modal = $id("adminModal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  S.editId = null;
}

// ─── Save (create / update) ──────────────────────────────────────────
async function save() {
  const data = collectForm();
  const err = validate(data);
  if (err) { msg(err, true); return; }

  const saveBtn = $id("btnAdminModalSave");
  saveBtn.disabled = true;
  msg("Guardando…");

  try {
    const table = TABLE_MAP[S.tab];
    const { _modulos, ...rowData } = (S.tab === "usuarios") ? data : { ...data, _modulos: undefined };
    if (S.editId) {
      // UPDATE
      const pkField = S.tab === "vins" ? "vin" : "id";
      await supabasePatch(table, { [pkField]: S.editId }, rowData);
      if (S.tab === "usuarios") await syncModulos_(S.editId, _modulos || []);
      msg("Actualizado correctamente.");
    } else {
      // CREATE
      const result = await supabasePost(table, rowData);
      if (S.tab === "usuarios" && Array.isArray(result) && result[0]?.id) {
        await syncModulos_(result[0].id, _modulos || []);
      }
      msg("Creado correctamente.");
    }
    closeModal();
    await loadTab();
  } catch (e) {
    msg(e.message, true);
  } finally {
    saveBtn.disabled = false;
  }
}

// ─── Sync usuario_modulos ────────────────────────────────────────────
async function syncModulos_(userId, modulos) {
  await supabaseDelete("usuario_modulos", { user_id: userId });
  if (modulos.length) {
    await supabasePost("usuario_modulos", modulos.map(m => ({ user_id: userId, modulo: m })));
  }
}

// ─── Delete ──────────────────────────────────────────────────────────
async function deleteRow(id) {
  if (!confirm("¿Eliminar este registro? Esta acción no se puede deshacer.")) return;
  msg("Eliminando…");
  try {
    const table = TABLE_MAP[S.tab];
    const pkField = S.tab === "vins" ? "vin" : "id";
    await supabaseDelete(table, { [pkField]: id });
    msg("Eliminado.");
    await loadTab();
  } catch (e) {
    msg(e.message, true);
  }
}

// ─── Bind table action buttons ───────────────────────────────────────
function bindTableActions() {
  const wrap = $id("adminTableContent");
  if (!wrap) return;
  wrap.querySelectorAll(".adminBtnEdit").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const pkField = S.tab === "vins" ? "vin" : "id";
      const row = S.rows.find(r => String(r[pkField]) === id);
      if (!row) return;
      S.editId = id;
      openModal(`Editar ${TITLE_MAP[S.tab]}`, FORM_MAP[S.tab](row));
      if (S.tab === "usuarios") {
        try {
          const mods = await supabaseGet("usuario_modulos", { user_id: id });
          const modNames = Array.isArray(mods) ? mods.map(m => m.modulo) : [];
          document.querySelectorAll(".fModulo").forEach(cb => {
            cb.checked = modNames.includes(cb.value);
          });
        } catch { /* silent – checkboxes stay unchecked */ }
      }
    });
  });
  wrap.querySelectorAll(".adminBtnDel").forEach(btn => {
    btn.addEventListener("click", () => deleteRow(btn.dataset.id));
  });
}

// ─── Navegación cartillas ────────────────────────────────────────────
let adminCardsInited_ = false;

function showAdminCards_() {
  reasignarScanner_.stop().catch(() => {});
  $id("adminCards").style.display  = "block";
  $id("adminDetail").style.display = "none";
  msg("");

  // Renderizar cartillas una sola vez
  const grid = $id("adminCardGrid");
  if (!grid || adminCardsInited_) return;
  adminCardsInited_ = true;

  Object.entries(SECTION_META).forEach(([key, meta]) => {
    const card = document.createElement("button");
    card.className = "hubCard";
    card.dataset.section = key;
    card.innerHTML = `
      <div class="hubCardEmoji">${meta.emoji}</div>
      <div class="hubCardText">
        <div class="hubCardName">${meta.label}</div>
        <div class="hubCardDesc">${meta.desc}</div>
      </div>
    `;
    card.addEventListener("click", () => showAdminDetail_(key));
    grid.appendChild(card);
  });
}

function showAdminDetail_(tab) {
  S.tab = tab;
  $id("adminCards").style.display  = "none";
  $id("adminDetail").style.display = "block";
  const meta = SECTION_META[tab] || {};
  const titleEl = $id("adminDetailTitle");
  if (titleEl) titleEl.textContent = `${meta.emoji || ""} ${meta.label || tab}`;
  const searchEl = $id("adminSearch");
  if (searchEl) searchEl.value = "";
  loadTab();
}

// ─── Public API ──────────────────────────────────────────────────────
export function init() {
  // Volver a cartillas
  $id("btnAdminBack")?.addEventListener("click", showAdminCards_);

  // Search
  $id("adminSearch")?.addEventListener("input", e => {
    clearTimeout(S.searchTimer);
    S.searchTimer = setTimeout(() => {
      const wrap = $id("adminTableContent");
      if (wrap) {
        wrap.innerHTML = renderTable(S.rows, e.target.value);
        bindTableActions();
      }
    }, 220);
  });

  // Nuevo
  $id("btnAdminNuevo")?.addEventListener("click", () => {
    S.editId = null;
    openModal(`Nuevo ${TITLE_MAP[S.tab]}`, FORM_MAP[S.tab]());
  });

  // Modal close
  $id("btnAdminModalClose")?.addEventListener("click", closeModal);
  $id("btnAdminModalCancel")?.addEventListener("click", closeModal);
  $id("adminModal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Save
  $id("btnAdminModalSave")?.addEventListener("click", save);
}

export function enter() { CORE.state.currentModule = "ADMIN"; showAdminCards_(); }
export function exit() { reasignarScanner_.stop().catch(() => {}); }