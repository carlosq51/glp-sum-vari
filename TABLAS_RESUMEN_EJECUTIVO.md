# ⚡ RESUMEN EJECUTIVO: ESTRUCTURA DE TABLAS GLP-UI

## 📊 VISTA 30 SEGUNDOS

**8 Tablas | 67 Columnas | 11 FKs | ~2500+ Registros**

---

## 🎯 LAS 8 TABLAS ESENCIALES

\`\`\`
1. vins           - Vehículos (VIN es clave)
2. usuarios       - Users del sistema
3. usuario_modulos - Permisos normalizados
4. work_orders    - Órdenes unificadas (CONVERSION|CALIDAD|RAMALERO)
5. asignaciones   - Usuario→Orden (con tracking de tiempo)
6. eventos       - Historial de acciones (INICIO|PAUSA|FIN|NOTA)
7. incidencias   - Reportes de problemas (con fotos en Drive)
8. app_config    - Singleton de configuración
\`\`\`

---

## 🔍 TABLA MÁS IMPORTANTE: work_orders

**Es el CENTRO del sistema** — unifica 3 tipos de órdenes:

```
CONVERSION (Motor)    ← CONV121      [~150 rows]
CALIDAD (QA)          ← CALIDAD1     [~80 rows]
RAMALERO (Tuberías)   ← RAMALERO1    [~100 rows]
```

**Campos clave**:
- `id` (UUID)
- `tipo_ot` (discrimina: CONVERSION|CALIDAD|RAMALERO)
- `vin` (para CONVERSION/CALIDAD)
- `usuario` + `tipo_ramal` (para RAMALERO)
- `estado_general` (PENDIENTE➜EN_PROCESO➜TRABAJANDO➜FINALIZADO)
- `conf_ck1-4` + `conf_ts` + `conf_by` (solo CONVERSION)

---

## 🔗 FLUJO DE RELACIONES

```
┌─USUARIOS─┐
│  50 rows │
└────┬────┘
     │
     ├→ USUARIO_MODULOS (300+ permisos)
     │
     └→ ASIGNACIONES (500+ tareas)
          ├→ work_orders (330+)
          │  ├→ VINS (200)
          │  └→ INCIDENCIAS (200+)
          │
          └→ EVENTOS (1000+ log)
```

---

## 📋 CAMPOS POR TABLA (ULTRA-CONCISO)

### vins (200)
`vin | modelo | dua | cliente | reductor_asignado | tanque_asignado | created_at`

### usuarios (50)
`id | email (UK) | nombre | rol | especialidad | activo | created_at`

### usuario_modulos (300+)
`user_id (FK) | modulo (enum)`

### work_orders (330+) ⭐ PRINCIPAL
`id | tipo_ot (CONVERSION|CALIDAD|RAMALERO) | vin (FK) | user_id (FK) | tipo_ramal | fecha_creacion | estado_general | observaciones | tanque_registrado | reductor_registrado | conf_ck1-4 | conf_ts | conf_by | created_at`

### asignaciones (500+)
`id | work_order_id (FK) | user_id (FK) | tipo_ot | rol_trabajo | activo | fecha_asignacion | tiempo_trab_ms | estado_actual | updated_at | running_since | last_nota | last_nota_ts`

### eventos (1000+)
`id | timestamp | user_id (FK) | work_order_id (FK) | tipo_ot | rol_trabajo | accion (INICIO|PAUSA|REANUDAR|FIN|NOTA) | nota`

### incidencias (200+)
`id | fecha_hora | mes (yyyy-MM) | work_order_id (FK) | vin (FK) | tecnico | tipo (LEVE|MODERADA|CRITICA) | registrado_por | nota | foto_file_id | foto_folder_id | foto_batch_id`

### app_config (2)
`key | value` (REV, REV_TS)

---

## 🎨 ENUM SUMMARY

| Enum | Valores |
|------|---------|
| **rol_usuario** | TECNICO, SUPERVISOR, ADMIN, CALIDAD, MOVILIZADOR, RAMALERO |
| **especialidad** | AMBOS, MOTOR, TANQUE |
| **modulo** | TECNICO, RAMALERO, CALIDAD, MOVILIZADOR, SUPERVISOR, ADMIN |
| **tipo_ot** | CONVERSION, CALIDAD, RAMALERO |
| **estado_general** | PENDIENTE, EN PROCESO, TRABAJANDO, FINALIZADO |
| **estado_actual** | SIN_INICIAR, TRABAJANDO, PAUSADO, FINALIZADO |
| **rol_trabajo** | MOTOR, TANQUE, CALIDAD, RAMALERO, MOVILIZADOR |
| **accion_evento** | INICIO, PAUSA, REANUDAR, FIN, NOTA |
| **severidad** | LEVE, MODERADA, CRITICA |
| **tipo_ramal** | JETOUR, VOLKSWAGEN, KYC V3, KYC V5, KYC V7, KYC X5 |

---

## 🔄 ORIGEN DE DATOS (Google Sheets)

| Tabla | Sheet | Mapeo |
|-------|-------|-------|
| vins | LISTA DE VIN GLP | 1:1 simple |
| usuarios | USUARIOS | 1:1 + normalización |
| usuario_modulos | USUARIOS (MODULOS CSV) | 1:N normalizado |
| work_orders | CONV121 + CALIDAD1 + RAMALERO1 | 3→1 unificado |
| asignaciones | ASIGNACIONES | 1:1 |
| eventos | MARCA_EVENTOS | 1:1 |
| incidencias | INCIDENCIAS | 1:1 |

---

## ⏱️ CAMPO DE TIEMPO

Cada tabla tiene timestamp:
- **vins**: `created_at` (cuándo se añadió)
- **usuarios**: `created_at`
- **work_orders**: `fecha_creacion`, `created_at`
- **asignaciones**: `fecha_asignacion`, `running_since` (⏱️), `last_nota_ts`, `updated_at`
- **eventos**: `timestamp` (cuándo pasó)
- **incidencias**: `fecha_hora` (cuándo se reportó)

---

## 🎯 QUERIES TÍPICAS

```sql
-- Asignaciones activas de un usuario
SELECT * FROM asignaciones 
WHERE user_id = 'X' AND activo = true;

-- Estado de una conversión completa
SELECT w.*, a.*, u.nombre 
FROM work_orders w
LEFT JOIN asignaciones a ON w.id = a.work_order_id
LEFT JOIN usuarios u ON a.user_id = u.id
WHERE w.vin = 'VIN-XXX' AND w.tipo_ot = 'CONVERSION';

-- Historial de eventos
SELECT * FROM eventos 
WHERE work_order_id = 'X' 
ORDER BY timestamp ASC;

-- Incidencias by mes
SELECT * FROM incidencias 
WHERE mes = '2026-03' 
ORDER BY fecha_hora DESC;
```

---

## 🚨 INFORMACIÓN CRÍTICA

| Aspecto | Detalle |
|--------|---------|
| **PK Strategy** | UUID para todas (auto-generated) |
| **Indexing** | 18 índices, principalmente en FKs y búsquedas |
| **Constraints** | FK validations + 1 active assignment per rol |
| **RLS** | Habilitado en todas, pero service_role tiene full access |
| **Computation** | FOTO URLs calculadas (no stored) |

---

## 📌 RECORDATORIOS CLAVE

✅ **work_orders es central** — contiene 3 tipos de órdenes diferentes
✅ **asignaciones.time_trab_ms** — se acumula cuando está TRABAJANDO
✅ **eventos es append-only** — historial inmutable de acciones
✅ **incidencias.mes** — campo de agrupación (yyyy-MM)
✅ **conf_ck1-4** — solo en CONVERSION, para auditoría

⚠️ **Fotos NO se guardan en DB** — solo file_ids de Google Drive
⚠️ **Un usuario NO puede tener 2 asignaciones activas del mismo rol** (constraint único)
⚠️ **RAMALERO NO tiene VIN** — tiene user_id + tipo_ramal en lugar

---

## 📈 CAPACIDAD ESTIMADA

| Tabla | Rango | Crecimiento |
|-------|-------|------------|
| vins | 100-500 | Lento |
| usuarios | 50-100 | Lento |
| trabajo_orders | 300-1000 | Medio |
| asignaciones | 500-5000 | Rápido |
| eventos | 1000-100K | Muy rápido |
| incidencias | 100-1000 | Medio |

---

## 🔐 ACCESO

**Supabase**:
- URL: supabase_url/rest/v1/[tabla]
- Auth: service_role key (desde Apps Script)
- RLS: service_full_access policy

**Apps Script**:
- Funciones en `00_supabase.js`
- CRUD: `supabaseSelect_`, `supabaseInsert_`, `supabasePatch_`, `supabaseUpsert_`

---

## 📚 DOCUMENTOS DISPONIBLES

1. **TABLAS_SCHEMAS_COMPLETO.md** — Documentación detallada (4000 líneas)
2. **TABLAS_REFERENCIA_RAPIDA.md** — Referencia visual
3. **TABLAS_MATRIZ_COMPLETA.md** — Tabla maestra con todos los campos
4. **TABLAS_RESUMEN_EJECUTIVO.md** ← Estás aquí

---

**Última actualización**: Análisis completo de gas/* y schema.sql
**Total de información procesada**: 8 tablas, 67 columnas, 10 enums, 2500+ registros
