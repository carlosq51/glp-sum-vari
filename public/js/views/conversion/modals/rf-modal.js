// public/js/views/conversion/modals/rf-modal.js
import { CORE, setOut, postJSON } from "../../../core/core.js";
import { showUploaderView } from "../../uploader/uploader.js";
import { hideUploaderView } from "../../uploader/uploader.js";
import { cargarFotosVin_, htmlFotosVin_, asegurarEstilosFotos_ } from "../../../core/fotos-vin.js";

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

/**
 * Fotos del carro para el inspector de calidad.
 *
 * Antes esto era rfOpenSoldadura_ y solo enseñaba las 4 de soldadura, aunque la
 * respuesta del servidor ya traía todas. Las COMPRESIONES —cuatro tomas, una por
 * cilindro— se subían y calidad no podía verlas, que es justo lo que necesita
 * mirar para aprobar un carro. Ahora usa el visor compartido
 * (core/fotos-vin.js), el mismo que el reporte del supervisor.
 */
async function rfOpenFotos_() {
  const menu = rfEl("rfMenu");
  const stage = rfEl("rfStage");
  if (!stage) return;

  asegurarEstilosFotos_();
  if (menu) menu.style.display = "none";
  stage.style.display = "block";
  stage.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:12px;">
      <button type="button" id="btnRfBackSold" class="btn" style="height:44px; padding:0 14px; font-weight:900;">← Volver</button>
      <div class="pill small" style="opacity:.95;">FOTOS DEL CARRO</div>
    </div>
    <div id="rfSoldLoadMsg" class="small" style="text-align:center; opacity:.7; padding:16px 0;">Cargando fotos…</div>
    <div id="rfSoldGrid" style="display:none;"></div>
  `;

  stage.querySelector("#btnRfBackSold")?.addEventListener("click", rfShowMenu_);

  try {
    const datos  = await cargarFotosVin_(RF.vin);
    const msgEl  = rfEl("rfSoldLoadMsg");
    const gridEl = rfEl("rfSoldGrid");
    if (!msgEl || !gridEl) return;
    msgEl.style.display = "none";
    gridEl.style.display = "block";
    // Compresión primero: es lo que calidad no podía ver y lo que decide si el
    // motor quedó bien. Soldadura después, como estaba.
    gridEl.innerHTML = htmlFotosVin_(datos, ["comp", "soldadura", "electrico"]);
  } catch (err) {
    const msgEl = rfEl("rfSoldLoadMsg");
    if (msgEl) msgEl.textContent = "No se pudieron cargar las fotos.";
    console.warn("[rfFotos] Error:", err);
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

  rfOpenFotos_();
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
    rfOpenFotos_();
  });

  document.addEventListener("keydown", (e) => {
    if (!RF.open) return;
    if (e.key === "Escape") { e.preventDefault(); closeRFModal_(); }
  });
}