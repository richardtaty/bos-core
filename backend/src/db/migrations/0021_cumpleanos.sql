-- 0021_cumpleanos.sql
-- Módulo "🎂 Próximos cumpleaños": cada cumpleaños es un registro permanente
-- independiente (una fila por persona), NO una tarea. La lista cronológica se calcula
-- desde día/mes/año en vuelo (sin filas por año) y cuando un cumpleaños entra en la
-- ventana de aviso (7 días) el worker crea UN recordatorio compartido por ocurrencia.
--
-- Todo es ADITIVO: dos tablas nuevas + índices únicos. No toca tablas existentes,
-- no borra nada y no convierte datos. Los cumpleaños viejos modelados como tareas
-- (tareas_seguimiento con nota "🎂 Cumpleaños …") se dejan intactos; su inventario e
-- importe (si aplica) es un paso aparte con aprobación explícita.

CREATE TABLE IF NOT EXISTS cumpleanos (
  id TEXT PRIMARY KEY,
  -- Vínculo opcional a la ficha del contacto. Cuando existe, nombre/teléfono/email se
  -- leen EN VIVO desde personas (no se duplica el contacto). Una persona solo puede
  -- tener un cumpleaños registrado — lo garantiza el índice único parcial de abajo.
  persona_id TEXT REFERENCES personas(id),
  nombre TEXT NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  dia INTEGER NOT NULL,
  anio INTEGER,                 -- opcional (para saber la edad); 29/02 se ajusta a 28/02
  activo INTEGER NOT NULL DEFAULT 1,
  notas TEXT,
  creado_por TEXT NOT NULL REFERENCES usuarios(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (activo IN (0,1))
);

-- Una persona con ficha solo puede tener UN cumpleaños registrado. Índice único
-- PARCIAL: las filas sin persona (cumpleaños sueltos) no participan en la restricción.
CREATE UNIQUE INDEX IF NOT EXISTS cumpleanos_persona_uq
  ON cumpleanos(persona_id) WHERE persona_id IS NOT NULL;

-- Un recordatorio por ocurrencia (año): la clave de idempotencia (cumpleanos_id, anio)
-- es la que evita que dos workers o dos guardados creen duplicados. El worker solo
-- inserta aquí cuando el próximo cumpleaños cae dentro de la ventana de aviso.
CREATE TABLE IF NOT EXISTS cumpleanos_recordatorios (
  id TEXT PRIMARY KEY,
  cumpleanos_id TEXT NOT NULL REFERENCES cumpleanos(id) ON DELETE CASCADE,
  anio INTEGER NOT NULL,                     -- año de la ocurrencia (ET)
  fecha_cumpleanos TEXT NOT NULL,            -- YYYY-MM-DD (ET) de esa ocurrencia
  estado TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | realizado | cancelado
  completado_por TEXT REFERENCES usuarios(id),
  completado_en INTEGER,
  created_at INTEGER NOT NULL,
  CHECK (estado IN ('pendiente','realizado','cancelado'))
);

-- Idempotencia en la BD: aunque dos procesos corran asegurarRecordatorio a la vez,
-- el segundo INSERT del mismo (cumpleanos_id, anio) choca con el índice y se descarta.
CREATE UNIQUE INDEX IF NOT EXISTS cumpleanos_recordatorio_uq
  ON cumpleanos_recordatorios(cumpleanos_id, anio);
