-- Idempotencia de pagos: cada intento de "Registrar/Abonar pago" lleva una clave única
-- generada por el frontend al abrir el modal. El índice único impide que un doble clic,
-- reintento o request duplicado cree dos pagos iguales — la segunda inserción falla y el
-- backend devuelve el pago ya existente.

ALTER TABLE pagos ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS pagos_idempotencia_uq ON pagos(idempotency_key) WHERE idempotency_key IS NOT NULL;
