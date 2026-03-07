(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))n(o);new MutationObserver(o=>{for(const i of o)if(i.type==="childList")for(const s of i.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&n(s)}).observe(document,{childList:!0,subtree:!0});function a(o){const i={};return o.integrity&&(i.integrity=o.integrity),o.referrerPolicy&&(i.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?i.credentials="include":o.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(o){if(o.ep)return;o.ep=!0;const i=a(o);fetch(o.href,i)}})();function ti(){return`
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
  `}function ei(){return`
    <!-- HUB -->
    <div id="viewHub" class="card" style="display:none;">
      <h3>Selecciona un módulo</h3>
      <div id="hubButtons" class="row menu"></div>
      <div class="small">Si tienes varios permisos, puedes cambiar de módulo cuando quieras.</div>
    </div>
  `}function ni(){return`
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
  `}function ai(){return`
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
  `}function oi(){return`
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
  `}function ii(){return`
    <!-- ADMIN -->
    <div id="viewADMIN" class="card" style="display:none;">
      <h3>Admin</h3>
      <div class="small">Aquí irá la vista Admin.</div>
    </div>
  `}function si(){return`
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
  `}function ri(){return`
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
  `}function ci(){return`
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
  `}function li(){return`
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
  `}function di(){return`
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
  `}function ui(){return`
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
  `}function pi(){return`
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
  `}function fi(){return`
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
              <input id="incFotoCam" type="file" accept="image/*" capture="environment" style="display:none;" />
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
  `}function mi(){return`
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
  `}function vi(){return`
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
  `}function gi(){return`
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
  `}function bi(){return`
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
  `}function yi(){return`
    ${ti()}

    <!-- =========================
         APP
         ========================= -->
    <div id="viewApp" style="display:none;">
      ${di()}

      ${ei()}
      ${ni()}
      ${ai()}
      ${oi()}

      <!-- MOVILIZADOR (stub como lo tenías) -->
      ${ri()}

      ${ci()}
      ${ii()}
      ${si()}
    </div>

    ${ui()}
    ${mi()}
    ${pi()}
    ${fi()}
    ${vi()}
    ${gi()}
    ${bi()}
    ${li()}
  `}const wa=["TECNICO","RAMALERO","CALIDAD","MOVILIZADOR","SUPERVISOR","ADMIN"],u={state:{rolLock:null,currentProfile:null,currentModule:null,uiLocked:!1,storeByModule:{TECNICO:{itemsByKey:new Map,activeKeys:[],finalKeys:[],lastSyncSince:null,lastSyncRev:null,lastSyncAtMs:0,showFinalizados:!1},CALIDAD:{itemsByKey:new Map,activeKeys:[],finalKeys:[],lastSyncSince:null,lastSyncRev:null,lastSyncAtMs:0,showFinalizados:!1},RAMALERO:{itemsByKey:new Map,activeKeys:[],finalKeys:[],lastSyncSince:null,lastSyncRev:null,lastSyncAtMs:0,showFinalizados:!1}}}};function F(){const t=u.state.currentModule;return t==="CALIDAD"?u.state.storeByModule.CALIDAD:t==="RAMALERO"?u.state.storeByModule.RAMALERO:u.state.storeByModule.TECNICO}function Ze(){const t=u.state.currentModule;return t==="TECNICO"||t==="CALIDAD"||t==="RAMALERO"}const g=t=>document.getElementById(t);function hi(){const t=u.state.currentModule;return t==="CALIDAD"?"Q":t==="RAMALERO"?"R":""}function U(t){const e=hi();return g(t+e)||g(t)}function pe(t=""){g("viewLogin").style.display="block",g("viewApp").style.display="none",g("loginMsg").textContent=t}function Ii(){g("viewLogin").style.display="none",g("viewApp").style.display="block",g("loginMsg").textContent=""}function Bt(){const t=g("viewHub");t&&(t.style.display="none"),wa.forEach(e=>{const a=document.getElementById(`view${e}`);a&&(a.style.display="none")})}function qa(t,e){Bt();const a=g("viewHub");a&&(a.style.display="block");const n=g("hubButtons");n&&(n.innerHTML="",t.forEach(o=>{const i=document.createElement("button");i.textContent=o,i.addEventListener("click",()=>e==null?void 0:e(o)),n.appendChild(i)}))}function Ci(){var e;const t=(e=u.state.currentProfile)==null?void 0:e.modulos;return Array.isArray(t)&&t.filter(Boolean).length>1}function Ai(){const t=g("btnGoHome");if(!t)return;const e=Ci();t.classList.toggle("hidden",!e)}function _i(){const t=u.state.currentProfile||{},e=String(t.rol||"").toUpperCase(),a=String(t.especialidad||"").toUpperCase(),n=Array.isArray(t.modulos)?t.modulos.join(","):"(default)",o=String(t.nombre||"").trim(),i=g("userHello"),s=g("userPill");i&&(i.textContent=o?`HOLA: ${o}`:"HOLA:");const r=e==="TECNICO"?` | ESP: ${a||"-"}`:"";s&&(s.textContent=`ROL: ${e}${r} | MOD: ${n}`)}function Si(){var a;const t=document.getElementById("debugWrap");if(!t)return;String(((a=u.state.currentProfile)==null?void 0:a.rol)||"").toUpperCase()==="ADMIN"?t.classList.remove("debug-hidden"):t.classList.add("debug-hidden")}function K(t){const e=g("out");e&&(e.textContent=JSON.stringify(t,null,2))}function dt(t){const e=U("estadoBox");e&&(e.textContent=t||"")}const Xe="glp_email";function Va(t){const e=String((t==null?void 0:t.rol)||"").toUpperCase();if(Array.isArray(t==null?void 0:t.modulos)&&t.modulos.length){const a=t.modulos.map(n=>String(n||"").trim().toUpperCase()).filter(Boolean);return a.includes("ALL")?[...wa]:[...new Set(a)]}return e==="TECNICO"?["TECNICO"]:e==="RAMALERO"?["RAMALERO"]:e==="CALIDAD"?["CALIDAD"]:e==="MOVILIZADOR"?["MOVILIZADOR"]:e==="SUPERVISOR"?["SUPERVISOR"]:e==="ADMIN"?["ADMIN"]:["TECNICO"]}function Ri(t){if(String((t==null?void 0:t.rol)||"").toUpperCase()!=="TECNICO")return null;const a=String((t==null?void 0:t.especialidad)||"").toUpperCase();return a==="MOTOR"?"MOTOR":a==="TANQUE"||a==="TANQUERO"?"TANQUE":null}function Ie(){if(u.state.currentModule!=="TECNICO")return;const t=g("rol");t&&(u.state.rolLock?(t.value=u.state.rolLock,t.disabled=!0):t.disabled=!1)}function Ei(t){localStorage.setItem(Xe,t)}function Li(){return localStorage.getItem(Xe)||""}function Mi(){localStorage.removeItem(Xe)}function Zt(){var t;return String(((t=g("email"))==null?void 0:t.value)||"").trim().toLowerCase()}function Ce(){var t;return String(((t=U("vin"))==null?void 0:t.value)||"").trim().toUpperCase()}function Qa(){if(u.state.rolLock)return u.state.rolLock;const t=g("rol");return t?String(t.value||"MOTOR").toUpperCase():"MOTOR"}function Kt(){return u.state.currentModule==="CALIDAD"?"CALIDAD":u.state.currentModule==="RAMALERO"?"RAMALERO":String(Qa()||"").toUpperCase()}function St(){const t=Zt();if(!t)throw new Error("NO_EMAIL");return t}const Pa="glp_theme";function Ti(){const t=Ni();if(t)return Fe(t);const e=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches;Fe(e?"day":"night")}function Ni(){try{return localStorage.getItem(Pa)||""}catch{return""}}function Oi(){const t=document.documentElement.dataset.theme||"night";Fe(t==="day"?"night":"day")}function Fe(t){const e=t==="day"?"day":"night";document.documentElement.dataset.theme=e;try{localStorage.setItem(Pa,e)}catch{}}function sa(t,e="Procesando..."){var d,f;u.state.uiLocked=!!t;const a=g("loadingOverlay");if(a){a.classList.toggle("hidden",!u.state.uiLocked);const b=document.getElementById("overlayMsg");b&&(b.textContent=String(e||"Procesando").replace(/\.*\s*$/,""))}u.state.uiLocked?dt(e):dt("");const n=g("email");if(n&&(n.disabled=u.state.uiLocked),u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD"){const b=U("vin");b&&(b.disabled=u.state.uiLocked)}const o=g("rol");o&&(o.disabled=u.state.uiLocked||!!u.state.rolLock||u.state.currentModule!=="TECNICO");const i=g("btnMe");i&&(i.disabled=u.state.uiLocked);const s=g("btnLogout");s&&(s.disabled=u.state.uiLocked);const r=["btnEstado","btnActivas","btnFinalizados","btnQR","btnSupQR"];for(const b of r){const y=U(b);y&&(y.disabled=u.state.uiLocked)}const c=U("activasBox"),l=U("finalizadosBox");(d=c==null?void 0:c.querySelectorAll("button[data-act]"))==null||d.forEach(b=>b.disabled=u.state.uiLocked),(f=l==null?void 0:l.querySelectorAll("button[data-act]"))==null||f.forEach(b=>b.disabled=u.state.uiLocked)}async function J(t,e){if(!u.state.uiLocked){sa(!0,e);try{return await t()}finally{sa(!1)}}}async function vt(t){return await(await fetch(t)).json()}async function tn(t,e){return await(await fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)})).json()}async function Ae(t,e="Cargando..."){return await J(async()=>await vt(t),e)}async function _e(t,e,a="Procesando..."){return await J(async()=>await tn(t,e),a)}const ja="glp_vin_cache_v1",za="glp_ramal_cache_v1";function Ha(){try{return JSON.parse(localStorage.getItem(ja)||"{}")}catch{return{}}}function xi(t){try{localStorage.setItem(ja,JSON.stringify(t))}catch{}}function Ka(t,e){const a=String(t||"").trim(),n=String(e||"").toUpperCase().trim();return a&&n?`${a}|${n}`:""}function ki(t,e,a){var l;const n=String(t||"").trim(),o=String(a||"").trim().toUpperCase();if(!n||!o)return;const i=String(e||"").toUpperCase().trim(),s=Ka(n,i);if(!s)return;const r=Ha();r[s]={vin:o,ts:Date.now()};const c=336*3600*1e3;for(const d of Object.keys(r))(!((l=r[d])!=null&&l.ts)||Date.now()-r[d].ts>c)&&delete r[d];xi(r)}function Di(t,e){var o;const a=Ka(t,e);if(!a)return"";const n=Ha();return String(((o=n[a])==null?void 0:o.vin)||"").toUpperCase()}function Wa(){try{return JSON.parse(localStorage.getItem(za)||"{}")}catch{return{}}}function Ui(t){try{localStorage.setItem(za,JSON.stringify(t))}catch{}}function Ga(t){const e=String(t||"").trim();return e?`RAMAL|${e}`:""}function $i(t,e){var s;const a=String(t||"").trim(),n=String(e||"").trim();if(!a||!n)return;const o=Wa();o[Ga(a)]={tipoRamal:n,ts:Date.now()};const i=336*3600*1e3;for(const r of Object.keys(o))(!((s=o[r])!=null&&s.ts)||Date.now()-o[r].ts>i)&&delete o[r];Ui(o)}function Fi(t){var n;const e=String(t||"").trim();if(!e)return"";const a=Wa();return String(((n=a[Ga(e)])==null?void 0:n.tipoRamal)||"")}function T(t){return String(t??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function Bi(t){return window.CSS&&typeof CSS.escape=="function"?CSS.escape(String(t)):String(t).replace(/["\\]/g,"\\$&")}function xt(t){if(!t)return"-";const e=new Date(t);return isNaN(e.getTime())?"-":new Intl.DateTimeFormat("es-PE",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}).format(e)}function Ya(t){if(!t)return"-";const e=new Date(t);return isNaN(e.getTime())?"-":new Intl.DateTimeFormat("es-PE",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(e)}function kt(t){t=Math.max(0,Number(t)||0);const e=Math.floor(t/1e3),a=String(Math.floor(e/3600)).padStart(2,"0"),n=String(Math.floor(e%3600/60)).padStart(2,"0"),o=String(e%60).padStart(2,"0");return`${a}:${n}:${o}`}function Se(t){const e=String((t==null?void 0:t.conversionId)||"").trim(),a=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();return`${e}|${a}`}const Ja=new Map;let Gt=null;function wi(t,e,a){Ja.set(String(t||"").toUpperCase(),{enter:e,exit:a})}function Lt(t){const e=String(t||"").toUpperCase();if(Gt!=null&&Gt.exit)try{Gt.exit()}catch{}const a=Ja.get(e);if(a!=null&&a.enter)try{a.enter()}catch{}Gt=a||null}Lt.register=wi;const Dt="/api/uploader/proxy";function ct(){const t=new Date,e=t.getFullYear(),a=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${e}-${a}-${n}`}function Yt(t){const e=["B","KB","MB","GB"];let a=0,n=Number(t||0);for(;n>=1024&&a<e.length-1;)n/=1024,a++;return`${n.toFixed(a===0?0:1)} ${e[a]}`}async function ne(t,e=Dt){const n=await fetch(e||Dt,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}),o=await n.text().catch(()=>"");if(!n.ok)throw new Error(`HTTP ${n.status} ${n.statusText} ${o||""}`.trim());try{return JSON.parse(o)}catch{throw new Error(`Respuesta no-JSON desde backend: ${o.slice(0,300)}`)}}async function Re(t){if(!t)return"";if(!/^image\//i.test(t.type||""))return await new Promise((a,n)=>{const o=new FileReader;o.onload=()=>a(String(o.result).split(",")[1]||""),o.onerror=n,o.readAsDataURL(t)});const e=URL.createObjectURL(t);try{const a=await new Promise((d,f)=>{const b=new Image;b.onload=()=>d(b),b.onerror=f,b.src=e}),n=1280,o=.75;let i=a.naturalWidth||a.width,s=a.naturalHeight||a.height;if(i>n){const d=n/i;i=Math.round(i*d),s=Math.round(s*d)}const r=document.createElement("canvas");return r.width=i,r.height=s,r.getContext("2d").drawImage(a,0,0,i,s),r.toDataURL("image/jpeg",o).split(",")[1]||""}finally{URL.revokeObjectURL(e)}}async function qi({vin:t,dateStr:e,apsUrl:a=Dt}){return ne({action:"getStatus",vin:t,dateStr:e},a)}async function Vi({vin:t,dateStr:e,slot:a,file:n,apsUrl:o=Dt}){const i=await Re(n);return ne({action:"uploadOne",vin:t,dateStr:e,slot:a,mimeType:"image/jpeg",b64:i},o)}async function Qi({vin:t,dateStr:e,note:a,files:n=[],onProgress:o,apsUrl:i=Dt}){const s=[];for(let r=0;r<n.length;r++){typeof o=="function"&&o({phase:"prepare",index:r+1,total:n.length});const c=await Re(n[r]);s.push({slot:"falla",mimeType:"image/jpeg",b64:c})}return typeof o=="function"&&o({phase:"upload",total:s.length}),ne({action:"uploadFalla",vin:t,dateStr:e,note:a,files:s},i)}async function Pi({vin:t,dateStr:e,items:a=[],onProgress:n,apsUrl:o=Dt}){const i=[];for(let s=0;s<a.length;s++){const r=a[s];if(!(r!=null&&r.file)||!(r!=null&&r.slot))continue;typeof n=="function"&&n({phase:"prepare",slot:r.slot,index:s+1,total:a.length});const c=await Re(r.file);i.push({slot:r.slot,mimeType:"image/jpeg",b64:c})}return typeof n=="function"&&n({phase:"upload",total:i.length}),ne({action:"uploadCalidad",vin:t,dateStr:e,files:i},o)}async function ji({tipo:t,vin:e,dateStr:a,tecnico:n,checklist:o,file:i,onProgress:s,apsUrl:r=Dt}){typeof s=="function"&&s({phase:"prepare"});const c=await Re(i);return typeof s=="function"&&s({phase:"upload"}),ne({action:"uploadConformidad",tipo:t,vin:e,dateStr:a,tecnico:n,checklist:o,file:{mimeType:"image/jpeg",b64:c}},r)}function zi(t){return String(t||"").replace(/\s+/g,"").trim().toUpperCase()}function Hi(t){const e=t==="BAR";return{fps:e?8:10,qrbox:e?{width:160,height:320}:{width:250,height:250},formatsToSupport:e?[Html5QrcodeSupportedFormats.CODE_128,Html5QrcodeSupportedFormats.CODE_39,Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.UPC_E,Html5QrcodeSupportedFormats.ITF,Html5QrcodeSupportedFormats.CODABAR]:[Html5QrcodeSupportedFormats.QR_CODE],experimentalFeatures:{useBarCodeDetectorIfSupported:!0}}}async function Ki(t,e,a){var s;try{await t.start({facingMode:{exact:"environment"}},e,a,()=>{});return}catch{}try{await t.start({facingMode:"environment"},e,a,()=>{});return}catch{}const n=await Html5Qrcode.getCameras();let o=((s=n==null?void 0:n[0])==null?void 0:s.id)||null;const i=n==null?void 0:n.find(r=>/back|rear|environment/i.test(r.label||""));i!=null&&i.id&&(o=i.id),await t.start(o??{facingMode:"environment"},e,a,()=>{})}async function Wi(t){try{t&&t.isScanning&&await t.stop()}catch{}}function Pt(t){let e=null;function a(){if(!window.Html5Qrcode)throw new Error("No se pudo cargar la librería Html5Qrcode.");return e||(e=new Html5Qrcode(t)),e}async function n({mode:r="QR",onDecoded:c,config:l,msgEl:d}={}){try{const f=a(),b=l||Hi(r);await Ki(f,b,async m=>{const C=zi(m);C&&await(c==null?void 0:c(C))})}catch(f){throw d&&(d.textContent="No se pudo abrir la cámara. Revisa permisos (HTTPS o localhost)."),f}}async function o(){await Wi(e)}function i(){return e}function s(){return!!(e&&e.isScanning)}return{start:n,stop:o,getInstance:i,isActive:s}}function Za(t,e={}){const a=t.querySelector(".uploader-shell")||t,n=p=>a.querySelector(`#up_${p}`);let o=[null,null,null,null],i=[],s=[null,null,null,null],r=null;const c=Pt("up_qrReader_params"),l=Pt("up_qrReader_falla"),d=Pt("up_qrReader_qc"),f=Pt("up_qrReader_conf"),b={vin:"Foto del VIN",comp_1:"Compresión",comp_2:"Compresión",comp_3:"Compresión",comp_4:"Compresión",corr_pre:"Corriente antes",corr_post:"Corriente después",voltaje:"Voltaje",scan_carro:"Scan del carro"},y={menu:n("screenMenu"),params:n("screenParams"),falla:n("screenFalla"),calidad:n("screenCalidad"),conformidad:n("screenConformidad")};function m(p,v){const h=n(p);h&&(h.textContent=String(v||""))}function C(p){try{return new URLSearchParams(window.location.search).get(p)||""}catch{return""}}function L(p){Object.values(y).forEach(h=>h&&h.classList.remove("active"));const v=y[p];v&&v.classList.add("active"),ke().catch(()=>{})}function j(){if(typeof e.onBackControl=="function"){e.onBackControl();return}L("menu")}function at(p){const v=n("imgModal"),h=n("imgModalImg");!v||!h||!p||(h.src=p,v.classList.add("open"),v.setAttribute("aria-hidden","false"))}function ut(){const p=n("imgModal"),v=n("imgModalImg");!p||!v||(p.classList.remove("open"),v.src="",p.setAttribute("aria-hidden","true"))}function R(p,v){const h=n(`${p}_previewBox`),A=n(`${p}_meta`);if(!h||!A)return;if(!v){h.innerHTML='<span class="small">Sin foto</span>',A.textContent="Ningún archivo seleccionado.";return}A.textContent=`${v.name||"(foto)"} • ${Yt(v.size||0)}`;const _=URL.createObjectURL(v);h.innerHTML=`<img alt="preview" src="${_}">`,setTimeout(()=>URL.revokeObjectURL(_),15e3)}function x(p,v){const h=n(`${p}_previewBox`),A=n(`${p}_meta`);if(!h||!A||!v)return;const _=v.thumbUrl||"",E=v.imgUrl||"";A.textContent="📡 Ya existe en Drive (preview).";const M=document.createElement("img");M.alt="drive preview",M.loading="lazy",M.referrerPolicy="no-referrer",M.style.width="100%",M.style.height="100%",M.style.objectFit="cover",M.style.display="block",M.src=_||E,M.onerror=()=>{E&&M.src!==E?M.src=E:h.innerHTML='<span class="small">No se pudo cargar preview</span>'},h.innerHTML="",h.appendChild(M)}function q(p,v){const h=n(`comp_p${p}`);if(!h||!v)return;const A=v.thumbUrl||"",_=v.imgUrl||"",E=document.createElement("img");E.alt="drive preview",E.loading="lazy",E.referrerPolicy="no-referrer",E.style.width="100%",E.style.height="100%",E.style.objectFit="cover",E.style.display="block",E.src=A||_,E.onerror=()=>{_&&E.src!==_?E.src=_:h.innerHTML=`<span class="small">${p}</span>`},h.innerHTML="",h.appendChild(E)}function W(p){let v="";v+=`VIN: ${p.vin||"-"}
`,v+=`Fecha: ${p.dateStr||"-"}
`,v+=`Carpeta: ${p.monthFolderName||"-"} / ${p.carFolderName||"-"} / REGISTRO

`;const A=["comp_1","comp_2","comp_3","comp_4"].filter(nt=>p.status&&p.status[nt]).length,_=4-A;v+=`${A===4?"✅":"❌"} Compresión (${A}/4)
`,_>0&&(v+=`   Faltan: ${_} foto(s)
`);const E=["vin","corr_pre","corr_post","voltaje","scan_carro"],M=[];for(const nt of E){const H=p.status&&p.status[nt],rt=p.previews&&p.previews[nt];v+=`${H?"✅":"❌"} ${b[nt]}`,rt&&rt.url&&(v+=`  (ver: ${rt.url})`),v+=`
`,H||M.push(b[nt])}const N=_+M.length;v+=`
Faltantes (${N}/9):
- ${N?[`Compresión (${A}/4)`,...M].join(`
- `):"Ninguno 🎉"}`,m("out",v)}async function D(){var h,A;const p=(((h=n("vinText"))==null?void 0:h.value)||"").trim(),v=((A=n("dateStr"))==null?void 0:A.value)||ct();if(!p){m("out","❌ Falta VIN (texto).");return}try{const _=await qi({vin:p,dateStr:v,apsUrl:e.apsUrl});if(!_.ok){m("out","❌ getStatus: "+(_.error||"Error"));return}W(_),_.previews&&(["vin","corr_pre","corr_post","voltaje","scan_carro"].forEach(E=>{const M=_.previews[E];M&&x(E,M)}),["comp_1","comp_2","comp_3","comp_4"].forEach((E,M)=>{const N=_.previews[E];N&&q(M+1,N)}))}catch(_){m("out",`❌ Error getStatus: ${_}`)}}async function w(p,v,h="out",A="",_=""){var N,nt;const E=String(A||((N=n("vinText"))==null?void 0:N.value)||"").trim(),M=String(_||((nt=n("dateStr"))==null?void 0:nt.value)||ct());if(!E)return m(h,"❌ Falta VIN."),{ok:!1,error:"Falta VIN"};try{m(h,`Preparando ${p}...
`);const H=await Vi({vin:E,dateStr:M,slot:p,file:v,apsUrl:e.apsUrl});if(!H.ok)return m(h,`❌ uploadOne(${p}): ${H.error}`),H;if(H.preview)if(p.startsWith("comp_")){const rt=Number(p.split("_")[1]||"0");rt>=1&&rt<=4&&q(rt,H.preview)}else x(p,H.preview);return m(h,`✅ Guardado: ${p}
`),H}catch(H){return m(h,`❌ Error ${p}: ${H}`),{ok:!1,error:String(H)}}}function gt(){o=[null,null,null,null],["comp_p1","comp_p2","comp_p3","comp_p4"].forEach((h,A)=>{const _=n(h);_&&(_.innerHTML=`<span class="small">${A+1}</span>`)}),m("comp_meta","Ningún archivo seleccionado.");const p=n("comp_cam"),v=n("comp_file");p&&(p.value=""),v&&(v.value="")}function ie(){["comp_p1","comp_p2","comp_p3","comp_p4"].forEach((A,_)=>{const E=n(A),M=o[_];if(!E)return;if(!M){E.innerHTML=`<span class="small">${_+1}</span>`;return}const N=URL.createObjectURL(M);E.innerHTML=`<img alt="preview" src="${N}">`,setTimeout(()=>URL.revokeObjectURL(N),15e3)});const v=o.filter(Boolean),h=v.reduce((A,_)=>A+(_.size||0),0);m("comp_meta",v.length?`${v.length}/4 seleccionadas • ${Yt(h)}`:"Ningún archivo seleccionado.")}async function bn(p){if(!p)return;let v=o.findIndex(A=>!A);v===-1&&(v=3),o[v]=p,ie();const h=`comp_${v+1}`;await w(h,p,"out");try{await D()}catch{}}async function jo(p){const v=(p==null?void 0:p[0])||null;if(!v)return;await bn(v);const h=n("comp_cam");h&&(h.value="")}async function zo(p){const v=Array.from(p||[]);if(!v.length)return;const h=v.slice(-4);for(const _ of h)await bn(_);const A=n("comp_file");A&&(A.value="")}function Wt(){const p=n("fallaGrid");if(!p)return;p.innerHTML="",i.forEach((h,A)=>{const _=URL.createObjectURL(h),E=document.createElement("div");E.style.position="relative";const M=document.createElement("div");M.className="thumb",M.innerHTML=`<img alt="falla" src="${_}">`,E.appendChild(M);const N=document.createElement("button");N.type="button",N.textContent="✖",N.className="btn3",N.style.position="absolute",N.style.top="6px",N.style.right="6px",N.style.padding="4px 8px",N.style.borderRadius="10px",N.onclick=()=>{i.splice(A,1),Wt()},E.appendChild(N),p.appendChild(E),setTimeout(()=>URL.revokeObjectURL(_),15e3)});const v=i.reduce((h,A)=>h+(A.size||0),0);m("fallaFotosMeta",`${i.length} archivo(s) • ${Yt(v)}`)}function yn(p){const v=Array.from(p||[]);v.length&&(i.push(...v),Wt())}function xe(){s=[null,null,null,null],["qc_p1","qc_p2","qc_p3","qc_p4"].forEach((h,A)=>{const _=n(h);_&&(_.innerHTML=`<span class="small">${A+1}</span>`)}),m("qc_meta","0/4 seleccionadas.");const p=n("qc_cam"),v=n("qc_file");p&&(p.value=""),v&&(v.value="")}function Ho(){["qc_p1","qc_p2","qc_p3","qc_p4"].forEach((A,_)=>{const E=n(A),M=s[_];if(!E)return;if(!M){E.innerHTML=`<span class="small">${_+1}</span>`;return}const N=URL.createObjectURL(M);E.innerHTML=`<img alt="qc" src="${N}">`,setTimeout(()=>URL.revokeObjectURL(N),15e3)});const v=s.filter(Boolean),h=v.reduce((A,_)=>A+(_.size||0),0);m("qc_meta",`${v.length}/4 seleccionadas • ${Yt(h)} (mín 3)`)}async function hn(p){var M,N;if(!p)return;s[0]=s[1],s[1]=s[2],s[2]=s[3],s[3]=p,Ho();const A=`calidad_${s.filter(Boolean).length}`,_=(((M=n("qcVin"))==null?void 0:M.value)||"").trim(),E=((N=n("qcDate"))==null?void 0:N.value)||ct();await w(A,p,"outQc",_,E)}async function Ko(p){const v=(p==null?void 0:p[0])||null;if(!v)return;await hn(v);const h=n("qc_cam");h&&(h.value="")}async function Wo(p){const v=Array.from(p||[]);if(!v.length)return;const h=v.slice(-4);for(const _ of h)await hn(_);const A=n("qc_file");A&&(A.value="")}function qt(){const p=n("conf_previewBox"),v=n("conf_meta");if(!p||!v)return;if(!r){p.innerHTML='<span class="small">Sin foto</span>',v.textContent="Ningún archivo seleccionado.";return}v.textContent=`${r.name||"(foto)"} • ${Yt(r.size||0)}`;const h=URL.createObjectURL(r);p.innerHTML=`<img alt="equipo" src="${h}">`,setTimeout(()=>URL.revokeObjectURL(h),15e3)}function In(p){var h,A;n("confTipo")&&(n("confTipo").value=p),n("confTitle")&&(n("confTitle").textContent=`Conformidad equipo (${p})`);const v=(((h=n("vinText"))==null?void 0:h.value)||"").trim();v&&n("confVin")&&(n("confVin").value=v),n("confDate")&&(n("confDate").value=((A=n("dateStr"))==null?void 0:A.value)||ct()),n("chk1")&&(n("chk1").checked=!1),n("chk2")&&(n("chk2").checked=!1),n("chk3")&&(n("chk3").checked=!1),r=null,qt(),L("conformidad")}const Cn={params:{scanner:c,box:"qrBox_params",stop:"btnStop_params",msg:"scanMsg_params",mode:"scanMode_params",setVin:p=>{n("vinText")&&(n("vinText").value=p),D().catch(()=>{})}},falla:{scanner:l,box:"qrBox_falla",stop:"btnStop_falla",msg:"scanMsg_falla",mode:"scanMode_falla",setVin:p=>{n("fallaVin")&&(n("fallaVin").value=p)}},qc:{scanner:d,box:"qrBox_qc",stop:"btnStop_qc",msg:"scanMsg_qc",mode:"scanMode_qc",setVin:p=>{n("qcVin")&&(n("qcVin").value=p)}},conf:{scanner:f,box:"qrBox_conf",stop:"btnStop_conf",msg:"scanMsg_conf",mode:"scanMode_conf",setVin:p=>{n("confVin")&&(n("confVin").value=p)}}};async function st(p){const v=Cn[p];if(!v)return;await v.scanner.stop();const h=n(v.box),A=n(v.stop),_=n(v.mode);h&&(h.style.display="none"),A&&(A.style.display="none"),_&&(_.textContent="")}async function ke(){await st("params"),await st("falla"),await st("qc"),await st("conf")}async function bt(p,v){await st(p);const h=Cn[p];if(!h)return;const A=n(h.box),_=n(h.stop),E=n(h.msg),M=n(h.mode);A&&(A.style.display="block"),_&&(_.style.display="inline-block"),E&&(E.textContent=""),M&&(M.textContent=v==="QR"?"Modo: SOLO QR":"Modo: SOLO BARRAS (CODE_128 y otros)");try{await h.scanner.start({mode:v,msgEl:n(h.msg),onDecoded:N=>{h.setVin(N),n(h.msg)&&(n(h.msg).textContent=`Detectado (${v==="QR"?"QR":"BARRAS"}): ${N}`),st(p).catch(()=>{})}})}catch(N){n(h.msg)&&(n(h.msg).textContent=`Error cámara (${v}): ${N}`)}}function Go(){const p=(C("vin")||C("VIN")||"").trim();p&&(n("vinText")&&(n("vinText").value=p),n("fallaVin")&&(n("fallaVin").value=p),n("qcVin")&&(n("qcVin").value=p),n("confVin")&&(n("confVin").value=p));const v=(C("date")||C("fecha")||"").trim();v&&(n("dateStr")&&(n("dateStr").value=v),n("fallaDate")&&(n("fallaDate").value=v),n("qcDate")&&(n("qcDate").value=v),n("confDate")&&(n("confDate").value=v));const h=(C("pantalla")||C("screen")||"").toLowerCase();h==="params"&&L("params"),h==="falla"&&L("falla"),(h==="calidad"||h==="qc")&&L("calidad"),(h==="conformidad"||h==="conf")&&L("conformidad"),p&&D().catch(()=>{})}function Yo(){const p=ct();n("dateStr")&&!n("dateStr").value&&(n("dateStr").value=p),n("fallaDate")&&!n("fallaDate").value&&(n("fallaDate").value=p),n("qcDate")&&!n("qcDate").value&&(n("qcDate").value=p),n("confDate")&&!n("confDate").value&&(n("confDate").value=p)}function Jo(){var v,h,A,_,E,M,N,nt,H,rt,An,_n,Sn,Rn,En,Ln,Mn,Tn,Nn,On,xn,kn,Dn,Un,$n,Fn,Bn,wn,qn,Vn,Qn,Pn,jn,zn,Hn,Kn,Wn,Gn,Yn,Jn,Zn,Xn,ta,ea;(v=n("goParams"))==null||v.addEventListener("click",()=>L("params")),(h=n("goFalla"))==null||h.addEventListener("click",()=>{var O,k;const I=(((O=n("vinText"))==null?void 0:O.value)||"").trim();I&&n("fallaVin")&&(n("fallaVin").value=I),n("fallaDate")&&(n("fallaDate").value=((k=n("dateStr"))==null?void 0:k.value)||ct()),L("falla")}),(A=n("goCalidad"))==null||A.addEventListener("click",()=>{var O,k;const I=(((O=n("vinText"))==null?void 0:O.value)||"").trim();I&&n("qcVin")&&(n("qcVin").value=I),n("qcDate")&&(n("qcDate").value=((k=n("dateStr"))==null?void 0:k.value)||ct()),L("calidad")}),(_=n("goConfTanque"))==null||_.addEventListener("click",()=>In("TANQUE")),(E=n("goConfReductor"))==null||E.addEventListener("click",()=>In("REDUCTOR")),(M=n("btnBackControl"))==null||M.addEventListener("click",j),(N=n("imgModalClose"))==null||N.addEventListener("click",ut),(nt=n("imgModal"))==null||nt.addEventListener("click",I=>{I.target===n("imgModal")&&ut()}),document.addEventListener("keydown",I=>{I.key==="Escape"&&ut()}),a.addEventListener("click",I=>{var k,Q;const O=(Q=(k=I.target)==null?void 0:k.closest)==null?void 0:Q.call(k,".thumb img");O&&at(O.currentSrc||O.src)}),a.addEventListener("click",I=>{const O=I.target.closest("button");if(!O)return;O.getAttribute("data-nav")==="menu"&&L("menu")}),(H=n("btnRefresh"))==null||H.addEventListener("click",D),(rt=n("vinText"))==null||rt.addEventListener("change",D),(An=n("dateStr"))==null||An.addEventListener("change",D),(_n=n("btnUpload"))==null||_n.addEventListener("click",async()=>{m("out","📡 Refrescando estado..."),await D()}),a.addEventListener("click",I=>{var Q,G,Y,$;const O=I.target.closest("button");if(!O)return;const k=O.getAttribute("data-slot");if(k&&(O.getAttribute("data-pick")==="cam"&&(k==="comp"?(Q=n("comp_cam"))==null||Q.click():(G=n(`${k}_cam`))==null||G.click()),O.getAttribute("data-pick")==="file"&&(k==="comp"?(Y=n("comp_file"))==null||Y.click():($=n(`${k}_file`))==null||$.click()),O.getAttribute("data-clear")==="1"))if(k==="comp")gt();else{R(k,null);const B=n(`${k}_cam`),yt=n(`${k}_file`);B&&(B.value=""),yt&&(yt.value="")}}),["vin","corr_pre","corr_post","voltaje","scan_carro"].forEach(I=>{const O=n(`${I}_cam`),k=n(`${I}_file`),Q=async G=>{var B,yt;const Y=(yt=(B=G.target)==null?void 0:B.files)==null?void 0:yt[0];if(!Y)return;R(I,Y);const $=await w(I,Y,"out");if($&&$.ok){O&&(O.value=""),k&&(k.value="");try{await D()}catch{}}};O&&O.addEventListener("change",Q),k&&k.addEventListener("change",Q),R(I,null)}),(Sn=n("comp_cam"))==null||Sn.addEventListener("change",I=>jo(I.target.files)),(Rn=n("comp_file"))==null||Rn.addEventListener("change",I=>zo(I.target.files)),gt(),(En=n("btnScanQR_params"))==null||En.addEventListener("click",()=>bt("params","QR")),(Ln=n("btnScanBAR_params"))==null||Ln.addEventListener("click",()=>bt("params","BAR")),(Mn=n("btnStop_params"))==null||Mn.addEventListener("click",()=>st("params")),(Tn=n("btnScanQR_falla"))==null||Tn.addEventListener("click",()=>bt("falla","QR")),(Nn=n("btnScanBAR_falla"))==null||Nn.addEventListener("click",()=>bt("falla","BAR")),(On=n("btnStop_falla"))==null||On.addEventListener("click",()=>st("falla")),(xn=n("btnScanQR_qc"))==null||xn.addEventListener("click",()=>bt("qc","QR")),(kn=n("btnScanBAR_qc"))==null||kn.addEventListener("click",()=>bt("qc","BAR")),(Dn=n("btnStop_qc"))==null||Dn.addEventListener("click",()=>st("qc")),(Un=n("btnScanQR_conf"))==null||Un.addEventListener("click",()=>bt("conf","QR")),($n=n("btnScanBAR_conf"))==null||$n.addEventListener("click",()=>bt("conf","BAR")),(Fn=n("btnStop_conf"))==null||Fn.addEventListener("click",()=>st("conf")),(Bn=n("btnFallaCam"))==null||Bn.addEventListener("click",()=>{var I;return(I=n("falla_cam"))==null?void 0:I.click()}),(wn=n("btnFallaFile"))==null||wn.addEventListener("click",()=>{var I;return(I=n("falla_file"))==null?void 0:I.click()}),(qn=n("btnFallaClear"))==null||qn.addEventListener("click",()=>{i=[],Wt()}),(Vn=n("falla_cam"))==null||Vn.addEventListener("change",I=>{yn(I.target.files),I.target.value=""}),(Qn=n("falla_file"))==null||Qn.addEventListener("change",I=>{yn(I.target.files),I.target.value=""}),(Pn=n("btnEnviarFalla"))==null||Pn.addEventListener("click",async()=>{var Q,G,Y;const I=(((Q=n("fallaVin"))==null?void 0:Q.value)||"").trim(),O=((G=n("fallaDate"))==null?void 0:G.value)||ct(),k=(((Y=n("fallaNota"))==null?void 0:Y.value)||"").trim();if(!I){m("outFalla","❌ Falta VIN.");return}if(!k&&i.length===0){m("outFalla","⚠️ Agrega una nota o al menos una foto.");return}try{const $=await Qi({vin:I,dateStr:O,note:k,files:i,apsUrl:e.apsUrl,onProgress:B=>{B.phase==="prepare"?m("outFalla",`Preparando foto ${B.index}/${B.total}...
`):B.phase==="upload"&&m("outFalla",`Subiendo FALLA (${B.total} foto(s) + nota)...
`)}});if(!$.ok){m("outFalla","❌ uploadFalla: "+($.error||"Error"));return}m("outFalla",`✅ Falla registrada.
Carpeta: ${$.carFolderName}/FALLAS
Batch: ${$.batchId}
Guardados: ${$.savedCount}`),i=[],Wt()}catch($){m("outFalla",`❌ Error FALLA: ${$}`)}}),Wt(),(jn=n("btnQcCam"))==null||jn.addEventListener("click",()=>{var I;return(I=n("qc_cam"))==null?void 0:I.click()}),(zn=n("btnQcFile"))==null||zn.addEventListener("click",()=>{var I;return(I=n("qc_file"))==null?void 0:I.click()}),(Hn=n("btnQcClear"))==null||Hn.addEventListener("click",xe),(Kn=n("qc_cam"))==null||Kn.addEventListener("change",I=>Ko(I.target.files)),(Wn=n("qc_file"))==null||Wn.addEventListener("change",I=>Wo(I.target.files)),xe(),(Gn=n("btnQcUpload"))==null||Gn.addEventListener("click",async()=>{var G,Y;const I=(((G=n("qcVin"))==null?void 0:G.value)||"").trim(),O=((Y=n("qcDate"))==null?void 0:Y.value)||ct();if(!I){m("outQc","❌ Falta VIN.");return}if(s.filter(Boolean).length<3){m("outQc","⚠️ Debes subir mínimo 3 fotos de calidad.");return}const Q=[];for(let $=0;$<4;$++){const B=s[$];B&&Q.push({slot:`calidad_${$+1}`,file:B})}try{const $=await Pi({vin:I,dateStr:O,items:Q,apsUrl:e.apsUrl,onProgress:B=>{B.phase==="prepare"?m("outQc",`Preparando ${B.slot}...
`):B.phase==="upload"&&m("outQc",`Enviando CALIDAD (${B.total} foto(s))...
`)}});if(!$.ok){m("outQc","❌ uploadCalidad: "+($.error||"Error"));return}m("outQc",`✅ Calidad registrada.
Carpeta: ${$.carFolderName}/CALIDAD
Guardados: ${Array.isArray($.saved)?$.saved.length:Q.length}`),xe()}catch($){m("outQc",`❌ Error CALIDAD: ${$}`)}}),(Yn=n("btnConfCam"))==null||Yn.addEventListener("click",()=>{var I;return(I=n("conf_cam"))==null?void 0:I.click()}),(Jn=n("btnConfFile"))==null||Jn.addEventListener("click",()=>{var I;return(I=n("conf_file"))==null?void 0:I.click()}),(Zn=n("btnConfClear"))==null||Zn.addEventListener("click",()=>{r=null,qt()}),(Xn=n("conf_cam"))==null||Xn.addEventListener("change",I=>{var O;r=((O=I.target.files)==null?void 0:O[0])||null,qt(),I.target.value=""}),(ta=n("conf_file"))==null||ta.addEventListener("change",I=>{var O;r=((O=I.target.files)==null?void 0:O[0])||null,qt(),I.target.value=""}),(ea=n("btnEnviarConf"))==null||ea.addEventListener("click",async()=>{var Y,$,B,yt,na,aa,oa;const I=(((Y=n("confTipo"))==null?void 0:Y.value)||"").trim(),O=((($=n("confVin"))==null?void 0:$.value)||"").trim(),k=((B=n("confDate"))==null?void 0:B.value)||ct(),Q=(((yt=n("confTecnico"))==null?void 0:yt.value)||"").trim(),G={revisadoConTiempo:!!((na=n("chk1"))!=null&&na.checked),responsablePerdida:!!((aa=n("chk2"))!=null&&aa.checked),todoConforme:!!((oa=n("chk3"))!=null&&oa.checked)};if(!O){m("outConf","❌ Falta VIN.");return}if(!Q){m("outConf","❌ Falta nombre del técnico.");return}if(!r){m("outConf","❌ Falta foto del equipo.");return}if(!G.revisadoConTiempo||!G.responsablePerdida||!G.todoConforme){m("outConf","⚠️ Debes marcar los 3 checks de conformidad.");return}try{const pt=await ji({tipo:I,vin:O,dateStr:k,tecnico:Q,checklist:G,file:r,apsUrl:e.apsUrl,onProgress:ia=>{ia.phase==="prepare"&&m("outConf",`Preparando foto...
`),ia.phase==="upload"&&m("outConf",`Enviando conformidad...
`)}});if(!pt.ok){m("outConf","❌ uploadConformidad: "+(pt.error||"Error"));return}m("outConf",`✅ Conformidad registrada.
Tipo: ${I}
Carpeta: ${pt.carFolderName}/${pt.mainFolderName}/${pt.subFolderName}
Acta: ${pt.actaName}
Foto: ${pt.photoName}`),r=null,qt()}catch(pt){m("outConf",`❌ Error CONFORMIDAD: ${pt}`)}}),qt()}function Zo(p={}){var _;const v=String(p.vin||"").trim(),h=String(p.dateStr||"").trim(),A=String(p.screen||"").trim().toLowerCase();v&&(n("vinText")&&(n("vinText").value=v),n("fallaVin")&&(n("fallaVin").value=v),n("qcVin")&&(n("qcVin").value=v),n("confVin")&&(n("confVin").value=v)),h&&(n("dateStr")&&(n("dateStr").value=h),n("fallaDate")&&(n("fallaDate").value=h),n("qcDate")&&(n("qcDate").value=h),n("confDate")&&(n("confDate").value=h)),t&&(t.style.display="block"),L(A==="params"?"params":A==="falla"?"falla":A==="calidad"||A==="qc"?"calidad":A==="conformidad"||A==="conf"?"conformidad":"menu"),(((_=n("vinText"))==null?void 0:_.value)||"").trim()&&D().catch(()=>{})}function Xo(){ke().catch(()=>{}),t&&(t.style.display="none")}return Yo(),Jo(),Go(),L("menu"),{show:Zo,hide:Xo,refreshStatus:D,showScreen:L,stopAllScanners:ke}}let Be=!1,Nt=null;const Xt=new Map,Ee=t=>document.getElementById(t);function Xa(t={}){if(Be)return Nt;const e=Ee("viewUploader");return e?(Nt=Za(e,{apsUrl:t.apsUrl,onBackControl:()=>{var o;wt(),Bt();const a=String(((o=u==null?void 0:u.state)==null?void 0:o.currentModule)||"").trim().toUpperCase();if(a){const i=document.getElementById(`view${a}`);if(i){i.style.display="block";return}}const n=document.getElementById("viewHub");n&&(n.style.display="block")}}),Be=!0,Nt):(console.warn("[Uploader] No existe #viewUploader en el HTML"),null)}function Gi(t,e={}){var r;const a=document.getElementById(t);if(!a)return console.warn("[Uploader] mountId no existe:",t),null;const n=Xt.get(t),o=!!a.querySelector(".uploader-shell");if(n&&o)return n;if(n){try{(r=n.stopAllScanners)==null||r.call(n)}catch{}Xt.delete(t)}const i=Ee("viewUploader");if(!i)return console.warn("[Uploader] No existe #viewUploader para clonar template"),null;a.innerHTML=i.innerHTML;const s=Za(a,{apsUrl:e.apsUrl,onBackControl:e.onBackControl||(()=>{try{s.showScreen("menu")}catch{}})});return Xt.set(t,s),s}function en({vin:t="",screen:e="menu",dateStr:a="",mountId:n="",inModal:o=!1,onBackControl:i=null,apsUrl:s=null}={}){if(n){const r=Gi(n,{apsUrl:s,onBackControl:i});r&&r.show({vin:t,screen:e,dateStr:a});return}if(Be||Xa({apsUrl:s}),!o){const r=document.getElementById("viewApp");r&&(r.style.display="block");const c=document.getElementById("viewHub");c&&(c.style.display="none")}if(Nt)Nt.show({vin:t,screen:e,dateStr:a});else{const r=Ee("viewUploader");r&&(r.style.display="block")}}function wt({mountId:t=""}={}){var a;if(t){const n=document.getElementById(t),o=Xt.get(t);try{(a=o==null?void 0:o.stopAllScanners)==null||a.call(o)}catch{}n&&(n.innerHTML=""),Xt.delete(t);return}Nt&&Nt.hide();const e=Ee("viewUploader");e&&(e.style.display="none")}const Yi="modulepreload",Ji=function(t){return"/"+t},ra={},ca=function(e,a,n){let o=Promise.resolve();if(a&&a.length>0){let s=function(l){return Promise.all(l.map(d=>Promise.resolve(d).then(f=>({status:"fulfilled",value:f}),f=>({status:"rejected",reason:f}))))};document.getElementsByTagName("link");const r=document.querySelector("meta[property=csp-nonce]"),c=(r==null?void 0:r.nonce)||(r==null?void 0:r.getAttribute("nonce"));o=s(a.map(l=>{if(l=Ji(l),l in ra)return;ra[l]=!0;const d=l.endsWith(".css"),f=d?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${l}"]${f}`))return;const b=document.createElement("link");if(b.rel=d?"stylesheet":Yi,d||(b.as="script"),b.crossOrigin="",b.href=l,c&&b.setAttribute("nonce",c),document.head.appendChild(b),d)return new Promise((y,m)=>{b.addEventListener("load",y),b.addEventListener("error",()=>m(new Error(`Unable to preload CSS for ${l}`)))})}))}function i(s){const r=new Event("vite:preloadError",{cancelable:!0});if(r.payload=s,window.dispatchEvent(r),!r.defaultPrevented)throw s}return o.then(s=>{for(const r of s||[])r.status==="rejected"&&i(r.reason);return e().catch(i)})};function Zi(t){return String((t==null?void 0:t.estado)||"").toUpperCase()==="FINALIZADO"}function Xi(t){const e=String(t||"").toUpperCase();return e==="SIN_INICIAR"?["INICIO","NOTA"]:e==="TRABAJANDO"?["PAUSA","FIN","NOTA"]:e==="PAUSADO"?["REANUDAR","FIN","NOTA"]:e==="FINALIZADO"?["NOTA"]:["INICIO","NOTA"]}function ts(t){const e=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();return u.state.currentModule==="CALIDAD"?e==="CALIDAD":u.state.currentModule==="RAMALERO"?e==="RAMALERO":e==="MOTOR"||e==="TANQUE"}function Ut(t,e=Date.now()){const a=Number(t.tiempo_ms||0),n=t.running_since?Date.parse(t.running_since):NaN;return!isNaN(n)&&String(t.estado).toUpperCase()==="TRABAJANDO"?a+Math.max(0,e-n):a}function to(t){const e=String(t||"").toUpperCase();return e==="SIN_INICIAR"?'<div class="jobActionsGrid"><button class="btnInicio" data-act="INICIO">INICIO</button></div>':e==="TRABAJANDO"?`<div class="jobActionsGrid">
      <button class="btnPausa" data-act="PAUSA">PAUSA</button>
      <button class="btnFin" data-act="FIN">FIN</button>
    </div>`:e==="PAUSADO"?`<div class="jobActionsGrid">
      <button class="btnReanudar" data-act="REANUDAR">REANUDAR</button>
      <button class="btnFin" data-act="FIN">FIN</button>
    </div>`:'<div class="jobActionsGrid"><button class="btnInicio" data-act="NOTA">GUARDAR NOTA</button></div>'}function es(t){const e=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();if(e!=="MOTOR"&&e!=="TANQUE")return"";const a=String((t==null?void 0:t.tanque_asignado)||"").trim(),n=String((t==null?void 0:t.reductor_asignado)||"").trim(),o=String((t==null?void 0:t.tanque_registrado)||"").trim(),i=String((t==null?void 0:t.reductor_registrado)||"").trim(),s=e==="TANQUE",r=s?"TANQUE ASIGNADO:":"REDUCTOR ASIGNADO:",c=s?a:n,l=s?"TANQUE REGISTRADO:":"REDUCTOR REGISTRADO:",d=s?o:i,f=T(c||"NO ASIGNADO"),b=T(d||"—"),y=c?"":" na",m=d?"":" na";return`
    <div class="asignadoRow js-asignado" data-rol="${T(e)}">
      <span class="asignadoLabel">${T(r)}</span>
      <span class="asignadoValue${y}">${f}</span>
    </div>
    <div class="asignadoRow js-registrado" data-rol="${T(e)}" style="margin-top:6px;">
      <span class="asignadoLabel">${T(l)}</span>
      <span class="asignadoValue${m}">${b}</span>
    </div>
  `}function eo(t,e=""){if(u.state.currentModule!=="CALIDAD")return"";const a=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),n=String((t==null?void 0:t.conversionId)||"").trim();return!a&&!n?"":(Number((t==null?void 0:t.inc_leve)||0),Number((t==null?void 0:t.inc_moderada)||0),Number((t==null?void 0:t.inc_critica)||0),`
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
  `)}function nn(){var e,a;const t=new Map;return(a=(e=U("activasBox"))==null?void 0:e.querySelectorAll(".jobCard[data-key]"))==null||a.forEach(n=>{const o=n.dataset.key||"",i=n.querySelector("textarea.notaCard");i&&t.set(o,String(i.value||""))}),t}function an(t){var e,a;t&&((a=(e=U("activasBox"))==null?void 0:e.querySelectorAll(".jobCard[data-key]"))==null||a.forEach(n=>{const o=n.dataset.key||"",i=n.querySelector("textarea.notaCard");i&&t.has(o)&&(i.value=t.get(o))}))}function Rt(){const t=F(),e=[...t.itemsByKey.values()].filter(ts),a=[],n=[];e.sort((o,i)=>{const s=o.updated_at?Date.parse(o.updated_at):0;return(i.updated_at?Date.parse(i.updated_at):0)-s});for(const o of e){const i=`${String(o.conversionId||"").trim()}|${String(o.rolTrabajo||"").toUpperCase()}`;Zi(o)?n.push(i):a.push(i)}t.activeKeys=a,t.finalKeys=n}function $t(){const t=F(),e=U("activasBox");if(!e)return;if(!t.activeKeys.length){e.innerHTML='<div class="small">No tienes trabajos activos.</div>';return}const a=Date.now();let n="";for(const o of t.activeKeys){const i=t.itemsByKey.get(o);if(!i)continue;const s=String(i.estado||"").toUpperCase(),r=T(i.rolTrabajo||""),c=T(i.vin||""),l=T(i.tipoRamal||""),d=kt(Ut(i,a)),f=T(Ya(i.created_at)),b=T(i.motorNombre||""),y=T(i.tanqueroNombre||""),m=u.state.currentModule==="RAMALERO"?`RAMAL: ${l||"-"}`:c||"<span class='small'>(sin VIN)</span>";n+=`
      <div class="jobCard card state-${s}" data-key="${T(o)}">
        <div class="jobTop">
          <div class="jobMeta">
            <div class="jobTitle">${m} <span>(${r})</span></div>
            <div class="jobSub">
              <span><b>Estado:</b> <span class="js-estado">${s}</span></span>
              <span class="small">Inicio: ${f}</span>
              ${u.state.currentModule==="CALIDAD"&&(b||y)?`
                <span class="small js-personal">
                  ${b?`🔧 MOTOR: <b>${b}</b>`:""}
                  ${b&&y?" &nbsp;|&nbsp; ":""}
                  ${y?`🛢️ TANQUERO: <b>${y}</b>`:""}
                </span>`:""}
            </div>
          </div>
          <div class="jobRight">
            <div class="jobTimePill js-tiempo">⏱ ${d}</div>
            <div class="jobChevron"></div>
          </div>
        </div>

        <div class="jobExpand">
          ${es(i)}

          ${String((i==null?void 0:i.rolTrabajo)||"").toUpperCase()==="MOTOR"||String((i==null?void 0:i.rolTrabajo)||"").toUpperCase()==="TANQUE"?`<button class="btnRF" type="button" data-go="CONF" style="margin-bottom:10px;">
                  ✅ Registro de conformidad de equipo
                </button>`:""}

          ${eo(i,o)}

          <div class="jobActionsSlot">${to(s)}</div>

          ${u.state.currentModule==="TECNICO"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>':u.state.currentModule==="CALIDAD"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar calidad / fallas</button>':""}

          <div class="jobNoteBlock">
            <textarea class="notaCard" rows="2" placeholder="Escribe una nota..."></textarea>
            <button class="btnNota" data-act="NOTA" style="margin-top:10px; width:100%; height:66px; font-weight:900; display:none;">
              Guardar nota
            </button>
          </div>
        </div>
      </div>
    `}e.innerHTML=n}function it(t=""){const e=F(),a=u.state.currentModule==="CALIDAD"?"Q":u.state.currentModule==="RAMALERO"?"R":"",n=U("finalizadosWrap"+a),o=U("finalizadosBox"+a);if(!n||!o)return;if(!e.showFinalizados){n.style.display="none",o.innerHTML="";return}if(n.style.display="block",!e.finalKeys.length){o.innerHTML=t+'<div class="small">No tienes finalizados.</div>';return}const i=Date.now();let s="";for(const r of e.finalKeys){const c=e.itemsByKey.get(r);if(!c)continue;const l=T(String(c.vin||"").toUpperCase()),d=T(String(c.rolTrabajo||"")),f=T(String(c.estado||"FINALIZADO").toUpperCase()),b=kt(Ut(c,i)),y=T(Ya(c.created_at)),m=T(c.motorNombre||""),C=T(c.tanqueroNombre||"");s+=`
      <div class="card" style="margin-top:10px;" data-key="${T(r)}">
        <div><b>${l}</b> <span class="small">(${d})</span></div>
        <div class="row space-between" style="margin-top:6px;">
          <div class="small"><b>Estado:</b> ${f}</div>
          <div class="pill" style="font-size:18px; font-weight:800;">⏱ ${b}</div>
        </div>
        <div class="small">Inicio: ${y}</div>
        ${u.state.currentModule==="CALIDAD"&&(m||C)?`
          <div class="small js-personal" style="margin-top:4px;">
            ${m?`🔧 MOTOR: <b>${m}</b>`:""}
            ${m&&C?" &nbsp;|&nbsp; ":""}
            ${C?`🛢️ TANQUERO: <b>${C}</b>`:""}
          </div>`:""}

        ${eo(c,r)}

        ${u.state.currentModule==="TECNICO"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>':u.state.currentModule==="CALIDAD"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar calidad / fallas</button>':""}
      </div>
    `}o.innerHTML=t+s}function se(){const t=F(),e=U("activasBox");if(!e)return;const a=Date.now();for(const n of t.activeKeys){const o=t.itemsByKey.get(n);if(!o)continue;const i=e.querySelector(`.jobCard[data-key="${Bi(n)}"]`);if(!i)continue;const s=i.classList.contains("open"),r=String(o.estado||"").toUpperCase();i.className=`jobCard card state-${r}`+(s?" open":"");const c=i.querySelector(".js-estado");c&&(c.textContent=r);const l=i.querySelector(".js-tiempo");l&&(l.textContent=`⏱ ${kt(Ut(o,a))}`);try{const d=String(o.rolTrabajo||"").toUpperCase();if(d==="MOTOR"||d==="TANQUE"){const f=d==="TANQUE",b=f?String(o.tanque_asignado||"").trim():String(o.reductor_asignado||"").trim(),y=f?String(o.tanque_registrado||"").trim():String(o.reductor_registrado||"").trim(),m=i.querySelector(".js-asignado .asignadoValue"),C=i.querySelector(".js-registrado .asignadoValue");m&&(m.textContent=b||"LIBRE",m.classList.toggle("na",!b)),C&&(C.textContent=y||"—",C.classList.toggle("na",!y))}}catch{}try{if(u.state.currentModule==="CALIDAD"){const d=i.querySelector(".js-personal");if(d){const f=T(o.motorNombre||""),b=T(o.tanqueroNombre||"");d.innerHTML=[f?`🔧 MOTOR: <b>${f}</b>`:"",f&&b?"&nbsp;|&nbsp;":"",b?`🛢️ TANQUERO: <b>${b}</b>`:""].join("")}}}catch{}if(s){const d=i.querySelector(".jobActionsSlot");d&&(d.innerHTML=to(r))}}}const S={open:!1,itemKey:"",item:null,photo:null,techSelected:null,sugItems:[],sugOpen:!1,sugIdx:-1,sugTimer:null,lastQ:"",cache:{ts:0,items:[]}},ns=600*1e3;function no(){return z("incFotoPreview")}function ao(){return z("incFotoPreviewWrap")}function we(){return z("incFotoCam")}function qe(){return z("incFotoFile")}function te(){var n;S.photo=null;const t=we();t&&(t.value="");const e=qe();e&&(e.value="");const a=no();a&&(a.src=""),(n=ao())==null||n.classList.add("hidden")}function as(t){return new Promise((e,a)=>{const n=new FileReader;n.onload=()=>e(String(n.result||"")),n.onerror=a,n.readAsDataURL(t)})}function os(t){return new Promise((e,a)=>{const n=new Image;n.onload=()=>e(n),n.onerror=a,n.src=t})}async function is(t){const e=await as(t),a=await os(e),n=1600,o=1600;let{width:i,height:s}=a;const r=Math.min(n/i,o/s,1),c=Math.round(i*r),l=Math.round(s*r),d=document.createElement("canvas");d.width=c,d.height=l,d.getContext("2d").drawImage(a,0,0,c,l);const b=d.toDataURL("image/jpeg",.82),y=b.match(/^data:(.*?);base64,(.*)$/);if(!y)throw new Error("No se pudo procesar la imagen.");return{mimeType:"image/jpeg",b64:y[2],previewUrl:b,name:(t.name||"incidencia.jpg").replace(/\.[^.]+$/,"")+".jpg"}}async function la(t){var e,a,n;try{const o=(a=(e=t.target)==null?void 0:e.files)==null?void 0:a[0];if(!o){te();return}if(!String(o.type||"").startsWith("image/")){P("Solo se permiten imágenes."),te();return}P("Procesando foto...");const i=await is(o);S.photo={b64:i.b64,mimeType:i.mimeType,name:i.name,previewUrl:i.previewUrl};const s=no();s&&(s.src=i.previewUrl),(n=ao())==null||n.classList.remove("hidden"),P("")}catch(o){console.error("[INC foto] ERROR:",o),P("❌ No se pudo procesar la foto."),te()}}function z(t){return document.getElementById(t)}function P(t){const e=z("incMsg");e&&(e.textContent=String(t||""))}function oo(t){const e=z("incInfo");e&&(e.textContent=String(t||""))}function on(){return z("incModal")}function io(){return z("btnIncSave")}function Ot(){return z("incTechInput")}function Le(){return z("incTechSuggest")}function so(){return z("incTech")}function Me(){return z("incTipo")}function sn(){return z("incNota")}function ro(){te(),S.itemKey="",S.item=null,S.techSelected=null;const t=Ot();t&&(t.value="");const e=so();e&&(e.innerHTML="");const a=Me();a&&(a.value="");const n=sn();n&&(n.value=""),P(""),oo(""),Ft(),Te()}function Te(){var n,o,i;const t=io();if(!t)return;const e=!!((n=S.techSelected)!=null&&n.userId)||!!((o=S.techSelected)!=null&&o.email),a=!!String(((i=Me())==null?void 0:i.value)||"").trim();t.disabled=!(e&&a)}function co(t){return String(t||"").trim().toLowerCase()}function ss(t){return co([t.name,t.email,t.label].filter(Boolean).join(" "))}function Ft(){const t=Le();t&&(S.sugOpen=!1,S.sugIdx=-1,S.sugItems=[],t.classList.add("hidden"),t.innerHTML="")}function lo(){const t=Le();if(t){if(!S.sugItems.length){Ft();return}t.innerHTML=S.sugItems.map((e,a)=>{const n=a===S.sugIdx?"active":"",o=String(e.name||"").trim();return`
      <div class="nsItem ${n}" data-idx="${a}" role="option" aria-selected="${a===S.sugIdx}">
        <div class="nsTitle">${T(o)}</div>
      </div>
    `}).join(""),t.classList.remove("hidden"),S.sugOpen=!0}}function da(t){if(!S.sugItems.length)return;S.sugIdx=Math.max(0,Math.min(t,S.sugItems.length-1)),lo();const e=Le(),a=e==null?void 0:e.querySelector(`.nsItem[data-idx="${S.sugIdx}"]`);a&&a.scrollIntoView({block:"nearest"})}function uo(t){S.techSelected=t||null;const e=Ot();e&&(e.value=t?String(t.name||"").trim():"");const a=so();if(a&&(a.innerHTML="",t)){const n=document.createElement("option");n.value=String(t.userId||t.email||""),n.textContent=String(t.name||"").trim(),n.selected=!0,a.appendChild(n)}Ft(),Te()}async function rs(t){const e=String(t||"").trim();if(!e)return[];const a=await vt(`/api/name-suggest?q=${encodeURIComponent(e)}&limit=12`);return a!=null&&a.ok?(Array.isArray(a.items)?a.items:[]).map(o=>({userId:String(o.userId||o.id||"").trim(),name:String(o.name||o.nombre||"").trim(),email:String(o.email||"").trim(),label:String(o.label||"").trim()})):[]}function cs(){const t=Ot();if(!t)return;const e=String(t.value||"").trim();if(S.lastQ=e,S.techSelected=null,Te(),!e){Ft();return}clearTimeout(S.sugTimer),S.sugTimer=setTimeout(async()=>{try{const a=await rs(e);if(S.lastQ!==e)return;let n=a;if(!n.length&&S.cache.items.length){const o=co(e);n=S.cache.items.filter(i=>ss(i).includes(o)).slice(0,12)}S.sugItems=n,S.sugIdx=n.length?0:-1,lo()}catch{Ft()}},180)}function ls(t){if(S.sugOpen){if(t.key==="ArrowDown"){t.preventDefault(),da(S.sugIdx+1);return}if(t.key==="ArrowUp"){t.preventDefault(),da(S.sugIdx-1);return}if(t.key==="Enter"){S.sugIdx>=0&&S.sugItems[S.sugIdx]&&(t.preventDefault(),uo(S.sugItems[S.sugIdx]));return}t.key==="Escape"&&(t.preventDefault(),Ft())}}function ds(t){return F().itemsByKey.get(String(t||""))||null}function us(t){const e=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),a=String((t==null?void 0:t.conversionId)||"").trim(),n=Number((t==null?void 0:t.inc_leve)||0),o=Number((t==null?void 0:t.inc_moderada)||0),i=Number((t==null?void 0:t.inc_critica)||0);return`VIN: ${e||"-"} | OT: ${a||"-"} | Acumulado → L:${n} M:${o} C:${i}`}async function po(t){if(u.state.currentModule!=="CALIDAD")return;const e=ds(t);if(!e){K({ok:!1,error:"No se encontró el trabajo para registrar incidencia."});return}ro(),S.itemKey=String(t||""),S.item=e,oo(us(e)),P("");const a=on();a&&(a.classList.add("show"),a.setAttribute("aria-hidden","false"),document.body.classList.add("modal-open")),S.open=!0;try{const n=Date.now();if(!S.cache.items.length||n-S.cache.ts>ns){const o=await vt("/api/name-suggest?q=.&limit=120");o!=null&&o.ok&&(S.cache.items=(Array.isArray(o.items)?o.items:[]).map(i=>({userId:String(i.userId||i.id||"").trim(),name:String(i.name||i.nombre||"").trim(),email:String(i.email||"").trim(),label:String(i.label||"").trim()})),S.cache.ts=n)}}catch{}setTimeout(()=>{var n;return(n=Ot())==null?void 0:n.focus()},0)}async function re(){const t=on();if(t){const e=document.activeElement;e&&t.contains(e)&&e.blur(),t.classList.remove("show"),t.setAttribute("aria-hidden","true")}document.body.classList.remove("modal-open"),S.open=!1,ro()}async function ps(){var r,c;if(u.state.currentModule!=="CALIDAD"||!S.item)return;const t=String((Zt==null?void 0:Zt())||"").trim().toLowerCase();if(!t){P("No hay email de sesión."),K({ok:!1,error:"No hay email de sesión."});return}const e=String(((r=Me())==null?void 0:r.value)||"").trim().toUpperCase();if(!["LEVE","MODERADA","CRITICA"].includes(e)){P("Selecciona el tipo de incidencia.");return}const a=S.techSelected;if(!a||!a.userId&&!a.email){P("Selecciona un técnico de la lista.");return}const n=String(((c=sn())==null?void 0:c.value)||"").trim(),o=S.item,i={email:t,conversionId:String(o.conversionId||"").trim(),vin:String(o.vin||"").trim().toUpperCase(),rolTrabajo:"CALIDAD",tecnicoUserId:String(a.userId||"").trim(),tecnicoEmail:String(a.email||"").trim(),tecnicoNombre:String(a.name||"").trim(),tipo:e,nota:n,foto:S.photo?{b64:S.photo.b64,mimeType:S.photo.mimeType,name:S.photo.name}:null};let s;try{s=await tn("/api/incidencia",i),K(s)}catch(l){console.error("[INC save] ERROR:",l),P(`❌ ${String((l==null?void 0:l.message)||l||"Error de red")}`),K({ok:!1,error:String((l==null?void 0:l.message)||l||"Error de red")});return}if(!s||typeof s!="object"){P("❌ Respuesta inválida del servidor."),K({ok:!1,error:"Respuesta inválida del servidor",raw:s});return}if(!s.ok){const l=s.error||s.message||JSON.stringify(s);P(`❌ ${l}`);return}try{const l=F(),d=s.item||s.data||s.row||null;if(d&&(d.conversionId||d.vin)){const f=l.itemsByKey.get(S.itemKey);if(f){const b={...f};d.inc_leve!=null?b.inc_leve=Number(d.inc_leve||0):e==="LEVE"&&(b.inc_leve=Number(b.inc_leve||0)+1),d.inc_moderada!=null?b.inc_moderada=Number(d.inc_moderada||0):e==="MODERADA"&&(b.inc_moderada=Number(b.inc_moderada||0)+1),d.inc_critica!=null?b.inc_critica=Number(d.inc_critica||0):e==="CRITICA"&&(b.inc_critica=Number(b.inc_critica||0)+1),l.itemsByKey.set(S.itemKey,b);const y=nn();Rt(),$t(),it(),an(y)}}}catch(l){console.warn("[INC patch local] warning:",l)}P("✅ Incidencia registrada."),setTimeout(()=>{re().catch(()=>{})},350)}function fs(){var e,a,n,o,i,s,r,c,l,d,f,b;const t=on();t&&t.dataset.bound!=="1"&&(t.dataset.bound="1",(e=z("btnCloseInc"))==null||e.addEventListener("click",()=>{re().catch(()=>{})}),t.addEventListener("click",y=>{y.target===t&&re().catch(()=>{})}),(a=Ot())==null||a.addEventListener("input",cs),(n=Ot())==null||n.addEventListener("keydown",ls),(o=z("btnIncFotoCam"))==null||o.addEventListener("click",()=>{var y;P(""),(y=we())==null||y.click()}),(i=z("btnIncFotoFile"))==null||i.addEventListener("click",()=>{var y;P(""),(y=qe())==null||y.click()}),(s=we())==null||s.addEventListener("change",la),(r=qe())==null||r.addEventListener("change",la),(c=z("btnIncFotoClear"))==null||c.addEventListener("click",()=>{te(),P("")}),(l=Le())==null||l.addEventListener("mousedown",y=>{const m=y.target.closest(".nsItem[data-idx]");if(!m)return;y.preventDefault();const C=Number(m.dataset.idx),L=S.sugItems[C];L&&uo(L)}),document.addEventListener("click",y=>{var C;if(!S.open||!S.sugOpen)return;const m=(C=Ot())==null?void 0:C.closest(".supNameWrap");m&&m.contains(y.target)||Ft()}),(d=Me())==null||d.addEventListener("change",()=>{P(""),Te()}),(f=sn())==null||f.addEventListener("input",()=>{P("")}),(b=io())==null||b.addEventListener("click",async()=>{await J(async()=>{await ps()},"Guardando incidencia...")}),document.addEventListener("keydown",y=>{S.open&&y.key==="Escape"&&(y.preventDefault(),re().catch(()=>{}))}))}const At={open:!1,vin:""},Z=t=>document.getElementById(t),rn=()=>Z("rfModal");function fo(t){const e=Z("rfInfo");e&&(e.textContent=String(t||""))}function mo(t){const e=Z("rfMsg");e&&(e.textContent="")}function vo(){try{wt({mountId:"rfUploaderMount"})}catch{}Z("rfMenu")&&(Z("rfMenu").style.display="block"),Z("rfStage")&&(Z("rfStage").style.display="none"),Z("rfStage")&&(Z("rfStage").innerHTML="")}function ua(t){var n;const e=Z("rfMenu"),a=Z("rfStage");a&&(e&&(e.style.display="none"),a.style.display="block",a.innerHTML=`
    <div class="row" style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <button type="button" id="btnRfBack" class="btn" style="height:44px; padding:0 14px; font-weight:900;">
        ← Volver
      </button>
      <div class="pill small" style="opacity:.95;">
        ${t==="calidad"?"CONTROL CALIDAD":"REGISTRAR FALLA"}
      </div>
    </div>

    <div id="rfUploaderMount"></div>
  `,(n=a.querySelector("#btnRfBack"))==null||n.addEventListener("click",vo),en({vin:At.vin,screen:t,mountId:"rfUploaderMount"}))}function go(t){if(u.state.currentModule!=="CALIDAD")return;const e=String(t||"").trim().toUpperCase();if(!e){K({ok:!1,error:"VIN vacío para RF modal."});return}At.vin=e,At.open=!0,fo(`VIN: ${e}`),mo();const a=rn();a&&(a.classList.add("show"),a.setAttribute("aria-hidden","false"),document.body.classList.add("modal-open")),vo()}function De(){try{wt({mountId:"rfUploaderMount"})}catch{}const t=rn();if(t){const n=document.activeElement;n&&t.contains(n)&&n.blur(),t.classList.remove("show"),t.setAttribute("aria-hidden","true")}document.body.classList.remove("modal-open"),At.open=!1,At.vin="",fo(""),mo();const e=document.getElementById("rfMenu"),a=document.getElementById("rfStage");e&&(e.style.display="block"),a&&(a.style.display="none",a.innerHTML="")}function ms(){var e,a,n;const t=rn();t&&t.dataset.bound!=="1"&&(t.dataset.bound="1",(e=Z("btnCloseRF"))==null||e.addEventListener("click",De),t.addEventListener("click",o=>{o.target===t&&De()}),(a=Z("btnRfControl"))==null||a.addEventListener("click",()=>{At.vin&&ua("calidad")}),(n=Z("btnRfFalla"))==null||n.addEventListener("click",()=>{At.vin&&ua("falla")}),document.addEventListener("keydown",o=>{At.open&&o.key==="Escape"&&(o.preventDefault(),De())}))}const _t={open:!1,vin:""},X=t=>document.getElementById(t),cn=()=>X("rfTecModal");function bo(t){const e=X("rfTecInfo");e&&(e.textContent=String(t||""))}function yo(t){const e=X("rfTecMsg");e&&(e.textContent="")}function fe(){try{wt({mountId:"rfTecUploaderMount"})}catch{}X("rfTecMenu")&&(X("rfTecMenu").style.display="block"),X("rfTecStage")&&(X("rfTecStage").style.display="none"),X("rfTecStage")&&(X("rfTecStage").innerHTML="")}function pa(t){var n;const e=X("rfTecMenu"),a=X("rfTecStage");a&&(e&&(e.style.display="none"),a.style.display="block",a.innerHTML=`
    <div class="row" style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <button type="button" id="btnRFTecBack" class="btn" style="height:44px; padding:0 14px; font-weight:900;">
        ← Volver
      </button>
      <div class="pill small" style="opacity:.95;">
        ${t==="params"?"REGISTRAR PARÁMETROS":"REGISTRAR FALLA"}
      </div>
    </div>

    <div id="rfTecUploaderMount"></div>
  `,(n=a.querySelector("#btnRFTecBack"))==null||n.addEventListener("click",fe),en({vin:_t.vin,screen:t==="params"?"params":"falla",mountId:"rfTecUploaderMount",onBackControl:fe}))}function ho(t){if(u.state.currentModule!=="TECNICO")return;const e=String(t||"").trim().toUpperCase();if(!e)return K({ok:!1,error:"VIN vacío para Registro/Fallas."});_t.vin=e,_t.open=!0,bo(`VIN: ${e}`),yo();const a=cn();a&&(a.classList.add("show"),a.setAttribute("aria-hidden","false"),document.body.classList.add("modal-open")),fe()}function Ue(){try{wt({mountId:"rfTecUploaderMount"})}catch{}const t=cn();if(t){const e=document.activeElement;e&&t.contains(e)&&e.blur(),t.classList.remove("show"),t.setAttribute("aria-hidden","true")}document.body.classList.remove("modal-open"),_t.open=!1,_t.vin="",bo(""),yo(),fe()}function vs(){var e,a,n;const t=cn();t&&t.dataset.bound!=="1"&&(t.dataset.bound="1",(e=X("btnCloseRFTec"))==null||e.addEventListener("click",Ue),t.addEventListener("click",o=>{o.target===t&&Ue()}),(a=X("btnRFTecParams"))==null||a.addEventListener("click",()=>{_t.vin&&pa("params")}),(n=X("btnRFTecFalla"))==null||n.addEventListener("click",()=>{_t.vin&&pa("falla")}),document.addEventListener("keydown",o=>{_t.open&&o.key==="Escape"&&(o.preventDefault(),Ue())}))}const jt={bound:!1,resolver:null};function me(){return{modal:g("confirmFinishModal"),btnCloseX:g("btnCloseFinishX"),btnCancel:g("btnCancelFinish"),btnAccept:g("btnAcceptFinish"),title:g("confirmFinishTitle"),text:g("confirmFinishText")}}function Jt(t){const{modal:e}=me();if(e&&(e.setAttribute("aria-hidden","true"),e.classList.remove("show")),document.body.classList.remove("modal-open"),typeof jt.resolver=="function"){const a=jt.resolver;jt.resolver=null,a(!!t)}}function Io(){if(jt.bound)return;jt.bound=!0;const{modal:t,btnCloseX:e,btnCancel:a,btnAccept:n}=me();t&&(e==null||e.addEventListener("click",()=>Jt(!1)),a==null||a.addEventListener("click",()=>Jt(!1)),n==null||n.addEventListener("click",()=>Jt(!0)),t.addEventListener("click",o=>{o.target===t&&Jt(!1)}),document.addEventListener("keydown",o=>{const{modal:i}=me();!i||i.getAttribute("aria-hidden")==="true"||o.key==="Escape"&&(o.preventDefault(),Jt(!1))}))}function gs(){Io()}function Co({title:t="Confirmar finalización",message:e="¿Seguro que quieres finalizar este trabajo?",acceptText:a="Sí, finalizar",cancelText:n="Cancelar"}={}){Io();const{modal:o,title:i,text:s,btnAccept:r,btnCancel:c}=me();return o?(i&&(i.textContent=t),s&&(s.textContent=e),r&&(r.textContent=a),c&&(c.textContent=n),o.setAttribute("aria-hidden","false"),o.classList.add("show"),document.body.classList.add("modal-open"),setTimeout(()=>c==null?void 0:c.focus(),0),new Promise(l=>{jt.resolver=l})):Promise.resolve(window.confirm(e))}const V={currentKey:"",currentItem:null,qr:null,scanMode:"QR",bound:!1};let ce=null;function bs(t){ce=typeof t=="function"?t:null}function tt(){return{modal:g("confModal"),btnClose:g("btnCloseConf"),vinInfo:g("confVinInfo"),code:g("confCode"),btnQR:g("btnConfQR"),assignedBox:g("confAssignedBox"),qrWrap:g("confQrWrap"),qrReader:g("qrReader_conf"),qrMsg:g("confQrMsg"),btnStopQR:g("btnConfStopQR"),btnClear:g("btnConfClear"),ck1:g("ck1"),ck2:g("ck2"),ck3:g("ck3"),btnSave:g("btnConfSave"),msg:g("confMsg")}}function ae(t){return String(t||"").trim().toUpperCase()}function ln(t){const e=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();return e==="TANQUE"?"TANQUE":e==="MOTOR"?"REDUCTOR":String((t==null?void 0:t.tanque_asignado)||"").trim()?"TANQUE":String((t==null?void 0:t.reductor_asignado)||"").trim()?"REDUCTOR":"EQUIPO"}function Ao(t,e){return t?e==="TANQUE"?String(t.tanque_asignado||t.tanque_registrado||"").trim().toUpperCase():e==="REDUCTOR"?String(t.reductor_asignado||t.reductor_registrado||"").trim().toUpperCase():"":""}function ys(){const{ck1:t,ck2:e,ck3:a}=tt();return!!(t!=null&&t.checked&&(e!=null&&e.checked)&&(a!=null&&a.checked))}function Ve(){var e;const{code:t}=tt();return!!ae(t==null?void 0:t.value)&&ys()&&!!((e=V.currentItem)!=null&&e.vin)}function ft(t,e=!1){const{msg:a}=tt();a&&(a.textContent=String(t||""),a.style.color=e?"#ffb3b3":"")}function ee(){const{assignedBox:t,code:e}=tt(),a=V.currentItem;if(!t)return;if(!a){t.textContent="";return}const n=ln(a),o=Ao(a,n),i=ae(e==null?void 0:e.value);if(!o){t.textContent=`Equipo esperado (${n}): (sin asignado en cartilla)`,t.style.opacity=".85";return}if(!i){t.textContent=`Equipo asignado (${n}): ${o}`,t.style.opacity=".95";return}const s=i===o;t.textContent=`Equipo asignado (${n}): ${o} ${s?"✅":"⚠️ no coincide"}`,t.style.opacity="1"}function Tt(){const{btnSave:t}=tt();if(!t)return;const e=Ve();t.disabled=!e,t.style.opacity=e?"1":".65",t.style.cursor=e?"pointer":"not-allowed"}function hs(t){V.scanMode=t==="BAR"?"BAR":"QR"}async function Is(){var n;const{qrWrap:t,qrMsg:e,code:a}=tt();try{if(!window.Html5Qrcode){e&&(e.textContent="No se cargó la librería QR.");return}t&&(t.style.display="block"),V.qr||(V.qr=new Html5Qrcode("qrReader_conf"));const o=V.scanMode==="BAR";e&&(e.textContent=o?"Modo: CÓDIGO DE BARRAS (CODE_128)":"Modo: QR");const i={fps:o?8:10,qrbox:o?{width:170,height:320}:{width:250,height:250},formatsToSupport:o?[Html5QrcodeSupportedFormats.CODE_128]:[Html5QrcodeSupportedFormats.QR_CODE],experimentalFeatures:{useBarCodeDetectorIfSupported:!0}},s=async d=>{const f=ae(d);f&&(a&&(a.value=f),e&&(e.textContent=`Código detectado: ${f}`),ee(),Tt(),await dn())};try{await V.qr.start({facingMode:{exact:"environment"}},i,s,()=>{});return}catch{}try{await V.qr.start({facingMode:"environment"},i,s,()=>{});return}catch{}const r=await Html5Qrcode.getCameras();let c=((n=r==null?void 0:r[0])==null?void 0:n.id)||null;const l=r==null?void 0:r.find(d=>/back|rear|environment/i.test(d.label||""));l!=null&&l.id&&(c=l.id),await V.qr.start(c??{facingMode:"environment"},i,s,()=>{})}catch{e&&(e.textContent="No se pudo abrir cámara. Revisa permisos/HTTPS.")}}async function dn(){const{qrWrap:t,qrMsg:e}=tt();try{V.qr&&V.qr.isScanning&&await V.qr.stop()}catch{}t&&(t.style.display="none"),e&&!e.textContent&&(e.textContent="")}function Cs(){const{code:t,ck1:e,ck2:a,ck3:n,qrMsg:o,msg:i}=tt();t&&(t.value=""),e&&(e.checked=!1),a&&(a.checked=!1),n&&(n.checked=!1),o&&(o.textContent=""),i&&(i.textContent=""),ee(),Tt()}function As(t){const{vinInfo:e,assignedBox:a}=tt(),n=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),o=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase(),i=ln(t);e&&(e.textContent=`VIN: ${n||"-"} | ROL: ${o||"-"} | CONFORMIDAD: ${i}`),a&&(a.textContent=""),ee(),Tt()}async function _s(t){var i,s;const a=F().itemsByKey.get(String(t||""));if(!a)return;V.currentKey=String(t||""),V.currentItem=a,As(a),Cs();const{modal:n,code:o}=tt();(i=n==null?void 0:n.classList)==null||i.add("show"),(s=n==null?void 0:n.setAttribute)==null||s.call(n,"aria-hidden","false"),setTimeout(()=>{var r;return(r=o==null?void 0:o.focus)==null?void 0:r.call(o)},0)}async function Qe(){var e,a;const{modal:t}=tt();(e=t==null?void 0:t.classList)==null||e.remove("show"),(a=t==null?void 0:t.setAttribute)==null||a.call(t,"aria-hidden","true"),await dn(),V.currentKey="",V.currentItem=null}async function fa(){const{code:t,ck1:e,ck2:a,ck3:n}=tt(),o=V.currentItem;if(!o)return ft("No hay cartilla seleccionada.",!0);const i=ae(t==null?void 0:t.value);if(!i)return ft("Debes escribir o escanear el código del equipo.",!0);if(!(e!=null&&e.checked&&(a!=null&&a.checked)&&(n!=null&&n.checked)))return ft("Debes marcar los 3 items de conformidad.",!0);let s;try{s=St()}catch{return}const r=ln(o),c=Ao(o,r),l={email:s,conversionId:String(o.conversionId||""),vin:String(o.vin||"").trim().toUpperCase(),rolTrabajo:String(o.rolTrabajo||"").toUpperCase(),equipoTipo:r,equipoCodigo:i,equipoAsignado:c||"",checks:{ck1:!0,ck2:!0,ck3:!0}};l.ck1=!0,l.ck2=!0,l.ck3=!0;const d=await _e("/api/equipo-conformidad",l,"Guardando conformidad...");if(!(d!=null&&d.ok)){ft((d==null?void 0:d.error)||"No se pudo guardar la conformidad.",!0);return}ft("✅ Conformidad guardada correctamente."),setTimeout(()=>{try{ce==null||ce()}catch{}},400),setTimeout(()=>Qe().catch(()=>{}),450)}function Ss(){if(V.bound)return;V.bound=!0;const{modal:t,btnClose:e,code:a,btnQR:n,btnStopQR:o,btnClear:i,ck1:s,ck2:r,ck3:c,btnSave:l}=tt();e==null||e.addEventListener("click",()=>Qe()),t==null||t.addEventListener("click",async d=>{d.target===t&&await Qe()}),a==null||a.addEventListener("input",()=>{a.value=ae(a.value),ee(),Tt(),ft("")}),[s,r,c].forEach(d=>{d==null||d.addEventListener("change",()=>{Tt(),ft("")})}),n==null||n.addEventListener("click",async d=>{hs(d.altKey?"BAR":"QR"),await Is()}),o==null||o.addEventListener("click",async()=>{await dn()}),i==null||i.addEventListener("click",()=>{const{code:d,qrMsg:f}=tt();d&&(d.value=""),f&&(f.textContent=""),ee(),Tt(),ft("")}),l==null||l.addEventListener("click",async()=>{if(!Ve()){ft("Completa el código del equipo y marca los 3 checks.",!0);return}await fa()}),a==null||a.addEventListener("keydown",async d=>{d.key==="Enter"&&Ve()&&(d.preventDefault(),await fa())}),Tt()}const ma={TECNICO:{syncTimer:null,clockTimer:null,estadoTimer:null,syncStopped:!1},CALIDAD:{syncTimer:null,clockTimer:null,estadoTimer:null,syncStopped:!1},RAMALERO:{syncTimer:null,clockTimer:null,estadoTimer:null,syncStopped:!1}};function un(t){return ma[t]||ma.TECNICO}function pn(t){const e=un(t);e.syncStopped=!0,e.syncTimer&&clearTimeout(e.syncTimer),e.clockTimer&&clearInterval(e.clockTimer),e.estadoTimer&&clearInterval(e.estadoTimer),e.syncTimer=null,e.clockTimer=null,e.estadoTimer=null}function _o(t){const e=u.state.currentModule;u.state.currentModule=t;try{if(t==="RAMALERO"){const i=document.getElementById("ramalId");i&&(i.value="");const s=document.getElementById("tipoRamal");s&&(s.value="")}else{const i=U("vin");i&&(i.value="")}const a=U("activasBox");a&&(a.innerHTML="");const n=U("finalizadosBox");n&&(n.innerHTML=""),dt("");const o=F();o.showFinalizados=!1,o.itemsByKey.clear(),o.activeKeys=[],o.finalKeys=[],o.lastSyncSince=null,o.lastSyncRev=null,o.lastSyncAtMs=0}finally{u.state.currentModule=e}}async function So(t,e){const a=un(t);if(e&&!a.syncStopped){try{await e({forceFull:!1,showOut:!1})}catch(n){console.error(`[${t}] sync loop error:`,n)}a.syncStopped||(a.syncTimer=setTimeout(()=>{So(t,e)},6e4))}}function Ro(t,{syncNow:e,tickClocksUI:a,refreshEstadoForVinRole:n,buildAvgTopHTML:o}={}){pn(t);const i=u.state.currentModule;u.state.currentModule=t;try{const s=un(t);if(s.syncStopped=!1,Promise.resolve(e==null?void 0:e({forceFull:!0,showOut:!1})).catch(c=>{console.error(`[${t}] initial sync error:`,c)}).finally(()=>{s.syncStopped||(s.syncTimer=setTimeout(()=>{So(t,e)},1e4))}),s.clockTimer=setInterval(()=>{a==null||a()},1e3),(t==="TECNICO"||t==="CALIDAD")&&(s.estadoTimer=setInterval(()=>{n==null||n({showOut:!1})},8e3),setTimeout(()=>{n==null||n({showOut:!1}).catch(()=>{})},700)),F().showFinalizados){const c=o&&o()||"";it(c)}}finally{u.state.currentModule=i}}function Ne(t,e){if((!t.vin||t.vin==="")&&(e!=null&&e.vin)&&(t.vin=e.vin),!t.vin&&t.conversionId&&t.rolTrabajo){const a=Di(t.conversionId,t.rolTrabajo);a&&(t.vin=a)}if(t.rolTrabajo==="RAMALERO"&&((!t.tipoRamal||t.tipoRamal==="")&&(e!=null&&e.tipoRamal)&&(t.tipoRamal=e.tipoRamal),!t.tipoRamal&&t.conversionId)){const a=Fi(t.conversionId);a&&(t.tipoRamal=a)}return e&&(t.updated_at||(t.updated_at=e.updated_at||null),t.last_nota_ts||(t.last_nota_ts=e.last_nota_ts||null),t.created_at||(t.created_at=e.created_at||null)),t}function oe(t){const e=(...n)=>{for(const o of n)if(o!=null&&String(o).trim()!=="")return o;return""},a={conversionId:String(e(t==null?void 0:t.conversionId,t==null?void 0:t.conversion_id,t==null?void 0:t.CONVERSION_ID,t==null?void 0:t.ID,t==null?void 0:t.id)).trim(),vin:String(e(t==null?void 0:t.vin,t==null?void 0:t.VIN)).trim().toUpperCase(),tipoRamal:String(e(t==null?void 0:t.tipoRamal,t==null?void 0:t.tipo_ramal,t==null?void 0:t.tipo,t==null?void 0:t.TIPO_RAMAL,t==null?void 0:t.TIPO)).trim(),created_at:(t==null?void 0:t.fecha_asignacion)??(t==null?void 0:t.FECHA_ASIGNACION)??(t==null?void 0:t.fecha_inicio)??(t==null?void 0:t.inicio_at)??(t==null?void 0:t.FECHA_INICIO)??(t==null?void 0:t.created_at)??(t==null?void 0:t.fecha_creacion)??(t==null?void 0:t.FECHA_CREACION)??null,rolTrabajo:String(e(t==null?void 0:t.rolTrabajo,t==null?void 0:t.rol_trabajo,t==null?void 0:t.rol,t==null?void 0:t.ROL_TRABAJO,t==null?void 0:t.ROL)).trim().toUpperCase(),estado:String(e(t==null?void 0:t.estado,t==null?void 0:t.estado_actual,t==null?void 0:t.estadoActual,t==null?void 0:t.ESTADO_ACTUAL,t==null?void 0:t.ESTADO)).trim().toUpperCase(),tiempo_ms:Number(e(t==null?void 0:t.tiempo_ms,t==null?void 0:t.tiempoMs,t==null?void 0:t.TIEMPO_TRAB_MS,t==null?void 0:t.TIEMPO_MS,0))||0,running_since:(t==null?void 0:t.running_since)??(t==null?void 0:t.RUNNING_SINCE)??null,last_nota:String(e(t==null?void 0:t.last_nota,t==null?void 0:t.LAST_NOTA,"")),last_nota_ts:(t==null?void 0:t.last_nota_ts)??(t==null?void 0:t.LAST_NOTA_TS)??null,updated_at:(t==null?void 0:t.updated_at)??(t==null?void 0:t.UPDATED_AT)??null,tanque_asignado:String(e(t==null?void 0:t.tanque_asignado,t==null?void 0:t.tanqueAsignado,t==null?void 0:t.TANQUE_ASIGNADO,"")).trim(),reductor_asignado:String(e(t==null?void 0:t.reductor_asignado,t==null?void 0:t.reductorAsignado,t==null?void 0:t.REDUCTOR_ASIGNADO,"")).trim(),tanque_registrado:String(e(t==null?void 0:t.tanque_registrado,t==null?void 0:t.tanqueRegistrado,t==null?void 0:t.TANQUE_REGISTRADO,"")).trim(),reductor_registrado:String(e(t==null?void 0:t.reductor_registrado,t==null?void 0:t.reductorRegistrado,t==null?void 0:t.REDUCTOR_REGISTRADO,"")).trim(),inc_leve:Number(e(t==null?void 0:t.inc_leve,t==null?void 0:t.INC_LEVE,0))||0,inc_moderada:Number(e(t==null?void 0:t.inc_moderada,t==null?void 0:t.INC_MODERADA,0))||0,inc_critica:Number(e(t==null?void 0:t.inc_critica,t==null?void 0:t.INC_CRITICA,0))||0,motorNombre:String(e(t==null?void 0:t.motorNombre,t==null?void 0:t.motor_nombre,t==null?void 0:t.MOTOR_NOMBRE,"")).trim(),tanqueroNombre:String(e(t==null?void 0:t.tanqueroNombre,t==null?void 0:t.tanquero_nombre,t==null?void 0:t.TANQUERO_NOMBRE,"")).trim()};return a.rolTrabajo||(a.tipoRamal?a.rolTrabajo="RAMALERO":u.state.currentModule==="CALIDAD"?a.rolTrabajo="CALIDAD":a.rolTrabajo=String(Qa()||"MOTOR").toUpperCase()),a.estado||(a.estado="SIN_INICIAR"),a.conversionId&&a.rolTrabajo&&a.vin&&ki(a.conversionId,a.rolTrabajo,a.vin),a.conversionId&&a.rolTrabajo==="RAMALERO"&&a.tipoRamal&&$i(a.conversionId,a.tipoRamal),a}function Eo(t){const e=F(),a=Array.isArray(t==null?void 0:t.items)?t.items:[];for(const n of a){const o=oe(n),i=Se(o),s=e.itemsByKey.get(i);Ne(o,s),e.itemsByKey.set(i,o)}}function Pe(t){const e=F();e.itemsByKey.clear();const a=Array.isArray(t)?t:[];for(const n of a){const o=oe(n),i=Se(o);Ne(o,null),e.itemsByKey.set(i,o)}}function Lo(t,e){const a=F();return t.join(",")!==a.activeKeys.join(",")||e.join(",")!==a.finalKeys.join(",")}let Qt=null;const Rs=300*1e3;function Mo(){Qt=null}async function fn(){const t=Date.now();if(Qt&&t-Qt.ts<Rs)return Qt.byVin;try{const e=await vt("/api/supervisor/report?track=CONVERSION"),a=new Map;if(e!=null&&e.ok&&Array.isArray(e.items))for(const n of e.items){const o=String(n.vin||"").toUpperCase().trim();if(!o)continue;const i=String(n.rol||"").toUpperCase(),s=a.get(o)||{motorNombre:"",tanqueroNombre:""};i==="MOTOR"&&(s.motorNombre=String(n.userName||"").trim()),(i==="TANQUE"||i==="TANQUERO")&&(s.tanqueroNombre=String(n.userName||"").trim()),a.set(o,s)}return Qt={ts:t,byVin:a},a}catch{const e=new Map;return Qt={ts:t,byVin:e},e}}async function je(t){const e=String(t||"").toUpperCase().trim();return(await fn()).get(e)||{motorNombre:"",tanqueroNombre:""}}const va=Object.freeze(Object.defineProperty({__proto__:null,applySyncResultToStore_:Eo,clearNombresCache_:Mo,detectIfNeedsFullRerender_:Lo,ensureNombresCache_:fn,fetchNombresParaVin_:je,mergePrevAndCache_:Ne,normalizeItem_:oe,storeFullReplace_:Pe},Symbol.toStringTag,{value:"Module"}));let $e={k:"",t:0};async function To(t,e={}){var m,C;if(!(u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD"))return;let a;try{a=St()}catch{return}const n=String(t||((m=g("accion"))==null?void 0:m.value)||"").toUpperCase();let o="";if(n==="NOTA"&&(o=String(((C=g("nota"))==null?void 0:C.value)||"").trim(),!o&&(e!=null&&e.nota)&&(o=String(e.nota||"").trim()),!o))return K({ok:!1,error:"Escribe una nota antes de guardar."});const i=Ce();if(!i)return K({ok:!1,error:"Pon el VIN"});const s=Kt(),r=F(),c=[...r.itemsByKey.values()].find(L=>String(L.vin||"").toUpperCase()===i&&String(L.rolTrabajo||"").toUpperCase()===s);if(c&&!Xi(c.estado).includes(n))return K({ok:!1,error:`Acción ${n} no permitida desde estado ${c.estado}.`});const l=await _e("/api/evento",{email:a,vin:i,rolTrabajo:s,accion:n,nota:o},n==="NOTA"?"Guardando nota...":"Registrando...");if(K(l),!(l!=null&&l.ok))return;const d=oe(l),f=Se(d),b=r.itemsByKey.get(f);b&&Ne(d,b),r.itemsByKey.set(f,d),Rt();const y=nn();n==="NOTA"&&(e!=null&&e.clearKey)&&y.set(String(e.clearKey),""),$t(),it(),an(y),n==="NOTA"&&g("nota")&&(g("nota").value=""),setTimeout(()=>{u.state.uiLocked||et({forceFull:!1,showOut:!1})},400)}async function ve(t,e){const a=String(t||"").trim().toUpperCase(),n=String(e||"").trim().toUpperCase();if(!a)return;const o=`${a}|${n}`,i=Date.now();if($e.k===o&&i-$e.t<1200)return;$e={k:o,t:i};const r=[...F().itemsByKey.values()].find(l=>String(l.vin||"").toUpperCase()===a&&String(l.rolTrabajo||"").toUpperCase()===n);String((r==null?void 0:r.estado)||"").toUpperCase()==="SIN_INICIAR"&&await To("INICIO")}async function Es(t,e,{forceRefresh:a=!1}={}){try{const i=await tn("/api/sync",{email:t,since:e,excludeFinalizados:!0,forceRefresh:a});if(i&&i.ok)return{mode:"sync",data:i}}catch{}return{mode:"legacy",data:await vt(`/api/mis-activas?email=${encodeURIComponent(t)}&excludeFinalizados=true&_t=${Date.now()}`)}}async function ga(t){return vt(`/api/mis-finalizadas?email=${encodeURIComponent(t)}`)}async function et({forceFull:t=!1,showOut:e=!1,_fromLock:a=!1}={}){if(!a&&u.state.uiLocked||!Ze())return;let n;try{n=St()}catch{return}const o=F();t&&Mo();const i=o.activeKeys.slice(),s=o.finalKeys.slice(),r=nn(),c=t?null:o.lastSyncSince,l=await Es(n,c,{forceRefresh:t}),d=l.data;if(e&&K(d),!d||!d.ok)return;if(l.mode==="legacy"?(Pe(d.items||[]),o.lastSyncSince=new Date().toISOString(),o.lastSyncRev=null):(d.full?Pe(d.items||[]):Eo(d),o.lastSyncSince=d.server_time||new Date().toISOString(),o.lastSyncRev=d.rev||o.lastSyncRev),Rt(),u.state.currentModule==="CALIDAD"){const b=await fn();for(const y of[...o.activeKeys,...o.finalKeys]){const m=o.itemsByKey.get(y);if(m&&m.vin&&!m.motorNombre&&!m.tanqueroNombre){const C=b.get(m.vin.toUpperCase().trim())||{motorNombre:"",tanqueroNombre:""};m.motorNombre=C.motorNombre,m.tanqueroNombre=C.tanqueroNombre}}}if(t||Lo(i,s)?($t(),it(),an(r)):se(),o.lastSyncAtMs=Date.now(),Ie(),u.state.currentModule==="CALIDAD"){const b=o.activeKeys.map(y=>o.itemsByKey.get(y)).find(y=>y&&y.rolTrabajo==="CALIDAD"&&y.estado==="SIN_INICIAR");b!=null&&b.vin&&ve(b.vin,"CALIDAD").catch(()=>{})}if(u.state.currentModule==="TECNICO"){let y=Ce();if(!y){const m=o.activeKeys.map(C=>o.itemsByKey.get(C)).find(C=>C&&(C.rolTrabajo==="MOTOR"||C.rolTrabajo==="TANQUE")&&C.estado==="SIN_INICIAR"&&String(C.vin||"").trim());y=String((m==null?void 0:m.vin)||"").trim().toUpperCase()}y&&ve(y,Kt()).catch(()=>{})}}let ba=null;async function Et({showOut:t=!1}={}){if(u.state.uiLocked||!Ze())return;let e;try{e=St()}catch{return}if(!(u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD"))return;const a=Ce(),n=Kt();if(!a){dt("");return}const o=F(),i=a.toUpperCase();for(const l of o.itemsByKey.values())if(String(l.vin||"").toUpperCase()===i&&String(l.rolTrabajo||"").toUpperCase()===n){u.state.currentModule==="CALIDAD"&&!l.motorNombre&&!l.tanqueroNombre&&je(i).then(({motorNombre:d,tanqueroNombre:f})=>{l.motorNombre=d,l.tanqueroNombre=f,$t(),it()}).catch(()=>{}),dt(`Estado: ${l.estado} | Tiempo: ${kt(Ut(l))}`);return}const s=await vt(`/api/estado?email=${encodeURIComponent(e)}&vin=${encodeURIComponent(a)}&rolTrabajo=${encodeURIComponent(n)}`);if(t&&K(s),!(s!=null&&s.ok)){dt((s==null?void 0:s.error)||"Error");return}const r=oe(s),c=Se(r);if(u.state.currentModule==="CALIDAD"&&r.vin){const{motorNombre:l,tanqueroNombre:d}=await je(r.vin);r.motorNombre=l,r.tanqueroNombre=d}o.itemsByKey.set(c,r),Rt(),$t(),it(),dt(`Estado: ${r.estado} | Tiempo: ${kt(Ut(r))}`)}function ze(t=500){(u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD")&&(clearTimeout(ba),ba=setTimeout(()=>Et({showOut:!1}).catch(()=>{}),t))}function Ls(){var t,e,a;(t=g("btnEstado"))==null||t.addEventListener("click",async()=>{u.state.currentModule==="TECNICO"&&await J(async()=>{await Et({showOut:!0}),await et({forceFull:!0,showOut:!1})},"Buscando / creando OT...")}),(e=g("btnEstadoQ"))==null||e.addEventListener("click",async()=>{u.state.currentModule==="CALIDAD"&&await J(async()=>{await Et({showOut:!0}),await et({forceFull:!0,showOut:!1})},"Buscando / creando OT...")}),(a=g("rol"))==null||a.addEventListener("change",()=>{u.state.currentModule==="TECNICO"&&ze(0)})}function mn(){var e;const t=document.getElementById("supIncModal");(e=t==null?void 0:t.classList)==null||e.add("show")}function ya(){var t,e;(e=(t=document.getElementById("supIncModal"))==null?void 0:t.classList)==null||e.remove("show")}function Ms(t,{escapeHtml:e,fmtShort_:a}){try{return e(a(t))}catch{return e(String(t||""))}}async function vn(t,e,{getJSON_user:a}){const n=`/api/incidencias/list?vin=${encodeURIComponent(t||"")}&conversionId=${encodeURIComponent(e||"")}&limit=${encodeURIComponent(200)}`;return await a(n,"Cargando incidencias...")}function zt(t,e,{escapeHtml:a,fmtShort_:n}){const o=document.getElementById("supIncInfo"),i=document.getElementById("supIncList"),s=document.getElementById("supIncMsg");s&&(s.textContent=""),i&&(i.innerHTML="");const r=(e==null?void 0:e.who)||"-",c=(e==null?void 0:e.vin)||"-",l=(e==null?void 0:e.conversionId)||"";if(o&&(o.textContent=`${r} — VIN: ${c}${l?` — CID: ${l}`:""}`),!(t!=null&&t.ok)){s&&(s.textContent=(t==null?void 0:t.error)||"Error cargando incidencias.");return}const d=Array.isArray(t.items)?t.items:[];if(!d.length){i&&(i.innerHTML='<div class="small">No hay incidencias registradas.</div>');return}i&&(i.innerHTML=d.map(f=>{const b=String(f.tipo||"").toUpperCase(),y=f.tecnico||"-",m=f.nota||"",C=f.fecha||"",j=!!(f.fotoThumbUrl||f.fotoUrl||f.fotoImgUrl)?`
      <div style="margin-top:10px;">
        <a href="${a(f.fotoUrl||f.fotoImgUrl)}" target="_blank" rel="noopener">
          <img
            src="${a(f.fotoThumbUrl||f.fotoImgUrl)}"
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
            ${a(b||"INCIDENCIA")}
          </div>
          <div class="small" style="opacity:.9;">
            ${Ms(C,{escapeHtml:a,fmtShort_:n})}
          </div>
        </div>

        <div class="small" style="margin-top:8px;">
          <b>Técnico:</b> ${a(y)}
        </div>

        ${m?`
          <div class="small" style="margin-top:8px; white-space:pre-wrap;">
            <b>Nota:</b> ${a(m)}
          </div>
        `:'<div class="small" style="margin-top:8px; opacity:.8;">Sin nota.</div>'}

        ${j}
      </div>
    `}).join(""))}function Ts({CORE:t,getJSON_user:e,escapeHtml:a,fmtShort_:n}){var o,i,s;(o=document.getElementById("supTable"))==null||o.addEventListener("click",async r=>{var y,m;if(t.state.currentModule!=="SUPERVISOR")return;const c=(m=(y=r.target)==null?void 0:y.closest)==null?void 0:m.call(y,"button[data-sup-inc]");if(!c)return;const l=String(c.dataset.vin||"").trim().toUpperCase(),d=String(c.dataset.cid||"").trim(),f=String(c.dataset.who||"").trim();mn();const b=document.getElementById("supIncMsg");b&&(b.textContent="Cargando...");try{const C=await vn(l,d,{getJSON_user:e});zt(C,{vin:l,conversionId:d,who:f},{escapeHtml:a,fmtShort_:n})}catch(C){zt({ok:!1,error:String((C==null?void 0:C.message)||C)},{vin:l,conversionId:d,who:f},{escapeHtml:a,fmtShort_:n})}}),(i=document.getElementById("btnCloseSupInc"))==null||i.addEventListener("click",()=>ya()),(s=document.getElementById("supIncModal"))==null||s.addEventListener("click",r=>{r.target===document.getElementById("supIncModal")&&ya()})}function ha(t){const e=u.state.currentModule;u.state.currentModule=t;try{const a=U("activasBox");if(!a)return;const n=`bound_${t}`;if(a.dataset[n]==="1")return;a.dataset[n]="1",a.addEventListener("input",o=>{var r;const i=o.target.closest("textarea.notaCard");if(!i)return;const s=(r=i.closest(".jobCard"))==null?void 0:r.querySelector(".btnNota");s&&(s.style.display=i.value.trim()?"block":"none")}),a.addEventListener("click",async o=>{var b;const i=o.target.closest(".jobCard");if(!i)return;const s=o.target.closest("button[data-act]");if(s){o.stopPropagation();const y=String(s.dataset.act||"").toUpperCase(),m=F(),C=i.dataset.key||"",L=m.itemsByKey.get(C);if(!L)return;const j=U("vin");if(j&&(j.value=L.vin||""),u.state.currentModule==="TECNICO"&&!u.state.rolLock&&(g("rol")&&(g("rol").value=L.rolTrabajo||"MOTOR"),Ie()),y==="NOTA"&&g("nota")&&(g("nota").value=String(((b=i.querySelector("textarea.notaCard"))==null?void 0:b.value)||"")),y==="FIN"&&!await Co({title:"Confirmar finalización",message:"¿Seguro que quieres finalizar este trabajo? Esta acción puede cerrar la tarea actual.",acceptText:"Sí, finalizar",cancelText:"Cancelar"}))return;await To(y,{clearKey:C});return}const r=o.target.closest("button[data-go]");if(!r)return;const c=String(r.dataset.go||"").toUpperCase(),l=F(),d=i.dataset.key||"",f=l.itemsByKey.get(d);if(f){if(c==="RF"){const y=String(r.dataset.vin||f.vin||"").trim().toUpperCase();if(!y)return;if(u.state.currentModule==="TECNICO"){g("vin")&&(g("vin").value=y),ho(y);return}if(u.state.currentModule==="CALIDAD"){g("vinQ")&&(g("vinQ").value=y),go(y);return}}if(c==="INC"){o.stopPropagation();const y=String(r.dataset.key||d||"").trim();if(!y)return;await po(y);return}if(c==="VER_INC"){o.stopPropagation();const y=String(r.dataset.vin||(f==null?void 0:f.vin)||"").trim().toUpperCase(),m=String(r.dataset.cid||(f==null?void 0:f.conversionId)||"").trim();mn();const C=document.getElementById("supIncMsg");C&&(C.textContent="Cargando..."),vn(y,m,{getJSON_user:vt}).then(L=>zt(L,{vin:y,conversionId:m,who:y},{escapeHtml:T,fmtShort_:xt})).catch(L=>zt({ok:!1,error:String((L==null?void 0:L.message)||L)},{vin:y},{escapeHtml:T,fmtShort_:xt}));return}if(c==="CONF"){o.stopPropagation(),await _s(d);return}}})}finally{u.state.currentModule=e}}function Ia(t){const e=u.state.currentModule;u.state.currentModule=t;try{const a=U("finalizadosBox");if(!a)return;const n=`boundFin_${t}`;if(a.dataset[n]==="1")return;a.dataset[n]="1",a.addEventListener("click",async o=>{var d,f,b,y;const i=(f=(d=o.target)==null?void 0:d.closest)==null?void 0:f.call(d,"button[data-go]");if(!i)return;const s=String(i.dataset.go||"").toUpperCase(),r=F(),c=String(i.dataset.key||((y=(b=i.closest("[data-key]"))==null?void 0:b.dataset)==null?void 0:y.key)||"").trim(),l=c?r.itemsByKey.get(c):null;if(s==="INC"){if(o.stopPropagation(),!c)return;await po(c);return}if(s==="VER_INC"){o.stopPropagation();const m=String(i.dataset.vin||(l==null?void 0:l.vin)||"").trim().toUpperCase(),C=String(i.dataset.cid||(l==null?void 0:l.conversionId)||"").trim();mn();const L=document.getElementById("supIncMsg");L&&(L.textContent="Cargando..."),vn(m,C,{getJSON_user:vt}).then(j=>zt(j,{vin:m,conversionId:C,who:m},{escapeHtml:T,fmtShort_:xt})).catch(j=>zt({ok:!1,error:String((j==null?void 0:j.message)||j)},{vin:m},{escapeHtml:T,fmtShort_:xt}));return}if(s==="RF"){o.stopPropagation();const m=String(i.dataset.vin||(l==null?void 0:l.vin)||"").trim().toUpperCase();if(!m)return;if(u.state.currentModule==="TECNICO"){g("vin")&&(g("vin").value=m),ho(m);return}if(u.state.currentModule==="CALIDAD"){g("vinQ")&&(g("vinQ").value=m),go(m);return}}})}finally{u.state.currentModule=e}}function Ns(){ha("TECNICO"),ha("CALIDAD"),Ia("TECNICO"),Ia("CALIDAD")}const He={MIN_CHARS:1,LIMIT:12,DEBOUNCE_MS:200};let Ca=null,mt=[],Oe=!1,ot=-1,Aa="",Mt=null;function No(){return u.state.currentModule==="CALIDAD"?U("vinQ"):U("vin")}function gn(){return u.state.currentModule==="CALIDAD"?U("vinSuggestQ"):U("vinSuggest")}function Ht(){const t=gn();t&&(Oe=!1,ot=-1,mt=[],t.classList.add("hidden"),t.innerHTML="")}function Oo(){const t=gn();if(t){if(!mt.length){Ht();return}t.innerHTML=mt.map((e,a)=>`
      <div class="vsItem ${a===ot?"active":""}" data-idx="${a}" role="option" aria-selected="${a===ot}">
        <div class="vsVin">${T(e)}</div>
        <div class="vsHint">Enter</div>
      </div>
    `).join(""),t.classList.remove("hidden"),Oe=!0}}function _a(t){ot=Math.max(0,Math.min(t,mt.length-1)),Oo();const e=gn(),a=e==null?void 0:e.querySelector(`.vsItem[data-idx="${ot}"]`);a&&a.scrollIntoView({block:"nearest"})}async function Os(t){var o;try{(o=Mt==null?void 0:Mt.abort)==null||o.call(Mt)}catch{}Mt=new AbortController;const e=`/api/vin-suggest?q=${encodeURIComponent(t)}&limit=${encodeURIComponent(He.LIMIT)}`,n=await(await fetch(e,{signal:Mt.signal})).json();return n!=null&&n.ok?Array.isArray(n.items)?n.items:[]:[]}function Sa(){const t=No();if(!t)return;const e=String(t.value||"").trim().toUpperCase();if(Aa=e,!e||e.length<He.MIN_CHARS){Ht();return}clearTimeout(Ca),Ca=setTimeout(async()=>{try{const a=await Os(e);if(Aa!==e)return;mt=(a||[]).map(n=>String(n||"").toUpperCase()).filter(Boolean),ot=mt.length?0:-1,Oo()}catch{Ht()}},He.DEBOUNCE_MS)}function xo(t){const e=No();e&&(e.value=String(t||"").toUpperCase(),Ht(),Et({showOut:!1}).then(async()=>{await J(async()=>{await ve(e.value,Kt()),await et({forceFull:!1,showOut:!1}),await Et({showOut:!1})},"Iniciando automáticamente...")}).catch(()=>{}))}function Ra(t){if(Oe){if(t.key==="ArrowDown"){t.preventDefault(),_a(ot+1);return}if(t.key==="ArrowUp"){t.preventDefault(),_a(ot-1);return}if(t.key==="Enter"){ot>=0&&mt[ot]&&(t.preventDefault(),xo(mt[ot]));return}t.key==="Escape"&&(t.preventDefault(),Ht())}}function xs(){const t=g("vinSuggest"),e=g("vinSuggestQ");[t,e].forEach(a=>{a&&a.dataset.bound!=="1"&&(a.dataset.bound="1",a.addEventListener("mousedown",n=>{const o=n.target.closest(".vsItem[data-idx]");if(!o)return;n.preventDefault();const i=Number(o.dataset.idx),s=mt[i];s&&xo(s)}))}),document.body.dataset.vinSuggestDocBound||(document.body.dataset.vinSuggestDocBound="1",document.addEventListener("click",a=>{!Oe||[...document.querySelectorAll(".vinWrap")].some(i=>i.contains(a.target))||Ht()}))}function ks(){var t,e,a,n;xs(),(t=g("vin"))==null||t.addEventListener("input",()=>{u.state.currentModule==="TECNICO"&&(Sa(),dt(""),ze(650))}),(e=g("vin"))==null||e.addEventListener("keydown",o=>{u.state.currentModule==="TECNICO"&&Ra(o)}),(a=g("vinQ"))==null||a.addEventListener("input",()=>{u.state.currentModule==="CALIDAD"&&(Sa(),dt(""),ze(650))}),(n=g("vinQ"))==null||n.addEventListener("keydown",o=>{u.state.currentModule==="CALIDAD"&&Ra(o)})}const ge=Pt("qrReader");let ko="QR";function Ea(t){ko=t==="BAR"?"BAR":"QR"}async function La(){var e;if(!(u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD"))return;const t=g("qrModal");(e=t==null?void 0:t.classList)==null||e.add("show"),await We()}async function Ke(){var t,e;(e=(t=g("qrModal"))==null?void 0:t.classList)==null||e.remove("show"),await ge.stop()}async function We(){const t=g("qrMsg");try{await ge.start({mode:ko,msgEl:t,onDecoded:async e=>{const a=u.state.currentModule==="CALIDAD"?U("vinQ"):U("vin");a&&(a.value=e),t&&(t.textContent=`VIN detectado: ${e}`),await Ke(),await J(async()=>{await Et({showOut:!1}),await ve(e,Kt()),await et({forceFull:!0,showOut:!1}),await Et({showOut:!1})},"Iniciando automáticamente...")}})}catch{}}function Ds(){var t,e,a,n,o,i;(t=g("btnQR"))==null||t.addEventListener("click",La),(e=g("btnQRQ"))==null||e.addEventListener("click",La),(a=g("btnCloseQR"))==null||a.addEventListener("click",Ke),(n=g("qrModal"))==null||n.addEventListener("click",async s=>{s.target===g("qrModal")&&await Ke()}),(o=g("btnScanQR"))==null||o.addEventListener("click",async()=>{Ea("QR"),await J(async()=>{await ge.stop(),await We()},"Cambiando a QR...")}),(i=g("btnScanBar"))==null||i.addEventListener("click",async()=>{Ea("BAR"),await J(async()=>{await ge.stop(),await We()},"Cambiando a CÓDIGO DE BARRAS...")})}function le(){var o,i;if(!Ze())return;const t=F(),e=Date.now();if((i=(o=U("activasBox"))==null?void 0:o.querySelectorAll(".jobCard[data-key] .js-tiempo"))==null||i.forEach(s=>{const r=s.closest(".jobCard");if(!r)return;const c=r.dataset.key||"",l=t.itemsByKey.get(c);l&&(s.textContent=`⏱ ${kt(Ut(l,e))}`)}),u.state.currentModule==="RAMALERO")return;const a=Ce(),n=Kt();if(a&&n){const s=[...t.itemsByKey.values()].find(r=>String(r.vin||"").toUpperCase()===a&&String(r.rolTrabajo||"").toUpperCase()===n);s&&dt(`Estado: ${s.estado} | Tiempo: ${kt(Ut(s,e))}`)}}function Us(){var t,e,a,n;Ls(),ks(),Ds(),fs(),Ss(),gs(),bs(async()=>{await et({forceFull:!0,showOut:!1})}),ms(),vs(),Ns(),(t=g("btnActivas"))==null||t.addEventListener("click",async()=>{u.state.currentModule==="TECNICO"&&await J(async()=>et({forceFull:!0,showOut:!0,_fromLock:!0}),"Refrescando...")}),(e=g("btnFinalizados"))==null||e.addEventListener("click",async()=>{u.state.currentModule==="TECNICO"&&await J(async()=>{const o=F();if(o.showFinalizados=!o.showFinalizados,U("btnFinalizados").textContent=o.showFinalizados?"Ocultar finalizados":"Ver finalizados",o.showFinalizados&&!o._finalizadosLoaded){let i;try{i=St()}catch{return}const s=await ga(i);if(s!=null&&s.ok&&Array.isArray(s.items)){const{normalizeItem_:r}=await ca(async()=>{const{normalizeItem_:c}=await Promise.resolve().then(()=>va);return{normalizeItem_:c}},void 0);for(const c of s.items){const l=r(c),d=`${l.conversionId}|${l.rolTrabajo}`;o.itemsByKey.set(d,l)}Rt(),o._finalizadosLoaded=!0}}it()},"Cargando finalizados...")}),(a=g("btnActivasQ"))==null||a.addEventListener("click",async()=>{u.state.currentModule==="CALIDAD"&&await J(async()=>et({forceFull:!0,showOut:!0,_fromLock:!0}),"Refrescando...")}),(n=g("btnFinalizadosQ"))==null||n.addEventListener("click",async()=>{u.state.currentModule==="CALIDAD"&&await J(async()=>{const o=F();if(o.showFinalizados=!o.showFinalizados,U("btnFinalizadosQ").textContent=o.showFinalizados?"Ocultar finalizados":"Ver finalizados",o.showFinalizados&&!o._finalizadosLoaded){let i;try{i=St()}catch{return}const s=await ga(i);if(s!=null&&s.ok&&Array.isArray(s.items)){const{normalizeItem_:r}=await ca(async()=>{const{normalizeItem_:c}=await Promise.resolve().then(()=>va);return{normalizeItem_:c}},void 0);for(const c of s.items){const l=r(c),d=`${l.conversionId}|${l.rolTrabajo}`;o.itemsByKey.set(d,l)}Rt(),o._finalizadosLoaded=!0}}it()},"Cargando finalizados...")})}function Do(t){u.state.currentModule=t,Ro(t,{syncNow:et,tickClocksUI:le,refreshEstadoForVinRole:Et})}function be(t){pn(t),_o(t)}async function $s(){var o;const t=g("ramalId");t&&(t.value="");let e;try{e=St()}catch{return}const a=String(((o=g("tipoRamal"))==null?void 0:o.value)||"").trim();if(!a){K({ok:!1,error:"Selecciona tipo de ramal"});return}const n=await _e("/api/evento",{email:e,rolTrabajo:"RAMALERO",accion:"INICIO",tipoRamal:a},"Iniciando...");K(n),n!=null&&n.ok&&(await et({forceFull:!0,showOut:!1}),Rt(),$t(),it())}async function Fs(t,e,a=""){var r;let n;try{n=St()}catch{return}const o=String((t==null?void 0:t.tipoRamal)||((r=g("tipoRamal"))==null?void 0:r.value)||"").trim(),i={email:n,rolTrabajo:"RAMALERO",accion:e,conversionId:String((t==null?void 0:t.conversionId)||"").trim(),tipoRamal:o,nota:a},s=await _e("/api/evento",i,`Enviando ${e}...`);K(s),s!=null&&s.ok&&(await et({forceFull:!0,showOut:!1}),Rt(),$t(),it())}let Ma=!1;function Bs(){var t,e,a;Ma||(Ma=!0,(t=g("btnActivasR"))==null||t.addEventListener("click",async()=>{u.state.currentModule==="RAMALERO"&&await J(async()=>et({forceFull:!0,showOut:!0,_fromLock:!0}),"Refrescando...")}),(e=g("btnFinalizadosR"))==null||e.addEventListener("click",async()=>{u.state.currentModule==="RAMALERO"&&await J(async()=>{const n=F();n.showFinalizados=!n.showFinalizados;const o=U("btnFinalizados");o&&(o.textContent=n.showFinalizados?"Ocultar finalizados":"Ver finalizados"),it()},"Cargando finalizados...")}),(a=g("btnRamalNuevo"))==null||a.addEventListener("click",async()=>{u.state.currentModule==="RAMALERO"&&await $s()}))}let Ta=!1;function lt(t,e){return t!=null&&t.closest?t.closest(e):null}function ws(){Ta||(Ta=!0,document.addEventListener("click",async t=>{var i;if(u.state.currentModule!=="RAMALERO")return;const e=U("activasBox");if(!e)return;const a=t.target,n=lt(a,"button[data-act]");if(n&&e.contains(n)){t.preventDefault(),t.stopPropagation();const s=lt(n,".jobCard[data-key]"),r=((i=s==null?void 0:s.dataset)==null?void 0:i.key)||"";if(!r)return;const c=F().itemsByKey.get(r);if(!c)return;const l=String(n.dataset.act||"").toUpperCase();if(!l)return;let d="";if(l==="NOTA"){const f=s.querySelector("textarea.notaCard");d=String((f==null?void 0:f.value)||"").trim()}if(l==="FIN"&&!await Co({title:"Confirmar finalización",message:"¿Seguro que quieres finalizar este ramal? Esta acción puede cerrar la tarea actual.",acceptText:"Sí, finalizar",cancelText:"Cancelar"}))return;await Fs(c,l,d);return}const o=lt(a,".jobCard");if(o&&e.contains(o)){if(lt(a,"button")||lt(a,"textarea")||lt(a,"input")||lt(a,"select")||lt(a,"a"))return;o.classList.toggle("open")}}),document.addEventListener("input",t=>{if(u.state.currentModule!=="RAMALERO")return;const e=U("activasBox");if(!e)return;const a=lt(t.target,"textarea.notaCard");if(!a||!e.contains(a))return;const n=lt(a,".jobCard");if(!n)return;const o=n.querySelector("button.btnNota[data-act='NOTA']");if(!o)return;const i=String(a.value||"").trim().length>0;o.style.display=i?"block":"none"}))}function qs(){Bs(),ws()}function Vs(){u.state.currentModule="RAMALERO",Ro("RAMALERO",{syncNow:et,tickClocksUI:()=>{le==null||le(),se==null||se()}})}function Uo(){pn("RAMALERO"),_o("RAMALERO")}function ye(t){const e=[...t].sort((o,i)=>o-i),a=e.length;if(!a)return 0;const n=Math.floor(a/2);return a%2?e[n]:(e[n-1]+e[n])/2}function $o(t,e){const a=t.map(n=>Math.abs(n-e));return ye(a)}function Qs(t,e,a,n=2.5){const o=a,i=Math.abs(t-e)/o;if(i<=n)return 1;const s=i-n;return 1/(1+s*s)}function Fo(t){const e=String(t||"").toUpperCase();return e==="CALIDAD"?"CALIDAD":e==="RAMAL"||e==="RAMALERO"?"RAMAL":"CONVERSION"}function Bo(t){const e=String(t||"").toUpperCase();return e==="TANQUE"||e==="TANQUERO"?"TANQUE":e==="MOTOR"?"MOTOR":e==="RAMAL"||e==="RAMALERO"?"RAMAL":e==="CALIDAD"?"CALIDAD":e==="TECNICO"||e==="CONVERSION"?"MOTOR":e||"UNKNOWN"}function wo(t){return String(t||"").trim().toUpperCase()||"ALL"}function de(t){return Number.isFinite(t)&&t>0}function Ps(t,e){const a=new Map;function n(i,s){de(s)&&(a.has(i)||a.set(i,[]),a.get(i).push(s))}for(const i of t||[]){const s=Number(e(i)||0);if(!de(s))continue;const r=Fo(i.track||i.trackType||i.modulo||i.area||i._track),c=Bo(i.rol||i.rolTrabajo),l=wo(i.marca||i.brand);n("GLOBAL",s),n(`T:${r}`,s),n(`T:${r}|R:${c}`,s),n(`T:${r}|M:${l}`,s),n(`T:${r}|R:${c}|M:${l}`,s)}const o=new Map;for(const[i,s]of a.entries()){const r=s.filter(de);if(!r.length)continue;const c=ye(r),l=$o(r,c)||1;o.set(i,{key:i,count:r.length,medianMs:c,madMs:l})}return o}function js(t,e={},a=4){var c,l;const n=Fo(e.track),o=Bo(e.rol),i=wo(e.marca),s=[{key:`T:${n}|R:${o}|M:${i}`,level:"track+rol+marca"},{key:`T:${n}|R:${o}`,level:"track+rol"},{key:`T:${n}|M:${i}`,level:"track+marca"},{key:`T:${n}`,level:"track"},{key:"GLOBAL",level:"global"}];for(const d of s){const f=(c=t==null?void 0:t.get)==null?void 0:c.call(t,d.key);if(f&&Number(f.count||0)>=a)return{found:!0,key:d.key,level:d.level,count:f.count,priorMs:f.medianMs,priorMadMs:f.madMs||1}}const r=(l=t==null?void 0:t.get)==null?void 0:l.call(t,"GLOBAL");return r?{found:!0,key:"GLOBAL",level:"global-fallback",count:r.count,priorMs:r.medianMs,priorMadMs:r.madMs||1}:{found:!1,key:"",level:"none",count:0,priorMs:0,priorMadMs:1}}function zs(t,e=2.5){const a=(t||[]).filter(de);if(!a.length)return{avgMs:0,medianMs:0,madMs:0,used:0,total:0,sumW:0,minW:0,maxW:0};if(a.length<3)return{avgMs:a.reduce((f,b)=>f+b,0)/a.length,medianMs:ye(a),madMs:0,used:a.length,total:a.length,sumW:a.length,minW:1,maxW:1};const n=ye(a),o=$o(a,n)||1;let i=0,s=0,r=1/0,c=-1/0;for(const d of a){const f=Qs(d,n,o,e);i+=f,s+=f*d,f<r&&(r=f),f>c&&(c=f)}return{avgMs:i>0?s/i:n,medianMs:n,madMs:o,used:a.length,total:a.length,sumW:i,minW:Number.isFinite(r)?r:0,maxW:Number.isFinite(c)?c:0}}function Hs(t,e,a={}){const{k:n=2.5,priorWeight:o=6}=a,i=zs(t,n),s=Number((e==null?void 0:e.priorMs)||0);if(!(Number.isFinite(s)&&s>0))return{...i,rawRobustMs:i.avgMs,priorMs:0,priorWeight:0,priorLevel:"none",priorCount:0,source:"local-only"};const c=i.used>=12?Math.max(2,o*.45):i.used>=8?Math.max(3,o*.65):i.used>=4?Math.max(4,o*.85):Math.max(6,o*1.25),l=(i.avgMs*(i.sumW||i.used||1)+s*c)/((i.sumW||i.used||1)+c);return{...i,avgMs:l,rawRobustMs:i.avgMs,priorMs:s,priorWeight:c,priorLevel:(e==null?void 0:e.level)||"unknown",priorCount:Number((e==null?void 0:e.count)||0),priorKey:(e==null?void 0:e.key)||"",source:"local+context-prior"}}function he(t){const e=Math.max(0,Math.floor(t/1e3)),a=Math.floor(e/3600),n=Math.floor(e%3600/60),o=e%60,i=s=>String(s).padStart(2,"0");return`${a}h ${i(n)}m ${i(o)}s`}function It(t){const e=Number((t==null?void 0:t.tiempo_ms)??0);return Number.isFinite(e)&&e>0?e:0}function ue(t){const e=String(t||"").trim().toUpperCase();return e==="FINALIZADO"||e==="FIN"||e==="COMPLETADO"}function Ks(t){const e=String(t||"").toUpperCase();return e?e.includes("TE")?"KYC":e.includes("TT")?"VW":"JETOUR":"JETOUR"}function Ws(t,e){const a=String(e||"ALL").toUpperCase();if(!a||a==="ALL")return!0;const n=String(t.rol||t.rolTrabajo||"").toUpperCase();if(n==="RAMALERO"||n==="RAMAL")return!0;const i=Ks(t.vin);return a===i}function Gs(t){const e=String(t||"").toUpperCase();return e==="MOTOR"||e==="TANQUE"||e==="TANQUERO"}function Ys(t){var n,o;const e=new Map;for(const i of t){const s=String(i.rol||i.rolTrabajo||"").toUpperCase();if(!Gs(s)){const m=`RAW|${Math.random()}`;e.set(m,{_kind:"raw",it:i});continue}const r=String(i.vin||"").trim().toUpperCase();if(!r){const m=`NOVIN|${i.workId||""}|${s}|${Math.random()}`;e.set(m,{_kind:"raw",it:i});continue}const c=e.get(r)||{_kind:"group",vin:r,estado:"SIN_DATO",motor:null,tanque:null,sortTs:0};s==="MOTOR"?c.motor=i:c.tanque=i;const l=String(((n=c.motor)==null?void 0:n.estado)||"").toUpperCase(),d=String(((o=c.tanque)==null?void 0:o.estado)||"").toUpperCase(),f=[l,d].filter(Boolean);f.includes("FINALIZADO")||f.includes("FIN")||f.includes("COMPLETADO")?c.estado="FINALIZADO":f.includes("TRABAJANDO")?c.estado="TRABAJANDO":f.includes("PAUSADO")?c.estado="PAUSADO":c.estado=f[0]||"SIN_DATO";const b=Date.parse(String(i.updated_at||""))||0,y=Date.parse(String(i.fecha_asignacion||i.fecha_inicio||""))||0;c.sortTs=Math.max(c.sortTs,b,y),e.set(r,c)}const a=Array.from(e.values());return a.sort((i,s)=>(s.sortTs||0)-(i.sortTs||0)),a}function Js(t,{stats:e,techName:a,motorCount:n,tanqueCount:o,escapeHtml:i}){if(t)if((e==null?void 0:e.used)>0){const s=String(a).toUpperCase();t.innerHTML=`
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
              ${i(he(e.avgMs))}
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
    `}function Zs(t,{uiList:e,escapeHtml:a,fmtShort_:n}){t&&(t.innerHTML=e.map(o=>o&&o._kind==="group"?Xs(o,{escapeHtml:a,fmtShort_:n}):tr(o,{escapeHtml:a,fmtShort_:n})).join(""))}function Xs(t,{escapeHtml:e,fmtShort_:a}){const n=t.vin||"-",o=t.motor,i=t.tanque,s=(o==null?void 0:o.userName)||(o==null?void 0:o.userEmail)||(o==null?void 0:o.userId)||"-",r=(i==null?void 0:i.userName)||(i==null?void 0:i.userEmail)||(i==null?void 0:i.userId)||"-",c=o&&It(o)?he(It(o)):"-",l=i&&It(i)?he(It(i)):"-",d=o?a(o.fecha_inicio||o.fecha_asignacion||""):"",f=o?a(o.updated_at||""):"",b=i?a(i.fecha_inicio||i.fecha_asignacion||""):"",y=i?a(i.updated_at||""):"",m=String((o==null?void 0:o.workId)||(i==null?void 0:i.workId)||"").trim();return`
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
          <b>Inicio:</b> ${e(d)} &nbsp;|&nbsp; <b>Fin:</b> ${e(f)}
        </div>
      </div>

      <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.14);">
        <div class="small" style="font-weight:900;">TANQUE: ${e(r)}</div>
        <div class="small" style="margin-top:6px;"><b>Duración:</b> ${e(l)}</div>
        <div class="small" style="margin-top:6px;">
          <b>Inicio:</b> ${e(b)} &nbsp;|&nbsp; <b>Fin:</b> ${e(y)}
        </div>
      </div>

      ${m?`
            <div class="row" style="margin-top:10px; gap:10px;">
              <button
                type="button"
                class="btn3"
                data-sup-inc="1"
                data-vin="${e(n)}"
                data-cid="${e(m)}"
                data-who="${e("VIN "+n)}"
              >
                📋 Incidencias
              </button>
            </div>
          `:""}
    </div>
  `}function tr(t,{escapeHtml:e,fmtShort_:a}){const n=(t==null?void 0:t.userName)||(t==null?void 0:t.userEmail)||(t==null?void 0:t.userId)||"-",o=String((t==null?void 0:t.rol)||(t==null?void 0:t.rolTrabajo)||"").toUpperCase()||"-",i=o==="RAMALERO"||o==="RAMAL",s=i?`RAMAL: ${(t==null?void 0:t.tipoRamal)||"-"}`:(t==null?void 0:t.vin)||"-",r=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),c=String((t==null?void 0:t.workId)||(t==null?void 0:t.conversionId)||(t==null?void 0:t.conversion_id)||"").trim(),l=It(t),d=l?he(l):"-";return`
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
  `}const qo=Pt("qrReader");async function er({onDecodedDone:t}){var a;const e=document.getElementById("qrModal");(a=e==null?void 0:e.classList)==null||a.add("show"),await nr({onDecodedDone:t})}async function Ge(){var t,e;(e=(t=document.getElementById("qrModal"))==null?void 0:t.classList)==null||e.remove("show"),await qo.stop()}async function nr({onDecodedDone:t}){const e=document.getElementById("qrMsg");try{await qo.start({mode:"QR",msgEl:e,onDecoded:async a=>{const n=document.getElementById("supVin");n&&(n.value=a),e&&(e.textContent=`VIN detectado: ${a}`),await Ge();try{await(t==null?void 0:t(a))}catch{}}})}catch{}}function ar({CORE:t,onApply:e}){var a,n,o;(a=document.getElementById("btnSupQR"))==null||a.addEventListener("click",()=>{t.state.currentModule==="SUPERVISOR"&&er({onDecodedDone:()=>e==null?void 0:e()}).catch(()=>{})}),(n=document.getElementById("btnCloseQR"))==null||n.addEventListener("click",()=>Ge()),(o=document.getElementById("qrModal"))==null||o.addEventListener("click",async i=>{i.target===document.getElementById("qrModal")&&await Ge()})}function or({CORE:t,escapeHtml:e,onApply:a}){const n={MIN_CHARS:3,DEBOUNCE_MS:750,LIMIT:12};let o=null,i=null,s=[],r=!1,c=-1,l="";function d(){return document.getElementById("supNameSuggest")}function f(){const R=d();R&&(r=!1,c=-1,s=[],R.classList.add("hidden"),R.innerHTML="")}function b(){const R=d();if(R){if(!s.length)return f();R.innerHTML=s.map((x,q)=>{const W=q===c?"active":"",D=x.name||x.email||x.id||"",w=x.email?x.email:"";return`
        <div class="vsItem ${W}" data-idx="${q}" role="option" aria-selected="${q===c}">
          <div class="vsVin">${e(D)}</div>
          <div class="vsHint">${e(w)}</div>
        </div>
      `}).join(""),R.classList.remove("hidden"),r=!0}}function y(R){c=Math.max(0,Math.min(R,s.length-1)),b();const x=d(),q=x==null?void 0:x.querySelector(`.vsItem[data-idx="${c}"]`);q&&q.scrollIntoView({block:"nearest"})}async function m(R){var w;try{(w=i==null?void 0:i.abort)==null||w.call(i)}catch{}i=new AbortController;const x=`/api/name-suggest?q=${encodeURIComponent(R)}&limit=${encodeURIComponent(n.LIMIT)}`,W=await(await fetch(x,{signal:i.signal})).json();return W!=null&&W.ok?(Array.isArray(W.items)?W.items:[]).map(gt=>typeof gt=="string"?{name:gt}:gt).filter(Boolean):[]}function C(R){const x=document.getElementById("supName");if(!x)return;const q=String((R==null?void 0:R.name)||(R==null?void 0:R.email)||(R==null?void 0:R.id)||"").trim();x.value=q,f(),a==null||a()}function L(){if(t.state.currentModule!=="SUPERVISOR")return;const R=document.getElementById("supName");if(!R)return;const x=String(R.value||"").trim();if(l=x,!x||x.length<n.MIN_CHARS){f();return}clearTimeout(o),o=setTimeout(async()=>{try{const q=await m(x);if(l!==x)return;s=q,c=s.length?0:-1,b()}catch{f()}},n.DEBOUNCE_MS)}function j(R){if(t.state.currentModule==="SUPERVISOR"){if(R.key==="Enter"){R.preventDefault(),f(),a==null||a();return}if(r){if(R.key==="ArrowDown")return R.preventDefault(),y(c+1);if(R.key==="ArrowUp")return R.preventDefault(),y(c-1);if(R.key==="Escape")return R.preventDefault(),f();R.key==="Tab"&&c>=0&&s[c]&&(R.preventDefault(),C(s[c]))}}}const at=document.getElementById("supName"),ut=document.getElementById("supNameSuggest");at==null||at.addEventListener("input",L),at==null||at.addEventListener("keydown",j),ut==null||ut.addEventListener("mousedown",R=>{const x=R.target.closest(".vsItem[data-idx]");if(!x)return;R.preventDefault();const q=Number(x.dataset.idx),W=s[q];W&&C(W)}),document.addEventListener("click",R=>{if(!r)return;const x=document.querySelector(".supNameWrap");x&&x.contains(R.target)||f()})}function Ye(t){return String(t).padStart(2,"0")}function Na(t){const e=t.getFullYear(),a=Ye(t.getMonth()+1),n=Ye(t.getDate());return`${e}-${a}-${n}`}function ir(t){const e=t.getFullYear(),a=Ye(t.getMonth()+1);return`${e}-${a}`}function sr({onApply:t}){var e,a,n;(e=document.getElementById("btnSupHoy"))==null||e.addEventListener("click",()=>{const i=Na(new Date),s=document.getElementById("supFrom"),r=document.getElementById("supTo");s&&(s.value=i),r&&(r.value=i);const c=document.getElementById("supMonth");c&&(c.value=""),t==null||t()}),(a=document.getElementById("btnSupAyer"))==null||a.addEventListener("click",()=>{const o=new Date;o.setDate(o.getDate()-1);const i=Na(o),s=document.getElementById("supFrom"),r=document.getElementById("supTo");s&&(s.value=i),r&&(r.value=i);const c=document.getElementById("supMonth");c&&(c.value=""),t==null||t()}),(n=document.getElementById("btnSupEsteMes"))==null||n.addEventListener("click",()=>{const i=ir(new Date),s=document.getElementById("supMonth");s&&(s.value=i);const r=document.getElementById("supFrom"),c=document.getElementById("supTo");r&&(r.value=""),c&&(c.value=""),t==null||t()})}let Ct="CONVERSION",rr=null;function cr(t){Ct=t==="CALIDAD"||t==="RAMAL"?t:"CONVERSION",document.querySelectorAll("[data-suptrack]").forEach(a=>a.classList.toggle("active",a.dataset.suptrack===Ct));const e=document.getElementById("supTrackPill");e&&(e.textContent=Ct==="CONVERSION"?"CONVERSIÓN (MOTOR + TANQUE)":Ct==="CALIDAD"?"CALIDAD":"RAMAL"),ht().catch(()=>{})}async function ht(){var c,l,d,f,b;const t=String(((c=document.getElementById("supName"))==null?void 0:c.value)||"").trim(),e=String(((l=document.getElementById("supVin"))==null?void 0:l.value)||"").trim().toUpperCase(),a=String(((d=document.getElementById("supFrom"))==null?void 0:d.value)||"").trim(),n=String(((f=document.getElementById("supTo"))==null?void 0:f.value)||"").trim(),o=String(((b=document.getElementById("supMonth"))==null?void 0:b.value)||"").trim(),i=[t,e].filter(Boolean).join(" ").trim(),s=`/api/supervisor/report?name=${encodeURIComponent(t)}&vin=${encodeURIComponent(e)}&q=${encodeURIComponent(i)}&from=${encodeURIComponent(a)}&to=${encodeURIComponent(n)}&month=${encodeURIComponent(o)}&track=${encodeURIComponent(Ct)}`,r=await Ae(s,"Cargando reporte...");if(!(r!=null&&r.ok)){const y=document.getElementById("supSummary");y&&(y.textContent=(r==null?void 0:r.error)||"Error cargando reporte.");const m=document.getElementById("supTable");m&&(m.innerHTML="");const C=document.getElementById("supAvgCard");C&&(C.innerHTML="");return}lr(r)}function lr(t){var q,W;const e=document.getElementById("supSummary"),a=document.getElementById("supTable"),n=document.getElementById("supAvgCard"),o=Array.isArray(t.items)?t.items:[],i=String(((q=document.getElementById("supMarca"))==null?void 0:q.value)||"ALL").toUpperCase(),r=o.filter(D=>Ws(D,i)),c=String(((W=document.getElementById("supName"))==null?void 0:W.value)||"").trim(),d=!!!c&&Ct==="CONVERSION"?Ys(r):r,b=o.filter(D=>{const w=String(D.rol||D.rolTrabajo||"").toUpperCase();return w==="RAMALERO"||w==="RAMAL"||!ue(D.estado)?!1:It(D)>0}).map(D=>({...D,_track:Ct})),y=Ps(b,It),m=[],C=new Set;for(const D of r){const w=String(D.rol||D.rolTrabajo||"").toUpperCase();if(w==="RAMALERO"||w==="RAMAL"||!ue(D.estado))continue;const ie=It(D);ie>0&&(m.push(ie),C.add(w))}let L="";C.size===1&&(L=[...C][0]);const j=js(y,{track:Ct,rol:L,marca:i},4),at=Hs(m,j,{priorWeight:6,k:2.1}),ut=c||"Técnico";let R=0,x=0;for(const D of r){if(!ue(D.estado))continue;const w=String(D.rol||D.rolTrabajo||"").toUpperCase();w==="TANQUE"||w==="TANQUERO"?x++:(w==="MOTOR"||w==="TECNICO"||w==="CONVERSION")&&R++}if(Js(n,{stats:at,techName:ut,motorCount:R,tanqueCount:x,escapeHtml:T}),!!a){if(!r.length){e&&(e.textContent="Resultados: 0"),n&&(n.innerHTML=""),a.innerHTML='<div class="small">No hay resultados con esos filtros.</div>';return}e&&(e.textContent=`Resultados: ${r.length}`),Zs(a,{uiList:d,escapeHtml:T,fmtShort_:xt})}}function dr(){var t,e,a;document.querySelectorAll("[data-suptrack]").forEach(n=>n.addEventListener("click",()=>cr(n.dataset.suptrack))),(t=document.getElementById("btnSupApply"))==null||t.addEventListener("click",()=>ht().catch(()=>{})),(e=document.getElementById("supMarca"))==null||e.addEventListener("change",()=>{u.state.currentModule==="SUPERVISOR"&&ht().catch(()=>{})}),(a=document.getElementById("btnSupClear"))==null||a.addEventListener("click",()=>{["supName","supVin","supFrom","supTo","supMonth"].forEach(n=>{const o=document.getElementById(n);o&&(o.value="")}),ht().catch(()=>{})}),Ts({CORE:u,getJSON_user:Ae,escapeHtml:T,fmtShort_:xt}),sr({onApply:()=>ht().catch(()=>{})}),ar({CORE:u,onApply:()=>ht().catch(()=>{})}),or({CORE:u,escapeHtml:T,onApply:()=>ht().catch(()=>{})})}function ur(){u.state.currentModule="SUPERVISOR",window.__nameSuggestWarmed||(window.__nameSuggestWarmed=!0,fetch("/api/name-suggest?q=.&limit=200").catch(()=>{})),ht().catch(()=>{})}function pr(){clearTimeout(rr)}function fr(){u.state.currentModule="ADMIN"}let mr=null;function vr(t){return String(t||"").trim().toUpperCase()}function Oa(t){return vr((t==null?void 0:t.vin)||(t==null?void 0:t.chasis_id)||(t==null?void 0:t.chasisId)||(t==null?void 0:t.VIN)||(t==null?void 0:t.CHASIS_ID))}function Vt(t){if(!t)return NaN;const e=Date.parse(t);return Number.isFinite(e)?e:NaN}function gr(t){return Vt(t==null?void 0:t.fecha_fin)||Vt(t==null?void 0:t.updated_at)||Vt(t==null?void 0:t.fechaFin)||Vt(t==null?void 0:t.fecha_inicio)||Vt(t==null?void 0:t.created_at)||Vt(t==null?void 0:t.fecha_creacion)||NaN}function br(t){const e=(t==null?void 0:t.fecha_fin)||(t==null?void 0:t.updated_at)||(t==null?void 0:t.fechaFin)||(t==null?void 0:t.fecha_inicio)||(t==null?void 0:t.created_at)||(t==null?void 0:t.fecha_creacion)||"";return e?xt(e):"—"}async function xa(t){const e=`/api/supervisor/report?name=&vin=&q=&from=&to=&month=&track=${encodeURIComponent(t)}`,a=await Ae(e,`Cargando ${t}...`);if(!(a!=null&&a.ok))throw new Error((a==null?void 0:a.error)||`No se pudo cargar ${t}`);return Array.isArray(a.items)?a.items:[]}function yr(t,e=[]){const a=new Set;for(const i of e){const s=Oa(i);s&&a.add(s)}const n=new Map;for(const i of t){const s=Oa(i);if(!s||!ue(i==null?void 0:i.estado))continue;const r=gr(i),c=n.get(s);(!c||r>c._sortMs)&&n.set(s,{vin:s,fechaLabel:br(i),_sortMs:Number.isFinite(r)?r:0})}const o=[];for(const i of n.values())a.has(i.vin)||o.push(i);return o.sort((i,s)=>i._sortMs-s._sortMs),o}function hr(t,e={}){const a=document.getElementById("movSummary"),n=document.getElementById("movTable");if(!n)return;const o=e!=null&&e.warn?`
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
  `}async function Vo(){const t=document.getElementById("movSummary"),e=document.getElementById("movTable");try{t&&(t.textContent="Cargando pendientes..."),e&&(e.innerHTML="");const a=await xa("CONVERSION");let n=[],o="";try{n=await xa("CALIDAD")}catch(s){console.warn("MOVILIZADOR: no se pudo cargar CALIDAD",s),o="No se pudo validar CALIDAD. Se muestran conversiones finalizadas sin excluir registros de calidad."}const i=yr(a,n);hr(i,{warn:o})}catch(a){t&&(t.textContent=(a==null?void 0:a.message)||"Error cargando vista MOVILIZADOR."),e&&(e.innerHTML="")}}function Ir(){var t;(t=document.getElementById("btnMovRefresh"))==null||t.addEventListener("click",()=>{Vo().catch(()=>{})})}function Cr(){u.state.currentModule="MOVILIZADOR",Vo().catch(()=>{})}function Qo(){clearTimeout(mr)}const ka=document.getElementById("appRoot");ka&&(ka.innerHTML=yi());async function Po(t){if(!t)return pe("Pon tu email.");const e=await Ae(`/api/me?email=${encodeURIComponent(t)}`,"Iniciando sesión...");if(!(e!=null&&e.ok))return pe((e==null?void 0:e.error)||"No se pudo iniciar sesión.");u.state.currentProfile=e.profile,Ei(t),Si(),_i(),Ai(),u.state.rolLock=Ri(u.state.currentProfile),Ie();const a=Va(u.state.currentProfile);Ii(),a.length>1?(Bt(),qa(a,n=>Je(n)),u.state.currentModule=null):Je(a[0])}function Je(t){wt(),Lt(t),u.state.currentModule=t,Bt();const e=document.getElementById(`view${t}`);e&&(e.style.display="block");const a=g("viewHub");a&&(a.style.display="none"),Ie()}Lt.register("TECNICO",()=>Do("TECNICO"),()=>be("TECNICO"));Lt.register("CALIDAD",()=>Do("CALIDAD"),()=>be("CALIDAD"));Lt.register("RAMALERO",()=>Vs(),()=>Uo());Lt.register("SUPERVISOR",()=>ur(),()=>pr());Lt.register("ADMIN",()=>fr(),()=>void 0);Lt.register("MOVILIZADOR",()=>Cr(),()=>Qo());Us();qs();dr();Ir();Xa();var Da;(Da=g("btnTheme"))==null||Da.addEventListener("click",Oi);var Ua;(Ua=g("btnRegistroFallas"))==null||Ua.addEventListener("click",()=>{var e,a,n,o,i,s;Bt(),g("viewHub")&&(g("viewHub").style.display="none");const t=((a=(e=g("vin"))==null?void 0:e.value)==null?void 0:a.trim())||((o=(n=g("vinQ"))==null?void 0:n.value)==null?void 0:o.trim())||((s=(i=g("supVin"))==null?void 0:i.value)==null?void 0:s.trim())||"";en({vin:t,screen:"menu"})});var $a;($a=g("btnGoHome"))==null||$a.addEventListener("click",()=>{const t=Va(u.state.currentProfile);wt(),Bt(),qa(t,e=>Je(e)),u.state.currentModule=null});var Fa;(Fa=g("btnMe"))==null||Fa.addEventListener("click",async()=>{const t=Zt();await Po(t)});var Ba;(Ba=g("btnLogout"))==null||Ba.addEventListener("click",()=>{var t,e,a;Mi(),g("email").value="",u.state.currentProfile=null,u.state.currentModule=null,be("TECNICO"),be("CALIDAD"),Uo(),Qo(),Bt(),g("viewHub").style.display="none",(t=g("btnGoHome"))==null||t.classList.add("hidden"),(e=document.getElementById("debugWrap"))==null||e.classList.add("debug-hidden"),(a=document.getElementById("viewUploader"))!=null&&a.style&&(document.getElementById("viewUploader").style.display="none"),pe("Sesión cerrada.")});window.addEventListener("load",async()=>{Ti();const t=Li();if(!t)return pe("");g("email").value=t,await Po(t)});
