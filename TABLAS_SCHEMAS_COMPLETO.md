# 📊 Estructura Completa de Tablas/Schemas - GLP-UI

**Documento de referencia**: Mapeo completo de Google Sheets → Supabase (PostgreSQL)

---

## 📋 Índice Rápido

1. **Hojas Google Sheets (Actual)**
2. **Tablas Supabase (Destino)**
3. **Mapeo Sheet → DB**
4. **Migraciones de Datos**
5. **Enums/Tipos Definidos**

---

## 1️⃣ HOJAS GOOGLE SHEETS (Sistema Actual)

### Definidas en `gas/00_config_core.js`

```javascript
const SHEETS = {
  VIN_LIST: "LISTA DE VIN GLP",      // Vehículos
  USERS: "USUARIOS",                  // Usuarios del sistema
  CONV: "CONV121",                    // Conversiones GLP (Motor)
  CALIDAD: "CALIDAD1",                // QA/Calidad
  RAMAL: "RAMALERO1",                 // Ramalero (tuberías)
  ASSIGN: "ASIGNACIONES",             // Asignación de tareas
  EVENTS: "MARCA_EVENTOS",            // Log de eventos
  INC: "INCIDENCIAS",                 // Reportes de problemas
};
```

---

## 2️⃣ TABLAS SUPABASE (PostgreSQL)

### 📌 Tabla: `vins`
**Migración desde**: "LISTA DE VIN GLP"
**Objetivo**: Registro maestro de vehículos

| Campo | Tipo | Notas |
|-------|------|-------|
| `vin` | TEXT PRIMARY KEY | VIN normalizado (mayúscula) |
| `modelo` | TEXT | Modelo del vehículo |
| `dua` | TEXT | Documento de autorización |
| `cliente` | TEXT | Cliente/Propietario |
| `reductor_asignado` | TEXT | Serial del reductor asignado |
| `tanque_asignado` | TEXT | Serial del tanque asignado |
| `created_at` | TIMESTAMPTZ | Timestamp de creación |

**Índices**:
- `idx_vins_cliente` (cliente)

---

### 📌 Tabla: `usuarios`
**Migración desde**: "USUARIOS" (columna)
**Objetivo**: Usuarios del sistema

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID PRIMARY KEY | Identificador único |
| `email` | TEXT UNIQUE NOT NULL | Email único |
| `nombre` | TEXT | Nombre completo |
| `rol` | rol_usuario ENUM | TECNICO, SUPERVISOR, ADMIN, CALIDAD, MOVILIZADOR, RAMALERO |
| `especialidad` | especialidad ENUM | AMBOS, MOTOR, TANQUE |
| `activo` | BOOLEAN | Estado del usuario |
| `created_at` | TIMESTAMPTZ | Timestamp de creación |

**Índices**:
- `idx_usuarios_email` (email)
- `idx_usuarios_activo` (activo=true)

**Campos fuente en Sheet**:
```
UUID, NOMBRE, EMAIL, ROL, ESPECIALIDAD, ACTIVO, MODULOS
```

---

### 📌 Tabla: `usuario_modulos` (Normalización)
**Migración desde**: "USUARIOS" (columna MODULOS CSV)
**Objetivo**: Relación muchos-a-muchos usuario→módulos

| Campo | Tipo | Notas |
|-------|------|-------|
| `user_id` | UUID FK | Referencias a usuarios.id |
| `modulo` | modulo ENUM | TECNICO, RAMALERO, CALIDAD, MOVILIZADOR, SUPERVISOR, ADMIN |

**Clave primaria**: (user_id, modulo)

**Detalle de migración**:
- Campo MODULOS en Sheet: CSV tipo "TECNICO,RAMALERO,CALIDAD" o "ALL"
- Se normaliza a filas individuales en usuario_modulos

---

### 📌 Tabla: `work_orders`
**Migración desde**: "CONV121", "CALIDAD1", "RAMALERO1" (3 hojas)
**Objetivo**: Órdenes de trabajo (unificadas)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID PRIMARY KEY | Identificador único |
| `tipo_ot` | tipo_ot ENUM | CONVERSION, CALIDAD, RAMALERO |
| `vin` | TEXT FK | Referencias a vins.vin (NULL para RAMALERO) |
| `user_id` | UUID FK | For RAMALERO: técnico asignado |
| `tipo_ramal` | tipo_ramal ENUM | JETOUR, VOLKSWAGEN, KYC V3, KYC V5, KYC V7, KYC X5 |
| `fecha_creacion` | TIMESTAMPTZ | Fecha de creación de OT |
| `estado_general` | estado_general ENUM | PENDIENTE, EN PROCESO, TRABAJANDO, FINALIZADO |
| `observaciones` | TEXT | Notas generales |
| `tanque_registrado` | TEXT | Serial del tanque usado (CONVERSION/CALIDAD) |
| `reductor_registrado` | TEXT | Serial del reductor usado (CONVERSION/CALIDAD) |
| `conf_ck1` | BOOLEAN | Checklist conformidad 1 |
| `conf_ck2` | BOOLEAN | Checklist conformidad 2 |
| `conf_ck3` | BOOLEAN | Checklist conformidad 3 |
| `conf_ck4` | BOOLEAN | Checklist conformidad 4 |
| `conf_ts` | TIMESTAMPTZ | Timestamp de conformidad |
| `conf_by` | TEXT | Email de quien confirmó |
| `created_at` | TIMESTAMPTZ | Timestamp de creación |

**Constraints**:
- `CHK_CONV_HAS_VIN`: CONVERSION requiere VIN
- `CHK_CALIDAD_HAS_VIN`: CALIDAD requiere VIN
- `CHK_RAMALERO_HAS_TIPO`: RAMALERO requiere tipo_ramal

**Índices**:
- `idx_wo_vin` (vin)
- `idx_wo_tipo` (tipo_ot)
- `idx_wo_estado` (estado_general)
- `idx_wo_user` (user_id)

**Migración por tipo**:

#### CONVERSION (desde CONV121)
```
CONVERSION_ID     → id
CHASIS_ID         → vin
FECHA_CREACION    → fecha_creacion
ESTADO_GENERAL    → estado_general
OBSERVACIONES     → observaciones
TANQUE_REGISTRADO → tanque_registrado
REDUCTOR_REGISTRADO → reductor_registrado
CONF_CK1-4        → conf_ck1-4
CONF_TS, CONF_BY  → conf_ts, conf_by
```

#### CALIDAD (desde CALIDAD1)
```
CALIDAD_ID        → id (tipo_ot='CALIDAD')
CHASIS_ID         → vin
FECHA_CREACION    → fecha_creacion
ESTADO_GENERAL    → estado_general
OBSERVACIONES     → observaciones
TANQUE_REGISTRADO → tanque_registrado
REDUCTOR_REGISTRADO → reductor_registrado
```

#### RAMALERO (desde RAMALERO1)
```
RAMAL_ID          → id (tipo_ot='RAMALERO')
USER_ID + EMAIL   → user_id (lookup en usuarios)
TIPO_RAMAL        → tipo_ramal (normalizado)
FECHA_CREACION    → fecha_creacion
ESTADO_GENERAL    → estado_general
OBSERVACIONES     → observaciones
```

---

### 📌 Tabla: `asignaciones`
**Migración desde**: "ASIGNACIONES"
**Objetivo**: Asignación de usuarios a órdenes de trabajo

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID PRIMARY KEY | Identificador único |
| `work_order_id` | UUID FK | Referencias a work_orders.id |
| `user_id` | UUID FK | Referencias a usuarios.id |
| `tipo_ot` | tipo_ot ENUM | CONVERSION, CALIDAD, RAMALERO |
| `rol_trabajo` | rol_trabajo ENUM | MOTOR, TANQUE, CALIDAD, RAMALERO, MOVILIZADOR |
| `activo` | BOOLEAN | Si está actualmente asignado |
| `fecha_asignacion` | TIMESTAMPTZ | Cuándo se asignó |
| `tiempo_trab_ms` | BIGINT | Tiempo trabajado en milisegundos |
| `estado_actual` | estado_actual ENUM | SIN_INICIAR, TRABAJANDO, PAUSADO, FINALIZADO |
| `updated_at` | TIMESTAMPTZ | Última actualización |
| `running_since` | TIMESTAMPTZ | Cuándo comenzó a trabajar (para pausa/reanudar) |
| `last_nota` | TEXT | Última nota registrada |
| `last_nota_ts` | TIMESTAMPTZ | Timestamp de última nota |

**Constraint único**:
- `IDX_ASG_ACTIVE`: Solo 1 asignación activa por (work_order_id, rol_trabajo)

**Índices**:
- `idx_asg_user` (user_id)
- `idx_asg_estado` (estado_actual)
- `idx_asg_updated` (updated_at)

**Campos fuente en Sheet**:
```
ASIGNACION_ID, CONVERSION_ID (→ work_order_id), USER_ID, TIPO_OT,
ROL_TRABAJO, ACTIVO, FECHA_ASIGNACION, TIEMPO_TRAB_MS,
ESTADO_ACTUAL, UPDATED_AT, RUNNING_SINCE, LAST_NOTA, LAST_NOTA_TS
```

---

### 📌 Tabla: `eventos`
**Migración desde**: "MARCA_EVENTOS"
**Objetivo**: Log de eventos de usuarios (inicio, pausa, fin, notas)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID PRIMARY KEY | Identificador único |
| `timestamp` | TIMESTAMPTZ NOT NULL | Cuándo ocurrió |
| `user_id` | UUID FK | References usuarios.id |
| `work_order_id` | UUID FK | References work_orders.id |
| `tipo_ot` | tipo_ot ENUM | CONVERSION, CALIDAD, RAMALERO |
| `rol_trabajo` | rol_trabajo ENUM | MOTOR, TANQUE, CALIDAD, RAMALERO, MOVILIZADOR |
| `accion` | accion_evento ENUM | INICIO, PAUSA, REANUDAR, FIN, NOTA |
| `nota` | TEXT | Comentario adicional |

**Índices**:
- `idx_evt_wo` (work_order_id)
- `idx_evt_user` (user_id)
- `idx_evt_ts` (timestamp DESC)

**Campos fuente en Sheet**:
```
EVENTO_ID, TIMESTAMP, USER_ID, CONVERSION_ID (→ work_order_id),
TIPO_OT, ROL_TRABAJO, ACCION, NOTA
```

---

### 📌 Tabla: `incidencias`
**Migración desde**: "INCIDENCIAS"
**Objetivo**: Reportes de anomalías/problemas durante conversión

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID PRIMARY KEY | Identificador único |
| `fecha_hora` | TIMESTAMPTZ NOT NULL | Cuándo se reportó |
| `mes` | TEXT NOT NULL | Formato 'yyyy-MM' para agrupación |
| `work_order_id` | UUID FK | References work_orders.id (nullable) |
| `vin` | TEXT FK | References vins.vin (nullable) |
| `tecnico` | TEXT NOT NULL | Técnico que reportó |
| `tipo` | severidad ENUM | LEVE, MODERADA, CRITICA |
| `registrado_por` | TEXT NOT NULL | Usuario/email que registró |
| `nota` | TEXT | Descripción del problema |
| `foto_file_id` | TEXT | Google Drive file ID |
| `foto_folder_id` | TEXT | Google Drive folder ID |
| `foto_batch_id` | TEXT | Batch ID para agrupación de fotos |

**Campos NO migrados** (se calculan en app):
- FOTO_URL → Calculada: `https://drive.google.com/uc?export=view&id={foto_file_id}`
- FOTO_THUMB_URL → Calculada: `https://drive.google.com/thumbnail?id={foto_file_id}&sz=w400`
- FOTO_IMG_URL → Calculada (similar a FOTO_URL)

**Índices**:
- `idx_inc_vin` (vin)
- `idx_inc_wo` (work_order_id)
- `idx_inc_mes` (mes)
- `idx_inc_tipo` (tipo)

**Campos fuente en Sheet**:
```
FECHA_HORA, MES, CONVERSION_ID, VIN, TECNICO,
TIPO, REGISTRADO_POR, NOTA, FOTO_FILE_ID, FOTO_FOLDER_ID, FOTO_BATCH_ID
```

---

### 📌 Tabla: `app_config` (Configuración)
**Objetivo**: Almacenar configuración global (reemplaza Script Properties)

| Campo | Tipo | Notas |
|-------|------|-------|
| `key` | TEXT PRIMARY KEY | Nombre de config |
| `value` | TEXT | Valor |

**Valores iniciales**:
- `REV`: '0' (revision counter)
- `REV_TS`: '0' (timestamp de última revisión)

---

## 3️⃣ MAPEO COMPLETO: SHEET → DB

| Google Sheet | Tabla Supabase | Notas |
|--------------|-----------------|-------|
| LISTA DE VIN GLP | `vins` | 1:1 |
| USUARIOS (fila) | `usuarios` + `usuario_modulos` | Normalización de MODULOS CSV |
| CONV121 | `work_orders` (tipo_ot='CONVERSION') | Union de 3 sheets |
| CALIDAD1 | `work_orders` (tipo_ot='CALIDAD') | |
| RAMALERO1 | `work_orders` (tipo_ot='RAMALERO') | |
| ASIGNACIONES | `asignaciones` | 1:1 |
| MARCA_EVENTOS | `eventos` | 1:1 |
| INCIDENCIAS | `incidencias` | 1:1 |

---

## 4️⃣ MIGRACIONES DE DATOS (desde `gas/MIGRATE.js`)

### Función Principal
```javascript
function migrateAll() {
  migrateVins_();           // Step 1
  migrateUsuarios_();       // Step 2 (usuarios + usuario_modulos)
  migrateWorkOrders_();     // Step 3 (CONV + CALIDAD + RAMALERO)
  migrateAsignaciones_();   // Step 4
  migrateEventos_();        // Step 5
  migrateIncidencias_();    // Step 6
}
```

### Detalles por Migración

#### 1️⃣ **migrateVins_()** - LISTA DE VIN GLP
```
Input columns:  VIN, MODELO, DUA, CLIENTE, REDU_AUTO/REDUCTOR, TANQ_AUTO/TANQUE
Output:         vins (id, modelo, dua, cliente, reductor_asignado, tanque_asignado)
Alias handling: REDU_AUTO|REDUCTOR_ASIGNADO|REDUCTOR, TANQ_AUTO|TANQUE_ASIGNADO|TANQUE
```

#### 2️⃣ **migrateUsuarios_()** - USUARIOS
```
Input columns:  UUID, NOMBRE, EMAIL, ROL, ESPECIALIDAD, ACTIVO, MODULOS
Output:         usuarios (id, email, nombre, rol, especialidad, activo)
                usuario_modulos (user_id, modulo)

UUID handling:
  - Si es UUID válido → usar como id directo
  - Si es numérico → generar UUID, guardar mapping en MIGRATION_CTX.userIdMap
  
Especialidad normalization:
  - "TANQUERO" → "TANQUE"
  - Valid: AMBOS, MOTOR, TANQUE
  - Default: AMBOS

MODULOS splitting:
  - "ALL" → todas las 6: TECNICO, RAMALERO, CALIDAD, MOVILIZADOR, SUPERVISOR, ADMIN
  - CSV → split por comas/espacios/pipes
```

#### 3️⃣ **migrateWorkOrders_()** - CONV121 + CALIDAD1 + RAMALERO1
```
CONVERSION:
  CONVERSION_ID     → id
  CHASIS_ID         → vin
  FECHA_CREACION    → fecha_creacion
  ESTADO_GENERAL    → estado_general (normalizado a mayúsculas, default PENDIENTE)
  OBSERVACIONES     → observaciones
  TANQUE_REGISTRADO → tanque_registrado
  REDUCTOR_REGISTRADO → reductor_registrado
  CONF_CK1-4        → conf_ck1-4 (parseado como booleano)
  CONF_TS           → conf_ts (ISO datetime)
  CONF_BY           → conf_by (email)

CALIDAD:
  CALIDAD_ID        → id (tipo_ot='CALIDAD')
  CHASIS_ID         → vin
  ... (resto igual a CONVERSION, pero sin conformidad)

RAMALERO:
  RAMAL_ID          → id (tipo_ot='RAMALERO')
  USER_ID + EMAIL   → user_id (lookup con resolveUserUuid_)
  TIPO_RAMAL        → tipo_ramal (normalizados: JETOUR, VOLKSWAGEN, KYC V3, V5, V7, X5)
  ... (resto igual)
```

#### 4️⃣ **migrateAsignaciones_()** - ASIGNACIONES
```
Input columns:  ASIGNACION_ID, CONVERSION_ID, USER_ID/EMAIL, TIPO_OT,
                ROL_TRABAJO, ACTIVO, FECHA_ASIGNACION, TIEMPO_TRAB_MS,
                ESTADO_ACTUAL, UPDATED_AT, RUNNING_SINCE, LAST_NOTA, LAST_NOTA_TS

Key points:
  - Valida que work_order_id (CONVERSION_ID) exista en work_orders
  - Valida que user_id se pueda resolver
  - Descarta filas sin PK válidos
  - Genera UUID si ASIGNACION_ID está vacío
```

#### 5️⃣ **migrateEventos_()** - MARCA_EVENTOS
```
Input columns:  EVENTO_ID, TIMESTAMP, USER_ID/EMAIL, CONVERSION_ID,
                TIPO_OT, ROL_TRABAJO, ACCION, NOTA

Key points:
  - Similar validación a asignaciones
  - Valida que user_id y work_order_id existan
  - Normaliza ACCION a mayúsculas
```

#### 6️⃣ **migrateIncidencias_()** - INCIDENCIAS
```
Input columns:  FECHA_HORA, MES, CONVERSION_ID, VIN, TECNICO,
                TIPO, REGISTRADO_POR, NOTA, FOTO_FILE_ID, FOTO_FOLDER_ID, FOTO_BATCH_ID

Key points:
  - Filtro: requiere MES y TECNICO no vacíos
  - TIPO normalizado a mayúsculas (LEVE, MODERADA, CRITICA)
  - No migra FOTO_URL, FOTO_THUMB_URL, FOTO_IMG_URL (se calculan en app)
  - work_order_id y vin son opcionales (nullable)
```

---

## 5️⃣ ENUMS/TIPOS DEFINIDOS EN SUPABASE

### `rol_usuario`
```sql
TECNICO, SUPERVISOR, ADMIN, CALIDAD, MOVILIZADOR, RAMALERO
```

### `especialidad`
```sql
AMBOS, MOTOR, TANQUE
```

### `modulo`
```sql
TECNICO, RAMALERO, CALIDAD, MOVILIZADOR, SUPERVISOR, ADMIN
```

### `tipo_ot` (Order Type)
```sql
CONVERSION, CALIDAD, RAMALERO
```

### `estado_general`
```sql
PENDIENTE, EN PROCESO, TRABAJANDO, FINALIZADO
```

### `estado_actual`
```sql
SIN_INICIAR, TRABAJANDO, PAUSADO, FINALIZADO
```

### `rol_trabajo` (Work Role)
```sql
MOTOR, TANQUE, CALIDAD, RAMALERO, MOVILIZADOR
```

### `accion_evento` (Event Action)
```sql
INICIO, PAUSA, REANUDAR, FIN, NOTA
```

### `severidad` (Incidencias Severity)
```sql
LEVE, MODERADA, CRITICA
```

### `tipo_ramal` (Ramales/Tubería types)
```sql
JETOUR, VOLKSWAGEN, KYC V3, KYC V5, KYC V7, KYC X5
```

---

## 📐 DIAGRAMA DE RELACIONES (ER)

```
┌─────────────────────────────────────────────────────────────┐
│                        USUARIOS (Core)                       │
├───────────────────────────────────────────────────────────┬──┤
│ id (UUID) PK │ email │ nombre │ rol │ especialidad │ activo   │
└─────────┬─────────────────────────────────────────────────┼──┘
          │                                                  │
          ├──────────────────────────┐                        │
          │                          │                        │
      ┌───▼──────────────┐      ┌────▼────────────────┐       │
      │ USUARIO_MODULOS  │      │ ASIGNACIONES      │       │
      ├──────────────────┤      ├───────────────────┤       │
      │ user_id (FK)     │      │ work_order_id (FK)│       │
      │ modulo           │      │ user_id (FK)◄─────┘       │
      └──────────────────┘      │ estado_actual     │       │
                                │ tiempo_trab_ms    │       │
                                └──────────┬────────┘       │
                                           │                │
                                    ┌──────▼──────────┐      │
                                    │ WORK_ORDERS    │      │
                                    ├────────────────┤      │
                                    │ id (UUID) PK  │◄──────┘
                                    │ tipo_ot        │
                                    │ vin (FK)       │
                                    │ user_id (FK)   │
                                    │ estado_general │
                                    │ conf_ck1-4     │
                                    └────┬─────┬────┘
                                         │     │
                        ┌────────────────┘     └──────────────┐
                        │                                     │
                    ┌───▼────────────┐              ┌────────▼──────┐
                    │ VINS           │              │ EVENTOS       │
                    ├────────────────┤              ├───────────────┤
                    │ vin (TEXT) PK  │              │ id (UUID) PK  │
                    │ modelo         │              │ timestamp     │
                    │ dua            │              │ user_id (FK)  │
                    │ cliente        │              │ work_order(FK)│
                    │ reductor_*     │              │ accion        │
                    │ tanque_*       │              │ nota          │
                    └────────────────┘              └───────────────┘
                                                   
                                                   ┌──────────────────┐
                                                   │ INCIDENCIAS      │
                                                   ├──────────────────┤
                                                   │ id (UUID) PK     │
                                                   │ fecha_hora       │
                                                   │ mes              │
                                                   │ work_order_id(FK)│
                                                   │ vin (FK)         │
                                                   │ tecnico          │
                                                   │ tipo (severidad) │
                                                   │ foto_file_id     │
                                                   └──────────────────┘

┌──────────────────────────────────────────┐
│ APP_CONFIG (Singleton)                   │
├──────────────────────────────────────────┤
│ key (TEXT) PK │ value                    │
│ REV           │ 0                        │
│ REV_TS        │ 0                        │
└──────────────────────────────────────────┘
```

---

## 🔄 RESUMEN DE MIGRACIONES

| Tabla | Sheet Origen | Registros | Mapeo |
|-------|--------------|-----------|-------|
| vins | LISTA DE VIN GLP | ~200 | Simple (1:1) |
| usuarios | USUARIOS | ~50 | + normalización MODULOS |
| usuario_modulos | USUARIOS (col) | ~300+ | Normalización CSV |
| work_orders | CONV121+CAL+RAM | ~300+ | 3 sheets unificadas |
| asignaciones | ASIGNACIONES | ~500+ | Con FK validation |
| eventos | MARCA_EVENTOS | ~1000+ | Con FK validation |
| incidencias | INCIDENCIAS | ~200+ | Storage en Drive |

**Total de registros migrables**: ~2500+

---

## 🛠️ CONFIGURACIÓN REQUERIDA PARA MIGRACIÓN

### En Supabase Script Properties (Apps Script):
```javascript
SUPABASE_URL  = "https://xxxxx.supabase.co"
SUPABASE_KEY  = "service_role_key" // ⚠️ NO la anon key
```

### Pasos:
1. Ejecutar `schema.sql` en Supabase PRIMERO
2. Pegar `MIGRATE.js` en Apps Script
3. Ejecutar función `migrateAll()`

---

## 📝 NOTAS IMPORTANTES

✅ **Campos calculados en app** (NO en DB):
- FOTO URLs para incidencias (se calculan desde file_id)
- TIEMPO_TRAB (se calcula desde tiempo_trab_ms)
- Estado computado de asignaciones

⚠️ **Validaciones durante migración**:
- User ID resolution con mapeo legacy (numeral → UUID)
- FK validation para asignaciones/eventos
- Normalización de enums
- Descarte de registros inválidos con logging

🔒 **RLS Habilitado** en todas las tablas (permisos para service_role)

---

**Última actualización**: Documento generado desde análisis de `gas/*.js` + `supabase/schema.sql`
