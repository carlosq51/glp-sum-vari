// =========================
// public/app.js  (NUEVO - MODULAR)
// conversion = TECNICO + CALIDAD ✅
// =========================
/* global Html5Qrcode, Html5QrcodeSupportedFormats */

import { appShell } from "./js/templates/views/shell.js";

import {
  $, CORE, initTheme_, loadEmail, saveEmail, clearEmail,
  showLoginUI, showAppUI, setUserPillUI, applyDebugVisibilityUI,
  effectiveModulos, computeRolLock_, enforceRolLock_,
  hideAllModulesUI, showHubUI,
} from "./js/core/core.js";

import { openView } from "./js/core/router-lite.js";
import { initUploaderView, showUploaderView, hideUploaderView } from "./js/views/uploader/uploader.js";

import * as VConversion from "./js/views/conversion/conversion.js";
import * as VRamalero from "./js/views/ramalero/ramalero.js";
import * as VSupervisor from "./js/views/supervisor/supervisor.js";
import * as VAdmin from "./js/views/admin/admin.js";

const root = document.getElementById("appRoot");
if (root) root.innerHTML = appShell();

// ---------- LOGIN FLOW ----------
async function doLogin(email) {
  if (!email) return showLoginUI("Pon tu email.");

  const j = await CORE.getJSON_user(`/api/me?email=${encodeURIComponent(email)}`, "Iniciando sesión...");
  if (!j?.ok) return showLoginUI(j?.error || "No se pudo iniciar sesión.");

  CORE.state.currentProfile = j.profile;
  saveEmail(email);

  applyDebugVisibilityUI();
  setUserPillUI();

  // rolLock solo aplica TECNICO
  CORE.state.rolLock = computeRolLock_(CORE.state.currentProfile);
  enforceRolLock_();

  const mods = effectiveModulos(CORE.state.currentProfile);

  showAppUI();

  if (mods.length > 1) {
    hideAllModulesUI();
    showHubUI(mods, (m) => openModule(m));
    CORE.state.currentModule = null;
  } else {
    openModule(mods[0]);
  }
}

// ---------- OPEN MODULE ----------
function openModule(m) {
  // ✅ oculta uploader por si estaba abierto
  hideUploaderView();

  // exit view actual
  openView(m);

  CORE.state.currentModule = m;

  hideAllModulesUI();
  const el = document.getElementById(`view${m}`);
  if (el) el.style.display = "block";
  const hub = $("viewHub");
  if (hub) hub.style.display = "none";

  enforceRolLock_();
}

// ---------- REGISTER VIEWS ----------
openView.register("TECNICO", () => VConversion.enter("TECNICO"), () => VConversion.exit("TECNICO"));
openView.register("CALIDAD", () => VConversion.enter("CALIDAD"), () => VConversion.exit("CALIDAD"));
openView.register("RAMALERO", () => VRamalero.enter(), () => VRamalero.exit());
openView.register("SUPERVISOR", () => VSupervisor.enter(), () => VSupervisor.exit());
openView.register("ADMIN", () => VAdmin.enter(), () => VAdmin.exit());

// init once for each view (bind listeners once)
VConversion.init();
VRamalero.init();
VSupervisor.init();
VAdmin.init();
initUploaderView();

// ---------- GLOBAL LISTENERS ----------
$("btnTheme")?.addEventListener("click", CORE.toggleTheme_);

$("btnRegistroFallas")?.addEventListener("click", () => {
  // Oculta vistas actuales
  hideAllModulesUI();
  $("viewHub") && ($("viewHub").style.display = "none");

  // Por si estabas en otro módulo, intenta jalar VIN actual
  const vinActual =
    $("vin")?.value?.trim() ||
    $("vinQ")?.value?.trim() ||
    $("supVin")?.value?.trim() ||
    "";

  // Muestra la vista Uploader integrada
  showUploaderView({ vin: vinActual, screen: "menu" });
});

$("btnMe")?.addEventListener("click", async () => {
  const email = CORE.getEmail();
  await doLogin(email);
});

$("btnLogout")?.addEventListener("click", () => {
  clearEmail();
  $("email").value = "";
  CORE.state.currentProfile = null;
  CORE.state.currentModule = null;

  // exit all views safely
  VConversion.exit("TECNICO");
  VConversion.exit("CALIDAD");
  VRamalero.exit();

  hideAllModulesUI();
  $("viewHub").style.display = "none";
  document.getElementById("debugWrap")?.classList.add("debug-hidden");
  document.getElementById("viewUploader")?.style && (document.getElementById("viewUploader").style.display = "none");

  showLoginUI("Sesión cerrada.");
});

// ---------- AUTO LOGIN ----------
window.addEventListener("load", async () => {
  initTheme_();

  const saved = loadEmail();
  if (!saved) return showLoginUI("");

  $("email").value = saved;
  await doLogin(saved);
});