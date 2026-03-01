// =========================
// public/js/views/conversion/modals/conformidad.js
// Modal de conformidad de equipo (TANQUE / REDUCTOR)
// - ligado a VIN de la card
// - escaneo QR / código de barras del equipo
// - requiere 3 checks + código para guardar
// =========================
/* global Html5Qrcode, Html5QrcodeSupportedFormats */

import {
  CORE,
  $,
  ctx_,
  requireEmailOrStop,
  postJSON_user,
} from "../../../core/core.js";

// --------------------------
// STATE
// --------------------------
const CONF = {
  currentKey: "",
  currentItem: null,
  qr: null,
  scanMode: "QR", // "QR" | "BAR"
  bound: false,
};

let afterSaveRefresh_ = null;

export function setConformidadAfterSaveRefresh_(fn) {
  afterSaveRefresh_ = typeof fn === "function" ? fn : null;
}

function confEls_() {
  return {
    modal: $("confModal"),
    btnClose: $("btnCloseConf"),

    vinInfo: $("confVinInfo"),
    code: $("confCode"),
    btnQR: $("btnConfQR"),
    assignedBox: $("confAssignedBox"),

    qrWrap: $("confQrWrap"),
    qrReader: $("qrReader_conf"),
    qrMsg: $("confQrMsg"),
    btnStopQR: $("btnConfStopQR"),
    btnClear: $("btnConfClear"),

    ck1: $("ck1"),
    ck2: $("ck2"),
    ck3: $("ck3"),

    btnSave: $("btnConfSave"),
    msg: $("confMsg"),
  };
}

// --------------------------
// HELPERS
// --------------------------
function normalizeCode_(s) {
  return String(s || "").trim().toUpperCase();
}

function guessEquipoTipo_(it) {
  const rol = String(it?.rolTrabajo || "").toUpperCase();

  // Puedes ajustar esta lógica según tu flujo real:
  // - TANQUE -> conformidad TANQUE
  // - MOTOR  -> conformidad REDUCTOR (usual)
  if (rol === "TANQUE") return "TANQUE";
  if (rol === "MOTOR") return "REDUCTOR";

  // fallback por datos disponibles
  if (String(it?.tanque_asignado || "").trim()) return "TANQUE";
  if (String(it?.reductor_asignado || "").trim()) return "REDUCTOR";

  return "EQUIPO";
}

function getAssignedCode_(it, equipoTipo) {
  if (!it) return "";
  if (equipoTipo === "TANQUE") {
    return String(it.tanque_asignado || it.tanque_registrado || "").trim().toUpperCase();
  }
  if (equipoTipo === "REDUCTOR") {
    return String(it.reductor_asignado || it.reductor_registrado || "").trim().toUpperCase();
  }
  return "";
}

function allChecksOn_() {
  const { ck1, ck2, ck3 } = confEls_();
  return !!(ck1?.checked && ck2?.checked && ck3?.checked);
}

function canSave_() {
  const { code } = confEls_();
  return !!normalizeCode_(code?.value) && allChecksOn_() && !!CONF.currentItem?.vin;
}

function setMsg_(txt, isErr = false) {
  const { msg } = confEls_();
  if (!msg) return;
  msg.textContent = String(txt || "");
  msg.style.color = isErr ? "#ffb3b3" : "";
}

function refreshAssignedHint_() {
  const { assignedBox, code } = confEls_();
  const it = CONF.currentItem;
  if (!assignedBox) return;

  if (!it) {
    assignedBox.textContent = "";
    return;
  }

  const tipo = guessEquipoTipo_(it);
  const assigned = getAssignedCode_(it, tipo);
  const typed = normalizeCode_(code?.value);

  if (!assigned) {
    assignedBox.textContent = `Equipo esperado (${tipo}): (sin asignado en cartilla)`;
    assignedBox.style.opacity = ".85";
    return;
  }

  if (!typed) {
    assignedBox.textContent = `Equipo asignado (${tipo}): ${assigned}`;
    assignedBox.style.opacity = ".95";
    return;
  }

  const ok = typed === assigned;
  assignedBox.textContent = `Equipo asignado (${tipo}): ${assigned} ${ok ? "✅" : "⚠️ no coincide"}`;
  assignedBox.style.opacity = "1";
}

function refreshSaveState_() {
  const { btnSave } = confEls_();
  if (!btnSave) return;

  const ok = canSave_();
  btnSave.disabled = !ok;
  btnSave.style.opacity = ok ? "1" : ".65";
  btnSave.style.cursor = ok ? "pointer" : "not-allowed";
}

// --------------------------
// QR SCAN (equipo code)
// --------------------------
function setScanMode_(mode) {
  CONF.scanMode = mode === "BAR" ? "BAR" : "QR";
}

async function startConfQR_() {
  const { qrWrap, qrMsg, code } = confEls_();
  try {
    if (!window.Html5Qrcode) {
      if (qrMsg) qrMsg.textContent = "No se cargó la librería QR.";
      return;
    }

    qrWrap && (qrWrap.style.display = "block");
    if (!CONF.qr) CONF.qr = new Html5Qrcode("qrReader_conf");

    const isBar = CONF.scanMode === "BAR";
    if (qrMsg) qrMsg.textContent = isBar ? "Modo: CÓDIGO DE BARRAS (CODE_128)" : "Modo: QR";

    const config = {
      fps: isBar ? 8 : 10,
      qrbox: isBar ? { width: 170, height: 320 } : { width: 250, height: 250 },
      formatsToSupport: isBar
        ? [Html5QrcodeSupportedFormats.CODE_128]
        : [Html5QrcodeSupportedFormats.QR_CODE],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    };

    const onDecoded = async (decodedText) => {
      const val = normalizeCode_(decodedText);
      if (!val) return;

      if (code) code.value = val;
      if (qrMsg) qrMsg.textContent = `Código detectado: ${val}`;

      refreshAssignedHint_();
      refreshSaveState_();

      await stopConfQR_();
    };

    try { await CONF.qr.start({ facingMode: { exact: "environment" } }, config, onDecoded, () => {}); return; } catch {}
    try { await CONF.qr.start({ facingMode: "environment" }, config, onDecoded, () => {}); return; } catch {}

    const devices = await Html5Qrcode.getCameras();
    let cameraId = devices?.[0]?.id || null;
    const back = devices?.find((d) => /back|rear|environment/i.test(d.label || ""));
    if (back?.id) cameraId = back.id;

    await CONF.qr.start(cameraId ?? { facingMode: "environment" }, config, onDecoded, () => {});
  } catch {
    if (qrMsg) qrMsg.textContent = "No se pudo abrir cámara. Revisa permisos/HTTPS.";
  }
}

async function stopConfQR_() {
  const { qrWrap, qrMsg } = confEls_();
  try {
    if (CONF.qr && CONF.qr.isScanning) await CONF.qr.stop();
  } catch {}
  if (qrWrap) qrWrap.style.display = "none";
  if (qrMsg && !qrMsg.textContent) qrMsg.textContent = "";
}

// --------------------------
// OPEN / CLOSE / RESET
// --------------------------
function resetForm_() {
  const { code, ck1, ck2, ck3, qrMsg, msg } = confEls_();

  if (code) code.value = "";
  if (ck1) ck1.checked = false;
  if (ck2) ck2.checked = false;
  if (ck3) ck3.checked = false;
  if (qrMsg) qrMsg.textContent = "";
  if (msg) msg.textContent = "";

  refreshAssignedHint_();
  refreshSaveState_();
}

function fillModalFromItem_(it) {
  const { vinInfo, assignedBox } = confEls_();

  const vin = String(it?.vin || "").trim().toUpperCase();
  const rol = String(it?.rolTrabajo || "").toUpperCase();
  const tipo = guessEquipoTipo_(it);

  if (vinInfo) {
    vinInfo.textContent = `VIN: ${vin || "-"} | ROL: ${rol || "-"} | CONFORMIDAD: ${tipo}`;
  }

  if (assignedBox) {
    assignedBox.textContent = "";
  }

  refreshAssignedHint_();
  refreshSaveState_();
}

export async function openConformidadModalForKey_(key) {
  const c = ctx_();
  const it = c.itemsByKey.get(String(key || ""));
  if (!it) return;

  CONF.currentKey = String(key || "");
  CONF.currentItem = it;

  fillModalFromItem_(it);
  resetForm_();

  const { modal, code } = confEls_();
  modal?.classList?.add("show");
  modal?.setAttribute?.("aria-hidden", "false");

  setTimeout(() => code?.focus?.(), 0);
}

async function closeConformidadModal_() {
  const { modal } = confEls_();
  modal?.classList?.remove("show");
  modal?.setAttribute?.("aria-hidden", "true");

  await stopConfQR_();

  CONF.currentKey = "";
  CONF.currentItem = null;
}

// --------------------------
// SAVE
// --------------------------
async function saveConformidad_() {
  const { code, ck1, ck2, ck3 } = confEls_();
  const it = CONF.currentItem;

  if (!it) return setMsg_("No hay cartilla seleccionada.", true);

  const equipoCodigo = normalizeCode_(code?.value);
  if (!equipoCodigo) return setMsg_("Debes escribir o escanear el código del equipo.", true);

  if (!(ck1?.checked && ck2?.checked && ck3?.checked)) {
    return setMsg_("Debes marcar los 3 items de conformidad.", true);
  }

  let email;
  try { email = requireEmailOrStop(); }
  catch { return; }

  const equipoTipo = guessEquipoTipo_(it);
  const assigned = getAssignedCode_(it, equipoTipo);

  const payload = {
    email,
    conversionId: String(it.conversionId || ""),
    vin: String(it.vin || "").trim().toUpperCase(),           // ✅ ligado al chasis/cartilla
    rolTrabajo: String(it.rolTrabajo || "").toUpperCase(),
    equipoTipo,                                               // TANQUE / REDUCTOR
    equipoCodigo,                                             // escaneado/escrito
    equipoAsignado: assigned || "",                           // opcional, útil para validar en backend
    checks: {
      ck1: true,
      ck2: true,
      ck3: true,
    },
  };

  // si tu Apps Script no recibe "checks" como objeto, abajo lo mando también plano
  payload.ck1 = true;
  payload.ck2 = true;
  payload.ck3 = true;

  const j = await postJSON_user(
    "/api/equipo-conformidad",
    payload,
    "Guardando conformidad..."
  );

  if (!j?.ok) {
    setMsg_(j?.error || "No se pudo guardar la conformidad.", true);
    return;
  }

  setMsg_("✅ Conformidad guardada correctamente.");

  setTimeout(() => {
    try { afterSaveRefresh_?.(); } catch {}
  }, 400);

  setTimeout(() => closeConformidadModal_().catch(() => {}), 450);
}

// --------------------------
// BIND ONCE
// --------------------------
export function initConformidadUI_() {
  if (CONF.bound) return;
  CONF.bound = true;

  const {
    modal, btnClose,
    code, btnQR, btnStopQR, btnClear,
    ck1, ck2, ck3,
    btnSave,
  } = confEls_();

  // cerrar
  btnClose?.addEventListener("click", () => closeConformidadModal_());
  modal?.addEventListener("click", async (e) => {
    if (e.target === modal) await closeConformidadModal_();
  });

  // input código
  code?.addEventListener("input", () => {
    code.value = normalizeCode_(code.value);
    refreshAssignedHint_();
    refreshSaveState_();
    setMsg_("");
  });

  // checklist
  [ck1, ck2, ck3].forEach((ck) => {
    ck?.addEventListener("change", () => {
      refreshSaveState_();
      setMsg_("");
    });
  });

  // qr open (alterna QR/BAR con click/alt-click para no agregar más botones)
  // Click normal = QR, Alt+Click = barras
  btnQR?.addEventListener("click", async (e) => {
    setScanMode_(e.altKey ? "BAR" : "QR");
    await startConfQR_();
  });

  btnStopQR?.addEventListener("click", async () => {
    await stopConfQR_();
  });

  btnClear?.addEventListener("click", () => {
    const { code, qrMsg } = confEls_();
    if (code) code.value = "";
    if (qrMsg) qrMsg.textContent = "";
    refreshAssignedHint_();
    refreshSaveState_();
    setMsg_("");
  });

  // guardar
  btnSave?.addEventListener("click", async () => {
    if (!canSave_()) {
      setMsg_("Completa el código del equipo y marca los 3 checks.", true);
      return;
    }
    await saveConformidad_();
  });

  // enter en input
  code?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && canSave_()) {
      e.preventDefault();
      await saveConformidad_();
    }
  });

  refreshSaveState_();
}