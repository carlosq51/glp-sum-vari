// =========================
// public/js/core/dom.js
// DOM helpers
// =========================

import { CORE } from "./state.js";

export const $ = (id) => document.getElementById(id);

export function modSuffix_() {
  const m = CORE.state.currentModule;
  if (m === "CALIDAD") return "Q";
  if (m === "RAMALERO") return "R";
  return "";
}

export function el_(id) {
  const sfx = modSuffix_();
  const a = $(id + sfx);
  return a || $(id);
}