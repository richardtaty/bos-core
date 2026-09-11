-- 0039_podcast_indices_metricas.sql — Índices para las consultas de métricas de Podcast
--
-- POR QUÉ
-- Las métricas del flujo de Podcast se consultan siempre igual: por persona y por rango de fechas.
-- `podcast_citas` solo tenía índice sobre `fecha`, así que las dos consultas nuevas del Calendario
-- recorrían la tabla entera:
--   · agendados  → WHERE creado_por IN (...) AND created_at BETWEEN inicio AND fin
--   · completados → WHERE creado_por IN (...) AND fecha IN (...) AND estado = 'realizado'
-- `historial_etapas` tenía índice sobre (registro_id, fecha), que no sirve para filtrar por fecha
-- sola, que es como lo hace el reporte del Pipeline.
--
-- Son tres índices sobre columnas que ya existen. No cambian ningún dato, no bloquean nada y no
-- afectan el comportamiento de la aplicación: solo evitan recorrer la tabla completa.
--
-- `IF NOT EXISTS` los hace idempotentes, así que correrlos en cada arranque no hace nada la
-- segunda vez. Se declaran juntos porque son la misma decisión: acelerar la lectura de métricas.

CREATE INDEX IF NOT EXISTS podcast_citas_creado_por_created_at_idx
  ON podcast_citas(creado_por, created_at);

CREATE INDEX IF NOT EXISTS podcast_citas_creado_por_fecha_estado_idx
  ON podcast_citas(creado_por, fecha, estado);

CREATE INDEX IF NOT EXISTS historial_etapas_fecha_idx
  ON historial_etapas(fecha);
