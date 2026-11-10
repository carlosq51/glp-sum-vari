-- ============================================================
--  014 · CELULAR DE CADA USUARIO
--  Correr en el SQL editor (después de 013).
-- ============================================================
--
--  Por qué existe
--  --------------
--  Con el celular, la tarjeta de Calidad tiene 📞 (llamada normal) y 🟢
--  (WhatsApp) junto al MOTOR y al TANQUERO, y el agente de WhatsApp
--  etiqueta (@) al técnico de una incidencia en el grupo.
--
--  Formato: solo dígitos con el código de país, sin "+" ni espacios
--  (51987654321). Vacío = sin celular. Desde Admin es obligatorio al crear
--  o editar un usuario; lo que ya existía queda vacío hasta que se llene.
--
--  Quién lo lee: lib/authz.js (padrón), routes/telefonos.js (solo CALIDAD,
--  SUPERVISOR y ADMIN: los técnicos no ven el número de los demás).
-- ============================================================

BEGIN;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono text NOT NULL DEFAULT '';

DO $$ BEGIN
  ALTER TABLE usuarios ADD CONSTRAINT usuarios_telefono_formato
    CHECK (telefono = '' OR telefono ~ '^[0-9]{8,15}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN usuarios.telefono IS
  'Celular con código de país, solo dígitos (51987654321). Lo usan los botones 📞/🟢 de Calidad y las etiquetas del grupo de WhatsApp.';

COMMIT;
