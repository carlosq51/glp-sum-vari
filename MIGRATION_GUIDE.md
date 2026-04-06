# Migración Paralela: AppScript → Supabase

## 🎯 Objetivo
Escribe en **ambos** (AppScript + Supabase) automáticamente, pero lee desde **Supabase** (más rápido).

---

## 1️⃣ Configurar Variables de Entorno

En tu `.env` agrega:

```env
# Supabase (migración)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# AppScript (mantener como está)
APS_URL=https://script.google.com/macros/d/.../usercontent
APS_KEY=tu_api_key
```

### ¿Dónde conseguir estas claves?
1. **SUPABASE_URL** → Dashboard → Project Settings → API
2. **SUPABASE_SERVICE_KEY** → Dashboard → Project Settings → API (Service Role)
3. **VITE_SUPABASE_ANON_KEY** → Dashboard → Project Settings → API (Anon)

---

## 2️⃣ Actualizar package.json (si usa Supabase client)

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.38.0"
  }
}
```

---

## 3️⃣ Estructura del Schema en Supabase

Crea estas tablas en Supabase:

### `incidencias`
```sql
CREATE TABLE incidencias (
  id BIGSERIAL PRIMARY KEY,
  vin VARCHAR(17),
  conversion_id VARCHAR(50),
  tipo VARCHAR(20),
  nota TEXT,
  tecnico_user_id VARCHAR(100),
  tecnico_email VARCHAR(255),
  tecnico_nombre VARCHAR(255),
  registrado_por VARCHAR(255),
  foto_b64 TEXT,
  foto_mime VARCHAR(100),
  foto_name VARCHAR(255),
  fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### `eventos`
```sql
CREATE TABLE eventos (
  id BIGSERIAL PRIMARY KEY,
  vin VARCHAR(17),
  conversion_id VARCHAR(50),
  rol VARCHAR(20),
  accion VARCHAR(50),
  nota TEXT,
  registrado_por VARCHAR(255),
  fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### `conformidades`
```sql
CREATE TABLE conformidades (
  id BIGSERIAL PRIMARY KEY,
  vin VARCHAR(17),
  conversion_id VARCHAR(50),
  asignado_a VARCHAR(255),
  estado VARCHAR(20),
  fecha_asignacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 4️⃣ Actualizar Frontend (JavaScript)

### Opción A: Usar `dualWrite()` (recomendado)

En lugar de:
```javascript
const j = await postJSON("/api/incidencia", payload);
```

Usa:
```javascript
import { dualWrite } from "../core/dual-api.js";

const j = await dualWrite("incidencia", payload);
```

### Opción B: Importar directamente en tu código

```javascript
import { supabasePost, supabaseGet, supabaseEnabled } from "../core/supabase-client.js";

// Si Supabase está configurado
if (supabaseEnabled()) {
  await supabasePost("incidencias", { vin, tipo, nota, ... });
}
```

---

## 5️⃣ Actualizar Backend (Node.js)

En `index.js`, agrega los endpoints Supabase:

```javascript
import { supabasePost, supabaseGet, supabaseEnabled } from "./supabase-node.js";

// Endpoint dual-write para incidencias
app.post("/api/incidencia", async (req, res) => {
  try {
    const payload = req.body;
    
    // 1️⃣ Escribe en AppScript
    let appScriptResult;
    try {
      appScriptResult = await callAppsScript("incidencia_add", payload);
    } catch (err) {
      console.warn("[DUAL] AppScript error:", err.message);
      // Continúa incluso si AppScript falla
    }

    // 2️⃣ Escribe en Supabase (paralelo)
    let supabaseResult;
    if (supabaseEnabled()) {
      try {
        const data = {
          vin: payload.vin,
          conversion_id: payload.conversionId,
          tipo: payload.tipo,
          nota: payload.nota,
          tecnico_user_id: payload.tecnicoUserId,
          tecnico_email: payload.tecnicoEmail,
          tecnico_nombre: payload.tecnicoNombre,
          registrado_por: payload.email,
          foto_b64: payload.foto?.b64 || null,
          foto_mime: payload.foto?.mimeType || null,
          foto_name: payload.foto?.name || null,
          fecha_hora: new Date().toISOString(),
        };
        supabaseResult = await supabasePost("incidencias", data);
      } catch (err) {
        console.warn("[DUAL] Supabase error:", err.message);
      }
    }

    // 3️⃣ Retorna resultado (prioriza AppScript si existe)
    const result = appScriptResult || { ok: true, _supabase: supabaseResult };
    res.json(result);
    
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Endpoint para leer desde Supabase (lectura prioritaria)
app.get("/api/incidencias/list", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const limit = Number(req.query.limit || 200);

    // Intenta Supabase primero (más rápido)
    if (supabaseEnabled()) {
      try {
        const data = await supabaseGet("incidencias", { vin });
        return res.json({ ok: true, items: data || [] });
      } catch (err) {
        console.warn("[DUAL_READ] Supabase fallback:", err.message);
      }
    }

    // Fallback a AppScript
    const j = await callAppsScript("incidencias_list", { vin, limit });
    res.json(j);
    
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});
```

---

## 6️⃣ Configurar Permisos en Supabase

En **Supabase Dashboard → Authentication → Policies**:

```sql
-- Permitir lectura pública en incidencias
CREATE POLICY "incidencias_read" ON incidencias
FOR SELECT USING (true);

-- Permitir inserción para usuarios autenticados
CREATE POLICY "incidencias_insert" ON incidencias
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Lo mismo para eventos y conformidades...
```

---

## 7️⃣ Control de Migración

Usa `setMigrationConfig()` para controlar el comportamiento:

```javascript
import { setMigrationConfig } from "../core/dual-api.js";

// Opción 1: Escritura dual (predeterminado)
setMigrationConfig({
  DUAL_WRITE: true,
  IGNORE_APPSCRIPT_ERRORS: false,  // Falla si AppScript falla
  IGNORE_SUPABASE_ERRORS: true,    // Continúa si Supabase falla
});

// Opción 2: Solo AppScript (durante pruebas)
setMigrationConfig({ DUAL_WRITE: false });

// Opción 3: Muy permisivo (tolerante a fallos)
setMigrationConfig({
  DUAL_WRITE: true,
  IGNORE_APPSCRIPT_ERRORS: true,
  IGNORE_SUPABASE_ERRORS: true,
});
```

---

## 8️⃣ Migración Inicial (Opcional)

Si necesitas copiar datos históricos:

```javascript
import { syncFromAppScript } from "../core/dual-api.js";

// En la consola del navegador o en un endpoint:
const result = await syncFromAppScript("incidencias");
console.log(`Migrados ${result.synced} registros`);
```

---

## ✅ Checklist

- [ ] Variables de entorno agregadas (.env)
- [ ] Schema Supabase creado (incidencias, eventos, conformidades)
- [ ] Políticas de acceso configuradas
- [ ] `supabase-client.js` importado en frontend
- [ ] `dual-api.js` implementado
- [ ] Endpoints Node actualizados para dual-write
- [ ] Pruebas en desarrollo (iPhone si es posible)
- [ ] Migración inicial (si aplica)

---

## 🚀 Flujo de Datos Después de la Migración

```
FRONTEND
   ↓
[dualWrite("incidencia", payload)]
   ├→ Node.js /api/incidencia
   │    ├→ AppScript (escribe en SHEETS)
   │    ├→ Supabase (escribe en DB)
   │    └→ Responde (AppScript primario)
   │
[dualRead("incidencias", filter)]
   └→ Node.js /api/incidencias/list
        ├→ Intenta Supabase (rápido) ✅
        └→ Fallback AppScript (si falla)
```

---

## 📞 Troubleshooting

**Q: "Supabase no configurado"**  
A: Verifica que `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` estén en `.env`

**Q: "HTTP 401 Unauthorized"**  
A: Revisa que la `SUPABASE_ANON_KEY` sea válida

**Q: "Escritura dual falla"**  
A: Revisa logs. Si solo falla AppScript, puedes ignorar con `IGNORE_APPSCRIPT_ERRORS: true`

**Q: "Datos no aparecen en Supabase"**  
A: Verifica que el schema esté correcto y que haya permisos de inserción

---

## 🎓 Próximos Pasos

1. **Data Sync en tiempo real**: Usa Supabase Realtime subscriptions
2. **Backup automático**: Cron job que sincroniza AppScript → Supabase noche
3. **Retirement de AppScript**: Una vez que todas transacciones estén en Supabase
