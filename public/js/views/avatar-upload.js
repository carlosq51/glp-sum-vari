// =========================
// public/js/views/avatar-upload.js
// Manejo de carga/cambio de avatar de usuario
// =========================

import { CORE } from "../core/state.js";
import { $ } from "../core/dom.js";
import { fileToB64Compressed } from "./uploader/uploader-api.js";

let selectedFile = null;
let previewDataUrl = null;

export function initAvatarUpload() {
  console.log("[AVATAR_UPLOAD] Inicializando...");

  const modal = $("avatarUploadModal");
  console.log("[AVATAR_UPLOAD] Modal encontrado:", !!modal);
  if (!modal) {
    console.warn("[AVATAR_UPLOAD] Modal no encontrado!");
    return;
  }

  const btnCloseModal = $("btnCloseAvatarModal");
  const btnCancel = $("btnCancelAvatarUpload");
  const btnConfirm = $("btnConfirmAvatarUpload");
  const fileInput = $("avatarFileInput");
  const uploadZone = $("avatarUploadZone");

  // Avatar puede estar en TECNICO (tecAvatar - visible) o en Hub (hubAvatar)
  // Buscar PRIMERO tecAvatar (está visible en TECNICO)
  const avatar = $("tecAvatar") || $("hubAvatar");
  console.log("[AVATAR_UPLOAD] Avatar encontrado:", !!avatar, "ID:", avatar?.id);

  // Abrir modal al hacer clic en el avatar
  if (avatar) {
    console.log("[AVATAR_UPLOAD] Agregando listener de click al avatar");
    avatar.addEventListener("click", openModal);
  }

  // Cerrar modal
  if (btnCloseModal) {
    btnCloseModal.addEventListener("click", closeModal);
  }
  if (btnCancel) {
    btnCancel.addEventListener("click", closeModal);
  }

  // Click en la zona de upload abre el file input
  if (uploadZone) {
    uploadZone.addEventListener("click", () => fileInput?.click());
  }

  // Drag and drop
  if (uploadZone && fileInput) {
    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadZone.classList.add("dragover");
    });

    uploadZone.addEventListener("dragleave", () => {
      uploadZone.classList.remove("dragover");
    });

    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.classList.remove("dragover");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    });
  }

  // File input change
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  // Confirmar y subir
  if (btnConfirm) {
    btnConfirm.addEventListener("click", uploadAvatar);
  }

  // Click en overlay para cerrar
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }
}

function openModal() {
  console.log("[AVATAR_UPLOAD] openModal() llamado");
  const modal = $("avatarUploadModal");
  console.log("[AVATAR_UPLOAD] Modal en openModal:", !!modal);
  if (modal) {
    console.log("[AVATAR_UPLOAD] Abriendo modal...");
    modal.classList.add("show");
    document.body.classList.add("modal-open");

    // Debug: verificar estilos
    setTimeout(() => {
      const computed = window.getComputedStyle(modal);
      console.log("[AVATAR_UPLOAD] Modal display:", computed.display);
      console.log("[AVATAR_UPLOAD] Modal position:", computed.position);
      console.log("[AVATAR_UPLOAD] Modal z-index:", computed.zIndex);
      console.log("[AVATAR_UPLOAD] Modal clases:", modal.className);
      console.log("[AVATAR_UPLOAD] Modal visible:", modal.offsetHeight > 0);
    }, 100);

    resetModal();
  }
}

function closeModal() {
  const modal = $("avatarUploadModal");
  if (modal) {
    modal.classList.remove("show");
    document.body.classList.remove("modal-open");
    resetModal();
  }
}

function resetModal() {
  selectedFile = null;
  previewDataUrl = null;
  const fileInput = $("avatarFileInput");
  if (fileInput) fileInput.value = "";
  const preview = $("avatarPreview");
  if (preview) preview.style.display = "none";
  const status = $("avatarUploadStatus");
  if (status) {
    status.style.display = "none";
    status.className = "avatarUploadStatus";
  }
  const uploadZone = $("avatarUploadZone");
  if (uploadZone) uploadZone.style.display = "block";
  const btnConfirm = $("btnConfirmAvatarUpload");
  if (btnConfirm) btnConfirm.disabled = true;
}

async function handleFileSelect(file) {
  // Validar tamaño (5MB)
  if (file.size > 5 * 1024 * 1024) {
    showStatus("error", "El archivo debe ser menor a 5MB");
    return;
  }

  // Validar tipo
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    showStatus("error", "Solo se aceptan JPG y PNG");
    return;
  }

  selectedFile = file;

  // Crear preview
  const reader = new FileReader();
  reader.onload = (e) => {
    previewDataUrl = e.target.result;
    const uploadZone = $("avatarUploadZone");
    if (uploadZone) uploadZone.style.display = "none";
    const preview = $("avatarPreview");
    if (preview) {
      const img = preview.querySelector("img");
      if (img) img.src = previewDataUrl;
      preview.style.display = "block";
    }
    const btnConfirm = $("btnConfirmAvatarUpload");
    if (btnConfirm) btnConfirm.disabled = false;
    clearStatus();
  };
  reader.readAsDataURL(file);
}

async function uploadAvatar() {
  const btnConfirm = $("btnConfirmAvatarUpload");
  if (!selectedFile || !btnConfirm) return;

  btnConfirm.disabled = true;
  showStatus("loading", "Procesando imagen...");

  try {
    // Comprimir imagen en el cliente
    const b64 = await fileToB64Compressed(selectedFile);
    if (!b64) {
      throw new Error("No se pudo procesar la imagen");
    }

    showStatus("loading", "Subiendo...");

    // Subir a R2
    const email = CORE.state.currentProfile?.email || "";
    const response = await fetch("/api/uploader/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "uploadAvatar",
        email,
        b64,
        mimeType: "image/jpeg",
      }),
    });

    if (!response.ok) {
      throw new Error(`Error en el servidor: ${response.status}`);
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || "Error desconocido");
    }

    // Actualizar perfil en Supabase
    showStatus("loading", "Guardando perfil...");
    const patchRes = await fetch("/api/perfil", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        avatar_url: result.url,
        email: CORE.state.currentProfile?.email || email,
      }),
    });

    if (!patchRes.ok) {
      throw new Error("Error al guardar el perfil");
    }

    // Actualizar estado local
    if (CORE.state.currentProfile) {
      CORE.state.currentProfile.avatar_url = result.url;
    }

    // Renderizar el avatar actualizado (puede estar en Hub o en TECNICO)
    const { renderUserAvatar } = await import("../core/ui-shell.js");
    const hubAvatar = $("hubAvatar");
    const tecAvatar = $("tecAvatar");
    if (hubAvatar) renderUserAvatar(hubAvatar);
    if (tecAvatar) renderUserAvatar(tecAvatar);

    showStatus("success", "¡Foto actualizada!");
    setTimeout(() => closeModal(), 1500);
  } catch (e) {
    console.error("[AVATAR_UPLOAD]", e);
    showStatus("error", `Error: ${e.message || "No se pudo subir la imagen"}`);
    btnConfirm.disabled = false;
  }
}

function showStatus(type, message) {
  const status = $("avatarUploadStatus");
  if (!status) return;
  status.className = `avatarUploadStatus ${type}`;
  status.textContent = message;
  status.style.display = "block";
}

function clearStatus() {
  const status = $("avatarUploadStatus");
  if (status) {
    status.style.display = "none";
  }
}
