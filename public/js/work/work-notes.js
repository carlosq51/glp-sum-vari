import { el_ } from "../core/dom.js";

export function snapshotNotasActivas_() {
  const map = new Map();

  el_("activasBox")
    ?.querySelectorAll(".jobCard[data-key]")
    ?.forEach((card) => {
      const k = card.dataset.key || "";
      const ta = card.querySelector("textarea.notaCard");
      if (!ta) return;
      map.set(k, String(ta.value || ""));
    });

  return map;
}

export function restoreNotasActivas_(snapMap) {
  if (!snapMap) return;

  el_("activasBox")
    ?.querySelectorAll(".jobCard[data-key]")
    ?.forEach((card) => {
      const k = card.dataset.key || "";
      const ta = card.querySelector("textarea.notaCard");
      if (!ta) return;
      if (snapMap.has(k)) ta.value = snapMap.get(k);
    });
}