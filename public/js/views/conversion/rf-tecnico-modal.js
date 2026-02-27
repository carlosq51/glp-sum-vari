// public/js/views/conversion/rf-tecnico-modal.js
import { CORE, setOut } from "../../core/core.js";
import { showUploaderView, hideUploaderView } from "../uploader/uploader.js";

const RFT = { open:false, vin:"" };

const el = (id) => document.getElementById(id);
const modal = () => el("rfTecModal");

function setInfo(t){ const x = el("rfTecInfo"); if (x) x.textContent = String(t||""); }
function setMsg(t){ const x = el("rfTecMsg"); if (x) x.textContent = String(t||""); }

function showMenu_(){
  try { hideUploaderView({ mountId:"rfTecUploaderMount" }); } catch {}
  el("rfTecMenu") && (el("rfTecMenu").style.display = "block");
  el("rfTecStage") && (el("rfTecStage").style.display = "none");
  if (el("rfTecStage")) el("rfTecStage").innerHTML = "";
}

function openStage_(screen){
  const menu = el("rfTecMenu");
  const stage = el("rfTecStage");
  if (!stage) return;

  if (menu) menu.style.display = "none";
  stage.style.display = "block";

  stage.innerHTML = `
    <div class="row" style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <button type="button" id="btnRFTecBack" class="btn" style="height:44px; padding:0 14px; font-weight:900;">
        ← Volver
      </button>
      <div class="pill small" style="opacity:.95;">
        ${screen === "params" ? "REGISTRAR PARÁMETROS" : "REGISTRAR FALLA"}
      </div>
    </div>

    <div id="rfTecUploaderMount"></div>
  `;

  stage.querySelector("#btnRFTecBack")?.addEventListener("click", showMenu_);

  // ✅ Embebido en modal
  showUploaderView({
    vin: RFT.vin,
    screen: screen === "params" ? "params" : "falla",
    mountId: "rfTecUploaderMount",
    onBackControl: showMenu_, // por si el uploader muestra su volver interno
  });
}

export function openRFTecModalForVin_(vin){
  if (CORE.state.currentModule !== "TECNICO") return;

  const v = String(vin||"").trim().toUpperCase();
  if (!v) return setOut({ ok:false, error:"VIN vacío para Registro/Fallas." });

  RFT.vin = v;
  RFT.open = true;
  setInfo(`VIN: ${v}`);
  setMsg("");

  const m = modal();
  if (m) {
    m.classList.add("show");
    m.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open");
  }
  showMenu_();
}

export function closeRFTecModal_(){
  try { hideUploaderView({ mountId:"rfTecUploaderMount" }); } catch {}

  const m = modal();
  if (m) {
    const active = document.activeElement;
    if (active && m.contains(active)) active.blur();
    m.classList.remove("show");
    m.setAttribute("aria-hidden","true");
  }
  document.body.classList.remove("modal-open");

  RFT.open = false;
  RFT.vin = "";
  setInfo("");
  setMsg("");
  showMenu_();
}

export function initRFTecModalUI_(){
  const m = modal();
  if (!m) return;
  if (m.dataset.bound === "1") return;
  m.dataset.bound = "1";

  el("btnCloseRFTec")?.addEventListener("click", closeRFTecModal_);
  m.addEventListener("click", (e)=>{ if (e.target === m) closeRFTecModal_(); });

  el("btnRFTecParams")?.addEventListener("click", ()=>{ if (RFT.vin) openStage_("params"); });
  el("btnRFTecFalla")?.addEventListener("click", ()=>{ if (RFT.vin) openStage_("falla"); });

  document.addEventListener("keydown",(e)=>{
    if (!RFT.open) return;
    if (e.key === "Escape") { e.preventDefault(); closeRFTecModal_(); }
  });
}