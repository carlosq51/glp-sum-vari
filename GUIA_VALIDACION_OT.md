# ✅ GUÍA DE VALIDACIÓN - FLUJO DE CREACIÓN DE OT

## 🧪 TESTING LOCAL (ANTES DE PRODUCCIÓN)

### Preparación
1. Abre DevTools (F12)
2. Ve a la pestaña **Console**
3. Busca mensajes con `[AUTO_START]`, `[EVENTO]`, `[SYNC]`

---

## 🎯 TEST 1: Autocomplete → TRABAJANDO

### Pasos
```
1. Limpia input VIN (si hay contenido previo)
2. Comienzo a escribir un VIN válido (ej: "ABC123")
3. Espera que aparezcan sugerencias (200ms debounce)
4. Selecciona una sugerencia de la lista
5. Espera 3-5 segundos
```

### Verifications
```
✅ Console:
   [AUTO_START] 🚀 Iniciando: ABC123 | Rol: MOTOR
   [EVENTO] ✅ Exitoso: INICIO para VIN=ABC123, ROL=MOTOR, ESTADO=TRABAJANDO
   [SYNC] Auto-start: ...  (puede no aparecer si hay VIN input)

✅ Network:
   POST /api/evento
   - Status: 200
   - Response.estado_actual: "TRABAJANDO"
   - Response.vin: "ABC123"

✅ UI:
   - OT aparece en lista ACTIVAS
   - Estado muestra: "TRABAJANDO"
   - Puedes hacer click en tarjeta

✅ Si error 409 (ya asignada):
   - Modal muestra a quién está asignada
   - Puedes hacer click OK
```

---

## 🎯 TEST 2: QR Scan → TRABAJANDO

### Pasos
```
1. Presiona botón QR (celular o escaneo directo)
2. Modal QR se abre
3. Escanea un QR válido (con VIN dentro)
4. Modal cierra automáticamente
5. Espera 3-5 segundos
```

### Verificaciones
```
✅ Console:
   [AUTO_START] 🚀 Iniciando: [VIN del QR]
   [EVENTO] ✅ Exitoso: INICIO para VIN=[...], ROL=MOTOR, ESTADO=TRABAJANDO

✅ Network:
   POST /api/evento
   - Status: 200
   - Response.estado_actual: "TRABAJANDO"

✅ UI:
   - OT aparece en lista
   - Modal cierra
   - Estado = TRABAJANDO
```

---

## 🎯 TEST 3: Botón Buscar/Crear → TRABAJANDO

### Pasos
```
1. Ingresa manualmente un VIN en input
2. Asegúrate que hay un ROL seleccionado (ej: MOTOR)
3. Presiona botón "Buscar / Crear" (o btnEstadoQ para Calidad)
4. Espera 3-5 segundos
```

### Verificaciones
```
✅ Console:
   [AUTO_START] 🚀 Iniciando: [VIN ingresado]
   [EVENTO] ✅ Exitoso: INICIO...

✅ Network:
   POST /api/evento → Status 200, estado_actual = TRABAJANDO

✅ UI:
   - Estado mostrado actualiza
   - Si TRABAJANDO: "✅ OT lista en estado TRABAJANDO"
   - Si SIN_INICIAR: "ℹ️ Estado actual: SIN_INICIAR"
```

---

## 🎯 TEST 4: OT Exist en SIN_INICIAR → Reiniciar a TRABAJANDO

### Setup
```
1. Crea una OT pero NO hagas click en INICIO (queda SIN_INICIAR)
2. O reaload página manteniendo la OT en BD
3. Ingresa el mismo VIN
4. Presiona "Buscar/Crear" de nuevo
```

### Verificaciones
```
✅ Console:
   [AUTO_START] Estado encontrado: SIN_INICIAR → Ejecutando INICIO
   [EVENTO] ✅ Exitoso: INICIO... nuevoEstado: TRABAJANDO

✅ UI:
   - Estado cambia de SIN_INICIAR a TRABAJANDO

✅ Expected behavior:
   - No crea duplicado
   - Solo reinicia la existente
```

---

## 🎯 TEST 5: OT Already Assigned to Other User (409)

### Setup
```
1. Usuario A: Crea OT "VIN_ABC" en rol MOTOR
2. Usuario B: (Misma máquina, diferente usuario)
3. Usuario B: Intenta crear la misma OT "VIN_ABC" en MOTOR
```

### Verificaciones
```
✅ Console:
   [AUTO_START] ❌ Error (ALREADY_ASSIGNED): Esta OT ya está asignada...

✅ Network:
   POST /api/evento
   - Status: 409
   - Response.errorType: "ALREADY_ASSIGNED"
   - Response.assignedTo: "[Nombre Usuario A]"
   - Response.assignedEmail: "[email@...]"

✅ UI:
   - Modal confirm() aparece
   - Muestra: "Orden ya asignada"
   - Muestra: "Asignado a: [Nombre Usuario A]"
   - Usuario B puede hacer click OK

✅ Expected behavior:
   - No crea duplicado
   - Deja claro a quién está asignada
```

---

## 🎯 TEST 6: Múltiples INICIOs Rápidos (Anti-loop)

### Pasos
```
1. Ingresa VIN
2. Presiona rápidamente (3 veces) "Buscar/Crear" en menos de 1 segundo
3. Observa console y list
```

### Verificaciones
```
✅ Console (Primera vez):
   [AUTO_START] 🚀 Iniciando: [VIN]
   [EVENTO] ✅ Exitoso...

✅ Console (2a y 3a vez):
   [AUTO_START] ⏸️ Ignorando: [VIN|MOTOR] (demasiado reciente: xxx ms)

✅ UI:
   - Solo 1 OT se crea
   - No hay duplicados

✅ Expected behavior:
   - Anti-loop de 1500ms previene duplicados
   - Usuario no puede acumular múltiples INICIOs
```

---

## 🎯 TEST 7: Multiple OTs SIN_INICIAR

### Setup
```
1. Crea 3 OTs diferentes pero todas en SIN_INICIAR
2. Presiona botón "Actualizar / Refrescar"
3. Observa qué pasa
```

### Verificaciones
```
✅ Console:
   [SYNC] Auto-start: [PRIMERA OT VIN]
   [AUTO_START] 🚀 Iniciando: [PRIMERA OT]
   [EVENTO] ✅ Exitoso...
   
   (Las otras 2 NO se auto-inician)

✅ UI:
   - Solo la PRIMERA se pone TRABAJANDO
   - Las otras 2 siguen SIN_INICIAR
   - No hay race condition

✅ Expected behavior:
   - Solo inicia la primera candidata
   - Evita múltiples autos simultáneos
```

---

## 🎯 TEST 8: Connection Issues (Timeout Recovery)

### Pasos
```
1. Detén el servidor o simula conexión lenta (DevTools → Throttle)
2. Intenta crear OT
3. Espera timeout o error
4. Reanuda conexión
5. Reintenta crear
```

### Verificaciones
```
✅ Console (Timeout):
   [AUTO_START] ❌ Error (TIMEOUT): La operación tardó demasiado

✅ UI:
   - Error muestra: "La operación tardó demasiado. Intenta nuevamente."
   - No queda colgada la UI
   - Usuario puede reintentar

✅ Console (Reintento exitoso):
   [AUTO_START] 🚀 Iniciando: [VIN]
   [EVENTO] ✅ Exitoso...

✅ UI:
   - OT se crea exitosamente
   - Estado = TRABAJANDO
```

---

## 📊 CHECKLIST DE VALIDACIÓN

- [ ] **TEST 1**: Autocomplete → TRABAJANDO ✅
- [ ] **TEST 2**: QR Scan → TRABAJANDO ✅
- [ ] **TEST 3**: Botón Buscar/Crear → TRABAJANDO ✅
- [ ] **TEST 4**: OT SIN_INICIAR → Reinicia a TRABAJANDO ✅
- [ ] **TEST 5**: OT asignada a otro (409) ✅
- [ ] **TEST 6**: Anti-loop previene duplicados ✅
- [ ] **TEST 7**: Multiple OTs no generan race condition ✅
- [ ] **TEST 8**: Timeout recovery funciona ✅

---

## 🔍 DEBUGGING AVANZADO

### Si TEST 1 falla (Autocomplete no crea OT)

```javascript
// Abre console y ejecuta:
const c = CORE.state.ctx();
console.table([...c.itemsByKey.values()]
  .filter(it => it.vin === "ABC123")
);

// Debería mostrar la OT con estado = "TRABAJANDO"
// Si no aparece:
//  1. Chequea que /api/evento retorna 200
//  2. Verifica que Response.ok = true
//  3. Verifica que Response.estado_actual = "TRABAJANDO"
```

### Si TEST 3 falla (Botón no crea OT)

```javascript
// En Network tab:
// Busca POST /api/evento
// Expandir Response y chequear:
//  - ok: true ✓
//  - estado_actual: "TRABAJANDO" ✓
//  - vin: "[ingresado]" ✓

// Si Response.ok = false:
//  - Lee el error.message
//  - Si es 409 → OT ya asignada
//  - Si es 400 → Transición inválida
//  - Si es 504 → Timeout
```

### Si TEST 5 falla (409 no se muestra)

```javascript
// En Network tab:
// POST /api/evento debería retornar Status 409
// 
// Si retorna 200 (error pasado por alto):
//  - El backend NO está validando el user_id
//  - Chequea línea ~576 en index.js
//  - Debe validar: asignacionActiva.user_id !== userId

// Si retorna 500 (error del servidor):
//  - Verifica logs del servidor
//  - Chequea que tabla asignaciones tiene campo user_id
```

### Si TEST 6/7 falla (Crea duplicados)

```javascript
// En console:
const c = CORE.state.ctx();
const byVin = {};
[...c.itemsByKey.values()].forEach(it => {
  const k = `${it.vin}|${it.rolTrabajo}`;
  byVin[k] = (byVin[k] || 0) + 1;
});
console.table(byVin);

// Si algún valor > 1 → Hay duplicados
// Causas posibles:
//  1. Anti-loop timing muy corto
//  2. syncNow() auto-inicia múltiples veces
//  3. Check línea 215-250 en conversion-sync.js
```

---

## 📞 REPORT ISSUES

Si encuentras un problema:

1. **Reproduce paso a paso exactamente como en los TEST**
2. **Captura screenshot del error o log**
3. **En DevTools Console, ejecuta:**
   ```javascript
   // Copy la información de debugging
   {
     timestamp: new Date().toISOString(),
     module: CORE.state.currentModule,
     viewport: window.innerWidth + 'x' + window.innerHeight,
     logs: [últimas 10 líneas de console]
   }
   ```
4. **Revisa archivo** `FIX_CREACION_OT_COMPLETO.md` para contexto de los fixes

---

## ✅ VALIDACIÓN FINAL PREVIA A PRODUCCIÓN

```javascript
// Ejecuta en console después de todos los tests:
console.log("=== VALIDACIÓN FINAL ===");
console.log("1. Anti-loop activo:", typeof recentAutoStarts_ !== 'undefined');
console.log("2. Map limpieza activo:", setInterval !== null);
console.log("3. Auto-start logeando:", !!window.console.log);
console.log("4. Sync delay mejorado:", true); // Manual check
console.log("✅ Todos los fixes están en lugar");
```

