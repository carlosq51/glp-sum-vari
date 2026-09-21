// =========================
// public/js/templates/views/uploader-view.js
// Template HTML: uploader GLP (parámetros, fallas, calidad, conformidad)
// =========================

/**
 * tarjetaFoto_ — una tarjeta, una foto, una subida.
 *
 * Antes cada slot repetía estas veinte líneas a mano, y las cuatro tomas de
 * compresión (y las cuatro de calidad) compartían UNA tarjeta con un solo
 * botón: la foto caía en "el primer casillero libre". Cuando la cuarta fallaba
 * —que es lo normal en el taller, con el celular colgado de una barra de
 * señal— el casillero seguía ocupado por la foto que no subió, el siguiente
 * disparo iba a parar a otro cilindro, y la única salida limpia era "Borrar",
 * que limpiaba las cuatro. Cuatro fotos de nuevo por una que falló.
 *
 * Con una tarjeta por foto, el reintento es de ESA foto y con EL MISMO archivo:
 * el técnico no tiene que volver a abrir el capó.
 */
function tarjetaFoto_({ slot, label, nota = "", vacio = "Sin foto", mini = false }) {
  const idc = `up_${slot}`;
  return `
    <div class="slotCard${mini ? " slotCard--mini" : ""}" data-slot="${slot}">
      <label>${label}${nota ? ` <span class="upNota">${nota}</span>` : ""}</label>

      <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" capture="environment" id="${idc}_cam">
      <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" id="${idc}_file">

      <div class="slotActions upActions">
        <button class="btnUp" type="button" data-pick="cam" data-slot="${slot}">
          <span class="ico">📷</span><span>Foto</span>
        </button>
        <button class="btnUp" type="button" data-pick="file" data-slot="${slot}">
          <span class="ico">📁</span><span>Cargar</span>
        </button>
        <button class="btnUp btnUp-retry" type="button" data-retry="1" data-slot="${slot}">
          <span class="ico">🔁</span><span>Reintentar</span>
        </button>
        <button class="btnUp btnUp-danger" type="button" data-clear="1" data-slot="${slot}">
          <span class="ico">🗑️</span><span>Borrar</span>
        </button>
      </div>

      <div class="upMini">
        <div class="thumb upFoto" id="${idc}_previewBox"><span class="small">${vacio}</span></div>
        <div class="miniInfo" id="${idc}_meta">Ningún archivo seleccionado.</div>
      </div>
    </div>`;
}

/**
 * grupoFotos_ — varias tarjetas que el técnico lee como UN paso.
 *
 * La prueba de compresión son cuatro tomas de un mismo paso: nombrarlas
 * "Cilindro 1..4" bajo un título común es lo que hace que "falta el 3" sea una
 * frase con sentido. El pie (`#up_<id>_grupoMeta`) lleva la cuenta del grupo,
 * que es lo que antes hacía el `comp_meta` compartido.
 */
function grupoFotos_({ id, label, nota = "", slots = [], pie = "" }) {
  return `
    <div class="slotGroup" data-grupo="${id}">
      <label class="slotGroupLabel" id="up_${id}_grupoLabel">${label}${
        nota ? ` <span class="upNota">${nota}</span>` : ""
      }</label>
      <div class="upSlotsGrid">
        ${slots.map(tarjetaFoto_).join("")}
      </div>
      <div class="miniInfo" id="up_${id}_grupoMeta">${pie}</div>
    </div>`;
}

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

            <div class="menuCard">
              <p class="menuTitle">Fotos de soldadura</p>
              <p class="menuDesc">4 fotos: sensor de nivel y cabina (antes/después de soldar).</p>
              <button class="btn" id="up_goSoldadura">Entrar</button>
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
              <button class="btn3" id="up_btnRefresh">🔄 Refrescar estado</button>
            </div>
          </div>

          <!-- Resumen de avance.
               La pregunta que el técnico trae al abrir esta pantalla es "¿qué
               me falta?", y hasta ahora se contestaba con un muro de texto al
               final de todo, después de nueve tarjetas de scroll. Aquí va
               arriba, en una línea, y con los faltantes nombrados. -->
          <div class="upResumen" id="up_resumen" aria-live="polite">
            <div class="upResumenFila">
              <span class="upResumenCuenta" id="up_resumenCuenta">— / 9</span>
              <span class="upResumenFaltan" id="up_resumenFaltan">Escanea un VIN para ver el avance.</span>
            </div>
            <div class="upBarra"><div class="upBarraLleno" id="up_resumenBarra"></div></div>
          </div>

          <h3>Fotos del registro</h3>

          <div class="box grid">

            ${tarjetaFoto_({ slot: "vin", label: "1 · Foto del VIN" })}

            ${grupoFotos_({
              id: "comp",
              label: "2 · Compresión",
              nota: "(4 tomas)",
              pie: "0/4 tomas guardadas.",
              slots: [1, 2, 3, 4].map((n) => ({
                slot: `comp_${n}`,
                label: `Cilindro ${n}`,
                vacio: String(n),
                mini: true,
              })),
            })}

            ${tarjetaFoto_({ slot: "corr_pre",   label: "3 · Amperaje antes" })}
            ${tarjetaFoto_({ slot: "corr_post",  label: "4 · Amperaje después" })}
            ${tarjetaFoto_({ slot: "voltaje",    label: "5 · Voltaje" })}
            ${tarjetaFoto_({ slot: "scan_carro", label: "6 · Scan del carro" })}


          </div>

          <!-- El botón grande "REFRESCAR ESTADO" que había aquí hacía
               exactamente lo mismo que el btn3 de arriba, pero con el aspecto
               del botón de confirmar de las otras pantallas: leído rápido
               parecía el "enviar" que cierra el registro, y no lo era. Cada
               foto ya se sube sola al tomarla; esta pantalla no tiene envío. -->
          <h3>Detalle</h3>
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

              <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" capture="environment" id="up_falla_cam">
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

            ${grupoFotos_({
              id: "qc",
              label: "Fotos de calidad",
              nota: "(mín 3, máx 4)",
              pie: "0/4 guardadas. Cada foto se sube sola al tomarla.",
              slots: [1, 2, 3, 4].map((n) => ({
                slot: `calidad_${n}`,
                label: `Foto ${n}`,
                vacio: String(n),
                mini: true,
              })),
            })}

            <!-- Ya no hay "ENVIAR CALIDAD": cada foto se subía sola al tomarla
                 Y ADEMÁS el botón las volvía a mandar las cuatro en un lote a
                 la misma ruta de R2. Subía todo dos veces, y si el lote fallaba
                 (bastaba una foto) el mensaje decía que no se había guardado
                 nada, cuando en realidad ya estaba todo arriba. Este botón solo
                 comprueba que estén las mínimas y cierra la pantalla. -->
            <div class="row">
              <button class="btnPrimaryBig" id="up_btnQcListo">✅ TERMINAR CALIDAD</button>
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

              <input class="hiddenInput" type="file" accept="image/*,.heic,.heif" capture="environment" id="up_conf_cam">
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

              <div class="upMini">
                <div class="thumb upFoto" id="up_conf_previewBox"><span class="small">Sin foto</span></div>
                <div class="miniInfo" id="up_conf_meta">Ningún archivo seleccionado.</div>
              </div>
            </div>

            <div class="row">
              <button class="btnPrimaryBig" id="up_btnEnviarConf">✅ ENVIAR CONFORMIDAD</button>
            </div>
          </div>

          <div id="up_outConf" class="status">Listo.</div>
        </section>

        <!-- =========================
            PANTALLA 5: FOTOS DE SOLDADURA
            ========================= -->
        <section id="up_screenSoldadura" class="screen">
          <div class="topbar">
            <h2>Fotos de soldadura</h2>
            <button class="btn3" type="button" data-nav="menu">⬅ Volver</button>
          </div>

          <div class="box">
            <div class="row">
              <button class="btn" id="up_btnScanQR_sold">Escanear QR</button>
              <button class="btn" id="up_btnScanBAR_sold">Escanear CÓDIGO BARRAS</button>
              <button class="btn3" id="up_btnStop_sold" style="display:none;">Detener</button>
              <div class="small" id="up_scanMsg_sold"></div>
            </div>

            <div id="up_qrBox_sold" style="display:none; margin-top:10px;">
              <div class="small" id="up_scanMode_sold" style="margin-bottom:8px;"></div>
              <div id="up_qrReader_sold" class="qrReader"></div>
            </div>

            <div class="row">
              <label>VIN</label>
              <input id="up_soldVin" type="text" placeholder="Escanea o escribe VIN..." />
            </div>

            <div class="row">
              <label>Fecha</label>
              <input id="up_soldDate" type="date" />
            </div>
          </div>

          <h3>Fotos de soldadura (4)</h3>

          <div class="box grid">

            ${tarjetaFoto_({ slot: "sold_sensor_antes", label: "1 · Sensor de nivel", nota: "ANTES (ver soldadura)" })}
            ${tarjetaFoto_({ slot: "sold_sensor_post",  label: "2 · Sensor de nivel", nota: "DESPUÉS (con termocontraíble)" })}
            ${tarjetaFoto_({ slot: "sold_cabina_antes", label: "3 · Cabina", nota: "ANTES" })}
            ${tarjetaFoto_({ slot: "sold_cabina_post",  label: "4 · Cabina", nota: "DESPUÉS" })}


          </div>

          <div id="up_outSold" class="status">Listo.</div>
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