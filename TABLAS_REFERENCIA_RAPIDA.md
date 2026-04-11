# 📊 REFERENCIA RÁPIDA: Tablas y Campos Principales

## 🎯 Todas las Tablas Supabase (8 tablas)

### 1. `vins` - Vehículos
```
vin                STRING (PK)
├─ modelo          STRING
├─ dua              STRING
├─ cliente          STRING
├─ reductor_asignado STRING
├─ tanque_asignado  STRING
└─ created_at       TIMESTAMP
```
📍 Origen: "LISTA DE VIN GLP"

---

### 2. `usuarios` - Usuarios del Sistema
```
id                 UUID (PK)
├─ email            STRING (UNIQUE)
├─ nombre           STRING
├─ rol              ENUM: TECNICO|SUPERVISOR|ADMIN|CALIDAD|MOVILIZADOR|RAMALERO
├─ especialidad     ENUM: AMBOS|MOTOR|TANQUE
├─ activo           BOOLEAN
└─ created_at       TIMESTAMP
```
📍 Origen: "USUARIOS"

---

### 3. `usuario_modulos` - Módulos por Usuario
```
user_id (FK)   UUID → referencias usuarios.id
└─ modulo       ENUM: TECNICO|RAMALERO|CALIDAD|MOVILIZADOR|SUPERVISOR|ADMIN
```
📍 Origen: "USUARIOS" (columna MODULOS normalizada)

---

### 4. `work_orders` - Órdenes de Trabajo (UNIFICADA)
```
id                      UUID (PK)
├─ tipo_ot              ENUM: CONVERSION|CALIDAD|RAMALERO
├─ vin (FK)             STRING → vins.vin (NULL si RAMALERO)
├─ user_id (FK)         UUID → usuarios.id (solo para RAMALERO)
├─ tipo_ramal           ENUM: JETOUR|VOLKSWAGEN|KYC_V3|KYC_V5|KYC_V7|KYC_X5
├─ fecha_creacion       TIMESTAMP
├─ estado_general       ENUM: PENDIENTE|EN_PROCESO|TRABAJANDO|FINALIZADO
├─ observaciones        TEXT
│
├─ (CONVERSION/CALIDAD)
│  ├─ tanque_registrado    STRING (serial)
│  └─ reductor_registrado  STRING (serial)
│
├─ (solo CONVERSION)
│  ├─ conf_ck1          BOOLEAN
│  ├─ conf_ck2          BOOLEAN
│  ├─ conf_ck3          BOOLEAN
│  ├─ conf_ck4          BOOLEAN
│  ├─ conf_ts           TIMESTAMP
│  └─ conf_by           STRING (email)
│
└─ created_at           TIMESTAMP
```
📍 Origen: 3 sheets unificadas
- CONVERSION: "CONV121"
- CALIDAD: "CALIDAD1"
- RAMALERO: "RAMALERO1"

---

### 5. `asignaciones` - Asignación Usuario → Orden
```
id                  UUID (PK)
├─ work_order_id (FK) UUID → work_orders.id
├─ user_id (FK)      UUID → usuarios.id
├─ tipo_ot           ENUM: CONVERSION|CALIDAD|RAMALERO
├─ rol_trabajo       ENUM: MOTOR|TANQUE|CALIDAD|RAMALERO|MOVILIZADOR
├─ activo            BOOLEAN
├─ fecha_asignacion  TIMESTAMP
├─ tiempo_trab_ms    BIGINT (milisegundos trabajados)
├─ estado_actual     ENUM: SIN_INICIAR|TRABAJANDO|PAUSADO|FINALIZADO
├─ updated_at        TIMESTAMP
├─ running_since     TIMESTAMP (desde cuándo está en TRABAJANDO)
├─ last_nota         TEXT
└─ last_nota_ts      TIMESTAMP
```
📍 Origen: "ASIGNACIONES"

---

### 6. `eventos` - Log de Eventos
```
id              UUID (PK)
├─ timestamp     TIMESTAMP (NOT NULL)
├─ user_id (FK) UUID → usuarios.id
├─ work_order_id (FK) UUID → work_orders.id
├─ tipo_ot       ENUM: CONVERSION|CALIDAD|RAMALERO
├─ rol_trabajo   ENUM: MOTOR|TANQUE|CALIDAD|RAMALERO|MOVILIZADOR
├─ accion        ENUM: INICIO|PAUSA|REANUDAR|FIN|NOTA
└─ nota          TEXT
```
📍 Origen: "MARCA_EVENTOS"

---

### 7. `incidencias` - Reportes de Anomalías
```
id              UUID (PK)
├─ fecha_hora    TIMESTAMP (NOT NULL)
├─ mes           STRING (formato: 'yyyy-MM')
├─ work_order_id (FK) UUID → work_orders.id (nullable)
├─ vin (FK)      STRING → vins.vin (nullable)
├─ tecnico       STRING (NOT NULL)
├─ tipo          ENUM: LEVE|MODERADA|CRITICA
├─ registrado_por STRING (NOT NULL, email)
├─ nota          TEXT
├─ foto_file_id  STRING (Google Drive file ID)
├─ foto_folder_id STRING (Google Drive folder ID)
└─ foto_batch_id STRING (agrupación de fotos)
```
📍 Origen: "INCIDENCIAS"

---

### 8. `app_config` - Configuración Global
```
key    STRING (PK)
└─ value STRING
```
**Valores iniciales**:
- `REV` → Versión/revision counter
- `REV_TS` → Timestamp última revisión

📍 Origen: Reemplaza Properties del Script

---

## 🔗 RELACIONES Y CONSTRAINTS

```
USUARIOS (1) ──→ (N) USUARIO_MODULOS
   │
   ├─→ (N) ASIGNACIONES
   │
   └─→ (N) EVENTOS

VINS (1) ──→ (N) WORK_ORDERS
   │
   └─→ (N) INCIDENCIAS

WORK_ORDERS (1) ──→ (N) ASIGNACIONES
   │              ├─ Constraint: 1 active per (work_order_id, rol_trabajo)
   │
   ├─→ (N) EVENTOS
   │
   └─→ (N) INCIDENCIAS
```

---

## 📐 ÍNDICES DE PERFORMANCE

| Tabla | Índice | Campos |
|-------|--------|--------|
| vins | idx_vins_cliente | cliente |
| usuarios | idx_usuarios_email | email |
| usuarios | idx_usuarios_activo | activo |
| work_orders | idx_wo_vin | vin |
| work_orders | idx_wo_tipo | tipo_ot |
| work_orders | idx_wo_estado | estado_general |
| work_orders | idx_wo_user | user_id |
| asignaciones | idx_asg_active | (work_order_id, rol_trabajo) WHERE activo |
| asignaciones | idx_asg_user | user_id |
| asignaciones | idx_asg_estado | estado_actual |
| asignaciones | idx_asg_updated | updated_at |
| eventos | idx_evt_wo | work_order_id |
| eventos | idx_evt_user | user_id |
| eventos | idx_evt_ts | timestamp DESC |
| incidencias | idx_inc_vin | vin |
| incidencias | idx_inc_wo | work_order_id |
| incidencias | idx_inc_mes | mes |
| incidencias | idx_inc_tipo | tipo |

---

## 🔄 MAPEO GOOGLE SHEETS → SUPABASE

| Hoja | Tabla | Tipo | Registros |
|------|-------|------|-----------|
| LISTA DE VIN GLP | vins | 1:1 | ~200 |
| USUARIOS | usuarios + usuario_modulos | 1:N | ~50 usuarios + ~300 modules |
| CONV121 | work_orders | 1:1 | ~150 |
| CALIDAD1 | work_orders | 1:1 | ~80 |
| RAMALERO1 | work_orders | 1:1 | ~100 |
| ASIGNACIONES | asignaciones | 1:1 | ~500 |
| MARCA_EVENTOS | eventos | 1:1 | ~1000+ |
| INCIDENCIAS | incidencias | 1:1 | ~200+ |

**Total**: ~2500+ registros

---

## ✅ ENUMS DISPONIBLES

| Enum | Valores |
|------|---------|
| `rol_usuario` | TECNICO, SUPERVISOR, ADMIN, CALIDAD, MOVILIZADOR, RAMALERO |
| `especialidad` | AMBOS, MOTOR, TANQUE |
| `modulo` | TECNICO, RAMALERO, CALIDAD, MOVILIZADOR, SUPERVISOR, ADMIN |
| `tipo_ot` | CONVERSION, CALIDAD, RAMALERO |
| `estado_general` | PENDIENTE, EN PROCESO, TRABAJANDO, FINALIZADO |
| `estado_actual` | SIN_INICIAR, TRABAJANDO, PAUSADO, FINALIZADO |
| `rol_trabajo` | MOTOR, TANQUE, CALIDAD, RAMALERO, MOVILIZADOR |
| `accion_evento` | INICIO, PAUSA, REANUDAR, FIN, NOTA |
| `severidad` | LEVE, MODERADA, CRITICA |
| `tipo_ramal` | JETOUR, VOLKSWAGEN, KYC V3, KYC V5, KYC V7, KYC X5 |

---

## 🚀 QUERIES COMUNES

### Obtener asignaciones activas de un usuario
```sql
SELECT a.*, w.vin, w.tipo_ot
FROM asignaciones a
JOIN work_orders w ON a.work_order_id = w.id
WHERE a.user_id = 'user-uuid' AND a.activo = true
ORDER BY a.updated_at DESC;
```

### Obtener estado de una conversión
```sql
SELECT 
  w.*,
  u.nombre as usuario,
  a.estado_actual,
  a.tiempo_trab_ms
FROM work_orders w
LEFT JOIN asignaciones a ON w.id = a.work_order_id
LEFT JOIN usuarios u ON a.user_id = u.id
WHERE w.tipo_ot = 'CONVERSION' AND w.vin = 'VIN-XXX'
ORDER BY a.rol_trabajo;
```

### Obtener incidencias de un mes
```sql
SELECT i.*, u.nombre as tecnico
FROM incidencias i
LEFT JOIN usuarios u ON i.tecnico = u.email
WHERE i.mes = '2026-03'
ORDER BY i.fecha_hora DESC;
```

### Historial de eventos por orden
```sql
SELECT e.*, u.nombre
FROM eventos e
JOIN usuarios u ON e.user_id = u.id
WHERE e.work_order_id = 'work-order-uuid'
ORDER BY e.timestamp ASC;
```

---

## 🔐 ROW LEVEL SECURITY (RLS)

**Todas las tablas tienen RLS habilitado** con política:
```sql
CREATE POLICY "service_full_access" 
  ON [tabla] 
  FOR ALL 
  USING (true) WITH CHECK (true);
```

✅ Esto permite acceso completo desde backend (Apps Script con service_role key)

---

## 📋 CHECKLIST DE MIGRACIONES

- [ ] Ejecutar schema.sql en Supabase
- [ ] Configurar SUPABASE_URL en Script Properties
- [ ] Configurar SUPABASE_KEY (service_role) en Script Properties
- [ ] Pegar MIGRATE.js en Apps Script
- [ ] Ejecutar `migrateAll()` desde Apps Script
- [ ] Verificar logs para registros migrados
- [ ] Validar integridad en Supabase
- [ ] Comenzar dual-write desde apps (nuevo + legacy)
- [ ] Validar datos en producción
- [ ] Migrar completamente a Supabase

---

**Resumen**: 8 tablas, ~15-20 campos por tabla, 25000+ posibles registros, totalmente normalizado desde Google Sheets
