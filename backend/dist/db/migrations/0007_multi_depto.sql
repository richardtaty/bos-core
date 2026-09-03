-- 0007_multi_depto: permite que un ADMIN pertenezca a varios departamentos.
-- Reemplaza el campo usuarios.departamento_id por una tabla M:N.

CREATE TABLE IF NOT EXISTS usuario_departamentos (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  departamento_id TEXT NOT NULL REFERENCES departamentos(id),
  PRIMARY KEY (usuario_id, departamento_id)
);

-- Migrar datos existentes: cada usuario con un solo departamento
INSERT OR IGNORE INTO usuario_departamentos (usuario_id, departamento_id)
SELECT id, departamento_id FROM usuarios WHERE departamento_id IS NOT NULL;
