// =========================
// public/js/templates/views/ramalero-view.js
// Template HTML: vista ramalero — cola de solicitudes al frente (en vivo)
// + armado de ramales como sección secundaria colapsable.
// =========================

export function ramaleroView() {
  return `
    <!-- =========================
         RAMALERO
         ========================= -->
    <div id="viewRAMALERO" style="display:none;">

      <!-- ── MI TURNO DE CAJA ────────────────────────────────────────────
           Va arriba de la cola porque cuando hay caja abierta ESO es lo
           urgente; cuando no hay nada se encoge a una línea y no estorba
           el trabajo del día, que es la cola de solicitudes. -->
      <div class="card" id="ramalMiTurnoCard" style="margin-bottom:12px;">
        <h3 style="margin:0 0 8px;">
          <span class="accentBar"></span>📦 Mi turno
        </h3>
        <div id="ramalMiTurnoBody"></div>
      </div>

      <!-- ── COLA DE SOLICITUDES (trabajo principal) ─────────────────── -->
      <div class="card">
        <div class="sectionHead" style="margin-bottom:8px;">
          <h3 class="sectionHead__title" style="margin:0;">
            <span class="accentBar"></span>🔩 Cola de ramales
          </h3>
          <span id="solLiveDot" class="small" style="display:inline-flex;align-items:center;gap:6px;color:var(--ok);font-weight:800;">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--ok);animation:softPulse 1.6s ease-in-out infinite;"></span>EN VIVO
          </span>
        </div>

        <!-- Stats del día -->
        <div class="dashGrid" id="solStatsBar" style="margin-bottom:10px;">
          <div class="statTile"><div class="statTile__label">⏳ En cola</div><div class="statTile__value" id="solStatPend">—</div></div>
          <div class="statTile"><div class="statTile__label">✅ Entregados hoy</div><div class="statTile__value" id="solStatEntr">—</div></div>
          <div class="statTile"><div class="statTile__label">⏱ Espera prom.</div><div class="statTile__value" id="solStatWait">—</div></div>
        </div>

        <!-- Cola pendiente -->
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
      </div>

      <!-- ── ARMADO DE RAMALES (secundario, colapsable) ──────────────── -->
      <div class="card" style="margin-top:12px;">
        <button type="button" id="ramalArmadoToggle" style="
          width:100%;background:none;border:none;padding:0;color:inherit;cursor:pointer;
          display:flex;align-items:center;gap:8px;text-align:left;
        ">
          <h3 style="margin:0;flex:1;">⚙️ Armado de ramales</h3>
          <span class="small" style="opacity:.55;">sin VIN</span>
          <span id="ramalArmadoChev">▼</span>
        </button>

        <div id="ramalArmadoBody" style="margin-top:10px;">
          <div class="fullStack">
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

    </div>
  `;
}
