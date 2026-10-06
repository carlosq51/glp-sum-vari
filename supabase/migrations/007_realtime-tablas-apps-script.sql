-- ============================================================
--  007 · REALTIME PARA LO QUE ESCRIBE APPS SCRIPT
--  Correr en el SQL editor (después de 006).
-- ============================================================
--
--  Por qué existe
--  --------------
--  Todo lo que cambia la app pasa por el servidor, y él avisa con emitEvent_
--  (borra sus caches y despierta las pantallas por SSE). Apps Script es la
--  excepción: escribe directo en estas tres tablas, y el servidor solo se
--  enteraba cuando vencía el TTL de sus caches. Por eso esos TTL tenían que
--  ser cortos, y cada vencimiento es una petición a Supabase y una línea de la
--  cuota de logs (1 GB/mes en el plan gratis).
--
--  Con las tablas en la publicación, el servidor abre UNA conexión de
--  Realtime (lib/realtime.js) y se entera en el momento. Los celulares no se
--  conectan a Realtime: siguen con el SSE del servidor.
--
--    · lista_diaria_activa  la reescribe enriquecerListaDiaria (REPORTE PRINCIPAL)
--    · vins                 ultima_ubicacion, estado ANULADO/DELEGADO, padrón
--    · work_orders          numero_ot, tanque y reductor (onEditAsig, ASIGNACIONES)
--
--  Idempotente: ALTER PUBLICATION ... ADD TABLE falla si la tabla ya está,
--  así que cada una se agrega solo si falta.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lista_diaria_activa', 'vins', 'work_orders'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
