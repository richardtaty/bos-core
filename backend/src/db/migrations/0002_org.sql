-- Estructura organizacional: departamentos, equipos y jerarquía

CREATE TABLE IF NOT EXISTS departamentos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS equipos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  departamento_id TEXT NOT NULL REFERENCES departamentos(id),
  supervisor_id TEXT REFERENCES usuarios(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS equipos_depto_idx ON equipos(departamento_id);

CREATE TABLE IF NOT EXISTS equipo_miembros (
  equipo_id TEXT NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  cargo TEXT NOT NULL DEFAULT 'Miembro',
  PRIMARY KEY (equipo_id, usuario_id)
);

-- Extender usuarios con datos organizacionales
ALTER TABLE usuarios ADD COLUMN departamento_id TEXT REFERENCES departamentos(id);
ALTER TABLE usuarios ADD COLUMN cargo TEXT;
ALTER TABLE usuarios ADD COLUMN supervisor_id TEXT REFERENCES usuarios(id);
