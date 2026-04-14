# 🚀 NUEVA ARQUITECTURA: Supabase Only + Backup AppScript

## Cambios Principales

### 1️⃣ LECTURA/ESCRITURA → Supabase (Respuestas <100ms)
- ✅ Todos los POST van a Supabase
- ✅ Todos los GET vienen de Supabase
- ✅ Sin dual write, sin AppScript en flujos principales

### 2️⃣ RESPALDO AUTOMÁTICO → AppScript Trigger (cada 10 min)
- Apps Script ejecuta trigger que:
  - Lee datos de Supabase REST API
  - Escribe en Google Sheets como backup histórico
  - Se ejecuta en background, no interfiere con app

### 3️⃣ BENEFICIOS
- **API más rápida**: Latencia <100ms (vs 2-5s antes)
- **Menos carga**: Server no hace dual write
- **Redundancia**: Google Sheets es backup auténtico
- **Sin complejidad**: Código más limpio sin fallbacks

---

## Tablas que se sincronizarán automáticamente

- `incidencias` → Sheet "INCIDENCIAS"
- `eventos` → Sheet "MARCA_EVENTOS"
- `conformidades` → Sheet "CALIDAD1"
- `work_orders` → Sheet "LISTADO_TRABAJO"

---

## Flujo de Datos

```
FRONTEND
   ↓
[POST /api/incidencia]
   └→ Supabase (respuesta en <100ms) ✅
      ↓
[APP SCRIPT TRIGGER cada 10 min] (background)
   └→ Lee de Supabase
   └→ Escribe en Google Sheets
```

Sin AppScript en la ruta crítica = MÁS RÁPIDO
