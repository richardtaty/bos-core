-- 0037_podcast_reporte_canales.sql — Prospección POR CANAL del Cierre diario de Podcast
--
-- Hasta ahora el reporte diario guardaba cuatro números sueltos de prospección
-- (prospectos_encontrados, prospectos_contactados, respuestas, interesados) sin decir POR QUÉ
-- CANAL se consiguieron. Con eso no se puede saber qué canal produce resultados, ni comparar
-- Instagram contra Llamadas dentro del mismo día. Un mismo día puede prospectarse por varios
-- canales, así que la prospección es una relación 1:N del reporte, no cuatro columnas más.
--
-- Cada fila = un canal de UN reporte. Los números viven aquí y los totales del día se SUMAN
-- al leer; no se guardan como cifra aparte, para que nunca puedan contradecir el desglose.
--
--   podcast_reportes_diarios (1) ──── (N) podcast_reporte_canales
--
-- Aditiva y sin pérdida: las columnas viejas de `podcast_reportes_diarios` NO se tocan, así que
-- los reportes anteriores a esta migración siguen abriendo exactamente igual (no tienen filas
-- aquí y se muestran con sus columnas de siempre). Es `CREATE TABLE IF NOT EXISTS`, idempotente:
-- se puede correr en cada arranque sin efectos.
--
-- `canal` es texto libre sin CHECK, igual que `interacciones.tipo`: la lista válida vive en
-- `lib/validation.ts` (CANALES_CONTACTO) y se valida al guardar. Un CHECK en la base obligaría
-- a una migración nueva cada vez que el equipo sume un canal.

CREATE TABLE IF NOT EXISTS podcast_reporte_canales (
  id TEXT PRIMARY KEY,
  reporte_id TEXT NOT NULL REFERENCES podcast_reportes_diarios(id) ON DELETE CASCADE,
  canal TEXT NOT NULL,
  contactados INTEGER NOT NULL DEFAULT 0,
  respuestas INTEGER NOT NULL DEFAULT 0,
  interesados INTEGER NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS podcast_reporte_canales_reporte_idx ON podcast_reporte_canales(reporte_id);
