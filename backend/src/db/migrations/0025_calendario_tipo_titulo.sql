-- 0025_calendario_tipo_titulo: tipo estructurado + título/motivo para los registros del
-- Calendario (SALA DE OFERTAS → Calendario). Esa pantalla y su resumen ATRASADAS/PARA HOY/
-- PRÓXIMAS leen la tabla tareas_seguimiento — la misma fuente única que usan los seguimientos
-- que ya agenda el CRM (interacciones, cobros). Los nuevos Alertas/Recordatorios/Seguimientos
-- se guardan aquí con su tipo estructurado, nunca detectado por texto.
--
-- tipo: 'alerta' | 'recordatorio' | 'seguimiento' (texto fijo, validado en código).
-- Los registros ya existentes quedan como 'seguimiento' con título NULL.
-- Aditivo y no destructivo: no borra ni reescribe nada.
ALTER TABLE tareas_seguimiento ADD COLUMN tipo TEXT NOT NULL DEFAULT 'seguimiento';
ALTER TABLE tareas_seguimiento ADD COLUMN titulo TEXT;
