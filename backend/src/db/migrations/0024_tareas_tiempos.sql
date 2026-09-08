-- 0024_tareas_tiempos: fecha y hora reales de los pasos de una tarea DEV
-- (tareas_operativas con departamento = 'DEV'). Guardan el momento exacto en que la
-- tarea pasó a EN PROCESO (started_at) y a FINALIZADA (completed_at). La fecha de
-- creación ya vive en created_at (no se toca). Son opcionales (NULL) y solo las
-- registra el flujo DEV; las tareas existentes quedan con NULL hasta que cambien de
-- estado. Aditivo: no modifica datos ni otros campos.
ALTER TABLE tareas_operativas ADD COLUMN started_at INTEGER;
ALTER TABLE tareas_operativas ADD COLUMN completed_at INTEGER;
