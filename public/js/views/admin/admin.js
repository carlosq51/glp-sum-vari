// =========================
// public/js/views/admin/admin.js
// Vista ADMIN – CRUD completo: Usuarios, VINs, OTs, Incidencias
// =========================
import { CORE, MODULES, createVinSuggest_, getEmail, postJSON } from "../../core/core.js";
import { requestNotifPermission, getNotifStatus } from "../../core/push-client.js";
import {
  supabaseGet,
  supabasePost,
  supabasePatch,
  supabaseDelete,
} from "../../core/supabase-client.js";
import { createScanner } from "../../core/qr-scanner.js";
import { icon } from "../../core/icons.js";
import { escapeHtml as escHtml } from "../../core/format.js";
import { renderInventarioTab } from "./inventario.js";

// ─── Scanners para QR en Admin ────────────────────────────────────────
const adminVinScanner_     = createScanner("adminVinQrReader");
const reasignarScanner_    = createScanner("reasignarQrReader");

// ─── VIN suggest para Reasignar (creado cuando se renderiza el tab) ───
let rSugWidget_ = null;

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
  usuarios:    { icon: "users",         label: "Usuarios",       desc: "Cuentas y permisos" },
  vins:        { icon: "car",           label: "VINs",           desc: "Vehículos registrados" },
  ots:         { icon: "clipboardList", label: "OTs",            desc: "Órdenes de trabajo" },
  incidencias: { icon: "alertTriangle", label: "Incidencias",    desc: "Registro de fallas" },
  inventario:  { icon: "box",           label: "Inventario",     desc: "Herramientas por técnico" },
  reasignar:   { icon: "refresh",       label: "Reasignar",      desc: "Cambiar técnico asignado" },
  config:      { icon: "settings",      label: "Configuración",  desc: "Parámetros del sistema" },
  notif:       { icon: "bell",          label: "Notificaciones", desc: "Prueba de push y vibración" },
};

// ─── Enums (mirror schema.sql) ───────────────────────────────────────
const ROLES        = ["TECNICO","SUPERVISOR","ADMIN","CALIDAD","MOVILIZADOR","RAMALERO"];
const ESPECIALIDADES = ["AMBOS","MOTOR","TANQUE"];
const TIPOS_OT     = ["CONVERSION","CALIDAD","RAMALERO"];
const ESTADOS_GEN  = ["PENDIENTE","EN PROCESO","TRABAJANDO","FINALIZADO"];
const SEVERIDADES  = ["LEVE","MODERADA","CRITICA"];

// ─── Helpers ─────────────────────────────────────────────────────────
function $id(id) { return document.getElementById(id); }

// fetch con la identidad del admin (x-user-email): los endpoints mutadores
// de /api/admin/* exigen rol ADMIN server-side (lib/authz.js).
function adminFetch_(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), "x-user-email": getEmail() || "" },
  });
}

function msg(text, isErr = false) {
  const el = $id("adminMsg");
  if (!el) return;
  el.textContent = text;
  el.style.color = isErr ? "var(--danger)" : "var(--muted)";
}

function opts(arr, selected = "") {
  return arr.map(v => `<option value="${v}"${v === selected ? " selected" : ""}>${v}</option>`).join("");
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
    return `<div class="adminEmpty">
      <span class="adminEmptyIcon" aria-hidden="true">${icon("inbox", 28)}</span>
      <div class="adminEmptyTitle">Sin resultados</div>
      <div class="small muted">${q ? "Prueba con otro término de búsqueda." : "Aún no hay registros en esta sección."}</div>
    </div>`;
  }

  const head = def.cols.map(c => `<th>${c}</th>`).join("");
  const body = filtered.map(r => {
    const cells = def.row(r).map(c => `<td>${c}</td>`).join("");
    const rowId = r.id ?? r.vin;
    return `<tr data-id="${escHtml(String(rowId))}">
      ${cells}
      <td class="adminActionsCell">
        <button class="adminBtnEdit adminRowBtn" data-id="${escHtml(String(rowId))}" title="Editar" aria-label="Editar">${icon("pencil", 15)}</button>
        <button class="adminBtnDel adminRowBtn adminRowBtn--danger" data-id="${escHtml(String(rowId))}" title="Eliminar" aria-label="Eliminar">${icon("trash", 15)}</button>
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
            <button class="adminBtnEdit adminRowBtn adminRowBtn--wide btnReasignarTecnico" data-asgid="${escHtml(a.id)}" title="Cambiar técnico">${icon("refresh", 14)} Cambiar</button>
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
          const resp = await adminFetch_(`/api/admin/asignaciones/${encodeURIComponent(id)}`, {
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

// ─── Panel de prueba de notificaciones ───────────────────────────────
// Flujo completo: permiso → suscripción Web Push → POST /api/push/test →
// lib/push.js → SW (sw-custom.js) → notificación nativa con vibración.

const NOTIF_PATTERNS = {
  doble:  { label: "Doble (estándar)",   pattern: [200, 100, 200] },
  corto:  { label: "Corto",              pattern: [200] },
  largo:  { label: "Largo",              pattern: [700] },
  triple: { label: "Triple fuerte",      pattern: [400, 150, 400, 150, 400] },
  sos:    { label: "SOS",                pattern: [100, 50, 100, 50, 100, 200, 300, 100, 300, 100, 300, 200, 100, 50, 100, 50, 100] },
};

async function refreshNotifEstado_() {
  const el = $id("notifEstado");
  if (!el) return;

  const st = await getNotifStatus();

  const badge = (ok, txtOk, txtBad) => ok
    ? `<span class="adminBadgeOk">✔ ${txtOk}</span>`
    : `<span class="adminBadgeDanger adminBadge">✖ ${txtBad}</span>`;

  el.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      ${badge(st.soporta, "Navegador compatible", "Navegador sin Web Push")}
      ${badge(st.permiso === "granted", "Permiso concedido", st.permiso === "denied" ? "Permiso BLOQUEADO (ajustes del navegador)" : "Permiso sin pedir")}
      ${badge(st.suscrito, "Dispositivo suscrito", "Sin suscripción en este dispositivo")}
      ${badge(st.vibra, "Vibración local disponible", "Sin API de vibración (iPhone: solo vibra la notificación)")}
    </div>`;
}

function notifPatternSel_() {
  const key = $id("notifPatron")?.value || "doble";
  return NOTIF_PATTERNS[key]?.pattern || NOTIF_PATTERNS.doble.pattern;
}

function renderNotifPanel_(wrap) {
  const email = String(getEmail?.() || "").trim().toLowerCase();
  const opts = Object.entries(NOTIF_PATTERNS)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");

  wrap.innerHTML = `
    <div class="adminConfigPanel">

      <div class="adminConfigSection">
        <h4 class="adminConfigTitle">1 · Este dispositivo</h4>
        <p class="small muted">
          Para recibir la notificación, este celular debe tener permiso y suscripción.
          Sesión: <strong>${escHtml(email || "sin email")}</strong>
        </p>
        <div id="notifEstado" class="small muted" style="margin:8px 0;">Comprobando…</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
          <button id="btnNotifActivar" type="button" class="adminBtnOk">
            ${icon("bell", 16)} Activar notificaciones aquí
          </button>
          <button id="btnNotifVibrar" type="button" class="adminBtnGhost">
            📳 Probar vibración local
          </button>
        </div>
      </div>

      <div class="adminConfigSection">
        <h4 class="adminConfigTitle">2 · Enviarme una notificación push</h4>
        <p class="small muted">
          Viaja por el servidor (Web Push) y llega como notificación nativa —
          funciona incluso con la app cerrada. Se envía a <strong>todos tus
          dispositivos suscritos</strong>.
        </p>
        <p class="small muted">
          💡 ¿Llega pero no suena/vibra? Quita el modo silencio y mantén
          presionada la notificación → ⚙ para subir la importancia del canal
          (en Android el canal manda sobre el patrón enviado).
        </p>
        <div style="display:flex;flex-direction:column;gap:10px;max-width:420px;">
          <input id="notifTitulo" type="text" class="adminInput" value="🔔 Prueba GLP" placeholder="Título">
          <input id="notifCuerpo" type="text" class="adminInput" value="¡Funciona! Notificación de prueba." placeholder="Mensaje">
          <label class="small muted" style="display:flex;align-items:center;gap:8px;">
            Vibración:
            <select id="notifPatron" class="adminInput" style="flex:1;">${opts}</select>
          </label>
          <label class="small muted" style="display:flex;align-items:center;gap:8px;">
            Retardo:
            <select id="notifRetardo" class="adminInput" style="flex:1;">
              <option value="0">Enviar ya</option>
              <option value="5000" selected>5 s — da tiempo a bloquear pantalla</option>
              <option value="10000">10 s — da tiempo a cerrar la app</option>
            </select>
          </label>
          <button id="btnNotifEnviar" type="button" class="adminBtnOk">
            🚀 Enviar a mis dispositivos
          </button>
          <div id="notifResultado" class="small muted" style="min-height:18px;"></div>
        </div>
      </div>

    </div>`;

  refreshNotifEstado_();

  $id("btnNotifActivar")?.addEventListener("click", async () => {
    const st = $id("notifResultado");
    if (st) st.textContent = "Pidiendo permiso y suscribiendo…";
    await requestNotifPermission(email, { force: true });
    await refreshNotifEstado_();
    if (st) st.textContent = window.Notification?.permission === "granted"
      ? "✅ Listo — este dispositivo quedó suscrito."
      : "⚠️ Permiso no concedido. Revisa los ajustes del navegador.";
  });

  $id("btnNotifVibrar")?.addEventListener("click", () => {
    const st = $id("notifResultado");
    if (!navigator.vibrate) {
      if (st) st.textContent = "⚠️ Este navegador no expone la API de vibración (iPhone/Safari). La vibración sí funciona al llegar la notificación push en Android.";
      return;
    }
    navigator.vibrate(notifPatternSel_());
    if (st) st.textContent = "📳 Vibración local disparada.";
  });

  $id("btnNotifEnviar")?.addEventListener("click", async () => {
    const st  = $id("notifResultado");
    const btn = $id("btnNotifEnviar");
    if (!email) { if (st) st.textContent = "❌ No hay email de sesión."; return; }
    if (btn) { btn.disabled = true; btn.textContent = "Enviando…"; }
    try {
      const j = await postJSON("/api/push/test", {
        email,
        title:   String($id("notifTitulo")?.value || "").trim(),
        body:    String($id("notifCuerpo")?.value || "").trim(),
        vibrate: notifPatternSel_(),
        delayMs: Number($id("notifRetardo")?.value) || 0,
      });
      if (!j?.ok) {
        if (st) st.textContent = `❌ ${j?.error || "Error del servidor"}`;
      } else if (j.scheduled) {
        // Cuenta regresiva para que el usuario bloquee la pantalla a tiempo
        let secs = Math.round(j.delayMs / 1000);
        const tick = () => {
          if (!$id("notifResultado")) return; // salió del panel
          if (secs > 0) {
            $id("notifResultado").textContent = `⏳ Llega en ${secs} s — ¡bloquea la pantalla o cierra la app!`;
            secs--;
            setTimeout(tick, 1000);
          } else {
            $id("notifResultado").textContent = "📱 Enviada — revisa la barra de notificaciones.";
          }
        };
        tick();
      } else if (j.sent > 0) {
        if (st) st.textContent = `✅ Enviada a ${j.sent} dispositivo${j.sent !== 1 ? "s" : ""}${j.failed ? ` (${j.failed} fallaron)` : ""}. Mira la barra de notificaciones 📱`;
      } else {
        if (st) st.textContent = "⚠️ 0 dispositivos suscritos para tu email — usa primero «Activar notificaciones aquí».";
      }
    } catch (e) {
      if (st) st.textContent = `❌ ${e?.message || e}`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "🚀 Enviar a mis dispositivos"; }
    }
  });
}

async function loadTab() {
  const wrap = $id("adminTableContent");
  if (!wrap) return;

  // ─── Tab Inventario ───────────────────────────────────────────────
  if (S.tab === "inventario") {
    $id("adminToolbar") && ($id("adminToolbar").style.display = "none");
    await renderInventarioTab(wrap);
    return;
  }

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
              <button id="btnReasignarQr" type="button" class="adminBtnGhost" title="Escanear QR" style="padding:6px 12px;">${icon("camera", 16)}</button>
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

    $id("btnReasignarBuscar")?.addEventListener("click", loadReasignarPanel_);
    rSugWidget_?.destroy();
    rSugWidget_ = createVinSuggest_({
      input: "reasignarVinInput",
      box:   "reasignarVinSuggest",
      min:   3,
      debounce: 220,
      onPick: item => {
        const inp = $id("reasignarVinInput");
        if (inp) inp.value = item.vin;
        loadReasignarPanel_();
      },
    });
    rSugWidget_.bind();
    $id("reasignarVinInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); loadReasignarPanel_(); }
    });
    $id("btnReasignarQr")?.addEventListener("click", async () => {
      try {
        await reasignarScanner_.start({
          mode: "QR",
          onDecoded: async code => {
            await reasignarScanner_.stop().catch(() => {});
            const inp = $id("reasignarVinInput");
            if (inp) inp.value = code;
            rSugWidget_?.hide();
            loadReasignarPanel_();
          },
        });
      } catch {}
    });
    return;
  }

  // ─── Tab Notificaciones (prueba de push + vibración) ───────────────
  if (S.tab === "notif") {
    $id("adminToolbar") && ($id("adminToolbar").style.display = "none");
    renderNotifPanel_(wrap);
    return;
  }

  // ─── Tab Configuración ─────────────────────────────────────────────
  if (S.tab === "config") {
    $id("adminToolbar") && ($id("adminToolbar").style.display = "none");
    wrap.innerHTML = `<div class="small muted" style="padding:12px;">Cargando configuración…</div>`;
    try {
      // /api/config = defaults + app_config ya mergeados (fuente única, lib/config.js).
      // Aquí NO hay fallbacks mágicos: lo que se muestra es lo que rige.
      const resp = await fetch("/api/config");
      const j = resp.ok ? await resp.json() : { ok: false };
      const cfg = j.config || {};
      const fechaCorte    = cfg.FECHA_CORTE_MOVILIZADOR || "";
      const pausaActiva   = cfg.PAUSA_GLOBAL_ACTIVA === "1";
      const comidaInicio  = cfg.HORARIO_COMIDA_INICIO;
      const comidaFin     = cfg.HORARIO_COMIDA_FIN;
      const descInicio    = cfg.HORARIO_DESCANSO_INICIO;
      const descFin       = cfg.HORARIO_DESCANSO_FIN;
      const metaDiaria    = String(cfg.META_DIARIA);
      const metaCal       = String(cfg.META_CALIDAD);
      const metaMensual   = String(cfg.META_MENSUAL);
      const metaCarrosTec = String(cfg.META_CARROS_TEC);
      // Despacho dirigido. Hasta ahora estas claves solo se podían tocar
      // entrando a Supabase a mano, que es justo lo que hay que evitar:
      // son los valores que se afinan mientras el taller está corriendo.
      const dspModo       = String(cfg.DESPACHO_MODO || "OFF").toUpperCase();
      const dspTurnoIni   = String(cfg.DESPACHO_TURNO_INICIO);
      const dspTurnoFin   = String(cfg.DESPACHO_TURNO_FIN);
      const dspIntervalo  = String(cfg.DESPACHO_INTERVALO_SEG);
      const dspQrVentana  = String(cfg.DESPACHO_QR_VENTANA_SEG);
      const dspTtlProp    = String(cfg.DESPACHO_TTL_PROPUESTA_MIN);
      const dspVarado     = String(cfg.DESPACHO_VARADO_MIN);
      const dspInicioMax  = String(cfg.DESPACHO_INICIO_MAX_MIN);
      const dspEsperaTope = String(cfg.DESPACHO_ESPERA_TOPE_MIN);
      const dspPesoEsp    = String(cfg.DESPACHO_PESO_ESPERA);
      const dspPesoComp   = String(cfg.DESPACHO_PESO_COMPATIBILIDAD);
      const dspPesoFam    = String(cfg.DESPACHO_PESO_FAMILIARIDAD);
      const dspPesoCerc   = String(cfg.DESPACHO_PESO_CERCANIA);

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
                <span class="adminHorarioLabel">${icon("utensils", 14)} Hora de comida</span>
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
                <span class="adminHorarioLabel">${icon("moon", 14)} Horario nocturno / descanso</span>
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

          <!-- OBJETIVOS -->
          <div class="adminConfigSection">
            <h4 class="adminConfigTitle">Objetivos de producci\u00f3n</h4>

            <p class="small muted" style="margin-bottom:10px;">
              <strong>Objetivo grupal diario</strong> — barras de progreso en el panel LIVE (supervisor).
            </p>
            <div class="adminHorarioGrid">
              <label class="adminLabel adminLabelInline">
                ${icon("wrench", 14)} Conversi\u00f3n / d\u00eda
                <input id="cfgMetaDiaria" type="number" min="1" max="500" value="${escHtml(metaDiaria)}" style="width:100px;">
              </label>
              <label class="adminLabel adminLabelInline">
                ${icon("shieldCheck", 14)} Calidad / d\u00eda
                <input id="cfgMetaCal" type="number" min="1" max="200" value="${escHtml(metaCal)}" style="width:100px;">
              </label>
            </div>

            <p class="small muted" style="margin:14px 0 8px;">
              <strong>Objetivo individual mensual</strong> — c\u00edrculo de progreso en &quot;Mi rendimiento&quot; de cada t\u00e9cnico.
            </p>
            <div class="adminHorarioGrid">
              <label class="adminLabel adminLabelInline">
                ${icon("chart", 14)} Conversiones / mes por t\u00e9cnico
                <input id="cfgMetaMensual" type="number" min="1" max="500" value="${escHtml(metaMensual)}" style="width:100px;">
              </label>
            </div>

            <p class="small muted" style="margin:14px 0 8px;">
              <strong>Carros completos por técnico / día</strong> — al llegar a esta meta el técnico
              queda <em>libre</em> en el panel LIVE y se sugiere emparejarlo con otro del mismo rol
              para sacar un carro entero más (½ para cada uno).
            </p>
            <div class="adminHorarioGrid">
              <label class="adminLabel adminLabelInline">
                ${icon("wrench", 14)} Carros / día por técnico
                <input id="cfgMetaCarrosTec" type="number" min="1" max="20" value="${escHtml(metaCarrosTec)}" style="width:100px;">
              </label>
            </div>

            <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
              <button id="btnSaveMetas" type="button" class="adminBtnOk">Guardar objetivos</button>
              <span id="cfgMetasMsg" class="small muted"></span>
            </div>
          </div>

          <!-- DESPACHO DIRIGIDO -->
          <div class="adminConfigSection">
            <h4 class="adminConfigTitle">${icon("zap", 15)} Despacho dirigido</h4>
            <p class="small muted">
              El motor que decide qué carro le toca a quién. Corre solo cada
              <em>intervalo</em>, pero únicamente dentro de la ventana de turno.
            </p>

            <p class="small muted" style="margin:14px 0 8px;">
              <strong>Modo</strong> —
              <b>Apagado</b>: no hace nada.
              <b>Sombra</b>: calcula y guarda propuestas que <em>nadie ve</em>, para auditar el criterio.
              <b>Real</b>: crea la OT y avisa al celular del técnico.
            </p>
            <div class="adminHorarioGrid">
              <label class="adminLabel adminLabelInline">
                ${icon("settings", 14)} Modo del motor
                <select id="cfgDspModo" style="width:150px;">
                  <option value="OFF"    ${dspModo === "OFF"    ? "selected" : ""}>Apagado</option>
                  <option value="SOMBRA" ${dspModo === "SOMBRA" ? "selected" : ""}>Sombra (no publica)</option>
                  <option value="REAL"   ${dspModo === "REAL"   ? "selected" : ""}>Real</option>
                </select>
              </label>
            </div>

            <p class="small muted" style="margin:14px 0 8px;">
              <strong>Ventana de turno</strong> — fuera de este rango el motor no reparte.
              El fin <em>puede ser menor que el inicio</em>: 07:00 → 01:00 significa que
              cruza la medianoche.
            </p>
            <div class="adminHorarioGrid">
              <div class="adminHorarioRow">
                <label class="adminLabel adminLabelInline">
                  Inicio
                  <input id="cfgDspTurnoIni" type="time" value="${escHtml(dspTurnoIni)}" style="width:120px;">
                </label>
                <label class="adminLabel adminLabelInline">
                  Fin
                  <input id="cfgDspTurnoFin" type="time" value="${escHtml(dspTurnoFin)}" style="width:120px;">
                </label>
              </div>
            </div>

            <p class="small muted" style="margin:14px 0 8px;">
              <strong>Reparto</strong> — el carro va a quien lleva más tiempo parado.
              El <em>tope de espera</em> es a partir de cuántos minutos esa prioridad ya
              está al máximo: más allá de eso, seguir esperando no suma.
            </p>
            <div class="adminHorarioGrid">
              <label class="adminLabel adminLabelInline">
                ${icon("clock", 14)} Tope de espera (min)
                <input id="cfgDspEsperaTope" type="number" min="1" max="240" value="${escHtml(dspEsperaTope)}" style="width:100px;">
              </label>
              <label class="adminLabel adminLabelInline">
                ${icon("zap", 14)} Intervalo del motor (seg)
                <input id="cfgDspIntervalo" type="number" min="15" max="900" value="${escHtml(dspIntervalo)}" style="width:100px;">
              </label>
            </div>

            <p class="small muted" style="margin:14px 0 8px;">
              <strong>Tiempos de control</strong> — vida del QR de asistencia, espera antes de
              expirar una propuesta sin confirmar, minutos en zona sin terminar que disparan
              alerta de varado, y margen para arrancar un carro asignado antes de devolverlo a la cola.
            </p>
            <div class="adminHorarioGrid">
              <label class="adminLabel adminLabelInline">
                QR asistencia (seg)
                <input id="cfgDspQrVentana" type="number" min="15" max="3600" value="${escHtml(dspQrVentana)}" style="width:100px;">
              </label>
              <label class="adminLabel adminLabelInline">
                Propuesta expira (min)
                <input id="cfgDspTtlProp" type="number" min="1" max="120" value="${escHtml(dspTtlProp)}" style="width:100px;">
              </label>
              <label class="adminLabel adminLabelInline">
                Alerta de varado (min)
                <input id="cfgDspVarado" type="number" min="10" max="1440" value="${escHtml(dspVarado)}" style="width:100px;">
              </label>
              <label class="adminLabel adminLabelInline">
                Margen para arrancar (min)
                <input id="cfgDspInicioMax" type="number" min="1" max="240" value="${escHtml(dspInicioMax)}" style="width:100px;">
              </label>
            </div>

            <p class="small muted" style="margin:14px 0 8px;">
              <strong>Importancia de cada criterio</strong> — <b>no</b> tienen que sumar 100:
              valen como proporción entre ellos. Subir uno baja el peso relativo del resto.
            </p>
            <div class="adminHorarioGrid">
              <label class="adminLabel adminLabelInline">
                ${icon("clock", 14)} Tiempo esperando
                <input id="cfgDspPesoEsp" type="number" min="0" max="100" value="${escHtml(dspPesoEsp)}" style="width:90px;">
              </label>
              <label class="adminLabel adminLabelInline">
                ${icon("users", 14)} Mismo ritmo que su pareja
                <input id="cfgDspPesoComp" type="number" min="0" max="100" value="${escHtml(dspPesoComp)}" style="width:90px;">
              </label>
              <label class="adminLabel adminLabelInline">
                ${icon("wrench", 14)} Rápido en ese modelo
                <input id="cfgDspPesoFam" type="number" min="0" max="100" value="${escHtml(dspPesoFam)}" style="width:90px;">
              </label>
              <label class="adminLabel adminLabelInline">
                ${icon("map", 14)} Cercanía a la zona
                <input id="cfgDspPesoCerc" type="number" min="0" max="100" value="${escHtml(dspPesoCerc)}" style="width:90px;">
              </label>
            </div>
            <p class="small muted" style="margin:8px 0 0;">
              Nota: la similitud de ritmo casi nunca baja de 0.5 aunque dos técnicos sean muy
              distintos, así que su recorrido real es la mitad que el de la espera. Para que el
              ritmo <em>mande</em> de verdad, súbelo bastante por encima de la espera.
            </p>

            <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
              <button id="btnSaveDespacho" type="button" class="adminBtnOk">Guardar despacho</button>
              <span id="cfgDespachoMsg" class="small muted"></span>
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
          <!-- NORMALIZACIÓN DE MODELOS -->
          <div class="adminConfigSection" style="border:1px solid rgba(251,191,36,.25);background:rgba(251,191,36,.04);border-radius:10px;padding:14px;">
            <h4 class="adminConfigTitle" style="color:var(--tone-amber);">${icon("tag", 15)} Normalización de modelos vehiculares</h4>
            <p class="small muted" style="margin-bottom:10px;">
              Convierte variantes de texto (<i>X70FL 1.5T 6DCT 4X2 LIMITED</i>, <i>X70 1,5T MEC...</i>) a nombres canónicos
              (<b>Jetour X70</b>, <b>KYC V3</b>, <b>KYC V5</b>, <b>KYC V7</b>, etc.) y los guarda en la columna <code>modelo_normalizado</code> de la tabla <code>vins</code>.
            </p>
            <div style="background:var(--codeBg);border:1px solid var(--codeLine);border-radius:6px;padding:10px 12px;font-family:var(--font-mono);font-size:var(--fs-xs);color:var(--note);margin-bottom:12px;line-height:1.7;">
              <div style="opacity:.5;margin-bottom:4px;">-- 1. Ejecuta esto UNA VEZ en Supabase Dashboard → SQL Editor:</div>
              ALTER TABLE vins ADD COLUMN IF NOT EXISTS modelo_normalizado text;<br>
              CREATE INDEX IF NOT EXISTS idx_vins_modelo_normalizado ON vins(modelo_normalizado);
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
              <button id="btnPreviewNorm" type="button" class="adminBtnOk" style="background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);">${icon("eye", 14)} Vista previa</button>
              <button id="btnNormalizarVins" type="button" class="adminBtnOk" style="background:rgba(251,191,36,.2);border:1px solid rgba(251,191,36,.5);color:var(--tone-amber);font-weight:var(--fw-bold);">${icon("zap", 14)} Normalizar todos los VINs</button>
              <span id="normMsg" class="small muted"></span>
            </div>
            <div id="normResult" style="margin-top:10px;"></div>
          </div>

          <!-- MODELO VIN (IA) -->
          <div class="adminConfigSection">
            <h4 class="adminConfigTitle">${icon("bot", 15)} Inferencia de modelo vehicular</h4>
            <p class="small muted">
              Entrena los modelos con datos históricos de la base de datos. El modelo de <b>emparejamiento</b> usa ~90 días de conversiones para calcular features por técnico (tasa diaria, hora pico, velocidad, consistencia) y recomienda el mejor compañero de especialidad opuesta.
            </p>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <button id="btnTrainVinModel" type="button" class="adminBtnOk">${icon("bot", 14)} Entrenar modelo VIN</button>
              <button id="btnTrainPairing" type="button" class="adminBtnOk" style="background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.4);">${icon("users", 14)} Entrenar emparejamiento</button>
              <button id="btnViewPairing" type="button" class="adminBtnOk" style="background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.35);">${icon("chart", 14)} Ver pairings</button>
              <button id="btnInferVins" type="button" class="adminBtnOk" style="background:var(--glass);border:1px solid var(--surfaceLine);">Ver VINs sin modelo</button>
              <span id="mlMsg" class="small muted"></span>
            </div>
            <div id="mlResult" style="margin-top:12px;"></div>
          </div>

        </div>
      `;

      // --- eventos ---

      // Vista previa normalización
      $id("btnPreviewNorm")?.addEventListener("click", async () => {
        const msg = $id("normMsg");
        const res = $id("normResult");
        msg.textContent = "Cargando…";
        res.innerHTML = "";
        try {
          const r = await fetch("/api/admin/preview-normalizacion");
          const j = await r.json();
          if (!j?.ok) { msg.textContent = `⚠️ ${j?.error}`; return; }
          msg.textContent = `${j.total} VINs analizados`;
          const rows = Object.entries(j.byNorm).sort((a, b) => b[1].count - a[1].count);
          res.innerHTML = `
            <div class="adminTable" style="margin-top:8px;font-size:var(--fs-xs);">
              <div style="display:grid;grid-template-columns:140px 1fr auto;gap:6px;padding:5px 10px;font-weight:var(--fw-extrabold);opacity:.6;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--surfaceLine);">
                <span>Canónico</span><span>Ejemplos de raw</span><span>Cant.</span>
              </div>
              ${rows.map(([norm, d]) => `
                <div style="display:grid;grid-template-columns:140px 1fr auto;gap:6px;padding:6px 10px;border-bottom:1px solid var(--surfaceLine);align-items:center;">
                  <span style="font-weight:var(--fw-bold);color:${norm.startsWith("⚠")?"#fbbf24":"var(--fg)"};">${escHtml(norm)}</span>
                  <span style="color:var(--muted);">${d.examples.map(e => escHtml(e)).join(" · ")}</span>
                  <span style="font-weight:var(--fw-black);">${d.count}</span>
                </div>`).join("")}
            </div>`;
        } catch (e) { msg.textContent = `Error: ${e.message}`; }
      });

      // Normalizar VINs
      $id("btnNormalizarVins")?.addEventListener("click", async () => {
        const msg = $id("normMsg");
        const res = $id("normResult");
        msg.textContent = "Normalizando…";
        res.innerHTML = "";
        try {
          const r = await adminFetch_("/api/admin/normalizar-vins", { method: "POST" });
          const j = await r.json();
          if (j.need_migration) {
            msg.textContent = "⚠️ Primero ejecuta el SQL de migración arriba en Supabase Dashboard.";
            return;
          }
          if (!j?.ok) { msg.textContent = `⚠️ ${j?.error}`; return; }
          const entries = Object.entries(j.byNorm || {}).sort((a, b) => b[1] - a[1]);
          msg.textContent = `✅ ${j.updated} actualizados · ${j.skipped} sin mapeo · ${j.failed} errores`;
          res.innerHTML = entries.length ? `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
              ${entries.map(([n, c]) => `
                <span style="padding:3px 10px;border-radius:14px;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);font-size:var(--fs-xs);font-weight:var(--fw-bold);">
                  ${escHtml(n)} <span style="opacity:.6;">${c}</span>
                </span>`).join("")}
            </div>` : "";
        } catch (e) { msg.textContent = `Error: ${e.message}`; }
      });

      $id("btnSaveConfig")?.addEventListener("click", saveConfig_);
      $id("btnSaveHorarios")?.addEventListener("click", saveHorarios_);
      $id("btnSaveMetas")?.addEventListener("click", saveMetas_);
      $id("btnSaveDespacho")?.addEventListener("click", saveDespacho_);

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

      $id("btnViewPairing")?.addEventListener("click", async () => {
        const res = $id("mlResult");
        const msg = $id("mlMsg");
        msg.textContent = "Cargando pairings…";
        res.innerHTML = `<div class="small muted">Cargando…</div>`;
        try {
          const r = await fetch("/api/ml/pairing-overview");
          const j = await r.json();
          if (!j?.ok) { res.innerHTML = `<div class="small" style="color:var(--danger);">${escHtml(j?.error||"Error")}</div>`; msg.textContent=""; return; }
          const ageDays  = Math.floor((Date.now() - new Date(j.trained_at).getTime()) / 86400000);
          const ageLabel = ageDays === 0 ? "hoy" : `${ageDays}d`;
          const ageColor = ageDays > 14 ? "#f87171" : ageDays > 7 ? "#fbbf24" : "#4ade80";
          const nextRetrain = j.next_auto_retrain
            ? ` · próximo auto-retrain: <b>${new Date(j.next_auto_retrain).toLocaleString("es-PE")}</b>`
            : "";
          msg.innerHTML  = `Entrenado: ${new Date(j.trained_at).toLocaleString("es-PE")} · <span style="color:${ageColor};font-weight:var(--fw-bold);">antigüedad: ${ageLabel}</span> · ${j.total_techs} técnicos${nextRetrain}`;

          const fmtFeat  = f => f ? `${(f.dailyRate||0).toFixed(1)} conv./día · pico ${f.peakHour||0}:00h` : "—";
          const simColor = sim => sim >= 75 ? "#4ade80" : sim >= 50 ? "#fbbf24" : "#f87171";
          // Heatmap: degradado suave HSL rojo→verde según similitud
          const heatBg   = sim => `hsla(${Math.round(sim * 1.2)},65%,45%,${(0.08 + sim / 250).toFixed(2)})`;
          const trendIcon = (trend, pct) =>
            trend === "up"   ? `<span style="color:#4ade80;font-size:.72em;margin-left:3px;">↑${Math.abs(pct||0)}%</span>` :
            trend === "down" ? `<span style="color:#f87171;font-size:.72em;margin-left:3px;">↓${Math.abs(pct||0)}%</span>` : "";

          const renderPairTable = (motorPairs, tanquesArr, matrixArr, motorsArr) => `
            <div class="adminTable">
              <div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:6px;padding:6px 10px;font-weight:var(--fw-extrabold);opacity:.6;font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--surfaceLine);">
                <span>MOTOR</span><span>Mejor compañero TANQUE</span><span>Afinidad</span><span>Ritmo TANQUE</span>
              </div>
              ${motorPairs.map(p => `
                <div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:6px;padding:8px 10px;border-bottom:1px solid var(--surfaceLine);align-items:center;">
                  <div>
                    <div style="font-weight:var(--fw-bold);font-size:var(--fs-sm);">${escHtml(p.motor.nombre||"—")}${trendIcon(p.motor.trend, p.motor.trendPct)}</div>
                    <div class="small muted">${escHtml(fmtFeat(p.motor.features))}${p.motor.samples ? ` · ${p.motor.samples} asig.` : ""}</div>
                  </div>
                  <div>
                    <div style="font-weight:var(--fw-bold);font-size:var(--fs-sm);">${p.best ? escHtml(p.best.nombre)+trendIcon(p.best.trend, p.best.trendPct) : '<span style="color:var(--muted)">Sin datos</span>'}</div>
                    ${p.all?.length > 1 ? `<div class="small muted">${p.all.slice(1).map(t => escHtml(t.nombre)+" "+t.sim+"%").join(", ")}</div>` : ""}
                  </div>
                  <div style="font-weight:var(--fw-black);font-size:1.1rem;color:${simColor(p.best?.sim||0)};">${p.best?.sim ?? "—"}%</div>
                  <div class="small muted">${escHtml(fmtFeat(p.best?.features))}</div>
                </div>`).join("")}
            </div>
            ${tanquesArr?.length ? `
            <div style="font-weight:var(--fw-extrabold);font-size:var(--fs-sm);margin:14px 0 8px;">Matriz de similitud (heatmap)</div>
            <div style="overflow-x:auto;">
              <table style="border-collapse:collapse;font-size:var(--fs-xs);min-width:100%;">
                <tr>
                  <th style="padding:6px 10px;text-align:left;border-bottom:1px solid var(--surfaceLine);opacity:.6;">MOTOR \\ TANQUE</th>
                  ${tanquesArr.map(t => `<th style="padding:6px 8px;text-align:center;border-bottom:1px solid var(--surfaceLine);white-space:nowrap;">${escHtml(t.nombre)}</th>`).join("")}
                </tr>
                ${motorsArr.map((m, mi) => `
                  <tr>
                    <td style="padding:6px 10px;font-weight:var(--fw-bold);white-space:nowrap;">${escHtml(m.nombre)}</td>
                    ${tanquesArr.map((t, ti) => {
                      const sim = matrixArr[mi][ti];
                      return `<td title="${escHtml(m.nombre)} + ${escHtml(t.nombre)}: ${sim}%" style="padding:6px 8px;text-align:center;font-weight:var(--fw-black);background:${heatBg(sim)};color:${simColor(sim)};min-width:48px;">${sim}%</td>`;
                    }).join("")}
                  </tr>`).join("")}
              </table>
            </div>` : ""}
          `;

          const modelList = Object.keys(j.byModel || {}).sort();

          res.innerHTML = `
            <div style="margin-top:12px;">

              <!-- ── Sección Global ── -->
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                <span style="font-weight:var(--fw-extrabold);font-size:var(--fs-sm);">Resultado global</span>
                <span class="small muted">(todos los vehículos combinados)</span>
              </div>
              ${renderPairTable(j.motorPairs, j.tanques, j.matrix, j.motors)}

              <!-- ── Sección Por Modelo ── -->
              ${modelList.length ? `
              <div style="margin-top:22px;padding-top:16px;border-top:1px solid var(--surfaceLine);">
                <div style="font-weight:var(--fw-extrabold);font-size:var(--fs-sm);margin-bottom:10px;">Resultado por modelo de vehículo</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;" id="pairingModelPills">
                  ${modelList.map((m, i) => `
                    <button type="button"
                      data-pmodel="${escHtml(m)}"
                      class="pairingModelPill"
                      style="padding:5px 12px;border-radius:20px;font-size:var(--fs-xs);font-weight:var(--fw-bold);cursor:pointer;border:1px solid var(--surfaceLine);background:${i===0?"rgba(167,139,250,.25);border-color:rgba(167,139,250,.6);color:#c4b5fd":"var(--glass);color:var(--muted)"};transition:all .15s;">
                      ${escHtml(m)} <span style="opacity:.6;font-weight:normal;">${j.byModel[m].motorPairs?.length||0}M · ${j.byModel[m].tanques?.length||0}T</span>
                    </button>`).join("")}
                </div>
                <div id="pairingModelContent">
                  ${modelList.length ? renderPairTable(
                      j.byModel[modelList[0]].motorPairs,
                      j.byModel[modelList[0]].tanques,
                      j.byModel[modelList[0]].matrix,
                      j.byModel[modelList[0]].motors
                    ) : ""}
                </div>
              </div>` : `<div class="small muted" style="margin-top:12px;">Sin datos por modelo (requiere re-entrenar con asignaciones que tengan modelo asignado).</div>`}
            </div>
          `;

          // Activar pills de modelos
          if (modelList.length) {
            const pairingData = j.byModel;
            document.querySelectorAll(".pairingModelPill").forEach(pill => {
              pill.addEventListener("click", () => {
                document.querySelectorAll(".pairingModelPill").forEach(p => {
                  p.style.background = "var(--glass)";
                  p.style.borderColor = "var(--surfaceLine)";
                  p.style.color = "var(--muted)";
                });
                pill.style.background = "rgba(167,139,250,.25)";
                pill.style.borderColor = "rgba(167,139,250,.6)";
                pill.style.color = "#c4b5fd";
                const modelo = pill.dataset.pmodel;
                const md = pairingData[modelo];
                const content = $id("pairingModelContent");
                if (content && md) {
                  content.innerHTML = renderPairTable(md.motorPairs, md.tanques, md.matrix, md.motors);
                }
              });
            });
          }

        } catch (e) { res.innerHTML = `<div class="small" style="color:var(--danger);">Error: ${e.message}</div>`; msg.textContent=""; }
      });

      $id("btnTrainPairing")?.addEventListener("click", async () => {
        const msg = $id("mlMsg");
        const res = $id("mlResult");
        msg.textContent = "Entrenando modelo de emparejamiento…";
        res.innerHTML = "";
        try {
          const r = await fetch("/api/ml/train-pairing", { method: "POST" });
          const j = await r.json();
          if (j.ok) {
            msg.textContent = `✅ Emparejamiento entrenado: ${j.total_techs} técnicos (${j.motor} MOTOR · ${j.tanque} TANQUE)`;
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
    const resp = await adminFetch_("/api/admin/config", {
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
  const diaria  = String(Number($id("cfgMetaDiaria")?.value) || 25);
  const mensual = String(Number($id("cfgMetaMensual")?.value) || 60);
  const cal   = String(Number($id("cfgMetaCal")?.value)  || 22);
  const carrosTec = String(Number($id("cfgMetaCarrosTec")?.value) || 2);
  if (btn) btn.disabled = true;
  if (msgEl) msgEl.textContent = "Guardando\u2026";
  try {
    const resp = await adminFetch_("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configs: [
        { key: "META_DIARIA",  value: diaria },
        { key: "META_MENSUAL", value: mensual },
        { key: "META_CALIDAD",    value: cal  },
        { key: "META_CARROS_TEC", value: carrosTec },
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

/**
 * Guarda la config del despacho dirigido.
 *
 * Los `||` de abajo NO son valores mágicos: son el mismo default que declara
 * lib/config.js, repetido aquí solo para que un campo borrado no mande "" a
 * app_config (una cadena vacía sí sobreescribe el default en el servidor).
 */
async function saveDespacho_() {
  const btn   = $id("btnSaveDespacho");
  const msgEl = $id("cfgDespachoMsg");

  const modo      = $id("cfgDspModo")?.value || "OFF";
  const turnoIni  = $id("cfgDspTurnoIni")?.value?.trim() || "07:00";
  const turnoFin  = $id("cfgDspTurnoFin")?.value?.trim() || "01:00";
  const esperaTop = String(Number($id("cfgDspEsperaTope")?.value) || 30);
  const intervalo = String(Number($id("cfgDspIntervalo")?.value)  || 60);
  const qrVentana = String(Number($id("cfgDspQrVentana")?.value)  || 300);
  const ttlProp   = String(Number($id("cfgDspTtlProp")?.value)    || 10);
  const varado    = String(Number($id("cfgDspVarado")?.value)     || 240);
  const inicioMax = String(Number($id("cfgDspInicioMax")?.value)  || 20);

  // Los pesos SÍ admiten 0 (apagar un criterio), así que aquí no vale `|| n`:
  // convertiría un 0 legítimo en el default.
  const num0 = (id, def) => {
    const v = Number($id(id)?.value);
    return String(Number.isFinite(v) && v >= 0 ? v : def);
  };
  const pesoEsp  = num0("cfgDspPesoEsp",  30);
  const pesoComp = num0("cfgDspPesoComp", 30);
  const pesoFam  = num0("cfgDspPesoFam",  25);
  const pesoCerc = num0("cfgDspPesoCerc", 15);

  if ([pesoEsp, pesoComp, pesoFam, pesoCerc].every(v => Number(v) === 0)) {
    if (msgEl) {
      msgEl.textContent = "Al menos un criterio tiene que pesar más que cero.";
      msgEl.style.color = "var(--danger)";
    }
    return;
  }

  if (turnoIni === turnoFin) {
    if (msgEl) {
      msgEl.textContent = "Inicio y fin de turno no pueden ser iguales.";
      msgEl.style.color = "var(--danger)";
    }
    return;
  }

  if (btn) btn.disabled = true;
  if (msgEl) { msgEl.textContent = "Guardando…"; msgEl.style.color = ""; }
  try {
    const resp = await adminFetch_("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configs: [
        { key: "DESPACHO_MODO",             value: modo },
        { key: "DESPACHO_TURNO_INICIO",     value: turnoIni },
        { key: "DESPACHO_TURNO_FIN",        value: turnoFin },
        { key: "DESPACHO_ESPERA_TOPE_MIN",  value: esperaTop },
        { key: "DESPACHO_INTERVALO_SEG",    value: intervalo },
        { key: "DESPACHO_QR_VENTANA_SEG",   value: qrVentana },
        { key: "DESPACHO_TTL_PROPUESTA_MIN", value: ttlProp },
        { key: "DESPACHO_VARADO_MIN",       value: varado },
        { key: "DESPACHO_INICIO_MAX_MIN",   value: inicioMax },
        { key: "DESPACHO_PESO_ESPERA",         value: pesoEsp },
        { key: "DESPACHO_PESO_COMPATIBILIDAD", value: pesoComp },
        { key: "DESPACHO_PESO_FAMILIARIDAD",   value: pesoFam },
        { key: "DESPACHO_PESO_CERCANIA",       value: pesoCerc },
      ]}),
    });
    const j = await resp.json();
    if (!j?.ok) throw new Error(j?.error || "Error");
    if (msgEl) {
      msgEl.textContent = modo === "REAL"
        ? "✔ Guardado — el motor reparte en la próxima corrida"
        : "✔ Guardado";
      msgEl.style.color = "var(--ok)";
    }
    try { localStorage.removeItem("glp_app_config_cache"); } catch {}
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
    const resp = await adminFetch_("/api/admin/config", {
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
    const resp = await adminFetch_("/api/admin/pausa-masiva", {
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
  // Las OTs tienen registros hijos (asignaciones, eventos, incidencias,
  // solicitudes de ramal) que hay que borrar antes por las FKs.
  if (S.tab === "ots") return deleteOtCascade_(id);

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

// ─── Eliminar OT + todo lo relacionado (cascade manual) ──────────────
// No hay ON DELETE CASCADE en el schema, así que borramos en orden:
// primero los hijos que referencian work_order_id, luego la OT.
async function deleteOtCascade_(workOrderId) {
  const ok1 = confirm(
    "¿ELIMINAR esta OT y TODO lo relacionado?\n\n" +
    "Se borrarán de forma permanente:\n" +
    "• La orden de trabajo\n" +
    "• Sus asignaciones\n" +
    "• Sus eventos (marcas de tiempo)\n" +
    "• Sus incidencias\n" +
    "• Sus solicitudes de ramal\n\n" +
    "Esta acción NO se puede deshacer."
  );
  if (!ok1) return;

  // Doble confirmación por ser una acción destructiva.
  const ok2 = confirm("Confirma de nuevo: la eliminación es DEFINITIVA. ¿Continuar?");
  if (!ok2) return;

  msg("Eliminando OT y registros relacionados…");
  try {
    // Hijos primero (respetando las FKs hacia work_orders.id)
    await supabaseDelete("eventos",          { work_order_id: workOrderId });
    await supabaseDelete("asignaciones",      { work_order_id: workOrderId });
    await supabaseDelete("incidencias",       { work_order_id: workOrderId });
    await supabaseDelete("solicitudes_ramal", { work_order_id: workOrderId });
    // Finalmente la OT
    await supabaseDelete("work_orders",       { id: workOrderId });
    msg("OT y registros relacionados eliminados.");
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
      <span class="hubCardIcon" aria-hidden="true">${icon(meta.icon, 22)}</span>
      <div class="hubCardText">
        <div class="hubCardName">${meta.label}</div>
        <div class="hubCardDesc">${meta.desc}</div>
      </div>
      <span class="hubCardArrow" aria-hidden="true">${icon("chevronRight", 18)}</span>
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
  const iconEl = $id("adminDetailIcon");
  if (iconEl) {
    iconEl.innerHTML = icon(meta.icon || "box", 18);
    iconEl.dataset.section = tab;
  }
  const titleEl = $id("adminDetailTitle");
  if (titleEl) titleEl.textContent = meta.label || tab;
  const subEl = $id("adminDetailSub");
  if (subEl) subEl.textContent = meta.desc || "";
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