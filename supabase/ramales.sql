-- ============================================================
--  GLP-UI · RAMALES — TURNO, DESEMBALAJE, REPARTO Y STOCK
--  Ejecutar UNA VEZ en Supabase Dashboard → SQL Editor.
--  Idempotente: se puede correr de nuevo sin romper nada.
--  Requiere `supabase/schema.sql`.
--
--  EL PROBLEMA QUE RESUELVE
--  ────────────────────────
--  Antes el ramalero decía «hice 5 en una hora» y no había forma de
--  contrastarlo. Un cronómetro que arranca y para la misma persona que
--  se beneficia del número no es trazabilidad: es una declaración con
--  fecha. Aquí ningún dato que importe lo declara quien es medido.
--
--    · El turno de desembalaje NO lo elige el ramalero: rota (bloque 4).
--    · El cronómetro NO lo arranca el ramalero: lo abre el supervisor
--      al registrar que llegó la caja (`desembalaje_inicio_at`).
--    · El cierre NO lo declara el ramalero: el supervisor confirma que
--      recibió los cables principales (`cables_recibidos_at`).
--    · Los ramales armados NO son un contador libre: salen de un lote
--      que tenía N equipos, se reparten en cantidades firmadas y se
--      devuelven a oficina. Lo que no cuadra, aparece como DESCUADRE.
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
--    RECIBIDO      el supervisor registra la caja (N equipos)
--    DESEMBALANDO  corre el tiempo del encargado de turno
--    DESEMBALADO   entregó los cables principales al supervisor
--    REPARTIDO     el supervisor repartió N ramales entre los ramaleros
--    CERRADO       todos devolvieron; el lote cuadró (o se cerró con nota)
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
    ('RECIBIDO','DESEMBALANDO','DESEMBALADO','REPARTIDO','CERRADO');
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
--  2. LOTES · la caja que llega con N vehículos
--
--  Una fila por caja recibida. Es la unidad de auditoría: todo lo que
--  se mide (tiempo, reparto, devolución) cuelga de aquí.
--
--  Los tiempos vienen en pares y CADA PAR LO ABRE UNA PERSONA DISTINTA
--  de la que se beneficia del número — esa es toda la idea:
--    desembalaje_inicio_at   lo pone el supervisor al registrar la caja
--    cables_recibidos_at     lo confirma el supervisor al recibir cables
--  El ramalero solo marca `desembalaje_fin_at` («ya saqué todo»), que es
--  un aviso, no la medición: el reloj oficial cierra cuando el
--  supervisor confirma. Si el ramalero dice que acabó y el supervisor
--  no tiene los cables en la mano, el lote sigue corriendo.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ramal_lotes (
  id                     UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Código legible para hablar del lote en voz alta ("el L-260904-02").
  codigo                 TEXT              NOT NULL DEFAULT '',
  fecha                  DATE              NOT NULL DEFAULT CURRENT_DATE,
  -- Cuántos vehículos vinieron en la caja = cuántos ramales deben salir.
  cantidad_equipos       INT               NOT NULL DEFAULT 0,
  tipo_ramal             tipo_ramal,
  estado                 estado_lote_ramal NOT NULL DEFAULT 'RECIBIDO',

  -- ── Encargado de DESEMBALAJE (turno rotativo, bloque 4) ──
  encargado_user_id      UUID              REFERENCES usuarios(id),
  -- Se guarda si el turno se respetó o el supervisor lo pisó a mano.
  -- Sin esto la rotación «se cumple» siempre porque nadie mira el antes.
  encargado_sugerido_id  UUID              REFERENCES usuarios(id),
  desembalaje_inicio_at  TIMESTAMPTZ,      -- lo abre el SUPERVISOR
  desembalaje_inicio_por TEXT              NOT NULL DEFAULT '',
  desembalaje_fin_at     TIMESTAMPTZ,      -- aviso del ramalero
  cables_recibidos_at    TIMESTAMPTZ,      -- lo confirma el SUPERVISOR
  cables_recibidos_por   TEXT              NOT NULL DEFAULT '',

  -- ── Encargado de REVISIÓN de los insumos de conversión ──
  --  La misma caja trae insumos de ramal e insumos de conversión. Quien
  --  saca los ramales no tiene por qué ser quien revisa los equipos, y
  --  el supervisor necesita poder decidir las dos cosas por separado.
  revisor_user_id        UUID              REFERENCES usuarios(id),
  revision_inicio_at     TIMESTAMPTZ,
  revision_fin_at        TIMESTAMPTZ,
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
--  3. REPARTOS · «a A le tocan 8, a B 6, a C 6»
--
--  Una fila por (lote, ramalero). `cantidad_asignada` la firma el
--  supervisor; `cantidad_devuelta` la cierra el ramalero al traer el
--  trabajo a oficina. La resta de las dos es lo que sigue en la calle.
--
--  El tiempo de armado sale de `asignado_at → devuelto_at`, y de nuevo
--  son dos personas distintas: asigna el supervisor, devuelve el
--  ramalero. Nadie controla los dos extremos de su propia métrica.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ramal_repartos (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id            UUID        NOT NULL REFERENCES ramal_lotes(id) ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES usuarios(id),
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

-- Un ramalero, un reparto por lote: si se le da más, se SUMA a su fila
-- en vez de abrir otra. Dos filas del mismo par harían que el arqueo
-- contara doble y el promedio de tiempo saliera partido a la mitad.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ramal_reparto_uniq
  ON ramal_repartos (lote_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ramal_reparto_user ON ramal_repartos (user_id);
CREATE INDEX IF NOT EXISTS idx_ramal_reparto_lote ON ramal_repartos (lote_id);

ALTER TABLE ramal_repartos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON ramal_repartos FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────
--  4. ROTACIÓN · de quién es el turno
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
--  `orden` solo desempata cuando todo lo demás empata (el primer día).
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ramal_rotacion (
  user_id            UUID        PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  activo             BOOLEAN     NOT NULL DEFAULT true,
  orden              INT         NOT NULL DEFAULT 0,
  -- Turnos de DESEMBALAJE (sacar ramales de la caja).
  veces_desembalaje  INT         NOT NULL DEFAULT 0,
  ultimo_desembalaje TIMESTAMPTZ,
  -- Turnos de REVISIÓN de insumos de conversión — rota aparte, porque
  -- son dos trabajos distintos dentro de la misma caja.
  veces_revision     INT         NOT NULL DEFAULT 0,
  ultima_revision    TIMESTAMPTZ,
  nota               TEXT        NOT NULL DEFAULT '',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
--  5. MOVIMIENTOS · el libro mayor del stock de ramales armados
--
--  El saldo NO se guarda en ninguna columna: es la SUMA de esta tabla
--  (vista del bloque 7). Es la misma decisión que ya se tomó en el
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
--  6. EL ESLABÓN · la entrega al técnico consume stock
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

-- ── 7a. Stock por marca · TOTAL = TRABAJANDO + DISPONIBLE ──
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
--  Ojo: `trabajando` cuelga del tipo del LOTE. Una caja registrada sin
--  tipo_ramal no suma a ninguna marca — aparece en el arqueo del lote
--  pero no aquí. Por eso la UI empuja a elegir marca al registrar.
DROP VIEW IF EXISTS v_ramal_stock;
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
  -- Repartido y aún no devuelto, agrupado por la marca de su caja.
  SELECT l.tipo_ramal,
         SUM(r.cantidad_asignada - r.cantidad_devuelta) AS trabajando
  FROM ramal_repartos r
  JOIN ramal_lotes l ON l.id = r.lote_id
  WHERE r.devuelto_at IS NULL AND l.tipo_ramal IS NOT NULL
  GROUP BY l.tipo_ramal
) t ON t.tipo_ramal = c.tipo_ramal;

-- ── 7b. Arqueo por lote · la auditoría de verdad ──
--  Aquí es donde «hice 5» se muere solo. `descuadre` distinto de 0
--  significa que lo repartido y lo devuelto no cierran contra los
--  equipos que trajo la caja.
DROP VIEW IF EXISTS v_ramal_lote_arqueo;
CREATE VIEW v_ramal_lote_arqueo AS
SELECT
  l.id                                       AS lote_id,
  l.codigo,
  l.fecha,
  l.estado,
  l.cantidad_equipos,
  ue.nombre                                  AS encargado,
  ur.nombre                                  AS revisor,
  COALESCE(r.asignados,  0)                  AS repartidos,
  COALESCE(r.devueltos,  0)                  AS devueltos,
  COALESCE(r.rechazados, 0)                  AS rechazados,
  l.merma,
  -- El panel pinta la tarjeta de la caja y abre sus formularios desde esta
  -- misma fila, así que las columnas que necesita viajan aquí en vez de
  -- obligarlo a cruzar contra `ramal_lotes` por separado.
  l.merma_motivo,
  l.tipo_ramal,
  l.desembalaje_inicio_at,
  l.revisor_user_id,
  l.revision_fin_at,
  l.revision_conformes,
  l.revision_observados,
  l.revision_nota,
  -- Lo que se repartió pero todavía no vuelve a oficina.
  COALESCE(r.asignados, 0) - COALESCE(r.devueltos, 0)     AS en_proceso,
  -- Lo que trajo la caja y nunca llegó a repartirse a nadie.
  l.cantidad_equipos - COALESCE(r.asignados, 0) - l.merma AS sin_repartir,
  -- Conservación de masa: lo que entró tiene que estar en algún lado.
  -- Con la definición de arriba esto es cero por álgebra, así que lo que
  -- de verdad delata la caja que no cierra es `sin_repartir` negativo:
  -- se repartió más de lo que la caja trajo. Se expone aparte para que
  -- la UI pinte un solo semáforo.
  CASE WHEN l.cantidad_equipos - COALESCE(r.asignados, 0) - l.merma < 0
       THEN l.cantidad_equipos - COALESCE(r.asignados, 0) - l.merma
       WHEN COALESCE(r.devueltos, 0) > COALESCE(r.asignados, 0)
       THEN COALESCE(r.asignados, 0) - COALESCE(r.devueltos, 0)
       ELSE 0 END                            AS descuadre,
  -- Reloj oficial del desembalaje: lo abre y lo cierra el supervisor.
  EXTRACT(EPOCH FROM (l.cables_recibidos_at - l.desembalaje_inicio_at))/60.0
                                             AS desembalaje_min,
  -- Lo que el ramalero DIJO que demoró. Si difiere mucho del oficial,
  -- es que avisó que acabó y los cables llegaron mucho después.
  EXTRACT(EPOCH FROM (l.desembalaje_fin_at - l.desembalaje_inicio_at))/60.0
                                             AS desembalaje_declarado_min,
  (l.encargado_sugerido_id IS NOT NULL
   AND l.encargado_user_id IS DISTINCT FROM l.encargado_sugerido_id) AS turno_pisado
FROM ramal_lotes l
LEFT JOIN usuarios ue ON ue.id = l.encargado_user_id
LEFT JOIN usuarios ur ON ur.id = l.revisor_user_id
LEFT JOIN (
  SELECT lote_id,
         SUM(cantidad_asignada)  AS asignados,
         SUM(cantidad_devuelta)  AS devueltos,
         SUM(cantidad_rechazada) AS rechazados
  FROM ramal_repartos
  GROUP BY lote_id
) r ON r.lote_id = l.id;

-- ── 7c. Desempeño por ramalero ──
--  Velocidad Y rechazo en la misma fila, a propósito: medir solo
--  ramales/hora consigue ramales/hora, y peores ramales. Las dos
--  columnas juntas o ninguna.
DROP VIEW IF EXISTS v_ramal_desempeno;
CREATE VIEW v_ramal_desempeno AS
SELECT
  u.id                                        AS user_id,
  u.nombre,
  u.email,
  COALESCE(d.lotes, 0)                        AS lotes_desembalados,
  ROUND(d.desembalaje_min_prom::numeric, 1)   AS desembalaje_min_prom,
  COALESCE(p.repartos, 0)                     AS repartos,
  COALESCE(p.asignados, 0)                    AS ramales_asignados,
  COALESCE(p.devueltos, 0)                    AS ramales_devueltos,
  COALESCE(p.rechazados, 0)                   AS ramales_rechazados,
  ROUND(p.armado_min_prom::numeric, 1)        AS armado_min_por_ramal,
  CASE WHEN COALESCE(p.devueltos, 0) > 0
       THEN ROUND(100.0 * p.rechazados / p.devueltos, 1)
       ELSE 0 END                             AS pct_rechazo,
  COALESCE(e.entregas, 0)                     AS entregas_a_tecnicos,
  COALESCE(rot.veces_desembalaje, 0)          AS turnos_desembalaje,
  COALESCE(rot.veces_revision, 0)             AS turnos_revision,
  rot.ultimo_desembalaje
FROM usuarios u
JOIN usuario_modulos um ON um.user_id = u.id AND um.modulo = 'RAMALERO'
LEFT JOIN ramal_rotacion rot ON rot.user_id = u.id
LEFT JOIN (
  SELECT encargado_user_id AS uid,
         COUNT(*) AS lotes,
         AVG(EXTRACT(EPOCH FROM (cables_recibidos_at - desembalaje_inicio_at))/60.0)
           AS desembalaje_min_prom
  FROM ramal_lotes
  WHERE encargado_user_id IS NOT NULL
    AND desembalaje_inicio_at IS NOT NULL
    AND cables_recibidos_at IS NOT NULL
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

-- ── 7d. A quién le toca el turno ──
--  Ordena los candidatos: primero el que menos veces le tocó, luego el
--  que hace más tiempo que no le toca. La app filtra además por quién
--  vino hoy — eso no se puede saber desde aquí.
DROP VIEW IF EXISTS v_ramal_rotacion;
CREATE VIEW v_ramal_rotacion AS
SELECT
  r.user_id,
  u.nombre,
  u.email,
  r.activo,
  r.orden,
  r.veces_desembalaje,
  r.ultimo_desembalaje,
  r.veces_revision,
  r.ultima_revision
FROM ramal_rotacion r
JOIN usuarios u ON u.id = r.user_id
WHERE r.activo = true AND u.activo = true
ORDER BY r.veces_desembalaje ASC,
         r.ultimo_desembalaje ASC NULLS FIRST,
         r.orden ASC,
         u.nombre ASC;

-- ============================================================
--  Verificación rápida (opcional):
--    -- ¿Qué cajas no cuadran?
--    SELECT codigo, cantidad_equipos, repartidos, devueltos, descuadre
--    FROM v_ramal_lote_arqueo WHERE descuadre <> 0;
--
--    -- Velocidad Y calidad, juntas:
--    SELECT nombre, ramales_devueltos, armado_min_por_ramal, pct_rechazo
--    FROM v_ramal_desempeno ORDER BY ramales_devueltos DESC;
--
--    -- ¿A quién le toca la próxima caja?
--    SELECT nombre, veces_desembalaje, ultimo_desembalaje FROM v_ramal_rotacion LIMIT 3;
--
--    -- Stock de ramales listos para entregar:
--    SELECT tipo_ramal, disponible, stock_minimo, bajo_minimo FROM v_ramal_stock;
--
--    -- ¿Cuántas veces el supervisor pisó el turno sugerido?
--    SELECT count(*) FROM v_ramal_lote_arqueo WHERE turno_pisado;
-- ============================================================
