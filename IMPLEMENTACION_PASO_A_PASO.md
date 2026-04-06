# 🚀 Implementación Paso a Paso: Migración Paralela

## ¿Qué conseguirás?

```
ANTES (solo AppScript):
┌─────────────┐
│  Frontend   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Node.js             │
│ (/api/incidencia)   │
└──────┬──────────────┘
       │
       ▼
    AppScript
    (lento)


DESPUÉS (AppScript + Supabase):
┌─────────────┐
│  Frontend   │
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│ Node.js              │
│ (/api/incidencia)    │
└──────┬─────┬─────────┘
       │     │
       ▼     ▼
   AppScript Supabase  ← Escribe en ambos
    (escribe) (escribe)

       Supabase  ← Lee desde aquí (RÁPIDO!)
       (lectura)
```

---

## FASE 1: Preparación (5 minutos)

### 1.1 - Obtén las claves de Supabase

1. Abre [supabase.com](https://supabase.com) y entra a tu proyecto
2. Ve a **Settings → API**
3. Copia:
   - Project URL → `SUPABASE_URL`
   - `anon` public key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY`

### 1.2 - Actualiza .env

```bash
# En tu terminal, en la carpeta del proyecto
cat .env.example >> .env
```

Luego edita `.env` y reemplaza:

```env
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## FASE 2: Schema en Supabase (10 minutos)

### 2.1 - Abre el editor SQL de Supabase

1. Dashboard → **SQL Editor**
2. Click en **"New query"**

### 2.2 - Crea las tablas

Copia y pega esto en el editor SQL:

```sql
-- ═══════════════════════════════════════════════════════════════
-- TABLA: incidencias
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.incidencias (
  id BIGSERIAL PRIMARY KEY,
  vin VARCHAR(17) NOT NULL,
  conversion_id VARCHAR(50),
  tipo VARCHAR(20),
  nota TEXT,
  tecnico_user_id VARCHAR(100),
  tecnico_email VARCHAR(255),
  tecnico_nombre VARCHAR(255),
  registrado_por VARCHAR(255) NOT NULL,
  foto_b64 TEXT,
  foto_mime VARCHAR(100),
  foto_name VARCHAR(255),
  fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX idx_vin (vin),
  INDEX idx_conversion_id (conversion_id)
);

-- ═══════════════════════════════════════════════════════════════
-- TABLA: eventos
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.eventos (
  id BIGSERIAL PRIMARY KEY,
  vin VARCHAR(17) NOT NULL,
  conversion_id VARCHAR(50),
  rol VARCHAR(20),
  accion VARCHAR(50),
  nota TEXT,
  registrado_por VARCHAR(255) NOT NULL,
  fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX idx_vin (vin),
  INDEX idx_conversion_id (conversion_id)
);

-- ═══════════════════════════════════════════════════════════════
-- TABLA: conformidades
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.conformidades (
  id BIGSERIAL PRIMARY KEY,
  vin VARCHAR(17) NOT NULL,
  conversion_id VARCHAR(50),
  asignado_a VARCHAR(255),
  estado VARCHAR(20) DEFAULT 'PENDIENTE',
  fecha_asignacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX idx_vin (vin),
  INDEX idx_conversion_id (conversion_id)
);

-- ═══════════════════════════════════════════════════════════════
-- POLÍTICAS DE SEGURIDAD (RLS - Row Level Security)
-- ═══════════════════════════════════════════════════════════════

-- Habilita RLS
ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conformidades ENABLE ROW LEVEL SECURITY;

-- Lectura pública (anon puede leer)
CREATE POLICY "incidencias_read" ON public.incidencias
FOR SELECT USING (true);

CREATE POLICY "eventos_read" ON public.eventos
FOR SELECT USING (true);

CREATE POLICY "conformidades_read" ON public.conformidades
FOR SELECT USING (true);

-- Inserción para usuarios autenticados
CREATE POLICY "incidencias_insert" ON public.incidencias
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "eventos_insert" ON public.eventos
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "conformidades_insert" ON public.conformidades
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
```

Click en **Run** ✅

---

## FASE 3: Código Frontend (5 minutos)

### 3.1 - Actualiza incidencias.js

En **`public/js/views/conversion/modals/incidencias.js`**:

Reemplaza la línea de save:

```javascript
// ANTES:
j = await postJSON("/api/incidencia", payload);

// DESPUÉS:
import { dualWrite } from "../../../core/dual-api.js";
...
j = await dualWrite("incidencia", payload);
```

### 3.2 - Actualiza lecturas de incidencias

En **`public/js/views/supervisor/sup-incidencias.js`**:

```javascript
// ANTES:
const r = await getJSON_user(url, "Cargando incidencias...");

// DESPUÉS:
import { dualRead } from "../../../core/dual-api.js";
...
const r = await dualRead("incidencias", { vin }, { getJSON_user });
```

---

## FASE 4: Código Backend (10 minutos)

### 4.1 - Actualiza index.js

Copia el contenido de **`DUAL_WRITE_EXAMPLE.js`** y reemplaza los endpoints en tu `index.js`:

```bash
# Abre los 2 archivos lado a lado:
# - DUAL_WRITE_EXAMPLE.js (referencia)
# - index.js (editar)
```

**Lo mínimo necesario:**

```javascript
// Arriba en index.js, agrega:
import { supabasePost, supabaseGet, supabaseEnabled } from "./supabase-node.js";

// Reemplaza el endpoint POST /api/incidencia con el de DUAL_WRITE_EXAMPLE.js
// Reemplaza el endpoint GET /api/incidencias/list con el de DUAL_WRITE_EXAMPLE.js
```

---

## FASE 5: Testing (10 minutos)

### 5.1 - Verifica configuración

En la terminal:

```bash
# Reinicia el servidor
npm run dev

# En otra terminal, prueba el endpoint:
curl http://localhost:3000/api/migration-status
```

Deberías ver:
```json
{
  "ok": true,
  "dual_write_enabled": true,
  "supabase_configured": true,
  "appscript_configured": true
}
```

### 5.2 - Prueba guardar una incidencia

1. Abre la app en tu navegador
2. Ve a Calidad → registra una incidencia
3. Revisa en **Supabase Dashboard → Editor SQL**:

```sql
SELECT * FROM incidencias ORDER BY created_at DESC LIMIT 1;
```

Deberías ver tu incidencia registrada ✅

### 5.3 - Verifica escritura dual

En el navegador, abre **DevTools → Console**:

```javascript
// Llama directamente (opcional, para debug):
const result = await fetch("/api/migration-status").then(r => r.json());
console.log(result);
```

---

## FASE 6: Monitoreo (Continuo)

### 6.1 - Revisa logs

```bash
# Terminal donde corre Node:
# Deberías ver líneas como:
# [INC_LIST] 📖 Leyendo de Supabase...
# [INC_LIST] ✅ Supabase: 5 registros
# [INCIDENCIA DUAL] ✅ Supabase OK, id: 42
```

### 6.2 - Dashboard de migración (Bonus)

Crea este acceso para monitorear:

```javascript
// En tu navegador devtools:
const status = await fetch("/api/migration-status").then(r => r.json());
const incidencias = await fetch("/api/incidencias/list?vin=ABC123&limit=10").then(r => r.json());
console.table({
  status,
  incidencias: incidencias.source, // "supabase" o "appscript"
  count: incidencias.count,
});
```

---

## Troubleshooting Rápido

| Problema | Causa | Solución |
|----------|-------|----------|
| "Supabase no configurado" | `.env` incompleto | Verifica `SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` |
| "HTTP 401 Unauthorized" | Claves inválidas | Copia nuevamente desde Supabase Dashboard |
| "No hay tabla 'incidencias'" | SQL no ejecutado | Ejecuta el SQL en Supabase SQL Editor |
| "Escritura solo en AppScript" | `DUAL_WRITE=false` | Revisa `.env` |
| "Errores en consola pero funciona" | Fallback a AppScript | Normal. Revisa logs para detalles |

---

## Checklist Final

- [ ] Variables de `.env` completadas
- [ ] SQL de tablas ejecutado en Supabase
- [ ] `supabase-client.js` existe
- [ ] `dual-api.js` existe
- [ ] `supabase-node.js` existe
- [ ] Frontend actualizado (dualWrite + dualRead)
- [ ] Backend actualizado (index.js)
- [ ] Server reiniciado (`npm run dev`)
- [ ] Test de incidencia exitoso
- [ ] Verificado en Supabase Dashboard

---

## ✅ ¿Listo?

Una vez completado:
- ✅ Writes en **AppScript + Supabase** (paralelo)
- ✅ Reads desde **Supabase** (mucho más rápido)
- ✅ Fallback a AppScript si Supabase falla
- ✅ Sin cambios en UX - todo funciona transparente

---

## 📞 Soporte

Si algo falla:

1. **Revisa los logs del servidor** (línea donde dice `[INCIDENCIA DUAL]`)
2. **Verifica .env** (copiar/pegar bien las claves)
3. **Testea manualmente**: `curl http://localhost:3000/api/migration-status`
4. **Abre DevTools** en el navegador → Console para ver errores frontend

---

**¡Felicidades en tu migración! 🎉**
