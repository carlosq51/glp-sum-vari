// =========================
// public/js/templates/views/ramalero-view.js
// Template HTML: vista del RAMALERO.
//
// EL ORDEN ES LA DECISIÓN DE DISEÑO
// ─────────────────────────────────
// Lo que el ramalero hace todo el día es ARMAR RAMALES. Antes eso estaba
// escondido detrás de un desplegable al fondo de la vista, debajo de la
// cola de solicitudes. Ahora abre la pantalla:
//
//   1. Armar ramal      · el trabajo. Un botón, marca ya elegida.
//   2. Mi caja          · solo aparece si tiene una caja o le toca turno.
//   3. Cola de ramales  · lo que le piden los técnicos.
//   4. Historial        · lo suyo, filtrable por marca.
//
// Y lo que se le quitó importa tanto como lo que se le puso:
//
//   · El RAMAL_ID ya no se muestra. Era un campo de solo lectura con un
//     UUID que nadie puede escribir, cambiar ni recordar. Ocupaba un
//     tercio de la fila de armado para no decir nada.
//   · Las estadísticas de «entregados hoy» y «espera promedio» bajaron al
//     final de su tarjeta. Son del supervisor; al ramalero le importa
//     cuántos tiene en cola, no cuál fue la espera media.
// =========================

export function ramaleroView() {
  return `
    <!-- =========================
         RAMALERO
         ========================= -->
    <div id="viewRAMALERO" style="display:none;">

      <!-- ── 1. ARMAR RAMAL · el trabajo del día, al frente ──────────── -->
      <div class="card ramArmar">
        <div class="sectionHead" style="margin-bottom:10px;">
          <h3 class="sectionHead__title" style="margin:0;">
            <span class="accentBar"></span>⚙️ Armar ramal
          </h3>
        </div>

        <div class="ramArmar__row">
          <select id="tipoRamal" class="ramArmar__tipo" aria-label="Marca del ramal">
            <!-- JETOUR viene marcado porque es la mayoría del trabajo: el
                 caso común no debería costar un clic extra todos los días. -->
            <option value="JETOUR" selected>JETOUR</option>
            <option value="VOLKSWAGEN">VOLKSWAGEN</option>
            <option value="KYC V3">KYC V3</option>
            <option value="KYC V5">KYC V5</option>
            <option value="KYC V7">KYC V7</option>
            <option value="KYC X5">KYC X5</option>
          </select>

          <button id="btnRamalNuevo" class="btnInicio ramArmar__btn" title="Empezar un ramal nuevo">
            EMPEZAR RAMAL
          </button>
        </div>

        <div style="margin-top:14px;">
          <div class="ramArmar__label">En curso</div>
          <div id="activasBoxR"></div>
        </div>
      </div>

      <!-- ── 2. MI CAJA · turno de desembalaje y ramales por devolver ── -->
      <div class="card" id="ramalMiTurnoCard" style="margin-top:12px;">
        <h3 style="margin:0 0 8px;">
          <span class="accentBar"></span>📦 Mi caja
        </h3>
        <div id="ramalMiTurnoBody"></div>
      </div>

      <!-- ── 3. COLA DE RAMALES · lo que piden los técnicos ──────────── -->
      <div class="card" style="margin-top:12px;">
        <div class="sectionHead" style="margin-bottom:10px;">
          <h3 class="sectionHead__title" style="margin:0;">
            <span class="accentBar"></span>🔩 Cola de ramales
          </h3>
          <span id="solLiveDot" class="small" style="display:inline-flex;align-items:center;gap:6px;color:var(--ok);font-weight:800;">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--ok);animation:softPulse 1.6s ease-in-out infinite;"></span>EN VIVO
          </span>
        </div>

        <!-- Lo único que el ramalero necesita saber de un vistazo: cuántos
             le están esperando. El resto de cifras va al pie. -->
        <div class="ramCola__head">
          <div class="ramCola__pend">
            <span class="ramCola__pendN" id="solStatPend">—</span>
            <span class="ramCola__pendT">en cola</span>
          </div>
        </div>

        <!-- Las entregas pendientes: el trabajo concreto -->
        <div id="solQueueBox"></div>

        <!-- Entregados hoy (colapsable) -->
        <button type="button" id="solEntregadosToggle" class="small" style="
          width:100%;margin-top:10px;background:var(--pillBg);border:1px solid var(--pillLine);
          border-radius:var(--radiusSm);padding:8px 12px;color:var(--muted);cursor:pointer;
          display:flex;align-items:center;gap:8px;font-weight:800;
        ">
          <span>✅ Entregados hoy</span>
          <span id="solEntregadosCount" class="pill small" style="margin-left:auto;">0</span>
          <span id="solEntregadosChev">▶</span>
        </button>
        <div id="solEntregadosBox" style="display:none;margin-top:8px;"></div>

        <!-- Estadística del día — al final, que es donde le corresponde:
             es información de supervisión, no de trabajo. -->
        <div class="ramCola__stats">
          <span class="ramCola__stat">
            <span class="ramCola__statK">Entregados hoy</span>
            <span class="ramCola__statV" id="solStatEntr">—</span>
          </span>
          <span class="ramCola__stat">
            <span class="ramCola__statK">Espera promedio</span>
            <span class="ramCola__statV" id="solStatWait">—</span>
          </span>
        </div>
      </div>

      <!-- ── 4. HISTORIAL · lo que ya armó, filtrable por marca ──────── -->
      <div class="card" style="margin-top:12px;">
        <button type="button" id="ramalHistToggle" style="
          width:100%;background:none;border:none;padding:0;color:inherit;cursor:pointer;
          display:flex;align-items:center;gap:8px;text-align:left;
        ">
          <h3 style="margin:0;flex:1;">📜 Mi historial</h3>
          <span id="ramalHistChev">▼</span>
        </button>

        <div id="ramalHistBody" style="display:none;margin-top:12px;">
          <!-- Filtro por marca: el ramalero quiere ver «cuántos Jetour llevo»,
               y sin esto tenía que contarlos a ojo en una lista mezclada. -->
          <div class="ramFiltro" id="ramalHistFiltro">
            <button type="button" class="ramFiltro__b is-on" data-marca="">Todas</button>
            <button type="button" class="ramFiltro__b" data-marca="JETOUR">JETOUR</button>
            <button type="button" class="ramFiltro__b" data-marca="VOLKSWAGEN">VOLKSWAGEN</button>
            <button type="button" class="ramFiltro__b" data-marca="KYC V3">KYC V3</button>
            <button type="button" class="ramFiltro__b" data-marca="KYC V5">KYC V5</button>
            <button type="button" class="ramFiltro__b" data-marca="KYC V7">KYC V7</button>
            <button type="button" class="ramFiltro__b" data-marca="KYC X5">KYC X5</button>
          </div>

          <div class="ramFiltro__cuenta" id="ramalHistCuenta"></div>

          <div id="finalizadosWrapR" style="display:none;">
            <div id="finalizadosBoxR"></div>
          </div>
        </div>
      </div>

      <!-- El botón de refrescar deja de ocupar sitio propio: el SSE ya
           refresca solo y el gesto de tirar hacia abajo recarga. Se
           mantiene oculto porque ramalero-actions.js lo escucha. -->
      <button id="btnActivasR" type="button" hidden></button>
      <button id="btnFinalizadosR" type="button" hidden></button>

    </div>
  `;
}
