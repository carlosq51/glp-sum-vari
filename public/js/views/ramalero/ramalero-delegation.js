import {
  CORE,
  el_,
  ctx_,
} from "../../core/core.js";

import { enviarEventoRamalero_ } from "./ramalero-eventos.js";

let boundDelegation_ = false;

function closest_(node, sel) {
  return node?.closest ? node.closest(sel) : null;
}

export function initRamaleroDelegation_() {
  if (boundDelegation_) return;
  boundDelegation_ = true;

  document.addEventListener("click", async (ev) => {
    if (CORE.state.currentModule !== "RAMALERO") return;

    const box = el_("activasBox");
    if (!box) return;

    const target = ev.target;

    const btnAct = closest_(target, "button[data-act]");
    if (btnAct && box.contains(btnAct)) {
      ev.preventDefault();
      ev.stopPropagation();

      const card = closest_(btnAct, ".jobCard[data-key]");
      const key = card?.dataset?.key || "";
      if (!key) return;

      const it = ctx_().itemsByKey.get(key);
      if (!it) return;

      const accion = String(btnAct.dataset.act || "").toUpperCase();
      if (!accion) return;

      let nota = "";
      if (accion === "NOTA") {
        const ta = card.querySelector("textarea.notaCard");
        nota = String(ta?.value || "").trim();
      }

      await enviarEventoRamalero_(it, accion, nota);
      return;
    }

    const card = closest_(target, ".jobCard");
    if (card && box.contains(card)) {
      const isInteractive =
        closest_(target, "button") ||
        closest_(target, "textarea") ||
        closest_(target, "input") ||
        closest_(target, "select") ||
        closest_(target, "a");

      if (isInteractive) return;

      card.classList.toggle("open");
    }
  });

  document.addEventListener("input", (ev) => {
    if (CORE.state.currentModule !== "RAMALERO") return;

    const box = el_("activasBox");
    if (!box) return;

    const ta = closest_(ev.target, "textarea.notaCard");
    if (!ta || !box.contains(ta)) return;

    const card = closest_(ta, ".jobCard");
    if (!card) return;

    const btnNota = card.querySelector("button.btnNota[data-act='NOTA']");
    if (!btnNota) return;

    const hasText = String(ta.value || "").trim().length > 0;
    btnNota.style.display = hasText ? "block" : "none";
  });
}