-- 0029_rrhh_empleados.sql — Recursos Humanos → Personal (perfil laboral)
-- Aditiva y segura: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- No toca ninguna tabla existente ni migra datos: la tabla `usuarios` sigue siendo la
-- única fuente de personas. Aquí solo vive lo que es EXCLUSIVAMENTE laboral.
--
-- Relación 1:1 con la persona real de `usuarios` mediante `user_id` (UNIQUE): una persona
-- es una sola cosa para el CRM, RRHH, las tareas y el futuro Control de Sueldo. Nunca se
-- relaciona por nombre ni por email — siempre por ID.
--
-- estado_laboral es INDEPENDIENTE de usuarios.activo (que es acceso al CRM: login, rol,
-- permisos). Dar de baja laboral a alguien NO le quita el acceso, y desactivarle el acceso
-- NO lo da de baja. Esa separación es a propósito (punto 13 del alcance).
--
-- Esta fila es OPCIONAL: quien no tenga perfil laboral sigue apareciendo en Personal con
-- los datos reales de `usuarios` (nombre, cargo, departamento) y estado laboral ACTIVO.
-- El perfil se crea solo cuando alguien edita por primera vez esos datos.

CREATE TABLE IF NOT EXISTS empleados (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES usuarios(id),
  -- ACTIVO | INACTIVO — estado laboral, nunca estado de la cuenta del CRM.
  estado_laboral TEXT NOT NULL DEFAULT 'ACTIVO',
  -- Notas internas de Recursos Humanos. Dato privado: no sale por endpoints generales.
  notas TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- El UNIQUE de user_id ya indexa; este índice cubre el listado por estado laboral.
CREATE INDEX IF NOT EXISTS empleados_estado_laboral_idx ON empleados (estado_laboral);
