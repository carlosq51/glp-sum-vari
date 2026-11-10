// =========================
// public/js/work/work-store.js
// Reconstruye listas activas/finalizados desde el store
// =========================

import { ctx_ } from "../core/state.js";
import { keyOfItem_ } from "../core/format.js";
import { isFinalizado_, shouldShowItemInCurrentModule_ } from "./work-status.js";

export function rebuildListsFromStore_() {
  const c = ctx_();
  const all = [...c.itemsByKey.values()].filter(shouldShowItemInCurrentModule_);

  const activos = [];
  const fins = [];

  all.sort((a, b) => {
    const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
    const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
    return tb - ta;
  });

  for (const it of all) {
    const k = keyOfItem_(it);
    if (isFinalizado_(it)) fins.push(k);
    else activos.push(k);
  }

  // El VIN que se acaba de escanear va primero (ver destacarVin_ en
  // conversion-eventos.js): el inspector no lo busca entre todas las OTs.
  const primero = String(c.vinPrimero || "").toUpperCase();
  if (primero) {
    const esPrimero = (k) => String(c.itemsByKey.get(k)?.vin || "").toUpperCase() === primero;
    activos.sort((a, b) => Number(esPrimero(b)) - Number(esPrimero(a)));
  }

  c.activeKeys = activos;
  c.finalKeys = fins;
}