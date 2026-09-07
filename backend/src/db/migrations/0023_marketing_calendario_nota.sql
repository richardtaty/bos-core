-- 0023_marketing_calendario_nota: campo "Nota" para cada elemento del Calendario de
-- Marketing. Texto libre y largo (sin límite práctico) que queda asociado SOLO al
-- elemento del calendario — no toca el proyecto, el contacto ni las tareas.
-- Aditivo: los registros existentes quedan con nota = NULL.
ALTER TABLE marketing_calendario ADD COLUMN nota TEXT;
