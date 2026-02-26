// =========================
// public/js/views/conversion/conversion.js
// Vista CONVERSION = TECNICO + CALIDAD
// - sync + estado vin/rol + eventos vin
// - vin autocomplete
// - QR WORK_VIN
// - delegación cards
// (RAMALERO va a su archivo)
// =========================
/* global Html5Qrcode, Html5QrcodeSupportedFormats */

import { initIncidenciasUI_, openIncidenciaModalForKey_ } from "./incidencias.js";

import { showUploaderView } from "../uploader/uploader.js";

import { initConformidadUI_, openConformidadModalForKey_ } from "./conformidad.js";

import {
  CORE, $, el_, ctx_, isWorkModule_, getEmail, getVin,
  getRolTrabajoCurrent_, getRolTecnico_, requireEmailOrStop,
  setOut, setEstadoText, withLock, getJSON, postJSON, getJSON_user, postJSON_user,
  escapeHtml, msToHMS_, cssEsc_, fmtFechaCreacion_,
  keyOfItem_, vinCacheGet_, vinCacheSet_, ramalCacheGet_, ramalCacheSet_, openRegistroFallas_,
  enforceRolLock_,
} from "../../core/core.js";

import {
  renderActivas_, renderFinalizados_, patchVisibleCards_,
  rebuildListsFromStore_, snapshotNotasActivas_, restoreNotasActivas_,
  computeLiveMs_, allowedActionsByEstado
} from "../../core/render-work.js";

import { startLoopsFor_, stopLoopsFor_, clearModuleUI_ } from "../../core/loops.js";

// --------------------------
// NORMALIZE / MERGE (igual que tu versión)
// --------------------------
function mergePrevAndCache_(it, prev) {
  if ((!it.vin || it.vin === "") && prev?.vin) it.vin = prev.vin;
  if (!it.vin && it.conversionId && it.rolTrabajo) {
    const cached = vinCacheGet_(it.conversionId, it.rolTrabajo);
    if (cached) it.vin = cached;
  }

  if (it.rolTrabajo === "RAMALERO") {
    if ((!it.tipoRamal || it.tipoRamal === "") && prev?.tipoRamal) it.tipoRamal = prev.tipoRamal;
    if (!it.tipoRamal && it.conversionId) {
      const cachedTipo = ramalCacheGet_(it.conversionId);
      if (cachedTipo) it.tipoRamal = cachedTipo;
    }
  }

  if (prev) {
    if (!it.updated_at) it.updated_at = prev.updated_at || null;
    if (!it.last_nota_ts) it.last_nota_ts = prev.last_nota_ts || null;
    if (!it.created_at) it.created_at = prev.created_at || null;
  }
  return it;
}

function normalizeItem_(raw) {
  const pickFirst_ = (...xs) => {
    for (const x of xs) {
      if (x !== undefined && x !== null && String(x).trim() !== "") return x;
    }
    return "";
  };

  const it = {
    conversionId: String(pickFirst_(raw?.conversionId, raw?.conversion_id, raw?.CONVERSION_ID, raw?.ID, raw?.id)).trim(),
    vin: String(pickFirst_(raw?.vin, raw?.VIN)).trim().toUpperCase(),
    tipoRamal: String(pickFirst_(raw?.tipoRamal, raw?.tipo_ramal, raw?.tipo, raw?.TIPO_RAMAL, raw?.TIPO)).trim(),
    created_at: raw?.fecha_asignacion ?? raw?.FECHA_ASIGNACION ?? raw?.fecha_inicio ?? raw?.inicio_at ?? raw?.FECHA_INICIO ??
               raw?.created_at ?? raw?.fecha_creacion ?? raw?.FECHA_CREACION ?? null,

    rolTrabajo: String(pickFirst_(raw?.rolTrabajo, raw?.rol_trabajo, raw?.rol, raw?.ROL_TRABAJO, raw?.ROL)).trim().toUpperCase(),
    estado: String(pickFirst_(raw?.estado, raw?.estado_actual, raw?.estadoActual, raw?.ESTADO_ACTUAL, raw?.ESTADO)).trim().toUpperCase(),

    tiempo_ms: Number(pickFirst_(raw?.tiempo_ms, raw?.tiempoMs, raw?.TIEMPO_TRAB_MS, raw?.TIEMPO_MS, 0)) || 0,
    running_since: raw?.running_since ?? raw?.RUNNING_SINCE ?? null,

    last_nota: String(pickFirst_(raw?.last_nota, raw?.LAST_NOTA, "")),
    last_nota_ts: raw?.last_nota_ts ?? raw?.LAST_NOTA_TS ?? null,
    updated_at: raw?.updated_at ?? raw?.UPDATED_AT ?? null,

    tanque_asignado: String(pickFirst_(raw?.tanque_asignado, raw?.tanqueAsignado, raw?.TANQUE_ASIGNADO, "")).trim(),
    reductor_asignado: String(pickFirst_(raw?.reductor_asignado, raw?.reductorAsignado, raw?.REDUCTOR_ASIGNADO, "")).trim(),

    tanque_registrado: String(pickFirst_(raw?.tanque_registrado, raw?.tanqueRegistrado, raw?.TANQUE_REGISTRADO, "")).trim(),
    reductor_registrado: String(pickFirst_(raw?.reductor_registrado, raw?.reductorRegistrado, raw?.REDUCTOR_REGISTRADO, "")).trim(),

    inc_leve: Number(pickFirst_(raw?.inc_leve, raw?.INC_LEVE, 0)) || 0,
    inc_moderada: Number(pickFirst_(raw?.inc_moderada, raw?.INC_MODERADA, 0)) || 0,
    inc_critica: Number(pickFirst_(raw?.inc_critica, raw?.INC_CRITICA, 0)) || 0,
  };

  if (!it.rolTrabajo) {
    if (it.tipoRamal) it.rolTrabajo = "RAMALERO";
    else if (CORE.state.currentModule === "CALIDAD") it.rolTrabajo = "CALIDAD";
    else it.rolTrabajo = String(getRolTecnico_() || "MOTOR").toUpperCase();
  }
  if (!it.estado) it.estado = "SIN_INICIAR";

  if (it.conversionId && it.rolTrabajo && it.vin) vinCacheSet_(it.conversionId, it.rolTrabajo, it.vin);
  if (it.conversionId && it.rolTrabajo === "RAMALERO" && it.tipoRamal) ramalCacheSet_(it.conversionId, it.tipoRamal);

  return it;
}

// --------------------------
// SYNC
// --------------------------
async function apiSync_(email, since) {
  try {
    const body = { email, since };
    const j = await postJSON("/api/sync", body);
    if (j && j.ok) return { mode: "sync", data: j };
  } catch {}
  const j2 = await getJSON(`/api/mis-activas?email=${encodeURIComponent(email)}`);
  return { mode: "legacy", data: j2 };
}

function applySyncResultToStore_(syncData) {
  const c = ctx_();
  const items = Array.isArray(syncData?.items) ? syncData.items : [];
  for (const raw of items) {
    const it = normalizeItem_(raw);
    const k = keyOfItem_(it);
    const prev = c.itemsByKey.get(k);
    mergePrevAndCache_(it, prev);
    c.itemsByKey.set(k, it);
  }
}

function storeFullReplace_(allItems) {
  const c = ctx_();
  c.itemsByKey.clear();
  const arr = Array.isArray(allItems) ? allItems : [];
  for (const raw of arr) {
    const it = normalizeItem_(raw);
    const k = keyOfItem_(it);
    mergePrevAndCache_(it, null);
    c.itemsByKey.set(k, it);
  }
}

function detectIfNeedsFullRerender_(prevActiveKeys, prevFinalKeys) {
  const c = ctx_();
  return (prevActiveKeys.join(",") !== c.activeKeys.join(",") || prevFinalKeys.join(",") !== c.finalKeys.join(","));
}

export async function syncNow({ forceFull = false, showOut = false } = {}) {
  if (CORE.state.uiLocked) return;
  if (!isWorkModule_()) return;

  let email;
  try { email = requireEmailOrStop(); }
  catch { return; }

  const c = ctx_();
  const prevA = c.activeKeys.slice();
  const prevF = c.finalKeys.slice();
  const snapNotas = snapshotNotasActivas_();

  const since = forceFull ? null : c.lastSyncSince;
  const res = await apiSync_(email, since);
  const j = res.data;

  if (showOut) setOut(j);
  if (!j || !j.ok) return;

  if (res.mode === "legacy") {
    storeFullReplace_(j.items || []);
    c.lastSyncSince = new Date().toISOString();
    c.lastSyncRev = null;
  } else {
    if (j.full) storeFullReplace_(j.items || []);
    else applySyncResultToStore_(j);

    c.lastSyncSince = j.server_time || new Date().toISOString();
    c.lastSyncRev = j.rev || c.lastSyncRev;
  }

  rebuildListsFromStore_();

  const needsFull = detectIfNeedsFullRerender_(prevA, prevF);
  if (needsFull) {
    renderActivas_();
    renderFinalizados_();
    restoreNotasActivas_(snapNotas);
  } else {
    patchVisibleCards_();
  }

  c.lastSyncAtMs = Date.now();
  enforceRolLock_();

  // auto-start básico
  if (CORE.state.currentModule === "CALIDAD") {
    const first = c.activeKeys.map((k) => c.itemsByKey.get(k)).find((it) => it && it.rolTrabajo === "CALIDAD" && it.estado === "SIN_INICIAR");
    if (first?.vin) autoStartFromScan_(first.vin, "CALIDAD").catch(() => {});
  }
  if (CORE.state.currentModule === "TECNICO") {
    const vinInput = getVin();
    let vinCandidato = vinInput;
    if (!vinCandidato) {
      const first = c.activeKeys.map((k) => c.itemsByKey.get(k)).find((it) => it && (it.rolTrabajo === "MOTOR" || it.rolTrabajo === "TANQUE") && it.estado === "SIN_INICIAR" && String(it.vin || "").trim());
      vinCandidato = String(first?.vin || "").trim().toUpperCase();
    }
    if (vinCandidato) autoStartFromScan_(vinCandidato, getRolTrabajoCurrent_()).catch(() => {});
  }
}

// --------------------------
// ESTADO VIN/ROL
// --------------------------
export async function refreshEstadoForVinRole({ showOut = false } = {}) {
  if (CORE.state.uiLocked) return;
  if (!isWorkModule_()) return;

  let email;
  try { email = requireEmailOrStop(); }
  catch { return; }

  if (!(CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD")) return;

  const vin = getVin();
  const rolTrabajo = getRolTrabajoCurrent_();
  if (!vin) { setEstadoText(""); return; }

  const c = ctx_();
  const v = vin.toUpperCase();
  for (const it of c.itemsByKey.values()) {
    if (String(it.vin || "").toUpperCase() === v && String(it.rolTrabajo || "").toUpperCase() === rolTrabajo) {
      setEstadoText(`Estado: ${it.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it))}`);
      return;
    }
  }

  const j = await getJSON(`/api/estado?email=${encodeURIComponent(email)}&vin=${encodeURIComponent(vin)}&rolTrabajo=${encodeURIComponent(rolTrabajo)}`);
  if (showOut) setOut(j);
  if (!j?.ok) { setEstadoText(j?.error || "Error"); return; }

  const it2 = normalizeItem_(j);
  const k2 = keyOfItem_(it2);
  c.itemsByKey.set(k2, it2);

  rebuildListsFromStore_();
  renderActivas_();
  renderFinalizados_();

  setEstadoText(`Estado: ${it2.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it2))}`);
}

let estadoDebounceTimer_ = null;
function scheduleEstadoRefresh_(ms = 500) {
  if (!(CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD")) return;
  clearTimeout(estadoDebounceTimer_);
  estadoDebounceTimer_ = setTimeout(() => refreshEstadoForVinRole({ showOut: false }).catch(() => {}), ms);
}

// --------------------------
// EVENTO (TECNICO/CALIDAD)
// --------------------------
export async function enviarEvento(accionOverride, opts = {}) {
  if (!(CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD")) return;

  let email;
  try { email = requireEmailOrStop(); }
  catch { return; }

  const accion = String(accionOverride || $("accion")?.value || "").toUpperCase();
  let nota = "";
  if (accion === "NOTA") {
    nota = String($("nota")?.value || "").trim();
    if (!nota && opts?.nota) nota = String(opts.nota || "").trim();
    if (!nota) return setOut({ ok: false, error: "Escribe una nota antes de guardar." });
  }

  const vin = getVin();
  if (!vin) return setOut({ ok: false, error: "Pon el VIN" });

  const rolTrabajo = getRolTrabajoCurrent_();

  // validar acción en estado local
  const c = ctx_();
  const itLocal = [...c.itemsByKey.values()].find((it) => String(it.vin||"").toUpperCase() === vin && String(it.rolTrabajo||"").toUpperCase() === rolTrabajo);
  if (itLocal) {
    const allowed = allowedActionsByEstado(itLocal.estado);
    if (!allowed.includes(accion)) {
      return setOut({ ok: false, error: `Acción ${accion} no permitida desde estado ${itLocal.estado}.` });
    }
  }

  const j = await postJSON_user("/api/evento", { email, vin, rolTrabajo, accion, nota }, accion === "NOTA" ? "Guardando nota..." : "Registrando...");
  setOut(j);
  if (!j?.ok) return;

  const it2 = normalizeItem_(j);
  const k2 = keyOfItem_(it2);
  const prev = c.itemsByKey.get(k2);
  if (prev) mergePrevAndCache_(it2, prev);

  c.itemsByKey.set(k2, it2);
  rebuildListsFromStore_();

  const snapNotas = snapshotNotasActivas_();
  if (accion === "NOTA" && opts?.clearKey) snapNotas.set(String(opts.clearKey), "");

  renderActivas_();
  renderFinalizados_();
  restoreNotasActivas_(snapNotas);

  if (accion === "NOTA" && $("nota")) $("nota").value = "";

  setTimeout(() => { if (!CORE.state.uiLocked) syncNow({ forceFull: false, showOut: false }); }, 400);
}

// --------------------------
// AUTO START “suave” (simple)
// --------------------------
let lastAutoStart_ = { k: "", t: 0 };
async function autoStartFromScan_(vin, rolTrabajo) {
  const v = String(vin || "").trim().toUpperCase();
  const rol = String(rolTrabajo || "").trim().toUpperCase();
  if (!v) return;

  const k = `${v}|${rol}`;
  const now = Date.now();
  if (lastAutoStart_.k === k && now - lastAutoStart_.t < 1200) return;
  lastAutoStart_ = { k, t: now };

  const c = ctx_();
  const it = [...c.itemsByKey.values()].find((x) => String(x.vin||"").toUpperCase() === v && String(x.rolTrabajo||"").toUpperCase() === rol);
  const estado = String(it?.estado || "").toUpperCase();

  if (estado === "SIN_INICIAR") await enviarEvento("INICIO");
}

// --------------------------
// VIN AUTOCOMPLETE (igual idea que tu versión)
// --------------------------
const VIN_AC = { MIN_CHARS: 2, LIMIT: 12, DEBOUNCE_MS: 200 };
let vinAcTimer = null, vinAcItems = [], vinAcOpen = false, vinAcIndex = -1, vinAcLastQ = "", vinAcAbort = null;

function vinAcBox_() { return el_("vinSuggest"); }
function vinAcHide_() {
  const box = vinAcBox_();
  if (!box) return;
  vinAcOpen = false; vinAcIndex = -1; vinAcItems = [];
  box.classList.add("hidden"); box.innerHTML = "";
}
function vinAcRender_() {
  const box = vinAcBox_();
  if (!box) return;
  if (!vinAcItems.length) return vinAcHide_();

  box.innerHTML = vinAcItems.map((vin, i) => {
    const active = i === vinAcIndex ? "active" : "";
    return `<div class="vsItem ${active}" data-idx="${i}" role="option" aria-selected="${i === vinAcIndex}">
      <div class="vsVin">${escapeHtml(vin)}</div><div class="vsHint">Enter</div>
    </div>`;
  }).join("");

  box.classList.remove("hidden");
  vinAcOpen = true;
}
function vinAcSetIndex_(i) {
  vinAcIndex = Math.max(0, Math.min(i, vinAcItems.length - 1));
  vinAcRender_();
  const box = vinAcBox_();
  const el = box?.querySelector(`.vsItem[data-idx="${vinAcIndex}"]`);
  if (el) el.scrollIntoView({ block: "nearest" });
}
async function vinAcFetch_(q) {
  try { vinAcAbort?.abort?.(); } catch {}
  vinAcAbort = new AbortController();
  const url = `/api/vin-suggest?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(VIN_AC.LIMIT)}`;
  const r = await fetch(url, { signal: vinAcAbort.signal });
  const j = await r.json();
  if (!j?.ok) return [];
  return Array.isArray(j.items) ? j.items : [];
}
function vinAcOnInput_() {
  const input = el_("vin");
  if (!input) return;
  const q = String(input.value || "").trim().toUpperCase();
  vinAcLastQ = q;
  if (!q || q.length < VIN_AC.MIN_CHARS) return vinAcHide_();

  clearTimeout(vinAcTimer);
  vinAcTimer = setTimeout(async () => {
    try {
      const items = await vinAcFetch_(q);
      if (vinAcLastQ !== q) return;
      vinAcItems = (items || []).map((v) => String(v || "").toUpperCase()).filter(Boolean);
      vinAcIndex = vinAcItems.length ? 0 : -1;
      vinAcRender_();
    } catch { vinAcHide_(); }
  }, VIN_AC.DEBOUNCE_MS);
}
function vinAcPick_(vin) {
  const input = el_("vin");
  if (!input) return;
  input.value = String(vin || "").toUpperCase();
  vinAcHide_();

  refreshEstadoForVinRole({ showOut: false })
    .then(async () => {
      await withLock(async () => {
        await autoStartFromScan_(input.value, getRolTrabajoCurrent_());
        await syncNow({ forceFull: false, showOut: false });
        await refreshEstadoForVinRole({ showOut: false });
      }, "Iniciando automáticamente...");
    })
    .catch(() => {});
}
function vinAcOnKeyDown_(e) {
  if (!vinAcOpen) return;
  if (e.key === "ArrowDown") { e.preventDefault(); return vinAcSetIndex_(vinAcIndex + 1); }
  if (e.key === "ArrowUp") { e.preventDefault(); return vinAcSetIndex_(vinAcIndex - 1); }
  if (e.key === "Enter") {
    if (vinAcIndex >= 0 && vinAcItems[vinAcIndex]) { e.preventDefault(); return vinAcPick_(vinAcItems[vinAcIndex]); }
  }
  if (e.key === "Escape") { e.preventDefault(); return vinAcHide_(); }
}
(function bindVinSuggestOnce() {
  const boxT = $("vinSuggest");
  const boxQ = $("vinSuggestQ");
  [boxT, boxQ].forEach((box) => {
    if (!box) return;
    if (box.dataset.bound === "1") return;
    box.dataset.bound = "1";
    box.addEventListener("mousedown", (e) => {
      const it = e.target.closest(".vsItem[data-idx]");
      if (!it) return;
      e.preventDefault();
      const idx = Number(it.dataset.idx);
      const vin = vinAcItems[idx];
      if (vin) vinAcPick_(vin);
    });
  });
  document.addEventListener("click", (e) => {
    if (!vinAcOpen) return;
    const wraps = document.querySelectorAll(".vinWrap");
    const inside = [...wraps].some((w) => w.contains(e.target));
    if (inside) return;
    vinAcHide_();
  });
})();

// --------------------------
// QR WORK_VIN (simple)
// --------------------------
let qr = null;
let scanMode = "QR"; // "QR" | "BAR"
let qrTarget = "WORK_VIN"; // work only here

function setScanMode_(mode) { scanMode = mode === "BAR" ? "BAR" : "QR"; }

async function openQRModal() {
  if (!(CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD")) return;

  qrTarget = "WORK_VIN";
  const modal = $("qrModal");
  modal?.classList?.add("show");
  await startQR();
}

async function closeQRModal() {
  $("qrModal")?.classList?.remove("show");
  await stopQR();
}

async function startQR() {
  const msg = $("qrMsg");
  try {
    if (!window.Html5Qrcode) { if (msg) msg.textContent = "No se pudo cargar la librería QR."; return; }
    if (!qr) qr = new Html5Qrcode("qrReader");

    const isBar = scanMode === "BAR";
    const config = {
      fps: isBar ? 8 : 10,
      qrbox: isBar ? { width: 160, height: 320 } : { width: 250, height: 250 },
      formatsToSupport: isBar ? [Html5QrcodeSupportedFormats.CODE_128] : [Html5QrcodeSupportedFormats.QR_CODE],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    };

    const onDecoded = async (decodedText) => {
      const code = String(decodedText || "").trim().toUpperCase();
      if (!code) return;

      const vinEl = el_("vin");
      if (vinEl) vinEl.value = code;

      if (msg) msg.textContent = `VIN detectado: ${code}`;
      await closeQRModal();

      await withLock(async () => {
        await refreshEstadoForVinRole({ showOut: false });
        await autoStartFromScan_(code, getRolTrabajoCurrent_());
        await syncNow({ forceFull: true, showOut: false });
        await refreshEstadoForVinRole({ showOut: false });
      }, "Iniciando automáticamente...");
    };

    try { await qr.start({ facingMode: { exact: "environment" } }, config, onDecoded, () => {}); return; } catch {}
    try { await qr.start({ facingMode: "environment" }, config, onDecoded, () => {}); return; } catch {}

    const devices = await Html5Qrcode.getCameras();
    let cameraId = devices?.[0]?.id || null;
    const env = devices?.find((d) => /back|rear|environment/i.test(d.label || ""));
    if (env?.id) cameraId = env.id;

    await qr.start(cameraId ?? { facingMode: "environment" }, config, onDecoded, () => {});
  } catch {
    if (msg) msg.textContent = "No se pudo abrir la cámara. Revisa permisos (HTTPS o localhost).";
  }
}
async function stopQR() { try { if (qr && qr.isScanning) await qr.stop(); } catch {} }

// --------------------------
// DELEGACIÓN (TECNICO/CALIDAD)
// --------------------------
function attachWorkDelegationOnce_(mod) {
  const prev = CORE.state.currentModule;
  CORE.state.currentModule = mod;
  try {
    const box = el_("activasBox");
    if (!box) return;

    const markKey = `bound_${mod}`;
    if (box.dataset[markKey] === "1") return;
    box.dataset[markKey] = "1";

    // mostrar botón guardar nota
    box.addEventListener("input", (e) => {
      const ta = e.target.closest("textarea.notaCard");
      if (!ta) return;
      const btn = ta.closest(".jobCard")?.querySelector(".btnNota");
      if (btn) btn.style.display = ta.value.trim() ? "block" : "none";
    });

    box.addEventListener("click", async (e) => {
      const card = e.target.closest(".jobCard");
      if (!card) return;

      // ✅ 1) ACCIONES (PAUSA/FIN/REANUDAR/INICIO/NOTA)
      const actBtn = e.target.closest('button[data-act]');
      if (actBtn) {
        e.stopPropagation();
        const accion = String(actBtn.dataset.act || "").toUpperCase();

        const c = ctx_();
        const k = card.dataset.key || "";
        const it = c.itemsByKey.get(k);
        if (!it) return;

        // si quieres reflejar VIN/ROL como antes:
        const vinEl = el_("vin");
        if (vinEl) vinEl.value = it.vin || "";
        if (CORE.state.currentModule === "TECNICO" && !CORE.state.rolLock) {
          if ($("rol")) $("rol").value = it.rolTrabajo || "MOTOR";
          enforceRolLock_();
        }
        if (accion === "NOTA" && $("nota")) {
          $("nota").value = String(card.querySelector("textarea.notaCard")?.value || "");
        }

        await enviarEvento(accion, { clearKey: k });
        return;
      }

      // ✅ 2) BOTONES data-go (INC / RF / CONF)
      const goBtn = e.target.closest('button[data-go]');
      if (!goBtn) return;

      const go = String(goBtn.dataset.go || "").toUpperCase();
      const c = ctx_();
      const k = card.dataset.key || "";
      const it = c.itemsByKey.get(k);
      if (!it) return;

      if (go === "RF") {
        const vin = String(goBtn.dataset.vin || it.vin || "").trim().toUpperCase();
        if (!vin) return;
        if (CORE.state.currentModule === "TECNICO" && $("vin")) $("vin").value = vin;
        if (CORE.state.currentModule === "CALIDAD" && $("vinQ")) $("vinQ").value = vin;
        showUploaderView({ vin, screen: "menu" });
        return;
      }

      if (go === "INC") {
        e.stopPropagation();
        const key = String(goBtn.dataset.key || k || "").trim();
        if (!key) return;
        await openIncidenciaModalForKey_(key);
        return;
      }

      if (go === "CONF") {
        e.stopPropagation();
        await openConformidadModalForKey_(k);
        return;
      }
    });
  } finally {
    CORE.state.currentModule = prev;
  }
}

function attachFinalizadosDelegationOnce_(mod) {
  const prev = CORE.state.currentModule;
  CORE.state.currentModule = mod;
  try {
    const box = el_("finalizadosBox");
    if (!box) return;

    const markKey = `boundFin_${mod}`;
    if (box.dataset[markKey] === "1") return;
    box.dataset[markKey] = "1";

    box.addEventListener("click", async (e) => {
      const btn = e.target?.closest?.("button[data-go]");
      if (!btn) return;

      const go = String(btn.dataset.go || "").toUpperCase();

      // --------------------------
      // INC (registrar incidencia)
      // --------------------------
      if (go === "INC") {
        e.stopPropagation();
        const key = String(btn.dataset.key || btn.closest("[data-key]")?.dataset?.key || "").trim();
        if (!key) return;
        await openIncidenciaModalForKey_(key);
        return;
      }

      // --------------------------
      // RF (fotos/fallas)
      // --------------------------
      if (go === "RF") {
        const vin = String(btn.dataset.vin || "").trim().toUpperCase();
        if (!vin) return;

        const root = document.getElementById("viewUploader");
        if (root) {
          document.querySelectorAll('[id^="view"]').forEach((v) => {
            if (v.id !== "viewUploader") v.style.display = "none";
          });
        }
        showUploaderView({ vin, screen: "menu" });
        return;
      }
    });
  } finally {
    CORE.state.currentModule = prev;
  }
}

// --------------------------
// TICK CLOCK (para loops)
// --------------------------
export function tickClocksUI_() {
  if (!isWorkModule_()) return;
  const c = ctx_();
  const nowMs = Date.now();

  el_("activasBox")?.querySelectorAll(".jobCard[data-key] .js-tiempo")?.forEach((elTime) => {
    const card = elTime.closest(".jobCard");
    if (!card) return;
    const k = card.dataset.key || "";
    const it = c.itemsByKey.get(k);
    if (!it) return;
    elTime.textContent = `⏱ ${msToHMS_(computeLiveMs_(it, nowMs))}`;
  });

  if (CORE.state.currentModule === "RAMALERO") return;

  const vin = getVin();
  const rol = getRolTrabajoCurrent_();
  if (vin && rol) {
    const it = [...c.itemsByKey.values()].find((x) => String(x.vin||"").toUpperCase()===vin && String(x.rolTrabajo||"").toUpperCase()===rol);
    if (it) setEstadoText(`Estado: ${it.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it, nowMs))}`);
  }
}

// --------------------------
// VIEW LIFECYCLE
// --------------------------
export function init() {
  // TECNICO
  $("btnEstado")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    await withLock(async () => {
      await refreshEstadoForVinRole({ showOut: true });
      await syncNow({ forceFull: true, showOut: false });
    }, "Buscando / creando OT...");
  });

  $("btnActivas")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true }), "Refrescando...");
  });

  $("btnFinalizados")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizados").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      renderFinalizados_();
    }, "Cargando finalizados...");
  });

  $("vin")?.addEventListener("input", () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    vinAcOnInput_();
    setEstadoText("");
    scheduleEstadoRefresh_(650);
  });
  $("vin")?.addEventListener("keydown", (e) => {
    if (CORE.state.currentModule !== "TECNICO") return;
    vinAcOnKeyDown_(e);
  });

  $("rol")?.addEventListener("change", () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    scheduleEstadoRefresh_(0);
  });

  // CALIDAD
  $("btnEstadoQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    await withLock(async () => {
      await refreshEstadoForVinRole({ showOut: true });
      await syncNow({ forceFull: true, showOut: false });
    }, "Buscando / creando OT...");
  });

  $("btnActivasQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true }), "Refrescando...");
  });

  $("btnFinalizadosQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizados").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      renderFinalizados_();
    }, "Cargando finalizados...");
  });

  $("vinQ")?.addEventListener("input", () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    vinAcOnInput_();
    setEstadoText("");
    scheduleEstadoRefresh_(650);
  });
  $("vinQ")?.addEventListener("keydown", (e) => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    vinAcOnKeyDown_(e);
  });

  // QR (shared)
  $("btnQR")?.addEventListener("click", () => openQRModal());
  $("btnQRQ")?.addEventListener("click", () => openQRModal());
  $("btnCloseQR")?.addEventListener("click", () => closeQRModal());
  $("qrModal")?.addEventListener("click", async (e) => {
    if (e.target === $("qrModal")) await closeQRModal();
  });
  // ---- Scan mode buttons (QR / BAR) ----
$("btnScanQR")?.addEventListener("click", async () => {
  setScanMode_("QR");
  // reinicia cámara con el nuevo modo
  await withLock(async () => {
    await stopQR();
    await startQR();
  }, "Cambiando a QR...");
});

$("btnScanBar")?.addEventListener("click", async () => {
  setScanMode_("BAR");
  // reinicia cámara con el nuevo modo
  await withLock(async () => {
    await stopQR();
    await startQR();
  }, "Cambiando a CÓDIGO DE BARRAS...");
});
  initIncidenciasUI_();
  initConformidadUI_();

  // delegation once
  attachWorkDelegationOnce_("TECNICO");
  attachWorkDelegationOnce_("CALIDAD");
  attachFinalizadosDelegationOnce_("TECNICO");
  attachFinalizadosDelegationOnce_("CALIDAD");
}

export function enter(mod) {
  // mod viene "TECNICO" o "CALIDAD"
  CORE.state.currentModule = mod;

  // loops
  startLoopsFor_(mod, {
    syncNow,
    tickClocksUI: tickClocksUI_,
    refreshEstadoForVinRole,
  });
}

export function exit(mod) {
  stopLoopsFor_(mod);
  clearModuleUI_(mod);
}