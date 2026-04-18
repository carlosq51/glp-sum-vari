# 🔧 FIX: Foreign Key Constraint Error en work_orders

## ❌ Problema Original

```
Error: 409 Constraint Violation
Message: insert or update on table "work_orders" violates foreign key constraint "work_orders_vin_fkey"
Details: Key is not present in table "vins"
```

### Causa Raíz

El schema de Supabase define:

```sql
CREATE TABLE work_orders (
  ...
  vin TEXT REFERENCES vins(vin),
  ...
);

ALTER TABLE work_orders ADD CONSTRAINT chk_conv_has_vin
  CHECK (tipo_ot != 'CONVERSION' OR vin IS NOT NULL);
```

**Traducción**: Para una OT de tipo CONVERSION, el VIN es:
1. **Obligatorio** (NOT NULL por check)
2. **Debe existir en tabla `vins`** (Foreign Key constraint)

### Error en el Código Anterior

```javascript
// ❌ PROBLEMA: Si crear VIN falla, continúa de todos modos
if (!vins || !vins.length) {
  try {
    const createdVin = await supabasePost_("vins", vinData);
  } catch (vinErr) {
    console.warn(`No se pudo crear VIN ${vin}:`);
    // ❌ SIGUE AQUÍ - No relanza el error!
  }
}

// ❌ Intenta crear work_order SIN GARANTIZAR que VIN existe
const createdWO = await supabasePost_("work_orders", woData);
// → Falla con: Key is not present in table "vins"
```

---

## ✅ Solución Implementada

### Cambios en index.js (POST /api/evento)

```javascript
// ✅ CORRECTO: VIN primero, con validación de éxito

if (!vins || !vins.length) {
  let createdVin = null;
  try {
    const vinData = {
      vin: vin,
      modelo: "DESCONOCIDO",
      estado: "PENDIENTE",
      created_at: new Date().toISOString(),
    };
    createdVin = await supabasePost_("vins", vinData);
    
    // ✅ Verificar respuesta actual
    if (!createdVin || !createdVin.vin) {
      throw new Error(`Respuesta vacía: ${JSON.stringify(createdVin)}`);
    }
    
  } catch (vinErr) {
    const errMsg = String(vinErr.message || vinErr);
    
    // ✅ MANEJO DE DUPLICATE KEY (ya existe)
    if (errMsg.includes("23505") || errMsg.includes("duplicate")) {
      console.warn(`VIN ${vin} reportó duplicate, verificando...`);
      // Reintenta lectura
      vins = await supabaseGet_("vins", { vin });
      if (!vins || !vins.length) {
        throw new Error(`VIN reportó duplicate pero no aparece en lectura`);
      }
    } else {
      // ✅ CRÍTICO: Relanzar error
      throw new Error(`No se pudo crear VIN: ${errMsg}`);
    }
  }
}

// ✅ Ahora SÍ crear work_order (VIN garantizado)
try {
  const woData = {
    tipo_ot: "CONVERSION",
    vin: vin,
    estado_general: "PENDIENTE",
  };
  const createdWO = await supabasePost_("work_orders", woData);
  // ← Aquí el VIN YA EXISTE, no hay problema de FK
} catch (woErr) {
  throw new Error(`No se pudo crear Work Order: ${woErr.message}`);
}
```

### Diferencias Clave

| Aspecto | Antes | Después |
|---------|-------|---------|
| Manejo de error VIN | `catch` silencioso | `throw` error |
| Verification de creación | NO | SÍ (check respuesta.vin) |
| Duplicate handling | NO | SÍ (reintenta lectura) |
| Garantía FK | NO | ✅ SÍ (VIN antes que work_order) |
| Logging | Mínimo | Completo con timestamps |

---

## 🔍 Flujo Mejorado

```
POST /api/evento
  ↓
Validar campos básicos
  ↓
Buscar work_orders existentes
  ↓
SI NO EXISTE:
  ├─ Buscar VIN existente
  │  ↓
  │  SI NO EXISTE:
  │  ├─ ✅ CREAR VIN
  │  ├─ Verificar respuesta (no vacía)
  │  │  ✅ OK → continuar
  │  │  ❌ Vacía → THROW error
  │  ├─ Catch:
  │  │  ├─ Duplicate? → Reintenta lectura
  │  │  │  ✅ Aparece → continuar
  │  │  │  ❌ No aparece → THROW error de inconsistencia
  │  │  └─ Otro error? → THROW error
  │  │
  │  ├─ ✅ CREAR work_order (VIN GARANTIZADO)
  │  │  ↓
  │  │  ✅ Success
  │  │  ❌ Error → THROW (pero no debería, VIN existe)
  │
  └─ SI EXISTE:
     └─ Usar work_order existente
        ↓
✅ Continuar con asignación
```

---

## 📊 Escenarios Cubiertos

### Escenario 1: VIN no existe, se crea exitosamente
```
1. GET vins → NO EXISTE
2. POST vins → 200 OK, respuesta válida
3. POST work_orders → 200 OK, FK válido
✅ ÉXITO
```

### Escenario 2: VIN ya existe en tabla
```
1. GET vins → YA EXISTE
2. POST work_orders → 200 OK
✅ ÉXITO (no intenta recrear)
```

### Escenario 3: VIN duplicate key race condition
```
1. GET vins → NO EXISTE
2. POST vins → 409 Duplicate (otro usuario lo creó)
3. GET vins retry → YA EXISTE
4. POST work_orders → 200 OK
✅ ÉXITO (maneja race condition)
```

### Escenario 4: VIN duplicate y no aparece
```
1. GET vins → NO EXISTE
2. POST vins → 409 Duplicate
3. GET vins retry → SIGUE NO EXISTIENDO
4. THROW error (DB inconsistente)
❌ ERROR REPORTADO CLARAMENTE
```

### Escenario 5: Otro error al crear VIN
```
1. GET vins → NO EXISTE
2. POST vins → 500 Server error / 403 Forbidden / etc
3. THROW error específico
❌ ERROR REPORTADO CON CONTEXTO
```

---

## 🚀 Testing Post-Fix

### Test 1: VIN nuevo
```
1. VIN = "ABC123NEW"
2. POST /api/evento (INICIO)
3. Esperar respuesta
```

**Esperado**:
```
Status: 200
Response.ok: true
Response.estado_actual: "TRABAJANDO"
Response.vin: "ABC123NEW"

Console logs:
[EVENTO] VIN creado automáticamente: ABC123NEW
[EVENTO] Work Order creado: [id]
```

### Test 2: VIN existente
```
1. VIN = "ABC123" (ya existe)
2. POST /api/evento (INICIO)
3. Esperar respuesta
```

**Esperado**:
```
Status: 200
Response.ok: true
Response.estado_actual: "TRABAJANDO"
Response.vin: "ABC123"

Console logs:
[EVENTO] Work Order existente encontrado: [id]
```

### Test 3: Multiple simultaneous (race condition)
```
1. Usuario A: POST /api/evento VIN="XYZ789"
2. Usuario B: POST /api/evento VIN="XYZ789" (casi al mismo tiempo)
3. Ambos esperan respuesta
```

**Esperado**:
```
Usuario A: 200 OK (crea VIN y WO)
Usuario B: 200 OK (VIN ya existe, usa mismo WO)

Console:
[EVENTO] VIN creado: XYZ789
[EVENTO] VIN XYZ789 ya existe (duplicate), reintentando...
[EVENTO] VIN XYZ789 confirma después de retry
```

---

## ✅ Verificación Post-Deploy

En console del servidor:

```bash
# Buscar en logs por any de estos para confirmar fix:
grep "[EVENTO] VIN creado\|VIN NO EXISTE\|already exists" /var/log/app.log

# Output esperado:
# [EVENTO] VIN creado automáticamente: [VINs creados]
# [EVENTO] Work Order creado: [ids]
# No debería ver: FK constraint violations
```

En DevTools Console (Frontend):

```javascript
// Después de hacer INICIO:
const c = CORE.state.ctx();
const ot = [...c.itemsByKey.values()][0];
console.log("OT creada:", {
  vin: ot.vin,
  estado: ot.estado,
  rolTrabajo: ot.rolTrabajo,
});
// Esperado: {vin: "ABC123", estado: "TRABAJANDO", rolTrabajo: "MOTOR"}
```

---

## 🎯 Garantías Posteriores a Este Fix

✅ **VIN siempre existe antes de crear work_order**
✅ **No hay violaciones de FK constraint**
✅ **Maneja race conditions de duplicate key**
✅ **Errores son específicos y traceable**
✅ **Logging completo para debugging**
✅ **Recuperación automática de inconsistencias menores**

