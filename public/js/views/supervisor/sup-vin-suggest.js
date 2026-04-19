// =========================
// public/js/views/supervisor/sup-vin-suggest.js
// VIN SUGGEST para Supervisor (mismo patrón que sup-name-suggest)
// =========================

import { getVinSuggest, supabaseEnabled } from "../../core/supabase-client.js";

export function bindSupVinSuggest_({ CORE, escapeHtml, onApply }) {
  const VIN_AC = { MIN_CHARS: 1, DEBOUNCE_MS: 200, LIMIT: 12 };
  let vinTimer = null;
  let vinAbort = null;
  let vinItems = [];
  let vinOpen = false;
  let vinIndex = -1;
  let lastVinQ = "";

  function vinBox_() { return document.getElementById("supVinSuggest"); }

  function vinHide_() {
    const box = vinBox_();
    if (!box) return;
    vinOpen = false;
    vinIndex = -1;
    vinItems = [];
    box.classList.add("hidden");
    box.innerHTML = "";
  }

  function vinRender_() {
    const box = vinBox_();
    if (!box) return;
    if (!vinItems.length) return vinHide_();

    box.innerHTML = vinItems.map((vin, i) => {
      const active = i === vinIndex ? "active" : "";
      return `
        <div class="vsItem ${active}" data-idx="${i}" role="option" aria-selected="${i === vinIndex}">
          <div class="vsVin">${escapeHtml(vin)}</div>
          <div class="vsHint">Enter</div>
        </div>
      `;
    }).join("");

    box.classList.remove("hidden");
    vinOpen = true;
  }

  function vinSetIndex_(i) {
    vinIndex = Math.max(0, Math.min(i, vinItems.length - 1));
    vinRender_();
    const box = vinBox_();
    const el = box?.querySelector(`.vsItem[data-idx="${vinIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  async function vinFetch_(q) {
    try { vinAbort?.abort?.(); } catch {}
    vinAbort = new AbortController();

    try {
      if (supabaseEnabled()) {
        const items = await getVinSuggest(q, VIN_AC.LIMIT);
        return (items || []).map((item) => {
          if (typeof item === "object" && item !== null && item.vin) return String(item.vin).toUpperCase();
          return String(item || "").toUpperCase();
        }).filter(Boolean);
      }
    } catch (err) {
      console.warn("[supVinFetch_] Supabase error:", err.message);
    }

    // Fallback: Node API
    const url = `/api/vin-suggest?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(VIN_AC.LIMIT)}`;
    const r = await fetch(url, { signal: vinAbort.signal });
    const j = await r.json();
    if (!j?.ok) return [];
    return (Array.isArray(j.items) ? j.items : []).map((item) => {
      if (typeof item === "object" && item !== null && item.vin) return String(item.vin).toUpperCase();
      return String(item || "").toUpperCase();
    }).filter(Boolean);
  }

  function vinPick_(vin) {
    const input = document.getElementById("supVin");
    if (!input) return;
    input.value = String(vin || "").toUpperCase();
    vinHide_();
    onApply?.();
  }

  function vinOnInput_() {
    if (CORE.state.currentModule !== "SUPERVISOR") return;

    const input = document.getElementById("supVin");
    if (!input) return;

    const q = String(input.value || "").trim().toUpperCase();
    lastVinQ = q;

    if (!q || q.length < VIN_AC.MIN_CHARS) {
      vinHide_();
      return;
    }

    clearTimeout(vinTimer);
    vinTimer = setTimeout(async () => {
      try {
        const items = await vinFetch_(q);
        if (lastVinQ !== q) return;
        vinItems = items;
        vinIndex = vinItems.length ? 0 : -1;
        vinRender_();
      } catch {
        vinHide_();
      }
    }, VIN_AC.DEBOUNCE_MS);
  }

  function vinOnKeyDown_(e) {
    if (CORE.state.currentModule !== "SUPERVISOR") return;

    if (e.key === "Enter") {
      if (vinOpen && vinIndex >= 0 && vinItems[vinIndex]) {
        e.preventDefault();
        vinPick_(vinItems[vinIndex]);
      } else {
        e.preventDefault();
        vinHide_();
        onApply?.();
      }
      return;
    }

    if (!vinOpen) return;

    if (e.key === "ArrowDown") { e.preventDefault(); return vinSetIndex_(vinIndex + 1); }
    if (e.key === "ArrowUp") { e.preventDefault(); return vinSetIndex_(vinIndex - 1); }
    if (e.key === "Escape") { e.preventDefault(); return vinHide_(); }

    if (e.key === "Tab") {
      if (vinIndex >= 0 && vinItems[vinIndex]) {
        e.preventDefault();
        vinPick_(vinItems[vinIndex]);
      }
    }
  }

  const supVinEl = document.getElementById("supVin");
  const supVinSuggestEl = document.getElementById("supVinSuggest");

  supVinEl?.addEventListener("input", vinOnInput_);
  supVinEl?.addEventListener("keydown", vinOnKeyDown_);

  supVinSuggestEl?.addEventListener("mousedown", (e) => {
    const row = e.target.closest(".vsItem[data-idx]");
    if (!row) return;
    e.preventDefault();
    const idx = Number(row.dataset.idx);
    const vin = vinItems[idx];
    if (vin) vinPick_(vin);
  });

  document.addEventListener("click", (e) => {
    if (!vinOpen) return;
    const wrap = document.querySelector(".supVinWrap");
    if (wrap && wrap.contains(e.target)) return;
    vinHide_();
  });
}
