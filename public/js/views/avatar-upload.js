// =========================
// public/js/views/avatar-upload.js
// Cambiar avatar: popup (subir / eliminar) + recorte cuadrado real
// =========================

import { CORE } from "../core/state.js";
import { $ } from "../core/dom.js";

// IDs de los avatares clickeables en las distintas vistas
const AVATAR_IDS = ["hubAvatar", "tecAvatar", "movAvatar"];

export function initAvatarUpload() {
  for (const id of AVATAR_IDS) {
    const el = $(id);
    if (!el || el.dataset.avatarBound === "1") continue;
    el.dataset.avatarBound = "1";
    el.style.cursor = "pointer";
    el.addEventListener("click", () => showAvatarPopup(el));
  }
}

// Re-renderiza el avatar en todas las vistas donde exista
async function refreshAllAvatars() {
  const { renderUserAvatar } = await import("../core/ui-shell.js");
  for (const id of AVATAR_IDS) {
    const el = $(id);
    if (el) renderUserAvatar(el);
  }
}

// ─── Popup (Subir / Eliminar) ─────────────────────────────────────────────
function showAvatarPopup(avatarEl) {
  closePopup();

  const popup = document.createElement("div");
  popup.className = "avatar-popup";
  popup.innerHTML = `
    <div class="avatar-popup-content">
      <button class="avatar-popup-btn" data-act="upload">📤 Subir foto</button>
      <button class="avatar-popup-btn" data-act="delete">🗑️ Eliminar</button>
    </div>
  `;
  document.body.appendChild(popup);

  // Posicionar cerca del avatar, sin salirse de la pantalla
  const rect = avatarEl.getBoundingClientRect();
  popup.style.position = "fixed";
  popup.style.top = rect.bottom + 8 + "px";
  const left = Math.max(8, Math.min(rect.left - 40, window.innerWidth - popup.offsetWidth - 8));
  popup.style.left = left + "px";

  // Input file dedicado (referencia local — sin IDs globales)
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/jpeg,image/png";
  fileInput.style.display = "none";
  popup.appendChild(fileInput);

  popup.querySelector('[data-act="upload"]').addEventListener("click", () => {
    fileInput.click();
  });

  popup.querySelector('[data-act="delete"]').addEventListener("click", () => {
    closePopup();
    deleteAvatar();
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    closePopup();
    if (file) showCropUI(file);
  });

  // Cerrar al hacer click fuera (listener persistente, se limpia en closePopup)
  const onDocClick = (e) => {
    if (!popup.contains(e.target)) closePopup();
  };
  // Se registra en el próximo tick para no capturar el click que abrió el popup
  setTimeout(() => document.addEventListener("mousedown", onDocClick), 0);
  popup._cleanup = () => document.removeEventListener("mousedown", onDocClick);
}

function closePopup() {
  const popup = document.querySelector(".avatar-popup");
  if (!popup) return;
  if (typeof popup._cleanup === "function") popup._cleanup();
  popup.remove();
}

// ─── Recorte (crop cuadrado real) ─────────────────────────────────────────
function showCropUI(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const container = document.createElement("div");
    container.className = "avatar-crop-container";
    container.innerHTML = `
      <div class="avatar-crop-overlay">
        <div class="avatar-crop-header">
          <h3>Encuadrar foto</h3>
          <button class="avatar-crop-close" type="button">×</button>
        </div>
        <div class="avatar-crop-content">
          <div class="avatar-crop-wrapper">
            <img class="cropImage" src="${e.target.result}" alt="Vista previa" draggable="false">
            <div class="crop-box"></div>
          </div>
        </div>
        <div class="avatar-crop-actions">
          <button class="btn-secondary btn-cancel" type="button">Cancelar</button>
          <button class="btn-primary btn-save" type="button">Guardar foto</button>
        </div>
      </div>
    `;
    document.body.appendChild(container);
    document.body.classList.add("modal-open");

    const image = container.querySelector(".cropImage");
    const cropBox = container.querySelector(".crop-box");

    // Estado del recorte, en píxeles de imagen mostrada
    const crop = { x: 0, y: 0, size: 0 };

    function drawBox() {
      cropBox.style.display = "block";
      cropBox.style.left = crop.x + "px";
      cropBox.style.top = crop.y + "px";
      cropBox.style.width = crop.size + "px";
      cropBox.style.height = crop.size + "px";
    }

    function clamp() {
      const w = image.clientWidth;
      const h = image.clientHeight;
      crop.size = Math.max(24, Math.min(crop.size, w, h));
      crop.x = Math.max(0, Math.min(crop.x, w - crop.size));
      crop.y = Math.max(0, Math.min(crop.y, h - crop.size));
    }

    function initDefaultBox() {
      const w = image.clientWidth;
      const h = image.clientHeight;
      crop.size = Math.min(w, h) * 0.8;
      crop.x = (w - crop.size) / 2;
      crop.y = (h - crop.size) / 2;
      clamp();
      drawBox();
    }

    if (image.complete && image.naturalWidth) initDefaultBox();
    else image.addEventListener("load", initDefaultBox, { once: true });

    // Dibujar un nuevo recuadro cuadrado arrastrando sobre la imagen
    let drawing = false;
    let anchorX = 0;
    let anchorY = 0;

    function pointerPos(ev) {
      const r = image.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(ev.clientX - r.left, image.clientWidth)),
        y: Math.max(0, Math.min(ev.clientY - r.top, image.clientHeight)),
      };
    }

    function onDown(ev) {
      ev.preventDefault();
      drawing = true;
      const p = pointerPos(ev);
      anchorX = p.x;
      anchorY = p.y;
      crop.size = 0;
      crop.x = p.x;
      crop.y = p.y;
    }

    function onMove(ev) {
      if (!drawing) return;
      const p = pointerPos(ev);
      const side = Math.max(Math.abs(p.x - anchorX), Math.abs(p.y - anchorY));
      crop.size = side;
      crop.x = p.x < anchorX ? anchorX - side : anchorX;
      crop.y = p.y < anchorY ? anchorY - side : anchorY;
      clamp();
      drawBox();
    }

    function onUp() {
      if (!drawing) return;
      drawing = false;
      if (crop.size < 24) initDefaultBox(); // clic sin arrastre → recuadro por defecto
    }

    image.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
      container.remove();
    }

    function onKey(ev) {
      if (ev.key === "Escape") cleanup();
    }
    document.addEventListener("keydown", onKey);

    container.querySelector(".btn-cancel").addEventListener("click", cleanup);
    container.querySelector(".avatar-crop-close").addEventListener("click", cleanup);
    container.addEventListener("mousedown", (ev) => {
      if (ev.target === container) cleanup(); // click en el fondo oscuro
    });

    container.querySelector(".btn-save").addEventListener("click", async () => {
      const b64 = cropToB64(image, crop);
      cleanup();
      await saveAvatar(b64);
    });
  };
  reader.readAsDataURL(file);
}

// Recorta según el recuadro y devuelve base64 JPEG (sin prefijo data:)
function cropToB64(image, crop) {
  const scale = image.naturalWidth / image.clientWidth; // escala uniforme
  const sx = crop.size ? crop.x * scale : 0;
  const sy = crop.size ? crop.y * scale : 0;
  const ss = crop.size ? crop.size * scale : Math.min(image.naturalWidth, image.naturalHeight);
  const out = Math.min(512, Math.round(ss));

  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, sx, sy, ss, ss, 0, 0, out, out);

  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1] || "";
}

// ─── Guardar / Eliminar ───────────────────────────────────────────────────
async function saveAvatar(b64) {
  const email = CORE.state.currentProfile?.email;
  if (!email) return alert("No hay sesión activa.");
  if (!b64) return alert("No se pudo procesar la imagen.");

  try {
    const uploadRes = await fetch("/api/uploader/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "uploadAvatar", email, b64, mimeType: "image/jpeg" }),
    });
    const result = await uploadRes.json();
    if (!result.ok) throw new Error(result.error || "Error al subir la imagen");

    // Cache-busting para que el navegador no muestre la foto anterior
    const url = result.url + (result.url.includes("?") ? "&" : "?") + "v=" + Date.now();

    const patchRes = await fetch("/api/perfil", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_url: url, email }),
    });
    if (!patchRes.ok) throw new Error("No se pudo guardar el perfil");

    if (CORE.state.currentProfile) CORE.state.currentProfile.avatar_url = url;
    await refreshAllAvatars();
    alert("✅ Foto actualizada");
  } catch (e) {
    console.error("[AVATAR] save", e);
    alert("Error al guardar foto: " + e.message);
  }
}

async function deleteAvatar() {
  if (!confirm("¿Eliminar tu foto de perfil?")) return;
  const email = CORE.state.currentProfile?.email;
  if (!email) return;

  try {
    const patchRes = await fetch("/api/perfil", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_url: "", email }),
    });
    if (!patchRes.ok) throw new Error("No se pudo actualizar el perfil");

    if (CORE.state.currentProfile) CORE.state.currentProfile.avatar_url = "";
    await refreshAllAvatars();
    alert("✅ Foto eliminada");
  } catch (e) {
    console.error("[AVATAR] delete", e);
    alert("Error: " + e.message);
  }
}
