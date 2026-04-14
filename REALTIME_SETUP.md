# ⚡ Configuración Realtime en Supabase

## 1. Habilitar Realtime en tu Proyecto Supabase

### En la consola de Supabase:

1. Ve a **Realtime** → **Publications**
2. Para cada tabla que necesites monitorear, marca como **"Published"**:
   - ✅ `asignaciones`
   - ✅ `work_orders`
   - ✅ `incidencias`
   - ✅ `usuarios`
   - ✅ `vins`

3. Alternativamente, en tu dashboard:
   - Ve a **Database** → **Replication**
   - Elige cada tabla y marca "Replica identity"

## 2. Verificación en DevTools

### Console:
```javascript
// Ver estado de las suscripciones
getRealtimeStatus()  // desde supabase-client.js
```

Deberías ver:
```
{
  asignaciones: { connected: true, listeners: 1 },
  work_orders: { connected: true, listeners: 1 },
  incidencias: { connected: true, listeners: 1 }
}
```

### Network:
- Busca conexión WebSocket a `wss://yourproject.supabase.co/realtime/v1`
- Debe ser **"101 Switching Protocols"** (upgrade correcto)

## 3. Flujo Automático

**Sin hacer nada desde el usuario:**

1. Al entrar a "Mis Activas" → se conecta Realtime
2. Cuando hay cambio en BD (INSERT/UPDATE/DELETE) → se dispara el callback
3. Se ejecuta `syncNow()` automáticamente
4. UI se actualiza sin que el usuario haga nada ✨

## 4. Fallback Automático

Si Realtime se desconecta (sin conexión de internet, etc.):
- Se intenta reconectar cada 5 segundos
- Si falla, existe un polling de respaldo cada 30 segundos vía `/api/mis-activas`

## 5. Eliminación de Logs

Todos los logs de timing fueron eliminados. Si necesitas debug:

```javascript
// En console
localStorage.setItem('glp_debug', 'true')

// En el código:
if (localStorage.getItem('glp_debug')) console.log(...)
```

## 6. Tablas a Monitorear

| Tabla | Evento | Acción |
|-------|--------|--------|
| `asignaciones` | INSERT/UPDATE/DELETE | Refrescar lista activas/finalizadas |
| `work_orders` | INSERT/UPDATE | Refrescar detalles |
| `incidencias` | INSERT | Refrescar lista de incidencias |
| `usuarios` | UPDATE | Actualizar perfil |
| `vins` | INSERT | Actualizar autocomplete |

## 7. Troubleshooting

**Problema:** WebSocket no conecta
- Verifica que Realtime esté habilitado en Supabase
- Verifica las policies de RLS: deben permitir SELECT

**Problema:** Los datos no se actualizar automáticamente
- Abre DevTools → Console
- Ejecuta `getRealtimeStatus()`
- ¿Dice `connected: false`? → Problema de conexión WS

**Problema:** Demasiados updates simultáneos
- Es normal durante sincronizaciones masivas
- Se agrupan y procesan automáticamente

## 8. Verificación Final

1. Abre dos navegadores con la app
2. En el navegador 1: selecciona Mis Activas
3. En el navegador 2 (conectado al admin cPanel o directamente a BD): 
   - Actualiza una asignación (e.g., `estado = FINALIZADO`)
4. En el navegador 1: **deberías verlo actualizar sin recargar** ✨

---

**Status:** ✅ Realtime habilitado  
**Fallback:** ✅ Polling cada 30s  
**Debug:** ✅ Sin logs visual (puedes activar en console)
