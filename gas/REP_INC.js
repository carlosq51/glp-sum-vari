// ============================================================
//  REPORTE DE INCIDENCIAS — Apps Script
//  Pega todo este archivo en Apps Script de tu Google Sheet
//  Extensiones → Apps Script → reemplaza el contenido
// ============================================================

// ---------- CONFIGURACIÓN — ajusta si cambias columnas ----------
const CONFIG = {
  SHEET_NAME: "INCIDENCIAS",
  COL_FECHA:     1,
  COL_MES:       2,
  COL_CONV_ID:   3,
  COL_VIN:       4,
  COL_TECNICO:   5,
  COL_TIPO:      6,
  COL_REG_POR:   7,
  COL_NOTA:      8,
  NIVELES: ["LEVE", "MODERADA", "CRITICA"],

  // ── Hojas del flujo de calidad ──
  SH_CALIDAD:   "CALIDAD1",
  SH_CONV:      "CONV121",
  SH_ASIG:      "ASIGNACIONES",
  SH_USUARIOS:  "USUARIOS",

  // Columnas CALIDAD1 (base 0)
  CAL_VIN:  1,   // col B
  CAL_EST:  3,   // col D — filtramos "FINALIZADO"

  // Columnas CONV121 (base 0)
  CV_ID:    0,   // col A
  CV_VIN:   1,   // col B

  // Columnas ASIGNACIONES (base 0)
  AS_CONVID: 1,  // col B
  AS_USER:   2,  // col C

  FECHA_CORTE: new Date("2026-03-09"), 

  // Columnas USUARIOS (base 0)
  U_ID:     0,   // col A
  U_NOMBRE: 2    // col C — usamos primer nombre
};


// ============================================================
//  NUEVA FUNCIÓN: VINs finalizados por técnico
//  Devuelve Map { "NombreTecnico" -> Set<vin> }
// ============================================================
function getVinsPorTecnico(fechaISO) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const shCal  = ss.getSheetByName(CONFIG.SH_CALIDAD);
  const shConv = ss.getSheetByName(CONFIG.SH_CONV);
  const shAsig = ss.getSheetByName(CONFIG.SH_ASIG);
  const shUser = ss.getSheetByName(CONFIG.SH_USUARIOS);

  if (!shCal || !shConv || !shAsig || !shUser)
    throw new Error("Falta alguna hoja: CALIDAD1, CONV121, ASIGNACIONES o USUARIOS");

  const cal      = shCal.getDataRange().getValues();
  const conv     = shConv.getDataRange().getValues();
  const asig     = shAsig.getDataRange().getValues();
  const usuarios = shUser.getDataRange().getValues();

  const corte = fechaISO ? new Date(fechaISO) : new Date(CONFIG.FECHA_CORTE);
  corte.setHours(0, 0, 0, 0);

  const CAL_FECHA = 2;

  const vinsFinalizados = new Set();
  for (let i = 1; i < cal.length; i++) {
    const vin    = String(cal[i][CONFIG.CAL_VIN] ?? "").trim();
    const estado = String(cal[i][CONFIG.CAL_EST] ?? "").trim().toUpperCase();
    if (!vin || estado !== "FINALIZADO") continue;

    const fechaRaw = cal[i][CAL_FECHA];
    if (!fechaRaw) continue;
    const fecha = (fechaRaw instanceof Date) ? fechaRaw : new Date(fechaRaw);
    if (isNaN(fecha.getTime()) || fecha < corte) continue;

    vinsFinalizados.add(vin);
  }

  const mapVinConv = new Map();
  for (let i = 1; i < conv.length; i++) {
    const vin    = String(conv[i][CONFIG.CV_VIN] ?? "").trim();
    const convId = String(conv[i][CONFIG.CV_ID]  ?? "").trim();
    if (vin && convId && vinsFinalizados.has(vin) && !mapVinConv.has(vin))
      mapVinConv.set(vin, convId);
  }

  const mapConvUsers = new Map();
  for (let i = 1; i < asig.length; i++) {
    const convId = String(asig[i][CONFIG.AS_CONVID] ?? "").trim();
    const userId = String(asig[i][CONFIG.AS_USER]   ?? "").trim();
    if (!convId || !userId) continue;
    if (!mapConvUsers.has(convId)) mapConvUsers.set(convId, []);
    mapConvUsers.get(convId).push(userId);
  }

  const mapUserNombre = new Map();
  for (let i = 1; i < usuarios.length; i++) {
    const userId     = String(usuarios[i][CONFIG.U_ID]     ?? "").trim();
    const nombreFull = String(usuarios[i][CONFIG.U_NOMBRE] ?? "").trim();
    if (userId && nombreFull && !mapUserNombre.has(userId))
      mapUserNombre.set(userId, nombreFull);
  }

  const result = new Map();
  for (const [vin, convId] of mapVinConv.entries()) {
    const userIds = mapConvUsers.get(convId) || [];

    let fechaVin = null;
    for (let i = 1; i < cal.length; i++) {
      if (String(cal[i][CONFIG.CAL_VIN] ?? "").trim() === vin) {
        const fr = cal[i][CAL_FECHA];
        if (fr) fechaVin = (fr instanceof Date) ? fr : new Date(fr);
        break;
      }
    }

    for (const userId of userIds) {
      const nombre = mapUserNombre.get(userId);
      if (!nombre) continue;
      if (!result.has(nombre)) result.set(nombre, { vins: new Set(), fechaMin: null });
      const entry = result.get(nombre);
      entry.vins.add(vin);
      if (fechaVin && (!entry.fechaMin || fechaVin < entry.fechaMin))
        entry.fechaMin = fechaVin;
    }
  }
  return result;
}



// ---------- MENÚ PERSONALIZADO ----------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📊 Incidencias")
    .addItem("Abrir reporte", "abrirSidebar")
    .addToUi();
}

function abrirSidebar() {
  const html = HtmlService.createHtmlOutput(getSidebarHTML())
    .setWidth(900)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, "📊 Reporte de Incidencias");
}

// ---------- FUNCIONES DE DATOS (llamadas desde el HTML) ----------

/** Devuelve lista de técnicos únicos ordenados */
function getTecnicos(fechaISO) {
  const data = getDatos(fechaISO);
  return [...new Set(data.map(r => r.tecnico).filter(Boolean))].sort();
}

/** Devuelve resumen global: total por nivel */
function getResumenGlobal(fechaISO) {
  const data = getDatos(fechaISO);
  const resumen = {};
  CONFIG.NIVELES.forEach(n => resumen[n] = 0);

  data.forEach(r => {
    const nivel = (r.tipo || "").toUpperCase().trim();
    if (resumen.hasOwnProperty(nivel)) resumen[nivel]++;
    else resumen["OTRO"] = (resumen["OTRO"] || 0) + 1;
  });

  resumen.TOTAL = data.length;
  return resumen;
}


/** Devuelve ranking de técnicos */
function getRanking(fechaISO) {
  const data           = getDatos(fechaISO);
  const vinsPorTecnico = getVinsPorTecnico(fechaISO);

  const mapInc = {};
  data.forEach(r => {
    const tec = r.tecnico || "Sin asignar";
    if (!mapInc[tec]) {
      mapInc[tec] = { total: 0 };
      CONFIG.NIVELES.forEach(n => mapInc[tec][n] = 0);
    }
    mapInc[tec].total++;
    const nivel = (r.tipo || "").toUpperCase().trim();
    if (mapInc[tec].hasOwnProperty(nivel)) mapInc[tec][nivel]++;
  });

  const todosTecnicos = new Set([
    ...Object.keys(mapInc),
    ...vinsPorTecnico.keys()
  ]);

  const ranking = [];
  for (const tec of todosTecnicos) {
    const inc    = mapInc[tec] || { total: 0, LEVE: 0, MODERADA: 0, CRITICA: 0 };
    const carros   = vinsPorTecnico.has(tec) ? vinsPorTecnico.get(tec).vins.size : 0;
    const fechaMin = vinsPorTecnico.has(tec) ? vinsPorTecnico.get(tec).fechaMin  : null;

    if (carros === 0 && inc.total === 0) continue;

    const tasa = carros > 0
      ? Math.round((inc.total / carros) * 100) / 100
      : inc.total > 0 ? null : 0;

    ranking.push({
      tecnico:  tec,
      total:    inc.total,
      carros:   carros,
      fechaMin: fechaMin ? fechaMin.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—',
      tasa:     tasa,
      LEVE:     inc.LEVE     || 0,
      MODERADA: inc.MODERADA || 0,
      CRITICA:  inc.CRITICA  || 0
    });
  }

  return ranking.sort((a, b) => {
    if (a.tasa === null && b.tasa !== null) return  1;
    if (b.tasa === null && a.tasa !== null) return -1;
    return (b.tasa - a.tasa) || (b.total - a.total);
  });
}


/** Devuelve detalle filtrado por técnico, agrupado por nivel */
function getDetalleTecnico(tecnico, fechaISO) {
  try {
    const data = getDatos(fechaISO);
    const filtrado = data.filter(r => r.tecnico === tecnico);
    const agrupado = {};
    CONFIG.NIVELES.forEach(n => agrupado[n] = []);

    filtrado.forEach(r => {
      const nivel = (r.tipo || "").toUpperCase().trim();
      const destino = agrupado.hasOwnProperty(nivel) ? nivel : "OTRO";
      if (!agrupado[destino]) agrupado[destino] = [];
      agrupado[destino].push({
        fecha:  r.fecha ? String(r.fecha) : "",
        vin:    r.vin,
        nota:   r.nota,
        convId: r.convId
      });
    });

    const totales = {};
    CONFIG.NIVELES.forEach(n => totales[n] = agrupado[n].length);
    totales.TOTAL = filtrado.length;

    return { tecnico, totales, detalle: agrupado };
  } catch(e) {
    return { error: e.message };
  }
}

// ---------- FUNCIÓN INTERNA: leer la hoja ----------
function getDatos(fechaISO) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const corte = fechaISO ? new Date(fechaISO) : new Date(CONFIG.FECHA_CORTE);
  corte.setHours(0, 0, 0, 0);

  const values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();

  return values
    .filter(row => {
      if (!row[CONFIG.COL_TECNICO - 1]) return false;
      const fechaRaw = row[CONFIG.COL_FECHA - 1];
      if (fechaRaw) {
        const fecha = (fechaRaw instanceof Date) ? fechaRaw : new Date(fechaRaw);
        if (!isNaN(fecha.getTime()) && fecha < corte) return false;
      }
      return true;
    })
    .map(row => ({
      fecha:   row[CONFIG.COL_FECHA - 1],
      mes:     row[CONFIG.COL_MES - 1],
      convId:  row[CONFIG.COL_CONV_ID - 1],
      vin:     row[CONFIG.COL_VIN - 1],
      tecnico: String(row[CONFIG.COL_TECNICO - 1]).trim(),
      tipo:    String(row[CONFIG.COL_TIPO - 1]).trim().toUpperCase(),
      regPor:  row[CONFIG.COL_REG_POR - 1],
      nota:    row[CONFIG.COL_NOTA - 1]
    }));
}

function getFechaCorte() {
  const f = CONFIG.FECHA_CORTE;
  // Devuelve string YYYY-MM-DD para el input type="date"
  const yyyy = f.getFullYear();
  const mm   = String(f.getMonth() + 1).padStart(2, '0');
  const dd   = String(f.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ============================================================
//  HTML DE LA SIDEBAR
// ============================================================
function getSidebarHTML() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #2c2c2a; background: #f7f7f5; }

  /* Header */
  .header { background: #185FA5; color: #fff; padding: 14px 16px 10px; }
  .header h1 { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
  .header p  { font-size: 11px; opacity: .8; }

  /* Tabs */
  .tabs { display: flex; background: #fff; border-bottom: 2px solid #e2e0da; }
  .tab  { flex: 1; padding: 9px 4px; text-align: center; font-size: 12px; font-weight: 500;
          cursor: pointer; color: #888; border-bottom: 3px solid transparent; margin-bottom: -2px; }
  .tab.active { color: #185FA5; border-bottom-color: #185FA5; }

  /* Sections */
  .section { display: none; padding: 14px; }
  .section.active { display: block; }

  /* Cards de nivel */
  .nivel-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
  .ncard { background: #fff; border-radius: 8px; padding: 10px 12px; border-left: 4px solid #ccc; }
  .ncard .count { font-size: 22px; font-weight: 700; line-height: 1; }
  .ncard .label { font-size: 11px; color: #888; margin-top: 2px; }
  .ncard.leve     { border-color: #1D9E75; } .ncard.leve .count     { color: #1D9E75; }
  .ncard.moderada { border-color: #EF9F27; } .ncard.moderada .count { color: #BA7517; }
  .ncard.critica  { border-color: #E24B4A; } .ncard.critica .count  { color: #A32D2D; }
  .ncard.alta     { border-color: #D85A30; } .ncard.alta .count     { color: #993C1D; }
  .ncard.total    { border-color: #185FA5; grid-column: 1/-1; }
  .ncard.total .count { color: #185FA5; }

  /* Selector */
  select { width: 100%; padding: 8px 10px; border: 1px solid #d3d1c7; border-radius: 6px;
           font-size: 13px; background: #fff; margin-bottom: 14px; color: #2c2c2a; }

  /* Resumen técnico */
  .tec-header { background: #fff; border-radius: 8px; padding: 12px; margin-bottom: 10px;
                border: 1px solid #e2e0da; }
  .tec-name  { font-size: 15px; font-weight: 700; color: #185FA5; margin-bottom: 8px; }
  .tec-pills { display: flex; flex-wrap: wrap; gap: 6px; }
  .pill { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .pill.leve     { background: #E1F5EE; color: #0F6E56; }
  .pill.moderada { background: #FAEEDA; color: #854F0B; }
  .pill.critica  { background: #FCEBEB; color: #A32D2D; }
  .pill.alta     { background: #FAECE7; color: #993C1D; }
  .pill.total    { background: #E6F1FB; color: #185FA5; }

  /* Acordeón de detalle */
  .acordeon { margin-bottom: 6px; border-radius: 8px; overflow: hidden;
              border: 1px solid #e2e0da; }
  .acord-head { display: flex; justify-content: space-between; align-items: center;
                padding: 9px 12px; cursor: pointer; background: #fff; font-weight: 600;
                font-size: 12px; user-select: none; }
  .acord-head:hover { background: #f1efe8; }
  .acord-head .badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; }
  .acord-body { display: none; background: #fafaf8; padding: 0; }
  .acord-body.open { display: block; }
  .inc-row { padding: 8px 12px; border-top: 1px solid #f0ede6; font-size: 12px; }
  .inc-row .inc-vin  { font-weight: 600; color: #2c2c2a; }
  .inc-row .inc-nota { color: #5f5e5a; margin-top: 2px; }
  .inc-row .inc-fecha{ color: #888; font-size: 11px; margin-top: 1px; }

  /* Ranking */
  .rank-table { width: 100%; border-collapse: collapse; background: #fff;
                border-radius: 8px; overflow: hidden; border: 1px solid #e2e0da; }
  .rank-table th { background: #185FA5; color: #fff; padding: 8px 10px; font-size: 11px;
                   text-align: left; font-weight: 600; }
  .rank-table td { padding: 7px 10px; font-size: 12px; border-top: 1px solid #f0ede6; }
  .rank-table tr.data-row { cursor: pointer; }
  .rank-table tr.data-row:hover td { background: #e6f1fb; }
  .rank-table tr.data-row.expanded td { background: #dcedfb; font-weight: 600; }
  .rank-num { font-weight: 700; color: #185FA5; }

  /* Fila de detalle incrustada en el ranking */
  .rank-detail-row td { padding: 0 !important; border-top: none !important; background: #f4f8fd !important; }
  .rank-detail-inner {
    padding: 12px 14px 14px;
    border-top: 2px solid #185FA5;
    border-bottom: 2px solid #e2e0da;
    background: #f4f8fd;
    animation: slideDown 0.18s ease;
  }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Spinner */
  .spinner { text-align: center; padding: 24px; color: #888; font-size: 12px; }

  /* Botón refrescar */
  .btn-refresh { background: none; border: 1px solid #d3d1c7; border-radius: 6px;
                 padding: 5px 12px; font-size: 12px; cursor: pointer; color: #5f5e5a;
                 margin-bottom: 12px; }
  .btn-refresh:hover { background: #e6f1fb; color: #185FA5; border-color: #185FA5; }

  /* Indicador de expansión */
  .expand-icon { font-size: 11px; margin-left: 6px; color: #185FA5; }

  /* Input fecha de corte */
  .fecha-corte-bar {
    background: #0e4a8a;
    padding: 7px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: #cde;
  }
  .fecha-corte-bar label { white-space: nowrap; }
  .fecha-corte-bar input[type="date"] {
    padding: 3px 8px;
    border: none;
    border-radius: 5px;
    font-size: 12px;
    background: #fff;
    color: #2c2c2a;
    cursor: pointer;
  }
  .fecha-corte-bar .btn-aplicar {
    background: #1D9E75;
    color: #fff;
    border: none;
    border-radius: 5px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .fecha-corte-bar .btn-aplicar:hover { background: #157a5c; }
  .fecha-badge {
    margin-left: auto;
    font-size: 11px;
    opacity: .75;
  }
</style>
</head>
<body>

<div class="header">
  <h1>📊 Reporte de incidencias</h1>
  <p>Dashboard interactivo por técnico</p>
</div>

<div class="fecha-corte-bar">
  <label>📅 Desde:</label>
  <input type="date" id="input-fecha-corte" onchange="onFechaChange()">
  <button class="btn-aplicar" onclick="aplicarFecha()">Aplicar</button>
  <span class="fecha-badge" id="fecha-badge"></span>
</div>

<div class="tabs">
  <div class="tab active" onclick="showTab('resumen')">Resumen</div>
  <div class="tab" onclick="showTab('tecnico')">Por técnico</div>
  <div class="tab" onclick="showTab('ranking')">Ranking</div>
</div>

<!-- ======= TAB: RESUMEN GLOBAL ======= -->
<div id="tab-resumen" class="section active">
  <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center">
    <span style="font-size:12px; color:#888">Totales globales</span>
    <button class="btn-refresh" onclick="cargarResumen()">↻ Actualizar</button>
  </div>
  <div id="resumen-content"><div class="spinner">Cargando...</div></div>
</div>

<!-- ======= TAB: POR TÉCNICO ======= -->
<div id="tab-tecnico" class="section">
  <select id="select-tec" onchange="cargarDetalle()">
    <option value="">— Selecciona un técnico —</option>
  </select>
  <div id="detalle-content"></div>
</div>

<!-- ======= TAB: RANKING ======= -->
<div id="tab-ranking" class="section">
  <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center">
    <span style="font-size:12px; color:#888">Toca una fila para ver el detalle del técnico</span>
    <button class="btn-refresh" onclick="cargarRanking()">↻ Actualizar</button>
  </div>
  <div id="ranking-content"><div class="spinner">Cargando...</div></div>
</div>

<script>
  const COLORES = {
    LEVE:     { cls: 'leve',     label: 'Leve' },
    MODERADA: { cls: 'moderada', label: 'Moderada' },
    CRITICA:  { cls: 'critica',  label: 'Crítica' }
  };

  // ---- TABS ----
  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t,i) => {
      t.classList.toggle('active', ['resumen','tecnico','ranking'][i] === name);
    });
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    if (name === 'ranking' && !document.getElementById('ranking-content').dataset.loaded)
      cargarRanking();
  }

  // ---- RESUMEN GLOBAL ----
  function cargarResumen() {
    document.getElementById('resumen-content').innerHTML = '<div class="spinner">Cargando...</div>';
    google.script.run.withSuccessHandler(renderResumen).getResumenGlobal(fechaCorteActual);
  }

  function renderResumen(data) {
    const niveles = ['LEVE','MODERADA','CRITICA'];
    let html = '<div class="nivel-cards">';
    niveles.forEach(n => {
      const c = COLORES[n] || { cls: 'total', label: n };
      html += \`<div class="ncard \${c.cls}">
        <div class="count">\${data[n] || 0}</div>
        <div class="label">\${c.label}</div>
      </div>\`;
    });
    html += \`<div class="ncard total">
      <div class="count">\${data.TOTAL}</div>
      <div class="label">Total incidencias</div>
    </div></div>\`;
    document.getElementById('resumen-content').innerHTML = html;
  }

  // ---- SELECTOR TÉCNICOS ----
  function cargarTecnicos() {
    google.script.run.withSuccessHandler(function(lista) {
      const sel = document.getElementById('select-tec');
      lista.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        sel.appendChild(opt);
      });
    }).getTecnicos(fechaCorteActual);
  }

  // ---- DETALLE POR TÉCNICO (tab "Por técnico") ----
  function cargarDetalle() {
    const tec = document.getElementById('select-tec').value;
    if (!tec) { document.getElementById('detalle-content').innerHTML = ''; return; }
    document.getElementById('detalle-content').innerHTML = '<div class="spinner">Cargando...</div>';
    
    google.script.run
      .withSuccessHandler(function(data) {
        if (data && data.error) {
          document.getElementById('detalle-content').innerHTML =
            '<p style="color:red;font-size:12px">Error: ' + data.error + '</p>';
        } else {
          renderDetalle(data, 'detalle-content');
        }
      })
      .withFailureHandler(function(err) {
        document.getElementById('detalle-content').innerHTML =
          '<p style="color:red;font-size:12px">Error del servidor: ' + err.message + '</p>';
      })
      .getDetalleTecnico(tec, fechaCorteActual);
  }

  // ---- RENDER DETALLE (reutilizable: tab técnico + ranking) ----
  // containerId: id del div donde renderizar
  function renderDetalle(data, containerId) {
    const { tecnico, totales, detalle } = data;
    const niveles = ['CRITICA','MODERADA','LEVE'];

    let pillsHtml = '';
    ['TOTAL','CRITICA','MODERADA','LEVE'].forEach(n => {
      const cls = n === 'TOTAL' ? 'total' : (COLORES[n]?.cls || 'total');
      const lbl = n === 'TOTAL' ? 'Total' : (COLORES[n]?.label || n);
      if ((totales[n] || 0) > 0 || n === 'TOTAL')
        pillsHtml += \`<span class="pill \${cls}">\${lbl}: \${totales[n] || 0}</span>\`;
    });

    let acHtml = '';
    niveles.forEach(n => {
      const rows = detalle[n] || [];
      if (rows.length === 0) return;
      const c = COLORES[n] || { cls: 'total', label: n };
      const rowsHtml = rows.map(r => \`
        <div class="inc-row">
          <div class="inc-vin">\${r.vin || '—'}</div>
          <div class="inc-nota">\${r.nota || 'Sin nota'}</div>
          <div class="inc-fecha">\${formatFecha(r.fecha)}</div>
        </div>\`).join('');
      acHtml += \`
        <div class="acordeon">
          <div class="acord-head" onclick="toggleAcord(this)">
            <span>\${c.label}</span>
            <span class="badge pill \${c.cls}">\${rows.length}</span>
          </div>
          <div class="acord-body">\${rowsHtml}</div>
        </div>\`;
    });

    const html = \`
      <div class="tec-header">
        <div class="tec-name">\${tecnico}</div>
        <div class="tec-pills">\${pillsHtml}</div>
      </div>
      \${acHtml || '<p style="color:#888;font-size:12px">Sin incidencias registradas</p>'}\`;

    document.getElementById(containerId).innerHTML = html;
  }

  function toggleAcord(head) {
    const body = head.nextElementSibling;
    body.classList.toggle('open');
  }

  // ---- RANKING ----
  function cargarRanking() {
    document.getElementById('ranking-content').innerHTML = '<div class="spinner">Cargando...</div>';
    google.script.run.withSuccessHandler(renderRanking).getRanking(fechaCorteActual);
    document.getElementById('ranking-content').dataset.loaded = '1';
  }

  // Guarda qué fila está expandida actualmente
  let rankExpandedTec = null;

  function renderRanking(data) {
    rankExpandedTec = null; // reset al re-renderizar
    if (!data.length) {
      document.getElementById('ranking-content').innerHTML =
        '<p style="color:#888;font-size:12px">Sin datos</p>';
      return;
    }

    let rows = data.map((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1)+'°';
      const tasaColor = r.tasa >= 3 ? '#A32D2D' : r.tasa >= 1.5 ? '#BA7517' : '#1D9E75';
      // Escapamos el nombre para usarlo como atributo data-
      const tecEsc = r.tecnico.replace(/"/g, '&quot;');
      return \`
        <tr class="data-row" data-tec="\${tecEsc}" onclick="toggleRankDetalle(this, '\${tecEsc}')">
          <td><span class="rank-num">\${medal}</span></td>
          <td style="font-weight:500">\${r.tecnico} <span class="expand-icon">▼</span></td>
          <td style="text-align:center">\${r.total}</td>
          <td style="text-align:center">\${r.carros}</td>
          <td style="text-align:center;font-weight:700;color:\${tasaColor}">\${r.tasa ?? '—'}</td>
          <td style="text-align:center;font-size:11px;color:#666">\${r.fechaMin}</td>
        </tr>
        <tr class="rank-detail-row" id="detail-row-\${i}" style="display:none">
          <td colspan="6">
            <div class="rank-detail-inner" id="detail-inner-\${i}">
              <div class="spinner">Cargando detalle...</div>
            </div>
          </td>
        </tr>\`;
    }).join('');

    document.getElementById('ranking-content').innerHTML = \`
      <table class="rank-table">
        <thead><tr>
          <th>#</th>
          <th>Técnico</th>
          <th>Total</th>
          <th>Carros</th>
          <th>Tasa</th>
          <th>Desde</th>
        </tr></thead>
        <tbody>\${rows}</tbody>
      </table>\`;
  }

  function toggleRankDetalle(rowEl, tecnico) {
    // Busca la fila de detalle inmediatamente después
    const detailRow = rowEl.nextElementSibling;
    const isOpen = detailRow.style.display !== 'none';

    // Cierra todos los paneles abiertos y quita el estilo "expanded"
    document.querySelectorAll('.rank-detail-row').forEach(r => r.style.display = 'none');
    document.querySelectorAll('.data-row').forEach(r => {
      r.classList.remove('expanded');
      const icon = r.querySelector('.expand-icon');
      if (icon) icon.textContent = '▼';
    });

    // Si ya estaba abierto, solo cerramos (toggle)
    if (isOpen) {
      rankExpandedTec = null;
      return;
    }

    // Abrir este panel
    detailRow.style.display = 'table-row';
    rowEl.classList.add('expanded');
    const icon = rowEl.querySelector('.expand-icon');
    if (icon) icon.textContent = '▲';
    rankExpandedTec = tecnico;

    // Obtener el id del inner div (el índice está en el id de la detailRow)
    const innerId = detailRow.querySelector('[id^="detail-inner-"]').id;

    // Cargar detalle vía Apps Script
    google.script.run
      .withSuccessHandler(function(data) {
        if (data && data.error) {
          document.getElementById(innerId).innerHTML =
            '<p style="color:red;font-size:12px">Error: ' + data.error + '</p>';
        } else {
          renderDetalleInline(data, innerId);
        }
      })
      .withFailureHandler(function(err) {
        document.getElementById(innerId).innerHTML =
          '<p style="color:red;font-size:12px">Error: ' + err.message + '</p>';
      })
      .getDetalleTecnico(tecnico, fechaCorteActual);
  }

  // Igual que renderDetalle pero sin el tec-header (ya se ve en la fila del ranking)
  function renderDetalleInline(data, containerId) {
    const { tecnico, totales, detalle } = data;
    const niveles = ['CRITICA','MODERADA','LEVE'];

    // Pills compactas
    let pillsHtml = '';
    ['TOTAL','CRITICA','MODERADA','LEVE'].forEach(n => {
      const cls = n === 'TOTAL' ? 'total' : (COLORES[n]?.cls || 'total');
      const lbl = n === 'TOTAL' ? 'Total' : (COLORES[n]?.label || n);
      if ((totales[n] || 0) > 0 || n === 'TOTAL')
        pillsHtml += \`<span class="pill \${cls}">\${lbl}: \${totales[n] || 0}</span>\`;
    });

    let acHtml = '';
    niveles.forEach(n => {
      const rows = detalle[n] || [];
      if (rows.length === 0) return;
      const c = COLORES[n] || { cls: 'total', label: n };
      const rowsHtml = rows.map(r => \`
        <div class="inc-row">
          <div class="inc-vin">\${r.vin || '—'}</div>
          <div class="inc-nota">\${r.nota || 'Sin nota'}</div>
          <div class="inc-fecha">\${formatFecha(r.fecha)}</div>
        </div>\`).join('');
      acHtml += \`
        <div class="acordeon" style="margin-bottom:5px">
          <div class="acord-head" onclick="toggleAcord(this)">
            <span>\${c.label}</span>
            <span class="badge pill \${c.cls}">\${rows.length}</span>
          </div>
          <div class="acord-body">\${rowsHtml}</div>
        </div>\`;
    });

    document.getElementById(containerId).innerHTML = \`
      <div style="margin-bottom:8px">
        <span style="font-size:13px;font-weight:700;color:#185FA5">\${tecnico}</span>
      </div>
      <div class="tec-pills" style="margin-bottom:10px">\${pillsHtml}</div>
      \${acHtml || '<p style="color:#888;font-size:12px">Sin incidencias registradas</p>'}\`;
  }

  // ---- UTIL ----
  function formatFecha(val) {
    if (!val) return '—';
    try {
      const d = new Date(val);
      return d.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric',
             hour:'2-digit', minute:'2-digit' });
    } catch(e) { return String(val); }
  }

  // ---- INIT ----
  // DESPUÉS
  let fechaCorteActual = null;

  function onFechaChange() {
    // Solo actualiza el badge visualmente, el botón Aplicar dispara la recarga
  }

  function aplicarFecha() {
    const val = document.getElementById('input-fecha-corte').value;
    if (!val) return;
    fechaCorteActual = val;
    const [yyyy, mm, dd] = val.split('-');
    document.getElementById('fecha-badge').textContent =
      'Filtrando desde ' + dd + '/' + mm + '/' + yyyy;

    cargarResumen();

    google.script.run.withSuccessHandler(function(lista) {
      const sel = document.getElementById('select-tec');
      const valorPrevio = sel.value;
      while (sel.options.length > 1) sel.remove(1);
      lista.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        sel.appendChild(opt);
      });
      if (valorPrevio && lista.includes(valorPrevio)) {
        sel.value = valorPrevio;
        cargarDetalle();
      } else {
        document.getElementById('detalle-content').innerHTML = '';
      }
    }).getTecnicos(fechaCorteActual);

    if (document.getElementById('ranking-content').dataset.loaded) {
      cargarRanking();
    }
  }

  // INIT — carga la fecha del CONFIG y arranca
  google.script.run.withSuccessHandler(function(fechaISO) {
    fechaCorteActual = fechaISO;
    document.getElementById('input-fecha-corte').value = fechaISO;
    const [yyyy, mm, dd] = fechaISO.split('-');
    document.getElementById('fecha-badge').textContent =
      'Filtrando desde ' + dd + '/' + mm + '/' + yyyy;
    cargarResumen();
    cargarTecnicos();
  }).getFechaCorte();
</script>
</body>
</html>`;
}