-- 0028_tickets_estado.sql — Estados reales para DEV → Tickets.
-- Aditiva y segura: no borra ni reescribe nada. Los tickets que YA existen quedan
-- como 'PENDIENTE' gracias al DEFAULT de la columna nueva (no se pierde historial).
-- completed_at / cancelled_at son nullable y created_at nunca se modifica.

ALTER TABLE tickets ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE tickets ADD COLUMN completed_at INTEGER;
ALTER TABLE tickets ADD COLUMN cancelled_at INTEGER;

CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status);
