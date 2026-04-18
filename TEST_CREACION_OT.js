// 🧪 TEST SCRIPT: Validación de Creación OT TRABAJANDO
// 📍 Ubicación: Pega en DevTools Console del navegador en la app

console.log("=".repeat(60));
console.log("🧪 TEST: Creación de OT con Estado TRABAJANDO");
console.log("=".repeat(60));

// ============================================================
// TEST 1: Verificar que el store tenga OTs
// ============================================================
function test1_checkStore() {
  console.log("\n✅ TEST 1: Verificar Store de OTs");
  
  try {
    const ctx = CORE.state?.ctx?.();
    if (!ctx) {
      console.error("❌ No se pudo obtener contexto");
      return false;
    }
    
    console.log(`   - Total OTs en memoria: ${ctx.itemsByKey.size}`);
    console.log(`   - OTs activas: ${ctx.activeKeys.length}`);
    console.log(`   - OTs finalizadas: ${ctx.finalKeys.length}`);
    
    if (ctx.itemsByKey.size === 0) {
      console.warn("   ⚠️  No hay OTs en memoria (síncroniza primero)");
      return false;
    }
    
    console.log("   ✅ Store visible");
    return true;
  } catch (e) {
    console.error("❌ Error en TEST 1:", e.message);
    return false;
  }
}

// ============================================================
// TEST 2: Verificar que todas las OTs tengan estado TRABAJANDO/PAUSADO/FINALIZADO
// ============================================================
function test2_checkEstados() {
  console.log("\n✅ TEST 2: Verificar Estados de OTs");
  
  try {
    const ctx = CORE.state?.ctx?.();
    const estadosValidos = ["TRABAJANDO", "PAUSADO", "FINALIZADO", "SIN_INICIAR"];
    let problemasEncontrados = false;
    let contadorPorEstado = {};
    
    for (const [key, item] of ctx.itemsByKey) {
      const estado = String(item.estado || "DESCONOCIDO").toUpperCase();
      contadorPorEstado[estado] = (contadorPorEstado[estado] || 0) + 1;
      
      if (!estadosValidos.includes(estado)) {
        console.warn(`   ⚠️  Estado inválido: ${estado} para VIN ${item.vin} | ${item.rolTrabajo}`);
        problemasEncontrados = true;
      }
      
      // Advertencia si hay SIN_INICIAR (no debería haber después de INICIO)
      if (estado === "SIN_INICIAR" && item.running_since) {
        console.warn(`   ⚠️  Anomalía: ${item.vin}|${item.rolTrabajo} está SIN_INICIAR pero running_since=${item.running_since}`);
      }
    }
    
    console.log(`   Distribución por estado:`, contadorPorEstado);
    
    if (problemasEncontrados) {
      console.warn("   ⚠️  Problemas encontrados");
      return false;
    }
    
    console.log("   ✅ Todos los estados son válidos");
    return true;
  } catch (e) {
    console.error("❌ Error en TEST 2:", e.message);
    return false;
  }
}

// ============================================================
// TEST 3: Verificar que no hay duplicados (mismo VIN + ROL)
// ============================================================
function test3_checkDuplicados() {
  console.log("\n✅ TEST 3: Verificar No Duplicados");
  
  try {
    const ctx = CORE.state?.ctx?.();
    const seen = new Map();
    let duplicadosEncontrados = false;
    
    for (const [key, item] of ctx.itemsByKey) {
      const vinRol = `${item.vin || ""}|${item.rolTrabajo || ""}`;
      
      if (seen.has(vinRol)) {
        console.warn(`   ⚠️  DUPLICADO ENCONTRADO: ${vinRol}`);
        console.warn(`       - Key 1: ${seen.get(vinRol)}`);
        console.warn(`       - Key 2: ${key}`);
        duplicadosEncontrados = true;
      } else {
        seen.set(vinRol, key);
      }
    }
    
    console.log(`   - OTs únicas por VIN|ROL: ${seen.size}`);
    
    if (duplicadosEncontrados) {
      console.error("   ❌ DUPLICADOS encontrados en store");
      return false;
    }
    
    console.log("   ✅ No hay duplicados");
    return true;
  } catch (e) {
    console.error("❌ Error en TEST 3:", e.message);
    return false;
  }
}

// ============================================================
// TEST 4: Verificar que todos tengan VIN
// ============================================================
function test4_checkVIN() {
  console.log("\n✅ TEST 4: Verificar Presencia de VIN");
  
  try {
    const ctx = CORE.state?.ctx?.();
    let sin_vin = 0;
    let con_vin = 0;
    
    for (const [key, item] of ctx.itemsByKey) {
      if (!item.vin || String(item.vin).trim() === "") {
        sin_vin++;
        console.warn(`   ⚠️  SIN VIN: ${item.rolTrabajo} | Key: ${key}`);
      } else {
        con_vin++;
      }
    }
    
    console.log(`   - OTs con VIN: ${con_vin}`);
    console.log(`   - OTs SIN VIN: ${sin_vin}`);
    
    if (sin_vin > 0) {
      console.error(`   ❌ ${sin_vin} OTs sin VIN encontradas`);
      return false;
    }
    
    console.log("   ✅ Todas las OTs tienen VIN");
    return true;
  } catch (e) {
    console.error("❌ Error en TEST 4:", e.message);
    return false;
  }
}

// ============================================================
// TEST 5: Mostrar detalles OTs activas
// ============================================================
function test5_mostrarDetalles() {
  console.log("\n✅ TEST 5: Detalles de OTs Activas");
  
  try {
    const ctx = CORE.state?.ctx?.();
    
    console.log("\n📋 OTs ACTIVAS:");
    console.table([...ctx.itemsByKey.values()]
      .map(it => ({
        VIN: it.vin || "(sin vin)",
        ROL: it.rolTrabajo,
        ESTADO: it.estado,
        TIEMPO_MS: it.tiempo_ms,
        RUNNING_SINCE: it.running_since ? "SÍ" : "NO",
        ÚLTIMA_NOTA: (it.last_nota || "").slice(0, 30),
      }))
    );
    
    console.log("✅ Ver tabla arriba");
    return true;
  } catch (e) {
    console.error("❌ Error en TEST 5:", e.message);
    return false;
  }
}

// ============================================================
// TEST 6: Verificar que POST /api/evento retorna TRABAJANDO
// ============================================================
async function test6_apiEvento() {
  console.log("\n✅ TEST 6: Verificar API evento (requiere datos válidos)");
  
  try {
    const email = CORE.state?.usuarioEmail || "test@example.com";
    const vin = "TEST123";
    const rolTrabajo = "MOTOR";
    
    console.log(`   📤 Enviando: POST /api/evento {email, vin:${vin}, rolTrabajo, accion:INICIO}`);
    
    const res = await fetch("/api/evento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        vin,
        rolTrabajo,
        accion: "INICIO",
      }),
    });
    
    const j = await res.json();
    
    console.log(`   📥 Respuesta:`, j);
    
    if (j.ok) {
      if (j.estado === "TRABAJANDO") {
        console.log(`   ✅ Estado correcto: TRABAJANDO`);
        return true;
      } else {
        console.warn(`   ⚠️  Estado incorrecto: ${j.estado} (debería ser TRABAJANDO)`);
        return false;
      }
    } else {
      console.error(`   ❌ Error en API: ${j.error}`);
      return false;
    }
  } catch (e) {
    console.error("❌ Error en TEST 6:", e.message);
    console.log("   (Esto es normal si el backend no está disponible)");
    return false;
  }
}

// ============================================================
// EJECUTAR TODOS LOS TESTS
// ============================================================
async function runAllTests() {
  const results = [];
  
  results.push(["TEST 1: Store", test1_checkStore()]);
  results.push(["TEST 2: Estados", test2_checkEstados()]);
  results.push(["TEST 3: Duplicados", test3_checkDuplicados()]);
  results.push(["TEST 4: VIN", test4_checkVIN()]);
  results.push(["TEST 5: Detalles", test5_mostrarDetalles()]);
  results.push(["TEST 6: API", await test6_apiEvento()]);
  
  // Resumen
  console.log("\n" + "=".repeat(60));
  console.log("📊 RESUMEN:");
  console.table(results);
  
  const passed = results.filter(r => r[1]).length;
  const total = results.length;
  
  console.log(`\n✅ ${passed}/${total} tests pasados`);
  
  if (passed === total) {
    console.log("\n🎉 ¡TODOS LOS TESTS PASARON! La creación de OT está funcionando correctamente.");
  } else {
    console.log(`\n⚠️  ${total - passed} tests fallaron. Revisa los logs arriba.`);
  }
  
  console.log("=".repeat(60));
}

// Ejecutar
runAllTests().catch(e => console.error("Error general:", e));
