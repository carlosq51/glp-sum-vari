# Análisis de funciones — `public/js/work/`

Catálogo de funciones reusables de los 8 archivos que componen el módulo de gestión de trabajos (cards activas/finalizadas, estados, tiempos, notas y templates HTML).

## work-notes.js

Snapshot/restore del valor de los `<textarea>` de notas de las cards activas (para no perder lo escrito al re-renderizar).

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `snapshotNotasActivas_()` | 8 | Guarda en un `Map` el valor actual de cada textarea `.notaCard` dentro de `#activasBox`, indexado por `data-key` de la card. | Recibe: nada. Devuelve: `Map<string, string>` (key de card → texto de nota). |
| `restoreNotasActivas_(snapMap)` | 23 | Reescribe el valor de los textareas `.notaCard` con los datos de un snapshot previo. | Recibe: `Map` devuelto por `snapshotNotasActivas_()`. Devuelve: nada (efecto secundario en el DOM). |

## work-status.js

Reglas de negocio sobre el estado de un trabajo: si está finalizado, qué acciones se permiten según estado, y si un ítem debe mostrarse en el módulo actual.

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `isFinalizado_(it)` | 8 | Determina si un item de trabajo está en estado `FINALIZADO`. | Recibe: item (objeto con `estado`). Devuelve: `boolean`. |
| `allowedActionsByEstado(estado)` | 12 | Mapea un estado (`SIN_INICIAR`/`TRABAJANDO`/`PAUSADO`/`FINALIZADO`) a la lista de acciones de botón permitidas (`INICIO`, `PAUSA`, `FIN`, `REANUDAR`, `NOTA`). | Recibe: `estado` (string). Devuelve: `string[]`. |
| `shouldShowItemInCurrentModule_(it)` | 21 | Filtra si un item pertenece al módulo activo (`CALIDAD`, `RAMALERO`, o técnico `MOTOR`/`TANQUE`) usando `CORE.state.currentModule`. | Recibe: item (con `rolTrabajo`). Devuelve: `boolean`. Lee estado global `CORE`. |

## work-store.js

Reconstruye las listas de keys activas/finalizadas a partir del store de items en memoria.

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `rebuildListsFromStore_()` | 9 | Toma `ctx_().itemsByKey`, filtra por módulo actual (`shouldShowItemInCurrentModule_`), ordena por `updated_at` descendente, y separa las keys (`conversionId|rolTrabajo`) en `c.activeKeys` y `c.finalKeys` según `isFinalizado_`. | Recibe: nada (opera sobre `ctx_()`). Devuelve: nada; muta `c.activeKeys` y `c.finalKeys`. |

## work-time.js

Cálculo del tiempo "vivo" transcurrido de un trabajo en curso.

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `computeLiveMs_(item, nowMs = Date.now())` | 6 | Calcula milisegundos trabajados: toma tiempo base acumulado (`tiempo_ms`/`tiempo_trab_ms`) y, si el item está `TRABAJANDO` y tiene `running_since` válido, suma el delta hasta `nowMs`. | Recibe: `item` (objeto con `tiempo_ms`, `running_since`, `estado`), `nowMs` opcional. Devuelve: `number` (milisegundos). |

Nota: esta función **no formatea** el tiempo a texto — solo calcula el número de ms. El formateo a `HH:MM:SS` ocurre en `msToHMS_()`, importada desde `../core/format.js` (ver sección de duplicados).

## work-normalize.js

Normaliza un registro crudo (de Sheets o Supabase, con distintas convenciones de nombre de campo/mayúsculas) a un objeto `item` con forma consistente.

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `normalizeItem_(raw)` | 10 | Normaliza un registro crudo a un `item` estándar: resuelve alias de campos (`conversionId`/`conversion_id`/`CONVERSION_ID`/etc.) con un helper interno `pickFirst_`, castea tipos, infiere `rolTrabajo` y `estado` por defecto si faltan, y actualiza cachés (`vinCacheSet_`, `ramalCacheSet_`). | Recibe: `raw` (objeto crudo de cualquier fuente). Devuelve: `item` normalizado (objeto con ~20 campos: `conversionId`, `vin`, `tipoRamal`, `estado`, `tiempo_ms`, `running_since`, incidencias, etc.). Efecto secundario: escribe en cachés globales. |
| `pickFirst_(...xs)` (interna, línea 11, dentro de `normalizeItem_`) | 11 | Helper local: devuelve el primer valor no vacío/no nulo de una lista de candidatos. | Recibe: valores variádicos. Devuelve: el primer valor "truthy" en string trim, o `""`. No exportada — solo uso interno. |

## index.js

Barrel file: re-exporta toda la API pública del módulo `work/` desde un único punto de entrada. No define lógica propia.

| Export | Línea | Origen | Propósito |
|---|---|---|---|
| `isFinalizado_`, `allowedActionsByEstado`, `shouldShowItemInCurrentModule_` | 6 | `work-status.js` | Re-export directo. |
| `computeLiveMs_` | 7 | `work-time.js` | Re-export directo. |
| `buildBotonesByEstado_`, `buildAsignadoHTML_`, `buildIncidenciasBtnHTML_` | 8 | `work-templates.js` | Re-export directo. |
| `snapshotNotasActivas_`, `restoreNotasActivas_` | 9 | `work-notes.js` | Re-export directo. |
| `rebuildListsFromStore_` | 10 | `work-store.js` | Re-export directo. |
| `renderActivas_`, `renderFinalizados_`, `patchVisibleCards_` | 11 | `work-render.js` | Re-export directo. |
| `normalizeItem_` | 12 | `work-normalize.js` | Re-export directo. |

## work-templates.js

Genera fragmentos HTML reusables (botones de acción, bloque de "asignado/registrado", botón de incidencias) que luego se insertan en las cards completas de `work-render.js`.

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `buildBotonesByEstado_(estado)` | 9 | Devuelve el HTML de los botones de acción correspondientes al estado (`INICIO`; `PAUSA`+`FIN`; `REANUDAR`+`FIN`; o `GUARDAR NOTA` por defecto). | Recibe: `estado` (string). Devuelve: `string` (HTML). |
| `buildAsignadoHTML_(it)` | 33 | Genera el bloque HTML con "TANQUE/REDUCTOR ASIGNADO" y "...REGISTRADO" para roles `MOTOR`/`TANQUE`; vacío para otros roles. Escapa valores con `escapeHtml`. | Recibe: `it` (item). Devuelve: `string` (HTML, puede ser `""`). |
| `buildIncidenciasBtnHTML_(it, key = "")` | 66 | Genera botones "Registrar Inc." y "Ver incidencias (N)" — solo visible en módulo `CALIDAD` y si hay `vin` o `conversionId`. Suma `inc_leve+inc_moderada+inc_critica` para el contador. | Recibe: `it` (item), `key` (string opcional para `data-key`). Devuelve: `string` (HTML, puede ser `""`). |

## work-render.js

Renderiza el HTML completo de las listas de cards (activas y finalizadas) y aplica "patches" incrementales sin re-renderizar todo. Consume los templates de `work-templates.js` y el cálculo de `work-time.js`.

| Función | Línea | Propósito | Recibe / Devuelve |
|---|---|---|---|
| `renderActivas_()` | 12 | Reconstruye por completo el `innerHTML` de `#activasBox`: itera `c.activeKeys`, arma cada `.jobCard` completa (título, estado, tiempo vía `computeLiveMs_`+`msToHMS_`, asignado, botones de incidencias/conformidad/solicitar ramal, botones de acción, textarea de nota). | Recibe: nada (usa `ctx_()`). Devuelve: nada; efecto secundario en DOM (`box.innerHTML`). |
| `renderFinalizados_(avgTopHTML = "")` | 123 | Reconstruye el `innerHTML` de `#finalizadosBox` con las cards finalizadas (más simples que las activas: sin botones de acción, con "Término" en vez de "Inicio"). Antepone `avgTopHTML` (bloque de promedio recibido externamente). | Recibe: `avgTopHTML` (string HTML opcional). Devuelve: nada; efecto secundario en DOM. Oculta el wrap si `c.showFinalizados` es falso. |
| `patchVisibleCards_()` | 194 | Actualiza in-place (sin recrear DOM) las cards activas ya renderizadas: clase de estado, texto de `.js-estado`, `.js-tiempo` (recalculado con `computeLiveMs_`+`msToHMS_`), valores asignado/registrado, bloque `.js-personal` (CALIDAD), y botones de acción si la card está `open`. | Recibe: nada (usa `ctx_()`). Devuelve: nada; efecto secundario en DOM. |

---

## Posibles duplicados / solapamientos (dentro de esta carpeta)

- **work-time.js vs `msToHMS_` de `core/format.js` (sospecha, no confirmada — no se leyó ese archivo):** `computeLiveMs_` en `work-time.js:6` **no formatea** a texto `HH:MM:SS`; solo devuelve un número de milisegundos. El formateo real a texto lo hace `msToHMS_`, importada explícitamente desde `../core/format.js` en `work-render.js:8` y usada en `work-render.js:33`, `work-render.js:153` y `work-render.js:217`. No hay una función de formateo de tiempo duplicada dentro de `work/` — `computeLiveMs_` y `msToHMS_` son complementarias (cálculo vs. formateo), no redundantes. Vale la pena confirmar en `core/format.js` que `msToHMS_` no tenga, a su vez, lógica de "tiempo en vivo" (running_since) solapada con `computeLiveMs_`, pero según el uso observado aquí cada una tiene una responsabilidad distinta.

- **work-render.js vs work-templates.js — HTML redundante, parcial:** `work-templates.js` fue diseñado para encapsular fragmentos reusables (`buildBotonesByEstado_`, `buildAsignadoHTML_`, `buildIncidenciasBtnHTML_`), y `work-render.js` los consume correctamente (líneas `work-render.js:66`, `work-render.js:87`, `work-render.js:97`, `work-render.js:178`). Sin embargo, **hay HTML construido a mano directamente dentro de `work-render.js`** que replica el mismo patrón de "botón condicional según rol/módulo" que ya usan los templates, sin pasar por `work-templates.js`:
  - El botón "✅ Registro de conformidad de equipo" (`work-render.js:68-73`) — condicional a rol `MOTOR`/`TANQUE`, igual que `buildAsignadoHTML_`, pero no extraído a template.
  - El botón "🔩 Solicitar Ramal" (`work-render.js:75-85`) — condicional a rol + estado + módulo, construido inline con template literal, mismo patrón que `buildIncidenciasBtnHTML_` pero no reutilizado como función.
  - El botón "🔩 Ver fotos de soldadura" (`work-render.js:89-95`, solo en `renderActivas_`) y el bloque "📸 Registrar fotos/fallas" (duplicado literalmente en `work-render.js:101-107` dentro de `renderActivas_` y en `work-render.js:180-186` dentro de `renderFinalizados_`) — **el mismo bloque condicional (`TECNICO` → "Registrar fotos / fallas", `CALIDAD` → "Registrar calidad / fallas") aparece copiado dos veces, una por función**, en vez de extraerse a un helper compartido (p. ej. en `work-templates.js`).
  - El bloque `.js-personal` (MOTOR/TANQUERO) también está duplicado casi literalmente entre `renderActivas_` (`work-render.js:51-56`) y `renderFinalizados_` (`work-render.js:171-176`), y una tercera vez (parcialmente, como actualización DOM) en `patchVisibleCards_` (`work-render.js:245-258`).
  
  Conclusión: `work-templates.js` no está mal diseñado, pero **no cubre todos los fragmentos condicionales** que hoy viven inline en `work-render.js`, y al menos 2 bloques de HTML (botón "Registrar fotos/fallas" y bloque `.js-personal`) están duplicados literalmente entre `renderActivas_` y `renderFinalizados_` dentro del mismo archivo.

- **work-store.js vs work-status.js — dos "estados" distintos, no exactamente duplicados:** No son dos formas de trackear lo mismo, sino dos capas complementarias:
  - `work-status.js` define **reglas puras** sobre el estado de un item individual: `isFinalizado_` (`work-status.js:8`), `allowedActionsByEstado` (`work-status.js:12`) y `shouldShowItemInCurrentModule_` (`work-status.js:21`). No mantiene estado propio, solo evalúa un `item` dado.
  - `work-store.js` usa esas reglas para **derivar y cachear** dos listas de keys (`c.activeKeys`, `c.finalKeys`) a partir de `ctx_().itemsByKey` (`work-store.js:9-29`), que es el store real donde vive el estado.
  
  El posible solapamiento a vigilar: `rebuildListsFromStore_` (`work-store.js:22-26`) reimplementa el criterio de "activo vs finalizado" combinando `isFinalizado_` con una key compuesta `conversionId|rolTrabajo` construida inline (`work-store.js:23`). Esa misma construcción de key (`conversionId|rolTrabajo`) no está centralizada en ninguna función reusable — se repite como literal en `work-store.js:23` y se vuelve a usar como `data-key` en `work-render.js` (`renderActivas_`/`renderFinalizados_`/`patchVisibleCards_`) asumiendo el mismo formato sin una función común como `buildItemKey_()`. No es una duplicación de *estado*, pero sí una duplicación del *formato de la key* que ambos módulos deben mantener sincronizada manualmente.
