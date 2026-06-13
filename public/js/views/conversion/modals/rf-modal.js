// public/js/views/conversion/modals/rf-modal.js
import { CORE, setOut, postJSON } from "../../../core/core.js";
import { showUploaderView } from "../../uploader/uploader.js";
import { hideUploaderView } from "../../uploader/uploader.js";

const RF = { open: false, vin: "" };

const rfEl = (id) => document.getElementById(id);
const rfModal = () => rfEl("rfModal");

function rfSetInfo(t) { const el = rfEl("rfInfo"); if (el) el.textContent = String(t || ""); }
function rfSetMsg(t)  { const el = rfEl("rfMsg");  if (el) el.textContent = String(t || ""); }

function rfShowMenu_() {
  try { hideUploaderView({ mountId: "rfUploaderMount" }); } catch {}

  rfEl("rfMenu") && (rfEl("rfMenu").style.display = "block");
  rfEl("rfStage") && (rfEl("rfStage").style.display = "none");
  if (rfEl("rfStage")) rfEl("rfStage").innerHTML = "";
}

function rfOpenStage_(screen) {
  const menu = rfEl("rfMenu");
  const stage = rfEl("rfStage");
  if (!stage) return;

  if (menu) menu.style.display = "none";
  stage.style.display = "block";

  stage.innerHTML = `
    <div class="row" style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <button type="button" id="btnRfBack" class="btn" style="height:44px; padding:0 14px; font-weight:900;">
        ← Volver
      </button>
      <div class="pill small" style="opacity:.95;">
        ${screen === "calidad" ? "CONTROL CALIDAD" : "REGISTRAR FALLA"}
      </div>
    </div>

    <div id="rfUploaderMount"></div>
  `;

  stage.querySelector("#btnRfBack")?.addEventListener("click", rfShowMenu_);

  showUploaderView({ vin: RF.vin, screen, mountId: "rfUploaderMount" });
}

async function rfOpenSoldadura_() {
  const menu = rfEl("rfMenu");
  const stage = rfEl("rfStage");
  if (!stage) return;

  if (menu) menu.style.display = "none";
  stage.style.display = "block";
  stage.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:12px;">
      <button type="button" id="btnRfBackSold" class="btn" style="height:44px; padding:0 14px; font-weight:900;">← Volver</button>
      <div class="pill small" style="opacity:.95;">FOTOS DE SOLDADURA</div>
    </div>
    <div id="rfSoldLoadMsg" class="small" style="text-align:center; opacity:.7; padding:16px 0;">Cargando fotos...</div>
    <div id="rfSoldGrid" style="display:none;"></div>
  `;

  stage.querySelector("#btnRfBackSold")?.addEventListener("click", rfShowMenu_);

  const LABELS = {
    sold_sensor_antes: "🛢️ Sensor nivel — ANTES",
    sold_sensor_post:  "🛢️ Sensor nivel — DESPUÉS",
    sold_cabina_antes: "🚗 Cabina — ANTES",
    sold_cabina_post:  "🚗 Cabina — DESPUÉS",
  };

  try {
    const today = new Date().toISOString().slice(0, 10);
    let res = await postJSON("/api/uploader/proxy", { action: "getStatus", vin: RF.vin, dateStr: today });
    // Si no hay fotos en el mes actual, buscar en el mes anterior
    const hasSoldPhotos = Object.values(res?.status || {})
      .some((v, _, arr) => arr.some(Boolean));
    if (!hasSoldPhotos) {
      const prev = new Date();
      prev.setMonth(prev.getMonth() - 1);
      const prevStr = prev.toISOString().slice(0, 10);
      const res2 = await postJSON("/api/uploader/proxy", { action: "getStatus", vin: RF.vin, dateStr: prevStr });
      if (Object.values(res2?.status || {}).some(Boolean)) res = res2;
    }
    const previews = res?.previews || {};
    const status   = res?.status   || {};

    const msgEl  = rfEl("rfSoldLoadMsg");
    const gridEl = rfEl("rfSoldGrid");
    if (!msgEl || !gridEl) return;

    msgEl.style.display = "none";
    gridEl.style.display = "grid";
    gridEl.style.gridTemplateColumns = "1fr 1fr";
    gridEl.style.gap = "10px";

    let html = "";
    for (const slot of Object.keys(LABELS)) {
      const label = LABELS[slot];
      const has   = status[slot];
      const url   = previews[slot]?.imgUrl || "";
      html += `
        <div style="background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.15); border-radius:10px; padding:10px; text-align:center;">
          <div class="small" style="font-weight:700; margin-bottom:6px;">${label}</div>
          ${has && url
            ? `<a href="${url}" target="_blank" rel="noopener noreferrer">
                 <img src="${url}" alt="${label}" loading="lazy"
                   style="width:100%; max-height:160px; object-fit:cover; border-radius:8px; cursor:zoom-in;">
               </a>`
            : `<div style="width:100%; height:100px; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.2); border-radius:8px; color:rgba(255,255,255,.4); font-size:12px;">Sin foto</div>`
          }
        </div>
      `;
    }
    gridEl.innerHTML = html;
  } catch (err) {
    const msgEl = rfEl("rfSoldLoadMsg");
    if (msgEl) msgEl.textContent = "No se pudieron cargar las fotos.";
    console.warn("[rfSoldadura] Error:", err);
  }
}

export function openRFModalForVin_(vin) {
  if (CORE.state.currentModule !== "CALIDAD") return;

  const v = String(vin || "").trim().toUpperCase();
  if (!v) {
    setOut({ ok:false, error:"VIN vacío para RF modal." });
    return;
  }

  RF.vin = v;
  RF.open = true;

  rfSetInfo(`VIN: ${v}`);
  rfSetMsg("");

  const modal = rfModal();
  if (modal) {
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  rfShowMenu_(); // ✅ siempre abre mostrando menú
}

// Abre el modal directamente en el stage de soldadura (sin pasar por menú)
export function openRFSoldaduraForVin_(vin) {
  const v = String(vin || "").trim().toUpperCase();
  if (!v) return;

  RF.vin = v;
  RF.open = true;

  rfSetInfo(`VIN: ${v}`);
  rfSetMsg("");

  const modal = rfModal();
  if (modal) {
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  rfOpenSoldadura_();
}

export function closeRFModal_() {
  // ✅ mata el uploader embebido si estaba dentro del modal
  try { hideUploaderView({ mountId: "rfUploaderMount" }); } catch {}

  // ...tu cierre normal
  const modal = rfModal();
  if (modal) {
    const active = document.activeElement;
    if (active && modal.contains(active)) active.blur();
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("modal-open");

  RF.open = false;
  RF.vin = "";
  rfSetInfo("");
  rfSetMsg("");

  // ✅ vuelve a menú (si usas rfMenu/rfStage)
  const menu = document.getElementById("rfMenu");
  const stage = document.getElementById("rfStage");
  if (menu) menu.style.display = "block";
  if (stage) { stage.style.display = "none"; stage.innerHTML = ""; }
}

export function initRFModalUI_() {
  const modal = rfModal();
  if (!modal) return;
  if (modal.dataset.bound === "1") return;
  modal.dataset.bound = "1";

  rfEl("btnCloseRF")?.addEventListener("click", closeRFModal_);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeRFModal_(); });

  // ✅ YA NO CERRAMOS EL MODAL
  rfEl("btnRfControl")?.addEventListener("click", () => {
    if (!RF.vin) return;
    rfOpenStage_("calidad");
  });

  rfEl("btnRfFalla")?.addEventListener("click", () => {
    if (!RF.vin) return;
    rfOpenStage_("falla");
  });

  rfEl("btnRfSoldadura")?.addEventListener("click", () => {
    if (!RF.vin) return;
    rfOpenSoldadura_();
  });

  document.addEventListener("keydown", (e) => {
    if (!RF.open) return;
    if (e.key === "Escape") { e.preventDefault(); closeRFModal_(); }
  });
}