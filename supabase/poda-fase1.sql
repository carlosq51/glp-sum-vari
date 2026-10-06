-- ============================================================
--  PODA · FASE 1 DEL ORDEN DE LA BASE
--  Ejecutar una vez en el SQL editor de Supabase. Va en una sola
--  transacción: si algo falla, no se aplica nada.
-- ============================================================
--
--  Por qué existe
--  --------------
--  Primera fase de ordenar Supabase (mapa: claude.ai/artifact/XGUcvdcuPtZ3G952CHAW5b).
--  Quita lo que nadie lee. Respaldo en CSV de todo lo que se toca, tomado
--  el 2026-10-06 antes de correr esto: glp-respaldos/2026-10-06-fase1/.
--
--    · ramal_rotacion / v_ramal_rotacion: la rotación del encargado de
--      ramales se dejó de usar; cero referencias en el código. La única
--      dependencia era v_ramal_desempeno (columnas `turnos` y `ultima_vez`),
--      que el código no lee — solo pide user_id y nombre. Se rehace sin ellas.
--    · v_inventario_existencias: cero referencias en el código.
--    · asistencia_jornada.carros_asignados / carros_completos: nacieron para
--      la equidad del motor, que terminó contando desde despacho_duplas y las
--      propuestas. Valen 0 en las 978 filas.
--    · app_config REV / REV_TS: el contador de AppScript sigue en
--      PropertiesService; nadie leyó nunca estas claves.
--    · despacho_pool_snapshot: el servidor ya solo guarda fotos útiles y
--      purga a diario las de más de 14 días (routes/despacho.js,
--      guardarFotoPool_). El DELETE de aquí solo adelanta esa purga.
--
--  OJO: ramales.sql y despacho.sql todavía crean lo que esto borra. No
--  volver a correrlos enteros; la fase 2 los reemplaza por migraciones.

BEGIN;

DROP VIEW IF EXISTS v_ramal_rotacion;
DROP VIEW IF EXISTS v_inventario_existencias;

DROP VIEW IF EXISTS v_ramal_desempeno;
CREATE VIEW v_ramal_desempeno AS
SELECT
  u.id                                        AS user_id,
  u.nombre,
  u.email,
  COALESCE(d.lotes, 0)                        AS lotes_revisados,
  ROUND(d.revision_min_prom::numeric, 1)      AS revision_min_prom,
  COALESCE(p.repartos, 0)                     AS repartos,
  COALESCE(p.asignados, 0)                    AS ramales_asignados,
  COALESCE(p.devueltos, 0)                    AS ramales_devueltos,
  COALESCE(p.rechazados, 0)                   AS ramales_rechazados,
  ROUND(p.armado_min_prom::numeric, 1)        AS armado_min_por_ramal,
  CASE WHEN COALESCE(p.devueltos, 0) > 0
       THEN ROUND(100.0 * p.rechazados / p.devueltos, 1)
       ELSE 0 END                             AS pct_rechazo,
  COALESCE(e.entregas, 0)                     AS entregas_a_tecnicos
FROM usuarios u
JOIN usuario_modulos um ON um.user_id = u.id AND um.modulo = 'RAMALERO'
LEFT JOIN (
  SELECT encargado_user_id AS uid,
         COUNT(*) AS lotes,
         AVG(EXTRACT(EPOCH FROM (revision_fin_at - revision_inicio_at))/60.0)
           AS revision_min_prom
  FROM ramal_lotes
  WHERE encargado_user_id IS NOT NULL
    AND revision_inicio_at IS NOT NULL
    AND revision_fin_at IS NOT NULL
  GROUP BY encargado_user_id
) d ON d.uid = u.id
LEFT JOIN (
  SELECT user_id AS uid,
         COUNT(*)                AS repartos,
         SUM(cantidad_asignada)  AS asignados,
         SUM(cantidad_devuelta)  AS devueltos,
         SUM(cantidad_rechazada) AS rechazados,
         -- Minutos por ramal: el tiempo del reparto repartido entre lo
         -- que efectivamente devolvió. Solo cuenta lo ya cerrado.
         AVG(
           CASE WHEN cantidad_devuelta > 0 AND devuelto_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (devuelto_at - asignado_at))/60.0 / cantidad_devuelta
           END
         ) AS armado_min_prom
  FROM ramal_repartos
  GROUP BY user_id
) p ON p.uid = u.id
LEFT JOIN (
  SELECT user_id AS uid, COUNT(*) AS entregas
  FROM ramal_movimientos
  WHERE tipo = 'ENTREGA' AND user_id IS NOT NULL
  GROUP BY user_id
) e ON e.uid = u.id
WHERE u.activo = true;

DROP TABLE IF EXISTS ramal_rotacion;

ALTER TABLE asistencia_jornada
  DROP COLUMN IF EXISTS carros_asignados,
  DROP COLUMN IF EXISTS carros_completos;

DELETE FROM app_config WHERE key IN ('REV', 'REV_TS');

DELETE FROM despacho_pool_snapshot
WHERE jornada_fecha < glp_jornada_fecha(now()) - 14;

COMMIT;

-- Verificación:
--   SELECT to_regclass('ramal_rotacion'), to_regclass('v_inventario_existencias');  -- null, null
--   SELECT user_id, nombre FROM v_ramal_desempeno;                                   -- 4 filas
--   SELECT count(*) FROM despacho_pool_snapshot;
