(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))n(o);new MutationObserver(o=>{for(const i of o)if(i.type==="childList")for(const s of i.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&n(s)}).observe(document,{childList:!0,subtree:!0});function a(o){const i={};return o.integrity&&(i.integrity=o.integrity),o.referrerPolicy&&(i.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?i.credentials="include":o.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(o){if(o.ep)return;o.ep=!0;const i=a(o);fetch(o.href,i)}})();function vi(){return`
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
  `}function gi(){return`
    <!-- HUB -->
    <div id="viewHub" class="card" style="display:none;">
      <h3>Selecciona un módulo</h3>
      <div id="hubButtons" class="row menu"></div>
      <div class="small">Si tienes varios permisos, puedes cambiar de módulo cuando quieras.</div>
    </div>
  `}function bi(){return`
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
  `}function yi(){return`
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
              <option value="VOLKSWAGEN">VOLKSWAGEN</option>
              <option value="KYC V3">KYC V3</option>
              <option value="KYC V5">KYC V5</option>
              <option value="KYC V7">KYC V7</option>
              <option value="KYC X5">KYC X5</option>
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
  `}function hi(){return`
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
  `}function _i(){return`
    <!-- ADMIN -->
    <div id="viewADMIN" class="card" style="display:none;">
      <h3>Admin</h3>
      <div class="small">Aquí irá la vista Admin.</div>
    </div>
  `}function Ii(){return`
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
  `}function Ci(){return`
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
  `}function Si(){return`
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
            <input id="supVin" type="text" placeholder="Buscar por VIN..." autocomplete="off" />
            <div id="supVinSuggest" class="vinSuggest hidden" role="listbox"></div>
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
  `}function Ai(){return`
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
  `}function Ei(){return`
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
  `}function Ri(){return`
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
  `}function Ti(){return`
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
  `}function Li(){return`
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
  `}function Mi(){return`
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
  `}function Ni(){return`
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
  `}function Oi(){return`
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
  `}function ki(){return`
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
  `}function xi(){return`
    ${vi()}

    <!-- =========================
         APP
         ========================= -->
    <div id="viewApp" style="display:none;">
      ${Ei()}

      ${gi()}
      ${bi()}
      ${yi()}
      ${hi()}

      <!-- MOVILIZADOR (stub como lo tenías) -->
      ${Ci()}

      ${Si()}
      ${_i()}
      ${Ii()}
    </div>

    ${Ri()}
    ${Mi()}
    ${Ti()}
    ${Li()}
    ${Ni()}
    ${Oi()}
    ${ki()}
    ${Ai()}
  `}const Ya=["TECNICO","RAMALERO","CALIDAD","MOVILIZADOR","SUPERVISOR","ADMIN"],p={state:{rolLock:null,currentProfile:null,currentModule:null,uiLocked:!1,storeByModule:{TECNICO:{itemsByKey:new Map,activeKeys:[],finalKeys:[],lastSyncSince:null,lastSyncRev:null,lastSyncAtMs:0,showFinalizados:!1},CALIDAD:{itemsByKey:new Map,activeKeys:[],finalKeys:[],lastSyncSince:null,lastSyncRev:null,lastSyncAtMs:0,showFinalizados:!1},RAMALERO:{itemsByKey:new Map,activeKeys:[],finalKeys:[],lastSyncSince:null,lastSyncRev:null,lastSyncAtMs:0,showFinalizados:!1}}}};function F(){const t=p.state.currentModule;return t==="CALIDAD"?p.state.storeByModule.CALIDAD:t==="RAMALERO"?p.state.storeByModule.RAMALERO:p.state.storeByModule.TECNICO}function un(){const t=p.state.currentModule;return t==="TECNICO"||t==="CALIDAD"||t==="RAMALERO"}const y=t=>document.getElementById(t);function Di(){const t=p.state.currentModule;return t==="CALIDAD"?"Q":t==="RAMALERO"?"R":""}function U(t){const e=Di();return y(t+e)||y(t)}function ie(t=""){y("viewLogin").style.display="block",y("viewApp").style.display="none",y("loginMsg").textContent=t}function $i(){y("viewLogin").style.display="none",y("viewApp").style.display="block",y("loginMsg").textContent=""}function Vt(){const t=y("viewHub");t&&(t.style.display="none"),Ya.forEach(e=>{const a=document.getElementById(`view${e}`);a&&(a.style.display="none")})}function Za(t,e){Vt();const a=y("viewHub");a&&(a.style.display="block");const n=y("hubButtons");n&&(n.innerHTML="",t.forEach(o=>{const i=document.createElement("button");i.textContent=o,i.addEventListener("click",()=>e==null?void 0:e(o)),n.appendChild(i)}))}function Ui(){var e;const t=(e=p.state.currentProfile)==null?void 0:e.modulos;return Array.isArray(t)&&t.filter(Boolean).length>1}function wi(){const t=y("btnGoHome");if(!t)return;const e=Ui();t.classList.toggle("hidden",!e)}function Fi(){const t=p.state.currentProfile||{},e=String(t.rol||"").toUpperCase(),a=String(t.especialidad||"").toUpperCase(),n=Array.isArray(t.modulos)?t.modulos.join(","):"(default)",o=String(t.nombre||"").trim(),i=y("userHello"),s=y("userPill");i&&(i.textContent=o?`HOLA: ${o}`:"HOLA:");const r=e==="TECNICO"?` | ESP: ${a||"-"}`:"";s&&(s.textContent=`ROL: ${e}${r} | MOD: ${n}`)}function Bi(){var a;const t=document.getElementById("debugWrap");if(!t)return;String(((a=p.state.currentProfile)==null?void 0:a.rol)||"").toUpperCase()==="ADMIN"?t.classList.remove("debug-hidden"):t.classList.add("debug-hidden")}function V(t){const e=y("out");e&&(e.textContent=JSON.stringify(t,null,2))}function P(t){const e=U("estadoBox");e&&(e.textContent=t||"")}const pn="glp_email";function Xa(t){const e=String((t==null?void 0:t.rol)||"").toUpperCase();if(Array.isArray(t==null?void 0:t.modulos)&&t.modulos.length){const a=t.modulos.map(n=>String(n||"").trim().toUpperCase()).filter(Boolean);return a.includes("ALL")?[...Ya]:[...new Set(a)]}return e==="TECNICO"?["TECNICO"]:e==="RAMALERO"?["RAMALERO"]:e==="CALIDAD"?["CALIDAD"]:e==="MOVILIZADOR"?["MOVILIZADOR"]:e==="SUPERVISOR"?["SUPERVISOR"]:e==="ADMIN"?["ADMIN"]:["TECNICO"]}function qi(t){if(String((t==null?void 0:t.rol)||"").toUpperCase()!=="TECNICO")return null;const a=String((t==null?void 0:t.especialidad)||"").toUpperCase();return a==="MOTOR"?"MOTOR":a==="TANQUE"||a==="TANQUERO"?"TANQUE":null}function ke(){if(p.state.currentModule!=="TECNICO")return;const t=y("rol");t&&(p.state.rolLock?(t.value=p.state.rolLock,t.disabled=!0):t.disabled=!1)}function Vi(t){localStorage.setItem(pn,t)}function Qi(){return localStorage.getItem(pn)||""}function ji(){localStorage.removeItem(pn)}function se(){var t;return String(((t=y("email"))==null?void 0:t.value)||"").trim().toLowerCase()}function de(){var t;return String(((t=U("vin"))==null?void 0:t.value)||"").trim().toUpperCase()}function to(){if(p.state.rolLock)return p.state.rolLock;const t=y("rol");return t?String(t.value||"MOTOR").toUpperCase():"MOTOR"}function te(){return p.state.currentModule==="CALIDAD"?"CALIDAD":p.state.currentModule==="RAMALERO"?"RAMALERO":String(to()||"").toUpperCase()}function yt(){const t=se();if(!t)throw new Error("NO_EMAIL");return t}const eo="glp_theme";function Pi(){const t=zi();if(t)return Ge(t);const e=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches;Ge(e?"day":"night")}function zi(){try{return localStorage.getItem(eo)||""}catch{return""}}function Ki(){const t=document.documentElement.dataset.theme||"night";Ge(t==="day"?"night":"day")}function Ge(t){const e=t==="day"?"day":"night";document.documentElement.dataset.theme=e;try{localStorage.setItem(eo,e)}catch{}}function ya(t,e="Procesando..."){var d,l;p.state.uiLocked=!!t;const a=y("loadingOverlay");if(a){a.classList.toggle("hidden",!p.state.uiLocked);const b=document.getElementById("overlayMsg");b&&(b.textContent=String(e||"Procesando").replace(/\.*\s*$/,""))}p.state.uiLocked?P(e):P("");const n=y("email");if(n&&(n.disabled=p.state.uiLocked),p.state.currentModule==="TECNICO"||p.state.currentModule==="CALIDAD"){const b=U("vin");b&&(b.disabled=p.state.uiLocked)}const o=y("rol");o&&(o.disabled=p.state.uiLocked||!!p.state.rolLock||p.state.currentModule!=="TECNICO");const i=y("btnMe");i&&(i.disabled=p.state.uiLocked);const s=y("btnLogout");s&&(s.disabled=p.state.uiLocked);const r=["btnEstado","btnActivas","btnFinalizados","btnQR","btnSupQR"];for(const b of r){const g=U(b);g&&(g.disabled=p.state.uiLocked)}const c=U("activasBox"),u=U("finalizadosBox");(d=c==null?void 0:c.querySelectorAll("button[data-act]"))==null||d.forEach(b=>b.disabled=p.state.uiLocked),(l=u==null?void 0:u.querySelectorAll("button[data-act]"))==null||l.forEach(b=>b.disabled=p.state.uiLocked)}async function Z(t,e){if(p.state.uiLocked){console.warn(`[withLock] ⏳ Lock activo. Esperando a que se libere: "${e}"`);let o=0;for(;p.state.uiLocked&&o<100;)await new Promise(i=>setTimeout(i,100)),o++;p.state.uiLocked&&console.error("[withLock] ❌ Lock no se liberó después de 10s. Forzando.")}ya(!0,e);const a=Date.now(),n=Math.random().toString(36).slice(2,9);console.log(`[withLock] 🔒 Lock iniciado (${n}): "${e}"`);try{const o=await t(),i=Date.now()-a;return console.log(`[withLock] ✅ Lock completado (${n}): ${i}ms`,e),o}catch(o){const i=Date.now()-a;throw console.error(`[withLock] ❌ Error en lock (${n}) después de ${i}ms:`,o.message),o}finally{ya(!1);const o=Date.now()-a;o>5e3&&console.warn(`[withLock] ⏱️ DURACIÓN LARGA (${n}): ${o}ms para "${e}"`)}}async function Lt(t){return await(await fetch(t)).json()}async function xe(t,e){let a,n;try{a=await fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)})}catch(o){throw new Error(`Fallo de conexión: ${(o==null?void 0:o.message)||o}`)}if(!a.ok){const o=await a.text().catch(()=>"");throw new Error(`HTTP ${a.status}: ${o.slice(0,200)||a.statusText}`)}try{n=await a.json()}catch(o){throw new Error(`Respuesta no-JSON desde servidor: ${(o==null?void 0:o.message)||o}`)}return n}async function fn(t,e="Cargando..."){return await Z(async()=>await Lt(t),e)}async function De(t,e,a="Procesando..."){return await Z(async()=>await xe(t,e),a)}const Rt={URL:"https://kfysqxpnkzjomektleqk.supabase.co",ANON_KEY:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmeXNxeHBua3pqb21la3RsZXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODI3MTMsImV4cCI6MjA4ODY1ODcxM30.dF7dShvoWk0IPxHBXMcuZiY55ImKnVcLssGFeFETKxM"};function mn(){return!0}function $e(){return{apikey:Rt.ANON_KEY,Authorization:`Bearer ${Rt.ANON_KEY}`,"Content-Type":"application/json",Prefer:"return=representation"}}function Hi(t={}){const e=[];return Object.entries(t||{}).forEach(([a,n])=>{if(n==null||n==="")return;let o="eq",i=n;n&&typeof n=="object"&&n.op&&n.val!==void 0&&(o=n.op,i=n.val),Array.isArray(i)&&o==="in"?i=`(${i.map(s=>`"${s}"`).join(",")})`:(typeof i=="boolean"||o!=="in")&&(i=String(i)),e.push(`${encodeURIComponent(a)}=${encodeURIComponent(o)}.${encodeURIComponent(i)}`)}),e.length?"?"+e.join("&"):""}async function $t(t,e={}){const a=`${Rt.URL}/rest/v1/${t}${Hi(e)}`,n=await fetch(a,{method:"GET",headers:$e()});if(!n.ok){const o=await n.text().catch(()=>"");throw new Error(`Supabase GET ${t}: ${n.status} ${o}`)}return await n.json()}let nt={};async function be(t,e){if(nt[t])return nt[t].listeners.push(e),()=>{nt[t].listeners=nt[t].listeners.filter(n=>n!==e)};const a=Rt.URL.replace("https://","wss://").replace("http://","ws://")+"/realtime/v1";try{const n=new WebSocket(`${a}?apikey=${Rt.ANON_KEY}`);return nt[t]={ws:n,listeners:[e],connected:!1},n.onopen=()=>{nt[t].connected=!0;const o={type:"subscribe",topic:`realtime:${t}`};n.send(JSON.stringify(o))},n.onmessage=o=>{try{const i=JSON.parse(o.data);if(i.topic!==`realtime:${t}`)return;if(i.type==="broadcast"||i.type==="postgres_changes"){const s=i.payload||i;(s.new||s.old)&&nt[t].listeners.forEach(r=>{try{r(s)}catch(c){console.error(`[Realtime ${t}] Callback error:`,c.message)}})}}catch(i){console.warn(`[Realtime ${t}] Parse error:`,i.message)}},n.onerror=o=>{console.error(`[Realtime ${t}] WebSocket error:`,o),nt[t].connected=!1},n.onclose=()=>{console.warn(`[Realtime ${t}] Desconectado, reintentando en 5s...`),nt[t].connected=!1,setTimeout(()=>be(t,e).catch(()=>{}),5e3)},()=>{nt[t].listeners=nt[t].listeners.filter(o=>o!==e),nt[t].listeners.length===0&&(nt[t].ws.close(),delete nt[t])}}catch(n){throw console.error(`[Realtime ${t}] Error:`,n.message),n}}function Gi(){const t={};return Object.entries(nt).forEach(([e,a])=>{t[e]={connected:a.connected,listeners:a.listeners.length}}),t}async function Wi(t){const e=await $t("usuarios",{email:t});if(!e||!e.length)return null;const a=e[0],n=await $t("usuario_modulos",{user_id:a.id});return{id:a.id,email:a.email,nombre:a.nombre,rol:a.rol,especialidad:a.especialidad,activo:a.activo,modulos:Array.isArray(n)?n.map(o=>o.modulo):[]}}async function Ji(t){const e=await $t("usuarios",{email:t});if(!e||!e.length)return[];const a=e[0].id,o=`${Rt.URL}/rest/v1/asignaciones?user_id=eq.${a}&activo=eq.true&estado_actual=neq.FINALIZADO&select=${encodeURIComponent("id,work_order_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,updated_at,last_nota,work_orders(id,vin,tipo_ramal,estado_general,tanque_registrado,reductor_registrado,fecha_creacion,vins(reductor_asignado,tanque_asignado))")}&order=updated_at.desc`,i=await fetch(o,{method:"GET",headers:$e()});if(!i.ok){const r=await i.text().catch(()=>"");throw new Error(`Supabase GET asignaciones: ${i.status} ${r}`)}const s=await i.json();return!s||!s.length?[]:s.map(r=>{var u,d;const c=Array.isArray(r.work_orders)?r.work_orders[0]:r.work_orders;return{id:r.id,work_order_id:r.work_order_id,tipo_ot:r.tipo_ot,rol_trabajo:r.rol_trabajo,estado_actual:r.estado_actual,running_since:r.running_since,created_at:r.running_since||(c==null?void 0:c.fecha_creacion)||"",fecha_creacion:(c==null?void 0:c.fecha_creacion)||"",tiempo_trab_ms:r.tiempo_trab_ms||0,updated_at:r.updated_at,last_nota:r.last_nota||"",vin:(c==null?void 0:c.vin)||"",tipo_ramal:(c==null?void 0:c.tipo_ramal)||"",tipoRamal:(c==null?void 0:c.tipo_ramal)||"",estado_general:c==null?void 0:c.estado_general,tanque_registrado:c==null?void 0:c.tanque_registrado,reductor_registrado:c==null?void 0:c.reductor_registrado,tanque_asignado:((u=c==null?void 0:c.vins)==null?void 0:u.tanque_asignado)||"",reductor_asignado:((d=c==null?void 0:c.vins)==null?void 0:d.reductor_asignado)||"",tiempo_ms:Number(r.tiempo_trab_ms||0),estado:r.estado_actual}}).filter(r=>r.work_order_id)}async function Yi(t){const e=await $t("usuarios",{email:t});if(!e||!e.length)return[];const a=e[0].id,o=`${Rt.URL}/rest/v1/asignaciones?user_id=eq.${a}&estado_actual=eq.FINALIZADO&select=${encodeURIComponent("id,work_order_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,updated_at,last_nota,work_orders(id,vin,tipo_ramal,estado_general,tanque_registrado,reductor_registrado,fecha_creacion,vins(reductor_asignado,tanque_asignado))")}&order=updated_at.desc`,i=await fetch(o,{method:"GET",headers:$e()});if(!i.ok){const r=await i.text().catch(()=>"");throw new Error(`Supabase GET asignaciones finalizadas: ${i.status} ${r}`)}const s=await i.json();return!s||!s.length?[]:s.map(r=>{var u,d;const c=Array.isArray(r.work_orders)?r.work_orders[0]:r.work_orders;return{id:r.id,work_order_id:r.work_order_id,tipo_ot:r.tipo_ot,rol_trabajo:r.rol_trabajo,estado_actual:r.estado_actual,running_since:r.running_since,created_at:r.running_since||(c==null?void 0:c.fecha_creacion)||"",fecha_creacion:(c==null?void 0:c.fecha_creacion)||"",tiempo_trab_ms:r.tiempo_trab_ms||0,updated_at:r.updated_at,last_nota:r.last_nota||"",vin:(c==null?void 0:c.vin)||"",tipo_ramal:(c==null?void 0:c.tipo_ramal)||"",tipoRamal:(c==null?void 0:c.tipo_ramal)||"",estado_general:c==null?void 0:c.estado_general,tanque_registrado:c==null?void 0:c.tanque_registrado,reductor_registrado:c==null?void 0:c.reductor_registrado,tanque_asignado:((u=c==null?void 0:c.vins)==null?void 0:u.tanque_asignado)||"",reductor_asignado:((d=c==null?void 0:c.vins)==null?void 0:d.reductor_asignado)||"",tiempo_ms:Number(r.tiempo_trab_ms||0),estado:r.estado_actual}}).filter(r=>r.work_order_id)}async function Zi(t,e,a){const n=await $t("usuarios",{email:t});if(!n||!n.length)return null;const o=n[0].id,i=await $t("work_orders",{vin:e});if(!i||!i.length)return null;const s=i[0],c=`${Rt.URL}/rest/v1/asignaciones?work_order_id=eq.${s.id}&user_id=eq.${o}&rol_trabajo=eq.${encodeURIComponent(a)}&select=${encodeURIComponent("id,work_order_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,updated_at,last_nota,last_nota_ts,activo")}&limit=1`,u=await fetch(c,{method:"GET",headers:$e()});if(!u.ok){const b=await u.text().catch(()=>"");throw new Error(`Supabase GET estado: ${u.status} ${b}`)}const d=await u.json(),l=Array.isArray(d)&&d.length?d[0]:null;return{id:(l==null?void 0:l.id)||null,work_order_id:s.id,tipo_ot:(l==null?void 0:l.tipo_ot)||s.tipo_ot||"CONVERSION",rol_trabajo:a,estado_actual:(l==null?void 0:l.estado_actual)||"SIN_INICIAR",running_since:(l==null?void 0:l.running_since)||null,tiempo_trab_ms:Number((l==null?void 0:l.tiempo_trab_ms)||0),updated_at:(l==null?void 0:l.updated_at)||s.updated_at||null,last_nota:(l==null?void 0:l.last_nota)||"",last_nota_ts:(l==null?void 0:l.last_nota_ts)||null,activo:(l==null?void 0:l.activo)??!1,vin:String(s.vin||e||"").trim().toUpperCase(),conversionId:s.id,rolTrabajo:a,estado:(l==null?void 0:l.estado_actual)||"SIN_INICIAR",tiempoMs:Number((l==null?void 0:l.tiempo_trab_ms)||0),tiempo_ms:Number((l==null?void 0:l.tiempo_trab_ms)||0)}}async function Xi(t){const e=await $t("incidencias",{vin:t}),a=n=>n?{url:"https://drive.google.com/file/d/"+n+"/view",thumbUrl:"https://drive.google.com/thumbnail?id="+n+"&sz=w400",imgUrl:"https://drive.google.com/uc?export=view&id="+n}:{url:"",thumbUrl:"",imgUrl:""};return e.map(n=>{const o=a(n.foto_file_id);return{id:n.id,fecha:n.fecha_hora,fecha_hora:n.fecha_hora,vin:n.vin,tipo:n.tipo,tecnico:n.tecnico||"",nota:n.nota||"",registrado_por:n.registrado_por||"",fotoFileId:n.foto_file_id||"",fotoUrl:o.url,fotoThumbUrl:o.thumbUrl,fotoImgUrl:o.imgUrl,fotoFolderId:n.foto_folder_id||"",fotoBatchId:n.foto_batch_id||""}}).sort((n,o)=>new Date(o.fecha_hora)-new Date(n.fecha_hora))}async function no(t="",e=12){if(!t||t.length<1)return[];try{const a=await fetch(`/api/vin-suggest?q=${encodeURIComponent(t)}&limit=${e}`,{method:"GET"});if(!a.ok)throw new Error(`Backend getVinSuggest: ${a.status}`);const n=await a.json();return((n==null?void 0:n.items)||[]).map(o=>({vin:o.vin,modelo:o.modelo,cliente:o.cliente}))}catch(a){return console.error("[getVinSuggest] Error:",a.message),[]}}const ao="glp_vin_cache_v1",oo="glp_ramal_cache_v1";function io(){try{return JSON.parse(localStorage.getItem(ao)||"{}")}catch{return{}}}function ts(t){try{localStorage.setItem(ao,JSON.stringify(t))}catch{}}function so(t,e){const a=String(t||"").trim(),n=String(e||"").toUpperCase().trim();return a&&n?`${a}|${n}`:""}function es(t,e,a){var u;const n=String(t||"").trim(),o=String(a||"").trim().toUpperCase();if(!n||!o)return;const i=String(e||"").toUpperCase().trim(),s=so(n,i);if(!s)return;const r=io();r[s]={vin:o,ts:Date.now()};const c=336*3600*1e3;for(const d of Object.keys(r))(!((u=r[d])!=null&&u.ts)||Date.now()-r[d].ts>c)&&delete r[d];ts(r)}function ns(t,e){var o;const a=so(t,e);if(!a)return"";const n=io();return String(((o=n[a])==null?void 0:o.vin)||"").toUpperCase()}function ro(){try{return JSON.parse(localStorage.getItem(oo)||"{}")}catch{return{}}}function as(t){try{localStorage.setItem(oo,JSON.stringify(t))}catch{}}function co(t){const e=String(t||"").trim();return e?`RAMAL|${e}`:""}function os(t,e){var s;const a=String(t||"").trim(),n=String(e||"").trim();if(!a||!n)return;const o=ro();o[co(a)]={tipoRamal:n,ts:Date.now()};const i=336*3600*1e3;for(const r of Object.keys(o))(!((s=o[r])!=null&&s.ts)||Date.now()-o[r].ts>i)&&delete o[r];as(o)}function is(t){var n;const e=String(t||"").trim();if(!e)return"";const a=ro();return String(((n=a[co(e)])==null?void 0:n.tipoRamal)||"")}function N(t){return String(t??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function ss(t){return window.CSS&&typeof CSS.escape=="function"?CSS.escape(String(t)):String(t).replace(/["\\]/g,"\\$&")}function Ut(t){if(!t)return"-";const e=new Date(t);return isNaN(e.getTime())?"-":new Intl.DateTimeFormat("es-PE",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}).format(e)}function lo(t){if(!t)return"-";const e=new Date(t);return isNaN(e.getTime())?"-":new Intl.DateTimeFormat("es-PE",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(e)}function wt(t){t=Math.max(0,Number(t)||0);const e=Math.floor(t/1e3),a=String(Math.floor(e/3600)).padStart(2,"0"),n=String(Math.floor(e%3600/60)).padStart(2,"0"),o=String(e%60).padStart(2,"0");return`${a}:${n}:${o}`}function pe(t){const e=String((t==null?void 0:t.conversionId)||"").trim(),a=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();return`${e}|${a}`}const uo=new Map;let ne=null;function rs(t,e,a){uo.set(String(t||"").toUpperCase(),{enter:e,exit:a})}function Mt(t){const e=String(t||"").toUpperCase();if(ne!=null&&ne.exit)try{ne.exit()}catch{}const a=uo.get(e);if(a!=null&&a.enter)try{a.enter()}catch{}ne=a||null}Mt.register=rs;const Ft="/api/uploader/proxy";function pt(){const t=new Date,e=t.getFullYear(),a=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${e}-${a}-${n}`}function ae(t){const e=["B","KB","MB","GB"];let a=0,n=Number(t||0);for(;n>=1024&&a<e.length-1;)n/=1024,a++;return`${n.toFixed(a===0?0:1)} ${e[a]}`}async function fe(t,e=Ft){const n=await fetch(e||Ft,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}),o=await n.text().catch(()=>"");if(!n.ok)throw new Error(`HTTP ${n.status} ${n.statusText} ${o||""}`.trim());try{return JSON.parse(o)}catch{throw new Error(`Respuesta no-JSON desde backend: ${o.slice(0,300)}`)}}async function Ue(t){if(!t)return"";if(!/^image\//i.test(t.type||""))return await new Promise((a,n)=>{const o=new FileReader;o.onload=()=>a(String(o.result).split(",")[1]||""),o.onerror=()=>n(new Error("No se pudo leer el archivo.")),o.readAsDataURL(t)});const e=URL.createObjectURL(t);try{const a=await new Promise((l,b)=>{const g=new Image,f=setTimeout(()=>{b(new Error("La imagen tardó demasiado en cargar para compresión."))},15e3);g.onload=()=>{clearTimeout(f),l(g)},g.onerror=()=>{clearTimeout(f),b(new Error("No se pudo abrir la imagen para compresión."))},g.src=e}),n=960,o=.65;let i=a.naturalWidth||a.width||0,s=a.naturalHeight||a.height||0;if(!i||!s)throw new Error("La imagen no tiene dimensiones válidas.");if(i>n){const l=n/i;i=Math.round(i*l),s=Math.round(s*l)}const r=document.createElement("canvas");r.width=i,r.height=s;const c=r.getContext("2d");if(!c)throw new Error("No se pudo crear el contexto de compresión.");c.drawImage(a,0,0,i,s);const u=r.toDataURL("image/jpeg",o),d=String(u).split(",")[1]||"";if(!d)throw new Error("La compresión devolvió una imagen vacía.");return d}catch(a){throw new Error(`Error comprimiendo imagen: ${(a==null?void 0:a.message)||a}`)}finally{URL.revokeObjectURL(e)}}async function cs({vin:t,dateStr:e,apsUrl:a=Ft}){return fe({action:"getStatus",vin:t,dateStr:e},a)}async function ls({vin:t,dateStr:e,slot:a,file:n,apsUrl:o=Ft}){const i=await Ue(n);return fe({action:"uploadOne",vin:t,dateStr:e,slot:a,mimeType:"image/jpeg",b64:i},o)}async function ds({vin:t,dateStr:e,note:a,files:n=[],onProgress:o,apsUrl:i=Ft}){const s=[];for(let r=0;r<n.length;r++){typeof o=="function"&&o({phase:"prepare",index:r+1,total:n.length});const c=await Ue(n[r]);s.push({slot:"falla",mimeType:"image/jpeg",b64:c})}return typeof o=="function"&&o({phase:"upload",total:s.length}),fe({action:"uploadFalla",vin:t,dateStr:e,note:a,files:s},i)}async function us({vin:t,dateStr:e,items:a=[],onProgress:n,apsUrl:o=Ft}){const i=[];for(let s=0;s<a.length;s++){const r=a[s];if(!(r!=null&&r.file)||!(r!=null&&r.slot))continue;typeof n=="function"&&n({phase:"prepare",slot:r.slot,index:s+1,total:a.length});const c=await Ue(r.file);i.push({slot:r.slot,mimeType:"image/jpeg",b64:c})}return typeof n=="function"&&n({phase:"upload",total:i.length}),fe({action:"uploadCalidad",vin:t,dateStr:e,files:i},o)}async function ps({tipo:t,vin:e,dateStr:a,tecnico:n,checklist:o,file:i,onProgress:s,apsUrl:r=Ft}){typeof s=="function"&&s({phase:"prepare"});const c=await Ue(i);return typeof s=="function"&&s({phase:"upload"}),fe({action:"uploadConformidad",tipo:t,vin:e,dateStr:a,tecnico:n,checklist:o,file:{mimeType:"image/jpeg",b64:c}},r)}function fs(t){return String(t||"").replace(/\s+/g,"").trim().toUpperCase()}function ms(t){const e=t==="BAR";return{fps:e?8:10,qrbox:e?{width:160,height:320}:{width:250,height:250},formatsToSupport:e?[Html5QrcodeSupportedFormats.CODE_128,Html5QrcodeSupportedFormats.CODE_39,Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.UPC_E,Html5QrcodeSupportedFormats.ITF,Html5QrcodeSupportedFormats.CODABAR]:[Html5QrcodeSupportedFormats.QR_CODE],experimentalFeatures:{useBarCodeDetectorIfSupported:!0}}}async function vs(t,e,a){var s;try{await t.start({facingMode:{exact:"environment"}},e,a,()=>{});return}catch{}try{await t.start({facingMode:"environment"},e,a,()=>{});return}catch{}const n=await Html5Qrcode.getCameras();let o=((s=n==null?void 0:n[0])==null?void 0:s.id)||null;const i=n==null?void 0:n.find(r=>/back|rear|environment/i.test(r.label||""));i!=null&&i.id&&(o=i.id),await t.start(o??{facingMode:"environment"},e,a,()=>{})}async function gs(t){try{t&&t.isScanning&&await t.stop()}catch{}}function Ht(t){let e=null;function a(){if(!window.Html5Qrcode)throw new Error("No se pudo cargar la librería Html5Qrcode.");return e||(e=new Html5Qrcode(t)),e}async function n({mode:r="QR",onDecoded:c,config:u,msgEl:d}={}){try{const l=a(),b=u||ms(r);await vs(l,b,async f=>{const I=fs(f);I&&await(c==null?void 0:c(I))})}catch(l){throw d&&(d.textContent="No se pudo abrir la cámara. Revisa permisos (HTTPS o localhost)."),l}}async function o(){await gs(e)}function i(){return e}function s(){return!!(e&&e.isScanning)}return{start:n,stop:o,getInstance:i,isActive:s}}function po(t,e={}){const a=t.querySelector(".uploader-shell")||t,n=m=>a.querySelector(`#up_${m}`);let o=[null,null,null,null],i=[],s=[null,null,null,null],r=null;const c=Ht("up_qrReader_params"),u=Ht("up_qrReader_falla"),d=Ht("up_qrReader_qc"),l=Ht("up_qrReader_conf"),b={vin:"Foto del VIN",comp_1:"Compresión",comp_2:"Compresión",comp_3:"Compresión",comp_4:"Compresión",corr_pre:"Corriente antes",corr_post:"Corriente después",voltaje:"Voltaje",scan_carro:"Scan del carro"},g={menu:n("screenMenu"),params:n("screenParams"),falla:n("screenFalla"),calidad:n("screenCalidad"),conformidad:n("screenConformidad")};function f(m,v){const h=n(m);h&&(h.textContent=String(v||""))}function I(m){try{return new URLSearchParams(window.location.search).get(m)||""}catch{return""}}function C(m){Object.values(g).forEach(h=>h&&h.classList.remove("active"));const v=g[m];v&&v.classList.add("active"),je().catch(()=>{})}function B(){if(typeof e.onBackControl=="function"){e.onBackControl();return}C("menu")}function Q(m){const v=n("imgModal"),h=n("imgModalImg");!v||!h||!m||(h.src=m,v.classList.add("open"),v.setAttribute("aria-hidden","false"))}function X(){const m=n("imgModal"),v=n("imgModalImg");!m||!v||(m.classList.remove("open"),v.src="",m.setAttribute("aria-hidden","true"))}function _(m,v){const h=n(`${m}_previewBox`),A=n(`${m}_meta`);if(!h||!A)return;if(!v){h.innerHTML='<span class="small">Sin foto</span>',A.textContent="Ningún archivo seleccionado.";return}A.textContent=`${v.name||"(foto)"} • ${ae(v.size||0)}`;const E=URL.createObjectURL(v);h.innerHTML=`<img alt="preview" src="${E}">`,setTimeout(()=>URL.revokeObjectURL(E),15e3)}function T(m,v){const h=n(`${m}_previewBox`),A=n(`${m}_meta`);if(!h||!A||!v)return;const E=v.thumbUrl||"",L=v.imgUrl||"";A.textContent="📡 Ya existe en Drive (preview).";const M=document.createElement("img");M.alt="drive preview",M.loading="lazy",M.referrerPolicy="no-referrer",M.style.width="100%",M.style.height="100%",M.style.objectFit="cover",M.style.display="block",M.src=E||L,M.onerror=()=>{L&&M.src!==L?M.src=L:h.innerHTML='<span class="small">No se pudo cargar preview</span>'},h.innerHTML="",h.appendChild(M)}function D(m,v){const h=n(`comp_p${m}`);if(!h||!v)return;const A=v.thumbUrl||"",E=v.imgUrl||"",L=document.createElement("img");L.alt="drive preview",L.loading="lazy",L.referrerPolicy="no-referrer",L.style.width="100%",L.style.height="100%",L.style.objectFit="cover",L.style.display="block",L.src=A||E,L.onerror=()=>{E&&L.src!==E?L.src=E:h.innerHTML=`<span class="small">${m}</span>`},h.innerHTML="",h.appendChild(L)}function q(m){let v="";v+=`VIN: ${m.vin||"-"}
`,v+=`Fecha: ${m.dateStr||"-"}
`,v+=`Carpeta: ${m.monthFolderName||"-"} / ${m.carFolderName||"-"} / REGISTRO

`;const A=["comp_1","comp_2","comp_3","comp_4"].filter(ct=>m.status&&m.status[ct]).length,E=4-A;v+=`${A===4?"✅":"❌"} Compresión (${A}/4)
`,E>0&&(v+=`   Faltan: ${E} foto(s)
`);const L=["vin","corr_pre","corr_post","voltaje","scan_carro"],M=[];for(const ct of L){const Y=m.status&&m.status[ct],ut=m.previews&&m.previews[ct];v+=`${Y?"✅":"❌"} ${b[ct]}`,ut&&ut.url&&(v+=`  (ver: ${ut.url})`),v+=`
`,Y||M.push(b[ct])}const O=E+M.length;v+=`
Faltantes (${O}/9):
- ${O?[`Compresión (${A}/4)`,...M].join(`
- `):"Ninguno 🎉"}`,f("out",v)}async function K(){var h,A;const m=(((h=n("vinText"))==null?void 0:h.value)||"").trim(),v=((A=n("dateStr"))==null?void 0:A.value)||pt();if(!m){f("out","❌ Falta VIN (texto).");return}try{const E=await cs({vin:m,dateStr:v,apsUrl:e.apsUrl});if(!E.ok){f("out","❌ getStatus: "+(E.error||"Error"));return}q(E),E.previews&&(["vin","corr_pre","corr_post","voltaje","scan_carro"].forEach(L=>{const M=E.previews[L];M&&T(L,M)}),["comp_1","comp_2","comp_3","comp_4"].forEach((L,M)=>{const O=E.previews[L];O&&D(M+1,O)}))}catch(E){f("out",`❌ Error getStatus: ${E}`)}}async function z(m,v,h="out",A="",E=""){var O,ct;const L=String(A||((O=n("vinText"))==null?void 0:O.value)||"").trim(),M=String(E||((ct=n("dateStr"))==null?void 0:ct.value)||pt());if(!L)return f(h,"❌ Falta VIN."),{ok:!1,error:"Falta VIN"};try{f(h,`Preparando ${m}...
`);const Y=await ls({vin:L,dateStr:M,slot:m,file:v,apsUrl:e.apsUrl});if(!Y.ok)return f(h,`❌ uploadOne(${m}): ${Y.error}`),Y;if(Y.preview)if(m.startsWith("comp_")){const ut=Number(m.split("_")[1]||"0");ut>=1&&ut<=4&&D(ut,Y.preview)}else T(m,Y.preview);return f(h,`✅ Guardado: ${m}
`),Y}catch(Y){return f(h,`❌ Error ${m}: ${Y}`),{ok:!1,error:String(Y)}}}function $(){o=[null,null,null,null],["comp_p1","comp_p2","comp_p3","comp_p4"].forEach((h,A)=>{const E=n(h);E&&(E.innerHTML=`<span class="small">${A+1}</span>`)}),f("comp_meta","Ningún archivo seleccionado.");const m=n("comp_cam"),v=n("comp_file");m&&(m.value=""),v&&(v.value="")}function at(){["comp_p1","comp_p2","comp_p3","comp_p4"].forEach((A,E)=>{const L=n(A),M=o[E];if(!L)return;if(!M){L.innerHTML=`<span class="small">${E+1}</span>`;return}const O=URL.createObjectURL(M);L.innerHTML=`<img alt="preview" src="${O}">`,setTimeout(()=>URL.revokeObjectURL(O),15e3)});const v=o.filter(Boolean),h=v.reduce((A,E)=>A+(E.size||0),0);f("comp_meta",v.length?`${v.length}/4 seleccionadas • ${ae(h)}`:"Ningún archivo seleccionado.")}async function Nt(m){if(!m)return;let v=o.findIndex(A=>!A);v===-1&&(v=3),o[v]=m,at();const h=`comp_${v+1}`;await z(h,m,"out");try{await K()}catch{}}async function ge(m){const v=(m==null?void 0:m[0])||null;if(!v)return;await Nt(v);const h=n("comp_cam");h&&(h.value="")}async function si(m){const v=Array.from(m||[]);if(!v.length)return;const h=v.slice(-4);for(const E of h)await Nt(E);const A=n("comp_file");A&&(A.value="")}function ee(){const m=n("fallaGrid");if(!m)return;m.innerHTML="",i.forEach((h,A)=>{const E=URL.createObjectURL(h),L=document.createElement("div");L.style.position="relative";const M=document.createElement("div");M.className="thumb",M.innerHTML=`<img alt="falla" src="${E}">`,L.appendChild(M);const O=document.createElement("button");O.type="button",O.textContent="✖",O.className="btn3",O.style.position="absolute",O.style.top="6px",O.style.right="6px",O.style.padding="4px 8px",O.style.borderRadius="10px",O.onclick=()=>{i.splice(A,1),ee()},L.appendChild(O),m.appendChild(L),setTimeout(()=>URL.revokeObjectURL(E),15e3)});const v=i.reduce((h,A)=>h+(A.size||0),0);f("fallaFotosMeta",`${i.length} archivo(s) • ${ae(v)}`)}function Nn(m){const v=Array.from(m||[]);v.length&&(i.push(...v),ee())}function Qe(){s=[null,null,null,null],["qc_p1","qc_p2","qc_p3","qc_p4"].forEach((h,A)=>{const E=n(h);E&&(E.innerHTML=`<span class="small">${A+1}</span>`)}),f("qc_meta","0/4 seleccionadas.");const m=n("qc_cam"),v=n("qc_file");m&&(m.value=""),v&&(v.value="")}function ri(){["qc_p1","qc_p2","qc_p3","qc_p4"].forEach((A,E)=>{const L=n(A),M=s[E];if(!L)return;if(!M){L.innerHTML=`<span class="small">${E+1}</span>`;return}const O=URL.createObjectURL(M);L.innerHTML=`<img alt="qc" src="${O}">`,setTimeout(()=>URL.revokeObjectURL(O),15e3)});const v=s.filter(Boolean),h=v.reduce((A,E)=>A+(E.size||0),0);f("qc_meta",`${v.length}/4 seleccionadas • ${ae(h)} (mín 3)`)}async function On(m){var M,O;if(!m)return;s[0]=s[1],s[1]=s[2],s[2]=s[3],s[3]=m,ri();const A=`calidad_${s.filter(Boolean).length}`,E=(((M=n("qcVin"))==null?void 0:M.value)||"").trim(),L=((O=n("qcDate"))==null?void 0:O.value)||pt();await z(A,m,"outQc",E,L)}async function ci(m){const v=(m==null?void 0:m[0])||null;if(!v)return;await On(v);const h=n("qc_cam");h&&(h.value="")}async function li(m){const v=Array.from(m||[]);if(!v.length)return;const h=v.slice(-4);for(const E of h)await On(E);const A=n("qc_file");A&&(A.value="")}function Pt(){const m=n("conf_previewBox"),v=n("conf_meta");if(!m||!v)return;if(!r){m.innerHTML='<span class="small">Sin foto</span>',v.textContent="Ningún archivo seleccionado.";return}v.textContent=`${r.name||"(foto)"} • ${ae(r.size||0)}`;const h=URL.createObjectURL(r);m.innerHTML=`<img alt="equipo" src="${h}">`,setTimeout(()=>URL.revokeObjectURL(h),15e3)}function kn(m){var h,A;n("confTipo")&&(n("confTipo").value=m),n("confTitle")&&(n("confTitle").textContent=`Conformidad equipo (${m})`);const v=(((h=n("vinText"))==null?void 0:h.value)||"").trim();v&&n("confVin")&&(n("confVin").value=v),n("confDate")&&(n("confDate").value=((A=n("dateStr"))==null?void 0:A.value)||pt()),n("chk1")&&(n("chk1").checked=!1),n("chk2")&&(n("chk2").checked=!1),n("chk3")&&(n("chk3").checked=!1),r=null,Pt(),C("conformidad")}const xn={params:{scanner:c,box:"qrBox_params",stop:"btnStop_params",msg:"scanMsg_params",mode:"scanMode_params",setVin:m=>{n("vinText")&&(n("vinText").value=m),K().catch(()=>{})}},falla:{scanner:u,box:"qrBox_falla",stop:"btnStop_falla",msg:"scanMsg_falla",mode:"scanMode_falla",setVin:m=>{n("fallaVin")&&(n("fallaVin").value=m)}},qc:{scanner:d,box:"qrBox_qc",stop:"btnStop_qc",msg:"scanMsg_qc",mode:"scanMode_qc",setVin:m=>{n("qcVin")&&(n("qcVin").value=m)}},conf:{scanner:l,box:"qrBox_conf",stop:"btnStop_conf",msg:"scanMsg_conf",mode:"scanMode_conf",setVin:m=>{n("confVin")&&(n("confVin").value=m)}}};async function dt(m){const v=xn[m];if(!v)return;await v.scanner.stop();const h=n(v.box),A=n(v.stop),E=n(v.mode);h&&(h.style.display="none"),A&&(A.style.display="none"),E&&(E.textContent="")}async function je(){await dt("params"),await dt("falla"),await dt("qc"),await dt("conf")}async function _t(m,v){await dt(m);const h=xn[m];if(!h)return;const A=n(h.box),E=n(h.stop),L=n(h.msg),M=n(h.mode);A&&(A.style.display="block"),E&&(E.style.display="inline-block"),L&&(L.textContent=""),M&&(M.textContent=v==="QR"?"Modo: SOLO QR":"Modo: SOLO BARRAS (CODE_128 y otros)");try{await h.scanner.start({mode:v,msgEl:n(h.msg),onDecoded:O=>{h.setVin(O),n(h.msg)&&(n(h.msg).textContent=`Detectado (${v==="QR"?"QR":"BARRAS"}): ${O}`),dt(m).catch(()=>{})}})}catch(O){n(h.msg)&&(n(h.msg).textContent=`Error cámara (${v}): ${O}`)}}function di(){const m=(I("vin")||I("VIN")||"").trim();m&&(n("vinText")&&(n("vinText").value=m),n("fallaVin")&&(n("fallaVin").value=m),n("qcVin")&&(n("qcVin").value=m),n("confVin")&&(n("confVin").value=m));const v=(I("date")||I("fecha")||"").trim();v&&(n("dateStr")&&(n("dateStr").value=v),n("fallaDate")&&(n("fallaDate").value=v),n("qcDate")&&(n("qcDate").value=v),n("confDate")&&(n("confDate").value=v));const h=(I("pantalla")||I("screen")||"").toLowerCase();h==="params"&&C("params"),h==="falla"&&C("falla"),(h==="calidad"||h==="qc")&&C("calidad"),(h==="conformidad"||h==="conf")&&C("conformidad"),m&&K().catch(()=>{})}function ui(){const m=pt();n("dateStr")&&!n("dateStr").value&&(n("dateStr").value=m),n("fallaDate")&&!n("fallaDate").value&&(n("fallaDate").value=m),n("qcDate")&&!n("qcDate").value&&(n("qcDate").value=m),n("confDate")&&!n("confDate").value&&(n("confDate").value=m)}function pi(){var v,h,A,E,L,M,O,ct,Y,ut,Dn,$n,Un,wn,Fn,Bn,qn,Vn,Qn,jn,Pn,zn,Kn,Hn,Gn,Wn,Jn,Yn,Zn,Xn,ta,ea,na,aa,oa,ia,sa,ra,ca,la,da,ua,pa,fa;(v=n("goParams"))==null||v.addEventListener("click",()=>C("params")),(h=n("goFalla"))==null||h.addEventListener("click",()=>{var k,x;const S=(((k=n("vinText"))==null?void 0:k.value)||"").trim();S&&n("fallaVin")&&(n("fallaVin").value=S),n("fallaDate")&&(n("fallaDate").value=((x=n("dateStr"))==null?void 0:x.value)||pt()),C("falla")}),(A=n("goCalidad"))==null||A.addEventListener("click",()=>{var k,x;const S=(((k=n("vinText"))==null?void 0:k.value)||"").trim();S&&n("qcVin")&&(n("qcVin").value=S),n("qcDate")&&(n("qcDate").value=((x=n("dateStr"))==null?void 0:x.value)||pt()),C("calidad")}),(E=n("goConfTanque"))==null||E.addEventListener("click",()=>kn("TANQUE")),(L=n("goConfReductor"))==null||L.addEventListener("click",()=>kn("REDUCTOR")),(M=n("btnBackControl"))==null||M.addEventListener("click",B),(O=n("imgModalClose"))==null||O.addEventListener("click",X),(ct=n("imgModal"))==null||ct.addEventListener("click",S=>{S.target===n("imgModal")&&X()}),document.addEventListener("keydown",S=>{S.key==="Escape"&&X()}),a.addEventListener("click",S=>{var x,W;const k=(W=(x=S.target)==null?void 0:x.closest)==null?void 0:W.call(x,".thumb img");k&&Q(k.currentSrc||k.src)}),a.addEventListener("click",S=>{const k=S.target.closest("button");if(!k)return;k.getAttribute("data-nav")==="menu"&&C("menu")}),(Y=n("btnRefresh"))==null||Y.addEventListener("click",K),(ut=n("vinText"))==null||ut.addEventListener("change",K),(Dn=n("dateStr"))==null||Dn.addEventListener("change",K),($n=n("btnUpload"))==null||$n.addEventListener("click",async()=>{f("out","📡 Refrescando estado..."),await K()}),a.addEventListener("click",S=>{var W,tt,et,w;const k=S.target.closest("button");if(!k)return;const x=k.getAttribute("data-slot");if(x&&(k.getAttribute("data-pick")==="cam"&&(x==="comp"?(W=n("comp_cam"))==null||W.click():(tt=n(`${x}_cam`))==null||tt.click()),k.getAttribute("data-pick")==="file"&&(x==="comp"?(et=n("comp_file"))==null||et.click():(w=n(`${x}_file`))==null||w.click()),k.getAttribute("data-clear")==="1"))if(x==="comp")$();else{_(x,null);const j=n(`${x}_cam`),It=n(`${x}_file`);j&&(j.value=""),It&&(It.value="")}}),["vin","corr_pre","corr_post","voltaje","scan_carro"].forEach(S=>{const k=n(`${S}_cam`),x=n(`${S}_file`),W=async tt=>{var j,It;const et=(It=(j=tt.target)==null?void 0:j.files)==null?void 0:It[0];if(!et)return;_(S,et);const w=await z(S,et,"out");if(w&&w.ok){k&&(k.value=""),x&&(x.value="");try{await K()}catch{}}};k&&k.addEventListener("change",W),x&&x.addEventListener("change",W),_(S,null)}),(Un=n("comp_cam"))==null||Un.addEventListener("change",S=>ge(S.target.files)),(wn=n("comp_file"))==null||wn.addEventListener("change",S=>si(S.target.files)),$(),(Fn=n("btnScanQR_params"))==null||Fn.addEventListener("click",()=>_t("params","QR")),(Bn=n("btnScanBAR_params"))==null||Bn.addEventListener("click",()=>_t("params","BAR")),(qn=n("btnStop_params"))==null||qn.addEventListener("click",()=>dt("params")),(Vn=n("btnScanQR_falla"))==null||Vn.addEventListener("click",()=>_t("falla","QR")),(Qn=n("btnScanBAR_falla"))==null||Qn.addEventListener("click",()=>_t("falla","BAR")),(jn=n("btnStop_falla"))==null||jn.addEventListener("click",()=>dt("falla")),(Pn=n("btnScanQR_qc"))==null||Pn.addEventListener("click",()=>_t("qc","QR")),(zn=n("btnScanBAR_qc"))==null||zn.addEventListener("click",()=>_t("qc","BAR")),(Kn=n("btnStop_qc"))==null||Kn.addEventListener("click",()=>dt("qc")),(Hn=n("btnScanQR_conf"))==null||Hn.addEventListener("click",()=>_t("conf","QR")),(Gn=n("btnScanBAR_conf"))==null||Gn.addEventListener("click",()=>_t("conf","BAR")),(Wn=n("btnStop_conf"))==null||Wn.addEventListener("click",()=>dt("conf")),(Jn=n("btnFallaCam"))==null||Jn.addEventListener("click",()=>{var S;return(S=n("falla_cam"))==null?void 0:S.click()}),(Yn=n("btnFallaFile"))==null||Yn.addEventListener("click",()=>{var S;return(S=n("falla_file"))==null?void 0:S.click()}),(Zn=n("btnFallaClear"))==null||Zn.addEventListener("click",()=>{i=[],ee()}),(Xn=n("falla_cam"))==null||Xn.addEventListener("change",S=>{Nn(S.target.files),S.target.value=""}),(ta=n("falla_file"))==null||ta.addEventListener("change",S=>{Nn(S.target.files),S.target.value=""}),(ea=n("btnEnviarFalla"))==null||ea.addEventListener("click",async()=>{var W,tt,et;const S=(((W=n("fallaVin"))==null?void 0:W.value)||"").trim(),k=((tt=n("fallaDate"))==null?void 0:tt.value)||pt(),x=(((et=n("fallaNota"))==null?void 0:et.value)||"").trim();if(!S){f("outFalla","❌ Falta VIN.");return}if(!x&&i.length===0){f("outFalla","⚠️ Agrega una nota o al menos una foto.");return}try{const w=await ds({vin:S,dateStr:k,note:x,files:i,apsUrl:e.apsUrl,onProgress:j=>{j.phase==="prepare"?f("outFalla",`Preparando foto ${j.index}/${j.total}...
`):j.phase==="upload"&&f("outFalla",`Subiendo FALLA (${j.total} foto(s) + nota)...
`)}});if(!w.ok){f("outFalla","❌ uploadFalla: "+(w.error||"Error"));return}f("outFalla",`✅ Falla registrada.
Carpeta: ${w.carFolderName}/FALLAS
Batch: ${w.batchId}
Guardados: ${w.savedCount}`),i=[],ee()}catch(w){f("outFalla",`❌ Error FALLA: ${w}`)}}),ee(),(na=n("btnQcCam"))==null||na.addEventListener("click",()=>{var S;return(S=n("qc_cam"))==null?void 0:S.click()}),(aa=n("btnQcFile"))==null||aa.addEventListener("click",()=>{var S;return(S=n("qc_file"))==null?void 0:S.click()}),(oa=n("btnQcClear"))==null||oa.addEventListener("click",Qe),(ia=n("qc_cam"))==null||ia.addEventListener("change",S=>ci(S.target.files)),(sa=n("qc_file"))==null||sa.addEventListener("change",S=>li(S.target.files)),Qe(),(ra=n("btnQcUpload"))==null||ra.addEventListener("click",async()=>{var tt,et;const S=(((tt=n("qcVin"))==null?void 0:tt.value)||"").trim(),k=((et=n("qcDate"))==null?void 0:et.value)||pt();if(!S){f("outQc","❌ Falta VIN.");return}if(s.filter(Boolean).length<3){f("outQc","⚠️ Debes subir mínimo 3 fotos de calidad.");return}const W=[];for(let w=0;w<4;w++){const j=s[w];j&&W.push({slot:`calidad_${w+1}`,file:j})}try{const w=await us({vin:S,dateStr:k,items:W,apsUrl:e.apsUrl,onProgress:j=>{j.phase==="prepare"?f("outQc",`Preparando ${j.slot}...
`):j.phase==="upload"&&f("outQc",`Enviando CALIDAD (${j.total} foto(s))...
`)}});if(!w.ok){f("outQc","❌ uploadCalidad: "+(w.error||"Error"));return}f("outQc",`✅ Calidad registrada.
Carpeta: ${w.carFolderName}/CALIDAD
Guardados: ${Array.isArray(w.saved)?w.saved.length:W.length}`),Qe()}catch(w){f("outQc",`❌ Error CALIDAD: ${w}`)}}),(ca=n("btnConfCam"))==null||ca.addEventListener("click",()=>{var S;return(S=n("conf_cam"))==null?void 0:S.click()}),(la=n("btnConfFile"))==null||la.addEventListener("click",()=>{var S;return(S=n("conf_file"))==null?void 0:S.click()}),(da=n("btnConfClear"))==null||da.addEventListener("click",()=>{r=null,Pt()}),(ua=n("conf_cam"))==null||ua.addEventListener("change",S=>{var k;r=((k=S.target.files)==null?void 0:k[0])||null,Pt(),S.target.value=""}),(pa=n("conf_file"))==null||pa.addEventListener("change",S=>{var k;r=((k=S.target.files)==null?void 0:k[0])||null,Pt(),S.target.value=""}),(fa=n("btnEnviarConf"))==null||fa.addEventListener("click",async()=>{var et,w,j,It,ma,va,ga;const S=(((et=n("confTipo"))==null?void 0:et.value)||"").trim(),k=(((w=n("confVin"))==null?void 0:w.value)||"").trim(),x=((j=n("confDate"))==null?void 0:j.value)||pt(),W=(((It=n("confTecnico"))==null?void 0:It.value)||"").trim(),tt={revisadoConTiempo:!!((ma=n("chk1"))!=null&&ma.checked),responsablePerdida:!!((va=n("chk2"))!=null&&va.checked),todoConforme:!!((ga=n("chk3"))!=null&&ga.checked)};if(!k){f("outConf","❌ Falta VIN.");return}if(!W){f("outConf","❌ Falta nombre del técnico.");return}if(!r){f("outConf","❌ Falta foto del equipo.");return}if(!tt.revisadoConTiempo||!tt.responsablePerdida||!tt.todoConforme){f("outConf","⚠️ Debes marcar los 3 checks de conformidad.");return}try{const vt=await ps({tipo:S,vin:k,dateStr:x,tecnico:W,checklist:tt,file:r,apsUrl:e.apsUrl,onProgress:ba=>{ba.phase==="prepare"&&f("outConf",`Preparando foto...
`),ba.phase==="upload"&&f("outConf",`Enviando conformidad...
`)}});if(!vt.ok){f("outConf","❌ uploadConformidad: "+(vt.error||"Error"));return}f("outConf",`✅ Conformidad registrada.
Tipo: ${S}
Carpeta: ${vt.carFolderName}/${vt.mainFolderName}/${vt.subFolderName}
Acta: ${vt.actaName}
Foto: ${vt.photoName}`),r=null,Pt()}catch(vt){f("outConf",`❌ Error CONFORMIDAD: ${vt}`)}}),Pt()}function fi(m={}){var E;const v=String(m.vin||"").trim(),h=String(m.dateStr||"").trim(),A=String(m.screen||"").trim().toLowerCase();v&&(n("vinText")&&(n("vinText").value=v),n("fallaVin")&&(n("fallaVin").value=v),n("qcVin")&&(n("qcVin").value=v),n("confVin")&&(n("confVin").value=v)),h&&(n("dateStr")&&(n("dateStr").value=h),n("fallaDate")&&(n("fallaDate").value=h),n("qcDate")&&(n("qcDate").value=h),n("confDate")&&(n("confDate").value=h)),t&&(t.style.display="block"),C(A==="params"?"params":A==="falla"?"falla":A==="calidad"||A==="qc"?"calidad":A==="conformidad"||A==="conf"?"conformidad":"menu"),(((E=n("vinText"))==null?void 0:E.value)||"").trim()&&K().catch(()=>{})}function mi(){je().catch(()=>{}),t&&(t.style.display="none")}return ui(),pi(),di(),C("menu"),{show:fi,hide:mi,refreshStatus:K,showScreen:C,stopAllScanners:je}}let We=!1,xt=null;const re=new Map,we=t=>document.getElementById(t);function fo(t={}){if(We)return xt;const e=we("viewUploader");return e?(xt=po(e,{apsUrl:t.apsUrl,onBackControl:()=>{var o;Qt(),Vt();const a=String(((o=p==null?void 0:p.state)==null?void 0:o.currentModule)||"").trim().toUpperCase();if(a){const i=document.getElementById(`view${a}`);if(i){i.style.display="block";return}}const n=document.getElementById("viewHub");n&&(n.style.display="block")}}),We=!0,xt):(console.warn("[Uploader] No existe #viewUploader en el HTML"),null)}function bs(t,e={}){var r;const a=document.getElementById(t);if(!a)return console.warn("[Uploader] mountId no existe:",t),null;const n=re.get(t),o=!!a.querySelector(".uploader-shell");if(n&&o)return n;if(n){try{(r=n.stopAllScanners)==null||r.call(n)}catch{}re.delete(t)}const i=we("viewUploader");if(!i)return console.warn("[Uploader] No existe #viewUploader para clonar template"),null;a.innerHTML=i.innerHTML;const s=po(a,{apsUrl:e.apsUrl,onBackControl:e.onBackControl||(()=>{try{s.showScreen("menu")}catch{}})});return re.set(t,s),s}function vn({vin:t="",screen:e="menu",dateStr:a="",mountId:n="",inModal:o=!1,onBackControl:i=null,apsUrl:s=null}={}){if(n){const r=bs(n,{apsUrl:s,onBackControl:i});r&&r.show({vin:t,screen:e,dateStr:a});return}if(We||fo({apsUrl:s}),!o){const r=document.getElementById("viewApp");r&&(r.style.display="block");const c=document.getElementById("viewHub");c&&(c.style.display="none")}if(xt)xt.show({vin:t,screen:e,dateStr:a});else{const r=we("viewUploader");r&&(r.style.display="block")}}function Qt({mountId:t=""}={}){var a;if(t){const n=document.getElementById(t),o=re.get(t);try{(a=o==null?void 0:o.stopAllScanners)==null||a.call(o)}catch{}n&&(n.innerHTML=""),re.delete(t);return}xt&&xt.hide();const e=we("viewUploader");e&&(e.style.display="none")}const ys="modulepreload",hs=function(t){return"/"+t},ha={},_a=function(e,a,n){let o=Promise.resolve();if(a&&a.length>0){let s=function(u){return Promise.all(u.map(d=>Promise.resolve(d).then(l=>({status:"fulfilled",value:l}),l=>({status:"rejected",reason:l}))))};document.getElementsByTagName("link");const r=document.querySelector("meta[property=csp-nonce]"),c=(r==null?void 0:r.nonce)||(r==null?void 0:r.getAttribute("nonce"));o=s(a.map(u=>{if(u=hs(u),u in ha)return;ha[u]=!0;const d=u.endsWith(".css"),l=d?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${u}"]${l}`))return;const b=document.createElement("link");if(b.rel=d?"stylesheet":ys,d||(b.as="script"),b.crossOrigin="",b.href=u,c&&b.setAttribute("nonce",c),document.head.appendChild(b),d)return new Promise((g,f)=>{b.addEventListener("load",g),b.addEventListener("error",()=>f(new Error(`Unable to preload CSS for ${u}`)))})}))}function i(s){const r=new Event("vite:preloadError",{cancelable:!0});if(r.payload=s,window.dispatchEvent(r),!r.defaultPrevented)throw s}return o.then(s=>{for(const r of s||[])r.status==="rejected"&&i(r.reason);return e().catch(i)})};function mo(t){return String((t==null?void 0:t.estado)||"").toUpperCase()==="FINALIZADO"}function _s(t){const e=String(t||"").toUpperCase();return e==="SIN_INICIAR"?["INICIO","NOTA"]:e==="TRABAJANDO"?["PAUSA","FIN","NOTA"]:e==="PAUSADO"?["REANUDAR","FIN","NOTA"]:e==="FINALIZADO"?["NOTA"]:["INICIO","NOTA"]}function Is(t){const e=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();return p.state.currentModule==="CALIDAD"?e==="CALIDAD":p.state.currentModule==="RAMALERO"?e==="RAMALERO":e==="MOTOR"||e==="TANQUE"}function Bt(t,e=Date.now()){const a=Number(t.tiempo_ms||t.tiempo_trab_ms||0),n=t.running_since?Date.parse(t.running_since):NaN;return!isNaN(n)&&String(t.estado||t.estado_actual).toUpperCase()==="TRABAJANDO"?a+Math.max(0,e-n):a}function vo(t){const e=String(t||"").toUpperCase();return e==="SIN_INICIAR"?'<div class="jobActionsGrid"><button class="btnInicio" data-act="INICIO">INICIO</button></div>':e==="TRABAJANDO"?`<div class="jobActionsGrid">
      <button class="btnPausa" data-act="PAUSA">PAUSA</button>
      <button class="btnFin" data-act="FIN">FIN</button>
    </div>`:e==="PAUSADO"?`<div class="jobActionsGrid">
      <button class="btnReanudar" data-act="REANUDAR">REANUDAR</button>
      <button class="btnFin" data-act="FIN">FIN</button>
    </div>`:'<div class="jobActionsGrid"><button class="btnInicio" data-act="NOTA">GUARDAR NOTA</button></div>'}function Cs(t){const e=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();if(e!=="MOTOR"&&e!=="TANQUE")return"";const a=String((t==null?void 0:t.tanque_asignado)||"").trim(),n=String((t==null?void 0:t.reductor_asignado)||"").trim(),o=String((t==null?void 0:t.tanque_registrado)||"").trim(),i=String((t==null?void 0:t.reductor_registrado)||"").trim(),s=e==="TANQUE",r=s?"TANQUE ASIGNADO:":"REDUCTOR ASIGNADO:",c=s?a:n,u=s?"TANQUE REGISTRADO:":"REDUCTOR REGISTRADO:",d=s?o:i,l=N(c||"NO ASIGNADO"),b=N(d||"—"),g=c?"":" na",f=d?"":" na";return`
    <div class="asignadoRow js-asignado" data-rol="${N(e)}">
      <span class="asignadoLabel">${N(r)}</span>
      <span class="asignadoValue${g}">${l}</span>
    </div>
    <div class="asignadoRow js-registrado" data-rol="${N(e)}" style="margin-top:6px;">
      <span class="asignadoLabel">${N(u)}</span>
      <span class="asignadoValue${f}">${b}</span>
    </div>
  `}function go(t,e=""){if(p.state.currentModule!=="CALIDAD")return"";const a=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),n=String((t==null?void 0:t.conversionId)||"").trim();return!a&&!n?"":(Number((t==null?void 0:t.inc_leve)||0),Number((t==null?void 0:t.inc_moderada)||0),Number((t==null?void 0:t.inc_critica)||0),`
    <div class="jobActionsGrid" style="margin-bottom:10px;">
      <button class="btnRF" type="button" data-go="INC" data-key="${N(e)}"
        style="margin-top:0;">
        Registrar Inc.
      </button>
      <button class="btnRF" type="button" data-go="VER_INC"
        data-vin="${N(a)}" data-cid="${N(n)}"
        style="margin-top:0;">
        Ver incidencias
      </button>
    </div>
  `)}function gn(){var e,a;const t=new Map;return(a=(e=U("activasBox"))==null?void 0:e.querySelectorAll(".jobCard[data-key]"))==null||a.forEach(n=>{const o=n.dataset.key||"",i=n.querySelector("textarea.notaCard");i&&t.set(o,String(i.value||""))}),t}function bn(t){var e,a;t&&((a=(e=U("activasBox"))==null?void 0:e.querySelectorAll(".jobCard[data-key]"))==null||a.forEach(n=>{const o=n.dataset.key||"",i=n.querySelector("textarea.notaCard");i&&t.has(o)&&(i.value=t.get(o))}))}function Tt(){const t=F(),e=[...t.itemsByKey.values()].filter(Is),a=[],n=[];e.sort((o,i)=>{const s=o.updated_at?Date.parse(o.updated_at):0;return(i.updated_at?Date.parse(i.updated_at):0)-s});for(const o of e){const i=`${String(o.conversionId||"").trim()}|${String(o.rolTrabajo||"").toUpperCase()}`;mo(o)?n.push(i):a.push(i)}t.activeKeys=a,t.finalKeys=n}function Jt(){const t=F(),e=U("activasBox");if(!e)return;if(!t.activeKeys.length){e.innerHTML='<div class="small">No tienes trabajos activos.</div>';return}const a=Date.now();let n="";for(const o of t.activeKeys){const i=t.itemsByKey.get(o);if(!i)continue;const s=String(i.estado||"").toUpperCase(),r=N(i.rolTrabajo||""),c=N(i.vin||""),u=N(i.tipoRamal||""),d=wt(Bt(i,a)),l=N(lo(i.running_since||i.created_at||i.fecha_creacion)),b=N(i.motorNombre||""),g=N(i.tanqueroNombre||""),f=p.state.currentModule==="RAMALERO"?`RAMAL: ${u||"-"}`:c||"<span class='small'>(sin VIN)</span>";n+=`
      <div class="jobCard card state-${s}" data-key="${N(o)}">
        <div class="jobTop">
          <div class="jobMeta">
            <div class="jobTitle">${f} <span>(${r})</span></div>
            <div class="jobSub">
              <span><b>Estado:</b> <span class="js-estado">${s}</span></span>
              <span class="small">Inicio: ${l}</span>
              ${p.state.currentModule==="CALIDAD"&&(b||g)?`
                <span class="small js-personal">
                  ${b?`🔧 MOTOR: <b>${b}</b>`:""}
                  ${b&&g?" &nbsp;|&nbsp; ":""}
                  ${g?`🛢️ TANQUERO: <b>${g}</b>`:""}
                </span>`:""}
            </div>
          </div>
          <div class="jobRight">
            <div class="jobTimePill js-tiempo">⏱ ${d}</div>
            <div class="jobChevron"></div>
          </div>
        </div>

        <div class="jobExpand">
          ${Cs(i)}

          ${String((i==null?void 0:i.rolTrabajo)||"").toUpperCase()==="MOTOR"||String((i==null?void 0:i.rolTrabajo)||"").toUpperCase()==="TANQUE"?`<button class="btnRF" type="button" data-go="CONF" style="margin-bottom:10px;">
                  ✅ Registro de conformidad de equipo
                </button>`:""}

          ${go(i,o)}

          <div class="jobActionsSlot">${vo(s)}</div>

          ${p.state.currentModule==="TECNICO"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>':p.state.currentModule==="CALIDAD"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar calidad / fallas</button>':""}

          <div class="jobNoteBlock">
            <textarea class="notaCard" rows="2" placeholder="Escribe una nota..."></textarea>
            <button class="btnNota" data-act="NOTA" style="margin-top:10px; width:100%; height:66px; font-weight:900; display:none;">
              Guardar nota
            </button>
          </div>
        </div>
      </div>
    `}e.innerHTML=n}function mt(t=""){const e=F(),a=U("finalizadosWrap"),n=U("finalizadosBox");if(!a||!n)return;if(!e.showFinalizados){a.style.display="none",n.innerHTML="";return}if(a.style.display="block",!e.finalKeys.length){n.innerHTML=t+'<div class="small">No tienes finalizados.</div>';return}const o=Date.now();let i="";for(const s of e.finalKeys){const r=e.itemsByKey.get(s);if(!r)continue;const c=N(String(r.vin||"").toUpperCase()),u=N(String(r.rolTrabajo||"")),d=N(String(r.tipoRamal||"")),l=N(String(r.estado||"FINALIZADO").toUpperCase()),b=wt(Bt(r,o)),g=N(lo(r.running_since||r.created_at||r.fecha_creacion)),f=N(r.motorNombre||""),I=N(r.tanqueroNombre||""),C=p.state.currentModule==="RAMALERO"?`RAMAL: ${d||"-"}`:c||"(sin VIN)";i+=`
      <div class="card" style="margin-top:10px;" data-key="${N(s)}">
        <div><b>${C}</b> <span class="small">(${u})</span></div>
        <div class="row space-between" style="margin-top:6px;">
          <div class="small"><b>Estado:</b> ${l}</div>
          <div class="pill" style="font-size:18px; font-weight:800;">⏱ ${b}</div>
        </div>
        <div class="small">Inicio: ${g}</div>
        ${p.state.currentModule==="CALIDAD"&&(f||I)?`
          <div class="small js-personal" style="margin-top:4px;">
            ${f?`🔧 MOTOR: <b>${f}</b>`:""}
            ${f&&I?" &nbsp;|&nbsp; ":""}
            ${I?`🛢️ TANQUERO: <b>${I}</b>`:""}
          </div>`:""}

        ${go(r,s)}

        ${p.state.currentModule==="TECNICO"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>':p.state.currentModule==="CALIDAD"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar calidad / fallas</button>':""}
      </div>
    `}n.innerHTML=t+i}function ye(){const t=F(),e=U("activasBox");if(!e)return;const a=Date.now();for(const n of t.activeKeys){const o=t.itemsByKey.get(n);if(!o)continue;const i=e.querySelector(`.jobCard[data-key="${ss(n)}"]`);if(!i)continue;const s=i.classList.contains("open"),r=String(o.estado||"").toUpperCase();i.className=`jobCard card state-${r}`+(s?" open":"");const c=i.querySelector(".js-estado");c&&(c.textContent=r);const u=i.querySelector(".js-tiempo");u&&(u.textContent=`⏱ ${wt(Bt(o,a))}`);try{const d=String(o.rolTrabajo||"").toUpperCase();if(d==="MOTOR"||d==="TANQUE"){const l=d==="TANQUE",b=l?String(o.tanque_asignado||"").trim():String(o.reductor_asignado||"").trim(),g=l?String(o.tanque_registrado||"").trim():String(o.reductor_registrado||"").trim(),f=i.querySelector(".js-asignado .asignadoValue"),I=i.querySelector(".js-registrado .asignadoValue");f&&(f.textContent=b||"LIBRE",f.classList.toggle("na",!b)),I&&(I.textContent=g||"—",I.classList.toggle("na",!g))}}catch{}try{if(p.state.currentModule==="CALIDAD"){const d=i.querySelector(".js-personal");if(d){const l=N(o.motorNombre||""),b=N(o.tanqueroNombre||"");d.innerHTML=[l?`🔧 MOTOR: <b>${l}</b>`:"",l&&b?"&nbsp;|&nbsp;":"",b?`🛢️ TANQUERO: <b>${b}</b>`:""].join("")}}}catch{}if(s){const d=i.querySelector(".jobActionsSlot");d&&(d.innerHTML=vo(r))}}}const R={open:!1,itemKey:"",item:null,photo:null,techSelected:null,sugItems:[],sugOpen:!1,sugIdx:-1,sugTimer:null,lastQ:"",cache:{ts:0,items:[]}},Ss=600*1e3;function bo(){return J("incFotoPreview")}function yo(){return J("incFotoPreviewWrap")}function Je(){return J("incFotoCam")}function Ye(){return J("incFotoFile")}function Gt(){var n;R.photo=null;const t=Je();t&&(t.value="");const e=Ye();e&&(e.value="");const a=bo();a&&(a.src=""),(n=yo())==null||n.classList.add("hidden")}function As(t){return new Promise((e,a)=>{const n=new FileReader;n.onload=()=>e(String(n.result||"")),n.onerror=a,n.readAsDataURL(t)})}function Es(t){return new Promise((e,a)=>{const n=new Image,o=setTimeout(()=>{a(new Error("Timeout cargando imagen (iPhone?)"))},8e3);n.onload=()=>{clearTimeout(o),e(n)},n.onerror=()=>{clearTimeout(o),a(new Error("No se pudo cargar la imagen"))},n.crossOrigin="anonymous",n.src=t})}async function Rs(t){const e=await As(t),a=await Es(e),n=960,o=960;let i=a.naturalWidth||a.width||0,s=a.naturalHeight||a.height||0;if(!i||!s)throw new Error("No se pudo obtener dimensiones de la imagen (iPhone?)");const r=Math.min(n/i,o/s,1),c=Math.round(i*r),u=Math.round(s*r),d=document.createElement("canvas");d.width=c,d.height=u;const l=d.getContext("2d");if(!l)throw new Error("Canvas 2D no disponible en este navegador (iPhone?)");try{l.drawImage(a,0,0,c,u)}catch(C){throw new Error(`Error dibujando en canvas: ${(C==null?void 0:C.message)||C}`)}let b;try{b=d.toDataURL("image/jpeg",.65)}catch(C){throw new Error(`Canvas.toDataURL falló: ${(C==null?void 0:C.message)||C}`)}const g=b.match(/^data:(.*?);base64,(.*)$/);if(!g||!g[2])throw new Error("No se pudo procesar la imagen (base64 vacío?)");const f=g[2],I=f.length*.75/(1024*1024);if(I>3.5)throw new Error(`Imagen muy grande (${I.toFixed(1)}MB). Intenta otra.`);return{mimeType:"image/jpeg",b64:f,previewUrl:b,name:(t.name||"incidencia.jpg").replace(/\.[^.]+$/,"")+".jpg"}}async function Ia(t){var e,a,n;try{const o=(a=(e=t.target)==null?void 0:e.files)==null?void 0:a[0];if(!o){Gt();return}if(!String(o.type||"").startsWith("image/")){H("Solo se permiten imágenes."),Gt();return}const i=50,s=i*1024*1024;if(o.size>s){H(`❌ Archivo muy grande (máx ${i}MB). Intenta con otra foto.`),Gt();return}H("Procesando foto...");const r=await Rs(o);R.photo={b64:r.b64,mimeType:r.mimeType,name:r.name,previewUrl:r.previewUrl};const c=bo();c&&(c.src=r.previewUrl),(n=yo())==null||n.classList.remove("hidden"),H("")}catch(o){console.error("[INC foto] ERROR:",o),H("❌ No se pudo procesar la foto. "+String((o==null?void 0:o.message)||"")),Gt()}}function J(t){return document.getElementById(t)}function H(t){const e=J("incMsg");e&&(e.textContent=String(t||""))}function ho(t){const e=J("incInfo");e&&(e.textContent=String(t||""))}function yn(){return J("incModal")}function _o(){return J("btnIncSave")}function Dt(){return J("incTechInput")}function Fe(){return J("incTechSuggest")}function Io(){return J("incTech")}function Be(){return J("incTipo")}function hn(){return J("incNota")}function Co(){Gt(),R.itemKey="",R.item=null,R.techSelected=null;const t=Dt();t&&(t.value="");const e=Io();e&&(e.innerHTML="");const a=Be();a&&(a.value="");const n=hn();n&&(n.value=""),H(""),ho(""),qt(),qe()}function qe(){var n,o,i;const t=_o();if(!t)return;const e=!!((n=R.techSelected)!=null&&n.userId)||!!((o=R.techSelected)!=null&&o.email),a=!!String(((i=Be())==null?void 0:i.value)||"").trim();t.disabled=!(e&&a)}function So(t){return String(t||"").trim().toLowerCase()}function Ts(t){return So([t.name,t.email,t.label].filter(Boolean).join(" "))}function qt(){const t=Fe();t&&(R.sugOpen=!1,R.sugIdx=-1,R.sugItems=[],t.classList.add("hidden"),t.innerHTML="")}function Ao(){const t=Fe();if(t){if(!R.sugItems.length){qt();return}t.innerHTML=R.sugItems.map((e,a)=>{const n=a===R.sugIdx?"active":"",o=String(e.name||"").trim();return`
      <div class="nsItem ${n}" data-idx="${a}" role="option" aria-selected="${a===R.sugIdx}">
        <div class="nsTitle">${N(o)}</div>
      </div>
    `}).join(""),t.classList.remove("hidden"),R.sugOpen=!0}}function Ca(t){if(!R.sugItems.length)return;R.sugIdx=Math.max(0,Math.min(t,R.sugItems.length-1)),Ao();const e=Fe(),a=e==null?void 0:e.querySelector(`.nsItem[data-idx="${R.sugIdx}"]`);a&&a.scrollIntoView({block:"nearest"})}function Eo(t){R.techSelected=t||null;const e=Dt();e&&(e.value=t?String(t.name||"").trim():"");const a=Io();if(a&&(a.innerHTML="",t)){const n=document.createElement("option");n.value=String(t.userId||t.email||""),n.textContent=String(t.name||"").trim(),n.selected=!0,a.appendChild(n)}qt(),qe()}async function Ls(t){const e=String(t||"").trim();if(!e)return[];const a=await Lt(`/api/name-suggest?q=${encodeURIComponent(e)}&limit=12`);return a!=null&&a.ok?(Array.isArray(a.items)?a.items:[]).map(o=>({userId:String(o.userId||o.id||"").trim(),name:String(o.name||o.nombre||"").trim(),email:String(o.email||"").trim(),label:String(o.label||"").trim()})):[]}function Ms(){const t=Dt();if(!t)return;const e=String(t.value||"").trim();if(R.lastQ=e,R.techSelected=null,qe(),!e){qt();return}clearTimeout(R.sugTimer),R.sugTimer=setTimeout(async()=>{try{const a=await Ls(e);if(R.lastQ!==e)return;let n=a;if(!n.length&&R.cache.items.length){const o=So(e);n=R.cache.items.filter(i=>Ts(i).includes(o)).slice(0,12)}R.sugItems=n,R.sugIdx=n.length?0:-1,Ao()}catch{qt()}},180)}function Ns(t){if(R.sugOpen){if(t.key==="ArrowDown"){t.preventDefault(),Ca(R.sugIdx+1);return}if(t.key==="ArrowUp"){t.preventDefault(),Ca(R.sugIdx-1);return}if(t.key==="Enter"){R.sugIdx>=0&&R.sugItems[R.sugIdx]&&(t.preventDefault(),Eo(R.sugItems[R.sugIdx]));return}t.key==="Escape"&&(t.preventDefault(),qt())}}function Os(t){return F().itemsByKey.get(String(t||""))||null}function ks(t){const e=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),a=String((t==null?void 0:t.conversionId)||"").trim(),n=Number((t==null?void 0:t.inc_leve)||0),o=Number((t==null?void 0:t.inc_moderada)||0),i=Number((t==null?void 0:t.inc_critica)||0);return`VIN: ${e||"-"} | OT: ${a||"-"} | Acumulado → L:${n} M:${o} C:${i}`}async function Ro(t){if(p.state.currentModule!=="CALIDAD")return;const e=Os(t);if(!e){V({ok:!1,error:"No se encontró el trabajo para registrar incidencia."});return}Co(),R.itemKey=String(t||""),R.item=e,ho(ks(e)),H("");const a=yn();a&&(a.classList.add("show"),a.setAttribute("aria-hidden","false"),document.body.classList.add("modal-open")),R.open=!0;try{const n=Date.now();if(!R.cache.items.length||n-R.cache.ts>Ss){const o=await Lt("/api/name-suggest?q=.&limit=120");o!=null&&o.ok&&(R.cache.items=(Array.isArray(o.items)?o.items:[]).map(i=>({userId:String(i.userId||i.id||"").trim(),name:String(i.name||i.nombre||"").trim(),email:String(i.email||"").trim(),label:String(i.label||"").trim()})),R.cache.ts=n)}}catch{}setTimeout(()=>{var n;return(n=Dt())==null?void 0:n.focus()},0)}async function he(){const t=yn();if(t){const e=document.activeElement;e&&t.contains(e)&&e.blur(),t.classList.remove("show"),t.setAttribute("aria-hidden","true")}document.body.classList.remove("modal-open"),R.open=!1,Co()}async function xs(){var r,c;if(p.state.currentModule!=="CALIDAD"||!R.item)return;const t=String((se==null?void 0:se())||"").trim().toLowerCase();if(!t){H("No hay email de sesión."),V({ok:!1,error:"No hay email de sesión."});return}const e=String(((r=Be())==null?void 0:r.value)||"").trim().toUpperCase();if(!["LEVE","MODERADA","CRITICA"].includes(e)){H("Selecciona el tipo de incidencia.");return}const a=R.techSelected;if(!a||!a.userId&&!a.email){H("Selecciona un técnico de la lista.");return}const n=String(((c=hn())==null?void 0:c.value)||"").trim(),o=R.item,i={email:t,conversionId:String(o.conversionId||"").trim(),vin:String(o.vin||"").trim().toUpperCase(),rolTrabajo:"CALIDAD",tecnicoUserId:String(a.userId||"").trim(),tecnicoEmail:String(a.email||"").trim(),tecnicoNombre:String(a.name||"").trim(),tipo:e,nota:n,foto:R.photo?{b64:R.photo.b64,mimeType:R.photo.mimeType,name:R.photo.name}:null};let s;try{s=await xe("/api/incidencia",i),V(s)}catch(u){console.error("[INC save] ERROR:",u);const d=String((u==null?void 0:u.message)||u||"Error desconocido");H(`❌ Error: ${d}`),V({ok:!1,error:d});return}if(!s||typeof s!="object"){H("❌ Respuesta inválida del servidor."),V({ok:!1,error:"Respuesta inválida del servidor",raw:s});return}if(!s.ok){const u=s.error||s.message||JSON.stringify(s);H(`❌ ${u}`);return}try{const u=F(),d=s.item||s.data||s.row||null;if(d&&(d.conversionId||d.vin)){const l=u.itemsByKey.get(R.itemKey);if(l){const b={...l};d.inc_leve!=null?b.inc_leve=Number(d.inc_leve||0):e==="LEVE"&&(b.inc_leve=Number(b.inc_leve||0)+1),d.inc_moderada!=null?b.inc_moderada=Number(d.inc_moderada||0):e==="MODERADA"&&(b.inc_moderada=Number(b.inc_moderada||0)+1),d.inc_critica!=null?b.inc_critica=Number(d.inc_critica||0):e==="CRITICA"&&(b.inc_critica=Number(b.inc_critica||0)+1),u.itemsByKey.set(R.itemKey,b);const g=gn();Tt(),Jt(),mt(),bn(g)}}}catch(u){console.warn("[INC patch local] warning:",u)}H("✅ Incidencia registrada."),setTimeout(()=>{he().catch(()=>{})},350)}function Ds(){var e,a,n,o,i,s,r,c,u,d,l,b;const t=yn();t&&t.dataset.bound!=="1"&&(t.dataset.bound="1",(e=J("btnCloseInc"))==null||e.addEventListener("click",()=>{he().catch(()=>{})}),t.addEventListener("click",g=>{g.target===t&&he().catch(()=>{})}),(a=Dt())==null||a.addEventListener("input",Ms),(n=Dt())==null||n.addEventListener("keydown",Ns),(o=J("btnIncFotoCam"))==null||o.addEventListener("click",()=>{var g;H(""),(g=Je())==null||g.click()}),(i=J("btnIncFotoFile"))==null||i.addEventListener("click",()=>{var g;H(""),(g=Ye())==null||g.click()}),(s=Je())==null||s.addEventListener("change",Ia),(r=Ye())==null||r.addEventListener("change",Ia),(c=J("btnIncFotoClear"))==null||c.addEventListener("click",()=>{Gt(),H("")}),(u=Fe())==null||u.addEventListener("mousedown",g=>{const f=g.target.closest(".nsItem[data-idx]");if(!f)return;g.preventDefault();const I=Number(f.dataset.idx),C=R.sugItems[I];C&&Eo(C)}),document.addEventListener("click",g=>{var I;if(!R.open||!R.sugOpen)return;const f=(I=Dt())==null?void 0:I.closest(".supNameWrap");f&&f.contains(g.target)||qt()}),(d=Be())==null||d.addEventListener("change",()=>{H(""),qe()}),(l=hn())==null||l.addEventListener("input",()=>{H("")}),(b=_o())==null||b.addEventListener("click",async()=>{await Z(async()=>{await xs()},"Guardando incidencia...")}),document.addEventListener("keydown",g=>{R.open&&g.key==="Escape"&&(g.preventDefault(),he().catch(()=>{}))}))}const At={open:!1,vin:""},ot=t=>document.getElementById(t),_n=()=>ot("rfModal");function To(t){const e=ot("rfInfo");e&&(e.textContent=String(t||""))}function Lo(t){const e=ot("rfMsg");e&&(e.textContent="")}function Mo(){try{Qt({mountId:"rfUploaderMount"})}catch{}ot("rfMenu")&&(ot("rfMenu").style.display="block"),ot("rfStage")&&(ot("rfStage").style.display="none"),ot("rfStage")&&(ot("rfStage").innerHTML="")}function Sa(t){var n;const e=ot("rfMenu"),a=ot("rfStage");a&&(e&&(e.style.display="none"),a.style.display="block",a.innerHTML=`
    <div class="row" style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <button type="button" id="btnRfBack" class="btn" style="height:44px; padding:0 14px; font-weight:900;">
        ← Volver
      </button>
      <div class="pill small" style="opacity:.95;">
        ${t==="calidad"?"CONTROL CALIDAD":"REGISTRAR FALLA"}
      </div>
    </div>

    <div id="rfUploaderMount"></div>
  `,(n=a.querySelector("#btnRfBack"))==null||n.addEventListener("click",Mo),vn({vin:At.vin,screen:t,mountId:"rfUploaderMount"}))}function No(t){if(p.state.currentModule!=="CALIDAD")return;const e=String(t||"").trim().toUpperCase();if(!e){V({ok:!1,error:"VIN vacío para RF modal."});return}At.vin=e,At.open=!0,To(`VIN: ${e}`),Lo();const a=_n();a&&(a.classList.add("show"),a.setAttribute("aria-hidden","false"),document.body.classList.add("modal-open")),Mo()}function Pe(){try{Qt({mountId:"rfUploaderMount"})}catch{}const t=_n();if(t){const n=document.activeElement;n&&t.contains(n)&&n.blur(),t.classList.remove("show"),t.setAttribute("aria-hidden","true")}document.body.classList.remove("modal-open"),At.open=!1,At.vin="",To(""),Lo();const e=document.getElementById("rfMenu"),a=document.getElementById("rfStage");e&&(e.style.display="block"),a&&(a.style.display="none",a.innerHTML="")}function $s(){var e,a,n;const t=_n();t&&t.dataset.bound!=="1"&&(t.dataset.bound="1",(e=ot("btnCloseRF"))==null||e.addEventListener("click",Pe),t.addEventListener("click",o=>{o.target===t&&Pe()}),(a=ot("btnRfControl"))==null||a.addEventListener("click",()=>{At.vin&&Sa("calidad")}),(n=ot("btnRfFalla"))==null||n.addEventListener("click",()=>{At.vin&&Sa("falla")}),document.addEventListener("keydown",o=>{At.open&&o.key==="Escape"&&(o.preventDefault(),Pe())}))}const Et={open:!1,vin:""},it=t=>document.getElementById(t),In=()=>it("rfTecModal");function Oo(t){const e=it("rfTecInfo");e&&(e.textContent=String(t||""))}function ko(t){const e=it("rfTecMsg");e&&(e.textContent="")}function Se(){try{Qt({mountId:"rfTecUploaderMount"})}catch{}it("rfTecMenu")&&(it("rfTecMenu").style.display="block"),it("rfTecStage")&&(it("rfTecStage").style.display="none"),it("rfTecStage")&&(it("rfTecStage").innerHTML="")}function Aa(t){var n;const e=it("rfTecMenu"),a=it("rfTecStage");a&&(e&&(e.style.display="none"),a.style.display="block",a.innerHTML=`
    <div class="row" style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <button type="button" id="btnRFTecBack" class="btn" style="height:44px; padding:0 14px; font-weight:900;">
        ← Volver
      </button>
      <div class="pill small" style="opacity:.95;">
        ${t==="params"?"REGISTRAR PARÁMETROS":"REGISTRAR FALLA"}
      </div>
    </div>

    <div id="rfTecUploaderMount"></div>
  `,(n=a.querySelector("#btnRFTecBack"))==null||n.addEventListener("click",Se),vn({vin:Et.vin,screen:t==="params"?"params":"falla",mountId:"rfTecUploaderMount",onBackControl:Se}))}function xo(t){if(p.state.currentModule!=="TECNICO")return;const e=String(t||"").trim().toUpperCase();if(!e)return V({ok:!1,error:"VIN vacío para Registro/Fallas."});Et.vin=e,Et.open=!0,Oo(`VIN: ${e}`),ko();const a=In();a&&(a.classList.add("show"),a.setAttribute("aria-hidden","false"),document.body.classList.add("modal-open")),Se()}function ze(){try{Qt({mountId:"rfTecUploaderMount"})}catch{}const t=In();if(t){const e=document.activeElement;e&&t.contains(e)&&e.blur(),t.classList.remove("show"),t.setAttribute("aria-hidden","true")}document.body.classList.remove("modal-open"),Et.open=!1,Et.vin="",Oo(""),ko(),Se()}function Us(){var e,a,n;const t=In();t&&t.dataset.bound!=="1"&&(t.dataset.bound="1",(e=it("btnCloseRFTec"))==null||e.addEventListener("click",ze),t.addEventListener("click",o=>{o.target===t&&ze()}),(a=it("btnRFTecParams"))==null||a.addEventListener("click",()=>{Et.vin&&Aa("params")}),(n=it("btnRFTecFalla"))==null||n.addEventListener("click",()=>{Et.vin&&Aa("falla")}),document.addEventListener("keydown",o=>{Et.open&&o.key==="Escape"&&(o.preventDefault(),ze())}))}const Wt={bound:!1,resolver:null};function Ae(){return{modal:y("confirmFinishModal"),btnCloseX:y("btnCloseFinishX"),btnCancel:y("btnCancelFinish"),btnAccept:y("btnAcceptFinish"),title:y("confirmFinishTitle"),text:y("confirmFinishText")}}function oe(t){const{modal:e}=Ae();if(e&&(e.setAttribute("aria-hidden","true"),e.classList.remove("show")),document.body.classList.remove("modal-open"),typeof Wt.resolver=="function"){const a=Wt.resolver;Wt.resolver=null,a(!!t)}}function Do(){if(Wt.bound)return;Wt.bound=!0;const{modal:t,btnCloseX:e,btnCancel:a,btnAccept:n}=Ae();t&&(e==null||e.addEventListener("click",()=>oe(!1)),a==null||a.addEventListener("click",()=>oe(!1)),n==null||n.addEventListener("click",()=>oe(!0)),t.addEventListener("click",o=>{o.target===t&&oe(!1)}),document.addEventListener("keydown",o=>{const{modal:i}=Ae();!i||i.getAttribute("aria-hidden")==="true"||o.key==="Escape"&&(o.preventDefault(),oe(!1))}))}function ws(){Do()}function $o({title:t="Confirmar finalización",message:e="¿Seguro que quieres finalizar este trabajo?",acceptText:a="Sí, finalizar",cancelText:n="Cancelar"}={}){Do();const{modal:o,title:i,text:s,btnAccept:r,btnCancel:c}=Ae();return o?(i&&(i.textContent=t),s&&(s.textContent=e),r&&(r.textContent=a),c&&(c.textContent=n),o.setAttribute("aria-hidden","false"),o.classList.add("show"),document.body.classList.add("modal-open"),setTimeout(()=>c==null?void 0:c.focus(),0),new Promise(u=>{Wt.resolver=u})):Promise.resolve(window.confirm(e))}const G={currentKey:"",currentItem:null,qr:null,scanMode:"QR",bound:!1};let _e=null;function Fs(t){_e=typeof t=="function"?t:null}function st(){return{modal:y("confModal"),btnClose:y("btnCloseConf"),vinInfo:y("confVinInfo"),code:y("confCode"),btnQR:y("btnConfQR"),assignedBox:y("confAssignedBox"),qrWrap:y("confQrWrap"),qrReader:y("qrReader_conf"),qrMsg:y("confQrMsg"),btnStopQR:y("btnConfStopQR"),btnClear:y("btnConfClear"),ck1:y("ck1"),ck2:y("ck2"),ck3:y("ck3"),btnSave:y("btnConfSave"),msg:y("confMsg")}}function me(t){return String(t||"").trim().toUpperCase()}function Cn(t){const e=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();return e==="TANQUE"?"TANQUE":e==="MOTOR"?"REDUCTOR":String((t==null?void 0:t.tanque_asignado)||"").trim()?"TANQUE":String((t==null?void 0:t.reductor_asignado)||"").trim()?"REDUCTOR":"EQUIPO"}function Uo(t,e){return t?e==="TANQUE"?String(t.tanque_asignado||t.tanque_registrado||"").trim().toUpperCase():e==="REDUCTOR"?String(t.reductor_asignado||t.reductor_registrado||"").trim().toUpperCase():"":""}function Bs(){const{ck1:t,ck2:e,ck3:a}=st();return!!(t!=null&&t.checked&&(e!=null&&e.checked)&&(a!=null&&a.checked))}function Ze(){var e;const{code:t}=st();return!!me(t==null?void 0:t.value)&&Bs()&&!!((e=G.currentItem)!=null&&e.vin)}function bt(t,e=!1){const{msg:a}=st();a&&(a.textContent=String(t||""),a.style.color=e?"#ffb3b3":"")}function ue(){const{assignedBox:t,code:e}=st(),a=G.currentItem;if(!t)return;if(!a){t.textContent="";return}const n=Cn(a),o=Uo(a,n),i=me(e==null?void 0:e.value);if(!o){t.textContent=`Equipo esperado (${n}): (sin asignado en cartilla)`,t.style.opacity=".85";return}if(!i){t.textContent=`Equipo asignado (${n}): ${o}`,t.style.opacity=".95";return}const s=i===o;t.textContent=`Equipo asignado (${n}): ${o} ${s?"✅":"⚠️ no coincide"}`,t.style.opacity="1"}function kt(){const{btnSave:t}=st();if(!t)return;const e=Ze();t.disabled=!e,t.style.opacity=e?"1":".65",t.style.cursor=e?"pointer":"not-allowed"}function qs(t){G.scanMode=t==="BAR"?"BAR":"QR"}async function Vs(){var n;const{qrWrap:t,qrMsg:e,code:a}=st();try{if(!window.Html5Qrcode){e&&(e.textContent="No se cargó la librería QR.");return}t&&(t.style.display="block"),G.qr||(G.qr=new Html5Qrcode("qrReader_conf"));const o=G.scanMode==="BAR";e&&(e.textContent=o?"Modo: CÓDIGO DE BARRAS (CODE_128)":"Modo: QR");const i={fps:o?8:10,qrbox:o?{width:170,height:320}:{width:250,height:250},formatsToSupport:o?[Html5QrcodeSupportedFormats.CODE_128]:[Html5QrcodeSupportedFormats.QR_CODE],experimentalFeatures:{useBarCodeDetectorIfSupported:!0}},s=async d=>{const l=me(d);l&&(a&&(a.value=l),e&&(e.textContent=`Código detectado: ${l}`),ue(),kt(),await Sn())};try{await G.qr.start({facingMode:{exact:"environment"}},i,s,()=>{});return}catch{}try{await G.qr.start({facingMode:"environment"},i,s,()=>{});return}catch{}const r=await Html5Qrcode.getCameras();let c=((n=r==null?void 0:r[0])==null?void 0:n.id)||null;const u=r==null?void 0:r.find(d=>/back|rear|environment/i.test(d.label||""));u!=null&&u.id&&(c=u.id),await G.qr.start(c??{facingMode:"environment"},i,s,()=>{})}catch{e&&(e.textContent="No se pudo abrir cámara. Revisa permisos/HTTPS.")}}async function Sn(){const{qrWrap:t,qrMsg:e}=st();try{G.qr&&G.qr.isScanning&&await G.qr.stop()}catch{}t&&(t.style.display="none"),e&&!e.textContent&&(e.textContent="")}function Qs(){const{code:t,ck1:e,ck2:a,ck3:n,qrMsg:o,msg:i}=st();t&&(t.value=""),e&&(e.checked=!1),a&&(a.checked=!1),n&&(n.checked=!1),o&&(o.textContent=""),i&&(i.textContent=""),ue(),kt()}function js(t){const{vinInfo:e,assignedBox:a}=st(),n=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),o=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase(),i=Cn(t);e&&(e.textContent=`VIN: ${n||"-"} | ROL: ${o||"-"} | CONFORMIDAD: ${i}`),a&&(a.textContent=""),ue(),kt()}async function Ps(t){var i,s;const a=F().itemsByKey.get(String(t||""));if(!a)return;G.currentKey=String(t||""),G.currentItem=a,js(a),Qs();const{modal:n,code:o}=st();(i=n==null?void 0:n.classList)==null||i.add("show"),(s=n==null?void 0:n.setAttribute)==null||s.call(n,"aria-hidden","false"),setTimeout(()=>{var r;return(r=o==null?void 0:o.focus)==null?void 0:r.call(o)},0)}async function Xe(){var e,a;const{modal:t}=st();(e=t==null?void 0:t.classList)==null||e.remove("show"),(a=t==null?void 0:t.setAttribute)==null||a.call(t,"aria-hidden","true"),await Sn(),G.currentKey="",G.currentItem=null}async function Ea(){const{code:t,ck1:e,ck2:a,ck3:n}=st(),o=G.currentItem;if(!o)return bt("No hay cartilla seleccionada.",!0);const i=me(t==null?void 0:t.value);if(!i)return bt("Debes escribir o escanear el código del equipo.",!0);if(!(e!=null&&e.checked&&(a!=null&&a.checked)&&(n!=null&&n.checked)))return bt("Debes marcar los 3 items de conformidad.",!0);let s;try{s=yt()}catch{return}const r=Cn(o),c=Uo(o,r),u={email:s,conversionId:String(o.conversionId||""),vin:String(o.vin||"").trim().toUpperCase(),rolTrabajo:String(o.rolTrabajo||"").toUpperCase(),equipoTipo:r,equipoCodigo:i,equipoAsignado:c||"",checks:{ck1:!0,ck2:!0,ck3:!0}};u.ck1=!0,u.ck2=!0,u.ck3=!0;const d=await De("/api/equipo-conformidad",u,"Guardando conformidad...");if(!(d!=null&&d.ok)){bt((d==null?void 0:d.error)||"No se pudo guardar la conformidad.",!0);return}bt("✅ Conformidad guardada correctamente."),setTimeout(()=>{try{_e==null||_e()}catch{}},400),setTimeout(()=>Xe().catch(()=>{}),450)}function zs(){if(G.bound)return;G.bound=!0;const{modal:t,btnClose:e,code:a,btnQR:n,btnStopQR:o,btnClear:i,ck1:s,ck2:r,ck3:c,btnSave:u}=st();e==null||e.addEventListener("click",()=>Xe()),t==null||t.addEventListener("click",async d=>{d.target===t&&await Xe()}),a==null||a.addEventListener("input",()=>{a.value=me(a.value),ue(),kt(),bt("")}),[s,r,c].forEach(d=>{d==null||d.addEventListener("change",()=>{kt(),bt("")})}),n==null||n.addEventListener("click",async d=>{qs(d.altKey?"BAR":"QR"),await Vs()}),o==null||o.addEventListener("click",async()=>{await Sn()}),i==null||i.addEventListener("click",()=>{const{code:d,qrMsg:l}=st();d&&(d.value=""),l&&(l.textContent=""),ue(),kt(),bt("")}),u==null||u.addEventListener("click",async()=>{if(!Ze()){bt("Completa el código del equipo y marca los 3 checks.",!0);return}await Ea()}),a==null||a.addEventListener("keydown",async d=>{d.key==="Enter"&&Ze()&&(d.preventDefault(),await Ea())}),kt()}const Ra={TECNICO:{syncTimer:null,clockTimer:null,estadoTimer:null,syncStopped:!1},CALIDAD:{syncTimer:null,clockTimer:null,estadoTimer:null,syncStopped:!1},RAMALERO:{syncTimer:null,clockTimer:null,estadoTimer:null,syncStopped:!1}};function An(t){return Ra[t]||Ra.TECNICO}function En(t){const e=An(t);e.syncStopped=!0,e.syncTimer&&clearTimeout(e.syncTimer),e.clockTimer&&clearInterval(e.clockTimer),e.estadoTimer&&clearInterval(e.estadoTimer),e.syncTimer=null,e.clockTimer=null,e.estadoTimer=null}function wo(t){const e=p.state.currentModule;p.state.currentModule=t;try{if(t==="RAMALERO"){const i=document.getElementById("ramalId");i&&(i.value="");const s=document.getElementById("tipoRamal");s&&(s.value="")}else{const i=U("vin");i&&(i.value="")}const a=U("activasBox");a&&(a.innerHTML="");const n=U("finalizadosBox");n&&(n.innerHTML=""),P("");const o=F();o.showFinalizados=!1,o.itemsByKey.clear(),o.activeKeys=[],o.finalKeys=[],o.lastSyncSince=null,o.lastSyncRev=null,o.lastSyncAtMs=0}finally{p.state.currentModule=e}}async function Fo(t,e){const a=An(t);if(e&&!a.syncStopped){try{await e({forceFull:!1,showOut:!1})}catch(n){console.error(`[${t}] sync loop error:`,n)}a.syncStopped||(a.syncTimer=setTimeout(()=>{Fo(t,e)},6e4))}}function Bo(t,{syncNow:e,tickClocksUI:a,refreshEstadoForVinRole:n,buildAvgTopHTML:o}={}){En(t);const i=p.state.currentModule;p.state.currentModule=t;try{const s=An(t);if(s.syncStopped=!1,Promise.resolve(e==null?void 0:e({forceFull:!0,showOut:!1})).catch(c=>{console.error(`[${t}] initial sync error:`,c)}).finally(()=>{s.syncStopped||(s.syncTimer=setTimeout(()=>{Fo(t,e)},1e4))}),s.clockTimer=setInterval(()=>{a==null||a()},1e3),(t==="TECNICO"||t==="CALIDAD")&&(s.estadoTimer=setInterval(()=>{n==null||n({showOut:!1})},8e3),setTimeout(()=>{n==null||n({showOut:!1}).catch(()=>{})},700)),F().showFinalizados){const c=o&&o()||"";mt(c)}}finally{p.state.currentModule=i}}function ve(t,e){if((!t.vin||t.vin==="")&&(e!=null&&e.vin)&&(t.vin=e.vin),!t.vin&&t.conversionId&&t.rolTrabajo){const a=ns(t.conversionId,t.rolTrabajo);a&&(t.vin=a)}if(t.rolTrabajo==="RAMALERO"&&((!t.tipoRamal||t.tipoRamal==="")&&(e!=null&&e.tipoRamal)&&(t.tipoRamal=e.tipoRamal),!t.tipoRamal&&t.conversionId)){const a=is(t.conversionId);a&&(t.tipoRamal=a)}return e&&(t.updated_at||(t.updated_at=e.updated_at||null),t.last_nota_ts||(t.last_nota_ts=e.last_nota_ts||null),t.created_at||(t.created_at=e.created_at||null)),t}function jt(t){const e=(...n)=>{for(const o of n)if(o!=null&&String(o).trim()!=="")return o;return""},a={conversionId:String(e(t==null?void 0:t.conversionId,t==null?void 0:t.conversion_id,t==null?void 0:t.work_order_id,t==null?void 0:t.CONVERSION_ID,t==null?void 0:t.ID,t==null?void 0:t.id)).trim(),vin:String(e(t==null?void 0:t.vin,t==null?void 0:t.VIN)).trim().toUpperCase(),tipoRamal:String(e(t==null?void 0:t.tipoRamal,t==null?void 0:t.tipo_ramal,t==null?void 0:t.tipo,t==null?void 0:t.TIPO_RAMAL,t==null?void 0:t.TIPO)).trim(),created_at:(t==null?void 0:t.fecha_asignacion)??(t==null?void 0:t.FECHA_ASIGNACION)??(t==null?void 0:t.fecha_inicio)??(t==null?void 0:t.inicio_at)??(t==null?void 0:t.FECHA_INICIO)??(t==null?void 0:t.created_at)??(t==null?void 0:t.fecha_creacion)??(t==null?void 0:t.FECHA_CREACION)??null,rolTrabajo:String(e(t==null?void 0:t.rolTrabajo,t==null?void 0:t.rol_trabajo,t==null?void 0:t.rol,t==null?void 0:t.ROL_TRABAJO,t==null?void 0:t.ROL)).trim().toUpperCase(),estado:String(e(t==null?void 0:t.estado,t==null?void 0:t.estado_actual,t==null?void 0:t.estadoActual,t==null?void 0:t.ESTADO_ACTUAL,t==null?void 0:t.ESTADO)).trim().toUpperCase(),tiempo_ms:Number(e(t==null?void 0:t.tiempo_ms,t==null?void 0:t.tiempoMs,t==null?void 0:t.tiempo_trab_ms,t==null?void 0:t.TIEMPO_TRAB_MS,t==null?void 0:t.TIEMPO_MS,0))||0,running_since:(t==null?void 0:t.running_since)??(t==null?void 0:t.RUNNING_SINCE)??null,last_nota:String(e(t==null?void 0:t.last_nota,t==null?void 0:t.LAST_NOTA,"")),last_nota_ts:(t==null?void 0:t.last_nota_ts)??(t==null?void 0:t.LAST_NOTA_TS)??null,updated_at:(t==null?void 0:t.updated_at)??(t==null?void 0:t.UPDATED_AT)??null,tanque_asignado:String(e(t==null?void 0:t.tanque_asignado,t==null?void 0:t.tanqueAsignado,t==null?void 0:t.TANQUE_ASIGNADO,"")).trim(),reductor_asignado:String(e(t==null?void 0:t.reductor_asignado,t==null?void 0:t.reductorAsignado,t==null?void 0:t.REDUCTOR_ASIGNADO,"")).trim(),tanque_registrado:String(e(t==null?void 0:t.tanque_registrado,t==null?void 0:t.tanqueRegistrado,t==null?void 0:t.TANQUE_REGISTRADO,"")).trim(),reductor_registrado:String(e(t==null?void 0:t.reductor_registrado,t==null?void 0:t.reductorRegistrado,t==null?void 0:t.REDUCTOR_REGISTRADO,"")).trim(),inc_leve:Number(e(t==null?void 0:t.inc_leve,t==null?void 0:t.INC_LEVE,0))||0,inc_moderada:Number(e(t==null?void 0:t.inc_moderada,t==null?void 0:t.INC_MODERADA,0))||0,inc_critica:Number(e(t==null?void 0:t.inc_critica,t==null?void 0:t.INC_CRITICA,0))||0,motorNombre:String(e(t==null?void 0:t.motorNombre,t==null?void 0:t.motor_nombre,t==null?void 0:t.MOTOR_NOMBRE,"")).trim(),tanqueroNombre:String(e(t==null?void 0:t.tanqueroNombre,t==null?void 0:t.tanquero_nombre,t==null?void 0:t.TANQUERO_NOMBRE,"")).trim()};return a.rolTrabajo||(a.tipoRamal?a.rolTrabajo="RAMALERO":p.state.currentModule==="CALIDAD"?a.rolTrabajo="CALIDAD":a.rolTrabajo=String(to()||"MOTOR").toUpperCase()),a.estado||(a.estado="SIN_INICIAR"),a.conversionId&&a.rolTrabajo&&a.vin&&es(a.conversionId,a.rolTrabajo,a.vin),a.conversionId&&a.rolTrabajo==="RAMALERO"&&a.tipoRamal&&os(a.conversionId,a.tipoRamal),a}function qo(t){const e=F(),a=Array.isArray(t==null?void 0:t.items)?t.items:[];for(const n of a){const o=jt(n),i=pe(o),s=e.itemsByKey.get(i);ve(o,s),e.itemsByKey.set(i,o)}}function tn(t){const e=F();e.itemsByKey.clear(),e._finalizadosLoaded=!1;const a=Array.isArray(t)?t:[];for(const n of a){const o=jt(n),i=pe(o);ve(o,null),e.itemsByKey.set(i,o)}}function Vo(t,e){const a=F();return t.join(",")!==a.activeKeys.join(",")||e.join(",")!==a.finalKeys.join(",")}let Kt=null;const Ks=300*1e3;function Qo(){Kt=null}async function Rn(){const t=Date.now();if(Kt&&t-Kt.ts<Ks)return Kt.byVin;try{const e=await Lt("/api/supervisor/report?track=CONVERSION"),a=new Map;if(e!=null&&e.ok&&Array.isArray(e.items))for(const n of e.items){const o=String(n.vin||"").toUpperCase().trim();if(!o)continue;const i=String(n.rol||"").toUpperCase(),s=a.get(o)||{motorNombre:"",tanqueroNombre:""};i==="MOTOR"&&(s.motorNombre=String(n.userName||"").trim()),(i==="TANQUE"||i==="TANQUERO")&&(s.tanqueroNombre=String(n.userName||"").trim()),a.set(o,s)}return Kt={ts:t,byVin:a},a}catch{const e=new Map;return Kt={ts:t,byVin:e},e}}async function en(t){const e=String(t||"").toUpperCase().trim();return(await Rn()).get(e)||{motorNombre:"",tanqueroNombre:""}}const Ta=Object.freeze(Object.defineProperty({__proto__:null,applySyncResultToStore_:qo,clearNombresCache_:Qo,detectIfNeedsFullRerender_:Vo,ensureNombresCache_:Rn,fetchNombresParaVin_:en,mergePrevAndCache_:ve,normalizeItem_:jt,storeFullReplace_:tn},Symbol.toStringTag,{value:"Module"})),Ee=new Map,Hs=1500,Gs=15e3;setInterval(()=>{const t=Date.now();for(const[e,a]of Ee.entries())t-a>Gs&&Ee.delete(e)},5e3);async function jo(t,e={}){var f,I;if(!(p.state.currentModule==="TECNICO"||p.state.currentModule==="CALIDAD"))return;let a;try{a=yt()}catch{return}const n=String(t||((f=y("accion"))==null?void 0:f.value)||"").toUpperCase();let o="";if(n==="NOTA"&&(o=String(((I=y("nota"))==null?void 0:I.value)||"").trim(),!o&&(e!=null&&e.nota)&&(o=String(e.nota||"").trim()),!o)){const C={ok:!1,error:"Escribe una nota antes de guardar."};return V(C),C}let i=(e==null?void 0:e.vin)||de();if(!i){const C={ok:!1,error:"Pon el VIN"};return V(C),C}let s=(e==null?void 0:e.rolTrabajo)||te();const r=F(),c=[...r.itemsByKey.values()].find(C=>String(C.vin||"").toUpperCase()===i&&String(C.rolTrabajo||"").toUpperCase()===s);if(c&&!_s(c.estado).includes(n)){const B={ok:!1,error:`Acción ${n} no permitida desde estado ${c.estado}.`};return V(B),B}const u=e!=null&&e.skipLock?await xe("/api/evento",{email:a,vin:i,rolTrabajo:s,accion:n,nota:o}):await De("/api/evento",{email:a,vin:i,rolTrabajo:s,accion:n,nota:o},n==="NOTA"?"Guardando nota...":"Registrando...");if(V(u),!(u!=null&&u.ok))return console.warn(`[EVENTO] ❌ Falla en acción ${n}:`,u==null?void 0:u.error),u;console.log(`[EVENTO] ✅ Acción ${n} exitosa. Estado: ${(u==null?void 0:u.estado)||(u==null?void 0:u.estado_actual)}`);const d=jt(u),l=pe(d),b=r.itemsByKey.get(l);b&&ve(d,b),r.itemsByKey.set(l,d),Tt();const g=gn();return n==="NOTA"&&(e!=null&&e.clearKey)&&g.set(String(e.clearKey),""),Jt(),mt(),bn(g),n==="NOTA"&&y("nota")&&(y("nota").value=""),setTimeout(()=>{p.state.uiLocked||rt({forceFull:n==="INICIO",showOut:!1}).catch(()=>{})},n==="INICIO"?800:400),u}async function Re(t,e){const a=String(t||"").trim().toUpperCase(),n=String(e||"").trim().toUpperCase();if(!a)return;const o=`${a}|${n}`,i=Date.now(),s=i,r=Ee.get(o);if(r&&i-r<Hs){console.log(`[AUTO_START] ⏸️ Ignorando: ${o} (último intento hace ${i-r}ms)`);return}Ee.set(o,i),console.log(`[AUTO_START] 🚀 Iniciando: ${a} | Rol: ${n} | Tiempo: ${new Date().toISOString()}`);const u=[...F().itemsByKey.values()].find(b=>String(b.vin||"").toUpperCase()===a&&String(b.rolTrabajo||"").toUpperCase()===n),d=String((u==null?void 0:u.estado)||"").toUpperCase();if(!u||d==="SIN_INICIAR"){console.log(`[AUTO_START] Estado encontrado: ${d||"NO EXISTE"} → Ejecutando INICIO`);const b=Date.now(),g=await jo("INICIO",{vin:a,rolTrabajo:n,skipLock:!0}),f=Date.now()-b;if(console.log(`[AUTO_START] enviarEvento completada en ${f}ms`),g&&!g.ok){const I=g.error||"",C=g.errorType||"UNKNOWN",B=g._statusCode||500;if(console.error(`[AUTO_START] ❌ Error (${C}):`,I),C==="ALREADY_ASSIGNED"||I.includes("ya está asignada")){const Q="⚠️ Orden ya asignada",X=g.assignedTo||"otro usuario",_=`${I}

Asignado a: ${X}`;V({ok:!1,error:_,severity:"warning",errorType:"ALREADY_ASSIGNED"}),typeof confirm<"u"&&confirm(`${Q}

${_}`)}else if(B===400&&I.includes("Acción")){const Q=`${I}

Intenta nuevamente con la acción correcta.`;V({ok:!1,error:Q,severity:"warning",errorType:"INVALID_ACTION"})}else I.includes("VIN")||I.includes("no encontrado")?V({ok:!1,error:`No se pudo crear OT: ${I}`,severity:"error",errorType:"VIN_NOT_FOUND"}):V(C==="TIMEOUT"?{ok:!1,error:"La operación tardó demasiado. Intenta nuevamente.",severity:"error",errorType:"TIMEOUT"}:{ok:!1,error:`Error al iniciar: ${I}`,severity:"error",errorType:"GENERIC_ERROR"})}else g!=null&&g.ok&&console.log(`[AUTO_START] ✅ OT iniciada: ${a} | ROL: ${n} | Estado: ${g.estado||g.estado_actual}`)}else console.log(`[AUTO_START] ⚠️ OT ya en estado ${d}, no se reinicia`);const l=Date.now()-s;console.log(`[AUTO_START] ⏱️ TOTAL autoStartFromScan_: ${l}ms`)}let ce=[],Po=0,La=null;function Ke(t,e=400){clearTimeout(La);const n=Date.now()-Po;if(n<e){const o=e-n;La=setTimeout(()=>{rt(t).catch(i=>console.warn("[scheduleSync] Error:",i))},o)}else rt(t).catch(o=>console.warn("[scheduleSync] Error:",o))}function He(t,e){F()&&(t==="asignaciones"?Ke({forceFull:!1,showOut:!1},400):t==="work_orders"?Ke({forceFull:!1,showOut:!1},400):t==="incidencias"&&p.state.currentModule==="INCIDENCIAS"&&Ke({forceFull:!1,showOut:!1},400))}async function Ws(){ce.push(await be("asignaciones",t=>{He("asignaciones")})),ce.push(await be("work_orders",t=>{He("work_orders")})),ce.push(await be("incidencias",t=>{He("incidencias")}))}function Js(){ce.forEach(t=>{try{t()}catch(e){console.warn("Unsub error:",e)}}),ce=[]}async function Ys(t,e,{forceRefresh:a=!1}={}){try{return{mode:"sync",data:{ok:!0,items:await Ji(t)}}}catch(o){console.warn("[apiSync_] Supabase error:",o.message)}try{const i=await xe("/api/sync",{email:t,since:e,excludeFinalizados:!0,forceRefresh:a});if(i&&i.ok)return{mode:"sync",data:i}}catch{}return{mode:"legacy",data:await Lt(`/api/mis-activas?email=${encodeURIComponent(t)}&excludeFinalizados=true&_t=${Date.now()}`)}}async function nn(t){try{return{ok:!0,items:await Yi(t)}}catch(e){console.warn("[fetchFinalizados_] Supabase error:",e.message)}return Lt(`/api/mis-finalizadas?email=${encodeURIComponent(t)}`)}async function rt({forceFull:t=!1,showOut:e=!1,_fromLock:a=!1}={}){if(!a&&p.state.uiLocked||!un())return;let n;try{n=yt()}catch{return}const o=F();t&&Qo();const i=o.activeKeys.slice(),s=o.finalKeys.slice(),r=gn(),c=t?null:o.lastSyncSince,u=await Ys(n,c,{forceRefresh:t}),d=u.data;if(e&&V(d),!d||!d.ok)return;const l=!!o._finalizadosLoaded,b=new Map;if(l)for(const[f,I]of o.itemsByKey)mo(I)&&b.set(f,I);if(u.mode==="legacy"||t?(tn(d.items||[]),o.lastSyncSince=d.server_time||new Date().toISOString(),o.lastSyncRev=d.rev||null):(d.full?tn(d.items||[]):qo(d),o.lastSyncSince=d.server_time||new Date().toISOString(),o.lastSyncRev=d.rev||o.lastSyncRev),l&&b.size){for(const[f,I]of b)o.itemsByKey.has(f)||o.itemsByKey.set(f,I);o._finalizadosLoaded=!0}if(Tt(),p.state.currentModule==="CALIDAD"){const f=await Rn();for(const[I,C]of o.itemsByKey)if(C&&C.vin&&!C.motorNombre&&!C.tanqueroNombre){const B=f.get(C.vin.toUpperCase().trim())||{motorNombre:"",tanqueroNombre:""};C.motorNombre=B.motorNombre,C.tanqueroNombre=B.tanqueroNombre}}t||Vo(i,s)?(Jt(),mt(),bn(r)):ye(),o.lastSyncAtMs=Date.now(),Po=Date.now(),ke()}let Ma=null;async function Yt({showOut:t=!1}={}){if(p.state.uiLocked||!un())return;let e;try{e=yt()}catch{return}if(!(p.state.currentModule==="TECNICO"||p.state.currentModule==="CALIDAD"))return;const a=de(),n=te();if(!a){P("");return}const o=F(),i=a.toUpperCase();for(const u of o.itemsByKey.values())if(String(u.vin||"").toUpperCase()===i&&String(u.rolTrabajo||"").toUpperCase()===n){p.state.currentModule==="CALIDAD"&&!u.motorNombre&&!u.tanqueroNombre&&en(i).then(({motorNombre:d,tanqueroNombre:l})=>{u.motorNombre=d,u.tanqueroNombre=l,Jt(),mt()}).catch(()=>{}),P(`Estado: ${u.estado} | Tiempo: ${wt(Bt(u))}`);return}const s=await Zi(e,a,n);if(t&&V(s),!(s!=null&&s.ok)){console.log("[refreshEstadoForVinRole] VIN no existe aún (será creado al hacer INICIO)"),P("Listo para crear OT");return}const r=jt(s),c=pe(r);if(p.state.currentModule==="CALIDAD"&&r.vin){const{motorNombre:u,tanqueroNombre:d}=await en(r.vin);r.motorNombre=u,r.tanqueroNombre=d}o.itemsByKey.set(c,r),Tt(),Jt(),mt(),P(`Estado: ${r.estado} | Tiempo: ${wt(Bt(r))}`)}function an(t=500){(p.state.currentModule==="TECNICO"||p.state.currentModule==="CALIDAD")&&(clearTimeout(Ma),Ma=setTimeout(()=>Yt({showOut:!1}).catch(()=>{}),t))}function Zs(){var t,e,a;(t=y("btnEstado"))==null||t.addEventListener("click",async()=>{if(p.state.currentModule!=="TECNICO")return;const n=de();if(!n){P("❌ Ingresa un VIN primero");return}const o=te();if(!o){P("❌ Selecciona un rol primero");return}await Z(async()=>{P("🔄 Inicializando OT..."),await Re(n,o)},"Creando OT..."),P("⏳ Sincronizando..."),setTimeout(()=>{rt({forceFull:!0,showOut:!1}).then(()=>{const s=[...F().itemsByKey.values()].find(r=>String(r.vin||"").toUpperCase()===n.toUpperCase()&&String(r.rolTrabajo||"").toUpperCase()===o.toUpperCase());(s==null?void 0:s.estado)==="TRABAJANDO"?P("✅ OT TRABAJANDO"):P(`ℹ️ Estado: ${(s==null?void 0:s.estado)||"SIN_INICIAR"}`)}).catch(()=>{})},100)}),(e=y("btnEstadoQ"))==null||e.addEventListener("click",async()=>{if(p.state.currentModule!=="CALIDAD")return;const n=de();if(!n){P("❌ Ingresa un VIN primero");return}const o="CALIDAD";await Z(async()=>{P("🔄 Inicializando OT..."),await Re(n,o)},"Creando OT..."),P("⏳ Sincronizando..."),setTimeout(()=>{rt({forceFull:!0,showOut:!1}).then(()=>{const s=[...F().itemsByKey.values()].find(r=>String(r.vin||"").toUpperCase()===n.toUpperCase()&&String(r.rolTrabajo||"").toUpperCase()===o.toUpperCase());(s==null?void 0:s.estado)==="TRABAJANDO"?P("✅ OT TRABAJANDO"):P(s?`ℹ️ Estado: ${s.estado}`:"ℹ️ OT creada")}).catch(()=>{})},100)}),(a=y("rol"))==null||a.addEventListener("change",()=>{p.state.currentModule==="TECNICO"&&an(0)})}function Tn(){var e;const t=document.getElementById("supIncModal");(e=t==null?void 0:t.classList)==null||e.add("show")}function Na(){var t,e;(e=(t=document.getElementById("supIncModal"))==null?void 0:t.classList)==null||e.remove("show")}function Xs(t,{escapeHtml:e,fmtShort_:a}){try{return e(a(t))}catch{return e(String(t||""))}}async function Ln(t,e,{getJSON_user:a}){if(t)try{return{ok:!0,items:await Xi(t)}}catch(i){console.warn("[fetchIncidencias_] Supabase error:",i.message)}const n=`/api/incidencias/list?vin=${encodeURIComponent(t||"")}&conversionId=${encodeURIComponent(e||"")}&limit=${encodeURIComponent(200)}`;return await a(n,"Cargando incidencias...")}function Zt(t,e,{escapeHtml:a,fmtShort_:n}){const o=document.getElementById("supIncInfo"),i=document.getElementById("supIncList"),s=document.getElementById("supIncMsg");s&&(s.textContent=""),i&&(i.innerHTML="");const r=(e==null?void 0:e.who)||"-",c=(e==null?void 0:e.vin)||"-",u=(e==null?void 0:e.conversionId)||"";if(o&&(o.textContent=`${r} — VIN: ${c}${u?` — CID: ${u}`:""}`),!(t!=null&&t.ok)){s&&(s.textContent=(t==null?void 0:t.error)||"Error cargando incidencias.");return}const d=Array.isArray(t.items)?t.items:[];if(!d.length){i&&(i.innerHTML='<div class="small">No hay incidencias registradas.</div>');return}i&&(i.innerHTML=d.map(l=>{const b=String(l.tipo||"").toUpperCase(),g=l.tecnico||"-",f=l.nota||"",I=l.fecha||"",B=!!(l.fotoThumbUrl||l.fotoUrl||l.fotoImgUrl)?`
      <div style="margin-top:10px;">
        <a href="${a(l.fotoUrl||l.fotoImgUrl)}" target="_blank" rel="noopener">
          <img
            src="${a(l.fotoThumbUrl||l.fotoImgUrl)}"
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
            ${Xs(I,{escapeHtml:a,fmtShort_:n})}
          </div>
        </div>

        <div class="small" style="margin-top:8px;">
          <b>Técnico:</b> ${a(g)}
        </div>

        ${f?`
          <div class="small" style="margin-top:8px; white-space:pre-wrap;">
            <b>Nota:</b> ${a(f)}
          </div>
        `:'<div class="small" style="margin-top:8px; opacity:.8;">Sin nota.</div>'}

        ${B}
      </div>
    `}).join(""))}function tr({CORE:t,getJSON_user:e,escapeHtml:a,fmtShort_:n}){var o,i,s;(o=document.getElementById("supTable"))==null||o.addEventListener("click",async r=>{var g,f;if(t.state.currentModule!=="SUPERVISOR")return;const c=(f=(g=r.target)==null?void 0:g.closest)==null?void 0:f.call(g,"button[data-sup-inc]");if(!c)return;const u=String(c.dataset.vin||"").trim().toUpperCase(),d=String(c.dataset.cid||"").trim(),l=String(c.dataset.who||"").trim();Tn();const b=document.getElementById("supIncMsg");b&&(b.textContent="Cargando...");try{const I=await Ln(u,d,{getJSON_user:e});Zt(I,{vin:u,conversionId:d,who:l},{escapeHtml:a,fmtShort_:n})}catch(I){Zt({ok:!1,error:String((I==null?void 0:I.message)||I)},{vin:u,conversionId:d,who:l},{escapeHtml:a,fmtShort_:n})}}),(i=document.getElementById("btnCloseSupInc"))==null||i.addEventListener("click",()=>Na()),(s=document.getElementById("supIncModal"))==null||s.addEventListener("click",r=>{r.target===document.getElementById("supIncModal")&&Na()})}function Oa(t){const e=p.state.currentModule;p.state.currentModule=t;try{const a=U("activasBox");if(!a)return;const n=`bound_${t}`;if(a.dataset[n]==="1")return;a.dataset[n]="1",a.addEventListener("input",o=>{var r;const i=o.target.closest("textarea.notaCard");if(!i)return;const s=(r=i.closest(".jobCard"))==null?void 0:r.querySelector(".btnNota");s&&(s.style.display=i.value.trim()?"block":"none")}),a.addEventListener("click",async o=>{var b;const i=o.target.closest(".jobCard");if(!i)return;const s=o.target.closest("button[data-act]");if(s){o.stopPropagation();const g=String(s.dataset.act||"").toUpperCase(),f=F(),I=i.dataset.key||"",C=f.itemsByKey.get(I);if(!C)return;const B=U("vin");if(B&&(B.value=C.vin||""),p.state.currentModule==="TECNICO"&&!p.state.rolLock&&(y("rol")&&(y("rol").value=C.rolTrabajo||"MOTOR"),ke()),g==="NOTA"&&y("nota")&&(y("nota").value=String(((b=i.querySelector("textarea.notaCard"))==null?void 0:b.value)||"")),g==="FIN"&&!await $o({title:"Confirmar finalización",message:"¿Seguro que quieres finalizar este trabajo? Esta acción puede cerrar la tarea actual.",acceptText:"Sí, finalizar",cancelText:"Cancelar"}))return;await jo(g,{clearKey:I});return}const r=o.target.closest("button[data-go]");if(!r)return;const c=String(r.dataset.go||"").toUpperCase(),u=F(),d=i.dataset.key||"",l=u.itemsByKey.get(d);if(l){if(c==="RF"){const g=String(r.dataset.vin||l.vin||"").trim().toUpperCase();if(!g)return;if(p.state.currentModule==="TECNICO"){y("vin")&&(y("vin").value=g),xo(g);return}if(p.state.currentModule==="CALIDAD"){y("vinQ")&&(y("vinQ").value=g),No(g);return}}if(c==="INC"){o.stopPropagation();const g=String(r.dataset.key||d||"").trim();if(!g)return;await Ro(g);return}if(c==="VER_INC"){o.stopPropagation();const g=String(r.dataset.vin||(l==null?void 0:l.vin)||"").trim().toUpperCase(),f=String(r.dataset.cid||(l==null?void 0:l.conversionId)||"").trim();Tn();const I=document.getElementById("supIncMsg");I&&(I.textContent="Cargando..."),Ln(g,f,{getJSON_user:Lt}).then(C=>Zt(C,{vin:g,conversionId:f,who:g},{escapeHtml:N,fmtShort_:Ut})).catch(C=>Zt({ok:!1,error:String((C==null?void 0:C.message)||C)},{vin:g},{escapeHtml:N,fmtShort_:Ut}));return}if(c==="CONF"){o.stopPropagation(),await Ps(d);return}}})}finally{p.state.currentModule=e}}function ka(t){const e=p.state.currentModule;p.state.currentModule=t;try{const a=U("finalizadosBox");if(!a)return;const n=`boundFin_${t}`;if(a.dataset[n]==="1")return;a.dataset[n]="1",a.addEventListener("click",async o=>{var d,l,b,g;const i=(l=(d=o.target)==null?void 0:d.closest)==null?void 0:l.call(d,"button[data-go]");if(!i)return;const s=String(i.dataset.go||"").toUpperCase(),r=F(),c=String(i.dataset.key||((g=(b=i.closest("[data-key]"))==null?void 0:b.dataset)==null?void 0:g.key)||"").trim(),u=c?r.itemsByKey.get(c):null;if(s==="INC"){if(o.stopPropagation(),!c)return;await Ro(c);return}if(s==="VER_INC"){o.stopPropagation();const f=String(i.dataset.vin||(u==null?void 0:u.vin)||"").trim().toUpperCase(),I=String(i.dataset.cid||(u==null?void 0:u.conversionId)||"").trim();Tn();const C=document.getElementById("supIncMsg");C&&(C.textContent="Cargando..."),Ln(f,I,{getJSON_user:Lt}).then(B=>Zt(B,{vin:f,conversionId:I,who:f},{escapeHtml:N,fmtShort_:Ut})).catch(B=>Zt({ok:!1,error:String((B==null?void 0:B.message)||B)},{vin:f},{escapeHtml:N,fmtShort_:Ut}));return}if(s==="RF"){o.stopPropagation();const f=String(i.dataset.vin||(u==null?void 0:u.vin)||"").trim().toUpperCase();if(!f)return;if(p.state.currentModule==="TECNICO"){y("vin")&&(y("vin").value=f),xo(f);return}if(p.state.currentModule==="CALIDAD"){y("vinQ")&&(y("vinQ").value=f),No(f);return}}})}finally{p.state.currentModule=e}}function er(){Oa("TECNICO"),Oa("CALIDAD"),ka("TECNICO"),ka("CALIDAD")}const Te={MIN_CHARS:1,LIMIT:12,DEBOUNCE_MS:200};let xa=null,ht=[],Ve=!1,lt=-1,Da="",Ot=null;function zo(){return p.state.currentModule==="CALIDAD"?U("vinQ"):U("vin")}function Mn(){return p.state.currentModule==="CALIDAD"?U("vinSuggestQ"):U("vinSuggest")}function Xt(){const t=Mn();t&&(Ve=!1,lt=-1,ht=[],t.classList.add("hidden"),t.innerHTML="")}function Ko(){const t=Mn();if(t){if(!ht.length){Xt();return}t.innerHTML=ht.map((e,a)=>`
      <div class="vsItem ${a===lt?"active":""}" data-idx="${a}" role="option" aria-selected="${a===lt}">
        <div class="vsVin">${N(e)}</div>
        <div class="vsHint">Enter</div>
      </div>
    `).join(""),t.classList.remove("hidden"),Ve=!0}}function $a(t){lt=Math.max(0,Math.min(t,ht.length-1)),Ko();const e=Mn(),a=e==null?void 0:e.querySelector(`.vsItem[data-idx="${lt}"]`);a&&a.scrollIntoView({block:"nearest"})}async function nr(t){var o;try{(o=Ot==null?void 0:Ot.abort)==null||o.call(Ot)}catch{}Ot=new AbortController;try{if(mn())return await no(t,Te.LIMIT)}catch(i){console.warn("[vinAcFetch_] Supabase error:",i.message)}const e=`/api/vin-suggest?q=${encodeURIComponent(t)}&limit=${encodeURIComponent(Te.LIMIT)}`,n=await(await fetch(e,{signal:Ot.signal})).json();return n!=null&&n.ok?Array.isArray(n.items)?n.items:[]:[]}function Ua(){const t=zo();if(!t)return;const e=String(t.value||"").trim().toUpperCase();if(Da=e,!e||e.length<Te.MIN_CHARS){Xt();return}clearTimeout(xa),xa=setTimeout(async()=>{try{const a=await nr(e);if(Da!==e)return;ht=(a||[]).map(n=>typeof n=="object"&&n!==null&&n.vin?String(n.vin).toUpperCase():String(n||"").toUpperCase()).filter(Boolean),lt=ht.length?0:-1,Ko()}catch{Xt()}},Te.DEBOUNCE_MS)}function Ho(t){const e=zo();if(!e)return;const a=Date.now();console.log(`[VIN_AC_PICK] 📍 Iniciando pick en VIN: ${t}`),e.value=String(t||"").toUpperCase(),Xt(),console.log("[VIN_AC_PICK] 🔄 Llamando refreshEstadoForVinRole..."),Yt({showOut:!1}).then(async()=>{const n=Date.now();console.log(`[VIN_AC_PICK] ✅ refreshEstadoForVinRole completada después de ${n-a}ms`),console.log("[VIN_AC_PICK] ⏳ Esperando lock para autocomplete flow..."),await Z(async()=>{const i=Date.now();console.log("[VIN_AC_PICK] 🚀 Lock adquirido. Iniciando autoStartFromScan..."),await Re(e.value,te()),console.log(`[VIN_AC_PICK] ✅ autoStartFromScan completada después de ${Date.now()-i}ms`),console.log("[VIN_AC_PICK] 📡 Ejecutando syncNow con forceFull: true...");const s=Date.now();await rt({forceFull:!0,showOut:!1}),console.log(`[VIN_AC_PICK] ✅ syncNow completada después de ${Date.now()-s}ms`),console.log("[VIN_AC_PICK] 🔄 Ejecutando refreshEstadoForVinRole final..."),await Yt({showOut:!1}),console.log("[VIN_AC_PICK] ✅ refreshEstadoForVinRole final completada")},"Iniciando automáticamente...");const o=Date.now()-a;console.log(`[VIN_AC_PICK] ⏱️ TIEMPO TOTAL: ${o}ms (${(o/1e3).toFixed(2)}s)`)}).catch(n=>{console.warn("[VIN_AC_PICK] ❌ Error en flujo autocomplete:",n.message)})}function wa(t){if(Ve){if(t.key==="ArrowDown"){t.preventDefault(),$a(lt+1);return}if(t.key==="ArrowUp"){t.preventDefault(),$a(lt-1);return}if(t.key==="Enter"){lt>=0&&ht[lt]&&(t.preventDefault(),Ho(ht[lt]));return}t.key==="Escape"&&(t.preventDefault(),Xt())}}function ar(){const t=y("vinSuggest"),e=y("vinSuggestQ");[t,e].forEach(a=>{a&&a.dataset.bound!=="1"&&(a.dataset.bound="1",a.addEventListener("mousedown",n=>{const o=n.target.closest(".vsItem[data-idx]");if(!o)return;n.preventDefault();const i=Number(o.dataset.idx),s=ht[i];s&&Ho(s)}))}),document.body.dataset.vinSuggestDocBound||(document.body.dataset.vinSuggestDocBound="1",document.addEventListener("click",a=>{!Ve||[...document.querySelectorAll(".vinWrap")].some(i=>i.contains(a.target))||Xt()}))}function or(){var t,e,a,n;ar(),(t=y("vin"))==null||t.addEventListener("input",()=>{p.state.currentModule==="TECNICO"&&(Ua(),P(""),an(650))}),(e=y("vin"))==null||e.addEventListener("keydown",o=>{p.state.currentModule==="TECNICO"&&wa(o)}),(a=y("vinQ"))==null||a.addEventListener("input",()=>{p.state.currentModule==="CALIDAD"&&(Ua(),P(""),an(650))}),(n=y("vinQ"))==null||n.addEventListener("keydown",o=>{p.state.currentModule==="CALIDAD"&&wa(o)})}const Le=Ht("qrReader");let Go="QR";function Fa(t){Go=t==="BAR"?"BAR":"QR"}async function Ba(){var e;if(!(p.state.currentModule==="TECNICO"||p.state.currentModule==="CALIDAD"))return;const t=y("qrModal");(e=t==null?void 0:t.classList)==null||e.add("show"),await sn()}async function on(){var t,e;(e=(t=y("qrModal"))==null?void 0:t.classList)==null||e.remove("show"),await Le.stop()}async function sn(){const t=y("qrMsg");try{await Le.start({mode:Go,msgEl:t,onDecoded:async e=>{const a=p.state.currentModule==="CALIDAD"?U("vinQ"):U("vin");a&&(a.value=e),t&&(t.textContent=`VIN detectado: ${e}`),await on(),await Z(async()=>{await Yt({showOut:!1}),await Re(e,te()),await rt({forceFull:!0,showOut:!1}),await Yt({showOut:!1})},"Iniciando automáticamente...")}})}catch{}}function ir(){var t,e,a,n,o,i;(t=y("btnQR"))==null||t.addEventListener("click",Ba),(e=y("btnQRQ"))==null||e.addEventListener("click",Ba),(a=y("btnCloseQR"))==null||a.addEventListener("click",on),(n=y("qrModal"))==null||n.addEventListener("click",async s=>{s.target===y("qrModal")&&await on()}),(o=y("btnScanQR"))==null||o.addEventListener("click",async()=>{Fa("QR"),await Z(async()=>{await Le.stop(),await sn()},"Cambiando a QR...")}),(i=y("btnScanBar"))==null||i.addEventListener("click",async()=>{Fa("BAR"),await Z(async()=>{await Le.stop(),await sn()},"Cambiando a CÓDIGO DE BARRAS...")})}function Ie(){var o,i;if(!un())return;const t=F(),e=Date.now();if((i=(o=U("activasBox"))==null?void 0:o.querySelectorAll(".jobCard[data-key] .js-tiempo"))==null||i.forEach(s=>{const r=s.closest(".jobCard");if(!r)return;const c=r.dataset.key||"",u=t.itemsByKey.get(c);u&&(s.textContent=`⏱ ${wt(Bt(u,e))}`)}),p.state.currentModule==="RAMALERO")return;const a=de(),n=te();if(a&&n){const s=[...t.itemsByKey.values()].find(r=>String(r.vin||"").toUpperCase()===a&&String(r.rolTrabajo||"").toUpperCase()===n);s&&P(`Estado: ${s.estado} | Tiempo: ${wt(Bt(s,e))}`)}}function sr(){var t,e,a,n;Zs(),or(),ir(),Ds(),zs(),ws(),Fs(async()=>{await rt({forceFull:!0,showOut:!1})}),$s(),Us(),er(),(t=y("btnActivas"))==null||t.addEventListener("click",async()=>{p.state.currentModule==="TECNICO"&&await Z(async()=>rt({forceFull:!0,showOut:!0,_fromLock:!0}),"Refrescando...")}),(e=y("btnFinalizados"))==null||e.addEventListener("click",async()=>{p.state.currentModule==="TECNICO"&&await Z(async()=>{const o=F();if(o.showFinalizados=!o.showFinalizados,U("btnFinalizados").textContent=o.showFinalizados?"Ocultar finalizados":"Ver finalizados",o.showFinalizados&&!o._finalizadosLoaded){let i;try{i=yt()}catch{return}const s=await nn(i);if(s!=null&&s.ok&&Array.isArray(s.items)){const{normalizeItem_:r}=await _a(async()=>{const{normalizeItem_:c}=await Promise.resolve().then(()=>Ta);return{normalizeItem_:c}},void 0);for(const c of s.items){const u=r(c),d=`${u.conversionId}|${u.rolTrabajo}`;o.itemsByKey.set(d,u)}Tt(),o._finalizadosLoaded=!0}}mt()},"Cargando finalizados...")}),(a=y("btnActivasQ"))==null||a.addEventListener("click",async()=>{p.state.currentModule==="CALIDAD"&&await Z(async()=>rt({forceFull:!0,showOut:!0,_fromLock:!0}),"Refrescando...")}),(n=y("btnFinalizadosQ"))==null||n.addEventListener("click",async()=>{p.state.currentModule==="CALIDAD"&&await Z(async()=>{const o=F();if(o.showFinalizados=!o.showFinalizados,U("btnFinalizadosQ").textContent=o.showFinalizados?"Ocultar finalizados":"Ver finalizados",o.showFinalizados&&!o._finalizadosLoaded){let i;try{i=yt()}catch{return}const s=await nn(i);if(s!=null&&s.ok&&Array.isArray(s.items)){const{normalizeItem_:r,ensureNombresCache_:c}=await _a(async()=>{const{normalizeItem_:d,ensureNombresCache_:l}=await Promise.resolve().then(()=>Ta);return{normalizeItem_:d,ensureNombresCache_:l}},void 0);for(const d of s.items){const l=r(d),b=`${l.conversionId}|${l.rolTrabajo}`;o.itemsByKey.set(b,l)}const u=await c();for(const[,d]of o.itemsByKey)if(d&&d.vin&&!d.motorNombre&&!d.tanqueroNombre){const l=u.get(d.vin.toUpperCase().trim())||{};d.motorNombre=l.motorNombre||"",d.tanqueroNombre=l.tanqueroNombre||""}Tt(),o._finalizadosLoaded=!0}}mt()},"Cargando finalizados...")})}function Wo(t){p.state.currentModule=t,Ws().catch(e=>console.warn("[enter] Realtime init error:",e.message)),Bo(t,{syncNow:rt,tickClocksUI:Ie,refreshEstadoForVinRole:Yt})}function Me(t){En(t),wo(t),Js()}function Jo(t){const e=F(),a=jt(t),n=pe(a),o=e.itemsByKey.get(n);ve(a,o),e.itemsByKey.set(n,a),Tt(),Jt(),mt()}async function rr(){var o;const t=y("ramalId");t&&(t.value="");let e;try{e=yt()}catch{return}const a=String(((o=y("tipoRamal"))==null?void 0:o.value)||"").trim();if(!a){V({ok:!1,error:"Selecciona tipo de ramal"});return}let n;try{n=await De("/api/evento",{email:e,rolTrabajo:"RAMALERO",accion:"INICIO",tipoRamal:a},"Iniciando...")}catch(i){V({ok:!1,error:(i==null?void 0:i.message)||"Error de conexión"});return}V(n),n!=null&&n.ok&&Jo(n)}async function cr(t,e,a=""){var r;let n;try{n=yt()}catch{return}const o=String((t==null?void 0:t.tipoRamal)||((r=y("tipoRamal"))==null?void 0:r.value)||"").trim(),i={email:n,rolTrabajo:"RAMALERO",accion:e,conversionId:String((t==null?void 0:t.conversionId)||"").trim(),tipoRamal:o,nota:a};let s;try{s=await De("/api/evento",i,`Enviando ${e}...`)}catch(c){V({ok:!1,error:(c==null?void 0:c.message)||"Error de conexión"});return}V(s),s!=null&&s.ok&&Jo(s)}let qa=!1;function lr(){var t,e,a;qa||(qa=!0,(t=y("btnActivasR"))==null||t.addEventListener("click",async()=>{p.state.currentModule==="RAMALERO"&&await Z(async()=>rt({forceFull:!0,showOut:!0,_fromLock:!0}),"Refrescando...")}),(e=y("btnFinalizadosR"))==null||e.addEventListener("click",async()=>{p.state.currentModule==="RAMALERO"&&await Z(async()=>{const n=F();n.showFinalizados=!n.showFinalizados;const o=U("btnFinalizados");if(o&&(o.textContent=n.showFinalizados?"Ocultar finalizados":"Ver finalizados"),n.showFinalizados&&!n._finalizadosLoaded){let i;try{i=yt()}catch{return}const s=await nn(i);if(s!=null&&s.ok&&Array.isArray(s.items)){for(const r of s.items){const c=jt(r),u=`${c.conversionId}|${c.rolTrabajo}`;n.itemsByKey.set(u,c)}Tt(),n._finalizadosLoaded=!0}}mt()},"Cargando finalizados...")}),(a=y("btnRamalNuevo"))==null||a.addEventListener("click",async()=>{p.state.currentModule==="RAMALERO"&&await rr()}))}let Va=!1;function ft(t,e){return t!=null&&t.closest?t.closest(e):null}function dr(){Va||(Va=!0,document.addEventListener("click",async t=>{var i;if(p.state.currentModule!=="RAMALERO")return;const e=U("activasBox");if(!e)return;const a=t.target,n=ft(a,"button[data-act]");if(n&&e.contains(n)){t.preventDefault(),t.stopPropagation();const s=ft(n,".jobCard[data-key]"),r=((i=s==null?void 0:s.dataset)==null?void 0:i.key)||"";if(!r)return;const c=F().itemsByKey.get(r);if(!c)return;const u=String(n.dataset.act||"").toUpperCase();if(!u)return;let d="";if(u==="NOTA"){const l=s.querySelector("textarea.notaCard");d=String((l==null?void 0:l.value)||"").trim()}if(u==="FIN"&&!await $o({title:"Confirmar finalización",message:"¿Seguro que quieres finalizar este ramal? Esta acción puede cerrar la tarea actual.",acceptText:"Sí, finalizar",cancelText:"Cancelar"}))return;await cr(c,u,d);return}const o=ft(a,".jobCard");if(o&&e.contains(o)){if(ft(a,"button")||ft(a,"textarea")||ft(a,"input")||ft(a,"select")||ft(a,"a"))return;o.classList.toggle("open")}}),document.addEventListener("input",t=>{if(p.state.currentModule!=="RAMALERO")return;const e=U("activasBox");if(!e)return;const a=ft(t.target,"textarea.notaCard");if(!a||!e.contains(a))return;const n=ft(a,".jobCard");if(!n)return;const o=n.querySelector("button.btnNota[data-act='NOTA']");if(!o)return;const i=String(a.value||"").trim().length>0;o.style.display=i?"block":"none"}))}function ur(){lr(),dr()}function pr(){p.state.currentModule="RAMALERO",Bo("RAMALERO",{syncNow:rt,tickClocksUI:()=>{Ie==null||Ie(),ye==null||ye()}})}function Yo(){En("RAMALERO"),wo("RAMALERO")}function Ne(t){const e=[...t].sort((o,i)=>o-i),a=e.length;if(!a)return 0;const n=Math.floor(a/2);return a%2?e[n]:(e[n-1]+e[n])/2}function Zo(t,e){const a=t.map(n=>Math.abs(n-e));return Ne(a)}function fr(t,e,a,n=2.5){const o=a,i=Math.abs(t-e)/o;if(i<=n)return 1;const s=i-n;return 1/(1+s*s)}function Xo(t){const e=String(t||"").toUpperCase();return e==="CALIDAD"?"CALIDAD":e==="RAMAL"||e==="RAMALERO"?"RAMAL":"CONVERSION"}function ti(t){const e=String(t||"").toUpperCase();return e==="TANQUE"||e==="TANQUERO"?"TANQUE":e==="MOTOR"?"MOTOR":e==="RAMAL"||e==="RAMALERO"?"RAMAL":e==="CALIDAD"?"CALIDAD":e==="TECNICO"||e==="CONVERSION"?"MOTOR":e||"UNKNOWN"}function ei(t){return String(t||"").trim().toUpperCase()||"ALL"}function Ce(t){return Number.isFinite(t)&&t>0}function mr(t,e){const a=new Map;function n(i,s){Ce(s)&&(a.has(i)||a.set(i,[]),a.get(i).push(s))}for(const i of t||[]){const s=Number(e(i)||0);if(!Ce(s))continue;const r=Xo(i.track||i.trackType||i.modulo||i.area||i._track),c=ti(i.rol||i.rolTrabajo),u=ei(i.marca||i.brand);n("GLOBAL",s),n(`T:${r}`,s),n(`T:${r}|R:${c}`,s),n(`T:${r}|M:${u}`,s),n(`T:${r}|R:${c}|M:${u}`,s)}const o=new Map;for(const[i,s]of a.entries()){const r=s.filter(Ce);if(!r.length)continue;const c=Ne(r),u=Zo(r,c)||1;o.set(i,{key:i,count:r.length,medianMs:c,madMs:u})}return o}function vr(t,e={},a=4){var c,u;const n=Xo(e.track),o=ti(e.rol),i=ei(e.marca),s=[{key:`T:${n}|R:${o}|M:${i}`,level:"track+rol+marca"},{key:`T:${n}|R:${o}`,level:"track+rol"},{key:`T:${n}|M:${i}`,level:"track+marca"},{key:`T:${n}`,level:"track"},{key:"GLOBAL",level:"global"}];for(const d of s){const l=(c=t==null?void 0:t.get)==null?void 0:c.call(t,d.key);if(l&&Number(l.count||0)>=a)return{found:!0,key:d.key,level:d.level,count:l.count,priorMs:l.medianMs,priorMadMs:l.madMs||1}}const r=(u=t==null?void 0:t.get)==null?void 0:u.call(t,"GLOBAL");return r?{found:!0,key:"GLOBAL",level:"global-fallback",count:r.count,priorMs:r.medianMs,priorMadMs:r.madMs||1}:{found:!1,key:"",level:"none",count:0,priorMs:0,priorMadMs:1}}function gr(t,e=2.5){const a=(t||[]).filter(Ce);if(!a.length)return{avgMs:0,medianMs:0,madMs:0,used:0,total:0,sumW:0,minW:0,maxW:0};if(a.length<3)return{avgMs:a.reduce((l,b)=>l+b,0)/a.length,medianMs:Ne(a),madMs:0,used:a.length,total:a.length,sumW:a.length,minW:1,maxW:1};const n=Ne(a),o=Zo(a,n)||1;let i=0,s=0,r=1/0,c=-1/0;for(const d of a){const l=fr(d,n,o,e);i+=l,s+=l*d,l<r&&(r=l),l>c&&(c=l)}return{avgMs:i>0?s/i:n,medianMs:n,madMs:o,used:a.length,total:a.length,sumW:i,minW:Number.isFinite(r)?r:0,maxW:Number.isFinite(c)?c:0}}function br(t,e,a={}){const{k:n=2.5,priorWeight:o=6}=a,i=gr(t,n),s=Number((e==null?void 0:e.priorMs)||0);if(!(Number.isFinite(s)&&s>0))return{...i,rawRobustMs:i.avgMs,priorMs:0,priorWeight:0,priorLevel:"none",priorCount:0,source:"local-only"};const c=i.used>=12?Math.max(2,o*.45):i.used>=8?Math.max(3,o*.65):i.used>=4?Math.max(4,o*.85):Math.max(6,o*1.25),u=(i.avgMs*(i.sumW||i.used||1)+s*c)/((i.sumW||i.used||1)+c);return{...i,avgMs:u,rawRobustMs:i.avgMs,priorMs:s,priorWeight:c,priorLevel:(e==null?void 0:e.level)||"unknown",priorCount:Number((e==null?void 0:e.count)||0),priorKey:(e==null?void 0:e.key)||"",source:"local+context-prior"}}function Oe(t){const e=Math.max(0,Math.floor(t/1e3)),a=Math.floor(e/3600),n=Math.floor(e%3600/60),o=e%60,i=s=>String(s).padStart(2,"0");return`${a}h ${i(n)}m ${i(o)}s`}function Ct(t){const e=Number((t==null?void 0:t.tiempo_ms)??0);return Number.isFinite(e)&&e>0?e:0}function le(t){const e=String(t||"").trim().toUpperCase();return e==="FINALIZADO"||e==="FIN"||e==="COMPLETADO"}function yr(t){const e=String(t||"").toUpperCase();return e?e.includes("TE")?"KYC":e.includes("TT")?"VW":"JETOUR":"JETOUR"}function hr(t,e){const a=String(e||"ALL").toUpperCase();if(!a||a==="ALL")return!0;const n=String(t.rol||t.rolTrabajo||"").toUpperCase();if(n==="RAMALERO"||n==="RAMAL")return!0;const i=yr(t.vin);return a===i}function _r(t){const e=String(t||"").toUpperCase();return e==="MOTOR"||e==="TANQUE"||e==="TANQUERO"}function Ir(t){var n,o;const e=new Map;for(const i of t){const s=String(i.rol||i.rolTrabajo||"").toUpperCase();if(!_r(s)){const f=`RAW|${Math.random()}`;e.set(f,{_kind:"raw",it:i});continue}const r=String(i.vin||"").trim().toUpperCase();if(!r){const f=`NOVIN|${i.workId||""}|${s}|${Math.random()}`;e.set(f,{_kind:"raw",it:i});continue}const c=e.get(r)||{_kind:"group",vin:r,estado:"SIN_DATO",motor:null,tanque:null,sortTs:0};s==="MOTOR"?c.motor=i:c.tanque=i;const u=String(((n=c.motor)==null?void 0:n.estado)||"").toUpperCase(),d=String(((o=c.tanque)==null?void 0:o.estado)||"").toUpperCase(),l=[u,d].filter(Boolean);l.includes("FINALIZADO")||l.includes("FIN")||l.includes("COMPLETADO")?c.estado="FINALIZADO":l.includes("TRABAJANDO")?c.estado="TRABAJANDO":l.includes("PAUSADO")?c.estado="PAUSADO":c.estado=l[0]||"SIN_DATO";const b=Date.parse(String(i.updated_at||""))||0,g=Date.parse(String(i.fecha_asignacion||i.fecha_inicio||""))||0;c.sortTs=Math.max(c.sortTs,b,g),e.set(r,c)}const a=Array.from(e.values());return a.sort((i,s)=>(s.sortTs||0)-(i.sortTs||0)),a}function rn(t){return le(t)}function Cr(t,{stats:e,techName:a,motorCount:n,tanqueCount:o,finalizedCount:i,escapeHtml:s}){if(t)if((e==null?void 0:e.used)>0){const r=String(a).toUpperCase();t.innerHTML=`
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
              ${s(r)}
            </div>
          </div>

          <div class="pill small" style="opacity:.95;">
            FINALIZADOS: <b>${i||0}</b>
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
              ${s(Oe(e.avgMs))}
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
    `}function Sr(t,{uiList:e,escapeHtml:a,fmtShort_:n}){t&&(t.innerHTML=e.map(o=>o&&o._kind==="group"?Ar(o,{escapeHtml:a,fmtShort_:n}):Er(o,{escapeHtml:a,fmtShort_:n})).join(""))}function Ar(t,{escapeHtml:e,fmtShort_:a}){const n=t.vin||"-",o=t.motor,i=t.tanque,s=(o==null?void 0:o.userName)||(o==null?void 0:o.userEmail)||(o==null?void 0:o.userId)||"-",r=(i==null?void 0:i.userName)||(i==null?void 0:i.userEmail)||(i==null?void 0:i.userId)||"-",c=o&&Ct(o)?Oe(Ct(o)):"-",u=i&&Ct(i)?Oe(Ct(i)):"-",d=o?a(o.fecha_inicio||o.fecha_asignacion||""):"",l=o&&rn(o.estado)?a(o.updated_at||""):"",b=i?a(i.fecha_inicio||i.fecha_asignacion||""):"",g=i&&rn(i.estado)?a(i.updated_at||""):"",f=String((o==null?void 0:o.workId)||(i==null?void 0:i.workId)||"").trim();return`
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
          <b>Inicio:</b> ${e(d)}${l?` &nbsp;|&nbsp; <b>Fin:</b> ${e(l)}`:""}
        </div>
      </div>

      <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.14);">
        <div class="small" style="font-weight:900;">TANQUE: ${e(r)}</div>
        <div class="small" style="margin-top:6px;"><b>Duración:</b> ${e(u)}</div>
        <div class="small" style="margin-top:6px;">
          <b>Inicio:</b> ${e(b)}${g?` &nbsp;|&nbsp; <b>Fin:</b> ${e(g)}`:""}
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
  `}function Er(t,{escapeHtml:e,fmtShort_:a}){const n=(t==null?void 0:t.userName)||(t==null?void 0:t.userEmail)||(t==null?void 0:t.userId)||"-",o=String((t==null?void 0:t.rol)||(t==null?void 0:t.rolTrabajo)||"").toUpperCase()||"-",i=o==="RAMALERO"||o==="RAMAL",s=i?`RAMAL: ${(t==null?void 0:t.tipoRamal)||"-"}`:(t==null?void 0:t.vin)||"-",r=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),c=String((t==null?void 0:t.workId)||(t==null?void 0:t.conversionId)||(t==null?void 0:t.conversion_id)||"").trim(),u=Ct(t),d=u?Oe(u):"-";return`
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
        ${rn(t==null?void 0:t.estado)?`&nbsp;|&nbsp; <b>Fin:</b> ${e(a(t==null?void 0:t.updated_at))}`:""}
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
  `}const ni=Ht("qrReader");async function Rr({onDecodedDone:t}){var a;const e=document.getElementById("qrModal");(a=e==null?void 0:e.classList)==null||a.add("show"),await Tr({onDecodedDone:t})}async function cn(){var t,e;(e=(t=document.getElementById("qrModal"))==null?void 0:t.classList)==null||e.remove("show"),await ni.stop()}async function Tr({onDecodedDone:t}){const e=document.getElementById("qrMsg");try{await ni.start({mode:"QR",msgEl:e,onDecoded:async a=>{const n=document.getElementById("supVin");n&&(n.value=a),e&&(e.textContent=`VIN detectado: ${a}`),await cn();try{await(t==null?void 0:t(a))}catch{}}})}catch{}}function Lr({CORE:t,onApply:e}){var a,n,o;(a=document.getElementById("btnSupQR"))==null||a.addEventListener("click",()=>{t.state.currentModule==="SUPERVISOR"&&Rr({onDecodedDone:()=>e==null?void 0:e()}).catch(()=>{})}),(n=document.getElementById("btnCloseQR"))==null||n.addEventListener("click",()=>cn()),(o=document.getElementById("qrModal"))==null||o.addEventListener("click",async i=>{i.target===document.getElementById("qrModal")&&await cn()})}function Mr({CORE:t,escapeHtml:e,onApply:a}){const n={MIN_CHARS:3,DEBOUNCE_MS:750,LIMIT:12};let o=null,i=null,s=[],r=!1,c=-1,u="";function d(){return document.getElementById("supNameSuggest")}function l(){const _=d();_&&(r=!1,c=-1,s=[],_.classList.add("hidden"),_.innerHTML="")}function b(){const _=d();if(_){if(!s.length)return l();_.innerHTML=s.map((T,D)=>{const q=D===c?"active":"",K=T.name||T.email||T.id||"",z=T.email?T.email:"";return`
        <div class="vsItem ${q}" data-idx="${D}" role="option" aria-selected="${D===c}">
          <div class="vsVin">${e(K)}</div>
          <div class="vsHint">${e(z)}</div>
        </div>
      `}).join(""),_.classList.remove("hidden"),r=!0}}function g(_){c=Math.max(0,Math.min(_,s.length-1)),b();const T=d(),D=T==null?void 0:T.querySelector(`.vsItem[data-idx="${c}"]`);D&&D.scrollIntoView({block:"nearest"})}async function f(_){var z;try{(z=i==null?void 0:i.abort)==null||z.call(i)}catch{}i=new AbortController;const T=`/api/name-suggest?q=${encodeURIComponent(_)}&limit=${encodeURIComponent(n.LIMIT)}`,q=await(await fetch(T,{signal:i.signal})).json();return q!=null&&q.ok?(Array.isArray(q.items)?q.items:[]).map($=>typeof $=="string"?{name:$}:$).filter(Boolean):[]}function I(_){const T=document.getElementById("supName");if(!T)return;const D=String((_==null?void 0:_.name)||(_==null?void 0:_.email)||(_==null?void 0:_.id)||"").trim();T.value=D,l(),a==null||a()}function C(){if(t.state.currentModule!=="SUPERVISOR")return;const _=document.getElementById("supName");if(!_)return;const T=String(_.value||"").trim();if(u=T,!T||T.length<n.MIN_CHARS){l();return}clearTimeout(o),o=setTimeout(async()=>{try{const D=await f(T);if(u!==T)return;s=D,c=s.length?0:-1,b()}catch{l()}},n.DEBOUNCE_MS)}function B(_){if(t.state.currentModule==="SUPERVISOR"){if(_.key==="Enter"){_.preventDefault(),l(),a==null||a();return}if(r){if(_.key==="ArrowDown")return _.preventDefault(),g(c+1);if(_.key==="ArrowUp")return _.preventDefault(),g(c-1);if(_.key==="Escape")return _.preventDefault(),l();_.key==="Tab"&&c>=0&&s[c]&&(_.preventDefault(),I(s[c]))}}}const Q=document.getElementById("supName"),X=document.getElementById("supNameSuggest");Q==null||Q.addEventListener("input",C),Q==null||Q.addEventListener("keydown",B),X==null||X.addEventListener("mousedown",_=>{const T=_.target.closest(".vsItem[data-idx]");if(!T)return;_.preventDefault();const D=Number(T.dataset.idx),q=s[D];q&&I(q)}),document.addEventListener("click",_=>{if(!r)return;const T=document.querySelector(".supNameWrap");T&&T.contains(_.target)||l()})}function Nr({CORE:t,escapeHtml:e,onApply:a}){const n={MIN_CHARS:1,DEBOUNCE_MS:200,LIMIT:12};let o=null,i=null,s=[],r=!1,c=-1,u="";function d(){return document.getElementById("supVinSuggest")}function l(){const _=d();_&&(r=!1,c=-1,s=[],_.classList.add("hidden"),_.innerHTML="")}function b(){const _=d();if(_){if(!s.length)return l();_.innerHTML=s.map((T,D)=>`
        <div class="vsItem ${D===c?"active":""}" data-idx="${D}" role="option" aria-selected="${D===c}">
          <div class="vsVin">${e(T)}</div>
          <div class="vsHint">Enter</div>
        </div>
      `).join(""),_.classList.remove("hidden"),r=!0}}function g(_){c=Math.max(0,Math.min(_,s.length-1)),b();const T=d(),D=T==null?void 0:T.querySelector(`.vsItem[data-idx="${c}"]`);D&&D.scrollIntoView({block:"nearest"})}async function f(_){var K;try{(K=i==null?void 0:i.abort)==null||K.call(i)}catch{}i=new AbortController;try{if(mn())return(await no(_,n.LIMIT)||[]).map($=>typeof $=="object"&&$!==null&&$.vin?String($.vin).toUpperCase():String($||"").toUpperCase()).filter(Boolean)}catch(z){console.warn("[supVinFetch_] Supabase error:",z.message)}const T=`/api/vin-suggest?q=${encodeURIComponent(_)}&limit=${encodeURIComponent(n.LIMIT)}`,q=await(await fetch(T,{signal:i.signal})).json();return q!=null&&q.ok?(Array.isArray(q.items)?q.items:[]).map(z=>typeof z=="object"&&z!==null&&z.vin?String(z.vin).toUpperCase():String(z||"").toUpperCase()).filter(Boolean):[]}function I(_){const T=document.getElementById("supVin");T&&(T.value=String(_||"").toUpperCase(),l(),a==null||a())}function C(){if(t.state.currentModule!=="SUPERVISOR")return;const _=document.getElementById("supVin");if(!_)return;const T=String(_.value||"").trim().toUpperCase();if(u=T,!T||T.length<n.MIN_CHARS){l();return}clearTimeout(o),o=setTimeout(async()=>{try{const D=await f(T);if(u!==T)return;s=D,c=s.length?0:-1,b()}catch{l()}},n.DEBOUNCE_MS)}function B(_){if(t.state.currentModule==="SUPERVISOR"){if(_.key==="Enter"){r&&c>=0&&s[c]?(_.preventDefault(),I(s[c])):(_.preventDefault(),l(),a==null||a());return}if(r){if(_.key==="ArrowDown")return _.preventDefault(),g(c+1);if(_.key==="ArrowUp")return _.preventDefault(),g(c-1);if(_.key==="Escape")return _.preventDefault(),l();_.key==="Tab"&&c>=0&&s[c]&&(_.preventDefault(),I(s[c]))}}}const Q=document.getElementById("supVin"),X=document.getElementById("supVinSuggest");Q==null||Q.addEventListener("input",C),Q==null||Q.addEventListener("keydown",B),X==null||X.addEventListener("mousedown",_=>{const T=_.target.closest(".vsItem[data-idx]");if(!T)return;_.preventDefault();const D=Number(T.dataset.idx),q=s[D];q&&I(q)}),document.addEventListener("click",_=>{if(!r)return;const T=document.querySelector(".supVinWrap");T&&T.contains(_.target)||l()})}function ln(t){return String(t).padStart(2,"0")}function Qa(t){const e=t.getFullYear(),a=ln(t.getMonth()+1),n=ln(t.getDate());return`${e}-${a}-${n}`}function Or(t){const e=t.getFullYear(),a=ln(t.getMonth()+1);return`${e}-${a}`}function kr({onApply:t}){var e,a,n;(e=document.getElementById("btnSupHoy"))==null||e.addEventListener("click",()=>{const i=Qa(new Date),s=document.getElementById("supFrom"),r=document.getElementById("supTo");s&&(s.value=i),r&&(r.value=i);const c=document.getElementById("supMonth");c&&(c.value=""),t==null||t()}),(a=document.getElementById("btnSupAyer"))==null||a.addEventListener("click",()=>{const o=new Date;o.setDate(o.getDate()-1);const i=Qa(o),s=document.getElementById("supFrom"),r=document.getElementById("supTo");s&&(s.value=i),r&&(r.value=i);const c=document.getElementById("supMonth");c&&(c.value=""),t==null||t()}),(n=document.getElementById("btnSupEsteMes"))==null||n.addEventListener("click",()=>{const i=Or(new Date),s=document.getElementById("supMonth");s&&(s.value=i);const r=document.getElementById("supFrom"),c=document.getElementById("supTo");r&&(r.value=""),c&&(c.value=""),t==null||t()})}let St="CONVERSION",xr=null;function Dr(t){St=t==="CALIDAD"||t==="RAMAL"?t:"CONVERSION",document.querySelectorAll("[data-suptrack]").forEach(a=>a.classList.toggle("active",a.dataset.suptrack===St));const e=document.getElementById("supTrackPill");e&&(e.textContent=St==="CONVERSION"?"CONVERSIÓN (MOTOR + TANQUE)":St==="CALIDAD"?"CALIDAD":"RAMAL"),gt().catch(()=>{})}async function gt(){var c,u,d,l,b;const t=String(((c=document.getElementById("supName"))==null?void 0:c.value)||"").trim(),e=String(((u=document.getElementById("supVin"))==null?void 0:u.value)||"").trim().toUpperCase(),a=String(((d=document.getElementById("supFrom"))==null?void 0:d.value)||"").trim(),n=String(((l=document.getElementById("supTo"))==null?void 0:l.value)||"").trim(),o=String(((b=document.getElementById("supMonth"))==null?void 0:b.value)||"").trim(),i=[t,e].filter(Boolean).join(" ").trim(),s=`/api/supervisor/report?name=${encodeURIComponent(t)}&vin=${encodeURIComponent(e)}&q=${encodeURIComponent(i)}&from=${encodeURIComponent(a)}&to=${encodeURIComponent(n)}&month=${encodeURIComponent(o)}&track=${encodeURIComponent(St)}`,r=await fn(s,"Cargando reporte...");if(!(r!=null&&r.ok)){const g=document.getElementById("supSummary");g&&(g.textContent=(r==null?void 0:r.error)||"Error cargando reporte.");const f=document.getElementById("supTable");f&&(f.innerHTML="");const I=document.getElementById("supAvgCard");I&&(I.innerHTML="");return}$r(r)}function $r(t){var K,z;const e=document.getElementById("supSummary"),a=document.getElementById("supTable"),n=document.getElementById("supAvgCard"),o=Array.isArray(t.items)?t.items:[],i=String(((K=document.getElementById("supMarca"))==null?void 0:K.value)||"ALL").toUpperCase(),r=o.filter($=>hr($,i)),c=String(((z=document.getElementById("supName"))==null?void 0:z.value)||"").trim(),d=!!!c&&St==="CONVERSION"?Ir(r):r,b=o.filter($=>{const at=String($.rol||$.rolTrabajo||"").toUpperCase();return at==="RAMALERO"||at==="RAMAL"||!le($.estado)?!1:Ct($)>0}).map($=>({...$,_track:St})),g=mr(b,Ct),f=[],I=new Set;for(const $ of r){const at=String($.rol||$.rolTrabajo||"").toUpperCase();if(at==="RAMALERO"||at==="RAMAL"||!le($.estado))continue;const ge=Ct($);ge>0&&(f.push(ge),I.add(at))}let C="";I.size===1&&(C=[...I][0]);const B=vr(g,{track:St,rol:C,marca:i},4),Q=br(f,B,{priorWeight:6,k:2.1}),X=c||"Técnico";let _=0,T=0;const D=new Set;for(const $ of r){if(!le($.estado))continue;const at=String($.rol||$.rolTrabajo||"").toUpperCase();at==="TANQUE"||at==="TANQUERO"?T++:(at==="MOTOR"||at==="TECNICO"||at==="CONVERSION")&&_++;const Nt=String($.vin||"").trim();Nt&&D.add(Nt)}const q=D.size;if(Cr(n,{stats:Q,techName:X,motorCount:_,tanqueCount:T,finalizedCount:q,escapeHtml:N}),!!a){if(!r.length){e&&(e.textContent="Resultados: 0"),n&&(n.innerHTML=""),a.innerHTML='<div class="small">No hay resultados con esos filtros.</div>';return}e&&(e.textContent=`Resultados: ${d.length}`),Sr(a,{uiList:d,escapeHtml:N,fmtShort_:Ut})}}function Ur(){var t,e,a;document.querySelectorAll("[data-suptrack]").forEach(n=>n.addEventListener("click",()=>Dr(n.dataset.suptrack))),(t=document.getElementById("btnSupApply"))==null||t.addEventListener("click",()=>gt().catch(()=>{})),(e=document.getElementById("supMarca"))==null||e.addEventListener("change",()=>{p.state.currentModule==="SUPERVISOR"&&gt().catch(()=>{})}),(a=document.getElementById("btnSupClear"))==null||a.addEventListener("click",()=>{["supName","supVin","supFrom","supTo","supMonth"].forEach(n=>{const o=document.getElementById(n);o&&(o.value="")}),gt().catch(()=>{})}),tr({CORE:p,getJSON_user:fn,escapeHtml:N,fmtShort_:Ut}),kr({onApply:()=>gt().catch(()=>{})}),Lr({CORE:p,onApply:()=>gt().catch(()=>{})}),Mr({CORE:p,escapeHtml:N,onApply:()=>gt().catch(()=>{})}),Nr({CORE:p,escapeHtml:N,onApply:()=>gt().catch(()=>{})})}function wr(){p.state.currentModule="SUPERVISOR",window.__nameSuggestWarmed||(window.__nameSuggestWarmed=!0,fetch("/api/name-suggest?q=.&limit=200").catch(()=>{})),gt().catch(()=>{})}function Fr(){clearTimeout(xr)}function Br(){p.state.currentModule="ADMIN"}let qr=null;function Vr(t){return String(t||"").trim().toUpperCase()}function ja(t){return Vr((t==null?void 0:t.vin)||(t==null?void 0:t.chasis_id)||(t==null?void 0:t.chasisId)||(t==null?void 0:t.VIN)||(t==null?void 0:t.CHASIS_ID))}function zt(t){if(!t)return NaN;const e=Date.parse(t);return Number.isFinite(e)?e:NaN}function Qr(t){return zt(t==null?void 0:t.fecha_fin)||zt(t==null?void 0:t.updated_at)||zt(t==null?void 0:t.fechaFin)||zt(t==null?void 0:t.fecha_inicio)||zt(t==null?void 0:t.created_at)||zt(t==null?void 0:t.fecha_creacion)||NaN}function jr(t){const e=(t==null?void 0:t.fecha_fin)||(t==null?void 0:t.updated_at)||(t==null?void 0:t.fechaFin)||(t==null?void 0:t.fecha_inicio)||(t==null?void 0:t.created_at)||(t==null?void 0:t.fecha_creacion)||"";return e?Ut(e):"—"}async function Pa(t){const e=`/api/supervisor/report?name=&vin=&q=&from=&to=&month=&track=${encodeURIComponent(t)}`,a=await fn(e,`Cargando ${t}...`);if(!(a!=null&&a.ok))throw new Error((a==null?void 0:a.error)||`No se pudo cargar ${t}`);return Array.isArray(a.items)?a.items:[]}function Pr(t,e=[]){const a=new Set;for(const i of e){const s=ja(i);s&&a.add(s)}const n=new Map;for(const i of t){const s=ja(i);if(!s||!le(i==null?void 0:i.estado))continue;const r=Qr(i),c=n.get(s);(!c||r>c._sortMs)&&n.set(s,{vin:s,fechaLabel:jr(i),_sortMs:Number.isFinite(r)?r:0})}const o=[];for(const i of n.values())a.has(i.vin)||o.push(i);return o.sort((i,s)=>i._sortMs-s._sortMs),o}function zr(t,e={}){const a=document.getElementById("movSummary"),n=document.getElementById("movTable");if(!n)return;const o=e!=null&&e.warn?`
    <div class="small" style="margin-bottom:10px; color:#ffd166;">
      ${N(e.warn)}
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
                ${N(i.vin)}
              </td>
              <td>${N(i.fechaLabel)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `}async function ai(){const t=document.getElementById("movSummary"),e=document.getElementById("movTable");try{t&&(t.textContent="Cargando pendientes..."),e&&(e.innerHTML="");const a=await Pa("CONVERSION");let n=[],o="";try{n=await Pa("CALIDAD")}catch(s){console.warn("MOVILIZADOR: no se pudo cargar CALIDAD",s),o="No se pudo validar CALIDAD. Se muestran conversiones finalizadas sin excluir registros de calidad."}const i=Pr(a,n);zr(i,{warn:o})}catch(a){t&&(t.textContent=(a==null?void 0:a.message)||"Error cargando vista MOVILIZADOR."),e&&(e.innerHTML="")}}function Kr(){var t;(t=document.getElementById("btnMovRefresh"))==null||t.addEventListener("click",()=>{ai().catch(()=>{})})}function Hr(){p.state.currentModule="MOVILIZADOR",ai().catch(()=>{})}function oi(){clearTimeout(qr)}const za=document.getElementById("appRoot");za&&(za.innerHTML=xi());async function ii(t){if(!t)return ie("Pon tu email.");try{let e;if(mn()&&(await Z(async()=>{e=await Wi(t)},"Iniciando sesión..."),!e))return ie("Usuario no encontrado en Supabase.");p.state.currentProfile=e,Vi(t),Bi(),Fi(),wi(),p.state.rolLock=qi(p.state.currentProfile),ke();const a=Xa(p.state.currentProfile);$i(),a.length>1?(Vt(),Za(a,n=>dn(n)),p.state.currentModule=null):dn(a[0])}catch(e){console.error("Error en login:",e),ie((e==null?void 0:e.message)||"Error al iniciar sesión.")}}function dn(t){Qt(),Mt(t),p.state.currentModule=t,Vt();const e=document.getElementById(`view${t}`);e&&(e.style.display="block");const a=y("viewHub");a&&(a.style.display="none"),ke()}Mt.register("TECNICO",()=>Wo("TECNICO"),()=>Me("TECNICO"));Mt.register("CALIDAD",()=>Wo("CALIDAD"),()=>Me("CALIDAD"));Mt.register("RAMALERO",()=>pr(),()=>Yo());Mt.register("SUPERVISOR",()=>wr(),()=>Fr());Mt.register("ADMIN",()=>Br(),()=>void 0);Mt.register("MOVILIZADOR",()=>Hr(),()=>oi());sr();ur();Ur();Kr();fo();var Ka;(Ka=y("btnTheme"))==null||Ka.addEventListener("click",Ki);var Ha;(Ha=y("btnRegistroFallas"))==null||Ha.addEventListener("click",()=>{var e,a,n,o,i,s;Vt(),y("viewHub")&&(y("viewHub").style.display="none");const t=((a=(e=y("vin"))==null?void 0:e.value)==null?void 0:a.trim())||((o=(n=y("vinQ"))==null?void 0:n.value)==null?void 0:o.trim())||((s=(i=y("supVin"))==null?void 0:i.value)==null?void 0:s.trim())||"";vn({vin:t,screen:"menu"})});var Ga;(Ga=y("btnGoHome"))==null||Ga.addEventListener("click",()=>{const t=Xa(p.state.currentProfile);Qt(),Vt(),Za(t,e=>dn(e)),p.state.currentModule=null});var Wa;(Wa=y("btnMe"))==null||Wa.addEventListener("click",async()=>{const t=se();await ii(t)});var Ja;(Ja=y("btnLogout"))==null||Ja.addEventListener("click",()=>{var t,e,a;ji(),y("email").value="",p.state.currentProfile=null,p.state.currentModule=null,Me("TECNICO"),Me("CALIDAD"),Yo(),oi(),Vt(),y("viewHub").style.display="none",(t=y("btnGoHome"))==null||t.classList.add("hidden"),(e=document.getElementById("debugWrap"))==null||e.classList.add("debug-hidden"),(a=document.getElementById("viewUploader"))!=null&&a.style&&(document.getElementById("viewUploader").style.display="none"),ie("Sesión cerrada.")});window.addEventListener("load",async()=>{Pi();const t=Qi();if(!t)return ie("");y("email").value=t,await ii(t)});window.getRealtimeStatus=Gi;
