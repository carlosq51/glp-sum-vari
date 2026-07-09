# Análisis de funciones — `public/js/views/ramalero/`

Catálogo de funciones/métodos reusables de los 5 archivos de la vista "ramalero" (rol de trabajo que gestiona la entrega/instalación de ramales de GLP), basado en lectura completa de cada archivo.

## ramalero-delegation.js

Total: 98 líneas. Registra delegación de eventos a nivel `document` para las tarjetas (`.jobCard`) del panel de activas cuando el módulo actual es `RAMALERO`.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `closest_(node, sel)` | 12 | Wrapper seguro de `Element.closest`, tolera `node` sin método `closest`. | Recibe un nodo DOM y un selector CSS; devuelve el elemento coincidente o `null`. |
| `initRamaleroDelegation_()` | 16 (export) | Inicializa (una sola vez, guardado por `boundDelegation_`) dos listeners delegados en `document`: `click` (botones `[data-act]` dentro de `#activasBox` → ejecuta acción sobre la tarjeta, incluye confirmación modal para `FIN` vía `askConfirmFinish_` y llama a `enviarEventoRamalero_`; clic en tarjeta no interactivo → toggle clase `open`) e `input` (muestra/oculta el botón "Nota" según contenido del `textarea.notaCard`). | No recibe parámetros; no devuelve valor (efecto: engancha listeners globales). |

## ramalero-eventos.js

Total: 92 líneas. Encapsula las llamadas a `/api/evento` para el rol RAMALERO y el "parcheo" del store local tras la respuesta.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `patchStoreFromResponse_(j)` | 18 | Aplica la respuesta del servidor al store local (`ctx_().itemsByKey`) sin forzar un full sync: normaliza el ítem, mergea con el previo, reconstruye listas y vuelve a renderizar activas/finalizados. | Recibe el JSON de respuesta del server (`j`); no devuelve valor (efecto lateral sobre el store/DOM). |
| `crearNuevoRamal_()` | 30 (export) | Crea un nuevo ramal: valida email y `tipoRamal` del select, hace `POST /api/evento` con `accion:"INICIO"`, muestra el resultado con `setOut` y parchea el store si `ok`. | No recibe parámetros; `async`, sin valor de retorno explícito (efecto lateral: UI + store). |
| `enviarEventoRamalero_(it, accion, nota = "")` | 66 (export) | Envía un evento genérico de ramal (p.ej. `FIN`, `NOTA`) para un ítem existente: arma el body con `conversionId`/`tipoRamal`/`nota`, hace `POST /api/evento`, `setOut` y parchea el store si `ok`. | Recibe un ítem de la cola, la acción (string) y una nota opcional; `async`, sin retorno explícito. |

## ramalero.js

Total: 27 líneas. Ciclo de vida del módulo/vista RAMALERO (contrato estándar `init/enter/exit`).

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `init()` | 9 (export) | Inicializa el módulo llamando a `initRamaleroActions_()` e `initRamaleroDelegation_()` (engancha listeners una sola vez). | Sin parámetros; sin retorno. |
| `enter()` | 14 (export) | Activa el módulo: fija `CORE.state.currentModule = "RAMALERO"` y arranca los loops de sincronización (`syncNow`) y de reloj UI (`tickClocksUI_` + `patchVisibleCards_`). | Sin parámetros; sin retorno. |
| `exit()` | 25 (export) | Detiene los loops del módulo y limpia la UI asociada a `RAMALERO`. | Sin parámetros; sin retorno. |

## ramalero-solicitudes.js

Total: 279 líneas. Panel modal (overlay) de "solicitudes de ramal" — dominio distinto del de `ramalero-eventos.js`: consume `/api/solicitud-ramal/*` en vez de `/api/evento`.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `createOverlay_()` | 12 | Construye el DOM del overlay/panel (`#solRamalOverlay`) con secciones "Por entregar" y "Entregados hoy"; engancha cierre por click fuera/botón `×`, y delegación única de click dentro de `#solRamalBox` para los botones `[data-notificar]` (POST `/api/solicitud-ramal/:id/notificar`) y `[data-entregar]` (POST `/api/solicitud-ramal/:id/entregar`, requiere email). | Sin parámetros; devuelve el elemento overlay creado (y lo añade a `document.body`). |
| `closePanel_()` | 134 | Elimina el overlay del DOM si existe. | Sin parámetros; sin retorno. |
| `tiempoEspera_(created_at)` | 140 | Formatea el tiempo transcurrido desde `created_at` en texto legible ("hace X min", "hace Xh Ymin"). | Recibe timestamp/fecha; devuelve string (o `""` si inválido/futuro). |
| `renderCard_(sol)` | 152 | Genera el HTML (string) de una tarjeta de solicitud, con variantes según `estado` (`PENDIENTE` con botones Notificar/Entregar, o `ENTREGADO` con datos de entrega). | Recibe un objeto solicitud; devuelve un string HTML. |
| `loadAndRender_()` | 215 | `GET /api/solicitud-ramal/pendientes`, separa `PENDIENTE`/`ENTREGADO` y renderiza ambas listas (`#solRamalPendientes` / `#solRamalEntregados`) con `renderCard_`. | Sin parámetros; `async`, sin retorno explícito (efecto DOM). |
| `updateBadge_()` | 252 (export) | Actualiza el badge `#solRamalBadge` con el conteo de solicitudes `PENDIENTE` (oculta si es 0). | Sin parámetros; `async`, sin retorno explícito. |
| `initRamaleroSolicitudes_()` | 265 (export) | Engancha el click de `#btnVerSolicitudesR` para abrir el panel y dispara `updateBadge_()` inicial. | Sin parámetros; sin retorno. |
| `openSolicitudesPanel_()` | 274 (export) | Cierra cualquier panel previo, crea el overlay y dispara la carga/render de datos. | Sin parámetros; sin retorno. |

## ramalero-actions.js

Total: 60 líneas. Enlaza los botones de la barra de herramientas del módulo RAMALERO (activas/finalizados/nuevo ramal) y delega la inicialización del panel de solicitudes.

| Función | Línea aprox. | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `initRamaleroActions_()` | 17 (export) | Inicializa (una sola vez, guardado por `boundActions_`) los listeners de: `btnActivasR` (dispara evento `glp:force-sync`), `btnFinalizadosR` (toggle `showFinalizados`, con `GET /api/mis-finalizadas` bajo `withLock` si aún no se cargaron), `btnRamalNuevo` (llama a `crearNuevoRamal_`); y llama a `initRamaleroSolicitudes_()`. | Sin parámetros; sin retorno. |

## Posibles duplicados / solapamientos (dentro de esta carpeta)

- **`crearNuevoRamal_` vs `enviarEventoRamalero_` (ambas en `ramalero-eventos.js:30` y `ramalero-eventos.js:66`)**: construyen un body casi idéntico para `POST /api/evento` (`email`, `rolTrabajo:"RAMALERO"`, `accion`, `tipoRamal`, más `conversionId`/`nota` en la segunda), con el mismo patrón try/catch → `setOut(err)` → `setOut(j)` → `patchStoreFromResponse_(j)`. `crearNuevoRamal_` es esencialmente un caso particular de `enviarEventoRamalero_` con `accion:"INICIO"` y sin `conversionId`; podrían unificarse en una sola función parametrizada.
- **Patrón try/catch de fetch repetido 5 veces con la misma forma** (`try { …postJSON/getJSON… } catch (err) { fallback UI }`): `ramalero-eventos.js:43-58` (crearNuevoRamal_), `ramalero-eventos.js:81-87` (enviarEventoRamalero_), `ramalero-solicitudes.js:88-100` (notificar), `ramalero-solicitudes.js:115-128` (entregar), `ramalero-solicitudes.js:224-236` (loadAndRender_). No hay un helper común en esta carpeta que envuelva "POST/GET + manejo de error"; cada archivo reimplementa el boilerplate.
- **Dos sistemas de estado en paralelo, sin relación entre sí**: `ramalero-eventos.js` mantiene el estado de los ramales activos en el store central (`ctx_().itemsByKey`, vía `patchStoreFromResponse_`, `ramalero-eventos.js:18`) y actualiza el DOM incrementalmente sin refetch; `ramalero-solicitudes.js`, en cambio, no usa el store — cada acción (notificar/entregar) simplemente vuelve a llamar `loadAndRender_()` (`ramalero-solicitudes.js:118`, `:91`) para re-fetchear toda la lista de `/api/solicitud-ramal/pendientes` y re-renderizar desde cero. Son dos estrategias de "refrescar tras acción" distintas conviviendo en la misma carpeta para dominios de datos separados (`/api/evento` vs `/api/solicitud-ramal`), sin overlap funcional directo pero sí inconsistencia de patrón.
- **`ramalero-delegation.js` vs el patrón "delegación" dentro de `ramalero-solicitudes.js`**: el propio código de `ramalero-solicitudes.js:79-80` etiqueta explícitamente su bloque como "delegación ÚNICA en el box — sin acumulación de listeners", replicando la misma técnica que implementa `initRamaleroDelegation_()` en `ramalero-delegation.js:20` (un único listener de `click` en un contenedor padre + `.closest("[data-attr]")` para despachar por tipo de botón, en vez de un listener por botón). Es el mismo patrón de delegación de eventos aplicado dos veces en la carpeta, en dos contenedores distintos (`#activasBox` vs `#solRamalBox`) — no es código duplicado literal, pero sí una convención repetida que podría extraerse a un helper genérico de "delegated click by data-attribute".
- **Guardas de inicialización idénticas**: `ramalero-delegation.js:10,17-18` (`boundDelegation_`) y `ramalero-actions.js:15,18-19` (`boundActions_`) usan el mismo patrón de flag booleano de módulo para evitar doble-binding, invocados ambos desde `ramalero.js:10-11` (`init()`). Son dos módulos separados por convención (acciones de toolbar vs delegación de tarjetas) pero comparten literalmente el mismo boilerplate de guard, candidato a un helper común (p.ej. `once_(fn)`).
