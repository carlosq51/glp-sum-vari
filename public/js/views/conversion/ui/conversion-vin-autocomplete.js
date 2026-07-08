import {
  CORE, $, withLock,
  getRolTrabajoCurrent_, setEstadoText,
  createVinSuggest_,
} from "../../../core/core.js";

import { refreshEstadoForVinRole, scheduleEstadoRefresh_ } from "../data/conversion-estado.js";
import { autoStartFromScan_ } from "../data/conversion-eventos.js";
import { syncNow } from "../data/conversion-sync.js";

async function handleVinPick_(vin) {
  try {
    await refreshEstadoForVinRole({ showOut: false });
    await withLock(async () => {
      await autoStartFromScan_(vin, getRolTrabajoCurrent_());
      await syncNow({ forceFull: true, showOut: false });
      await refreshEstadoForVinRole({ showOut: false });
    }, "Iniciando automáticamente...");
  } catch (e) {
    console.warn("[VIN_AC_PICK] Error:", e.message);
  }
}

// Two instances — one per module, each with its own guard.
const tecnicoAC = createVinSuggest_({
  input: "vin",
  box:   "vinSuggest",
  min:   3,
  guard: () => CORE.state.currentModule === "TECNICO",
  onPick: item => {
    const inp = $("vin");
    if (inp) inp.value = item.vin;
    handleVinPick_(item.vin);
  },
});

const calidadAC = createVinSuggest_({
  input: "vinQ",
  box:   "vinSuggestQ",
  min:   3,
  guard: () => CORE.state.currentModule === "CALIDAD",
  onPick: item => {
    const inp = $("vinQ");
    if (inp) inp.value = item.vin;
    handleVinPick_(item.vin);
  },
});

export function initVinAutocomplete_() {
  tecnicoAC.bind();
  calidadAC.bind();

  // Side-effects on input not related to suggest (estado refresh)
  $("vin")?.addEventListener("input", () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    setEstadoText("");
    scheduleEstadoRefresh_(650);
  });
  $("vinQ")?.addEventListener("input", () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    setEstadoText("");
    scheduleEstadoRefresh_(650);
  });
}
