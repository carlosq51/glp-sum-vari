# Análisis de funciones — `public/js/templates/`

Catálogo de todas las funciones exportadas/reusables definidas en los 18 archivos de `public/js/templates/` (layout, modals, views). Cada archivo genera HTML como *template strings*; no hay lógica de negocio, solo construcción de marcado y wiring de `id`s que luego consume el JS de comportamiento (fuera de esta carpeta).

## layout/loading-overlay.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `loadingOverlay()` | 6 | Renderiza el overlay global de "Procesando…" (spinner + puntos animados) usado durante operaciones async. | No recibe params. Devuelve `string` HTML con `#loadingOverlay` (clase `overlay hidden`). |

## layout/topbar.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `topbarView()` | 6 | Renderiza la barra superior de la app: título, saludo de usuario, pill de rol, botón de logout, botón de tema y botón de acceso a "Registro/Fallas". | No recibe params. Devuelve `string` HTML del bloque `.topbarShell`. |

## layout/shell.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `appShell()` | 23 | Orquesta el HTML raíz de toda la aplicación: concatena `loginView`, `topbarView`, todas las vistas por rol (`hubView`, `tecnicoView`, `ramaleroView`, `calidadView`, `movilizadorView`, `supervisorView`, `adminView`, `uploaderView`) y todos los modales globales (`loadingOverlay`, `qrModal`, `conformidadModal`, `incidenciasModal`, `rfModal`, `rfTecnicoModal`, `confirmFinishModal`, `errorModal`, `supIncModal`, `liveDetailModal`, `supValidarQrModalTemplate`, `tecBuscarModalTemplate`, `adminCrudModal`). | No recibe params. Devuelve `string` HTML completo de `<div id="viewApp">` + overlay + modales. Es el punto de entrada que arma el DOM inicial. |

## modals/confirm-finish-modal.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `confirmFinishModal()` | 6 | Renderiza el modal de confirmación genérico para "finalizar" un trabajo (título/texto configurables por JS externo vía `#confirmFinishTitle`/`#confirmFinishText`, botones Cancelar/Sí-finalizar). | No recibe params. Devuelve `string` HTML de `#confirmFinishModal` (clase `modal modalConfirm`). |

## modals/conformidad-modal.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `conformidadModal()` | 6 | Renderiza el modal de "Registro de conformidad de equipo": input de código + botón QR, lector QR embebido, checklist de 3 verificaciones y botón de guardar. | No recibe params. Devuelve `string` HTML de `#confModal`. |

## modals/qr-modal.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `qrModal()` | 6 | Renderiza el modal genérico de escaneo QR/código de barras (usado como modal "central" de la app, distinto de los QR embebidos en otras vistas). | No recibe params. Devuelve `string` HTML de `#qrModal` con `#qrReader`, botones `#btnScanQR`/`#btnScanBar` y `#qrMsg`. |

## modals/error-modal.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `errorModal()` | 6 | Renderiza el modal genérico de error (título/texto/detalles configurables externamente vía `#errorModalTitle`/`#errorModalText`/`#errorModalDetails`, botón "Entendido"). | No recibe params. Devuelve `string` HTML de `#errorModal` (clase `modal modalConfirm`). |

## modals/rf-tecnico-modal.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `rfTecnicoModal()` | 6 | Renderiza el modal "Registro/Fallas" para el rol técnico: menú con 3 tarjetas (Registrar parámetros, Registrar falla, Fotos de soldadura) y un contenedor `#rfTecStage` donde se inyecta el sub-flujo elegido. | No recibe params. Devuelve `string` HTML de `#rfTecModal`. |

## modals/rf-calidad-modal.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `rfModal()` | 6 | Renderiza el modal "Registro" para el rol calidad: menú con 3 tarjetas (Control de Calidad, Registrar falla, Ver fotos de soldadura) y contenedor `#rfStage` para el sub-flujo. | No recibe params. Devuelve `string` HTML de `#rfModal`. |

## modals/incidencias-modal.js

| Función / Const | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `INC_TITULOS` (const array, exportado) | 6–30 | Catálogo fijo de los 23 tipos de incidencia (CABLEADO, MANGUERA, FUGA DE GAS, etc.) usado para poblar el `<select>` de tipo. | Array de strings; consumido internamente y re-exportado para uso externo (p.ej. filtros de reporte). |
| `incidenciasModal()` | 34 | Renderiza el modal de registro de incidencias: buscador de técnico con sugerencias, select de tipo (poblado desde `INC_TITULOS`), radio de gravedad (LEVE/MODERADA/CRITICA), nota y captura/carga de foto opcional con preview. | No recibe params. Devuelve `string` HTML de `#incModal`. Internamente mapea `INC_TITULOS` a `<option>` (helper anónimo `tituloOpts`, trivial, no documentado aparte). |

## views/login-view.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `loginView()` | 6 | Renderiza la pantalla de inicio de sesión (input de email + botón). | No recibe params. Devuelve `string` HTML de `#viewLogin`. |

## views/uploader-view.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `uploaderView()` | 6 | Renderiza la vista completa "Uploader GLP": menú inicial + 5 pantallas (`up_screenParams`, `up_screenFalla`, `up_screenCalidad`, `up_screenConformidad`, `up_screenSoldadura`) con sus slots de carga de fotos (cámara/archivo/borrar por slot), lectores QR embebidos por pantalla, y un visor fullscreen de imágenes (`#up_imgModal`). Es el archivo más largo de la carpeta; toda la estructura de slots está hardcodeada inline (no hay sub-funciones). | No recibe params. Devuelve `string` HTML de `#viewUploader`. |

## views/calidad-view.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `calidadView()` | 6 | Renderiza la vista "Control de Calidad": buscador/creador de OT por VIN, botones de finalizados/refrescar, botón de "sugerencias de cola", y un modal propio (`#calSugModal`) con las 3 OTs más antiguas en espera. | No recibe params. Devuelve `string` HTML de `#viewCALIDAD` + `#calSugModal`. |

## views/hub-view.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `hubView()` | 6 | Renderiza el hub de selección de módulo tras login: saludo, grid de cartillas (`#hubButtons`, poblado dinámicamente por JS externo) y panel de ajustes de apariencia (tema, tamaño de texto, color de acento). | No recibe params. Devuelve `string` HTML de `#viewHub`. |

## views/admin-view.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `adminView()` | 6 | Renderiza el panel Admin: vista de cartillas de secciones (`#adminCardGrid`) y vista de detalle con toolbar de búsqueda/nuevo + tabla (`#adminTableContent`). | No recibe params. Devuelve `string` HTML de `#viewADMIN`. |
| `adminCrudModal()` | 41 | Renderiza el modal CRUD genérico del Admin (título, cuerpo dinámico `#adminModalBody` rellenado por `admin.js`, botones Cancelar/Guardar). | No recibe params. Devuelve `string` HTML de `#adminModal`. |

## views/supervisor-view.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `supervisorView()` | 2 | Renderiza la vista Supervisor con 5 pestañas (REPORTE, LIVE, UBICACIONES, INCIDENCIAS, VALIDAR): filtros de reporte (nombre/VIN/fechas/mes/marca), KPIs, gráfico de tendencias, panel LIVE, panel de Ubicaciones (con paneles colapsables `movPanel`/`ubPanel0-3` y mapa de zonas), panel de reporte global de Incidencias (filtros, KPIs, ranking, lista) y panel VALIDAR (búsqueda de VIN + QR). | No recibe params. Devuelve `string` HTML de `#viewSUPERVISOR`. |
| `supValidarQrModalTemplate()` | 251 | Renderiza el modal QR exclusivo de la pestaña VALIDAR, colocado **fuera** de `viewSUPERVISOR` a propósito para evitar un bug de WebKit con `position:fixed` dentro de un padre `display:none`. | No recibe params. Devuelve `string` HTML de `#supValidarQrModal`. |
| `supIncModal()` | 269 | Renderiza el modal de "Incidencias registradas" (lista) compartido entre Supervisor y Calidad. | No recibe params. Devuelve `string` HTML de `#supIncModal`. |
| `liveDetailModal()` | 288 | Renderiza el modal de detalle del día de un técnico para el panel LIVE. | No recibe params. Devuelve `string` HTML de `#liveDetailModal`. |

## views/tecnico-view.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `tecnicoView()` | 6 | Renderiza la vista Técnico: cartillas de navegación (`#tecCardGrid`) y 5 paneles (Mi OT, Cola pendiente, Mi rendimiento, Mis incidencias, Mapa de zonas), cada uno con su propio header "← Volver". Incluye además controles ocultos (`#accion`, `#nota`, botones stub) usados por `delegation.js`. | No recibe params. Devuelve `string` HTML de `#viewTECNICO`. |
| `tecBuscarModalTemplate()` | 121 | Renderiza el modal de búsqueda de VIN para conversión, colocado fuera de `viewTECNICO` por el mismo motivo WebKit que `supValidarQrModalTemplate`. | No recibe params. Devuelve `string` HTML de `#tecBuscarModal`. |

## views/movilizador-view.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `movilizadorView()` | 6 | Renderiza la vista Movilizador: modal QR embebido, hub de cartillas (`#movCardGrid`) y 5 "screens" (Lista del día, Ingreso, Zona de Espera, Salida, Mapa de Zonas), cada uno con header "← Volver" y, donde aplica, paneles colapsables `movPanel0-3`. | No recibe params. Devuelve `string` HTML de `#viewMOVILIZADOR`. |

## views/ramalero-view.js

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `ramaleroView()` | 6 | Renderiza la vista Ramalero: selector de tipo de ramal + ID autogenerado, botón "Nuevo ramal", botones finalizados/refrescar, botón de solicitudes de ramal (con badge) y listas de activos/finalizados. | No recibe params. Devuelve `string` HTML de `#viewRAMALERO`. |

## Posibles duplicados / solapamientos (dentro de esta carpeta)

1. **Modal de confirmación genérico duplicado dos veces.** `modals/confirm-finish-modal.js:6` (`confirmFinishModal`) y `modals/error-modal.js:6` (`errorModal`) son estructuralmente idénticos: misma clase `modal modalConfirm` / `modalConfirmBox`, mismo `modalHead` con título+botón `✕`, mismo texto en `.small` con `line-height:1.5`, misma fila de botones `flex:1`. Son dos instancias del mismo "patrón de modal de confirmación/alerta" que podrían generarse con una sola función parametrizada (título, texto, botones).

2. **Modal de "menú de sub-flujos" duplicado para técnico y calidad.** `modals/rf-tecnico-modal.js:6` (`rfTecnicoModal`) y `modals/rf-calidad-modal.js:6` (`rfModal`) comparten exactamente la misma estructura: `.modalHead` + `#…Info` + `#…Menu` con `.card` por opción (título, descripción, botón "Entrar") + `#…Stage` oculto + `#…Msg`. Solo cambian los `id`s y el contenido de las tarjetas (3 en técnico, 3 en calidad, con una tarjeta de "soldadura" en ambos, en direcciones opuestas: subir vs. ver fotos). Candidato claro a una única función `menuModal({idPrefix, titulo, opciones})`.

3. **Header de modal (`modalHead` + `modalTitle` + botón `✕` "Cerrar") repetido en prácticamente todos los archivos de modal y en 4 modales adicionales de `views/`.** Aparece en: `modals/confirm-finish-modal.js:13-16`, `modals/conformidad-modal.js:13-16`, `modals/qr-modal.js:13-16`, `modals/error-modal.js:13-16`, `modals/rf-tecnico-modal.js:10-13`, `modals/rf-calidad-modal.js:13-16`, `modals/incidencias-modal.js:45-48`, `views/admin-view.js:46-49` (`adminCrudModal`), `views/supervisor-view.js:255-258` (`supValidarQrModalTemplate`), `views/supervisor-view.js:273-276` (`supIncModal`), `views/supervisor-view.js:292-295` (`liveDetailModal`), `views/tecnico-view.js:125-128` (`tecBuscarModalTemplate`). Son 12 copias manuales del mismo bloque de 3-4 líneas; un helper `modalHeader(id, titulo)` eliminaría toda la duplicación.

4. **Modal de escaneo QR/código de barras reimplementado múltiples veces en vez de reusar `modals/qr-modal.js`.** Además del modal genérico `qrModal()` (`modals/qr-modal.js:6`), hay lectores/():modales QR propios en: `modals/conformidad-modal.js:29-37` (`#confQrWrap` con `#qrReader_conf`), `views/supervisor-view.js:251-266` (`supValidarQrModalTemplate`, `#supValidarQrReader`), `views/tecnico-view.js:121-146` (`tecBuscarModalTemplate`, `#tecBuscarQrReader`), `views/movilizador-view.js:11-22` (`#movQrModal` embebido con `#movQrReader`), y **5 lectores QR distintos dentro de `views/uploader-view.js`** (uno por pantalla: `#up_qrReader_params` L.91, `#up_qrReader_falla` L.302, `#up_qrReader_qc` L.373, `#up_qrReader_conf` L.450, `#up_qrReader_sold` L.540), todos con el mismo patrón `botón Escanear QR / botón Escanear Barras / botón Detener / div lector / mensaje`. Son al menos 9 reimplementaciones del mismo widget de escaneo.

5. **Patrón "header de panel con botón Volver" (`.adminDetailHead` + `.adminBackBtn` + título) copiado repetidamente en dos archivos.** Originado en `views/admin-view.js:20-23`, se repite 5 veces dentro de `views/tecnico-view.js` (líneas 24-27, 58-61, 67-70, 76-79, 85-88, una por cada panel: Mi OT, Cola, Rendimiento, Incidencias, Mapa) y 5 veces dentro de `views/movilizador-view.js` (líneas 46-49, 79-82, 116-119, 148-151, 196-199, una por cada "screen"). En total son ~11 copias manuales del mismo bloque de 4 líneas que solo cambian el texto del título — buen candidato a una función `panelBackHeader(titulo)`.

6. **Barra "Mapa de zonas" (`.zonasMapaBar` + timestamp + botón refrescar) triplicada.** Aparece con la misma estructura en `views/supervisor-view.js:112-115` (`#supZonasMapaTs`/`#supZonasMapaRefreshBtn`), `views/tecnico-view.js:90-93` (`#tecMapaTs`/`#tecMapaRefreshBtn`) y `views/movilizador-view.js:200-203` (`#movZonasMapaTs`/`#movZonasMapaRefreshBtn`). Tres copias idénticas salvo el prefijo del `id`.

7. **Panel colapsable "movPanel" (icono + título + hint + chevron) repetido ~9 veces entre dos archivos.** `views/movilizador-view.js` lo usa 4 veces (`movPanel0` L.101, `movPanel1` L.121, `movPanel2` L.133, `movPanel3` L.181) y `views/supervisor-view.js` lo reutiliza otras 5 veces dentro del panel UBICACIONES (`ubPanelZonas` L.102, `ubPanel0` L.128, `ubPanel1` L.142, `ubPanel2` L.156, `ubPanel3` L.170) — de hecho estos últimos son casi un calco literal (mismos textos "Conversión Finalizada", "Zona de Espera", "Revisión Técnica Finalizada") de los paneles del movilizador, solo que en modo solo-lectura. Fuerte candidato a extraer una función `movPanel({icon, title, hint, bodyId, badgeId})`.

8. **Widget "input + sugerencias + botón QR" para búsqueda de VIN, reimplementado en 6+ lugares.** El trío `<div class="vinWrap"><input .../><div class="vinSuggest hidden" role="listbox"></div></div>` + botón `📷` aparece en: `views/tecnico-view.js:31-35` (`#vin`/`#vinSuggest`/`#btnQR`), `views/calidad-view.js:17-22` (`#vinQ`/`#vinSuggestQ`/`#btnQRQ`), `views/supervisor-view.js:44-48` (`#supVin`/`#supVinSuggest`/`#btnSupQR`) y `views/supervisor-view.js:230-235` (`#supValidarVin`/`#supValidarVinSuggest`/`#btnSupValidarQr`), `views/movilizador-view.js:88-94` (`#movVinEntrada`) y `views/movilizador-view.js:157-163` (`#movSalidaVinSearch`). Mismo patrón visual y de comportamiento, seis copias con distintos `id`s.

9. **Widget "buscador de nombre con sugerencias" (`supNameWrap`/`nameSuggest`) duplicado entre Supervisor e Incidencias.** `views/supervisor-view.js:32-40` (`#supName`/`#supNameSuggest`) y `modals/incidencias-modal.js:58-61` (`#incTechInput`/`#incTechSuggest`) usan literalmente las mismas clases CSS (`supNameWrap`, `nameSuggest hidden`) para el mismo tipo de combobox de búsqueda de persona, a pesar de vivir en archivos y contextos distintos.

10. **Fila de 3 botones "Foto / Cargar / Borrar" (cámara + archivo + limpiar) reimplementada muchas veces.** Dentro de `views/uploader-view.js` este bloque (`.slotActions.upActions` con `data-pick="cam"`, `data-pick="file"`, `data-clear="1"`) se repite **11 veces** (slots `vin`, `comp`, `corr_pre`, `corr_post`, `voltaje`, `scan_carro`, más los 4 slots de soldadura y el de falla/QC/conformidad con IDs propios `up_btnFallaCam` etc.), y el mismo patrón conceptual (foto cámara / cargar archivo / borrar, con preview) reaparece en `modals/incidencias-modal.js:96-123` (`#btnIncFotoCam`/`#btnIncFotoFile`/`#btnIncFotoClear` + `#incFotoPreview`). Es, con diferencia, el patrón más repetido de toda la carpeta y el mejor candidato a una función `photoSlot({idPrefix, label, multiple})`.
