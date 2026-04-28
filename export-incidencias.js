import https from 'https';
import fs from 'fs';

const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmeXNxeHBua3pqb21la3RsZXFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzA4MjcxMywiZXhwIjoyMDg4NjU4NzEzfQ.vZ8r2x7LBgLqHQ_GAgLGe5sZ9GTpBOxCumyTLI9_oDk';

const options = {
  hostname: 'kfysqxpnkzjomektleqk.supabase.co',
  path: '/rest/v1/incidencias?select=id,vin,tecnico,tipo,mes,nota,fecha_hora&order=fecha_hora.asc',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
  },
};

https.get(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    let rows;
    try { rows = JSON.parse(data); } catch (e) { console.error('Parse error:', data); process.exit(1); }
    if (!Array.isArray(rows)) { console.error('Unexpected response:', data); process.exit(1); }
    console.log('Total incidencias:', rows.length);

    function csvCell(v) {
      const s = String(v == null ? '' : v).replace(/"/g, '""');
      return '"' + s + '"';
    }

    const lines = ['#,VIN,Tecnico,Tipo,Mes,Nota,Fecha'];
    rows.forEach((r, i) => {
      lines.push([
        i + 1,
        csvCell(r.vin),
        csvCell(r.tecnico),
        csvCell(r.tipo),
        csvCell(r.mes),
        csvCell(r.nota),
        csvCell(r.fecha_hora),
      ].join(','));
    });

    const out = lines.join('\r\n');
    fs.writeFileSync('incidencias_notas.csv', out, 'utf8');
    console.log('Archivo generado: incidencias_notas.csv');
  });
}).on('error', err => { console.error('HTTP error:', err.message); process.exit(1); });
