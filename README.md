# GLP Control

PWA para el seguimiento de conversiones vehiculares a GLP. Permite a técnicos, calidad, supervisores y movilizadores gestionar el flujo completo de conversión en tiempo real desde el celular.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Vanilla JS + ES Modules, Vite (build/PWA) |
| Backend | Node.js + Express (`index.js`) |
| Base de datos | Supabase (PostgreSQL) |
| Almacenamiento | Cloudflare R2 (fotos de fallas, calidad, conformidad) |
| Spreadsheets | Google Apps Script (`gas/`) |

---

## Roles de usuario

- **TECNICO** — registra INICIO / PAUSA / FIN de conversión
- **CALIDAD** — sube fotos, registra incidencias y conformidad de equipo
- **RAMALERO** — gestiona ramales de conversión
- **SUPERVISOR** — vista de seguimiento y reporte de producción
- **MOVILIZADOR** — lista de vehículos disponibles para traslado/salida
- **ADMIN** — configuración
- **UPLOADER** — carga masiva de fotos

---

## Desarrollo local

```bash
# 1. Instalar dependencias
npm install

# 2. Crear archivo .env (ver .env.example)
cp .env.example .env

# 3. Iniciar Vite (frontend)
npm run dev

# 4. Iniciar backend Express (en otra terminal)
npm start
```

---

## Build y deploy

```bash
npm run build      # genera dist/
npm start          # sirve dist/ + API en el mismo puerto
```

---

## Carpeta gas/

Scripts de Google Apps Script. **No forman parte del build de Vite** — se despliegan manualmente con `clasp push`.

| Archivo | Propósito |
|---------|-----------|
| `00_config_core.js` … `05_drive_uploads.js` | Backend del webapp GAS (API REST vía `doGet`/`doPost`) |
| `99_webapp_router.js` | Router principal del webapp GAS |
| `Codigo_ASIGNACIONES_COMPLETO.js` | Script para la hoja de ASIGNACIONES |
| `ASIG_lista_diaria.js` | Extensión: escribe LISTA DIARIA desde ASIGNACIONES |
| `REPORTE_PRINCIPAL_obtencion_vin.js` | Sincroniza VINs a Supabase + Google Sheets |
| `REP_DASHBOARD.js` | Dashboard de producción en Google Sheets |

Ver [ARCHITECTURE.md](ARCHITECTURE.md) para el mapa completo del frontend.

---

## Variables de entorno requeridas

Todas son del servidor. El navegador no recibe ninguna key de Supabase: lee y
escribe a través de `/api/db/:tabla` (ver `routes/db.js` y `lib/db-permisos.js`).

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=      # service role — la anon key ya no tiene acceso a nada
SUPABASE_DB_URL=           # opcional: solo para npm run db:dump / db:validar (lectura)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=                 # default: glp-fotos
R2_PUBLIC_URL=
VAPID_SUBJECT=             # las tres VAPID son opcionales: sin ellas no hay push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
DESPACHO_QR_SECRET=
```

---

## Base de datos

El esquema vive en `supabase/migrations/` (`000_base.sql` + cambios numerados).
Cómo agregar un cambio: [supabase/migrations/README.md](supabase/migrations/README.md).

```bash
npm run db:validar   # aplica las migraciones en memoria y las compara con producción
npm run db:dump      # vuelca el esquema de producción (solo lectura)
npm run db:convencion # lo nuevo (después de la 005) sigue la convención de nombres
```
