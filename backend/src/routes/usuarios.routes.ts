import { Router } from "express";
import {
  requireAuth,
  ROLES_QUE_ADMINISTRAN,
  departamentoIdsDe,
  esGestionGlobal,
  puedeAdministrarCuenta,
  rolesAsignables,
  compartenDepartamento,
  type Rol,
  type AuthUser,
} from "../middleware/auth";
import { crearUsuarioSchema, cambiarPasswordSchema } from "../lib/validation";
import {
  listarUsuarios,
  crearUsuario,
  cambiarPassword,
  cambiarRol,
  cambiarEstadoUsuario,
  restablecerPassword,
  cambiarDepartamento,
  obtenerUsuarioParaGestion,
} from "../services/usuarios.service";
import { db } from "../db/client";
import { usuarioDepartamentos } from "../db/schema";
import { eq } from "drizzle-orm";

export const usuariosRouter = Router();
usuariosRouter.use(requireAuth);

const ROLES_VALIDOS: Rol[] = ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "USUARIO"];

interface ObjetivoGestion {
  rol: Rol;
  departamentoIds: string[];
}

/**
 * Error de autorización al querer administrar la cuenta del objetivo, o null si está
 * permitido. Regla anti-escalamiento: un rol nunca administra a un rol superior, y un
 * supervisor (SUPERVISOR) solo administra a integrantes de su propio departamento.
 */
function errorSiNoPuedeGestionar(actor: AuthUser, objetivo: ObjetivoGestion): { error: string } | null {
  if (!puedeAdministrarCuenta(actor.rol, objetivo.rol)) {
    return { error: "No tienes permiso para administrar la cuenta de este usuario." };
  }
  if (!esGestionGlobal(actor.rol) && !compartenDepartamento(actor, objetivo)) {
    return { error: "Solo puedes administrar a integrantes de tu propio departamento." };
  }
  return null;
}

// Todos los usuarios autenticados ven la lista completa para permitir
// la asignación de tareas entre departamentos. El parámetro `soloMiUnidad`
// acota la lista al departamento del usuario (lo usa la pantalla "Mi Equipo"
// para que cada rol vea solo su área, salvo SUPER_ADMIN/ADMIN que ven todo).
usuariosRouter.get("/", async (req, res) => {
  const actor = req.user!;
  const soloMiUnidad = req.query.soloMiUnidad === "1" || req.query.soloMiUnidad === "true";
  if (soloMiUnidad && !esGestionGlobal(actor.rol)) {
    // Un líder sin departamento no tiene "unidad propia": en vez de que el service
    // `listarUsuarios([])` devuelva a TODOS, se responde vacío.
    const deptos = departamentoIdsDe(actor);
    if (deptos.length === 0) {
      res.json([]);
      return;
    }
    res.json(await listarUsuarios(deptos));
    return;
  }
  res.json(await listarUsuarios());
});

// Crear integrante:
//   SUPER_ADMIN        → cualquier rol, cualquier departamento/supervisor (sin forzar).
//   ADMIN              → USUARIO/SUPERVISOR, con departamento/supervisor a elección
//                        (nunca ADMIN ni SUPER_ADMIN).
//   SUPERVISOR         → siempre USUARIO, forzado a su propio departamento y bajo su
//                        supervisión. Los valores que mande el cliente se ignoran (anti-escalamiento).
usuariosRouter.post("/", async (req, res) => {
  const creador = req.user!;
  if (!ROLES_QUE_ADMINISTRAN.includes(creador.rol)) {
    res.status(403).json({ error: "No tienes permiso para crear integrantes." });
    return;
  }

  const parsed = crearUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (creador.rol === "SUPERVISOR") {
    const deptoIds = departamentoIdsDe(creador);
    if (deptoIds.length === 0) {
      res.status(403).json({ error: "No tienes un departamento asignado. Solo puedes agregar miembros si lideras un departamento." });
      return;
    }
    parsed.data.rol = "USUARIO";
    parsed.data.departamentoId = deptoIds[0];
    parsed.data.supervisorId = creador.id;
  } else if (creador.rol === "ADMIN") {
    if (!rolesAsignables(creador.rol).includes(parsed.data.rol)) {
      res.status(403).json({ error: "Solo el Super Admin puede crear usuarios con rol ADMIN o SUPER_ADMIN. Un Admin puede crear Usuario y Supervisor." });
      return;
    }
    // Un rol de mando necesita un departamento sobre el que mandar.
    if (parsed.data.rol === "SUPERVISOR" && !parsed.data.departamentoId) {
      res.status(400).json({ error: `El rol ${parsed.data.rol} exige elegir un departamento.` });
      return;
    }
  }

  try {
    const usuario = await crearUsuario(parsed.data, creador.id);
    // Asignar a la tabla M:N de departamentos
    const deptoId = parsed.data.departamentoId;
    if (deptoId) {
      await db.insert(usuarioDepartamentos).values({ usuarioId: usuario.id, departamentoId: deptoId });
    }
    res.status(201).json(usuario);
    return;
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
    return;
  }
});

usuariosRouter.patch("/me/password", async (req, res) => {
  const parsed = cambiarPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    await cambiarPassword(req.user!.id, parsed.data.passwordActual, parsed.data.passwordNueva);
    res.json({ ok: true });
    return;
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }
});

// Cambiar rol. Quién puede: cualquier rol que administra cuentas, sujeto a:
//   - el objetivo existe y su rol es administrable por el actor;
//   - si el actor es supervisor, el objetivo está en su departamento;
//   - el rol nuevo está dentro de los que el actor puede asignar.
usuariosRouter.patch("/:id/rol", async (req, res) => {
  const actor = req.user!;
  const { rol } = req.body;
  if (typeof rol !== "string" || !ROLES_VALIDOS.includes(rol as Rol)) {
    res.status(400).json({ error: "Rol inválido" });
    return;
  }
  const objetivo = await obtenerUsuarioParaGestion(req.params.id);
  if (!objetivo) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const fallo = errorSiNoPuedeGestionar(actor, objetivo);
  if (fallo) {
    res.status(403).json(fallo);
    return;
  }
  if (!rolesAsignables(actor.rol).includes(rol as Rol)) {
    res.status(403).json({ error: `No puedes asignar el rol ${rol}.` });
    return;
  }
  try {
    await cambiarRol(req.params.id, rol, actor.id);
    res.json({ ok: true });
    return;
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
    return;
  }
});

// Activar/desactivar. Misma autorización que el cambio de rol.
usuariosRouter.patch("/:id/estado", async (req, res) => {
  const actor = req.user!;
  const { activo } = req.body;
  if (typeof activo !== "boolean") {
    res.status(400).json({ error: "El campo activo debe ser true o false" });
    return;
  }
  const objetivo = await obtenerUsuarioParaGestion(req.params.id);
  if (!objetivo) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const fallo = errorSiNoPuedeGestionar(actor, objetivo);
  if (fallo) {
    res.status(403).json(fallo);
    return;
  }
  try {
    await cambiarEstadoUsuario(req.params.id, activo, actor.id);
    res.json({ ok: true });
    return;
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
    return;
  }
});

// Cambiar departamentos (unidades de negocio) de un usuario (multi-depto).
// Solo SUPER_ADMIN y ADMIN. Un ADMIN nunca modifica la cuenta de un SUPER_ADMIN.
usuariosRouter.patch("/:id/departamento", async (req, res) => {
  const actor = req.user!;
  const { departamentoIds } = req.body;
  if (!Array.isArray(departamentoIds)) {
    res.status(400).json({ error: "El campo departamentoIds (array) es obligatorio" });
    return;
  }
  if (!esGestionGlobal(actor.rol)) {
    res.status(403).json({ error: "Solo Super Admin y Admin pueden cambiar las unidades de negocio de un integrante." });
    return;
  }
  const objetivo = await obtenerUsuarioParaGestion(req.params.id);
  if (!objetivo) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  if (actor.rol !== "SUPER_ADMIN" && objetivo.rol === "SUPER_ADMIN") {
    res.status(403).json({ error: "Un Admin no puede modificar la cuenta de un Super Admin." });
    return;
  }
  try {
    // Reemplazar todas las asignaciones: borrar las viejas, insertar las nuevas
    await db.delete(usuarioDepartamentos).where(eq(usuarioDepartamentos.usuarioId, req.params.id));
    for (const deptoId of departamentoIds) {
      if (deptoId) {
        await db.insert(usuarioDepartamentos).values({ usuarioId: req.params.id, departamentoId: deptoId });
      }
    }
    await cambiarDepartamento(req.params.id, departamentoIds, actor.id);
    res.json({ ok: true });
    return;
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
    return;
  }
});

// Restablecer contraseña de otro usuario. Misma autorización que estado/rol: los líderes
// de equipo pueden resetear a los suyos; ADMIN a todos menos SUPER_ADMIN.
usuariosRouter.patch("/:id/password", async (req, res) => {
  const actor = req.user!;
  const { passwordNueva } = req.body;
  if (typeof passwordNueva !== "string" || passwordNueva.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    return;
  }
  const objetivo = await obtenerUsuarioParaGestion(req.params.id);
  if (!objetivo) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const fallo = errorSiNoPuedeGestionar(actor, objetivo);
  if (fallo) {
    res.status(403).json(fallo);
    return;
  }
  try {
    await restablecerPassword(req.params.id, passwordNueva, actor.id);
    res.json({ ok: true });
    return;
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
    return;
  }
});
