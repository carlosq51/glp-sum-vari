-- ============================================================
--  VISTA INVITADO  ·  columna ESTADO del padrón
--  Ejecutar una vez en el SQL editor de Supabase.
-- ============================================================
--
--  Por qué existe esta columna
--  ---------------------------
--  PDI despacha carros al cliente sin GLP. La vista /invitado deja que
--  cualquiera escanee un VIN y sepa si el carro puede salir o no.
--
--  Para eso no basta con mirar las OTs: hay dos casos en los que el carro
--  NO necesita GLP y la app, sin este dato, lo marcaría como "FALTA GLP"
--  y frenaría un despacho correcto:
--
--    ANULADO   – la solicitud de conversión se anuló.
--    DELEGADO  – el carro se convierte en otra sede (Surquillo).
--
--  El dato vive en la columna AE (31) de las hojas de ASIGNACIONES y lo
--  sube el Apps Script del reporte. Vacío = carro normal, sigue su curso.
--  Se guarda tal cual viene del Sheet (PRESELECCIONADO y demás incluidos):
--  la app solo distingue ANULADO y DELEGADO, y lo que no reconoce lo trata
--  como normal. Así un valor nuevo en el Sheet nunca bloquea un carro por
--  sorpresa — a lo sumo lo deja seguir el flujo de siempre.

ALTER TABLE vins ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT '';

-- Los dos estados que sacan al carro del flujo son una minoría del padrón,
-- y la consulta del invitado busca por PK (vin), no por estado. El índice
-- es para los informes que quieran listar anulados o delegados.
CREATE INDEX IF NOT EXISTS idx_vins_estado ON vins (estado) WHERE estado <> '';

COMMENT ON COLUMN vins.estado IS
  'ESTADO de ASIGNACIONES col AE. ANULADO / DELEGADO sacan al carro del flujo GLP; vacío u otro valor = normal.';
