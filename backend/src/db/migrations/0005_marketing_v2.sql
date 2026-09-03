-- Marketing v2: Extender tareas_operativas + nuevas tablas (reportes diarios, solicitudes, recursos)
-- Fase 1 del plan de reingeniería del módulo de Marketing

-- ─── Extender tareas_operativas ──────────────────────────

-- Separar tipo de tarea de la prioridad (req 2.3)
ALTER TABLE tareas_operativas ADD COLUMN tipo_tarea TEXT;

-- Tiempo estimado por el líder en minutos (req 2.4)
ALTER TABLE tareas_operativas ADD COLUMN tiempo_estimado INTEGER DEFAULT 0;

-- Quién solicita la tarea (req 2.2)
ALTER TABLE tareas_operativas ADD COLUMN solicitante_id TEXT REFERENCES usuarios(id);

-- Criterios de "terminado" — definition of done (req 2.2)
ALTER TABLE tareas_operativas ADD COLUMN criterios_terminado TEXT;

-- Bloqueos (req 2.5)
ALTER TABLE tareas_operativas ADD COLUMN bloqueo_motivo TEXT;
ALTER TABLE tareas_operativas ADD COLUMN bloqueo_depende_de TEXT;
ALTER TABLE tareas_operativas ADD COLUMN bloqueo_desde INTEGER;

-- Historial de fecha límite — se guarda la original al conceder extensión (req 2.4)
ALTER TABLE tareas_operativas ADD COLUMN fecha_limite_original INTEGER;

-- Sprint al que pertenece la tarea (req 2.1)
ALTER TABLE tareas_operativas ADD COLUMN sprint TEXT;

-- Resultado final / entregable (req 2.6)
ALTER TABLE tareas_operativas ADD COLUMN resultado_final TEXT;

-- ─── Reportes diarios (req sección 1) ─────────────────────

CREATE TABLE IF NOT EXISTS reportes_diarios (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  fecha TEXT NOT NULL,
  tareas_asignadas TEXT,
  tareas_completadas TEXT,
  tareas_pendientes TEXT,
  tiempo_utilizado TEXT,
  enlaces TEXT,
  dificultades TEXT,
  necesita_revision TEXT,
  apoyo_requerido TEXT,
  observaciones TEXT,
  estado TEXT NOT NULL DEFAULT 'no_iniciado',
  revisado_por TEXT REFERENCES usuarios(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS reportes_usuario_fecha_idx ON reportes_diarios(usuario_id, fecha);
CREATE INDEX IF NOT EXISTS reportes_estado_idx ON reportes_diarios(estado);
CREATE INDEX IF NOT EXISTS reportes_fecha_idx ON reportes_diarios(fecha);

-- ─── Solicitudes de extensión (req 2.4) ────────────────────

CREATE TABLE IF NOT EXISTS solicitudes_extension (
  id TEXT PRIMARY KEY,
  tarea_id TEXT NOT NULL REFERENCES tareas_operativas(id) ON DELETE CASCADE,
  solicitante_id TEXT NOT NULL REFERENCES usuarios(id),
  motivo TEXT NOT NULL,
  porcentaje_completado INTEGER DEFAULT 0,
  tiempo_adicional_minutos INTEGER DEFAULT 0,
  nueva_fecha INTEGER,
  dificultad TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  autorizador_id TEXT REFERENCES usuarios(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sol_ext_tarea_idx ON solicitudes_extension(tarea_id);
CREATE INDEX IF NOT EXISTS sol_ext_estado_idx ON solicitudes_extension(estado);

-- ─── Recursos y accesos (req sección 4) ────────────────────

CREATE TABLE IF NOT EXISTS recursos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  url TEXT NOT NULL,
  descripcion TEXT,
  cliente TEXT,
  categoria TEXT,
  visible_roles TEXT NOT NULL DEFAULT 'SUPER_ADMIN,ADMIN,USUARIO',
  autor_id TEXT NOT NULL REFERENCES usuarios(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS recursos_cliente_idx ON recursos(cliente);
CREATE INDEX IF NOT EXISTS recursos_categoria_idx ON recursos(categoria);
