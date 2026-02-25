// public/js/templates/views/uploader-view.js
export function uploaderView() {
  return `
    <!-- =========================
         VISTA: UPLOADER GLP
         ========================= -->
    <section id="viewUploader" style="display:none;">
      <div class="uploader-shell">

        <!-- =========================
            PANTALLA 0: MENÚ INICIAL
            ========================= -->
        <section id="up_screenMenu" class="screen active">
          <div class="topbar">
            <h2>Uploader GLP</h2>
            <span class="small">Selecciona una opción</span>
          </div>

          <div class="menuGrid">
            <div class="menuCard">
              <p class="menuTitle">Registrar parámetros</p>
              <p class="menuDesc">Sube las 9 fotos (VIN, COMPRESIÓN, AMPERAJE, VOLTAJE, SCANNER).</p>
              <button class="btn" id="up_goParams">Entrar</button>
            </div>

            <div class="menuCard">
              <p class="menuTitle">Registrar falla</p>
              <p class="menuDesc">Registra una falla con nota.</p>
              <button class="btn" id="up_goFalla">Entrar</button>
            </div>

            <div class="menuCard">
              <p class="menuTitle">Control calidad</p>
              <p class="menuDesc">Pantalla de control de calidad.</p>
              <button class="btn" id="up_goCalidad">Entrar</button>
            </div>

            <div class="menuCard">
              <p class="menuTitle">Conformidad equipo (TANQUE)</p>
              <p class="menuDesc">Checklist + foto del equipo + nombre del técnico.</p>
              <button class="btn" id="up_goConfTanque">Entrar</button>
            </div>

            <div class="menuCard">
              <p class="menuTitle">Conformidad equipo (REDUCTOR)</p>
              <p class="menuDesc">Checklist + foto del equipo + nombre del técnico.</p>
              <button class="btn" id="up_goConfReductor">Entrar</button>
            </div>
          </div>

          <div class="box" style="margin-top:14px;">
            <div class="small"></div>
          </div>

          <div style="margin-top:22px; text-align:center;">
            <button class="btnBackControl" id="up_btnBackControl">
              ⬅️ Volver al Control de Trabajo
            </button>
          </div>
        </section>

        <!-- =========================
            PANTALLA 1: REGISTRAR PARÁMETROS
            ========================= -->
        <section id="up_screenParams" class="screen">
          <div class="topbar">
            <h2>Registrar parámetros</h2>
            <button class="btn3" type="button" data-nav="menu">⬅ Volver</button>
          </div>

          <div class="box">
            <div class="row">
              <button class="btn" id="up_btnScanQR_params">Escanear QR</button>
              <button class="btn" id="up_btnScanBAR_params">Escanear CODIGO BARRAS</button>
              <button class="btn3" id="up_btnStop_params" style="display:none;">Detener</button>
              <div class="small" id="up_scanMsg_params"></div>
            </div>

            <div id="up_qrBox_params" style="display:none; margin-top:10px;">
              <div class="small" id="up_scanMode_params" style="margin-bottom:8px;"></div>
              <div id="up_qrReader_params" class="qrReader"></div>
              <div class="small" style="margin-top:8px;">
                Tip: en BARRAS apunta con buena luz y ocupa casi todo el ancho del recuadro.
              </div>
            </div>

            <div class="row">
              <label>VIN (texto)</label>
              <input id="up_vinText" type="text" placeholder="Escanea o escribe VIN..." />
            </div>

            <div class="row">
              <label>Fecha (YYYY-MM-DD)</label>
              <input id="up_dateStr" type="date" />
              <div class="small">Si no eliges fecha, usa la de hoy.</div>
            </div>

            <div class="row">
              <button class="btn3" id="up_btnRefresh">Refrescar estado</button>
            </div>
          </div>

          <h3>Fotos (9) — se guardan en Drive</h3>

          <div class="box grid">
            <!-- 1) VIN -->
            <div class="slotCard" data-slot="vin">
              <label>1) Foto del VIN</label>

              <input class="hiddenInput" type="file" accept="image/*;capture=camera" capture="environment" id="up_vin_cam">
              <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" id="up_vin_file">

              <div class="slotActions">
                <button class="btn3" type="button" data-pick="cam" data-slot="vin">📷 Tomar foto</button>
                <button class="btn3" type="button" data-pick="file" data-slot="vin">🖼️ Subir archivo</button>
                <button class="btn3" type="button" data-clear="1" data-slot="vin">🧹 Quitar</button>
              </div>

              <div class="mini">
                <div class="thumb" id="up_vin_previewBox"><span class="small">Sin foto</span></div>
                <div class="miniInfo" id="up_vin_meta">Ningún archivo seleccionado.</div>
              </div>
            </div>

            <!-- 2) COMPRESIÓN: 4 fotos -->
            <div class="slotCard" data-slot="comp">
              <label>2) Compresión (toma 4 fotos)</label>

              <input class="hiddenInput" type="file" accept="image/*;capture=camera" capture="environment" id="up_comp_cam">
              <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" id="up_comp_file" multiple>

              <div class="slotActions">
                <button class="btn3" type="button" data-pick="cam" data-slot="comp">📷 Tomar foto (agrega)</button>
                <button class="btn3" type="button" data-pick="file" data-slot="comp">🖼️ Subir archivo (agrega)</button>
                <button class="btn3" type="button" data-clear="1" data-slot="comp">🧹 Quitar todas</button>
              </div>

              <div class="grid" style="grid-template-columns: repeat(4, 1fr); gap:10px; margin-top:10px;">
                <div class="thumb" id="up_comp_p1"><span class="small">1</span></div>
                <div class="thumb" id="up_comp_p2"><span class="small">2</span></div>
                <div class="thumb" id="up_comp_p3"><span class="small">3</span></div>
                <div class="thumb" id="up_comp_p4"><span class="small">4</span></div>
              </div>

              <div class="miniInfo" id="up_comp_meta" style="margin-top:10px;">
                Ningún archivo seleccionado.
              </div>
            </div>

            <!-- 6) Corriente antes -->
            <div class="slotCard" data-slot="corr_pre">
              <label>6) Amperaje antes</label>

              <input class="hiddenInput" type="file" accept="image/*;capture=camera" capture="environment" id="up_corr_pre_cam">
              <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" id="up_corr_pre_file">

              <div class="slotActions">
                <button class="btn3" type="button" data-pick="cam" data-slot="corr_pre">📷 Tomar foto</button>
                <button class="btn3" type="button" data-pick="file" data-slot="corr_pre">🖼️ Subir archivo</button>
                <button class="btn3" type="button" data-clear="1" data-slot="corr_pre">🧹 Quitar</button>
              </div>

              <div class="mini">
                <div class="thumb" id="up_corr_pre_previewBox"><span class="small">Sin foto</span></div>
                <div class="miniInfo" id="up_corr_pre_meta">Ningún archivo seleccionado.</div>
              </div>
            </div>

            <!-- 7) Corriente después -->
            <div class="slotCard" data-slot="corr_post">
              <label>7) Amperaje después</label>

              <input class="hiddenInput" type="file" accept="image/*;capture=camera" capture="environment" id="up_corr_post_cam">
              <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" id="up_corr_post_file">

              <div class="slotActions">
                <button class="btn3" type="button" data-pick="cam" data-slot="corr_post">📷 Tomar foto</button>
                <button class="btn3" type="button" data-pick="file" data-slot="corr_post">🖼️ Subir archivo</button>
                <button class="btn3" type="button" data-clear="1" data-slot="corr_post">🧹 Quitar</button>
              </div>

              <div class="mini">
                <div class="thumb" id="up_corr_post_previewBox"><span class="small">Sin foto</span></div>
                <div class="miniInfo" id="up_corr_post_meta">Ningún archivo seleccionado.</div>
              </div>
            </div>

            <!-- 8) Voltaje -->
            <div class="slotCard" data-slot="voltaje">
              <label>8) Voltaje</label>

              <input class="hiddenInput" type="file" accept="image/*;capture=camera" capture="environment" id="up_voltaje_cam">
              <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" id="up_voltaje_file">

              <div class="slotActions">
                <button class="btn3" type="button" data-pick="cam" data-slot="voltaje">📷 Tomar foto</button>
                <button class="btn3" type="button" data-pick="file" data-slot="voltaje">🖼️ Subir archivo</button>
                <button class="btn3" type="button" data-clear="1" data-slot="voltaje">🧹 Quitar</button>
              </div>

              <div class="mini">
                <div class="thumb" id="up_voltaje_previewBox"><span class="small">Sin foto</span></div>
                <div class="miniInfo" id="up_voltaje_meta">Ningún archivo seleccionado.</div>
              </div>
            </div>

            <!-- 9) Scan del carro -->
            <div class="slotCard" data-slot="scan_carro">
              <label>9) Scan del carro</label>

              <input class="hiddenInput" type="file" accept="image/*;capture=camera" capture="environment" id="up_scan_carro_cam">
              <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" id="up_scan_carro_file">

              <div class="slotActions">
                <button class="btn3" type="button" data-pick="cam" data-slot="scan_carro">📷 Tomar foto</button>
                <button class="btn3" type="button" data-pick="file" data-slot="scan_carro">🖼️ Subir archivo</button>
                <button class="btn3" type="button" data-clear="1" data-slot="scan_carro">🧹 Quitar</button>
              </div>

              <div class="mini">
                <div class="thumb" id="up_scan_carro_previewBox"><span class="small">Sin foto</span></div>
                <div class="miniInfo" id="up_scan_carro_meta">Ningún archivo seleccionado.</div>
              </div>
            </div>
          </div>

          <div class="row">
            <button class="btnPrimaryBig" id="up_btnUpload">🔄 REFRESCAR ESTADO</button>
          </div>

          <h3>Estado colaborativo</h3>
          <div id="up_out" class="status">Listo.</div>
        </section>

        <!-- =========================
            PANTALLA 2: REGISTRAR FALLA
            ========================= -->
        <section id="up_screenFalla" class="screen">
          <div class="topbar">
            <h2>Registrar falla</h2>
            <button class="btn3" type="button" data-nav="menu">⬅ Volver</button>
          </div>

          <div class="box">
            <div class="row">
              <button class="btn" id="up_btnScanQR_falla">Escanear SOLO QR</button>
              <button class="btn" id="up_btnScanBAR_falla">Escanear SOLO BARRAS</button>
              <button class="btn3" id="up_btnStop_falla" style="display:none;">Detener</button>
              <div class="small" id="up_scanMsg_falla"></div>
            </div>

            <div id="up_qrBox_falla" style="display:none; margin-top:10px;">
              <div class="small" id="up_scanMode_falla" style="margin-bottom:8px;"></div>
              <div id="up_qrReader_falla" class="qrReader"></div>
              <div class="small" style="margin-top:8px;">
                Tip: en BARRAS apunta con buena luz y ocupa casi todo el ancho del recuadro.
              </div>
            </div>

            <div class="row">
              <label>VIN</label>
              <input id="up_fallaVin" type="text" placeholder="Escribe o pega VIN..." />
              <div class="small">Tip: puedes copiarlo desde “Registrar parámetros”.</div>
            </div>

            <div class="row">
              <label>Fecha</label>
              <input id="up_fallaDate" type="date" />
            </div>

            <div class="row">
              <label>Descripción / Nota</label>
              <textarea id="up_fallaNota" placeholder="Describe la falla..."></textarea>
            </div>

            <div class="row">
              <label>Fotos de falla (sin límite)</label>

              <input class="hiddenInput" type="file" accept="image/*;capture=camera" capture="environment" id="up_falla_cam">
              <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" id="up_falla_file" multiple>

              <div class="slotActions">
                <button class="btn3" type="button" id="up_btnFallaCam">📷 Tomar foto (agrega)</button>
                <button class="btn3" type="button" id="up_btnFallaFile">🖼️ Subir archivo(s) (agrega)</button>
                <button class="btn3" type="button" id="up_btnFallaClear">🧹 Quitar todas</button>
              </div>

              <div class="grid" id="up_fallaGrid" style="grid-template-columns: repeat(4, 1fr); gap:10px; margin-top:10px;"></div>
              <div class="small" id="up_fallaFotosMeta">0 archivo(s).</div>
            </div>

            <div class="row">
              <button class="btn2" id="up_btnEnviarFalla">ENVIAR FALLA</button>
            </div>
          </div>

          <div id="up_outFalla" class="status">Listo.</div>
        </section>

        <!-- =========================
            PANTALLA 3: CONTROL CALIDAD
            ========================= -->
        <section id="up_screenCalidad" class="screen">
          <div class="topbar">
            <h2>Control calidad</h2>
            <button class="btn3" type="button" data-nav="menu">⬅ Volver</button>
          </div>

          <div class="box">
            <div class="row">
              <button class="btn" id="up_btnScanQR_qc">Escanear SOLO QR</button>
              <button class="btn" id="up_btnScanBAR_qc">Escanear SOLO BARRAS</button>
              <button class="btn3" id="up_btnStop_qc" style="display:none;">Detener</button>
              <div class="small" id="up_scanMsg_qc"></div>
            </div>

            <div id="up_qrBox_qc" style="display:none; margin-top:10px;">
              <div class="small" id="up_scanMode_qc" style="margin-bottom:8px;"></div>
              <div id="up_qrReader_qc" class="qrReader"></div>
              <div class="small" style="margin-top:8px;">
                Tip: en BARRAS apunta con buena luz y ocupa casi todo el ancho del recuadro.
              </div>
            </div>

            <div class="row">
              <label>VIN</label>
              <input id="up_qcVin" type="text" placeholder="VIN..." />
            </div>

            <div class="row">
              <label>Fecha</label>
              <input id="up_qcDate" type="date" />
            </div>

            <div class="slotCard" style="margin-top:10px;">
              <label>Fotos de Calidad (mín 3, máx 4)</label>

              <input class="hiddenInput" type="file" accept="image/*;capture=camera" capture="environment" id="up_qc_cam">
              <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" id="up_qc_file" multiple>

              <div class="slotActions">
                <button class="btn3" type="button" id="up_btnQcCam">📷 Tomar foto (agrega)</button>
                <button class="btn3" type="button" id="up_btnQcFile">🖼️ Subir archivo (agrega)</button>
                <button class="btn3" type="button" id="up_btnQcClear">🧹 Quitar todas</button>
              </div>

              <div class="grid" style="grid-template-columns: repeat(4, 1fr); gap:10px; margin-top:10px;">
                <div class="thumb" id="up_qc_p1"><span class="small">1</span></div>
                <div class="thumb" id="up_qc_p2"><span class="small">2</span></div>
                <div class="thumb" id="up_qc_p3"><span class="small">3</span></div>
                <div class="thumb" id="up_qc_p4"><span class="small">4</span></div>
              </div>

              <div class="miniInfo" id="up_qc_meta" style="margin-top:10px;">0/4 seleccionadas.</div>
            </div>

            <div class="row">
              <button class="btnPrimaryBig" id="up_btnQcUpload">⬆️ ENVIAR CALIDAD</button>
            </div>
          </div>

          <div id="up_outQc" class="status">Listo.</div>
        </section>

        <!-- =========================
            PANTALLA 4: CONFORMIDAD EQUIPOS
            ========================= -->
        <section id="up_screenConformidad" class="screen">
          <div class="topbar">
            <h2 id="up_confTitle">Conformidad de equipos</h2>
            <button class="btn3" type="button" data-nav="menu">⬅ Volver</button>
          </div>

          <div class="box">
            <div class="row">
              <label>Tipo de conformidad</label>
              <input id="up_confTipo" type="text" disabled value="TANQUE" />
              <div class="small">Se define desde el menú (TANQUE o REDUCTOR).</div>
            </div>

            <div class="row">
              <button class="btn" id="up_btnScanQR_conf">Escanear SOLO QR</button>
              <button class="btn" id="up_btnScanBAR_conf">Escanear SOLO BARRAS</button>
              <button class="btn3" id="up_btnStop_conf" style="display:none;">Detener</button>
              <div class="small" id="up_scanMsg_conf"></div>
            </div>

            <div id="up_qrBox_conf" style="display:none; margin-top:10px;">
              <div class="small" id="up_scanMode_conf" style="margin-bottom:8px;"></div>
              <div id="up_qrReader_conf" class="qrReader"></div>
            </div>

            <div class="row">
              <label>VIN</label>
              <input id="up_confVin" type="text" placeholder="VIN..." />
            </div>

            <div class="row">
              <label>Fecha</label>
              <input id="up_confDate" type="date" />
            </div>

            <div class="row">
              <label>Nombre del técnico</label>
              <input id="up_confTecnico" type="text" placeholder="Ej: Juan Pérez" />
            </div>

            <div class="slotCard" style="margin-top:10px;">
              <label>Checklist de conformidad</label>

              <div class="row" style="margin-top:8px;">
                <label style="font-weight:600; display:flex; gap:10px; align-items:flex-start;">
                  <input type="checkbox" id="up_chk1" />
                  <span>Revisé el equipo con tiempo</span>
                </label>

                <label style="font-weight:600; display:flex; gap:10px; align-items:flex-start; margin-top:10px;">
                  <input type="checkbox" id="up_chk2" />
                  <span>Me hago responsable de la pérdida de algún material después de darle los términos</span>
                </label>

                <label style="font-weight:600; display:flex; gap:10px; align-items:flex-start; margin-top:10px;">
                  <input type="checkbox" id="up_chk3" />
                  <span>Todo conforme con el equipo</span>
                </label>
              </div>
            </div>

            <div class="slotCard" style="margin-top:10px;">
              <label>Foto del equipo (1)</label>

              <input class="hiddenInput" type="file" accept="image/*;capture=camera" capture="environment" id="up_conf_cam">
              <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" id="up_conf_file">

              <div class="slotActions">
                <button class="btn3" type="button" id="up_btnConfCam">📷 Tomar foto</button>
                <button class="btn3" type="button" id="up_btnConfFile">🖼️ Subir archivo</button>
                <button class="btn3" type="button" id="up_btnConfClear">🧹 Quitar</button>
              </div>

              <div class="mini">
                <div class="thumb" id="up_conf_previewBox"><span class="small">Sin foto</span></div>
                <div class="miniInfo" id="up_conf_meta">Ningún archivo seleccionado.</div>
              </div>
            </div>

            <div class="row">
              <button class="btnPrimaryBig" id="up_btnEnviarConf">✅ ENVIAR CONFORMIDAD</button>
            </div>
          </div>

          <div id="up_outConf" class="status">Listo.</div>
        </section>

        <!-- ✅ VISOR FULLSCREEN -->
        <div id="up_imgModal" class="imgModal" aria-hidden="true">
          <button type="button" class="imgModalClose" id="up_imgModalClose">✕</button>
          <img id="up_imgModalImg" alt="Vista completa" />
        </div>

      </div>
    </section>
  `;
}