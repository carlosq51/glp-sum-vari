// =========================
// public/js/views/conversion/modals/error-modal.js
// Comportamiento del modal de error genérico (abrir/cerrar/promesa).
// ⚠️ Homónimo intencional: el HTML vive en templates/modals/error-modal.js.
// =========================
import { $ } from "../../../core/core.js";

const ERROR_MODAL = {
  bound: false,
  resolver: null,
};

function els_() {
  return {
    modal: $("errorModal"),
    btnCloseX: $("btnCloseErrorX"),
    btnClose: $("btnCloseError"),
    title: $("errorModalTitle"),
    text: $("errorModalText"),
    details: $("errorModalDetails"),
  };
}

function close_() {
  const { modal } = els_();
  if (modal) {
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("show");
  }

  document.body.classList.remove("modal-open");

  if (typeof ERROR_MODAL.resolver === "function") {
    const resolve = ERROR_MODAL.resolver;
    ERROR_MODAL.resolver = null;
    resolve();
  }
}

function bindOnce_() {
  if (ERROR_MODAL.bound) return;
  ERROR_MODAL.bound = true;

  const { modal, btnCloseX, btnClose } = els_();
  if (!modal) return;

  btnCloseX?.addEventListener("click", () => close_());
  btnClose?.addEventListener("click", () => close_());

  modal.addEventListener("click", (e) => {
    if (e.target === modal) close_();
  });

  document.addEventListener("keydown", (e) => {
    const { modal } = els_();
    if (!modal || modal.getAttribute("aria-hidden") === "true") return;

    if (e.key === "Escape") {
      e.preventDefault();
      close_();
    }
  });
}

export function initErrorModal() {
  bindOnce_();
}

/**
 * Muestra un popup de error con título y mensaje personalizable.
 * @param {Object} options
 * @param {string} options.title - Título del error (ej: "VIN no encontrado")
 * @param {string} options.message - Mensaje principal del error
 * @param {string} [options.details] - Detalles adicionales (opcional)
 * @param {string} [options.type] - Tipo de error: "error" | "warning" | "info"
 * @returns {Promise<void>}
 */
export function showErrorModal({
  title = "❌ Error",
  message = "Ha ocurrido un error.",
  details = "",
  type = "error",
} = {}) {
  bindOnce_();

  const { modal, title: titleEl, text: textEl, details: detailsEl, btnClose } = els_();

  if (!modal) {
    // Fallback: usar alert si el modal no está disponible
    alert(`${title}\n\n${message}${details ? `\n\n${details}` : ""}`);
    return Promise.resolve();
  }

  // Configurar ícono según tipo
  let icon = "❌";
  if (type === "warning") icon = "⚠️";
  else if (type === "info") icon = "ℹ️";

  if (titleEl) titleEl.textContent = `${icon} ${title.replace(/^[❌⚠️ℹ️]\s*/, "")}`;
  if (textEl) textEl.textContent = message;
  
  if (detailsEl) {
    if (details) {
      detailsEl.textContent = details;
      detailsEl.style.display = "block";
    } else {
      detailsEl.style.display = "none";
    }
  }

  // Cambiar color del botón según el tipo
  if (btnClose) {
    btnClose.classList.remove("danger");
    if (type === "error") {
      btnClose.classList.add("danger");
    }
  }

  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("show");
  document.body.classList.add("modal-open");

  setTimeout(() => btnClose?.focus(), 0);

  return new Promise((resolve) => {
    ERROR_MODAL.resolver = resolve;
  });
}

/**
 * Muestra error de VIN no encontrado
 * @param {string} vin - El VIN que no se encontró
 * @returns {Promise<void>}
 */
export function showVinNotFoundError(vin) {
  return showErrorModal({
    title: "VIN No Encontrado",
    message: `El VIN "${vin}" no existe en la lista de vehículos registrados.`,
    details: "Verifica que el VIN sea correcto o consulta con el supervisor si el vehículo debería estar registrado.",
    type: "error",
  });
}

/**
 * Muestra error de OT ya asignada a otro técnico
 * @param {string} vin - El VIN de la OT
 * @param {string} assignedTo - Nombre del técnico que tiene la OT asignada
 * @returns {Promise<void>}
 */
export function showAlreadyAssignedError(vin, assignedTo) {
  return showErrorModal({
    title: "OT Ya Asignada",
    message: `La orden de trabajo para el VIN "${vin}" ya está asignada a otro técnico.`,
    details: `Técnico asignado: ${assignedTo}`,
    type: "warning",
  });
}
