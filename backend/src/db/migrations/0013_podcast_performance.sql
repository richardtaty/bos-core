-- 0013_podcast_performance: medición de productividad y score del equipo de Podcast.
-- Solo se guarda lo que BOS no puede calcular solo: metas configurables y el reporte
-- diario manual (prospección pre-funnel + compromiso estructurado). El resto (agendados,
-- realizados, reuniones, ventas, no-shows, follow-ups) se calcula on-the-fly desde
-- historial_etapas y tareas_seguimiento.

-- Metas configurables por Super Admin (clave → valor). No se hardcodea en código.
CREATE TABLE IF NOT EXISTS podcast_metas (
  id TEXT PRIMARY KEY,
  clave TEXT NOT NULL,
  nombre TEXT NOT NULL,
  valor REAL NOT NULL,
  updated_at INTEGER,
  UNIQUE (clave)
);

-- Reporte diario por empleado/día (fecha = YYYY-MM-DD en Eastern Time).
CREATE TABLE IF NOT EXISTS podcast_reportes_diarios (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  fecha TEXT NOT NULL,
  prospectos_encontrados INTEGER,
  prospectos_contactados INTEGER,
  respuestas INTEGER,
  interesados INTEGER,
  compromiso_contactos INTEGER,
  compromiso_followups INTEGER,
  compromiso_podcasts INTEGER,
  compromiso_nota TEXT,
  bloqueos TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador',
  created_at INTEGER,
  updated_at INTEGER,
  UNIQUE (usuario_id, fecha)
);

CREATE INDEX IF NOT EXISTS podcast_reportes_fecha_idx ON podcast_reportes_diarios(fecha);

-- Para contar "follow-ups realizados hoy" con precisión (sin depender de parsear la
-- bitácora). completado_en marca cuándo se completó; completado_por, quién lo hizo.
ALTER TABLE tareas_seguimiento ADD COLUMN completado_en INTEGER;
ALTER TABLE tareas_seguimiento ADD COLUMN completado_por TEXT;
