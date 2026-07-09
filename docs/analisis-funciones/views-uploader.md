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
| `showScreen` | 83 | Cambia de pantalla interna (menu/params/falla/calidad/conformidad/soldadura), detiene scanners y refresca status si entra a "params". | Recibe `name` → sin retorno. |
| `openBackControl` | 96 | Ejecuta el callback `onBackControl` de las options, o hace fallback a `showScreen("menu")`. | Sin parámetros → sin retorno. |
| `openImageModal` | 108 | Abre el lightbox de imagen con una URL dada. | Recibe `src` → sin retorno. |
| `closeImageModal` | 117 | Cierra el lightbox de imagen. | Sin parámetros → sin retorno. |
| `setPreview` | 129 | Renderiza preview local (File) de un slot, con manejo especial para HEIC/HEIF. | Recibe `slot, file` → sin retorno. |
| `setRemotePreview` | 167 | Renderiza preview remoto (ya subido a Drive) para un slot genérico, con fallback thumb→img. | Recibe `slot, p` (objeto preview con `thumbUrl/imgUrl`) → sin retorno. |
| `setRemoteCompPreview` | 198 | Igual que `setRemotePreview` pero para slots de compresión (`comp_p{idx}`), casi copia literal. | Recibe `idx1to4, p` → sin retorno. |
| `renderStatus` | 230 | Construye texto resumen de estado (VIN, carpeta, faltantes) a partir de la respuesta de `getStatus`. | Recibe `j` (respuesta status) → sin retorno (escribe en `#out`). |
| `refreshStatus` | 265 | Llama `getStatus` (API) para el VIN/fecha actuales, renderiza status y previews remotos. | Sin parámetros (lee del DOM) → `Promise<void>`. |
| `uploadOneClient` | 299 | Wrapper de `uploadOne` (API) para un slot individual; valida VIN, sube y actualiza preview remoto/mensaje. | Recibe `slot, file, outId, vinOverride, dateOverride` → `Promise<{ok, ...}>`. |
| `clearComp` | 337 | Resetea estado y UI de las 4 fotos de compresión. | Sin parámetros → sin retorno. |
| `renderCompPreviews` | 351 | Pinta miniaturas locales de las 4 fotos de compresión seleccionadas. | Sin parámetros (lee `compFilesVisual`) → sin retorno. |
| `addCompOne` | 377 | Agrega una foto de compresión al primer slot libre, la sube y refresca status. | Recibe `file` → `Promise<void>`. |
| `onPickCompCam` | 394 | Handler de selección de foto de compresión vía cámara. | Recibe `fileList` → `Promise<void>`. |
| `onPickCompFiles` | 402 | Handler de selección múltiple de fotos de compresión (toma últimas 4). | Recibe `fileList` → `Promise<void>`. |
| `renderFalla` | 418 | Renderiza grilla de miniaturas de fotos de "falla" con botón de quitar. | Sin parámetros (lee `fallaFiles`) → sin retorno. |
| `addFallaFiles` | 459 | Agrega archivos al array `fallaFiles` y re-renderiza. | Recibe `fileList` → sin retorno. |
| `clearQc` | 469 | Resetea estado y UI de las fotos de calidad (QC). | Sin parámetros → sin retorno. |
| `renderQc` | 483 | Pinta miniaturas locales de las hasta 4 fotos de calidad, casi idéntico a `renderCompPreviews`. | Sin parámetros (lee `qcFiles`) → sin retorno. |
| `addQcOne` | 505 | Desplaza el buffer de 4 fotos QC (FIFO) y sube la nueva vía `uploadOneClient`. | Recibe `file` → `Promise<void>`. |
| `onPickQcCam` | 526 | Handler de selección de foto QC vía cámara. | Recibe `fileList` → `Promise<void>`. |
| `onPickQcFiles` | 534 | Handler de selección múltiple de fotos QC (toma últimas 4). | Recibe `fileList` → `Promise<void>`. |
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
| `uploadCalidadBatch` (export) | 194 | Sube un lote de fotos de calidad (`items: [{slot, file}]`), comprimiendo cada una y reportando progreso. | Recibe `{vin, dateStr, items, onProgress, apsUrl}` → `Promise<object>`. |
| `uploadConformidad` (export) | 222 | Sube foto + checklist + datos de conformidad de un equipo. | Recibe `{tipo, vin, dateStr, tecnico, checklist, file, onProgress, apsUrl}` → `Promise<object>`. |
| `deleteSlot` (export) | 250 | Solicita borrado de la foto de un slot en el backend. | Recibe `{vin, dateStr, slot, apsUrl}` → `Promise<object>`. |

También exporta las constantes `APS_URL` (línea 6) y `CONTROL_URL` (línea 8), no funciones.

## Posibles duplicados / solapamientos (dentro de esta carpeta)

- **`uploader-api.js:31-51` (`callAPS`) reimplementa el wrapper de `postJSON` en vez de usarlo.** `public/js/core/api.js:101-135` ya define `postJSON(url, body)` con fetch POST + `Content-Type: application/json` + parseo de JSON + manejo de errores HTTP. `callAPS` hace básicamente lo mismo (fetch POST JSON, parseo, throw si `!res.ok` o respuesta no-JSON) pero con su propia lógica ligeramente distinta (usa `res.text()` + `JSON.parse` manual en vez de `res.json()`, y siempre lanza en vez de devolver `{ok:false, _statusCode}` como hace `postJSON`). Ninguno de los tres archivos (`uploader.js`, `uploader-ui.js`, `uploader-api.js`) importa nada de `core/api.js` — no hay ningún `import ... from "../../core/api.js"` en la carpeta. Esto es una reimplementación paralela de la capa de red, con comportamiento de manejo de errores distinto al del resto de la app (que sí usa `postJSON`/`getJSON`/`withLock`).
- **`uploader.js` y `uploader-ui.js` no tienen funciones verdaderamente redundantes entre sí** — están en capas distintas (wrapper de vista/modal vs. UI interna) y `uploader.js` delega correctamente en el controller devuelto por `initUploaderUI` (`ctrl.show`, `ctrl.hide`, `ctrl.stopAllScanners`). Sí hay dos rutas de inicialización paralelas y muy similares dentro de `uploader.js`: `initUploaderView` (línea 18-56) e `initUploaderOnMount_` (línea 60-101) ambas arman el mismo objeto de opciones (`{apsUrl, onBackControl}`) y llaman a `initUploaderUI`; podrían unificarse en una sola función parametrizada por `root`/`mountId`.
- **Duplicación interna en `uploader-ui.js` entre los flujos de "compresión" y "calidad" (QC)**, ambos manejan un buffer de hasta 4 fotos con patrones casi idénticos:
  - `clearComp` (línea 337) vs `clearQc` (línea 469): misma estructura (resetear array, limpiar 4 cajas de preview, limpiar inputs cam/file).
  - `renderCompPreviews` (línea 351) vs `renderQc` (línea 483): mismo bucle de renderizado de 4 miniaturas con `URL.createObjectURL` + revoke a los 15s.
  - `onPickCompCam`/`onPickCompFiles` (líneas 394, 402) vs `onPickQcCam`/`onPickQcFiles` (líneas 526, 534): mismos handlers (tomar 1 foto de cámara / hasta 4 de archivo).
  - `addCompOne` (línea 377) vs `addQcOne` (línea 505): lógica de inserción distinta (primer slot libre vs. desplazamiento FIFO) pero mismo propósito general de "agregar 1 foto y subirla".
- **`setRemotePreview` (línea 167) y `setRemoteCompPreview` (línea 198) son casi código duplicado**: ambas construyen un `<img>` con los mismos estilos inline, mismo fallback `thumbUrl→imgUrl` y mismo manejo de `onerror`; solo cambia el id de la caja destino (`{slot}_previewBox` vs `comp_p{idx}`) y el texto de fallback. Son candidatas claras a unificarse en una sola función parametrizada por el elemento contenedor.
