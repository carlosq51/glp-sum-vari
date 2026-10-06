-- ============================================================
--  GLP-UI · DESPACHO — dupla automática del carro extra.
--  Ejecutar UNA VEZ en Supabase Dashboard → SQL Editor.
--  Idempotente: se puede correr de nuevo sin romper nada.
--
--  NO crea tablas ni columnas. La regla vive en código
--  (lib/despacho.js → pareoCarroExtra_) y se apoya en las tablas
--  que ya existen: la dupla se guarda en despacho_duplas con una
--  marca dentro de `motivo` ("AUTO_CARRO_EXTRA:<vin>") que la
--  distingue de las que arman los técnicos a mano.
-- ============================================================

-- ────────────────────────────────────────────
--  Interruptor de la regla
--
--  Con META_CARROS_TEC = 2: el técnico que va en su TERCER carro
--  lo empieza solo; el siguiente de su mismo rol que cierra el
--  segundo no recibe carro propio — entra al de él. La OT y el
--  crédito quedan a nombre del que lo abrió. Al cerrarlo la dupla
--  se deshace sola: el cuarto del primero y el tercero del
--  segundo se trabajan por separado.
--
--  Vale UNA vez por técnico y por jornada, a propósito: la regla
--  es para el tercer carro, no para emparejar la tarde entera.
--
--  "0" la apaga sin desplegar. Solo actúa con DESPACHO_MODO=REAL.
-- ────────────────────────────────────────────
INSERT INTO app_config (key, value)
VALUES ('DESPACHO_DUPLA_AUTO', '1')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
--  Verificación:
--    SELECT key, value FROM app_config
--     WHERE key IN ('DESPACHO_DUPLA_AUTO','META_CARROS_TEC');
--
--  Duplas que armó la regla hoy, con su carro:
--    SELECT d.estado, d.motivo, u.nombre AS lider, d.confirmada_at, d.disuelta_at
--      FROM despacho_duplas d
--      JOIN usuarios u ON u.id = d.lider_user_id
--     WHERE d.jornada_fecha = glp_jornada_fecha(now())
--       AND d.motivo LIKE 'AUTO_CARRO_EXTRA%'
--     ORDER BY d.confirmada_at;
-- ============================================================
