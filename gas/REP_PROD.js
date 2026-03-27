// ============================================================
//  REPORTE DE PRODUCCIÓN
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📊 Incidencias")
    .addItem("Abrir reporte de incidencias", "abrirSidebar")
    .addItem("Abrir reporte de producción", "abrirProduccion")
    .addToUi();
}

function abrirProduccion() {
  const html = HtmlService.createHtmlOutput(getProduccionHTML())
    .setWidth(800)
    .setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, "🏭 Reporte de Producción");
}

/** Devuelve carros finalizados entre fechaDesde y fechaHasta (strings YYYY-MM-DD) */
function getProduccion(fechaDesde, fechaHasta) {
  try {
    const ss     = SpreadsheetApp.getActiveSpreadsheet();
    const shConv = ss.getSheetByName(CONFIG.SH_CONV);
    const shAsig = ss.getSheetByName(CONFIG.SH_ASIG);
    const shUser = ss.getSheetByName(CONFIG.SH_USUARIOS);

    if (!shConv || !shAsig || !shUser)
      throw new Error("Falta alguna hoja: CONV121, ASIGNACIONES o USUARIOS");

    const conv     = shConv.getDataRange().getValues();
    const asig     = shAsig.getDataRange().getValues();
    const usuarios = shUser.getDataRange().getValues();

    const desde = new Date(fechaDesde); desde.setHours(0, 0, 0, 0);
    const hasta  = new Date(fechaHasta); hasta.setHours(23, 59, 59, 999);

    // Columnas CONV121 (base 0)
    const CV_ID     = 0;  // col A — CONVERSION_ID
    const CV_VIN    = 1;  // col B — CHASIS_ID
    const CV_ESTADO = 3;  // col D — ESTADO_GENERAL

    // Columnas ASIGNACIONES (base 0)
    const AS_CONVID   = 1;  // col B — CONV_ID
    const AS_USER     = 2;  // col C — USER_ID
    const AS_FECHA_FIN = 9; // col J — fecha fin de asignación

    // 1. Set de ConvIDs que están FINALIZADOS en CONV121
    //    y mapa convId → { vin }
    const mapConvVin = new Map();
    for (let i = 1; i < conv.length; i++) {
      const estado = String(conv[i][CV_ESTADO] ?? "").trim().toUpperCase();
      if (estado !== "FINALIZADO") continue;
      const convId = String(conv[i][CV_ID]  ?? "").trim();
      const vin    = String(conv[i][CV_VIN] ?? "").trim();
      if (convId && vin) mapConvVin.set(convId, vin);
    }

    // 2. UserID → nombre
    const mapUserNombre = new Map();
    for (let i = 1; i < usuarios.length; i++) {
      const userId = String(usuarios[i][CONFIG.U_ID]     ?? "").trim();
      const nombre = String(usuarios[i][CONFIG.U_NOMBRE] ?? "").trim();
      if (userId && nombre && !mapUserNombre.has(userId))
        mapUserNombre.set(userId, nombre);
    }

    // 3. Recorrer ASIGNACIONES filtrando por fecha fin en el rango
    //    Solo contar carros FINALIZADOS en CONV121
    const mapTec = new Map(); // nombre → { total, vins: Set, detalle: [] }

    for (let i = 1; i < asig.length; i++) {
      const convId = String(asig[i][AS_CONVID] ?? "").trim();
      const userId = String(asig[i][AS_USER]   ?? "").trim();
      if (!convId || !userId) continue;

      // El carro debe estar finalizado en CONV121
      if (!mapConvVin.has(convId)) continue;

      // La fecha fin de asignación debe caer en el rango
      const fechaRaw = asig[i][AS_FECHA_FIN];
      if (!fechaRaw) continue;
      const fechaFin = (fechaRaw instanceof Date) ? fechaRaw : new Date(fechaRaw);
      if (isNaN(fechaFin.getTime()) || fechaFin < desde || fechaFin > hasta) continue;

      const nombre = mapUserNombre.get(userId);
      if (!nombre) continue;

      const vin = mapConvVin.get(convId);

      if (!mapTec.has(nombre)) mapTec.set(nombre, { vinsSet: new Set(), detalle: [] });
      const entry = mapTec.get(nombre);

      // Un técnico puede tener varias asignaciones sobre el mismo VIN
      // (ej: reductor + tanque) — contamos el VIN solo una vez por técnico
      if (!entry.vinsSet.has(vin)) {
        entry.vinsSet.add(vin);
        entry.detalle.push({
          vin,
          fecha: fechaFin.toLocaleDateString('es-PE', {
            day:'2-digit', month:'2-digit', year:'numeric',
            hour:'2-digit', minute:'2-digit'
          }),
          convId
        });
      }
    }

    // 4. Construir ranking
    const ranking = [];
    for (const [tecnico, data] of mapTec.entries()) {
      ranking.push({
        tecnico,
        total: data.vinsSet.size,
        vins:  data.detalle
      });
    }
    ranking.sort((a, b) => b.total - a.total);

    // Total de carros únicos en el período (sin importar cuántos técnicos los tocaron)
    const vinsUnicos = new Set(ranking.flatMap(r => r.vins.map(v => v.vin)));

    return { ok: true, ranking, totalCarros: vinsUnicos.size };

  } catch(e) {
    Logger.log("ERROR: " + e.message + "\n" + e.stack);
    return { ok: false, error: e.message };
  }
}

/** Fecha de hoy en YYYY-MM-DD (hora Peru) para el input */
function getFechasDefault() {
  const hoy  = new Date();
  // Lunes de la semana actual
  const diaSemana = hoy.getDay(); // 0=dom, 1=lun...
  const diffLunes = (diaSemana === 0) ? -6 : 1 - diaSemana;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + diffLunes);

  const fmt = d => {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  };

  return { desde: fmt(lunes), hasta: fmt(hoy) };
}

// ============================================================
//  HTML DEL POPUP DE PRODUCCIÓN
// ============================================================
function getProduccionHTML() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #2c2c2a; background: #f7f7f5; }
  .header { background: #185FA5; color: #fff; padding: 14px 16px 10px; }
  .header h1 { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
  .header p  { font-size: 11px; opacity: .8; }
  .filtros-bar {
    background: #0e4a8a; padding: 9px 16px;
    display: flex; align-items: center; gap: 10px;
    font-size: 12px; color: #cde; flex-wrap: wrap;
  }
  .filtros-bar label { white-space: nowrap; }
  .filtros-bar input[type="date"] {
    padding: 3px 8px; border: none; border-radius: 5px;
    font-size: 12px; background: #fff; color: #2c2c2a; cursor: pointer;
  }
  .btn-aplicar {
    background: #1D9E75; color: #fff; border: none; border-radius: 5px;
    padding: 4px 14px; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .btn-aplicar:hover { background: #157a5c; }
  .rango-badge { margin-left: auto; font-size: 11px; opacity: .75; }
  .content { padding: 14px; }
  .total-bar {
    background: #fff; border-radius: 8px; border-left: 4px solid #185FA5;
    padding: 10px 14px; margin-bottom: 14px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .total-bar .big { font-size: 26px; font-weight: 700; color: #185FA5; }
  .total-bar .lbl { font-size: 11px; color: #888; }
  .rank-table { width: 100%; border-collapse: collapse; background: #fff;
                border-radius: 8px; overflow: hidden; border: 1px solid #e2e0da; }
  .rank-table th { background: #185FA5; color: #fff; padding: 8px 10px;
                   font-size: 11px; text-align: left; font-weight: 600; }
  .rank-table td { padding: 7px 10px; font-size: 12px; border-top: 1px solid #f0ede6; }
  .rank-table tr.data-row { cursor: pointer; }
  .rank-table tr.data-row:hover td { background: #e6f1fb; }
  .rank-table tr.data-row.expanded td { background: #dcedfb; font-weight: 600; }
  .rank-num { font-weight: 700; color: #185FA5; }
  .expand-icon { font-size: 11px; margin-left: 6px; color: #185FA5; }
  .rank-detail-row td { padding: 0 !important; border-top: none !important;
                        background: #f4f8fd !important; }
  .rank-detail-inner {
    padding: 10px 14px 12px;
    border-top: 2px solid #185FA5;
    border-bottom: 2px solid #e2e0da;
    background: #f4f8fd;
    animation: slideDown 0.18s ease;
  }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .vin-row { padding: 5px 0; border-top: 1px solid #eee; font-size: 12px; }
  .vin-row:first-child { border-top: none; }
  .vin-id   { font-weight: 600; color: #2c2c2a; }
  .vin-date { color: #888; font-size: 11px; margin-left: 8px; }
  .spinner { text-align: center; padding: 30px; color: #888; font-size: 12px; }
  .error   { color: #A32D2D; font-size: 12px; padding: 12px; }
</style>
</head>
<body>

<div class="header">
  <h1>🏭 Reporte de Producción</h1>
  <p>Carros finalizados por técnico en el período seleccionado</p>
</div>

<div class="filtros-bar">
  <label>Desde:</label>
  <input type="date" id="input-desde">
  <label>Hasta:</label>
  <input type="date" id="input-hasta">
  <button class="btn-aplicar" onclick="cargarProduccion()">Aplicar</button>
  <span class="rango-badge" id="rango-badge"></span>
</div>

<div class="content">
  <div id="prod-content"><div class="spinner">Cargando...</div></div>
</div>

<script>
  // Array en memoria — evita serializar JSON en atributos HTML
  var rankingCache = [];

  function fmtFecha(iso) {
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  // ---- RENDER ----
  function renderProduccion(resp) {
    if (!resp || !resp.ok) {
      document.getElementById('prod-content').innerHTML =
        '<p class="error">Error: ' + (resp ? resp.error : 'respuesta vacía') + '</p>';
      return;
    }

    var ranking     = resp.ranking;
    var totalCarros = resp.totalCarros;
    rankingCache    = ranking; // guarda para uso en toggleDetalle

    // Badge rango
    var desde = document.getElementById('input-desde').value;
    var hasta  = document.getElementById('input-hasta').value;
    if (desde && hasta) {
      document.getElementById('rango-badge').textContent =
        fmtFecha(desde) + ' → ' + fmtFecha(hasta);
    }

    if (!ranking.length) {
      document.getElementById('prod-content').innerHTML =
        '<p style="color:#888;font-size:12px;padding:12px">Sin carros finalizados en este período.</p>';
      return;
    }

    // Totalizador
    var html = '<div class="total-bar">' +
      '<div><div class="big">' + totalCarros + '</div>' +
      '<div class="lbl">Carros finalizados en el período</div></div>' +
      '<div style="font-size:11px;color:#888">' + ranking.length + ' técnico(s)</div>' +
      '</div>';

    // Filas de la tabla — sin JSON en atributos
    var rows = '';
    for (var i = 0; i < ranking.length; i++) {
      var r     = ranking[i];
      var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1)+'°';
      var pct   = totalCarros > 0 ? Math.round((r.total / totalCarros) * 100) : 0;

      rows +=
        '<tr class="data-row" onclick="toggleDetalle(this,' + i + ')">' +
          '<td><span class="rank-num">' + medal + '</span></td>' +
          '<td style="font-weight:500">' + r.tecnico +
            ' <span class="expand-icon">▼</span></td>' +
          '<td style="text-align:center;font-weight:700;color:#185FA5">' + r.total + '</td>' +
          '<td style="text-align:center">' +
            '<div style="background:#e2e0da;border-radius:4px;height:8px;' +
              'width:80px;display:inline-block;vertical-align:middle">' +
              '<div style="background:#185FA5;height:8px;border-radius:4px;' +
                'width:' + pct + '%"></div>' +
            '</div>' +
            ' <span style="font-size:11px;color:#888">' + pct + '%</span>' +
          '</td>' +
        '</tr>' +
        '<tr class="rank-detail-row" id="pdr-' + i + '" style="display:none">' +
          '<td colspan="4">' +
            '<div class="rank-detail-inner" id="pdi-' + i + '"></div>' +
          '</td>' +
        '</tr>';
    }

    html += '<table class="rank-table">' +
      '<thead><tr>' +
        '<th>#</th><th>Técnico</th>' +
        '<th style="text-align:center">Carros</th>' +
        '<th style="text-align:center">% del total</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>';

    document.getElementById('prod-content').innerHTML = html;
  }

  // ---- TOGGLE DETALLE ----
  function toggleDetalle(rowEl, idx) {
    var detailRow = rowEl.nextElementSibling;
    var isOpen    = detailRow.style.display !== 'none';

    // Cierra todos
    document.querySelectorAll('.rank-detail-row').forEach(function(r) {
      r.style.display = 'none';
    });
    document.querySelectorAll('.data-row').forEach(function(r) {
      r.classList.remove('expanded');
      var ic = r.querySelector('.expand-icon');
      if (ic) ic.textContent = '▼';
    });

    if (isOpen) return;

    // Abre este
    detailRow.style.display = 'table-row';
    rowEl.classList.add('expanded');
    var icon = rowEl.querySelector('.expand-icon');
    if (icon) icon.textContent = '▲';

    // Lee desde el cache en memoria — sin JSON.parse de atributos
    var vins = (rankingCache[idx] && rankingCache[idx].vins) ? rankingCache[idx].vins : [];
    var inner = document.getElementById('pdi-' + idx);

    if (!vins.length) {
      inner.innerHTML = '<p style="color:#888;font-size:12px">Sin detalle disponible.</p>';
      return;
    }

    var vinHtml = '';
    for (var j = 0; j < vins.length; j++) {
      vinHtml += '<div class="vin-row">' +
        '<span class="vin-id">' + (vins[j].vin || '—') + '</span>' +
        '<span class="vin-date">' + (vins[j].fecha || '') + '</span>' +
        '</div>';
    }
    inner.innerHTML = vinHtml;
  }

  // ---- CARGAR ----
  function cargarProduccion() {
    var desde = document.getElementById('input-desde').value;
    var hasta  = document.getElementById('input-hasta').value;
    if (!desde || !hasta) { alert('Selecciona ambas fechas.'); return; }

    document.getElementById('prod-content').innerHTML =
      '<div class="spinner">Cargando...</div>';

    google.script.run
      .withSuccessHandler(renderProduccion)
      .withFailureHandler(function(e) {
        document.getElementById('prod-content').innerHTML =
          '<p class="error">Error del servidor: ' + e.message + '</p>';
      })
      .getProduccion(desde, hasta);
  }

  // ---- INIT ----
  google.script.run.withSuccessHandler(function(fechas) {
    document.getElementById('input-desde').value = fechas.desde;
    document.getElementById('input-hasta').value  = fechas.hasta;
    cargarProduccion();
  }).getFechasDefault();
</script>
</body>
</html>`;
}