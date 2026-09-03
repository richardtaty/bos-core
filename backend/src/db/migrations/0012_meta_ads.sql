-- 0012_meta_ads: Métricas Meta Ads — registro manual semanal.
-- Solo carga y edición manual, visualización y permisos. Sin conexión a Meta.

CREATE TABLE IF NOT EXISTS meta_ads_reportes (
  id TEXT PRIMARY KEY,
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT NOT NULL,
  titulo TEXT,
  observacion_general TEXT,
  presupuesto_total_actual REAL,
  creado_por TEXT NOT NULL REFERENCES usuarios(id),
  actualizado_por TEXT REFERENCES usuarios(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS meta_ads_reportes_fechas_idx ON meta_ads_reportes(fecha_inicio, fecha_fin);

CREATE TABLE IF NOT EXISTS meta_ads_grupos (
  id TEXT PRIMARY KEY,
  reporte_id TEXT NOT NULL REFERENCES meta_ads_reportes(id) ON DELETE CASCADE,
  seccion_principal TEXT NOT NULL,
  nombre TEXT NOT NULL,
  subtitulo TEXT,
  presupuesto_total_actual REAL,
  observacion TEXT,
  sin_campanas_activas INTEGER NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS meta_ads_grupos_reporte_idx ON meta_ads_grupos(reporte_id);

CREATE TABLE IF NOT EXISTS meta_ads_campanas (
  id TEXT PRIMARY KEY,
  grupo_id TEXT NOT NULL REFERENCES meta_ads_grupos(id) ON DELETE CASCADE,
  campana_padre_id TEXT REFERENCES meta_ads_campanas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  ubicacion_publico TEXT,
  presupuesto REAL,
  detalle_presupuesto TEXT,
  leads INTEGER,
  costo_por_lead REAL,
  moneda TEXT NOT NULL DEFAULT 'USD',
  estado TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa','Inactiva')),
  observaciones TEXT,
  recomendaciones TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS meta_ads_campanas_grupo_idx ON meta_ads_campanas(grupo_id);
CREATE INDEX IF NOT EXISTS meta_ads_campanas_padre_idx ON meta_ads_campanas(campana_padre_id);
