-- 0030_rrhh_asistencia.sql — Recursos Humanos → Asistencia (fase 2)
-- Aditiva y segura: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / ADD COLUMN.
-- No modifica ni borra datos existentes. No toca `usuarios`, `tareas`, ni ninguna otra tabla.
--
-- Tres piezas, todas relacionadas por ID real (nunca por nombre):
--
--   1) horarios + horario_dias → la JORNADA ESPERADA, por día de la semana. Se guarda
--      estructurada (una fila por día), nunca toda la semana como texto libre. Se admiten
--      varios horarios; uno marcado es_predeterminado sirve de base para quien no tenga uno
--      propio asignado (`empleados.horario_id`).
--
--   2) empleados.horario_id → permite dar a UNA persona un horario distinto (sábado de media
--      jornada, horarios rotativos, etc.) sin suponer que todos comparten el mismo para siempre.
--
--   3) jornadas_laborales → las sesiones de trabajo reales (entrada/salida).
--
-- Sin valores por defecto inventados: NO se siembran 8 h ni 4 h. Si no hay horario
-- configurado, las horas programadas quedan en 0 y la UI lo dice. Las define el usuario
-- autorizado desde RECURSOS HUMANOS → Asistencia.
--
-- Nada de sueldo, tarifas, nómina ni pagos: esta tabla solo registra tiempo.

-- ─── 1) Jornada esperada ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS horarios (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  -- 1 = horario base para quien no tenga `empleados.horario_id`. Solo uno debería estarlo.
  es_predeterminado INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS horario_dias (
  id TEXT PRIMARY KEY,
  horario_id TEXT NOT NULL REFERENCES horarios(id) ON DELETE CASCADE,
  -- 0 = domingo … 6 = sábado (mismo criterio que Date.getDay()).
  dia_semana INTEGER NOT NULL,
  laborable INTEGER NOT NULL DEFAULT 0,
  -- Hora local del negocio (America/New_York) en formato 'HH:MM'. Opcionales: un día puede
  -- ser laborable solo con los minutos esperados, sin horario fijo de entrada/salida.
  hora_inicio TEXT,
  hora_fin TEXT,
  -- Fuente de verdad de la jornada esperada del día. Se deriva de hora_inicio/hora_fin
  -- cuando no se indica directamente.
  minutos_esperados INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS horario_dias_unico
  ON horario_dias (horario_id, dia_semana);

-- ─── 2) Horario propio de una persona (opcional) ────────────────
-- NULL = usa el horario predeterminado. Es una columna suelta: SQLite no permite añadir
-- una FOREIGN KEY con ALTER TABLE, y la integridad ya la garantiza el servicio.
ALTER TABLE empleados ADD COLUMN horario_id TEXT;

-- ─── 3) Sesiones de jornada reales ──────────────────────────────
CREATE TABLE IF NOT EXISTS jornadas_laborales (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES usuarios(id),
  empleado_id TEXT NOT NULL REFERENCES empleados(id),
  -- Timestamps del SERVIDOR (nunca del navegador). ended_at NULL = jornada ABIERTA.
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Una persona no puede tener dos jornadas abiertas a la vez. Se garantiza en la BD con un
-- índice único PARCIAL (solo sobre las filas con ended_at NULL): aunque dos peticiones
-- simultáneas pasaran la validación del servicio, la segunda no puede insertar.
CREATE UNIQUE INDEX IF NOT EXISTS jornadas_una_abierta_por_usuario
  ON jornadas_laborales (user_id) WHERE ended_at IS NULL;

-- Consultas por persona/mes y el listado global ordenado por fecha real.
CREATE INDEX IF NOT EXISTS jornadas_user_started_idx ON jornadas_laborales (user_id, started_at);
CREATE INDEX IF NOT EXISTS jornadas_started_idx ON jornadas_laborales (started_at);
