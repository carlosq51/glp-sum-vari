// =========================
// public/js/core/csv.js
// Exportación a CSV descargable — helper único para toda la app.
// BOM UTF-8 (Excel en Windows), campos siempre entrecomillados,
// separador \r\n. Antes triplicado en sup-incidencias-report.js,
// supervisor.js y movilizador.js.
// =========================

/**
 * Genera y descarga un CSV.
 * @param {object}   o
 * @param {string}   o.filename  nombre del archivo (con .csv)
 * @param {string[]} [o.headers] fila de cabeceras (opcional)
 * @param {Array<Array>} o.rows  filas de datos (valores crudos, se escapan aquí)
 */
export function exportCsv_({ filename, headers = null, rows = [] }) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const all = headers ? [headers, ...rows] : rows;
  const csv = all.map(r => r.map(esc).join(",")).join("\r\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
