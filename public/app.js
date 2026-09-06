// =========================
// public/app.js
// Bootstrap: monta shell, login, router, listeners globales
// =========================
/* global Html5Qrcode, Html5QrcodeSupportedFormats */

import { appShell } from "./js/templates/layout/shell.js";

import {
  $, CORE, initTheme_, loadEmail, saveEmail, clearEmail,
  showLoginUI, showAppUI, setUserPillUI, applyDebugVisibilityUI,
  effectiveModulos, computeRolLock_, enforceRolLock_,
  hideAllModulesUI, showHubUI, syncTopbarHomeButtonUI,
  getJSON_user, getEmail, setLocked, withLock,
  getJSON, postJSON,
} from "./js/core/core.js";

import { getUsuarioPerfil, supabaseEnabled } from "./js/core/supabase-client.js";

import { openView } from "./js/core/router-lite.js";
import { initUploaderView, showUploaderView, hideUploaderView } from "./js/views/uploader/uploader.js";

import * as VConversion from "./js/views/conversion/conversion.js";
import * as VRamalero from "./js/views/ramalero/ramalero.js";
import * as VSupervisor from "./js/views/supervisor/supervisor.js";
import * as VAdmin from "./js/views/admin/admin.js";
import * as VMovilizador from "./js/views/movilizador/movilizador.js";
import { initAppSettings } from "./js/core/app-settings.js";
import { openSettingsSheet } from "./js/core/settings-sheet.js";
import { loadConfig } from "./js/core/config.js";
import { initLive } from "./js/core/live.js";
import { initAvatarUpload } from "./js/views/avatar-upload.js";
import { renderInventarioTab } from "./js/views/admin/inventario.js";
import { mountRamalesPanel, unmountRamalesPanel } from "./js/views/ramales/ramales.js";

// Aplicar ajustes guardados (fuente, acento) antes de cualquier render
initAppSettings();

// Config operativa (intervalos, metas, límites) — no bloquea el boot:
// arranca con localStorage/defaults y se refresca del servidor en background.
loadConfig();
// Al volver de background (app de técnico dormida horas) → re-sincronizar
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") loadConfig();
});

// ---------- RUTA /inventario ----------
// El inventario tiene su propia URL para que el encargado del almacén entre
// directo (mi-dominio/inventario) sin pasar por el panel de Admin. Es la
// misma vista; solo cambia el marco. "Volver" regresa al dominio a secas.
const EN_RUTA_INVENTARIO = /^\/inventario\/?$/i.test(location.pathname);

// ---------- RUTA /ramales ----------
// Mismo criterio que /inventario: quien maneja las cajas de ramales entra
// directo a su tablero (mi-dominio/ramales) sin pasar por el módulo de
// supervisión entero. Es el mismo panel que la pestaña RAMALES.
const EN_RUTA_RAMALES = /^\/ramales\/?$/i.test(location.pathname);

const root = document.getElementById("appRoot");
if (root) root.innerHTML = appShell();

// ---------- BOOT SPLASH (logo SUM en el arranque / al despertar) ----------
function hideBootSplash_() {
  const el = document.getElementById("bootSplash");
  if (!el || el.classList.contains("is-hiding")) return;
  el.classList.add("is-hiding");
  setTimeout(() => el.classList.add("is-gone"), 500);
}
// Mantener el splash un mínimo visible y ocultarlo cuando la app está lista.
window.addEventListener("load", () => setTimeout(hideBootSplash_, 650));
setTimeout(hideBootSplash_, 2500); // failsafe

// ---------- LOGIN FLOW ----------
async function doLogin(email) {
  if (!email) return showLoginUI("Pon tu email.");

  try {
    // Usar Supabase directo si está habilitado, sino fallback a API
    let profile;
    
    if (supabaseEnabled()) {
      // 🚀 LECTURA DIRECTA DE SUPABASE (Sin Node proxy)
      await withLock(async () => {
        profile = await getUsuarioPerfil(email);
      }, "Iniciando sesión...");
      
      if (!profile) {
        return showLoginUI("Usuario no encontrado en Supabase.");
      }
    } else {
      // Fallback a Node API (para desarrollo sin Supabase)
      const j = await getJSON_user(`/api/me?email=${encodeURIComponent(email)}`, "Iniciando sesión...");
      if (!j?.ok) return showLoginUI(j?.error || "No se pudo iniciar sesión.");
      profile = j.profile;
    }

    CORE.state.currentProfile = profile;
    saveEmail(email);

    applyToroForUser_(email, profile);
    applyDebugVisibilityUI();
    setUserPillUI();
    syncTopbarHomeButtonUI();

    // rolLock solo aplica TECNICO
    CORE.state.rolLock = computeRolLock_(CORE.state.currentProfile);
    enforceRolLock_();

    const mods = effectiveModulos(CORE.state.currentProfile);

    showAppUI();

    // Eventos en vivo (SSE): las vistas se refrescan al instante cuando
    // otra persona muta el estado (ver core/live.js)
    initLive();

    // Inicializar avatar upload (disponible en Hub y en módulos)
    initAvatarUpload();

    if (EN_RUTA_INVENTARIO) {
      openInventarioPage_();
    } else if (EN_RUTA_RAMALES) {
      openRamalesPage_();
    } else if (mods.length > 1) {
      hideAllModulesUI();
      showHubUI(mods, (m) => openModule(m));
      CORE.state.currentModule = null;
    } else {
      openModule(mods[0]);
    }

  } catch (err) {
    console.error("Error en login:", err);
    showLoginUI(err?.message || "Error al iniciar sesión.");
  }
}

// Toro en la pantalla de carga — solo para usuarios especiales.
// Marca body[data-toro="1"]; el CSS de loading.css hace el resto.
const TORO_EMAILS_ = [
  "ley.m2692@hotmail.com",
  "gianfrancofloresflores3@gmail.com",
];
function applyToroForUser_(email, profile) {
  const e = String(email || profile?.email || "").trim().toLowerCase();
  const isToro = TORO_EMAILS_.includes(e);
  if (isToro) document.body.dataset.toro = "1";
  else delete document.body.dataset.toro;
}

// ---------- PÁGINA DE INVENTARIO (/inventario) ----------
function hideInventarioPage_() {
  const v = document.getElementById("viewInventario");
  if (v) v.style.display = "none";
}

function openInventarioPage_() {
  hideUploaderView();
  hideAllModulesUI();
  const hub = $("viewHub");
  if (hub) hub.style.display = "none";

  const v = document.getElementById("viewInventario");
  const body = document.getElementById("invPageBody");
  if (!v || !body) return;
  v.style.display = "block";
  // El inventario se escribió dentro del panel de Admin y su CSS cuelga de
  // ahí; marcamos el módulo para que se vea igual fuera del panel.
  document.body.dataset.appModule = "ADMIN";
  CORE.state.currentModule = null;

  // Es información sensible del almacén: solo quien tiene el módulo ADMIN.
  if (!effectiveModulos(CORE.state.currentProfile).includes("ADMIN")) {
    body.innerHTML = `<div class="invPageDenied">
      <h3>Sin acceso</h3>
      <p class="small muted">El inventario es del área de almacén. Pide al administrador que te habilite el módulo ADMIN.</p>
    </div>`;
    return;
  }

  // Sin este catch, un fallo al cargar dejaba la página en blanco y sin
  // pista de qué pasó — que es peor que un error a la vista.
  Promise.resolve()
    .then(() => renderInventarioTab(body))
    .catch((err) => {
      console.error("[inventario] no se pudo abrir:", err);
      body.innerHTML = `<div class="invPageDenied">
        <h3>No se pudo cargar el inventario</h3>
        <p class="small muted">${String(err?.message || err)}</p>
        <p class="small muted">Si dice que falta una tabla, ejecuta <code>supabase/inventario-stock.sql</code> en Supabase.</p>
      </div>`;
    });
}

$("invPageBack")?.addEventListener("click", () => { window.location.href = "/"; });

// ---------- PÁGINA DE RAMALES (/ramales) ----------
function hideRamalesPage_() {
  const v = document.getElementById("viewRamales");
  if (!v || v.style.display === "none") return;
  v.style.display = "none";
  // Sin desmontar, los cronómetros y el poll del panel seguirían vivos
  // detrás de la vista que el usuario abrió después.
  unmountRamalesPanel();
}

function openRamalesPage_() {
  hideUploaderView();
  hideInventarioPage_();
  hideAllModulesUI();
  const hub = $("viewHub");
  if (hub) hub.style.display = "none";

  const v = document.getElementById("viewRamales");
  const body = document.getElementById("rmPageBody");
  if (!v || !body) return;
  v.style.display = "block";
  // El panel reusa piezas del marco de Admin (botón fantasma, cuerpo de
  // página); se marca el módulo para que se vean igual fuera del panel.
  document.body.dataset.appModule = "ADMIN";
  CORE.state.currentModule = null;

  // El control de cajas es del supervisor. Un ramalero tiene su propia
  // sección en su vista — la de aquí incluye repartir y auditar.
  const mods = effectiveModulos(CORE.state.currentProfile);
  if (!mods.includes("SUPERVISOR") && !mods.includes("ADMIN")) {
    body.innerHTML = `<div class="invPageDenied">
      <h3>Sin acceso</h3>
      <p class="small muted">El control de ramales es del supervisor. Si eres ramalero,
      tu turno y tus ramales aparecen en tu propia vista.</p>
    </div>`;
    return;
  }

  mountRamalesPanel(body);
}

$("rmPageBack")?.addEventListener("click", () => { window.location.href = "/"; });

// ---------- OPEN MODULE ----------
function openModule(m) {
  // ✅ oculta uploader por si estaba abierto
  hideUploaderView();
  hideInventarioPage_();
  hideRamalesPage_();

  // exit view actual
  openView(m);

  CORE.state.currentModule = m;

  hideAllModulesUI();
  document.body.dataset.appModule = m;
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
openView.register("MOVILIZADOR", () => VMovilizador.enter(), () => VMovilizador.exit());
// init once for each view (bind listeners once)
VConversion.init();
VRamalero.init();
VSupervisor.init();
VAdmin.init();
VMovilizador.init();
initUploaderView();

// ---------- GLOBAL LISTENERS ----------
// Ajustes de apariencia (tema + tamaño + acento) — disponible en TODOS los
// módulos vía topbar, no solo en el hub. Técnicos/calidad que entran directo
// a su vista ahora también pueden cambiar tema, tamaño de letra y color.
$("btnAppSettings")?.addEventListener("click", openSettingsSheet);

$("btnRegistroFallas")?.addEventListener("click", () => {
  // Oculta vistas actuales
  hideInventarioPage_();
  hideRamalesPage_();
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

$("btnGoHome")?.addEventListener("click", () => {
  const mods = effectiveModulos(CORE.state.currentProfile);

  hideUploaderView();
  hideInventarioPage_();
  hideRamalesPage_();
  hideAllModulesUI();

  showHubUI(mods, (m) => openModule(m));
  CORE.state.currentModule = null;
  initAvatarUpload();
});

$("btnMe")?.addEventListener("click", async () => {
  const email = getEmail();
  await doLogin(email);
});

$("btnLogout")?.addEventListener("click", () => {
  clearEmail();
  $("email").value = "";
  CORE.state.currentProfile = null;
  CORE.state.currentModule = null;
  delete document.body.dataset.toro;

  // exit all views safely
  VConversion.exit("TECNICO");
  VConversion.exit("CALIDAD");
  VRamalero.exit();
  VMovilizador.exit();
  hideInventarioPage_();
  hideRamalesPage_();
  hideAllModulesUI();
  $("viewHub").style.display = "none";
  $("btnGoHome")?.classList.add("hidden");

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

// ---------- PWA: forzar chequeo de actualización al recuperar foco ----------
// El registro base (dist/registerSW.js) solo revisa si hay una versión nueva
// en el evento "load" de la página. Un celular que retoma la PWA desde
// segundo plano (sin recargar) no vuelve a disparar ese evento, así que se
// queda pegado en la versión vieja hasta que alguien la cierre del todo.
// Esto complementa el forceReload de sw-custom.js: cuando reg.update()
// encuentra una versión nueva, activa el SW (skipWaiting) y éste fuerza el
// reload de todas las pestañas/ventanas abiertas.
if ("serviceWorker" in navigator) {
  const checkForSwUpdate_ = () => {
    navigator.serviceWorker.getRegistration()
      .then((reg) => reg?.update())
      .catch(() => {});
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForSwUpdate_();
  });
  window.addEventListener("focus", checkForSwUpdate_);
  setInterval(checkForSwUpdate_, 60_000);
}

