// public/js/views/conversion/modals/confirm-finish.js
import { $ } from "../../../core/core.js";

const CONFIRM_FIN = {
  bound: false,
  resolver: null,
};

function els_() {
  return {
    modal: $("confirmFinishModal"),
    btnCloseX: $("btnCloseFinishX"),
    btnCancel: $("btnCancelFinish"),
    btnAccept: $("btnAcceptFinish"),
    title: $("confirmFinishTitle"),
    text: $("confirmFinishText"),
  };
}

function close_(result) {
  const { modal } = els_();
  if (modal) {
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("show");
  }

  document.body.classList.remove("modal-open");

  if (typeof CONFIRM_FIN.resolver === "function") {
    const resolve = CONFIRM_FIN.resolver;
    CONFIRM_FIN.resolver = null;
    resolve(!!result);
  }
}

function bindOnce_() {
  if (CONFIRM_FIN.bound) return;
  CONFIRM_FIN.bound = true;

  const { modal, btnCloseX, btnCancel, btnAccept } = els_();
  if (!modal) return;

  btnCloseX?.addEventListener("click", () => close_(false));
  btnCancel?.addEventListener("click", () => close_(false));
  btnAccept?.addEventListener("click", () => close_(true));

  modal.addEventListener("click", (e) => {
    if (e.target === modal) close_(false);
  });

  document.addEventListener("keydown", (e) => {
    const { modal } = els_();
    if (!modal || modal.getAttribute("aria-hidden") === "true") return;

    if (e.key === "Escape") {
      e.preventDefault();
      close_(false);
    }
  });
}

export function initConfirmFinishUI_() {
  bindOnce_();
}

export function askConfirmFinish_({
  title = "Confirmar finalización",
  message = "¿Seguro que quieres finalizar este trabajo?",
  acceptText = "Sí, finalizar",
  cancelText = "Cancelar",
  blockMode = false,   // si true: solo muestra cerrar, sin aceptar
} = {}) {
  bindOnce_();

  const { modal, title: titleEl, text, btnAccept, btnCancel } = els_();

  if (!modal) {
    if (blockMode) { window.alert(message); return Promise.resolve(false); }
    return Promise.resolve(window.confirm(message));
  }

  if (titleEl) titleEl.textContent = title;
  if (text) text.innerHTML = message;   // innerHTML para saltos de línea en bloqueos
  if (btnAccept) {
    btnAccept.textContent = acceptText;
    btnAccept.style.display = blockMode ? "none" : "";
  }
  if (btnCancel) {
    btnCancel.textContent = blockMode ? "Cerrar" : cancelText;
    btnCancel.style.flex = blockMode ? "1 1 100%" : "";
  }

  if (titleEl) {
    titleEl.style.color = blockMode ? "var(--danger, #e33)" : "";
  }

  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("show");
  document.body.classList.add("modal-open");

  setTimeout(() => btnCancel?.focus(), 0);

  if (blockMode) {
    // En modo bloqueo siempre resuelve false al cerrar
    return new Promise((resolve) => {
      CONFIRM_FIN.resolver = () => resolve(false);
    });
  }

  return new Promise((resolve) => {
    CONFIRM_FIN.resolver = resolve;
  });
}