// Generic autocomplete/suggest widget factory.
// Handles state, debounce, keyboard nav, and click-outside for all suggest widgets.

import { escapeHtml } from "./format.js";

/**
 * @param {object}        opts
 * @param {string|Element} opts.input       — input el or ID
 * @param {string|Element} opts.box         — dropdown container el or ID
 * @param {Function}      opts.fetchFn      — async (q, limit) => items[]
 * @param {Function}      opts.renderItem   — (item, i, isActive) => html string
 * @param {Function}      opts.onPick       — (item) => void
 * @param {Function}      [opts.guard]      — () => bool; return false to suppress
 * @param {number}        [opts.min=1]      — min chars before fetch
 * @param {number}        [opts.debounce=200]
 * @param {number}        [opts.limit=12]
 */
export function createSuggest_({ input, box, fetchFn, renderItem, onPick, guard, min = 1, debounce = 200, limit = 12 }) {
  let timer = null, items = [], idx = -1, open = false, lastQ = "";

  const inp_ = () => typeof input === "string" ? document.getElementById(input) : input;
  const box_ = () => typeof box === "string" ? document.getElementById(box) : box;

  function hide() {
    open = false; idx = -1; items = [];
    const b = box_();
    if (b) { b.classList.add("hidden"); b.innerHTML = ""; }
  }

  function render() {
    const b = box_();
    if (!b || !items.length) { hide(); return; }
    b.innerHTML = items.map((item, i) => renderItem(item, i, i === idx)).join("");
    b.classList.remove("hidden");
    open = true;
    if (idx >= 0) b.querySelector(`[data-sug-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function setIdx(i) {
    idx = Math.max(0, Math.min(i, items.length - 1));
    render();
  }

  function pick(item) {
    hide();
    onPick(item);
  }

  function onInput() {
    if (guard && !guard()) return;
    const q = String(inp_()?.value || "").trim().toUpperCase();
    lastQ = q;
    if (!q || q.length < min) { hide(); return; }
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const res = await fetchFn(q, limit);
        if (lastQ !== q) return;
        items = res || [];
        idx = items.length ? 0 : -1;
        render();
      } catch { hide(); }
    }, debounce);
  }

  function onKeyDown(e) {
    if (guard && !guard()) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(idx + 1); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setIdx(Math.max(0, idx - 1)); return; }
    if (e.key === "Escape")    { e.preventDefault(); hide(); return; }
    if ((e.key === "Tab" || e.key === "Enter") && open && idx >= 0 && items[idx]) {
      e.preventDefault();
      pick(items[idx]);
    }
  }

  function onBoxMouseDown(e) {
    const row = e.target.closest("[data-sug-idx]");
    if (!row) return;
    e.preventDefault();
    const i = Number(row.dataset.sugIdx);
    if (items[i] != null) pick(items[i]);
  }

  function onDocClick(e) {
    if (!open) return;
    if (inp_()?.contains(e.target)) return;
    if (box_()?.contains(e.target)) return;
    hide();
  }

  function bind() {
    const inp = inp_();
    const b = box_();
    if (inp) { inp.addEventListener("input", onInput); inp.addEventListener("keydown", onKeyDown); }
    b?.addEventListener("mousedown", onBoxMouseDown);
    document.addEventListener("click", onDocClick);
  }

  function destroy() {
    clearTimeout(timer);
    const inp = inp_();
    const b = box_();
    if (inp) { inp.removeEventListener("input", onInput); inp.removeEventListener("keydown", onKeyDown); }
    b?.removeEventListener("mousedown", onBoxMouseDown);
    document.removeEventListener("click", onDocClick);
    hide();
  }

  return { bind, hide, destroy, isOpen: () => open };
}

// ── VIN suggest ───────────────────────────────────────────────────────────────
// Fetches from /api/vin-suggest. Items: { vin, modelo }.
export function createVinSuggest_({ input, box, onPick, guard, min = 1, debounce = 200, limit = 12 }) {
  return createSuggest_({
    input, box, guard, min, debounce, limit,
    async fetchFn(q, lim) {
      try {
        const res = await fetch(`/api/vin-suggest?q=${encodeURIComponent(q)}&limit=${lim}`);
        if (!res.ok) return [];
        const j = await res.json();
        return (j?.items || []).map(it => ({
          vin:    String(typeof it === "object" ? (it.vin || "") : it).toUpperCase(),
          modelo: it?.modelo || null,
        })).filter(it => it.vin);
      } catch { return []; }
    },
    renderItem(item, i, active) {
      return `<div class="vsItem${active ? " active" : ""}" data-sug-idx="${i}" role="option" aria-selected="${active}">
        <div class="vsVin">${escapeHtml(item.vin)}</div>
        ${item.modelo ? `<div class="vsHint">${escapeHtml(item.modelo)}</div>` : ""}
      </div>`;
    },
    onPick,
  });
}

// ── Name suggest ──────────────────────────────────────────────────────────────
// Fetches from /api/name-suggest. Items: { userId, name, email, label }.
export function createNameSuggest_({ input, box, onPick, guard, min = 1, debounce = 200, limit = 12 }) {
  return createSuggest_({
    input, box, guard, min, debounce, limit,
    async fetchFn(q, lim) {
      try {
        const res = await fetch(`/api/name-suggest?q=${encodeURIComponent(q)}&limit=${lim}`);
        if (!res.ok) return [];
        const j = await res.json();
        if (!j?.ok) return [];
        return (j?.items || []).map(x => ({
          userId: String(x.userId || x.id   || "").trim(),
          name:   String(x.name   || x.nombre || "").trim(),
          email:  String(x.email  || "").trim(),
          label:  String(x.label  || "").trim(),
        }));
      } catch { return []; }
    },
    renderItem(item, i, active) {
      const label = item.name || item.email || "";
      const hint  = item.name && item.email ? item.email : "";
      return `<div class="vsItem${active ? " active" : ""}" data-sug-idx="${i}" role="option" aria-selected="${active}">
        <div class="vsVin">${escapeHtml(label)}</div>
        ${hint ? `<div class="vsHint">${escapeHtml(hint)}</div>` : ""}
      </div>`;
    },
    onPick,
  });
}
