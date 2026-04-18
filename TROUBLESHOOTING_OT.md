# 🐛 TROUBLESHOOTING: Creación de OT no funciona

## Síntomas Comunes & Soluciones

---

### ❌ **Síntoma 1: "VIN no existe"**

```
Error: VIN no existe
```

**Causa**: Tabla `vins` no tiene el VIN ingresado

**Solución**:
- ✅ YA REPARADO: Backend ahora crea VIN automáticamente si no existe
- Si sigue fallando:
  1. Revisa logs del servidor: `console.log("[EVENTO] VIN creado...")`
  2. Verifica que tabla `vins` sea accesible (permisos Supabase)
  3. Intenta crear OT nuevamente

---

### ❌ **Síntoma 2: OT se crea pero estado es "SIN_INICIAR" (no TRABAJANDO)**

```
Estado mostrado: SIN_INICIAR
Esperado: TRABAJANDO
```

**Causa**: INICIO action no está ejecutando correctamente

**Solución**:
1. Abre DevTools Console (`F12` → Console)
2. Ejecuta:
   ```javascript
   console.log(CORE.state.ctx().itemsByKey);
   ```
3. Busca tu OT y revisa el campo `estado`
4. Si es SIN_INICIAR:
   - Presiona botón "Crear/Buscar" nuevamente  
   - Verifica que el cambio suceda
5. Si no cambia:
   - Revisa servidor logs (busca "[POST /api/evento]")
   - Verifica que `accion === "INICIO"` llegue al backend

**Debug en backend** (index.js línea ~589):
```javascript
console.log(`[EVENTO] accion=${accion}, nuevoEstado=${nuevoEstado}`);
```

---

### ❌ **Síntoma 3: OT duplicada (aparece DOS veces con diferentes VINs)**

```
VIN: LVTDB11B2VH501089 (MOTOR)    ← tiene VIN
VIN: (sin vin) (MOTOR)             ← sin VIN (DUPLICADO)
```

**Causa**: Ya fue reparado en FIX_DUPLICACION_OT.md

**Verificación**:
```javascript
// En Console:
const ctx = CORE.state.ctx();
[...ctx.itemsByKey.keys()].forEach(k => console.log(k));

// Verificar: cada key debe ser única
// Si ves dos keys iguales → hay duplicados
```

**Solución**:
1. Abre DevTools Console
2. Ejecuta:
   ```javascript
   // Limpiar duplicados (esto fuerza re-fetch desde servidor)
   CORE.state.ctx().itemsByKey.clear();
   CORE.state.ctx().activeKeys = [];
   CORE.state.ctx().finalKeys = [];
   ```
3. Presiona F5 (recargar página)
4. Sincroniza nuevamente

---

### ❌ **Síntoma 4: "Esta OT ya está asignada a otro usuario"**

```
Error: Esta OT ya está asignada a Juan en rol MOTOR
Asignado a: juan@example.com
```

**Comportamiento**: CORRECTO

**Solución**:
- ✅ La OT está siendo usada por otro usuario
- Opciones:
  1. **Esperar**: Que el otro usuario termine y la finalice
  2. **Coordinar**: Avisar al otro usuario para que la libere
  3. **Admin**: Cancelar asignación del otro usuario (si es necesario)

**Si el error es "estancado"** (usuario desconectado pero OT sigue asignada):
- Contactar admin para liberar la asignación
- O cambiar `activo=false` en tabla asignaciones para ese registro

---

### ❌ **Síntoma 5: Error silencioso (nada pasa cuando presiono Crear)**

```
UI: Sin cambios
Console: (vacía)
```

**Causa**: UI está en "locked" state (esperando respuesta anterior)

**Solución**:
1. Espera 10 segundos
2. Si sigue sin responder, abre Console (`F12`)
3. Ejecuta:
   ```javascript
   console.log("UI Locked?", CORE.state.uiLocked);
   // Si es true:
   CORE.state.uiLocked = false;
   // Intenta nuevamente
   ```

**Si sigue fallando**:
- Revisa conexión a red
- Recarga página (`F5`)
- Verifica que backend esté en línea: `fetch('/api/me?email=test@example.com')`

---

### ❌ **Síntoma 6: QR scan funciona pero OT no se crea**

```
QR escaneado: LVTDB11B2VH501089
Pero: OT no aparece
```

**Causa**: Scan completa pero autoStartFromScan_ falla

**Solución**:
1. Abre Console
2. Busca mensajes:
   ```
   [AUTO_START] OT iniciada: ...
   [AUTO_START] Error: ...
   ```
3. Si dice "Error":
   - Lee el error (puede ser VIN no existe, OT asignada a otro, etc.)
   - Aplica solución según el error
4. Si no hay mensajes:
   - Verifica que `CORE.state.currentModule === "TECNICO"` o "CALIDAD"
   - Verifica que VIN sea válido (no vacío)

---

### ❌ **Síntoma 7: Performance lenta (demora mucho crear OT)**

```
Hago click → espero 5+ segundos → nada
```

**Causa**: Anti-loop delay o sync muy lento

**Solución**:
1. **Anti-loop delay**:
   - ✅ Reducido a 2s (antes era 5s)
   - Si sigue lento, verifica que última OT con VIN no fue hace <2s

2. **Sync lento**:
   - Revisa Network tab en DevTools
   - Ve a `/api/mis-activas` → verifica tiempo
   - Si >2s, el backend está lento (revisar BD queries)

3. **Temporal**: Aumentar anti-loop a ~3s en `conversion-eventos.js`:
   ```javascript
   if (lastAutoStart_.k === k && now - lastAutoStart_.t < 3000) {
     // era 2000, cambiar a 3000 si red es lenta
   ```

---

### ❌ **Síntoma 8: Error "Usuario no encontrado"**

```
Error: Usuario no encontrado
```

**Causa**: Email del usuario no existe en tabla `usuarios`

**Solución**:
1. Verifica que estés logged in correctamente
2. Revisa que email en CORE.state.usuarioEmail sea correcto:
   ```javascript
   console.log("Email actual:", CORE.state.usuarioEmail);
   ```
3. Si email es diferente:
   - Logout y login nuevamente
   - Asegúrate que usuario esté en tabla `usuarios`

**Admin task**: Ir a Supabase → tabla `usuarios` → crear entrada para email

---

### ❌ **Síntoma 9: Estado TRABAJANDO pero no se guarda en DB**

```
UI muestra: TRABAJANDO
Pero en DB: SIN_INICIAR
```

**Causa**: Respuesta del servidor no tiene `estado`, o sync sobrescribe

**Solución**:
1. Revisa respuesta de `/api/evento`:
   ```javascript
   // En Network tab: ver POST /api/evento response
   // Debe tener: "estado_actual": "TRABAJANDO"
   ```
2. Si no está:
   - Problema en backend, revisar index.js línea ~593
   - Asegurar que retorna `nuevoEstado` en campo `estado`

3. Fórza refresco:
   ```javascript
   await syncNow({forceFull: true, showOut: true});
   ```

---

### ❌ **Síntoma 10: Cambios en código JavaScript pero no se aplican**

```
Modifiqué conversion-eventos.js pero nada cambió
```

**Causa**: Cache del navegador

**Solución**:
1. Ctrl+F5 (recargar sin cache)
2. O abre DevTools → Settings → desmarcar "Disable cache"
3. O en servidor, si es Vite: `npm run dev` y verifica que recompile

---

## 🔍 Debugging Avanzado

### Habilitar logs detallados

En `conversion-eventos.js`, descomentar todos los `console.log`:

```javascript
// Buscar todos los comentarios de console y activarlos
// Ejemplo:
console.log(`[AUTO_START] Ignorando: ${k} (demasiado reciente)`);
console.error("[AUTO_START] Error:", error, result);
console.log(`[AUTO_START] ✅ OT iniciada: ${v} | ${rol} | Estado: ${result.estado}`);
```

### Verificar estado backend

```bash
# En terminal donde corre Node:
tail -f logs.txt

# Si usas console.log (no hay archivo):
# Simplemente ver console del servidor
```

### Captura de tráfico

En Network tab (DevTools F12):
1. Tab: Network
2. Haz clic en Crear OT
3. Busca: `POST /api/evento`
4. Click en la request
5. Ver:
   - **Headers**: Verifica `email`, `vin`, `rolTrabajo`, `accion`
   - **Response**: Verifica que tenga `"ok": true` y `"estado": "TRABAJANDO"`

---

## 🔧 Tests Rápidos

### Test 1: ¿Está el backend vivo?

```bash
curl http://localhost:3000/api/me?email=test@example.com
```

Debería retornar usuario o 404 (pero NOT 503 o timeout)

### Test 2: ¿VIN se crea automáticamente?

```javascript
// POST a /api/evento con VIN que NO existe
// Si retorna ok=true, VIN fue creado ✅
```

### Test 3: ¿Estado es TRABAJANDO?

```javascript
// Ver response de /api/evento
// Buscar "estado_actual": "TRABAJANDO"
```

---

## 📞 Contacto si Sigue Fallando

Si después de todos estos pasos no funciona:

1. **Toma screenshot de**:
   - Error en UI
   - Console (F12 → Console)
   - Network → POST /api/evento (request + response)

2. **Reporta con**:
   - VIN usado
   - Rol (MOTOR/TANQUE/CALIDAD)
   - Email del usuario
   - Paso exacto donde falla
   - Logs del servidor (últimas 10 líneas)

---

## ✅ Verificación Final

Si TODO está funcionando:

```javascript
// En Console:
TEST: VIN creado ✅
TEST: Estado TRABAJANDO ✅
TEST: Sin duplicados ✅
TEST: Todos tienen VIN ✅
TEST: Errores claros en UI ✅
```

**No debería haber OTs con estado "SIN_INICIAR" DESPUÉS de hacer INICIO**

