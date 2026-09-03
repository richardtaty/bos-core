-- 0009_ingresos: Motor de Ingresos — ofertas, ventas, egresos.

CREATE TABLE IF NOT EXISTS ofertas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL CHECK (categoria IN ('Ancla','Recurrente','Volumen medio','Volumen alto','Evento')),
  target REAL NOT NULL DEFAULT 0,
  ticket REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ventas_ingresos (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  oferta_id TEXT NOT NULL REFERENCES ofertas(id),
  monto REAL NOT NULL,
  nota TEXT,
  es_anticipo INTEGER NOT NULL DEFAULT 0,
  total_deal REAL,
  autor_id TEXT NOT NULL REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS vi_oferta_idx ON ventas_ingresos(oferta_id);
CREATE INDEX IF NOT EXISTS vi_fecha_idx ON ventas_ingresos(fecha);

CREATE TABLE IF NOT EXISTS egresos (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('Nómina','Aviones','Hoteles','Transportes','Comidas','Otro')),
  oferta_id TEXT REFERENCES ofertas(id),
  monto REAL NOT NULL,
  nota TEXT,
  autor_id TEXT NOT NULL REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS eg_categoria_idx ON egresos(categoria);
CREATE INDEX IF NOT EXISTS eg_fecha_idx ON egresos(fecha);
