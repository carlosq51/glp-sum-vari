import { loginView } from "../views/login-view.js";

import { hubView } from "../views/hub-view.js";
import { tecnicoView, tecBuscarModalTemplate } from "../views/tecnico-view.js";
import { ramaleroView } from "../views/ramalero-view.js";
import { calidadView } from "../views/calidad-view.js";
import { adminView, adminCrudModal } from "../views/admin-view.js";
import { uploaderView } from "../views/uploader-view.js";
import { movilizadorView } from "../views/movilizador-view.js";
import { supervisorView, supIncModal, liveDetailModal, supValidarQrModalTemplate, supOtControlModal } from "../views/supervisor-view.js";

import { topbarView } from "./topbar.js";
import { loadingOverlay } from "./loading-overlay.js";
import { bootSplash } from "./brand.js";
import { conformidadModal } from "../modals/conformidad-modal.js";
import { incidenciasModal } from "../modals/incidencias-modal.js";
import { qrModal } from "../modals/qr-modal.js";
import { rfModal } from "../modals/rf-calidad-modal.js";
import { rfTecnicoModal } from "../modals/rf-tecnico-modal.js";

import { confirmFinishModal } from "../modals/confirm-finish-modal.js";
import { errorModal } from "../modals/error-modal.js";

export function appShell() {
  return `
    ${bootSplash()}

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
      ${movilizadorView()}

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
    ${confirmFinishModal()}
    ${errorModal()}
    ${supIncModal()}
    ${liveDetailModal()}
    ${supValidarQrModalTemplate()}
    ${supOtControlModal()}
    ${tecBuscarModalTemplate()}
    ${adminCrudModal()}
  `;
}