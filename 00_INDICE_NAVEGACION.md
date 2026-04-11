# 📖 ÍNDICE DE NAVEGACIÓN - Documentación de Tablas GLP-UI

## 🎯 ¿Cuál documento debo leer?

### ⚡ **Tengo 30 segundos** → Lee esto
📄 [TABLAS_RESUMEN_EJECUTIVO.md](TABLAS_RESUMEN_EJECUTIVO.md)
- Resumen ultra-conciso
- 8 tablas principales
- Campos más importantes
- Enums principales

### 🚀 **Necesito consulta rápida**
📄 [TABLAS_REFERENCIA_RAPIDA.md](TABLAS_REFERENCIA_RAPIDA.md)
- Referencia visual
- Tablas con campos principales
- Relaciones y constraints
- Queries comunes
- Mejor para búsqueda rápida

### 🔍 **Necesito matriz completa con todos los campos**
📄 [TABLAS_MATRIZ_COMPLETA.md](TABLAS_MATRIZ_COMPLETA.md)
- Tabla maestra con TODOS los campos
- Origen de cada columna en Google Sheets
- Estadísticas de registros
- Validaciones
- Flujo típico de datos

### 📚 **Necesito documentación COMPLETA y detallada**
📄 [TABLAS_SCHEMAS_COMPLETO.md](TABLAS_SCHEMAS_COMPLETO.md)
- Documentación exhaustiva
- Migraciones paso a paso
- Diagramas ER completos
- Funciones de migración (MIGRATE.js)
- Normalizaciones y constraints
- Campos calculados vs stored
- 4000+ líneas de detalle

---

## 📋 CONTENIDO DE CADA DOCUMENTO

### 1. TABLAS_RESUMEN_EJECUTIVO.md
**Objetivo**: Comprensión rápida  
**Público**: Gerentes, PMs, personas sin contexto técnico  
**Tiempo de lectura**: 5 minutos

**Secciones**:
- Vista 30 segundos
- 8 tablas esenciales
- Tabla más importante (work_orders)
- Flujo de relaciones
- Campos por tabla (ultra-conciso)
- Enum summary
- Recordatorios clave
- Capacidad estimada

---

### 2. TABLAS_REFERENCIA_RAPIDA.md
**Objetivo**: Consulta rápida durante desarrollo  
**Público**: Desarrolladores, Data Analysts  
**Tiempo de lectura**: 10 minutos

**Secciones**:
- Todas las tablas con formato árbol
- Relaciones clave
- Índices de performance
- Mapeo Sheet→DB
- Queries comunes
- Enums disponibles
- Checklist de migraciones

---

### 3. TABLAS_MATRIZ_COMPLETA.md
**Objetivo**: Referencia técnica exhaustiva  
**Público**: Arquitectos, DBAs, Desarrolladores senior  
**Tiempo de lectura**: 20 minutos

**Secciones**:
- Tabla maestra (1 fila por campo)
- Origen en Google Sheets
- Tipos de datos exactos
- Notas especiales ("solo para X")
- Resumen estadístico
- Tipos enum por tabla
- Relaciones FK completas
- Campos especiales (búsqueda, timestamps, Drive)
- Tabla de validación
- Flujo típico de datos

---

### 4. TABLAS_SCHEMAS_COMPLETO.md
**Objetivo**: Documentación de referencia definitiva  
**Público**: Arquitectos, PMs técnicos, personas que necesitan TODO  
**Tiempo de lectura**: 45+ minutos

**Secciones**:
- Índice rápido (todos los documentos)
- 1️⃣ Hojas Google Sheets (actual)
  - Definición de 8 hojas
- 2️⃣ Tablas Supabase
  - Cada tabla: descripción completa, campos detallados, migraciones
  - vins (200 rows)
  - usuarios (50 rows)
  - usuario_modulos (300+)
  - work_orders (330+) ⭐
  - asignaciones (500+)
  - eventos (1000+)
  - incidencias (200+)
  - app_config (2)
- 3️⃣ Mapeo Sheet→DB
- 4️⃣ Migraciones paso a paso
  - migrateVins_()
  - migrateUsuarios_()
  - migrateWorkOrders_()
  - migrateAsignaciones_()
  - migrateEventos_()
  - migrateIncidencias_()
- 5️⃣ Enums completos
- 📐 Diagrama ER
- 🔄 Resumen migraciones
- 🛠️ Configuración requerida

---

## 🔍 BÚSQUEDA POR TEMA

### Si busco: **"¿Cuál es la tabla central?"**
→ Respuesta: **work_orders** (330+ rows)  
→ Lee: Ejecutivo, Rápida, Matriz

### Si busco: **"¿Cuáles son todas las columnas de X tabla?"**
→ Lee: **Matriz Completa** (tabla maestra)

### Si busco: **"¿Cómo se migran los datos?"**
→ Lee: **Schemas Completo** (sección 4️⃣)

### Si busco: **"¿Cuáles son los tipos enum disponibles?"**
→ Lee: **Referencia Rápida** u **Matriz Completa** (sección ✅)

### Si busco: **"¿Cómo se relacionan las tablas?"**
→ Lee: **Rápida** (sección 🔗), **Matriz** (sección 🔗), o **Schemas** (📐)

### Si busco: **"¿Qué queries puedo hacer?"**
→ Lee: **Rápida** (sección 🚀) o **Matriz** (sección 🎯)

### Si busco: **"¿Cuál es el flujo de datos?"**
→ Lee: **Matriz** (sección 🔄) o **Schemas** (migraciones detalladas)

### Si busco: **"¿Cuántos registros hay?"**
→ Lee: **Resumen Ejecutivo** (tablas y registros), **Referencia Rápida** (mapeo), **Matriz** (estadísticas)

---

## 📊 TABLA COMPARATIVA: DOCUMENTOS

| Criterio | Ejecutivo | Referencia | Matriz | Schemas |
|----------|-----------|-----------|--------|---------|
| **Tiempo de lectura** | 5 min | 10 min | 20 min | 45+ min |
| **Nivel técnico** | Alto | Medio-Alto | Alto | Máximo |
| **Mejor para** | Overview | Dev daily | Reference | Architecture |
| **¿Tiene Enums?** | ✅ | ✅ | ✅ | ✅ |
| **¿Tiene Queries?** | ✗ | ✅ | ✅ | ✗ |
| **¿Tiene Migraciones?** | ✗ | ✗ | ✗ | ✅ |
| **¿Tiene Diagrama ER?** | ✗ | ✗ | ✗ | ✅ |
| **¿Tiene Sheet origen?** | ✗ | ✗ | ✅ | ✅ |
| **¿Tiene RLS info?** | ✗ | ✗ | ✗ | ✅ |
| **Mejor impreso** | ✅ | ✅ | ✅ | ✗ |

---

## 🎓 RUTAS DE APRENDIZAJE

### Ruta 1: **Necesito entender el sistema RÁPIDO** (15 min)
1. Lee TABLAS_RESUMEN_EJECUTIVO.md (5 min)
2. Lee TABLAS_REFERENCIA_RAPIDA.md sección de relaciones (5 min)
3. Lee TABLAS_REFERENCIA_RAPIDA.md queries comunes (5 min)

### Ruta 2: **Soy developer y debo hacer queries** (20 min)
1. Lee TABLAS_REFERENCIA_RAPIDA.md (10 min)
2. Lee TABLAS_MATRIZ_COMPLETA.md tablas que necesito (10 min)
3. Copia queries de TABLAS_REFERENCIA_RAPIDA.md

### Ruta 3: **Soy architect y debo entender TODO** (60+ min)
1. Lee TABLAS_RESUMEN_EJECUTIVO.md (5 min)
2. Lee TABLAS_SCHEMAS_COMPLETO.md (45 min)
3. Lee TABLAS_MATRIZ_COMPLETA.md estadísticas (10 min)

### Ruta 4: **Debo implementar migraciones** (30 min)
1. Lee TABLAS_SCHEMAS_COMPLETO.md sección 4️⃣ (15 min)
2. Lee TABLAS_SCHEMAS_COMPLETO.md sección 🛠️ (5 min)
3. Revisa MIGRATE.js en gas/ (10 min)

---

## 📱 REFERENCIA POR CONTEXTO

### 📊 **En una reunión técnica**
- Abre: TABLAS_RESUMEN_EJECUTIVO.md
- Sección: Vista 30 segundos + Tabla más importante

### 💻 **Escribiendo código (SQL)**
- Abre: TABLAS_REFERENCIA_RAPIDA.md o TABLAS_MATRIZ_COMPLETA.md
- Sección: Queries comunes o Tabla maestra

### 🏗️ **Diseñando arquitectura**
- Abre: TABLAS_SCHEMAS_COMPLETO.md
- Sección: Diagrama ER + Migraciones

### ❓ **Resolviendo bug en DB**
- Abre: TABLAS_MATRIZ_COMPLETA.md
- Búsqueda: Nombre de tabla o field

### 📋 **Checklist pre-migración**
- Abre: TABLAS_REFERENCIA_RAPIDA.md
- Sección: 📋 CHECKLIST DE MIGRACIONES

---

## 🔑 INFORMACIÓN CRÍTICA (en todos los docs)

✅ **work_orders es la tabla central** (330+ rows)
✅ **8 tablas totales** (vins, usuarios, usuario_modulos, work_orders, asignaciones, eventos, incidencias, app_config)
✅ **10 tipos enum definidos** (rol_usuario, especialidad, modulo, tipo_ot, estado_general, estado_actual, rol_trabajo, accion_evento, severidad, tipo_ramal)
✅ **~2500+ registros esperados** (puede crecer a 25K+)
✅ **18 índices para performance**
✅ **RLS habilitado**, service_role tiene acceso total

⚠️ **Fotos NO se guardan en DB** (solo file_ids de Drive)
⚠️ **1 asignación activa por (work_order_id, rol_trabajo)**
⚠️ **RAMALERO NO tiene VIN** (tiene user_id + tipo_ramal)

---

## 📞 PREGUNTAS FRECUENTES

**P: ¿Dónde se guardan las fotos?**  
R: En Google Drive. DB solo guarda file_id. Ver: Schemas Completo → Tabla incidencias

**P: ¿Cómo se calcula el tiempo trabajado?**  
R: Campo `tiempo_trab_ms` en asignaciones se acumula. Ver: Referencia Rápida → asignaciones

**P: ¿Puedo tener 2 usuarios en la misma orden?**  
R: Sí, pero máximo 1 por rol (constraint único). Ver: Schemas Completo → Constraints

**P: ¿Qué es usuario_modulos?**  
R: Normalización de CSV "MODULOS" en users. 1 usuario → múltiples módulos. Ver: Referencia Rápida

**P: ¿Cuál es el flujo típico?**  
R: usuario INICIO → TRABAJANDO → PAUSA → REANUDAR → FIN. Ver: Matriz Completa → Flujo

---

## 🚀 ACCESO RÁPIDO

### Buscar una tabla
1. Abre TABLAS_MATRIZ_COMPLETA.md
2. Búsqueda (Ctrl+F): nombre de tabla
3. Ver sección: Tabla N°X - [NOMBRE]

### Buscar un campo
1. Abre TABLAS_REFERENCIA_RAPIDA.md o TABLAS_MATRIZ_COMPLETA.md
2. Búsqueda (Ctrl+F): nombre de field
3. Ver contexto: tabla + notas

### Buscar un enum
1. Abre TABLAS_REFERENCIA_RAPIDA.md
2. Scroll a: ✅ ENUMS DISPONIBLES
3. O buscar (Ctrl+F): nombre del enum

### Entender relaciones
1. Abre TABLAS_MATRIZ_COMPLETA.md
2. Scroll a: 🔗 RELACIONES CLAVE
3. O abre TABLAS_SCHEMAS_COMPLETO.md: 📐 Diagrama ER

---

## 📝 NOTAS

- **Generados**: Análisis automático de gas/*.js + supabase/schema.sql
- **Consistencia**: Los 4 documentos tienen información coherente, solo con diferente nivel de detalle
- **Actualización**: Si cambia schema.sql o migraciones, todos los docs deben actualizarse
- **Git**: Recomendado agregar a control de versiones para auditoría

---

**Última actualización**: Análisis completo GLP-UI (2026-03-09)  
**Próxima acción**: Ejecutar MIGRATE.js cuando estés listo para migrar a Supabase
