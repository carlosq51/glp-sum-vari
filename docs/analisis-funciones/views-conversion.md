# Análisis de funciones — `public/js/views/conversion/`

Catálogo función por función de los 19 archivos indicados de `public/js/views/conversion/` (y subcarpetas `data/`, `modals/`, `state/`, `ui/`). Basado en lectura completa de cada archivo el 2026-07-09.

## conversion.js

Orquestador principal de la vista TECNICO/CALIDAD: navegación de tarjetas ("hub"), sugerencias de pareja (IA), banners de ramal/cola, paneles Mi OT / Cola / Rendimiento / Incidencias / Mapa, y ciclo de vida `init/enter/exit`.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `showTecCards_` | 65 | Muestra el hub de tarjetas y oculta todos los paneles TEC; actualiza saludo y badges. | Sin args / sin retorno (efectos DOM). |
| `showTecPanel_` | 88 | Oculta el hub y muestra un panel específico, ejecutando un loader opcional. | `(panelId, loader)` / void. |
| `updateTecMiOTBadge_` | 98 | Pinta un badge con el nº de OTs activas (TRABAJANDO/PAUSADO) en la tarjeta "Mi OT". | Sin args / void. |
| `updateColaBadge_` | 114 | Consulta `/api/tecnico/cola` y pinta badge con el conteo de VINs en cola. | async, sin args / void. |
| `loadPairingSuggestion_` | 133 | Pide `/api/ml/suggest-pair` y renderiza el banner "Compañero recomendado por IA". | async, sin args / void. |
| `buildPairSuggestModal_` | 171 | Crea (una sola vez) el DOM del modal persistente de sugerencia de pareja. | Sin args / void. |
| `renderPairSuggestCard_` | 210 | Renderiza la tarjeta del candidato actual dentro del modal de sugerencia. | Sin args (usa estado módulo `pairSuggestQueue_`/`pairSuggestIdx_`) / void. |
| `renderPairSuggestNewCar_` | 268 | Renderiza variante "no hay compañeros libres, empieza carro nuevo". | Sin args / void. |
| `renderPairSuggestSolo_` | 293 | Renderiza variante "el técnico rechazó los 3 sugeridos, trabaja solo". | Sin args / void. |
| `closePairSuggestModal_` | 320 | Oculta el modal de sugerencia de pareja. | Sin args / void. |
| `showPairSuggestLoading_` | 325 | Muestra estado de carga (spinner) en el modal de sugerencia. | Sin args / void. |
| `openPairSuggestModal_` | 347 | Abre el modal, decide variante (pair/new_car) y dispara el render correspondiente. | Sin args / void. |
| `checkAndShowPairSuggest_` | 374 | Si el técnico está en "Mi OT" sin OT activa, pide `/api/ml/suggest-next` y abre el popup. | async, sin args / void. |
| `checkVinReadyNotif_` | 407 | Poll de `/api/tecnico/cola`; dispara `Notification` nativa por cada VIN nuevo listo. | async, sin args / void. |
| `showRamalListoBanner_` | 430 | Crea/actualiza banner fijo superior "tu ramal está listo". | `(item)` / void. |
| `hideRamalListoBanner_` | 456 | Elimina el banner de ramal listo. | Sin args / void. |
| `checkRamalListo_` | 461 | Consulta `/api/solicitud-ramal/mi-ramal` y muestra/oculta el banner anterior. | async, sin args / void. |
| `showColaBanner_` | 477 | Crea/actualiza banner "eres #N de la cola de ramales", clicable para abrir detalle. | `(posicion, total)` / void. |
| `hideColaBanner_` | 511 | Elimina el banner de cola y el modal de detalle asociado. | Sin args / void. |
| `openColaDetalleModal_` | 519 | Construye/llena un modal con el detalle de la cola de ramales (`/api/solicitud-ramal/cola`). | async, sin args / void. |
| `checkColaPosicion_` | 594 | Consulta `/api/solicitud-ramal/mi-posicion` y muestra/oculta `showColaBanner_`. | async, sin args / void. |
| `initTecCards_` | 611 | Crea las tarjetas del hub TEC (Mi OT, Cola, Buscar, Rendimiento, Incidencias, Mapa) y sus handlers. | Sin args / void (idempotente vía `tecCardsInited_`). |
| `loadTecCola_` | 660 | Renderiza el panel "Cola pendiente": compañeros libres rankeados por ML + VINs listos + fallback. | async, sin args / void. |
| `loadTecRendimiento_` | 788 | Renderiza el panel "Mi rendimiento": KPIs, meta mensual (SVG), comparativa de equipo, histograma, historial filtrable. | async, sin args / void. |
| `loadTecIncidencias_` | 1008 | Renderiza el panel "Mis incidencias": dashboard por tipo + grupos expandibles + filtros de fecha. | async, sin args / void. |
| `tickClocksUI_` | 1146 (export) | Tick de reloj: actualiza tiempos en vivo de tarjetas, dispara pausas programadas y auto-reanudación por countdown. | Sin args / void. |
| `init` | 1242 (export) | Inicializa todos los sub-módulos UI de conversión (estado, autocompletar, QR, validar, modales, delegación) y listeners de botones. | Sin args / void. |
| `enter` | 1419 (export) | Entra al módulo: activa realtime, chequeos de incidencias pendientes, notificaciones push, pollings (cola, ramal, pair-suggest) y loops. | `(mod)` / void. |
| `exit` | 1465 (export) | Sale del módulo: detiene loops, limpia intervals, cierra popups/banners, destruye realtime. | `(mod)` / void. |
| `syncNow` | 1489 (export) | Re-exporta `syncNow` de `data/conversion-sync.js` para consumidores externos. | — |

## data/conversion-estado.js

Refresca el estado (TRABAJANDO/PAUSADO/…) del VIN+rol actualmente cargado en el formulario.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `refreshEstadoForVinRole` | 37 (export) | Busca el item local por VIN+rol; si no existe, lo pide a Supabase o `/api/estado`, lo normaliza y actualiza store + UI de texto de estado. | async `({showOut})` / void (side effects). |
| `scheduleEstadoRefresh_` | 110 (export) | Debounce de `refreshEstadoForVinRole`. | `(ms=500)` / void. |
| `initEstadoUI_` | 116 (export) | Bindea botones `btnEstado`/`btnEstadoQ` (crear OT vía `autoStartFromScan_` + sync) y el cambio de `#rol`. | Sin args / void. |

## data/conversion-eventos.js

Envío de eventos de trabajo (INICIO/PAUSA/FIN/NOTA/REANUDAR), auto-inicio al escanear, y ventanas de pausa programada/configurable.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `getScheduleConfig_` | 67 | Cachea (TTL 5 min, con fallback a `localStorage`) la config de horarios de pausa desde `/api/admin/config`. | async, sin args / objeto de config. |
| `invalidateScheduleCache_` | 102 (export) | Invalida el caché de `getScheduleConfig_`. | Sin args / void. |
| `hhmm_` | 109 | Convierte `"HH:MM"` a minutos desde medianoche. | `(t)` / number. |
| `isInfinitePauseWindow_` | 120 (export) | Determina si la hora actual cae en pausa global/comida/descanso nocturno (sin auto-resume). | async, sin args / boolean. |
| `enviarEvento` | 165 (export) | Valida acción según estado local, hace `POST /api/evento`, actualiza store (`normalizeItem_`/`mergePrevAndCache_`), re-renderiza, dispara sync diferido y popup obligatorio de zona tras INICIO. | async `(accionOverride, opts)` / respuesta del server o `{ok:false,...}`. |
| `autoStartFromScan_` | 272 (export) | Tras escanear VIN, si no hay OT o está SIN_INICIAR, llama `enviarEvento("INICIO",...)` con anti-loop por Map y maneja los distintos tipos de error (ya asignado, VIN no existe, acción inválida, timeout) mostrando el modal de error correspondiente. | async `(vin, rolTrabajo)` / void. |

Constantes exportadas: `PAUSA_AUTO_RESUME_MS`, `SCHEDULED_PAUSES`, `autoResumingKeys_`.

## data/conversion-sync.js

Sincronización de listas activas/finalizadas (Supabase o API Node) y suscripciones realtime.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `scheduleSync_` | 102 | Debounce/throttle de `syncNow` según tiempo transcurrido desde el último sync. | `(opts, delay=400)` / void. |
| `handleRealtimeChange_` | 138 | Router de eventos realtime por tabla (`asignaciones`, `work_orders`, `incidencias`, `solicitudes_ramal`); dispara `scheduleSync_` y/o popups de alerta (`showIncidenciaAlert`, `showRamalEntregadoAlert`). | `(tableName, payload)` / void. |
| `initializeRealtime_` | 208 (export) | Suscribe a las 4 tablas anteriores vía Supabase realtime. | async, sin args / void. |
| `destroyRealtime_` | 260 (export) | Cancela todas las suscripciones realtime activas. | Sin args / void. |
| `apiSync_` | 280 (export) | Trae "mis activas": intenta Supabase (`getMisActivas`), si no, `POST /api/sync`, si no, `GET /api/mis-activas`. | async `(email, since, {forceRefresh})` / `{mode, data}`. |
| `fetchFinalizados_` | 324 (export) | Trae "mis finalizados": Supabase (`getMisFinalizadas`) o `GET /api/mis-finalizadas`. | async `(email)` / `{ok, items}`. |
| `syncNow` | 352 (export) | Sync principal: llama `apiSync_`, aplica resultado al store (`storeFullReplace_`/`applySyncResultToStore_`), preserva finalizados cargados, enriquece nombres MOTOR/TANQUERO para CALIDAD, decide render completo vs. patch parcial. | async `({forceFull, showOut, _fromLock})` / void. |

## modals/confirm-finish.js

Modal de confirmación genérico para la acción FIN (incluye modo "bloqueo" informativo).

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `els_` | 9 | Devuelve referencias a los elementos DOM del modal. | Sin args / objeto de elementos. |
| `close_` | 20 | Cierra el modal y resuelve la promesa pendiente con `result`. | `(result)` / void. |
| `bindOnce_` | 36 | Bindea (una sola vez) botones de cierre, click fuera y tecla Escape. | Sin args / void. |
| `initConfirmFinishUI_` | 62 (export) | Wrapper público de `bindOnce_`. | Sin args / void. |
| `askConfirmFinish_` | 66 (export) | Configura textos/botones y abre el modal devolviendo una Promise<boolean> con la decisión del usuario; si no existe el modal, cae a `window.confirm`/`alert`. | `({title, message, acceptText, cancelText, blockMode})` / `Promise<boolean>`. |

## modals/conformidad.js

Modal de conformidad de equipo (TANQUE/REDUCTOR) con escaneo QR/código de barras y checklist.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `setConformidadAfterSaveRefresh_` | 31 (export) | Registra callback a ejecutar tras guardar exitosamente. | `(fn)` / void. |
| `confEls_` | 35 | Devuelve referencias DOM del modal de conformidad. | Sin args / objeto. |
| `normalizeCode_` | 63 | Normaliza (trim+uppercase) un código escaneado/escrito. | `(s)` / string. |
| `guessEquipoTipo_` | 67 | Infiere si la conformidad es de TANQUE o REDUCTOR según `rolTrabajo`/campos del item. | `(it)` / string. |
| `getAssignedCode_` | 83 | Obtiene el código de equipo asignado en la cartilla, según tipo. | `(it, equipoTipo)` / string. |
| `allChecksOn_` | 94 | Indica si los 3 checkboxes están marcados. | Sin args / boolean. |
| `canSave_` | 99 | Determina si el formulario está listo para guardar (código + checks + item). | Sin args / boolean. |
| `setMsg_` | 104 | Setea el mensaje de estado del modal (con color si es error). | `(txt, isErr)` / void. |
| `refreshAssignedHint_` | 111 | Actualiza el texto que compara el código escaneado vs. el asignado en cartilla. | Sin args / void. |
| `refreshSaveState_` | 142 | Habilita/deshabilita visualmente el botón Guardar según `canSave_`. | Sin args / void. |
| `setScanMode_` | 155 | Cambia el modo de escaneo interno (QR/BAR). | `(mode)` / void. |
| `startConfQR_` | 159 | Abre la cámara (Html5Qrcode) en modo QR o código de barras y procesa la detección. | async, sin args / void. |
| `stopConfQR_` | 209 | Detiene el escáner de cámara del modal. | async, sin args / void. |
| `resetForm_` | 221 | Limpia inputs/checks/mensajes del formulario. | Sin args / void. |
| `fillModalFromItem_` | 235 | Rellena cabecera del modal (VIN/ROL/tipo) a partir del item. | `(it)` / void. |
| `openConformidadModalForKey_` | 254 (export) | Abre el modal para el item identificado por `key` del store. | async `(key)` / void. |
| `closeConformidadModal_` | 272 | Cierra el modal y detiene el escáner. | async, sin args / void. |
| `saveConformidad_` | 286 | Valida y hace `POST /api/equipo-conformidad`; en éxito ejecuta el callback de refresco y cierra el modal. | async, sin args / void. |
| `initConformidadUI_` | 349 (export) | Bindea (una vez) todos los eventos del modal: cerrar, input, checks, QR, guardar, Enter. | Sin args / void. |

## modals/error-modal.js

Modal de error genérico reutilizable, con helpers específicos para dos casos de negocio.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `els_` | 9 | Referencias DOM del modal de error. | Sin args / objeto. |
| `close_` | 20 | Cierra el modal y resuelve la promesa pendiente. | Sin args / void. |
| `bindOnce_` | 36 | Bindea (una vez) cierre por X/botón/click-fuera/Escape. | Sin args / void. |
| `initErrorModal` | 61 (export) | Wrapper público de `bindOnce_`. | Sin args / void. |
| `showErrorModal` | 74 (export) | Configura título/mensaje/detalles/ícono según `type` y abre el modal devolviendo `Promise<void>` que resuelve al cerrarse; fallback a `alert()` si no existe el modal en el DOM. | `({title, message, details, type})` / `Promise<void>`. |
| `showVinNotFoundError` | 131 (export) | Atajo de `showErrorModal` para VIN no encontrado. | `(vin)` / `Promise<void>`. |
| `showAlreadyAssignedError` | 146 (export) | Atajo de `showErrorModal` para OT ya asignada a otro técnico. | `(vin, assignedTo)` / `Promise<void>`. |

## modals/incidencia-alert.js

Popup de alerta (overlay bloqueante, navegable) cuando el técnico logueado recibe una incidencia registrada por Calidad, vía realtime o histórico al entrar.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `formatElapsed_` | 47 | Formatea el tiempo transcurrido desde `tiempo_inicio` como `H:MM:SS` o `M:SS`. | `(tiempoInicio)` / string\|null. |
| `buildFotoHtml_` | 63 | Construye el HTML de la foto de la incidencia (soporta R2 y Drive, con distinto markup). | `(inc)` / string. |
| `buildHTML_` | 100 | Construye el HTML completo del overlay de alerta (header coloreado por tipo, nota, foto, navegación, botón resolver). | `(inc, idx, total)` / string. |
| `popup_` | 146 | Devuelve el elemento DOM del popup actual. | Sin args / Element\|null. |
| `renderCurrent_` | 148 | Resuelve nombre de quien registró (email→nombre), inserta el HTML del popup y arranca el timer de tiempo transcurrido. | Sin args / void. |
| `bindPopupEvents_` | 187 | Bindea navegación prev/next y el botón "Solucionada" (armado en 2 clics). | `(inc)` / void. |
| `resetConfirm_` | 214 | Resetea el estado "armado" del botón de resolución. | Sin args / void. |
| `resolveCurrentInc_` | 224 | Llama `resolverIncidencia`, quita el item de la lista y muestra el siguiente o cierra. | async, sin args / void. |
| `closePopup_` | 248 | Anima el cierre del popup y lo remueve del DOM. | Sin args / void. |
| `showIncidenciaAlert` | 266 (export) | API pública: encola una incidencia (evita duplicados) y abre el popup si no está abierto. | `(inc)` / void. |
| `checkPendingAlerts_` | 286 (export) | Al entrar al módulo, revisa incidencias sin resolver (`tiempo_fin IS NULL`) del técnico y las encola/abre. | async `(email, lookbackHours=12)` / void. |
| `getMyNombre_` | 324 (export) | Devuelve (con caché) el nombre del técnico logueado a partir del email. | async `(email)` / string\|null. |

## modals/incidencias.js

Modal de registro de incidencias (usado por CALIDAD): autocomplete de técnico, foto comprimida y guardado.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `incFotoInput`/`incFotoPreview`/`incFotoPreviewWrap`/`incFotoCamInput`/`incFotoFileInput` | 45-63 | Getters DOM triviales para los elementos de foto. | Sin args / Element. |
| `clearIncFoto_` | 65 | Limpia el estado y preview de la foto adjunta. | Sin args / void. |
| `imageFileToUploadPayload_` | 82 | Convierte un `File` a payload subible: comprime a JPEG máx 800px vía canvas (usa `createObjectURL`, evita bug iOS), soporta HEIC sin comprimir y fallback FileReader si canvas falla. | async `(file)` / `{mimeType, b64, previewUrl, name}`. |
| `onIncFotoChange_` | 199 | Handler de `change` de los inputs de foto: valida tipo/tamaño, procesa y muestra preview. | async `(e)` / void. |
| `incEl` | 255 | Alias de `document.getElementById`. | `(id)` / Element. |
| `incSetMsg` / `incSetInfo` | 259/264 | Setean el texto de mensaje/información del modal. | `(t)` / void. |
| `incModal` / `incBtnSave` / `incInputTech` / `incSuggestBox` / `incSelectHidden` / `incTitulo` | 269-291 | Getters DOM triviales de elementos del formulario. | Sin args / Element. |
| `incGravedadValue` | 293 | Lee el radio de gravedad marcado. | Sin args / string. |
| `incGravedadReset_` | 298 | Desmarca todos los radios de gravedad. | Sin args / void. |
| `incNota` | 302 | Getter DOM del textarea de nota. | Sin args / Element. |
| `resetIncForm_` | 306 | Resetea foto, técnico seleccionado, título, gravedad, nota y sugerencias. | Sin args / void. |
| `incRefreshSaveBtn_` | 332 | Habilita/deshabilita el botón Guardar según técnico+título+gravedad completos. | Sin args / void. |
| `norm_` | 346 | Normaliza string (trim+lowercase) para búsquedas. | `(s)` / string. |
| `hay_` | 350 | Concatena y normaliza campos de un técnico para matching de cache local. | `(u)` / string. |
| `incSuggestHide_` | 354 | Oculta/limpia el dropdown de sugerencias de técnico. | Sin args / void. |
| `incSuggestRender_` | 364 | Renderiza la lista de sugerencias de técnico. | Sin args / void. |
| `incSuggestSetIdx_` | 388 | Mueve el índice activo del dropdown y hace scroll-into-view. | `(i)` / void. |
| `setSelectedTech_` | 398 | Fija el técnico elegido (input visible + `<select>` oculto) y oculta sugerencias. | `(u)` / void. |
| `fetchTechSuggest_` | 422 | Llama `GET /api/name-suggest` y normaliza los resultados. | async `(q)` / array. |
| `onIncTechInput_` | 438 | Handler de `input` del campo técnico: debounce + fetch + fallback a cache local. | Sin args / void. |
| `onIncTechKeyDown_` | 476 | Navegación por teclado (↑/↓/Enter/Escape) del dropdown de técnico. | `(e)` / void. |
| `getItemFromKey_` | 505 | Busca el item del store por key. | `(k)` / objeto\|null. |
| `buildIncInfoText_` | 510 | Arma el texto informativo "VIN / OT / acumulado L-M-C". | `(it)` / string. |
| `openIncidenciaModalForKey_` | 520 (export) | Abre el modal para un item (solo CALIDAD), resetea formulario y precarga cache de técnicos. | async `(itemKey)` / void. |
| `closeIncidenciaModal_` | 565 (export) | Cierra el modal y resetea el formulario. | async, sin args / void. |
| `saveIncidencia_` | 584 | Valida campos, hace `POST /api/incidencia` (con foto opcional) y actualiza contadores locales de incidencias del item. | async, sin args / void. |
| `initIncidenciasUI_` | 706 (export) | Bindea (una vez) todos los eventos del modal (cerrar, autocomplete, foto, título/gravedad/nota, guardar, Escape). | Sin args / void. |

## modals/index.js

Barrel de re-exportación de todos los modales de conversión (no define lógica propia): reexporta `initConfirmFinishUI_`, `askConfirmFinish_`, `initConformidadUI_`, `setConformidadAfterSaveRefresh_`, `openConformidadModalForKey_`, `initIncidenciasUI_`, `openIncidenciaModalForKey_`, `initRFModalUI_`, `openRFModalForVin_`, `initRFTecModalUI_`, `openRFTecModalForVin_`, `initErrorModal`, `showErrorModal`, `showVinNotFoundError`, `showAlreadyAssignedError`, `showIncidenciaAlert`, `checkPendingAlerts_`, `getMyNombre_`.

## modals/ramal-alert.js

Notificación (banner + vibración + Web Push) cuando el ramalero marca el ramal como entregado.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `showRamalEntregadoAlert` | 9 (export) | Crea un banner flotante centrado arriba ("¡Tu ramal está listo!"), vibra el dispositivo y se autocierra a los 8s. | `({vin})` / void. |
| `urlBase64ToUint8Array_` | 63 | Convierte una VAPID public key base64 a `Uint8Array` para `pushManager.subscribe`. | `(base64String)` / Uint8Array. |
| `subscribeWebPush_` | 72 | Obtiene/crea suscripción push del navegador y la registra en `/api/push/subscribe`. | async `(email)` / void. |
| `requestNotifPermission` | 107 (export) | Pide permiso de `Notification` y, si se concede, suscribe a Web Push. | async `(email)` / void. |

## modals/rf-modal.js

Modal "Registro/Fallas" para CALIDAD: menú con Control Calidad / Registrar Falla / Fotos de Soldadura, embebiendo el uploader compartido.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `rfSetInfo` / `rfSetMsg` | 11/12 | Setean texto informativo/mensaje del modal RF. | `(t)` / void. |
| `rfShowMenu_` | 14 | Oculta el uploader embebido y muestra el menú principal del modal. | Sin args / void. |
| `rfOpenStage_` | 22 | Renderiza el stage con botón "Volver" + título y monta el uploader compartido (`showUploaderView`) en pantalla `calidad`/`falla`. | `(screen)` / void. |
| `rfOpenSoldadura_` | 48 | Pantalla especial "Fotos de soldadura": pide `getStatus` al proxy del uploader (mes actual, y si no hay fotos, mes anterior) y pinta una grilla 2x2 de fotos antes/después. | async, sin args / void. |
| `openRFModalForVin_` | 124 (export) | Abre el modal (solo módulo CALIDAD) para un VIN y muestra el menú. | `(vin)` / void. |
| `openRFSoldaduraForVin_` | 150 (export) | Abre el modal directamente en el stage de soldadura (sin pasar por el menú). | `(vin)` / void. |
| `closeRFModal_` | 170 (export) | Destruye el uploader embebido, cierra el modal y resetea estado/menú. | Sin args / void. |
| `initRFModalUI_` | 196 (export) | Bindea (una vez) cierre, botones de menú (control/falla/soldadura) y Escape. | Sin args / void. |

## modals/rf-tecnico-modal.js

Modal "Registro/Fallas" para TECNICO: menú con Parámetros / Registrar Falla / Fotos de Soldadura, todo vía el uploader compartido con pantallas parametrizadas.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `setInfo` / `setMsg` | 10/11 | Setean texto informativo/mensaje del modal RF-TEC. | `(t)` / void. |
| `showMenu_` | 13 | Oculta el uploader embebido y muestra el menú del modal. | Sin args / void. |
| `openStage_` | 20 | Renderiza el stage con botón "Volver" + título dinámico (params/soldadura/falla) y monta el uploader compartido. | `(screen)` / void. |
| `openRFTecModalForVin_` | 52 (export) | Abre el modal (solo módulo TECNICO) para un VIN y muestra el menú. | `(vin)` / void. |
| `closeRFTecModal_` | 72 (export) | Destruye el uploader embebido, cierra el modal y resetea estado/menú. | Sin args / void. |
| `initRFTecModalUI_` | 91 (export) | Bindea (una vez) cierre, botones de menú (params/falla/soldadura) y Escape. | Sin args / void. |

## state/conversion-store.js

Normalización y mezcla de items del store en memoria (`itemsByKey`), y caché de nombres MOTOR/TANQUERO para CALIDAD.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `mergePrevAndCache_` | 21 (export) | Rellena campos faltantes de un item nuevo (`vin`, `tipoRamal`, `updated_at`, `last_nota_ts`, `created_at`) usando el item previo o cachés (`vinCacheGet_`/`ramalCacheGet_`). | `(it, prev)` / item mutado. |
| `applySyncResultToStore_` | 45 (export) | Normaliza y mezcla (incremental) una lista de items de sync dentro de `itemsByKey`. | `(syncData)` / void. |
| `storeFullReplace_` | 57 (export) | Reemplaza completamente `itemsByKey` con una nueva lista normalizada. | `(allItems)` / void. |
| `detectIfNeedsFullRerender_` | 70 (export) | Compara claves activas/finalizadas previas vs. actuales para decidir si se requiere un re-render completo. | `(prevActiveKeys, prevFinalKeys)` / boolean. |
| `clearNombresCache_` | 81 (export) | Invalida el caché de nombres MOTOR/TANQUERO. | Sin args / void. |
| `ensureNombresCache_` | 83 (export) | Devuelve (con TTL 5 min) un `Map<VIN, {motorNombre, tanqueroNombre}>` construido desde `/api/supervisor/report?track=CONVERSION`. | async, sin args / `Map`. |
| `fetchNombresParaVin_` | 110 (export) | Atajo para obtener nombres MOTOR/TANQUERO de un VIN puntual usando el caché anterior. | async `(vin)` / `{motorNombre, tanqueroNombre}`. |

También reexporta `normalizeItem_` desde `../../../work/work-normalize.js`.

## tec-mapa.js

Mapa visual de zonas para el técnico, coloreado según la sugerencia ML de pareja.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `fmtElapsed_` | 11 | Formatea minutos/horas transcurridos desde un ISO string. | `(isoStr)` / string. |
| `classifyZona_` | 22 | Clasifica una zona en un color semántico (`neutral/azul/rojo/verde/verde-soft/gris`) según ocupación y si el compañero en esa zona está en la lista sugerida por ML. | `(z, mySlot, partnerSlot, suggestedNames, hasSuggestedAnywhere)` / string. |
| `renderCard_` | 36 | Genera el HTML de una tarjeta de zona (carro/plaza vacía) con su color. | `(z, color)` / string. |
| `renderMapa_` | 73 | Arma las dos columnas del mapa (izquierda/derecha) e inyecta el HTML en el contenedor. | `(container, zonas, colorMap)` / void. |
| `renderLeyenda_` | 98 | Renderiza la leyenda de colores usados y el rol/top-sugeridos del técnico. | `(leyendaEl, colorMap, myRole, suggestions)` / void. |
| `loadTecMapa_` | 125 (export) | Carga `/api/zonas` + `/api/ml/suggest-next` en paralelo, calcula colores por zona, renderiza mapa+leyenda y bindea el botón de refresco. | async `(containerId, email, especialidad)` / void. |

## ui/conversion-delegation.js

Delegación de eventos (un solo listener por contenedor) para las tarjetas de trabajo activas y finalizadas, en ambos módulos TECNICO/CALIDAD.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `attachWorkDelegationOnce_` | 25 | Bindea (una vez por módulo) los clicks dentro de `#activasBox`: acciones (`data-act`, con validación de prerequisitos y confirmación antes de FIN), navegación a modales (RF/INC/VER_INC/SOLD/CONF vía `data-go`), y botón "Solicitar Ramal". | `(mod)` / void. |
| `showSolRamalToast_` | 228 | Muestra un toast flotante inferior confirmando la solicitud de ramal, autocierra a los 8s. | `(vin)` / void. |
| `attachFinalizadosDelegationOnce_` | 261 | Bindea (una vez por módulo) los clicks dentro de `#finalizadosBox`: INC/VER_INC/RF sobre items ya finalizados. | `(mod)` / void. |
| `initConversionDelegation_` | 332 (export) | Punto de entrada: llama las 4 combinaciones de `attachWorkDelegationOnce_`/`attachFinalizadosDelegationOnce_` para TECNICO y CALIDAD. | Sin args / void. |

## ui/conversion-qr.js

Modal de escaneo QR/código de barras para iniciar VIN, usando el scanner compartido `core/qr-scanner.js`.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `setScanMode_` | 23 (export) | Fija el modo de escaneo del modal principal (QR/BAR). | `(mode)` / void. |
| `openQRModal` | 27 (export) | Abre el modal de QR (solo TECNICO/CALIDAD) e inicia el escáner. | async, sin args / void. |
| `closeQRModal` | 35 (export) | Cierra el modal y detiene el escáner. | async, sin args / void. |
| `startQR` | 40 | Arranca el scanner compartido; al decodificar, setea el VIN en el input correspondiente, cierra el modal y encadena `refreshEstadoForVinRole` → `autoStartFromScan_` → `syncNow` → `refreshEstadoForVinRole` bajo `withLock`. | async, sin args / void. |
| `initConversionQR_` | 67 (export) | Bindea botones de apertura/cierre y de cambio de modo QR/Barras. | Sin args / void. |

## ui/conversion-validar.js

Modal "🔍 Buscar/Validar VIN" para TECNICO: autocomplete + cámara QR + consulta de estado en `/api/vin-validar`.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `openTecBuscarModal_` | 25 (export) | Abre el modal de búsqueda, limpia input/resultado y oculta sugerencias. | async, sin args / void. |
| `closeTecBuscarModal_` | 39 | Detiene el scanner del modal y lo cierra. | async, sin args / void. |
| `bSugFetchResult_` | 49 | Llama `/api/vin-validar?vin=...` y renderiza el resultado. | async `(vin)` / void. **Nota:** usa `getJSON` y (en `renderTecBuscar_`) `escapeHtml` sin importarlos en este archivo (solo se importan `createVinSuggest_`, `createScanner`, `refreshEstadoForVinRole`); posible bug/dependencia implícita de global. |
| `renderTecBuscar_` | 61 | Renderiza el resultado: VIN no encontrado, o ficha con modelo/cliente + órdenes de conversión y asignaciones activas, con botón "Usar este VIN". | `(box, vinCode, j)` / void. |
| `initTecValidar_` | 129 (export) | Bindea apertura/cierre del modal, autocomplete (`bSugAC_`), Enter/Escape en el input, y botón de cámara QR. | Sin args / void. |

Usa la instancia `bSugAC_ = createVinSuggest_({...})` (core/suggest.js) para el autocomplete y `tecBuscarScanner_ = createScanner(...)` (core/qr-scanner.js) para la cámara.

## ui/conversion-vin-autocomplete.js

Autocomplete de VIN para los inputs principales de TECNICO (`#vin`) y CALIDAD (`#vinQ`), reutilizando el widget compartido `createVinSuggest_`.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `handleVinPick_` | 11 | Al elegir un VIN sugerido: refresca estado, y bajo `withLock` hace auto-inicio (`autoStartFromScan_`) + sync forzado + refresco de estado. | async `(vin)` / void. |
| `initVinAutocomplete_` | 49 (export) | Bindea las dos instancias de `createVinSuggest_` (`tecnicoAC`, `calidadAC`, cada una con su propio `guard` de módulo) y listeners de `input` para debouncing del estado (`scheduleEstadoRefresh_`). | Sin args / void. |

Este archivo **sí reutiliza correctamente** `createVinSuggest_` de `core/suggest.js` (vía `core/core.js`) — no reimplementa el patrón de sugerencias.

---

## Posibles duplicados / solapamientos (dentro de esta carpeta)

**1. `modals/rf-modal.js` vs `modals/rf-tecnico-modal.js` — boilerplate de modal casi idéntico, duplicado en vez de compartido.**
Ambos son modales "Registro/Fallas" con la misma forma exacta: un objeto de estado `{open, vin}`, un getter `el`/`rfEl`, `setInfo`/`setMsg`, un `showMenu_`/`rfShowMenu_` que oculta el uploader y muestra el menú, un `openStage_`/`rfOpenStage_` que pinta un header "← Volver" + título y monta `showUploaderView(...)`, una función pública `open...ForVin_` casi calcada, un `close...Modal_` que llama `hideUploaderView`, limpia clases `show`/`modal-open` y resetea estado, y un `init...ModalUI_` que bindea cierre + Escape + botones de menú. Comparar línea a línea:
- `rfShowMenu_` (`modals/rf-modal.js:14-20`) vs `showMenu_` (`modals/rf-tecnico-modal.js:13-18`): mismo cuerpo.
- `rfOpenStage_` (`modals/rf-modal.js:22-46`) vs `openStage_` (`modals/rf-tecnico-modal.js:20-50`): mismo patrón, solo cambia el mapeo de título por `screen`.
- `openRFModalForVin_` (`modals/rf-modal.js:124-147`) vs `openRFTecModalForVin_` (`modals/rf-tecnico-modal.js:52-70`): mismo patrón (valida módulo actual, setea info, abre modal, `showMenu_`).
- `closeRFModal_` (`modals/rf-modal.js:170-194`) vs `closeRFTecModal_` (`modals/rf-tecnico-modal.js:72-89`): mismo patrón.
- `initRFModalUI_` (`modals/rf-modal.js:196-225`) vs `initRFTecModalUI_` (`modals/rf-tecnico-modal.js:91-108`): mismo patrón de binding, solo cambian los IDs de botón/pantalla.
No son archivos redundantes en el sentido de "sobra uno": existen porque CALIDAD y TECNICO tienen menús distintos (Control Calidad/Falla/Soldadura vs. Parámetros/Falla/Soldadura) y el modal de CALIDAD además tiene la pantalla especial `rfOpenSoldadura_` que **no usa el uploader compartido** (hace su propio fetch a `/api/uploader/proxy` y arma su grilla de fotos a mano), mientras que en TECNICO "soldadura" es simplemente `openStage_("soldadura")` delegando en `showUploaderView`. Esa asimetría (misma funcionalidad implementada de dos formas distintas) es en sí un hallazgo: candidato claro a extraer un factory compartido `createRfModal_({modalId, menuId, stageId, screens, moduleGuard})` y a unificar cómo se muestran las fotos de soldadura.

**2. Patrón de apertura/cierre de modal (`bindOnce_`/`close_`/aria-hidden/`modal-open`) reimplementado en cada archivo, sin utilidad compartida en `core/`.**
`modals/confirm-finish.js` (líneas 9-60), `modals/error-modal.js` (líneas 9-59), `modals/conformidad.js` (funciones `confEls_`/`closeConformidadModal_`/`initConformidadUI_`), `modals/rf-modal.js` y `modals/rf-tecnico-modal.js` (ver punto 1), y `modals/incidencias.js` (`openIncidenciaModalForKey_`/`closeIncidenciaModal_`) implementan cada uno, por separado, la misma secuencia: `modal.classList.add/remove("show")`, `setAttribute("aria-hidden", ...)`, `document.body.classList.add/remove("modal-open")`, blur del elemento activo, cierre con click-fuera y cierre con tecla Escape. No existe un `core/modal.js` (se verificó — no hay ningún `export function ...Modal...` en `public/js/core/`). Es un candidato fuerte a extraer un helper común (`bindModalClose_(modalEl, onClose)` / `openModal_`/`closeModal_`) para evitar mantener 5-6 copias de la misma lógica.

**3. `modals/error-modal.js` vs `templates/modals/error-modal.js` — no son duplicados de lógica, pero comparten nombre y podrían confundirse.**
`public/js/templates/modals/error-modal.js` solo exporta `errorModal()` (línea 6), una función que devuelve el **string HTML** estático del modal (usado presumiblemente al armar el layout/shell). `public/js/views/conversion/modals/error-modal.js` es el **controlador** (`showErrorModal`, `showVinNotFoundError`, `showAlreadyAssignedError`) que opera sobre ese HTML ya insertado en el DOM. Son complementarios, no redundantes — pero el nombre de archivo idéntico (`error-modal.js` en dos carpetas distintas) y el hecho de que ninguno importe al otro explícitamente (se conectan solo vía IDs de DOM compartidos: `errorModal`, `errorModalTitle`, etc.) es fuente probable de confusión al buscar "error modal" en el repo.

**4. `modals/incidencia-alert.js`, `modals/incidencias.js` y `modals/ramal-alert.js` — nombres parecidos pero propósitos distintos; el solapamiento real está en el patrón visual de "banner/toast flotante", repetido 4+ veces.**
- `modals/incidencias.js` es el **formulario** que usa CALIDAD para *crear* una incidencia (autocomplete de técnico + foto + gravedad) — no es una alerta.
- `modals/incidencia-alert.js` es el **popup de notificación** que ve el TECNICO cuando le asignan una incidencia (overlay navegable con botón "Solucionada").
- `modals/ramal-alert.js` es una **notificación tipo banner** (no overlay) cuando el ramal fue entregado, con vibración y Web Push.
No son duplicados funcionales, pero el mecanismo de "banner fijo con botón de cierre y auto-dismiss" está reimplementado independientemente en **al menos 4 lugares** con markup muy similar (posición `fixed`, `border-radius`, botón `×`, auto-close por `setTimeout`):
  - `showRamalEntregadoAlert` (`modals/ramal-alert.js:9-59`)
  - `showRamalListoBanner_` (`conversion.js:430-454`)
  - `showColaBanner_` (`conversion.js:477-509`)
  - `showSolRamalToast_` (`ui/conversion-delegation.js:228-259`)
  Estos cuatro son buenos candidatos para un único helper `showBanner_({message, tone, autoCloseMs, onClick})` en `core/`.

**5. `ui/conversion-vin-autocomplete.js` — NO reimplementa el patrón de `core/suggest.js`; sí lo reutiliza correctamente.**
Tanto `ui/conversion-vin-autocomplete.js:25-47` (instancias `tecnicoAC`/`calidadAC`) como `ui/conversion-validar.js:12-22` (`bSugAC_`) llaman a `createVinSuggest_` importado de `core/core.js` (que a su vez re-exporta el de `core/suggest.js`). No hay duplicación aquí. La excepción real de este tipo está en `modals/incidencias.js`: implementa su **propio** autocomplete de técnico manual (`fetchTechSuggest_` línea 422, `incSuggestRender_` línea 364, `incSuggestSetIdx_` línea 388, `onIncTechInput_` línea 438, `onIncTechKeyDown_` línea 476, `setSelectedTech_` línea 398 — todo apuntando a `/api/name-suggest`) en vez de usar `createNameSuggest_`, que **ya existe en `core/suggest.js:141-168`** y consume exactamente el mismo endpoint `/api/name-suggest` con el mismo shape de item (`{userId, name, email, label}`). Este es el solapamiento más concreto y accionable del análisis: `modals/incidencias.js` debería usar `createNameSuggest_` en lugar de sus ~120 líneas de lógica de autocomplete manual.

**6. `data/conversion-sync.js` vs `data/conversion-estado.js` vs `data/conversion-eventos.js` — pipeline "normalizar → mezclar → guardar en store → re-renderizar" repetido 3 veces con variantes.**
Las tres funciones siguientes hacen, con ligeras variaciones, la misma secuencia (`normalizeItem_` → opcionalmente `mergePrevAndCache_` → `itemsByKey.set` → `rebuildListsFromStore_` → `renderActivas_`/`renderFinalizados_`):
  - `refreshEstadoForVinRole` (`data/conversion-estado.js:93-107`) — para un VIN+rol puntual tras consultar `/api/estado` o Supabase.
  - `enviarEvento` (`data/conversion-eventos.js:221-234`) — tras `POST /api/evento`, incluye además `mergePrevAndCache_` y snapshot/restore de notas activas.
  - `syncNow` (`data/conversion-sync.js:411-491`, delegando en `applySyncResultToStore_`/`storeFullReplace_` de `state/conversion-store.js:45-68`) — para la lista completa.
  No es información duplicada por accidente (cada una atiende un escenario distinto: 1 item vs. lista completa vs. tras acción), pero la secuencia "normalizar+guardar+rebuild+render" podría centralizarse en una única función de `state/conversion-store.js` (p. ej. `upsertItemAndRender_(rawItem)`) que las tres reutilicen, reduciendo el riesgo de que una de las tres rutas se desincronice del resto (por ejemplo, `refreshEstadoForVinRole` no restaura notas activas como sí hace `enviarEvento`).
  Adicionalmente, `getScheduleConfig_` (`data/conversion-eventos.js:67-99`, caché TTL 5 min con fallback a `localStorage`) y `ensureNombresCache_` (`state/conversion-store.js:83-108`, caché TTL 5 min) implementan independientemente el mismo patrón "fetch con caché TTL en memoria + manejo de error" — otro caso menor de lógica paralela que podría unificarse en un helper de caché genérico.
