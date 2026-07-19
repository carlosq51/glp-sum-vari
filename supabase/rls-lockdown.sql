-- ═══════════════════════════════════════════════════════════════════════════
--  RLS LOCKDOWN — paso 2 del plan de seguridad (jul-2026)
--
--  ANTES de ejecutar esto, verificar DOS cosas:
--    1. Que la app desplegada incluya el commit que migra el CRUD de Admin
--       al backend (el navegador ya no escribe directo a Supabase).
--    2. Que en Render exista la variable de entorno SUPABASE_SERVICE_KEY
--       (Settings → Environment). Sin ella, el backend escribe con la anon
--       key y este lockdown también lo bloquearía a él.
--
--  Qué hace:
--    • Elimina las políticas "service_full_access" (USING true) que daban
--      lectura Y ESCRITURA total a cualquiera con la anon key — la anon key
--      es pública (se sirve a todo visitante en /env-config.js).
--    • Crea políticas de SOLO LECTURA (SELECT) para las 6 tablas que el
--      frontend aún lee directo (incluye Realtime de asignaciones/work_orders).
--    • Ninguna tabla queda con INSERT/UPDATE/DELETE para anon: las
--      escrituras solo pueden venir del backend (service key, que bypassea
--      RLS por diseño de Supabase).
--
--  Ejecutar en: Supabase Dashboard → SQL Editor → pegar todo → Run.
--  Rollback de emergencia (restaura el estado anterior, INSEGURO):
--    CREATE POLICY "service_full_access" ON <tabla> FOR ALL USING (true) WITH CHECK (true);
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Fuera las políticas permisivas ───────────────────────────────────────
DROP POLICY IF EXISTS "service_full_access" ON vins;
DROP POLICY IF EXISTS "service_full_access" ON usuarios;
DROP POLICY IF EXISTS "service_full_access" ON usuario_modulos;
DROP POLICY IF EXISTS "service_full_access" ON work_orders;
DROP POLICY IF EXISTS "service_full_access" ON asignaciones;
DROP POLICY IF EXISTS "service_full_access" ON eventos;
DROP POLICY IF EXISTS "service_full_access" ON incidencias;
DROP POLICY IF EXISTS "service_full_access" ON solicitudes_ramal;
DROP POLICY IF EXISTS "service_full_access" ON movilizador_traslados;
DROP POLICY IF EXISTS "service_full_access" ON lista_diaria_activa;

-- ── 2. Solo lectura para el frontend (anon) donde aún lee directo ───────────
-- Lo usan: getMisActivas/getMisFinalizadas/getEstadoTrabajo (asignaciones,
-- work_orders, vins, usuarios), getIncidencias (incidencias), login/perfil
-- (usuarios, usuario_modulos) y el Realtime de asignaciones/work_orders.
CREATE POLICY "anon_read_only" ON usuarios         FOR SELECT USING (true);
CREATE POLICY "anon_read_only" ON usuario_modulos  FOR SELECT USING (true);
CREATE POLICY "anon_read_only" ON asignaciones     FOR SELECT USING (true);
CREATE POLICY "anon_read_only" ON work_orders      FOR SELECT USING (true);
CREATE POLICY "anon_read_only" ON vins             FOR SELECT USING (true);
CREATE POLICY "anon_read_only" ON incidencias      FOR SELECT USING (true);

-- eventos, solicitudes_ramal, movilizador_traslados y lista_diaria_activa
-- quedan SIN política anon: ni lectura ni escritura desde el navegador
-- (todo su tráfico ya pasa por el backend).

-- ── 3. Tablas creadas en migraciones posteriores sin RLS ────────────────────
-- Asegurar RLS activo (sin política anon = solo service key).
ALTER TABLE IF EXISTS conformidades      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_config         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS zonas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pairing_model      ENABLE ROW LEVEL SECURITY;

-- ── 4. Verificación rápida (opcional, correr después) ───────────────────────
-- SELECT tablename, policyname, cmd FROM pg_policies ORDER BY tablename;
-- Esperado: solo políticas "anon_read_only" con cmd = SELECT en las 6 tablas.
