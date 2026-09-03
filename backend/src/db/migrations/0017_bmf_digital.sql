-- BMF Digital Funding — unidad digital-first, email-first
-- Solicitudes, ofertas, documentos y mensajes (bandeja de email).

CREATE TABLE IF NOT EXISTS bmf_solicitudes (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE,
  persona_id TEXT NOT NULL REFERENCES personas(id),
  registro_id TEXT REFERENCES registros(id),
  empresa_legal TEXT,
  dba TEXT,
  empresa_direccion TEXT,
  empresa_ciudad TEXT,
  empresa_estado TEXT,
  empresa_zip TEXT,
  industria TEXT,
  estructura_negocio TEXT,
  fecha_inicio_negocio TEXT,
  sitio_web TEXT,
  propietario_nombre TEXT,
  propietario_apellido TEXT,
  propietario_email TEXT,
  propietario_telefono TEXT,
  porcentaje_propiedad REAL,
  monto_solicitado REAL,
  proposito_fondos TEXT,
  ingreso_mensual_estimado REAL,
  depositos_mensuales_promedio REAL,
  tiene_financiamiento_actual INTEGER NOT NULL DEFAULT 0,
  saldo_financiamiento_actual REAL,
  ein TEXT,
  banco_nombre TEXT,
  depositos_mensuales_aprox INTEGER,
  estado_documentos TEXT NOT NULL DEFAULT 'pendiente',
  consentimiento INTEGER NOT NULL DEFAULT 0,
  consentimiento_fecha INTEGER,
  fuente TEXT,
  campana TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  landing_page TEXT,
  ultimo_seguimiento_en INTEGER,
  seguimientos_enviados INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (estado_documentos IN ('pendiente', 'parcial', 'completo'))
);

CREATE INDEX IF NOT EXISTS bmf_solicitudes_persona_idx ON bmf_solicitudes(persona_id);
CREATE INDEX IF NOT EXISTS bmf_solicitudes_registro_idx ON bmf_solicitudes(registro_id);
CREATE INDEX IF NOT EXISTS bmf_solicitudes_estado_idx ON bmf_solicitudes(estado_documentos);

CREATE TABLE IF NOT EXISTS bmf_ofertas (
  id TEXT PRIMARY KEY,
  solicitud_id TEXT NOT NULL REFERENCES bmf_solicitudes(id) ON DELETE CASCADE,
  lender_id TEXT REFERENCES bmf_lenders(id),
  monto REAL,
  plazo TEXT,
  frecuencia_pago TEXT,
  monto_pago REAL,
  total_pagar REAL,
  factor_rate REAL,
  costo_origination REAL,
  comision_broker REAL,
  comision_neta REAL,
  fecha_expiracion INTEGER,
  estado TEXT NOT NULL DEFAULT 'borrador',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (estado IN ('borrador', 'presentada', 'aceptada', 'rechazada', 'expirada'))
);

CREATE INDEX IF NOT EXISTS bmf_ofertas_solicitud_idx ON bmf_ofertas(solicitud_id);
CREATE INDEX IF NOT EXISTS bmf_ofertas_lender_idx ON bmf_ofertas(lender_id);

CREATE TABLE IF NOT EXISTS bmf_documentos (
  id TEXT PRIMARY KEY,
  solicitud_id TEXT NOT NULL REFERENCES bmf_solicitudes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'otro',
  nombre TEXT NOT NULL,
  storage_key TEXT,
  tamano_bytes INTEGER NOT NULL DEFAULT 0,
  content_type TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  created_at INTEGER NOT NULL,
  CHECK (tipo IN ('bank_statement', 'identificacion', 'cheque_anulado', 'otro')),
  CHECK (estado IN ('pendiente', 'recibido', 'verificado', 'rechazado'))
);

CREATE INDEX IF NOT EXISTS bmf_documentos_solicitud_idx ON bmf_documentos(solicitud_id);

CREATE TABLE IF NOT EXISTS bmf_mensajes (
  id TEXT PRIMARY KEY,
  solicitud_id TEXT NOT NULL REFERENCES bmf_solicitudes(id) ON DELETE CASCADE,
  persona_id TEXT REFERENCES personas(id),
  direccion TEXT NOT NULL DEFAULT 'saliente',
  remitente TEXT,
  destinatario TEXT,
  asunto TEXT,
  cuerpo TEXT,
  resend_message_id TEXT,
  generado_por_ia INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'enviado',
  created_at INTEGER NOT NULL,
  CHECK (direccion IN ('entrante', 'saliente')),
  CHECK (estado IN ('enviado', 'entregado', 'rebotado', 'error'))
);

CREATE INDEX IF NOT EXISTS bmf_mensajes_solicitud_idx ON bmf_mensajes(solicitud_id);
CREATE INDEX IF NOT EXISTS bmf_mensajes_persona_idx ON bmf_mensajes(persona_id);
