import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const headers = {
  'apikey': key,
  'Authorization': 'Bearer ' + key,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

// 1. Buscar todas las OTs CALIDAD donde estado_general != FINALIZADO
const r = await fetch(
  url + '/rest/v1/work_orders?tipo_ot=eq.CALIDAD&estado_general=neq.FINALIZADO&select=id,vin,estado_general',
  { headers }
);
const rows = await r.json();
console.log('OTs CALIDAD no finalizadas:', Array.isArray(rows) ? rows.length : 'ERROR:' + JSON.stringify(rows));

if (!Array.isArray(rows) || !rows.length) {
  console.log('Nada que parchear.');
  process.exit(0);
}

// 2. Para cada una, verificar si la asignación CALIDAD está FINALIZADO
let fixed = 0;
for (const wo of rows) {
  const ar = await fetch(
    url + `/rest/v1/asignaciones?work_order_id=eq.${wo.id}&rol_trabajo=eq.CALIDAD&select=id,estado_actual`,
    { headers }
  );
  const asigs = await ar.json();

  if (!Array.isArray(asigs) || !asigs.length) {
    console.log(`  ${wo.vin} (${wo.id}): sin asignación CALIDAD, skipping`);
    continue;
  }

  const allDone = asigs.every(a => a.estado_actual === 'FINALIZADO');
  if (!allDone) {
    const pending = asigs.map(a => a.estado_actual);
    console.log(`  ${wo.vin} (${wo.id}): asignación en [${pending.join(', ')}], skipping`);
    continue;
  }

  // Parchear estado_general = FINALIZADO
  const pr = await fetch(
    url + `/rest/v1/work_orders?id=eq.${wo.id}`,
    { method: 'PATCH', headers, body: JSON.stringify({ estado_general: 'FINALIZADO' }) }
  );
  if (pr.ok) {
    console.log(`  ✓ ${wo.vin} (${wo.id}): estado_general → FINALIZADO`);
    fixed++;
  } else {
    console.log(`  ✗ ${wo.vin} (${wo.id}): ERROR ${await pr.text()}`);
  }
}

console.log(`\nListo: ${fixed} de ${rows.length} OTs parcheadas.`);
