// =========================
// public/js/views/conversion/incidencias.js
// Modal de incidencias (CALIDAD)
// - abre/cierra modal
// - autocomplete de técnicos (api/name-suggest)
// - guarda incidencia (api/incidencia)
// =========================

import {
  CORE, $, el_, ctx_, setOut, withLock, getJSON, postJSON, escapeHtml, getEmail
} from "../../core/core.js";

import {
  renderActivas_, renderFinalizados_, patchVisibleCards_,
  rebuildListsFromStore_, snapshotNotasActivas_, restoreNotasActivas_,
} from "../../core/render-work.js";

// -----------------------------------------
// Estado local del modal
// -----------------------------------------
const INC = {
  open: false,
  itemKey: "",
  item: null,
  // foto incidencia (1 foto)
  photo: null, // { b64, mimeType, name, previewUrl }
  // técnico seleccionado real
  techSelected: null, // { userId, name, email, label }

  // suggest
  sugItems: [],
  sugOpen: false,
  sugIdx: -1,
  sugTimer: null,
  lastQ: "",
  cache: { ts: 0, items: [] }, // cache local opcional
};

const INC_TECH_CACHE_TTL = 10 * 60 * 1000; // 10 min

// -----------------------------------------
// Helpers UI
// -----------------------------------------

function incFotoInput() {
  return incEl("incFotoInput");
}

function incFotoPreview() {
  return incEl("incFotoPreview");
}

function incFotoPreviewWrap() {
  return incEl("incFotoPreviewWrap");
}

function clearIncFoto_() {
  INC.photo = null;

  const fi = incFotoInput();
  if (fi) fi.value = "";

  const img = incFotoPreview();
  if (img) img.src = "";

  incFotoPreviewWrap()?.classList.add("hidden");
}

function fileToDataUrl_(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function loadImage_(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ✅ comprime y redimensiona para que no reviente el body (base64 crece bastante)
async function imageFileToUploadPayload_(file) {
  const dataUrl = await fileToDataUrl_(file);
  const img = await loadImage_(dataUrl);

  const maxW = 1600;
  const maxH = 1600;

  let { width, height } = img;
  const ratio = Math.min(maxW / width, maxH / height, 1);
  const w = Math.round(width * ratio);
  const h = Math.round(height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  // Siempre jpg para estandarizar
  const outDataUrl = canvas.toDataURL("image/jpeg", 0.82);
  const m = outDataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!m) throw new Error("No se pudo procesar la imagen.");

  return {
    mimeType: "image/jpeg",
    b64: m[2],
    previewUrl: outDataUrl,
    name: (file.name || "incidencia.jpg").replace(/\.[^.]+$/, "") + ".jpg",
  };
}

async function onIncFotoChange_(e) {
  try {
    const file = e.target?.files?.[0];
    if (!file) {
      clearIncFoto_();
      return;
    }

    if (!String(file.type || "").startsWith("image/")) {
      incSetMsg("Solo se permiten imágenes.");
      clearIncFoto_();
      return;
    }

    incSetMsg("Procesando foto...");
    const payload = await imageFileToUploadPayload_(file);

    INC.photo = {
      b64: payload.b64,
      mimeType: payload.mimeType,
      name: payload.name,
      previewUrl: payload.previewUrl,
    };

    const img = incFotoPreview();
    if (img) img.src = payload.previewUrl;

    incFotoPreviewWrap()?.classList.remove("hidden");
    incSetMsg("");
  } catch (err) {
    console.error("[INC foto] ERROR:", err);
    incSetMsg("❌ No se pudo procesar la foto.");
    clearIncFoto_();
  }
}

function incEl(id) {
  return document.getElementById(id);
}

function incSetMsg(t) {
  const el = incEl("incMsg");
  if (el) el.textContent = String(t || "");
}

function incSetInfo(t) {
  const el = incEl("incInfo");
  if (el) el.textContent = String(t || "");
}

function incModal() {
  return incEl("incModal");
}

function incBtnSave() {
  return incEl("btnIncSave");
}

function incInputTech() {
  return incEl("incTechInput");
}

function incSuggestBox() {
  return incEl("incTechSuggest");
}

function incSelectHidden() {
  return incEl("incTech");
}

function incTipo() {
  return incEl("incTipo");
}

function incNota() {
  return incEl("incNota");
}

function resetIncForm_() {
  clearIncFoto_();
  INC.itemKey = "";
  INC.item = null;
  INC.techSelected = null;

  const ti = incInputTech();
  if (ti) ti.value = "";

  const sel = incSelectHidden();
  if (sel) sel.innerHTML = "";

  const tipo = incTipo();
  if (tipo) tipo.value = "";

  const nota = incNota();
  if (nota) nota.value = "";

  incSetMsg("");
  incSetInfo("");

  incSuggestHide_();
  incRefreshSaveBtn_();
}

function incRefreshSaveBtn_() {
  const btn = incBtnSave();
  if (!btn) return;

  const okTech = !!INC.techSelected?.userId || !!INC.techSelected?.email;
  const okTipo = !!String(incTipo()?.value || "").trim();

  btn.disabled = !(okTech && okTipo);
}

// -----------------------------------------
// Suggest técnicos (autocomplete)
// -----------------------------------------
function norm_(s) {
  return String(s || "").trim().toLowerCase();
}

function hay_(u) {
  return norm_([u.name, u.email, u.label].filter(Boolean).join(" "));
}

function incSuggestHide_() {
  const box = incSuggestBox();
  if (!box) return;
  INC.sugOpen = false;
  INC.sugIdx = -1;
  INC.sugItems = [];
  box.classList.add("hidden");
  box.innerHTML = "";
}

function incSuggestRender_() {
  const box = incSuggestBox();
  if (!box) return;

  if (!INC.sugItems.length) {
    incSuggestHide_();
    return;
  }

  box.innerHTML = INC.sugItems.map((u, i) => {
    const active = i === INC.sugIdx ? "active" : "";
    const label = u.label || [u.name, u.email].filter(Boolean).join(" - ");
    const sub = [u.name, u.email].filter(Boolean).join(" • ");

    return `
      <div class="nsItem ${active}" data-idx="${i}" role="option" aria-selected="${i === INC.sugIdx}">
        <div class="nsTitle">${escapeHtml(label)}</div>
        <div class="nsSub small">${escapeHtml(sub)}</div>
      </div>
    `;
  }).join("");

  box.classList.remove("hidden");
  INC.sugOpen = true;
}

function incSuggestSetIdx_(i) {
  if (!INC.sugItems.length) return;
  INC.sugIdx = Math.max(0, Math.min(i, INC.sugItems.length - 1));
  incSuggestRender_();

  const box = incSuggestBox();
  const el = box?.querySelector(`.nsItem[data-idx="${INC.sugIdx}"]`);
  if (el) el.scrollIntoView({ block: "nearest" });
}

function setSelectedTech_(u) {
  INC.techSelected = u || null;

  const input = incInputTech();
  if (input) {
    input.value = u ? (u.label || [u.name, u.email].filter(Boolean).join(" - ")) : "";
  }

  // select oculto (por compatibilidad / debug / futuro)
  const sel = incSelectHidden();
  if (sel) {
    sel.innerHTML = "";
    if (u) {
      const opt = document.createElement("option");
      opt.value = String(u.userId || u.email || "");
      opt.textContent = u.label || [u.name, u.email].filter(Boolean).join(" - ");
      opt.selected = true;
      sel.appendChild(opt);
    }
  }

  incSuggestHide_();
  incRefreshSaveBtn_();
}

async function fetchTechSuggest_(q) {
  const qq = String(q || "").trim();
  if (!qq) return [];

  const j = await getJSON(`/api/name-suggest?q=${encodeURIComponent(qq)}&limit=12`);
  if (!j?.ok) return [];

  const items = Array.isArray(j.items) ? j.items : [];
  return items.map((x) => ({
    userId: String(x.userId || x.id || "").trim(),
    name: String(x.name || x.nombre || "").trim(),
    email: String(x.email || "").trim(),
    label: String(x.label || "").trim(),
  }));
}

function onIncTechInput_() {
  const input = incInputTech();
  if (!input) return;

  const q = String(input.value || "").trim();
  INC.lastQ = q;

  // si escribió algo después de elegir => limpia selección real
  INC.techSelected = null;
  incRefreshSaveBtn_();

  if (!q) {
    incSuggestHide_();
    return;
  }

  clearTimeout(INC.sugTimer);
  INC.sugTimer = setTimeout(async () => {
    try {
      const items = await fetchTechSuggest_(q);
      if (INC.lastQ !== q) return;

      // si no hay match remoto, intenta cache local (opcional)
      let out = items;
      if (!out.length && INC.cache.items.length) {
        const qn = norm_(q);
        out = INC.cache.items.filter((u) => hay_(u).includes(qn)).slice(0, 12);
      }

      INC.sugItems = out;
      INC.sugIdx = out.length ? 0 : -1;
      incSuggestRender_();
    } catch {
      incSuggestHide_();
    }
  }, 180);
}

function onIncTechKeyDown_(e) {
  if (!INC.sugOpen) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    incSuggestSetIdx_(INC.sugIdx + 1);
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    incSuggestSetIdx_(INC.sugIdx - 1);
    return;
  }
  if (e.key === "Enter") {
    if (INC.sugIdx >= 0 && INC.sugItems[INC.sugIdx]) {
      e.preventDefault();
      setSelectedTech_(INC.sugItems[INC.sugIdx]);
    }
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    incSuggestHide_();
  }
}

// -----------------------------------------
// Open / Close modal
// -----------------------------------------
function getItemFromKey_(k) {
  const c = ctx_();
  return c.itemsByKey.get(String(k || "")) || null;
}

function buildIncInfoText_(it) {
  const vin = String(it?.vin || "").trim().toUpperCase();
  const cid = String(it?.conversionId || "").trim();
  const l = Number(it?.inc_leve || 0);
  const m = Number(it?.inc_moderada || 0);
  const c = Number(it?.inc_critica || 0);

  return `VIN: ${vin || "-"} | OT: ${cid || "-"} | Acumulado → L:${l} M:${m} C:${c}`;
}

export async function openIncidenciaModalForKey_(itemKey) {
  if (CORE.state.currentModule !== "CALIDAD") return;

  const it = getItemFromKey_(itemKey);
  if (!it) {
    setOut({ ok: false, error: "No se encontró el trabajo para registrar incidencia." });
    return;
  }

  resetIncForm_();

  INC.itemKey = String(itemKey || "");
  INC.item = it;

  incSetInfo(buildIncInfoText_(it));
  incSetMsg("");

  const modal = incModal();
  if (modal) {
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  }
  INC.open = true;

  // Pre-carga ligera de lista base para que el autocomplete responda rápido
  try {
    const now = Date.now();
    if (!INC.cache.items.length || (now - INC.cache.ts) > INC_TECH_CACHE_TTL) {
      const j = await getJSON(`/api/name-suggest?q=.&limit=120`);
      if (j?.ok) {
        INC.cache.items = (Array.isArray(j.items) ? j.items : []).map((x) => ({
          userId: String(x.userId || x.id || "").trim(),
          name: String(x.name || x.nombre || "").trim(),
          email: String(x.email || "").trim(),
          label: String(x.label || "").trim(),
        }));
        INC.cache.ts = now;
      }
    }
  } catch {}

  setTimeout(() => incInputTech()?.focus(), 0);
}

export async function closeIncidenciaModal_() {
  const modal = incModal();
  if (modal) {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }
  INC.open = false;
  resetIncForm_();
}

// -----------------------------------------
// Save incidencia
// -----------------------------------------
async function saveIncidencia_() {
  if (CORE.state.currentModule !== "CALIDAD") return;
  if (!INC.item) return;

  const email = String(getEmail?.() || "").trim().toLowerCase();
  if (!email) {
    incSetMsg("No hay email de sesión.");
    setOut({ ok: false, error: "No hay email de sesión." });
    return;
  }

  const tipo = String(incTipo()?.value || "").trim().toUpperCase();
  if (!["LEVE", "MODERADA", "CRITICA"].includes(tipo)) {
    incSetMsg("Selecciona el tipo de incidencia.");
    return;
  }

  const tech = INC.techSelected;
  if (!tech || (!tech.userId && !tech.email)) {
    incSetMsg("Selecciona un técnico de la lista.");
    return;
  }

  const nota = String(incNota()?.value || "").trim();

  const it = INC.item;
  const payload = {
    email,
    conversionId: String(it.conversionId || "").trim(),
    vin: String(it.vin || "").trim().toUpperCase(),
    rolTrabajo: "CALIDAD",

    tecnicoUserId: String(tech.userId || "").trim(),
    tecnicoEmail: String(tech.email || "").trim(),
    tecnicoNombre: String(tech.name || "").trim(),

    tipo,
    nota,

        // ✅ foto opcional (1 por incidencia)
    foto: INC.photo
      ? {
          b64: INC.photo.b64,
          mimeType: INC.photo.mimeType,
          name: INC.photo.name,
        }
      : null,
  };

  let j;
  try {
    // ✅ sin postJSON_user, porque ya estás en withLock()
    j = await postJSON("/api/incidencia", payload);
    setOut(j);
  } catch (e) {
    console.error("[INC save] ERROR:", e);
    incSetMsg(`❌ ${String(e?.message || e || "Error de red")}`);
    setOut({ ok: false, error: String(e?.message || e || "Error de red") });
    return;
  }

  if (!j || typeof j !== "object") {
    incSetMsg("❌ Respuesta inválida del servidor.");
    setOut({ ok: false, error: "Respuesta inválida del servidor", raw: j });
    return;
  }

  if (!j.ok) {
    const msg = j.error || j.message || JSON.stringify(j);
    incSetMsg(`❌ ${msg}`);
    return;
  }

  // patch de contadores (igual que tu lógica)
  try {
    const c = ctx_();
    const maybeItem = j.item || j.data || j.row || null;

    if (maybeItem && (maybeItem.conversionId || maybeItem.vin)) {
      const current = c.itemsByKey.get(INC.itemKey);
      if (current) {
        const next = { ...current };

        if (maybeItem.inc_leve != null) next.inc_leve = Number(maybeItem.inc_leve || 0);
        else if (tipo === "LEVE") next.inc_leve = Number(next.inc_leve || 0) + 1;

        if (maybeItem.inc_moderada != null) next.inc_moderada = Number(maybeItem.inc_moderada || 0);
        else if (tipo === "MODERADA") next.inc_moderada = Number(next.inc_moderada || 0) + 1;

        if (maybeItem.inc_critica != null) next.inc_critica = Number(maybeItem.inc_critica || 0);
        else if (tipo === "CRITICA") next.inc_critica = Number(next.inc_critica || 0) + 1;

        c.itemsByKey.set(INC.itemKey, next);

        const snap = snapshotNotasActivas_();
        rebuildListsFromStore_();
        renderActivas_();
        renderFinalizados_();
        restoreNotasActivas_(snap);
      }
    }
  } catch (e) {
    console.warn("[INC patch local] warning:", e);
  }

  incSetMsg("✅ Incidencia registrada.");
  setTimeout(() => {
    closeIncidenciaModal_().catch(() => {});
  }, 350);
}

// -----------------------------------------
// Bind once
// -----------------------------------------
export function initIncidenciasUI_() {
  const modal = incModal();
  if (!modal) return;
  if (modal.dataset.bound === "1") return;
  modal.dataset.bound = "1";

  // cerrar
  incEl("btnCloseInc")?.addEventListener("click", () => {
    closeIncidenciaModal_().catch(() => {});
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeIncidenciaModal_().catch(() => {});
    }
  });

  // técnico autocomplete
  incInputTech()?.addEventListener("input", onIncTechInput_);
  incInputTech()?.addEventListener("keydown", onIncTechKeyDown_);

    // foto
  incFotoInput()?.addEventListener("change", onIncFotoChange_);
  incEl("btnIncFotoClear")?.addEventListener("click", () => {
    clearIncFoto_();
    incSetMsg("");
  });

  incSuggestBox()?.addEventListener("mousedown", (e) => {
    const row = e.target.closest(".nsItem[data-idx]");
    if (!row) return;
    e.preventDefault();
    const idx = Number(row.dataset.idx);
    const u = INC.sugItems[idx];
    if (u) setSelectedTech_(u);
  });

  document.addEventListener("click", (e) => {
    if (!INC.open || !INC.sugOpen) return;
    const wrap = incInputTech()?.closest(".supNameWrap");
    if (wrap && wrap.contains(e.target)) return;
    incSuggestHide_();
  });

  // tipo / nota
  incTipo()?.addEventListener("change", () => {
    incSetMsg("");
    incRefreshSaveBtn_();
  });

  incNota()?.addEventListener("input", () => {
    incSetMsg("");
  });

  // guardar
  incBtnSave()?.addEventListener("click", async () => {
    await withLock(async () => {
      await saveIncidencia_();
    }, "Guardando incidencia...");
  });

  // ESC
  document.addEventListener("keydown", (e) => {
    if (!INC.open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeIncidenciaModal_().catch(() => {});
    }
  });
}