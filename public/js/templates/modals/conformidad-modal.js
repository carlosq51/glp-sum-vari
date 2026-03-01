// public/js/templates/modals/conformidad-modal.js
export function conformidadModal() {
  return `
    <!-- =========================
        MODAL CONFORMIDAD EQUIPO
        ========================= -->
    <div id="confModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Registro de conformidad de equipo</div>
          <button id="btnCloseConf" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">

          <div class="small" id="confVinInfo" style="opacity:.85; margin-bottom:8px;"></div>

          <div class="vinRow3" style="grid-template-columns: 1fr 56px; gap:10px;">
            <input id="confCode" placeholder="Escanea o escribe el código del equipo..." />
            <button id="btnConfQR" type="button" title="Escanear QR">📷</button>
          </div>

          <div id="confAssignedBox" class="small" style="margin-top:10px;"></div>

          <div id="confQrWrap" style="display:none; margin-top:12px;">
            <div id="qrReader_conf"></div>
            <div id="confQrMsg" class="small" style="margin-top:8px;"></div>

            <div class="twoWide" style="margin-top:10px;">
              <button id="btnConfStopQR" type="button">Detener cámara</button>
              <button id="btnConfClear" type="button">Limpiar</button>
            </div>
          </div>

          <div class="card" style="margin-top:12px; border:1px solid rgba(255,255,255,.16);">
            <div style="font-weight:900; margin-bottom:8px;">Checklist de verificación</div>

            <label class="ckRow">
              <input type="checkbox" id="ck1" class="confCk" />
              <span>El código del equipo registrado coincide con el equipo asignado (si aplica).</span>
            </label>

            <label class="ckRow">
              <input type="checkbox" id="ck2" class="confCk" />
              <span>El equipo se encuentra en buen estado (sin daños visibles ni componentes faltantes).</span>
            </label>

            <label class="ckRow">
              <input type="checkbox" id="ck3" class="confCk" />
              <span>Se verificó que el equipo corresponde al trabajo y está listo para instalar/usar.</span>
            </label>
          </div>

          <button id="btnConfSave" class="btnInicio" style="margin-top:12px; width:100%; height:64px; font-weight:1000;">
            Guardar conformidad
          </button>

          <div id="confMsg" class="small" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  `;
}