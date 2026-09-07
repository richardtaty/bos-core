-- 0022_marketing_calendario.sql
-- Calendario de Marketing: correo/contenido programado asociado a un PROYECTO real.
-- Una fila = un elemento del calendario (qué proyecto tiene correo/contenido ese día).
-- Solo guarda la RELACIÓN al proyecto (proyecto_id) + la fecha; el nombre mostrado se
-- lee en vivo desde proyectos, así un renombre del proyecto no rompe nada (regla 17).
-- Es ADITIVO: tabla nueva + índices. No toca tablas existentes (los cumpleaños y las
-- tareas de contenido siguen en sus propios módulos — fuentes separadas, regla 16).
CREATE TABLE IF NOT EXISTS marketing_calendario (
  id TEXT PRIMARY KEY,
  proyecto_id TEXT NOT NULL REFERENCES proyectos(id),
  fecha TEXT NOT NULL,                    -- YYYY-MM-DD
  creado_por TEXT NOT NULL REFERENCES usuarios(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS marketing_calendario_fecha_idx ON marketing_calendario(fecha);
CREATE INDEX IF NOT EXISTS marketing_calendario_proyecto_idx ON marketing_calendario(proyecto_id);
