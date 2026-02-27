// public/js/views/conversion/rf-modal.js
import { CORE, setOut } from "../../core/core.js";
import { showUploaderView } from "../uploader/uploader.js";
import { hideUploaderView } from "../uploader/uploader.js"; // ✅ añade

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

  // Barra superior dentro del modal, mismo look (btnInicio/pill)
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

  // ✅ Renderiza uploader DENTRO del modal
  // Necesitas que showUploaderView soporte mountId (ver punto 3)
  showUploaderView({ vin: RF.vin, screen, mountId: "rfUploaderMount" });
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

  document.addEventListener("keydown", (e) => {
    if (!RF.open) return;
    if (e.key === "Escape") { e.preventDefault(); closeRFModal_(); }
  });
}