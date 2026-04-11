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

Copia y pega esto en el editor SQL (**es el schema completo de tu AppScript migrado a PostgreSQL**):

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- ENUMS (TIPOS PERSONALIZADOS)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE rol_enum AS ENUM ('TECNICO', 'SUPERVISOR', 'ADMIN', 'CALIDAD', 'MOVILIZADOR', 'RAMALERO');
CREATE TYPE modulo_enum AS ENUM ('TECNICO', 'RAMALERO', 'CALIDAD', 'MOVILIZADOR', 'SUPERVISOR', 'ADMIN');
CREATE TYPE especialidad_enum AS ENUM ('AMBOS', 'MOTOR', 'TANQUE');
CREATE TYPE tipo_ot_enum AS ENUM ('CONVERSION', 'CALIDAD', 'RAMALERO');
CREATE TYPE rol_trabajo_enum AS ENUM ('MOTOR', 'TANQUE', 'CALIDAD', 'RAMALERO', 'MOVILIZADOR');
CREATE TYPE estado_general_enum AS ENUM ('PENDIENTE', 'EN_PROCESO', 'TRABAJANDO', 'FINALIZADO');
CREATE TYPE estado_actual_enum AS ENUM ('SIN_INICIAR', 'TRABAJANDO', 'PAUSADO', 'FINALIZADO');
CREATE TYPE accion_enum AS ENUM ('INICIO', 'PAUSA', 'REANUDAR', 'FIN', 'NOTA');
CREATE TYPE tipo_ramal_enum AS ENUM ('JETOUR', 'VOLKSWAGEN', 'KYC_V3', 'KYC_V5', 'KYC_V7', 'KYC_X5');
CREATE TYPE incidencia_tipo_enum AS ENUM ('LEVE', 'MODERADA', 'CRITICA');

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA 1: VINS (Vehículos)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.vins (
  vin VARCHAR(17) PRIMARY KEY,
  modelo VARCHAR(255),
  dua VARCHAR(255),
  cliente VARCHAR(255),
  reductor_asignado VARCHAR(255),
  tanque_asignado VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vins_cliente ON public.vins(cliente);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA 2: USUARIOS (Usuarios del Sistema)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  nombre VARCHAR(255),
  rol rol_enum NOT NULL,
  especialidad especialidad_enum DEFAULT 'AMBOS',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON public.usuarios(activo);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA 3: USUARIO_MODULOS (Relación Muchos-a-Muchos: Usuarios ↔ Módulos)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.usuario_modulos (
  user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  modulo modulo_enum NOT NULL,
  PRIMARY KEY (user_id, modulo)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA 4: WORK_ORDERS (Órdenes de Trabajo - UNIFICADA)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_ot tipo_ot_enum NOT NULL,
  vin VARCHAR(17) REFERENCES public.vins(vin) ON DELETE SET NULL,
  user_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  tipo_ramal tipo_ramal_enum,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  estado_general estado_general_enum DEFAULT 'PENDIENTE',
  observaciones TEXT,
  tanque_registrado VARCHAR(255),
  reductor_registrado VARCHAR(255),
  conf_ck1 BOOLEAN,
  conf_ck2 BOOLEAN,
  conf_ck3 BOOLEAN,
  conf_ck4 BOOLEAN,
  conf_ts TIMESTAMP WITH TIME ZONE,
  conf_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_vin ON public.work_orders(vin);
CREATE INDEX IF NOT EXISTS idx_work_orders_tipo ON public.work_orders(tipo_ot);
CREATE INDEX IF NOT EXISTS idx_work_orders_estado ON public.work_orders(estado_general);
CREATE INDEX IF NOT EXISTS idx_work_orders_user ON public.work_orders(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA 5: ASIGNACIONES (Asignación Usuario → Orden de Trabajo)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.asignaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo_ot tipo_ot_enum NOT NULL,
  rol_trabajo rol_trabajo_enum NOT NULL,
  activo BOOLEAN DEFAULT true,
  fecha_asignacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tiempo_trab_ms BIGINT DEFAULT 0,
  estado_actual estado_actual_enum DEFAULT 'SIN_INICIAR',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  running_since TIMESTAMP WITH TIME ZONE,
  last_nota TEXT,
  last_nota_ts TIMESTAMP WITH TIME ZONE,
  CONSTRAINT unique_active_assignment UNIQUE (work_order_id, rol_trabajo) WHERE activo = true
);

CREATE INDEX IF NOT EXISTS idx_asignaciones_active ON public.asignaciones(work_order_id, rol_trabajo) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_asignaciones_user ON public.asignaciones(user_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_estado ON public.asignaciones(estado_actual);
CREATE INDEX IF NOT EXISTS idx_asignaciones_updated ON public.asignaciones(updated_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA 6: EVENTOS (Log de Eventos / Historial)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  tipo_ot tipo_ot_enum NOT NULL,
  rol_trabajo rol_trabajo_enum NOT NULL,
  accion accion_enum NOT NULL,
  nota TEXT
);

CREATE INDEX IF NOT EXISTS idx_eventos_work_order ON public.eventos(work_order_id);
CREATE INDEX IF NOT EXISTS idx_eventos_user ON public.eventos(user_id);
CREATE INDEX IF NOT EXISTS idx_eventos_timestamp ON public.eventos(timestamp DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA 7: INCIDENCIAS (Reportes de Anomalías)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.incidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  mes VARCHAR(7) NOT NULL,
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  vin VARCHAR(17) REFERENCES public.vins(vin) ON DELETE SET NULL,
  tecnico VARCHAR(255) NOT NULL,
  tipo incidencia_tipo_enum NOT NULL,
  registrado_por VARCHAR(255) NOT NULL,
  nota TEXT,
  foto_file_id VARCHAR(255),
  foto_folder_id VARCHAR(255),
  foto_batch_id VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_incidencias_vin ON public.incidencias(vin);
CREATE INDEX IF NOT EXISTS idx_incidencias_work_order ON public.incidencias(work_order_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_mes ON public.incidencias(mes);
CREATE INDEX IF NOT EXISTS idx_incidencias_tipo ON public.incidencias(tipo);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA 8: APP_CONFIG (Configuración Global)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.app_config (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT
);

-- Valores iniciales
INSERT INTO public.app_config (key, value) VALUES ('REV', '0') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.app_config (key, value) VALUES ('REV_TS', '0') ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- POLÍTICAS DE SEGURIDAD (RLS - Row Level Security)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.vins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- LECTURA PÚBLICA (todos pueden leer)
CREATE POLICY "vins_read" ON public.vins FOR SELECT USING (true);
CREATE POLICY "usuarios_read" ON public.usuarios FOR SELECT USING (true);
CREATE POLICY "usuario_modulos_read" ON public.usuario_modulos FOR SELECT USING (true);
CREATE POLICY "work_orders_read" ON public.work_orders FOR SELECT USING (true);
CREATE POLICY "asignaciones_read" ON public.asignaciones FOR SELECT USING (true);
CREATE POLICY "eventos_read" ON public.eventos FOR SELECT USING (true);
CREATE POLICY "incidencias_read" ON public.incidencias FOR SELECT USING (true);
CREATE POLICY "app_config_read" ON public.app_config FOR SELECT USING (true);

-- INSERCIÓN (usuarios autenticados pueden crear)
CREATE POLICY "vins_insert" ON public.vins FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "usuarios_insert" ON public.usuarios FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "usuario_modulos_insert" ON public.usuario_modulos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "work_orders_insert" ON public.work_orders FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "asignaciones_insert" ON public.asignaciones FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "eventos_insert" ON public.eventos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "incidencias_insert" ON public.incidencias FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "app_config_insert" ON public.app_config FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ACTUALIZACIÓN (usuarios autenticados pueden actualizar)
CREATE POLICY "vins_update" ON public.vins FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "usuarios_update" ON public.usuarios FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "usuario_modulos_update" ON public.usuario_modulos FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "work_orders_update" ON public.work_orders FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "asignaciones_update" ON public.asignaciones FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "eventos_update" ON public.eventos FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "incidencias_update" ON public.incidencias FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "app_config_update" ON public.app_config FOR UPDATE USING (auth.uid() IS NOT NULL);
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
