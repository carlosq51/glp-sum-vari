import { loginView } from "../views/login-view.js";

import { hubView } from "../views/hub-view.js";
import { tecnicoView } from "../views/tecnico-view.js";
import { ramaleroView } from "../views/ramalero-view.js";
import { calidadView } from "../views/calidad-view.js";
import { supervisorView } from "../views/supervisor-view.js";
import { adminView } from "../views/admin-view.js";
import { uploaderView } from "../views/uploader-view.js";

import { topbarView } from "./topbar.js";
import { loadingOverlay } from "./loading-overlay.js";
import { conformidadModal } from "../modals/conformidad-modal.js";
import { incidenciasModal } from "../modals/incidencias-modal.js";
import { qrModal } from "../modals/qr-modal.js";
import { rfModal } from "../modals/rf-calidad-modal.js";
import { rfTecnicoModal } from "../modals/rf-tecnico-modal.js";

export function appShell() {
  return `
    ${loginView()}

    <!-- =========================
         APP
         ========================= -->
    <div id="viewApp" style="display:none;">
      ${topbarView()}

      ${hubView()}
      ${tecnicoView()}
      ${ramaleroView()}
      ${calidadView()}

      <!-- MOVILIZADOR (stub como lo tenías) -->
      <div id="viewMOVILIZADOR" class="card" style="display:none;">
        <h3>Movilizador</h3>
        <div class="small">Aquí irá la vista de Movilizador.</div>
      </div>

      ${supervisorView()}
      ${adminView()}
      ${uploaderView()}
    </div>

    ${loadingOverlay()}
    ${qrModal()}
    ${conformidadModal()}
    ${incidenciasModal()}
    ${rfModal()}
    ${rfTecnicoModal()}
  `;
}