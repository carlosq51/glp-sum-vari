import { createVinSuggest_ } from "../../core/suggest.js";

export function bindSupVinSuggest_({ CORE, onApply }) {
  const ac = createVinSuggest_({
    input:   "supVin",
    box:     "supVinSuggest",
    guard:   () => CORE.state.currentModule === "SUPERVISOR",
    min:     1,
    debounce: 200,
    limit:   12,
    onPick: item => {
      const inp = document.getElementById("supVin");
      if (inp) inp.value = item.vin;
      onApply?.();
    },
  });
  ac.bind();

  // Enter without a selected item also triggers onApply
  document.getElementById("supVin")?.addEventListener("keydown", e => {
    if (CORE.state.currentModule !== "SUPERVISOR") return;
    if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); onApply?.(); }
  });
}
