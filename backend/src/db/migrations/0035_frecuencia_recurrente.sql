-- 0035_frecuencia_recurrente.sql — Cada cuánto se cobra un pago recurrente (parte 3 de 3)
--
-- SEMANAL | QUINCENAL | MENSUAL, o NULL si no aplica. Junto con `monto_recurrente` describe el
-- plan del trato; sirve para proponer la fecha del próximo cobro al registrar un pago.
--
-- Sin CHECK constraint a propósito: SQLite no permite añadir restricciones con ALTER TABLE, y
-- la validación real ya vive en el schema de zod (`validation.ts`), que es donde el proyecto
-- valida todo lo demás y desde donde se puede dar un mensaje de error legible.
--
-- Aditiva y sin pérdida: ver la nota de orden y de idempotencia en 0033_modalidad_pago.sql.

ALTER TABLE registros ADD COLUMN frecuencia_recurrente TEXT;
