# Migraciones de la base

Esta carpeta es la única fuente de verdad del esquema de Supabase. Aplicadas en
orden sobre una base vacía, reconstruyen producción.

- `000_base.sql` es la foto de producción del 2026-10-06. Se generó con un script
  y no se edita a mano.
- `../historico/` guarda los .sql sueltos de antes. No se vuelven a correr; sirven
  para leer **por qué** existe cada tabla.

## Cómo hacer un cambio en la base

1. Crea el siguiente archivo numerado: `001_que-hace.sql`, `002_...`. Usa tres
   dígitos y un nombre en minúsculas con guiones.
2. Escríbelo para que se pueda correr dos veces sin romper nada (`IF NOT EXISTS`,
   `IF EXISTS`, `ON CONFLICT DO NOTHING`), dentro de `BEGIN; … COMMIT;`.
3. Arriba del archivo explica qué cambia y por qué, como en los de `historico/`.
4. Córrelo en el SQL editor de Supabase.
5. Comprueba que el repo y la base coinciden:

   ```
   npm run db:validar
   ```

   Si dice "Iguales", el cambio está completo. Si algo sale como "solo en
   producción" o "solo en el repo", la migración y la base no coinciden.

Una migración que ya se corrió no se edita. Si estaba mal, se corrige con la
siguiente.

## Convención de nombres: solo hacia adelante

**Lo que existe hasta la migración 005 no se renombra.** Renombrar
`fecha_creacion`, `ts`, `running_since` y compañía rompería unos 40 archivos
(servidor, pantallas y Apps Script) y no arregla nada que el usuario vea. Esas
columnas están explicadas con `COMMENT` en la base (migración 005).

**Todo lo nuevo, sea una tabla nueva o una columna nueva en una tabla vieja,
sigue estas reglas.** `npm run db:convencion` las revisa (también corre dentro de
`npm test`) y solo mira lo creado después de la 005.

| Qué | Cómo | Ejemplo |
|---|---|---|
| Nombres | Español, `snake_case`, sin abreviar. Excepciones aceptadas: `id`, `created_at`, `updated_at` | `movilizador_traslados.destino` |
| Momento en que pasó algo | `*_at` con `timestamptz`. Nunca `timestamp` sin zona | `entregado_at`, `confirmada_at` |
| Creación / último cambio | `created_at` / `updated_at`, `timestamptz NOT NULL DEFAULT now()`. No `fecha_creacion`, `registrado_at` ni `ts` | |
| Día de turno | `jornada_fecha date`, calculada con `glp_jornada_fecha(ts)` (el turno noche cruza medianoche) | `asistencia_jornada.jornada_fecha` |
| Otro día de calendario | `fecha_* date` | `fecha_entrega` |
| Quién lo hizo | `*_user_id uuid REFERENCES usuarios(id)`. Si además hace falta el texto (Apps Script, hojas), va **al lado** con el mismo prefijo | `entregado_por` + `entregado_por_user_id` |
| Estados y tipos con valores fijos | Un `enum` (`estado_*`, `tipo_*`) en columnas nuevas. `CHECK (col IN (…))` solo para proteger una columna de texto que ya existía, como hizo la 004 | `estado_propuesta` |
| Relación con un carro | `vin text`. `REFERENCES vins(vin)` **solo** si el carro tiene que estar ya en el padrón. Las tablas del taller no la llevan: el padrón llega por Apps Script cada 6 h | |
| Id | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` | |
| Sí / no | `boolean NOT NULL DEFAULT …`, adjetivo o participio, sin `es_`/`is_` | `activo`, `salida_auto` |
| Seguridad | `ENABLE ROW LEVEL SECURITY` sin políticas: solo entra la service key | `produccion_horas_extra` |
| Documentación | `COMMENT ON TABLE`: qué guarda y quién la escribe. `COMMENT ON COLUMN` cuando el nombre no basta | migración 005 |

Lo que `db:convencion` **no** puede revisar solo: que el nombre esté en español
y que el comentario diga algo útil. Eso queda para quien escribe la migración.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run db:validar` | Aplica las migraciones en un Postgres vacío en memoria y las compara con producción |
| `npm run db:dump` | Imprime el esquema actual de producción |
| `npm run db:convencion` | Revisa que lo creado después de la 005 siga la convención. No necesita producción |

`db:validar` y `db:dump` solo **leen** producción: la sesión se abre en modo solo lectura.
Necesitan `SUPABASE_DB_URL` en `.env` (Supabase → Connect → Session pooler).
