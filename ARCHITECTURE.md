# Arquitectura y Lógica — glp-ui

> Estado actual del proyecto. Última revisión: 2026-07-08.
> Este documento describe lo que ES, no lo que debería ser.

---

## 1. Visión General

PWA para gestión de conversiones GLP. Los técnicos (MOTOR / TANQUE) registran eventos de trabajo, el ramalero gestiona solicitudes de ramales, y los supervisores ven reportes en tiempo real.

**Stack:**

| Capa | Tecnología |
|---|---|
| Frontend | Vanilla JS ES Modules + Vite 6 |
| Backend | Node.js + Express 5 |
| Base de datos | Supabase (PostgreSQL vía REST API — sin SDK) |
| Almacenamiento fotos | Cloudflare R2 (compatible S3) |
| Reportes legacy | Google Apps Script + Google Sheets |
| PWA / SW | Vite Plugin PWA + Workbox (`injectManifest`) |
| Push notifications | Web Push API (VAPID) |
| Gráficos | Chart.js 4 |
| QR | `qrcode` npm + `html5-qrcode` |

---

## 2. Estructura de Carpetas

```
glp-ui/
├── index.js                  ← Bootstrap del servidor (~90 LOC)
├── r2-uploads.js             ← Helpers Cloudflare R2
├── lib/
│   ├── supabase.js           ← Helpers Supabase (CRUD + cache)
│   ├── timing.js             ← measureTime_, addServerTiming_
│   ├── utils.js              ← isValidOT_, normalizeModelo_
│   └── ml-state.js           ← pendingSuggestions_ (Map compartido ML↔trabajo)
├── routes/
│   ├── uploader.js           ← /api/uploader/*
│   ├── push.js               ← /api/push/*
│   ├── ramal.js              ← /api/solicitud-ramal/*
│   ├── incidencias.js        ← /api/incidencia, /api/incidencias/*
│   ├── supervisor.js         ← /api/supervisor/*
│   ├── ots.js                ← /api/ots/*, /api/admin/tabla/*
│   ├── trabajo.js            ← /api/me, /api/evento, /api/sync, …
│   ├── admin.js              ← /api/admin/*
│   ├── movilizador.js        ← /api/movilizador/*, /api/vin-validar
│   ├── tecnico.js            ← /api/tecnico/*
│   ├── ml.js                 ← /api/ml/*, /api/omisiones
│   ├── vins.js               ← /api/vin-suggest, /api/vins-sin-modelo
│   └── zonas.js              ← /api/zonas/*
├── vite.config.js            ← Build + PWA config
├── package.json
├── .env                      ← Variables locales (no va a producción)
│
├── public/
│   ├── app.js                ← Bootstrap del frontend (punto de entrada)
│   ├── sw-custom.js          ← Fuente del Service Worker (Vite lo procesa)
│   ├── index.html
│   │
│   ├── js/
│   │   ├── core/             ← Utilidades compartidas (barrel: core.js)
│   │   ├── work/             ← Lógica de trabajo cross-módulo (barrel: index.js)
│   │   ├── views/            ← Lógica por módulo de usuario
│   │   │   ├── conversion/   ← Técnicos MOTOR/TANQUE + CALIDAD (módulo más grande)
│   │   │   ├── ramalero/     ← Vista y acciones del ramalero
│   │   │   ├── supervisor/   ← Dashboard y reportes
│   │   │   ├── admin/        ← Configuración global
│   │   │   ├── movilizador/  ← Vista movilizador
│   │   │   ├── uploader/     ← Upload de fotos
│   │   │   └── zonas/        ← Mapa de zonas
│   │   └── templates/        ← Funciones puras que retornan HTML string
│   │       ├── layout/       ← Shell, topbar, loading overlay
│   │       ├── views/        ← HTML de cada módulo
│   │       └── modals/       ← HTML de modales
│   │
│   └── css/
│       ├── 00-token.css      ← Design tokens + temas (fuente de verdad)
│       ├── 01-base.css
│       ├── 02-layout.css
│       ├── components/       ← Botones, inputs, badges, cards…
│       ├── overlays/         ← Modales, loading, alerts
│       └── views/            ← CSS específico por módulo
│
├── gas/                      ← Google Apps Script (corre en Google Cloud)
│   ├── 00_config_core.js
│   ├── REPORTE_PRINCIPAL_obtencion_vin.js
│   ├── Codigo_ASIGNACIONES_COMPLETO.js
│   ├── REP_DASHBOARD.js
│   └── … 10 archivos más
│
└── dist/                     ← Output del build (vite build) — lo sirve Express
```

---

## 3. Backend

### 3.1 Arranque (`index.js`)

```
import routes/* + lib/*
  ↓
dotenv.config()
  ↓
webpush.setVapidDetails(...)   ← solo si las 3 vars VAPID están presentes
  ↓
express.static("dist")         ← sirve el frontend compilado
  ↓
app.use(router) × 12
  ↓
app.listen(PORT) → scheduleAutoRetrain_() + scheduleAutoNormalize_()
```

### 3.2 Helpers compartidos (`lib/`)

| Módulo | Exporta |
|---|---|
| `lib/supabase.js` | `supabaseHeaders_()`, `supabaseServiceHeaders_()`, `buildSupabaseQuery_()`, `supabaseGet_/Post_/Patch_/Delete_()`, `getCachedData_/setCachedData_()`, `getCachedUserIdByEmail_/setCachedUserIdByEmail_()`, `CACHE` |
| `lib/timing.js` | `measureTime_()`, `addServerTiming_()` |
| `lib/utils.js` | `isValidOT_()`, `normalizeModelo_()` |
| `lib/ml-state.js` | `pendingSuggestions_` (Map; escrito por `routes/ml.js`, leído por `routes/trabajo.js`) |

### 3.3 Rutas API

```
── Identidad ─────────────────────────────────────────────────────────────
GET  /api/me                       → perfil del usuario (nombre, rol, especialidad)
GET  /env-config.js                → inyecta VITE_* como window.__ENV__

── Trabajo activo ────────────────────────────────────────────────────────
POST /api/evento                   → INICIO / PAUSA / REANUDAR / FIN / NOTA
GET  /api/mis-activas              → OTs TRABAJANDO/PAUSADO del usuario hoy
GET  /api/mis-finalizadas          → OTs FINALIZADO del usuario hoy
GET  /api/estado                   → estado actual de un VIN+rol
POST /api/refresh-estado           → fuerza re-fetch de un ítem

── Técnico ───────────────────────────────────────────────────────────────
GET  /api/tecnico/cola             → VINs disponibles + compañeros libres
GET  /api/ml/suggest-next          → próximo VIN sugerido (ML)
GET  /api/ml/suggest-pair          → compañero sugerido (ML)

── Ramal ─────────────────────────────────────────────────────────────────
POST /api/solicitud-ramal                 → técnico solicita un ramal
GET  /api/solicitud-ramal/pendientes      → ramalero: lista solicitudes
GET  /api/solicitud-ramal/mi-ramal        → técnico: ¿mi ramal está listo?
GET  /api/solicitud-ramal/mi-posicion     → técnico: posición en cola PENDIENTE
POST /api/solicitud-ramal/:id/notificar   → ramalero avisa + envía Web Push
POST /api/solicitud-ramal/:id/entregar    → ramalero marca como entregado

── Push Notifications ────────────────────────────────────────────────────
GET  /api/push/vapid-public-key    → clave pública VAPID para el cliente
POST /api/push/subscribe           → guarda suscripción del browser

── Supervisor ────────────────────────────────────────────────────────────
GET  /api/supervisor/live          → snapshot en tiempo real de todos
POST /api/supervisor/report        → reporte histórico con filtros

── Admin ─────────────────────────────────────────────────────────────────
GET  /api/admin/config             → configuración global (horarios, flags)
POST /api/admin/config             → actualiza config
GET  /api/admin/tabla/:seccion     → listado + BÚSQUEDA server-side de las
                                     secciones CRUD (ots|vins|usuarios|
                                     incidencias). El filtro va a la BD:
                                     nunca se busca sobre un lote parcial.

── OTs (Admin → OTs y Supervisor → CONTROL) ──────────────────────────────
GET    /api/ots/vivas              → OTs abiertas + asignaciones + técnicos
GET    /api/ots?vin=XXX            → todas las OTs de un VIN (sin filtro de
                                     fecha: un VIN aparece esté donde esté)
POST   /api/ots                    → crea OT (valida tipo y que el VIN exista)
PATCH  /api/ots/:id                → edita OT (solo columnas permitidas)
DELETE /api/ots/:id                → borra la OT y TODO lo relacionado:
                                     eventos, asignaciones, incidencias y
                                     solicitudes_ramal; antes suelta
                                     despacho_propuestas.asignacion_id

── Zonas ─────────────────────────────────────────────────────────────────
GET  /api/zonas/vin/:vin           → zona asignada a un VIN
POST /api/zonas/asignar            → asigna zona a VIN

── Fotos ─────────────────────────────────────────────────────────────────
POST /api/uploader/proxy           → proxy de upload a Cloudflare R2
GET  /api/uploader/status/:vin     → estado de fotos de un VIN

── VINs / Normalización ──────────────────────────────────────────────────
GET  /api/vins/normalizar-preview  → preview de normalización de modelos
POST /api/vins/normalizar          → aplica normalización
GET  /api/vins/modelo/:vin         → modelo_normalizado de un VIN

── Incidencias ───────────────────────────────────────────────────────────
POST /api/incidencia               → registra incidencia/falla
GET  /api/mis-incidencias          → incidencias del usuario
GET  /api/supervisor/incidencias   → todas las incidencias
```

### 3.4 Flujo de un evento (ruta más crítica)

```
POST /api/evento { email, vin, rolTrabajo, accion, nota }
  ↓
Lookup user_id por email  (cache 30 min)
  ↓
Validar VIN en tabla `vins`
  ↓
Buscar asignación activa del usuario en `asignaciones`
  ↓
Validar transición de estado:
  SIN_INICIAR → TRABAJANDO   (INICIO)
  TRABAJANDO  → PAUSADO      (PAUSA)
  PAUSADO     → TRABAJANDO   (REANUDAR)
  TRABAJANDO  → FINALIZADO   (FIN)
  cualquier   → cualquier    (NOTA — sin cambio de estado)
  ↓
PATCH asignacion (nuevo estado + timestamps)
  ↓
Response { ok, estado, id, … }
```

---

## 4. Frontend (`public/js/`)

### 4.1 Bootstrap (`public/app.js`)

```
index.html carga app.js
  ↓
Carga window.__ENV__  (desde /env-config.js)
  ↓
Monta appShell() en #appRoot  (HTML completo de la UI)
  ↓
Inicializa CORE.state (objeto global)
  ↓
Registra vistas en router-lite
  ↓
Auto-login si hay email en localStorage
  ↓
openView(módulo)  →  exit() anterior + enter() nueva
```

### 4.2 Patrón de cada vista

Todas las vistas exponen el mismo contrato:

```js
export function init()  { /* bind de listeners, se llama UNA VEZ al arranque */ }
export function enter() { /* activar timers, cargar datos, mostrar UI         */ }
export function exit()  { /* limpiar timers, ocultar UI, reset de estado      */ }
```

### 4.3 `core/` — Utilidades base (barrel: `core.js`)

| Archivo | Exporta |
|---|---|
| `core.js` | Re-exporta todo lo de abajo |
| `state.js` | `CORE.state` — estado global de la app; `ctx_()` — estado de conversión |
| `api.js` | `getJSON()`, `postJSON()`, `postJSON_user()`, `withLock()` |
| `auth.js` | `requireEmailOrStop()`, perfil del usuario |
| `dom.js` | `$()`, `el_()`, `setOut()` |
| `format.js` | `escapeHtml()`, `fmtShort_()`, `fmtFechaCreacion_()` |
| `router-lite.js` | `register()`, `openView()` — navegación entre módulos |
| `ui-shell.js` | Toggle login/app/hub |
| `theme.js` | Toggle Day/Night, persiste en localStorage |
| `loops.js` | `startLoopsFor_()`, `stopLoopsFor_()` — pollers por módulo |
| `format.js` | Helpers de fecha y texto |
| `links.js` | URLs externas |
| `cache-local.js` | Cache en localStorage |
| `vin.js` | `getVin()`, `normVin_()` |

### 4.4 `work/` — Lógica compartida de trabajo (barrel: `index.js`)

Usada por `conversion/` y parcialmente por `ramalero/`.

| Archivo | Propósito |
|---|---|
| `work-store.js` | Listas activas/finalizados en memoria; `rebuildListsFromStore_()` |
| `work-render.js` | `renderActivas_()`, `renderFinalizados_()` — genera HTML de cards |
| `work-status.js` | `allowedActionsByEstado()` — transiciones válidas por estado |
| `work-time.js` | `computeLiveMs_()` — cálculo de tiempo transcurrido |
| `work-loops.js` | Polling intervals: sync, clock, estado |
| `work-templates.js` | HTML de botones de acción, chip de técnico asignado |
| `work-notes.js` | `snapshotNotasActivas_()` / `restoreNotasActivas_()` |

### 4.5 `views/conversion/` — Módulo principal (técnicos + calidad)

```
conversion/
├── conversion.js               ← Orquestador: init(), enter(), exit()
│                                  Contiene también: banners de ramal, pair suggest,
│                                  cola badge, QR, tec-cards hub
├── data/
│   ├── conversion-sync.js      ← Polling al servidor, merge de datos
│   └── conversion-eventos.js   ← enviarEvento(), autoStartFromScan_()
├── state/
│   └── conversion-store.js     ← normalizeItem_(), mergePrevAndCache_()
├── ui/
│   ├── conversion-delegation.js    ← Event delegation en cards activas/finalizados
│   ├── conversion-vin-autocomplete.js
│   ├── conversion-qr.js
│   └── conversion-zona.js          ← Panel "Registrar carro": VIN + picker de zona
└── modals/
    ├── ramal-alert.js          ← Banner ramal listo + suscripción Web Push
    ├── error-modal.js
    ├── confirm-finish.js
    ├── incidencias.js
    ├── incidencia-alert.js
    ├── rf-modal.js
    ├── rf-tecnico-modal.js
    └── conformidad.js
```

**Flujo al entrar al módulo TECNICO:**

```
enter("TECNICO")
  ↓
showTecCards_()                → grid de opciones del técnico
checkPendingAlerts_(email)     → alertas de incidencias pendientes
requestNotifPermission(email)  → pide permiso + suscribe al Web Push
updateColaBadge_()             → badge de compañeros disponibles
checkVinReadyNotif_()          → notificación VIN disponible       ─┐ cada 2 min
checkRamalListo_()             → banner "tu ramal está listo"      ─┤ cada 15s
checkColaPosicion_()           → banner "eres #X en la cola"       ─┘ cada 15s
checkAndShowPairSuggest_()     → popup sugerencia compañero          cada 90s
syncNow()                      → sincroniza OTs activas              cada N seg
```

### 4.6 `views/ramalero/`

| Archivo | Propósito |
|---|---|
| `ramalero.js` | Orquestador: init, enter, exit |
| `ramalero-actions.js` | Crear ramal, ver activos/finalizados |
| `ramalero-solicitudes.js` | Panel de solicitudes: cards, Notificar, Entregar |
| `ramalero-render.js` | Render de cards de ramales |
| `ramalero-eventos.js` | Event delegation |

> `ramalero-actions.js` importa de `../../work/index.js` (desacoplado de `conversion/`).

### 4.7 `templates/`

Funciones puras que retornan strings HTML. Sin lógica ni binding.
Los módulos las usan con `innerHTML = templateFn()`.

```
templates/
├── layout/
│   ├── shell.js          ← appShell() — ensambla toda la UI
│   ├── topbar.js
│   └── loading-overlay.js
├── views/
│   ├── tecnico-view.js / calidad-view.js / ramalero-view.js …
└── modals/
    ├── qr-modal.js / incidencias-modal.js / confirm-finish-modal.js …
```

### 4.8 Imports: cómo y desde dónde

```
Vistas          → importan desde "../../core/core.js"   (barrel)
work/           → importa directo desde "../core/state.js", etc.
                  (evita dependencias circulares)
Módulos internos → importan directo entre ellos dentro de su carpeta
```

**API calls desde el frontend:**

| Función | Uso |
|---|---|
| `getJSON(url)` | GET sin feedback visual |
| `postJSON(url, body)` | POST sin feedback visual |
| `postJSON_user(url, body, msg)` | POST con overlay de loading visible al usuario |

---

## 5. Design System CSS

### 5.1 Tokens (`00-token.css`) — Fuente de verdad

```css
/* Modo noche (default) */
:root {
  --bg0:       #060b14;   /* fondo más profundo */
  --bg1:       #0a1322;   /* fondo de cards */
  --surface:   #1e3a8a;
  --surfaceLine: …;
  --text:      #eef0ff;
  --muted:     #94a3b8;
  --ok:        #22c55e;   + --okBg
  --danger:    #f87171;   + --dangerBg
  --warn:      #fbbf24;   + --warnBg
  --note:      #7dd3fc;   + --noteBg
  --shadow / --shadowSm / --backdrop / --radius / --radiusSm
}

/* Modo día */
:root[data-theme="day"] { /* todos los tokens redefinidos */ }
```

**Regla:** Todo componente nuevo usa tokens. **Nunca colores hex hardcodeados**, ni en CSS ni en JS inline.

### 5.2 Cascada CSS (orden estricto)

```
1. 00-token.css         → variables (sin efecto visual)
2. 01-base.css          → reset + tipografía
3. 02-layout.css        → estructura
4. components/          → cards, inputs, botones, pills, badges…
5. overlays/            → modales, loading
6. 05-autocomplete.css  → dropdowns
7. views/               → estilos específicos por módulo
8. 07-uploader.css      → módulo aislado, siempre al final
```

No alterar el orden — cada grupo asume que los anteriores ya están cargados.

---

## 6. Google Apps Script (`gas/`)

> **El código GAS corre en Google Cloud, completamente separado de este proyecto.**
> La carpeta `gas/` existe aquí solo como **referencia** — no se compila, no se despliega
> desde Node, y está excluida del repositorio de GitHub (ver `.gitignore`).
> Para aplicar cambios hay que copiarlos manualmente al editor de Apps Script en Google.

Corre en Google Cloud de forma completamente independiente del backend Node.
**No comparte código** con él — es un sistema paralelo sobre Google Sheets.

**Trigger principal:** `enriquecerListaDiaria()` cada 10 minutos.

```
Sheets "REPORTES"  ←─── GAS ───→  Supabase (vía REST)
                          │
                   Sheets "ASIGNACIONES"
```

| Archivo | Función |
|---|---|
| `00_config_core.js` | Constantes: IDs de Spreadsheet, nombres de columnas |
| `REPORTE_PRINCIPAL_obtencion_vin.js` | Enriquece LISTA DIARIA: cruza VINs, OTs, escribe fecha cierre |
| `Codigo_ASIGNACIONES_COMPLETO.js` | Actualiza hoja ASIG, sincroniza estados con Supabase |
| `REP_DASHBOARD.js` | Dashboard agregado para supervisores |
| `REP_PROD.js` | Reportes de productividad por técnico |
| `REP_INC.js` | Reporte de incidencias |
| `99_webapp_router.js` | HTTP doGet/doPost para webhooks desde el backend |

---

## 7. Service Worker y Web Push

### 7.1 Build del SW

```
vite.config.js  →  strategies: 'injectManifest', filename: 'sw-custom.js'
  ↓
Workbox inyecta self.__WB_MANIFEST en public/sw-custom.js
  ↓
Output: dist/sw-custom.js
  ↓
dist/registerSW.js  →  navigator.serviceWorker.register('/sw-custom.js')
```

### 7.2 Capabilities del SW

- Precache de assets estáticos (Workbox)
- `push` event → muestra notificación del OS
- `notificationclick` → enfoca o abre la app

### 7.3 Flujo Web Push completo

```
── Suscripción (al entrar al módulo TECNICO) ──────────────────────────────
enter("TECNICO")
  → requestNotifPermission(email)
    → Notification.requestPermission()
    → navigator.serviceWorker.ready
    → pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC_KEY })
    → POST /api/push/subscribe  →  INSERT en push_subscriptions (con service key)

── Envío de push (cuando ramalero notifica) ───────────────────────────────
POST /api/solicitud-ramal/:id/notificar
  → PATCH solicitudes_ramal (notificado_at = now)
  → SELECT push_subscriptions WHERE email = tecnico_email  (service key)
  → webpush.sendNotification(subscription, payload)
  → SW recibe 'push' event → self.registration.showNotification(…)
  → Usuario toca notificación → 'notificationclick' → abre app
```

---

## 8. Tablas Supabase

| Tabla | Descripción |
|---|---|
| `usuarios` | Perfil: nombre, email, rol, especialidad |
| `vins` | Catálogo: vin, modelo, modelo_normalizado |
| `asignaciones` | OTs: work_order_id, vin, user_id, rol_trabajo, estado_actual, timestamps |
| `solicitudes_ramal` | vin, tecnico_email, estado, notificado_at, entregado_por, entregado_at |
| `push_subscriptions` | email, endpoint, p256dh, auth (RLS deshabilitado — operaciones de backend) |
| `zonas` | Zonas del taller y asignación de VINs |
| `incidencias` | Fallas y observaciones |
| `app_config` | Configuración global key-value (horarios, flags de pausa) |

---

## 9. Flujo de Datos Global

```
┌─────────────────────────────────────────────────────────────────────┐
│  BROWSER / MÓVIL (PWA)                                              │
│                                                                     │
│  app.js → router → enter(módulo)                                   │
│     ↓                                                               │
│  conversion-sync.js ──── polling ──→ GET /api/mis-activas           │
│  work-store.js      ←─── merge  ──                                  │
│  work-render.js     → renderiza cards                               │
│     ↓                                                               │
│  enviarEvento()     ──────────────→  POST /api/evento               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  BACKEND Express (Render)                                           │
│                                                                     │
│  index.js  →  supabasePatch_() / supabasePost_()                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
              ┌────────────────┴──────────────────┐
              ▼                                   ▼
┌──────────────────────────┐       ┌──────────────────────────────┐
│  SUPABASE (PostgreSQL)   │       │  GOOGLE APPS SCRIPT          │
│  usuarios, asignaciones, │       │  Sheets REPORTES             │
│  vins, solicitudes_ramal │       │  Sheets ASIGNACIONES         │
│  push_subscriptions, …   │       │  Trigger cada 10 min         │
└──────────────────────────┘       └──────────────────────────────┘
```

---

## 10. Convenciones

### Naming de funciones

| Patrón | Significado |
|---|---|
| `nombre_()` | "Privada" / interna del módulo (trailing underscore) |
| `initXxx_()` | Bind de listeners — se llama una sola vez |
| `openXxx_()` | Abre modal o panel |
| `closeXxx_()` / `hideXxx_()` | Cierra o oculta |
| `renderXxx_()` | Genera o actualiza HTML en el DOM |
| `checkXxx_()` | Consulta estado y actualiza UI (usado en pollers) |
| `$(id)` | `document.getElementById(id)` |
| `el_(id)` | `getElementById` con sufijo de módulo |

### Estilos inline en JS

Usados para banners, toasts y cards generadas por JS.
**Siempre con tokens**: `var(--ok)`, `var(--bg1)`, `var(--radius)`.
Nunca colores hex directos.

### Módulos

- Todo ES Modules (`import` / `export`). Sin CommonJS.
- Barrel exports para core y work.
- Las vistas con muchos archivos usan imports directos entre ellos.

---

## 11. Deuda Técnica Conocida

### 🔴 Alta — afecta mantenimiento diario

| Problema | Dónde |
|---|---|
| Tests solo en `normalizeItem_` — cobertura mínima | `test/` |

### 🟠 Media — genera fricción ocasional

| Problema | Dónde |
|---|---|
| Magic strings por todo el código (`"LISTA DE VIN GLP"`, etc.) | `gas/`, `index.js` |
| CSS naming inconsistente (`.btn` vs `.btn3` vs `.btnText`) | `public/css/` |
| Archivos GAS de 2000–3000 LOC c/u | `gas/REP_*.js` |
| Estado distribuido sin patrón claro | `CORE.state`, `ctx_()`, vars locales de módulo |
| `work/` mezcla store + render + status en un mismo "cajón" | `public/js/work/` |

### 🟢 Baja — calidad a largo plazo

| Problema |
|---|
| Sin ESLint ni Prettier |
| Sin TypeScript ni JSDoc sistemático |
| Sin estrategia de cache offline para API calls |
| Logging sin niveles ni estructura (mix de `console.log/error/warn`) |
