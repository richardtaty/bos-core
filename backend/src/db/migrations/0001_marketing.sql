-- Tareas operativas: tareas internas no ligadas a contactos (marketing, operaciones, etc.)
CREATE TABLE IF NOT EXISTS tareas_operativas (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  responsable_id TEXT NOT NULL REFERENCES usuarios(id),
  departamento TEXT NOT NULL DEFAULT 'Marketing',
  prioridad TEXT NOT NULL DEFAULT 'media',
  fecha_inicio INTEGER,
  fecha_limite INTEGER,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  aprobador_id TEXT REFERENCES usuarios(id),
  tiempo_invertido INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tareas_responsable_idx ON tareas_operativas(responsable_id);
CREATE INDEX IF NOT EXISTS tareas_estado_idx ON tareas_operativas(estado);
CREATE INDEX IF NOT EXISTS tareas_depto_idx ON tareas_operativas(departamento);
CREATE INDEX IF NOT EXISTS tareas_fecha_limite_idx ON tareas_operativas(fecha_limite);

-- Checklist dentro de una tarea operativa
CREATE TABLE IF NOT EXISTS tarea_checklist (
  id TEXT PRIMARY KEY,
  tarea_id TEXT NOT NULL REFERENCES tareas_operativas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  completado INTEGER NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS checklist_tarea_idx ON tarea_checklist(tarea_id);

-- Comentarios en tareas operativas
CREATE TABLE IF NOT EXISTS tarea_comentarios (
  id TEXT PRIMARY KEY,
  tarea_id TEXT NOT NULL REFERENCES tareas_operativas(id) ON DELETE CASCADE,
  autor_id TEXT NOT NULL REFERENCES usuarios(id),
  texto TEXT NOT NULL,
  fecha INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comentarios_tarea_idx ON tarea_comentarios(tarea_id);

-- Archivos multi-entidad (tareas, personas, pipelines, etc.)
CREATE TABLE IF NOT EXISTS archivos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  url TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'otro',
  tamano_bytes INTEGER DEFAULT 0,
  entidad TEXT NOT NULL,
  entidad_id TEXT NOT NULL,
  autor_id TEXT NOT NULL REFERENCES usuarios(id),
  fecha INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS archivos_entidad_idx ON archivos(entidad, entidad_id);
