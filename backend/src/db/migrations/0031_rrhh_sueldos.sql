-- RRHH → Control de Sueldo (fase 3): sueldo mensual CON HISTORIAL.
--
-- Dos decisiones que no se deben romper:
--
-- 1) El dinero se guarda en CENTAVOS ENTEROS (monto_centavos). Nunca coma flotante: un
--    sueldo no puede bailar por redondeo binario. La conversión a dólares es solo visual.
--
-- 2) Cada cambio de sueldo es una VIGENCIA NUEVA, no una sobrescritura. El sueldo que aplica
--    a un período es el último registro con vigente_desde <= último día de ese período, así
--    que consultar un mes pasado sigue devolviendo el monto que le correspondía aunque hoy
--    la persona gane otra cosa.
--
-- Tabla aditiva e idempotente. No toca ninguna tabla existente ni borra nada.

CREATE TABLE IF NOT EXISTS salarios (
  id TEXT PRIMARY KEY,
  -- Relación por ID real de la persona (nunca por nombre ni email).
  user_id TEXT NOT NULL REFERENCES usuarios(id),
  -- Perfil laboral al que pertenece el monto. Es la llave que usará una futura nómina.
  empleado_id TEXT NOT NULL REFERENCES empleados(id),
  -- Monto mensual base acordado, en centavos enteros.
  monto_centavos INTEGER NOT NULL,
  -- Primer día del negocio (AAAA-MM-DD) desde el que aplica este monto.
  vigente_desde TEXT NOT NULL,
  notas TEXT,
  created_by TEXT REFERENCES usuarios(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Consulta natural: "¿cuál era el sueldo de esta persona en tal fecha?".
CREATE INDEX IF NOT EXISTS salarios_user_vigente_idx ON salarios (user_id, vigente_desde);

-- Una sola vigencia por persona y fecha: dos montos distintos para el mismo día serían
-- contradictorios. Corregir el monto de una fecha ya existente actualiza esa fila; el
-- historial de las demás fechas queda intacto.
CREATE UNIQUE INDEX IF NOT EXISTS salarios_user_fecha_unico ON salarios (user_id, vigente_desde);
