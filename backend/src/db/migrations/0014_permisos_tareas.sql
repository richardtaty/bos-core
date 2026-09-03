-- Registra quién delegó cada tarea.
--
-- Sin este dato era imposible garantizar que quien asigna conserve el control: la tabla
-- solo sabía quién la ejecuta (responsable_id), quién la pidió (solicitante_id) y quién
-- la aprueba (aprobador_id). Ninguno de esos tres es necesariamente quien delegó.
--
-- Las tareas que ya existen quedan con NULL y eso no bloquea a nadie: el permiso también
-- se concede por rol y por departamento (ver puedeGestionarTarea en tareas.service.ts).
-- A partir de ahora toda tarea nueva y toda reasignación lo dejan grabado.
ALTER TABLE tareas_operativas ADD COLUMN asignado_por_id TEXT REFERENCES usuarios(id);
CREATE INDEX IF NOT EXISTS tareas_asignado_por_idx ON tareas_operativas(asignado_por_id);
