# ❓ FAQ - Migración Paralela AppScript ↔ Supabase

## 🎯 Preguntas Generales

### P: ¿Cuándo está lista la migración para producción?
**R:** Cuando:
1. Escribes en ambos sistemas sin errores (1-2 semanas)
2. Todos los datos de Supabase están sincronizados con AppScript
3. Hiciste pruebas en iPhone (tu caso crítico)
4. Los tiempos de respuesta mejoraron notablemente

### P: ¿Puedo desactivar Supabase si algo falla?
**R:** Sí. En `.env` cambia:
```env
DUAL_WRITE_ENABLED=false
```
Vuelve a leer solo desde AppScript automáticamente.

### P: ¿Se pierden datos si Supabase falla?
**R:** No. Siempre escribe en AppScript (primario). Supabase es redundancia.
```
Incidencia guardada en AppScript? ✅ → Datos seguros
Supabase falló? → Se reintenta en sincro noctura
```

---

## 💾 Preguntas sobre Datos

### P: ¿Cómo migro datos históricos?
**R:** Hay 3 formas:

**Opción 1: CLI Supabase (recomendada)**
```bash
# Exporta desde AppScript como CSV
# Importa en Supabase Dashboard → CSV Import
```

**Opción 2: Script Node propio**
```javascript
import { syncFromAppScript } from "./public/js/core/dual-api.js";
const result = await syncFromAppScript("incidencias");
console.log(`Migrados ${result.synced} registros`);
```

**Opción 3: Manual (si pocos registros)**
- Conecta a Supabase REST API directamente
- POST cada registro

### P: ¿Qué pasa si hay data incompatible?
**R:** Verifica el `MIGRATION_GUIDE.md` en la sección "Mapeo de Campos".

Ejemplo si AppScript usa `TECNICO` pero Supabase espera `tecnico_nombre`:
```javascript
// En DUAL_WRITE_EXAMPLE.js, línea ~60
// Ajusta el mapeo según tus esquemas
```

### P: ¿Si elimino un registro en AppScript, se elimina en Supabase?
**R:** **No automáticamente** en la v1. Maneja así:
```javascript
// Agregar a backend cuando hagas DELETE en AppScript:
app.delete("/api/incidencia/:id", async (req, res) => {
  const id = req.params.id;
  
  // Elimina en AppScript
  await callAppsScript("delete_incidencia", { id });
  
  // Elimina en Supabase
  if (supabaseEnabled()) {
    await supabaseDelete("incidencias", { id });
  }
  
  res.json({ ok: true });
});
```

---

## ⚡ Preguntas de Performance

### P: ¿Cuánto más rápida es Supabase?
**R:** Típicamente:
- AppScript: 2-5 segundos
- Supabase: 200-500ms (10x más rápido)

En tu caso (iPhone): diferencia crítica

### P: ¿Supabase tiene límite de requests?
**R:** Sí, según tu plan:
- **Free**: 50,000 req/mes
- **Pro**: Illimitado (básicamente)

Tu app con 50 usuarios = ~100k req/mes. Necesitas plan **Pro**.

### P: ¿Qué pasa si llego al límite de Supabase?
**R:** Fallback automático a AppScript (more lento pero funciona).

Lo ideal: vigila con alertas:
```javascript
// En index.js, registra solicitudes fallidas
if (!supabaseEnabled() || supabaseError) {
  console.warn("⚠️ ALERTA: Supabase fuera de servicio");
  // Envía email/slack a admin
}
```

---

## 🔐 Preguntas de Seguridad

### P: ¿Las claves de Supabase en .env son seguras?
**R:** 
- ✅ `SUPABASE_SERVICE_KEY` → Solo servidor (seguro si en `.gitignore`)
- ✅ `VITE_SUPABASE_ANON_KEY` → OK exponer en frontend (permisos limitados)

**Importante:** Asegúrate que `.env` esté en `.gitignore`:
```bash
git check-ignore .env  # Debe retornar ".env"
```

### P: ¿Puede cualquiera escribir en mis tablas?
**R:** No. Configura RLS (Row Level Security):
```sql
-- Sin esto, CUALQUIERA puede escribir
CREATE POLICY "incidencias_insert_auth_only" ON incidencias
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);
```

** ⚠️ Crítico:** EL SQL en `IMPLEMENTACION_PASO_A_PASO.md` ya lo incluye.

### P: ¿Y si quiero que solo CALIDAD escriba incidencias?
**R:** Ajusta RLS:
```sql
CREATE POLICY "incidencias_insert_calidad_only" ON incidencias
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL AND 
  auth.jwt() ->> 'rol' = 'CALIDAD'
);
```

---

## 🔗 Preguntas de Integración

### P: ¿Tengo que cambiar TODOS los endpoints?
**R:** No. Hazlo gradualmente:
```javascript
// FASE 1: Solo incidencias (crítica)
✅ POST /api/incidencia → dual-write
✅ GET /api/incidencias/list → Supabase primero

// FASE 2: Eventos
✅ POST /api/evento → dual-write

// FASE 3: Conformidad
✅ POST /api/conformidad → dual-write

// Las demás operaciones mantienen AppScript
```

### P: ¿Qué pasa con los QR codes y uploads?
**R:** Los uploads (fotos) quedan en Drive como hoy. Solo el metadata va a Supabase:
```javascript
foto_b64: payload.foto?.b64 || null,  // Data URI (opcional)
foto_file_id: payload.fotoFileId,    // ID de Drive
```

### P: ¿Funciona offline?
**R:** Supabase = NO offline (requiere internet).
Si necesitas offline:
1. Usa AppScript (local first en navegador)
2. O agrega un service worker con cache

---

## 🧪 Preguntas de Testing

### P: ¿Cómo pruebo iPhone?
**R:** Ideal es un iPhone real, pero puedes simular:

**iOS Safari en Mac:**
```bash
Safari > Settings > Advanced > Enable Web Inspector
Mac → iPhone conectado > Web Inspector
```

**Android Chrome DevTools:**
```bash
$ adb devices
$ chrome://inspect
```

**Emulador + localhost:**
```javascript
// Si el servidor está en 192.168.1.100:3000
// iPhone en misma red → http://192.168.1.100:3000
```

### P: ¿Cómo debuggeo si falla en iPhone?
**R:** 
1. Abre DevTools → Console
2. Busca líneas `[INCIDENCIA DUAL]` o `[INC_LIST]`
3. Mira status: "AppScript OK" vs "Supabase OK"

Ejemplo de log bueno:
```
[INCIDENCIA DUAL] Escribiendo en: AppScript + Supabase
[INCIDENCIA DUAL] ✅ AppScript OK
[INCIDENCIA DUAL] ✅ Supabase OK
```

### P: ¿Puedo testear sin .env completo?
**R:** Sí:
```javascript
// En el navegador:
const hasSuperbase = supabaseEnabled();
console.log(hasSuperbase ? "✅ Supabase ready" : "❌ Supabase off");
```

---

## 🚀 Preguntas de Rollout

### P: ¿Cómo lo depliego sin romper producción?
**R:** Estrategia recomendada:

**Semana 1: Escritura dual (apagada)**
```env
DUAL_WRITE_ENABLED=false
```
Asegúrate que todo compila sin errores.

**Semana 2: Escritura dual en staging**
Deploy a un servidor de test, activa dual-write.
Pide a equipo que pruebe.

**Semana 3: Escritura dual en prod (tolerante)**
```env
DUAL_WRITE_ENABLED=true
IGNORE_SUPABASE_ERRORS=true  # Si Supabase falla, continúa
```

**Semana 4: Lectura desde Supabase**
Ya todos escriben en ambos. Ahora lee desde el más rápido.

### P: ¿Qué pasa si durante rollout alguien usa la app?
**R:** Los usuarios NO ven impacto:
- Escriben en AppScript (como siempre)
- Supabase se sincroniza en background
- Si falla Supabase, no interrumpe

Zero downtime ✅

---

## 📈 Preguntas Futuro

### P: ¿Cuándo puedo eliminar AppScript?
**R:** Cuando:
1. 99% de datos están en Supabase
2. Pasaron 2+ meses sin issues
3. Apps Script solo se usa para backup
4. Todo el mundo está en Supabase

Típicamente: 2-3 meses.

### P: ¿Qué hago con AppScript después?
**R:** Opciones:
1. **Mantener como backup**: Continúa actualizándose en background
2. **Convertir a ETL**: Solo sincroniza datos nocturnos
3. **Archivar**: Copia datos históricos, desactiva scripts

### P: ¿Puedo usar realtime de Supabase?
**R:** Sí! Para que los clientes vean cambios en vivo:
```javascript
import { supabase } from "../core/supabase-client.js";

supabase
  .channel("incidencias")
  .on("postgres_changes", 
    { event: "*", schema: "public", table: "incidencias" },
    (payload) => {
      console.log("Nueva incidencia en vivo:", payload);
      // Actualiza UI automáticamente
    }
  )
  .subscribe();
```

---

## 📞 No Encontré Mi Respuesta

Si tu pregunta no está aquí:

1. **Revisa los archivos:**
   - `MIGRATION_GUIDE.md` (conceptual)
   - `IMPLEMENTACION_PASO_A_PASO.md` (práctica)
   - `DUAL_WRITE_EXAMPLE.js` (código)

2. **Busca en logs:**
   ```bash
   grep -r "\[INC_LIST\]\|\[INCIDENCIA DUAL\]" ~/.npm/logs/
   ```

3. **Test rápido en DevTools:**
   ```javascript
   const status = await fetch("/api/migration-status").then(r => r.json());
   console.log(status);
   ```

---

**¡Buena suerte con tu migración! 🚀**
