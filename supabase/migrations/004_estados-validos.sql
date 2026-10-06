-- ============================================================
--  004 · ESTADOS CON VALORES PERMITIDOS
--  Fase 4 del orden de la base. Correr en el SQL editor (después de 003).
-- ============================================================
--
--  Por qué existe
--  --------------
--  Varias columnas de estado son texto libre: la base acepta cualquier
--  cosa, y un error de tipeo en el código ("TRASLADDO") se guarda en
--  silencio y desaparece de todos los filtros.
--
--  Se usa CHECK y no enum a propósito: la protección es la misma (la base
--  rechaza lo que no está en la lista), pero el tipo de la columna no
--  cambia, así que ni el código ni Apps Script notan nada. Las listas son
--  exactamente lo que escribe el código hoy:
--
--    vins.estado                   Apps Script (syncEstadosPadron_) y nadie más
--    movilizador_traslados.estado  routes/movilizador.js
--    inventario_movimientos.tipo   logMov_ en public/js/views/admin/inventario.js
--    zonas_historial.accion        routes/zonas.js
--
--  Un valor nuevo en el código = una migración que lo agrega aquí.
--
--  Y incidencias.mes: 437 filas migradas desde la hoja vieja tienen
--  "Sun Mar 01 2026 00:00:00 GMT-0500 (Peru Standard Time)" en vez de
--  "2026-03". Como el dashboard de incidencias filtra por mes=eq.AAAA-MM,
--  esas filas no aparecían en ningún mes. Se recalculan desde fecha_hora.

BEGIN;

-- 1. incidencias.mes: AAAA-MM, recalculado desde la fecha real (hora de Lima)
UPDATE incidencias
SET mes = to_char(fecha_hora AT TIME ZONE 'America/Lima', 'YYYY-MM')
WHERE mes !~ '^\d{4}-\d{2}$';

ALTER TABLE incidencias
  ADD CONSTRAINT incidencias_mes_formato CHECK (mes ~ '^\d{4}-\d{2}$');

-- 2. Estados
ALTER TABLE vins
  ADD CONSTRAINT vins_estado_valido
  CHECK (estado IS NULL OR estado IN ('', 'ANULADO', 'DELEGADO'));

ALTER TABLE movilizador_traslados
  ADD CONSTRAINT movilizador_traslados_estado_valido
  CHECK (estado IN ('EN_ESPERA_CONVERSION', 'TRASLADADO', 'ENTREGADO_CALIDAD', 'ENTREGADO_FINAL'));

ALTER TABLE inventario_movimientos
  ADD CONSTRAINT inventario_movimientos_tipo_valido
  CHECK (tipo IN ('ENTRADA', 'SALIDA', 'ASIGNACION', 'ENTREGA', 'DEVOLUCION', 'TRASPASO',
                  'AJUSTE', 'AUDITORIA', 'AVERIA', 'REPARACION', 'DESECHO',
                  'DESCONTINUAR', 'REACTIVAR'));

ALTER TABLE zonas_historial
  ADD CONSTRAINT zonas_historial_accion_valida
  CHECK (accion IN ('ASIGNAR', 'DESPLAZADO', 'LIBERAR'));

COMMIT;

-- Verificación: cuántas filas quedaron con mes raro (debe ser 0).
--   SELECT count(*) FROM incidencias WHERE mes !~ '^\d{4}-\d{2}$';
