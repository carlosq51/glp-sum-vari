-- ============================================================
--  001 · CERRAR EL ACCESO DE LA ANON KEY
--  Fase 3 del orden de la base. Correr en el SQL editor de Supabase
--  SOLO DESPUÉS de que esté desplegado el commit que mueve el navegador a
--  /api/db, y de cambiar la clave en Apps Script (ver abajo).
-- ============================================================
--
--  Por qué existe
--  --------------
--  La anon key viaja en el JavaScript público, y las ~35 políticas
--  `service_full_access` se escribieron `FOR ALL USING (true)` SIN `TO`,
--  así que también valían para `anon`. Además `app_config`,
--  `pairing_omisiones` y `push_subscriptions` ni siquiera tenían RLS.
--  Resultado: cualquiera que abriera el bundle podía leer, cambiar o borrar
--  cualquier tabla — por ejemplo, darse el rol ADMIN en `usuarios`.
--
--  Desde el commit de la fase 3 el navegador ya no usa ninguna key: pide
--  todo a /api/db (routes/db.js), que revisa permisos y usa la service key.
--  Esta migración cierra la base con dos candados independientes:
--
--    1. RLS en TODAS las tablas y ninguna política. service_role se salta
--       la RLS (BYPASSRLS), así que el servidor no nota nada; anon y
--       authenticated no ven ni una fila.
--    2. Sin permisos de tabla para anon ni authenticated. Aunque alguien
--       volviera a crear una política abierta por error, el rol ni siquiera
--       puede nombrar la tabla. Incluye las vistas, que no pasan por RLS.
--
--  Y para lo que se cree después: los permisos POR DEFECTO dejan de
--  regalarle cada tabla nueva a anon (era la configuración de fábrica).
--
--  ANTES de correr esto: Apps Script lee Supabase con la propiedad
--  SUPABASE_KEY, que hoy es la anon key. Cambiarla por la service key en
--  Configuración del proyecto → Propiedades del script, o los reportes de
--  Sheets dejan de recibir datos.
--
--  Para volver atrás (solo en emergencia): restaurar los GRANT y las
--  políticas que están en 000_base.sql.

BEGIN;

-- 1. RLS en las tres tablas que no la tenían.
ALTER TABLE app_config         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairing_omisiones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 2. Fuera todas las políticas del schema public: todas eran "todo para
--    todos" (o variantes de lectura/insert abiertas).
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- 3. Sin permisos para los roles públicos de la API.
REVOKE ALL     ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL     ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 4. Y que lo nuevo nazca cerrado.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

COMMIT;

-- Verificación (las tres deben dar 0):
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public';
--   SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
--   SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--     WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
--
-- Y desde fuera: `npm run db:validar` debe decir "Iguales".
