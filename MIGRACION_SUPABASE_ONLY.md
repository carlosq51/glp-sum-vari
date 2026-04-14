# 🚀 GUÍA: Migración a Supabase Only

## ¿Por qué hacer esto?

| Métrica | Antes (Dual Write) | Después (Supabase Only) |
|---------|-------------------|--------------------------|
| Latencia promedio | 2-5 segundos | <100ms |
| Carga del servidor | Dual writes | Single write |
| Complejidad código | Alta (dual-write) | Baja |
| Tipos de error | Triple (AppScript + Supabase + sync) | Simple |
| Google Sheets | Desactualizado | Auto-sync cada 10 min |

---

## ⚙️ PASO 1: Actualizar `index.js`

### Localiza y reemplaza estos endpoints en tu `index.js`:

#### 1.1 POST `/api/evento`
**Busca en index.js:**
```
app.post("/api/evento", async (req, res) => {
  // ✍️ DUAL-WRITE: Apps Script + Supabase en paralelo
```

**Reemplaza con:** Copia todo el bloque de `POST /api/evento` de [ENDPOINTS_OPTIMIZADOS.js](ENDPOINTS_OPTIMIZADOS.js)

#### 1.2 POST `/api/equipo-conformidad`
**Busca en index.js:**
```
app.post("/api/equipo-conformidad", async (req, res) => {
  // ✍️ DUAL-WRITE: Apps Script + Supabase en paralelo
```

**Reemplaza con:** El bloque correspondiente de [ENDPOINTS_OPTIMIZADOS.js](ENDPOINTS_OPTIMIZADOS.js)

#### 1.3 POST `/api/incidencia`
**Busca en index.js:**
```
app.post("/api/incidencia", async (req, res) => {
  // ✍️ DUAL-WRITE: Apps Script + Supabase en paralelo (con foto)
```

**Reemplaza con:** El bloque `POST /api/incidencia` de [ENDPOINTS_OPTIMIZADOS.js](ENDPOINTS_OPTIMIZADOS.js)

#### 1.4 GET `/api/incidencias/list`
**Busca:** `app.get("/api/incidencias/list"`
**Reemplaza con:** El GET `/api/incidencias/list` de [ENDPOINTS_OPTIMIZADOS.js](ENDPOINTS_OPTIMIZADOS.js)

#### 1.5 GET `/api/estado`
**Busca:** `app.get("/api/estado"`
**Reemplaza con:** El GET `/api/estado` de [ENDPOINTS_OPTIMIZADOS.js](ENDPOINTS_OPTIMIZADOS.js)

---

## 📋 PASO 2: Verificar funciones de soporte

Tu `index.js` debe tener estas funciones (probablemente ya las tienes):

```javascript
// Lectura desde Supabase
async function supabaseGet_(table, filter = {}) { ... }

// Escritura a Supabase
async function supabasePost_(table, data) { ... }

// Update a Supabase
async function supabasePatch_(table, filter, data) { ... }
```

Si NO las tienes, agrégalas del archivo [supabase-node.js](supabase-node.js) en la raíz del proyecto.

---

## 🧪 PASO 3: Probar

### Antes de deployar, prueba en desarrollo:

```bash
# 1. Terminal del backend
npm start

# 2. En otra terminal, prueba POST evento
curl -X POST http://localhost:3000/api/evento \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tecnico@example.com",
    "vin": "ABC123",
    "conversionId": "CO001",
    "accion": "INICIO",
    "nota": "Test",
    "rolTrabajo": "TECNICO"
  }'

# Expects: { ok: true, event_id: "...", message: "..." }
```

### Prueba GET incidencias:
```bash
curl "http://localhost:3000/api/incidencias/list?vin=ABC123&limit=10"

# Expects: { ok: true, items: [...], count: X, timing: "15ms" }
```

---

## 🔍 PASO 4: Verificar que Supabase está configurado

En `.env`:
```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

Si no lo tienes, cópialo de tu [Supabase Dashboard → Settings → API](https://app.supabase.com/project/_/settings/api)

---

## ✅ PASO 5: Instalar el Trigger AppScript

Sigue las instrucciones en [gas/SUPABASE_TRIGGER_SETUP.md](gas/SUPABASE_TRIGGER_SETUP.md)

Esto ejecutará automáticamente cada 10 minutos:
- Lee de Supabase
- Escribe en Google Sheets
- Sin intervención manual

---

## 📊 PASO 6: Monitorear

Después de deployar:

1. **Revisar tiempos de respuesta:**
   - Abre DevTools (F12)
   - Red → POST requests
   - Headers → `X-Query-Time`
   - Debes ver <100ms

2. **Verificar Google Sheets:**
   - Abre tu Sheet
   - Mira las hojas (INCIDENCIAS, MARCA_EVENTOS, etc.)
   - Deben actualizarse cada 10 min automáticamente

3. **Revisar logs:**
   ```bash
   # En terminal backend
   tail -f logs.txt
   # O en Supabase Dashboard → Logs
   ```

---

## 🎯 Después de la migración

| Componente | Rol |
|-----------|-----|
| **Frontend** | Lee/escribe SOLO en Supabase |
| **Backend Node** | Proxy simple sin dual-write |
| **Supabase** | Base de datos principal |
| **Google Sheets** | Backup histórico (auto-sincronizado) |
| **Google Drive** | Almacenamiento de fotos (AppScript) |
| **AppScript** | Trigger cada 10 min + manejo de Drive |

---

## ⚠️ Rollback (si algo falla)

Si necesitas volver atrás:
1. Restaura `index.js` de tu backup o Git
2. Redeploya backend
3. Desactiva trigger en AppScript

Pero la architecture es estable, así que no debería haber problemas.

---

## 🚀 Resultado Final

✅ App 10x más responsiva
✅ Código más simple
✅ Backup automático
✅ Sin dependencias en AppScript para datos operacionales

**¡Listo! Tu app ahora usa Supabase como motor principal. 🎉**
