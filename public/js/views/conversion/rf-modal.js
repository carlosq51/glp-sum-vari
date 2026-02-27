// public/js/views/conversion/rf-modal.js
import { CORE, setOut } from "../../core/core.js";
import { showUploaderView } from "../uploader/uploader.js";

const RF = { open: false, vin: "" };

const rfEl = (id) => document.getElementById(id);
const rfModal = () => rfEl("rfModal");

function rfSetInfo(t) { const el = rfEl("rfInfo"); if (el) el.textContent = String(t || ""); }
function rfSetMsg(t)  { const el = rfEl("rfMsg");  if (el) el.textContent = String(t || ""); }

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
}

export function closeRFModal_() {
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
}

export function initRFModalUI_() {
  const modal = rfModal();
  if (!modal) return;
  if (modal.dataset.bound === "1") return;
  modal.dataset.bound = "1";

  // cerrar
  rfEl("btnCloseRF")?.addEventListener("click", closeRFModal_);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeRFModal_(); });

  // ✅ SOLO 2 rutas
  rfEl("btnRfControl")?.addEventListener("click", () => {
    if (!RF.vin) return;
    closeRFModal_();
    showUploaderView({ vin: RF.vin, screen: "calidad" }); // ✅ YA EXISTE EN uploader-ui.js
  });

  rfEl("btnRfFalla")?.addEventListener("click", () => {
    if (!RF.vin) return;
    closeRFModal_();
    showUploaderView({ vin: RF.vin, screen: "falla" }); // ✅ YA EXISTE EN uploader-ui.js
  });

  // ESC
  document.addEventListener("keydown", (e) => {
    if (!RF.open) return;
    if (e.key === "Escape") { e.preventDefault(); closeRFModal_(); }
  });
}