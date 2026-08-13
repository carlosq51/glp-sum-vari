-- ============================================================
--  GLP-UI · INVENTARIO v2 — códigos (SN / código de empresa),
--  traspasos entre técnicos y bitácora de movimientos.
--  Ejecutar UNA VEZ en Supabase Dashboard → SQL Editor.
--  Idempotente: se puede correr de nuevo sin romper nada.
--  Requiere haber corrido antes `supabase/inventario.sql`.
-- ============================================================

-- ────────────────────────────────────────────
--  1. CÓDIGOS en los ítems del técnico
--     Equipos como taladros tienen serie del fabricante (SN) y
--     código interno de la empresa. Ambos opcionales y en texto
--     libre (hay marcas con letras, guiones, etc.).
-- ────────────────────────────────────────────
ALTER TABLE inventario_tecnico_items ADD COLUMN IF NOT EXISTS serie  TEXT DEFAULT '';
ALTER TABLE inventario_tecnico_items ADD COLUMN IF NOT EXISTS codigo TEXT DEFAULT '';

-- Búsqueda por código/SN (case-insensitive), solo sobre los que lo tienen.
CREATE INDEX IF NOT EXISTS idx_inv_items_serie
  ON inventario_tecnico_items (lower(serie))  WHERE serie  <> '';
CREATE INDEX IF NOT EXISTS idx_inv_items_codigo
  ON inventario_tecnico_items (lower(codigo)) WHERE codigo <> '';

-- El código de empresa no se puede repetir (es una etiqueta física única).
-- El SN tampoco: identifica una unidad concreta del fabricante.
-- Índices parciales para no chocar con los ítems sin código.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_items_codigo_uniq
  ON inventario_tecnico_items (lower(codigo)) WHERE codigo <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_items_serie_uniq
  ON inventario_tecnico_items (lower(serie))  WHERE serie  <> '';

-- ────────────────────────────────────────────
--  2. BITÁCORA DE MOVIMIENTOS
--     Quién le pasó qué a quién. Se guarda desnormalizado (nombre
--     de la herramienta + códigos) para que el histórico sobreviva
--     aunque después se borre el ítem o la herramienta del catálogo.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventario_movimientos (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- TRASPASO (de un técnico a otro) · ASIGNACION (alta directa) · BAJA
  tipo             TEXT         NOT NULL DEFAULT 'TRASPASO',
  herramienta_id   UUID         REFERENCES herramientas_catalogo(id) ON DELETE SET NULL,
  descripcion      TEXT         NOT NULL DEFAULT '',
  marca            TEXT         DEFAULT '',
  serie            TEXT         DEFAULT '',
  codigo           TEXT         DEFAULT '',
  cantidad         INT          NOT NULL DEFAULT 1,
  origen_user_id   UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  destino_user_id  UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  origen_nombre    TEXT         DEFAULT '',
  destino_nombre   TEXT         DEFAULT '',
  nota             TEXT         DEFAULT '',
  hecho_por        TEXT         DEFAULT '',
  created_at       TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_mov_fecha   ON inventario_movimientos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_mov_origen  ON inventario_movimientos (origen_user_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_destino ON inventario_movimientos (destino_user_id);

ALTER TABLE inventario_movimientos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON inventario_movimientos FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
--  Verificación rápida (opcional):
--    SELECT count(*) FROM inventario_tecnico_items WHERE codigo <> '';
--    SELECT tipo, count(*) FROM inventario_movimientos GROUP BY tipo;
-- ============================================================
