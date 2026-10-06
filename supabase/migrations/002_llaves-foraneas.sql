-- ============================================================
--  002 · LLAVES FORÁNEAS QUE FALTABAN
--  Fase 4 del orden de la base. Correr en el SQL editor DESPUÉS de
--  desplegar el commit que agrega informes_taller y pairing_omisiones a la
--  cascada de "borrar OT" (routes/ots.js): sin eso, borrar una OT que tenga
--  informe o registro de emparejamiento quedaría a medias.
-- ============================================================
--
--  Qué agrega
--  ----------
--    · informes_taller.work_order_id   text → uuid, y llave a work_orders
--    · pairing_omisiones.work_order_id text → uuid, y llave a work_orders
--    · pairing_omisiones.user_id / complement_id → usuarios
--    · pairing_omisiones.rol_trabajo   text → enum rol_trabajo (MOTOR/TANQUE)
--    · zonas_historial.zona_id / zona_anterior → conversion_zonas
--    · despacho_propuestas.zona_id → conversion_zonas
--
--  Qué NO agrega, a propósito: llaves hacia `vins` en las tablas que llena
--  el taller (conversion_zonas, zonas_historial.vin, lista_diaria_activa,
--  movilizador_*, despacho_propuestas.vin). El padrón de VINs lo sube Apps
--  Script cada 6 h, y el mapa, la lista diaria y el movilizador trabajan con
--  carros que todavía no llegaron al padrón. Una llave ahí convertiría ese
--  retraso normal en un error (el mapa rechazaría un carro nuevo). Los 3
--  huérfanos de zonas_historial son exactamente eso: un VIN que se puso en
--  el mapa el 25-09 y nunca entró al padrón.
--
--  Limpieza previa: los 2 registros de pairing_omisiones que apuntan a OTs
--  ya borradas (ids 41 y 224) se quedan, con work_order_id en NULL.
--
--  Y de paso: la anon key todavía podía EJECUTAR las funciones del schema
--  (por defecto Postgres se las da a PUBLIC). service_role conserva su
--  permiso propio, así que el servidor no nota nada.

BEGIN;

-- 1. informes_taller → work_orders
ALTER TABLE informes_taller
  ALTER COLUMN work_order_id TYPE uuid USING work_order_id::uuid;
ALTER TABLE informes_taller
  ADD CONSTRAINT informes_taller_work_order_id_fkey
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id);

-- 2. pairing_omisiones → work_orders, usuarios, y rol como enum
UPDATE pairing_omisiones p SET work_order_id = NULL
WHERE work_order_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.id::text = p.work_order_id);

ALTER TABLE pairing_omisiones
  ALTER COLUMN work_order_id TYPE uuid USING NULLIF(work_order_id, '')::uuid,
  ALTER COLUMN rol_trabajo   TYPE rol_trabajo USING NULLIF(rol_trabajo, '')::rol_trabajo;
ALTER TABLE pairing_omisiones
  ADD CONSTRAINT pairing_omisiones_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id),
  ADD CONSTRAINT pairing_omisiones_user_id_fkey       FOREIGN KEY (user_id)       REFERENCES usuarios(id),
  ADD CONSTRAINT pairing_omisiones_complement_id_fkey FOREIGN KEY (complement_id) REFERENCES usuarios(id);

-- 3. Plazas del mapa (1–15)
ALTER TABLE zonas_historial
  ADD CONSTRAINT zonas_historial_zona_id_fkey       FOREIGN KEY (zona_id)       REFERENCES conversion_zonas(zona_id),
  ADD CONSTRAINT zonas_historial_zona_anterior_fkey FOREIGN KEY (zona_anterior) REFERENCES conversion_zonas(zona_id);
ALTER TABLE despacho_propuestas
  ADD CONSTRAINT despacho_propuestas_zona_id_fkey   FOREIGN KEY (zona_id)       REFERENCES conversion_zonas(zona_id);

-- 4. Índice para la llave nueva de pairing_omisiones: sin él, borrar una OT
--    recorre la tabla entera para comprobar que nadie la apunta.
--    (informes_taller ya tiene informes_taller_ot_idx.)
CREATE INDEX IF NOT EXISTS idx_po_work_order ON pairing_omisiones (work_order_id);

-- 5. Funciones: fuera el EXECUTE de PUBLIC (la anon key lo heredaba).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;

-- Verificación:
--   SELECT conname FROM pg_constraint WHERE conname LIKE '%_fkey'
--     AND conrelid::regclass::text IN ('informes_taller','pairing_omisiones','zonas_historial','despacho_propuestas');
--   → 7 filas.
