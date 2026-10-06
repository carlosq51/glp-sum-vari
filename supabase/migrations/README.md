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

## Convenciones para tablas y columnas nuevas

Las columnas que ya existen no se renombran, porque eso rompe código en muchos
lugares. Pero todo lo nuevo sigue estas reglas:

| Qué | Cómo |
|---|---|
| Nombres | En español, `snake_case` |
| Momento en que pasó algo | `*_at` con `timestamptz` (`created_at`, `entregado_at`) |
| Quién lo hizo | `*_user_id uuid REFERENCES usuarios(id)`, nunca el nombre o el email como texto |
| Relación con un carro | `vin text REFERENCES vins(vin)` |
| Estados con valores fijos | Un `enum`, no texto libre |
| Id | `uuid DEFAULT gen_random_uuid()` |
| Seguridad | `ENABLE ROW LEVEL SECURITY` sin políticas: solo el servidor (`service_role`) entra. Mismo patrón que `produccion_horas_extra` |

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run db:validar` | Aplica las migraciones en un Postgres vacío en memoria y las compara con producción |
| `npm run db:dump` | Imprime el esquema actual de producción |

Los dos solo **leen** producción: la sesión se abre en modo solo lectura.
Necesitan `SUPABASE_DB_URL` en `.env` (Supabase → Connect → Session pooler).
