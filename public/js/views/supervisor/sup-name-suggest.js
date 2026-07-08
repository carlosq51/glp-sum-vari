import { createNameSuggest_ } from "../../core/suggest.js";

export function bindSupNameSuggest_({ CORE, onApply }) {
  const ac = createNameSuggest_({
    input:   "supName",
    box:     "supNameSuggest",
    guard:   () => CORE.state.currentModule === "SUPERVISOR",
    min:     3,
    debounce: 750,
    limit:   12,
    onPick: item => {
      const inp = document.getElementById("supName");
      if (inp) inp.value = item.name || item.email || "";
      onApply?.();
    },
  });
  ac.bind();

  // Enter (with or without selection) triggers onApply
  document.getElementById("supName")?.addEventListener("keydown", e => {
    if (CORE.state.currentModule !== "SUPERVISOR") return;
    if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); onApply?.(); }
  });
}
