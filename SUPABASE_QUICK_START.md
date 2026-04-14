# 🎯 QUICK START: Migración a Supabase Only (30 min)

## Lo que vas a lograr
- ✅ App 10-50x más rápida
- ✅ Menos código en backend
- ✅ Backup automático cada 10 minutos
- ✅ Sin dual-write, sin complejidad

---

## 🚀 PASO 1: Actualizaciones rápidas (5 min)

### 1.1 Abre `index.js`

**Busca estos 5 endpoints y REEMPLAZA con los de `ENDPOINTS_OPTIMIZADOS.js`:**

❌ Elimina:
```javascript
// ✍️ DUAL-WRITE: Apps Script + Supabase en paralelo
app.post("/api/evento", ...)
app.post("/api/equipo-conformidad", ...)
app.post("/api/incidencia", ...)
```

✅ Pega DESDE `ENDPOINTS_OPTIMIZADOS.js`:
```javascript
// ✅ SUPABASE ONLY
app.post("/api/evento", async (req, res) => {
  // ... código simplificado
});
```

**Endpoints a reemplazar:**
1. `POST /api/evento`
2. `POST /api/equipo-conformidad`
3. `POST /api/incidencia`
4. `GET /api/incidencias/list`
5. `GET /api/estado`

---

## 📅 PASO 2: Instalar AppScript Trigger (10 min)

### 2.1 Abre tu Google Sheet

1. **Extensiones → Apps Script**
2. **Archivo nuevo → Script**
3. **Nombra:** `supabase-trigger`

### 2.2 Copia el código

- Abre [gas/supabase-trigger.js](gas/supabase-trigger.js) en este repo
- **Copia TODO el código**
- **Pega** en Apps Script

### 2.3 Configura Script Properties

1. **⚙️ Configuración** (esquina superior derecha)
2. **Script Properties**
3. Agrega estas 2 claves:

```
SUPABASE_URL = https://xxxxx.supabase.co
SUPABASE_KEY = eyJhbGc... (tu anon key)
```

**¿Dónde obtenerlas?**
→ [Supabase Dashboard](https://app.supabase.com) → Settings → API → Copiar URL y anon key

### 2.4 Crear el Trigger

1. **⏰ Triggers** (icono de reloj a la izquierda)
2. **+ Crear activador**
3. Configura:
   - Función: `syncFromSupabase`
   - Evento: `Basado en tiempo`
   - Tipo: `Cada 10 minutos`
4. **Crear**
5. Autoriza cuando pida permisos

### 2.5 Test

En Apps Script, ejecuta: `testSync()`
- Revisa los logs
- Si ves "✅ Sincronización completada" → Funciona 🎉

---

## 🧪 PASO 3: Probar en desarrollo (5 min)

```bash
# Terminal 1: Backend
npm start

# Terminal 2: Test POST
curl -X POST http://localhost:3000/api/evento \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "vin": "TEST123",
    "conversionId": "CO001",
    "accion": "INICIO",
    "rolTrabajo": "TECNICO"
  }'

# Esperado: { "ok": true, "event_id": "...", ... }
```

```bash
# Test GET
curl "http://localhost:3000/api/incidencias/list?vin=TEST123"

# Esperado: { "ok": true, "items": [...], "_timing": "25ms" }
```

---

## ✅ PASO 4: Verificar que funciona (5 min)

### 4.1 Revisa tiempos en DevTools

1. **F12 → Network**
2. Haz click en la app
3. Revisa el tiempo de respuesta
   - **Antes:** 2-5 segundos ❌
   - **Después:** <100ms ✅

### 4.2 Revisa que Google Sheet se actualiza

1. Abre tu Sheet
2. Haz una acción en la app (registra incidencia, evento, etc)
3. Espera 10 minutos
4. Revisa que aparece en la hoja correspondiente

---

## 📊 Resumen de cambios

| Aspecto | Antes | Después |
|---------|-------|---------|
| **Lectura/Escritura** | AppScript + Supabase | SOLO Supabase ✅ |
| **Latencia** | 2-5 segundos | <100ms ✅ |
| **Backup** | Manual | Automático cada 10 min ✅ |
| **Código backend** | Complejo (dual-write) | Simple ✅ |
| **Google Sheets** | Fallback | Backup histórico ✅ |

---

## 🎓 Documentación Completa

Para entender a fondo qué estás haciendo:

- 📖 [ARQUITECTURA_NUEVA.md](ARQUITECTURA_NUEVA.md) — Diagramas y flujos
- 🔧 [ENDPOINTS_OPTIMIZADOS.js](ENDPOINTS_OPTIMIZADOS.js) — Código de endpoints
- 📋 [MIGRACION_SUPABASE_ONLY.md](MIGRACION_SUPABASE_ONLY.md) — Guía detallada
- 📅 [gas/SUPABASE_TRIGGER_SETUP.md](gas/SUPABASE_TRIGGER_SETUP.md) — Trigger AppScript

---

## 🚨 Si algo falla

### "POST /api/evento devuelve error 500"
→ Revisa que estes usando `supabasePost_()` (debe estar en index.js)

### "AppScript no sincroniza"
→ Revisa:
1. Script Properties están configuradas
2. Trigger está creado en ⏰ Triggers
3. Ejecuta `verifyConfig()` en AppScript console

### "Latencia sigue siendo lenta"
→ Revisa que QUITASTE los DUAL-WRITE (ya no debería haber callAppsScript en la ruta principal)

---

## ✨ ¡Listo!

Una vez completado todo:

```
✅ FRONTEND   → Escribe/lee SOLO en Supabase (<100ms)
✅ BACKEND    → Código limpio, sin dual-write
✅ SHEETS     → Actualizada automáticamente cada 10 min
✅ DRIVE      → Fotos guardadas cuando aplique
✅ PERFORMANCE → 10x más rápida 🚀
```

**Tiempo total: ~30 minutos**

---

**¿Dudas?** Revisa los archivos de referencia arriba ☝️
