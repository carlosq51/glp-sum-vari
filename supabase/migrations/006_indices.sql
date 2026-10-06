-- ============================================================
--  006 · ÍNDICES: el que faltaba, y fuera los repetidos y los que nunca se usaron
--  Correr en el SQL editor (después de 005).
-- ============================================================
--
--  Por qué existe
--  --------------
--  Revisión de los 87 índices el 2026-10-06 con las estadísticas de la base
--  (pg_stat_user_indexes, pg_stat_statements y EXPLAIN ANALYZE en producción).
--
--  1. FALTABA uno: asignaciones(work_order_id). El único índice que empieza
--     por esa columna es parcial (WHERE activo = true), así que toda consulta
--     de las asignaciones de una OT sin ese filtro —la consulta de VIN, el
--     admin, informes, invitado, borrar una OT— recorre la tabla ENTERA: hoy
--     14 460 filas por OT, y crece ~2 500 al mes. Historia: una consulta del
--     LIVE que embebía asignaciones por OT llegó a sumar 10 h de CPU de la
--     base (30 000 llamadas × 1,2 s) antes de cambiarse el 2026-09-01. En la
--     medición de hoy siguen siendo 119 recorridos completos cada 15 min.
--
--  2. Cinco índices REPETIDOS: otro índice ya cubre exactamente lo mismo.
--     No aceleran nada y se actualizan en cada escritura.
--       usuarios.idx_usuarios_email           = usuarios_email_key (UNIQUE)
--       inventario_stock.idx_inv_stock_herr   = inventario_stock_herramienta_id_key (UNIQUE)
--       inventario_tecnico_items.idx_inv_items_codigo = idx_inv_items_codigo_uniq (mismo predicado)
--       inventario_tecnico_items.idx_inv_items_serie  = idx_inv_items_serie_uniq  (mismo predicado)
--       despacho_dupla_miembros.idx_dupla_miembro_dupla (dupla_id) = prefijo de la PK (dupla_id, user_id)
--
--  3. Cuatro que NUNCA se usaron (idx_scan = 0 desde que existe la base; las
--     estadísticas nunca se reiniciaron):
--       work_orders.idx_wo_ot          numero_ot — la búsqueda por OT usa ilike '%…%', que no puede usarlo
--       despacho_propuestas.idx_prop_carro   carro_id — se agrupa en memoria, nunca se filtra en la base
--       conversion_zonas.idx_cz_vin    tabla de 15 filas: un índice no le gana a leerla entera
--       usuarios.idx_usuarios_activo   tabla de 60 filas: ídem
--
--  Lo que NO se toca, a propósito:
--    · Las ~45 llaves foráneas sin índice que apuntan a usuarios, kits o
--      plazas: solo pesan al BORRAR un usuario o una plaza (casi nunca) y
--      las tablas hijas son chicas. Un índice por cada una costaría en cada
--      escritura para ahorrar en algo que no pasa.
--    · Índices poco usados pero útiles para reportes (eventos.idx_evt_ts,
--      vins.idx_vins_cliente, ...): se usan, poco, y pesan poco.

BEGIN;

-- 1. El que faltaba
CREATE INDEX IF NOT EXISTS idx_asg_work_order ON asignaciones (work_order_id);

-- 2. Repetidos
DROP INDEX IF EXISTS idx_usuarios_email;
DROP INDEX IF EXISTS idx_inv_stock_herr;
DROP INDEX IF EXISTS idx_inv_items_codigo;
DROP INDEX IF EXISTS idx_inv_items_serie;
DROP INDEX IF EXISTS idx_dupla_miembro_dupla;

-- 3. Nunca usados
DROP INDEX IF EXISTS idx_wo_ot;
DROP INDEX IF EXISTS idx_prop_carro;
DROP INDEX IF EXISTS idx_cz_vin;
DROP INDEX IF EXISTS idx_usuarios_activo;

COMMIT;

-- Verificación: la consulta de asignaciones de una OT ya no recorre la tabla.
--   EXPLAIN SELECT * FROM asignaciones
--   WHERE work_order_id = (SELECT id FROM work_orders LIMIT 1);
--   → "Index Scan using idx_asg_work_order" (antes: "Seq Scan on asignaciones")
