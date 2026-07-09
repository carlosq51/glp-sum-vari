# Análisis de funciones — `public/js/views/admin, movilizador, zonas`

Catálogo de funciones/métodos definidos en `admin/admin.js`, `movilizador/movilizador.js` y `zonas/zonas-mapa.js`, generado leyendo cada archivo completo. Incluye una comparación de posibles duplicados, extendida a `conversion/tec-mapa.js` por sospecha de solapamiento con `zonas-mapa.js`.

## admin/admin.js

Vista ADMIN: CRUD de Usuarios/VINs/OTs/Incidencias + panel de Reasignar técnico + panel de Configuración (horarios, metas, pausa global, ML de emparejamiento).

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `$id(id)` | 48 | Atajo de `document.getElementById` | id:string → Element\|null |
| `msg(text, isErr)` | 50 | Escribe mensaje de estado en `#adminMsg` (color según error) | texto, bool → void |
| `opts(arr, selected)` | 57 | Genera `<option>` HTML para un `<select>` a partir de un array | arr, selected → string HTML |
| `escHtml(s)` | 61 | Escapa HTML (XSS-safe) para interpolar en templates | any → string |
| `renderTable(rows, query)` | 114 | Renderiza tabla HTML del tab activo (usa `TABLE_DEF`), filtra por texto libre | rows[], query → string HTML |
| `loadReasignarPanel_()` | 153 | Busca asignaciones activas de un VIN y usuarios activos, renderiza tabla de reasignación de técnico con acciones de cambio | async, usa inputs DOM → pinta `#reasignarResults` |
| `loadTab()` | 270 | Orquestador principal: según `S.tab` renderiza panel Reasignar, panel Config (con todos sus fetch/eventos ML) o tabla CRUD estándar | async, sin args → mutación DOM |
| `saveConfig_()` | 796 | Guarda `FECHA_CORTE_MOVILIZADOR` vía `POST /api/admin/config` | async → void |
| `saveMetas_()` | 818 | Guarda metas de producción (diaria/mensual/calidad) vía `POST /api/admin/config` | async → void |
| `saveHorarios_()` | 846 | Guarda horarios de comida/descanso vía `POST /api/admin/config`, limpia cache local | async → void |
| `pausaMasiva_(accion)` | 880 | Pausa o reanuda todas las OTs `TRABAJANDO`/`PAUSADO` vía `POST /api/admin/pausa-masiva`, recarga tab | accion:"PAUSA"\|"REANUDAR" → async |
| `formUsuario(r)` | 906 | Genera HTML del formulario de Usuario (incluye checkboxes de módulos) | row opcional → string HTML |
| `formVin(r)` | 923 | Genera HTML del formulario de VIN (incluye botón QR si es nuevo) | row opcional → string HTML |
| `formOt(r)` | 945 | Genera HTML del formulario de Orden de Trabajo | row opcional → string HTML |
| `formIncidencia(r)` | 956 | Genera HTML del formulario de Incidencia | row opcional → string HTML |
| `collectForm()` | 981 | Lee valores del formulario abierto según `S.tab` y arma el objeto a guardar | — → object |
| `validate(data)` | 1028 | Valida campos requeridos/formatos por tab (nombre, email, VIN 17 chars, etc.) | data → string\|null (mensaje de error) |
| `openModal(titleText, formHtml)` | 1047 | Abre el modal genérico de crear/editar con título y HTML de formulario | strings → void, enfoca primer input |
| `bindModalExtras_()` | 1060 | Enlaza el botón de escaneo QR del campo VIN dentro del modal (solo "Nuevo VIN") | — → void |
| `closeModal()` | 1078 | Cierra el modal, detiene el scanner de VIN, resetea `S.editId` | — → void |
| `save()` | 1088 | Valida y guarda (POST/PATCH via supabase-client) el registro del modal actual; sincroniza módulos si es usuario | async → void |
| `syncModulos_(userId, modulos)` | 1124 | Reemplaza filas de `usuario_modulos` para un usuario (delete + insert) | userId, modulos[] → async |
| `deleteRow(id)` | 1132 | Confirma y elimina un registro de la tabla activa | id → async void |
| `bindTableActions()` | 1147 | Enlaza botones editar/eliminar de cada fila de la tabla renderizada | — → void |
| `showAdminCards_()` | 1177 | Muestra la grilla de cartillas de secciones (usuarios/vins/ots/…), la construye una sola vez | — → void |
| `showAdminDetail_(tab)` | 1204 | Cambia a vista detalle de una sección, setea título y dispara `loadTab()` | tab:string → void |
| `init()` (export) | 1217 | Registra listeners globales de la vista (volver, búsqueda con debounce, nuevo, modal, guardar) | — → void |
| `enter()` (export) | 1250 | Hook de entrada de módulo: fija `CORE.state.currentModule` y muestra cartillas | — → void |
| `exit()` (export) | 1251 | Hook de salida: detiene el scanner de reasignar | — → void |

## movilizador/movilizador.js

Vista MOVILIZADOR: flujo de 3 etapas (conversión finalizada → zona de calidad → listos para salir), lista diaria con estados de flujo, registro de ingreso/salida con QR, cola offline, y mapa de zonas embebido.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `getMovNombre_()` | 34 | Obtiene nombre (o email) del usuario actual desde `CORE.state` | — → string |
| `fmtDate_(iso)` | 38 | Formatea fecha ISO corta o `"—"` | iso → string |
| `setBadge_(id, count)` | 42 | Actualiza texto/visibilidad de un badge numérico por id | id, count → void |
| `renderList0_(rows)` | 51 | Renderiza panel "Ingreso" (en espera / en conversión), actualiza 2 badges | rows[] → void (DOM) |
| `saveListaCache_(rows)` | 107 | Persiste lista de pendientes en `localStorage` con timestamp | rows[] → void |
| `loadListaCache_()` | 113 | Lee cache de lista pendientes de `localStorage` | — → {rows,savedAt}\|null |
| `showCacheBanner_(savedAt)` | 117 | Muestra banner "sin conexión, mostrando lista guardada" | savedAt → void |
| `hideCacheBanner_()` | 126 | Oculta el banner de cache | — → void |
| `updateGuardarBtn_(savedAt)` | 131 | Actualiza tooltip/estado visual del botón "Guardar lista" | savedAt → void |
| `getOfflineQueue_()` | 147 | Lee cola offline de acciones pendientes desde `localStorage` | — → array |
| `saveOfflineQueue_(q)` | 150 | Persiste cola offline | q[] → void |
| `addToOfflineQueue_(vin)` | 153 | Encola una acción `REGISTRAR_ENTRADA` offline para un VIN | vin → void |
| `removeFromOfflineQueue_(vin)` | 160 | Quita un VIN de la cola offline | vin → void |
| `updateOfflineBanner_()` | 164 | Sincroniza banner/contador de pendientes offline con la cola actual | — → void |
| `drainOfflineQueue_()` | 172 | Reenvía al backend las acciones offline pendientes cuando hay conexión | async, sin args → void |
| `renderPendientesRegistrar_(rows)` | 190 | Guarda filas de "pendientes por registrar", actualiza badges y reaplica filtro | rows[] → void |
| `renderPendientesBody_(filtered)` | 202 | Pinta las tarjetas de VINs pendientes de registrar (con subcabecera de conteo) | filtered[] → void (DOM) |
| `applyPendientesFiltro_(q)` | 249 | Filtra `_pendientesRows` por VIN/ubicación y re-renderiza | q:string → void |
| `downloadListaPendientes_()` | 260 | Genera y descarga CSV de pendientes | — → void (blob download) |
| `showPendienteConfirmRow_(vin)` | 280 | Muestra fila de confirmación "¿confirmar ingreso?" con auto-cancel a 8s | vin → void |
| `hidePendienteConfirmRow_(vin)` | 289 | Oculta la fila de confirmación de un VIN | vin → void |
| `confirmarIngresoPendiente_(vin)` | 296 | Confirma ingreso de un VIN pendiente (online: POST traslado; offline: encola), luego llama `promptZonaForVin` | async, vin → void |
| `showPendientesQrCard_(vin)` | 342 | Muestra tarjeta de resultado tras escanear QR en el panel de pendientes | vin → void |
| `hidePendientesQrCard_()` | 366 | Oculta la tarjeta QR de pendientes | — → void |
| `confirmarIngresoPendienteQr_()` | 371 | Wrapper que toma el VIN del botón QR y delega a `confirmarIngresoPendiente_` | async → void |
| `renderListDiaria_(rows)` | 397 | Guarda y renderiza la "lista diaria" completa con badge de pendientes y contador total | rows[] → void |
| `applyFiltroLista_(filtro)` | 411 | Filtra lista diaria por estado de flujo (todos/avanzados/estado específico) y renderiza tarjetas | filtro:string → void |
| `renderList1_(rows)` | 463 | Renderiza panel "Zona de Espera" (conversión finalizada pendiente traslado) | rows[] → void |
| `renderList2_(rows)` | 492 | Renderiza panel "en zona de calidad" (trasladado / en revisión), ordena TRASLADADO primero | rows[] → void |
| `renderList3_(rows)` | 533 | Renderiza panel "listos para salir", actualiza `_vinsSinOT_` y `_list3Rows` | rows[] → void |
| `refreshAll_()` | 579 | Fetch central: drena cola offline, pide `/status` y `/pendientes`, repuebla los 4 paneles y cache | async, sin args → void |
| `handleAction_(vin, accion, btn, onSuccess)` | 623 | Handler genérico de acciones de traslado (POST `/api/movilizador/traslado`), maneja estado del botón y refresca | async, vin/accion/btn/callback → bool |
| `showMovHub_()` | 648 | Vuelve a la pantalla hub (cartillas), oculta paneles | — → void |
| `showMovPanel_(screenId)` | 654 | Muestra un panel/pantalla específico, oculta el resto | screenId → void |
| `initMovCards_()` | 661 | Construye una vez la grilla de cartillas del hub (Lista/Ingreso/Espera/Salida/Mapa) con badges | — → void (idempotente por `dataset.inited`) |
| `bindFiltros_()` | 737 | Enlaza clicks de los botones de filtro de la lista diaria | — → void |
| `bindPanelToggles_()` | 747 | Enlaza colapsar/expandir de paneles acordeón | — → void |
| `movQrModal_()` | 766 | Atajo para obtener el elemento modal de QR | — → Element |
| `openMovQr_(target)` | 768 | Abre modal y arranca el scanner QR para un target ("entrada"/"salida"/"pendientes") | async, target → void |
| `showSalidaQrResult_(vin)` | 805 | Muestra panel de resultado de escaneo QR en Salida (destino, estado OT), auto-dismiss 15s | vin → void |
| `closeSalidaQrResult_()` | 851 | Cierra el panel de resultado QR de salida | — → void |
| `closeMovQr_()` | 859 | Detiene el scanner y cierra el modal QR | async → void |
| `getGpsUrl_(vin)` | 869 | Arma URL de la app externa de GPS con el VIN como query param | vin → string |
| `copyVinToClipboard_(vin)` | 873 | Copia el VIN al portapapeles (best-effort) | vin → void |
| `prepareGpsWindow_(vin)` | 879 | Abre una ventana `about:blank` placeholder antes de redirigir (evita bloqueo de popup) y copia VIN | vin → Window\|null |
| `openGpsWithVin_(vin, popup)` | 893 | Redirige la ventana precreada (o abre una nueva) a la URL de GPS con el VIN | vin, popup? → void |
| `handleConfirmarSalida_(vin, btn)` | 908 | Flujo "Confirmar Salida": abre ventana GPS, ejecuta acción `ENTREGAR_FINAL` vía `handleAction_` | async, vin, btn → void |
| `handleRegistroDesde_(vin, btn)` | 922 | Registra ingreso (`REGISTRAR_ENTRADA`) desde la lista diaria, luego llama `promptZonaForVin` | async, vin, btn → void |
| `handleRegistro_(vin, accion, btnId)` | 950 | Handler de registro de entrada/salida desde inputs manuales; abre GPS y limpia el input | async, vin, accion, btnId → void |
| `revalidarOTFaltante_()` | 1000 | Revalida en backend los VINs de `_vinsSinOT_`; si alguno ya tiene OT, dispara `refreshAll_` | async, sin args → void |
| `startPoll_()` | 1012 | Arranca los dos timers de polling (`refreshAll_` cada 30s, `revalidarOTFaltante_` cada 8min) | — → void |
| `stopPoll_()` | 1018 | Limpia ambos timers de polling | — → void |
| `init()` (export) | 1025 | Registra todos los listeners de la vista (inputs, QR, cache, delegación de clicks, autocompletes VIN) | — → void |
| `enter()` (export) | 1184 | Hook de entrada: refresca datos, arranca polling, inicializa el mapa de zonas embebido (`initZonasMapa`) | — → void |
| `exit()` (export) | 1197 | Hook de salida: detiene polling, cierra modal QR, destruye el mapa de zonas | — → void |

## zonas/zonas-mapa.js

Componente compartido y reusable (no es una "vista" con `init/enter/exit`, sino un módulo que exporta funciones/factory) que dibuja el mapa visual de las 15 zonas de conversión + Zona Libre, y expone acciones de asignar/liberar zona.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `fmtElapsed_(isoStr)` | 30 | Formatea tiempo transcurrido desde un timestamp ISO en `"Xm"`/`"Xh Ym"` | iso → string |
| `renderZonaCard_(z, readOnly)` | 42 | Renderiza el HTML de una tarjeta de zona individual (ocupada o libre) | zona-obj, bool → string HTML |
| `renderMapa_(container, zonas, sinZona, readOnly)` | 80 | Renderiza el mapa completo (columnas izq/der + zona libre + leyenda) dentro de un contenedor | container, zonas[], sinZona[], bool → void (DOM) |
| `removeEl_(el)` | 165 | Elimina un elemento del DOM si existe (helper genérico) | el → void |
| `openActionSheet_(zona, onRefresh)` | 169 | Abre hoja de acciones de una zona (asignar/liberar) al hacer click en una tarjeta | zona-obj, callback → void |
| `closeActionSheet_()` | 229 | Cierra la hoja de acciones abierta | — → void |
| `openPickerForZone_(zonaId, onRefresh)` | 232 | Abre mini-formulario para asignar un VIN a una zona específica (con autocomplete VIN + QR) | zonaId, callback → void |
| `openZonaPicker(vin, usuario, zonaData, onDone, dismissible)` (export) | 372 | Abre el picker de mapa completo para elegir en qué zona ubicar un VIN dado | vin, usuario, {zonas}, callback, bool → void |
| `closePicker_()` | 434 | Cierra el picker de zona abierto | — → void |
| `initZonasMapa(containerId, opts)` (export) | 448 | Factory que inicializa el mapa en un contenedor: primer render, auto-refresh cada 60s, botón refresh manual | containerId, {readOnly,usuario,onZoneAction} → `{refresh, destroy}` |
| `bindMapaClicks_(container, usuario, onZoneAction)` | 495 | Enlaza (re-enlaza) los clicks de tarjetas/zona-libre del mapa a las acciones correspondientes | container, usuario, callback → void |
| `promptZonaForVin(vin, usuario, onDone, dismissible)` (export) | 539 | Consulta `/api/zonas` y abre el picker si el VIN aún no tiene zona asignada | async, vin, usuario, callback, bool → void |

Nota: `zonas-mapa.js` es importado tanto por `movilizador.js` (`initZonasMapa`, `promptZonaForVin` — líneas 13, 1189, 324, 939, 984) como probablemente por otras vistas de conversión/supervisor (no verificado en este análisis, que se limitó a los 3 archivos solicitados).

## Posibles duplicados / solapamientos

- **`zonas/zonas-mapa.js` vs `conversion/tec-mapa.js` — mapa de zonas duplicado casi al detalle.** Se inspeccionó `tec-mapa.js` para confirmar la sospecha y el solapamiento es real y significativo:
  - Constantes de layout idénticas: `COL_IZQUIERDA = [15,14,13,12,11,10]` y `COL_DERECHA = [9,8,7,6,5,4,3,2,1]` aparecen literalmente iguales en `zonas-mapa.js:11-12` y `tec-mapa.js:8-9`.
  - `fmtElapsed_(isoStr)` está duplicada carácter por carácter entre `zonas-mapa.js:30-38` y `tec-mapa.js:11-19`.
  - El render de una tarjeta de zona (`renderZonaCard_` en `zonas-mapa.js:42-78` vs `renderCard_` en `tec-mapa.js:36-71`) comparte la misma estructura HTML/clases (`zonaCard`, `zonaCarOuter`, `zonaCarShape`, `zonaCarWheel...`, `zonaVin`, `zonaEmptyP`), solo cambia cómo se calcula la clase de color (`ESTADO_CSS` por estado real vs `color` calculado por sugerencia ML).
  - El render del grid completo (`renderMapa_` en `zonas-mapa.js:80-158` vs `tec-mapa.js:73-96`) también es esencialmente el mismo esqueleto (`zonasGrid`, `zonasPasillo`, dos `zonasCol`), con `tec-mapa.js` como una versión reducida (sin Zona Libre, sin leyenda de estado, siempre `readOnly`).
  - Conclusión: son dos variantes de un mismo componente (mapa físico de 15 zonas) que evolucionaron por separado — una orientada a movilizador/admin (interactiva, con acciones de asignar/liberar) y otra orientada a técnico (solo lectura, coloreada por recomendación ML). Candidato claro a refactor: extraer layout (`COL_IZQUIERDA`/`COL_DERECHA`), `fmtElapsed_` y el esqueleto de tarjeta/grid a un módulo compartido (p.ej. `core/zonas-layout.js`), dejando que cada vista solo aporte la función de "color por zona" y las acciones de click.

- **`admin.js` y `movilizador.js` no muestran duplicación de lógica de negocio entre sí**, pero comparten patrones repetidos de la app (no exclusivos de estos 2 archivos): helpers de escape HTML (`escHtml` en `admin.js:61` vs `escapeHtml` importado de `core/core.js` en `movilizador.js:10` y `zonas-mapa.js:7` — mismo propósito, nombres distintos porque `admin.js` define el suyo local en vez de importar el de `core.js`). Esto es un candidato menor a limpieza: `admin.js` podría importar `escapeHtml` de `core/core.js` en lugar de redefinir `escHtml` localmente.

- **`movilizador.js` reimplementa localmente patrones de "cache en localStorage" y "cola offline"** (`saveListaCache_`/`loadListaCache_`, `getOfflineQueue_`/`saveOfflineQueue_`) que son genéricos (serializar JSON a `localStorage` con try/catch). No se detectó un helper equivalente en `admin.js` ni en `zonas-mapa.js`, pero si existe un helper similar en otras vistas (p. ej. `conversion/` o `ramalero/`, no leídos en este análisis) valdría la pena verificarlo — se señala como sospecha a confirmar, no se pudo comparar por estar fuera del alcance de los 3 archivos pedidos.

- **Los pickers/action-sheets de `zonas-mapa.js`** (`openActionSheet_`, `openPickerForZone_`, `openZonaPicker`) y **los modales de `admin.js`** (`openModal`, `closeModal`) resuelven el mismo problema genérico (overlay modal con creación/eliminación de nodo DOM y cierre por click fuera) con implementaciones independientes; no es una duplicación literal de código pero sí un patrón repetido que podría unificarse en un helper de UI compartido si se detectan más casos similares en otras vistas.
