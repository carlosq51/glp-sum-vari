// =========================
// scripts/cerrar-ots-huerfanas.js
// Cierra las OTs que quedaron "vivas" con el trabajo YA terminado.
//
// Por qué existe: la rama que cerraba las OTs (routes/trabajo.js) solo
// contemplaba CONVERSION y CALIDAD. RAMALERO no caía en ninguna, así que su
// work_order se quedaba con el "PENDIENTE" del alta aunque el ramalero hubiera
// finalizado. Se acumularon 695 OTs dadas por vivas, algunas de más de tres
// meses, ensuciando la consola del supervisor y engordando /api/ots/vivas.
//
// El bug ya está corregido; esto limpia lo que dejó atrás.
//
// CRITERIO CONSERVADOR: solo cierra una OT si TODAS sus asignaciones están en
// FINALIZADO. Una OT con cualquier asignación abierta no se toca — es
// preferible dejar de más (se ve trabajo que ya no existe) que cerrar de menos
// (desaparece trabajo real de la consola del supervisor).
//
// Uso:
//   node --env-file=.env scripts/cerrar-ots-huerfanas.js           # simulacro
//   node --env-file=.env scripts/cerrar-ots-huerfanas.js --apply   # escribe
// =========================

const APLICAR = process.argv.includes("--apply");
const URL_ = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) { console.error("Faltan SUPABASE_URL / clave en .env"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const LOTE_IN = 100;   // ids por `in.(...)` para no reventar la URL
const LOTE_WR = 50;    // OTs por PATCH

const get_ = async (q) => {
  const r = await fetch(`${URL_}/rest/v1/${q}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${q.slice(0, 60)}: ${r.status} ${await r.text()}`);
  return r.json();
};

const wos = await get_(
  "work_orders?tipo_ot=eq.RAMALERO&estado_general=neq.FINALIZADO" +
  "&select=id,vin,estado_general,fecha_creacion&limit=1000",
);
console.log(`OTs RAMALERO no finalizadas: ${wos.length}`);

// Asignaciones de esas OTs, por lotes
const asgs = [];
const ids = wos.map(w => w.id);
for (let i = 0; i < ids.length; i += LOTE_IN) {
  asgs.push(...await get_(
    `asignaciones?work_order_id=in.(${ids.slice(i, i + LOTE_IN).join(",")})` +
    "&select=work_order_id,estado_actual&limit=1000",
  ));
}
const porWo = new Map();
for (const a of asgs) {
  if (!porWo.has(a.work_order_id)) porWo.set(a.work_order_id, []);
  porWo.get(a.work_order_id).push(String(a.estado_actual || "").toUpperCase());
}

const aCerrar = [], seQuedan = [];
for (const w of wos) {
  const estados = porWo.get(w.id) || [];
  // Sin asignaciones NO se cierra: no hay prueba de que el trabajo se hiciera.
  if (estados.length && estados.every(e => e === "FINALIZADO")) aCerrar.push(w);
  else seQuedan.push({ ...w, estados });
}

console.log(`\n  a CERRAR (todas sus asignaciones FINALIZADO): ${aCerrar.length}`);
console.log(`  se QUEDAN abiertas (trabajo real o sin asignación): ${seQuedan.length}`);
for (const w of seQuedan.slice(0, 10)) {
  console.log(`     · ${w.vin || "(sin vin)"} ${w.estado_general} [${w.estados.join(",") || "sin asignaciones"}]`);
}

if (aCerrar.length) {
  const fechas = aCerrar.map(w => new Date(w.fecha_creacion)).sort((a, b) => a - b);
  console.log(`\n  antigüedad: de ${fechas[0].toISOString().slice(0, 10)} a ${fechas.at(-1).toISOString().slice(0, 10)}`);
}

if (!APLICAR) {
  console.log("\n=== SIMULACRO — no se escribió nada. Repetir con --apply ===");
  process.exit(0);
}

let escritas = 0;
for (let i = 0; i < aCerrar.length; i += LOTE_WR) {
  const lote = aCerrar.slice(i, i + LOTE_WR).map(w => w.id);
  const r = await fetch(`${URL_}/rest/v1/work_orders?id=in.(${lote.join(",")})`, {
    method: "PATCH", headers: H, body: JSON.stringify({ estado_general: "FINALIZADO" }),
  });
  if (!r.ok) { console.error(`  lote ${i}: ${r.status} ${await r.text()}`); continue; }
  escritas += lote.length;
  console.log(`  cerradas ${escritas}/${aCerrar.length}`);
}
console.log(`\nListo: ${escritas} OTs cerradas.`);
