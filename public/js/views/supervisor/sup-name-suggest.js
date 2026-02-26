// =========================
// public/js/views/supervisor/sup-name-suggest.js
// NAME SUGGEST (ligero) + aplica reporte bajo demanda
// =========================

export function bindSupNameSuggest_({
  CORE,
  escapeHtml,
  onApply
}) {
  const NAME_AC = { MIN_CHARS: 3, DEBOUNCE_MS: 750, LIMIT: 12 };
  let nameTimer = null;
  let nameAbort = null;
  let nameItems = [];
  let nameOpen = false;
  let nameIndex = -1;
  let lastNameQ = "";

  function nameBox_() { return document.getElementById("supNameSuggest"); }

  function nameHide_() {
    const box = nameBox_();
    if (!box) return;
    nameOpen = false;
    nameIndex = -1;
    nameItems = [];
    box.classList.add("hidden");
    box.innerHTML = "";
  }

  function nameRender_() {
    const box = nameBox_();
    if (!box) return;
    if (!nameItems.length) return nameHide_();

    box.innerHTML = nameItems.map((it, i) => {
      const active = i === nameIndex ? "active" : "";
      const label = it.name || it.email || it.id || "";
      const hint = it.email ? it.email : "";
      return `
        <div class="vsItem ${active}" data-idx="${i}" role="option" aria-selected="${i === nameIndex}">
          <div class="vsVin">${escapeHtml(label)}</div>
          <div class="vsHint">${escapeHtml(hint)}</div>
        </div>
      `;
    }).join("");

    box.classList.remove("hidden");
    nameOpen = true;
  }

  function nameSetIndex_(i) {
    nameIndex = Math.max(0, Math.min(i, nameItems.length - 1));
    nameRender_();
    const box = nameBox_();
    const el = box?.querySelector(`.vsItem[data-idx="${nameIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  async function nameFetch_(q) {
    try { nameAbort?.abort?.(); } catch {}
    nameAbort = new AbortController();

    const url = `/api/name-suggest?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(NAME_AC.LIMIT)}`;
    const r = await fetch(url, { signal: nameAbort.signal });
    const j = await r.json();
    if (!j?.ok) return [];
    const arr = Array.isArray(j.items) ? j.items : [];
    return arr.map((x) => (typeof x === "string" ? ({ name: x }) : x)).filter(Boolean);
  }

  function namePick_(it) {
    const input = document.getElementById("supName");
    if (!input) return;

    const label = String(it?.name || it?.email || it?.id || "").trim();
    input.value = label;
    nameHide_();

    onApply?.();
  }

  function nameOnInput_() {
    if (CORE.state.currentModule !== "SUPERVISOR") return;

    const input = document.getElementById("supName");
    if (!input) return;

    const q = String(input.value || "").trim();
    lastNameQ = q;

    if (!q || q.length < NAME_AC.MIN_CHARS) {
      nameHide_();
      return;
    }

    clearTimeout(nameTimer);
    nameTimer = setTimeout(async () => {
      try {
        const items = await nameFetch_(q);
        if (lastNameQ !== q) return;
        nameItems = items;
        nameIndex = nameItems.length ? 0 : -1;
        nameRender_();
      } catch {
        nameHide_();
      }
    }, NAME_AC.DEBOUNCE_MS);
  }

  function nameOnKeyDown_(e) {
    if (CORE.state.currentModule !== "SUPERVISOR") return;

    if (e.key === "Enter") {
      e.preventDefault();
      nameHide_();
      onApply?.();
      return;
    }

    if (!nameOpen) return;

    if (e.key === "ArrowDown") { e.preventDefault(); return nameSetIndex_(nameIndex + 1); }
    if (e.key === "ArrowUp") { e.preventDefault(); return nameSetIndex_(nameIndex - 1); }
    if (e.key === "Escape") { e.preventDefault(); return nameHide_(); }

    if (e.key === "Tab") {
      if (nameIndex >= 0 && nameItems[nameIndex]) {
        e.preventDefault();
        namePick_(nameItems[nameIndex]);
      }
    }
  }

  const supNameEl = document.getElementById("supName");
  const supNameSuggestEl = document.getElementById("supNameSuggest");

  supNameEl?.addEventListener("input", nameOnInput_);
  supNameEl?.addEventListener("keydown", nameOnKeyDown_);

  supNameSuggestEl?.addEventListener("mousedown", (e) => {
    const row = e.target.closest(".vsItem[data-idx]");
    if (!row) return;
    e.preventDefault();
    const idx = Number(row.dataset.idx);
    const it = nameItems[idx];
    if (it) namePick_(it);
  });

  document.addEventListener("click", (e) => {
    if (!nameOpen) return;
    const wrap = document.querySelector(".supNameWrap");
    if (wrap && wrap.contains(e.target)) return;
    nameHide_();
  });
}