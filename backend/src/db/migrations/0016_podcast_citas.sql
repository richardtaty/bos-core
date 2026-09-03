-- 0016_podcast_citas: agenda de podcasts. Una fila = un podcast agendado con su
-- invitado (persona del CRM), día y hora. Independiente del pipeline: el pipeline
-- mide el funnel comercial, esta tabla responde "cuándo y con quién grabamos".
CREATE TABLE IF NOT EXISTS podcast_citas (
  id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL REFERENCES personas(id),
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'agendado',
  nota TEXT,
  creado_por TEXT NOT NULL REFERENCES usuarios(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS podcast_citas_fecha_idx ON podcast_citas(fecha);
