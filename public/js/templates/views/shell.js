import { loginView } from "./login-view.js";
import { topbarView } from "../layout/topbar.js";
import { hubView } from "./hub-view.js";
import { tecnicoView } from "./tecnico-view.js";
import { ramaleroView } from "./ramalero-view.js";
import { calidadView } from "./calidad-view.js";
import { supervisorView } from "./supervisor-view.js";
import { adminView } from "./admin-view.js";
import { uploaderView } from "./uploader-view.js";

import { loadingOverlay } from "../layout/loading-overlay.js";
import { qrModal } from "../modals/qr-modal.js";
import { conformidadModal } from "../modals/conformidad-modal.js";
import { incidenciasModal } from "../modals/incidencias-modal.js";
import { rfModal } from "../modals/rf-calidad-modal.js";;
import { rfTecnicoModal } from "/js/templates/modals/rf-tecnico-modal.js";

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