-- ============================================================
--  GLP-UI · INVENTARIO v3 — EXISTENCIAS (STOCK DE ALMACÉN)
--  Ejecutar UNA VEZ en Supabase Dashboard → SQL Editor.
--  Idempotente: se puede correr de nuevo sin romper nada.
--  Requiere `supabase/inventario.sql` y `supabase/inventario-codigos-traspaso.sql`.
--
--  MODELO DE EXISTENCIAS
--  ─────────────────────
--  El stock de cada herramienta del catálogo se parte en tres:
--
--    LIBRES     → unidades físicas en el almacén, sanas y listas para entregar.
--    MALOGRADAS → unidades que siguen en el almacén pero NO se pueden usar
--                 (rotas, esperando reparación). Están en el estante, así que
--                 cuentan como patrimonio, pero no como disponibles.
--
--                 Las dos se llevan en dos sitios que NO se solapan: los
--                 contadores de `inventario_stock` para lo suelto, y una
--                 fila por unidad en `inventario_stock_unidades` para lo
--                 que tiene código de empresa o número de serie (bloque 4).
--    ASIGNADAS  → unidades que ya tiene un técnico.
--                 NO se guardan aquí: se calculan sumando
--                 `inventario_tecnico_items.cantidad` (única fuente de verdad).
--
--    TOTAL FÍSICO             = LIBRES + MALOGRADAS + ASIGNADAS
--    DISPONIBLE PARA ENTREGAR = LIBRES
--
--  Esto evita el error clásico de llevar el mismo dato en dos sitios: lo
--  que está con los técnicos ya está contado en sus hojas, y el almacén
--  solo lleva lo que le queda en el estante (sano o roto).
--
--  Cada movimiento queda en `inventario_movimientos` (tabla ya existente):
--    ENTRADA     compra / ingreso al almacén        (+ libres)
--    SALIDA      baja, pérdida o rotura del almacén (− libres)
--    AJUSTE      conteo físico: fija el saldo real  (± libres)
--    ENTREGA     almacén → técnico                  (− libres, + asignadas)
--    DEVOLUCION  técnico → almacén                  (+ libres, − asignadas)
--    ASIGNACION  alta directa a un técnico (flujo antiguo, sin pasar por almacén)
--    TRASPASO    técnico → técnico (no toca el almacén)
--    AVERIA      se malogró estando en el almacén  (− libres, + malogradas)
--    REPARACION  volvió a servir                   (+ libres, − malogradas)
--    DESECHO     se bota la unidad malograda       (− malogradas)
--    DESCONTINUAR / REACTIVAR
--                la herramienta entera sale (o vuelve) del catálogo vivo
-- ============================================================

-- ────────────────────────────────────────────
--  1. EXISTENCIAS EN ALMACÉN (una fila por herramienta del catálogo)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventario_stock (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  herramienta_id   UUID         NOT NULL UNIQUE
                                REFERENCES herramientas_catalogo(id) ON DELETE CASCADE,
  -- Unidades libres en el estante. Puede quedar negativo si alguien entregó
  -- más de lo que había registrado: la UI lo marca como «descuadre» para que
  -- se corrija con un conteo físico, en vez de esconder el error.
  cantidad_almacen INT          NOT NULL DEFAULT 0,
  -- Punto de pedido: por debajo de esto la UI avisa «bajo mínimo».
  stock_minimo     INT          NOT NULL DEFAULT 0,
  ubicacion        TEXT         NOT NULL DEFAULT '',
  nota             TEXT         NOT NULL DEFAULT '',
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_stock_herr ON inventario_stock (herramienta_id);

ALTER TABLE inventario_stock ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON inventario_stock FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────
--  2. Toda herramienta del catálogo tiene su fila de stock
--     (backfill de lo que ya existe + trigger para lo que venga).
-- ────────────────────────────────────────────
INSERT INTO inventario_stock (herramienta_id, cantidad_almacen)
SELECT h.id, 0
FROM herramientas_catalogo h
WHERE NOT EXISTS (SELECT 1 FROM inventario_stock s WHERE s.herramienta_id = h.id);

CREATE OR REPLACE FUNCTION inventario_stock_autocrear_() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventario_stock (herramienta_id, cantidad_almacen)
  VALUES (NEW.id, 0)
  ON CONFLICT (herramienta_id) DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventario_stock_autocrear ON herramientas_catalogo;
CREATE TRIGGER trg_inventario_stock_autocrear
  AFTER INSERT ON herramientas_catalogo
  FOR EACH ROW EXECUTE FUNCTION inventario_stock_autocrear_();

-- ────────────────────────────────────────────
--  3. MALOGRADAS Y DESCONTINUADAS
--
--  Son dos cosas distintas y conviene no confundirlas:
--
--    MALOGRADA      es una UNIDAD concreta que se rompió. Sigue en el
--                   estante (por eso cuenta como patrimonio) pero no se
--                   puede entregar. Puede repararse y volver a libres, o
--                   desecharse y desaparecer del inventario.
--    DESCONTINUADA  es la HERRAMIENTA entera: ya no se compra ni se usa
--                   más. No se borra del catálogo — el histórico de quién
--                   la tuvo tiene que sobrevivir — solo se marca inactiva
--                   para que deje de ofrecerse en entregas y kits nuevos.
--                   Reutiliza la columna `activo` que ya existía, para no
--                   llevar el mismo estado en dos sitios.
-- ────────────────────────────────────────────
ALTER TABLE inventario_stock
  ADD COLUMN IF NOT EXISTS cantidad_malogrado INT NOT NULL DEFAULT 0;

ALTER TABLE herramientas_catalogo
  ADD COLUMN IF NOT EXISTS descontinuada_motivo TEXT NOT NULL DEFAULT '';
ALTER TABLE herramientas_catalogo
  ADD COLUMN IF NOT EXISTS descontinuada_at TIMESTAMPTZ;

-- ────────────────────────────────────────────
--  4. UNIDADES IDENTIFICADAS EN EL ALMACÉN
--
--  Un taladro tiene número de serie; un alicate no. Los inventarios reales
--  manejan esas dos naturalezas por separado y aquí igual:
--
--    A GRANEL      herramientas intercambiables entre sí. No importa cuál
--                  te llevas, solo cuántas quedan. Son los contadores
--                  `cantidad_almacen` y `cantidad_malogrado` de arriba.
--    IDENTIFICADAS equipos con código de empresa o número de serie: cada
--                  unidad es una cosa concreta y rastreable. Viven aquí,
--                  una fila por unidad física.
--
--  Por eso NO hay doble contabilidad: los contadores llevan solo lo suelto
--  y esta tabla lo identificado. La UI suma las dos cosas:
--    LIBRES     = cantidad_almacen   + unidades con estado OK
--    MALOGRADAS = cantidad_malogrado + unidades con estado MAL
--
--  Cuando una unidad identificada se entrega, su fila se mueve a
--  `inventario_tecnico_items` (y al devolverse, vuelve aquí): así el
--  código/SN nunca queda duplicado en los dos sitios a la vez.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventario_stock_unidades (
  id             UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  herramienta_id UUID                NOT NULL REFERENCES herramientas_catalogo(id) ON DELETE CASCADE,
  marca          TEXT                NOT NULL DEFAULT '',
  codigo         TEXT                NOT NULL DEFAULT '',
  serie          TEXT                NOT NULL DEFAULT '',
  -- Solo OK (lista para entregar) o MAL (rota, esperando reparación).
  estado         estado_herramienta  NOT NULL DEFAULT 'OK',
  ubicacion      TEXT                NOT NULL DEFAULT '',
  nota           TEXT                NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ         NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_stku_herr   ON inventario_stock_unidades (herramienta_id);
CREATE INDEX IF NOT EXISTS idx_inv_stku_estado ON inventario_stock_unidades (estado);

-- El código de empresa y el SN identifican una unidad concreta: no se
-- repiten. Índices parciales para no chocar con las filas que no lo tienen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_stku_codigo_uniq
  ON inventario_stock_unidades (lower(codigo)) WHERE codigo <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_stku_serie_uniq
  ON inventario_stock_unidades (lower(serie))  WHERE serie  <> '';

ALTER TABLE inventario_stock_unidades ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON inventario_stock_unidades FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────
--  5. Vista de consulta: libres + malogradas + asignadas + total, ya sumado.
--     La UI calcula lo mismo en el cliente; esta vista es para
--     revisar el inventario desde el SQL Editor o un reporte.
--
--     Va DROP antes del CREATE a propósito: `CREATE OR REPLACE VIEW` solo
--     deja AÑADIR columnas al final, y aquí `malogradas` entra en medio
--     (después de `libres`). Sin el DROP, quien ya corrió la versión
--     anterior recibiría «cannot change name of view column "asignadas"».
--     Borrar la vista no toca ningún dato: es solo una consulta guardada.
-- ────────────────────────────────────────────
DROP VIEW IF EXISTS v_inventario_existencias;

CREATE VIEW v_inventario_existencias AS
SELECT
  h.id                                   AS herramienta_id,
  h.nombre,
  h.categoria,
  h.especialidad,
  h.activo,
  -- Libres y malogradas suman lo suelto (contadores) más lo identificado
  -- (una fila por unidad). Ver el bloque 4.
  COALESCE(s.cantidad_almacen, 0)   + COALESCE(u.ok, 0)   AS libres,
  COALESCE(s.cantidad_malogrado, 0) + COALESCE(u.mal, 0)  AS malogradas,
  COALESCE(a.asignadas, 0)                                AS asignadas,
  COALESCE(s.cantidad_almacen, 0) + COALESCE(u.ok, 0)
    + COALESCE(s.cantidad_malogrado, 0) + COALESCE(u.mal, 0)
    + COALESCE(a.asignadas, 0)                            AS total,
  COALESCE(u.ok, 0) + COALESCE(u.mal, 0)                  AS identificadas,
  COALESCE(s.stock_minimo, 0)            AS stock_minimo,
  COALESCE(s.ubicacion, '')              AS ubicacion,
  COALESCE(h.descontinuada_motivo, '')   AS descontinuada_motivo,
  COALESCE(a.tecnicos, 0)                AS tecnicos
FROM herramientas_catalogo h
LEFT JOIN inventario_stock s ON s.herramienta_id = h.id
LEFT JOIN (
  SELECT herramienta_id,
         COUNT(*) FILTER (WHERE estado <> 'MAL') AS ok,
         COUNT(*) FILTER (WHERE estado  = 'MAL') AS mal
  FROM inventario_stock_unidades
  GROUP BY herramienta_id
) u ON u.herramienta_id = h.id
LEFT JOIN (
  SELECT i.herramienta_id,
         SUM(i.cantidad)              AS asignadas,
         COUNT(DISTINCT t.user_id)    AS tecnicos
  FROM inventario_tecnico_items i
  JOIN inventario_tecnico t ON t.id = i.inventario_id
  WHERE i.herramienta_id IS NOT NULL
  GROUP BY i.herramienta_id
) a ON a.herramienta_id = h.id;

-- ============================================================
--  Verificación rápida (opcional):
--    SELECT nombre, libres, malogradas, asignadas, total
--    FROM v_inventario_existencias ORDER BY total DESC LIMIT 20;
--    -- Qué hay roto esperando reparación:
--    SELECT nombre, malogradas FROM v_inventario_existencias WHERE malogradas > 0;
--    -- Descontinuadas que todavía tienen unidades por recuperar:
--    SELECT nombre, total FROM v_inventario_existencias WHERE NOT activo AND total > 0;
--    SELECT tipo, count(*) FROM inventario_movimientos GROUP BY tipo;
-- ============================================================
