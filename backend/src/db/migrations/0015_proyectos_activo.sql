-- 0015_proyectos_activo: flag de estado Activo/Inactivo para el módulo de Proyectos.
-- Distinto del ciclo de vida `estado` (activo/completado/cancelado/en_pausa): `activo`
-- es un interruptor rápido para "desactivar" un proyecto sin borrarlo ni cambiar su etapa.
ALTER TABLE proyectos ADD COLUMN activo INTEGER NOT NULL DEFAULT 1;
