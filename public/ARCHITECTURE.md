// ==========================================================================
// ARCHITECTURE.md — Mapa de la arquitectura del frontend GLP Control
// ==========================================================================
//
// Este archivo documenta cómo está organizado el código para que cualquier
// desarrollador nuevo (o tú mismo en 6 meses) pueda orientarse rápido.
//
// ==========================================================================

# Arquitectura del Frontend — GLP Control

## Resumen

SPA (Single Page Application) vanilla JS con ES Modules nativos.
Sin framework, sin bundler — los archivos se sirven directamente desde `public/`.

---

## Estructura de carpetas

```
public/
├── app.js                     ← Entry point (bootstrap)
├── index.html                 ← HTML mínimo (<div id="appRoot">)
├── styles.css                 ← Punto de entrada CSS (@import cascada)
│
├── css/                           ← Estilos modularizados (orden de cascada)
│   ├── 00-token.css               ← Variables CSS (colores, espaciados, radios)
│   ├── 01-base.css                ← Reset + tipografía base
│   ├── 02-layout.css              ← Grid, flex, utilidades de layout
│   ├── components/                ← Componentes reutilizables (antes 03-components.css)
│   │   ├── cards.css              ← .card, .innerCard
│   │   ├── inputs.css             ← input, select, textarea
│   │   ├── buttons.css            ← Botones base + variantes (.btn2, .btn3)
│   │   ├── buttons-action.css     ← INICIO / PAUSA / FIN / NOTA + jobActionsGrid
│   │   ├── pills.css              ← .pill / tags
│   │   ├── badges.css             ← .badge-ok, .badge-warn, .badge-danger, .badge-note
│   │   ├── code.css               ← pre, .status
│   │   ├── checkboxes.css         ← .ckRow
│   │   ├── topbar.css             ← .topbar genérica
│   │   ├── thumbs.css             ← .thumb, .thumbGrid (miniaturas de fotos)
│   │   └── utilities.css          ← .hidden, .truncate, .divider
│   ├── overlays/                  ← Overlays y modales (antes 04-overlay.css)
│   │   ├── loading.css            ← .overlay, .spinner, animaciones
│   │   ├── modal.css              ← .modal, .modalBox, .modalHead, .modalBody
│   │   └── confirm-modal.css      ← .modalConfirm (FIN trabajo)
│   ├── 05-autocomplete.css        ← Dropdowns de autocomplete (posición absoluta)
│   ├── views/                     ← Estilos por vista (antes 06-views.css)
│   │   ├── topbar-shell.css       ← .topbarShell, .topbarMain, responsive
│   │   ├── vin-row.css            ← .vinRow3, botones QR, inputs VIN mono
│   │   ├── supervisor.css         ← Filtros, fechas, marca, VIN supervisor
│   │   ├── ramalero.css           ← .ramalRow3
│   │   ├── asignado.css           ← .asignadoRow (chip técnico asignado)
│   │   ├── movilizador.css        ← #viewMOVILIZADOR (tabla completa)
│   │   ├── incidencias.css        ← #incModal ajustes
│   │   ├── qr-reader.css          ← .qrReader (html5-qrcode)
│   │   └── debug.css              ← Stubs ocultos, debug-hidden
│   └── 07-uploader.css            ← Módulo uploader (aislado al final)
│
├── js/
│   ├── core/                  ← Módulos fundamentales (sin lógica de vista)
│   │   ├── core.js            ← BARREL — re-exporta todo lo de core/
│   │   ├── state.js           ← Estado global (CORE, MODULES, ctx_)
│   │   ├── dom.js             ← Helpers DOM ($, el_, modSuffix_)
│   │   ├── api.js             ← fetch wrappers + UI lock (withLock)
│   │   ├── auth.js            ← Perfil, módulos efectivos, email
│   │   ├── ui-shell.js        ← Toggle login/app/hub UI
│   │   ├── router-lite.js     ← Router mínimo (register + open)
│   │   ├── loops.js           ← Timers por módulo (sync, clock, estado)
│   │   ├── theme.js           ← Tema día/noche
│   │   ├── format.js          ← Helpers puros (escapeHtml, fechas, tiempo)
│   │   ├── links.js           ← URLs externas (registro fallas)
│   │   └── cache-local.js     ← Caches en localStorage (VIN, ramal)
│   │
│   ├── templates/             ← HTML puro (template strings)
│   │   ├── layout/
│   │   │   ├── shell.js       ← appShell() — ensambla toda la UI
│   │   │   ├── topbar.js      ← Barra superior
│   │   │   └── loading-overlay.js
│   │   ├── views/
│   │   │   ├── login-view.js
│   │   │   ├── hub-view.js
│   │   │   ├── tecnico-view.js
│   │   │   ├── calidad-view.js
│   │   │   ├── ramalero-view.js
│   │   │   ├── supervisor-view.js
│   │   │   ├── admin-view.js
│   │   │   ├── movilizador-view.js
│   │   │   └── uploader-view.js
│   │   └── modals/
│   │       ├── qr-modal.js
│   │       ├── conformidad-modal.js
│   │       ├── incidencias-modal.js
│   │       ├── confirm-finish-modal.js
│   │       ├── rf-calidad-modal.js
│   │       └── rf-tecnico-modal.js
│   │
│   ├── work/                  ← Lógica compartida de "trabajo" (cross-module)
│   │   ├── index.js           ← BARREL
│   │   ├── work-status.js     ← isFinalizado_, allowedActions, filtro módulo
│   │   ├── work-time.js       ← computeLiveMs_ (cálculo de tiempo live)
│   │   ├── work-store.js      ← rebuildListsFromStore_
│   │   ├── work-render.js     ← renderActivas_, renderFinalizados_, patch
│   │   ├── work-templates.js  ← HTML de botones, asignado, incidencias
│   │   └── work-notes.js      ← Snapshot/restore de textareas de notas
│   │
│   └── views/                 ← Lógica de cada vista (init/enter/exit)
│       ├── conversion/        ← TECNICO + CALIDAD comparten código
│       │   ├── conversion.js  ← Entry: init/enter/exit + tick clocks
│       │   ├── data/
│       │   │   ├── conversion-estado.js   ← Buscar/crear OT por VIN
│       │   │   ├── conversion-eventos.js  ← Enviar acción (INICIO/PAUSA/FIN/NOTA)
│       │   │   └── conversion-sync.js     ← Sincronización periódica
│       │   ├── state/
│       │   │   └── conversion-store.js    ← Normalizar, merge, cache nombres
│       │   ├── modals/
│       │   │   ├── index.js               ← BARREL
│       │   │   ├── confirm-finish.js      ← Confirmación de FIN
│       │   │   ├── conformidad.js         ← Conformidad de equipo (TANQUE/REDUCTOR)
│       │   │   ├── incidencias.js         ← Registrar incidencia (CALIDAD)
│       │   │   ├── rf-modal.js            ← Fotos/fallas (CALIDAD)
│       │   │   └── rf-tecnico-modal.js    ← Parámetros/fallas (TECNICO)
│       │   └── ui/
│       │       ├── conversion-delegation.js ← Event delegation en cards
│       │       ├── conversion-qr.js         ← Escaneo QR de VIN
│       │       └── conversion-vin-autocomplete.js ← Autocomplete de VIN
│       │
│       ├── ramalero/
│       │   ├── ramalero.js             ← Entry: init/enter/exit
│       │   ├── ramalero-actions.js     ← Botones refrescar/nuevo ramal
│       │   ├── ramalero-delegation.js  ← Event delegation en cards
│       │   └── ramalero-eventos.js     ← Crear ramal / enviar evento
│       │
│       ├── supervisor/
│       │   ├── index.js            ← BARREL
│       │   ├── supervisor.js       ← Entry: init/enter/exit + fetch + render
│       │   ├── sup-filters.js      ← Filtros (finalizado, marca, duración)
│       │   ├── sup-grouping.js     ← Agrupar por VIN (MOTOR+TANQUE)
│       │   ├── sup-stats.js        ← Mediana + MAD + prior contextual
│       │   ├── sup-render.js       ← Render tabla + avg card
│       │   ├── sup-incidencias.js  ← Modal ver incidencias
│       │   ├── sup-name-suggest.js ← Autocomplete nombre/email
│       │   ├── sup-qr.js           ← QR para supervisor
│       │   └── sup-quick-dates.js  ← Botones Hoy/Ayer/Este Mes
│       │
│       ├── admin/
│       │   └── admin.js            ← Stub (init/enter/exit)
│       │
│       ├── movilizador/
│       │   └── movilizador.js      ← Pendientes para calidad
│       │
│       └── uploader/
│           ├── uploader.js         ← Wrapper (init/show/hide)
│           ├── uploader-ui.js      ← Controller de pantallas
│           └── uploader-api.js     ← Llamadas API del uploader
```

---

## Patrón de cada vista

Todas las vistas siguen el mismo contrato:

```js
export function init()  { /* Bind listeners una vez (se llama al arranque) */ }
export function enter() { /* Se activa cuando el usuario entra al módulo   */ }
export function exit()  { /* Limpieza al salir (timers, UI, etc.)          */ }
```

---

## Flujo de datos

```
         ┌──────────────────────────────────────────┐
         │              app.js (bootstrap)           │
         │  1. Monta appShell() en #appRoot          │
         │  2. Registra vistas en router-lite        │
         │  3. Auto-login si hay email guardado      │
         └──────────────┬───────────────────────────┘
                        │
           ┌────────────▼────────────┐
           │    router-lite.js       │
           │  openView("TECNICO")    │
           │    → exit() anterior    │
           │    → enter() nueva      │
           └────────────┬────────────┘
                        │
        ┌───────────────▼───────────────┐
        │    Vista activa (ej. TECNICO) │
        │  - startLoopsFor_() → sync    │
        │  - renderActivas_()           │
        │  - event delegation en cards  │
        └───────────────┬───────────────┘
                        │
            ┌───────────▼───────────┐
            │     API (/api/...)    │
            │  getJSON / postJSON   │
            │  withLock (overlay)   │
            └───────────────────────┘
```

---

## Convenciones de nombres

| Patrón          | Significado                                     |
|-----------------|------------------------------------------------|
| `xxx_`          | Función "privada" / interna del módulo          |
| `initXxxUI_()`  | Bind de listeners (se llama una vez)            |
| `openXxx_()`    | Abre un modal o vista                           |
| `closeXxx_()`   | Cierra un modal o vista                         |
| `renderXxx_()`  | Genera/actualiza HTML en el DOM                 |
| `el_(id)`       | `document.getElementById` con sufijo de módulo  |
| `$(id)`         | `document.getElementById` directo               |

---

## Importación: barrel vs directa

- **Vistas** → importan desde `../../core/core.js` (barrel)
- **work/** → importa directo desde `../core/state.js`, `../core/format.js` etc.
  (evita dependencias circulares)
- **Módulos dentro de una vista** → pueden importar directo entre ellos

---

## CSS: orden de cascada

Los archivos CSS se importan desde `styles.css` en este orden estricto:

1. **Tokens** → variables (sin efecto visual propio)
2. **Base/Reset** → usa las variables
3. **Layout** → estructura (filas, grids, stacks)
4. **Componentes** → `components/` — cards, inputs, botones, pills, badges…
5. **Overlays** → `overlays/` — loading, modales, confirm
6. **Autocomplete** → dropdowns posición absoluta
7. **Vistas** → `views/` — page-specific (topbar, supervisor, ramalero…)
8. **Uploader** → módulo aislado, siempre al final

**No cambiar el orden** — cada grupo asume que los anteriores ya están cargados.
Dentro de cada carpeta el orden de import tampoco debe alterarse.
