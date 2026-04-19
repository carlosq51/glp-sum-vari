import { CORE } from "../../core/core.js";
import { startLoopsFor_, stopLoopsFor_, clearModuleUI_ } from "../../core/loops.js";
import { syncNow } from "../conversion/data/conversion-sync.js";
import { tickClocksUI_ } from "../conversion/conversion.js";
import { initRamaleroActions_ } from "./ramalero-actions.js";
import { initRamaleroDelegation_ } from "./ramalero-delegation.js";
import { patchVisibleCards_ } from "../../work/index.js";

export function init() {
  initRamaleroActions_();
  initRamaleroDelegation_();
}

export function enter() {
  CORE.state.currentModule = "RAMALERO";
  startLoopsFor_("RAMALERO", {
    syncNow,
    tickClocksUI: () => {
      tickClocksUI_?.();
      patchVisibleCards_?.();
    },
  });
}

export function exit() {
  stopLoopsFor_("RAMALERO");
  clearModuleUI_("RAMALERO");
}