-- 0026_estado_completada_unico: un solo estado de trabajo terminado.
--
-- Contexto: los estados `aprobado` y `publicado` significaban "trabajo terminado" en
-- versiones anteriores del CRM, pero cada vista interpretaba "completada" con criterios
-- distintos (unas contaban solo `aprobado`/`publicado`, otras sumaban `completada`), lo
-- que hacía que una misma tarea apareciera COMPLETADA en un lado y ATRASADA en otro.
--
-- Decisión de negocio (autorizada): el ÚNICO estado de terminado es `completada`. Los
-- estados `aprobado`/`publicado` dejan de existir; las tareas que hoy están en ellos son
-- trabajo realmente terminado y se migran a `completada`. Nada se borra: solo se cambia
-- el estado de esas filas.
--
-- Además se rellena completed_at de las tareas ya terminadas con la fecha del propio
-- registro (updated_at). Es la base para calcular "producción del día" con el momento
-- real de finalización. Como en SQLite completed_at y updated_at comparten formato de
-- almacenamiento, copiar de columna a columna conserva el valor sin interpretarlo.
--
-- Idempotente y no destructivo: se puede correr en cada arranque sin efecto repetido.

UPDATE tareas_operativas SET estado = 'completada' WHERE estado IN ('aprobado', 'publicado');

UPDATE tareas_operativas
SET completed_at = updated_at
WHERE estado = 'completada' AND completed_at IS NULL;
