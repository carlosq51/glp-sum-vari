// public/js/views/conversion/ui/conversion-vin-autocomplete.js

import {
  CORE,
  $,
  el_,
  escapeHtml,
  getRolTrabajoCurrent_,
  setEstadoText,
  withLock,
} from "../../../core/core.js";

import { getVinSuggest, supabaseEnabled } from "../../../core/supabase-client.js";

import { refreshEstadoForVinRole, scheduleEstadoRefresh_ } from "../data/conversion-estado.js";
import { autoStartFromScan_ } from "../data/conversion-eventos.js";
import { syncNow } from "../data/conversion-sync.js";

// --------------------------
// VIN AUTOCOMPLETE
// --------------------------
const VIN_AC = { MIN_CHARS: 1, LIMIT: 12, DEBOUNCE_MS: 200 };

let vinAcTimer = null;
let vinAcItems = [];
let vinAcOpen = false;
let vinAcIndex = -1;
let vinAcLastQ = "";
let vinAcAbort = null;

function vinAcInput_() {
  return CORE.state.currentModule === "CALIDAD"
    ? el_("vinQ")
    : el_("vin");
}

function vinAcBox_() {
  return CORE.state.currentModule === "CALIDAD"
    ? el_("vinSuggestQ")
    : el_("vinSuggest");
}

function vinAcHide_() {
  const box = vinAcBox_();
  if (!box) return;
  vinAcOpen = false;
  vinAcIndex = -1;
  vinAcItems = [];
  box.classList.add("hidden");
  box.innerHTML = "";
}

function vinAcRender_() {
  const box = vinAcBox_();
  if (!box) return;

  if (!vinAcItems.length) {
    vinAcHide_();
    return;
  }

  box.innerHTML = vinAcItems.map((vin, i) => {
    const active = i === vinAcIndex ? "active" : "";
    return `
      <div class="vsItem ${active}" data-idx="${i}" role="option" aria-selected="${i === vinAcIndex}">
        <div class="vsVin">${escapeHtml(vin)}</div>
        <div class="vsHint">Enter</div>
      </div>
    `;
  }).join("");

  box.classList.remove("hidden");
  vinAcOpen = true;
}

function vinAcSetIndex_(i) {
  vinAcIndex = Math.max(0, Math.min(i, vinAcItems.length - 1));
  vinAcRender_();

  const box = vinAcBox_();
  const row = box?.querySelector(`.vsItem[data-idx="${vinAcIndex}"]`);
  if (row) row.scrollIntoView({ block: "nearest" });
}

async function vinAcFetch_(q) {
  try { vinAcAbort?.abort?.(); } catch {}
  vinAcAbort = new AbortController();

  try {
    if (supabaseEnabled()) {
      // 🚀 LECTURA DIRECTA DE SUPABASE (Sin Node proxy)
      const items = await getVinSuggest(q, VIN_AC.LIMIT);
      return items;
    }
  } catch (err) {
    console.warn("[vinAcFetch_] Supabase error:", err.message);
  }

  // Fallback: Node API
  const url = `/api/vin-suggest?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(VIN_AC.LIMIT)}`;
  const r = await fetch(url, { signal: vinAcAbort.signal });
  const j = await r.json();

  if (!j?.ok) return [];
  return Array.isArray(j.items) ? j.items : [];
}

function vinAcOnInput_() {
  const input = vinAcInput_();
  if (!input) return;

  const q = String(input.value || "").trim().toUpperCase();
  vinAcLastQ = q;

  if (!q || q.length < VIN_AC.MIN_CHARS) {
    vinAcHide_();
    return;
  }

  clearTimeout(vinAcTimer);
  vinAcTimer = setTimeout(async () => {
    try {
      const items = await vinAcFetch_(q);
      if (vinAcLastQ !== q) return;

      vinAcItems = (items || [])
        .map((v) => String(v || "").toUpperCase())
        .filter(Boolean);

      vinAcIndex = vinAcItems.length ? 0 : -1;
      vinAcRender_();
    } catch {
      vinAcHide_();
    }
  }, VIN_AC.DEBOUNCE_MS);
}

function vinAcPick_(vin) {
  const input = vinAcInput_();
  if (!input) return;

  input.value = String(vin || "").toUpperCase();
  vinAcHide_();

  refreshEstadoForVinRole({ showOut: false })
    .then(async () => {
      await withLock(async () => {
        await autoStartFromScan_(input.value, getRolTrabajoCurrent_());
        await syncNow({ forceFull: false, showOut: false });
        await refreshEstadoForVinRole({ showOut: false });
      }, "Iniciando automáticamente...");
    })
    .catch(() => {});
}

function vinAcOnKeyDown_(e) {
  if (!vinAcOpen) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    vinAcSetIndex_(vinAcIndex + 1);
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    vinAcSetIndex_(vinAcIndex - 1);
    return;
  }

  if (e.key === "Enter") {
    if (vinAcIndex >= 0 && vinAcItems[vinAcIndex]) {
      e.preventDefault();
      vinAcPick_(vinAcItems[vinAcIndex]);
    }
    return;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    vinAcHide_();
  }
}

function bindVinSuggestOnce_() {
  const boxT = $("vinSuggest");
  const boxQ = $("vinSuggestQ");

  [boxT, boxQ].forEach((box) => {
    if (!box) return;
    if (box.dataset.bound === "1") return;

    box.dataset.bound = "1";

    box.addEventListener("mousedown", (e) => {
      const row = e.target.closest(".vsItem[data-idx]");
      if (!row) return;

      e.preventDefault();

      const idx = Number(row.dataset.idx);
      const vin = vinAcItems[idx];
      if (vin) vinAcPick_(vin);
    });
  });

  if (!document.body.dataset.vinSuggestDocBound) {
    document.body.dataset.vinSuggestDocBound = "1";

    document.addEventListener("click", (e) => {
      if (!vinAcOpen) return;

      const wraps = document.querySelectorAll(".vinWrap");
      const inside = [...wraps].some((w) => w.contains(e.target));
      if (inside) return;

      vinAcHide_();
    });
  }
}

export function initVinAutocomplete_() {
  bindVinSuggestOnce_();

  $("vin")?.addEventListener("input", () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    vinAcOnInput_();
    setEstadoText("");
    scheduleEstadoRefresh_(650);
  });

  $("vin")?.addEventListener("keydown", (e) => {
    if (CORE.state.currentModule !== "TECNICO") return;
    vinAcOnKeyDown_(e);
  });

  $("vinQ")?.addEventListener("input", () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    vinAcOnInput_();
    setEstadoText("");
    scheduleEstadoRefresh_(650);
  });

  $("vinQ")?.addEventListener("keydown", (e) => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    vinAcOnKeyDown_(e);
  });
}