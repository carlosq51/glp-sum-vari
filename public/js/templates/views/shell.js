import { loginView } from "./login-view.js";
import { topbarView } from "./topbar.js";
import { hubView } from "./hub-view.js";
import { tecnicoView } from "./tecnico-view.js";
import { ramaleroView } from "./ramalero-view.js";
import { calidadView } from "./calidad-view.js";
import { supervisorView } from "./supervisor-view.js";
import { adminView } from "./admin-view.js";
import { uploaderView } from "./uploader-view.js";

import { loadingOverlay } from "./loading-overlay.js";
import { qrModal } from "./qr-modal.js";
import { conformidadModal } from "./conformidad-modal.js";
import { incidenciasModal } from "./incidencias-modal.js";

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
  `;
}