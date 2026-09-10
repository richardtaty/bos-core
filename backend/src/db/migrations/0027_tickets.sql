-- 0027_tickets.sql — DEV → Tickets (bandeja de solicitudes de soporte)
-- Aditiva y segura: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- Cualquier usuario autenticado CREA tickets (POST /api/tickets);
-- verlos queda restringido a SUPER_ADMIN vía el router /api/dev (reglas de DEV).
-- Un ticket NO es una tarea DEV; no se convierte entre sí en esta versión.

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  requested_by_user_id TEXT NOT NULL REFERENCES usuarios(id),
  description TEXT NOT NULL,
  prioridad TEXT NOT NULL DEFAULT 'Normal',
  idempotency_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS tickets_created_idx ON tickets(created_at);

CREATE TABLE IF NOT EXISTS ticket_adjuntos (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  nombre_original TEXT NOT NULL,
  content_type TEXT NOT NULL,
  tamano_bytes INTEGER NOT NULL,
  datos BLOB NOT NULL,
  subido_por TEXT NOT NULL REFERENCES usuarios(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ticket_adjuntos_ticket_idx ON ticket_adjuntos(ticket_id);
