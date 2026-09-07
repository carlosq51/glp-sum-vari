-- ============================================================
--  GLP-UI · RAMALES — REVISIÓN DE CAJA, REPARTO POR MARCA Y STOCK
--  Ejecutar UNA VEZ en Supabase Dashboard → SQL Editor.
--  Idempotente: se puede correr de nuevo sin romper nada, y migra
--  solo desde la versión anterior del módulo (bloque 0).
--  Requiere `supabase/schema.sql`.
--
--  EL PROBLEMA QUE RESUELVE
--  ────────────────────────
--  Antes el ramalero decía «hice 5 en una hora» y no había forma de
--  contrastarlo. Un cronómetro que arranca y para la misma persona que
--  se beneficia del número no es trazabilidad: es una declaración con
--  fecha. Aquí ningún dato que importe lo declara quien es medido.
--
--    · El turno de revisión NO lo elige el ramalero: rota (bloque 5).
--    · El cronómetro NO lo arranca el ramalero: lo abre el supervisor
--      al registrar que llegó la caja (`revision_inicio_at`).
--    · El cierre NO lo declara el ramalero: el supervisor confirma que
--      recibió la caja revisada (`revision_fin_at`). El ramalero solo
--      marca `revision_aviso_at`, que es un aviso, no la medición.
--    · Los ramales armados NO son un contador libre: salen de una caja
--      que tenía N equipos POR MARCA, se reparten en cantidades firmadas
--      y se devuelven a oficina. Lo que no cuadra, aparece como DESCUADRE.
--
--  UN SOLO TRABAJO: REVISAR LA CAJA
--  ────────────────────────────────
--  La versión anterior partía el trabajo en dos encargados con dos
--  rotaciones y dos relojes: «desembalaje» (sacar los ramales) y
--  «revisión» (los insumos de conversión). En el taller eso nunca fue
--  dos trabajos: es una persona abriendo una caja y revisando lo que
--  trae. Dos turnos para un trabajo solo lograban que el segundo nunca
--  se asignara y que la mitad de las cajas salieran sin revisor.
--
--  Ahora hay UN encargado, UN contador de turnos y UN reloj.
--
--  CAJAS MIXTAS (bloque 3)
--  ───────────────────────
--  Una caja trae 15 Jetour y 10 KYC V3. Antes el lote tenía UN
--  `tipo_ramal`, así que esa caja había que registrarla como dos cajas
--  que no eran dos cajas: dos códigos, dos relojes, dos turnos para un
--  solo camión. Ahora la caja tiene LÍNEAS (`ramal_lote_items`), una por
--  marca, y `cantidad_equipos` es su suma.
--
--  El reparto también va por marca: «a Luis 8 Jetour y 5 V3». Es lo
--  único que permite que al devolver se sepa a qué marca sumarle el
--  stock — sin eso una caja mixta rompe el saldo por marca, que es
--  justamente el número por el que se compra o se espera.
--
--  AUDITORÍA POR LOTE (no por unidad)
--  ──────────────────────────────────
--  No hay QR ni etiqueta por ramal. La unidad de control es la CAJA:
--  llegan 20 equipos → tienen que aparecer 20 ramales entre devueltos,
--  pendientes y mermas. La conservación de masa es la auditoría:
--
--    equipos_lote = Σ devueltos + Σ pendientes de devolver + merma
--
--  Si un ramalero dice que devolvió 8 y el lote solo tenía 6 asignados
--  a su nombre, el arqueo lo canta solo, sin que nadie acuse a nadie.
--
--  EL CICLO COMPLETO
--  ─────────────────
--    RECIBIDO   el supervisor registra la caja (N equipos por marca)
--    REVISANDO  corre el tiempo del encargado de turno
--    REVISADO   el supervisor confirmó que recibió la caja revisada
--    REPARTIDO  el supervisor repartió los ramales, por marca
--    CERRADO    todos devolvieron; el lote cuadró (o se cerró con nota)
--
--  Y al final el ramal armado entra al STOCK, del que sale cuando un
--  técnico lo pide por `solicitudes_ramal`. Ese es el eslabón que hace
--  honesto todo lo anterior: lo que se dijo armar tiene que aparecer
--  después en la mano de un técnico.
-- ============================================================

-- ────────────────────────────────────────────
--  1. ENUMS
-- ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE estado_lote_ramal AS ENUM
    ('RECIBIDO','REVISANDO','REVISADO','REPARTIDO','CERRADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Movimientos de stock de ramales YA ARMADOS.
--   ARMADO      el ramalero devolvió ramales trabajados a oficina   (+)
--   ENTREGA     salieron a un técnico (vía solicitudes_ramal)       (−)
--   DEVOLUCION  el técnico regresó uno sin usar                     (+)
--   MERMA       se malogró / se perdió                              (−)
--   AJUSTE      conteo físico: corrige el saldo contra la realidad  (±)
DO $$ BEGIN
  CREATE TYPE tipo_mov_ramal AS ENUM
    ('ARMADO','ENTREGA','DEVOLUCION','MERMA','AJUSTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────
--  0-bis. MIGRACIÓN desde la versión de dos turnos
--
--  Solo hace algo si la instalación es la anterior. Los enums viejos se
--  renombran en vez de crearse otros: `DESEMBALANDO` y `REVISANDO` son
--  el mismo estado con distinto nombre, y renombrar conserva las filas.
-- ────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'estado_lote_ramal' AND e.enumlabel = 'DESEMBALANDO') THEN
    ALTER TYPE estado_lote_ramal RENAME VALUE 'DESEMBALANDO' TO 'REVISANDO';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'estado_lote_ramal' AND e.enumlabel = 'DESEMBALADO') THEN
    ALTER TYPE estado_lote_ramal RENAME VALUE 'DESEMBALADO' TO 'REVISADO';
  END IF;
END $$;

-- Las vistas se recrean al final; se sueltan aquí para que los renames
-- de columna no choquen contra una vista que depende de ellas.
DROP VIEW IF EXISTS v_ramal_lote_arqueo;
DROP VIEW IF EXISTS v_ramal_desempeno;
DROP VIEW IF EXISTS v_ramal_rotacion;
DROP VIEW IF EXISTS v_ramal_stock;
DROP VIEW IF EXISTS v_ramal_lote_items;

DO $$
DECLARE
  tiene_lotes BOOLEAN := to_regclass('public.ramal_lotes') IS NOT NULL;
  tiene_rot   BOOLEAN := to_regclass('public.ramal_rotacion') IS NOT NULL;
  col         BOOLEAN;
BEGIN
  IF tiene_lotes THEN
    -- El segundo encargado desaparece. Antes de borrarlo se rescata su
    -- nombre para las cajas que se quedaron sin encargado principal: es
    -- el único caso donde ese dato era la única persona registrada.
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ramal_lotes' AND column_name='revisor_user_id') INTO col;
    IF col THEN
      UPDATE ramal_lotes
         SET encargado_user_id = revisor_user_id
       WHERE encargado_user_id IS NULL AND revisor_user_id IS NOT NULL;
      ALTER TABLE ramal_lotes DROP COLUMN revisor_user_id;
    END IF;

    -- El reloj de la revisión vieja se descarta: el que vale es el que
    -- abría y cerraba el supervisor (el de desembalaje), que ocupa estos
    -- nombres al renombrarse. Todo esto cuelga de que exista la columna
    -- vieja: sin esa guarda, correr el script dos veces borraría el
    -- reloj bueno en la segunda pasada.
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ramal_lotes' AND column_name='desembalaje_inicio_at') INTO col;
    IF col THEN
      ALTER TABLE ramal_lotes DROP COLUMN IF EXISTS revision_inicio_at;
      ALTER TABLE ramal_lotes DROP COLUMN IF EXISTS revision_fin_at;
      ALTER TABLE ramal_lotes RENAME COLUMN desembalaje_inicio_at  TO revision_inicio_at;
      ALTER TABLE ramal_lotes RENAME COLUMN desembalaje_inicio_por TO revision_inicio_por;
      ALTER TABLE ramal_lotes RENAME COLUMN desembalaje_fin_at     TO revision_aviso_at;
      ALTER TABLE ramal_lotes RENAME COLUMN cables_recibidos_at    TO revision_fin_at;
      ALTER TABLE ramal_lotes RENAME COLUMN cables_recibidos_por   TO revision_fin_por;
    END IF;
  END IF;

  IF tiene_rot THEN
    -- Dos contadores de turno para un solo trabajo se suman en uno.
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ramal_rotacion' AND column_name='veces_desembalaje') INTO col;
    IF col THEN
      ALTER TABLE ramal_rotacion RENAME COLUMN veces_desembalaje  TO veces;
      ALTER TABLE ramal_rotacion RENAME COLUMN ultimo_desembalaje TO ultima_vez;
    END IF;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ramal_rotacion' AND column_name='veces_revision') INTO col;
    IF col THEN
      UPDATE ramal_rotacion
         SET veces      = COALESCE(veces, 0) + COALESCE(veces_revision, 0),
             ultima_vez = GREATEST(COALESCE(ultima_vez, ultima_revision),
                                   COALESCE(ultima_revision, ultima_vez));
      ALTER TABLE ramal_rotacion DROP COLUMN veces_revision;
      ALTER TABLE ramal_rotacion DROP COLUMN ultima_revision;
    END IF;
  END IF;
END $$;

-- ────────────────────────────────────────────
--  2. LOTES · la caja que llega
--
--  Una fila por caja recibida. Es la unidad de auditoría: todo lo que
--  se mide (tiempo, reparto, devolución) cuelga de aquí. Lo que trae la
--  caja va en `ramal_lote_items` (bloque 3), una línea por marca.
--
--  Los tiempos vienen en pares y CADA PAR LO ABRE UNA PERSONA DISTINTA
--  de la que se beneficia del número — esa es toda la idea:
--    revision_inicio_at  lo pone el supervisor al registrar la caja
--    revision_fin_at     lo confirma el supervisor al recibir la caja
--  El ramalero solo marca `revision_aviso_at` («ya terminé»), que es un
--  aviso, no la medición: el reloj oficial cierra cuando el supervisor
--  confirma. Si el ramalero dice que acabó y el supervisor todavía no
--  tiene la caja revisada delante, el lote sigue corriendo.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ramal_lotes (
  id                     UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Código legible para hablar del lote en voz alta ("el L-260904-02").
  codigo                 TEXT              NOT NULL DEFAULT '',
  fecha                  DATE              NOT NULL DEFAULT CURRENT_DATE,
  -- Suma de las líneas de `ramal_lote_items`. Se guarda desnormalizado
  -- porque el arqueo lo usa en cada fila y porque una caja puede
  -- registrarse sin detallar marcas todavía.
  cantidad_equipos       INT               NOT NULL DEFAULT 0,
  estado                 estado_lote_ramal NOT NULL DEFAULT 'RECIBIDO',

  -- ── Encargado de REVISAR la caja (turno rotativo, bloque 5) ──
  encargado_user_id      UUID              REFERENCES usuarios(id),
  -- Se guarda si el turno se respetó o el supervisor lo pisó a mano.
  -- Sin esto la rotación «se cumple» siempre porque nadie mira el antes.
  encargado_sugerido_id  UUID              REFERENCES usuarios(id),
  revision_inicio_at     TIMESTAMPTZ,      -- lo abre el SUPERVISOR
  revision_inicio_por    TEXT              NOT NULL DEFAULT '',
  revision_aviso_at      TIMESTAMPTZ,      -- aviso del ramalero
  revision_fin_at        TIMESTAMPTZ,      -- lo confirma el SUPERVISOR
  revision_fin_por       TEXT              NOT NULL DEFAULT '',
  -- Resultado de la revisión: qué vino bien y qué vino observado.
  revision_conformes     INT               NOT NULL DEFAULT 0,
  revision_observados    INT               NOT NULL DEFAULT 0,
  revision_nota          TEXT              NOT NULL DEFAULT '',

  -- ── Cierre ──
  cerrado_at             TIMESTAMPTZ,
  cerrado_por            TEXT              NOT NULL DEFAULT '',
  -- Un lote puede cerrar sin cuadrar (se rompió uno, se perdió otro).
  -- Se cierra igual, pero con el motivo escrito: un descuadre explicado
  -- es información; uno borrado es un agujero.
  merma                  INT               NOT NULL DEFAULT 0,
  merma_motivo           TEXT              NOT NULL DEFAULT '',

  nota                   TEXT              NOT NULL DEFAULT '',
  creado_por             TEXT              NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ       NOT NULL DEFAULT now()
);

-- Instalaciones anteriores al bloque de revisión unificada.
ALTER TABLE ramal_lotes ADD COLUMN IF NOT EXISTS revision_inicio_at  TIMESTAMPTZ;
ALTER TABLE ramal_lotes ADD COLUMN IF NOT EXISTS revision_inicio_por TEXT NOT NULL DEFAULT '';
ALTER TABLE ramal_lotes ADD COLUMN IF NOT EXISTS revision_aviso_at   TIMESTAMPTZ;
ALTER TABLE ramal_lotes ADD COLUMN IF NOT EXISTS revision_fin_at     TIMESTAMPTZ;
ALTER TABLE ramal_lotes ADD COLUMN IF NOT EXISTS revision_fin_por    TEXT NOT NULL DEFAULT '';
ALTER TABLE ramal_lotes ADD COLUMN IF NOT EXISTS revision_conformes  INT  NOT NULL DEFAULT 0;
ALTER TABLE ramal_lotes ADD COLUMN IF NOT EXISTS revision_observados INT  NOT NULL DEFAULT 0;
ALTER TABLE ramal_lotes ADD COLUMN IF NOT EXISTS revision_nota       TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ramal_lote_fecha   ON ramal_lotes (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ramal_lote_estado  ON ramal_lotes (estado);
CREATE INDEX IF NOT EXISTS idx_ramal_lote_enc     ON ramal_lotes (encargado_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ramal_lote_codigo
  ON ramal_lotes (codigo) WHERE codigo <> '';

ALTER TABLE ramal_lotes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON ramal_lotes FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────
--  3. LÍNEAS DE LA CAJA · «15 Jetour y 10 V3»
--
--  Una fila por (lote, marca). Es lo que convierte una caja mixta en
--  una sola caja: antes había que partirla en dos lotes con dos códigos
--  y dos relojes para un mismo camión, y el turno se consumía dos veces.
--
--  `cantidad_equipos` del lote es la suma de estas líneas. La escribe la
--  app al guardar; el bloque 7a la vuelve a sumar para el arqueo, así
--  que si alguien la toca a mano el descuadre se ve.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ramal_lote_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id     UUID        NOT NULL REFERENCES ramal_lotes(id) ON DELETE CASCADE,
  tipo_ramal  tipo_ramal  NOT NULL,
  cantidad    INT         NOT NULL DEFAULT 0,
  nota        TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una marca aparece UNA vez por caja: si se agrega más de la misma, se
-- suma a su línea. Dos líneas de la misma marca harían que el arqueo
-- contara doble sin que nada se vea raro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ramal_item_uniq
  ON ramal_lote_items (lote_id, tipo_ramal);
CREATE INDEX IF NOT EXISTS idx_ramal_item_tipo ON ramal_lote_items (tipo_ramal);

ALTER TABLE ramal_lote_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON ramal_lote_items FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Migración: las cajas viejas tenían UNA marca en `ramal_lotes.tipo_ramal`.
-- Se convierte en su única línea y recién entonces se borra la columna:
-- primero se copia el dato, después se suelta el sitio donde vivía.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='ramal_lotes' AND column_name='tipo_ramal') THEN
    INSERT INTO ramal_lote_items (lote_id, tipo_ramal, cantidad)
    SELECT l.id, l.tipo_ramal, l.cantidad_equipos
    FROM ramal_lotes l
    WHERE l.tipo_ramal IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ramal_lote_items i WHERE i.lote_id = l.id);
    ALTER TABLE ramal_lotes DROP COLUMN tipo_ramal;
  END IF;
END $$;

-- ────────────────────────────────────────────
--  4. REPARTOS · «a Luis 8 Jetour y 5 V3»
--
--  Una fila por (lote, ramalero, marca). `cantidad_asignada` la firma el
--  supervisor; `cantidad_devuelta` la cierra el ramalero al traer el
--  trabajo a oficina. La resta de las dos es lo que sigue en la mesa.
--
--  La marca viaja en el reparto y no solo en la caja porque al devolver
--  hay que saber a qué saldo sumarle los ramales armados. En una caja de
--  una sola marca es redundante; en una mixta es la diferencia entre un
--  stock que cuadra y uno inventado.
--
--  El tiempo de armado sale de `asignado_at → devuelto_at`, y de nuevo
--  son dos personas distintas: asigna el supervisor, devuelve el
--  ramalero. Nadie controla los dos extremos de su propia métrica.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ramal_repartos (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id            UUID        NOT NULL REFERENCES ramal_lotes(id) ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES usuarios(id),
  tipo_ramal         tipo_ramal,
  cantidad_asignada  INT         NOT NULL DEFAULT 0,
  cantidad_devuelta  INT         NOT NULL DEFAULT 0,
  -- Devueltos que no pasaron revisión: es el contrapeso de la velocidad.
  -- Sin esta columna medir ramales/hora premia al que trabaja peor rápido.
  cantidad_rechazada INT         NOT NULL DEFAULT 0,
  asignado_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  asignado_por       TEXT        NOT NULL DEFAULT '',
  devuelto_at        TIMESTAMPTZ,
  nota               TEXT        NOT NULL DEFAULT '',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ramal_repartos ADD COLUMN IF NOT EXISTS tipo_ramal tipo_ramal;

-- Los repartos viejos no tenían marca: se hereda la de su caja, que era
-- la única que podía ser.
UPDATE ramal_repartos r
   SET tipo_ramal = i.tipo_ramal
  FROM (SELECT lote_id, MIN(tipo_ramal::text)::tipo_ramal AS tipo_ramal
        FROM ramal_lote_items GROUP BY lote_id HAVING COUNT(*) = 1) i
 WHERE i.lote_id = r.lote_id AND r.tipo_ramal IS NULL;

-- Un ramalero, una fila por marca y lote: si se le da más de la misma
-- marca, se SUMA a su fila en vez de abrir otra. Dos filas del mismo
-- trío harían que el arqueo contara doble y el promedio de tiempo
-- saliera partido a la mitad. `COALESCE` porque en SQL dos NULL no son
-- iguales y sin él una caja sin marca admitiría filas repetidas.
DROP INDEX IF EXISTS idx_ramal_reparto_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ramal_reparto_uniq
  ON ramal_repartos (lote_id, user_id, COALESCE(tipo_ramal::text, ''));
CREATE INDEX IF NOT EXISTS idx_ramal_reparto_user ON ramal_repartos (user_id);
CREATE INDEX IF NOT EXISTS idx_ramal_reparto_lote ON ramal_repartos (lote_id);

ALTER TABLE ramal_repartos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON ramal_repartos FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────
--  5. ROTACIÓN · de quién es el turno
--
--  Rotación pura (A→B→C→A) se rompe el día que B falta: le queda
--  «debiendo» un turno y el reparto se desbalancea solo. Por eso el
--  turno no se guarda como un puntero al siguiente, sino como el
--  HISTORIAL de cada uno: cuántas veces le tocó y cuándo fue la última.
--  El siguiente es el que menos veces le tocó, y a igualdad el que hace
--  más tiempo que no le toca. Si alguien faltó hoy, se lo salta sin
--  deberle nada — y mañana vuelve a entrar primero porque su contador
--  se quedó atrás.
--
--  UN solo contador: revisar la caja es un solo trabajo. Antes había dos
--  y el segundo turno casi nunca se asignaba, así que su contador medía
--  el olvido del supervisor y no el trabajo de nadie.
--
--  `orden` solo desempata cuando todo lo demás empata (el primer día).
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ramal_rotacion (
  user_id     UUID        PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  activo      BOOLEAN     NOT NULL DEFAULT true,
  orden       INT         NOT NULL DEFAULT 0,
  veces       INT         NOT NULL DEFAULT 0,
  ultima_vez  TIMESTAMPTZ,
  nota        TEXT        NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ramal_rotacion ADD COLUMN IF NOT EXISTS veces      INT NOT NULL DEFAULT 0;
ALTER TABLE ramal_rotacion ADD COLUMN IF NOT EXISTS ultima_vez TIMESTAMPTZ;

ALTER TABLE ramal_rotacion ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON ramal_rotacion FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Todo usuario con módulo RAMALERO entra a la rotación. Se puede sacar
-- después con activo=false, pero el default es que participe: un
-- ramalero que nunca aparece en la lista nunca hereda el turno.
INSERT INTO ramal_rotacion (user_id, orden)
SELECT u.id, 0
FROM usuarios u
JOIN usuario_modulos m ON m.user_id = u.id AND m.modulo = 'RAMALERO'
WHERE u.activo = true
  AND NOT EXISTS (SELECT 1 FROM ramal_rotacion r WHERE r.user_id = u.id);

-- ────────────────────────────────────────────
--  6. MOVIMIENTOS · el libro mayor del stock de ramales armados
--
--  El saldo NO se guarda en ninguna columna: es la SUMA de esta tabla
--  (vista del bloque 7b). Es la misma decisión que ya se tomó en el
--  inventario de herramientas — un saldo guardado y un historial que no
--  cuadran entre sí es el error clásico, y la única forma de que no
--  pase es que solo exista uno de los dos.
--
--  `cantidad` va CON SIGNO: entra positivo, sale negativo. Así el saldo
--  es un SUM() y no hay que recordar qué tipo resta.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ramal_movimientos (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          tipo_mov_ramal NOT NULL,
  tipo_ramal    tipo_ramal,
  cantidad      INT            NOT NULL DEFAULT 0,   -- con signo
  lote_id       UUID           REFERENCES ramal_lotes(id) ON DELETE SET NULL,
  reparto_id    UUID           REFERENCES ramal_repartos(id) ON DELETE SET NULL,
  solicitud_id  UUID           REFERENCES solicitudes_ramal(id) ON DELETE SET NULL,
  -- Quién lo hizo (ramalero que armó, ramalero que entregó…).
  user_id       UUID           REFERENCES usuarios(id),
  user_nombre   TEXT           NOT NULL DEFAULT '',
  -- A quién fue (técnico que recibió), para el rastro de la entrega.
  destino       TEXT           NOT NULL DEFAULT '',
  vin           TEXT,
  nota          TEXT           NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  created_by    TEXT           NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ramal_mov_ts    ON ramal_movimientos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ramal_mov_tipo  ON ramal_movimientos (tipo);
CREATE INDEX IF NOT EXISTS idx_ramal_mov_tr    ON ramal_movimientos (tipo_ramal);
CREATE INDEX IF NOT EXISTS idx_ramal_mov_lote  ON ramal_movimientos (lote_id);
CREATE INDEX IF NOT EXISTS idx_ramal_mov_user  ON ramal_movimientos (user_id);

ALTER TABLE ramal_movimientos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON ramal_movimientos FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Punto de pedido por tipo de ramal. Es lo ÚNICO que se configura a
-- mano del stock; el saldo sale del libro mayor.
CREATE TABLE IF NOT EXISTS ramal_stock_config (
  tipo_ramal   tipo_ramal  PRIMARY KEY,
  stock_minimo INT         NOT NULL DEFAULT 0,
  ubicacion    TEXT        NOT NULL DEFAULT '',
  nota         TEXT        NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ramal_stock_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON ramal_stock_config FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO ramal_stock_config (tipo_ramal, stock_minimo)
SELECT t, 0 FROM unnest(enum_range(NULL::tipo_ramal)) AS t
ON CONFLICT (tipo_ramal) DO NOTHING;

-- ────────────────────────────────────────────
--  6-bis. EL ESLABÓN · la entrega al técnico consume stock
--
--  `solicitudes_ramal` ya existía y funcionaba, pero era una cola sin
--  consecuencia material: se marcaba ENTREGADO y no salía nada de
--  ningún lado. Con estas columnas la entrega descuenta del stock y
--  queda atada al lote y al ramalero que la hizo.
--
--  Esto es lo que cierra el círculo: el ramal que alguien dijo armar
--  tiene que aparecer después en la mano de un técnico. El técnico es
--  el auditor involuntario del ramalero, sin tener que hacer nada.
-- ────────────────────────────────────────────
ALTER TABLE solicitudes_ramal
  ADD COLUMN IF NOT EXISTS tipo_ramal            tipo_ramal;
ALTER TABLE solicitudes_ramal
  ADD COLUMN IF NOT EXISTS lote_id               UUID REFERENCES ramal_lotes(id) ON DELETE SET NULL;
ALTER TABLE solicitudes_ramal
  ADD COLUMN IF NOT EXISTS entregado_por_user_id UUID REFERENCES usuarios(id);
ALTER TABLE solicitudes_ramal
  ADD COLUMN IF NOT EXISTS notificado_at         TIMESTAMPTZ;

-- ────────────────────────────────────────────
--  7. VISTAS DE CONSULTA
--     La UI calcula lo mismo en el cliente; estas vistas son para
--     revisar desde el SQL Editor o para un reporte.
-- ────────────────────────────────────────────

-- ── 7a. Líneas de caja con su reparto · el arqueo por marca ──
--  Una caja mixta no cuadra «en total»: cuadra marca por marca. Si
--  llegaron 15 Jetour y se repartieron 16, da igual que el total de la
--  caja cierre — hay una marca inventada y otra perdida.
CREATE VIEW v_ramal_lote_items AS
SELECT
  i.lote_id,
  l.codigo,
  l.fecha,
  l.estado,
  i.tipo_ramal,
  i.cantidad,
  COALESCE(r.asignados,  0)                       AS repartidos,
  COALESCE(r.devueltos,  0)                       AS devueltos,
  COALESCE(r.rechazados, 0)                       AS rechazados,
  COALESCE(r.asignados, 0) - COALESCE(r.devueltos, 0) AS en_proceso,
  i.cantidad - COALESCE(r.asignados, 0)           AS sin_repartir
FROM ramal_lote_items i
JOIN ramal_lotes l ON l.id = i.lote_id
LEFT JOIN (
  SELECT lote_id, tipo_ramal,
         SUM(cantidad_asignada)  AS asignados,
         SUM(cantidad_devuelta)  AS devueltos,
         SUM(cantidad_rechazada) AS rechazados
  FROM ramal_repartos
  WHERE tipo_ramal IS NOT NULL
  GROUP BY lote_id, tipo_ramal
) r ON r.lote_id = i.lote_id AND r.tipo_ramal = i.tipo_ramal;

-- ── 7b. Stock por marca · TOTAL = TRABAJANDO + DISPONIBLE ──
--
--  «Jetour 80: 50 trabajando, 30 disponibles». Son tres números, y solo
--  dos son independientes:
--
--    TRABAJANDO  repartidos a un ramalero y todavía sin devolver a
--                oficina. Existen, son de la empresa, pero no se le
--                pueden dar a un técnico porque están en una mesa.
--    DISPONIBLE  armados y en el estante: es lo único entregable, y es
--                el saldo del libro mayor de movimientos.
--    TOTAL       la suma. Es el patrimonio de esa marca.
--
--  Sin la columna TRABAJANDO el panel decía «30 Jetour» y parecía que
--  quedaban 30 en total, cuando en realidad la marca tiene 80 y 50 están
--  en proceso. Es la diferencia entre «hay que comprar» y «hay que
--  esperar», que son decisiones opuestas.
--
--  `trabajando` ahora cuelga de la marca del REPARTO, no de la del lote:
--  en una caja mixta la marca del lote ya no existe como dato único.
CREATE VIEW v_ramal_stock AS
SELECT
  c.tipo_ramal,
  COALESCE(m.saldo, 0)                              AS disponible,
  COALESCE(t.trabajando, 0)                         AS trabajando,
  COALESCE(m.saldo, 0) + COALESCE(t.trabajando, 0)  AS total,
  COALESCE(m.armados, 0)                            AS armados_hist,
  COALESCE(m.entregados, 0)                         AS entregados_hist,
  c.stock_minimo,
  (COALESCE(m.saldo, 0) < c.stock_minimo)           AS bajo_minimo,
  c.ubicacion
FROM ramal_stock_config c
LEFT JOIN (
  SELECT tipo_ramal,
         SUM(cantidad)                                               AS saldo,
         COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'ARMADO'),  0)  AS armados,
         -- Las entregas se guardan en negativo (salen del stock); aquí se
         -- muestran como cuenta positiva de «cuántos se entregaron».
         -COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'ENTREGA'), 0) AS entregados
  FROM ramal_movimientos
  WHERE tipo_ramal IS NOT NULL
  GROUP BY tipo_ramal
) m ON m.tipo_ramal = c.tipo_ramal
LEFT JOIN (
  -- Repartido y aún no devuelto, por la marca con que se firmó.
  SELECT tipo_ramal,
         SUM(cantidad_asignada - cantidad_devuelta) AS trabajando
  FROM ramal_repartos
  WHERE devuelto_at IS NULL AND tipo_ramal IS NOT NULL
  GROUP BY tipo_ramal
) t ON t.tipo_ramal = c.tipo_ramal;

-- ── 7c. Arqueo por lote · la auditoría de verdad ──
--  Aquí es donde «hice 5» se muere solo. `descuadre` distinto de 0
--  significa que lo repartido y lo devuelto no cierran contra los
--  equipos que trajo la caja.
CREATE VIEW v_ramal_lote_arqueo AS
SELECT
  l.id                                       AS lote_id,
  l.codigo,
  l.fecha,
  l.estado,
  l.cantidad_equipos,
  ue.nombre                                  AS encargado,
  -- Lo que trajo la caja, escrito como se dice en voz alta:
  -- «15 JETOUR · 10 KYC V3».
  COALESCE(it.marcas, '')                    AS marcas,
  COALESCE(it.lineas, 0)                     AS lineas,
  COALESCE(r.asignados,  0)                  AS repartidos,
  COALESCE(r.devueltos,  0)                  AS devueltos,
  COALESCE(r.rechazados, 0)                  AS rechazados,
  l.merma,
  -- El panel pinta la tarjeta de la caja y abre sus formularios desde esta
  -- misma fila, así que las columnas que necesita viajan aquí en vez de
  -- obligarlo a cruzar contra `ramal_lotes` por separado.
  l.merma_motivo,
  l.revision_inicio_at,
  l.revision_aviso_at,
  l.revision_fin_at,
  l.revision_conformes,
  l.revision_observados,
  l.revision_nota,
  -- Lo que se repartió pero todavía no vuelve a oficina.
  COALESCE(r.asignados, 0) - COALESCE(r.devueltos, 0)     AS en_proceso,
  -- Lo que trajo la caja y nunca llegó a repartirse a nadie.
  l.cantidad_equipos - COALESCE(r.asignados, 0) - l.merma AS sin_repartir,
  -- Conservación de masa: lo que entró tiene que estar en algún lado.
  -- Con la definición de arriba el total es cero por álgebra, así que lo
  -- que de verdad delata la caja que no cierra es `sin_repartir`
  -- negativo (se repartió más de lo que trajo) o una MARCA repartida de
  -- más aunque el total cuadre. Las dos se resumen aquí para que la UI
  -- pinte un solo semáforo.
  CASE WHEN l.cantidad_equipos - COALESCE(r.asignados, 0) - l.merma < 0
       THEN l.cantidad_equipos - COALESCE(r.asignados, 0) - l.merma
       WHEN COALESCE(r.devueltos, 0) > COALESCE(r.asignados, 0)
       THEN COALESCE(r.asignados, 0) - COALESCE(r.devueltos, 0)
       WHEN COALESCE(it.exceso_marca, 0) > 0
       THEN -COALESCE(it.exceso_marca, 0)
       ELSE 0 END                            AS descuadre,
  -- Reloj oficial de la revisión: lo abre y lo cierra el supervisor.
  EXTRACT(EPOCH FROM (l.revision_fin_at - l.revision_inicio_at))/60.0
                                             AS revision_min,
  -- Lo que el ramalero DIJO que demoró. Si difiere mucho del oficial, es
  -- que avisó que acabó y el supervisor recibió la caja mucho después.
  EXTRACT(EPOCH FROM (l.revision_aviso_at - l.revision_inicio_at))/60.0
                                             AS revision_declarada_min,
  (l.encargado_sugerido_id IS NOT NULL
   AND l.encargado_user_id IS DISTINCT FROM l.encargado_sugerido_id) AS turno_pisado
FROM ramal_lotes l
LEFT JOIN usuarios ue ON ue.id = l.encargado_user_id
LEFT JOIN (
  SELECT lote_id,
         SUM(cantidad_asignada)  AS asignados,
         SUM(cantidad_devuelta)  AS devueltos,
         SUM(cantidad_rechazada) AS rechazados
  FROM ramal_repartos
  GROUP BY lote_id
) r ON r.lote_id = l.id
LEFT JOIN (
  SELECT lote_id,
         COUNT(*)                                        AS lineas,
         string_agg(cantidad || ' ' || tipo_ramal, ' · ' ORDER BY tipo_ramal) AS marcas,
         SUM(GREATEST(0, -sin_repartir))                 AS exceso_marca
  FROM v_ramal_lote_items
  GROUP BY lote_id
) it ON it.lote_id = l.id;

-- ── 7d. Desempeño por ramalero ──
--  Velocidad Y rechazo en la misma fila, a propósito: medir solo
--  ramales/hora consigue ramales/hora, y peores ramales. Las dos
--  columnas juntas o ninguna.
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
  COALESCE(e.entregas, 0)                     AS entregas_a_tecnicos,
  COALESCE(rot.veces, 0)                      AS turnos,
  rot.ultima_vez
FROM usuarios u
JOIN usuario_modulos um ON um.user_id = u.id AND um.modulo = 'RAMALERO'
LEFT JOIN ramal_rotacion rot ON rot.user_id = u.id
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

-- ── 7e. A quién le toca el turno ──
--  Ordena los candidatos: primero el que menos veces le tocó, luego el
--  que hace más tiempo que no le toca. La app filtra además por quién
--  vino hoy — eso no se puede saber desde aquí.
CREATE VIEW v_ramal_rotacion AS
SELECT
  r.user_id,
  u.nombre,
  u.email,
  r.activo,
  r.orden,
  r.veces,
  r.ultima_vez
FROM ramal_rotacion r
JOIN usuarios u ON u.id = r.user_id
WHERE r.activo = true AND u.activo = true
ORDER BY r.veces ASC,
         r.ultima_vez ASC NULLS FIRST,
         r.orden ASC,
         u.nombre ASC;

-- ============================================================
--  Verificación rápida (opcional):
--    -- ¿Qué cajas no cuadran?
--    SELECT codigo, cantidad_equipos, marcas, repartidos, devueltos, descuadre
--    FROM v_ramal_lote_arqueo WHERE descuadre <> 0;
--
--    -- ¿Qué MARCA de una caja mixta no cuadra?
--    SELECT codigo, tipo_ramal, cantidad, repartidos, sin_repartir
--    FROM v_ramal_lote_items WHERE sin_repartir < 0;
--
--    -- Velocidad Y calidad, juntas:
--    SELECT nombre, ramales_devueltos, armado_min_por_ramal, pct_rechazo
--    FROM v_ramal_desempeno ORDER BY ramales_devueltos DESC;
--
--    -- ¿A quién le toca la próxima caja?
--    SELECT nombre, veces, ultima_vez FROM v_ramal_rotacion LIMIT 3;
--
--    -- Stock de ramales listos para entregar:
--    SELECT tipo_ramal, disponible, stock_minimo, bajo_minimo FROM v_ramal_stock;
--
--    -- ¿Cuántas veces el supervisor pisó el turno sugerido?
--    SELECT count(*) FROM v_ramal_lote_arqueo WHERE turno_pisado;
-- ============================================================
