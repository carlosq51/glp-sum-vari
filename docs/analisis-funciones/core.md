# Análisis de funciones — `public/js/core/`

> Catálogo de funciones por archivo, generado para detectar redundancias antes de comparar con otras carpetas.

## router-lite.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `register(name, enter, exit)` | 8 | Registra una vista en el mapa `reg` con sus callbacks de entrada/salida. | recibe nombre + funciones `enter`/`exit`; no retorna. |
| `open(name)` | 12 | Router principal: ejecuta `exit()` de la vista actual y `enter()` de la nueva vista, actualiza `current`. | recibe nombre de vista; sin retorno. Expuesto como export por defecto vía alias. |
| `open.register` | 24 | Alias: cuelga `register` como propiedad de `open` para exponer un único export. | — |

Export único: `openView` (alias de `open`, con `.register` colgado).

## auth.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `effectiveModulos(profile)` | 11 | Calcula la lista de módulos habilitados para un perfil (por `modulos` explícito o inferidos del `rol`). | recibe `profile`; devuelve array de strings de módulos. |
| `computeRolLock_(profile)` | 27 | Determina si un técnico tiene el rol de trabajo bloqueado según su especialidad (MOTOR/TANQUE). | recibe `profile`; devuelve `"MOTOR"`, `"TANQUE"` o `null`. |
| `enforceRolLock_()` | 36 | Aplica el bloqueo de rol al `<select id="rol">` en el DOM según `CORE.state.rolLock`. | sin params; efecto lateral en DOM. |
| `saveEmail(email)` | 49 | Guarda el email en `localStorage` bajo `EMAIL_KEY`. | recibe string. |
| `loadEmail()` | 53 | Lee el email guardado en `localStorage`. | devuelve string (o `""`). |
| `clearEmail()` | 57 | Elimina el email de `localStorage`. | — |
| `getEmail()` | 61 | Lee y normaliza (trim/lowercase) el valor del input `#email`. | devuelve string. |
| `getVin()` | 65 | Lee y normaliza (trim/uppercase) el VIN del input resuelto vía `el_("vin")`. | devuelve string. |
| `getRolTecnico_()` | 69 | Devuelve el rol de trabajo del técnico (bloqueado o desde el `<select>`). | devuelve string, default `"MOTOR"`. |
| `getRolTrabajoCurrent_()` | 75 | Resuelve el rol de trabajo actual según el módulo activo (CALIDAD/RAMALERO/TECNICO). | devuelve string. |
| `requireEmailOrStop()` | 81 | Valida que exista email; si no, lanza `Error("NO_EMAIL")`. | devuelve email o lanza excepción. |

## cache-local.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `vinCacheLoad_()` | 12 | Carga el objeto cache de VINs desde `localStorage` (parse JSON con fallback `{}`). | interna (no exportada). |
| `vinCacheSave_(obj)` | 17 | Persiste el objeto cache de VINs en `localStorage`. | interna. |
| `vinCacheKey_(conversionId, rolTrabajo)` | 21 | Construye la clave compuesta `"cid|ROL"` para el cache de VIN. | interna. |
| `vinCacheSet_(conversionId, rolTrabajo, vin)` | 27 | Guarda un VIN en cache con timestamp y purga entradas con más de 14 días. | exportada; sin retorno. |
| `vinCacheGet_(conversionId, rolTrabajo)` | 46 | Recupera el VIN cacheado para una conversión/rol. | exportada; devuelve string (uppercase) o `""`. |
| `ramalCacheLoad_()` | 56 | Carga el cache de ramales desde `localStorage`. | interna. |
| `ramalCacheSave_(obj)` | 61 | Persiste el cache de ramales. | interna. |
| `ramalCacheKey_(conversionId)` | 65 | Construye la clave `"RAMAL|cid"`. | interna. |
| `ramalCacheSet_(conversionId, tipoRamal)` | 70 | Guarda el tipo de ramal en cache con timestamp y purga entradas > 14 días. | exportada. |
| `ramalCacheGet_(conversionId)` | 85 | Recupera el tipo de ramal cacheado para una conversión. | exportada; devuelve string. |

## dom.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `$(id)` | 8 | Alias corto de `document.getElementById`. | recibe id; devuelve `Element|null`. |
| `modSuffix_()` | 10 | Devuelve el sufijo de id según el módulo activo (`"Q"` para CALIDAD, `"R"` para RAMALERO, `""` para el resto). | devuelve string. |
| `el_(id)` | 17 | Resuelve un elemento del DOM probando primero `id+sufijo` y luego `id` a secas (soporta IDs duplicados por módulo). | devuelve `Element|null`. |

## format.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `escapeHtml(s)` | 6 | Escapa caracteres HTML peligrosos (`&<>"'`) para inserción segura en el DOM. | devuelve string. |
| `cssEsc_(s)` | 15 | Escapa un string para uso en selectores CSS, usando `CSS.escape` si existe o un fallback regex. | devuelve string. |
| `fmtShort_(iso)` | 20 | Formatea una fecha ISO a `dd/mm/aa hh:mm` (es-PE), año en 2 dígitos. | recibe ISO string; devuelve string o `"-"`. |
| `fmtFechaCreacion_(iso)` | 33 | Formatea una fecha ISO a `dd/mm/aaaa hh:mm` (es-PE), año completo. | recibe ISO string; devuelve string o `"-"`. |
| `msToHMS_(ms)` | 46 | Convierte milisegundos a formato `HH:MM:SS`. | recibe número; devuelve string. |
| `keyOfItem_(it)` | 55 | Genera clave compuesta `"conversionId|ROL"` para un ítem de trabajo. | recibe objeto; devuelve string. |

## links.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `openRegistroFallas_(vin)` | 8 | Abre en nueva pestaña la web de registro de fallas, con el VIN como query param si existe. | recibe string; sin retorno (efecto: `window.open`). |

También exporta `REG_FALLAS_BASE` (constante, línea 6).

## theme.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `initTheme_()` | 8 | Inicializa el tema: usa el guardado en `localStorage` o detecta preferencia del sistema (`prefers-color-scheme`). | sin retorno. |
| `loadTheme_()` | 19 | Lee el tema guardado en `localStorage` (`glp_theme`). | devuelve string (`"day"`/`"night"`/`""`). |
| `toggleTheme_()` | 27 | Alterna entre tema `day`/`night` según el actual en `document.documentElement.dataset.theme`. | sin retorno. |
| `applyTheme_(t)` | 32 | Aplica el tema al `<html data-theme>` y lo persiste en `localStorage`. | recibe `"day"|"night"`. |

## loops.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `tctx_(mod)` | 17 | Obtiene el objeto de timers (`syncTimer`, `clockTimer`, etc.) del módulo indicado, con fallback a TECNICO. | interna. |
| `stopLoopsFor_(mod)` | 21 | Detiene todos los timers (sync/clock/estado) activos de un módulo. | exportada; sin retorno. |
| `clearModuleUI_(mod)` | 35 | Limpia inputs y contenedores de UI del módulo, resetea el contexto (`ctx_()`) de items/keys/sync. | exportada; sin retorno. |
| `runSyncLoop_(mod, syncNow)` | 72 | Loop recursivo interno: ejecuta `syncNow` y se reprograma cada 60s vía `setTimeout` mientras el módulo no esté detenido. | interna, async. |
| `startLoopsFor_(mod, {syncNow, tickClocksUI, refreshEstadoForVinRole, buildAvgTopHTML})` | 90 | Arranca los loops de un módulo: sync inicial inmediato, reloj cada 1s, refresco de estado cada 8s (solo TECNICO/CALIDAD), y re-renderiza finalizados si aplica. | exportada; recibe callbacks; sin retorno. |

## state.js

| Elemento | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `MODULES` (const) | 6 | Lista de módulos válidos de la app. | — |
| `CORE` (const) | 8 | Objeto de estado global compartido (perfil, módulo actual, lock UI, store por módulo). | — |
| `ctx_()` | 47 | Devuelve el store de datos (items/keys/sync) correspondiente al módulo activo. | sin params; devuelve objeto store. |
| `isWorkModule_()` | 54 | Indica si el módulo activo es uno "de trabajo" (TECNICO/CALIDAD/RAMALERO). | devuelve boolean. |

## dual-api.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `setMigrationConfig(cfg)` | 30 | Sobrescribe/mezcla la configuración de migración dual-write (`MIGRATION_CONFIG`). | recibe objeto parcial. |
| `dualWrite(action, payload, options)` | 38 | Escribe en paralelo a AppScript (`postJSON`) y Supabase (`dualWriteToSupabase_`), tolera errores según config, retorna resultado de AppScript como primario. | async; devuelve objeto resultado. |
| `dualRead(table, filter, options)` | 72 | Lee preferentemente desde Supabase (`supabaseGet`) con fallback a endpoint AppScript legacy si falla o está deshabilitado. | async; devuelve datos. |
| `dualWriteToSupabase_(action, payload, options)` | 92 | Helper interno: mapea el payload genérico (`incidencia`, `evento`, `conformidad`) al schema de tablas Supabase y hace el POST. | interna, async. |
| `syncFromAppScript(action, filters)` | 153 | Sincroniza datos históricos desde AppScript hacia Supabase (migración/recovery), registro por registro. | async; devuelve `{ok, synced, results}`. |
| `mapASRecordToSupabase_(action, record)` | 181 | Helper interno: traduce campos de un registro AppScript (mayúsculas) al esquema Supabase (snake_case). | interna. |
| `mapTableName_(action)` | 212 | Helper interno: mapea nombre de acción a nombre de tabla Supabase. | interna. |

## realtime.js

> Nota: este archivo referencia una variable global `supabase` (cliente JS de Supabase) que **no se importa** en el archivo (solo se importa `supabaseEnabled`/`SUPABASE_CONFIG`); parece código de ejemplo/plantilla no integrado activamente (ver comentario final "IMPORTANTE: Importa en tu app.js principal").

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `subscribeToAsignacionesActivas(userId, callback)` | 18 | Se suscribe (vía API `supabase.from().on()`, estilo Supabase v1) a updates de asignaciones de un usuario. | exportada; devuelve subscription u `null`. |
| `subscribeToNuevasIncidencias(vin, callback)` | 56 | Se suscribe a INSERTs de incidencias de un VIN. | exportada; devuelve subscription u `null`. |
| `subscribeToWorkOrderChanges(workOrderId, callback)` | 93 | Se suscribe a UPDATEs de una work_order específica. | exportada; devuelve subscription u `null`. |
| `subscribeToTable(tableName, options)` | 136 | Suscripción genérica a cualquier tabla/evento/filtro. | exportada; devuelve subscription u `null`. |
| `unsubscribe(channelName)` | 169 | Cancela una suscripción específica y la borra del registro `realtimeConnections`. | exportada. |
| `unsubscribeAll()` | 180 | Cancela todas las suscripciones activas. | exportada. |
| `initSupervEditorDashboard()` | 195 | Caso de uso: inicializa suscripciones para el dashboard de SUPERVISOR (asignaciones + incidencias). | exportada. |
| `initTecnicoWorkView(userId)` | 223 | Caso de uso: suscribe la vista de trabajo del técnico a cambios en su asignación activa. | exportada. |
| `initCalidadIncidenciasView(vin)` | 241 | Caso de uso: suscribe la vista de CALIDAD a incidencias y cambios de OT de un VIN. | exportada. |
| `initAuditiaTimeline()` | 266 | Caso de uso: suscribe timeline de auditoría a todos los eventos. | exportada. |
| `updateTableRow(data)` | 284 | Helper UI stub: actualiza celdas de una fila de tabla por `data-id`/`data-field`. | interna (no exportada). |
| `showNotification(title, data)` | 296 | Helper UI stub: muestra notificación/toast (solo `console.log`). | interna. |
| `updateWorkTimerUI(timeMs)` | 302 | Helper UI stub: actualiza el cronómetro de trabajo en pantalla. | interna. |
| `updateWorkStatusUI(estado)` | 313 | Helper UI stub: actualiza texto/clase del estado de trabajo. | interna. |
| `updateNotasUI(nota)` | 321 | Helper UI stub: actualiza el texto de notas. | interna. |
| `addIncidenciaToTable(data)` | 328 | Helper UI stub: inserta fila de incidencia en tabla. | interna. |
| `updateWorkOrderStatus(estado)` | 345 | Helper UI stub: actualiza texto de estado de OT. | interna. |
| `addEventoToTimeline(evento)` | 352 | Helper UI stub: agrega un item al timeline de auditoría. | interna. |
| `scrollTimelineToBottom()` | 367 | Helper UI stub: hace scroll al final del timeline. | interna. |

## api.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `setLocked(on, msg)` | 10 | Activa/desactiva el overlay de carga global, deshabilita inputs/botones clave y actualiza el texto de estado. | recibe boolean + mensaje; sin retorno. |
| `withLock(fn, msg)` | 57 | Ejecuta `fn` bajo lock exclusivo de UI: espera si ya hay un lock activo (polling hasta 10s), llama `setLocked`, mide duración, loguea. | async; recibe función y mensaje; devuelve el resultado de `fn` o relanza error. |
| `getJSON(url)` | 96 | Fetch GET simple que parsea JSON. | async; devuelve objeto parseado. |
| `postJSON(url, body)` | 101 | Fetch POST con JSON, maneja errores de red/parseo, y en caso de HTTP no-ok pero con JSON válido, retorna el JSON con `_statusCode` en vez de lanzar. | async; devuelve objeto. |
| `getJSON_user(url, msg)` | 137 | `getJSON` envuelto en `withLock` (bloquea UI mientras carga). | async. |
| `postJSON_user(url, body, msg)` | 141 | `postJSON` envuelto en `withLock`. | async. |

## qr-scanner.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `isIOS_()` | 11 | Detecta si el dispositivo es iOS (incluye iPad con iPadOS reportando MacIntel). | interna; devuelve boolean. |
| `normalizeScanText(text)` | 23 | Normaliza texto escaneado: quita espacios, uppercase, trim. | exportada; devuelve string. |
| `getScanConfig(mode)` | 39 | Genera configuración de escaneo (fps, qrbox, formatos soportados) diferenciada por modo (QR/BAR) y plataforma (iOS vs Android/Desktop). | exportada; recibe `"QR"|"BAR"`; devuelve objeto config. |
| `startCameraWithFallback(instance, config, onDecoded)` | 87 | Intenta abrir la cámara con estrategias progresivas de fallback (exact environment → environment → lista de dispositivos → cámara frontal), con rama especial para iOS. | exportada, async. |
| `stopScanner(instance)` | 138 | Detiene de forma segura una instancia de `Html5Qrcode` si está escaneando. | exportada, async. |
| `createScanner(readerId)` | 157 | Factory que crea un scanner reutilizable ligado a un elemento del DOM, con métodos internos `ensureInstance`, `start`, `stop`, `getInstance`, `isActive`. | exportada; devuelve `{start, stop, getInstance, isActive}`. |

## app-settings.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `loadSettings()` | 17 | Carga settings de apariencia (tamaño de fuente, color de acento) desde `localStorage`, mezclados con `DEFAULTS`. | exportada; devuelve objeto `{size, accent}`. |
| `saveSettings(patch)` | 22 | Mezcla y persiste un patch de settings en `localStorage`. | exportada; devuelve el objeto resultante. |
| `applySettings(s)` | 28 | Aplica los settings al DOM: atributo `data-size` en `<html>` y variables CSS de color de acento. | exportada; recibe settings (default = `loadSettings()`). |
| `initAppSettings()` | 41 | Punto de entrada: aplica los settings guardados al cargar la app. | exportada. |

También exporta `ACCENT_COLORS` (constante, línea 7).

## ui-shell.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `showLoginUI(msg)` | 21 | Muestra la vista de login y oculta la vista app; setea mensaje de error/login. | exportada. |
| `showAppUI()` | 27 | Muestra la vista app y oculta login. | exportada. |
| `hideAllModulesUI()` | 33 | Oculta el hub y todas las vistas de módulo (`#view{MOD}`). | exportada. |
| `showHubUI(mods, onPick)` | 43 | Renderiza el hub con las cartillas de módulos disponibles (saludo, tarjetas clicables) e inicializa el panel de settings. | exportada; recibe lista de módulos + callback de selección. |
| `refreshSettingsUI_()` | 86 | Helper interno: sincroniza los botones activos del panel de settings (tema/tamaño/acento) con el estado actual. | interna. |
| `initHubSettings_()` | 101 | Helper interno: engancha listeners del panel de settings del hub (una sola vez, con guard `hubSettingsInited_`). | interna. |
| `updateHubModuleBadge(modName, count)` | 146 | Muestra/oculta un badge numérico de pendientes sobre la cartilla de un módulo en el hub. | exportada. |
| `hasMultipleModulesUI()` | 158 | Indica si el perfil actual tiene más de un módulo asignado. | exportada; devuelve boolean. |
| `syncTopbarHomeButtonUI()` | 163 | Muestra/oculta el botón "ir al home" en la topbar según `hasMultipleModulesUI()`. | exportada. |
| `goToHubUI(mods, onPick)` | 169 | Wrapper delgado sobre `showHubUI`. | exportada. |
| `setUserPillUI()` | 173 | Actualiza el saludo y la "píldora" de usuario (rol/especialidad/nombre) en la topbar. | exportada. |
| `applyDebugVisibilityUI()` | 188 | Muestra/oculta el panel de debug según si el rol del usuario es ADMIN. | exportada. |
| `setOut(obj)` | 196 | Vuelca un objeto como JSON formateado en el elemento `#out` (panel de depuración). | exportada. |
| `setEstadoText(text)` | 201 | Escribe texto en el contenedor de estado (`estadoBox`) resuelto vía `el_`. | exportada. |

## suggest.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `createSuggest_(opts)` | 18 | Factory genérica de widget de autocompletado: maneja debounce, fetch, navegación por teclado, click-outside y render de resultados. | exportada; recibe opciones (input, box, fetchFn, renderItem, onPick, guard, min, debounce, limit); devuelve `{bind, hide, destroy, isOpen}`. |
| `createVinSuggest_(opts)` | 115 | Especialización de `createSuggest_` para autocompletar VINs contra `/api/vin-suggest`. | exportada; devuelve instancia del widget. |
| `createNameSuggest_(opts)` | 141 | Especialización de `createSuggest_` para autocompletar nombres/usuarios contra `/api/name-suggest`. | exportada; devuelve instancia del widget. |

## core.js

No define funciones propias: es un **barrel** que reexporta símbolos de `state.js`, `dom.js`, `ui-shell.js`, `auth.js`, `theme.js`, `api.js`, `supabase-client.js`, `dual-api.js`, `cache-local.js`, `format.js`, `links.js` y `suggest.js` (líneas 6-75).

## supabase-client.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `supabaseEnabled()` | 16 | Verifica si hay URL + ANON_KEY configuradas para Supabase. | exportada; devuelve boolean. |
| `supabaseHeaders()` | 23 | Helper interno: construye los headers estándar (`apikey`, `Authorization`, etc.) para llamadas REST a Supabase. | interna. |
| `buildQuery(filter)` | 46 | Helper interno: construye el query string PostgREST a partir de un objeto de filtros (soporta `eq`, `neq`, `gt`, `in`, `is`, etc.). | interna; devuelve string. |
| `supabaseGet(table, filter)` | 78 | GET genérico contra la REST API de Supabase con filtros. | exportada, async; devuelve datos JSON. |
| `supabasePost(table, data)` | 99 | POST (insert) genérico contra Supabase. | exportada, async. |
| `supabasePatch(table, filter, data)` | 121 | PATCH (update) genérico contra Supabase con filtro. | exportada, async. |
| `supabaseDelete(table, filter)` | 143 | DELETE genérico contra Supabase con filtro. | exportada, async; devuelve `{ok:true}`. |
| `subscribeToChanges(table, callback)` | 168 | Suscripción realtime vía WebSocket nativo (implementación propia, distinta de `realtime.js`) a cambios de una tabla, con reconexión automática a los 5s. | exportada, async; devuelve función de unsubscribe. |
| `getRealtimeStatus()` | 258 | Devuelve el estado (conectado, nº listeners) de todas las suscripciones WebSocket activas. | exportada; devuelve objeto. |
| `getUsuarioPerfil(email)` | 276 | Query de alto nivel: obtiene perfil de usuario + sus módulos asignados (reemplaza `/api/me`). | exportada, async; devuelve objeto perfil o `null`. |
| `getMisActivas(email)` | 300 | Query de alto nivel: obtiene asignaciones activas del usuario (JOIN con work_orders/vins), optimizada filtrando en Supabase. | exportada, async; devuelve array. |
| `getMisFinalizadas(email)` | 359 | Igual que `getMisActivas` pero para asignaciones finalizadas. | exportada, async; devuelve array. |
| `getEstadoTrabajo(email, vin, rolTrabajo)` | 417 | Obtiene el estado de un trabajo específico (usuario+VIN+rol). | exportada, async; devuelve objeto o `null`. |
| `getIncidencias(vin, {soloActivas})` | 471 | Obtiene incidencias de un VIN, resuelve URLs de fotos (R2 o Drive legacy) y calcula duración. | exportada, async; devuelve array ordenado por fecha. |
| `resolverIncidencia(id, email)` | 529 | Marca una incidencia como resuelta vía endpoint backend `/api/incidencia/:id/resolver`. | exportada, async; devuelve JSON o lanza error. |
| `getNombreByEmail(email)` | 545 | Obtiene el nombre de un usuario a partir de su email. | exportada, async; devuelve string o `null`. |
| `getIncidenciasByTecnico(nombre, sinceIso)` | 556 | Obtiene incidencias no resueltas de un técnico desde una fecha. | exportada, async; devuelve array. |
| `getVinSuggest(q, limit)` | 569 | Sugerencias de VIN vía backend proxy (`/api/vin-suggest`). | exportada, async; devuelve array `{vin, modelo, cliente}`. |

También exporta `SUPABASE_CONFIG` (constante, línea 8).

---

## Posibles duplicados / solapamientos (dentro de `core/`)

1. **Suscripciones realtime duplicadas (dos implementaciones paralelas e incompatibles).**
   `realtime.js:18-164` (`subscribeToAsignacionesActivas`, `subscribeToNuevasIncidencias`, `subscribeToWorkOrderChanges`, `subscribeToTable`) usa una API estilo Supabase v1 (`supabase.from(...).on(...).subscribe()`) sobre una variable global `supabase` que **no está importada** en el archivo. `supabase-client.js:168` (`subscribeToChanges`) implementa su **propio** cliente realtime a mano con `WebSocket` nativo y reconexión. Ambos resuelven el mismo problema de forma distinta y no interoperable. `realtime.js` parece código de plantilla no integrado (su comentario final dice "Importa en tu app.js principal"), mientras `supabase-client.js:subscribeToChanges` sí es funcional. Candidato a decidir cuál es la fuente de verdad y eliminar el otro.

2. **`realtime.js` reimplementa formateo de tiempo ya existente.**
   `updateWorkTimerUI(timeMs)` en `realtime.js:302` reconstruye manualmente la conversión de milisegundos a `H:MM:SS`, duplicando `msToHMS_(ms)` de `format.js:46`.

3. **Patrón de fetch repetido en `supabase-client.js`.**
   `supabaseGet`, `supabasePost`, `supabasePatch`, `supabaseDelete` (líneas 78, 99, 121, 143) reconstruyen cada uno manualmente `fetch(...) + if(!res.ok) throw...` con headers casi idénticos. Podría factorizarse en un único helper `supabaseFetch_(method, table, filter, body)`, análogo a como `api.js` centraliza `getJSON`/`postJSON`.

4. **Patrón "fetch + tolerar error + loguear" repetido entre `dual-api.js`, `supabase-client.js` y `api.js`.**
   No es duplicado literal de función, pero la misma forma de manejar errores de red se reescribe en cada capa (`dual-api.js:44-60`, cada método de `supabase-client.js`, `api.js:postJSON:101-135`).

5. **Cache en `localStorage` con patrón idéntico duplicado dentro de `cache-local.js`.**
   El trío `vinCacheLoad_`/`vinCacheSave_`/`vinCacheKey_` (líneas 12-25) y el trío `ramalCacheLoad_`/`ramalCacheSave_`/`ramalCacheKey_` (líneas 56-68) son estructuralmente idénticos (mismo try/catch de `JSON.parse`, mismo TTL de 14 días, misma lógica de purga en `vinCacheSet_:39-42` y `ramalCacheSet_:78-81`). Candidato claro a factorizar en una factory genérica `createLocalCache_(storageKey, ttlMs)`, reutilizable también para `app-settings.js:loadSettings/saveSettings` (mismo patrón `localStorage.getItem` + `JSON.parse` con try/catch, líneas 17-19).

6. **`app-settings.js` vs `theme.js`: dos sistemas de persistencia de preferencias visuales, coordinados solo por convención.**
   `theme.js` persiste el tema (`day`/`night`) bajo la key `glp_theme`. `app-settings.js` persiste tamaño de fuente y color de acento bajo `glpAppSettings`, reconociendo en su propio comentario que el tema lo maneja `theme.js` aparte. Fragmentación deliberada, pero sigue siendo dos módulos de "ajustes de apariencia" sin interfaz común.

**Verificado sin duplicado:** `escapeHtml`, `fmtShort_`, `fmtFechaCreacion_`, `msToHMS_` solo existen en `format.js`; `suggest.js` los importa correctamente en vez de reimplementarlos (única excepción es el punto 2, en `realtime.js`).

**Nota sobre `realtime.js`:** usa una variable global `supabase` no importada y varias funciones de UI (`updateTableRow`, `showNotification`, etc.) que son stubs con solo `console.log`. Su propio comentario final indica que aún debe integrarse. Es probable que sea código de andamiaje/ejemplo no productivo — vale la pena confirmar si sigue en uso o es candidato a eliminar, ya que su coexistencia con `supabase-client.js:subscribeToChanges` es la fuente principal de solapamiento en esta carpeta.
