-- 0020_eliminar_team_leader.sql
-- Consolidación de roles: se elimina TEAM_LEADER como rol activo del sistema.
--
-- Los usuarios que aún tengan rol TEAM_LEADER migran a SUPERVISOR conservando TODA su
-- información (departamento, unidades, tareas, relaciones): el UPDATE solo cambia la
-- columna rol, nada más. Es idempotente: tras la primera corrida no quedan filas
-- TEAM_LEADER, así que en arranques posteriores no toca nada.
--
-- La columna rol es TEXT sin CHECK constraint (ver 0000_init.sql), así que no hay un
-- enum de BD que alterar — el enum vive a nivel de esquema Drizzle/código, que se
-- limpia en el mismo cambio.

UPDATE usuarios SET rol = 'SUPERVISOR' WHERE rol = 'TEAM_LEADER';
