// ─── Acceso al módulo RECURSOS HUMANOS ─────────────────────────
//
// Regla ÚNICA y aislada de quién entra a Recursos Humanos. No se toca la matriz global de
// permisos ni se crea un rol nuevo: los roles del CRM siguen siendo los mismos
// (SUPER_ADMIN, ADMIN, SUPERVISOR, USUARIO, AGENTE).
//
// Personal es información interna de la empresa (hoy la plantilla; mañana asistencia y
// sueldos), así que NO se expone a todo usuario autenticado solo por existir. Hoy entran
// el Super Admin y el Admin — los mismos dos roles que ya mandan sobre el equipo en
// "Mi Equipo" (usuarios.routes.ts). El día que RRHH deba administrarlo otra persona, se
// cambia SOLO este arreglo (y su espejo en frontend/src/hooks/usePermisos.ts) y ningún
// otro módulo del CRM se ve afectado.
//
// A propósito NO se admite acceso por departamento (a diferencia de Cumpleaños): RRHH es
// transversal a toda la empresa, no una unidad de negocio.
//
// Se tipa como string[] y no como Rol[] para no importar desde middleware/auth: auth.ts
// sí importa este archivo, y un ciclo —aunque sea de tipos— no vale la pena.

/** Roles con acceso al módulo Recursos Humanos. Único punto de ajuste. */
export const ROLES_ACCESO_RRHH: readonly string[] = ["SUPER_ADMIN", "ADMIN"];
