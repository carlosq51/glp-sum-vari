// =========================
// public/js/views/admin/admin.js
// Vista ADMIN (mínima): solo deja el debug/out visible si tu HTML lo usa
// =========================
import { CORE } from "../../core/core.js";

export function init() {}
export function enter() { CORE.state.currentModule = "ADMIN"; }
export function exit() {}