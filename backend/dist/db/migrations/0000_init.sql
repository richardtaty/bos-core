CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'USUARIO',
  activo INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  ciudad TEXT NOT NULL,
  estado TEXT NOT NULL,
  fuente TEXT NOT NULL,
  referido_por TEXT,
  comentarios TEXT,
  responsable_id TEXT NOT NULL REFERENCES usuarios(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS personas_estado_idx ON personas(estado);
CREATE INDEX IF NOT EXISTS personas_responsable_idx ON personas(responsable_id);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS persona_tags (
  persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (persona_id, tag_id)
);

CREATE TABLE IF NOT EXISTS negocios (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS persona_negocios (
  persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  negocio_id TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  PRIMARY KEY (persona_id, negocio_id)
);

CREATE TABLE IF NOT EXISTS interacciones (
  id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  nota TEXT NOT NULL,
  autor_id TEXT NOT NULL REFERENCES usuarios(id),
  fecha INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS interacciones_persona_fecha_idx ON interacciones(persona_id, fecha);

CREATE TABLE IF NOT EXISTS tareas_seguimiento (
  id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  fecha INTEGER NOT NULL,
  nota TEXT,
  completado INTEGER NOT NULL DEFAULT 0,
  autor_id TEXT NOT NULL REFERENCES usuarios(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tareas_persona_estado_idx ON tareas_seguimiento(persona_id, completado, fecha);

CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS etapas (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL,
  es_ganada INTEGER NOT NULL DEFAULT 0,
  es_perdida INTEGER NOT NULL DEFAULT 0,
  sla_dias INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS etapas_pipeline_nombre_uq ON etapas(pipeline_id, nombre);
CREATE INDEX IF NOT EXISTS etapas_pipeline_orden_idx ON etapas(pipeline_id, orden);

CREATE TABLE IF NOT EXISTS registros (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
  persona_id TEXT REFERENCES personas(id),
  etapa_id TEXT NOT NULL REFERENCES etapas(id),
  valor REAL,
  motivo_perdida TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS registros_pipeline_etapa_idx ON registros(pipeline_id, etapa_id);
CREATE INDEX IF NOT EXISTS registros_persona_idx ON registros(persona_id);

CREATE TABLE IF NOT EXISTS historial_etapas (
  id TEXT PRIMARY KEY,
  registro_id TEXT NOT NULL REFERENCES registros(id) ON DELETE CASCADE,
  etapa_nueva_id TEXT NOT NULL REFERENCES etapas(id),
  autor_id TEXT NOT NULL REFERENCES usuarios(id),
  fecha INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS historial_registro_fecha_idx ON historial_etapas(registro_id, fecha);

CREATE TABLE IF NOT EXISTS pagos (
  id TEXT PRIMARY KEY,
  registro_id TEXT NOT NULL REFERENCES registros(id) ON DELETE CASCADE,
  monto REAL NOT NULL,
  nota TEXT,
  autor_id TEXT NOT NULL REFERENCES usuarios(id),
  fecha INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pagos_registro_idx ON pagos(registro_id);

CREATE TABLE IF NOT EXISTS bitacora_auditoria (
  id TEXT PRIMARY KEY,
  entidad TEXT NOT NULL,
  entidad_id TEXT NOT NULL,
  accion TEXT NOT NULL,
  autor_id TEXT NOT NULL REFERENCES usuarios(id),
  detalle TEXT,
  persona_id TEXT REFERENCES personas(id),
  fecha INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bitacora_entidad_idx ON bitacora_auditoria(entidad, entidad_id);
