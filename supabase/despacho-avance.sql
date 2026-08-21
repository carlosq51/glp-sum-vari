-- ============================================================
--  GLP-UI · DESPACHO — "avanzar siguiente carro" y caducidad de
--  las invitaciones a dupla.
--  Ejecutar UNA VEZ en Supabase Dashboard → SQL Editor.
--  Idempotente: se puede correr de nuevo sin romper nada.
--
--  NO crea tablas ni columnas: todo el comportamiento nuevo vive en
--  código y se gobierna con estas dos claves de app_config. Esto es
--  solo el asiento inicial de esas claves.
-- ============================================================

-- ────────────────────────────────────────────
--  1. Caducidad de la invitación a dupla (minutos)
--
--  Mientras una dupla está PENDIENTE, sus DOS técnicos salen del
--  reparto: darle un carro al que propuso rompería la dupla antes de
--  nacer — el invitado acepta y se encuentra al compañero ya metido
--  en otro carro.
--
--  Ese bloqueo TIENE que caducar. Una invitación que nadie contesta
--  (el compañero dejó el celular en el casillero) congelaría a dos
--  personas la jornada entera y en silencio. Al vencer, la dupla se
--  marca RECHAZADA sola y los dos vuelven a la cola.
-- ────────────────────────────────────────────
INSERT INTO app_config (key, value)
VALUES ('DESPACHO_TTL_DUPLA_MIN', '10')
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────
--  2. Quién tiene el botón "avanzar siguiente carro" SIN dupla
--
--  Lista de user_id separados por coma. El botón lo tienen siempre las
--  duplas ACTIVAS; esta clave es la excepción para quien trabaja con
--  ayudantes que NO marcan asistencia y por tanto no pueden formar
--  dupla en el sistema, aunque en el taller la tenga de hecho.
--
--  Sembrado con MICHAEL CAHUANA (MOTOR), que es el caso que originó la
--  excepción, y JUNIOR ALVARADO (MOTOR), que trabaja igual (2026-08-20).
--  Para sumar a alguien: añadir su id separado por coma.
--  Editable también desde Admin → Configuración, sin desplegar.
--
--  OJO: el ON CONFLICT DO NOTHING significa que en una base ya sembrada
--  este INSERT no actualiza nada — la lista viva es la de app_config, y
--  esto es solo el asiento inicial para una base nueva.
-- ────────────────────────────────────────────
INSERT INTO app_config (key, value)
VALUES ('DESPACHO_AVANCE_SOLO',
        '1cf1d0d9-fc27-4270-a077-89bc49df2f23,d5003e1b-98c3-4340-a788-453ed70825e0')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
--  Verificación:
--    SELECT key, value FROM app_config
--     WHERE key IN ('DESPACHO_TTL_DUPLA_MIN','DESPACHO_AVANCE_SOLO');
--
--  Para comprobar a quién apunta la excepción:
--    SELECT nombre, especialidad FROM usuarios
--     WHERE id::text = ANY (string_to_array(
--       (SELECT value FROM app_config WHERE key = 'DESPACHO_AVANCE_SOLO'), ','));
-- ============================================================
