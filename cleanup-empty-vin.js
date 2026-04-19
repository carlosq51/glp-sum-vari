import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function cleanupEmptyVin() {
  console.log("🧹 Limpiando OTs sin VIN...");
  
  // 1. Obtener todas las work_orders sin VIN
  const url_wo = `${SUPABASE_URL}/rest/v1/work_orders?vin=is.null`;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url_wo, { method: "GET", headers });
  const workOrders = await res.json();
  
  console.log(`Encontradas ${workOrders.length} work_orders sin VIN:`, workOrders);

  // 2. Eliminar sus asignaciones asociadas
  for (const wo of workOrders) {
    console.log(`\n🗑️ Eliminando asignaciones para work_order_id: ${wo.id}`);
    
    // Obtener asignaciones
    const url_asg = `${SUPABASE_URL}/rest/v1/asignaciones?work_order_id=eq.${wo.id}`;
    const res_asg = await fetch(url_asg, { method: "GET", headers });
    const asignaciones = await res_asg.json();
    
    console.log(`   Encontradas ${asignaciones.length} asignaciones`);
    
    // Eliminar cada asignación
    for (const asg of asignaciones) {
      const url_del = `${SUPABASE_URL}/rest/v1/asignaciones?id=eq.${asg.id}`;
      const res_del = await fetch(url_del, { method: "DELETE", headers });
      console.log(`   ✅ Eliminada asignación ${asg.id}`);
    }
    
    // Eliminar la work_order
    console.log(`🗑️ Eliminando work_order ${wo.id}`);
    const url_wo_del = `${SUPABASE_URL}/rest/v1/work_orders?id=eq.${wo.id}`;
    const res_wo_del = await fetch(url_wo_del, { method: "DELETE", headers });
    console.log(`✅ Eliminada work_order ${wo.id}`);
  }

  console.log("\n✅ Limpieza completada");
}

cleanupEmptyVin().catch(console.error);
