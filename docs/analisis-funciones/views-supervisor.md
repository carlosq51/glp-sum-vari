# Análisis de funciones — `public/js/views/supervisor/`

Catálogo función por función de los 18 archivos JS de la vista Supervisor. Las líneas son aproximadas (según el archivo leído completo en esta sesión). El objetivo es servir de mapa de referencia y detectar solapamientos/duplicados dentro de la propia carpeta.

## sup-filters.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `parseTimeMs_(x)` | 6 | Parsea un valor de fecha/hora a epoch ms, tolerante a inválidos. | `x` (string/Date) → `number` (0 si inválido). |
| `durationMsFromItem_(it)` | 11 | Extrae `tiempo_ms` de un item de conversión, validando que sea positivo. | `it` (objeto) → `number` ms. |
| `isFinalizado_(estadoRaw)` | 16 | Determina si un estado equivale a "FINALIZADO" (acepta FIN/COMPLETADO). | `estadoRaw` (string) → `boolean`. |
| `vinFamily_(vinRaw)` | 21 | Clasifica un VIN en familia de marca (JETOUR/KYC/VW) según substrings "TE"/"TT". | `vinRaw` (string) → `"JETOUR"\|"KYC"\|"VW"`. |
| `matchMarca_(it, marcaSel)` | 29 | Filtra un item según la marca seleccionada en el UI (RAMAL siempre pasa). | `it`, `marcaSel` → `boolean`. |

## sup-stats.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `median_(arr)` | 6 | Calcula la mediana de un array numérico. | `arr` → `number`. |
| `mad_(arr, med)` | 14 | Median Absolute Deviation respecto a una mediana dada. | `arr`, `med` → `number`. |
| `weightByMad_(x, med, mad, k=2.5)` | 19 | Pondera un valor según distancia robusta a la mediana (peso 1 dentro de k·MAD, decae fuera). | `x, med, mad, k` → `number` (peso). |
| `normalizeTrack_(track)` | 29 | Normaliza el track a `CALIDAD\|RAMAL\|CONVERSION`. | `track` (string) → string canónico. |
| `normalizeRol_(rol)` | 36 | Normaliza el rol a `TANQUE\|MOTOR\|RAMAL\|CALIDAD\|UNKNOWN`. | `rol` (string) → string canónico. |
| `normalizeMarca_(marca)` | 48 | Normaliza marca a mayúsculas o `"ALL"` si vacía. | `marca` → string. |
| `validMs_(x)` | 53 | Helper interno: valida que `x` sea número finito > 0 (no exportado, reusado internamente). | `x` → `boolean`. |
| `buildContextStats_(items, getDurationMs)` | 72 | Construye un `Map` de estadísticas robustas (count/medianMs/madMs) por combinaciones track/rol/marca a partir de histórico. | `items[]`, `getDurationMs(it)` → `Map<key, stats>`. |
| `getContextPrior_(statsMap, ctx, minCount=4)` | 126 | Busca el mejor "prior" contextual con fallback en cascada (track+rol+marca → … → global). | `statsMap`, `ctx{track,rol,marca}`, `minCount` → objeto prior. |
| `robustLocalAverage_(arrMs, k=2.5)` | 178 | Promedio ponderado robusto (outliers pesan menos) de una muestra de duraciones. | `arrMs[]`, `k` → `{avgMs, medianMs, madMs, used, ...}`. |
| `avgRobustWithContextPrior_(arrMs, contextPrior, opts)` | 245 | Mezcla el promedio robusto local con el prior contextual histórico (peso adaptativo según tamaño de muestra). | `arrMs[]`, `contextPrior`, `opts{k,priorWeight}` → objeto de stats extendido. |
| `fmtDur_(ms)` | 292 | Formatea milisegundos como `"Hh MMm SSs"`. | `ms` (number) → `string`. |

## index.js

Barrel de re-exportación pura; no define funciones propias.

| Export | Línea | Origen |
|---|---|---|
| `init, enter, exit` | 7 | re-exportado de `supervisor.js` |
| `openSupIncModal_, closeSupIncModal_, fetchIncidencias_, renderIncidencias_` | 10 | re-exportado de `sup-incidencias.js` |
| `isFinalizado_, matchMarca_, durationMsFromItem_` | 11 | re-exportado de `sup-filters.js` |

## sup-qr.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `openSupQR_({onDecodedDone})` | 11 | Abre el modal `#qrModal` y arranca el escáner. | callback `onDecodedDone` → `Promise<void>`. |
| `closeSupQR_()` | 17 | Cierra el modal `#qrModal` y detiene el escáner. | — → `Promise<void>`. |
| `startSupQR_({onDecodedDone})` | 22 | Inicia el scanner (`createScanner("qrReader")`) en modo QR, escribe el VIN detectado en `#supVin`. | callback → `Promise<void>`. |
| `bindSupQR_({CORE, onApply})` | 43 | Enlaza botones abrir/cerrar QR y click fuera del modal. | `CORE`, `onApply` → `void`. |

## sup-trend-chart.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `renderTrendChart_(canvasEl, items, techName)` | 16 | Renderiza gráfico de línea (Chart.js) con el tiempo de conversión por VIN finalizado de un técnico, filtrando outliers >10h. | `canvasEl`, `items[]`, `techName` → `void` (efecto DOM). |
| `destroyTrendChart_()` | 222 | Destruye la instancia de Chart.js activa. | — → `void`. |

## sup-pausa-indefinida.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `bindSupPausaIndefinida_({getJSON_user})` | 13 | Delegación de click global sobre `[data-sup-pausa]`: confirma y llama `POST /api/evento` con `accion:"PAUSA"` para pausar indefinidamente la OT de un técnico. | `{getJSON_user}` → `void` (bind de evento). |

(`SUP_PAUSA_NOTA` en línea 9 es una constante exportada, no función.)

## sup-live.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `fetchLive_()` | 33 | Llama `GET /api/supervisor/live`. | — → `Promise<object\|null>`. |
| `fmtHora_(iso)` | 39 | Formatea ISO a `HH:MM` en `es-PE`. | `iso` → `string`. |
| `fmtTiempo_(ms, runningSince)` | 46 | Formatea duración a `"Hh MMm"`/`"Mm"`, sumando el delta si sigue corriendo. | `ms`, `runningSince` → `string`. |
| `renderLive_(container, data)` | 57 | Render principal del panel LIVE: agrupa técnicos por rol, dibuja KPI header (metas conv/calidad), pills de filtro, grupos colapsables y bindea sus eventos. | `container`, `data` (respuesta API) → `void`. |
| `fmtCars_(n)` | 237 | Formatea contador de carros (entero o 1 decimal si es medio carro). | `n` → `string`. |
| `firstName_(nombre, maxLen=10)` | 243 | Primer nombre truncado. | `nombre`, `maxLen` → `string`. |
| `shortEstado_(label, maxLen=4)` | 249 | Primera palabra de un label de estado, truncada. | `label`, `maxLen` → `string`. |
| `renderTechCard_(t)` | 254 | Renderiza la tarjeta HTML de un técnico (estado, VIN activo, cumplimiento, stall). | `t` (tech) → `string` HTML. |
| `openLiveDetail_(tech)` | 314 | Abre el modal de detalle del día de un técnico. | `tech` → `void`. |
| `renderDetailRow_(a, todayStr)` | 344 | Renderiza una fila de asignación dentro del modal de detalle. | `a`, `todayStr` → `string` HTML. |
| `fmtFechaHora_(iso)` | 371 | Formatea ISO a `DD/MM HH:MM` (omite fecha si es hoy). | `iso` → `string`. |
| `closeLiveDetail_()` | 384 | Cierra el modal de detalle y reaplica datos si hubo refresh pendiente. | — → `void`. |
| `refreshLive_()` | 397 | Orquesta fetch + render + timestamp, evitando re-render si el modal detalle está abierto. | — → `Promise<void>`. |
| `bindSupLive_()` | 415 | Bind de cierre del modal detalle. | — → `void`. |
| `enterLive_()` | 423 | Activa el panel LIVE y arranca el polling (`REFRESH_MS=300000`). | — → `Promise<void>`. |
| `exitLive_()` | 431 | Desactiva el panel y limpia el timer. | — → `void`. |

## sup-kpis-render.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `renderKPIsPanel_(kpis, techName="", track="CONVERSION")` | 11 | Orquesta el render del panel completo de KPIs (título + grid de sub-cards). | `kpis`, `techName`, `track` → `string` HTML (vacío si no hay datos). |
| `renderIndividualKPIs_(kpis, track, techName)` | 45 | Card de KPI para búsqueda por persona (determina rol predominante Motor/Tanquero). | `kpis, track, techName` → `string` HTML. |
| `renderConversionKPIs_(kpis)` | 87 | Cards separadas Motor/Tanquero para vista general de conversión. | `kpis` → `string` HTML. |
| `renderGeneralKPIs_(kpis, track="RAMAL")` | 139 | Card única de tiempo promedio para vista general RAMAL/CALIDAD. | `kpis, track` → `string` HTML. |
| `renderCarrosPorDiaKPI_(kpis)` | 168 | Card destacada "Carros por Día". | `kpis` → `string` HTML. |
| `renderOutliersKPI_(kpis, track)` | 193 | Card compacta de outliers (umbrales hardcodeados en el texto). | `kpis, track` → `string` HTML. |
| `renderStateCountKPI_(kpis, track)` | 219 | Card de estado del trabajo (Terminados/En proceso/Sin iniciar). | `kpis, track` → `string` HTML. |
| `renderModelKPIs_(kpis)` | 259 | Cards por modelo de vehículo (JETOUR X70, VW, KYC…). | `kpis` → `string` HTML. |

## sup-incidencias-report.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `parseCategoria_(nota)` | 16 | Extrae la categoría (primera línea) de la nota si coincide con `INC_TITULOS`. | `nota` → `string`. |
| `parseExtra_(nota)` | 23 | Extrae el texto libre restante de la nota (descartando la categoría). | `nota` → `string`. |
| `pad2_(n)` | 34 | Zero-pad a 2 dígitos. | `n` → `string`. |
| `todayStr_()` | 35 | Fecha de hoy `YYYY-MM-DD` (hora local del navegador, sin TZ Perú). | — → `string`. |
| `thisMonthStr_()` | 39 | Mes actual `YYYY-MM`. | — → `string`. |
| `fmtDateTime_(iso)` | 43 | Formatea ISO a `DD/MM HH:MM` en `es-PE`. | `iso` → `string`. |
| `chip_(abbr, count, g)` | 66 | HTML de una "chip" de conteo por grado (C/M/L). | `abbr, count, g` → `string` HTML. |
| `stackedBar_(C, M, L, h)` | 74 | Barra apilada de proporciones Crítica/Moderada/Leve. | `C, M, L, h` → `string` HTML. |
| `chips_(C, M, L)` | 89 | Compone las 3 chips (C/M/L) en una fila. | `C, M, L` → `string` HTML. |
| `fetchIncReport_()` | 98 | Llama `GET /api/incidencias/report` con filtros de fecha/tipo/query y dispara el render. | — (lee inputs del DOM) → `Promise<void>`. |
| `renderKpis_(s)` | 131 | Cards KPI totales + índice de riesgo + panel de impacto por VIN. | `s` (summary) → `void` (pinta `#incRepKpis`). |
| `renderRanking_(catGroups, summary)` | 232 | Rankings por categoría, técnico y VIN (funciones internas `catRow`, `tecRow`, `vinRow`, `panel` no exportadas). | `catGroups`, `summary` → `void`. |
| `renderCard_(it)` | 353 | Tarjeta individual de una incidencia (con foto). | `it` → `string` HTML. |
| `buildCatGroups_(items)` | 384 | Agrupa incidencias por categoría → grado. | `items[]` → objeto agrupado. |
| `renderList_(items)` | 396 | Lista agrupada y colapsable por categoría; bindea toggles. | `items[]` → `object\|null` (grupos, para pasar a ranking). |
| `renderTrend_(items)` | 481 | Mini gráfico de barras de tendencia diaria (apila al final de `#incRepKpis`). | `items[]` → `void`. |
| `exportCsv_()` | 536 | Exporta `_lastItems` a CSV descargable. | — → `void`. |
| `renderIncReport_(j)` | 563 | Orquestador: guarda items, llama render de KPIs, tendencia, lista y ranking. | `j` (respuesta API) → `void`. |
| `bindSupIncidenciasReport_({getJSON_user, escapeHtml})` | 572 | Bind de filtros de tipo, botones Hoy/Mes/Aplicar/Exportar y Enter en búsqueda. | `{getJSON_user, escapeHtml}` → `void`. |
| `enterIncReport_()` | 613 | Setea fecha por defecto (hoy) si vacía y dispara el fetch inicial. | — → `void`. |
| `exitIncReport_()` | 624 | Resetea flag `_loading`. | — → `void`. |

## sup-grouping.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `isConvRole_(r)` | 6 | `true` si el rol es MOTOR/TANQUE/TANQUERO (roles de conversión agrupables). | `r` → `boolean`. |
| `groupByVinForUI_(rows)` | 11 | Agrupa filas de conversión por VIN (uniendo MOTOR+TANQUE en un objeto `_kind:"group"`), calcula estado combinado y ordena por timestamp más reciente. | `rows[]` → array de `{_kind:"group"\|"raw", ...}`. |

## sup-kpis.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `detectModel_(modeloStr, vin="")` | 20 | Detecta el modelo de vehículo (JETOUR X70, VOLKSWAGEN, KYC X5/V7/V3-V5, T3, OTRO/DESCONOCIDO) por substrings en el string `modelo`. | `modeloStr, vin` → `string` (clave de modelo). |
| `calculateKPIs_(items, track, isIndividual, dateRange, overrideTotalVins)` | 47 | Calcula todos los KPIs de la vista supervisor: VINs únicos, días trabajados, carros/día, stats robustas (individual/motor/tanque), outliers, breakdown por modelo, conteo de estados. Incluye función interna `calcRobustStats` (línea 140, reusada 3 veces). | `items[]`, `track`, flags → objeto KPI grande. |
| `formatHours_(hours)` | 291 | Formatea horas decimales a `"Hh Mm"`. | `hours` → `string`. |
| `formatPct_(pct)` | 301 | Formatea porcentaje con signo `+/-`. | `pct` → `string`. |

## sup-quick-dates.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `peruDate_(offsetDays=0)` | 10 | Fecha `YYYY-MM-DD` en huso horario América/Lima, con offset de días. | `offsetDays` → `string`. |
| `peruMonth_()` | 15 | Mes actual `YYYY-MM` en huso horario América/Lima. | — → `string`. |
| `bindSupQuickDates_({onApply})` | 20 | Bind de botones Hoy/Ayer/Este Mes que setean los inputs de fecha y disparan `onApply`. | `{onApply}` → `void`. |

## sup-ubicaciones.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `fmtDate_(iso)` | 17 | Formatea ISO a `DD/MM HH:MM` en `es-PE`. | `iso` → `string`. |
| `setUbTimestamp_()` | 27 | Actualiza el texto "Actualizado: HH:MM". | — → `void`. |
| `renderUbPanel0_(rows)` | 37 | Render panel "vehículos en espera de conversión". | `rows[]` → `void`. |
| `renderUbPanel1_(rows)` | 65 | Render panel "conversiones finalizadas pendientes de traslado". | `rows[]` → `void`. |
| `renderUbPanel2_(rows)` | 87 | Render panel "en zona de espera / revisión técnica". | `rows[]` → `void`. |
| `renderUbPanel3_(rows)` | 112 | Render panel "listos para traslado". | `rows[]` → `void`. |
| `refreshUb_()` | 136 | Fetch `GET /api/movilizador/status` y dispara los 4 renders + timestamp. | — → `Promise<void>`. |
| `bindPanelToggles_()` | 158 | Bind de toggles abrir/cerrar de cada panel (una sola vez, con guard `dataset.ubBound`). | — → `void`. |
| `bindSupUbicaciones_()` | 175 | Bind del botón refrescar. | — → `void`. |
| `enterUbicaciones_()` | 179 | Activa el panel, arranca polling (`REFRESH_MS=300000`) e inicializa/reutiliza el mapa de zonas. | — → `Promise<void>`. |
| `exitUbicaciones_()` | 194 | Desactiva panel, limpia timer y destruye el mapa de zonas. | — → `void`. |

## sup-vin-suggest.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `bindSupVinSuggest_({CORE, onApply})` | 3 | Crea y bindea el autocomplete de VIN (`createVinSuggest_` de `core/suggest.js`) sobre `#supVin`; Enter también dispara `onApply`. | `{CORE, onApply}` → `void`. |

## sup-name-suggest.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `bindSupNameSuggest_({CORE, onApply})` | 3 | Crea y bindea el autocomplete de nombre (`createNameSuggest_` de `core/suggest.js`) sobre `#supName`; Enter dispara `onApply`. | `{CORE, onApply}` → `void`. |

## sup-render.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `isFin_(estado)` | 9 | Wrapper local de `isFinalizado_` importado de `sup-filters.js`. | `estado` → `boolean`. |
| `realElapsedMs_(it)` | 25 | Tiempo transcurrido real de un item `TRABAJANDO`, sumando el delta desde `running_since`. | `it` → `number` ms. |
| `renderProgressBar_(it)` | 34 | Barra de progreso vs. `TARGET_MS` del rol (verde si finalizado, coloreada por % si en curso). | `it` → `string` HTML. |
| `renderAvgCard_(avgCardEl, {...})` | 67 | Renderiza la card grande de "tiempo promedio de conversión" con badge histórico/hoy y contadores motor/tanque. | `avgCardEl`, props → `void`. |
| `renderTable_(boxEl, {uiList, escapeHtml, fmtShort_})` | 161 | Despacha cada fila de `uiList` a `renderRowGroup_` o `renderRowNormal_` y pinta el contenedor. | `boxEl`, props → `void`. |
| `renderRowGroup_(row, {...})` | 176 | Renderiza una fila agrupada MOTOR+TANQUE (mismo VIN) con botones de pausa/incidencias. | `row`, helpers → `string` HTML. |
| `renderRowNormal_(it, {...})` | 287 | Renderiza una fila individual (RAMAL/CALIDAD o técnico sin agrupar) con botones de pausa/incidencias. | `it`, helpers → `string` HTML. |

## sup-incidencias.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `openSupIncModal_()` | 12 | Muestra el modal histórico de incidencias `#supIncModal`. | — → `void`. |
| `closeSupIncModal_()` | 17 | Oculta el modal histórico. | — → `void`. |
| `fmtIncFecha_(x, {escapeHtml, fmtShort_})` | 21 | Formatea fecha con `fmtShort_` inyectado y escapa el resultado. | `x`, helpers → `string`. |
| `fetchIncidencias_(vin, conversionId, {getJSON_user})` | 25 | Obtiene histórico de incidencias (intenta Supabase directo, cae a `/api/incidencias/list`). | `vin, conversionId`, helper → `Promise<object>`. |
| `parseNota_(raw)` | 47 | Separa la nota en `{titulo, extra}` comparando la primera línea contra `INC_TITULOS`. | `raw` → `{titulo, extra}`. |
| `renderIncidencias_(j, ctx, {escapeHtml, fmtShort_})` | 62 | Renderiza la lista completa de incidencias históricas de un VIN/OT (con foto, duración, badge resuelta/activa). | `j`, `ctx`, helpers → `void`. |
| `formatElapsed_(tiempoInicio)` | 195 | Formatea tiempo transcurrido desde `tiempoInicio` como `H:MM:SS`/`M:SS`. | `tiempoInicio` → `string\|null`. |
| `buildQcFotoHtml_(inc)` | 218 | HTML de la foto adjunta en el popup de QC (R2 vs Drive). | `inc` → `string` HTML. |
| `buildQcHTML_(inc, idx, total, regDisplay)` | 243 | Construye el HTML completo del popup de incidencia activa (header, nav, foto, botón resolver). | `inc, idx, total, regDisplay` → `string` HTML. |
| `qcPopup_()` | 290 | Devuelve el elemento DOM del popup QC si existe. | — → `Element\|null`. |
| `renderQcCurrent_()` | 292 | Pinta/actualiza el popup para la incidencia activa actual, resuelve nombre del registrador y arranca timer de elapsed. | — → `void`. |
| `closeQcPopup_()` | 340 | Cierra (con transición) el popup QC y resuelve la promesa pendiente. | — → `void`. |
| `resolveQcCurrent_()` | 355 | Marca la incidencia activa actual como resuelta (`resolverIncidencia`) y avanza a la siguiente. | — → `Promise<void>`. |
| `openQCIncPopup_(vin, conversionId, {getJSON_user, escapeHtml, userEmail})` | 380 | Punto de entrada: busca incidencias activas (Supabase o fallback API) y abre el popup navegable. | args → `Promise<boolean>` (false si no había activas). |
| `bindSupIncidencias_({CORE, getJSON_user, escapeHtml, fmtShort_, getEmail})` | 423 | Bind del click en botones `[data-sup-inc]` de la tabla: abre popup QC + modal histórico. | args → `void`. |

## supervisor.js

| Función | Línea | Propósito | Recibe / devuelve |
|---|---|---|---|
| `openSupValidarQr_()` | 43 | Abre el modal QR exclusivo de "Validar VIN" (`#supValidarQrModal`) y arranca un scanner propio. | — → `Promise<void>`. |
| `closeSupValidarQr_()` | 63 | Detiene el scanner de Validar y oculta el modal. | — → `Promise<void>`. |
| `setSupTrack_(t)` | 71 | Cambia el track activo (CONVERSION/CALIDAD/RAMAL), actualiza UI de tabs y refetch del reporte. | `t` → `void`. |
| `supervisorDebounceFetch_()` | 79 | Debounce (250ms) de `fetchSupervisorReport_`. **No se observan llamadas a esta función dentro del archivo** (posible código muerto). | — → `void`. |
| `fetchSupervisorReport_()` | 84 | Lee filtros del DOM (nombre/vin/fechas/track) y llama `GET /api/supervisor/report`. | — → `Promise<void>`. |
| `renderSupervisor_(j)` | 115 | Orquestador central: filtra por marca, agrupa por VIN (track CONVERSION), calcula promedio robusto con prior contextual, cuenta motor/tanque con regla de "medio carro" cross-day, calcula KPIs, pinta avg-card, KPIs, gráfico de tendencia y tabla. | `j` (respuesta API) → `void`. |
| `exportReportCsv_()` | 353 | Exporta `_lastReportItems_` a CSV descargable. | — → `void`. |
| `init()` | 371 | Bind general de la vista: tabs, botones de track, aplicar/limpiar filtros, exportar, VER KPIS, y delega el bind de todos los sub-módulos (incidencias, quick-dates, QR, suggests, pausa, live, ubicaciones, reporte de incidencias, validar VIN). | — → `void`. |
| `fetchVinValidar_()` | 490 | Llama `GET /api/vin-validar` para la pestaña Validar. | — → `Promise<void>`. |
| `renderVinValidar_(j)` | 504 | Renderiza resultado de validación de VIN (encontrado/no encontrado + órdenes de trabajo). | `j` → `void`. |
| `enter()` | 567 | Entry point del módulo: activa tab LIVE por defecto, precalienta name-suggest. | — → `void`. |
| `exit()` | 591 | Cleanup: limpia timers, destruye chart, exit de live/ubicaciones/incidencias-report. | — → `void`. |

## Posibles duplicados / solapamientos (dentro de esta carpeta)

1. **Clasificación de rol MOTOR/TANQUE reimplementada en 3+ lugares en vez de usar `normalizeRol_`.**
   `sup-stats.js:36` (`normalizeRol_`) ya normaliza roles a `TANQUE/MOTOR/RAMAL/CALIDAD/UNKNOWN` y está *importada* en `supervisor.js` (línea 14 del import), pero nunca se llama directamente ahí. En su lugar, la misma comparación `rol === "MOTOR" || rol === "TECNICO" || rol === "CONVERSION"` / `rol === "TANQUE" || rol === "TANQUERO"` se reescribe a mano en `sup-kpis.js:182-186` (dentro de `calculateKPIs_`) y **dos veces** en `supervisor.js:264-265` y `supervisor.js:291-292` (dentro de `renderSupervisor_`). Además `sup-grouping.js:6-9` (`isConvRole_`) reimplementa una variante (MOTOR/TANQUE/TANQUERO agrupado) con el mismo propósito. Riesgo: si se agrega un nuevo alias de rol, hay que tocar 4 sitios distintos.

2. **Chequeo "es RAMAL/RAMALERO" repetido literalmente** en `sup-filters.js:33-34` (`matchMarca_`), `supervisor.js:143` y `supervisor.js:164` (dentro de `renderSupervisor_`), y `sup-render.js:290` y `sup-render.js:351` (`renderRowNormal_`). Es el mismo `String(rol).toUpperCase() === "RAMALERO" || ... === "RAMAL"` copiado 5 veces; `normalizeTrack_`/`normalizeRol_` de `sup-stats.js` ya resuelven esto de forma centralizada pero no se reutilizan.

3. **Chequeo "es FINALIZADO" duplicado fuera de `isFinalizado_`.**
   `sup-filters.js:16-19` define `isFinalizado_` (exportada, reusada por `sup-kpis.js`, `sup-render.js` vía `isFin_`, `supervisor.js`, `index.js`). Sin embargo `sup-trend-chart.js:42-44` reimplementa la misma condición inline (`estado === "FINALIZADO" || estado === "FIN" || estado === "COMPLETADO"`) sin importar `sup-filters.js`, y `sup-grouping.js:46-47` (`groupByVinForUI_`) también la reimplementa localmente (`motorFin`/`tanqueFin`) en vez de llamar a `isFinalizado_`.

4. **Tres formateadores de fecha "hora Perú" independientes con la misma técnica** (`Intl.DateTimeFormat("sv-SE", {timeZone:"America/Lima"})`):
   - `sup-quick-dates.js:6-18` (`peruDate_`, `peruMonth_`), usado para los botones Hoy/Ayer/Este Mes.
   - `supervisor.js:213-214` (`_fmtPeru_`, `_peruOf_`), usado dentro de `renderSupervisor_` para la regla de "medio carro" cross-day.
   - `sup-kpis.js:115` (`FMT_PERU_`), usado dentro de `calculateKPIs_` para contar días únicos.
   Los tres podrían compartir un único helper `peruDate_(iso)` centralizado (p. ej. exportado desde `sup-quick-dates.js` o movido a `sup-stats.js`).

5. **Múltiples formateadores de duración/tiempo distintos y no reutilizados entre sí:**
   `fmtDur_` (`sup-stats.js:292`, `"Hh MMm SSs"`), `fmtTiempo_` (`sup-live.js:46`, `"Hh MMm"`/`"Mm"`, con soporte de `running_since`), `formatElapsed_` (`sup-incidencias.js:195`, `"H:MM:SS"`/`"M:SS"`), `formatHours_` (`sup-kpis.js:291`, horas decimales → `"Hh Mm"`) y el closure `fmtDurMin` definido inline dentro de `renderIncidencias_` en `sup-incidencias.js:121-124` (minutos → `"Xh Ym"`, redefinido en cada iteración del `.map`). Todas resuelven "formatear una duración legible" con pequeñas variaciones de formato/unidad de entrada; son candidatas a consolidarse en 1-2 helpers parametrizables.

6. **Parsing de "categoría/nota" de incidencias duplicado entre `sup-incidencias.js` y `sup-incidencias-report.js`.**
   Ambos archivos importan `INC_TITULOS` desde `templates/modals/incidencias-modal.js` y vuelven a construir su propio `Set` (`INC_TITULOS_CONOCIDOS` en `sup-incidencias.js:45` vs `INC_CATEGORIAS` en `sup-incidencias-report.js:14`) para la misma lógica: "si la primera línea de la nota coincide con un título conocido, sepárala del resto". `sup-incidencias.js:47-60` (`parseNota_`) devuelve `{titulo, extra}` en una sola función; `sup-incidencias-report.js:16-31` hace lo mismo pero partido en dos funciones (`parseCategoria_` + `parseExtra_`) que recorren la nota por separado. Es la misma lógica reimplementada dos veces de forma ligeramente distinta.

7. **Paletas de color LEVE/MODERADA/CRITICA definidas 3 veces, con un valor inconsistente.**
   `sup-incidencias.js` define **dos** mapas de color para los mismos 3 grados: `TIPO_COLOR` (línea 89, `LEVE:"#f59e0b"`) y `tipoMeta_` (línea 208-212, `LEVE` también `"#f59e0b"`) — coinciden entre sí pero es redundante dentro del mismo archivo. `sup-incidencias-report.js` define una tercera paleta independiente, `GRADE` (líneas 53-63), donde **`LEVE` usa `"#eab308"` en vez de `"#f59e0b"`** — es decir, el color de "incidencia leve" no es el mismo en el popup QC/modal histórico que en el reporte global. Vale la pena unificar en una sola fuente de verdad (p. ej. exportar la paleta desde `incidencias-modal.js` junto con `INC_TITULOS`).

8. **Exportación a CSV reimplementada dos veces con el mismo patrón.**
   `sup-incidencias-report.js:536-561` (`exportCsv_`) y `supervisor.js:353-369` (`exportReportCsv_`) reimplementan, cada uno por su cuenta: construcción de headers, función de escape de comillas (`.replace(/"/g,'""')`), armado de filas, `Blob` con BOM `"﻿"`, `URL.createObjectURL`, `<a download>` temporal y `URL.revokeObjectURL`. Es la misma receta boilerplate copiada en dos archivos distintos de la misma carpeta (nótese además que `exportReportCsv_` en `supervisor.js` no hace `appendChild`/`removeChild` del `<a>` antes de `.click()`, a diferencia de la versión de `sup-incidencias-report.js`, que sí lo hace — pequeña inconsistencia de robustez entre ambas copias).

9. **Patrón de modal QR duplicado: `sup-qr.js` vs `supervisor.js`.**
   `sup-qr.js:11-41` (`openSupQR_`/`closeSupQR_`/`startSupQR_`) implementa abrir modal → `scanner.start()` → escribir VIN detectado → cerrar modal, usando `createScanner("qrReader")` sobre `#qrModal`/`#qrMsg`/`#supVin`. `supervisor.js:43-69` (`openSupValidarQr_`/`closeSupValidarQr_`) reimplementa exactamente el mismo flujo a mano para un segundo escáner (`createScanner("supValidarQrReader")`) sobre `#supValidarQrModal`/`#supValidarQrMsg`/`#supValidarVin`, en vez de generalizar `sup-qr.js` para aceptar los IDs de modal/input/scanner como parámetros y reutilizarlo.

10. **Ciclo de vida de "panel con polling" repetido entre `sup-live.js` y `sup-ubicaciones.js`.**
    Ambos módulos implementan el mismo esqueleto: variable de módulo `xxxActive_`, `xxxTimer_`, `REFRESH_MS = 300_000`, `enterXxx_()` que activa el flag + hace un fetch inicial + arranca `setInterval`, y `exitXxx_()` que limpia el flag y el timer (`sup-live.js:9-13,423-435` vs `sup-ubicaciones.js:10-13,179-200`). No es una función duplicada exacta, pero es el mismo patrón de "polling panel" copiado dos veces; sería un buen candidato a un helper genérico `createPollingPanel_({fetchFn, renderFn, intervalMs})`.

11. **Constantes de "tiempo objetivo" por rol/track duplicadas con unidades distintas.**
    `sup-render.js:14-23` (`TARGET_MS`, en milisegundos: MOTOR/TANQUE/CONVERSION=3h, CALIDAD=50min, RAMAL=40min) y `sup-kpis.js:9-11` (`TARGET_HOURS_CONVERSION=3`, `TARGET_HOURS_CALIDAD=50/60`, `TARGET_HOURS_RAMAL=40/60`, en horas) codifican los mismos objetivos de negocio de forma independiente. Si el objetivo cambia (p.ej. conversión pasa a 2.5h), hay que recordar actualizar ambos archivos — no hay una única fuente de verdad. De forma relacionada, `sup-kpis-render.js:198-200` (`renderOutliersKPI_`) hardcodea los textos `"Outliers (<0.5h o >4h)"` / `"Outliers (<1h o >10h)"` como strings sueltos que replican los umbrales `OUTLIER_THRESHOLD_*` definidos en `sup-kpis.js:12-15`, sin referenciarlos.

12. **`sup-vin-suggest.js` y `sup-name-suggest.js` no reimplementan nada — son wrappers delgados correctos.**
    Ambos delegan correctamente en el factory genérico `createSuggest_` de `core/suggest.js` (vía `createVinSuggest_`/`createNameSuggest_`, que ya viven en `core/suggest.js`, no en esta carpeta). La única observación menor es que `supervisor.js:462-469` monta un **tercer** uso de `createVinSuggest_` (para el input `#supValidarVin` de la pestaña Validar) directamente en `init()`, en vez de crear un `sup-validar-vin-suggest.js` análogo a los otros dos — inconsistente con el patrón de "un archivo `sup-*-suggest.js` por widget" que sí se sigue para `#supVin` y `#supName`.
