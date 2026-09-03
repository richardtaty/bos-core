import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { crearUsuarioSchema, cambiarPasswordSchema } from "../lib/validation";
import { listarUsuarios, crearUsuario, cambiarPassword, cambiarRol, cambiarEstadoUsuario, restablecerPassword, cambiarDepartamento } from "../services/usuarios.service";
import { db } from "../db/client";
import { usuarioDepartamentos } from "../db/schema";
import { eq } from "drizzle-orm";

export const usuariosRouter = Router();
usuariosRouter.use(requireAuth);

// Todos los usuarios autenticados ven la lista completa para permitir
// la asignación de tareas entre departamentos.
usuariosRouter.get("/", async (_req, res) => {
  res.json(await listarUsuarios());
});

// Crear usuario: ADMIN puede crear solo USUARIO para su propio departamento.
// SUPER_ADMIN puede crear cualquier rol en cualquier departamento.
usuariosRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = crearUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const creador = req.user!;
  const esSuperAdmin = creador.rol === "SUPER_ADMIN";

  // Un ADMIN que no es SUPER_ADMIN puede nombrar gente de su propio equipo: USUARIO,
  // TEAM_LEADER y SUPERVISOR. No puede crear ADMIN ni SUPER_ADMIN.
  // No hay escalación: más abajo se fuerza el departamento del creador, y estos dos roles
  // solo mandan sobre las tareas de ese mismo departamento — territorio que el ADMIN ya
  // controlaba de todos modos.
  const ROLES_QUE_UN_ADMIN_PUEDE_CREAR = ["USUARIO", "TEAM_LEADER", "SUPERVISOR"];
  if (!esSuperAdmin && !ROLES_QUE_UN_ADMIN_PUEDE_CREAR.includes(parsed.data.rol)) {
    res.status(403).json({ error: "Solo Super Admin puede crear usuarios con rol ADMIN o SUPER_ADMIN. Los líderes de departamento pueden crear Usuario, Team Leader y Supervisor dentro de su propio departamento." });
    return;
  }

  // Un ADMIN hereda el departamento del creador. Cada líder solo puede
  // crear usuarios en su propia unidad de negocio.
  if (!esSuperAdmin) {
    if (!creador.departamentoId) {
      res.status(403).json({ error: "No tienes un departamento asignado. Solo puedes agregar miembros si lideras un departamento." });
      return;
    }
    // Forzar el departamento del creador y supervisor = creador
    parsed.data.departamentoId = creador.departamentoId;
    parsed.data.supervisorId = creador.id;
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

usuariosRouter.patch("/:id/rol", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { rol } = req.body;
  if (!["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "TEAM_LEADER", "USUARIO"].includes(rol)) {
    res.status(400).json({ error: "Rol inválido" });
    return;
  }
  try {
    await cambiarRol(req.params.id, rol, req.user!.id);
    res.json({ ok: true });
    return;
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
    return;
  }
});

usuariosRouter.patch("/:id/estado", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== "boolean") {
    res.status(400).json({ error: "El campo activo debe ser true o false" });
    return;
  }
  try {
    await cambiarEstadoUsuario(req.params.id, activo, req.user!.id);
    res.json({ ok: true });
    return;
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
    return;
  }
});

// Solo SUPER_ADMIN puede cambiar los departamentos de un usuario (multi-depto)
usuariosRouter.patch("/:id/departamento", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { departamentoIds } = req.body;
  if (!Array.isArray(departamentoIds)) {
    res.status(400).json({ error: "El campo departamentoIds (array) es obligatorio" });
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
    await cambiarDepartamento(req.params.id, departamentoIds, req.user!.id);
    res.json({ ok: true });
    return;
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
    return;
  }
});

usuariosRouter.patch("/:id/password", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { passwordNueva } = req.body;
  if (typeof passwordNueva !== "string" || passwordNueva.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    return;
  }
  try {
    await restablecerPassword(req.params.id, passwordNueva, req.user!.id);
    res.json({ ok: true });
    return;
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
    return;
  }
});
