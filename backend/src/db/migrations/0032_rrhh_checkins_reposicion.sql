-- 0032_rrhh_checkins_reposicion.sql — RRHH → Asistencia (fase 4)
-- Check-ins aleatorios de actividad + reposición de horas.
-- Aditiva e idempotente: no borra ni modifica ninguna fila existente.
--
-- REGLA DURA que esta migración NO puede romper: las horas trabajadas salen SOLO de
-- started_at/ended_at de `jornadas_laborales`. Un check-in sin respuesta NO descuenta sueldo,
-- NO reduce horas, NO cierra la jornada y NO marca ausencia. Esta tabla es historial de
-- ACTIVIDAD para consulta; cualquier decisión administrativa es posterior y humana.
--
-- ORDEN IMPORTANTE: el ALTER TABLE va AL FINAL del archivo. `migrate.ts` ejecuta el archivo
-- completo con `sqlite.exec()`, que aborta en el primer statement que falla; como el ALTER
-- "duplicate column name" salta en CADA reinicio, si estuviera antes, el error se tragaría el
-- resto del archivo y los CREATE de abajo nunca llegarían a ejecutarse.

-- ─── 1) Check-ins de actividad ──────────────────────────────────
-- `block_index` = bloque de 1 hora desde el started_at de la sesión (0, 1, 2…). Máximo un
-- check-in por bloque: es la unidad que define tanto el momento como la ventana de respuesta.
--
-- `scheduled_at` lo deriva el servidor de forma DETERMINISTA del id de la sesión, así que
-- recalcularlo da siempre el mismo instante: un refresh, un redeploy o dos pestañas abiertas
-- no cambian el horario ni duplican la fila. Nada de setTimeout/setInterval/localStorage.
--
-- `delivered_at` = primera vez que la fila se sirvió al navegador. La ventana de respuesta se
-- cuenta DESDE AQUÍ, no desde scheduled_at: si el navegador estaba cerrado, la fila se
-- materializa al volver y no puede quedar "Sin respuesta" por una alerta que nadie vio.
--
-- Estados (español, como el resto del CRM): PENDIENTE / RESPONDIDO / SIN_RESPUESTA / CANCELADO.
-- NUNCA se borra una fila: el historial se conserva con su estado final.
CREATE TABLE IF NOT EXISTS jornadas_checkins (
  id TEXT PRIMARY KEY,
  -- FK reales: la sesión de trabajo, la persona del CRM y su perfil laboral. Nunca por nombre.
  jornada_id TEXT NOT NULL REFERENCES jornadas_laborales(id),
  user_id TEXT NOT NULL REFERENCES usuarios(id),
  empleado_id TEXT NOT NULL REFERENCES empleados(id),
  block_index INTEGER NOT NULL,
  scheduled_at INTEGER NOT NULL,
  delivered_at INTEGER,
  responded_at INTEGER,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Idempotencia de la materialización perezosa: dos pestañas pueden intentar insertar el mismo
-- bloque a la vez; la segunda choca aquí y el servicio lo ignora (INSERT ... ON CONFLICT DO
-- NOTHING). Sin este índice, un SELECT-luego-INSERT dejaría pasar filas duplicadas.
CREATE UNIQUE INDEX IF NOT EXISTS jornadas_checkins_bloque_unico
  ON jornadas_checkins (jornada_id, block_index);

-- Detalle de una sesión en RECURSOS HUMANOS → Asistencia.
CREATE INDEX IF NOT EXISTS jornadas_checkins_jornada_idx
  ON jornadas_checkins (jornada_id, scheduled_at);

-- El poll global de la alerta. Índice PARCIAL: solo mira lo que sigue pendiente, que es una
-- fracción mínima de la tabla.
CREATE INDEX IF NOT EXISTS jornadas_checkins_pendiente_idx
  ON jornadas_checkins (user_id, scheduled_at) WHERE estado = 'PENDIENTE';

-- ─── 2) Tipo de sesión: jornada regular vs reposición de horas ──
-- Las filas que ya existen quedan como REGULAR, que es exactamente lo que son: no hay ningún
-- dato que inventar ni que reclasificar.
--
-- No hace falta índice nuevo para "una sola sesión activa por persona": el índice único
-- PARCIAL `jornadas_una_abierta_por_usuario` de la migración 0030 es sobre (user_id) WHERE
-- ended_at IS NULL, así que ya impide dos sesiones abiertas de CUALQUIER tipo combinado
-- (dos regulares, dos reposiciones, o una de cada).
--
-- AL FINAL A PROPÓSITO: ver la nota del encabezado.
ALTER TABLE jornadas_laborales ADD COLUMN session_type TEXT NOT NULL DEFAULT 'REGULAR';

-- Resumen mensual por tipo (Asistencia y Control de Sueldo) sin escanear toda la tabla.
CREATE INDEX IF NOT EXISTS jornadas_user_tipo_started_idx
  ON jornadas_laborales (user_id, session_type, started_at);
