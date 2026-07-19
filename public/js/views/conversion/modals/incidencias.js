// =========================
// public/js/views/conversion/modals/incidencias.js
// Modal de incidencias (CALIDAD)
// - abre/cierra modal
// - autocomplete de técnicos (api/name-suggest)
// - guarda incidencia (api/incidencia)
// =========================

import {
  CORE, $, el_, ctx_, setOut, withLock, getJSON, postJSON, escapeHtml, getEmail
} from "../../../core/core.js";

import { createSuggest_ } from "../../../core/suggest.js";

import {
  renderActivas_, renderFinalizados_, patchVisibleCards_,
  rebuildListsFromStore_, snapshotNotasActivas_, restoreNotasActivas_,
} from "../../../work/index.js";

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

  cache: { ts: 0, items: [] }, // cache local para fallback del autocomplete
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

function incFotoCamInput() {
  return incEl("incFotoCam");
}

function incFotoFileInput() {
  return incEl("incFotoFile");
}

function clearIncFoto_() {
  INC.photo = null;

  const cam = incFotoCamInput();
  if (cam) cam.value = "";

  const fi = incFotoFileInput();
  if (fi) fi.value = "";

  const img = incFotoPreview();
  if (img) img.src = "";

  incFotoPreviewWrap()?.classList.add("hidden");
}

// iOS fix: usa createObjectURL en vez de FileReader+data URL para evitar
// el bug de crossOrigin en Safari iOS que taintea el canvas
async function imageFileToUploadPayload_(file) {
  // HEIC/HEIF (iPhone): Safari no puede dibujarlo en canvas → subir sin comprimir
  const isHeic = /heic|heif/i.test(file.type || "") || /\.heic$|\.heif$/i.test(file.name || "");
  if (isHeic) {
    const b64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(new Error("No se pudo leer el archivo HEIC."));
      r.readAsDataURL(file);
    });
    return {
      mimeType: file.type || "image/heic",
      b64,
      previewUrl: null,
      name: file.name || "incidencia.heic",
    };
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();

      const timeout = setTimeout(() => {
        reject(new Error("Timeout cargando imagen. Intenta de nuevo."));
      }, 15000);

      im.onload = () => {
        clearTimeout(timeout);
        resolve(im);
      };

      im.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("NO_SE_PUDO_ABRIR"));
      };

      // NO crossOrigin aquí: los object URLs son same-origin, no necesitan CORS
      // y ponerlo causaba que iOS Safari fallara o taintara el canvas
      im.src = objectUrl;
    });

    const maxW = 800;
    const maxH = 800;

    let width = img.naturalWidth || img.width || 0;
    let height = img.naturalHeight || img.height || 0;

    if (!width || !height) {
      throw new Error("No se pudo obtener dimensiones de la imagen.");
    }

    const ratio = Math.min(maxW / width, maxH / height, 1);
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D no disponible en este navegador.");
    }

    try {
      ctx.drawImage(img, 0, 0, w, h);
    } catch (err) {
      throw new Error(`Error dibujando en canvas: ${err?.message || err}`);
    }

    let outDataUrl;
    try {
      outDataUrl = canvas.toDataURL("image/jpeg", 0.55);
    } catch (err) {
      throw new Error(`Error generando imagen comprimida: ${err?.message || err}`);
    }

    const m = outDataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!m || !m[2]) {
      throw new Error("No se pudo procesar la imagen (base64 vacío).");
    }

    const b64 = m[2];
    const b64SizeMB = (b64.length * 0.75) / (1024 * 1024);
    if (b64SizeMB > 3.5) {
      throw new Error(`Imagen muy grande (${b64SizeMB.toFixed(1)}MB). Intenta con otra foto.`);
    }

    return {
      mimeType: "image/jpeg",
      b64,
      previewUrl: outDataUrl,
      name: (file.name || "incidencia.jpg").replace(/\.[^.]+$/, "") + ".jpg",
    };
  } catch (err) {
    // Cualquier fallo de canvas → subir original sin comprimir
    try { URL.revokeObjectURL(objectUrl); } catch {}
    const b64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(new Error("No se pudo leer el archivo."));
      r.readAsDataURL(file);
    });
    const dataUrl = `data:${file.type || "image/jpeg"};base64,${b64}`;
    return {
      mimeType: file.type || "image/jpeg",
      b64,
      previewUrl: dataUrl,
      name: file.name || "incidencia.jpg",
    };
  } finally {
    try { URL.revokeObjectURL(objectUrl); } catch {}
  }
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

    // ✅ Validación de tamaño en iPhone
    const maxSizeMB = 50;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      incSetMsg(`❌ Archivo muy grande (máx ${maxSizeMB}MB). Intenta con otra foto.`);
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
    const wrap = incFotoPreviewWrap();
    if (payload.previewUrl) {
      if (img) img.src = payload.previewUrl;
      wrap?.classList.remove("hidden");
    } else {
      // HEIC u otro sin preview: mostrar placeholder
      if (wrap) {
        wrap.classList.remove("hidden");
        wrap.innerHTML = `<div style="padding:12px;text-align:center;opacity:.7;">
          &#128247; ${escapeHtml(payload.name || "foto")}<br>
          <small>Vista previa no disponible en este dispositivo</small>
        </div>`;
      }
    }
    incSetMsg("");
  } catch (err) {
    console.error("[INC foto] ERROR:", err);
    incSetMsg("❌ No se pudo procesar la foto. " + String(err?.message || ""));
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

function incSelectHidden() {
  return incEl("incTech");
}

function incTitulo() {
  return incEl("incTitulo");
}

function incGravedadValue() {
  const checked = document.querySelector('input[name="incGravedad"]:checked');
  return checked ? checked.value : "";
}

function incGravedadReset_() {
  document.querySelectorAll('input[name="incGravedad"]').forEach(r => { r.checked = false; });
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

  const titulo = incTitulo();
  if (titulo) titulo.value = "";
  incGravedadReset_();

  const nota = incNota();
  if (nota) nota.value = "";

  incSetMsg("");
  incSetInfo("");

  techSug_?.hide();
  incRefreshSaveBtn_();
}

function incRefreshSaveBtn_() {
  const btn = incBtnSave();
  if (!btn) return;

  const okTech = !!INC.techSelected?.userId || !!INC.techSelected?.email;
  const okTitulo = !!String(incTitulo()?.value || "").trim();
  const okGravedad = !!incGravedadValue();

  btn.disabled = !(okTech && okTitulo && okGravedad);
}

// -----------------------------------------
// Suggest técnicos — widget compartido (core/suggest.js)
// Particularidades de este modal: fallback al cache local pre-cargado
// y filas .nsItem (estilo propio del modal de incidencias).
// -----------------------------------------
let techSug_ = null;

function norm_(s) {
  return String(s || "").trim().toLowerCase();
}

function hay_(u) {
  return norm_([u.name, u.email, u.label].filter(Boolean).join(" "));
}

function setSelectedTech_(u) {
  INC.techSelected = u || null;

  const input = incInputTech();
  if (input) {
    input.value = u ? String(u.name || "").trim() : "";
  }

  // select oculto (por compatibilidad / debug / futuro)
  const sel = incSelectHidden();
  if (sel) {
    sel.innerHTML = "";
    if (u) {
      const opt = document.createElement("option");
      opt.value = String(u.userId || u.email || "");
      opt.textContent = String(u.name || "").trim();
      opt.selected = true;
      sel.appendChild(opt);
    }
  }

  techSug_?.hide();
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

function createTechSuggest_() {
  return createSuggest_({
    input: "incTechInput",
    box: "incTechSuggest",
    guard: () => INC.open,
    min: 1,
    debounce: 180,
    limit: 12,
    async fetchFn(q) {
      const items = await fetchTechSuggest_(q);
      if (items.length || !INC.cache.items.length) return items;
      const qn = norm_(q);
      return INC.cache.items.filter((u) => hay_(u).includes(qn)).slice(0, 12);
    },
    renderItem(u, i, active) {
      return `
        <div class="nsItem${active ? " active" : ""}" data-sug-idx="${i}" role="option" aria-selected="${active}">
          <div class="nsTitle">${escapeHtml(String(u.name || "").trim())}</div>
        </div>
      `;
    },
    onPick: setSelectedTech_,
  });
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
    document.body.classList.add("modal-open"); // ✅ ADD
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
    // ✅ evita warning aria-hidden + focus
    const active = document.activeElement;
    if (active && modal.contains(active)) active.blur();

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }

  document.body.classList.remove("modal-open"); // ✅ ADD
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

  const titulo = String(incTitulo()?.value || "").trim();
  if (!titulo) {
    incSetMsg("Selecciona el tipo de incidencia.");
    return;
  }

  const gravedad = incGravedadValue().toUpperCase();
  if (!["LEVE", "MODERADA", "CRITICA"].includes(gravedad)) {
    incSetMsg("Selecciona la gravedad.");
    return;
  }

  const tech = INC.techSelected;
  if (!tech || (!tech.userId && !tech.email)) {
    incSetMsg("Selecciona un técnico de la lista.");
    return;
  }

  const notaExtra = String(incNota()?.value || "").trim();
  const nota = notaExtra ? `${titulo}\n${notaExtra}` : titulo;

  const it = INC.item;
  const payload = {
    email,
    conversionId: String(it.conversionId || "").trim(),
    vin: String(it.vin || "").trim().toUpperCase(),
    rolTrabajo: "CALIDAD",

    tecnicoUserId: String(tech.userId || "").trim(),
    tecnicoEmail: String(tech.email || "").trim(),
    tecnicoNombre: String(tech.name || "").trim(),

    tipo: gravedad,
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
    const errMsg = String(e?.message || e || "Error desconocido");
    incSetMsg(`❌ Error: ${errMsg}`);
    setOut({ ok: false, error: errMsg });
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
        else if (gravedad === "LEVE") next.inc_leve = Number(next.inc_leve || 0) + 1;

        if (maybeItem.inc_moderada != null) next.inc_moderada = Number(maybeItem.inc_moderada || 0);
        else if (gravedad === "MODERADA") next.inc_moderada = Number(next.inc_moderada || 0) + 1;

        if (maybeItem.inc_critica != null) next.inc_critica = Number(maybeItem.inc_critica || 0);
        else if (gravedad === "CRITICA") next.inc_critica = Number(next.inc_critica || 0) + 1;

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

  // técnico autocomplete (widget compartido de core/suggest.js)
  techSug_ = createTechSuggest_();
  techSug_.bind();
  // escribir después de elegir invalida la selección real
  incInputTech()?.addEventListener("input", () => {
    INC.techSelected = null;
    incRefreshSaveBtn_();
  });

    // foto
  // --------------------------
  // FOTO: 2 botones (cam / file) + 2 inputs hidden
  // --------------------------
  incEl("btnIncFotoCam")?.addEventListener("click", () => {
    incSetMsg("");
    incFotoCamInput()?.click();
  });

  incEl("btnIncFotoFile")?.addEventListener("click", () => {
    incSetMsg("");
    incFotoFileInput()?.click();
  });

  // cambios de archivos
  incFotoCamInput()?.addEventListener("change", onIncFotoChange_);
  incFotoFileInput()?.addEventListener("change", onIncFotoChange_);

  // quitar foto
  incEl("btnIncFotoClear")?.addEventListener("click", () => {
    clearIncFoto_();
    incSetMsg("");
  });

  // titulo / gravedad / nota
  incTitulo()?.addEventListener("change", () => {
    incSetMsg("");
    incRefreshSaveBtn_();
  });

  document.querySelectorAll('input[name="incGravedad"]').forEach(r => {
    r.addEventListener("change", () => {
      incSetMsg("");
      incRefreshSaveBtn_();
    });
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