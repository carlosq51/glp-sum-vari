-- ============================================================
--  005 · QUÉ ES CADA COSA (y los VINs de ramal bien marcados)
--  Fase 5 del orden de la base. Correr en el SQL editor (después de 004).
-- ============================================================
--
--  Por qué existe
--  --------------
--  La fase 5 se planeó como "una sola fuente por dato": la ubicación del
--  carro en un solo lugar, OTs de ramal sin VIN inventado, unificar stock y
--  retirar solicitudes_ramal. Al medirlo con los datos, casi nada de eso era
--  un duplicado:
--
--    · Ubicación: son CUATRO datos distintos que se parecen, y no se
--      contradicen ni una vez (0 carros en plaza y en zona libre a la vez,
--      0 en plaza con el traslado ya entregado, 0 con la OT terminada).
--    · VIN de ramal: es diseño. La PK de `vins` arbitra que dos ramaleros
--      no saquen el mismo código a la vez (ver nuevoVinRamal_ en
--      routes/trabajo.js). Quitarlo es un proyecto, no una limpieza.
--    · Stock: el duplicado (contadores en inventario_stock vs lotes) ya se
--      resolvió el 2026-09-03: los contadores quedaron en 0 y el almacén
--      vive en lotes + unidades. Lo asignado se calcula desde las hojas de
--      los técnicos. Solo faltaba decirlo en la base.
--    · solicitudes_ramal y ramal_*: dos procesos distintos y conectados
--      (ramal_movimientos.solicitud_id apunta a la solicitud).
--
--  Lo que sí faltaba es que la base lo DIGA. El desorden que se ve en el
--  visualizador es en buena parte eso: tablas parecidas sin nada que
--  explique en qué se diferencian. Estos COMMENT se ven en el Table Editor
--  de Supabase al pasar el mouse.
--
--  Y lo único concreto: 10 VINs de ramal del formato viejo (abril) tienen
--  modelo 'DESCONOCIDO' en vez de 'RAMAL', así que cualquier filtro de
--  "carros de verdad" por modelo se los traga. Se corrigen, y una CHECK
--  exige el marcado de aquí en adelante.

BEGIN;

-- ── 1. VINs de ramal: siempre modelo 'RAMAL' ──
UPDATE vins SET modelo = 'RAMAL' WHERE vin LIKE 'RAMAL-%' AND modelo IS DISTINCT FROM 'RAMAL';
ALTER TABLE vins
  ADD CONSTRAINT vins_ramal_marcado CHECK (vin NOT LIKE 'RAMAL-%' OR modelo = 'RAMAL');

COMMENT ON TABLE vins IS
  'Padrón de vehículos. Lo llena Apps Script (REPORTE PRINCIPAL) desde la hoja cada 6 h, así que la app puede ver un carro antes de que esté aquí. OJO: también hay filas que NO son carros: los códigos de las OTs de ramal (vin RAMAL-AAMMDD-MARCA-NN, modelo = ''RAMAL''). Para contar carros: WHERE modelo <> ''RAMAL''.';

-- ── 2. Dónde está el carro: cuatro preguntas distintas ──
COMMENT ON COLUMN vins.ultima_ubicacion IS
  'Zona del PATIO grande (LISTOS, ZONA DE ESPERA PINTURA, ...), tal como la reporta el sistema externo. Viene de Apps Script; la app solo la lee. No es la plaza del taller (eso es conversion_zonas).';
COMMENT ON TABLE conversion_zonas IS
  'Las 15 plazas DENTRO del taller de conversión: qué carro ocupa cada una ahora. Una fila por plaza. Si el carro está en el taller pero sin plaza, está en zona_libre. El historial de movimientos está en zonas_historial.';
COMMENT ON TABLE zonas_historial IS
  'Libro de actas del mapa del taller: cada vez que un carro entra a una plaza, la deja o desplaza a otro. Solo se agregan filas; nada se edita.';
COMMENT ON TABLE movilizador_traslados IS
  'En qué paso del FLUJO va el carro según el movilizador (EN_ESPERA_CONVERSION → TRASLADADO → ENTREGADO_CALIDAD → ENTREGADO_FINAL). Es un estado del proceso, no un lugar físico. Una fila por VIN.';

-- ── 3. Ramales: dos procesos conectados ──
COMMENT ON TABLE solicitudes_ramal IS
  'Pedidos de ramal: un técnico pide un ramal para su carro y el ramalero se lo entrega. Es la cola del día a día. No es lo mismo que ramal_lotes.';
COMMENT ON TABLE ramal_lotes IS
  'Equipos que llegan en un día (por marca) para que los ramaleros los armen. Se reparten en ramal_repartos y cada movimiento queda en ramal_movimientos; una ENTREGA a un técnico apunta a su solicitudes_ramal.';

-- ── 4. Inventario: dónde vive cada cantidad ──
COMMENT ON TABLE inventario_stock IS
  'Ficha de almacén por herramienta: stock_minimo, ubicacion y nota. Las CANTIDADES no están aquí: lo suelto está en inventario_stock_lotes y lo identificado en inventario_stock_unidades. Lo asignado tampoco: se calcula desde inventario_tecnico_items.';
COMMENT ON COLUMN inventario_stock.cantidad_almacen IS
  'Contador heredado. Desde 2026-09-03 el almacén se lleva por lotes y esto vale 0; el código solo lo suma por compatibilidad. No escribir aquí.';
COMMENT ON COLUMN inventario_stock.cantidad_malogrado IS
  'Contador heredado (ver cantidad_almacen). Lo malogrado está en inventario_stock_lotes con estado MAL.';
COMMENT ON TABLE inventario_stock_lotes IS
  'Almacén a granel (herramientas sin código): cantidad + estado (OK/MAL) + ubicación + marca. Un ingreso = un lote; un lote que llega a 0 se borra.';
COMMENT ON TABLE inventario_stock_unidades IS
  'Almacén: unidades identificadas (con código de empresa o serie), una fila cada una. Al entregarse a un técnico pasan a inventario_tecnico_items; nunca están en los dos sitios.';
COMMENT ON TABLE inventario_tecnico_items IS
  'Lo que tiene cada técnico (su hoja). Un ítem con código o serie es UNA unidad física concreta (cantidad 1).';

COMMIT;
