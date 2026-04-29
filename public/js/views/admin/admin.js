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

// ─── State ───────────────────────────────────────────────────────────
const S = {
  tab: "usuarios",
  rows: [],
  editId: null,
  searchTimer: null,
  userModulos: [],
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

async function loadTab() {
  const wrap = $id("adminTableContent");
  if (!wrap) return;

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

        </div>
      `;

      // --- eventos ---
      $id("btnSaveConfig")?.addEventListener("click", saveConfig_);
      $id("btnSaveHorarios")?.addEventListener("click", saveHorarios_);
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
  return `
    <label class="adminLabel">VIN<input id="fVin" type="text" value="${escHtml(r.vin || "")}" placeholder="17 caracteres" ${r.vin ? "readonly" : ""}></label>
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
  // focus first input
  setTimeout(() => $id("adminModalBody").querySelector("input,select,textarea")?.focus(), 80);
}

function closeModal() {
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

// ─── Public API ──────────────────────────────────────────────────────
export function init() {
  // Tabs
  document.addEventListener("click", e => {
    const tab = e.target.closest("[data-tab]");
    if (!tab || !tab.closest("#viewADMIN")) return;
    document.querySelectorAll(".adminTab").forEach(t => t.classList.toggle("active", t === tab));
    S.tab = tab.dataset.tab;
    $id("adminSearch").value = "";
    loadTab();
  });

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

export function enter() { CORE.state.currentModule = "ADMIN"; loadTab(); }
export function exit() {}