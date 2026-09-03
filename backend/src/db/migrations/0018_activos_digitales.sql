-- 0018_activos_digitales.sql
-- Activos digitales de un cliente (persona): landings, funnels, thank you pages,
-- formularios, dominios, automatizaciones, etc.
--
-- Uno-a-muchos a propósito: un cliente puede tener 0, 1, 5 o 20 activos. NUNCA se debe
-- guardar esto como campos rígidos (landing_url, landing_2, ...) ni dentro de la ficha
-- de contacto. Cada fila pertenece a exactamente un persona_id; borrar la persona borra
-- sus activos (ON DELETE CASCADE) igual que interacciones o tareas_seguimiento.

CREATE TABLE IF NOT EXISTS activos_digitales (
  id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  url TEXT,
  tipo TEXT NOT NULL DEFAULT 'Landing',
  plataforma TEXT,
  objetivo TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  notas TEXT,
  autor_id TEXT NOT NULL REFERENCES usuarios(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (tipo IN ('Landing','Funnel','Thank You Page','Formulario','Dominio','Automatización','Otro')),
  CHECK (activo IN (0,1))
);

-- Orden de la pestaña: activos primero y dentro de cada grupo el más reciente primero.
CREATE INDEX IF NOT EXISTS activos_digitales_persona_idx ON activos_digitales(persona_id, activo, created_at);
