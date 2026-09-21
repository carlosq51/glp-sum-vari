# Análisis de funciones — `public/js/views/uploader/`

Catálogo de funciones/métodos reusables de los 3 archivos del módulo Uploader (wrapper de vista, UI/eventos/scanners, y capa de API/compresión de imágenes).

## uploader.js

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `$u` | 16 | Alias corto de `document.getElementById`. | Recibe `id` (string) → devuelve `HTMLElement\|null`. |
| `initUploaderView` (export) | 18 | Inicializa el controlador principal del uploader sobre `#viewUploader` (pantalla normal, no modal); idempotente vía flag `_inited`. | Recibe `{apsUrl}` opcional → devuelve el controller (`_ctrl`) creado por `initUploaderUI` o `null` si no existe el root. |
| `initUploaderOnMount_` | 60 | Inicializa (o reutiliza desde caché `_ctrlByMount`) un controlador embebido dentro de un `mountId` (para modales), clonando el HTML de `#viewUploader`. | Recibe `mountId`, `{apsUrl, onBackControl}` → devuelve el controller del mount o `null`. |
| `showUploaderView` (export) | 113 | Punto de entrada para mostrar el uploader, en modo normal o embebido (modal) según si viene `mountId`; delega en `initUploaderOnMount_`/`initUploaderView` y llama `ctrl.show(...)`. | Recibe objeto `{vin, screen, dateStr, mountId, inModal, onBackControl, apsUrl}` → sin retorno (side-effect en DOM). |
| `hideUploaderView` (export) | 149 | Oculta el uploader; en modo embebido detiene scanners y vacía el `mount`; en modo normal llama `_ctrl.hide()` y oculta `#viewUploader`. | Recibe `{mountId}` opcional → sin retorno. |

## uploader-ui.js

Todas las funciones (salvo `initUploaderUI`) son closures internas creadas dentro de `initUploaderUI(root, options)`; no se exportan individualmente.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `initUploaderUI` (export) | 21 | Factory principal: monta estado local, scanners, wiring de eventos y expone API pública del controlador. | Recibe `root` (elemento DOM), `options {apsUrl, onBackControl}` → devuelve `{show, hide, refreshStatus, showScreen, stopAllScanners}`. |
| `$` (closure) | 23 | Selector con prefijo `up_` acotado al `shell` del uploader. | Recibe `id` → devuelve elemento o `null`. |
| `setText` | 68 | Escribe texto en un elemento por id (usa `$`). | Recibe `id, txt` → sin retorno. |
| `getQueryParam` | 73 | Lee un parámetro de la query string actual. | Recibe `name` → devuelve string (o `""`). |
| `showScreen` | 83 | Cambia de pantalla interna (menu/params/falla/calidad/conformidad/soldadura), detiene scanners y consulta el estado remoto al entrar a "params" o a "calidad". | Recibe `name` → sin retorno. |
| `openBackControl` | 96 | Ejecuta el callback `onBackControl` de las options, o hace fallback a `showScreen("menu")`. | Sin parámetros → sin retorno. |
| `openImageModal` | 108 | Abre el lightbox de imagen con una URL dada. | Recibe `src` → sin retorno. |
| `closeImageModal` | 117 | Cierra el lightbox de imagen. | Sin parámetros → sin retorno. |
| `setPreview` | 129 | Renderiza preview local (File) de un slot, con manejo especial para HEIC/HEIF. | Recibe `slot, file` → sin retorno. |
| `setRemotePreview` | ~270 | Renderiza preview remoto (ya en R2) de CUALQUIER slot, con fallback thumb→img. | Recibe `slot, p` (objeto preview con `thumbUrl/imgUrl`) → sin retorno. |
| `pintarPreviewsRemotos` | ~480 | Aplica `setRemotePreview` a una lista de slots desde una respuesta de `getStatus`. | Recibe `slots, j` → sin retorno. |
| `pintarTarjetas` | ~430 | Pone en verde las tarjetas que el servidor da por guardadas, respetando las que están en error o subiendo. | Recibe `slots, estado` → sin retorno. |
| `pieDeGrupo` | ~330 | Escribe la cuenta "N/4 guardadas" bajo un grupo de tarjetas. | Recibe `id, slots, estado, sufijo` → devuelve cuántas van. |
| `idDeGrupo` | ~385 | Grupo (`comp`/`qc`) al que pertenece un slot, o `""` si va solo. | Recibe `slot` → string. |
| `refreshQcStatus` | ~800 | Estado remoto de las 4 fotos de calidad (antes esta pantalla no lo tenía y se repetían fotos ya subidas). | Sin parámetros → `Promise<void>`. |
| `subirASlot` | ~930 | Sube un archivo al slot indicado usando el VIN/fecha/bitácora de SU pantalla, y refresca. | Recibe `slot, file` → `Promise<respuesta>`. |
| `renderStatus` | 230 | Construye texto resumen de estado (VIN, carpeta, faltantes) a partir de la respuesta de `getStatus`. | Recibe `j` (respuesta status) → sin retorno (escribe en `#out`). |
| `refreshStatus` | 265 | Llama `getStatus` (API) para el VIN/fecha actuales, renderiza status y previews remotos. | Sin parámetros (lee del DOM) → `Promise<void>`. |
| `uploadOneClient` | ~500 | Wrapper de `uploadOne` (API) para un slot individual: valida VIN, guarda el File para el reintento, reintenta solo los fallos de red y actualiza preview/estado. | Recibe `slot, file, outId, vinOverride, dateOverride` → `Promise<{ok, ...}>`. |
| `renderFalla` | 418 | Renderiza grilla de miniaturas de fotos de "falla" con botón de quitar. | Sin parámetros (lee `fallaFiles`) → sin retorno. |
| `addFallaFiles` | 459 | Agrega archivos al array `fallaFiles` y re-renderiza. | Recibe `fileList` → sin retorno. |
| `renderConfPhoto` | 550 | Renderiza preview de la foto única de conformidad. | Sin parámetros (lee `confFile`) → sin retorno. |
| `openConformidad` | 567 | Prepara y muestra la pantalla de conformidad para un tipo (TANQUE/REDUCTOR), reseteando checklist/foto. | Recibe `tipo` → sin retorno. |
| `stopScanner` | 627 | Detiene un scanner QR/barras específico y oculta su UI. | Recibe `which` (clave de `scannerMap`) → `Promise<void>`. |
| `stopAllScanners` | 642 | Detiene todos los scanners (params/falla/qc/conf/sold); expuesto en la API pública del controller. | Sin parámetros → `Promise<void>`. |
| `startScanner` | 650 | Inicia un scanner (QR o barras) para una pantalla, con callback `onDecoded` que setea el VIN. | Recibe `which, mode` → `Promise<void>`. |
| `applyVinFromUrl` | 686 | Aplica VIN/fecha/pantalla iniciales desde query params de la URL a todos los formularios. | Sin parámetros → sin retorno. |
| `setDefaultDates` | 716 | Setea fecha de hoy por defecto en todos los inputs de fecha si están vacíos. | Sin parámetros → sin retorno. |
| `refreshSoldStatus` | 728 | Llama `getStatus` (API) para VIN/fecha de soldadura, actualiza previews remotos y contador "X/4". | Sin parámetros (lee del DOM) → `Promise<void>`. |
| `wireEvents` | 753 | Registra todos los listeners de click/change del shell (navegación, pickers, uploads, scanners, envío de falla/calidad/conformidad). | Sin parámetros → sin retorno (side-effect, ~420 líneas). |
| `show` (retornada) | 1182 | API pública: setea VIN/fecha en todos los formularios, muestra el root y navega a la pantalla pedida. | Recibe `{vin, screen, dateStr}` → sin retorno. |
| `hide` (retornada) | 1220 | API pública: detiene scanners y oculta el root. | Sin parámetros → sin retorno. |

## uploader-api.js

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `todayYYYYMMDD` (export) | 10 | Formatea la fecha actual como `YYYY-MM-DD`. | Sin parámetros → `string`. |
| `humanBytes` (export) | 18 | Formatea bytes a texto legible (B/KB/MB/GB). | Recibe `n` (número) → `string`. |
| `callAPS` (export) | 31 | Wrapper de `fetch` POST JSON hacia el endpoint APS (`/api/uploader/proxy` por defecto); parsea respuesta y lanza error si HTTP no-ok o respuesta no-JSON. | Recibe `payload, apsUrl` → `Promise<object>`. |
| `fileToB64Compressed` (export) | 53 | Convierte un `File` a base64, comprimiendo imágenes vía `<canvas>` (máx 800px ancho, calidad 0.55); pasa sin comprimir si es HEIC/HEIF, no-imagen, o si falla la compresión. | Recibe `file` (File) → `Promise<string>` (base64 sin prefijo data URL). |
| `getStatus` (export) | 154 | Consulta estado de fotos subidas para un VIN/fecha. | Recibe `{vin, dateStr, apsUrl}` → `Promise<object>` (via `callAPS`). |
| `uploadOne` (export) | 158 | Sube una foto individual a un slot, comprimiendo primero y detectando mimeType HEIC. | Recibe `{vin, dateStr, slot, file, apsUrl}` → `Promise<object>` (via `callAPS`). |
| `uploadFalla` (export) | 169 | Sube un lote de fotos de "falla" + nota, comprimiendo cada una y reportando progreso. | Recibe `{vin, dateStr, note, files, onProgress, apsUrl}` → `Promise<object>`. |
| `uploadConformidad` (export) | 222 | Sube foto + checklist + datos de conformidad de un equipo. | Recibe `{tipo, vin, dateStr, tecnico, checklist, file, onProgress, apsUrl}` → `Promise<object>`. |
| `deleteSlot` (export) | 250 | Solicita borrado de la foto de un slot en el backend. | Recibe `{vin, dateStr, slot, apsUrl}` → `Promise<object>`. |

También exporta las constantes `APS_URL` (línea 6) y `CONTROL_URL` (línea 8), no funciones.

## Posibles duplicados / solapamientos (dentro de esta carpeta)

- **`uploader-api.js:31-51` (`callAPS`) reimplementa el wrapper de `postJSON` en vez de usarlo.** `public/js/core/api.js:101-135` ya define `postJSON(url, body)` con fetch POST + `Content-Type: application/json` + parseo de JSON + manejo de errores HTTP. `callAPS` hace lo mismo pero convierte el `_statusCode` en excepción, porque los callers del uploader esperan `throw` y no `{ok:false}`. Sigue siendo una capa de red con manejo de errores distinto al del resto de la app.
- **`uploader.js` y `uploader-ui.js` no tienen funciones redundantes entre sí** — están en capas distintas (wrapper de vista/modal vs. UI interna). Sí hay dos rutas de inicialización paralelas dentro de `uploader.js`: `initUploaderView` (18-56) e `initUploaderOnMount_` (60-101) arman el mismo objeto de opciones y llaman a `initUploaderUI`; podrían unificarse en una sola parametrizada por `root`/`mountId`.
- **La duplicación entre compresión y calidad ya no existe** (era el grueso de esta sección). Las dos mantenían su propio buffer de 4 fotos con `clearComp`/`clearQc`, `renderCompPreviews`/`renderQc`, `addCompOne`/`addQcOne` y cuatro handlers de picker casi idénticos, más `setRemoteCompPreview` como copia de `setRemotePreview`. Hoy cada foto es una tarjeta (`tarjetaFoto_` en el template) y las tres pantallas —parámetros, soldadura y calidad— se cablean con el mismo registro de slots: cambia el VIN, la fecha y la bitácora, no el comportamiento.
- **`uploadCalidadBatch` se eliminó**: mandaba las cuatro fotos de calidad en un lote a las mismas rutas de R2 a las que cada foto ya había subido sola al tomarla. Subía todo dos veces y, al ser todo-o-nada, una foto caída hacía que el mensaje dijera "no se guardó" con las cuatro ya en el bucket. La acción `uploadCalidad` del servidor sigue existiendo para Apps Script.
