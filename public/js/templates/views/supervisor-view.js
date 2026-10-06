// public/js/templates/views/supervisor-view.js
import { icon } from "../../core/icons.js";

export function supervisorView() {
  return `
    <div id="viewSUPERVISOR" class="card" style="display:none;">

      <!-- Misma cabecera que Admin: era un <h3> suelto, la única vista de la
           app sin identidad propia arriba. -->
      <div class="adminHero">
        <span class="adminHeroIcon" aria-hidden="true">${icon("target", 22)}</span>
        <div>
          <h3 class="adminHeroTitle">Supervisor</h3>
          <div class="adminHeroSub">Producción, incidencias y control del taller</div>
        </div>
      </div>

      <!-- Pestañas principales: REPORTE / LIVE / CONTROL / INCIDENCIAS / RAMALES.
           VALIDAR (¿está este VIN en el sistema?) se quitó el 2026-09-12: el
           supervisor no la usaba, y la misma respuesta sale buscando el VIN
           en OTs. -->
      <div class="sup-tab-row">
        <button type="button" class="btn sup-tab" data-suptab="REPORTE">${icon("chart", 14)} REPORTE</button>
        <button type="button" class="btn sup-tab active" data-suptab="LIVE">${icon("radio", 14)} LIVE</button>
        <button type="button" class="btn sup-tab" data-suptab="CONTROL">${icon("clipboardList", 14)} OTs</button>
        <button type="button" class="btn sup-tab" data-suptab="INCIDENCIAS">${icon("alertTriangle", 14)} INCID.</button>
        <button type="button" class="btn sup-tab" data-suptab="RAMALES">${icon("box", 14)} RAMALES</button>
        <button type="button" class="btn sup-tab" data-suptab="IMPRESIONES">${icon("inbox", 14)} IMPRESIÓN</button>
        <button type="button" class="btn sup-tab" data-suptab="AVISOS">${icon("bell", 14)} AVISOS</button>
      </div>

      <!-- ══════════════════════════════════════════════
           PANEL REPORTE (contenido anterior)
      ══════════════════════════════════════════════ -->
      <div id="supPanelReporte" style="display:none;">

        <!-- Bloque 1 — qué se quiere ver. Antes era una línea de "Filtros
             opcionales: …" y siete controles sueltos uno debajo de otro y sin
             etiqueta: los dos campos de fecha no decían cuál era el desde y
             cuál el hasta hasta que los abrías. -->
        <section class="dataBlock supRepBlock" style="--tone:var(--accent);">
          <div class="dataBlock__hdr">
            <span class="dataBlock__icon" aria-hidden="true">${icon("sliders", 22)}</span>
            <div class="dataBlock__text">
              <span class="dataBlock__title">Qué quieres ver</span>
              <span class="dataBlock__sub">Elige el tipo de trabajo; lo de abajo es opcional</span>
            </div>
          </div>
          <div class="dataBlock__body">
            <div class="supTrackRow">
              <button type="button" class="btn" data-suptrack="CONVERSION">CONVERSIÓN</button>
              <button type="button" class="btn" data-suptrack="CALIDAD">CALIDAD</button>
              <button type="button" class="btn" data-suptrack="RAMAL">RAMAL</button>
            </div>
            <div id="supTrackPill" class="pill small" style="text-align:center;">
              CONVERSIÓN (MOTOR + TANQUE)
            </div>

            <div class="fullStack" style="margin-top:12px;">
              <div class="supField">
                <label class="supFieldLabel" for="supName">Persona y marca</label>
                <div class="supNameWrap" style="display:flex; gap:10px; align-items:center;">
                  <input id="supName" type="text" placeholder="Nombre o correo…" autocomplete="off" style="flex:1;" />
                  <select id="supMarca" class="supSelect" title="Filtrar por marca">
                    <option value="ALL">TODOS</option>
                    <option value="KYC">KYC</option>
                    <option value="JETOUR">JETOUR</option>
                    <option value="VW">VOLKSWAGEN</option>
                  </select>
                  <div id="supNameSuggest" class="nameSuggest hidden" role="listbox"></div>
                </div>
              </div>

              <div class="supField">
                <label class="supFieldLabel" for="supVin">VIN</label>
                <div class="supVinRow">
                  <div class="supVinWrap">
                    <input id="supVin" type="text" placeholder="Buscar por VIN…" autocomplete="off" />
                    <div id="supVinSuggest" class="vinSuggest hidden" role="listbox"></div>
                  </div>
                  <button id="btnSupQR" type="button" title="Escanear VIN con cámara">${icon("camera", 16)}</button>
                </div>
              </div>

              <div class="supDateRow">
                <div class="supField">
                  <label class="supFieldLabel" for="supFrom">Desde</label>
                  <input id="supFrom" type="date" />
                </div>
                <div class="supField">
                  <label class="supFieldLabel" for="supTo">Hasta</label>
                  <input id="supTo" type="date" />
                </div>
                <button id="btnSupAyer" type="button" class="btn3" title="Rango: Ayer">AYER</button>
                <button id="btnSupHoy" type="button" class="btn3" title="Rango: Hoy">HOY</button>
              </div>

              <div class="supMonthRow">
                <div class="supField">
                  <label class="supFieldLabel" for="supMonth">O un mes completo</label>
                  <input id="supMonth" type="month" placeholder="Mes (YYYY-MM)" />
                </div>
                <button id="btnSupEsteMes" type="button" class="btn3" title="Filtrar por este mes">ESTE MES</button>
              </div>

              <div class="twoWide">
                <button id="btnSupApply">Aplicar filtros</button>
                <button id="btnSupClear">Limpiar</button>
              </div>
              <div style="text-align:right;margin-top:4px;">
                <button id="btnSupExportCsv" type="button" class="btn3" title="Exportar tabla actual como CSV">${icon("download", 14)} Exportar CSV</button>
              </div>
            </div>
          </div>
        </section>

        <div id="supAvgCard" style="margin-top:10px;"></div>

        <!-- Panel visual: UN gráfico con las cuatro preguntas en pestañas
             (por día / estado / técnicos / modelos). Lo arma sup-dashboard.js
             dentro de un .dataBlock, igual que los bloques de este panel. -->
        <div id="supDashboard" style="display:none;"></div>

        <!-- Panel de KPIs -->
        <div id="supKPIsWrap">
          <button id="btnVerKPIs" type="button" class="btn-ver-kpis" style="display:none;">${icon("chart", 14)} VER KPIS</button>
          <div id="supKPIsPanel" style="display:none;"></div>
        </div>

        <!-- Gráfico de tendencias (solo cuando hay técnico seleccionado) -->
        <div id="supTrendContainer" class="supBox" style="display:none;">
          <div id="supTrendControls"></div>
          <!-- La ALTURA vive aquí, no en el canvas, y el wrap es position:relative.
               Con responsive + maintainAspectRatio:false, Chart.js dimensiona el
               canvas al contenedor; si el contenedor sacaba su altura del canvas
               y el canvas del contenedor, cada frame crecía un poco y el gráfico
               se "generaba" hacia abajo sin parar. Ese era el bug. -->
          <div id="supTrendCanvasWrap" style="display:none; position:relative; height:380px; width:100%;">
            <canvas id="supTrendChart"></canvas>
          </div>
          <div id="supTrendLectura" class="small" style="display:none; margin-top:10px; opacity:.9; line-height:1.5;"></div>
        </div>

        <!-- Comparación entre técnicos. Pregunta distinta a la del gráfico de
             arriba: no "¿estamos mejorando?" sino "¿cómo va cada uno frente a
             sus compañeros?", y para eso hay que mirar a la gente en paralelo,
             no al calendario. -->
        <div id="supTecnicosContainer" class="supBox" style="display:none;">
          <button id="btnComparaTecnicos" type="button" class="btn3">${icon("users", 14)} Comparar técnicos</button>
          <div id="supTecnicosPanel" style="display:none; margin-top:14px;"></div>
        </div>

        <!-- Bloque final — el detalle, trabajo por trabajo. Iba sin cabecera:
             después de los gráficos aparecían cien tarjetas sin que nada
             dijera qué eran ni de qué filtro salían. El resumen que antes era
             una línea gris suelta ahora es la bajada del bloque. -->
        <section class="dataBlock supRepBlock" style="--tone:var(--tone-slate);">
          <div class="dataBlock__hdr">
            <span class="dataBlock__icon" aria-hidden="true">${icon("listChecks", 22)}</span>
            <div class="dataBlock__text">
              <span class="dataBlock__title">Detalle</span>
              <span class="dataBlock__sub" id="supSummary">Un trabajo por tarjeta</span>
            </div>
          </div>
          <div class="dataBlock__body">
            <div id="supTable"></div>
          </div>
        </section>
      </div>

      <!-- ══════════════════════════════════════════════
           PANEL LIVE
      ══════════════════════════════════════════════ -->
      <div id="supPanelLive" style="display:none;">
        <div id="liveContainer" style="margin-top:10px;"></div>
      </div>

      <!-- ══════════════════════════════════════════════
           PANEL CONTROL — OTs en vivo (busca, edita, pausa, elimina)
           Sustituye al antiguo panel UBICACIONES (solo lectura).
      ══════════════════════════════════════════════ -->
      <div id="supPanelOtControl" style="display:none;">

        <div class="otCtrlBar">
          <div class="supVinWrap">
            <input id="otCtrlVin" type="text" placeholder="Buscar OT por VIN…"
              autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" />
            <div id="otCtrlVinSuggest" class="vinSuggest hidden" role="listbox"></div>
          </div>
          <button id="btnOtCtrlBuscar" type="button" class="btn3" title="Buscar">${icon("search", 15)}</button>
          <button id="btnOtCtrlNueva" type="button" class="btn3" title="Crear una OT">${icon("plus", 15)} Nueva OT</button>
          <!-- Parada de taller. El texto y el color los pone sup-ot-control.js
               según haya o no pausa global activa: es un mismo botón que
               alterna, porque "pausar" y "reanudar" nunca aplican a la vez. -->
          <button id="btnOtCtrlPausaTodo" type="button" class="btn3 otCtrlPausaTodo"
            title="Pausar todas las OTs que estén trabajando ahora mismo">⏸ Pausar todas</button>
        </div>

        <div class="lvBar" style="margin-top:10px;">
          <span class="lvBar__date">OTs en vivo</span>
          <span id="otCtrlLastUpdate" class="lvBar__ago"></span>
          <button type="button" id="btnOtCtrlRefresh" class="lvBar__btn" title="Actualizar ahora">↻</button>
        </div>

        <div id="otCtrlMsg" class="small muted" style="margin:6px 2px;"></div>
        <div id="otCtrlBody"></div>
      </div>

      <!-- ══════════════════════════════════════════════
           PANEL INCIDENCIAS — Reporte global
      ══════════════════════════════════════════════ -->
      <div id="supPanelIncidencias" style="display:none;">

        <!-- Barra de filtros -->
        <div class="inc-rep-filters" style="margin-top:10px;">
          <div class="supDateRow">
            <input id="incRepFrom" type="date" title="Desde" />
            <input id="incRepTo" type="date" title="Hasta" />
            <button id="btnIncRepHoy" type="button" class="btn3">HOY</button>
            <button id="btnIncRepMes" type="button" class="btn3">MES</button>
          </div>

          <div class="inc-rep-tipo-row" style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
            <button type="button" class="btn3 inc-rep-tipo active" data-tipo="ALL">TODOS</button>
            <button type="button" class="btn3 inc-rep-tipo" data-tipo="CRITICA" data-grav="critica">CRÍTICA</button>
            <button type="button" class="btn3 inc-rep-tipo" data-tipo="MODERADA" data-grav="moderada">MODERADA</button>
            <button type="button" class="btn3 inc-rep-tipo" data-tipo="LEVE" data-grav="leve">LEVE</button>
          </div>

          <div style="display:flex; gap:8px; margin-top:8px; align-items:center;">
            <input id="incRepQ" type="text" placeholder="Buscar por VIN, técnico o nota..." autocomplete="off" style="flex:1;" />
            <button id="btnIncRepApply" type="button" class="btn">Buscar</button>
            <button id="btnIncRepExport" type="button" class="btn3" title="Descargar CSV">⬇️ CSV</button>
          </div>
        </div>

        <!-- KPI pills -->
        <div id="incRepKpis" style="display:none; margin-top:12px;"></div>

        <!-- Ranking tables -->
        <div id="incRepRanking" style="display:none; margin-top:10px;"></div>

        <!-- Lista de incidencias -->
        <div id="incRepList" style="margin-top:10px;"></div>
      </div>

      <!-- ══════════════════════════════════════════════
           PANEL RAMALES — equipos del día, reparto, producción y stock
           El panel lo pinta views/ramales/ramales.js, el mismo que sirve
           la página /ramales: una sola implementación en dos marcos.
      ══════════════════════════════════════════════ -->
      <div id="supPanelRamales" style="display:none;">
        <div id="supRamalesBody" style="margin-top:10px;"></div>
      </div>

      <!-- ══════════════════════════════════════════════
           IMPRESIONES — los informes que mandaron los técnicos desde el
           taller, esperando a que alguien los imprima. Es el mismo módulo
           que la sección Impresiones del panel de Admin.
      ══════════════════════════════════════════════ -->
      <div id="supPanelImpresiones" style="display:none;">
        <div id="supImpresionesBody" style="margin-top:10px;"></div>
      </div>

      <!-- ══════════════════════════════════════════════
           AVISOS — anuncios por voz al taller (limpieza, reunión, texto
           libre). Lo pinta views/supervisor/sup-avisos.js.
      ══════════════════════════════════════════════ -->
      <div id="supPanelAvisos" style="display:none;">
        <div id="supAvisosBody" style="margin-top:10px;"></div>
      </div>
    </div>
  `;
}

// Modal de crear/editar OT del panel CONTROL. Vive fuera de viewSUPERVISOR
// porque un position:fixed dentro de un padre display:none infla el scroll
// en WebKit.
export function supOtControlModal() {
  return `
    <div id="otCtrlModal" class="modal" aria-hidden="true">
      <div class="modalBox adminModalBox">
        <div class="modalHead">
          <span id="otCtrlModalTitle" class="modalTitle"></span>
          <button id="btnOtCtrlModalClose" type="button" title="Cerrar">✕</button>
        </div>
        <div class="modalBody" id="otCtrlModalBody"></div>
        <div class="adminModalFoot">
          <button id="btnOtCtrlModalCancel" type="button" class="adminBtnGhost">Cancelar</button>
          <button id="btnOtCtrlModalSave" type="button" class="adminBtnOk">Guardar</button>
        </div>
      </div>
    </div>
  `;
}

// Modal global — usado tanto en Supervisor como en Calidad
export function supIncModal() {
  return `
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
  `;
}

// Modal detalle LIVE — detalle del día de un técnico
export function liveDetailModal() {
  return `
    <div id="liveDetailModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div id="liveDetailTitle" class="modalTitle">Detalle del día</div>
          <button id="btnCloseLiveDetail" title="Cerrar">✕</button>
        </div>
        <div id="liveDetailBody" class="modalBody live-detail-body"></div>
      </div>
    </div>
  `;
}