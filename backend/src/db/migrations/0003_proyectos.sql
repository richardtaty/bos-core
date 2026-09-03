-- Gestión de proyectos

CREATE TABLE IF NOT EXISTS proyectos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  objetivo TEXT,
  cliente TEXT,
  responsable_id TEXT NOT NULL REFERENCES usuarios(id),
  departamento_id TEXT NOT NULL REFERENCES departamentos(id),
  fecha_inicio INTEGER,
  fecha_entrega INTEGER,
  prioridad TEXT NOT NULL DEFAULT 'media',
  estado TEXT NOT NULL DEFAULT 'activo',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS proyectos_depto_idx ON proyectos(departamento_id);
CREATE INDEX IF NOT EXISTS proyectos_responsable_idx ON proyectos(responsable_id);

CREATE TABLE IF NOT EXISTS proyecto_comentarios (
  id TEXT PRIMARY KEY,
  proyecto_id TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  autor_id TEXT NOT NULL REFERENCES usuarios(id),
  texto TEXT NOT NULL,
  fecha INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS proycom_idx ON proyecto_comentarios(proyecto_id);

-- Extender tareas_operativas con columnas nuevas (FASE 2 + FASE 3 + FASE 4)
ALTER TABLE tareas_operativas ADD COLUMN proyecto_id TEXT REFERENCES proyectos(id);
ALTER TABLE tareas_operativas ADD COLUMN porcentaje_avance INTEGER DEFAULT 0;
ALTER TABLE tareas_operativas ADD COLUMN canal TEXT;
ALTER TABLE tareas_operativas ADD COLUMN tipo_contenido TEXT;
ALTER TABLE tareas_operativas ADD COLUMN fecha_publicacion INTEGER;
ALTER TABLE tareas_operativas ADD COLUMN subtarea_de TEXT REFERENCES tareas_operativas(id);
