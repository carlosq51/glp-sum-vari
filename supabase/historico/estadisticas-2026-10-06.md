# Estadísticas de la base hasta el 2026-10-06

Foto de `pg_stat_statements` y `pg_stat_user_tables` tomada justo **antes de
reiniciarlas** el 2026-10-06. Cubre desde la creación del proyecto (febrero de
2026) hasta ese día: las estadísticas nunca se habían reiniciado.

Se guarda porque `pg_stat_statements` acumula **sin fechas**: un problema
corregido hace meses sigue arriba del ranking para siempre y tapa los nuevos.
Aquí queda la historia, con lo que la causaba y cómo se resolvió; la base
vuelve a contar desde cero.

**Total acumulado:** 11,6 millones de consultas · 50 636 s (14 h) de CPU de la
base. **El 74 % fue una sola consulta** (#1).

**Uso real el 2026-10-06** (dos fotos con 15 min de diferencia): 0,7 % de un
núcleo, casi todo del panel de Supabase. La base está ociosa.

## Lecciones

| Qué pasó | Por qué dolía | Qué no repetir |
|---|---|---|
| El movilizador pedía cada 30 s todas las OTs con sus asignaciones **embebidas** (`select=...,asignaciones(...)`), por cada pantalla abierta (#1, #2) | PostgREST resuelve el embed con una subconsulta **por cada OT**, y `asignaciones` no tenía índice simple por `work_order_id`: cada OT recorría la tabla entera. 30 000 llamadas × 1,2 s = **10 h de CPU**. Además pasó la cuota de egress del plan Free (5,8 GB de 5) | Antes de embeber una tabla hija, comprobar que la llave tenga índice **no parcial**. Pedir los hijos aparte y en lotes. Corregido el 2026-09-01 (commit `07ffa17`: caché por evento, sin embed) y el índice en la migración 006 |
| El buscador de VINs busca "que contenga" en cada tecla (#3): 35 000 llamadas × 18 ms | `ilike '%514%'` no puede usar un índice B-tree; recorre el padrón | Se probó un índice de trigramas (`pg_trgm`) con los 10 800 VINs reales y **no sirve con esta consulta**: por el `ORDER BY vin LIMIT 12`, Postgres prefiere recorrer la PK en orden y solo usa el de trigramas en patrones que casi no existen. Total real: ~2,6 s de base por día. Si algún día pesa, hay que cambiar la consulta (ordenar en la app) y recién ahí agregar `pg_trgm` |
| Apps Script reescribe el padrón entero cada 6 h | `vins`: **4,7 millones de UPDATE** para 10 800 filas. `lista_diaria_activa`: 860 000 UPDATE para 35 filas | Sincronizar solo lo que cambió. Pendiente en `gas/REPORTE_PRINCIPAL_obtencion_vin.js` |
| `asignaciones` se leyó entera 60 millones de veces (480 000 millones de filas) | Mismo índice faltante que #1, más consultas por `work_order_id` sin `activo=true` | Migración 006 (`idx_asg_work_order`) |
| `despacho_pool_snapshot` llegó a ser el 40 % de la base | El motor guardaba una foto por minuto aunque nada cambiara, y nadie la leía | Antes de escribir un log "para depurar", decidir quién lo lee y cuánto se guarda. Fase 1 |

## Las 20 consultas que más tiempo consumieron

`ms` = promedio por llamada · `s` = total acumulado.

| # | Llamadas | ms | s | Consulta (abreviada) | Origen y estado |
|---|---:|---:|---:|---|---|
| 1 | 30 014 | 1 241,9 | 37 274 | `work_orders` (vin, fecha_creacion, numero_ot) + embed `asignaciones(updated_at, estado_actual, rol_trabajo)` | Movilizador / LIVE cada 30 s. **Eliminada el 2026-09-01** |
| 2 | 17 797 | 99,3 | 1 767 | La misma sin `numero_ot` | Ídem. **Eliminada el 2026-09-01** |
| 3 | 34 978 | 18,2 | 638 | `vins` where `vin ilike '%…%'` order by vin limit 12 | `/api/vin-suggest`, una por tecla. Aceptable; ver lecciones |
| 4 | 196 878 | 2,9 | 578 | `asignaciones` de un técnico + embed `work_orders(vins(...))` | "Mis activas" del técnico, cada 60 s. Sana |
| 5 | 13 855 | 40,0 | 555 | `work_orders` where `numero_ot is null or = ''` | Apps Script ASIGNACIONES, `syncOTsPendientes_` cada 10 min. Recorre `work_orders`; aceptable a esa frecuencia |
| 6 | 77 384 | 6,9 | 535 | `solicitudes_ramal` + embed `work_orders(estado_general)` | Cola del ramalero. Sana |
| 7 | 61 681 | 7,4 | 457 | `asignaciones.user_id` where activo, estado in (…), tipo_ot | Quién está ocupado (despacho / técnico). Sana |
| 8 | 31 409 | 12,4 | 391 | `vins` where `ultima_ubicacion <> ''` | `/api/supervisor/lista-pendientes`: trae 3 000 filas. Mejorable pidiendo solo los VINs de la lista |
| 9 | 94 997 | 4,0 | 379 | `asignaciones.user_id` where rol_trabajo, activo, estado <> FINALIZADO | Despacho. Sana |
| 10 | 27 418 | 10,5 | 287 | `eventos` FIN por OT, order by timestamp | Informes / LIVE. Usa `idx_evt_wo` |
| 11 | 9 940 | 28,6 | 284 | `asignaciones` completas + embeds | Supervisor |
| 12 | 30 306 | 9,2 | 279 | `INSERT INTO eventos` | Cada INICIO/PAUSA/FIN. Normal |
| 13 | 29 664 | 8,0 | 238 | `asignaciones` where work_order_id = ANY, activo, rol in (…) | Usa el índice parcial `idx_asg_active` |
| 14 | 36 096 | 6,1 | 219 | `movilizador_traslados` where vin = ANY, estado = ANY | Apps Script REPORTE PRINCIPAL |
| 15 | 31 300 | 6,3 | 199 | `work_orders` where vin = ANY, tipo_ot = ANY | Apps Script REPORTE PRINCIPAL |
| 16 | 94 994 | 2,0 | 194 | `asignaciones` + embeds usuarios, work_orders | Sana |
| 17 | 14 339 | 13,5 | 194 | `vins` where vin = ANY (con modelo) | Varias rutas |
| 18 | 134 839 | 1,4 | 192 | `vins` where vin = ANY (modelo_normalizado) | Despacho / ML. Sana |
| 19 | 31 882 | 5,9 | 187 | `work_orders` where tipo_ot, estado_general <> … | Sana |
| 20 | 22 985 | 8,1 | 187 | `INSERT INTO vins` (upsert del padrón) | Apps Script REPORTE PRINCIPAL cada 6 h, ver lecciones |

## Tablas: lecturas completas y escrituras acumuladas

| Tabla | Filas | Lecturas completas | Filas leídas así | Por índice | INSERT | UPDATE | DELETE |
|---|---:|---:|---:|---:|---:|---:|---:|
| asignaciones | 14 460 | 60 327 475 | 480 111 257 074 | 3 928 952 | 24 307 | 24 759 | 48 |
| vins | 10 794 | 51 386 | 347 417 427 | 8 498 111 | 45 196 | **4 684 955** | 2 |
| movilizador_traslados | 3 547 | 132 064 | 212 700 267 | 633 428 | 4 041 | 12 500 | 16 |
| usuarios | 60 | 2 329 219 | 116 817 154 | 53 413 | 300 | 71 | 10 |
| incidencias | 1 065 | 36 095 | 34 931 904 | 6 850 | 3 261 | 3 472 | 6 |
| solicitudes_ramal | 1 549 | 15 786 | 16 497 712 | 193 707 | 1 558 | 2 835 | 7 |
| work_orders | 9 708 | 1 673 | 7 870 942 | 74 874 521 | 15 912 | 61 445 | 39 |
| lista_diaria_activa | 35 | 83 212 | 5 796 574 | 865 168 | 2 802 | **860 616** | 2 767 |
| conversion_zonas | 15 | 173 959 | 2 609 314 | 14 388 | 15 | 3 527 | 0 |
| app_config | 27 | 115 385 | 2 052 235 | 43 510 | 29 | 185 | 2 |
| eventos | 37 629 | 106 | 1 022 770 | 493 784 | 73 525 | 2 | 86 |
| despacho_pool_snapshot | 3 767 | 70 | 915 811 | 29 | 28 360 | 0 | 24 593 |

En tablas chicas (`usuarios`, `app_config`, `conversion_zonas`) leer completo es lo
correcto: son más rápidas leídas enteras que por índice.

## Cómo medir la próxima vez

`pg_stat_statements` se reinició el 2026-10-06. Los contadores de tablas e
índices (`pg_stat_user_tables`, `pg_stat_user_indexes`) **no** se pueden
reiniciar en Supabase (`pg_stat_reset()` exige superusuario), así que siguen
acumulando desde febrero: para saber si un índice se usa, comparar dos fotos.

1. No mirar el ranking acumulado solo. Tomar **dos fotos** de
   `pg_stat_statements` con 15 min de diferencia en horario de taller y restar.
   Agrupar por el texto de la consulta: la misma consulta aparece una vez por
   rol (`anon`, `service_role`…).
2. Confirmar la sospecha con `EXPLAIN (ANALYZE, BUFFERS)` en producción (solo
   lee) antes de crear un índice.
3. Si una migración toca índices, `npm run db:validar` debe seguir diciendo "Iguales".
