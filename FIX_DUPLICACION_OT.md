# 🔧 FIX: Duplicación de OT sin VIN al hacer PAUSA/REANUDAR/INICIO

## 📋 Problema Original
Cuando ejecutabas eventos como PAUSA, REANUDAR o INICIO, tu OT se duplicaba:
- **Una copia**: CON VIN `LVTDB11B2VH501089 (MOTOR)` ✅
- **Otra copia**: SIN VIN `(sin VIN) (MOTOR)` ❌

Ambas eran idénticas excepto por el VIN perdido.

---

## 🔍 Raíz del Problema

### 1. **Backend: `/api/mis-activas` hacía JOIN incorrecto**
```javascript
// ❌ ANTES: retornaba todos los campos sin control
query += `&select=*,work_orders(*)&order=updated_at.desc&limit=50`;

// Mapeo usando SPREAD de ambos objetos
const items = asignaciones.map(asg => ({
  ...asg,                 // Campos de asignaciones
  ...asg.work_orders,     // ← Problema: work_orders es un ARRAY
  ...                     // o NULL si no hay relación
}));
```

**Problema**: Supabase devuelve `work_orders: [{}]` (array), no un objeto. El spread de un array crea comportamiento extraño.

### 2. **Frontend: Normalización usaba `id` en lugar de `work_order_id`**
```javascript
// ❌ ANTES en conversion-store.js
conversionId: String(pickFirst_(
  raw?.conversionId, 
  raw?.conversion_id, 
  raw?.CONVERSION_ID, 
  raw?.ID,        // ← Toma el ID de asignación, no del work_order
  raw?.id
)).trim(),
```

**Problema**: Las claves se creaban como `${asignacion.id}|${rol}` en lugar de `${work_order_id}|${rol}`.

Si llegaban dos asignaciones con diferentes IDs pero el mismo work_order_id, se trataban como OTs DIFERENTES, creando duplicados.

### 3. **VIN podía ser NULL sin fallback**
Si el JOIN fallaba, `work_orders` era NULL y `vin` resultaba undefined/empty en la UI.

---

## ✅ Solución Implementada

### 1. **Backend: Query explícita con mapeo seguro** ([index.js](index.js#L289-L371))
```javascript
// ✅ DESPUÉS: SELECT explícito de campos necesarios
query += `&select=id,work_order_id,user_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,updated_at,last_nota,last_nota_ts,work_orders(id,vin,estado_general,tanque_registrado,reductor_registrado)`;

// ✅ Mapeo seguro extrayendo correctamente work_orders del array
const items = asignaciones.map(asg => {
  const wo = Array.isArray(asg.work_orders) && asg.work_orders.length > 0 
    ? asg.work_orders[0] 
    : (typeof asg.work_orders === 'object' ? asg.work_orders : {});

  return {
    // De asignaciones
    id: asg.id,
    work_order_id: asg.work_order_id,
    ...
    // De work_orders (SIEMPRE presentes con fallbacks)
    vin: wo?.vin || "",  // ✅ FALLBACK a string vacío
    estado_general: wo?.estado_general || "PENDIENTE",
    ...
  };
});
```

**Beneficios**:
- SELECT explícito evita traer columnas innecesarias
- Extracción segura de work_orders del array
- Fallbacks aseguran que VIN NUNCA es undefined

### 2. **Frontend: Normalización usa `work_order_id`** ([conversion-store.js](public/js/views/conversion/state/conversion-store.js#L49))
```javascript
// ✅ DESPUÉS: Tomar work_order_id como identidad
conversionId: String(pickFirst_(
  raw?.conversionId, 
  raw?.conversion_id, 
  raw?.work_order_id,  // ← Prioritario: es el UUID de work_order
  raw?.CONVERSION_ID, 
  raw?.ID, 
  raw?.id
)).trim(),
```

**Beneficios**:
- Las claves se crean como `${work_order_id}|${rol}` (la verdadera identidad)
- Map en itemsByKey deduplica automáticamente asignaciones del mismo work_order/rol
- Si llegan 2 asignaciones con igual work_order_id y rol, solo una se guarda (la última)

### 3. **Backend: `/api/evento` garantiza VIN en respuesta** ([index.js](index.js#L625-L642))
```javascript
// ✅ Respuesta incluye SIEMPRE el VIN y work_order_id
return res.json({
  ok: true,
  ...asignacion,
  vin: vin,              // ✅ Siempre presente
  work_order_id: workOrderId,
  conversionId: workOrderId,  // Alias para compatibilidad
  estado: asignacion.estado_actual,
  _timing: `${duration}ms`,
});
```

---

## 🔄 Flujo Corregido

```
1. Usuario hace click en PAUSA/REANUDAR/INICIO
   ↓
2. Frontend: enviarEvento(accion, {vin, rolTrabajo})
   ↓
3. POST /api/evento con {email, vin, rolTrabajo, accion}
   ↓
4. Backend: 
   - Obtiene/crea work_order para ese VIN
   - Obtiene/actualiza asignación (garantiendo UNA sola activa)
   - Retorna: {vin, work_order_id, conversionId, estado, ...}
   ↓
5. Frontend: normalizeItem_() mapea work_order_id → conversionId
   ↓
6. Frontend: crea KEY = "${work_order_id}|${rol}" 
   ↓
7. Frontend: itemsByKey.set(KEY, item)  ← Deduplicación natural
   ↓
8. syncNow() obtiene desde /api/mis-activas
   ↓
9. Backend: Retorna asignaciones con:
   - work_order_id (para que frontend cree keys consistentes)
   - vin (no NULL, con fallback)
   - estado_actual
   ↓
10. Frontend: Idem pasos 5-7
    ↓
11. renderActivas_() itera c.activeKeys (no duplicados)
    ↓
12. UI: UNA sola OT con VIN COMPLETO ✅
```

---

## 🧪 Qué Cambió Técnicamente

| Aspecto | Antes ❌ | Después ✅ |
|---------|---------|---------|
| **Key en itemsByKey** | `${asignacion.id}\|${rol}` | `${work_order_id}\|${rol}` |
| **VIN en respuesta** | Puede faltar/ser NULL | Siempre presente (|| "") |
| **JOIN Supabase** | `SELECT *,work_orders(*)` | SELECT explícito |
| **Tratamiento work_orders** | SPREAD w/ spread operator | Extracción segura del array |
| **Deduplicación** | No hay (duplicados visibles) | Natural en Map (por key) |

---

## 🚀 Cómo Probar

1. **Antes de hacer evento**: abre DevTools Console
2. **Haz un evento** (PAUSA/REANUDAR/INICIO)
3. **En Console**, ejecuta:
   ```javascript
   // Ver todas las OTs en memoria
   console.log([...CORE.state.ctx().itemsByKey.values()]);
   
   // Ver keys únicas
   console.log([...CORE.state.ctx().itemsByKey.keys()]);
   ```
4. **Verifica**: 
   - No hay dos items con mismo work_order_id + rol
   - Todos los items tienen un vin válido
   - Solo VES una OT en la UI (no duplicados)

---

## 📝 Archivos Modificados

1. **index.js**
   - `/api/mis-activas` (línea ~289)
   - `/api/mis-finalizadas` (línea ~349)
   - `POST /api/evento` (línea ~625)

2. **public/js/views/conversion/state/conversion-store.js**
   - `normalizeItem_()` (línea ~49)

---

## ⚠️ Notas Importantes

- El constraint único en Supabase (`idx_asg_active`) **ya previene múltiples asignaciones activas**, pero el frontend antes NO respetaba eso
- Las claves ahora usan `work_order_id` que es el UUID único real de la OT
- Si ves algo extraño después del deploy, revisa la Console del navegador para errores de normalización
