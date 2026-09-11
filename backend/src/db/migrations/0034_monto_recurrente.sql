-- 0034_monto_recurrente.sql — Monto por período del pago recurrente (parte 2 de 3)
--
-- Cuánto se cobra en cada período de una oportunidad RECURRENTE. NULL si no aplica.
-- Es una REFERENCIA del plan de cobro, no un pago: no entra en "Pagado" ni en "Saldo" ni en
-- ningún reporte de ingresos. Lo cobrado sale siempre de sumar las filas reales de `pagos`.
--
-- REAL, igual que `registros.valor` y `pagos.monto`: mezclar centavos enteros con los números
-- que ya existen en este módulo obligaría a convertir en cada comparación y en cada reporte.
--
-- Aditiva y sin pérdida: ver la nota de orden y de idempotencia en 0033_modalidad_pago.sql.

ALTER TABLE registros ADD COLUMN monto_recurrente REAL;
