-- BMF — Business Market Finders
-- Tablas para la unidad de negocio BMF (lenders, fundings, llamadas, comisiones)
-- + columnas adicionales en personas para la operación comercial

CREATE TABLE IF NOT EXISTS bmf_lenders (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  contacto TEXT,
  email TEXT,
  telefono TEXT,
  productos TEXT,
  monto_minimo REAL,
  monto_maximo REAL,
  tiempo_respuesta_dias INTEGER,
  estado TEXT NOT NULL DEFAULT 'activo',
  observaciones TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bmf_fundings (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES personas(id),
  agente_id TEXT NOT NULL REFERENCES usuarios(id),
  lender_id TEXT REFERENCES bmf_lenders(id),
  monto_solicitado REAL NOT NULL,
  monto_aprobado REAL,
  fecha_creacion INTEGER NOT NULL,
  fecha_aprobacion INTEGER,
  fecha_funding INTEGER,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  comision_porcentaje REAL,
  comision_monto REAL,
  observaciones TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bmf_fundings_cliente_idx ON bmf_fundings(cliente_id);
CREATE INDEX IF NOT EXISTS bmf_fundings_agente_idx ON bmf_fundings(agente_id);
CREATE INDEX IF NOT EXISTS bmf_fundings_lender_idx ON bmf_fundings(lender_id);
CREATE INDEX IF NOT EXISTS bmf_fundings_estado_idx ON bmf_fundings(estado);

CREATE TABLE IF NOT EXISTS bmf_llamadas (
  id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL REFERENCES personas(id),
  agente_id TEXT NOT NULL REFERENCES usuarios(id),
  fecha INTEGER NOT NULL,
  duracion_minutos INTEGER,
  resultado TEXT NOT NULL DEFAULT 'contestó',
  observaciones TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bmf_llamadas_persona_idx ON bmf_llamadas(persona_id, fecha);
CREATE INDEX IF NOT EXISTS bmf_llamadas_agente_idx ON bmf_llamadas(agente_id, fecha);

CREATE TABLE IF NOT EXISTS bmf_comisiones (
  id TEXT PRIMARY KEY,
  agente_id TEXT NOT NULL REFERENCES usuarios(id),
  funding_id TEXT NOT NULL REFERENCES bmf_fundings(id),
  monto REAL NOT NULL,
  porcentaje REAL NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  fecha_pago INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bmf_comisiones_agente_idx ON bmf_comisiones(agente_id);
CREATE INDEX IF NOT EXISTS bmf_comisiones_funding_idx ON bmf_comisiones(funding_id);

-- Columnas adicionales en personas para operación comercial BMF
-- (ALTER TABLE no es idempotente en SQLite; el migrador captura "duplicate column")
ALTER TABLE personas ADD COLUMN empresa TEXT;
ALTER TABLE personas ADD COLUMN industria TEXT;
ALTER TABLE personas ADD COLUMN facturacion_mensual_estimada REAL;
ALTER TABLE personas ADD COLUMN tiempo_en_negocio TEXT;
ALTER TABLE personas ADD COLUMN funding_solicitado REAL;
ALTER TABLE personas ADD COLUMN funding_anterior REAL;
ALTER TABLE personas ADD COLUMN temperatura TEXT;
ALTER TABLE personas ADD COLUMN prioridad TEXT;
ALTER TABLE personas ADD COLUMN estado_proceso TEXT;
