(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))n(o);new MutationObserver(o=>{for(const i of o)if(i.type==="childList")for(const s of i.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&n(s)}).observe(document,{childList:!0,subtree:!0});function a(o){const i={};return o.integrity&&(i.integrity=o.integrity),o.referrerPolicy&&(i.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?i.credentials="include":o.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(o){if(o.ep)return;o.ep=!0;const i=a(o);fetch(o.href,i)}})();function ri(){return`
    <!-- =========================
         LOGIN
         ========================= -->
    <div id="viewLogin" class="card">
      <h3>Iniciar sesión</h3>
      <div class="row">
        <input id="email" type="email" placeholder="tu_email@gmail.com" />
        <button id="btnMe">Iniciar sesión</button>
      </div>
      <div id="loginMsg" class="small"></div>
    </div>
  `}function ci(){return`
    <!-- HUB -->
    <div id="viewHub" class="card" style="display:none;">
      <h3>Selecciona un módulo</h3>
      <div id="hubButtons" class="row menu"></div>
      <div class="small">Si tienes varios permisos, puedes cambiar de módulo cuando quieras.</div>
    </div>
  `}function li(){return`
    <!-- =========================
         TECNICO
         ========================= -->
    <div id="viewTECNICO" style="display:none;">
      <div class="card">
        <h3>Técnico (Conversión)</h3>

        <div class="fullStack" style="margin-top:10px;">
          <div class="vinRow3">
            <div class="vinWrap">
              <input id="vin" placeholder="Ingresa VIN o escanea QR" />
              <div id="vinSuggest" class="vinSuggest hidden" role="listbox"></div>
            </div>

            <button id="btnQR" title="Escanear QR">📷</button>

            <button id="btnEstado" title="Busca la OT por VIN o la crea si no existe">
              Buscar / Crear
            </button>
          </div>

          <div class="twoWide">
            <button id="btnFinalizados">Ver finalizados</button>
            <button id="btnActivas" title="Refrescar conversiones">🔄 <span>Refrescar</span></button>
          </div>
        </div>

        <div id="estadoBox" class="small"></div>
        <div id="activasBox"></div>

        <div id="finalizadosWrap" style="display:none; margin-top:12px;">
          <h4>Finalizados</h4>
          <div id="finalizadosBox"></div>
        </div>
      </div>

      <div id="debugWrap" class="debug-hidden">
        <h3 style="margin-top:14px;">Respuesta</h3>
        <pre id="out">{}</pre>
      </div>

      <!-- stubs -->
      <select id="accion" style="display:none;">
        <option value="INICIO">INICIO</option>
        <option value="PAUSA">PAUSA</option>
        <option value="REANUDAR">REANUDAR</option>
        <option value="FIN">FIN</option>
        <option value="NOTA">NOTA</option>
      </select>
      <textarea id="nota" style="display:none;"></textarea>
      <button id="btnNotaOnly" style="display:none;"></button>
      <button id="btnEnviar" style="display:none;"></button>
    </div>
  `}function di(){return`
    <!-- =========================
         RAMALERO
         ========================= -->
    <div id="viewRAMALERO" style="display:none;">
      <div class="card">
        <h3>Ramalero</h3>
        <div class="small">Armado de ramales (sin VIN)</div>

        <div class="fullStack" style="margin-top:10px;">
          <div class="ramalRow3">
            <select id="tipoRamal">
              <option value="">Selecciona tipo de ramal</option>
              <option value="JETOUR">JETOUR</option>
              <option value="VOLKSWAGEN POLO">VOLKSWAGEN POLO</option>
              <option value="VOLKSWAGEN TERA">VOLKSWAGEN TERA</option>
              <option value="KYC V3 / V5">KYC V3 / V5</option>
              <option value="KYC V7">KYC V7</option>
              <option value="KYC X3">KYC X3</option>
              <option value="KYC X5 SIMPLE">KYC X5 SIMPLE</option>
              <option value="KYC X5 DOBLE">KYC X5 DOBLE</option>
            </select>

            <input
              id="ramalId"
              type="text"
              placeholder="RAMAL_ID"
              readonly
              style="opacity:.85;"
            />

            <button id="btnRamalNuevo" class="btnInicio" title="Crear nuevo RAMAL">
              NUEVO RAMAL
            </button>
          </div>

          <div class="twoWide">
            <button id="btnFinalizadosR">Ver finalizados</button>
            <button id="btnActivasR">🔄 <span>Refrescar</span></button>
          </div>
        </div>

        <div style="margin-top:14px;">
          <h4>Activos</h4>
          <div id="activasBoxR"></div>
        </div>

        <div id="finalizadosWrapR" style="display:none; margin-top:14px;">
          <h4>Finalizados</h4>
          <div id="finalizadosBoxR"></div>
        </div>
      </div>
    </div>
  `}function ui(){return`
    <!-- =========================
         CALIDAD
         ========================= -->
    <div id="viewCALIDAD" style="display:none;">
      <div class="card">
        <h3>Control de Calidad</h3>

        <div class="fullStack" style="margin-top:10px;">
          <div class="vinRow3">
            <div class="vinWrap">
              <input id="vinQ" placeholder="Ingresa VIN o escanea QR" />
              <div id="vinSuggestQ" class="vinSuggest hidden" role="listbox"></div>
            </div>

            <button id="btnQRQ" title="Escanear QR">📷</button>

            <button id="btnEstadoQ" title="Busca la OT por VIN o la crea si no existe">
              Buscar / Crear
            </button>
          </div>

          <div class="twoWide">
            <button id="btnFinalizadosQ">Ver finalizados</button>
            <button id="btnActivasQ" title="Refrescar conversiones">🔄 <span>Refrescar</span></button>
          </div>
        </div>

        <div id="estadoBoxQ" class="small"></div>
        <div id="activasBoxQ"></div>

        <div id="finalizadosWrapQ" style="display:none; margin-top:12px;">
          <h4>Finalizados</h4>
          <div id="finalizadosBoxQ"></div>
        </div>
      </div>
    </div>
  `}function pi(){return`
    <!-- ADMIN -->
    <div id="viewADMIN" class="card" style="display:none;">
      <h3>Admin</h3>
      <div class="small">Aquí irá la vista Admin.</div>
    </div>
  `}function fi(){return`
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

              <div class="slotActions upActions">
                <button class="btnUp" type="button" data-pick="cam" data-slot="vin">
                  <span class="ico">📷</span><span>Foto</span>
                </button>
                <button class="btnUp" type="button" data-pick="file" data-slot="vin">
                  <span class="ico">📁</span><span>Cargar</span>
                </button>
                <button class="btnUp btnUp-danger" type="button" data-clear="1" data-slot="vin">
                  <span class="ico">🗑️</span><span>Borrar</span>
                </button>
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

              <div class="slotActions upActions">
                <button class="btnUp" type="button" data-pick="cam" data-slot="comp">
                  <span class="ico">📷</span><span>Foto (agrega)</span>
                </button>
                <button class="btnUp" type="button" data-pick="file" data-slot="comp">
                  <span class="ico">📁</span><span>Cargar (agrega)</span>
                </button>
                <button class="btnUp btnUp-danger" type="button" data-clear="1" data-slot="comp">
                  <span class="ico">🗑️</span><span>Borrar todo</span>
                </button>
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

              <div class="slotActions upActions">
                <button class="btnUp" type="button" data-pick="cam" data-slot="corr_pre">
                  <span class="ico">📷</span><span>Foto</span>
                </button>
                <button class="btnUp" type="button" data-pick="file" data-slot="corr_pre">
                  <span class="ico">📁</span><span>Cargar</span>
                </button>
                <button class="btnUp btnUp-danger" type="button" data-clear="1" data-slot="corr_pre">
                  <span class="ico">🗑️</span><span>Borrar</span>
                </button>
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

              <div class="slotActions upActions">
                <button class="btnUp" type="button" data-pick="cam" data-slot="corr_post">
                  <span class="ico">📷</span><span>Foto</span>
                </button>
                <button class="btnUp" type="button" data-pick="file" data-slot="corr_post">
                  <span class="ico">📁</span><span>Cargar</span>
                </button>
                <button class="btnUp btnUp-danger" type="button" data-clear="1" data-slot="corr_post">
                  <span class="ico">🗑️</span><span>Borrar</span>
                </button>
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

              <div class="slotActions upActions">
                <button class="btnUp" type="button" data-pick="cam" data-slot="voltaje">
                  <span class="ico">📷</span><span>Foto</span>
                </button>
                <button class="btnUp" type="button" data-pick="file" data-slot="voltaje">
                  <span class="ico">📁</span><span>Cargar</span>
                </button>
                <button class="btnUp btnUp-danger" type="button" data-clear="1" data-slot="voltaje">
                  <span class="ico">🗑️</span><span>Borrar</span>
                </button>
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

              <div class="slotActions upActions">
                <button class="btnUp" type="button" data-pick="cam" data-slot="scan_carro">
                  <span class="ico">📷</span><span>Foto</span>
                </button>
                <button class="btnUp" type="button" data-pick="file" data-slot="scan_carro">
                  <span class="ico">📁</span><span>Cargar</span>
                </button>
                <button class="btnUp btnUp-danger" type="button" data-clear="1" data-slot="scan_carro">
                  <span class="ico">🗑️</span><span>Borrar</span>
                </button>
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

              <div class="slotActions upActions">
                <button class="btnUp" type="button" id="up_btnFallaCam">
                  <span class="ico">📷</span><span>Foto</span>
                </button>
                <button class="btnUp" type="button" id="up_btnFallaFile">
                  <span class="ico">📁</span><span>Cargar</span>
                </button>
                <button class="btnUp btnUp-danger" type="button" id="up_btnFallaClear">
                  <span class="ico">🗑️</span><span>Borrar</span>
                </button>
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

              <div class="slotActions upActions">
                <button class="btnUp" type="button" id="up_btnQcCam">
                  <span class="ico">📷</span><span>Foto</span>
                </button>
                <button class="btnUp" type="button" id="up_btnQcFile">
                  <span class="ico">📁</span><span>Cargar</span>
                </button>
                <button class="btnUp btnUp-danger" type="button" id="up_btnQcClear">
                  <span class="ico">🗑️</span><span>Borrar</span>
                </button>
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

              <div class="slotActions upActions">
                <button class="btnUp" type="button" id="up_btnConfCam">
                  <span class="ico">📷</span><span>Foto</span>
                </button>
                <button class="btnUp" type="button" id="up_btnConfFile">
                  <span class="ico">📁</span><span>Cargar</span>
                </button>
                <button class="btnUp btnUp-danger" type="button" id="up_btnConfClear">
                  <span class="ico">🗑️</span><span>Borrar</span>
                </button>
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
  `}function mi(){return`
    <div id="viewMOVILIZADOR" class="card" style="display:none;">
      <h3>Movilizador</h3>
      <div class="small">
        Se muestran solo unidades con conversión finalizada que aún no tienen registro en calidad.
      </div>

      <div class="row" style="gap:10px; margin:10px 0; flex-wrap:wrap;">
        <button id="btnMovRefresh" type="button">Actualizar</button>
      </div>

      <div id="movSummary" class="small" style="margin-top:10px;"></div>
      <div id="movTable" style="margin-top:10px;"></div>
    </div>
  `}function vi(){return`
    <div id="viewSUPERVISOR" class="card" style="display:none;">
      <h3>Supervisor</h3>
      <div class="small">Filtros opcionales: nombre/email, fechas o mes.</div>

      <div class="supTrackRow">
        <button type="button" class="btn" data-suptrack="CONVERSION">CONVERSIÓN</button>
        <button type="button" class="btn" data-suptrack="CALIDAD">CALIDAD</button>
        <button type="button" class="btn" data-suptrack="RAMAL">RAMAL</button>
      </div>
      <div id="supTrackPill" class="pill small" style="text-align:center;">
        CONVERSIÓN (MOTOR + TANQUE)
      </div>

      <div class="fullStack" style="margin-top:10px;">
        <div class="supNameWrap" style="display:flex; gap:10px; align-items:center;">
          <input id="supName" type="text" placeholder="Buscar por nombre o email..." autocomplete="off" style="flex:1;" />
          <select id="supMarca" title="Filtrar por marca" style="width:140px;height:44px;border-radius:14px;padding:0 10px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.18);color:#fff;font-weight:800;outline:none;">
            <option value="ALL">TODOS</option>
            <option value="KYC">KYC</option>
            <option value="JETOUR">JETOUR</option>
            <option value="VW">VOLKSWAGEN</option>
          </select>
          <div id="supNameSuggest" class="nameSuggest hidden" role="listbox"></div>
        </div>

        <div class="supVinRow">
          <div class="supVinWrap">
            <input id="supVin" type="text" placeholder="Buscar por VIN..." />
          </div>
          <button id="btnSupQR" type="button" title="Escanear VIN con cámara">📷</button>
        </div>

        <div class="supDateRow">
          <input id="supFrom" type="date" />
          <input id="supTo" type="date" />
          <button id="btnSupAyer" type="button" class="btn3" title="Rango: Ayer">AYER</button>
          <button id="btnSupHoy" type="button" class="btn3" title="Rango: Hoy">HOY</button>
        </div>

        <div class="row" style="gap:10px; align-items:center;">
          <input id="supMonth" type="month" placeholder="Mes (YYYY-MM)" style="flex:1;" />
          <button id="btnSupEsteMes" type="button" class="btn3" title="Filtrar por este mes">ESTE MES</button>
        </div>

        <div class="twoWide">
          <button id="btnSupApply">Aplicar filtros</button>
          <button id="btnSupClear">Limpiar</button>
        </div>
      </div>

      <div id="supAvgCard" style="margin-top:10px;"></div>
      <div id="supSummary" class="small" style="margin-top:10px;"></div>
      <div id="supTable" style="margin-top:10px;"></div>
    </div>
  `}function gi(){return`
    <div id="supIncModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Incidencias registradas</div>
          <button id="btnCloseSupInc" title="Cerrar">✕</button>
        </div>
        <div class="modalBody">
          <div id="supIncInfo" class="small" style="opacity:.9; margin-bottom:10px;"></div>
          <div id="supIncList"></div>
          <div id="supIncMsg" class="small" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  `}function bi(){return`
    <div class="topbarShell">
      <div class="topbarMain">
        <div class="topbarLeft">
          <div class="topbarTitleRow">
            <h2>Control de Trabajo GLP</h2>
            <span id="userHello" class="topbarHello"></span>
          </div>

          <div class="topbarMetaRow">
            <span id="userPill" class="pill small"></span>
          </div>
        </div>

        <div class="topbarRight">
          <button id="btnLogout" class="topbarBtn topbarBtnLogout" type="button">
            Cerrar sesión
          </button>
        </div>
      </div>

      <div class="topbarActions">
        <button id="btnTheme" type="button" title="Cambiar tema">☀️ / 🌙</button>

        <button id="btnRegistroFallas" type="button" title="Abrir Registro / Fallas">
          📸 Registro / Fallas
        </button>

        <button
          id="btnGoHome"
          type="button"
          class="hidden"
          title="Ir a pantalla principal"
        >
          Pantalla principal
        </button>
      </div>
    </div>
  `}function yi(){return`
    <!-- =========================
         LOADING OVERLAY
         ========================= -->
    <div id="loadingOverlay" class="overlay hidden">
      <div class="overlay-box">
        <div class="spinner"></div>

        <div class="overlay-text">
          <span id="overlayMsg">Procesando</span>
          <span class="dots" aria-hidden="true">
            <span class="dot">.</span><span class="dot dot2">.</span><span class="dot dot3">.</span>
          </span>
        </div>
      </div>
    </div>
  `}function hi(){return`
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
  `}function Ii(){return`
    <!-- =========================
        MODAL INCIDENCIAS
        ========================= -->
    <div id="incModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Registro de incidencias</div>
          <button id="btnCloseInc" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div class="small" id="incInfo" style="opacity:.85; margin-bottom:10px;"></div>

          <div class="card" style="border:1px solid rgba(255,255,255,.16);">
            <div style="font-weight:900; margin-bottom:8px;">Selecciona técnico y severidad</div>

            <label class="small" style="display:block; margin-top:8px;">Técnico</label>

            <div class="supNameWrap" style="margin-top:10px;">
              <input id="incTechInput" type="text" placeholder="Buscar técnico..." autocomplete="off" />
              <div id="incTechSuggest" class="nameSuggest hidden" role="listbox"></div>
            </div>

            <select id="incTech" style="display:none;"></select>

            <label class="small" style="display:block; margin-top:10px;">Tipo de incidencia</label>
            <select id="incTipo" style="width:100%; height:44px;">
              <option value="">Selecciona tipo</option>
              <option value="LEVE">Incidencia leve</option>
              <option value="MODERADA">Incidencia moderada</option>
              <option value="CRITICA">Incidencia crítica</option>
            </select>

            <label class="small" style="display:block; margin-top:10px;">Nota (opcional)</label>
            <textarea id="incNota" rows="2" placeholder="Describe brevemente la incidencia..." style="width:100%;"></textarea>

            <!-- =========================
                 FOTO INCIDENCIA
                 ========================= -->
            <label class="small" style="display:block; margin-top:10px;">Foto de incidencia (opcional)</label>

            <div class="incFotoWrap" style="margin-top:8px;">
              <!-- inputs ocultos -->
              <!-- ✅ iOS fix: capture sin valor permite que el OS elija la mejor opción -->
              <input id="incFotoCam" type="file" accept="image/*" capture style="display:none;" />
              <input id="incFotoFile" type="file" accept="image/*" style="display:none;" />

              <!-- 3 botones en una fila -->
              <div class="row" style="gap:10px; flex-wrap:nowrap; margin-top:8px; align-items:center;">
                <button type="button" id="btnIncFotoCam" class="btn3" style="flex:1; white-space:nowrap;">
                  📷 Foto
                </button>

                <button type="button" id="btnIncFotoFile" class="btn3" style="flex:1; white-space:nowrap;">
                  📁 Cargar
                </button>

                <button type="button" id="btnIncFotoClear" class="btn3" style="flex:1; white-space:nowrap;">
                  🗑️ Borrar
                </button>
              </div>

              <!-- preview (solo una vez) -->
              <div id="incFotoPreviewWrap" class="hidden" style="margin-top:10px;">
                <div class="thumb" style="max-width:220px;">
                  <img
                    id="incFotoPreview"
                    alt="Preview incidencia"
                    style="width:100%; height:auto; display:block; border-radius:8px;"
                  />
                </div>
              </div>
            </div>
          </div>

          <button id="btnIncSave" class="btnInicio"
            style="margin-top:12px; width:100%; height:64px; font-weight:1000;" disabled>
            Guardar incidencia
          </button>

          <div id="incMsg" class="small" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  `}function _i(){return`
    <!-- =========================
         MODAL QR
         ========================= -->
    <div id="qrModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Escanear QR</div>
          <button id="btnCloseQR" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div id="qrReader"></div>

          <div class="twoWide" style="margin-top:12px;">
            <button id="btnScanQR"  type="button" class="btnInicio">QR</button>
            <button id="btnScanBar" type="button" class="btnPausa">CÓDIGO DE BARRAS</button>
          </div>

          <div id="qrMsg" class="small" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  `}function Ci(){return`
    <!-- =========================
        MODAL RF (CALIDAD)
        ========================= -->
    <div id="rfModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Registro</div>
          <button id="btnCloseRF" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div class="small" id="rfInfo" style="opacity:.85; margin-bottom:10px;"></div>

          <!-- ✅ MENU (lo que ya tienes) -->
          <div id="rfMenu">
            <div class="card" style="border:1px solid rgba(255,255,255,.16); margin-bottom:12px;">
              <div style="font-weight:900; margin-bottom:8px;">Control de Calidad</div>
              <div class="small" style="opacity:.9;">Pantalla de control de calidad.</div>

              <button id="btnRfControl" class="btnInicio"
                style="margin-top:12px; width:100%; height:64px; font-weight:1000;">
                Entrar
              </button>
            </div>

            <div class="card" style="border:1px solid rgba(255,255,255,.16);">
              <div style="font-weight:900; margin-bottom:8px;">Registrar falla</div>
              <div class="small" style="opacity:.9;">Registra una falla con nota.</div>

              <button id="btnRfFalla" class="btnInicio"
                style="margin-top:12px; width:100%; height:64px; font-weight:1000;">
                Entrar
              </button>
            </div>
          </div>

          <!-- ✅ AQUI se renderiza el uploader (dentro del modal) -->
          <div id="rfStage" style="display:none; margin-top:12px;"></div>

          <div id="rfMsg" class="small" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  `}function Ai(){return`
    <div id="rfTecModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Registro / Fallas</div>
          <button id="btnCloseRFTec" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div class="small" id="rfTecInfo" style="opacity:.85; margin-bottom:10px;"></div>

          <!-- MENU -->
          <div id="rfTecMenu">
            <div class="card" style="border:1px solid rgba(255,255,255,.16); margin-bottom:12px;">
              <div style="font-weight:900; margin-bottom:8px;">Registrar parámetros</div>
              <div class="small" style="opacity:.9;">Sube las 9 fotos (VIN, COMPRESIÓN, AMPERAJE, VOLTAJE, SCANNER).</div>

              <button id="btnRFTecParams" class="btnInicio"
                style="margin-top:12px; width:100%; height:64px; font-weight:1000;">
                Entrar
              </button>
            </div>

            <div class="card" style="border:1px solid rgba(255,255,255,.16);">
              <div style="font-weight:900; margin-bottom:8px;">Registrar falla</div>
              <div class="small" style="opacity:.9;">Registra una falla con nota y fotos.</div>

              <button id="btnRFTecFalla" class="btnInicio"
                style="margin-top:12px; width:100%; height:64px; font-weight:1000;">
                Entrar
              </button>
            </div>
          </div>

          <!-- STAGE -->
          <div id="rfTecStage" style="display:none; margin-top:12px;"></div>

          <div id="rfTecMsg" class="small" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  `}function Si(){return`
    <!-- =========================
         MODAL CONFIRMAR FIN
         ========================= -->
    <div id="confirmFinishModal" class="modal modalConfirm" aria-hidden="true">
      <div class="modalBox modalConfirmBox">
        <div class="modalHead">
          <div id="confirmFinishTitle" class="modalTitle">Confirmar finalización</div>
          <button id="btnCloseFinishX" type="button" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div
            id="confirmFinishText"
            class="small"
            style="opacity:.92; line-height:1.5;"
          >
            ¿Seguro que quieres finalizar este trabajo?
          </div>

          <div class="row" style="gap:12px; margin-top:18px; flex-wrap:nowrap;">
            <button id="btnCancelFinish" type="button" class="btn" style="flex:1;">
              Cancelar
            </button>

            <button id="btnAcceptFinish" type="button" class="btn danger" style="flex:1;">
              Sí, finalizar
            </button>
          </div>
        </div>
      </div>
    </div>
  `}function Ei(){return`
    ${ri()}

    <!-- =========================
         APP
         ========================= -->
    <div id="viewApp" style="display:none;">
      ${bi()}

      ${ci()}
      ${li()}
      ${di()}
      ${ui()}

      <!-- MOVILIZADOR (stub como lo tenías) -->
      ${mi()}

      ${vi()}
      ${pi()}
      ${fi()}
    </div>

    ${yi()}
    ${_i()}
    ${hi()}
    ${Ii()}
    ${Ci()}
    ${Ai()}
    ${Si()}
    ${gi()}
  `}const za=["TECNICO","RAMALERO","CALIDAD","MOVILIZADOR","SUPERVISOR","ADMIN"],u={state:{rolLock:null,currentProfile:null,currentModule:null,uiLocked:!1,storeByModule:{TECNICO:{itemsByKey:new Map,activeKeys:[],finalKeys:[],lastSyncSince:null,lastSyncRev:null,lastSyncAtMs:0,showFinalizados:!1},CALIDAD:{itemsByKey:new Map,activeKeys:[],finalKeys:[],lastSyncSince:null,lastSyncRev:null,lastSyncAtMs:0,showFinalizados:!1},RAMALERO:{itemsByKey:new Map,activeKeys:[],finalKeys:[],lastSyncSince:null,lastSyncRev:null,lastSyncAtMs:0,showFinalizados:!1}}}};function $(){const t=u.state.currentModule;return t==="CALIDAD"?u.state.storeByModule.CALIDAD:t==="RAMALERO"?u.state.storeByModule.RAMALERO:u.state.storeByModule.TECNICO}function an(){const t=u.state.currentModule;return t==="TECNICO"||t==="CALIDAD"||t==="RAMALERO"}const g=t=>document.getElementById(t);function Ri(){const t=u.state.currentModule;return t==="CALIDAD"?"Q":t==="RAMALERO"?"R":""}function w(t){const e=Ri();return g(t+e)||g(t)}function ae(t=""){g("viewLogin").style.display="block",g("viewApp").style.display="none",g("loginMsg").textContent=t}function Li(){g("viewLogin").style.display="none",g("viewApp").style.display="block",g("loginMsg").textContent=""}function Vt(){const t=g("viewHub");t&&(t.style.display="none"),za.forEach(e=>{const a=document.getElementById(`view${e}`);a&&(a.style.display="none")})}function Ha(t,e){Vt();const a=g("viewHub");a&&(a.style.display="block");const n=g("hubButtons");n&&(n.innerHTML="",t.forEach(o=>{const i=document.createElement("button");i.textContent=o,i.addEventListener("click",()=>e==null?void 0:e(o)),n.appendChild(i)}))}function Mi(){var e;const t=(e=u.state.currentProfile)==null?void 0:e.modulos;return Array.isArray(t)&&t.filter(Boolean).length>1}function Ti(){const t=g("btnGoHome");if(!t)return;const e=Mi();t.classList.toggle("hidden",!e)}function Ni(){const t=u.state.currentProfile||{},e=String(t.rol||"").toUpperCase(),a=String(t.especialidad||"").toUpperCase(),n=Array.isArray(t.modulos)?t.modulos.join(","):"(default)",o=String(t.nombre||"").trim(),i=g("userHello"),s=g("userPill");i&&(i.textContent=o?`HOLA: ${o}`:"HOLA:");const r=e==="TECNICO"?` | ESP: ${a||"-"}`:"";s&&(s.textContent=`ROL: ${e}${r} | MOD: ${n}`)}function Oi(){var a;const t=document.getElementById("debugWrap");if(!t)return;String(((a=u.state.currentProfile)==null?void 0:a.rol)||"").toUpperCase()==="ADMIN"?t.classList.remove("debug-hidden"):t.classList.add("debug-hidden")}function K(t){const e=g("out");e&&(e.textContent=JSON.stringify(t,null,2))}function rt(t){const e=w("estadoBox");e&&(e.textContent=t||"")}const on="glp_email";function Ka(t){const e=String((t==null?void 0:t.rol)||"").toUpperCase();if(Array.isArray(t==null?void 0:t.modulos)&&t.modulos.length){const a=t.modulos.map(n=>String(n||"").trim().toUpperCase()).filter(Boolean);return a.includes("ALL")?[...za]:[...new Set(a)]}return e==="TECNICO"?["TECNICO"]:e==="RAMALERO"?["RAMALERO"]:e==="CALIDAD"?["CALIDAD"]:e==="MOVILIZADOR"?["MOVILIZADOR"]:e==="SUPERVISOR"?["SUPERVISOR"]:e==="ADMIN"?["ADMIN"]:["TECNICO"]}function xi(t){if(String((t==null?void 0:t.rol)||"").toUpperCase()!=="TECNICO")return null;const a=String((t==null?void 0:t.especialidad)||"").toUpperCase();return a==="MOTOR"?"MOTOR":a==="TANQUE"||a==="TANQUERO"?"TANQUE":null}function Le(){if(u.state.currentModule!=="TECNICO")return;const t=g("rol");t&&(u.state.rolLock?(t.value=u.state.rolLock,t.disabled=!0):t.disabled=!1)}function ki(t){localStorage.setItem(on,t)}function Di(){return localStorage.getItem(on)||""}function wi(){localStorage.removeItem(on)}function oe(){var t;return String(((t=g("email"))==null?void 0:t.value)||"").trim().toLowerCase()}function Gt(){var t;return String(((t=w("vin"))==null?void 0:t.value)||"").trim().toUpperCase()}function Wa(){if(u.state.rolLock)return u.state.rolLock;const t=g("rol");return t?String(t.value||"MOTOR").toUpperCase():"MOTOR"}function Et(){return u.state.currentModule==="CALIDAD"?"CALIDAD":u.state.currentModule==="RAMALERO"?"RAMALERO":String(Wa()||"").toUpperCase()}function Rt(){const t=oe();if(!t)throw new Error("NO_EMAIL");return t}const Ga="glp_theme";function Ui(){const t=$i();if(t)return je(t);const e=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches;je(e?"day":"night")}function $i(){try{return localStorage.getItem(Ga)||""}catch{return""}}function Fi(){const t=document.documentElement.dataset.theme||"night";je(t==="day"?"night":"day")}function je(t){const e=t==="day"?"day":"night";document.documentElement.dataset.theme=e;try{localStorage.setItem(Ga,e)}catch{}}function pa(t,e="Procesando..."){var d,p;u.state.uiLocked=!!t;const a=g("loadingOverlay");if(a){a.classList.toggle("hidden",!u.state.uiLocked);const y=document.getElementById("overlayMsg");y&&(y.textContent=String(e||"Procesando").replace(/\.*\s*$/,""))}u.state.uiLocked?rt(e):rt("");const n=g("email");if(n&&(n.disabled=u.state.uiLocked),u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD"){const y=w("vin");y&&(y.disabled=u.state.uiLocked)}const o=g("rol");o&&(o.disabled=u.state.uiLocked||!!u.state.rolLock||u.state.currentModule!=="TECNICO");const i=g("btnMe");i&&(i.disabled=u.state.uiLocked);const s=g("btnLogout");s&&(s.disabled=u.state.uiLocked);const r=["btnEstado","btnActivas","btnFinalizados","btnQR","btnSupQR"];for(const y of r){const b=w(y);b&&(b.disabled=u.state.uiLocked)}const c=w("activasBox"),l=w("finalizadosBox");(d=c==null?void 0:c.querySelectorAll("button[data-act]"))==null||d.forEach(y=>y.disabled=u.state.uiLocked),(p=l==null?void 0:l.querySelectorAll("button[data-act]"))==null||p.forEach(y=>y.disabled=u.state.uiLocked)}async function W(t,e){if(!u.state.uiLocked){pa(!0,e);try{return await t()}finally{pa(!1)}}}async function Tt(t){return await(await fetch(t)).json()}async function sn(t,e){let a,n;try{a=await fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)})}catch(o){throw new Error(`Fallo de conexión: ${(o==null?void 0:o.message)||o}`)}if(!a.ok){const o=await a.text().catch(()=>"");throw new Error(`HTTP ${a.status}: ${o.slice(0,200)||a.statusText}`)}try{n=await a.json()}catch(o){throw new Error(`Respuesta no-JSON desde servidor: ${(o==null?void 0:o.message)||o}`)}return n}async function rn(t,e="Cargando..."){return await W(async()=>await Tt(t),e)}async function Me(t,e,a="Procesando..."){return await W(async()=>await sn(t,e),a)}const re={URL:"https://kfysqxpnkzjomektleqk.supabase.co",ANON_KEY:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmeXNxeHBua3pqb21la3RsZXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODI3MTMsImV4cCI6MjA4ODY1ODcxM30.dF7dShvoWk0IPxHBXMcuZiY55ImKnVcLssGFeFETKxM"};function Ya(){return!0}function Bi(){return{apikey:re.ANON_KEY,Authorization:`Bearer ${re.ANON_KEY}`,"Content-Type":"application/json",Prefer:"return=representation"}}function qi(t={}){const e=[];return Object.entries(t||{}).forEach(([a,n])=>{if(n==null||n==="")return;let o="eq",i=n;n&&typeof n=="object"&&n.op&&n.val!==void 0&&(o=n.op,i=n.val),Array.isArray(i)&&o==="in"?i=`(${i.map(s=>`"${s}"`).join(",")})`:(typeof i=="boolean"||o!=="in")&&(i=String(i)),e.push(`${encodeURIComponent(a)}=${encodeURIComponent(o)}.${encodeURIComponent(i)}`)}),e.length?"?"+e.join("&"):""}async function ot(t,e={}){const a=`${re.URL}/rest/v1/${t}${qi(e)}`,n=await fetch(a,{method:"GET",headers:Bi()});if(!n.ok){const o=await n.text().catch(()=>"");throw new Error(`Supabase GET ${t}: ${n.status} ${o}`)}return await n.json()}let X={};async function fe(t,e){if(X[t])return X[t].listeners.push(e),()=>{X[t].listeners=X[t].listeners.filter(n=>n!==e)};const a=re.URL.replace("https://","wss://").replace("http://","ws://")+"/realtime/v1";try{const n=new WebSocket(`${a}?apikey=${re.ANON_KEY}`);return X[t]={ws:n,listeners:[e],connected:!1},n.onopen=()=>{X[t].connected=!0;const o={type:"subscribe",topic:`realtime:${t}`};n.send(JSON.stringify(o))},n.onmessage=o=>{try{const i=JSON.parse(o.data);if(i.topic!==`realtime:${t}`)return;if(i.type==="broadcast"||i.type==="postgres_changes"){const s=i.payload||i;(s.new||s.old)&&X[t].listeners.forEach(r=>{try{r(s)}catch(c){console.error(`[Realtime ${t}] Callback error:`,c.message)}})}}catch(i){console.warn(`[Realtime ${t}] Parse error:`,i.message)}},n.onerror=o=>{console.error(`[Realtime ${t}] WebSocket error:`,o),X[t].connected=!1},n.onclose=()=>{console.warn(`[Realtime ${t}] Desconectado, reintentando en 5s...`),X[t].connected=!1,setTimeout(()=>fe(t,e).catch(()=>{}),5e3)},()=>{X[t].listeners=X[t].listeners.filter(o=>o!==e),X[t].listeners.length===0&&(X[t].ws.close(),delete X[t])}}catch(n){throw console.error(`[Realtime ${t}] Error:`,n.message),n}}function Vi(){const t={};return Object.entries(X).forEach(([e,a])=>{t[e]={connected:a.connected,listeners:a.listeners.length}}),t}async function Qi(t){const e=await ot("usuarios",{email:t});if(!e||!e.length)return null;const a=e[0],n=await ot("usuario_modulos",{user_id:a.id});return{id:a.id,email:a.email,nombre:a.nombre,rol:a.rol,especialidad:a.especialidad,activo:a.activo,modulos:Array.isArray(n)?n.map(o=>o.modulo):[]}}async function ji(t){const e=await ot("usuarios",{email:t});if(!e||!e.length)return[];const a=e[0].id,n=await ot("asignaciones",{user_id:a,activo:!0});if(!n||!n.length)return[];const o=n.map(r=>r.work_order_id).filter(Boolean),i=o.length>0?await ot("work_orders",{}):[],s=Object.fromEntries(i.filter(r=>o.includes(r.id)).map(r=>[r.id,r]));return n.map(r=>{const c=s[r.work_order_id]||{};return{...r,...c,tiempo_ms:Number(r.tiempo_trab_ms||0),estado:r.estado_actual}}).filter(r=>r.work_order_id)}async function Pi(t){const e=await ot("usuarios",{email:t});if(!e||!e.length)return[];const a=e[0].id,n=await ot("asignaciones",{user_id:a,estado_actual:"FINALIZADO"});if(!n||!n.length)return[];const o=n.map(r=>r.work_order_id).filter(Boolean),i=o.length>0?await ot("work_orders",{}):[],s=Object.fromEntries(i.filter(r=>o.includes(r.id)).map(r=>[r.id,r]));return n.map(r=>{const c=s[r.work_order_id]||{};return{...r,...c,tiempo_ms:Number(r.tiempo_trab_ms||0),estado:r.estado_actual}}).filter(r=>r.work_order_id)}async function zi(t,e,a){const n=await ot("usuarios",{email:t});if(!n||!n.length)return null;const o=n[0].id,i=await ot("work_orders",{vin:e});if(!i||!i.length)return null;const s=i[0].id,c=(await ot("asignaciones",{})).find(l=>l.work_order_id===s&&l.user_id===o&&l.rol_trabajo===a);return{vin:e,rolTrabajo:a,estado:c?c.estado_actual:"SIN_INICIAR",tiempoMs:c?c.tiempo_trab_ms:0}}async function Hi(t){return(await ot("incidencias",{vin:t})).map(a=>({id:a.id,fecha_hora:a.fecha_hora,vin:a.vin,type:a.tipo,nota:a.nota,registrado_por:a.registrado_por,foto_file_id:a.foto_file_id}))}async function Ki(t="",e=12){if(!t||t.length<1)return[];try{const a=await fetch(`/api/vin-suggest?q=${encodeURIComponent(t)}&limit=${e}`,{method:"GET"});if(!a.ok)throw new Error(`Backend getVinSuggest: ${a.status}`);const n=await a.json();return((n==null?void 0:n.items)||[]).map(o=>({vin:o.vin,modelo:o.modelo,cliente:o.cliente}))}catch(a){return console.error("[getVinSuggest] Error:",a.message),[]}}const Ja="glp_vin_cache_v1",Za="glp_ramal_cache_v1";function Xa(){try{return JSON.parse(localStorage.getItem(Ja)||"{}")}catch{return{}}}function Wi(t){try{localStorage.setItem(Ja,JSON.stringify(t))}catch{}}function to(t,e){const a=String(t||"").trim(),n=String(e||"").toUpperCase().trim();return a&&n?`${a}|${n}`:""}function Gi(t,e,a){var l;const n=String(t||"").trim(),o=String(a||"").trim().toUpperCase();if(!n||!o)return;const i=String(e||"").toUpperCase().trim(),s=to(n,i);if(!s)return;const r=Xa();r[s]={vin:o,ts:Date.now()};const c=336*3600*1e3;for(const d of Object.keys(r))(!((l=r[d])!=null&&l.ts)||Date.now()-r[d].ts>c)&&delete r[d];Wi(r)}function Yi(t,e){var o;const a=to(t,e);if(!a)return"";const n=Xa();return String(((o=n[a])==null?void 0:o.vin)||"").toUpperCase()}function eo(){try{return JSON.parse(localStorage.getItem(Za)||"{}")}catch{return{}}}function Ji(t){try{localStorage.setItem(Za,JSON.stringify(t))}catch{}}function no(t){const e=String(t||"").trim();return e?`RAMAL|${e}`:""}function Zi(t,e){var s;const a=String(t||"").trim(),n=String(e||"").trim();if(!a||!n)return;const o=eo();o[no(a)]={tipoRamal:n,ts:Date.now()};const i=336*3600*1e3;for(const r of Object.keys(o))(!((s=o[r])!=null&&s.ts)||Date.now()-o[r].ts>i)&&delete o[r];Ji(o)}function Xi(t){var n;const e=String(t||"").trim();if(!e)return"";const a=eo();return String(((n=a[no(e)])==null?void 0:n.tipoRamal)||"")}function T(t){return String(t??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function ts(t){return window.CSS&&typeof CSS.escape=="function"?CSS.escape(String(t)):String(t).replace(/["\\]/g,"\\$&")}function wt(t){if(!t)return"-";const e=new Date(t);return isNaN(e.getTime())?"-":new Intl.DateTimeFormat("es-PE",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}).format(e)}function ao(t){if(!t)return"-";const e=new Date(t);return isNaN(e.getTime())?"-":new Intl.DateTimeFormat("es-PE",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(e)}function Ut(t){t=Math.max(0,Number(t)||0);const e=Math.floor(t/1e3),a=String(Math.floor(e/3600)).padStart(2,"0"),n=String(Math.floor(e%3600/60)).padStart(2,"0"),o=String(e%60).padStart(2,"0");return`${a}:${n}:${o}`}function Te(t){const e=String((t==null?void 0:t.conversionId)||"").trim(),a=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();return`${e}|${a}`}const oo=new Map;let te=null;function es(t,e,a){oo.set(String(t||"").toUpperCase(),{enter:e,exit:a})}function Nt(t){const e=String(t||"").toUpperCase();if(te!=null&&te.exit)try{te.exit()}catch{}const a=oo.get(e);if(a!=null&&a.enter)try{a.enter()}catch{}te=a||null}Nt.register=es;const $t="/api/uploader/proxy";function ut(){const t=new Date,e=t.getFullYear(),a=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${e}-${a}-${n}`}function ee(t){const e=["B","KB","MB","GB"];let a=0,n=Number(t||0);for(;n>=1024&&a<e.length-1;)n/=1024,a++;return`${n.toFixed(a===0?0:1)} ${e[a]}`}async function le(t,e=$t){const n=await fetch(e||$t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}),o=await n.text().catch(()=>"");if(!n.ok)throw new Error(`HTTP ${n.status} ${n.statusText} ${o||""}`.trim());try{return JSON.parse(o)}catch{throw new Error(`Respuesta no-JSON desde backend: ${o.slice(0,300)}`)}}async function Ne(t){if(!t)return"";if(!/^image\//i.test(t.type||""))return await new Promise((a,n)=>{const o=new FileReader;o.onload=()=>a(String(o.result).split(",")[1]||""),o.onerror=()=>n(new Error("No se pudo leer el archivo.")),o.readAsDataURL(t)});const e=URL.createObjectURL(t);try{const a=await new Promise((p,y)=>{const b=new Image,f=setTimeout(()=>{y(new Error("La imagen tardó demasiado en cargar para compresión."))},15e3);b.onload=()=>{clearTimeout(f),p(b)},b.onerror=()=>{clearTimeout(f),y(new Error("No se pudo abrir la imagen para compresión."))},b.src=e}),n=960,o=.65;let i=a.naturalWidth||a.width||0,s=a.naturalHeight||a.height||0;if(!i||!s)throw new Error("La imagen no tiene dimensiones válidas.");if(i>n){const p=n/i;i=Math.round(i*p),s=Math.round(s*p)}const r=document.createElement("canvas");r.width=i,r.height=s;const c=r.getContext("2d");if(!c)throw new Error("No se pudo crear el contexto de compresión.");c.drawImage(a,0,0,i,s);const l=r.toDataURL("image/jpeg",o),d=String(l).split(",")[1]||"";if(!d)throw new Error("La compresión devolvió una imagen vacía.");return d}catch(a){throw new Error(`Error comprimiendo imagen: ${(a==null?void 0:a.message)||a}`)}finally{URL.revokeObjectURL(e)}}async function ns({vin:t,dateStr:e,apsUrl:a=$t}){return le({action:"getStatus",vin:t,dateStr:e},a)}async function as({vin:t,dateStr:e,slot:a,file:n,apsUrl:o=$t}){const i=await Ne(n);return le({action:"uploadOne",vin:t,dateStr:e,slot:a,mimeType:"image/jpeg",b64:i},o)}async function os({vin:t,dateStr:e,note:a,files:n=[],onProgress:o,apsUrl:i=$t}){const s=[];for(let r=0;r<n.length;r++){typeof o=="function"&&o({phase:"prepare",index:r+1,total:n.length});const c=await Ne(n[r]);s.push({slot:"falla",mimeType:"image/jpeg",b64:c})}return typeof o=="function"&&o({phase:"upload",total:s.length}),le({action:"uploadFalla",vin:t,dateStr:e,note:a,files:s},i)}async function is({vin:t,dateStr:e,items:a=[],onProgress:n,apsUrl:o=$t}){const i=[];for(let s=0;s<a.length;s++){const r=a[s];if(!(r!=null&&r.file)||!(r!=null&&r.slot))continue;typeof n=="function"&&n({phase:"prepare",slot:r.slot,index:s+1,total:a.length});const c=await Ne(r.file);i.push({slot:r.slot,mimeType:"image/jpeg",b64:c})}return typeof n=="function"&&n({phase:"upload",total:i.length}),le({action:"uploadCalidad",vin:t,dateStr:e,files:i},o)}async function ss({tipo:t,vin:e,dateStr:a,tecnico:n,checklist:o,file:i,onProgress:s,apsUrl:r=$t}){typeof s=="function"&&s({phase:"prepare"});const c=await Ne(i);return typeof s=="function"&&s({phase:"upload"}),le({action:"uploadConformidad",tipo:t,vin:e,dateStr:a,tecnico:n,checklist:o,file:{mimeType:"image/jpeg",b64:c}},r)}function rs(t){return String(t||"").replace(/\s+/g,"").trim().toUpperCase()}function cs(t){const e=t==="BAR";return{fps:e?8:10,qrbox:e?{width:160,height:320}:{width:250,height:250},formatsToSupport:e?[Html5QrcodeSupportedFormats.CODE_128,Html5QrcodeSupportedFormats.CODE_39,Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.UPC_E,Html5QrcodeSupportedFormats.ITF,Html5QrcodeSupportedFormats.CODABAR]:[Html5QrcodeSupportedFormats.QR_CODE],experimentalFeatures:{useBarCodeDetectorIfSupported:!0}}}async function ls(t,e,a){var s;try{await t.start({facingMode:{exact:"environment"}},e,a,()=>{});return}catch{}try{await t.start({facingMode:"environment"},e,a,()=>{});return}catch{}const n=await Html5Qrcode.getCameras();let o=((s=n==null?void 0:n[0])==null?void 0:s.id)||null;const i=n==null?void 0:n.find(r=>/back|rear|environment/i.test(r.label||""));i!=null&&i.id&&(o=i.id),await t.start(o??{facingMode:"environment"},e,a,()=>{})}async function ds(t){try{t&&t.isScanning&&await t.stop()}catch{}}function Ht(t){let e=null;function a(){if(!window.Html5Qrcode)throw new Error("No se pudo cargar la librería Html5Qrcode.");return e||(e=new Html5Qrcode(t)),e}async function n({mode:r="QR",onDecoded:c,config:l,msgEl:d}={}){try{const p=a(),y=l||cs(r);await ls(p,y,async f=>{const I=rs(f);I&&await(c==null?void 0:c(I))})}catch(p){throw d&&(d.textContent="No se pudo abrir la cámara. Revisa permisos (HTTPS o localhost)."),p}}async function o(){await ds(e)}function i(){return e}function s(){return!!(e&&e.isScanning)}return{start:n,stop:o,getInstance:i,isActive:s}}function io(t,e={}){const a=t.querySelector(".uploader-shell")||t,n=m=>a.querySelector(`#up_${m}`);let o=[null,null,null,null],i=[],s=[null,null,null,null],r=null;const c=Ht("up_qrReader_params"),l=Ht("up_qrReader_falla"),d=Ht("up_qrReader_qc"),p=Ht("up_qrReader_conf"),y={vin:"Foto del VIN",comp_1:"Compresión",comp_2:"Compresión",comp_3:"Compresión",comp_4:"Compresión",corr_pre:"Corriente antes",corr_post:"Corriente después",voltaje:"Voltaje",scan_carro:"Scan del carro"},b={menu:n("screenMenu"),params:n("screenParams"),falla:n("screenFalla"),calidad:n("screenCalidad"),conformidad:n("screenConformidad")};function f(m,v){const h=n(m);h&&(h.textContent=String(v||""))}function I(m){try{return new URLSearchParams(window.location.search).get(m)||""}catch{return""}}function S(m){Object.values(b).forEach(h=>h&&h.classList.remove("active"));const v=b[m];v&&v.classList.add("active"),Fe().catch(()=>{})}function q(){if(typeof e.onBackControl=="function"){e.onBackControl();return}S("menu")}function it(m){const v=n("imgModal"),h=n("imgModalImg");!v||!h||!m||(h.src=m,v.classList.add("open"),v.setAttribute("aria-hidden","false"))}function ft(){const m=n("imgModal"),v=n("imgModalImg");!m||!v||(m.classList.remove("open"),v.src="",m.setAttribute("aria-hidden","true"))}function R(m,v){const h=n(`${m}_previewBox`),C=n(`${m}_meta`);if(!h||!C)return;if(!v){h.innerHTML='<span class="small">Sin foto</span>',C.textContent="Ningún archivo seleccionado.";return}C.textContent=`${v.name||"(foto)"} • ${ee(v.size||0)}`;const A=URL.createObjectURL(v);h.innerHTML=`<img alt="preview" src="${A}">`,setTimeout(()=>URL.revokeObjectURL(A),15e3)}function x(m,v){const h=n(`${m}_previewBox`),C=n(`${m}_meta`);if(!h||!C||!v)return;const A=v.thumbUrl||"",L=v.imgUrl||"";C.textContent="📡 Ya existe en Drive (preview).";const M=document.createElement("img");M.alt="drive preview",M.loading="lazy",M.referrerPolicy="no-referrer",M.style.width="100%",M.style.height="100%",M.style.objectFit="cover",M.style.display="block",M.src=A||L,M.onerror=()=>{L&&M.src!==L?M.src=L:h.innerHTML='<span class="small">No se pudo cargar preview</span>'},h.innerHTML="",h.appendChild(M)}function V(m,v){const h=n(`comp_p${m}`);if(!h||!v)return;const C=v.thumbUrl||"",A=v.imgUrl||"",L=document.createElement("img");L.alt="drive preview",L.loading="lazy",L.referrerPolicy="no-referrer",L.style.width="100%",L.style.height="100%",L.style.objectFit="cover",L.style.display="block",L.src=C||A,L.onerror=()=>{A&&L.src!==A?L.src=A:h.innerHTML=`<span class="small">${m}</span>`},h.innerHTML="",h.appendChild(L)}function Y(m){let v="";v+=`VIN: ${m.vin||"-"}
`,v+=`Fecha: ${m.dateStr||"-"}
`,v+=`Carpeta: ${m.monthFolderName||"-"} / ${m.carFolderName||"-"} / REGISTRO

`;const C=["comp_1","comp_2","comp_3","comp_4"].filter(at=>m.status&&m.status[at]).length,A=4-C;v+=`${C===4?"✅":"❌"} Compresión (${C}/4)
`,A>0&&(v+=`   Faltan: ${A} foto(s)
`);const L=["vin","corr_pre","corr_post","voltaje","scan_carro"],M=[];for(const at of L){const H=m.status&&m.status[at],dt=m.previews&&m.previews[at];v+=`${H?"✅":"❌"} ${y[at]}`,dt&&dt.url&&(v+=`  (ver: ${dt.url})`),v+=`
`,H||M.push(y[at])}const N=A+M.length;v+=`
Faltantes (${N}/9):
- ${N?[`Compresión (${C}/4)`,...M].join(`
- `):"Ninguno 🎉"}`,f("out",v)}async function D(){var h,C;const m=(((h=n("vinText"))==null?void 0:h.value)||"").trim(),v=((C=n("dateStr"))==null?void 0:C.value)||ut();if(!m){f("out","❌ Falta VIN (texto).");return}try{const A=await ns({vin:m,dateStr:v,apsUrl:e.apsUrl});if(!A.ok){f("out","❌ getStatus: "+(A.error||"Error"));return}Y(A),A.previews&&(["vin","corr_pre","corr_post","voltaje","scan_carro"].forEach(L=>{const M=A.previews[L];M&&x(L,M)}),["comp_1","comp_2","comp_3","comp_4"].forEach((L,M)=>{const N=A.previews[L];N&&V(M+1,N)}))}catch(A){f("out",`❌ Error getStatus: ${A}`)}}async function B(m,v,h="out",C="",A=""){var N,at;const L=String(C||((N=n("vinText"))==null?void 0:N.value)||"").trim(),M=String(A||((at=n("dateStr"))==null?void 0:at.value)||ut());if(!L)return f(h,"❌ Falta VIN."),{ok:!1,error:"Falta VIN"};try{f(h,`Preparando ${m}...
`);const H=await as({vin:L,dateStr:M,slot:m,file:v,apsUrl:e.apsUrl});if(!H.ok)return f(h,`❌ uploadOne(${m}): ${H.error}`),H;if(H.preview)if(m.startsWith("comp_")){const dt=Number(m.split("_")[1]||"0");dt>=1&&dt<=4&&V(dt,H.preview)}else x(m,H.preview);return f(h,`✅ Guardado: ${m}
`),H}catch(H){return f(h,`❌ Error ${m}: ${H}`),{ok:!1,error:String(H)}}}function bt(){o=[null,null,null,null],["comp_p1","comp_p2","comp_p3","comp_p4"].forEach((h,C)=>{const A=n(h);A&&(A.innerHTML=`<span class="small">${C+1}</span>`)}),f("comp_meta","Ningún archivo seleccionado.");const m=n("comp_cam"),v=n("comp_file");m&&(m.value=""),v&&(v.value="")}function pe(){["comp_p1","comp_p2","comp_p3","comp_p4"].forEach((C,A)=>{const L=n(C),M=o[A];if(!L)return;if(!M){L.innerHTML=`<span class="small">${A+1}</span>`;return}const N=URL.createObjectURL(M);L.innerHTML=`<img alt="preview" src="${N}">`,setTimeout(()=>URL.revokeObjectURL(N),15e3)});const v=o.filter(Boolean),h=v.reduce((C,A)=>C+(A.size||0),0);f("comp_meta",v.length?`${v.length}/4 seleccionadas • ${ee(h)}`:"Ningún archivo seleccionado.")}async function An(m){if(!m)return;let v=o.findIndex(C=>!C);v===-1&&(v=3),o[v]=m,pe();const h=`comp_${v+1}`;await B(h,m,"out");try{await D()}catch{}}async function Jo(m){const v=(m==null?void 0:m[0])||null;if(!v)return;await An(v);const h=n("comp_cam");h&&(h.value="")}async function Zo(m){const v=Array.from(m||[]);if(!v.length)return;const h=v.slice(-4);for(const A of h)await An(A);const C=n("comp_file");C&&(C.value="")}function Xt(){const m=n("fallaGrid");if(!m)return;m.innerHTML="",i.forEach((h,C)=>{const A=URL.createObjectURL(h),L=document.createElement("div");L.style.position="relative";const M=document.createElement("div");M.className="thumb",M.innerHTML=`<img alt="falla" src="${A}">`,L.appendChild(M);const N=document.createElement("button");N.type="button",N.textContent="✖",N.className="btn3",N.style.position="absolute",N.style.top="6px",N.style.right="6px",N.style.padding="4px 8px",N.style.borderRadius="10px",N.onclick=()=>{i.splice(C,1),Xt()},L.appendChild(N),m.appendChild(L),setTimeout(()=>URL.revokeObjectURL(A),15e3)});const v=i.reduce((h,C)=>h+(C.size||0),0);f("fallaFotosMeta",`${i.length} archivo(s) • ${ee(v)}`)}function Sn(m){const v=Array.from(m||[]);v.length&&(i.push(...v),Xt())}function $e(){s=[null,null,null,null],["qc_p1","qc_p2","qc_p3","qc_p4"].forEach((h,C)=>{const A=n(h);A&&(A.innerHTML=`<span class="small">${C+1}</span>`)}),f("qc_meta","0/4 seleccionadas.");const m=n("qc_cam"),v=n("qc_file");m&&(m.value=""),v&&(v.value="")}function Xo(){["qc_p1","qc_p2","qc_p3","qc_p4"].forEach((C,A)=>{const L=n(C),M=s[A];if(!L)return;if(!M){L.innerHTML=`<span class="small">${A+1}</span>`;return}const N=URL.createObjectURL(M);L.innerHTML=`<img alt="qc" src="${N}">`,setTimeout(()=>URL.revokeObjectURL(N),15e3)});const v=s.filter(Boolean),h=v.reduce((C,A)=>C+(A.size||0),0);f("qc_meta",`${v.length}/4 seleccionadas • ${ee(h)} (mín 3)`)}async function En(m){var M,N;if(!m)return;s[0]=s[1],s[1]=s[2],s[2]=s[3],s[3]=m,Xo();const C=`calidad_${s.filter(Boolean).length}`,A=(((M=n("qcVin"))==null?void 0:M.value)||"").trim(),L=((N=n("qcDate"))==null?void 0:N.value)||ut();await B(C,m,"outQc",A,L)}async function ti(m){const v=(m==null?void 0:m[0])||null;if(!v)return;await En(v);const h=n("qc_cam");h&&(h.value="")}async function ei(m){const v=Array.from(m||[]);if(!v.length)return;const h=v.slice(-4);for(const A of h)await En(A);const C=n("qc_file");C&&(C.value="")}function jt(){const m=n("conf_previewBox"),v=n("conf_meta");if(!m||!v)return;if(!r){m.innerHTML='<span class="small">Sin foto</span>',v.textContent="Ningún archivo seleccionado.";return}v.textContent=`${r.name||"(foto)"} • ${ee(r.size||0)}`;const h=URL.createObjectURL(r);m.innerHTML=`<img alt="equipo" src="${h}">`,setTimeout(()=>URL.revokeObjectURL(h),15e3)}function Rn(m){var h,C;n("confTipo")&&(n("confTipo").value=m),n("confTitle")&&(n("confTitle").textContent=`Conformidad equipo (${m})`);const v=(((h=n("vinText"))==null?void 0:h.value)||"").trim();v&&n("confVin")&&(n("confVin").value=v),n("confDate")&&(n("confDate").value=((C=n("dateStr"))==null?void 0:C.value)||ut()),n("chk1")&&(n("chk1").checked=!1),n("chk2")&&(n("chk2").checked=!1),n("chk3")&&(n("chk3").checked=!1),r=null,jt(),S("conformidad")}const Ln={params:{scanner:c,box:"qrBox_params",stop:"btnStop_params",msg:"scanMsg_params",mode:"scanMode_params",setVin:m=>{n("vinText")&&(n("vinText").value=m),D().catch(()=>{})}},falla:{scanner:l,box:"qrBox_falla",stop:"btnStop_falla",msg:"scanMsg_falla",mode:"scanMode_falla",setVin:m=>{n("fallaVin")&&(n("fallaVin").value=m)}},qc:{scanner:d,box:"qrBox_qc",stop:"btnStop_qc",msg:"scanMsg_qc",mode:"scanMode_qc",setVin:m=>{n("qcVin")&&(n("qcVin").value=m)}},conf:{scanner:p,box:"qrBox_conf",stop:"btnStop_conf",msg:"scanMsg_conf",mode:"scanMode_conf",setVin:m=>{n("confVin")&&(n("confVin").value=m)}}};async function lt(m){const v=Ln[m];if(!v)return;await v.scanner.stop();const h=n(v.box),C=n(v.stop),A=n(v.mode);h&&(h.style.display="none"),C&&(C.style.display="none"),A&&(A.textContent="")}async function Fe(){await lt("params"),await lt("falla"),await lt("qc"),await lt("conf")}async function yt(m,v){await lt(m);const h=Ln[m];if(!h)return;const C=n(h.box),A=n(h.stop),L=n(h.msg),M=n(h.mode);C&&(C.style.display="block"),A&&(A.style.display="inline-block"),L&&(L.textContent=""),M&&(M.textContent=v==="QR"?"Modo: SOLO QR":"Modo: SOLO BARRAS (CODE_128 y otros)");try{await h.scanner.start({mode:v,msgEl:n(h.msg),onDecoded:N=>{h.setVin(N),n(h.msg)&&(n(h.msg).textContent=`Detectado (${v==="QR"?"QR":"BARRAS"}): ${N}`),lt(m).catch(()=>{})}})}catch(N){n(h.msg)&&(n(h.msg).textContent=`Error cámara (${v}): ${N}`)}}function ni(){const m=(I("vin")||I("VIN")||"").trim();m&&(n("vinText")&&(n("vinText").value=m),n("fallaVin")&&(n("fallaVin").value=m),n("qcVin")&&(n("qcVin").value=m),n("confVin")&&(n("confVin").value=m));const v=(I("date")||I("fecha")||"").trim();v&&(n("dateStr")&&(n("dateStr").value=v),n("fallaDate")&&(n("fallaDate").value=v),n("qcDate")&&(n("qcDate").value=v),n("confDate")&&(n("confDate").value=v));const h=(I("pantalla")||I("screen")||"").toLowerCase();h==="params"&&S("params"),h==="falla"&&S("falla"),(h==="calidad"||h==="qc")&&S("calidad"),(h==="conformidad"||h==="conf")&&S("conformidad"),m&&D().catch(()=>{})}function ai(){const m=ut();n("dateStr")&&!n("dateStr").value&&(n("dateStr").value=m),n("fallaDate")&&!n("fallaDate").value&&(n("fallaDate").value=m),n("qcDate")&&!n("qcDate").value&&(n("qcDate").value=m),n("confDate")&&!n("confDate").value&&(n("confDate").value=m)}function oi(){var v,h,C,A,L,M,N,at,H,dt,Mn,Tn,Nn,On,xn,kn,Dn,wn,Un,$n,Fn,Bn,qn,Vn,Qn,jn,Pn,zn,Hn,Kn,Wn,Gn,Yn,Jn,Zn,Xn,ta,ea,na,aa,oa,ia,sa,ra;(v=n("goParams"))==null||v.addEventListener("click",()=>S("params")),(h=n("goFalla"))==null||h.addEventListener("click",()=>{var O,k;const _=(((O=n("vinText"))==null?void 0:O.value)||"").trim();_&&n("fallaVin")&&(n("fallaVin").value=_),n("fallaDate")&&(n("fallaDate").value=((k=n("dateStr"))==null?void 0:k.value)||ut()),S("falla")}),(C=n("goCalidad"))==null||C.addEventListener("click",()=>{var O,k;const _=(((O=n("vinText"))==null?void 0:O.value)||"").trim();_&&n("qcVin")&&(n("qcVin").value=_),n("qcDate")&&(n("qcDate").value=((k=n("dateStr"))==null?void 0:k.value)||ut()),S("calidad")}),(A=n("goConfTanque"))==null||A.addEventListener("click",()=>Rn("TANQUE")),(L=n("goConfReductor"))==null||L.addEventListener("click",()=>Rn("REDUCTOR")),(M=n("btnBackControl"))==null||M.addEventListener("click",q),(N=n("imgModalClose"))==null||N.addEventListener("click",ft),(at=n("imgModal"))==null||at.addEventListener("click",_=>{_.target===n("imgModal")&&ft()}),document.addEventListener("keydown",_=>{_.key==="Escape"&&ft()}),a.addEventListener("click",_=>{var k,P;const O=(P=(k=_.target)==null?void 0:k.closest)==null?void 0:P.call(k,".thumb img");O&&it(O.currentSrc||O.src)}),a.addEventListener("click",_=>{const O=_.target.closest("button");if(!O)return;O.getAttribute("data-nav")==="menu"&&S("menu")}),(H=n("btnRefresh"))==null||H.addEventListener("click",D),(dt=n("vinText"))==null||dt.addEventListener("change",D),(Mn=n("dateStr"))==null||Mn.addEventListener("change",D),(Tn=n("btnUpload"))==null||Tn.addEventListener("click",async()=>{f("out","📡 Refrescando estado..."),await D()}),a.addEventListener("click",_=>{var P,J,Z,U;const O=_.target.closest("button");if(!O)return;const k=O.getAttribute("data-slot");if(k&&(O.getAttribute("data-pick")==="cam"&&(k==="comp"?(P=n("comp_cam"))==null||P.click():(J=n(`${k}_cam`))==null||J.click()),O.getAttribute("data-pick")==="file"&&(k==="comp"?(Z=n("comp_file"))==null||Z.click():(U=n(`${k}_file`))==null||U.click()),O.getAttribute("data-clear")==="1"))if(k==="comp")bt();else{R(k,null);const F=n(`${k}_cam`),ht=n(`${k}_file`);F&&(F.value=""),ht&&(ht.value="")}}),["vin","corr_pre","corr_post","voltaje","scan_carro"].forEach(_=>{const O=n(`${_}_cam`),k=n(`${_}_file`),P=async J=>{var F,ht;const Z=(ht=(F=J.target)==null?void 0:F.files)==null?void 0:ht[0];if(!Z)return;R(_,Z);const U=await B(_,Z,"out");if(U&&U.ok){O&&(O.value=""),k&&(k.value="");try{await D()}catch{}}};O&&O.addEventListener("change",P),k&&k.addEventListener("change",P),R(_,null)}),(Nn=n("comp_cam"))==null||Nn.addEventListener("change",_=>Jo(_.target.files)),(On=n("comp_file"))==null||On.addEventListener("change",_=>Zo(_.target.files)),bt(),(xn=n("btnScanQR_params"))==null||xn.addEventListener("click",()=>yt("params","QR")),(kn=n("btnScanBAR_params"))==null||kn.addEventListener("click",()=>yt("params","BAR")),(Dn=n("btnStop_params"))==null||Dn.addEventListener("click",()=>lt("params")),(wn=n("btnScanQR_falla"))==null||wn.addEventListener("click",()=>yt("falla","QR")),(Un=n("btnScanBAR_falla"))==null||Un.addEventListener("click",()=>yt("falla","BAR")),($n=n("btnStop_falla"))==null||$n.addEventListener("click",()=>lt("falla")),(Fn=n("btnScanQR_qc"))==null||Fn.addEventListener("click",()=>yt("qc","QR")),(Bn=n("btnScanBAR_qc"))==null||Bn.addEventListener("click",()=>yt("qc","BAR")),(qn=n("btnStop_qc"))==null||qn.addEventListener("click",()=>lt("qc")),(Vn=n("btnScanQR_conf"))==null||Vn.addEventListener("click",()=>yt("conf","QR")),(Qn=n("btnScanBAR_conf"))==null||Qn.addEventListener("click",()=>yt("conf","BAR")),(jn=n("btnStop_conf"))==null||jn.addEventListener("click",()=>lt("conf")),(Pn=n("btnFallaCam"))==null||Pn.addEventListener("click",()=>{var _;return(_=n("falla_cam"))==null?void 0:_.click()}),(zn=n("btnFallaFile"))==null||zn.addEventListener("click",()=>{var _;return(_=n("falla_file"))==null?void 0:_.click()}),(Hn=n("btnFallaClear"))==null||Hn.addEventListener("click",()=>{i=[],Xt()}),(Kn=n("falla_cam"))==null||Kn.addEventListener("change",_=>{Sn(_.target.files),_.target.value=""}),(Wn=n("falla_file"))==null||Wn.addEventListener("change",_=>{Sn(_.target.files),_.target.value=""}),(Gn=n("btnEnviarFalla"))==null||Gn.addEventListener("click",async()=>{var P,J,Z;const _=(((P=n("fallaVin"))==null?void 0:P.value)||"").trim(),O=((J=n("fallaDate"))==null?void 0:J.value)||ut(),k=(((Z=n("fallaNota"))==null?void 0:Z.value)||"").trim();if(!_){f("outFalla","❌ Falta VIN.");return}if(!k&&i.length===0){f("outFalla","⚠️ Agrega una nota o al menos una foto.");return}try{const U=await os({vin:_,dateStr:O,note:k,files:i,apsUrl:e.apsUrl,onProgress:F=>{F.phase==="prepare"?f("outFalla",`Preparando foto ${F.index}/${F.total}...
`):F.phase==="upload"&&f("outFalla",`Subiendo FALLA (${F.total} foto(s) + nota)...
`)}});if(!U.ok){f("outFalla","❌ uploadFalla: "+(U.error||"Error"));return}f("outFalla",`✅ Falla registrada.
Carpeta: ${U.carFolderName}/FALLAS
Batch: ${U.batchId}
Guardados: ${U.savedCount}`),i=[],Xt()}catch(U){f("outFalla",`❌ Error FALLA: ${U}`)}}),Xt(),(Yn=n("btnQcCam"))==null||Yn.addEventListener("click",()=>{var _;return(_=n("qc_cam"))==null?void 0:_.click()}),(Jn=n("btnQcFile"))==null||Jn.addEventListener("click",()=>{var _;return(_=n("qc_file"))==null?void 0:_.click()}),(Zn=n("btnQcClear"))==null||Zn.addEventListener("click",$e),(Xn=n("qc_cam"))==null||Xn.addEventListener("change",_=>ti(_.target.files)),(ta=n("qc_file"))==null||ta.addEventListener("change",_=>ei(_.target.files)),$e(),(ea=n("btnQcUpload"))==null||ea.addEventListener("click",async()=>{var J,Z;const _=(((J=n("qcVin"))==null?void 0:J.value)||"").trim(),O=((Z=n("qcDate"))==null?void 0:Z.value)||ut();if(!_){f("outQc","❌ Falta VIN.");return}if(s.filter(Boolean).length<3){f("outQc","⚠️ Debes subir mínimo 3 fotos de calidad.");return}const P=[];for(let U=0;U<4;U++){const F=s[U];F&&P.push({slot:`calidad_${U+1}`,file:F})}try{const U=await is({vin:_,dateStr:O,items:P,apsUrl:e.apsUrl,onProgress:F=>{F.phase==="prepare"?f("outQc",`Preparando ${F.slot}...
`):F.phase==="upload"&&f("outQc",`Enviando CALIDAD (${F.total} foto(s))...
`)}});if(!U.ok){f("outQc","❌ uploadCalidad: "+(U.error||"Error"));return}f("outQc",`✅ Calidad registrada.
Carpeta: ${U.carFolderName}/CALIDAD
Guardados: ${Array.isArray(U.saved)?U.saved.length:P.length}`),$e()}catch(U){f("outQc",`❌ Error CALIDAD: ${U}`)}}),(na=n("btnConfCam"))==null||na.addEventListener("click",()=>{var _;return(_=n("conf_cam"))==null?void 0:_.click()}),(aa=n("btnConfFile"))==null||aa.addEventListener("click",()=>{var _;return(_=n("conf_file"))==null?void 0:_.click()}),(oa=n("btnConfClear"))==null||oa.addEventListener("click",()=>{r=null,jt()}),(ia=n("conf_cam"))==null||ia.addEventListener("change",_=>{var O;r=((O=_.target.files)==null?void 0:O[0])||null,jt(),_.target.value=""}),(sa=n("conf_file"))==null||sa.addEventListener("change",_=>{var O;r=((O=_.target.files)==null?void 0:O[0])||null,jt(),_.target.value=""}),(ra=n("btnEnviarConf"))==null||ra.addEventListener("click",async()=>{var Z,U,F,ht,ca,la,da;const _=(((Z=n("confTipo"))==null?void 0:Z.value)||"").trim(),O=(((U=n("confVin"))==null?void 0:U.value)||"").trim(),k=((F=n("confDate"))==null?void 0:F.value)||ut(),P=(((ht=n("confTecnico"))==null?void 0:ht.value)||"").trim(),J={revisadoConTiempo:!!((ca=n("chk1"))!=null&&ca.checked),responsablePerdida:!!((la=n("chk2"))!=null&&la.checked),todoConforme:!!((da=n("chk3"))!=null&&da.checked)};if(!O){f("outConf","❌ Falta VIN.");return}if(!P){f("outConf","❌ Falta nombre del técnico.");return}if(!r){f("outConf","❌ Falta foto del equipo.");return}if(!J.revisadoConTiempo||!J.responsablePerdida||!J.todoConforme){f("outConf","⚠️ Debes marcar los 3 checks de conformidad.");return}try{const mt=await ss({tipo:_,vin:O,dateStr:k,tecnico:P,checklist:J,file:r,apsUrl:e.apsUrl,onProgress:ua=>{ua.phase==="prepare"&&f("outConf",`Preparando foto...
`),ua.phase==="upload"&&f("outConf",`Enviando conformidad...
`)}});if(!mt.ok){f("outConf","❌ uploadConformidad: "+(mt.error||"Error"));return}f("outConf",`✅ Conformidad registrada.
Tipo: ${_}
Carpeta: ${mt.carFolderName}/${mt.mainFolderName}/${mt.subFolderName}
Acta: ${mt.actaName}
Foto: ${mt.photoName}`),r=null,jt()}catch(mt){f("outConf",`❌ Error CONFORMIDAD: ${mt}`)}}),jt()}function ii(m={}){var A;const v=String(m.vin||"").trim(),h=String(m.dateStr||"").trim(),C=String(m.screen||"").trim().toLowerCase();v&&(n("vinText")&&(n("vinText").value=v),n("fallaVin")&&(n("fallaVin").value=v),n("qcVin")&&(n("qcVin").value=v),n("confVin")&&(n("confVin").value=v)),h&&(n("dateStr")&&(n("dateStr").value=h),n("fallaDate")&&(n("fallaDate").value=h),n("qcDate")&&(n("qcDate").value=h),n("confDate")&&(n("confDate").value=h)),t&&(t.style.display="block"),S(C==="params"?"params":C==="falla"?"falla":C==="calidad"||C==="qc"?"calidad":C==="conformidad"||C==="conf"?"conformidad":"menu"),(((A=n("vinText"))==null?void 0:A.value)||"").trim()&&D().catch(()=>{})}function si(){Fe().catch(()=>{}),t&&(t.style.display="none")}return ai(),oi(),ni(),S("menu"),{show:ii,hide:si,refreshStatus:D,showScreen:S,stopAllScanners:Fe}}let Pe=!1,kt=null;const ie=new Map,Oe=t=>document.getElementById(t);function so(t={}){if(Pe)return kt;const e=Oe("viewUploader");return e?(kt=io(e,{apsUrl:t.apsUrl,onBackControl:()=>{var o;Qt(),Vt();const a=String(((o=u==null?void 0:u.state)==null?void 0:o.currentModule)||"").trim().toUpperCase();if(a){const i=document.getElementById(`view${a}`);if(i){i.style.display="block";return}}const n=document.getElementById("viewHub");n&&(n.style.display="block")}}),Pe=!0,kt):(console.warn("[Uploader] No existe #viewUploader en el HTML"),null)}function us(t,e={}){var r;const a=document.getElementById(t);if(!a)return console.warn("[Uploader] mountId no existe:",t),null;const n=ie.get(t),o=!!a.querySelector(".uploader-shell");if(n&&o)return n;if(n){try{(r=n.stopAllScanners)==null||r.call(n)}catch{}ie.delete(t)}const i=Oe("viewUploader");if(!i)return console.warn("[Uploader] No existe #viewUploader para clonar template"),null;a.innerHTML=i.innerHTML;const s=io(a,{apsUrl:e.apsUrl,onBackControl:e.onBackControl||(()=>{try{s.showScreen("menu")}catch{}})});return ie.set(t,s),s}function cn({vin:t="",screen:e="menu",dateStr:a="",mountId:n="",inModal:o=!1,onBackControl:i=null,apsUrl:s=null}={}){if(n){const r=us(n,{apsUrl:s,onBackControl:i});r&&r.show({vin:t,screen:e,dateStr:a});return}if(Pe||so({apsUrl:s}),!o){const r=document.getElementById("viewApp");r&&(r.style.display="block");const c=document.getElementById("viewHub");c&&(c.style.display="none")}if(kt)kt.show({vin:t,screen:e,dateStr:a});else{const r=Oe("viewUploader");r&&(r.style.display="block")}}function Qt({mountId:t=""}={}){var a;if(t){const n=document.getElementById(t),o=ie.get(t);try{(a=o==null?void 0:o.stopAllScanners)==null||a.call(o)}catch{}n&&(n.innerHTML=""),ie.delete(t);return}kt&&kt.hide();const e=Oe("viewUploader");e&&(e.style.display="none")}const ps="modulepreload",fs=function(t){return"/"+t},fa={},ma=function(e,a,n){let o=Promise.resolve();if(a&&a.length>0){let s=function(l){return Promise.all(l.map(d=>Promise.resolve(d).then(p=>({status:"fulfilled",value:p}),p=>({status:"rejected",reason:p}))))};document.getElementsByTagName("link");const r=document.querySelector("meta[property=csp-nonce]"),c=(r==null?void 0:r.nonce)||(r==null?void 0:r.getAttribute("nonce"));o=s(a.map(l=>{if(l=fs(l),l in fa)return;fa[l]=!0;const d=l.endsWith(".css"),p=d?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${l}"]${p}`))return;const y=document.createElement("link");if(y.rel=d?"stylesheet":ps,d||(y.as="script"),y.crossOrigin="",y.href=l,c&&y.setAttribute("nonce",c),document.head.appendChild(y),d)return new Promise((b,f)=>{y.addEventListener("load",b),y.addEventListener("error",()=>f(new Error(`Unable to preload CSS for ${l}`)))})}))}function i(s){const r=new Event("vite:preloadError",{cancelable:!0});if(r.payload=s,window.dispatchEvent(r),!r.defaultPrevented)throw s}return o.then(s=>{for(const r of s||[])r.status==="rejected"&&i(r.reason);return e().catch(i)})};function ms(t){return String((t==null?void 0:t.estado)||"").toUpperCase()==="FINALIZADO"}function vs(t){const e=String(t||"").toUpperCase();return e==="SIN_INICIAR"?["INICIO","NOTA"]:e==="TRABAJANDO"?["PAUSA","FIN","NOTA"]:e==="PAUSADO"?["REANUDAR","FIN","NOTA"]:e==="FINALIZADO"?["NOTA"]:["INICIO","NOTA"]}function gs(t){const e=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();return u.state.currentModule==="CALIDAD"?e==="CALIDAD":u.state.currentModule==="RAMALERO"?e==="RAMALERO":e==="MOTOR"||e==="TANQUE"}function Ft(t,e=Date.now()){const a=Number(t.tiempo_ms||t.tiempo_trab_ms||0),n=t.running_since?Date.parse(t.running_since):NaN;return!isNaN(n)&&String(t.estado||t.estado_actual).toUpperCase()==="TRABAJANDO"?a+Math.max(0,e-n):a}function ro(t){const e=String(t||"").toUpperCase();return e==="SIN_INICIAR"?'<div class="jobActionsGrid"><button class="btnInicio" data-act="INICIO">INICIO</button></div>':e==="TRABAJANDO"?`<div class="jobActionsGrid">
      <button class="btnPausa" data-act="PAUSA">PAUSA</button>
      <button class="btnFin" data-act="FIN">FIN</button>
    </div>`:e==="PAUSADO"?`<div class="jobActionsGrid">
      <button class="btnReanudar" data-act="REANUDAR">REANUDAR</button>
      <button class="btnFin" data-act="FIN">FIN</button>
    </div>`:'<div class="jobActionsGrid"><button class="btnInicio" data-act="NOTA">GUARDAR NOTA</button></div>'}function bs(t){const e=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();if(e!=="MOTOR"&&e!=="TANQUE")return"";const a=String((t==null?void 0:t.tanque_asignado)||"").trim(),n=String((t==null?void 0:t.reductor_asignado)||"").trim(),o=String((t==null?void 0:t.tanque_registrado)||"").trim(),i=String((t==null?void 0:t.reductor_registrado)||"").trim(),s=e==="TANQUE",r=s?"TANQUE ASIGNADO:":"REDUCTOR ASIGNADO:",c=s?a:n,l=s?"TANQUE REGISTRADO:":"REDUCTOR REGISTRADO:",d=s?o:i,p=T(c||"NO ASIGNADO"),y=T(d||"—"),b=c?"":" na",f=d?"":" na";return`
    <div class="asignadoRow js-asignado" data-rol="${T(e)}">
      <span class="asignadoLabel">${T(r)}</span>
      <span class="asignadoValue${b}">${p}</span>
    </div>
    <div class="asignadoRow js-registrado" data-rol="${T(e)}" style="margin-top:6px;">
      <span class="asignadoLabel">${T(l)}</span>
      <span class="asignadoValue${f}">${y}</span>
    </div>
  `}function co(t,e=""){if(u.state.currentModule!=="CALIDAD")return"";const a=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),n=String((t==null?void 0:t.conversionId)||"").trim();return!a&&!n?"":(Number((t==null?void 0:t.inc_leve)||0),Number((t==null?void 0:t.inc_moderada)||0),Number((t==null?void 0:t.inc_critica)||0),`
    <div class="jobActionsGrid" style="margin-bottom:10px;">
      <button class="btnRF" type="button" data-go="INC" data-key="${T(e)}"
        style="margin-top:0;">
        Registrar Inc.
      </button>
      <button class="btnRF" type="button" data-go="VER_INC"
        data-vin="${T(a)}" data-cid="${T(n)}"
        style="margin-top:0;">
        Ver incidencias
      </button>
    </div>
  `)}function ln(){var e,a;const t=new Map;return(a=(e=w("activasBox"))==null?void 0:e.querySelectorAll(".jobCard[data-key]"))==null||a.forEach(n=>{const o=n.dataset.key||"",i=n.querySelector("textarea.notaCard");i&&t.set(o,String(i.value||""))}),t}function dn(t){var e,a;t&&((a=(e=w("activasBox"))==null?void 0:e.querySelectorAll(".jobCard[data-key]"))==null||a.forEach(n=>{const o=n.dataset.key||"",i=n.querySelector("textarea.notaCard");i&&t.has(o)&&(i.value=t.get(o))}))}function Lt(){const t=$(),e=[...t.itemsByKey.values()].filter(gs),a=[],n=[];e.sort((o,i)=>{const s=o.updated_at?Date.parse(o.updated_at):0;return(i.updated_at?Date.parse(i.updated_at):0)-s});for(const o of e){const i=`${String(o.conversionId||"").trim()}|${String(o.rolTrabajo||"").toUpperCase()}`;ms(o)?n.push(i):a.push(i)}t.activeKeys=a,t.finalKeys=n}function Bt(){const t=$(),e=w("activasBox");if(!e)return;if(!t.activeKeys.length){e.innerHTML='<div class="small">No tienes trabajos activos.</div>';return}const a=Date.now();let n="";for(const o of t.activeKeys){const i=t.itemsByKey.get(o);if(!i)continue;const s=String(i.estado||"").toUpperCase(),r=T(i.rolTrabajo||""),c=T(i.vin||""),l=T(i.tipoRamal||""),d=Ut(Ft(i,a)),p=T(ao(i.created_at)),y=T(i.motorNombre||""),b=T(i.tanqueroNombre||""),f=u.state.currentModule==="RAMALERO"?`RAMAL: ${l||"-"}`:c||"<span class='small'>(sin VIN)</span>";n+=`
      <div class="jobCard card state-${s}" data-key="${T(o)}">
        <div class="jobTop">
          <div class="jobMeta">
            <div class="jobTitle">${f} <span>(${r})</span></div>
            <div class="jobSub">
              <span><b>Estado:</b> <span class="js-estado">${s}</span></span>
              <span class="small">Inicio: ${p}</span>
              ${u.state.currentModule==="CALIDAD"&&(y||b)?`
                <span class="small js-personal">
                  ${y?`🔧 MOTOR: <b>${y}</b>`:""}
                  ${y&&b?" &nbsp;|&nbsp; ":""}
                  ${b?`🛢️ TANQUERO: <b>${b}</b>`:""}
                </span>`:""}
            </div>
          </div>
          <div class="jobRight">
            <div class="jobTimePill js-tiempo">⏱ ${d}</div>
            <div class="jobChevron"></div>
          </div>
        </div>

        <div class="jobExpand">
          ${bs(i)}

          ${String((i==null?void 0:i.rolTrabajo)||"").toUpperCase()==="MOTOR"||String((i==null?void 0:i.rolTrabajo)||"").toUpperCase()==="TANQUE"?`<button class="btnRF" type="button" data-go="CONF" style="margin-bottom:10px;">
                  ✅ Registro de conformidad de equipo
                </button>`:""}

          ${co(i,o)}

          <div class="jobActionsSlot">${ro(s)}</div>

          ${u.state.currentModule==="TECNICO"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>':u.state.currentModule==="CALIDAD"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar calidad / fallas</button>':""}

          <div class="jobNoteBlock">
            <textarea class="notaCard" rows="2" placeholder="Escribe una nota..."></textarea>
            <button class="btnNota" data-act="NOTA" style="margin-top:10px; width:100%; height:66px; font-weight:900; display:none;">
              Guardar nota
            </button>
          </div>
        </div>
      </div>
    `}e.innerHTML=n}function ct(t=""){const e=$(),a=u.state.currentModule==="CALIDAD"?"Q":u.state.currentModule==="RAMALERO"?"R":"",n=w("finalizadosWrap"+a),o=w("finalizadosBox"+a);if(!n||!o)return;if(!e.showFinalizados){n.style.display="none",o.innerHTML="";return}if(n.style.display="block",!e.finalKeys.length){o.innerHTML=t+'<div class="small">No tienes finalizados.</div>';return}const i=Date.now();let s="";for(const r of e.finalKeys){const c=e.itemsByKey.get(r);if(!c)continue;const l=T(String(c.vin||"").toUpperCase()),d=T(String(c.rolTrabajo||"")),p=T(String(c.estado||"FINALIZADO").toUpperCase()),y=Ut(Ft(c,i)),b=T(ao(c.created_at)),f=T(c.motorNombre||""),I=T(c.tanqueroNombre||"");s+=`
      <div class="card" style="margin-top:10px;" data-key="${T(r)}">
        <div><b>${l}</b> <span class="small">(${d})</span></div>
        <div class="row space-between" style="margin-top:6px;">
          <div class="small"><b>Estado:</b> ${p}</div>
          <div class="pill" style="font-size:18px; font-weight:800;">⏱ ${y}</div>
        </div>
        <div class="small">Inicio: ${b}</div>
        ${u.state.currentModule==="CALIDAD"&&(f||I)?`
          <div class="small js-personal" style="margin-top:4px;">
            ${f?`🔧 MOTOR: <b>${f}</b>`:""}
            ${f&&I?" &nbsp;|&nbsp; ":""}
            ${I?`🛢️ TANQUERO: <b>${I}</b>`:""}
          </div>`:""}

        ${co(c,r)}

        ${u.state.currentModule==="TECNICO"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>':u.state.currentModule==="CALIDAD"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar calidad / fallas</button>':""}
      </div>
    `}o.innerHTML=t+s}function me(){const t=$(),e=w("activasBox");if(!e)return;const a=Date.now();for(const n of t.activeKeys){const o=t.itemsByKey.get(n);if(!o)continue;const i=e.querySelector(`.jobCard[data-key="${ts(n)}"]`);if(!i)continue;const s=i.classList.contains("open"),r=String(o.estado||"").toUpperCase();i.className=`jobCard card state-${r}`+(s?" open":"");const c=i.querySelector(".js-estado");c&&(c.textContent=r);const l=i.querySelector(".js-tiempo");l&&(l.textContent=`⏱ ${Ut(Ft(o,a))}`);try{const d=String(o.rolTrabajo||"").toUpperCase();if(d==="MOTOR"||d==="TANQUE"){const p=d==="TANQUE",y=p?String(o.tanque_asignado||"").trim():String(o.reductor_asignado||"").trim(),b=p?String(o.tanque_registrado||"").trim():String(o.reductor_registrado||"").trim(),f=i.querySelector(".js-asignado .asignadoValue"),I=i.querySelector(".js-registrado .asignadoValue");f&&(f.textContent=y||"LIBRE",f.classList.toggle("na",!y)),I&&(I.textContent=b||"—",I.classList.toggle("na",!b))}}catch{}try{if(u.state.currentModule==="CALIDAD"){const d=i.querySelector(".js-personal");if(d){const p=T(o.motorNombre||""),y=T(o.tanqueroNombre||"");d.innerHTML=[p?`🔧 MOTOR: <b>${p}</b>`:"",p&&y?"&nbsp;|&nbsp;":"",y?`🛢️ TANQUERO: <b>${y}</b>`:""].join("")}}}catch{}if(s){const d=i.querySelector(".jobActionsSlot");d&&(d.innerHTML=ro(r))}}}const E={open:!1,itemKey:"",item:null,photo:null,techSelected:null,sugItems:[],sugOpen:!1,sugIdx:-1,sugTimer:null,lastQ:"",cache:{ts:0,items:[]}},ys=600*1e3;function lo(){return z("incFotoPreview")}function uo(){return z("incFotoPreviewWrap")}function ze(){return z("incFotoCam")}function He(){return z("incFotoFile")}function Kt(){var n;E.photo=null;const t=ze();t&&(t.value="");const e=He();e&&(e.value="");const a=lo();a&&(a.src=""),(n=uo())==null||n.classList.add("hidden")}function hs(t){return new Promise((e,a)=>{const n=new FileReader;n.onload=()=>e(String(n.result||"")),n.onerror=a,n.readAsDataURL(t)})}function Is(t){return new Promise((e,a)=>{const n=new Image,o=setTimeout(()=>{a(new Error("Timeout cargando imagen (iPhone?)"))},8e3);n.onload=()=>{clearTimeout(o),e(n)},n.onerror=()=>{clearTimeout(o),a(new Error("No se pudo cargar la imagen"))},n.crossOrigin="anonymous",n.src=t})}async function _s(t){const e=await hs(t),a=await Is(e),n=960,o=960;let i=a.naturalWidth||a.width||0,s=a.naturalHeight||a.height||0;if(!i||!s)throw new Error("No se pudo obtener dimensiones de la imagen (iPhone?)");const r=Math.min(n/i,o/s,1),c=Math.round(i*r),l=Math.round(s*r),d=document.createElement("canvas");d.width=c,d.height=l;const p=d.getContext("2d");if(!p)throw new Error("Canvas 2D no disponible en este navegador (iPhone?)");try{p.drawImage(a,0,0,c,l)}catch(S){throw new Error(`Error dibujando en canvas: ${(S==null?void 0:S.message)||S}`)}let y;try{y=d.toDataURL("image/jpeg",.65)}catch(S){throw new Error(`Canvas.toDataURL falló: ${(S==null?void 0:S.message)||S}`)}const b=y.match(/^data:(.*?);base64,(.*)$/);if(!b||!b[2])throw new Error("No se pudo procesar la imagen (base64 vacío?)");const f=b[2],I=f.length*.75/(1024*1024);if(I>3.5)throw new Error(`Imagen muy grande (${I.toFixed(1)}MB). Intenta otra.`);return{mimeType:"image/jpeg",b64:f,previewUrl:y,name:(t.name||"incidencia.jpg").replace(/\.[^.]+$/,"")+".jpg"}}async function va(t){var e,a,n;try{const o=(a=(e=t.target)==null?void 0:e.files)==null?void 0:a[0];if(!o){Kt();return}if(!String(o.type||"").startsWith("image/")){Q("Solo se permiten imágenes."),Kt();return}const i=50,s=i*1024*1024;if(o.size>s){Q(`❌ Archivo muy grande (máx ${i}MB). Intenta con otra foto.`),Kt();return}Q("Procesando foto...");const r=await _s(o);E.photo={b64:r.b64,mimeType:r.mimeType,name:r.name,previewUrl:r.previewUrl};const c=lo();c&&(c.src=r.previewUrl),(n=uo())==null||n.classList.remove("hidden"),Q("")}catch(o){console.error("[INC foto] ERROR:",o),Q("❌ No se pudo procesar la foto. "+String((o==null?void 0:o.message)||"")),Kt()}}function z(t){return document.getElementById(t)}function Q(t){const e=z("incMsg");e&&(e.textContent=String(t||""))}function po(t){const e=z("incInfo");e&&(e.textContent=String(t||""))}function un(){return z("incModal")}function fo(){return z("btnIncSave")}function Dt(){return z("incTechInput")}function xe(){return z("incTechSuggest")}function mo(){return z("incTech")}function ke(){return z("incTipo")}function pn(){return z("incNota")}function vo(){Kt(),E.itemKey="",E.item=null,E.techSelected=null;const t=Dt();t&&(t.value="");const e=mo();e&&(e.innerHTML="");const a=ke();a&&(a.value="");const n=pn();n&&(n.value=""),Q(""),po(""),qt(),De()}function De(){var n,o,i;const t=fo();if(!t)return;const e=!!((n=E.techSelected)!=null&&n.userId)||!!((o=E.techSelected)!=null&&o.email),a=!!String(((i=ke())==null?void 0:i.value)||"").trim();t.disabled=!(e&&a)}function go(t){return String(t||"").trim().toLowerCase()}function Cs(t){return go([t.name,t.email,t.label].filter(Boolean).join(" "))}function qt(){const t=xe();t&&(E.sugOpen=!1,E.sugIdx=-1,E.sugItems=[],t.classList.add("hidden"),t.innerHTML="")}function bo(){const t=xe();if(t){if(!E.sugItems.length){qt();return}t.innerHTML=E.sugItems.map((e,a)=>{const n=a===E.sugIdx?"active":"",o=String(e.name||"").trim();return`
      <div class="nsItem ${n}" data-idx="${a}" role="option" aria-selected="${a===E.sugIdx}">
        <div class="nsTitle">${T(o)}</div>
      </div>
    `}).join(""),t.classList.remove("hidden"),E.sugOpen=!0}}function ga(t){if(!E.sugItems.length)return;E.sugIdx=Math.max(0,Math.min(t,E.sugItems.length-1)),bo();const e=xe(),a=e==null?void 0:e.querySelector(`.nsItem[data-idx="${E.sugIdx}"]`);a&&a.scrollIntoView({block:"nearest"})}function yo(t){E.techSelected=t||null;const e=Dt();e&&(e.value=t?String(t.name||"").trim():"");const a=mo();if(a&&(a.innerHTML="",t)){const n=document.createElement("option");n.value=String(t.userId||t.email||""),n.textContent=String(t.name||"").trim(),n.selected=!0,a.appendChild(n)}qt(),De()}async function As(t){const e=String(t||"").trim();if(!e)return[];const a=await Tt(`/api/name-suggest?q=${encodeURIComponent(e)}&limit=12`);return a!=null&&a.ok?(Array.isArray(a.items)?a.items:[]).map(o=>({userId:String(o.userId||o.id||"").trim(),name:String(o.name||o.nombre||"").trim(),email:String(o.email||"").trim(),label:String(o.label||"").trim()})):[]}function Ss(){const t=Dt();if(!t)return;const e=String(t.value||"").trim();if(E.lastQ=e,E.techSelected=null,De(),!e){qt();return}clearTimeout(E.sugTimer),E.sugTimer=setTimeout(async()=>{try{const a=await As(e);if(E.lastQ!==e)return;let n=a;if(!n.length&&E.cache.items.length){const o=go(e);n=E.cache.items.filter(i=>Cs(i).includes(o)).slice(0,12)}E.sugItems=n,E.sugIdx=n.length?0:-1,bo()}catch{qt()}},180)}function Es(t){if(E.sugOpen){if(t.key==="ArrowDown"){t.preventDefault(),ga(E.sugIdx+1);return}if(t.key==="ArrowUp"){t.preventDefault(),ga(E.sugIdx-1);return}if(t.key==="Enter"){E.sugIdx>=0&&E.sugItems[E.sugIdx]&&(t.preventDefault(),yo(E.sugItems[E.sugIdx]));return}t.key==="Escape"&&(t.preventDefault(),qt())}}function Rs(t){return $().itemsByKey.get(String(t||""))||null}function Ls(t){const e=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),a=String((t==null?void 0:t.conversionId)||"").trim(),n=Number((t==null?void 0:t.inc_leve)||0),o=Number((t==null?void 0:t.inc_moderada)||0),i=Number((t==null?void 0:t.inc_critica)||0);return`VIN: ${e||"-"} | OT: ${a||"-"} | Acumulado → L:${n} M:${o} C:${i}`}async function ho(t){if(u.state.currentModule!=="CALIDAD")return;const e=Rs(t);if(!e){K({ok:!1,error:"No se encontró el trabajo para registrar incidencia."});return}vo(),E.itemKey=String(t||""),E.item=e,po(Ls(e)),Q("");const a=un();a&&(a.classList.add("show"),a.setAttribute("aria-hidden","false"),document.body.classList.add("modal-open")),E.open=!0;try{const n=Date.now();if(!E.cache.items.length||n-E.cache.ts>ys){const o=await Tt("/api/name-suggest?q=.&limit=120");o!=null&&o.ok&&(E.cache.items=(Array.isArray(o.items)?o.items:[]).map(i=>({userId:String(i.userId||i.id||"").trim(),name:String(i.name||i.nombre||"").trim(),email:String(i.email||"").trim(),label:String(i.label||"").trim()})),E.cache.ts=n)}}catch{}setTimeout(()=>{var n;return(n=Dt())==null?void 0:n.focus()},0)}async function ve(){const t=un();if(t){const e=document.activeElement;e&&t.contains(e)&&e.blur(),t.classList.remove("show"),t.setAttribute("aria-hidden","true")}document.body.classList.remove("modal-open"),E.open=!1,vo()}async function Ms(){var r,c;if(u.state.currentModule!=="CALIDAD"||!E.item)return;const t=String((oe==null?void 0:oe())||"").trim().toLowerCase();if(!t){Q("No hay email de sesión."),K({ok:!1,error:"No hay email de sesión."});return}const e=String(((r=ke())==null?void 0:r.value)||"").trim().toUpperCase();if(!["LEVE","MODERADA","CRITICA"].includes(e)){Q("Selecciona el tipo de incidencia.");return}const a=E.techSelected;if(!a||!a.userId&&!a.email){Q("Selecciona un técnico de la lista.");return}const n=String(((c=pn())==null?void 0:c.value)||"").trim(),o=E.item,i={email:t,conversionId:String(o.conversionId||"").trim(),vin:String(o.vin||"").trim().toUpperCase(),rolTrabajo:"CALIDAD",tecnicoUserId:String(a.userId||"").trim(),tecnicoEmail:String(a.email||"").trim(),tecnicoNombre:String(a.name||"").trim(),tipo:e,nota:n,foto:E.photo?{b64:E.photo.b64,mimeType:E.photo.mimeType,name:E.photo.name}:null};let s;try{s=await sn("/api/incidencia",i),K(s)}catch(l){console.error("[INC save] ERROR:",l);const d=String((l==null?void 0:l.message)||l||"Error desconocido");Q(`❌ Error: ${d}`),K({ok:!1,error:d});return}if(!s||typeof s!="object"){Q("❌ Respuesta inválida del servidor."),K({ok:!1,error:"Respuesta inválida del servidor",raw:s});return}if(!s.ok){const l=s.error||s.message||JSON.stringify(s);Q(`❌ ${l}`);return}try{const l=$(),d=s.item||s.data||s.row||null;if(d&&(d.conversionId||d.vin)){const p=l.itemsByKey.get(E.itemKey);if(p){const y={...p};d.inc_leve!=null?y.inc_leve=Number(d.inc_leve||0):e==="LEVE"&&(y.inc_leve=Number(y.inc_leve||0)+1),d.inc_moderada!=null?y.inc_moderada=Number(d.inc_moderada||0):e==="MODERADA"&&(y.inc_moderada=Number(y.inc_moderada||0)+1),d.inc_critica!=null?y.inc_critica=Number(d.inc_critica||0):e==="CRITICA"&&(y.inc_critica=Number(y.inc_critica||0)+1),l.itemsByKey.set(E.itemKey,y);const b=ln();Lt(),Bt(),ct(),dn(b)}}}catch(l){console.warn("[INC patch local] warning:",l)}Q("✅ Incidencia registrada."),setTimeout(()=>{ve().catch(()=>{})},350)}function Ts(){var e,a,n,o,i,s,r,c,l,d,p,y;const t=un();t&&t.dataset.bound!=="1"&&(t.dataset.bound="1",(e=z("btnCloseInc"))==null||e.addEventListener("click",()=>{ve().catch(()=>{})}),t.addEventListener("click",b=>{b.target===t&&ve().catch(()=>{})}),(a=Dt())==null||a.addEventListener("input",Ss),(n=Dt())==null||n.addEventListener("keydown",Es),(o=z("btnIncFotoCam"))==null||o.addEventListener("click",()=>{var b;Q(""),(b=ze())==null||b.click()}),(i=z("btnIncFotoFile"))==null||i.addEventListener("click",()=>{var b;Q(""),(b=He())==null||b.click()}),(s=ze())==null||s.addEventListener("change",va),(r=He())==null||r.addEventListener("change",va),(c=z("btnIncFotoClear"))==null||c.addEventListener("click",()=>{Kt(),Q("")}),(l=xe())==null||l.addEventListener("mousedown",b=>{const f=b.target.closest(".nsItem[data-idx]");if(!f)return;b.preventDefault();const I=Number(f.dataset.idx),S=E.sugItems[I];S&&yo(S)}),document.addEventListener("click",b=>{var I;if(!E.open||!E.sugOpen)return;const f=(I=Dt())==null?void 0:I.closest(".supNameWrap");f&&f.contains(b.target)||qt()}),(d=ke())==null||d.addEventListener("change",()=>{Q(""),De()}),(p=pn())==null||p.addEventListener("input",()=>{Q("")}),(y=fo())==null||y.addEventListener("click",async()=>{await W(async()=>{await Ms()},"Guardando incidencia...")}),document.addEventListener("keydown",b=>{E.open&&b.key==="Escape"&&(b.preventDefault(),ve().catch(()=>{}))}))}const At={open:!1,vin:""},tt=t=>document.getElementById(t),fn=()=>tt("rfModal");function Io(t){const e=tt("rfInfo");e&&(e.textContent=String(t||""))}function _o(t){const e=tt("rfMsg");e&&(e.textContent="")}function Co(){try{Qt({mountId:"rfUploaderMount"})}catch{}tt("rfMenu")&&(tt("rfMenu").style.display="block"),tt("rfStage")&&(tt("rfStage").style.display="none"),tt("rfStage")&&(tt("rfStage").innerHTML="")}function ba(t){var n;const e=tt("rfMenu"),a=tt("rfStage");a&&(e&&(e.style.display="none"),a.style.display="block",a.innerHTML=`
    <div class="row" style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <button type="button" id="btnRfBack" class="btn" style="height:44px; padding:0 14px; font-weight:900;">
        ← Volver
      </button>
      <div class="pill small" style="opacity:.95;">
        ${t==="calidad"?"CONTROL CALIDAD":"REGISTRAR FALLA"}
      </div>
    </div>

    <div id="rfUploaderMount"></div>
  `,(n=a.querySelector("#btnRfBack"))==null||n.addEventListener("click",Co),cn({vin:At.vin,screen:t,mountId:"rfUploaderMount"}))}function Ao(t){if(u.state.currentModule!=="CALIDAD")return;const e=String(t||"").trim().toUpperCase();if(!e){K({ok:!1,error:"VIN vacío para RF modal."});return}At.vin=e,At.open=!0,Io(`VIN: ${e}`),_o();const a=fn();a&&(a.classList.add("show"),a.setAttribute("aria-hidden","false"),document.body.classList.add("modal-open")),Co()}function Be(){try{Qt({mountId:"rfUploaderMount"})}catch{}const t=fn();if(t){const n=document.activeElement;n&&t.contains(n)&&n.blur(),t.classList.remove("show"),t.setAttribute("aria-hidden","true")}document.body.classList.remove("modal-open"),At.open=!1,At.vin="",Io(""),_o();const e=document.getElementById("rfMenu"),a=document.getElementById("rfStage");e&&(e.style.display="block"),a&&(a.style.display="none",a.innerHTML="")}function Ns(){var e,a,n;const t=fn();t&&t.dataset.bound!=="1"&&(t.dataset.bound="1",(e=tt("btnCloseRF"))==null||e.addEventListener("click",Be),t.addEventListener("click",o=>{o.target===t&&Be()}),(a=tt("btnRfControl"))==null||a.addEventListener("click",()=>{At.vin&&ba("calidad")}),(n=tt("btnRfFalla"))==null||n.addEventListener("click",()=>{At.vin&&ba("falla")}),document.addEventListener("keydown",o=>{At.open&&o.key==="Escape"&&(o.preventDefault(),Be())}))}const St={open:!1,vin:""},et=t=>document.getElementById(t),mn=()=>et("rfTecModal");function So(t){const e=et("rfTecInfo");e&&(e.textContent=String(t||""))}function Eo(t){const e=et("rfTecMsg");e&&(e.textContent="")}function Ie(){try{Qt({mountId:"rfTecUploaderMount"})}catch{}et("rfTecMenu")&&(et("rfTecMenu").style.display="block"),et("rfTecStage")&&(et("rfTecStage").style.display="none"),et("rfTecStage")&&(et("rfTecStage").innerHTML="")}function ya(t){var n;const e=et("rfTecMenu"),a=et("rfTecStage");a&&(e&&(e.style.display="none"),a.style.display="block",a.innerHTML=`
    <div class="row" style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <button type="button" id="btnRFTecBack" class="btn" style="height:44px; padding:0 14px; font-weight:900;">
        ← Volver
      </button>
      <div class="pill small" style="opacity:.95;">
        ${t==="params"?"REGISTRAR PARÁMETROS":"REGISTRAR FALLA"}
      </div>
    </div>

    <div id="rfTecUploaderMount"></div>
  `,(n=a.querySelector("#btnRFTecBack"))==null||n.addEventListener("click",Ie),cn({vin:St.vin,screen:t==="params"?"params":"falla",mountId:"rfTecUploaderMount",onBackControl:Ie}))}function Ro(t){if(u.state.currentModule!=="TECNICO")return;const e=String(t||"").trim().toUpperCase();if(!e)return K({ok:!1,error:"VIN vacío para Registro/Fallas."});St.vin=e,St.open=!0,So(`VIN: ${e}`),Eo();const a=mn();a&&(a.classList.add("show"),a.setAttribute("aria-hidden","false"),document.body.classList.add("modal-open")),Ie()}function qe(){try{Qt({mountId:"rfTecUploaderMount"})}catch{}const t=mn();if(t){const e=document.activeElement;e&&t.contains(e)&&e.blur(),t.classList.remove("show"),t.setAttribute("aria-hidden","true")}document.body.classList.remove("modal-open"),St.open=!1,St.vin="",So(""),Eo(),Ie()}function Os(){var e,a,n;const t=mn();t&&t.dataset.bound!=="1"&&(t.dataset.bound="1",(e=et("btnCloseRFTec"))==null||e.addEventListener("click",qe),t.addEventListener("click",o=>{o.target===t&&qe()}),(a=et("btnRFTecParams"))==null||a.addEventListener("click",()=>{St.vin&&ya("params")}),(n=et("btnRFTecFalla"))==null||n.addEventListener("click",()=>{St.vin&&ya("falla")}),document.addEventListener("keydown",o=>{St.open&&o.key==="Escape"&&(o.preventDefault(),qe())}))}const Wt={bound:!1,resolver:null};function _e(){return{modal:g("confirmFinishModal"),btnCloseX:g("btnCloseFinishX"),btnCancel:g("btnCancelFinish"),btnAccept:g("btnAcceptFinish"),title:g("confirmFinishTitle"),text:g("confirmFinishText")}}function ne(t){const{modal:e}=_e();if(e&&(e.setAttribute("aria-hidden","true"),e.classList.remove("show")),document.body.classList.remove("modal-open"),typeof Wt.resolver=="function"){const a=Wt.resolver;Wt.resolver=null,a(!!t)}}function Lo(){if(Wt.bound)return;Wt.bound=!0;const{modal:t,btnCloseX:e,btnCancel:a,btnAccept:n}=_e();t&&(e==null||e.addEventListener("click",()=>ne(!1)),a==null||a.addEventListener("click",()=>ne(!1)),n==null||n.addEventListener("click",()=>ne(!0)),t.addEventListener("click",o=>{o.target===t&&ne(!1)}),document.addEventListener("keydown",o=>{const{modal:i}=_e();!i||i.getAttribute("aria-hidden")==="true"||o.key==="Escape"&&(o.preventDefault(),ne(!1))}))}function xs(){Lo()}function Mo({title:t="Confirmar finalización",message:e="¿Seguro que quieres finalizar este trabajo?",acceptText:a="Sí, finalizar",cancelText:n="Cancelar"}={}){Lo();const{modal:o,title:i,text:s,btnAccept:r,btnCancel:c}=_e();return o?(i&&(i.textContent=t),s&&(s.textContent=e),r&&(r.textContent=a),c&&(c.textContent=n),o.setAttribute("aria-hidden","false"),o.classList.add("show"),document.body.classList.add("modal-open"),setTimeout(()=>c==null?void 0:c.focus(),0),new Promise(l=>{Wt.resolver=l})):Promise.resolve(window.confirm(e))}const j={currentKey:"",currentItem:null,qr:null,scanMode:"QR",bound:!1};let ge=null;function ks(t){ge=typeof t=="function"?t:null}function nt(){return{modal:g("confModal"),btnClose:g("btnCloseConf"),vinInfo:g("confVinInfo"),code:g("confCode"),btnQR:g("btnConfQR"),assignedBox:g("confAssignedBox"),qrWrap:g("confQrWrap"),qrReader:g("qrReader_conf"),qrMsg:g("confQrMsg"),btnStopQR:g("btnConfStopQR"),btnClear:g("btnConfClear"),ck1:g("ck1"),ck2:g("ck2"),ck3:g("ck3"),btnSave:g("btnConfSave"),msg:g("confMsg")}}function de(t){return String(t||"").trim().toUpperCase()}function vn(t){const e=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();return e==="TANQUE"?"TANQUE":e==="MOTOR"?"REDUCTOR":String((t==null?void 0:t.tanque_asignado)||"").trim()?"TANQUE":String((t==null?void 0:t.reductor_asignado)||"").trim()?"REDUCTOR":"EQUIPO"}function To(t,e){return t?e==="TANQUE"?String(t.tanque_asignado||t.tanque_registrado||"").trim().toUpperCase():e==="REDUCTOR"?String(t.reductor_asignado||t.reductor_registrado||"").trim().toUpperCase():"":""}function Ds(){const{ck1:t,ck2:e,ck3:a}=nt();return!!(t!=null&&t.checked&&(e!=null&&e.checked)&&(a!=null&&a.checked))}function Ke(){var e;const{code:t}=nt();return!!de(t==null?void 0:t.value)&&Ds()&&!!((e=j.currentItem)!=null&&e.vin)}function vt(t,e=!1){const{msg:a}=nt();a&&(a.textContent=String(t||""),a.style.color=e?"#ffb3b3":"")}function ce(){const{assignedBox:t,code:e}=nt(),a=j.currentItem;if(!t)return;if(!a){t.textContent="";return}const n=vn(a),o=To(a,n),i=de(e==null?void 0:e.value);if(!o){t.textContent=`Equipo esperado (${n}): (sin asignado en cartilla)`,t.style.opacity=".85";return}if(!i){t.textContent=`Equipo asignado (${n}): ${o}`,t.style.opacity=".95";return}const s=i===o;t.textContent=`Equipo asignado (${n}): ${o} ${s?"✅":"⚠️ no coincide"}`,t.style.opacity="1"}function xt(){const{btnSave:t}=nt();if(!t)return;const e=Ke();t.disabled=!e,t.style.opacity=e?"1":".65",t.style.cursor=e?"pointer":"not-allowed"}function ws(t){j.scanMode=t==="BAR"?"BAR":"QR"}async function Us(){var n;const{qrWrap:t,qrMsg:e,code:a}=nt();try{if(!window.Html5Qrcode){e&&(e.textContent="No se cargó la librería QR.");return}t&&(t.style.display="block"),j.qr||(j.qr=new Html5Qrcode("qrReader_conf"));const o=j.scanMode==="BAR";e&&(e.textContent=o?"Modo: CÓDIGO DE BARRAS (CODE_128)":"Modo: QR");const i={fps:o?8:10,qrbox:o?{width:170,height:320}:{width:250,height:250},formatsToSupport:o?[Html5QrcodeSupportedFormats.CODE_128]:[Html5QrcodeSupportedFormats.QR_CODE],experimentalFeatures:{useBarCodeDetectorIfSupported:!0}},s=async d=>{const p=de(d);p&&(a&&(a.value=p),e&&(e.textContent=`Código detectado: ${p}`),ce(),xt(),await gn())};try{await j.qr.start({facingMode:{exact:"environment"}},i,s,()=>{});return}catch{}try{await j.qr.start({facingMode:"environment"},i,s,()=>{});return}catch{}const r=await Html5Qrcode.getCameras();let c=((n=r==null?void 0:r[0])==null?void 0:n.id)||null;const l=r==null?void 0:r.find(d=>/back|rear|environment/i.test(d.label||""));l!=null&&l.id&&(c=l.id),await j.qr.start(c??{facingMode:"environment"},i,s,()=>{})}catch{e&&(e.textContent="No se pudo abrir cámara. Revisa permisos/HTTPS.")}}async function gn(){const{qrWrap:t,qrMsg:e}=nt();try{j.qr&&j.qr.isScanning&&await j.qr.stop()}catch{}t&&(t.style.display="none"),e&&!e.textContent&&(e.textContent="")}function $s(){const{code:t,ck1:e,ck2:a,ck3:n,qrMsg:o,msg:i}=nt();t&&(t.value=""),e&&(e.checked=!1),a&&(a.checked=!1),n&&(n.checked=!1),o&&(o.textContent=""),i&&(i.textContent=""),ce(),xt()}function Fs(t){const{vinInfo:e,assignedBox:a}=nt(),n=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),o=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase(),i=vn(t);e&&(e.textContent=`VIN: ${n||"-"} | ROL: ${o||"-"} | CONFORMIDAD: ${i}`),a&&(a.textContent=""),ce(),xt()}async function Bs(t){var i,s;const a=$().itemsByKey.get(String(t||""));if(!a)return;j.currentKey=String(t||""),j.currentItem=a,Fs(a),$s();const{modal:n,code:o}=nt();(i=n==null?void 0:n.classList)==null||i.add("show"),(s=n==null?void 0:n.setAttribute)==null||s.call(n,"aria-hidden","false"),setTimeout(()=>{var r;return(r=o==null?void 0:o.focus)==null?void 0:r.call(o)},0)}async function We(){var e,a;const{modal:t}=nt();(e=t==null?void 0:t.classList)==null||e.remove("show"),(a=t==null?void 0:t.setAttribute)==null||a.call(t,"aria-hidden","true"),await gn(),j.currentKey="",j.currentItem=null}async function ha(){const{code:t,ck1:e,ck2:a,ck3:n}=nt(),o=j.currentItem;if(!o)return vt("No hay cartilla seleccionada.",!0);const i=de(t==null?void 0:t.value);if(!i)return vt("Debes escribir o escanear el código del equipo.",!0);if(!(e!=null&&e.checked&&(a!=null&&a.checked)&&(n!=null&&n.checked)))return vt("Debes marcar los 3 items de conformidad.",!0);let s;try{s=Rt()}catch{return}const r=vn(o),c=To(o,r),l={email:s,conversionId:String(o.conversionId||""),vin:String(o.vin||"").trim().toUpperCase(),rolTrabajo:String(o.rolTrabajo||"").toUpperCase(),equipoTipo:r,equipoCodigo:i,equipoAsignado:c||"",checks:{ck1:!0,ck2:!0,ck3:!0}};l.ck1=!0,l.ck2=!0,l.ck3=!0;const d=await Me("/api/equipo-conformidad",l,"Guardando conformidad...");if(!(d!=null&&d.ok)){vt((d==null?void 0:d.error)||"No se pudo guardar la conformidad.",!0);return}vt("✅ Conformidad guardada correctamente."),setTimeout(()=>{try{ge==null||ge()}catch{}},400),setTimeout(()=>We().catch(()=>{}),450)}function qs(){if(j.bound)return;j.bound=!0;const{modal:t,btnClose:e,code:a,btnQR:n,btnStopQR:o,btnClear:i,ck1:s,ck2:r,ck3:c,btnSave:l}=nt();e==null||e.addEventListener("click",()=>We()),t==null||t.addEventListener("click",async d=>{d.target===t&&await We()}),a==null||a.addEventListener("input",()=>{a.value=de(a.value),ce(),xt(),vt("")}),[s,r,c].forEach(d=>{d==null||d.addEventListener("change",()=>{xt(),vt("")})}),n==null||n.addEventListener("click",async d=>{ws(d.altKey?"BAR":"QR"),await Us()}),o==null||o.addEventListener("click",async()=>{await gn()}),i==null||i.addEventListener("click",()=>{const{code:d,qrMsg:p}=nt();d&&(d.value=""),p&&(p.textContent=""),ce(),xt(),vt("")}),l==null||l.addEventListener("click",async()=>{if(!Ke()){vt("Completa el código del equipo y marca los 3 checks.",!0);return}await ha()}),a==null||a.addEventListener("keydown",async d=>{d.key==="Enter"&&Ke()&&(d.preventDefault(),await ha())}),xt()}const Ia={TECNICO:{syncTimer:null,clockTimer:null,estadoTimer:null,syncStopped:!1},CALIDAD:{syncTimer:null,clockTimer:null,estadoTimer:null,syncStopped:!1},RAMALERO:{syncTimer:null,clockTimer:null,estadoTimer:null,syncStopped:!1}};function bn(t){return Ia[t]||Ia.TECNICO}function yn(t){const e=bn(t);e.syncStopped=!0,e.syncTimer&&clearTimeout(e.syncTimer),e.clockTimer&&clearInterval(e.clockTimer),e.estadoTimer&&clearInterval(e.estadoTimer),e.syncTimer=null,e.clockTimer=null,e.estadoTimer=null}function No(t){const e=u.state.currentModule;u.state.currentModule=t;try{if(t==="RAMALERO"){const i=document.getElementById("ramalId");i&&(i.value="");const s=document.getElementById("tipoRamal");s&&(s.value="")}else{const i=w("vin");i&&(i.value="")}const a=w("activasBox");a&&(a.innerHTML="");const n=w("finalizadosBox");n&&(n.innerHTML=""),rt("");const o=$();o.showFinalizados=!1,o.itemsByKey.clear(),o.activeKeys=[],o.finalKeys=[],o.lastSyncSince=null,o.lastSyncRev=null,o.lastSyncAtMs=0}finally{u.state.currentModule=e}}async function Oo(t,e){const a=bn(t);if(e&&!a.syncStopped){try{await e({forceFull:!1,showOut:!1})}catch(n){console.error(`[${t}] sync loop error:`,n)}a.syncStopped||(a.syncTimer=setTimeout(()=>{Oo(t,e)},6e4))}}function xo(t,{syncNow:e,tickClocksUI:a,refreshEstadoForVinRole:n,buildAvgTopHTML:o}={}){yn(t);const i=u.state.currentModule;u.state.currentModule=t;try{const s=bn(t);if(s.syncStopped=!1,Promise.resolve(e==null?void 0:e({forceFull:!0,showOut:!1})).catch(c=>{console.error(`[${t}] initial sync error:`,c)}).finally(()=>{s.syncStopped||(s.syncTimer=setTimeout(()=>{Oo(t,e)},1e4))}),s.clockTimer=setInterval(()=>{a==null||a()},1e3),(t==="TECNICO"||t==="CALIDAD")&&(s.estadoTimer=setInterval(()=>{n==null||n({showOut:!1})},8e3),setTimeout(()=>{n==null||n({showOut:!1}).catch(()=>{})},700)),$().showFinalizados){const c=o&&o()||"";ct(c)}}finally{u.state.currentModule=i}}function we(t,e){if((!t.vin||t.vin==="")&&(e!=null&&e.vin)&&(t.vin=e.vin),!t.vin&&t.conversionId&&t.rolTrabajo){const a=Yi(t.conversionId,t.rolTrabajo);a&&(t.vin=a)}if(t.rolTrabajo==="RAMALERO"&&((!t.tipoRamal||t.tipoRamal==="")&&(e!=null&&e.tipoRamal)&&(t.tipoRamal=e.tipoRamal),!t.tipoRamal&&t.conversionId)){const a=Xi(t.conversionId);a&&(t.tipoRamal=a)}return e&&(t.updated_at||(t.updated_at=e.updated_at||null),t.last_nota_ts||(t.last_nota_ts=e.last_nota_ts||null),t.created_at||(t.created_at=e.created_at||null)),t}function ue(t){const e=(...n)=>{for(const o of n)if(o!=null&&String(o).trim()!=="")return o;return""},a={conversionId:String(e(t==null?void 0:t.conversionId,t==null?void 0:t.conversion_id,t==null?void 0:t.CONVERSION_ID,t==null?void 0:t.ID,t==null?void 0:t.id)).trim(),vin:String(e(t==null?void 0:t.vin,t==null?void 0:t.VIN)).trim().toUpperCase(),tipoRamal:String(e(t==null?void 0:t.tipoRamal,t==null?void 0:t.tipo_ramal,t==null?void 0:t.tipo,t==null?void 0:t.TIPO_RAMAL,t==null?void 0:t.TIPO)).trim(),created_at:(t==null?void 0:t.fecha_asignacion)??(t==null?void 0:t.FECHA_ASIGNACION)??(t==null?void 0:t.fecha_inicio)??(t==null?void 0:t.inicio_at)??(t==null?void 0:t.FECHA_INICIO)??(t==null?void 0:t.created_at)??(t==null?void 0:t.fecha_creacion)??(t==null?void 0:t.FECHA_CREACION)??null,rolTrabajo:String(e(t==null?void 0:t.rolTrabajo,t==null?void 0:t.rol_trabajo,t==null?void 0:t.rol,t==null?void 0:t.ROL_TRABAJO,t==null?void 0:t.ROL)).trim().toUpperCase(),estado:String(e(t==null?void 0:t.estado,t==null?void 0:t.estado_actual,t==null?void 0:t.estadoActual,t==null?void 0:t.ESTADO_ACTUAL,t==null?void 0:t.ESTADO)).trim().toUpperCase(),tiempo_ms:Number(e(t==null?void 0:t.tiempo_ms,t==null?void 0:t.tiempoMs,t==null?void 0:t.tiempo_trab_ms,t==null?void 0:t.TIEMPO_TRAB_MS,t==null?void 0:t.TIEMPO_MS,0))||0,running_since:(t==null?void 0:t.running_since)??(t==null?void 0:t.RUNNING_SINCE)??null,last_nota:String(e(t==null?void 0:t.last_nota,t==null?void 0:t.LAST_NOTA,"")),last_nota_ts:(t==null?void 0:t.last_nota_ts)??(t==null?void 0:t.LAST_NOTA_TS)??null,updated_at:(t==null?void 0:t.updated_at)??(t==null?void 0:t.UPDATED_AT)??null,tanque_asignado:String(e(t==null?void 0:t.tanque_asignado,t==null?void 0:t.tanqueAsignado,t==null?void 0:t.TANQUE_ASIGNADO,"")).trim(),reductor_asignado:String(e(t==null?void 0:t.reductor_asignado,t==null?void 0:t.reductorAsignado,t==null?void 0:t.REDUCTOR_ASIGNADO,"")).trim(),tanque_registrado:String(e(t==null?void 0:t.tanque_registrado,t==null?void 0:t.tanqueRegistrado,t==null?void 0:t.TANQUE_REGISTRADO,"")).trim(),reductor_registrado:String(e(t==null?void 0:t.reductor_registrado,t==null?void 0:t.reductorRegistrado,t==null?void 0:t.REDUCTOR_REGISTRADO,"")).trim(),inc_leve:Number(e(t==null?void 0:t.inc_leve,t==null?void 0:t.INC_LEVE,0))||0,inc_moderada:Number(e(t==null?void 0:t.inc_moderada,t==null?void 0:t.INC_MODERADA,0))||0,inc_critica:Number(e(t==null?void 0:t.inc_critica,t==null?void 0:t.INC_CRITICA,0))||0,motorNombre:String(e(t==null?void 0:t.motorNombre,t==null?void 0:t.motor_nombre,t==null?void 0:t.MOTOR_NOMBRE,"")).trim(),tanqueroNombre:String(e(t==null?void 0:t.tanqueroNombre,t==null?void 0:t.tanquero_nombre,t==null?void 0:t.TANQUERO_NOMBRE,"")).trim()};return a.rolTrabajo||(a.tipoRamal?a.rolTrabajo="RAMALERO":u.state.currentModule==="CALIDAD"?a.rolTrabajo="CALIDAD":a.rolTrabajo=String(Wa()||"MOTOR").toUpperCase()),a.estado||(a.estado="SIN_INICIAR"),a.conversionId&&a.rolTrabajo&&a.vin&&Gi(a.conversionId,a.rolTrabajo,a.vin),a.conversionId&&a.rolTrabajo==="RAMALERO"&&a.tipoRamal&&Zi(a.conversionId,a.tipoRamal),a}function ko(t){const e=$(),a=Array.isArray(t==null?void 0:t.items)?t.items:[];for(const n of a){const o=ue(n),i=Te(o),s=e.itemsByKey.get(i);we(o,s),e.itemsByKey.set(i,o)}}function Ge(t){const e=$();e.itemsByKey.clear();const a=Array.isArray(t)?t:[];for(const n of a){const o=ue(n),i=Te(o);we(o,null),e.itemsByKey.set(i,o)}}function Do(t,e){const a=$();return t.join(",")!==a.activeKeys.join(",")||e.join(",")!==a.finalKeys.join(",")}let zt=null;const Vs=300*1e3;function wo(){zt=null}async function hn(){const t=Date.now();if(zt&&t-zt.ts<Vs)return zt.byVin;try{const e=await Tt("/api/supervisor/report?track=CONVERSION"),a=new Map;if(e!=null&&e.ok&&Array.isArray(e.items))for(const n of e.items){const o=String(n.vin||"").toUpperCase().trim();if(!o)continue;const i=String(n.rol||"").toUpperCase(),s=a.get(o)||{motorNombre:"",tanqueroNombre:""};i==="MOTOR"&&(s.motorNombre=String(n.userName||"").trim()),(i==="TANQUE"||i==="TANQUERO")&&(s.tanqueroNombre=String(n.userName||"").trim()),a.set(o,s)}return zt={ts:t,byVin:a},a}catch{const e=new Map;return zt={ts:t,byVin:e},e}}async function Ye(t){const e=String(t||"").toUpperCase().trim();return(await hn()).get(e)||{motorNombre:"",tanqueroNombre:""}}const _a=Object.freeze(Object.defineProperty({__proto__:null,applySyncResultToStore_:ko,clearNombresCache_:wo,detectIfNeedsFullRerender_:Do,ensureNombresCache_:hn,fetchNombresParaVin_:Ye,mergePrevAndCache_:we,normalizeItem_:ue,storeFullReplace_:Ge},Symbol.toStringTag,{value:"Module"}));let Ve={k:"",t:0};async function Uo(t,e={}){var f,I;if(!(u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD"))return;let a;try{a=Rt()}catch{return}const n=String(t||((f=g("accion"))==null?void 0:f.value)||"").toUpperCase();let o="";if(n==="NOTA"&&(o=String(((I=g("nota"))==null?void 0:I.value)||"").trim(),!o&&(e!=null&&e.nota)&&(o=String(e.nota||"").trim()),!o)){const S={ok:!1,error:"Escribe una nota antes de guardar."};return K(S),S}let i=(e==null?void 0:e.vin)||Gt();if(!i){const S={ok:!1,error:"Pon el VIN"};return K(S),S}let s=(e==null?void 0:e.rolTrabajo)||Et();const r=$(),c=[...r.itemsByKey.values()].find(S=>String(S.vin||"").toUpperCase()===i&&String(S.rolTrabajo||"").toUpperCase()===s);if(c&&!vs(c.estado).includes(n)){const q={ok:!1,error:`Acción ${n} no permitida desde estado ${c.estado}.`};return K(q),q}const l=await Me("/api/evento",{email:a,vin:i,rolTrabajo:s,accion:n,nota:o},n==="NOTA"?"Guardando nota...":"Registrando...");if(K(l),!(l!=null&&l.ok))return l;const d=ue(l),p=Te(d),y=r.itemsByKey.get(p);y&&we(d,y),r.itemsByKey.set(p,d),Lt();const b=ln();return n==="NOTA"&&(e!=null&&e.clearKey)&&b.set(String(e.clearKey),""),Bt(),ct(),dn(b),n==="NOTA"&&g("nota")&&(g("nota").value=""),setTimeout(()=>{u.state.uiLocked||G({forceFull:!1,showOut:!1})},400),l}async function Yt(t,e){const a=String(t||"").trim().toUpperCase(),n=String(e||"").trim().toUpperCase();if(!a)return;const o=`${a}|${n}`,i=Date.now();if(Ve.k===o&&i-Ve.t<5e3)return;Ve={k:o,t:i};const r=[...$().itemsByKey.values()].find(l=>String(l.vin||"").toUpperCase()===a&&String(l.rolTrabajo||"").toUpperCase()===n),c=String((r==null?void 0:r.estado)||"").toUpperCase();if(!r||c==="SIN_INICIAR"){const l=await Uo("INICIO",{vin:a,rolTrabajo:n});if(l&&!l.ok&&l.error&&l.error.includes("ya está asignada")){const d="⚠️ Orden ya asignada",p=l.error;typeof confirm<"u"&&confirm(`${d}

${p}`)}}}let se=[];async function Qs(){se.push(await fe("asignaciones",t=>{Qe("asignaciones")})),se.push(await fe("work_orders",t=>{Qe("work_orders")})),se.push(await fe("incidencias",t=>{Qe("incidencias")}))}function js(){se.forEach(t=>{try{t()}catch(e){console.warn("Unsub error:",e)}}),se=[]}function Qe(t,e){$()&&(t==="asignaciones"?G({forceFull:!1,showOut:!1}).catch(n=>console.warn("[Realtime] Sync error:",n.message)):t==="work_orders"?G({forceFull:!1,showOut:!1}).catch(n=>console.warn("[Realtime] Sync error:",n.message)):t==="incidencias"&&u.state.currentModule==="INCIDENCIAS"&&G({forceFull:!1,showOut:!1}).catch(n=>console.warn("[Realtime] Sync error:",n.message)))}async function Ps(t,e,{forceRefresh:a=!1}={}){try{return{mode:"sync",data:{ok:!0,items:await ji(t)}}}catch(o){console.warn("[apiSync_] Supabase error:",o.message)}try{const i=await sn("/api/sync",{email:t,since:e,excludeFinalizados:!0,forceRefresh:a});if(i&&i.ok)return{mode:"sync",data:i}}catch{}return{mode:"legacy",data:await Tt(`/api/mis-activas?email=${encodeURIComponent(t)}&excludeFinalizados=true&_t=${Date.now()}`)}}async function Ca(t){try{return{ok:!0,items:await Pi(t)}}catch(e){console.warn("[fetchFinalizados_] Supabase error:",e.message)}return Tt(`/api/mis-finalizadas?email=${encodeURIComponent(t)}`)}async function G({forceFull:t=!1,showOut:e=!1,_fromLock:a=!1}={}){if(!a&&u.state.uiLocked||!an())return;let n;try{n=Rt()}catch{return}const o=$();t&&wo();const i=o.activeKeys.slice(),s=o.finalKeys.slice(),r=ln(),c=t?null:o.lastSyncSince,l=await Ps(n,c,{forceRefresh:t}),d=l.data;if(e&&K(d),!d||!d.ok)return;if(l.mode==="legacy"?(Ge(d.items||[]),o.lastSyncSince=new Date().toISOString(),o.lastSyncRev=null):(d.full?Ge(d.items||[]):ko(d),o.lastSyncSince=d.server_time||new Date().toISOString(),o.lastSyncRev=d.rev||o.lastSyncRev),Lt(),u.state.currentModule==="CALIDAD"){const y=await hn();for(const b of[...o.activeKeys,...o.finalKeys]){const f=o.itemsByKey.get(b);if(f&&f.vin&&!f.motorNombre&&!f.tanqueroNombre){const I=y.get(f.vin.toUpperCase().trim())||{motorNombre:"",tanqueroNombre:""};f.motorNombre=I.motorNombre,f.tanqueroNombre=I.tanqueroNombre}}}if(t||Do(i,s)?(Bt(),ct(),dn(r)):me(),o.lastSyncAtMs=Date.now(),Le(),u.state.currentModule==="CALIDAD"){const y=o.activeKeys.map(b=>o.itemsByKey.get(b)).find(b=>b&&b.rolTrabajo==="CALIDAD"&&b.estado==="SIN_INICIAR");y!=null&&y.vin&&Yt(y.vin,"CALIDAD").catch(()=>{})}if(u.state.currentModule==="TECNICO"){let b=Gt();if(!b){const f=o.activeKeys.map(I=>o.itemsByKey.get(I)).find(I=>I&&(I.rolTrabajo==="MOTOR"||I.rolTrabajo==="TANQUE")&&I.estado==="SIN_INICIAR"&&String(I.vin||"").trim());b=String((f==null?void 0:f.vin)||"").trim().toUpperCase()}b&&Yt(b,Et()).catch(()=>{})}}let Aa=null;async function Mt({showOut:t=!1}={}){if(u.state.uiLocked||!an())return;let e;try{e=Rt()}catch{return}if(!(u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD"))return;const a=Gt(),n=Et();if(!a){rt("");return}const o=$(),i=a.toUpperCase();for(const l of o.itemsByKey.values())if(String(l.vin||"").toUpperCase()===i&&String(l.rolTrabajo||"").toUpperCase()===n){u.state.currentModule==="CALIDAD"&&!l.motorNombre&&!l.tanqueroNombre&&Ye(i).then(({motorNombre:d,tanqueroNombre:p})=>{l.motorNombre=d,l.tanqueroNombre=p,Bt(),ct()}).catch(()=>{}),rt(`Estado: ${l.estado} | Tiempo: ${Ut(Ft(l))}`);return}const s=await zi(e,a,n);t&&K(s),s!=null&&s.ok;const r=ue(s),c=Te(r);if(u.state.currentModule==="CALIDAD"&&r.vin){const{motorNombre:l,tanqueroNombre:d}=await Ye(r.vin);r.motorNombre=l,r.tanqueroNombre=d}o.itemsByKey.set(c,r),Lt(),Bt(),ct(),rt(`Estado: ${r.estado} | Tiempo: ${Ut(Ft(r))}`)}function Je(t=500){(u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD")&&(clearTimeout(Aa),Aa=setTimeout(()=>Mt({showOut:!1}).catch(()=>{}),t))}function zs(){var t,e,a;(t=g("btnEstado"))==null||t.addEventListener("click",async()=>{u.state.currentModule==="TECNICO"&&await W(async()=>{const n=Gt();if(!n){rt("❌ Ingresa un VIN primero");return}const o=Et();await Yt(n,o),await Mt({showOut:!0}),await G({forceFull:!0,showOut:!1})},"Buscando / creando OT...")}),(e=g("btnEstadoQ"))==null||e.addEventListener("click",async()=>{u.state.currentModule==="CALIDAD"&&await W(async()=>{const n=Gt();if(!n){rt("❌ Ingresa un VIN primero");return}const o=Et();await Yt(n,o),await Mt({showOut:!0}),await G({forceFull:!0,showOut:!1})},"Buscando / creando OT...")}),(a=g("rol"))==null||a.addEventListener("change",()=>{u.state.currentModule==="TECNICO"&&Je(0)})}function In(){var e;const t=document.getElementById("supIncModal");(e=t==null?void 0:t.classList)==null||e.add("show")}function Sa(){var t,e;(e=(t=document.getElementById("supIncModal"))==null?void 0:t.classList)==null||e.remove("show")}function Hs(t,{escapeHtml:e,fmtShort_:a}){try{return e(a(t))}catch{return e(String(t||""))}}async function _n(t,e,{getJSON_user:a,withLock:n}){if(t)try{return{ok:!0,items:await n(async()=>await Hi(t),"Cargando incidencias...")}}catch(s){console.warn("[fetchIncidencias_] Supabase error:",s.message)}const o=`/api/incidencias/list?vin=${encodeURIComponent(t||"")}&conversionId=${encodeURIComponent(e||"")}&limit=${encodeURIComponent(200)}`;return await a(o,"Cargando incidencias...")}function Jt(t,e,{escapeHtml:a,fmtShort_:n}){const o=document.getElementById("supIncInfo"),i=document.getElementById("supIncList"),s=document.getElementById("supIncMsg");s&&(s.textContent=""),i&&(i.innerHTML="");const r=(e==null?void 0:e.who)||"-",c=(e==null?void 0:e.vin)||"-",l=(e==null?void 0:e.conversionId)||"";if(o&&(o.textContent=`${r} — VIN: ${c}${l?` — CID: ${l}`:""}`),!(t!=null&&t.ok)){s&&(s.textContent=(t==null?void 0:t.error)||"Error cargando incidencias.");return}const d=Array.isArray(t.items)?t.items:[];if(!d.length){i&&(i.innerHTML='<div class="small">No hay incidencias registradas.</div>');return}i&&(i.innerHTML=d.map(p=>{const y=String(p.tipo||"").toUpperCase(),b=p.tecnico||"-",f=p.nota||"",I=p.fecha||"",q=!!(p.fotoThumbUrl||p.fotoUrl||p.fotoImgUrl)?`
      <div style="margin-top:10px;">
        <a href="${a(p.fotoUrl||p.fotoImgUrl)}" target="_blank" rel="noopener">
          <img
            src="${a(p.fotoThumbUrl||p.fotoImgUrl)}"
            alt="Foto incidencia"
            style="width:140px; height:auto; border-radius:10px; border:1px solid rgba(255,255,255,.18);"
          />
        </a>
        <div class="small" style="opacity:.85; margin-top:6px;">
          (clic para abrir)
        </div>
      </div>
    `:"";return`
      <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.14);">
        <div class="row space-between" style="gap:10px;">
          <div style="font-weight:900;">
            ${a(y||"INCIDENCIA")}
          </div>
          <div class="small" style="opacity:.9;">
            ${Hs(I,{escapeHtml:a,fmtShort_:n})}
          </div>
        </div>

        <div class="small" style="margin-top:8px;">
          <b>Técnico:</b> ${a(b)}
        </div>

        ${f?`
          <div class="small" style="margin-top:8px; white-space:pre-wrap;">
            <b>Nota:</b> ${a(f)}
          </div>
        `:'<div class="small" style="margin-top:8px; opacity:.8;">Sin nota.</div>'}

        ${q}
      </div>
    `}).join(""))}function Ks({CORE:t,getJSON_user:e,escapeHtml:a,fmtShort_:n}){var o,i,s;(o=document.getElementById("supTable"))==null||o.addEventListener("click",async r=>{var b,f;if(t.state.currentModule!=="SUPERVISOR")return;const c=(f=(b=r.target)==null?void 0:b.closest)==null?void 0:f.call(b,"button[data-sup-inc]");if(!c)return;const l=String(c.dataset.vin||"").trim().toUpperCase(),d=String(c.dataset.cid||"").trim(),p=String(c.dataset.who||"").trim();In();const y=document.getElementById("supIncMsg");y&&(y.textContent="Cargando...");try{const I=await _n(l,d,{getJSON_user:e});Jt(I,{vin:l,conversionId:d,who:p},{escapeHtml:a,fmtShort_:n})}catch(I){Jt({ok:!1,error:String((I==null?void 0:I.message)||I)},{vin:l,conversionId:d,who:p},{escapeHtml:a,fmtShort_:n})}}),(i=document.getElementById("btnCloseSupInc"))==null||i.addEventListener("click",()=>Sa()),(s=document.getElementById("supIncModal"))==null||s.addEventListener("click",r=>{r.target===document.getElementById("supIncModal")&&Sa()})}function Ea(t){const e=u.state.currentModule;u.state.currentModule=t;try{const a=w("activasBox");if(!a)return;const n=`bound_${t}`;if(a.dataset[n]==="1")return;a.dataset[n]="1",a.addEventListener("input",o=>{var r;const i=o.target.closest("textarea.notaCard");if(!i)return;const s=(r=i.closest(".jobCard"))==null?void 0:r.querySelector(".btnNota");s&&(s.style.display=i.value.trim()?"block":"none")}),a.addEventListener("click",async o=>{var y;const i=o.target.closest(".jobCard");if(!i)return;const s=o.target.closest("button[data-act]");if(s){o.stopPropagation();const b=String(s.dataset.act||"").toUpperCase(),f=$(),I=i.dataset.key||"",S=f.itemsByKey.get(I);if(!S)return;const q=w("vin");if(q&&(q.value=S.vin||""),u.state.currentModule==="TECNICO"&&!u.state.rolLock&&(g("rol")&&(g("rol").value=S.rolTrabajo||"MOTOR"),Le()),b==="NOTA"&&g("nota")&&(g("nota").value=String(((y=i.querySelector("textarea.notaCard"))==null?void 0:y.value)||"")),b==="FIN"&&!await Mo({title:"Confirmar finalización",message:"¿Seguro que quieres finalizar este trabajo? Esta acción puede cerrar la tarea actual.",acceptText:"Sí, finalizar",cancelText:"Cancelar"}))return;await Uo(b,{clearKey:I});return}const r=o.target.closest("button[data-go]");if(!r)return;const c=String(r.dataset.go||"").toUpperCase(),l=$(),d=i.dataset.key||"",p=l.itemsByKey.get(d);if(p){if(c==="RF"){const b=String(r.dataset.vin||p.vin||"").trim().toUpperCase();if(!b)return;if(u.state.currentModule==="TECNICO"){g("vin")&&(g("vin").value=b),Ro(b);return}if(u.state.currentModule==="CALIDAD"){g("vinQ")&&(g("vinQ").value=b),Ao(b);return}}if(c==="INC"){o.stopPropagation();const b=String(r.dataset.key||d||"").trim();if(!b)return;await ho(b);return}if(c==="VER_INC"){o.stopPropagation();const b=String(r.dataset.vin||(p==null?void 0:p.vin)||"").trim().toUpperCase(),f=String(r.dataset.cid||(p==null?void 0:p.conversionId)||"").trim();In();const I=document.getElementById("supIncMsg");I&&(I.textContent="Cargando..."),_n(b,f,{getJSON_user:Tt}).then(S=>Jt(S,{vin:b,conversionId:f,who:b},{escapeHtml:T,fmtShort_:wt})).catch(S=>Jt({ok:!1,error:String((S==null?void 0:S.message)||S)},{vin:b},{escapeHtml:T,fmtShort_:wt}));return}if(c==="CONF"){o.stopPropagation(),await Bs(d);return}}})}finally{u.state.currentModule=e}}function Ra(t){const e=u.state.currentModule;u.state.currentModule=t;try{const a=w("finalizadosBox");if(!a)return;const n=`boundFin_${t}`;if(a.dataset[n]==="1")return;a.dataset[n]="1",a.addEventListener("click",async o=>{var d,p,y,b;const i=(p=(d=o.target)==null?void 0:d.closest)==null?void 0:p.call(d,"button[data-go]");if(!i)return;const s=String(i.dataset.go||"").toUpperCase(),r=$(),c=String(i.dataset.key||((b=(y=i.closest("[data-key]"))==null?void 0:y.dataset)==null?void 0:b.key)||"").trim(),l=c?r.itemsByKey.get(c):null;if(s==="INC"){if(o.stopPropagation(),!c)return;await ho(c);return}if(s==="VER_INC"){o.stopPropagation();const f=String(i.dataset.vin||(l==null?void 0:l.vin)||"").trim().toUpperCase(),I=String(i.dataset.cid||(l==null?void 0:l.conversionId)||"").trim();In();const S=document.getElementById("supIncMsg");S&&(S.textContent="Cargando..."),_n(f,I,{getJSON_user:Tt}).then(q=>Jt(q,{vin:f,conversionId:I,who:f},{escapeHtml:T,fmtShort_:wt})).catch(q=>Jt({ok:!1,error:String((q==null?void 0:q.message)||q)},{vin:f},{escapeHtml:T,fmtShort_:wt}));return}if(s==="RF"){o.stopPropagation();const f=String(i.dataset.vin||(l==null?void 0:l.vin)||"").trim().toUpperCase();if(!f)return;if(u.state.currentModule==="TECNICO"){g("vin")&&(g("vin").value=f),Ro(f);return}if(u.state.currentModule==="CALIDAD"){g("vinQ")&&(g("vinQ").value=f),Ao(f);return}}})}finally{u.state.currentModule=e}}function Ws(){Ea("TECNICO"),Ea("CALIDAD"),Ra("TECNICO"),Ra("CALIDAD")}const Ce={MIN_CHARS:1,LIMIT:12,DEBOUNCE_MS:200};let La=null,gt=[],Ue=!1,st=-1,Ma="",Ot=null;function $o(){return u.state.currentModule==="CALIDAD"?w("vinQ"):w("vin")}function Cn(){return u.state.currentModule==="CALIDAD"?w("vinSuggestQ"):w("vinSuggest")}function Zt(){const t=Cn();t&&(Ue=!1,st=-1,gt=[],t.classList.add("hidden"),t.innerHTML="")}function Fo(){const t=Cn();if(t){if(!gt.length){Zt();return}t.innerHTML=gt.map((e,a)=>`
      <div class="vsItem ${a===st?"active":""}" data-idx="${a}" role="option" aria-selected="${a===st}">
        <div class="vsVin">${T(e)}</div>
        <div class="vsHint">Enter</div>
      </div>
    `).join(""),t.classList.remove("hidden"),Ue=!0}}function Ta(t){st=Math.max(0,Math.min(t,gt.length-1)),Fo();const e=Cn(),a=e==null?void 0:e.querySelector(`.vsItem[data-idx="${st}"]`);a&&a.scrollIntoView({block:"nearest"})}async function Gs(t){var o;try{(o=Ot==null?void 0:Ot.abort)==null||o.call(Ot)}catch{}Ot=new AbortController;try{if(Ya())return await Ki(t,Ce.LIMIT)}catch(i){console.warn("[vinAcFetch_] Supabase error:",i.message)}const e=`/api/vin-suggest?q=${encodeURIComponent(t)}&limit=${encodeURIComponent(Ce.LIMIT)}`,n=await(await fetch(e,{signal:Ot.signal})).json();return n!=null&&n.ok?Array.isArray(n.items)?n.items:[]:[]}function Na(){const t=$o();if(!t)return;const e=String(t.value||"").trim().toUpperCase();if(Ma=e,!e||e.length<Ce.MIN_CHARS){Zt();return}clearTimeout(La),La=setTimeout(async()=>{try{const a=await Gs(e);if(Ma!==e)return;gt=(a||[]).map(n=>typeof n=="object"&&n!==null&&n.vin?String(n.vin).toUpperCase():String(n||"").toUpperCase()).filter(Boolean),st=gt.length?0:-1,Fo()}catch{Zt()}},Ce.DEBOUNCE_MS)}function Bo(t){const e=$o();e&&(e.value=String(t||"").toUpperCase(),Zt(),Mt({showOut:!1}).then(async()=>{await W(async()=>{await Yt(e.value,Et()),await G({forceFull:!1,showOut:!1}),await Mt({showOut:!1})},"Iniciando automáticamente...")}).catch(()=>{}))}function Oa(t){if(Ue){if(t.key==="ArrowDown"){t.preventDefault(),Ta(st+1);return}if(t.key==="ArrowUp"){t.preventDefault(),Ta(st-1);return}if(t.key==="Enter"){st>=0&&gt[st]&&(t.preventDefault(),Bo(gt[st]));return}t.key==="Escape"&&(t.preventDefault(),Zt())}}function Ys(){const t=g("vinSuggest"),e=g("vinSuggestQ");[t,e].forEach(a=>{a&&a.dataset.bound!=="1"&&(a.dataset.bound="1",a.addEventListener("mousedown",n=>{const o=n.target.closest(".vsItem[data-idx]");if(!o)return;n.preventDefault();const i=Number(o.dataset.idx),s=gt[i];s&&Bo(s)}))}),document.body.dataset.vinSuggestDocBound||(document.body.dataset.vinSuggestDocBound="1",document.addEventListener("click",a=>{!Ue||[...document.querySelectorAll(".vinWrap")].some(i=>i.contains(a.target))||Zt()}))}function Js(){var t,e,a,n;Ys(),(t=g("vin"))==null||t.addEventListener("input",()=>{u.state.currentModule==="TECNICO"&&(Na(),rt(""),Je(650))}),(e=g("vin"))==null||e.addEventListener("keydown",o=>{u.state.currentModule==="TECNICO"&&Oa(o)}),(a=g("vinQ"))==null||a.addEventListener("input",()=>{u.state.currentModule==="CALIDAD"&&(Na(),rt(""),Je(650))}),(n=g("vinQ"))==null||n.addEventListener("keydown",o=>{u.state.currentModule==="CALIDAD"&&Oa(o)})}const Ae=Ht("qrReader");let qo="QR";function xa(t){qo=t==="BAR"?"BAR":"QR"}async function ka(){var e;if(!(u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD"))return;const t=g("qrModal");(e=t==null?void 0:t.classList)==null||e.add("show"),await Xe()}async function Ze(){var t,e;(e=(t=g("qrModal"))==null?void 0:t.classList)==null||e.remove("show"),await Ae.stop()}async function Xe(){const t=g("qrMsg");try{await Ae.start({mode:qo,msgEl:t,onDecoded:async e=>{const a=u.state.currentModule==="CALIDAD"?w("vinQ"):w("vin");a&&(a.value=e),t&&(t.textContent=`VIN detectado: ${e}`),await Ze(),await W(async()=>{await Mt({showOut:!1}),await Yt(e,Et()),await G({forceFull:!0,showOut:!1}),await Mt({showOut:!1})},"Iniciando automáticamente...")}})}catch{}}function Zs(){var t,e,a,n,o,i;(t=g("btnQR"))==null||t.addEventListener("click",ka),(e=g("btnQRQ"))==null||e.addEventListener("click",ka),(a=g("btnCloseQR"))==null||a.addEventListener("click",Ze),(n=g("qrModal"))==null||n.addEventListener("click",async s=>{s.target===g("qrModal")&&await Ze()}),(o=g("btnScanQR"))==null||o.addEventListener("click",async()=>{xa("QR"),await W(async()=>{await Ae.stop(),await Xe()},"Cambiando a QR...")}),(i=g("btnScanBar"))==null||i.addEventListener("click",async()=>{xa("BAR"),await W(async()=>{await Ae.stop(),await Xe()},"Cambiando a CÓDIGO DE BARRAS...")})}function be(){var o,i;if(!an())return;const t=$(),e=Date.now();if((i=(o=w("activasBox"))==null?void 0:o.querySelectorAll(".jobCard[data-key] .js-tiempo"))==null||i.forEach(s=>{const r=s.closest(".jobCard");if(!r)return;const c=r.dataset.key||"",l=t.itemsByKey.get(c);l&&(s.textContent=`⏱ ${Ut(Ft(l,e))}`)}),u.state.currentModule==="RAMALERO")return;const a=Gt(),n=Et();if(a&&n){const s=[...t.itemsByKey.values()].find(r=>String(r.vin||"").toUpperCase()===a&&String(r.rolTrabajo||"").toUpperCase()===n);s&&rt(`Estado: ${s.estado} | Tiempo: ${Ut(Ft(s,e))}`)}}function Xs(){var t,e,a,n;zs(),Js(),Zs(),Ts(),qs(),xs(),ks(async()=>{await G({forceFull:!0,showOut:!1})}),Ns(),Os(),Ws(),(t=g("btnActivas"))==null||t.addEventListener("click",async()=>{u.state.currentModule==="TECNICO"&&await W(async()=>G({forceFull:!0,showOut:!0,_fromLock:!0}),"Refrescando...")}),(e=g("btnFinalizados"))==null||e.addEventListener("click",async()=>{u.state.currentModule==="TECNICO"&&await W(async()=>{const o=$();if(o.showFinalizados=!o.showFinalizados,w("btnFinalizados").textContent=o.showFinalizados?"Ocultar finalizados":"Ver finalizados",o.showFinalizados&&!o._finalizadosLoaded){let i;try{i=Rt()}catch{return}const s=await Ca(i);if(s!=null&&s.ok&&Array.isArray(s.items)){const{normalizeItem_:r}=await ma(async()=>{const{normalizeItem_:c}=await Promise.resolve().then(()=>_a);return{normalizeItem_:c}},void 0);for(const c of s.items){const l=r(c),d=`${l.conversionId}|${l.rolTrabajo}`;o.itemsByKey.set(d,l)}Lt(),o._finalizadosLoaded=!0}}ct()},"Cargando finalizados...")}),(a=g("btnActivasQ"))==null||a.addEventListener("click",async()=>{u.state.currentModule==="CALIDAD"&&await W(async()=>G({forceFull:!0,showOut:!0,_fromLock:!0}),"Refrescando...")}),(n=g("btnFinalizadosQ"))==null||n.addEventListener("click",async()=>{u.state.currentModule==="CALIDAD"&&await W(async()=>{const o=$();if(o.showFinalizados=!o.showFinalizados,w("btnFinalizadosQ").textContent=o.showFinalizados?"Ocultar finalizados":"Ver finalizados",o.showFinalizados&&!o._finalizadosLoaded){let i;try{i=Rt()}catch{return}const s=await Ca(i);if(s!=null&&s.ok&&Array.isArray(s.items)){const{normalizeItem_:r}=await ma(async()=>{const{normalizeItem_:c}=await Promise.resolve().then(()=>_a);return{normalizeItem_:c}},void 0);for(const c of s.items){const l=r(c),d=`${l.conversionId}|${l.rolTrabajo}`;o.itemsByKey.set(d,l)}Lt(),o._finalizadosLoaded=!0}}ct()},"Cargando finalizados...")})}function Vo(t){u.state.currentModule=t,Qs().catch(e=>console.warn("[enter] Realtime init error:",e.message)),xo(t,{syncNow:G,tickClocksUI:be,refreshEstadoForVinRole:Mt})}function Se(t){yn(t),No(t),js()}async function tr(){var o;const t=g("ramalId");t&&(t.value="");let e;try{e=Rt()}catch{return}const a=String(((o=g("tipoRamal"))==null?void 0:o.value)||"").trim();if(!a){K({ok:!1,error:"Selecciona tipo de ramal"});return}const n=await Me("/api/evento",{email:e,rolTrabajo:"RAMALERO",accion:"INICIO",tipoRamal:a},"Iniciando...");K(n),n!=null&&n.ok&&(await G({forceFull:!0,showOut:!1}),Lt(),Bt(),ct())}async function er(t,e,a=""){var r;let n;try{n=Rt()}catch{return}const o=String((t==null?void 0:t.tipoRamal)||((r=g("tipoRamal"))==null?void 0:r.value)||"").trim(),i={email:n,rolTrabajo:"RAMALERO",accion:e,conversionId:String((t==null?void 0:t.conversionId)||"").trim(),tipoRamal:o,nota:a},s=await Me("/api/evento",i,`Enviando ${e}...`);K(s),s!=null&&s.ok&&(await G({forceFull:!0,showOut:!1}),Lt(),Bt(),ct())}let Da=!1;function nr(){var t,e,a;Da||(Da=!0,(t=g("btnActivasR"))==null||t.addEventListener("click",async()=>{u.state.currentModule==="RAMALERO"&&await W(async()=>G({forceFull:!0,showOut:!0,_fromLock:!0}),"Refrescando...")}),(e=g("btnFinalizadosR"))==null||e.addEventListener("click",async()=>{u.state.currentModule==="RAMALERO"&&await W(async()=>{const n=$();n.showFinalizados=!n.showFinalizados;const o=w("btnFinalizados");o&&(o.textContent=n.showFinalizados?"Ocultar finalizados":"Ver finalizados"),ct()},"Cargando finalizados...")}),(a=g("btnRamalNuevo"))==null||a.addEventListener("click",async()=>{u.state.currentModule==="RAMALERO"&&await tr()}))}let wa=!1;function pt(t,e){return t!=null&&t.closest?t.closest(e):null}function ar(){wa||(wa=!0,document.addEventListener("click",async t=>{var i;if(u.state.currentModule!=="RAMALERO")return;const e=w("activasBox");if(!e)return;const a=t.target,n=pt(a,"button[data-act]");if(n&&e.contains(n)){t.preventDefault(),t.stopPropagation();const s=pt(n,".jobCard[data-key]"),r=((i=s==null?void 0:s.dataset)==null?void 0:i.key)||"";if(!r)return;const c=$().itemsByKey.get(r);if(!c)return;const l=String(n.dataset.act||"").toUpperCase();if(!l)return;let d="";if(l==="NOTA"){const p=s.querySelector("textarea.notaCard");d=String((p==null?void 0:p.value)||"").trim()}if(l==="FIN"&&!await Mo({title:"Confirmar finalización",message:"¿Seguro que quieres finalizar este ramal? Esta acción puede cerrar la tarea actual.",acceptText:"Sí, finalizar",cancelText:"Cancelar"}))return;await er(c,l,d);return}const o=pt(a,".jobCard");if(o&&e.contains(o)){if(pt(a,"button")||pt(a,"textarea")||pt(a,"input")||pt(a,"select")||pt(a,"a"))return;o.classList.toggle("open")}}),document.addEventListener("input",t=>{if(u.state.currentModule!=="RAMALERO")return;const e=w("activasBox");if(!e)return;const a=pt(t.target,"textarea.notaCard");if(!a||!e.contains(a))return;const n=pt(a,".jobCard");if(!n)return;const o=n.querySelector("button.btnNota[data-act='NOTA']");if(!o)return;const i=String(a.value||"").trim().length>0;o.style.display=i?"block":"none"}))}function or(){nr(),ar()}function ir(){u.state.currentModule="RAMALERO",xo("RAMALERO",{syncNow:G,tickClocksUI:()=>{be==null||be(),me==null||me()}})}function Qo(){yn("RAMALERO"),No("RAMALERO")}function Ee(t){const e=[...t].sort((o,i)=>o-i),a=e.length;if(!a)return 0;const n=Math.floor(a/2);return a%2?e[n]:(e[n-1]+e[n])/2}function jo(t,e){const a=t.map(n=>Math.abs(n-e));return Ee(a)}function sr(t,e,a,n=2.5){const o=a,i=Math.abs(t-e)/o;if(i<=n)return 1;const s=i-n;return 1/(1+s*s)}function Po(t){const e=String(t||"").toUpperCase();return e==="CALIDAD"?"CALIDAD":e==="RAMAL"||e==="RAMALERO"?"RAMAL":"CONVERSION"}function zo(t){const e=String(t||"").toUpperCase();return e==="TANQUE"||e==="TANQUERO"?"TANQUE":e==="MOTOR"?"MOTOR":e==="RAMAL"||e==="RAMALERO"?"RAMAL":e==="CALIDAD"?"CALIDAD":e==="TECNICO"||e==="CONVERSION"?"MOTOR":e||"UNKNOWN"}function Ho(t){return String(t||"").trim().toUpperCase()||"ALL"}function ye(t){return Number.isFinite(t)&&t>0}function rr(t,e){const a=new Map;function n(i,s){ye(s)&&(a.has(i)||a.set(i,[]),a.get(i).push(s))}for(const i of t||[]){const s=Number(e(i)||0);if(!ye(s))continue;const r=Po(i.track||i.trackType||i.modulo||i.area||i._track),c=zo(i.rol||i.rolTrabajo),l=Ho(i.marca||i.brand);n("GLOBAL",s),n(`T:${r}`,s),n(`T:${r}|R:${c}`,s),n(`T:${r}|M:${l}`,s),n(`T:${r}|R:${c}|M:${l}`,s)}const o=new Map;for(const[i,s]of a.entries()){const r=s.filter(ye);if(!r.length)continue;const c=Ee(r),l=jo(r,c)||1;o.set(i,{key:i,count:r.length,medianMs:c,madMs:l})}return o}function cr(t,e={},a=4){var c,l;const n=Po(e.track),o=zo(e.rol),i=Ho(e.marca),s=[{key:`T:${n}|R:${o}|M:${i}`,level:"track+rol+marca"},{key:`T:${n}|R:${o}`,level:"track+rol"},{key:`T:${n}|M:${i}`,level:"track+marca"},{key:`T:${n}`,level:"track"},{key:"GLOBAL",level:"global"}];for(const d of s){const p=(c=t==null?void 0:t.get)==null?void 0:c.call(t,d.key);if(p&&Number(p.count||0)>=a)return{found:!0,key:d.key,level:d.level,count:p.count,priorMs:p.medianMs,priorMadMs:p.madMs||1}}const r=(l=t==null?void 0:t.get)==null?void 0:l.call(t,"GLOBAL");return r?{found:!0,key:"GLOBAL",level:"global-fallback",count:r.count,priorMs:r.medianMs,priorMadMs:r.madMs||1}:{found:!1,key:"",level:"none",count:0,priorMs:0,priorMadMs:1}}function lr(t,e=2.5){const a=(t||[]).filter(ye);if(!a.length)return{avgMs:0,medianMs:0,madMs:0,used:0,total:0,sumW:0,minW:0,maxW:0};if(a.length<3)return{avgMs:a.reduce((p,y)=>p+y,0)/a.length,medianMs:Ee(a),madMs:0,used:a.length,total:a.length,sumW:a.length,minW:1,maxW:1};const n=Ee(a),o=jo(a,n)||1;let i=0,s=0,r=1/0,c=-1/0;for(const d of a){const p=sr(d,n,o,e);i+=p,s+=p*d,p<r&&(r=p),p>c&&(c=p)}return{avgMs:i>0?s/i:n,medianMs:n,madMs:o,used:a.length,total:a.length,sumW:i,minW:Number.isFinite(r)?r:0,maxW:Number.isFinite(c)?c:0}}function dr(t,e,a={}){const{k:n=2.5,priorWeight:o=6}=a,i=lr(t,n),s=Number((e==null?void 0:e.priorMs)||0);if(!(Number.isFinite(s)&&s>0))return{...i,rawRobustMs:i.avgMs,priorMs:0,priorWeight:0,priorLevel:"none",priorCount:0,source:"local-only"};const c=i.used>=12?Math.max(2,o*.45):i.used>=8?Math.max(3,o*.65):i.used>=4?Math.max(4,o*.85):Math.max(6,o*1.25),l=(i.avgMs*(i.sumW||i.used||1)+s*c)/((i.sumW||i.used||1)+c);return{...i,avgMs:l,rawRobustMs:i.avgMs,priorMs:s,priorWeight:c,priorLevel:(e==null?void 0:e.level)||"unknown",priorCount:Number((e==null?void 0:e.count)||0),priorKey:(e==null?void 0:e.key)||"",source:"local+context-prior"}}function Re(t){const e=Math.max(0,Math.floor(t/1e3)),a=Math.floor(e/3600),n=Math.floor(e%3600/60),o=e%60,i=s=>String(s).padStart(2,"0");return`${a}h ${i(n)}m ${i(o)}s`}function _t(t){const e=Number((t==null?void 0:t.tiempo_ms)??0);return Number.isFinite(e)&&e>0?e:0}function he(t){const e=String(t||"").trim().toUpperCase();return e==="FINALIZADO"||e==="FIN"||e==="COMPLETADO"}function ur(t){const e=String(t||"").toUpperCase();return e?e.includes("TE")?"KYC":e.includes("TT")?"VW":"JETOUR":"JETOUR"}function pr(t,e){const a=String(e||"ALL").toUpperCase();if(!a||a==="ALL")return!0;const n=String(t.rol||t.rolTrabajo||"").toUpperCase();if(n==="RAMALERO"||n==="RAMAL")return!0;const i=ur(t.vin);return a===i}function fr(t){const e=String(t||"").toUpperCase();return e==="MOTOR"||e==="TANQUE"||e==="TANQUERO"}function mr(t){var n,o;const e=new Map;for(const i of t){const s=String(i.rol||i.rolTrabajo||"").toUpperCase();if(!fr(s)){const f=`RAW|${Math.random()}`;e.set(f,{_kind:"raw",it:i});continue}const r=String(i.vin||"").trim().toUpperCase();if(!r){const f=`NOVIN|${i.workId||""}|${s}|${Math.random()}`;e.set(f,{_kind:"raw",it:i});continue}const c=e.get(r)||{_kind:"group",vin:r,estado:"SIN_DATO",motor:null,tanque:null,sortTs:0};s==="MOTOR"?c.motor=i:c.tanque=i;const l=String(((n=c.motor)==null?void 0:n.estado)||"").toUpperCase(),d=String(((o=c.tanque)==null?void 0:o.estado)||"").toUpperCase(),p=[l,d].filter(Boolean);p.includes("FINALIZADO")||p.includes("FIN")||p.includes("COMPLETADO")?c.estado="FINALIZADO":p.includes("TRABAJANDO")?c.estado="TRABAJANDO":p.includes("PAUSADO")?c.estado="PAUSADO":c.estado=p[0]||"SIN_DATO";const y=Date.parse(String(i.updated_at||""))||0,b=Date.parse(String(i.fecha_asignacion||i.fecha_inicio||""))||0;c.sortTs=Math.max(c.sortTs,y,b),e.set(r,c)}const a=Array.from(e.values());return a.sort((i,s)=>(s.sortTs||0)-(i.sortTs||0)),a}function vr(t,{stats:e,techName:a,motorCount:n,tanqueCount:o,escapeHtml:i}){if(t)if((e==null?void 0:e.used)>0){const s=String(a).toUpperCase();t.innerHTML=`
      <div class="card" style="
        border:1px solid rgba(255,255,255,.18);
        border-radius:22px;
        padding:18px 18px;
        background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.08));
        box-shadow: 0 10px 24px rgba(0,0,0,.22);
      ">
        <div class="row space-between" style="gap:12px; align-items:flex-start;">
          <div>
            <div class="small" style="opacity:.8; letter-spacing:.5px;">TIEMPO PROMEDIO DE CONVERSIÓN</div>
            <div style="font-weight:1000; font-size:20px; letter-spacing:1px; margin-top:4px;">
              ${i(s)}
            </div>
          </div>

          <div class="pill small" style="opacity:.95;">
            FINALIZADOS: <b>${e.used}</b>
          </div>
        </div>

        <div class="row" style="gap:12px; align-items:center; margin-top:14px;">
          <div style="
            width:44px; height:44px;
            display:flex; align-items:center; justify-content:center;
            border-radius:14px;
            background: rgba(255,255,255,.08);
            border:1px solid rgba(255,255,255,.14);
          ">⏱</div>

          <div>
            <div style="font-weight:1000; font-size:40px; letter-spacing:.8px; line-height:1;">
              ${i(Re(e.avgMs))}
            </div>
            <div class="small" style="opacity:.78; margin-top:6px;">
              Promedio robusto (outliers pesan menos)
            </div>
          </div>
        </div>

        <div class="row" style="gap:10px; margin-top:14px; flex-wrap:wrap;">
          <div class="pill small" style="opacity:.9;">
            MOTOR: <b>${n}</b>
          </div>
          <div class="pill small" style="opacity:.9;">
            TANQUE: <b>${o}</b>
          </div>
        </div>

        <div class="small" style="margin-top:12px; opacity:.75;">
          (Solo se consideran trabajos en estado <b>FINALIZADO</b>)
        </div>
      </div>
    `}else t.innerHTML=`
      <div class="card" style="border:1px solid rgba(255,255,255,.14); border-radius:18px; padding:14px;">
        <div class="small">Sin FINALIZADOS con tiempo válido.</div>
      </div>
    `}function gr(t,{uiList:e,escapeHtml:a,fmtShort_:n}){t&&(t.innerHTML=e.map(o=>o&&o._kind==="group"?br(o,{escapeHtml:a,fmtShort_:n}):yr(o,{escapeHtml:a,fmtShort_:n})).join(""))}function br(t,{escapeHtml:e,fmtShort_:a}){const n=t.vin||"-",o=t.motor,i=t.tanque,s=(o==null?void 0:o.userName)||(o==null?void 0:o.userEmail)||(o==null?void 0:o.userId)||"-",r=(i==null?void 0:i.userName)||(i==null?void 0:i.userEmail)||(i==null?void 0:i.userId)||"-",c=o&&_t(o)?Re(_t(o)):"-",l=i&&_t(i)?Re(_t(i)):"-",d=o?a(o.fecha_inicio||o.fecha_asignacion||""):"",p=o?a(o.updated_at||""):"",y=i?a(i.fecha_inicio||i.fecha_asignacion||""):"",b=i?a(i.updated_at||""):"",f=String((o==null?void 0:o.workId)||(i==null?void 0:i.workId)||"").trim();return`
    <div class="card" style="margin-top:10px;">
      <div style="font-weight:900;">
        VIN: ${e(n)} <span class="small">(MOTOR + TANQUE)</span>
      </div>

      <div class="row space-between" style="margin-top:8px; gap:10px;">
        <div class="small"><b>Estado:</b> ${e(t.estado||"-")}</div>
        <div class="pill small"><b>${e(t.estado||"")}</b></div>
      </div>

      <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.14);">
        <div class="small" style="font-weight:900;">MOTOR: ${e(s)}</div>
        <div class="small" style="margin-top:6px;"><b>Duración:</b> ${e(c)}</div>
        <div class="small" style="margin-top:6px;">
          <b>Inicio:</b> ${e(d)} &nbsp;|&nbsp; <b>Fin:</b> ${e(p)}
        </div>
      </div>

      <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.14);">
        <div class="small" style="font-weight:900;">TANQUE: ${e(r)}</div>
        <div class="small" style="margin-top:6px;"><b>Duración:</b> ${e(l)}</div>
        <div class="small" style="margin-top:6px;">
          <b>Inicio:</b> ${e(y)} &nbsp;|&nbsp; <b>Fin:</b> ${e(b)}
        </div>
      </div>

      ${f?`
            <div class="row" style="margin-top:10px; gap:10px;">
              <button
                type="button"
                class="btn3"
                data-sup-inc="1"
                data-vin="${e(n)}"
                data-cid="${e(f)}"
                data-who="${e("VIN "+n)}"
              >
                📋 Incidencias
              </button>
            </div>
          `:""}
    </div>
  `}function yr(t,{escapeHtml:e,fmtShort_:a}){const n=(t==null?void 0:t.userName)||(t==null?void 0:t.userEmail)||(t==null?void 0:t.userId)||"-",o=String((t==null?void 0:t.rol)||(t==null?void 0:t.rolTrabajo)||"").toUpperCase()||"-",i=o==="RAMALERO"||o==="RAMAL",s=i?`RAMAL: ${(t==null?void 0:t.tipoRamal)||"-"}`:(t==null?void 0:t.vin)||"-",r=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),c=String((t==null?void 0:t.workId)||(t==null?void 0:t.conversionId)||(t==null?void 0:t.conversion_id)||"").trim(),l=_t(t),d=l?Re(l):"-";return`
    <div class="card" style="margin-top:10px;">
      <div style="font-weight:900;">
        ${e(n)} <span class="small">(${e(o)})</span>
      </div>

      <div class="row space-between" style="margin-top:8px; gap:10px;">
        <div class="small"><b>Trabajo:</b> ${e(s)}</div>
        <div class="pill small"><b>${e((t==null?void 0:t.estado)||"")}</b></div>
      </div>

      <div class="small" style="margin-top:6px;">
        <b>Duración:</b> ${e(d)}
      </div>

      <div class="small" style="margin-top:6px;">
        <b>Inicio:</b> ${e(a((t==null?void 0:t.fecha_inicio)||(t==null?void 0:t.fecha_asignacion)||(t==null?void 0:t.created_at)||(t==null?void 0:t.fecha_creacion)))}
        &nbsp;|&nbsp;
        <b>Fin:</b> ${e(a(t==null?void 0:t.updated_at))}
      </div>

      ${!i&&(r||c)?`
            <div class="row" style="margin-top:10px; gap:10px;">
              <button
                type="button"
                class="btn3"
                data-sup-inc="1"
                data-vin="${e(r)}"
                data-cid="${e(c)}"
                data-who="${e(n)}"
              >
                📋 Incidencias
              </button>
            </div>
          `:""}
    </div>
  `}const Ko=Ht("qrReader");async function hr({onDecodedDone:t}){var a;const e=document.getElementById("qrModal");(a=e==null?void 0:e.classList)==null||a.add("show"),await Ir({onDecodedDone:t})}async function tn(){var t,e;(e=(t=document.getElementById("qrModal"))==null?void 0:t.classList)==null||e.remove("show"),await Ko.stop()}async function Ir({onDecodedDone:t}){const e=document.getElementById("qrMsg");try{await Ko.start({mode:"QR",msgEl:e,onDecoded:async a=>{const n=document.getElementById("supVin");n&&(n.value=a),e&&(e.textContent=`VIN detectado: ${a}`),await tn();try{await(t==null?void 0:t(a))}catch{}}})}catch{}}function _r({CORE:t,onApply:e}){var a,n,o;(a=document.getElementById("btnSupQR"))==null||a.addEventListener("click",()=>{t.state.currentModule==="SUPERVISOR"&&hr({onDecodedDone:()=>e==null?void 0:e()}).catch(()=>{})}),(n=document.getElementById("btnCloseQR"))==null||n.addEventListener("click",()=>tn()),(o=document.getElementById("qrModal"))==null||o.addEventListener("click",async i=>{i.target===document.getElementById("qrModal")&&await tn()})}function Cr({CORE:t,escapeHtml:e,onApply:a}){const n={MIN_CHARS:3,DEBOUNCE_MS:750,LIMIT:12};let o=null,i=null,s=[],r=!1,c=-1,l="";function d(){return document.getElementById("supNameSuggest")}function p(){const R=d();R&&(r=!1,c=-1,s=[],R.classList.add("hidden"),R.innerHTML="")}function y(){const R=d();if(R){if(!s.length)return p();R.innerHTML=s.map((x,V)=>{const Y=V===c?"active":"",D=x.name||x.email||x.id||"",B=x.email?x.email:"";return`
        <div class="vsItem ${Y}" data-idx="${V}" role="option" aria-selected="${V===c}">
          <div class="vsVin">${e(D)}</div>
          <div class="vsHint">${e(B)}</div>
        </div>
      `}).join(""),R.classList.remove("hidden"),r=!0}}function b(R){c=Math.max(0,Math.min(R,s.length-1)),y();const x=d(),V=x==null?void 0:x.querySelector(`.vsItem[data-idx="${c}"]`);V&&V.scrollIntoView({block:"nearest"})}async function f(R){var B;try{(B=i==null?void 0:i.abort)==null||B.call(i)}catch{}i=new AbortController;const x=`/api/name-suggest?q=${encodeURIComponent(R)}&limit=${encodeURIComponent(n.LIMIT)}`,Y=await(await fetch(x,{signal:i.signal})).json();return Y!=null&&Y.ok?(Array.isArray(Y.items)?Y.items:[]).map(bt=>typeof bt=="string"?{name:bt}:bt).filter(Boolean):[]}function I(R){const x=document.getElementById("supName");if(!x)return;const V=String((R==null?void 0:R.name)||(R==null?void 0:R.email)||(R==null?void 0:R.id)||"").trim();x.value=V,p(),a==null||a()}function S(){if(t.state.currentModule!=="SUPERVISOR")return;const R=document.getElementById("supName");if(!R)return;const x=String(R.value||"").trim();if(l=x,!x||x.length<n.MIN_CHARS){p();return}clearTimeout(o),o=setTimeout(async()=>{try{const V=await f(x);if(l!==x)return;s=V,c=s.length?0:-1,y()}catch{p()}},n.DEBOUNCE_MS)}function q(R){if(t.state.currentModule==="SUPERVISOR"){if(R.key==="Enter"){R.preventDefault(),p(),a==null||a();return}if(r){if(R.key==="ArrowDown")return R.preventDefault(),b(c+1);if(R.key==="ArrowUp")return R.preventDefault(),b(c-1);if(R.key==="Escape")return R.preventDefault(),p();R.key==="Tab"&&c>=0&&s[c]&&(R.preventDefault(),I(s[c]))}}}const it=document.getElementById("supName"),ft=document.getElementById("supNameSuggest");it==null||it.addEventListener("input",S),it==null||it.addEventListener("keydown",q),ft==null||ft.addEventListener("mousedown",R=>{const x=R.target.closest(".vsItem[data-idx]");if(!x)return;R.preventDefault();const V=Number(x.dataset.idx),Y=s[V];Y&&I(Y)}),document.addEventListener("click",R=>{if(!r)return;const x=document.querySelector(".supNameWrap");x&&x.contains(R.target)||p()})}function en(t){return String(t).padStart(2,"0")}function Ua(t){const e=t.getFullYear(),a=en(t.getMonth()+1),n=en(t.getDate());return`${e}-${a}-${n}`}function Ar(t){const e=t.getFullYear(),a=en(t.getMonth()+1);return`${e}-${a}`}function Sr({onApply:t}){var e,a,n;(e=document.getElementById("btnSupHoy"))==null||e.addEventListener("click",()=>{const i=Ua(new Date),s=document.getElementById("supFrom"),r=document.getElementById("supTo");s&&(s.value=i),r&&(r.value=i);const c=document.getElementById("supMonth");c&&(c.value=""),t==null||t()}),(a=document.getElementById("btnSupAyer"))==null||a.addEventListener("click",()=>{const o=new Date;o.setDate(o.getDate()-1);const i=Ua(o),s=document.getElementById("supFrom"),r=document.getElementById("supTo");s&&(s.value=i),r&&(r.value=i);const c=document.getElementById("supMonth");c&&(c.value=""),t==null||t()}),(n=document.getElementById("btnSupEsteMes"))==null||n.addEventListener("click",()=>{const i=Ar(new Date),s=document.getElementById("supMonth");s&&(s.value=i);const r=document.getElementById("supFrom"),c=document.getElementById("supTo");r&&(r.value=""),c&&(c.value=""),t==null||t()})}let Ct="CONVERSION",Er=null;function Rr(t){Ct=t==="CALIDAD"||t==="RAMAL"?t:"CONVERSION",document.querySelectorAll("[data-suptrack]").forEach(a=>a.classList.toggle("active",a.dataset.suptrack===Ct));const e=document.getElementById("supTrackPill");e&&(e.textContent=Ct==="CONVERSION"?"CONVERSIÓN (MOTOR + TANQUE)":Ct==="CALIDAD"?"CALIDAD":"RAMAL"),It().catch(()=>{})}async function It(){var c,l,d,p,y;const t=String(((c=document.getElementById("supName"))==null?void 0:c.value)||"").trim(),e=String(((l=document.getElementById("supVin"))==null?void 0:l.value)||"").trim().toUpperCase(),a=String(((d=document.getElementById("supFrom"))==null?void 0:d.value)||"").trim(),n=String(((p=document.getElementById("supTo"))==null?void 0:p.value)||"").trim(),o=String(((y=document.getElementById("supMonth"))==null?void 0:y.value)||"").trim(),i=[t,e].filter(Boolean).join(" ").trim(),s=`/api/supervisor/report?name=${encodeURIComponent(t)}&vin=${encodeURIComponent(e)}&q=${encodeURIComponent(i)}&from=${encodeURIComponent(a)}&to=${encodeURIComponent(n)}&month=${encodeURIComponent(o)}&track=${encodeURIComponent(Ct)}`,r=await rn(s,"Cargando reporte...");if(!(r!=null&&r.ok)){const b=document.getElementById("supSummary");b&&(b.textContent=(r==null?void 0:r.error)||"Error cargando reporte.");const f=document.getElementById("supTable");f&&(f.innerHTML="");const I=document.getElementById("supAvgCard");I&&(I.innerHTML="");return}Lr(r)}function Lr(t){var V,Y;const e=document.getElementById("supSummary"),a=document.getElementById("supTable"),n=document.getElementById("supAvgCard"),o=Array.isArray(t.items)?t.items:[],i=String(((V=document.getElementById("supMarca"))==null?void 0:V.value)||"ALL").toUpperCase(),r=o.filter(D=>pr(D,i)),c=String(((Y=document.getElementById("supName"))==null?void 0:Y.value)||"").trim(),d=!!!c&&Ct==="CONVERSION"?mr(r):r,y=o.filter(D=>{const B=String(D.rol||D.rolTrabajo||"").toUpperCase();return B==="RAMALERO"||B==="RAMAL"||!he(D.estado)?!1:_t(D)>0}).map(D=>({...D,_track:Ct})),b=rr(y,_t),f=[],I=new Set;for(const D of r){const B=String(D.rol||D.rolTrabajo||"").toUpperCase();if(B==="RAMALERO"||B==="RAMAL"||!he(D.estado))continue;const pe=_t(D);pe>0&&(f.push(pe),I.add(B))}let S="";I.size===1&&(S=[...I][0]);const q=cr(b,{track:Ct,rol:S,marca:i},4),it=dr(f,q,{priorWeight:6,k:2.1}),ft=c||"Técnico";let R=0,x=0;for(const D of r){if(!he(D.estado))continue;const B=String(D.rol||D.rolTrabajo||"").toUpperCase();B==="TANQUE"||B==="TANQUERO"?x++:(B==="MOTOR"||B==="TECNICO"||B==="CONVERSION")&&R++}if(vr(n,{stats:it,techName:ft,motorCount:R,tanqueCount:x,escapeHtml:T}),!!a){if(!r.length){e&&(e.textContent="Resultados: 0"),n&&(n.innerHTML=""),a.innerHTML='<div class="small">No hay resultados con esos filtros.</div>';return}e&&(e.textContent=`Resultados: ${r.length}`),gr(a,{uiList:d,escapeHtml:T,fmtShort_:wt})}}function Mr(){var t,e,a;document.querySelectorAll("[data-suptrack]").forEach(n=>n.addEventListener("click",()=>Rr(n.dataset.suptrack))),(t=document.getElementById("btnSupApply"))==null||t.addEventListener("click",()=>It().catch(()=>{})),(e=document.getElementById("supMarca"))==null||e.addEventListener("change",()=>{u.state.currentModule==="SUPERVISOR"&&It().catch(()=>{})}),(a=document.getElementById("btnSupClear"))==null||a.addEventListener("click",()=>{["supName","supVin","supFrom","supTo","supMonth"].forEach(n=>{const o=document.getElementById(n);o&&(o.value="")}),It().catch(()=>{})}),Ks({CORE:u,getJSON_user:rn,escapeHtml:T,fmtShort_:wt}),Sr({onApply:()=>It().catch(()=>{})}),_r({CORE:u,onApply:()=>It().catch(()=>{})}),Cr({CORE:u,escapeHtml:T,onApply:()=>It().catch(()=>{})})}function Tr(){u.state.currentModule="SUPERVISOR",window.__nameSuggestWarmed||(window.__nameSuggestWarmed=!0,fetch("/api/name-suggest?q=.&limit=200").catch(()=>{})),It().catch(()=>{})}function Nr(){clearTimeout(Er)}function Or(){u.state.currentModule="ADMIN"}let xr=null;function kr(t){return String(t||"").trim().toUpperCase()}function $a(t){return kr((t==null?void 0:t.vin)||(t==null?void 0:t.chasis_id)||(t==null?void 0:t.chasisId)||(t==null?void 0:t.VIN)||(t==null?void 0:t.CHASIS_ID))}function Pt(t){if(!t)return NaN;const e=Date.parse(t);return Number.isFinite(e)?e:NaN}function Dr(t){return Pt(t==null?void 0:t.fecha_fin)||Pt(t==null?void 0:t.updated_at)||Pt(t==null?void 0:t.fechaFin)||Pt(t==null?void 0:t.fecha_inicio)||Pt(t==null?void 0:t.created_at)||Pt(t==null?void 0:t.fecha_creacion)||NaN}function wr(t){const e=(t==null?void 0:t.fecha_fin)||(t==null?void 0:t.updated_at)||(t==null?void 0:t.fechaFin)||(t==null?void 0:t.fecha_inicio)||(t==null?void 0:t.created_at)||(t==null?void 0:t.fecha_creacion)||"";return e?wt(e):"—"}async function Fa(t){const e=`/api/supervisor/report?name=&vin=&q=&from=&to=&month=&track=${encodeURIComponent(t)}`,a=await rn(e,`Cargando ${t}...`);if(!(a!=null&&a.ok))throw new Error((a==null?void 0:a.error)||`No se pudo cargar ${t}`);return Array.isArray(a.items)?a.items:[]}function Ur(t,e=[]){const a=new Set;for(const i of e){const s=$a(i);s&&a.add(s)}const n=new Map;for(const i of t){const s=$a(i);if(!s||!he(i==null?void 0:i.estado))continue;const r=Dr(i),c=n.get(s);(!c||r>c._sortMs)&&n.set(s,{vin:s,fechaLabel:wr(i),_sortMs:Number.isFinite(r)?r:0})}const o=[];for(const i of n.values())a.has(i.vin)||o.push(i);return o.sort((i,s)=>i._sortMs-s._sortMs),o}function $r(t,e={}){const a=document.getElementById("movSummary"),n=document.getElementById("movTable");if(!n)return;const o=e!=null&&e.warn?`
    <div class="small" style="margin-bottom:10px; color:#ffd166;">
      ${T(e.warn)}
    </div>
  `:"";if(!t.length){a&&(a.textContent="Pendientes para calidad: 0"),n.innerHTML=`
      ${o}
      <div class="small">No hay unidades pendientes por llevar a calidad.</div>
    `;return}a&&(a.textContent=`Pendientes para calidad: ${t.length}`),n.innerHTML=`
    ${o}
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>VIN</th>
            <th>Fecha conversión</th>
          </tr>
        </thead>
        <tbody>
          ${t.map(i=>`
            <tr>
              <td style="font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight:800;">
                ${T(i.vin)}
              </td>
              <td>${T(i.fechaLabel)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `}async function Wo(){const t=document.getElementById("movSummary"),e=document.getElementById("movTable");try{t&&(t.textContent="Cargando pendientes..."),e&&(e.innerHTML="");const a=await Fa("CONVERSION");let n=[],o="";try{n=await Fa("CALIDAD")}catch(s){console.warn("MOVILIZADOR: no se pudo cargar CALIDAD",s),o="No se pudo validar CALIDAD. Se muestran conversiones finalizadas sin excluir registros de calidad."}const i=Ur(a,n);$r(i,{warn:o})}catch(a){t&&(t.textContent=(a==null?void 0:a.message)||"Error cargando vista MOVILIZADOR."),e&&(e.innerHTML="")}}function Fr(){var t;(t=document.getElementById("btnMovRefresh"))==null||t.addEventListener("click",()=>{Wo().catch(()=>{})})}function Br(){u.state.currentModule="MOVILIZADOR",Wo().catch(()=>{})}function Go(){clearTimeout(xr)}const Ba=document.getElementById("appRoot");Ba&&(Ba.innerHTML=Ei());async function Yo(t){if(!t)return ae("Pon tu email.");try{let e;if(Ya()&&(await W(async()=>{e=await Qi(t)},"Iniciando sesión..."),!e))return ae("Usuario no encontrado en Supabase.");u.state.currentProfile=e,ki(t),Oi(),Ni(),Ti(),u.state.rolLock=xi(u.state.currentProfile),Le();const a=Ka(u.state.currentProfile);Li(),a.length>1?(Vt(),Ha(a,n=>nn(n)),u.state.currentModule=null):nn(a[0])}catch(e){console.error("Error en login:",e),ae((e==null?void 0:e.message)||"Error al iniciar sesión.")}}function nn(t){Qt(),Nt(t),u.state.currentModule=t,Vt();const e=document.getElementById(`view${t}`);e&&(e.style.display="block");const a=g("viewHub");a&&(a.style.display="none"),Le()}Nt.register("TECNICO",()=>Vo("TECNICO"),()=>Se("TECNICO"));Nt.register("CALIDAD",()=>Vo("CALIDAD"),()=>Se("CALIDAD"));Nt.register("RAMALERO",()=>ir(),()=>Qo());Nt.register("SUPERVISOR",()=>Tr(),()=>Nr());Nt.register("ADMIN",()=>Or(),()=>void 0);Nt.register("MOVILIZADOR",()=>Br(),()=>Go());Xs();or();Mr();Fr();so();var qa;(qa=g("btnTheme"))==null||qa.addEventListener("click",Fi);var Va;(Va=g("btnRegistroFallas"))==null||Va.addEventListener("click",()=>{var e,a,n,o,i,s;Vt(),g("viewHub")&&(g("viewHub").style.display="none");const t=((a=(e=g("vin"))==null?void 0:e.value)==null?void 0:a.trim())||((o=(n=g("vinQ"))==null?void 0:n.value)==null?void 0:o.trim())||((s=(i=g("supVin"))==null?void 0:i.value)==null?void 0:s.trim())||"";cn({vin:t,screen:"menu"})});var Qa;(Qa=g("btnGoHome"))==null||Qa.addEventListener("click",()=>{const t=Ka(u.state.currentProfile);Qt(),Vt(),Ha(t,e=>nn(e)),u.state.currentModule=null});var ja;(ja=g("btnMe"))==null||ja.addEventListener("click",async()=>{const t=oe();await Yo(t)});var Pa;(Pa=g("btnLogout"))==null||Pa.addEventListener("click",()=>{var t,e,a;wi(),g("email").value="",u.state.currentProfile=null,u.state.currentModule=null,Se("TECNICO"),Se("CALIDAD"),Qo(),Go(),Vt(),g("viewHub").style.display="none",(t=g("btnGoHome"))==null||t.classList.add("hidden"),(e=document.getElementById("debugWrap"))==null||e.classList.add("debug-hidden"),(a=document.getElementById("viewUploader"))!=null&&a.style&&(document.getElementById("viewUploader").style.display="none"),ae("Sesión cerrada.")});window.addEventListener("load",async()=>{Ui();const t=Di();if(!t)return ae("");g("email").value=t,await Yo(t)});window.getRealtimeStatus=Vi;
