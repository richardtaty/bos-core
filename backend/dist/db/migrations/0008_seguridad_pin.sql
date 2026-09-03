-- 0008_seguridad_pin: verificación en dos pasos para SUPER_ADMIN.
-- Agrega columnas de PIN a usuarios y tablas de seguridad.

-- Columnas de seguridad en usuarios
ALTER TABLE usuarios ADD COLUMN pin_hash TEXT;
ALTER TABLE usuarios ADD COLUMN pin_habilitado INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN pin_actualizado_en TEXT;
ALTER TABLE usuarios ADD COLUMN pin_intentos_fallidos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN pin_bloqueado_hasta TEXT;
ALTER TABLE usuarios ADD COLUMN ultimo_acceso_pin TEXT;

-- Dispositivos confiables (recordar dispositivo 12h)
CREATE TABLE IF NOT EXISTS dispositivos_confiables (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  token_hash TEXT NOT NULL,
  nombre_dispositivo TEXT,
  user_agent TEXT,
  ip_creacion TEXT,
  creado_en TEXT NOT NULL,
  expira_en TEXT NOT NULL,
  revocado_en TEXT,
  ultimo_uso_en TEXT
);
CREATE INDEX IF NOT EXISTS idx_disp_usuario ON dispositivos_confiables(usuario_id);
CREATE INDEX IF NOT EXISTS idx_disp_token ON dispositivos_confiables(token_hash);

-- Códigos de recuperación de un solo uso
CREATE TABLE IF NOT EXISTS codigos_recuperacion (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  codigo_hash TEXT NOT NULL,
  usado_en TEXT,
  creado_en TEXT NOT NULL,
  revocado_en TEXT
);
CREATE INDEX IF NOT EXISTS idx_codigos_usuario ON codigos_recuperacion(usuario_id);

-- Eventos de seguridad (auditoría de acciones sensibles)
CREATE TABLE IF NOT EXISTS eventos_seguridad (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  tipo_evento TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  metadata_segura TEXT,
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eventos_usuario ON eventos_seguridad(usuario_id);
CREATE INDEX IF NOT EXISTS idx_eventos_tipo ON eventos_seguridad(tipo_evento, creado_en);
