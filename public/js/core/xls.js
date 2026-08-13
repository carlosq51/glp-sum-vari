// =========================
// public/js/core/xls.js
// Exportación a Excel descargable — helper único para toda la app.
// Genera SpreadsheetML 2003 (.xls en XML): a diferencia del CSV admite
// VARIAS HOJAS en un solo archivo, cabeceras en negrita y columnas con
// ancho, y Excel lo abre nativo. Sin dependencias ni build extra.
// Para una sola tabla plana sigue siendo más simple `exportCsv_`.
// =========================

function escXml_(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Excel rompe con caracteres de control; los quitamos.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

// Excel no acepta : \ / ? * [ ] en el nombre de hoja, y corta en 31 chars.
function nombreHoja_(nombre, usados) {
  let base = String(nombre || "Hoja").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Hoja";
  let n = base, i = 2;
  while (usados.has(n)) {
    const sufijo = ` (${i++})`;
    n = base.slice(0, 31 - sufijo.length) + sufijo;
  }
  usados.add(n);
  return n;
}

function celda_(v, estilo) {
  const num = typeof v === "number" && Number.isFinite(v);
  const tipo = num ? "Number" : "String";
  const st = estilo ? ` ss:StyleID="${estilo}"` : "";
  return `<Cell${st}><Data ss:Type="${tipo}">${escXml_(num ? v : v ?? "")}</Data></Cell>`;
}

/**
 * Genera y descarga un Excel con una o varias hojas.
 * @param {object} o
 * @param {string} o.filename  nombre del archivo (con .xls)
 * @param {Array<{nombre:string, titulo?:string, headers?:string[], rows:Array<Array>}>} o.sheets
 *   `titulo` pinta una fila de título antes de las cabeceras (opcional).
 */
export function exportXls_({ filename, sheets = [] }) {
  const usados = new Set();
  const hojas = sheets.map(sh => {
    const cols = Math.max(
      sh.headers?.length || 0,
      ...(sh.rows || []).map(r => r.length), 1
    );
    const filas = [];
    if (sh.titulo) {
      filas.push(`<Row>${celda_(sh.titulo, "sTitulo")}</Row>`, "<Row/>");
    }
    if (sh.headers?.length) {
      filas.push(`<Row>${sh.headers.map(h => celda_(h, "sHead")).join("")}</Row>`);
    }
    (sh.rows || []).forEach(r => {
      filas.push(`<Row>${r.map(v => celda_(v)).join("")}</Row>`);
    });
    // Ancho generoso en la 1ª columna (nombres de herramienta) y medio en el resto.
    const anchos = Array.from({ length: cols }, (_, i) =>
      `<Column ss:Width="${i === 0 ? 260 : 100}"/>`).join("");
    return `<Worksheet ss:Name="${escXml_(nombreHoja_(sh.nombre, usados))}">
      <Table>${anchos}${filas.join("")}</Table>
      <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
        <FreezePanes/><FrozenNoSplit/>
        <SplitHorizontal>${sh.titulo ? 3 : 1}</SplitHorizontal>
        <TopRowBottomPane>${sh.titulo ? 3 : 1}</TopRowBottomPane>
        <ActivePane>2</ActivePane>
      </WorksheetOptions>
    </Worksheet>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
    <Style ss:ID="sHead">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#2F5496" ss:Pattern="Solid"/>
      <Alignment ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="sTitulo"><Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1"/></Style>
  </Styles>
  ${hojas}
</Workbook>`;

  const blob = new Blob(["﻿" + xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
