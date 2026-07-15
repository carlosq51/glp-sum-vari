// =========================
// public/js/views/avatar-upload.js
// Popup simple para cambiar avatar
// =========================

import { CORE } from "../core/state.js";
import { $ } from "../core/dom.js";
import { fileToB64Compressed } from "./uploader/uploader-api.js";

let currentFile = null;
let cropCanvas = null;

export function initAvatarUpload() {
  // Avatar puede estar en TECNICO (tecAvatar) o Hub (hubAvatar)
  const avatar = $("tecAvatar") || $("hubAvatar");
  if (!avatar) return;

  avatar.style.cursor = "pointer";
  avatar.addEventListener("click", () => showAvatarPopup(avatar));
}

function showAvatarPopup(avatarEl) {
  // Remover popup anterior si existe
  const existingPopup = document.querySelector(".avatar-popup");
  if (existingPopup) existingPopup.remove();

  const popup = document.createElement("div");
  popup.className = "avatar-popup";
  popup.innerHTML = `
    <div class="avatar-popup-content">
      <button class="avatar-popup-btn" id="btnUploadPhoto">📤 Subir foto</button>
      <button class="avatar-popup-btn" id="btnDeletePhoto">🗑️ Eliminar</button>
      <input type="file" id="avatarFileInput" accept="image/jpeg,image/png" style="display:none;">
    </div>
  `;

  document.body.appendChild(popup);

  // Posicionar cerca del avatar
  const rect = avatarEl.getBoundingClientRect();
  popup.style.position = "fixed";
  popup.style.top = (rect.bottom + 10) + "px";
  popup.style.left = (rect.left - 50) + "px";

  // Listeners
  document.getElementById("btnUploadPhoto").addEventListener("click", () => {
    document.getElementById("avatarFileInput").click();
  });

  document.getElementById("btnDeletePhoto").addEventListener("click", () => {
    deleteAvatar();
    popup.remove();
  });

  document.getElementById("avatarFileInput").addEventListener("change", (e) => {
    if (e.target.files[0]) {
      currentFile = e.target.files[0];
      showCropUI(e.target.files[0]);
      popup.remove();
    }
  });

  // Cerrar popup al hacer click fuera
  setTimeout(() => {
    document.addEventListener("click", (e) => {
      if (!popup.contains(e.target) && !e.target.closest(".avatar-popup")) {
        popup.remove();
      }
    }, { once: true });
  });
}

function showCropUI(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const cropContainer = document.createElement("div");
    cropContainer.className = "avatar-crop-container";
    cropContainer.innerHTML = `
      <div class="avatar-crop-overlay">
        <div class="avatar-crop-header">
          <h3>Encuadrar foto</h3>
          <button id="btnCloseCrop" class="avatar-crop-close">×</button>
        </div>
        <div class="avatar-crop-content">
          <img id="cropImage" src="${e.target.result}" alt="Crop preview">
          <div id="cropBox" class="crop-box"></div>
        </div>
        <div class="avatar-crop-actions">
          <button id="btnCancelCrop" class="btn-secondary">Cancelar</button>
          <button id="btnSaveCrop" class="btn-primary">Guardar foto</button>
        </div>
      </div>
    `;

    document.body.appendChild(cropContainer);

    // Crop logic
    const image = document.getElementById("cropImage");
    const cropBox = document.getElementById("cropBox");
    let isDrawing = false;
    let startX, startY;

    image.addEventListener("mousedown", (e) => {
      isDrawing = true;
      const rect = image.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      cropBox.style.left = startX + "px";
      cropBox.style.top = startY + "px";
      cropBox.style.width = "0";
      cropBox.style.height = "0";
    });

    image.addEventListener("mousemove", (e) => {
      if (!isDrawing) return;
      const rect = image.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      cropBox.style.width = Math.abs(currentX - startX) + "px";
      cropBox.style.height = Math.abs(currentY - startY) + "px";
      if (currentX < startX) cropBox.style.left = currentX + "px";
      if (currentY < startY) cropBox.style.top = currentY + "px";
    });

    image.addEventListener("mouseup", () => {
      isDrawing = false;
    });

    document.getElementById("btnSaveCrop").addEventListener("click", () => {
      saveCroppedAvatar(file);
      cropContainer.remove();
    });

    document.getElementById("btnCancelCrop").addEventListener("click", () => {
      cropContainer.remove();
      currentFile = null;
    });

    document.getElementById("btnCloseCrop").addEventListener("click", () => {
      cropContainer.remove();
      currentFile = null;
    });
  };

  reader.readAsDataURL(file);
}

async function saveCroppedAvatar(file) {
  try {
    // Comprimir imagen
    const b64 = await fileToB64Compressed(file);
    const email = CORE.state.currentProfile?.email;

    // Subir a R2
    const uploadRes = await fetch("/api/uploader/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "uploadAvatar",
        email,
        b64,
        mimeType: "image/jpeg",
      }),
    });

    const result = await uploadRes.json();
    if (!result.ok) throw new Error(result.error);

    // Actualizar perfil
    await fetch("/api/perfil", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        avatar_url: result.url,
        email,
      }),
    });

    // Actualizar estado local
    if (CORE.state.currentProfile) {
      CORE.state.currentProfile.avatar_url = result.url;
    }

    // Re-renderizar avatar
    const { renderUserAvatar } = await import("../core/ui-shell.js");
    const hubAvatar = $("hubAvatar");
    const tecAvatar = $("tecAvatar");
    if (hubAvatar) renderUserAvatar(hubAvatar);
    if (tecAvatar) renderUserAvatar(tecAvatar);

    alert("✅ Foto actualizada");
  } catch (e) {
    console.error("[AVATAR]", e);
    alert("Error al guardar foto: " + e.message);
  }
}

async function deleteAvatar() {
  if (!confirm("¿Eliminar tu foto de perfil?")) return;

  try {
    const email = CORE.state.currentProfile?.email;

    // Actualizar perfil (avatar_url = vacío)
    await fetch("/api/perfil", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        avatar_url: "",
        email,
      }),
    });

    // Actualizar estado local
    if (CORE.state.currentProfile) {
      CORE.state.currentProfile.avatar_url = "";
    }

    // Re-renderizar
    const { renderUserAvatar } = await import("../core/ui-shell.js");
    const hubAvatar = $("hubAvatar");
    const tecAvatar = $("tecAvatar");
    if (hubAvatar) renderUserAvatar(hubAvatar);
    if (tecAvatar) renderUserAvatar(tecAvatar);

    alert("✅ Foto eliminada");
  } catch (e) {
    console.error("[AVATAR]", e);
    alert("Error: " + e.message);
  }
}
