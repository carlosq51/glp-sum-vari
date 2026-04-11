# 📋 LISTA SIMPLE: TODAS LAS TABLAS Y CAMPOS

## TABLA 1: vins
**Origen**: LISTA DE VIN GLP | **Registros**: ~200

```
vin                TEXT PK
modelo             TEXT
dua                TEXT
cliente            TEXT
reductor_asignado  TEXT
tanque_asignado    TEXT
created_at         TIMESTAMP
```

---

## TABLA 2: usuarios
**Origen**: USUARIOS | **Registros**: ~50

```
id                 UUID PK
email              TEXT UNIQUE
nombre             TEXT
rol                ENUM: TECNICO|SUPERVISOR|ADMIN|CALIDAD|MOVILIZADOR|RAMALERO
especialidad       ENUM: AMBOS|MOTOR|TANQUE
activo             BOOLEAN
created_at         TIMESTAMP
```

---

## TABLA 3: usuario_modulos
**Origen**: USUARIOS (MODULOS column) | **Registros**: ~300+

```
user_id            UUID FK → usuarios.id
modulo             ENUM: TECNICO|RAMALERO|CALIDAD|MOVILIZADOR|SUPERVISOR|ADMIN
PK: (user_id, modulo)
```

---

## TABLA 4: work_orders ⭐ CENTRAL
**Origen**: CONV121 + CALIDAD1 + RAMALERO1 | **Registros**: ~330+

```
id                      UUID PK
tipo_ot                 ENUM: CONVERSION|CALIDAD|RAMALERO
vin                     TEXT FK → vins.vin (NULL si RAMALERO)
user_id                 UUID FK → usuarios.id (solo RAMALERO)
tipo_ramal              ENUM: JETOUR|VOLKSWAGEN|KYC_V3|KYC_V5|KYC_V7|KYC_X5
fecha_creacion          TIMESTAMP
estado_general          ENUM: PENDIENTE|EN_PROCESO|TRABAJANDO|FINALIZADO
observaciones           TEXT
tanque_registrado       TEXT
reductor_registrado     TEXT
conf_ck1                BOOLEAN (solo CONVERSION)
conf_ck2                BOOLEAN (solo CONVERSION)
conf_ck3                BOOLEAN (solo CONVERSION)
conf_ck4                BOOLEAN (solo CONVERSION)
conf_ts                 TIMESTAMP (solo CONVERSION)
conf_by                 TEXT (solo CONVERSION)
created_at              TIMESTAMP
```

**Constraints**:
- CHK_CONV_HAS_VIN: CONVERSION requiere VIN
- CHK_CALIDAD_HAS_VIN: CALIDAD requiere VIN
- CHK_RAMALERO_HAS_TIPO: RAMALERO requiere tipo_ramal

---

## TABLA 5: asignaciones
**Origen**: ASIGNACIONES | **Registros**: ~500+

```
id                  UUID PK
work_order_id       UUID FK → work_orders.id
user_id             UUID FK → usuarios.id
tipo_ot             ENUM: CONVERSION|CALIDAD|RAMALERO
rol_trabajo         ENUM: MOTOR|TANQUE|CALIDAD|RAMALERO|MOVILIZADOR
activo              BOOLEAN
fecha_asignacion    TIMESTAMP
tiempo_trab_ms      BIGINT
estado_actual       ENUM: SIN_INICIAR|TRABAJANDO|PAUSADO|FINALIZADO
updated_at          TIMESTAMP
running_since       TIMESTAMP
last_nota           TEXT
last_nota_ts        TIMESTAMP
```

**Constraint único**: (work_order_id, rol_trabajo) WHERE activo = true

---

## TABLA 6: eventos
**Origen**: MARCA_EVENTOS | **Registros**: ~1000+

```
id              UUID PK
timestamp       TIMESTAMP NOT NULL
user_id         UUID FK → usuarios.id
work_order_id   UUID FK → work_orders.id
tipo_ot         ENUM: CONVERSION|CALIDAD|RAMALERO
rol_trabajo     ENUM: MOTOR|TANQUE|CALIDAD|RAMALERO|MOVILIZADOR
accion          ENUM: INICIO|PAUSA|REANUDAR|FIN|NOTA
nota            TEXT
```

---

## TABLA 7: incidencias
**Origen**: INCIDENCIAS | **Registros**: ~200+

```
id              UUID PK
fecha_hora      TIMESTAMP NOT NULL
mes             TEXT NOT NULL (formato: yyyy-MM)
work_order_id   UUID FK → work_orders.id (nullable)
vin             TEXT FK → vins.vin (nullable)
tecnico         TEXT NOT NULL
tipo            ENUM: LEVE|MODERADA|CRITICA
registrado_por  TEXT NOT NULL
nota            TEXT
foto_file_id    TEXT (Google Drive)
foto_folder_id  TEXT (Google Drive)
foto_batch_id   TEXT (Google Drive)
```

**Campos NO migrados** (se calculan en app):
- FOTO_URL
- FOTO_THUMB_URL
- FOTO_IMG_URL

---

## TABLA 8: app_config
**Tipo**: Singleton | **Registros**: 2

```
key    TEXT PK
value  TEXT
```

**Valores iniciales**:
- REV = '0'
- REV_TS = '0'

---

## RESUMEN RÁPIDO

```
TOTAL:  8 tablas
        67 campos
        11 FKs
        18 índices
        10 enums
        ~2500+ registros
```

---

## ENUMS

```
rol_usuario:       TECNICO | SUPERVISOR | ADMIN | CALIDAD | MOVILIZADOR | RAMALERO
especialidad:      AMBOS | MOTOR | TANQUE
modulo:            TECNICO | RAMALERO | CALIDAD | MOVILIZADOR | SUPERVISOR | ADMIN
tipo_ot:           CONVERSION | CALIDAD | RAMALERO
estado_general:    PENDIENTE | EN PROCESO | TRABAJANDO | FINALIZADO
estado_actual:     SIN_INICIAR | TRABAJANDO | PAUSADO | FINALIZADO
rol_trabajo:       MOTOR | TANQUE | CALIDAD | RAMALERO | MOVILIZADOR
accion_evento:     INICIO | PAUSA | REANUDAR | FIN | NOTA
severidad:         LEVE | MODERADA | CRITICA
tipo_ramal:        JETOUR | VOLKSWAGEN | KYC V3 | KYC V5 | KYC V7 | KYC X5
```

---

## ÍNDICES (18 total)

```
vins
  idx_vins_cliente (cliente)

usuarios
  idx_usuarios_email (email)
  idx_usuarios_activo (activo) WHERE activo = true

usuario_modulos
  (ninguno especial)

work_orders
  idx_wo_vin (vin)
  idx_wo_tipo (tipo_ot)
  idx_wo_estado (estado_general)
  idx_wo_user (user_id)

asignaciones
  idx_asg_active (work_order_id, rol_trabajo) WHERE activo = true
  idx_asg_user (user_id)
  idx_asg_estado (estado_actual)
  idx_asg_updated (updated_at)

eventos
  idx_evt_wo (work_order_id)
  idx_evt_user (user_id)
  idx_evt_ts (timestamp DESC)

incidencias
  idx_inc_vin (vin)
  idx_inc_wo (work_order_id)
  idx_inc_mes (mes)
  idx_inc_tipo (tipo)
```

---

## RELACIONES FK (11 total)

```
usuario_modulos.user_id     → usuarios.id
asignaciones.work_order_id  → work_orders.id
asignaciones.user_id        → usuarios.id
eventos.user_id             → usuarios.id
eventos.work_order_id       → work_orders.id
work_orders.vin             → vins.vin
work_orders.user_id         → usuarios.id
incidencias.work_order_id   → work_orders.id
incidencias.vin             → vins.vin
```

---

## CAMPOS POR TIPO

### UUIDs (Primary Keys)
- usuarios.id
- usuario_modulos.user_id (PK comp)
- work_orders.id
- asignaciones.id
- eventos.id
- incidencias.id

### KEYs (Primary Key simple)
- vins.vin (TEXT)
- app_config.key (TEXT)

### FKs (Foreign Keys)
- usuario_modulos.user_id
- work_orders.vin
- work_orders.user_id
- asignaciones.work_order_id
- asignaciones.user_id
- eventos.user_id
- eventos.work_order_id
- incidencias.work_order_id
- incidencias.vin

### TIMESTAMPs (Auditoría)
- vins.created_at
- usuarios.created_at
- work_orders.fecha_creacion
- work_orders.created_at
- asignaciones.fecha_asignacion
- asignaciones.updated_at
- asignaciones.running_since
- asignaciones.last_nota_ts
- eventos.timestamp
- incidencias.fecha_hora

### ENUMs
- usuarios.rol
- usuarios.especialidad
- usuario_modulos.modulo
- work_orders.tipo_ot
- work_orders.estado_general
- work_orders.tipo_ramal
- asignaciones.tipo_ot
- asignaciones.rol_trabajo
- asignaciones.estado_actual
- eventos.tipo_ot
- eventos.rol_trabajo
- eventos.accion
- incidencias.tipo

### BOOLEANs
- usuarios.activo
- work_orders.conf_ck1
- work_orders.conf_ck2
- work_orders.conf_ck3
- work_orders.conf_ck4
- asignaciones.activo

### TEXT (descripción/notas)
- vins.modelo, dua, cliente, reductor_asignado, tanque_asignado
- usuarios.email, nombre
- work_orders.observaciones, tanque_registrado, reductor_registrado, conf_by
- asignaciones.last_nota
- eventos.nota
- incidencias.tecnico, registrado_por, nota, foto_file_id, foto_folder_id, foto_batch_id
- app_config.value

### BIGINTs (grandes números)
- asignaciones.tiempo_trab_ms

---

## MAPEO SHEET → TABLA

```
LISTA DE VIN GLP           →  vins (200)
USUARIOS                   →  usuarios (50) + usuario_modulos (300+)
CONV121                    →  work_orders tipo CONVERSION (150)
CALIDAD1                   →  work_orders tipo CALIDAD (80)
RAMALERO1                  →  work_orders tipo RAMALERO (100)
ASIGNACIONES               →  asignaciones (500+)
MARCA_EVENTOS              →  eventos (1000+)
INCIDENCIAS                →  incidencias (200+)
```

---

## DATOS ESPERADOS

```
vins:               200
usuarios:           50
usuario_modulos:    300+
work_orders:        330+
  ├─ CONVERSION:    150
  ├─ CALIDAD:       80
  └─ RAMALERO:      100
asignaciones:       500+
eventos:            1000+
incidencias:        200+
app_config:         2
────────────────────────
TOTAL:              ~2500+
```

---

## INFORMACIÓN CRÍTICA

✅ **work_orders.tipo_ot** discrimina entre CONVERSION, CALIDAD, RAMALERO
✅ **asignaciones** es donde se trackea el tiempo de trabajo
✅ **eventos** es append-only (historial inmutable)
✅ **incidencias** no requiere work_order_id (puede ser standalone)
✅ **Fotos** se guardan en Google Drive, solo file_id en DB
✅ **RLS habilitado** en todas con service_full_access policy

⚠️ Solo 1 asignación activa por (work_order_id, rol_trabajo)
⚠️ RAMALERO NO tiene VIN
⚠️ RAMALERO tiene user_id + tipo_ramal

---

**LISTA CREADA**: Análisis de gas/* + supabase/schema.sql
**TOTAL**: 8 tablas, 67 campos, 11 FKs, 18 índices, 10 enums
