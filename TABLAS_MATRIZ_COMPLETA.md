# 📋 TABLA MAESTRA: Todas las Tablas y Campos de Un Vistazo

## 1️⃣ VINS (Vehículos)
| Campo | Tipo | Origen Sheet | Notas |
|-------|------|--------------|-------|
| **vin** | TEXT (PK) | VIN | Normalizado a mayúsculas |
| modelo | TEXT | MODELO | |
| dua | TEXT | DUA | Documento de autorización |
| cliente | TEXT | CLIENTE | |
| reductor_asignado | TEXT | REDU_AUTO / REDUCTOR | Alias flexible |
| tanque_asignado | TEXT | TANQ_AUTO / TANQUE | Alias flexible |
| created_at | TIMESTAMP | | Auto |

**Origen**: LISTA DE VIN GLP | **Registros**: ~200 | **Índices**: cliente

---

## 2️⃣ USUARIOS (Usuarios del Sistema)
| Campo | Tipo | Origen Sheet | Notas |
|-------|------|--------------|-------|
| **id** | UUID (PK) | UUID / ID_USUARIO / CODIGO | Si no es UUID, se genera |
| **email** | TEXT (UNIQUE) | EMAIL / CORREO / MAIL | Alias flexible |
| nombre | TEXT | NOMBRE | |
| rol | ENUM | ROL | TECNICO / SUPERVISOR / ADMIN / CALIDAD / MOVILIZADOR / RAMALERO |
| especialidad | ENUM | ESPECIALIDAD | AMBOS / MOTOR / TANQUE (default AMBOS) |
| activo | BOOLEAN | ACTIVO | Default true |
| created_at | TIMESTAMP | | Auto |

**Origen**: USUARIOS | **Registros**: ~50 | **Índices**: email, activo

---

## 3️⃣ USUARIO_MODULOS (Módulos por Usuario)
| Campo | Tipo | Origen Sheet | Notas |
|-------|------|--------------|-------|
| **user_id** | UUID (FK) | — | Referencias usuarios.id |
| **modulo** | ENUM | MODULOS (CSV) | TECNICO / RAMALERO / CALIDAD / MOVILIZADOR / SUPERVISOR / ADMIN |

**Origen**: USUARIOS (columna MODULOS normalizada) | **Tipo**: Muchos-a-muchos | **Registros**: ~300+

---

## 4️⃣ WORK_ORDERS (Órdenes de Trabajo Unificadas)
| Campo | Tipo | Origen Sheet | Notas | Solo Para |
|-------|------|--------------|-------|-----------|
| **id** | UUID (PK) | CONVERSION_ID / CALIDAD_ID / RAMAL_ID | | |
| **tipo_ot** | ENUM | tipo_ot | CONVERSION / CALIDAD / RAMALERO | |
| vin | TEXT (FK) | CHASIS_ID | Referencias vins.vin | CONVERSION, CALIDAD |
| user_id | UUID (FK) | USER_ID + EMAIL | Lookup en usuarios | RAMALERO |
| tipo_ramal | ENUM | TIPO_RAMAL | JETOUR / VOLKSWAGEN / KYC V3/V5/V7/X5 | RAMALERO |
| fecha_creacion | TIMESTAMP | FECHA_CREACION | | |
| estado_general | ENUM | ESTADO_GENERAL | PENDIENTE / EN_PROCESO / TRABAJANDO / FINALIZADO | |
| observaciones | TEXT | OBSERVACIONES | | |
| tanque_registrado | TEXT | TANQUE_REGISTRADO | Serial | CONVERSION, CALIDAD |
| reductor_registrado | TEXT | REDUCTOR_REGISTRADO | Serial | CONVERSION, CALIDAD |
| conf_ck1 | BOOLEAN | CONF_CK1 | Checklist 1 | CONVERSION |
| conf_ck2 | BOOLEAN | CONF_CK2 | Checklist 2 | CONVERSION |
| conf_ck3 | BOOLEAN | CONF_CK3 | Checklist 3 | CONVERSION |
| conf_ck4 | BOOLEAN | CONF_CK4 | Checklist 4 | CONVERSION |
| conf_ts | TIMESTAMP | CONF_TS | Timestamp de conformidad | CONVERSION |
| conf_by | TEXT | CONF_BY | Email |CONVERSION |
| created_at | TIMESTAMP | | Auto | |

**Origen**: 3 Sheets (CONV121 + CALIDAD1 + RAMALERO1) | **Registros**: ~330+ | **Índices**: vin, tipo, estado, user_id

---

## 5️⃣ ASIGNACIONES (Asignación Usuario → Orden)
| Campo | Tipo | Origen Sheet | Notas |
|-------|------|--------------|-------|
| **id** | UUID (PK) | ASIGNACION_ID | Puede auto-generar si vacío |
| **work_order_id** | UUID (FK) | CONVERSION_ID | Referencias work_orders.id |
| **user_id** | UUID (FK) | USER_ID + EMAIL | Referencias usuarios.id |
| tipo_ot | ENUM | TIPO_OT | CONVERSION / CALIDAD / RAMALERO |
| rol_trabajo | ENUM | ROL_TRABAJO | MOTOR / TANQUE / CALIDAD / RAMALERO / MOVILIZADOR |
| activo | BOOLEAN | ACTIVO | Default true |
| fecha_asignacion | TIMESTAMP | FECHA_ASIGNACION | |
| tiempo_trab_ms | BIGINT | TIEMPO_TRAB_MS | Milisegundos trabajados |
| estado_actual | ENUM | ESTADO_ACTUAL | SIN_INICIAR / TRABAJANDO / PAUSADO / FINALIZADO |
| updated_at | TIMESTAMP | UPDATED_AT | |
| running_since | TIMESTAMP | RUNNING_SINCE | Desde cuándo en TRABAJANDO |
| last_nota | TEXT | LAST_NOTA | Última nota |
| last_nota_ts | TIMESTAMP | LAST_NOTA_TS | Timestamp de última nota |

**Origen**: ASIGNACIONES | **Registros**: ~500+ | **Índices**: user_id, estado_actual, updated_at | **Constraint**: 1 activa por (work_order_id, rol_trabajo)

---

## 6️⃣ EVENTOS (Log de Eventos)
| Campo | Tipo | Origen Sheet | Notas |
|-------|------|--------------|-------|
| **id** | UUID (PK) | EVENTO_ID | |
| **timestamp** | TIMESTAMP | TIMESTAMP | NOT NULL |
| **user_id** | UUID (FK) | USER_ID + EMAIL | Referencias usuarios.id |
| **work_order_id** | UUID (FK) | CONVERSION_ID | Referencias work_orders.id |
| tipo_ot | ENUM | TIPO_OT | CONVERSION / CALIDAD / RAMALERO |
| rol_trabajo | ENUM | ROL_TRABAJO | MOTOR / TANQUE / CALIDAD / RAMALERO / MOVILIZADOR |
| accion | ENUM | ACCION | INICIO / PAUSA / REANUDAR / FIN / NOTA |
| nota | TEXT | NOTA | |

**Origen**: MARCA_EVENTOS | **Registros**: ~1000+ | **Índices**: work_order_id, user_id, timestamp DESC

---

## 7️⃣ INCIDENCIAS (Reportes de Anomalías)
| Campo | Tipo | Origen Sheet | Notas |
|-------|------|--------------|-------|
| **id** | UUID (PK) | | Auto-generado |
| **fecha_hora** | TIMESTAMP | FECHA_HORA | NOT NULL |
| **mes** | TEXT | MES | Formato 'yyyy-MM', NOT NULL |
| work_order_id | UUID (FK) | CONVERSION_ID | Nullable, referencias work_orders.id |
| vin | TEXT (FK) | VIN | Nullable, referencias vins.vin |
| **tecnico** | TEXT | TECNICO | NOT NULL |
| **tipo** | ENUM | TIPO | LEVE / MODERADA / CRITICA, NOT NULL |
| **registrado_por** | TEXT | REGISTRADO_POR | NOT NULL, usualmente email |
| nota | TEXT | NOTA | Descripción del problema |
| foto_file_id | TEXT | FOTO_FILE_ID | Google Drive file ID |
| foto_folder_id | TEXT | FOTO_FOLDER_ID | Google Drive folder ID |
| foto_batch_id | TEXT | FOTO_BATCH_ID | Agrupación de fotos |

⚠️ **NO MIGRADOS**: FOTO_URL, FOTO_THUMB_URL, FOTO_IMG_URL (se calculan en app desde file_id)

**Origen**: INCIDENCIAS | **Registros**: ~200+ | **Índices**: vin, work_order_id, mes, tipo

---

## 8️⃣ APP_CONFIG (Configuración Global)
| Campo | Tipo | Notas |
|-------|------|-------|
| **key** | TEXT (PK) | Nombre de configuración |
| value | TEXT | Valor |

**Valores iniciales**:
- `REV` = '0'
- `REV_TS` = '0'

**Origen**: Reemplaza Script Properties | **Registros**: ~2

---

## 🔢 RESUMEN ESTADÍSTICO

| Tabla | Registros Esperados | Columnas | PKs | FKs | Índices |
|-------|---------------------|---------|-----|-----|---------|
| vins | ~200 | 7 | 1 | 0 | 1 |
| usuarios | ~50 | 7 | 1 | 0 | 2 |
| usuario_modulos | ~300+ | 2 | 2 (compuesto) | 1 | 0 |
| work_orders | ~330+ | 16 | 1 | 2 | 4 |
| asignaciones | ~500+ | 13 | 1 | 2 | 4 |
| eventos | ~1000+ | 8 | 1 | 2 | 3 |
| incidencias | ~200+ | 12 | 1 | 2 | 4 |
| app_config | ~2 | 2 | 1 | 0 | 0 |
| **TOTAL** | **~2500+** | **~67** | **~9** | **~11** | **~18** |

---

## 📜 TIPOS ENUM POR TABLA

```
USUARIOS.rol                  TECNICO | SUPERVISOR | ADMIN | CALIDAD | MOVILIZADOR | RAMALERO
USUARIOS.especialidad        AMBOS | MOTOR | TANQUE

USUARIO_MODULOS.modulo       TECNICO | RAMALERO | CALIDAD | MOVILIZADOR | SUPERVISOR | ADMIN

WORK_ORDERS.tipo_ot          CONVERSION | CALIDAD | RAMALERO
WORK_ORDERS.estado_general   PENDIENTE | EN PROCESO | TRABAJANDO | FINALIZADO
WORK_ORDERS.tipo_ramal       JETOUR | VOLKSWAGEN | KYC V3 | KYC V5 | KYC V7 | KYC X5

ASIGNACIONES.tipo_ot         CONVERSION | CALIDAD | RAMALERO
ASIGNACIONES.rol_trabajo     MOTOR | TANQUE | CALIDAD | RAMALERO | MOVILIZADOR
ASIGNACIONES.estado_actual   SIN_INICIAR | TRABAJANDO | PAUSADO | FINALIZADO

EVENTOS.tipo_ot              CONVERSION | CALIDAD | RAMALERO
EVENTOS.rol_trabajo          MOTOR | TANQUE | CALIDAD | RAMALERO | MOVILIZADOR
EVENTOS.accion               INICIO | PAUSA | REANUDAR | FIN | NOTA

INCIDENCIAS.tipo             LEVE | MODERADA | CRITICA
```

---

## 🔗 RELACIONES CLAVE

```
USUARIOS (1) ─→ (N) USUARIO_MODULOS ─→ (1) MODULO
USUARIOS (1) ─→ (N) ASIGNACIONES ─→ (1) WORK_ORDERS
USUARIOS (1) ─→ (N) EVENTOS ─→ (1) WORK_ORDERS

VINS (1) ─→ (N) WORK_ORDERS
VINS (1) ─→ (N) INCIDENCIAS

WORK_ORDERS (1) ─→ (N) ASIGNACIONES (Constraint: 1 activa por rol)
WORK_ORDERS (1) ─→ (N) EVENTOS
WORK_ORDERS (1) ─→ (N) INCIDENCIAS
```

---

## ✨ CAMPOS ESPECIALES POR TABLA

### Búsqueda / Full-Text
- `vins.cliente` - Búsqueda de clientes
- `usuarios.email`, `usuarios.nombre` - Búsqueda de usuarios
- `incidencias.tecnico`, `incidencias.nota` - Búsqueda de incidencias

### Timestamps (para auditoría/histórico)
- `vins.created_at`
- `usuarios.created_at`
- `work_orders.fecha_creacion`, `created_at`
- `asignaciones.fecha_asignacion`, `updated_at`, `running_since`, `last_nota_ts`
- `eventos.timestamp`
- `incidencias.fecha_hora`

### Identificadores Internos (Google Drive)
- `incidencias.foto_file_id`
- `incidencias.foto_folder_id`
- `incidencias.foto_batch_id`

### Seriales de Equipos
- `work_orders.tanque_registrado` - Serial del tanque
- `work_orders.reductor_registrado` - Serial del reductor
- `vins.tanque_asignado` - Serial asignado
- `vins.reductor_asignado` - Serial asignado

---

## 🎯 TABLA DE VALIDACIÓN DURANTE MIGRACIÓN

| Entidad | Validaciones | Campo Crítico | Acción si Falla |
|---------|--------------|---------------|-----------------|
| vins | - | vin | Descarta fila |
| usuarios | Email único | email | Descarta fila |
| work_orders | - | id | Descarta fila |
| asignaciones | FK work_order_id, FK user_id | work_order_id, user_id | Descarta con log |
| eventos | FK work_order_id, FK user_id | work_order_id, user_id | Descarta con log |
| incidencias | Requiere mes, tecnico | mes, tecnico | Descarta fila |

---

## 🔄 FLUJO TÍPICO DE DATOS

```
1. Usuario TECNICO inicia tarea
   → INSERT eventos (accion=INICIO)
   → UPDATE asignaciones (estado_actual=TRABAJANDO, running_since=now())

2. Usuario pausa trabajo
   → INSERT eventos (accion=PAUSA)
   → UPDATE asignaciones (estado_actual=PAUSADO)
   → Calcula tiempo_trab_ms

3. Usuario reanuda
   → INSERT eventos (accion=REANUDAR)
   → UPDATE asignaciones (estado_actual=TRABAJANDO, running_since=now())

4. Usuario finaliza
   → INSERT eventos (accion=FIN)
   → UPDATE asignaciones (estado_actual=FINALIZADO, activo=false)
   → Calcula tiempo_trab_ms total
   → UPDATE work_orders (estado_general=FINALIZADO) si todos los roles finalizados

5. Si hay anomalía
   → INSERT incidencias (tipo=LEVE|MODERADA|CRITICA)
   → Puede adjuntar foto (file_id from Google Drive)

6. Conformidad (solo CONVERSION)
   → UPDATE work_orders (conf_ck1-4=true, conf_ts=now(), conf_by=email)
```

---

**Total de información**: 8 tablas, 67 columnas, 11 relaciones FK, 18 índices, 10 tipos enum, ~2500+ registros esperados

Documento auto-generado desde análisis de ficheros GAS y schema.sql
