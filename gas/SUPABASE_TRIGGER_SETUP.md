# 📅 INSTALACIÓN: TRIGGER AUTOMÁTICO CADA 10 MINUTOS

## ¿Qué hace?
Cada 10 minutos, un script en Google ejecuta automáticamente (sin intervención):
1. Lee datos nuevos de Supabase
2. Los escribe en tu Google Sheet como respaldo histórico
3. NO interfiere con la app (corre en background)

---

## ⚙️ PASO 1: Configurar Script Properties

### Abre tu Google Sheet
1. Ve a tu Sheet
2. Haz clic en **Extensiones → Apps Script**
3. En la barra lateral izquierda, busca **⚙️ Configuración** (o Settings)
4. Abre la pestaña **Script Properties**

### Agrega estas claves:
| Clave | Valor | Dónde obtenerlo |
|-------|-------|-----------------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Dashboard Supabase → Settings → API |
| `SUPABASE_KEY` | `eyJhbGc...` (anon key) | Dashboard Supabase → Settings → API → anon_key |
| `SUPABASE_SERVICE_ROLE_KEY` | (opcional) | Si necesitas hacer UPDATE/DELETE |

---

## 🔧 PASO 2: Pegar el código del trigger

1. En Apps Script, haz clic en **+** para crear nuevo archivo
2. Selecciona "Archivo de script"
3. Nómbra lo como: `supabase-trigger`
4. Abre el archivo [supabase-trigger.js](supabase-trigger.js) de este repo
5. Copia TODO el contenido
6. Pega en tu Apps Script
7. Presiona Ctrl+S para guardar

---

## ⏰ PASO 3: Crear el Trigger Automático

### Opción A: Desde la interfaz (recomendado)
1. En Apps Script, abre el panel de triggers (ícono ⏰ a la izquierda)
2. Haz clic en **+ Create new trigger** o **Crear trigger**
3. Configura así:
   - **Función**: `syncFromSupabase`
   - **Tipo de evento**: `Trigger en tiempo`
   - **Intervalo de tiempo**: `cada 10 minutos`
   - **Hora**: déjalo vacío (ejecuta continuamente)
4. Haz clic en **Crear**
5. Autoriza cuando pida permisos

### Opción B: Manual (si no aparece el botón)
```javascript
// Pega esto UNA VEZ en la consola de Apps Script
function createTrigger() {
  ScriptApp.newTrigger("syncFromSupabase")
    .timeBased()
    .everyMinutes(10)
    .create();
  
  console.log("✅ Trigger creado: cada 10 minutos");
}
```
Luego ejecuta `createTrigger()` una única vez.

---

## ✅ PASO 4: Verifica que funciona

### Test manual (en Apps Script):
1. En la función dropdown (arriba), selecciona `testSync`
2. Presiona ▶️ Play
3. Mira los Logs (Ctrl+Enter)
4. Si ves "✅ Sincronización completada", ¡funciona!

### Verifica la configuración:
```javascript
verifyConfig()  // ejecuta en la consola
```

---

## 📊 Qué se sincroniza automáticamente

| Tabla Supabase | Google Sheet | Frecuencia |
|---|---|---|
| `incidencias` | INCIDENCIAS | c/10 min |
| `eventos` | MARCA_EVENTOS | c/10 min |
| `conformidades` | CALIDAD1 | c/10 min |
| `work_orders` | LISTADO_TRABAJO | c/10 min |

---

## 🐛 Troubleshooting

### "❌ Falta SUPABASE_URL en Script Properties"
→ Revisa que hayas guardado las claves en Project Settings

### "Supabase 401"
→ La ANON_KEY está mal o expiró. Obtén una nueva en Dashboard Supabase

### "Sheet no existe"
→ El script intenta crear la sheet automáticamente. Si no funciona, créala manualmente con ese nombre.

### El trigger no corre nunca
→ Verifica que esté en la lista de triggers (⏰ icon)
→ Intenta crear trigger manualmente en la interfaz

---

## 🚀 Ya está instalado

Una vez completado:
- ✅ Tu App escribe solo en Supabase (rápido <100ms)
- ✅ AppScript respaldo automático cada 10 min (background)
- ✅ Google Sheets siempre actualizado como backup
- ✅ Sin dependencias, sin complejidad

¡Listo, la arquitectura está optimizada para velocidad! 🎯
