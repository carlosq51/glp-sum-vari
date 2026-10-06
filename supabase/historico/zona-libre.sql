-- ============================================================
--  ZONA LIBRE  ·  tabla propia
--  Ejecutar una vez en el SQL editor de Supabase.
-- ============================================================
--
--  Por qué existe
--  --------------
--  Hasta ahora "Zona Libre" no era un sitio: era el RESTO. El mapa la
--  calculaba restando, de todos los VIN con OT de conversión viva, los que
--  ocupaban una de las 15 plazas. Nadie mandaba un carro ahí — caía solo.
--
--  Eso tenía dos efectos feos:
--
--    · Un carro entraba en Zona Libre en cuanto se le abría la OT, aunque
--      nadie lo hubiera visto ni colocado. Al escribir esto, 18 de los 30
--      carros vivos estaban ahí "por omisión".
--    · Como era un cálculo y no un registro, nada podía sacarlo. Un carro
--      con una OT que nadie cerró se quedaba en el mapa para siempre
--      (9BWBL6DF3TT394202 llevaba desde marzo).
--
--  Con esta tabla, Zona Libre se asigna a mano igual que las 15 plazas: si
--  no hay fila, el carro no está ahí. Arranca VACÍA a propósito — los que
--  estaban por omisión no se migran, hay que colocarlos.
--
--  No se añade zona_id=16 a conversion_zonas porque aquella tabla es UNA
--  fila por plaza (zona_id es su clave primaria, con CHECK 1..15) y Zona
--  Libre tiene que poder guardar varios carros a la vez.

CREATE TABLE IF NOT EXISTS zona_libre (
  vin            TEXT        PRIMARY KEY REFERENCES vins(vin),
  registrado_por TEXT        NOT NULL DEFAULT '',
  registrado_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE zona_libre ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_access" ON zona_libre FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE zona_libre IS
  'Carros en el área de desborde. Se asigna a mano, como las 15 plazas. Un carro sale de aquí al entrar en calidad o al colocarse en una plaza.';
