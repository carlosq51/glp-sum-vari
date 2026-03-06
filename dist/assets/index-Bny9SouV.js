(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))n(o);new MutationObserver(o=>{for(const i of o)if(i.type==="childList")for(const s of i.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&n(s)}).observe(document,{childList:!0,subtree:!0});function a(o){const i={};return o.integrity&&(i.integrity=o.integrity),o.referrerPolicy&&(i.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?i.credentials="include":o.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(o){if(o.ep)return;o.ep=!0;const i=a(o);fetch(o.href,i)}})();function zo(){return`
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
  `}function Ko(){return`
    <!-- HUB -->
    <div id="viewHub" class="card" style="display:none;">
      <h3>Selecciona un módulo</h3>
      <div id="hubButtons" class="row menu"></div>
      <div class="small">Si tienes varios permisos, puedes cambiar de módulo cuando quieras.</div>
    </div>
  `}function Wo(){return`
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
  `}function Go(){return`
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
  `}function Yo(){return`
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
  `}function Jo(){return`
    <!-- ADMIN -->
    <div id="viewADMIN" class="card" style="display:none;">
      <h3>Admin</h3>
      <div class="small">Aquí irá la vista Admin.</div>
    </div>
  `}function Zo(){return`
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
  `}function Xo(){return`
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
  `}function ti(){return`
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
  `}function ei(){return`
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
  `}function ni(){return`
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
  `}function ai(){return`
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
  `}function oi(){return`
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
  `}function ii(){return`
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
  `}function si(){return`
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
  `}function ri(){return`
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
  `}function ci(){return`
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
  `}function li(){return`
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
  `}function di(){return`
    ${zo()}

    <!-- =========================
         APP
         ========================= -->
    <div id="viewApp" style="display:none;">
      ${ni()}

      ${Ko()}
      ${Wo()}
      ${Go()}
      ${Yo()}

      <!-- MOVILIZADOR (stub como lo tenías) -->
      ${Xo()}

      ${ti()}
      ${Jo()}
      ${Zo()}
    </div>

    ${ai()}
    ${si()}
    ${oi()}
    ${ii()}
    ${ri()}
    ${ci()}
    ${li()}
    ${ei()}
  `}const Da=["TECNICO","RAMALERO","CALIDAD","MOVILIZADOR","SUPERVISOR","ADMIN"],u={state:{rolLock:null,currentProfile:null,currentModule:null,uiLocked:!1,storeByModule:{TECNICO:{itemsByKey:new Map,activeKeys:[],finalKeys:[],lastSyncSince:null,lastSyncRev:null,lastSyncAtMs:0,showFinalizados:!1},CALIDAD:{itemsByKey:new Map,activeKeys:[],finalKeys:[],lastSyncSince:null,lastSyncRev:null,lastSyncAtMs:0,showFinalizados:!1},RAMALERO:{itemsByKey:new Map,activeKeys:[],finalKeys:[],lastSyncSince:null,lastSyncRev:null,lastSyncAtMs:0,showFinalizados:!1}}}};function F(){const t=u.state.currentModule;return t==="CALIDAD"?u.state.storeByModule.CALIDAD:t==="RAMALERO"?u.state.storeByModule.RAMALERO:u.state.storeByModule.TECNICO}function Ye(){const t=u.state.currentModule;return t==="TECNICO"||t==="CALIDAD"||t==="RAMALERO"}const g=t=>document.getElementById(t);function ui(){const t=u.state.currentModule;return t==="CALIDAD"?"Q":t==="RAMALERO"?"R":""}function U(t){const e=ui();return g(t+e)||g(t)}function ue(t=""){g("viewLogin").style.display="block",g("viewApp").style.display="none",g("loginMsg").textContent=t}function pi(){g("viewLogin").style.display="none",g("viewApp").style.display="block",g("loginMsg").textContent=""}function $t(){const t=g("viewHub");t&&(t.style.display="none"),Da.forEach(e=>{const a=document.getElementById(`view${e}`);a&&(a.style.display="none")})}function Ua(t,e){$t();const a=g("viewHub");a&&(a.style.display="block");const n=g("hubButtons");n&&(n.innerHTML="",t.forEach(o=>{const i=document.createElement("button");i.textContent=o,i.addEventListener("click",()=>e==null?void 0:e(o)),n.appendChild(i)}))}function fi(){var e;const t=(e=u.state.currentProfile)==null?void 0:e.modulos;return Array.isArray(t)&&t.filter(Boolean).length>1}function mi(){const t=g("btnGoHome");if(!t)return;const e=fi();t.classList.toggle("hidden",!e)}function vi(){const t=u.state.currentProfile||{},e=String(t.rol||"").toUpperCase(),a=String(t.especialidad||"").toUpperCase(),n=Array.isArray(t.modulos)?t.modulos.join(","):"(default)",o=String(t.nombre||"").trim(),i=g("userHello"),s=g("userPill");i&&(i.textContent=o?`HOLA: ${o}`:"HOLA:");const r=e==="TECNICO"?` | ESP: ${a||"-"}`:"";s&&(s.textContent=`ROL: ${e}${r} | MOD: ${n}`)}function gi(){var a;const t=document.getElementById("debugWrap");if(!t)return;String(((a=u.state.currentProfile)==null?void 0:a.rol)||"").toUpperCase()==="ADMIN"?t.classList.remove("debug-hidden"):t.classList.add("debug-hidden")}function K(t){const e=g("out");e&&(e.textContent=JSON.stringify(t,null,2))}function dt(t){const e=U("estadoBox");e&&(e.textContent=t||"")}const Je="glp_email";function $a(t){const e=String((t==null?void 0:t.rol)||"").toUpperCase();if(Array.isArray(t==null?void 0:t.modulos)&&t.modulos.length){const a=t.modulos.map(n=>String(n||"").trim().toUpperCase()).filter(Boolean);return a.includes("ALL")?[...Da]:[...new Set(a)]}return e==="TECNICO"?["TECNICO"]:e==="RAMALERO"?["RAMALERO"]:e==="CALIDAD"?["CALIDAD"]:e==="MOVILIZADOR"?["MOVILIZADOR"]:e==="SUPERVISOR"?["SUPERVISOR"]:e==="ADMIN"?["ADMIN"]:["TECNICO"]}function bi(t){if(String((t==null?void 0:t.rol)||"").toUpperCase()!=="TECNICO")return null;const a=String((t==null?void 0:t.especialidad)||"").toUpperCase();return a==="MOTOR"?"MOTOR":a==="TANQUE"||a==="TANQUERO"?"TANQUE":null}function he(){if(u.state.currentModule!=="TECNICO")return;const t=g("rol");t&&(u.state.rolLock?(t.value=u.state.rolLock,t.disabled=!0):t.disabled=!1)}function yi(t){localStorage.setItem(Je,t)}function hi(){return localStorage.getItem(Je)||""}function Ci(){localStorage.removeItem(Je)}function Zt(){var t;return String(((t=g("email"))==null?void 0:t.value)||"").trim().toLowerCase()}function Ce(){var t;return String(((t=U("vin"))==null?void 0:t.value)||"").trim().toUpperCase()}function Fa(){if(u.state.rolLock)return u.state.rolLock;const t=g("rol");return t?String(t.value||"MOTOR").toUpperCase():"MOTOR"}function jt(){return u.state.currentModule==="CALIDAD"?"CALIDAD":u.state.currentModule==="RAMALERO"?"RAMALERO":String(Fa()||"").toUpperCase()}function Ht(){const t=Zt();if(!t)throw new Error("NO_EMAIL");return t}const Ba="glp_theme";function Ii(){const t=Ai();if(t)return $e(t);const e=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches;$e(e?"day":"night")}function Ai(){try{return localStorage.getItem(Ba)||""}catch{return""}}function Si(){const t=document.documentElement.dataset.theme||"night";$e(t==="day"?"night":"day")}function $e(t){const e=t==="day"?"day":"night";document.documentElement.dataset.theme=e;try{localStorage.setItem(Ba,e)}catch{}}function oa(t,e="Procesando..."){var d,p;u.state.uiLocked=!!t;const a=g("loadingOverlay");if(a){a.classList.toggle("hidden",!u.state.uiLocked);const b=document.getElementById("overlayMsg");b&&(b.textContent=String(e||"Procesando").replace(/\.*\s*$/,""))}u.state.uiLocked?dt(e):dt("");const n=g("email");if(n&&(n.disabled=u.state.uiLocked),u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD"){const b=U("vin");b&&(b.disabled=u.state.uiLocked)}const o=g("rol");o&&(o.disabled=u.state.uiLocked||!!u.state.rolLock||u.state.currentModule!=="TECNICO");const i=g("btnMe");i&&(i.disabled=u.state.uiLocked);const s=g("btnLogout");s&&(s.disabled=u.state.uiLocked);const r=["btnEstado","btnActivas","btnFinalizados","btnQR","btnSupQR"];for(const b of r){const y=U(b);y&&(y.disabled=u.state.uiLocked)}const c=U("activasBox"),l=U("finalizadosBox");(d=c==null?void 0:c.querySelectorAll("button[data-act]"))==null||d.forEach(b=>b.disabled=u.state.uiLocked),(p=l==null?void 0:l.querySelectorAll("button[data-act]"))==null||p.forEach(b=>b.disabled=u.state.uiLocked)}async function J(t,e){if(!u.state.uiLocked){oa(!0,e);try{return await t()}finally{oa(!1)}}}async function _t(t){return await(await fetch(t)).json()}async function Ze(t,e){return await(await fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)})).json()}async function Ie(t,e="Cargando..."){return await J(async()=>await _t(t),e)}async function Ae(t,e,a="Procesando..."){return await J(async()=>await Ze(t,e),a)}const wa="glp_vin_cache_v1",qa="glp_ramal_cache_v1";function Va(){try{return JSON.parse(localStorage.getItem(wa)||"{}")}catch{return{}}}function _i(t){try{localStorage.setItem(wa,JSON.stringify(t))}catch{}}function Qa(t,e){const a=String(t||"").trim(),n=String(e||"").toUpperCase().trim();return a&&n?`${a}|${n}`:""}function Ri(t,e,a){var l;const n=String(t||"").trim(),o=String(a||"").trim().toUpperCase();if(!n||!o)return;const i=String(e||"").toUpperCase().trim(),s=Qa(n,i);if(!s)return;const r=Va();r[s]={vin:o,ts:Date.now()};const c=336*3600*1e3;for(const d of Object.keys(r))(!((l=r[d])!=null&&l.ts)||Date.now()-r[d].ts>c)&&delete r[d];_i(r)}function Ei(t,e){var o;const a=Qa(t,e);if(!a)return"";const n=Va();return String(((o=n[a])==null?void 0:o.vin)||"").toUpperCase()}function Pa(){try{return JSON.parse(localStorage.getItem(qa)||"{}")}catch{return{}}}function Li(t){try{localStorage.setItem(qa,JSON.stringify(t))}catch{}}function ja(t){const e=String(t||"").trim();return e?`RAMAL|${e}`:""}function Mi(t,e){var s;const a=String(t||"").trim(),n=String(e||"").trim();if(!a||!n)return;const o=Pa();o[ja(a)]={tipoRamal:n,ts:Date.now()};const i=336*3600*1e3;for(const r of Object.keys(o))(!((s=o[r])!=null&&s.ts)||Date.now()-o[r].ts>i)&&delete o[r];Li(o)}function Ti(t){var n;const e=String(t||"").trim();if(!e)return"";const a=Pa();return String(((n=a[ja(e)])==null?void 0:n.tipoRamal)||"")}function T(t){return String(t??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function Ni(t){return window.CSS&&typeof CSS.escape=="function"?CSS.escape(String(t)):String(t).replace(/["\\]/g,"\\$&")}function Nt(t){if(!t)return"-";const e=new Date(t);return isNaN(e.getTime())?"-":new Intl.DateTimeFormat("es-PE",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}).format(e)}function Ha(t){if(!t)return"-";const e=new Date(t);return isNaN(e.getTime())?"-":new Intl.DateTimeFormat("es-PE",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(e)}function Ot(t){t=Math.max(0,Number(t)||0);const e=Math.floor(t/1e3),a=String(Math.floor(e/3600)).padStart(2,"0"),n=String(Math.floor(e%3600/60)).padStart(2,"0"),o=String(e%60).padStart(2,"0");return`${a}:${n}:${o}`}function Se(t){const e=String((t==null?void 0:t.conversionId)||"").trim(),a=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();return`${e}|${a}`}const za=new Map;let Wt=null;function Oi(t,e,a){za.set(String(t||"").toUpperCase(),{enter:e,exit:a})}function Rt(t){const e=String(t||"").toUpperCase();if(Wt!=null&&Wt.exit)try{Wt.exit()}catch{}const a=za.get(e);if(a!=null&&a.enter)try{a.enter()}catch{}Wt=a||null}Rt.register=Oi;const xt="/api/uploader/proxy";function ct(){const t=new Date,e=t.getFullYear(),a=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${e}-${a}-${n}`}function Gt(t){const e=["B","KB","MB","GB"];let a=0,n=Number(t||0);for(;n>=1024&&a<e.length-1;)n/=1024,a++;return`${n.toFixed(a===0?0:1)} ${e[a]}`}async function ne(t,e=xt){const n=await fetch(e||xt,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}),o=await n.text().catch(()=>"");if(!n.ok)throw new Error(`HTTP ${n.status} ${n.statusText} ${o||""}`.trim());try{return JSON.parse(o)}catch{throw new Error(`Respuesta no-JSON desde backend: ${o.slice(0,300)}`)}}async function _e(t){if(!t)return"";if(!/^image\//i.test(t.type||""))return await new Promise((a,n)=>{const o=new FileReader;o.onload=()=>a(String(o.result).split(",")[1]||""),o.onerror=n,o.readAsDataURL(t)});const e=URL.createObjectURL(t);try{const a=await new Promise((d,p)=>{const b=new Image;b.onload=()=>d(b),b.onerror=p,b.src=e}),n=1280,o=.75;let i=a.naturalWidth||a.width,s=a.naturalHeight||a.height;if(i>n){const d=n/i;i=Math.round(i*d),s=Math.round(s*d)}const r=document.createElement("canvas");return r.width=i,r.height=s,r.getContext("2d").drawImage(a,0,0,i,s),r.toDataURL("image/jpeg",o).split(",")[1]||""}finally{URL.revokeObjectURL(e)}}async function xi({vin:t,dateStr:e,apsUrl:a=xt}){return ne({action:"getStatus",vin:t,dateStr:e},a)}async function ki({vin:t,dateStr:e,slot:a,file:n,apsUrl:o=xt}){const i=await _e(n);return ne({action:"uploadOne",vin:t,dateStr:e,slot:a,mimeType:"image/jpeg",b64:i},o)}async function Di({vin:t,dateStr:e,note:a,files:n=[],onProgress:o,apsUrl:i=xt}){const s=[];for(let r=0;r<n.length;r++){typeof o=="function"&&o({phase:"prepare",index:r+1,total:n.length});const c=await _e(n[r]);s.push({slot:"falla",mimeType:"image/jpeg",b64:c})}return typeof o=="function"&&o({phase:"upload",total:s.length}),ne({action:"uploadFalla",vin:t,dateStr:e,note:a,files:s},i)}async function Ui({vin:t,dateStr:e,items:a=[],onProgress:n,apsUrl:o=xt}){const i=[];for(let s=0;s<a.length;s++){const r=a[s];if(!(r!=null&&r.file)||!(r!=null&&r.slot))continue;typeof n=="function"&&n({phase:"prepare",slot:r.slot,index:s+1,total:a.length});const c=await _e(r.file);i.push({slot:r.slot,mimeType:"image/jpeg",b64:c})}return typeof n=="function"&&n({phase:"upload",total:i.length}),ne({action:"uploadCalidad",vin:t,dateStr:e,files:i},o)}async function $i({tipo:t,vin:e,dateStr:a,tecnico:n,checklist:o,file:i,onProgress:s,apsUrl:r=xt}){typeof s=="function"&&s({phase:"prepare"});const c=await _e(i);return typeof s=="function"&&s({phase:"upload"}),ne({action:"uploadConformidad",tipo:t,vin:e,dateStr:a,tecnico:n,checklist:o,file:{mimeType:"image/jpeg",b64:c}},r)}function Fi(t){return String(t||"").replace(/\s+/g,"").trim().toUpperCase()}function Bi(t){const e=t==="BAR";return{fps:e?8:10,qrbox:e?{width:160,height:320}:{width:250,height:250},formatsToSupport:e?[Html5QrcodeSupportedFormats.CODE_128,Html5QrcodeSupportedFormats.CODE_39,Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.UPC_E,Html5QrcodeSupportedFormats.ITF,Html5QrcodeSupportedFormats.CODABAR]:[Html5QrcodeSupportedFormats.QR_CODE],experimentalFeatures:{useBarCodeDetectorIfSupported:!0}}}async function wi(t,e,a){var s;try{await t.start({facingMode:{exact:"environment"}},e,a,()=>{});return}catch{}try{await t.start({facingMode:"environment"},e,a,()=>{});return}catch{}const n=await Html5Qrcode.getCameras();let o=((s=n==null?void 0:n[0])==null?void 0:s.id)||null;const i=n==null?void 0:n.find(r=>/back|rear|environment/i.test(r.label||""));i!=null&&i.id&&(o=i.id),await t.start(o??{facingMode:"environment"},e,a,()=>{})}async function qi(t){try{t&&t.isScanning&&await t.stop()}catch{}}function qt(t){let e=null;function a(){if(!window.Html5Qrcode)throw new Error("No se pudo cargar la librería Html5Qrcode.");return e||(e=new Html5Qrcode(t)),e}async function n({mode:r="QR",onDecoded:c,config:l,msgEl:d}={}){try{const p=a(),b=l||Bi(r);await wi(p,b,async m=>{const _=Fi(m);_&&await(c==null?void 0:c(_))})}catch(p){throw d&&(d.textContent="No se pudo abrir la cámara. Revisa permisos (HTTPS o localhost)."),p}}async function o(){await qi(e)}function i(){return e}function s(){return!!(e&&e.isScanning)}return{start:n,stop:o,getInstance:i,isActive:s}}function Ka(t,e={}){const a=t.querySelector(".uploader-shell")||t,n=f=>a.querySelector(`#up_${f}`);let o=[null,null,null,null],i=[],s=[null,null,null,null],r=null;const c=qt("up_qrReader_params"),l=qt("up_qrReader_falla"),d=qt("up_qrReader_qc"),p=qt("up_qrReader_conf"),b={vin:"Foto del VIN",comp_1:"Compresión",comp_2:"Compresión",comp_3:"Compresión",comp_4:"Compresión",corr_pre:"Corriente antes",corr_post:"Corriente después",voltaje:"Voltaje",scan_carro:"Scan del carro"},y={menu:n("screenMenu"),params:n("screenParams"),falla:n("screenFalla"),calidad:n("screenCalidad"),conformidad:n("screenConformidad")};function m(f,v){const h=n(f);h&&(h.textContent=String(v||""))}function _(f){try{return new URLSearchParams(window.location.search).get(f)||""}catch{return""}}function L(f){Object.values(y).forEach(h=>h&&h.classList.remove("active"));const v=y[f];v&&v.classList.add("active"),xe().catch(()=>{})}function j(){if(typeof e.onBackControl=="function"){e.onBackControl();return}L("menu")}function at(f){const v=n("imgModal"),h=n("imgModalImg");!v||!h||!f||(h.src=f,v.classList.add("open"),v.setAttribute("aria-hidden","false"))}function ut(){const f=n("imgModal"),v=n("imgModalImg");!f||!v||(f.classList.remove("open"),v.src="",f.setAttribute("aria-hidden","true"))}function R(f,v){const h=n(`${f}_previewBox`),I=n(`${f}_meta`);if(!h||!I)return;if(!v){h.innerHTML='<span class="small">Sin foto</span>',I.textContent="Ningún archivo seleccionado.";return}I.textContent=`${v.name||"(foto)"} • ${Gt(v.size||0)}`;const A=URL.createObjectURL(v);h.innerHTML=`<img alt="preview" src="${A}">`,setTimeout(()=>URL.revokeObjectURL(A),15e3)}function x(f,v){const h=n(`${f}_previewBox`),I=n(`${f}_meta`);if(!h||!I||!v)return;const A=v.thumbUrl||"",E=v.imgUrl||"";I.textContent="📡 Ya existe en Drive (preview).";const M=document.createElement("img");M.alt="drive preview",M.loading="lazy",M.referrerPolicy="no-referrer",M.style.width="100%",M.style.height="100%",M.style.objectFit="cover",M.style.display="block",M.src=A||E,M.onerror=()=>{E&&M.src!==E?M.src=E:h.innerHTML='<span class="small">No se pudo cargar preview</span>'},h.innerHTML="",h.appendChild(M)}function q(f,v){const h=n(`comp_p${f}`);if(!h||!v)return;const I=v.thumbUrl||"",A=v.imgUrl||"",E=document.createElement("img");E.alt="drive preview",E.loading="lazy",E.referrerPolicy="no-referrer",E.style.width="100%",E.style.height="100%",E.style.objectFit="cover",E.style.display="block",E.src=I||A,E.onerror=()=>{A&&E.src!==A?E.src=A:h.innerHTML=`<span class="small">${f}</span>`},h.innerHTML="",h.appendChild(E)}function W(f){let v="";v+=`VIN: ${f.vin||"-"}
`,v+=`Fecha: ${f.dateStr||"-"}
`,v+=`Carpeta: ${f.monthFolderName||"-"} / ${f.carFolderName||"-"} / REGISTRO

`;const I=["comp_1","comp_2","comp_3","comp_4"].filter(nt=>f.status&&f.status[nt]).length,A=4-I;v+=`${I===4?"✅":"❌"} Compresión (${I}/4)
`,A>0&&(v+=`   Faltan: ${A} foto(s)
`);const E=["vin","corr_pre","corr_post","voltaje","scan_carro"],M=[];for(const nt of E){const z=f.status&&f.status[nt],rt=f.previews&&f.previews[nt];v+=`${z?"✅":"❌"} ${b[nt]}`,rt&&rt.url&&(v+=`  (ver: ${rt.url})`),v+=`
`,z||M.push(b[nt])}const N=A+M.length;v+=`
Faltantes (${N}/9):
- ${N?[`Compresión (${I}/4)`,...M].join(`
- `):"Ninguno 🎉"}`,m("out",v)}async function D(){var h,I;const f=(((h=n("vinText"))==null?void 0:h.value)||"").trim(),v=((I=n("dateStr"))==null?void 0:I.value)||ct();if(!f){m("out","❌ Falta VIN (texto).");return}try{const A=await xi({vin:f,dateStr:v,apsUrl:e.apsUrl});if(!A.ok){m("out","❌ getStatus: "+(A.error||"Error"));return}W(A),A.previews&&(["vin","corr_pre","corr_post","voltaje","scan_carro"].forEach(E=>{const M=A.previews[E];M&&x(E,M)}),["comp_1","comp_2","comp_3","comp_4"].forEach((E,M)=>{const N=A.previews[E];N&&q(M+1,N)}))}catch(A){m("out",`❌ Error getStatus: ${A}`)}}async function w(f,v,h="out",I="",A=""){var N,nt;const E=String(I||((N=n("vinText"))==null?void 0:N.value)||"").trim(),M=String(A||((nt=n("dateStr"))==null?void 0:nt.value)||ct());if(!E)return m(h,"❌ Falta VIN."),{ok:!1,error:"Falta VIN"};try{m(h,`Preparando ${f}...
`);const z=await ki({vin:E,dateStr:M,slot:f,file:v,apsUrl:e.apsUrl});if(!z.ok)return m(h,`❌ uploadOne(${f}): ${z.error}`),z;if(z.preview)if(f.startsWith("comp_")){const rt=Number(f.split("_")[1]||"0");rt>=1&&rt<=4&&q(rt,z.preview)}else x(f,z.preview);return m(h,`✅ Guardado: ${f}
`),z}catch(z){return m(h,`❌ Error ${f}: ${z}`),{ok:!1,error:String(z)}}}function vt(){o=[null,null,null,null],["comp_p1","comp_p2","comp_p3","comp_p4"].forEach((h,I)=>{const A=n(h);A&&(A.innerHTML=`<span class="small">${I+1}</span>`)}),m("comp_meta","Ningún archivo seleccionado.");const f=n("comp_cam"),v=n("comp_file");f&&(f.value=""),v&&(v.value="")}function oe(){["comp_p1","comp_p2","comp_p3","comp_p4"].forEach((I,A)=>{const E=n(I),M=o[A];if(!E)return;if(!M){E.innerHTML=`<span class="small">${A+1}</span>`;return}const N=URL.createObjectURL(M);E.innerHTML=`<img alt="preview" src="${N}">`,setTimeout(()=>URL.revokeObjectURL(N),15e3)});const v=o.filter(Boolean),h=v.reduce((I,A)=>I+(A.size||0),0);m("comp_meta",v.length?`${v.length}/4 seleccionadas • ${Gt(h)}`:"Ningún archivo seleccionado.")}async function vn(f){if(!f)return;let v=o.findIndex(I=>!I);v===-1&&(v=3),o[v]=f,oe();const h=`comp_${v+1}`;await w(h,f,"out");try{await D()}catch{}}async function $o(f){const v=(f==null?void 0:f[0])||null;if(!v)return;await vn(v);const h=n("comp_cam");h&&(h.value="")}async function Fo(f){const v=Array.from(f||[]);if(!v.length)return;const h=v.slice(-4);for(const A of h)await vn(A);const I=n("comp_file");I&&(I.value="")}function Kt(){const f=n("fallaGrid");if(!f)return;f.innerHTML="",i.forEach((h,I)=>{const A=URL.createObjectURL(h),E=document.createElement("div");E.style.position="relative";const M=document.createElement("div");M.className="thumb",M.innerHTML=`<img alt="falla" src="${A}">`,E.appendChild(M);const N=document.createElement("button");N.type="button",N.textContent="✖",N.className="btn3",N.style.position="absolute",N.style.top="6px",N.style.right="6px",N.style.padding="4px 8px",N.style.borderRadius="10px",N.onclick=()=>{i.splice(I,1),Kt()},E.appendChild(N),f.appendChild(E),setTimeout(()=>URL.revokeObjectURL(A),15e3)});const v=i.reduce((h,I)=>h+(I.size||0),0);m("fallaFotosMeta",`${i.length} archivo(s) • ${Gt(v)}`)}function gn(f){const v=Array.from(f||[]);v.length&&(i.push(...v),Kt())}function Oe(){s=[null,null,null,null],["qc_p1","qc_p2","qc_p3","qc_p4"].forEach((h,I)=>{const A=n(h);A&&(A.innerHTML=`<span class="small">${I+1}</span>`)}),m("qc_meta","0/4 seleccionadas.");const f=n("qc_cam"),v=n("qc_file");f&&(f.value=""),v&&(v.value="")}function Bo(){["qc_p1","qc_p2","qc_p3","qc_p4"].forEach((I,A)=>{const E=n(I),M=s[A];if(!E)return;if(!M){E.innerHTML=`<span class="small">${A+1}</span>`;return}const N=URL.createObjectURL(M);E.innerHTML=`<img alt="qc" src="${N}">`,setTimeout(()=>URL.revokeObjectURL(N),15e3)});const v=s.filter(Boolean),h=v.reduce((I,A)=>I+(A.size||0),0);m("qc_meta",`${v.length}/4 seleccionadas • ${Gt(h)} (mín 3)`)}async function bn(f){var M,N;if(!f)return;s[0]=s[1],s[1]=s[2],s[2]=s[3],s[3]=f,Bo();const I=`calidad_${s.filter(Boolean).length}`,A=(((M=n("qcVin"))==null?void 0:M.value)||"").trim(),E=((N=n("qcDate"))==null?void 0:N.value)||ct();await w(I,f,"outQc",A,E)}async function wo(f){const v=(f==null?void 0:f[0])||null;if(!v)return;await bn(v);const h=n("qc_cam");h&&(h.value="")}async function qo(f){const v=Array.from(f||[]);if(!v.length)return;const h=v.slice(-4);for(const A of h)await bn(A);const I=n("qc_file");I&&(I.value="")}function Bt(){const f=n("conf_previewBox"),v=n("conf_meta");if(!f||!v)return;if(!r){f.innerHTML='<span class="small">Sin foto</span>',v.textContent="Ningún archivo seleccionado.";return}v.textContent=`${r.name||"(foto)"} • ${Gt(r.size||0)}`;const h=URL.createObjectURL(r);f.innerHTML=`<img alt="equipo" src="${h}">`,setTimeout(()=>URL.revokeObjectURL(h),15e3)}function yn(f){var h,I;n("confTipo")&&(n("confTipo").value=f),n("confTitle")&&(n("confTitle").textContent=`Conformidad equipo (${f})`);const v=(((h=n("vinText"))==null?void 0:h.value)||"").trim();v&&n("confVin")&&(n("confVin").value=v),n("confDate")&&(n("confDate").value=((I=n("dateStr"))==null?void 0:I.value)||ct()),n("chk1")&&(n("chk1").checked=!1),n("chk2")&&(n("chk2").checked=!1),n("chk3")&&(n("chk3").checked=!1),r=null,Bt(),L("conformidad")}const hn={params:{scanner:c,box:"qrBox_params",stop:"btnStop_params",msg:"scanMsg_params",mode:"scanMode_params",setVin:f=>{n("vinText")&&(n("vinText").value=f),D().catch(()=>{})}},falla:{scanner:l,box:"qrBox_falla",stop:"btnStop_falla",msg:"scanMsg_falla",mode:"scanMode_falla",setVin:f=>{n("fallaVin")&&(n("fallaVin").value=f)}},qc:{scanner:d,box:"qrBox_qc",stop:"btnStop_qc",msg:"scanMsg_qc",mode:"scanMode_qc",setVin:f=>{n("qcVin")&&(n("qcVin").value=f)}},conf:{scanner:p,box:"qrBox_conf",stop:"btnStop_conf",msg:"scanMsg_conf",mode:"scanMode_conf",setVin:f=>{n("confVin")&&(n("confVin").value=f)}}};async function st(f){const v=hn[f];if(!v)return;await v.scanner.stop();const h=n(v.box),I=n(v.stop),A=n(v.mode);h&&(h.style.display="none"),I&&(I.style.display="none"),A&&(A.textContent="")}async function xe(){await st("params"),await st("falla"),await st("qc"),await st("conf")}async function gt(f,v){await st(f);const h=hn[f];if(!h)return;const I=n(h.box),A=n(h.stop),E=n(h.msg),M=n(h.mode);I&&(I.style.display="block"),A&&(A.style.display="inline-block"),E&&(E.textContent=""),M&&(M.textContent=v==="QR"?"Modo: SOLO QR":"Modo: SOLO BARRAS (CODE_128 y otros)");try{await h.scanner.start({mode:v,msgEl:n(h.msg),onDecoded:N=>{h.setVin(N),n(h.msg)&&(n(h.msg).textContent=`Detectado (${v==="QR"?"QR":"BARRAS"}): ${N}`),st(f).catch(()=>{})}})}catch(N){n(h.msg)&&(n(h.msg).textContent=`Error cámara (${v}): ${N}`)}}function Vo(){const f=(_("vin")||_("VIN")||"").trim();f&&(n("vinText")&&(n("vinText").value=f),n("fallaVin")&&(n("fallaVin").value=f),n("qcVin")&&(n("qcVin").value=f),n("confVin")&&(n("confVin").value=f));const v=(_("date")||_("fecha")||"").trim();v&&(n("dateStr")&&(n("dateStr").value=v),n("fallaDate")&&(n("fallaDate").value=v),n("qcDate")&&(n("qcDate").value=v),n("confDate")&&(n("confDate").value=v));const h=(_("pantalla")||_("screen")||"").toLowerCase();h==="params"&&L("params"),h==="falla"&&L("falla"),(h==="calidad"||h==="qc")&&L("calidad"),(h==="conformidad"||h==="conf")&&L("conformidad"),f&&D().catch(()=>{})}function Qo(){const f=ct();n("dateStr")&&!n("dateStr").value&&(n("dateStr").value=f),n("fallaDate")&&!n("fallaDate").value&&(n("fallaDate").value=f),n("qcDate")&&!n("qcDate").value&&(n("qcDate").value=f),n("confDate")&&!n("confDate").value&&(n("confDate").value=f)}function Po(){var v,h,I,A,E,M,N,nt,z,rt,Cn,In,An,Sn,_n,Rn,En,Ln,Mn,Tn,Nn,On,xn,kn,Dn,Un,$n,Fn,Bn,wn,qn,Vn,Qn,Pn,jn,Hn,zn,Kn,Wn,Gn,Yn,Jn,Zn,Xn;(v=n("goParams"))==null||v.addEventListener("click",()=>L("params")),(h=n("goFalla"))==null||h.addEventListener("click",()=>{var O,k;const C=(((O=n("vinText"))==null?void 0:O.value)||"").trim();C&&n("fallaVin")&&(n("fallaVin").value=C),n("fallaDate")&&(n("fallaDate").value=((k=n("dateStr"))==null?void 0:k.value)||ct()),L("falla")}),(I=n("goCalidad"))==null||I.addEventListener("click",()=>{var O,k;const C=(((O=n("vinText"))==null?void 0:O.value)||"").trim();C&&n("qcVin")&&(n("qcVin").value=C),n("qcDate")&&(n("qcDate").value=((k=n("dateStr"))==null?void 0:k.value)||ct()),L("calidad")}),(A=n("goConfTanque"))==null||A.addEventListener("click",()=>yn("TANQUE")),(E=n("goConfReductor"))==null||E.addEventListener("click",()=>yn("REDUCTOR")),(M=n("btnBackControl"))==null||M.addEventListener("click",j),(N=n("imgModalClose"))==null||N.addEventListener("click",ut),(nt=n("imgModal"))==null||nt.addEventListener("click",C=>{C.target===n("imgModal")&&ut()}),document.addEventListener("keydown",C=>{C.key==="Escape"&&ut()}),a.addEventListener("click",C=>{var k,Q;const O=(Q=(k=C.target)==null?void 0:k.closest)==null?void 0:Q.call(k,".thumb img");O&&at(O.currentSrc||O.src)}),a.addEventListener("click",C=>{const O=C.target.closest("button");if(!O)return;O.getAttribute("data-nav")==="menu"&&L("menu")}),(z=n("btnRefresh"))==null||z.addEventListener("click",D),(rt=n("vinText"))==null||rt.addEventListener("change",D),(Cn=n("dateStr"))==null||Cn.addEventListener("change",D),(In=n("btnUpload"))==null||In.addEventListener("click",async()=>{m("out","📡 Refrescando estado..."),await D()}),a.addEventListener("click",C=>{var Q,G,Y,$;const O=C.target.closest("button");if(!O)return;const k=O.getAttribute("data-slot");if(k&&(O.getAttribute("data-pick")==="cam"&&(k==="comp"?(Q=n("comp_cam"))==null||Q.click():(G=n(`${k}_cam`))==null||G.click()),O.getAttribute("data-pick")==="file"&&(k==="comp"?(Y=n("comp_file"))==null||Y.click():($=n(`${k}_file`))==null||$.click()),O.getAttribute("data-clear")==="1"))if(k==="comp")vt();else{R(k,null);const B=n(`${k}_cam`),bt=n(`${k}_file`);B&&(B.value=""),bt&&(bt.value="")}}),["vin","corr_pre","corr_post","voltaje","scan_carro"].forEach(C=>{const O=n(`${C}_cam`),k=n(`${C}_file`),Q=async G=>{var B,bt;const Y=(bt=(B=G.target)==null?void 0:B.files)==null?void 0:bt[0];if(!Y)return;R(C,Y);const $=await w(C,Y,"out");if($&&$.ok){O&&(O.value=""),k&&(k.value="");try{await D()}catch{}}};O&&O.addEventListener("change",Q),k&&k.addEventListener("change",Q),R(C,null)}),(An=n("comp_cam"))==null||An.addEventListener("change",C=>$o(C.target.files)),(Sn=n("comp_file"))==null||Sn.addEventListener("change",C=>Fo(C.target.files)),vt(),(_n=n("btnScanQR_params"))==null||_n.addEventListener("click",()=>gt("params","QR")),(Rn=n("btnScanBAR_params"))==null||Rn.addEventListener("click",()=>gt("params","BAR")),(En=n("btnStop_params"))==null||En.addEventListener("click",()=>st("params")),(Ln=n("btnScanQR_falla"))==null||Ln.addEventListener("click",()=>gt("falla","QR")),(Mn=n("btnScanBAR_falla"))==null||Mn.addEventListener("click",()=>gt("falla","BAR")),(Tn=n("btnStop_falla"))==null||Tn.addEventListener("click",()=>st("falla")),(Nn=n("btnScanQR_qc"))==null||Nn.addEventListener("click",()=>gt("qc","QR")),(On=n("btnScanBAR_qc"))==null||On.addEventListener("click",()=>gt("qc","BAR")),(xn=n("btnStop_qc"))==null||xn.addEventListener("click",()=>st("qc")),(kn=n("btnScanQR_conf"))==null||kn.addEventListener("click",()=>gt("conf","QR")),(Dn=n("btnScanBAR_conf"))==null||Dn.addEventListener("click",()=>gt("conf","BAR")),(Un=n("btnStop_conf"))==null||Un.addEventListener("click",()=>st("conf")),($n=n("btnFallaCam"))==null||$n.addEventListener("click",()=>{var C;return(C=n("falla_cam"))==null?void 0:C.click()}),(Fn=n("btnFallaFile"))==null||Fn.addEventListener("click",()=>{var C;return(C=n("falla_file"))==null?void 0:C.click()}),(Bn=n("btnFallaClear"))==null||Bn.addEventListener("click",()=>{i=[],Kt()}),(wn=n("falla_cam"))==null||wn.addEventListener("change",C=>{gn(C.target.files),C.target.value=""}),(qn=n("falla_file"))==null||qn.addEventListener("change",C=>{gn(C.target.files),C.target.value=""}),(Vn=n("btnEnviarFalla"))==null||Vn.addEventListener("click",async()=>{var Q,G,Y;const C=(((Q=n("fallaVin"))==null?void 0:Q.value)||"").trim(),O=((G=n("fallaDate"))==null?void 0:G.value)||ct(),k=(((Y=n("fallaNota"))==null?void 0:Y.value)||"").trim();if(!C){m("outFalla","❌ Falta VIN.");return}if(!k&&i.length===0){m("outFalla","⚠️ Agrega una nota o al menos una foto.");return}try{const $=await Di({vin:C,dateStr:O,note:k,files:i,apsUrl:e.apsUrl,onProgress:B=>{B.phase==="prepare"?m("outFalla",`Preparando foto ${B.index}/${B.total}...
`):B.phase==="upload"&&m("outFalla",`Subiendo FALLA (${B.total} foto(s) + nota)...
`)}});if(!$.ok){m("outFalla","❌ uploadFalla: "+($.error||"Error"));return}m("outFalla",`✅ Falla registrada.
Carpeta: ${$.carFolderName}/FALLAS
Batch: ${$.batchId}
Guardados: ${$.savedCount}`),i=[],Kt()}catch($){m("outFalla",`❌ Error FALLA: ${$}`)}}),Kt(),(Qn=n("btnQcCam"))==null||Qn.addEventListener("click",()=>{var C;return(C=n("qc_cam"))==null?void 0:C.click()}),(Pn=n("btnQcFile"))==null||Pn.addEventListener("click",()=>{var C;return(C=n("qc_file"))==null?void 0:C.click()}),(jn=n("btnQcClear"))==null||jn.addEventListener("click",Oe),(Hn=n("qc_cam"))==null||Hn.addEventListener("change",C=>wo(C.target.files)),(zn=n("qc_file"))==null||zn.addEventListener("change",C=>qo(C.target.files)),Oe(),(Kn=n("btnQcUpload"))==null||Kn.addEventListener("click",async()=>{var G,Y;const C=(((G=n("qcVin"))==null?void 0:G.value)||"").trim(),O=((Y=n("qcDate"))==null?void 0:Y.value)||ct();if(!C){m("outQc","❌ Falta VIN.");return}if(s.filter(Boolean).length<3){m("outQc","⚠️ Debes subir mínimo 3 fotos de calidad.");return}const Q=[];for(let $=0;$<4;$++){const B=s[$];B&&Q.push({slot:`calidad_${$+1}`,file:B})}try{const $=await Ui({vin:C,dateStr:O,items:Q,apsUrl:e.apsUrl,onProgress:B=>{B.phase==="prepare"?m("outQc",`Preparando ${B.slot}...
`):B.phase==="upload"&&m("outQc",`Enviando CALIDAD (${B.total} foto(s))...
`)}});if(!$.ok){m("outQc","❌ uploadCalidad: "+($.error||"Error"));return}m("outQc",`✅ Calidad registrada.
Carpeta: ${$.carFolderName}/CALIDAD
Guardados: ${Array.isArray($.saved)?$.saved.length:Q.length}`),Oe()}catch($){m("outQc",`❌ Error CALIDAD: ${$}`)}}),(Wn=n("btnConfCam"))==null||Wn.addEventListener("click",()=>{var C;return(C=n("conf_cam"))==null?void 0:C.click()}),(Gn=n("btnConfFile"))==null||Gn.addEventListener("click",()=>{var C;return(C=n("conf_file"))==null?void 0:C.click()}),(Yn=n("btnConfClear"))==null||Yn.addEventListener("click",()=>{r=null,Bt()}),(Jn=n("conf_cam"))==null||Jn.addEventListener("change",C=>{var O;r=((O=C.target.files)==null?void 0:O[0])||null,Bt(),C.target.value=""}),(Zn=n("conf_file"))==null||Zn.addEventListener("change",C=>{var O;r=((O=C.target.files)==null?void 0:O[0])||null,Bt(),C.target.value=""}),(Xn=n("btnEnviarConf"))==null||Xn.addEventListener("click",async()=>{var Y,$,B,bt,ta,ea,na;const C=(((Y=n("confTipo"))==null?void 0:Y.value)||"").trim(),O=((($=n("confVin"))==null?void 0:$.value)||"").trim(),k=((B=n("confDate"))==null?void 0:B.value)||ct(),Q=(((bt=n("confTecnico"))==null?void 0:bt.value)||"").trim(),G={revisadoConTiempo:!!((ta=n("chk1"))!=null&&ta.checked),responsablePerdida:!!((ea=n("chk2"))!=null&&ea.checked),todoConforme:!!((na=n("chk3"))!=null&&na.checked)};if(!O){m("outConf","❌ Falta VIN.");return}if(!Q){m("outConf","❌ Falta nombre del técnico.");return}if(!r){m("outConf","❌ Falta foto del equipo.");return}if(!G.revisadoConTiempo||!G.responsablePerdida||!G.todoConforme){m("outConf","⚠️ Debes marcar los 3 checks de conformidad.");return}try{const pt=await $i({tipo:C,vin:O,dateStr:k,tecnico:Q,checklist:G,file:r,apsUrl:e.apsUrl,onProgress:aa=>{aa.phase==="prepare"&&m("outConf",`Preparando foto...
`),aa.phase==="upload"&&m("outConf",`Enviando conformidad...
`)}});if(!pt.ok){m("outConf","❌ uploadConformidad: "+(pt.error||"Error"));return}m("outConf",`✅ Conformidad registrada.
Tipo: ${C}
Carpeta: ${pt.carFolderName}/${pt.mainFolderName}/${pt.subFolderName}
Acta: ${pt.actaName}
Foto: ${pt.photoName}`),r=null,Bt()}catch(pt){m("outConf",`❌ Error CONFORMIDAD: ${pt}`)}}),Bt()}function jo(f={}){var A;const v=String(f.vin||"").trim(),h=String(f.dateStr||"").trim(),I=String(f.screen||"").trim().toLowerCase();v&&(n("vinText")&&(n("vinText").value=v),n("fallaVin")&&(n("fallaVin").value=v),n("qcVin")&&(n("qcVin").value=v),n("confVin")&&(n("confVin").value=v)),h&&(n("dateStr")&&(n("dateStr").value=h),n("fallaDate")&&(n("fallaDate").value=h),n("qcDate")&&(n("qcDate").value=h),n("confDate")&&(n("confDate").value=h)),t&&(t.style.display="block"),L(I==="params"?"params":I==="falla"?"falla":I==="calidad"||I==="qc"?"calidad":I==="conformidad"||I==="conf"?"conformidad":"menu"),(((A=n("vinText"))==null?void 0:A.value)||"").trim()&&D().catch(()=>{})}function Ho(){xe().catch(()=>{}),t&&(t.style.display="none")}return Qo(),Po(),Vo(),L("menu"),{show:jo,hide:Ho,refreshStatus:D,showScreen:L,stopAllScanners:xe}}let Fe=!1,Mt=null;const Xt=new Map,Re=t=>document.getElementById(t);function Wa(t={}){if(Fe)return Mt;const e=Re("viewUploader");return e?(Mt=Ka(e,{apsUrl:t.apsUrl,onBackControl:()=>{var o;Ft(),$t();const a=String(((o=u==null?void 0:u.state)==null?void 0:o.currentModule)||"").trim().toUpperCase();if(a){const i=document.getElementById(`view${a}`);if(i){i.style.display="block";return}}const n=document.getElementById("viewHub");n&&(n.style.display="block")}}),Fe=!0,Mt):(console.warn("[Uploader] No existe #viewUploader en el HTML"),null)}function Vi(t,e={}){var r;const a=document.getElementById(t);if(!a)return console.warn("[Uploader] mountId no existe:",t),null;const n=Xt.get(t),o=!!a.querySelector(".uploader-shell");if(n&&o)return n;if(n){try{(r=n.stopAllScanners)==null||r.call(n)}catch{}Xt.delete(t)}const i=Re("viewUploader");if(!i)return console.warn("[Uploader] No existe #viewUploader para clonar template"),null;a.innerHTML=i.innerHTML;const s=Ka(a,{apsUrl:e.apsUrl,onBackControl:e.onBackControl||(()=>{try{s.showScreen("menu")}catch{}})});return Xt.set(t,s),s}function Xe({vin:t="",screen:e="menu",dateStr:a="",mountId:n="",inModal:o=!1,onBackControl:i=null,apsUrl:s=null}={}){if(n){const r=Vi(n,{apsUrl:s,onBackControl:i});r&&r.show({vin:t,screen:e,dateStr:a});return}if(Fe||Wa({apsUrl:s}),!o){const r=document.getElementById("viewApp");r&&(r.style.display="block");const c=document.getElementById("viewHub");c&&(c.style.display="none")}if(Mt)Mt.show({vin:t,screen:e,dateStr:a});else{const r=Re("viewUploader");r&&(r.style.display="block")}}function Ft({mountId:t=""}={}){var a;if(t){const n=document.getElementById(t),o=Xt.get(t);try{(a=o==null?void 0:o.stopAllScanners)==null||a.call(o)}catch{}n&&(n.innerHTML=""),Xt.delete(t);return}Mt&&Mt.hide();const e=Re("viewUploader");e&&(e.style.display="none")}function Qi(t){return String((t==null?void 0:t.estado)||"").toUpperCase()==="FINALIZADO"}function Pi(t){const e=String(t||"").toUpperCase();return e==="SIN_INICIAR"?["INICIO","NOTA"]:e==="TRABAJANDO"?["PAUSA","FIN","NOTA"]:e==="PAUSADO"?["REANUDAR","FIN","NOTA"]:e==="FINALIZADO"?["NOTA"]:["INICIO","NOTA"]}function ji(t){const e=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();return u.state.currentModule==="CALIDAD"?e==="CALIDAD":u.state.currentModule==="RAMALERO"?e==="RAMALERO":e==="MOTOR"||e==="TANQUE"}function kt(t,e=Date.now()){const a=Number(t.tiempo_ms||0),n=t.running_since?Date.parse(t.running_since):NaN;return!isNaN(n)&&String(t.estado).toUpperCase()==="TRABAJANDO"?a+Math.max(0,e-n):a}function Ga(t){const e=String(t||"").toUpperCase();return e==="SIN_INICIAR"?'<div class="jobActionsGrid"><button class="btnInicio" data-act="INICIO">INICIO</button></div>':e==="TRABAJANDO"?`<div class="jobActionsGrid">
      <button class="btnPausa" data-act="PAUSA">PAUSA</button>
      <button class="btnFin" data-act="FIN">FIN</button>
    </div>`:e==="PAUSADO"?`<div class="jobActionsGrid">
      <button class="btnReanudar" data-act="REANUDAR">REANUDAR</button>
      <button class="btnFin" data-act="FIN">FIN</button>
    </div>`:'<div class="jobActionsGrid"><button class="btnInicio" data-act="NOTA">GUARDAR NOTA</button></div>'}function Hi(t){const e=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();if(e!=="MOTOR"&&e!=="TANQUE")return"";const a=String((t==null?void 0:t.tanque_asignado)||"").trim(),n=String((t==null?void 0:t.reductor_asignado)||"").trim(),o=String((t==null?void 0:t.tanque_registrado)||"").trim(),i=String((t==null?void 0:t.reductor_registrado)||"").trim(),s=e==="TANQUE",r=s?"TANQUE ASIGNADO:":"REDUCTOR ASIGNADO:",c=s?a:n,l=s?"TANQUE REGISTRADO:":"REDUCTOR REGISTRADO:",d=s?o:i,p=T(c||"NO ASIGNADO"),b=T(d||"—"),y=c?"":" na",m=d?"":" na";return`
    <div class="asignadoRow js-asignado" data-rol="${T(e)}">
      <span class="asignadoLabel">${T(r)}</span>
      <span class="asignadoValue${y}">${p}</span>
    </div>
    <div class="asignadoRow js-registrado" data-rol="${T(e)}" style="margin-top:6px;">
      <span class="asignadoLabel">${T(l)}</span>
      <span class="asignadoValue${m}">${b}</span>
    </div>
  `}function Ya(t,e=""){if(u.state.currentModule!=="CALIDAD")return"";const a=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),n=String((t==null?void 0:t.conversionId)||"").trim();return!a&&!n?"":(Number((t==null?void 0:t.inc_leve)||0),Number((t==null?void 0:t.inc_moderada)||0),Number((t==null?void 0:t.inc_critica)||0),`
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
  `)}function tn(){var e,a;const t=new Map;return(a=(e=U("activasBox"))==null?void 0:e.querySelectorAll(".jobCard[data-key]"))==null||a.forEach(n=>{const o=n.dataset.key||"",i=n.querySelector("textarea.notaCard");i&&t.set(o,String(i.value||""))}),t}function en(t){var e,a;t&&((a=(e=U("activasBox"))==null?void 0:e.querySelectorAll(".jobCard[data-key]"))==null||a.forEach(n=>{const o=n.dataset.key||"",i=n.querySelector("textarea.notaCard");i&&t.has(o)&&(i.value=t.get(o))}))}function zt(){const t=F(),e=[...t.itemsByKey.values()].filter(ji),a=[],n=[];e.sort((o,i)=>{const s=o.updated_at?Date.parse(o.updated_at):0;return(i.updated_at?Date.parse(i.updated_at):0)-s});for(const o of e){const i=`${String(o.conversionId||"").trim()}|${String(o.rolTrabajo||"").toUpperCase()}`;Qi(o)?n.push(i):a.push(i)}t.activeKeys=a,t.finalKeys=n}function Dt(){const t=F(),e=U("activasBox");if(!e)return;if(!t.activeKeys.length){e.innerHTML='<div class="small">No tienes trabajos activos.</div>';return}const a=Date.now();let n="";for(const o of t.activeKeys){const i=t.itemsByKey.get(o);if(!i)continue;const s=String(i.estado||"").toUpperCase(),r=T(i.rolTrabajo||""),c=T(i.vin||""),l=T(i.tipoRamal||""),d=Ot(kt(i,a)),p=T(Ha(i.created_at)),b=T(i.motorNombre||""),y=T(i.tanqueroNombre||""),m=u.state.currentModule==="RAMALERO"?`RAMAL: ${l||"-"}`:c||"<span class='small'>(sin VIN)</span>";n+=`
      <div class="jobCard card state-${s}" data-key="${T(o)}">
        <div class="jobTop">
          <div class="jobMeta">
            <div class="jobTitle">${m} <span>(${r})</span></div>
            <div class="jobSub">
              <span><b>Estado:</b> <span class="js-estado">${s}</span></span>
              <span class="small">Inicio: ${p}</span>
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
          ${Hi(i)}

          ${String((i==null?void 0:i.rolTrabajo)||"").toUpperCase()==="MOTOR"||String((i==null?void 0:i.rolTrabajo)||"").toUpperCase()==="TANQUE"?`<button class="btnRF" type="button" data-go="CONF" style="margin-bottom:10px;">
                  ✅ Registro de conformidad de equipo
                </button>`:""}

          ${Ya(i,o)}

          <div class="jobActionsSlot">${Ga(s)}</div>

          ${u.state.currentModule==="TECNICO"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>':u.state.currentModule==="CALIDAD"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar calidad / fallas</button>':""}

          <div class="jobNoteBlock">
            <textarea class="notaCard" rows="2" placeholder="Escribe una nota..."></textarea>
            <button class="btnNota" data-act="NOTA" style="margin-top:10px; width:100%; height:66px; font-weight:900; display:none;">
              Guardar nota
            </button>
          </div>
        </div>
      </div>
    `}e.innerHTML=n}function it(t=""){const e=F(),a=U("finalizadosWrap"),n=U("finalizadosBox");if(!a||!n)return;if(!e.showFinalizados){a.style.display="none",n.innerHTML="";return}if(a.style.display="block",!e.finalKeys.length){n.innerHTML=t+'<div class="small">No tienes finalizados.</div>';return}const o=Date.now();let i="";for(const s of e.finalKeys){const r=e.itemsByKey.get(s);if(!r)continue;const c=T(String(r.vin||"").toUpperCase()),l=T(String(r.rolTrabajo||"")),d=T(String(r.estado||"FINALIZADO").toUpperCase()),p=Ot(kt(r,o)),b=T(Ha(r.created_at)),y=T(r.motorNombre||""),m=T(r.tanqueroNombre||"");i+=`
      <div class="card" style="margin-top:10px;" data-key="${T(s)}">
        <div><b>${c}</b> <span class="small">(${l})</span></div>
        <div class="row space-between" style="margin-top:6px;">
          <div class="small"><b>Estado:</b> ${d}</div>
          <div class="pill" style="font-size:18px; font-weight:800;">⏱ ${p}</div>
        </div>
        <div class="small">Inicio: ${b}</div>
        ${u.state.currentModule==="CALIDAD"&&(y||m)?`
          <div class="small js-personal" style="margin-top:4px;">
            ${y?`🔧 MOTOR: <b>${y}</b>`:""}
            ${y&&m?" &nbsp;|&nbsp; ":""}
            ${m?`🛢️ TANQUERO: <b>${m}</b>`:""}
          </div>`:""}

        ${Ya(r,s)}

        ${u.state.currentModule==="TECNICO"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar fotos / fallas</button>':u.state.currentModule==="CALIDAD"?'<button class="btnRF" type="button" data-go="RF">📸 Registrar calidad / fallas</button>':""}
      </div>
    `}n.innerHTML=t+i}function ie(){const t=F(),e=U("activasBox");if(!e)return;const a=Date.now();for(const n of t.activeKeys){const o=t.itemsByKey.get(n);if(!o)continue;const i=e.querySelector(`.jobCard[data-key="${Ni(n)}"]`);if(!i)continue;const s=i.classList.contains("open"),r=String(o.estado||"").toUpperCase();i.className=`jobCard card state-${r}`+(s?" open":"");const c=i.querySelector(".js-estado");c&&(c.textContent=r);const l=i.querySelector(".js-tiempo");l&&(l.textContent=`⏱ ${Ot(kt(o,a))}`);try{const d=String(o.rolTrabajo||"").toUpperCase();if(d==="MOTOR"||d==="TANQUE"){const p=d==="TANQUE",b=p?String(o.tanque_asignado||"").trim():String(o.reductor_asignado||"").trim(),y=p?String(o.tanque_registrado||"").trim():String(o.reductor_registrado||"").trim(),m=i.querySelector(".js-asignado .asignadoValue"),_=i.querySelector(".js-registrado .asignadoValue");m&&(m.textContent=b||"LIBRE",m.classList.toggle("na",!b)),_&&(_.textContent=y||"—",_.classList.toggle("na",!y))}}catch{}try{if(u.state.currentModule==="CALIDAD"){const d=i.querySelector(".js-personal");if(d){const p=T(o.motorNombre||""),b=T(o.tanqueroNombre||"");d.innerHTML=[p?`🔧 MOTOR: <b>${p}</b>`:"",p&&b?"&nbsp;|&nbsp;":"",b?`🛢️ TANQUERO: <b>${b}</b>`:""].join("")}}}catch{}if(s){const d=i.querySelector(".jobActionsSlot");d&&(d.innerHTML=Ga(r))}}}const S={open:!1,itemKey:"",item:null,photo:null,techSelected:null,sugItems:[],sugOpen:!1,sugIdx:-1,sugTimer:null,lastQ:"",cache:{ts:0,items:[]}},zi=600*1e3;function Ja(){return H("incFotoPreview")}function Za(){return H("incFotoPreviewWrap")}function Be(){return H("incFotoCam")}function we(){return H("incFotoFile")}function te(){var n;S.photo=null;const t=Be();t&&(t.value="");const e=we();e&&(e.value="");const a=Ja();a&&(a.src=""),(n=Za())==null||n.classList.add("hidden")}function Ki(t){return new Promise((e,a)=>{const n=new FileReader;n.onload=()=>e(String(n.result||"")),n.onerror=a,n.readAsDataURL(t)})}function Wi(t){return new Promise((e,a)=>{const n=new Image;n.onload=()=>e(n),n.onerror=a,n.src=t})}async function Gi(t){const e=await Ki(t),a=await Wi(e),n=1600,o=1600;let{width:i,height:s}=a;const r=Math.min(n/i,o/s,1),c=Math.round(i*r),l=Math.round(s*r),d=document.createElement("canvas");d.width=c,d.height=l,d.getContext("2d").drawImage(a,0,0,c,l);const b=d.toDataURL("image/jpeg",.82),y=b.match(/^data:(.*?);base64,(.*)$/);if(!y)throw new Error("No se pudo procesar la imagen.");return{mimeType:"image/jpeg",b64:y[2],previewUrl:b,name:(t.name||"incidencia.jpg").replace(/\.[^.]+$/,"")+".jpg"}}async function ia(t){var e,a,n;try{const o=(a=(e=t.target)==null?void 0:e.files)==null?void 0:a[0];if(!o){te();return}if(!String(o.type||"").startsWith("image/")){P("Solo se permiten imágenes."),te();return}P("Procesando foto...");const i=await Gi(o);S.photo={b64:i.b64,mimeType:i.mimeType,name:i.name,previewUrl:i.previewUrl};const s=Ja();s&&(s.src=i.previewUrl),(n=Za())==null||n.classList.remove("hidden"),P("")}catch(o){console.error("[INC foto] ERROR:",o),P("❌ No se pudo procesar la foto."),te()}}function H(t){return document.getElementById(t)}function P(t){const e=H("incMsg");e&&(e.textContent=String(t||""))}function Xa(t){const e=H("incInfo");e&&(e.textContent=String(t||""))}function nn(){return H("incModal")}function to(){return H("btnIncSave")}function Tt(){return H("incTechInput")}function Ee(){return H("incTechSuggest")}function eo(){return H("incTech")}function Le(){return H("incTipo")}function an(){return H("incNota")}function no(){te(),S.itemKey="",S.item=null,S.techSelected=null;const t=Tt();t&&(t.value="");const e=eo();e&&(e.innerHTML="");const a=Le();a&&(a.value="");const n=an();n&&(n.value=""),P(""),Xa(""),Ut(),Me()}function Me(){var n,o,i;const t=to();if(!t)return;const e=!!((n=S.techSelected)!=null&&n.userId)||!!((o=S.techSelected)!=null&&o.email),a=!!String(((i=Le())==null?void 0:i.value)||"").trim();t.disabled=!(e&&a)}function ao(t){return String(t||"").trim().toLowerCase()}function Yi(t){return ao([t.name,t.email,t.label].filter(Boolean).join(" "))}function Ut(){const t=Ee();t&&(S.sugOpen=!1,S.sugIdx=-1,S.sugItems=[],t.classList.add("hidden"),t.innerHTML="")}function oo(){const t=Ee();if(t){if(!S.sugItems.length){Ut();return}t.innerHTML=S.sugItems.map((e,a)=>{const n=a===S.sugIdx?"active":"",o=String(e.name||"").trim();return`
      <div class="nsItem ${n}" data-idx="${a}" role="option" aria-selected="${a===S.sugIdx}">
        <div class="nsTitle">${T(o)}</div>
      </div>
    `}).join(""),t.classList.remove("hidden"),S.sugOpen=!0}}function sa(t){if(!S.sugItems.length)return;S.sugIdx=Math.max(0,Math.min(t,S.sugItems.length-1)),oo();const e=Ee(),a=e==null?void 0:e.querySelector(`.nsItem[data-idx="${S.sugIdx}"]`);a&&a.scrollIntoView({block:"nearest"})}function io(t){S.techSelected=t||null;const e=Tt();e&&(e.value=t?String(t.name||"").trim():"");const a=eo();if(a&&(a.innerHTML="",t)){const n=document.createElement("option");n.value=String(t.userId||t.email||""),n.textContent=String(t.name||"").trim(),n.selected=!0,a.appendChild(n)}Ut(),Me()}async function Ji(t){const e=String(t||"").trim();if(!e)return[];const a=await _t(`/api/name-suggest?q=${encodeURIComponent(e)}&limit=12`);return a!=null&&a.ok?(Array.isArray(a.items)?a.items:[]).map(o=>({userId:String(o.userId||o.id||"").trim(),name:String(o.name||o.nombre||"").trim(),email:String(o.email||"").trim(),label:String(o.label||"").trim()})):[]}function Zi(){const t=Tt();if(!t)return;const e=String(t.value||"").trim();if(S.lastQ=e,S.techSelected=null,Me(),!e){Ut();return}clearTimeout(S.sugTimer),S.sugTimer=setTimeout(async()=>{try{const a=await Ji(e);if(S.lastQ!==e)return;let n=a;if(!n.length&&S.cache.items.length){const o=ao(e);n=S.cache.items.filter(i=>Yi(i).includes(o)).slice(0,12)}S.sugItems=n,S.sugIdx=n.length?0:-1,oo()}catch{Ut()}},180)}function Xi(t){if(S.sugOpen){if(t.key==="ArrowDown"){t.preventDefault(),sa(S.sugIdx+1);return}if(t.key==="ArrowUp"){t.preventDefault(),sa(S.sugIdx-1);return}if(t.key==="Enter"){S.sugIdx>=0&&S.sugItems[S.sugIdx]&&(t.preventDefault(),io(S.sugItems[S.sugIdx]));return}t.key==="Escape"&&(t.preventDefault(),Ut())}}function ts(t){return F().itemsByKey.get(String(t||""))||null}function es(t){const e=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),a=String((t==null?void 0:t.conversionId)||"").trim(),n=Number((t==null?void 0:t.inc_leve)||0),o=Number((t==null?void 0:t.inc_moderada)||0),i=Number((t==null?void 0:t.inc_critica)||0);return`VIN: ${e||"-"} | OT: ${a||"-"} | Acumulado → L:${n} M:${o} C:${i}`}async function so(t){if(u.state.currentModule!=="CALIDAD")return;const e=ts(t);if(!e){K({ok:!1,error:"No se encontró el trabajo para registrar incidencia."});return}no(),S.itemKey=String(t||""),S.item=e,Xa(es(e)),P("");const a=nn();a&&(a.classList.add("show"),a.setAttribute("aria-hidden","false"),document.body.classList.add("modal-open")),S.open=!0;try{const n=Date.now();if(!S.cache.items.length||n-S.cache.ts>zi){const o=await _t("/api/name-suggest?q=.&limit=120");o!=null&&o.ok&&(S.cache.items=(Array.isArray(o.items)?o.items:[]).map(i=>({userId:String(i.userId||i.id||"").trim(),name:String(i.name||i.nombre||"").trim(),email:String(i.email||"").trim(),label:String(i.label||"").trim()})),S.cache.ts=n)}}catch{}setTimeout(()=>{var n;return(n=Tt())==null?void 0:n.focus()},0)}async function se(){const t=nn();if(t){const e=document.activeElement;e&&t.contains(e)&&e.blur(),t.classList.remove("show"),t.setAttribute("aria-hidden","true")}document.body.classList.remove("modal-open"),S.open=!1,no()}async function ns(){var r,c;if(u.state.currentModule!=="CALIDAD"||!S.item)return;const t=String((Zt==null?void 0:Zt())||"").trim().toLowerCase();if(!t){P("No hay email de sesión."),K({ok:!1,error:"No hay email de sesión."});return}const e=String(((r=Le())==null?void 0:r.value)||"").trim().toUpperCase();if(!["LEVE","MODERADA","CRITICA"].includes(e)){P("Selecciona el tipo de incidencia.");return}const a=S.techSelected;if(!a||!a.userId&&!a.email){P("Selecciona un técnico de la lista.");return}const n=String(((c=an())==null?void 0:c.value)||"").trim(),o=S.item,i={email:t,conversionId:String(o.conversionId||"").trim(),vin:String(o.vin||"").trim().toUpperCase(),rolTrabajo:"CALIDAD",tecnicoUserId:String(a.userId||"").trim(),tecnicoEmail:String(a.email||"").trim(),tecnicoNombre:String(a.name||"").trim(),tipo:e,nota:n,foto:S.photo?{b64:S.photo.b64,mimeType:S.photo.mimeType,name:S.photo.name}:null};let s;try{s=await Ze("/api/incidencia",i),K(s)}catch(l){console.error("[INC save] ERROR:",l),P(`❌ ${String((l==null?void 0:l.message)||l||"Error de red")}`),K({ok:!1,error:String((l==null?void 0:l.message)||l||"Error de red")});return}if(!s||typeof s!="object"){P("❌ Respuesta inválida del servidor."),K({ok:!1,error:"Respuesta inválida del servidor",raw:s});return}if(!s.ok){const l=s.error||s.message||JSON.stringify(s);P(`❌ ${l}`);return}try{const l=F(),d=s.item||s.data||s.row||null;if(d&&(d.conversionId||d.vin)){const p=l.itemsByKey.get(S.itemKey);if(p){const b={...p};d.inc_leve!=null?b.inc_leve=Number(d.inc_leve||0):e==="LEVE"&&(b.inc_leve=Number(b.inc_leve||0)+1),d.inc_moderada!=null?b.inc_moderada=Number(d.inc_moderada||0):e==="MODERADA"&&(b.inc_moderada=Number(b.inc_moderada||0)+1),d.inc_critica!=null?b.inc_critica=Number(d.inc_critica||0):e==="CRITICA"&&(b.inc_critica=Number(b.inc_critica||0)+1),l.itemsByKey.set(S.itemKey,b);const y=tn();zt(),Dt(),it(),en(y)}}}catch(l){console.warn("[INC patch local] warning:",l)}P("✅ Incidencia registrada."),setTimeout(()=>{se().catch(()=>{})},350)}function as(){var e,a,n,o,i,s,r,c,l,d,p,b;const t=nn();t&&t.dataset.bound!=="1"&&(t.dataset.bound="1",(e=H("btnCloseInc"))==null||e.addEventListener("click",()=>{se().catch(()=>{})}),t.addEventListener("click",y=>{y.target===t&&se().catch(()=>{})}),(a=Tt())==null||a.addEventListener("input",Zi),(n=Tt())==null||n.addEventListener("keydown",Xi),(o=H("btnIncFotoCam"))==null||o.addEventListener("click",()=>{var y;P(""),(y=Be())==null||y.click()}),(i=H("btnIncFotoFile"))==null||i.addEventListener("click",()=>{var y;P(""),(y=we())==null||y.click()}),(s=Be())==null||s.addEventListener("change",ia),(r=we())==null||r.addEventListener("change",ia),(c=H("btnIncFotoClear"))==null||c.addEventListener("click",()=>{te(),P("")}),(l=Ee())==null||l.addEventListener("mousedown",y=>{const m=y.target.closest(".nsItem[data-idx]");if(!m)return;y.preventDefault();const _=Number(m.dataset.idx),L=S.sugItems[_];L&&io(L)}),document.addEventListener("click",y=>{var _;if(!S.open||!S.sugOpen)return;const m=(_=Tt())==null?void 0:_.closest(".supNameWrap");m&&m.contains(y.target)||Ut()}),(d=Le())==null||d.addEventListener("change",()=>{P(""),Me()}),(p=an())==null||p.addEventListener("input",()=>{P("")}),(b=to())==null||b.addEventListener("click",async()=>{await J(async()=>{await ns()},"Guardando incidencia...")}),document.addEventListener("keydown",y=>{S.open&&y.key==="Escape"&&(y.preventDefault(),se().catch(()=>{}))}))}const It={open:!1,vin:""},Z=t=>document.getElementById(t),on=()=>Z("rfModal");function ro(t){const e=Z("rfInfo");e&&(e.textContent=String(t||""))}function co(t){const e=Z("rfMsg");e&&(e.textContent="")}function lo(){try{Ft({mountId:"rfUploaderMount"})}catch{}Z("rfMenu")&&(Z("rfMenu").style.display="block"),Z("rfStage")&&(Z("rfStage").style.display="none"),Z("rfStage")&&(Z("rfStage").innerHTML="")}function ra(t){var n;const e=Z("rfMenu"),a=Z("rfStage");a&&(e&&(e.style.display="none"),a.style.display="block",a.innerHTML=`
    <div class="row" style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <button type="button" id="btnRfBack" class="btn" style="height:44px; padding:0 14px; font-weight:900;">
        ← Volver
      </button>
      <div class="pill small" style="opacity:.95;">
        ${t==="calidad"?"CONTROL CALIDAD":"REGISTRAR FALLA"}
      </div>
    </div>

    <div id="rfUploaderMount"></div>
  `,(n=a.querySelector("#btnRfBack"))==null||n.addEventListener("click",lo),Xe({vin:It.vin,screen:t,mountId:"rfUploaderMount"}))}function uo(t){if(u.state.currentModule!=="CALIDAD")return;const e=String(t||"").trim().toUpperCase();if(!e){K({ok:!1,error:"VIN vacío para RF modal."});return}It.vin=e,It.open=!0,ro(`VIN: ${e}`),co();const a=on();a&&(a.classList.add("show"),a.setAttribute("aria-hidden","false"),document.body.classList.add("modal-open")),lo()}function ke(){try{Ft({mountId:"rfUploaderMount"})}catch{}const t=on();if(t){const n=document.activeElement;n&&t.contains(n)&&n.blur(),t.classList.remove("show"),t.setAttribute("aria-hidden","true")}document.body.classList.remove("modal-open"),It.open=!1,It.vin="",ro(""),co();const e=document.getElementById("rfMenu"),a=document.getElementById("rfStage");e&&(e.style.display="block"),a&&(a.style.display="none",a.innerHTML="")}function os(){var e,a,n;const t=on();t&&t.dataset.bound!=="1"&&(t.dataset.bound="1",(e=Z("btnCloseRF"))==null||e.addEventListener("click",ke),t.addEventListener("click",o=>{o.target===t&&ke()}),(a=Z("btnRfControl"))==null||a.addEventListener("click",()=>{It.vin&&ra("calidad")}),(n=Z("btnRfFalla"))==null||n.addEventListener("click",()=>{It.vin&&ra("falla")}),document.addEventListener("keydown",o=>{It.open&&o.key==="Escape"&&(o.preventDefault(),ke())}))}const At={open:!1,vin:""},X=t=>document.getElementById(t),sn=()=>X("rfTecModal");function po(t){const e=X("rfTecInfo");e&&(e.textContent=String(t||""))}function fo(t){const e=X("rfTecMsg");e&&(e.textContent="")}function pe(){try{Ft({mountId:"rfTecUploaderMount"})}catch{}X("rfTecMenu")&&(X("rfTecMenu").style.display="block"),X("rfTecStage")&&(X("rfTecStage").style.display="none"),X("rfTecStage")&&(X("rfTecStage").innerHTML="")}function ca(t){var n;const e=X("rfTecMenu"),a=X("rfTecStage");a&&(e&&(e.style.display="none"),a.style.display="block",a.innerHTML=`
    <div class="row" style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <button type="button" id="btnRFTecBack" class="btn" style="height:44px; padding:0 14px; font-weight:900;">
        ← Volver
      </button>
      <div class="pill small" style="opacity:.95;">
        ${t==="params"?"REGISTRAR PARÁMETROS":"REGISTRAR FALLA"}
      </div>
    </div>

    <div id="rfTecUploaderMount"></div>
  `,(n=a.querySelector("#btnRFTecBack"))==null||n.addEventListener("click",pe),Xe({vin:At.vin,screen:t==="params"?"params":"falla",mountId:"rfTecUploaderMount",onBackControl:pe}))}function mo(t){if(u.state.currentModule!=="TECNICO")return;const e=String(t||"").trim().toUpperCase();if(!e)return K({ok:!1,error:"VIN vacío para Registro/Fallas."});At.vin=e,At.open=!0,po(`VIN: ${e}`),fo();const a=sn();a&&(a.classList.add("show"),a.setAttribute("aria-hidden","false"),document.body.classList.add("modal-open")),pe()}function De(){try{Ft({mountId:"rfTecUploaderMount"})}catch{}const t=sn();if(t){const e=document.activeElement;e&&t.contains(e)&&e.blur(),t.classList.remove("show"),t.setAttribute("aria-hidden","true")}document.body.classList.remove("modal-open"),At.open=!1,At.vin="",po(""),fo(),pe()}function is(){var e,a,n;const t=sn();t&&t.dataset.bound!=="1"&&(t.dataset.bound="1",(e=X("btnCloseRFTec"))==null||e.addEventListener("click",De),t.addEventListener("click",o=>{o.target===t&&De()}),(a=X("btnRFTecParams"))==null||a.addEventListener("click",()=>{At.vin&&ca("params")}),(n=X("btnRFTecFalla"))==null||n.addEventListener("click",()=>{At.vin&&ca("falla")}),document.addEventListener("keydown",o=>{At.open&&o.key==="Escape"&&(o.preventDefault(),De())}))}const Vt={bound:!1,resolver:null};function fe(){return{modal:g("confirmFinishModal"),btnCloseX:g("btnCloseFinishX"),btnCancel:g("btnCancelFinish"),btnAccept:g("btnAcceptFinish"),title:g("confirmFinishTitle"),text:g("confirmFinishText")}}function Yt(t){const{modal:e}=fe();if(e&&(e.setAttribute("aria-hidden","true"),e.classList.remove("show")),document.body.classList.remove("modal-open"),typeof Vt.resolver=="function"){const a=Vt.resolver;Vt.resolver=null,a(!!t)}}function vo(){if(Vt.bound)return;Vt.bound=!0;const{modal:t,btnCloseX:e,btnCancel:a,btnAccept:n}=fe();t&&(e==null||e.addEventListener("click",()=>Yt(!1)),a==null||a.addEventListener("click",()=>Yt(!1)),n==null||n.addEventListener("click",()=>Yt(!0)),t.addEventListener("click",o=>{o.target===t&&Yt(!1)}),document.addEventListener("keydown",o=>{const{modal:i}=fe();!i||i.getAttribute("aria-hidden")==="true"||o.key==="Escape"&&(o.preventDefault(),Yt(!1))}))}function ss(){vo()}function go({title:t="Confirmar finalización",message:e="¿Seguro que quieres finalizar este trabajo?",acceptText:a="Sí, finalizar",cancelText:n="Cancelar"}={}){vo();const{modal:o,title:i,text:s,btnAccept:r,btnCancel:c}=fe();return o?(i&&(i.textContent=t),s&&(s.textContent=e),r&&(r.textContent=a),c&&(c.textContent=n),o.setAttribute("aria-hidden","false"),o.classList.add("show"),document.body.classList.add("modal-open"),setTimeout(()=>c==null?void 0:c.focus(),0),new Promise(l=>{Vt.resolver=l})):Promise.resolve(window.confirm(e))}const V={currentKey:"",currentItem:null,qr:null,scanMode:"QR",bound:!1};let re=null;function rs(t){re=typeof t=="function"?t:null}function tt(){return{modal:g("confModal"),btnClose:g("btnCloseConf"),vinInfo:g("confVinInfo"),code:g("confCode"),btnQR:g("btnConfQR"),assignedBox:g("confAssignedBox"),qrWrap:g("confQrWrap"),qrReader:g("qrReader_conf"),qrMsg:g("confQrMsg"),btnStopQR:g("btnConfStopQR"),btnClear:g("btnConfClear"),ck1:g("ck1"),ck2:g("ck2"),ck3:g("ck3"),btnSave:g("btnConfSave"),msg:g("confMsg")}}function ae(t){return String(t||"").trim().toUpperCase()}function rn(t){const e=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase();return e==="TANQUE"?"TANQUE":e==="MOTOR"?"REDUCTOR":String((t==null?void 0:t.tanque_asignado)||"").trim()?"TANQUE":String((t==null?void 0:t.reductor_asignado)||"").trim()?"REDUCTOR":"EQUIPO"}function bo(t,e){return t?e==="TANQUE"?String(t.tanque_asignado||t.tanque_registrado||"").trim().toUpperCase():e==="REDUCTOR"?String(t.reductor_asignado||t.reductor_registrado||"").trim().toUpperCase():"":""}function cs(){const{ck1:t,ck2:e,ck3:a}=tt();return!!(t!=null&&t.checked&&(e!=null&&e.checked)&&(a!=null&&a.checked))}function qe(){var e;const{code:t}=tt();return!!ae(t==null?void 0:t.value)&&cs()&&!!((e=V.currentItem)!=null&&e.vin)}function ft(t,e=!1){const{msg:a}=tt();a&&(a.textContent=String(t||""),a.style.color=e?"#ffb3b3":"")}function ee(){const{assignedBox:t,code:e}=tt(),a=V.currentItem;if(!t)return;if(!a){t.textContent="";return}const n=rn(a),o=bo(a,n),i=ae(e==null?void 0:e.value);if(!o){t.textContent=`Equipo esperado (${n}): (sin asignado en cartilla)`,t.style.opacity=".85";return}if(!i){t.textContent=`Equipo asignado (${n}): ${o}`,t.style.opacity=".95";return}const s=i===o;t.textContent=`Equipo asignado (${n}): ${o} ${s?"✅":"⚠️ no coincide"}`,t.style.opacity="1"}function Lt(){const{btnSave:t}=tt();if(!t)return;const e=qe();t.disabled=!e,t.style.opacity=e?"1":".65",t.style.cursor=e?"pointer":"not-allowed"}function ls(t){V.scanMode=t==="BAR"?"BAR":"QR"}async function ds(){var n;const{qrWrap:t,qrMsg:e,code:a}=tt();try{if(!window.Html5Qrcode){e&&(e.textContent="No se cargó la librería QR.");return}t&&(t.style.display="block"),V.qr||(V.qr=new Html5Qrcode("qrReader_conf"));const o=V.scanMode==="BAR";e&&(e.textContent=o?"Modo: CÓDIGO DE BARRAS (CODE_128)":"Modo: QR");const i={fps:o?8:10,qrbox:o?{width:170,height:320}:{width:250,height:250},formatsToSupport:o?[Html5QrcodeSupportedFormats.CODE_128]:[Html5QrcodeSupportedFormats.QR_CODE],experimentalFeatures:{useBarCodeDetectorIfSupported:!0}},s=async d=>{const p=ae(d);p&&(a&&(a.value=p),e&&(e.textContent=`Código detectado: ${p}`),ee(),Lt(),await cn())};try{await V.qr.start({facingMode:{exact:"environment"}},i,s,()=>{});return}catch{}try{await V.qr.start({facingMode:"environment"},i,s,()=>{});return}catch{}const r=await Html5Qrcode.getCameras();let c=((n=r==null?void 0:r[0])==null?void 0:n.id)||null;const l=r==null?void 0:r.find(d=>/back|rear|environment/i.test(d.label||""));l!=null&&l.id&&(c=l.id),await V.qr.start(c??{facingMode:"environment"},i,s,()=>{})}catch{e&&(e.textContent="No se pudo abrir cámara. Revisa permisos/HTTPS.")}}async function cn(){const{qrWrap:t,qrMsg:e}=tt();try{V.qr&&V.qr.isScanning&&await V.qr.stop()}catch{}t&&(t.style.display="none"),e&&!e.textContent&&(e.textContent="")}function us(){const{code:t,ck1:e,ck2:a,ck3:n,qrMsg:o,msg:i}=tt();t&&(t.value=""),e&&(e.checked=!1),a&&(a.checked=!1),n&&(n.checked=!1),o&&(o.textContent=""),i&&(i.textContent=""),ee(),Lt()}function ps(t){const{vinInfo:e,assignedBox:a}=tt(),n=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),o=String((t==null?void 0:t.rolTrabajo)||"").toUpperCase(),i=rn(t);e&&(e.textContent=`VIN: ${n||"-"} | ROL: ${o||"-"} | CONFORMIDAD: ${i}`),a&&(a.textContent=""),ee(),Lt()}async function fs(t){var i,s;const a=F().itemsByKey.get(String(t||""));if(!a)return;V.currentKey=String(t||""),V.currentItem=a,ps(a),us();const{modal:n,code:o}=tt();(i=n==null?void 0:n.classList)==null||i.add("show"),(s=n==null?void 0:n.setAttribute)==null||s.call(n,"aria-hidden","false"),setTimeout(()=>{var r;return(r=o==null?void 0:o.focus)==null?void 0:r.call(o)},0)}async function Ve(){var e,a;const{modal:t}=tt();(e=t==null?void 0:t.classList)==null||e.remove("show"),(a=t==null?void 0:t.setAttribute)==null||a.call(t,"aria-hidden","true"),await cn(),V.currentKey="",V.currentItem=null}async function la(){const{code:t,ck1:e,ck2:a,ck3:n}=tt(),o=V.currentItem;if(!o)return ft("No hay cartilla seleccionada.",!0);const i=ae(t==null?void 0:t.value);if(!i)return ft("Debes escribir o escanear el código del equipo.",!0);if(!(e!=null&&e.checked&&(a!=null&&a.checked)&&(n!=null&&n.checked)))return ft("Debes marcar los 3 items de conformidad.",!0);let s;try{s=Ht()}catch{return}const r=rn(o),c=bo(o,r),l={email:s,conversionId:String(o.conversionId||""),vin:String(o.vin||"").trim().toUpperCase(),rolTrabajo:String(o.rolTrabajo||"").toUpperCase(),equipoTipo:r,equipoCodigo:i,equipoAsignado:c||"",checks:{ck1:!0,ck2:!0,ck3:!0}};l.ck1=!0,l.ck2=!0,l.ck3=!0;const d=await Ae("/api/equipo-conformidad",l,"Guardando conformidad...");if(!(d!=null&&d.ok)){ft((d==null?void 0:d.error)||"No se pudo guardar la conformidad.",!0);return}ft("✅ Conformidad guardada correctamente."),setTimeout(()=>{try{re==null||re()}catch{}},400),setTimeout(()=>Ve().catch(()=>{}),450)}function ms(){if(V.bound)return;V.bound=!0;const{modal:t,btnClose:e,code:a,btnQR:n,btnStopQR:o,btnClear:i,ck1:s,ck2:r,ck3:c,btnSave:l}=tt();e==null||e.addEventListener("click",()=>Ve()),t==null||t.addEventListener("click",async d=>{d.target===t&&await Ve()}),a==null||a.addEventListener("input",()=>{a.value=ae(a.value),ee(),Lt(),ft("")}),[s,r,c].forEach(d=>{d==null||d.addEventListener("change",()=>{Lt(),ft("")})}),n==null||n.addEventListener("click",async d=>{ls(d.altKey?"BAR":"QR"),await ds()}),o==null||o.addEventListener("click",async()=>{await cn()}),i==null||i.addEventListener("click",()=>{const{code:d,qrMsg:p}=tt();d&&(d.value=""),p&&(p.textContent=""),ee(),Lt(),ft("")}),l==null||l.addEventListener("click",async()=>{if(!qe()){ft("Completa el código del equipo y marca los 3 checks.",!0);return}await la()}),a==null||a.addEventListener("keydown",async d=>{d.key==="Enter"&&qe()&&(d.preventDefault(),await la())}),Lt()}const da={TECNICO:{syncTimer:null,clockTimer:null,estadoTimer:null,syncStopped:!1},CALIDAD:{syncTimer:null,clockTimer:null,estadoTimer:null,syncStopped:!1},RAMALERO:{syncTimer:null,clockTimer:null,estadoTimer:null,syncStopped:!1}};function ln(t){return da[t]||da.TECNICO}function dn(t){const e=ln(t);e.syncStopped=!0,e.syncTimer&&clearTimeout(e.syncTimer),e.clockTimer&&clearInterval(e.clockTimer),e.estadoTimer&&clearInterval(e.estadoTimer),e.syncTimer=null,e.clockTimer=null,e.estadoTimer=null}function yo(t){const e=u.state.currentModule;u.state.currentModule=t;try{if(t==="RAMALERO"){const i=document.getElementById("ramalId");i&&(i.value="");const s=document.getElementById("tipoRamal");s&&(s.value="")}else{const i=U("vin");i&&(i.value="")}const a=U("activasBox");a&&(a.innerHTML="");const n=U("finalizadosBox");n&&(n.innerHTML=""),dt("");const o=F();o.showFinalizados=!1,o.itemsByKey.clear(),o.activeKeys=[],o.finalKeys=[],o.lastSyncSince=null,o.lastSyncRev=null,o.lastSyncAtMs=0}finally{u.state.currentModule=e}}async function ho(t,e){const a=ln(t);if(e&&!a.syncStopped){try{await e({forceFull:!1,showOut:!1})}catch(n){console.error(`[${t}] sync loop error:`,n)}a.syncStopped||(a.syncTimer=setTimeout(()=>{ho(t,e)},6e4))}}function Co(t,{syncNow:e,tickClocksUI:a,refreshEstadoForVinRole:n,buildAvgTopHTML:o}={}){dn(t);const i=u.state.currentModule;u.state.currentModule=t;try{const s=ln(t);if(s.syncStopped=!1,Promise.resolve(e==null?void 0:e({forceFull:!0,showOut:!1})).catch(c=>{console.error(`[${t}] initial sync error:`,c)}).finally(()=>{s.syncStopped||(s.syncTimer=setTimeout(()=>{ho(t,e)},1e4))}),s.clockTimer=setInterval(()=>{a==null||a()},1e3),(t==="TECNICO"||t==="CALIDAD")&&(s.estadoTimer=setInterval(()=>{n==null||n({showOut:!1})},8e3),setTimeout(()=>{n==null||n({showOut:!1}).catch(()=>{})},700)),F().showFinalizados){const c=o&&o()||"";it(c)}}finally{u.state.currentModule=i}}function un(t,e){if((!t.vin||t.vin==="")&&(e!=null&&e.vin)&&(t.vin=e.vin),!t.vin&&t.conversionId&&t.rolTrabajo){const a=Ei(t.conversionId,t.rolTrabajo);a&&(t.vin=a)}if(t.rolTrabajo==="RAMALERO"&&((!t.tipoRamal||t.tipoRamal==="")&&(e!=null&&e.tipoRamal)&&(t.tipoRamal=e.tipoRamal),!t.tipoRamal&&t.conversionId)){const a=Ti(t.conversionId);a&&(t.tipoRamal=a)}return e&&(t.updated_at||(t.updated_at=e.updated_at||null),t.last_nota_ts||(t.last_nota_ts=e.last_nota_ts||null),t.created_at||(t.created_at=e.created_at||null)),t}function Te(t){const e=(...n)=>{for(const o of n)if(o!=null&&String(o).trim()!=="")return o;return""},a={conversionId:String(e(t==null?void 0:t.conversionId,t==null?void 0:t.conversion_id,t==null?void 0:t.CONVERSION_ID,t==null?void 0:t.ID,t==null?void 0:t.id)).trim(),vin:String(e(t==null?void 0:t.vin,t==null?void 0:t.VIN)).trim().toUpperCase(),tipoRamal:String(e(t==null?void 0:t.tipoRamal,t==null?void 0:t.tipo_ramal,t==null?void 0:t.tipo,t==null?void 0:t.TIPO_RAMAL,t==null?void 0:t.TIPO)).trim(),created_at:(t==null?void 0:t.fecha_asignacion)??(t==null?void 0:t.FECHA_ASIGNACION)??(t==null?void 0:t.fecha_inicio)??(t==null?void 0:t.inicio_at)??(t==null?void 0:t.FECHA_INICIO)??(t==null?void 0:t.created_at)??(t==null?void 0:t.fecha_creacion)??(t==null?void 0:t.FECHA_CREACION)??null,rolTrabajo:String(e(t==null?void 0:t.rolTrabajo,t==null?void 0:t.rol_trabajo,t==null?void 0:t.rol,t==null?void 0:t.ROL_TRABAJO,t==null?void 0:t.ROL)).trim().toUpperCase(),estado:String(e(t==null?void 0:t.estado,t==null?void 0:t.estado_actual,t==null?void 0:t.estadoActual,t==null?void 0:t.ESTADO_ACTUAL,t==null?void 0:t.ESTADO)).trim().toUpperCase(),tiempo_ms:Number(e(t==null?void 0:t.tiempo_ms,t==null?void 0:t.tiempoMs,t==null?void 0:t.TIEMPO_TRAB_MS,t==null?void 0:t.TIEMPO_MS,0))||0,running_since:(t==null?void 0:t.running_since)??(t==null?void 0:t.RUNNING_SINCE)??null,last_nota:String(e(t==null?void 0:t.last_nota,t==null?void 0:t.LAST_NOTA,"")),last_nota_ts:(t==null?void 0:t.last_nota_ts)??(t==null?void 0:t.LAST_NOTA_TS)??null,updated_at:(t==null?void 0:t.updated_at)??(t==null?void 0:t.UPDATED_AT)??null,tanque_asignado:String(e(t==null?void 0:t.tanque_asignado,t==null?void 0:t.tanqueAsignado,t==null?void 0:t.TANQUE_ASIGNADO,"")).trim(),reductor_asignado:String(e(t==null?void 0:t.reductor_asignado,t==null?void 0:t.reductorAsignado,t==null?void 0:t.REDUCTOR_ASIGNADO,"")).trim(),tanque_registrado:String(e(t==null?void 0:t.tanque_registrado,t==null?void 0:t.tanqueRegistrado,t==null?void 0:t.TANQUE_REGISTRADO,"")).trim(),reductor_registrado:String(e(t==null?void 0:t.reductor_registrado,t==null?void 0:t.reductorRegistrado,t==null?void 0:t.REDUCTOR_REGISTRADO,"")).trim(),inc_leve:Number(e(t==null?void 0:t.inc_leve,t==null?void 0:t.INC_LEVE,0))||0,inc_moderada:Number(e(t==null?void 0:t.inc_moderada,t==null?void 0:t.INC_MODERADA,0))||0,inc_critica:Number(e(t==null?void 0:t.inc_critica,t==null?void 0:t.INC_CRITICA,0))||0,motorNombre:String(e(t==null?void 0:t.motorNombre,t==null?void 0:t.motor_nombre,t==null?void 0:t.MOTOR_NOMBRE,"")).trim(),tanqueroNombre:String(e(t==null?void 0:t.tanqueroNombre,t==null?void 0:t.tanquero_nombre,t==null?void 0:t.TANQUERO_NOMBRE,"")).trim()};return a.rolTrabajo||(a.tipoRamal?a.rolTrabajo="RAMALERO":u.state.currentModule==="CALIDAD"?a.rolTrabajo="CALIDAD":a.rolTrabajo=String(Fa()||"MOTOR").toUpperCase()),a.estado||(a.estado="SIN_INICIAR"),a.conversionId&&a.rolTrabajo&&a.vin&&Ri(a.conversionId,a.rolTrabajo,a.vin),a.conversionId&&a.rolTrabajo==="RAMALERO"&&a.tipoRamal&&Mi(a.conversionId,a.tipoRamal),a}function vs(t){const e=F(),a=Array.isArray(t==null?void 0:t.items)?t.items:[];for(const n of a){const o=Te(n),i=Se(o),s=e.itemsByKey.get(i);un(o,s),e.itemsByKey.set(i,o)}}function ua(t){const e=F();e.itemsByKey.clear();const a=Array.isArray(t)?t:[];for(const n of a){const o=Te(n),i=Se(o);un(o,null),e.itemsByKey.set(i,o)}}function gs(t,e){const a=F();return t.join(",")!==a.activeKeys.join(",")||e.join(",")!==a.finalKeys.join(",")}const Jt=new Map;async function Qe(t){const e=t.toUpperCase();if(Jt.has(e))return Jt.get(e);try{const a=`/api/supervisor/report?vin=${encodeURIComponent(e)}&track=CONVERSION`,n=await _t(a);if(!(n!=null&&n.ok)||!Array.isArray(n.items)){const c={motorNombre:"",tanqueroNombre:""};return Jt.set(e,c),c}const o=n.items.filter(c=>String(c.vin||"").toUpperCase()===e),i=o.find(c=>String(c.rol||"").toUpperCase()==="MOTOR"),s=o.find(c=>String(c.rol||"").toUpperCase()==="TANQUE"||String(c.rol||"").toUpperCase()==="TANQUERO"),r={motorNombre:String((i==null?void 0:i.userName)||"").trim(),tanqueroNombre:String((s==null?void 0:s.userName)||"").trim()};return Jt.set(e,r),r}catch{const a={motorNombre:"",tanqueroNombre:""};return Jt.set(e,a),a}}let Ue={k:"",t:0};async function Io(t,e={}){var m,_;if(!(u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD"))return;let a;try{a=Ht()}catch{return}const n=String(t||((m=g("accion"))==null?void 0:m.value)||"").toUpperCase();let o="";if(n==="NOTA"&&(o=String(((_=g("nota"))==null?void 0:_.value)||"").trim(),!o&&(e!=null&&e.nota)&&(o=String(e.nota||"").trim()),!o))return K({ok:!1,error:"Escribe una nota antes de guardar."});const i=Ce();if(!i)return K({ok:!1,error:"Pon el VIN"});const s=jt(),r=F(),c=[...r.itemsByKey.values()].find(L=>String(L.vin||"").toUpperCase()===i&&String(L.rolTrabajo||"").toUpperCase()===s);if(c&&!Pi(c.estado).includes(n))return K({ok:!1,error:`Acción ${n} no permitida desde estado ${c.estado}.`});const l=await Ae("/api/evento",{email:a,vin:i,rolTrabajo:s,accion:n,nota:o},n==="NOTA"?"Guardando nota...":"Registrando...");if(K(l),!(l!=null&&l.ok))return;const d=Te(l),p=Se(d),b=r.itemsByKey.get(p);b&&un(d,b),r.itemsByKey.set(p,d),zt();const y=tn();n==="NOTA"&&(e!=null&&e.clearKey)&&y.set(String(e.clearKey),""),Dt(),it(),en(y),n==="NOTA"&&g("nota")&&(g("nota").value=""),setTimeout(()=>{u.state.uiLocked||et({forceFull:!1,showOut:!1})},400)}async function me(t,e){const a=String(t||"").trim().toUpperCase(),n=String(e||"").trim().toUpperCase();if(!a)return;const o=`${a}|${n}`,i=Date.now();if(Ue.k===o&&i-Ue.t<1200)return;Ue={k:o,t:i};const r=[...F().itemsByKey.values()].find(l=>String(l.vin||"").toUpperCase()===a&&String(l.rolTrabajo||"").toUpperCase()===n);String((r==null?void 0:r.estado)||"").toUpperCase()==="SIN_INICIAR"&&await Io("INICIO")}async function bs(t,e){try{const o=await Ze("/api/sync",{email:t,since:e});if(o&&o.ok)return{mode:"sync",data:o}}catch{}return{mode:"legacy",data:await _t(`/api/mis-activas?email=${encodeURIComponent(t)}`)}}async function et({forceFull:t=!1,showOut:e=!1}={}){if(u.state.uiLocked||!Ye())return;let a;try{a=Ht()}catch{return}const n=F(),o=n.activeKeys.slice(),i=n.finalKeys.slice(),s=tn(),r=t?null:n.lastSyncSince,c=await bs(a,r),l=c.data;if(e&&K(l),!l||!l.ok)return;if(c.mode==="legacy"?(ua(l.items||[]),n.lastSyncSince=new Date().toISOString(),n.lastSyncRev=null):(l.full?ua(l.items||[]):vs(l),n.lastSyncSince=l.server_time||new Date().toISOString(),n.lastSyncRev=l.rev||n.lastSyncRev),zt(),u.state.currentModule==="CALIDAD"){const p=[];for(const b of[...n.activeKeys,...n.finalKeys]){const y=n.itemsByKey.get(b);y&&y.vin&&!y.motorNombre&&!y.tanqueroNombre&&p.push({k:b,it:y,vin:y.vin})}await Promise.all(p.map(({it:b,vin:y})=>Qe(y).then(({motorNombre:m,tanqueroNombre:_})=>{b.motorNombre=m,b.tanqueroNombre=_}).catch(()=>{})))}if(gs(o,i)?(Dt(),it(),en(s)):ie(),n.lastSyncAtMs=Date.now(),he(),u.state.currentModule==="CALIDAD"){const p=n.activeKeys.map(b=>n.itemsByKey.get(b)).find(b=>b&&b.rolTrabajo==="CALIDAD"&&b.estado==="SIN_INICIAR");p!=null&&p.vin&&me(p.vin,"CALIDAD").catch(()=>{})}if(u.state.currentModule==="TECNICO"){let b=Ce();if(!b){const y=n.activeKeys.map(m=>n.itemsByKey.get(m)).find(m=>m&&(m.rolTrabajo==="MOTOR"||m.rolTrabajo==="TANQUE")&&m.estado==="SIN_INICIAR"&&String(m.vin||"").trim());b=String((y==null?void 0:y.vin)||"").trim().toUpperCase()}b&&me(b,jt()).catch(()=>{})}}let pa=null;async function St({showOut:t=!1}={}){if(u.state.uiLocked||!Ye())return;let e;try{e=Ht()}catch{return}if(!(u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD"))return;const a=Ce(),n=jt();if(!a){dt("");return}const o=F(),i=a.toUpperCase();for(const l of o.itemsByKey.values())if(String(l.vin||"").toUpperCase()===i&&String(l.rolTrabajo||"").toUpperCase()===n){u.state.currentModule==="CALIDAD"&&!l.motorNombre&&!l.tanqueroNombre&&Qe(i).then(({motorNombre:d,tanqueroNombre:p})=>{l.motorNombre=d,l.tanqueroNombre=p,Dt(),it()}).catch(()=>{}),dt(`Estado: ${l.estado} | Tiempo: ${Ot(kt(l))}`);return}const s=await _t(`/api/estado?email=${encodeURIComponent(e)}&vin=${encodeURIComponent(a)}&rolTrabajo=${encodeURIComponent(n)}`);if(t&&K(s),!(s!=null&&s.ok)){dt((s==null?void 0:s.error)||"Error");return}const r=Te(s),c=Se(r);if(u.state.currentModule==="CALIDAD"&&r.vin){const{motorNombre:l,tanqueroNombre:d}=await Qe(r.vin);r.motorNombre=l,r.tanqueroNombre=d}o.itemsByKey.set(c,r),zt(),Dt(),it(),dt(`Estado: ${r.estado} | Tiempo: ${Ot(kt(r))}`)}function Pe(t=500){(u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD")&&(clearTimeout(pa),pa=setTimeout(()=>St({showOut:!1}).catch(()=>{}),t))}function ys(){var t,e,a;(t=g("btnEstado"))==null||t.addEventListener("click",async()=>{u.state.currentModule==="TECNICO"&&await J(async()=>{await St({showOut:!0}),await et({forceFull:!0,showOut:!1})},"Buscando / creando OT...")}),(e=g("btnEstadoQ"))==null||e.addEventListener("click",async()=>{u.state.currentModule==="CALIDAD"&&await J(async()=>{await St({showOut:!0}),await et({forceFull:!0,showOut:!1})},"Buscando / creando OT...")}),(a=g("rol"))==null||a.addEventListener("change",()=>{u.state.currentModule==="TECNICO"&&Pe(0)})}function pn(){var e;const t=document.getElementById("supIncModal");(e=t==null?void 0:t.classList)==null||e.add("show")}function fa(){var t,e;(e=(t=document.getElementById("supIncModal"))==null?void 0:t.classList)==null||e.remove("show")}function hs(t,{escapeHtml:e,fmtShort_:a}){try{return e(a(t))}catch{return e(String(t||""))}}async function fn(t,e,{getJSON_user:a}){const n=`/api/incidencias/list?vin=${encodeURIComponent(t||"")}&conversionId=${encodeURIComponent(e||"")}&limit=${encodeURIComponent(200)}`;return await a(n,"Cargando incidencias...")}function Qt(t,e,{escapeHtml:a,fmtShort_:n}){const o=document.getElementById("supIncInfo"),i=document.getElementById("supIncList"),s=document.getElementById("supIncMsg");s&&(s.textContent=""),i&&(i.innerHTML="");const r=(e==null?void 0:e.who)||"-",c=(e==null?void 0:e.vin)||"-",l=(e==null?void 0:e.conversionId)||"";if(o&&(o.textContent=`${r} — VIN: ${c}${l?` — CID: ${l}`:""}`),!(t!=null&&t.ok)){s&&(s.textContent=(t==null?void 0:t.error)||"Error cargando incidencias.");return}const d=Array.isArray(t.items)?t.items:[];if(!d.length){i&&(i.innerHTML='<div class="small">No hay incidencias registradas.</div>');return}i&&(i.innerHTML=d.map(p=>{const b=String(p.tipo||"").toUpperCase(),y=p.tecnico||"-",m=p.nota||"",_=p.fecha||"",j=!!(p.fotoThumbUrl||p.fotoUrl||p.fotoImgUrl)?`
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
            ${a(b||"INCIDENCIA")}
          </div>
          <div class="small" style="opacity:.9;">
            ${hs(_,{escapeHtml:a,fmtShort_:n})}
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
    `}).join(""))}function Cs({CORE:t,getJSON_user:e,escapeHtml:a,fmtShort_:n}){var o,i,s;(o=document.getElementById("supTable"))==null||o.addEventListener("click",async r=>{var y,m;if(t.state.currentModule!=="SUPERVISOR")return;const c=(m=(y=r.target)==null?void 0:y.closest)==null?void 0:m.call(y,"button[data-sup-inc]");if(!c)return;const l=String(c.dataset.vin||"").trim().toUpperCase(),d=String(c.dataset.cid||"").trim(),p=String(c.dataset.who||"").trim();pn();const b=document.getElementById("supIncMsg");b&&(b.textContent="Cargando...");try{const _=await fn(l,d,{getJSON_user:e});Qt(_,{vin:l,conversionId:d,who:p},{escapeHtml:a,fmtShort_:n})}catch(_){Qt({ok:!1,error:String((_==null?void 0:_.message)||_)},{vin:l,conversionId:d,who:p},{escapeHtml:a,fmtShort_:n})}}),(i=document.getElementById("btnCloseSupInc"))==null||i.addEventListener("click",()=>fa()),(s=document.getElementById("supIncModal"))==null||s.addEventListener("click",r=>{r.target===document.getElementById("supIncModal")&&fa()})}function ma(t){const e=u.state.currentModule;u.state.currentModule=t;try{const a=U("activasBox");if(!a)return;const n=`bound_${t}`;if(a.dataset[n]==="1")return;a.dataset[n]="1",a.addEventListener("input",o=>{var r;const i=o.target.closest("textarea.notaCard");if(!i)return;const s=(r=i.closest(".jobCard"))==null?void 0:r.querySelector(".btnNota");s&&(s.style.display=i.value.trim()?"block":"none")}),a.addEventListener("click",async o=>{var b;const i=o.target.closest(".jobCard");if(!i)return;const s=o.target.closest("button[data-act]");if(s){o.stopPropagation();const y=String(s.dataset.act||"").toUpperCase(),m=F(),_=i.dataset.key||"",L=m.itemsByKey.get(_);if(!L)return;const j=U("vin");if(j&&(j.value=L.vin||""),u.state.currentModule==="TECNICO"&&!u.state.rolLock&&(g("rol")&&(g("rol").value=L.rolTrabajo||"MOTOR"),he()),y==="NOTA"&&g("nota")&&(g("nota").value=String(((b=i.querySelector("textarea.notaCard"))==null?void 0:b.value)||"")),y==="FIN"&&!await go({title:"Confirmar finalización",message:"¿Seguro que quieres finalizar este trabajo? Esta acción puede cerrar la tarea actual.",acceptText:"Sí, finalizar",cancelText:"Cancelar"}))return;await Io(y,{clearKey:_});return}const r=o.target.closest("button[data-go]");if(!r)return;const c=String(r.dataset.go||"").toUpperCase(),l=F(),d=i.dataset.key||"",p=l.itemsByKey.get(d);if(p){if(c==="RF"){const y=String(r.dataset.vin||p.vin||"").trim().toUpperCase();if(!y)return;if(u.state.currentModule==="TECNICO"){g("vin")&&(g("vin").value=y),mo(y);return}if(u.state.currentModule==="CALIDAD"){g("vinQ")&&(g("vinQ").value=y),uo(y);return}}if(c==="INC"){o.stopPropagation();const y=String(r.dataset.key||d||"").trim();if(!y)return;await so(y);return}if(c==="VER_INC"){o.stopPropagation();const y=String(r.dataset.vin||(p==null?void 0:p.vin)||"").trim().toUpperCase(),m=String(r.dataset.cid||(p==null?void 0:p.conversionId)||"").trim();pn();const _=document.getElementById("supIncMsg");_&&(_.textContent="Cargando..."),fn(y,m,{getJSON_user:_t}).then(L=>Qt(L,{vin:y,conversionId:m,who:y},{escapeHtml:T,fmtShort_:Nt})).catch(L=>Qt({ok:!1,error:String((L==null?void 0:L.message)||L)},{vin:y},{escapeHtml:T,fmtShort_:Nt}));return}if(c==="CONF"){o.stopPropagation(),await fs(d);return}}})}finally{u.state.currentModule=e}}function va(t){const e=u.state.currentModule;u.state.currentModule=t;try{const a=U("finalizadosBox");if(!a)return;const n=`boundFin_${t}`;if(a.dataset[n]==="1")return;a.dataset[n]="1",a.addEventListener("click",async o=>{var d,p,b,y;const i=(p=(d=o.target)==null?void 0:d.closest)==null?void 0:p.call(d,"button[data-go]");if(!i)return;const s=String(i.dataset.go||"").toUpperCase(),r=F(),c=String(i.dataset.key||((y=(b=i.closest("[data-key]"))==null?void 0:b.dataset)==null?void 0:y.key)||"").trim(),l=c?r.itemsByKey.get(c):null;if(s==="INC"){if(o.stopPropagation(),!c)return;await so(c);return}if(s==="VER_INC"){o.stopPropagation();const m=String(i.dataset.vin||(l==null?void 0:l.vin)||"").trim().toUpperCase(),_=String(i.dataset.cid||(l==null?void 0:l.conversionId)||"").trim();pn();const L=document.getElementById("supIncMsg");L&&(L.textContent="Cargando..."),fn(m,_,{getJSON_user:_t}).then(j=>Qt(j,{vin:m,conversionId:_,who:m},{escapeHtml:T,fmtShort_:Nt})).catch(j=>Qt({ok:!1,error:String((j==null?void 0:j.message)||j)},{vin:m},{escapeHtml:T,fmtShort_:Nt}));return}if(s==="RF"){o.stopPropagation();const m=String(i.dataset.vin||(l==null?void 0:l.vin)||"").trim().toUpperCase();if(!m)return;if(u.state.currentModule==="TECNICO"){g("vin")&&(g("vin").value=m),mo(m);return}if(u.state.currentModule==="CALIDAD"){g("vinQ")&&(g("vinQ").value=m),uo(m);return}}})}finally{u.state.currentModule=e}}function Is(){ma("TECNICO"),ma("CALIDAD"),va("TECNICO"),va("CALIDAD")}const je={MIN_CHARS:1,LIMIT:12,DEBOUNCE_MS:200};let ga=null,mt=[],Ne=!1,ot=-1,ba="",Et=null;function Ao(){return u.state.currentModule==="CALIDAD"?U("vinQ"):U("vin")}function mn(){return u.state.currentModule==="CALIDAD"?U("vinSuggestQ"):U("vinSuggest")}function Pt(){const t=mn();t&&(Ne=!1,ot=-1,mt=[],t.classList.add("hidden"),t.innerHTML="")}function So(){const t=mn();if(t){if(!mt.length){Pt();return}t.innerHTML=mt.map((e,a)=>`
      <div class="vsItem ${a===ot?"active":""}" data-idx="${a}" role="option" aria-selected="${a===ot}">
        <div class="vsVin">${T(e)}</div>
        <div class="vsHint">Enter</div>
      </div>
    `).join(""),t.classList.remove("hidden"),Ne=!0}}function ya(t){ot=Math.max(0,Math.min(t,mt.length-1)),So();const e=mn(),a=e==null?void 0:e.querySelector(`.vsItem[data-idx="${ot}"]`);a&&a.scrollIntoView({block:"nearest"})}async function As(t){var o;try{(o=Et==null?void 0:Et.abort)==null||o.call(Et)}catch{}Et=new AbortController;const e=`/api/vin-suggest?q=${encodeURIComponent(t)}&limit=${encodeURIComponent(je.LIMIT)}`,n=await(await fetch(e,{signal:Et.signal})).json();return n!=null&&n.ok?Array.isArray(n.items)?n.items:[]:[]}function ha(){const t=Ao();if(!t)return;const e=String(t.value||"").trim().toUpperCase();if(ba=e,!e||e.length<je.MIN_CHARS){Pt();return}clearTimeout(ga),ga=setTimeout(async()=>{try{const a=await As(e);if(ba!==e)return;mt=(a||[]).map(n=>String(n||"").toUpperCase()).filter(Boolean),ot=mt.length?0:-1,So()}catch{Pt()}},je.DEBOUNCE_MS)}function _o(t){const e=Ao();e&&(e.value=String(t||"").toUpperCase(),Pt(),St({showOut:!1}).then(async()=>{await J(async()=>{await me(e.value,jt()),await et({forceFull:!1,showOut:!1}),await St({showOut:!1})},"Iniciando automáticamente...")}).catch(()=>{}))}function Ca(t){if(Ne){if(t.key==="ArrowDown"){t.preventDefault(),ya(ot+1);return}if(t.key==="ArrowUp"){t.preventDefault(),ya(ot-1);return}if(t.key==="Enter"){ot>=0&&mt[ot]&&(t.preventDefault(),_o(mt[ot]));return}t.key==="Escape"&&(t.preventDefault(),Pt())}}function Ss(){const t=g("vinSuggest"),e=g("vinSuggestQ");[t,e].forEach(a=>{a&&a.dataset.bound!=="1"&&(a.dataset.bound="1",a.addEventListener("mousedown",n=>{const o=n.target.closest(".vsItem[data-idx]");if(!o)return;n.preventDefault();const i=Number(o.dataset.idx),s=mt[i];s&&_o(s)}))}),document.body.dataset.vinSuggestDocBound||(document.body.dataset.vinSuggestDocBound="1",document.addEventListener("click",a=>{!Ne||[...document.querySelectorAll(".vinWrap")].some(i=>i.contains(a.target))||Pt()}))}function _s(){var t,e,a,n;Ss(),(t=g("vin"))==null||t.addEventListener("input",()=>{u.state.currentModule==="TECNICO"&&(ha(),dt(""),Pe(650))}),(e=g("vin"))==null||e.addEventListener("keydown",o=>{u.state.currentModule==="TECNICO"&&Ca(o)}),(a=g("vinQ"))==null||a.addEventListener("input",()=>{u.state.currentModule==="CALIDAD"&&(ha(),dt(""),Pe(650))}),(n=g("vinQ"))==null||n.addEventListener("keydown",o=>{u.state.currentModule==="CALIDAD"&&Ca(o)})}const ve=qt("qrReader");let Ro="QR";function Ia(t){Ro=t==="BAR"?"BAR":"QR"}async function Aa(){var e;if(!(u.state.currentModule==="TECNICO"||u.state.currentModule==="CALIDAD"))return;const t=g("qrModal");(e=t==null?void 0:t.classList)==null||e.add("show"),await ze()}async function He(){var t,e;(e=(t=g("qrModal"))==null?void 0:t.classList)==null||e.remove("show"),await ve.stop()}async function ze(){const t=g("qrMsg");try{await ve.start({mode:Ro,msgEl:t,onDecoded:async e=>{const a=u.state.currentModule==="CALIDAD"?U("vinQ"):U("vin");a&&(a.value=e),t&&(t.textContent=`VIN detectado: ${e}`),await He(),await J(async()=>{await St({showOut:!1}),await me(e,jt()),await et({forceFull:!0,showOut:!1}),await St({showOut:!1})},"Iniciando automáticamente...")}})}catch{}}function Rs(){var t,e,a,n,o,i;(t=g("btnQR"))==null||t.addEventListener("click",Aa),(e=g("btnQRQ"))==null||e.addEventListener("click",Aa),(a=g("btnCloseQR"))==null||a.addEventListener("click",He),(n=g("qrModal"))==null||n.addEventListener("click",async s=>{s.target===g("qrModal")&&await He()}),(o=g("btnScanQR"))==null||o.addEventListener("click",async()=>{Ia("QR"),await J(async()=>{await ve.stop(),await ze()},"Cambiando a QR...")}),(i=g("btnScanBar"))==null||i.addEventListener("click",async()=>{Ia("BAR"),await J(async()=>{await ve.stop(),await ze()},"Cambiando a CÓDIGO DE BARRAS...")})}function ce(){var o,i;if(!Ye())return;const t=F(),e=Date.now();if((i=(o=U("activasBox"))==null?void 0:o.querySelectorAll(".jobCard[data-key] .js-tiempo"))==null||i.forEach(s=>{const r=s.closest(".jobCard");if(!r)return;const c=r.dataset.key||"",l=t.itemsByKey.get(c);l&&(s.textContent=`⏱ ${Ot(kt(l,e))}`)}),u.state.currentModule==="RAMALERO")return;const a=Ce(),n=jt();if(a&&n){const s=[...t.itemsByKey.values()].find(r=>String(r.vin||"").toUpperCase()===a&&String(r.rolTrabajo||"").toUpperCase()===n);s&&dt(`Estado: ${s.estado} | Tiempo: ${Ot(kt(s,e))}`)}}function Es(){var t,e,a,n;ys(),_s(),Rs(),as(),ms(),ss(),rs(async()=>{await et({forceFull:!0,showOut:!1})}),os(),is(),Is(),(t=g("btnActivas"))==null||t.addEventListener("click",async()=>{u.state.currentModule==="TECNICO"&&await J(async()=>et({forceFull:!0,showOut:!0}),"Refrescando...")}),(e=g("btnFinalizados"))==null||e.addEventListener("click",async()=>{u.state.currentModule==="TECNICO"&&await J(async()=>{const o=F();o.showFinalizados=!o.showFinalizados,U("btnFinalizados").textContent=o.showFinalizados?"Ocultar finalizados":"Ver finalizados",it()},"Cargando finalizados...")}),(a=g("btnActivasQ"))==null||a.addEventListener("click",async()=>{u.state.currentModule==="CALIDAD"&&await J(async()=>et({forceFull:!0,showOut:!0}),"Refrescando...")}),(n=g("btnFinalizadosQ"))==null||n.addEventListener("click",async()=>{u.state.currentModule==="CALIDAD"&&await J(async()=>{const o=F();o.showFinalizados=!o.showFinalizados,U("btnFinalizadosQ").textContent=o.showFinalizados?"Ocultar finalizados":"Ver finalizados",it()},"Cargando finalizados...")})}function Eo(t){u.state.currentModule=t,Co(t,{syncNow:et,tickClocksUI:ce,refreshEstadoForVinRole:St})}function ge(t){dn(t),yo(t)}async function Ls(){var o;const t=g("ramalId");t&&(t.value="");let e;try{e=Ht()}catch{return}const a=String(((o=g("tipoRamal"))==null?void 0:o.value)||"").trim();if(!a){K({ok:!1,error:"Selecciona tipo de ramal"});return}const n=await Ae("/api/evento",{email:e,rolTrabajo:"RAMALERO",accion:"INICIO",tipoRamal:a},"Iniciando...");K(n),n!=null&&n.ok&&(await et({forceFull:!0,showOut:!1}),zt(),Dt(),it())}async function Ms(t,e,a=""){var r;let n;try{n=Ht()}catch{return}const o=String((t==null?void 0:t.tipoRamal)||((r=g("tipoRamal"))==null?void 0:r.value)||"").trim(),i={email:n,rolTrabajo:"RAMALERO",accion:e,conversionId:String((t==null?void 0:t.conversionId)||"").trim(),tipoRamal:o,nota:a},s=await Ae("/api/evento",i,`Enviando ${e}...`);K(s),s!=null&&s.ok&&(await et({forceFull:!0,showOut:!1}),zt(),Dt(),it())}let Sa=!1;function Ts(){var t,e,a;Sa||(Sa=!0,(t=g("btnActivasR"))==null||t.addEventListener("click",async()=>{u.state.currentModule==="RAMALERO"&&await J(async()=>et({forceFull:!0,showOut:!0}),"Refrescando...")}),(e=g("btnFinalizadosR"))==null||e.addEventListener("click",async()=>{u.state.currentModule==="RAMALERO"&&await J(async()=>{const n=F();n.showFinalizados=!n.showFinalizados;const o=U("btnFinalizados");o&&(o.textContent=n.showFinalizados?"Ocultar finalizados":"Ver finalizados"),it()},"Cargando finalizados...")}),(a=g("btnRamalNuevo"))==null||a.addEventListener("click",async()=>{u.state.currentModule==="RAMALERO"&&await Ls()}))}let _a=!1;function lt(t,e){return t!=null&&t.closest?t.closest(e):null}function Ns(){_a||(_a=!0,document.addEventListener("click",async t=>{var i;if(u.state.currentModule!=="RAMALERO")return;const e=U("activasBox");if(!e)return;const a=t.target,n=lt(a,"button[data-act]");if(n&&e.contains(n)){t.preventDefault(),t.stopPropagation();const s=lt(n,".jobCard[data-key]"),r=((i=s==null?void 0:s.dataset)==null?void 0:i.key)||"";if(!r)return;const c=F().itemsByKey.get(r);if(!c)return;const l=String(n.dataset.act||"").toUpperCase();if(!l)return;let d="";if(l==="NOTA"){const p=s.querySelector("textarea.notaCard");d=String((p==null?void 0:p.value)||"").trim()}if(l==="FIN"&&!await go({title:"Confirmar finalización",message:"¿Seguro que quieres finalizar este ramal? Esta acción puede cerrar la tarea actual.",acceptText:"Sí, finalizar",cancelText:"Cancelar"}))return;await Ms(c,l,d);return}const o=lt(a,".jobCard");if(o&&e.contains(o)){if(lt(a,"button")||lt(a,"textarea")||lt(a,"input")||lt(a,"select")||lt(a,"a"))return;o.classList.toggle("open")}}),document.addEventListener("input",t=>{if(u.state.currentModule!=="RAMALERO")return;const e=U("activasBox");if(!e)return;const a=lt(t.target,"textarea.notaCard");if(!a||!e.contains(a))return;const n=lt(a,".jobCard");if(!n)return;const o=n.querySelector("button.btnNota[data-act='NOTA']");if(!o)return;const i=String(a.value||"").trim().length>0;o.style.display=i?"block":"none"}))}function Os(){Ts(),Ns()}function xs(){u.state.currentModule="RAMALERO",Co("RAMALERO",{syncNow:et,tickClocksUI:()=>{ce==null||ce(),ie==null||ie()}})}function Lo(){dn("RAMALERO"),yo("RAMALERO")}function be(t){const e=[...t].sort((o,i)=>o-i),a=e.length;if(!a)return 0;const n=Math.floor(a/2);return a%2?e[n]:(e[n-1]+e[n])/2}function Mo(t,e){const a=t.map(n=>Math.abs(n-e));return be(a)}function ks(t,e,a,n=2.5){const o=a,i=Math.abs(t-e)/o;if(i<=n)return 1;const s=i-n;return 1/(1+s*s)}function To(t){const e=String(t||"").toUpperCase();return e==="CALIDAD"?"CALIDAD":e==="RAMAL"||e==="RAMALERO"?"RAMAL":"CONVERSION"}function No(t){const e=String(t||"").toUpperCase();return e==="TANQUE"||e==="TANQUERO"?"TANQUE":e==="MOTOR"?"MOTOR":e==="RAMAL"||e==="RAMALERO"?"RAMAL":e==="CALIDAD"?"CALIDAD":e==="TECNICO"||e==="CONVERSION"?"MOTOR":e||"UNKNOWN"}function Oo(t){return String(t||"").trim().toUpperCase()||"ALL"}function le(t){return Number.isFinite(t)&&t>0}function Ds(t,e){const a=new Map;function n(i,s){le(s)&&(a.has(i)||a.set(i,[]),a.get(i).push(s))}for(const i of t||[]){const s=Number(e(i)||0);if(!le(s))continue;const r=To(i.track||i.trackType||i.modulo||i.area||i._track),c=No(i.rol||i.rolTrabajo),l=Oo(i.marca||i.brand);n("GLOBAL",s),n(`T:${r}`,s),n(`T:${r}|R:${c}`,s),n(`T:${r}|M:${l}`,s),n(`T:${r}|R:${c}|M:${l}`,s)}const o=new Map;for(const[i,s]of a.entries()){const r=s.filter(le);if(!r.length)continue;const c=be(r),l=Mo(r,c)||1;o.set(i,{key:i,count:r.length,medianMs:c,madMs:l})}return o}function Us(t,e={},a=4){var c,l;const n=To(e.track),o=No(e.rol),i=Oo(e.marca),s=[{key:`T:${n}|R:${o}|M:${i}`,level:"track+rol+marca"},{key:`T:${n}|R:${o}`,level:"track+rol"},{key:`T:${n}|M:${i}`,level:"track+marca"},{key:`T:${n}`,level:"track"},{key:"GLOBAL",level:"global"}];for(const d of s){const p=(c=t==null?void 0:t.get)==null?void 0:c.call(t,d.key);if(p&&Number(p.count||0)>=a)return{found:!0,key:d.key,level:d.level,count:p.count,priorMs:p.medianMs,priorMadMs:p.madMs||1}}const r=(l=t==null?void 0:t.get)==null?void 0:l.call(t,"GLOBAL");return r?{found:!0,key:"GLOBAL",level:"global-fallback",count:r.count,priorMs:r.medianMs,priorMadMs:r.madMs||1}:{found:!1,key:"",level:"none",count:0,priorMs:0,priorMadMs:1}}function $s(t,e=2.5){const a=(t||[]).filter(le);if(!a.length)return{avgMs:0,medianMs:0,madMs:0,used:0,total:0,sumW:0,minW:0,maxW:0};if(a.length<3)return{avgMs:a.reduce((p,b)=>p+b,0)/a.length,medianMs:be(a),madMs:0,used:a.length,total:a.length,sumW:a.length,minW:1,maxW:1};const n=be(a),o=Mo(a,n)||1;let i=0,s=0,r=1/0,c=-1/0;for(const d of a){const p=ks(d,n,o,e);i+=p,s+=p*d,p<r&&(r=p),p>c&&(c=p)}return{avgMs:i>0?s/i:n,medianMs:n,madMs:o,used:a.length,total:a.length,sumW:i,minW:Number.isFinite(r)?r:0,maxW:Number.isFinite(c)?c:0}}function Fs(t,e,a={}){const{k:n=2.5,priorWeight:o=6}=a,i=$s(t,n),s=Number((e==null?void 0:e.priorMs)||0);if(!(Number.isFinite(s)&&s>0))return{...i,rawRobustMs:i.avgMs,priorMs:0,priorWeight:0,priorLevel:"none",priorCount:0,source:"local-only"};const c=i.used>=12?Math.max(2,o*.45):i.used>=8?Math.max(3,o*.65):i.used>=4?Math.max(4,o*.85):Math.max(6,o*1.25),l=(i.avgMs*(i.sumW||i.used||1)+s*c)/((i.sumW||i.used||1)+c);return{...i,avgMs:l,rawRobustMs:i.avgMs,priorMs:s,priorWeight:c,priorLevel:(e==null?void 0:e.level)||"unknown",priorCount:Number((e==null?void 0:e.count)||0),priorKey:(e==null?void 0:e.key)||"",source:"local+context-prior"}}function ye(t){const e=Math.max(0,Math.floor(t/1e3)),a=Math.floor(e/3600),n=Math.floor(e%3600/60),o=e%60,i=s=>String(s).padStart(2,"0");return`${a}h ${i(n)}m ${i(o)}s`}function ht(t){const e=Number((t==null?void 0:t.tiempo_ms)??0);return Number.isFinite(e)&&e>0?e:0}function de(t){const e=String(t||"").trim().toUpperCase();return e==="FINALIZADO"||e==="FIN"||e==="COMPLETADO"}function Bs(t){const e=String(t||"").toUpperCase();return e?e.includes("TE")?"KYC":e.includes("TT")?"VW":"JETOUR":"JETOUR"}function ws(t,e){const a=String(e||"ALL").toUpperCase();if(!a||a==="ALL")return!0;const n=String(t.rol||t.rolTrabajo||"").toUpperCase();if(n==="RAMALERO"||n==="RAMAL")return!0;const i=Bs(t.vin);return a===i}function qs(t){const e=String(t||"").toUpperCase();return e==="MOTOR"||e==="TANQUE"||e==="TANQUERO"}function Vs(t){var n,o;const e=new Map;for(const i of t){const s=String(i.rol||i.rolTrabajo||"").toUpperCase();if(!qs(s)){const m=`RAW|${Math.random()}`;e.set(m,{_kind:"raw",it:i});continue}const r=String(i.vin||"").trim().toUpperCase();if(!r){const m=`NOVIN|${i.workId||""}|${s}|${Math.random()}`;e.set(m,{_kind:"raw",it:i});continue}const c=e.get(r)||{_kind:"group",vin:r,estado:"SIN_DATO",motor:null,tanque:null,sortTs:0};s==="MOTOR"?c.motor=i:c.tanque=i;const l=String(((n=c.motor)==null?void 0:n.estado)||"").toUpperCase(),d=String(((o=c.tanque)==null?void 0:o.estado)||"").toUpperCase(),p=[l,d].filter(Boolean);p.includes("FINALIZADO")||p.includes("FIN")||p.includes("COMPLETADO")?c.estado="FINALIZADO":p.includes("TRABAJANDO")?c.estado="TRABAJANDO":p.includes("PAUSADO")?c.estado="PAUSADO":c.estado=p[0]||"SIN_DATO";const b=Date.parse(String(i.updated_at||""))||0,y=Date.parse(String(i.fecha_asignacion||i.fecha_inicio||""))||0;c.sortTs=Math.max(c.sortTs,b,y),e.set(r,c)}const a=Array.from(e.values());return a.sort((i,s)=>(s.sortTs||0)-(i.sortTs||0)),a}function Qs(t,{stats:e,techName:a,motorCount:n,tanqueCount:o,escapeHtml:i}){if(t)if((e==null?void 0:e.used)>0){const s=String(a).toUpperCase();t.innerHTML=`
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
              ${i(ye(e.avgMs))}
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
    `}function Ps(t,{uiList:e,escapeHtml:a,fmtShort_:n}){t&&(t.innerHTML=e.map(o=>o&&o._kind==="group"?js(o,{escapeHtml:a,fmtShort_:n}):Hs(o,{escapeHtml:a,fmtShort_:n})).join(""))}function js(t,{escapeHtml:e,fmtShort_:a}){const n=t.vin||"-",o=t.motor,i=t.tanque,s=(o==null?void 0:o.userName)||(o==null?void 0:o.userEmail)||(o==null?void 0:o.userId)||"-",r=(i==null?void 0:i.userName)||(i==null?void 0:i.userEmail)||(i==null?void 0:i.userId)||"-",c=o&&ht(o)?ye(ht(o)):"-",l=i&&ht(i)?ye(ht(i)):"-",d=o?a(o.fecha_inicio||o.fecha_asignacion||""):"",p=o?a(o.updated_at||""):"",b=i?a(i.fecha_inicio||i.fecha_asignacion||""):"",y=i?a(i.updated_at||""):"",m=String((o==null?void 0:o.workId)||(i==null?void 0:i.workId)||"").trim();return`
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
  `}function Hs(t,{escapeHtml:e,fmtShort_:a}){const n=(t==null?void 0:t.userName)||(t==null?void 0:t.userEmail)||(t==null?void 0:t.userId)||"-",o=String((t==null?void 0:t.rol)||(t==null?void 0:t.rolTrabajo)||"").toUpperCase()||"-",i=o==="RAMALERO"||o==="RAMAL",s=i?`RAMAL: ${(t==null?void 0:t.tipoRamal)||"-"}`:(t==null?void 0:t.vin)||"-",r=String((t==null?void 0:t.vin)||"").trim().toUpperCase(),c=String((t==null?void 0:t.workId)||(t==null?void 0:t.conversionId)||(t==null?void 0:t.conversion_id)||"").trim(),l=ht(t),d=l?ye(l):"-";return`
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
  `}const xo=qt("qrReader");async function zs({onDecodedDone:t}){var a;const e=document.getElementById("qrModal");(a=e==null?void 0:e.classList)==null||a.add("show"),await Ks({onDecodedDone:t})}async function Ke(){var t,e;(e=(t=document.getElementById("qrModal"))==null?void 0:t.classList)==null||e.remove("show"),await xo.stop()}async function Ks({onDecodedDone:t}){const e=document.getElementById("qrMsg");try{await xo.start({mode:"QR",msgEl:e,onDecoded:async a=>{const n=document.getElementById("supVin");n&&(n.value=a),e&&(e.textContent=`VIN detectado: ${a}`),await Ke();try{await(t==null?void 0:t(a))}catch{}}})}catch{}}function Ws({CORE:t,onApply:e}){var a,n,o;(a=document.getElementById("btnSupQR"))==null||a.addEventListener("click",()=>{t.state.currentModule==="SUPERVISOR"&&zs({onDecodedDone:()=>e==null?void 0:e()}).catch(()=>{})}),(n=document.getElementById("btnCloseQR"))==null||n.addEventListener("click",()=>Ke()),(o=document.getElementById("qrModal"))==null||o.addEventListener("click",async i=>{i.target===document.getElementById("qrModal")&&await Ke()})}function Gs({CORE:t,escapeHtml:e,onApply:a}){const n={MIN_CHARS:3,DEBOUNCE_MS:750,LIMIT:12};let o=null,i=null,s=[],r=!1,c=-1,l="";function d(){return document.getElementById("supNameSuggest")}function p(){const R=d();R&&(r=!1,c=-1,s=[],R.classList.add("hidden"),R.innerHTML="")}function b(){const R=d();if(R){if(!s.length)return p();R.innerHTML=s.map((x,q)=>{const W=q===c?"active":"",D=x.name||x.email||x.id||"",w=x.email?x.email:"";return`
        <div class="vsItem ${W}" data-idx="${q}" role="option" aria-selected="${q===c}">
          <div class="vsVin">${e(D)}</div>
          <div class="vsHint">${e(w)}</div>
        </div>
      `}).join(""),R.classList.remove("hidden"),r=!0}}function y(R){c=Math.max(0,Math.min(R,s.length-1)),b();const x=d(),q=x==null?void 0:x.querySelector(`.vsItem[data-idx="${c}"]`);q&&q.scrollIntoView({block:"nearest"})}async function m(R){var w;try{(w=i==null?void 0:i.abort)==null||w.call(i)}catch{}i=new AbortController;const x=`/api/name-suggest?q=${encodeURIComponent(R)}&limit=${encodeURIComponent(n.LIMIT)}`,W=await(await fetch(x,{signal:i.signal})).json();return W!=null&&W.ok?(Array.isArray(W.items)?W.items:[]).map(vt=>typeof vt=="string"?{name:vt}:vt).filter(Boolean):[]}function _(R){const x=document.getElementById("supName");if(!x)return;const q=String((R==null?void 0:R.name)||(R==null?void 0:R.email)||(R==null?void 0:R.id)||"").trim();x.value=q,p(),a==null||a()}function L(){if(t.state.currentModule!=="SUPERVISOR")return;const R=document.getElementById("supName");if(!R)return;const x=String(R.value||"").trim();if(l=x,!x||x.length<n.MIN_CHARS){p();return}clearTimeout(o),o=setTimeout(async()=>{try{const q=await m(x);if(l!==x)return;s=q,c=s.length?0:-1,b()}catch{p()}},n.DEBOUNCE_MS)}function j(R){if(t.state.currentModule==="SUPERVISOR"){if(R.key==="Enter"){R.preventDefault(),p(),a==null||a();return}if(r){if(R.key==="ArrowDown")return R.preventDefault(),y(c+1);if(R.key==="ArrowUp")return R.preventDefault(),y(c-1);if(R.key==="Escape")return R.preventDefault(),p();R.key==="Tab"&&c>=0&&s[c]&&(R.preventDefault(),_(s[c]))}}}const at=document.getElementById("supName"),ut=document.getElementById("supNameSuggest");at==null||at.addEventListener("input",L),at==null||at.addEventListener("keydown",j),ut==null||ut.addEventListener("mousedown",R=>{const x=R.target.closest(".vsItem[data-idx]");if(!x)return;R.preventDefault();const q=Number(x.dataset.idx),W=s[q];W&&_(W)}),document.addEventListener("click",R=>{if(!r)return;const x=document.querySelector(".supNameWrap");x&&x.contains(R.target)||p()})}function We(t){return String(t).padStart(2,"0")}function Ra(t){const e=t.getFullYear(),a=We(t.getMonth()+1),n=We(t.getDate());return`${e}-${a}-${n}`}function Ys(t){const e=t.getFullYear(),a=We(t.getMonth()+1);return`${e}-${a}`}function Js({onApply:t}){var e,a,n;(e=document.getElementById("btnSupHoy"))==null||e.addEventListener("click",()=>{const i=Ra(new Date),s=document.getElementById("supFrom"),r=document.getElementById("supTo");s&&(s.value=i),r&&(r.value=i);const c=document.getElementById("supMonth");c&&(c.value=""),t==null||t()}),(a=document.getElementById("btnSupAyer"))==null||a.addEventListener("click",()=>{const o=new Date;o.setDate(o.getDate()-1);const i=Ra(o),s=document.getElementById("supFrom"),r=document.getElementById("supTo");s&&(s.value=i),r&&(r.value=i);const c=document.getElementById("supMonth");c&&(c.value=""),t==null||t()}),(n=document.getElementById("btnSupEsteMes"))==null||n.addEventListener("click",()=>{const i=Ys(new Date),s=document.getElementById("supMonth");s&&(s.value=i);const r=document.getElementById("supFrom"),c=document.getElementById("supTo");r&&(r.value=""),c&&(c.value=""),t==null||t()})}let Ct="CONVERSION",Zs=null;function Xs(t){Ct=t==="CALIDAD"||t==="RAMAL"?t:"CONVERSION",document.querySelectorAll("[data-suptrack]").forEach(a=>a.classList.toggle("active",a.dataset.suptrack===Ct));const e=document.getElementById("supTrackPill");e&&(e.textContent=Ct==="CONVERSION"?"CONVERSIÓN (MOTOR + TANQUE)":Ct==="CALIDAD"?"CALIDAD":"RAMAL"),yt().catch(()=>{})}async function yt(){var c,l,d,p,b;const t=String(((c=document.getElementById("supName"))==null?void 0:c.value)||"").trim(),e=String(((l=document.getElementById("supVin"))==null?void 0:l.value)||"").trim().toUpperCase(),a=String(((d=document.getElementById("supFrom"))==null?void 0:d.value)||"").trim(),n=String(((p=document.getElementById("supTo"))==null?void 0:p.value)||"").trim(),o=String(((b=document.getElementById("supMonth"))==null?void 0:b.value)||"").trim(),i=[t,e].filter(Boolean).join(" ").trim(),s=`/api/supervisor/report?name=${encodeURIComponent(t)}&vin=${encodeURIComponent(e)}&q=${encodeURIComponent(i)}&from=${encodeURIComponent(a)}&to=${encodeURIComponent(n)}&month=${encodeURIComponent(o)}&track=${encodeURIComponent(Ct)}`,r=await Ie(s,"Cargando reporte...");if(!(r!=null&&r.ok)){const y=document.getElementById("supSummary");y&&(y.textContent=(r==null?void 0:r.error)||"Error cargando reporte.");const m=document.getElementById("supTable");m&&(m.innerHTML="");const _=document.getElementById("supAvgCard");_&&(_.innerHTML="");return}tr(r)}function tr(t){var q,W;const e=document.getElementById("supSummary"),a=document.getElementById("supTable"),n=document.getElementById("supAvgCard"),o=Array.isArray(t.items)?t.items:[],i=String(((q=document.getElementById("supMarca"))==null?void 0:q.value)||"ALL").toUpperCase(),r=o.filter(D=>ws(D,i)),c=String(((W=document.getElementById("supName"))==null?void 0:W.value)||"").trim(),d=!!!c&&Ct==="CONVERSION"?Vs(r):r,b=o.filter(D=>{const w=String(D.rol||D.rolTrabajo||"").toUpperCase();return w==="RAMALERO"||w==="RAMAL"||!de(D.estado)?!1:ht(D)>0}).map(D=>({...D,_track:Ct})),y=Ds(b,ht),m=[],_=new Set;for(const D of r){const w=String(D.rol||D.rolTrabajo||"").toUpperCase();if(w==="RAMALERO"||w==="RAMAL"||!de(D.estado))continue;const oe=ht(D);oe>0&&(m.push(oe),_.add(w))}let L="";_.size===1&&(L=[..._][0]);const j=Us(y,{track:Ct,rol:L,marca:i},4),at=Fs(m,j,{priorWeight:6,k:2.1}),ut=c||"Técnico";let R=0,x=0;for(const D of r){if(!de(D.estado))continue;const w=String(D.rol||D.rolTrabajo||"").toUpperCase();w==="TANQUE"||w==="TANQUERO"?x++:(w==="MOTOR"||w==="TECNICO"||w==="CONVERSION")&&R++}if(Qs(n,{stats:at,techName:ut,motorCount:R,tanqueCount:x,escapeHtml:T}),!!a){if(!r.length){e&&(e.textContent="Resultados: 0"),n&&(n.innerHTML=""),a.innerHTML='<div class="small">No hay resultados con esos filtros.</div>';return}e&&(e.textContent=`Resultados: ${r.length}`),Ps(a,{uiList:d,escapeHtml:T,fmtShort_:Nt})}}function er(){var t,e,a;document.querySelectorAll("[data-suptrack]").forEach(n=>n.addEventListener("click",()=>Xs(n.dataset.suptrack))),(t=document.getElementById("btnSupApply"))==null||t.addEventListener("click",()=>yt().catch(()=>{})),(e=document.getElementById("supMarca"))==null||e.addEventListener("change",()=>{u.state.currentModule==="SUPERVISOR"&&yt().catch(()=>{})}),(a=document.getElementById("btnSupClear"))==null||a.addEventListener("click",()=>{["supName","supVin","supFrom","supTo","supMonth"].forEach(n=>{const o=document.getElementById(n);o&&(o.value="")}),yt().catch(()=>{})}),Cs({CORE:u,getJSON_user:Ie,escapeHtml:T,fmtShort_:Nt}),Js({onApply:()=>yt().catch(()=>{})}),Ws({CORE:u,onApply:()=>yt().catch(()=>{})}),Gs({CORE:u,escapeHtml:T,onApply:()=>yt().catch(()=>{})})}function nr(){u.state.currentModule="SUPERVISOR",window.__nameSuggestWarmed||(window.__nameSuggestWarmed=!0,fetch("/api/name-suggest?q=.&limit=200").catch(()=>{})),yt().catch(()=>{})}function ar(){clearTimeout(Zs)}function or(){u.state.currentModule="ADMIN"}let ir=null;function sr(t){return String(t||"").trim().toUpperCase()}function Ea(t){return sr((t==null?void 0:t.vin)||(t==null?void 0:t.chasis_id)||(t==null?void 0:t.chasisId)||(t==null?void 0:t.VIN)||(t==null?void 0:t.CHASIS_ID))}function wt(t){if(!t)return NaN;const e=Date.parse(t);return Number.isFinite(e)?e:NaN}function rr(t){return wt(t==null?void 0:t.fecha_fin)||wt(t==null?void 0:t.updated_at)||wt(t==null?void 0:t.fechaFin)||wt(t==null?void 0:t.fecha_inicio)||wt(t==null?void 0:t.created_at)||wt(t==null?void 0:t.fecha_creacion)||NaN}function cr(t){const e=(t==null?void 0:t.fecha_fin)||(t==null?void 0:t.updated_at)||(t==null?void 0:t.fechaFin)||(t==null?void 0:t.fecha_inicio)||(t==null?void 0:t.created_at)||(t==null?void 0:t.fecha_creacion)||"";return e?Nt(e):"—"}async function La(t){const e=`/api/supervisor/report?name=&vin=&q=&from=&to=&month=&track=${encodeURIComponent(t)}`,a=await Ie(e,`Cargando ${t}...`);if(!(a!=null&&a.ok))throw new Error((a==null?void 0:a.error)||`No se pudo cargar ${t}`);return Array.isArray(a.items)?a.items:[]}function lr(t,e=[]){const a=new Set;for(const i of e){const s=Ea(i);s&&a.add(s)}const n=new Map;for(const i of t){const s=Ea(i);if(!s||!de(i==null?void 0:i.estado))continue;const r=rr(i),c=n.get(s);(!c||r>c._sortMs)&&n.set(s,{vin:s,fechaLabel:cr(i),_sortMs:Number.isFinite(r)?r:0})}const o=[];for(const i of n.values())a.has(i.vin)||o.push(i);return o.sort((i,s)=>i._sortMs-s._sortMs),o}function dr(t,e={}){const a=document.getElementById("movSummary"),n=document.getElementById("movTable");if(!n)return;const o=e!=null&&e.warn?`
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
  `}async function ko(){const t=document.getElementById("movSummary"),e=document.getElementById("movTable");try{t&&(t.textContent="Cargando pendientes..."),e&&(e.innerHTML="");const a=await La("CONVERSION");let n=[],o="";try{n=await La("CALIDAD")}catch(s){console.warn("MOVILIZADOR: no se pudo cargar CALIDAD",s),o="No se pudo validar CALIDAD. Se muestran conversiones finalizadas sin excluir registros de calidad."}const i=lr(a,n);dr(i,{warn:o})}catch(a){t&&(t.textContent=(a==null?void 0:a.message)||"Error cargando vista MOVILIZADOR."),e&&(e.innerHTML="")}}function ur(){var t;(t=document.getElementById("btnMovRefresh"))==null||t.addEventListener("click",()=>{ko().catch(()=>{})})}function pr(){u.state.currentModule="MOVILIZADOR",ko().catch(()=>{})}function Do(){clearTimeout(ir)}const Ma=document.getElementById("appRoot");Ma&&(Ma.innerHTML=di());async function Uo(t){if(!t)return ue("Pon tu email.");const e=await Ie(`/api/me?email=${encodeURIComponent(t)}`,"Iniciando sesión...");if(!(e!=null&&e.ok))return ue((e==null?void 0:e.error)||"No se pudo iniciar sesión.");u.state.currentProfile=e.profile,yi(t),gi(),vi(),mi(),u.state.rolLock=bi(u.state.currentProfile),he();const a=$a(u.state.currentProfile);pi(),a.length>1?($t(),Ua(a,n=>Ge(n)),u.state.currentModule=null):Ge(a[0])}function Ge(t){Ft(),Rt(t),u.state.currentModule=t,$t();const e=document.getElementById(`view${t}`);e&&(e.style.display="block");const a=g("viewHub");a&&(a.style.display="none"),he()}Rt.register("TECNICO",()=>Eo("TECNICO"),()=>ge("TECNICO"));Rt.register("CALIDAD",()=>Eo("CALIDAD"),()=>ge("CALIDAD"));Rt.register("RAMALERO",()=>xs(),()=>Lo());Rt.register("SUPERVISOR",()=>nr(),()=>ar());Rt.register("ADMIN",()=>or(),()=>void 0);Rt.register("MOVILIZADOR",()=>pr(),()=>Do());Es();Os();er();ur();Wa();var Ta;(Ta=g("btnTheme"))==null||Ta.addEventListener("click",Si);var Na;(Na=g("btnRegistroFallas"))==null||Na.addEventListener("click",()=>{var e,a,n,o,i,s;$t(),g("viewHub")&&(g("viewHub").style.display="none");const t=((a=(e=g("vin"))==null?void 0:e.value)==null?void 0:a.trim())||((o=(n=g("vinQ"))==null?void 0:n.value)==null?void 0:o.trim())||((s=(i=g("supVin"))==null?void 0:i.value)==null?void 0:s.trim())||"";Xe({vin:t,screen:"menu"})});var Oa;(Oa=g("btnGoHome"))==null||Oa.addEventListener("click",()=>{const t=$a(u.state.currentProfile);Ft(),$t(),Ua(t,e=>Ge(e)),u.state.currentModule=null});var xa;(xa=g("btnMe"))==null||xa.addEventListener("click",async()=>{const t=Zt();await Uo(t)});var ka;(ka=g("btnLogout"))==null||ka.addEventListener("click",()=>{var t,e,a;Ci(),g("email").value="",u.state.currentProfile=null,u.state.currentModule=null,ge("TECNICO"),ge("CALIDAD"),Lo(),Do(),$t(),g("viewHub").style.display="none",(t=g("btnGoHome"))==null||t.classList.add("hidden"),(e=document.getElementById("debugWrap"))==null||e.classList.add("debug-hidden"),(a=document.getElementById("viewUploader"))!=null&&a.style&&(document.getElementById("viewUploader").style.display="none"),ue("Sesión cerrada.")});window.addEventListener("load",async()=>{Ii();const t=hi();if(!t)return ue("");g("email").value=t,await Uo(t)});
