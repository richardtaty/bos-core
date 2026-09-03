import bcrypt from "bcryptjs";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/client";
import { departamentos, usuarioDepartamentos, usuarios } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";
import type { CrearUsuarioInput } from "../lib/validation";

export async function listarUsuarios(departamentoIds?: string[]) {
  const ids = departamentoIds ?? [];

  // Obtener usuarios. Si hay filtro de departamentos, buscar en la tabla M:N.
  let filas;
  if (ids.length > 0) {
    // Usuarios que pertenecen a al menos uno de los departamentos
    const usuarioIds = await db
      .selectDistinct({ usuarioId: usuarioDepartamentos.usuarioId })
      .from(usuarioDepartamentos)
      .where(inArray(usuarioDepartamentos.departamentoId, ids));
    const idsFiltrados = usuarioIds.map((r) => r.usuarioId);

    filas = idsFiltrados.length > 0
      ? await db.select().from(usuarios).where(inArray(usuarios.id, idsFiltrados))
      : [];
  } else {
    filas = await db.select().from(usuarios);
  }

  // Cargar departamentos (M:N) para cada usuario
  const todosDeptos = await db.select().from(usuarioDepartamentos);
  const deptosPorUsuario = new Map<string, string[]>();
  for (const d of todosDeptos) {
    const arr = deptosPorUsuario.get(d.usuarioId) ?? [];
    arr.push(d.departamentoId);
    deptosPorUsuario.set(d.usuarioId, arr);
  }

  return filas.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    activo: u.activo,
    departamentoId: u.departamentoId,
    departamentoIds: deptosPorUsuario.get(u.id) ?? [],
    cargo: u.cargo,
    supervisorId: u.supervisorId,
  }));
}

export async function crearUsuario(input: CrearUsuarioInput, autorId: string) {
  const [existente] = await db.select().from(usuarios).where(eq(usuarios.email, input.email));
  if (existente) throw new Error("Ya existe un usuario con ese email");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const id = crypto.randomUUID();

  await db.insert(usuarios).values({
    id,
    nombre: input.nombre,
    email: input.email,
    passwordHash,
    rol: input.rol,
    departamentoId: input.departamentoId,
    cargo: input.cargo,
    supervisorId: input.supervisorId,
    activo: true,
    createdAt: new Date(),
  });

  await registrarAuditoria({
    entidad: "Usuario",
    entidadId: id,
    accion: `Miembro de equipo creado: ${input.nombre} — ${input.cargo ?? "sin cargo"} (${input.rol})`,
    autorId,
  });

  return { id, nombre: input.nombre, email: input.email, rol: input.rol, cargo: input.cargo, departamentoId: input.departamentoId, supervisorId: input.supervisorId };
}

export async function cambiarPassword(usuarioId: string, passwordActual: string, passwordNueva: string) {
  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!usuario) throw new Error("Usuario no encontrado");

  const valido = await bcrypt.compare(passwordActual, usuario.passwordHash);
  if (!valido) throw new Error("La contraseña actual no es correcta");

  const nuevoHash = await bcrypt.hash(passwordNueva, 10);
  await db.update(usuarios).set({ passwordHash: nuevoHash }).where(eq(usuarios.id, usuarioId));

  await registrarAuditoria({
    entidad: "Usuario",
    entidadId: usuarioId,
    accion: "Contraseña actualizada por el propio usuario",
    autorId: usuarioId,
  });
}

export async function cambiarRol(usuarioId: string, nuevoRol: string, autorId: string) {
  if (nuevoRol !== "SUPER_ADMIN") {
    const superAdmins = await db.select().from(usuarios).where(eq(usuarios.rol, "SUPER_ADMIN"));
    const objetivo = superAdmins.find((u) => u.id === usuarioId);
    if (objetivo && superAdmins.length <= 1) {
      throw new Error("Debe existir al menos un Super Admin. Asigna otro Super Admin antes de cambiar este.");
    }
  }
  await db.update(usuarios).set({ rol: nuevoRol as "SUPER_ADMIN" | "ADMIN" | "SUPERVISOR" | "TEAM_LEADER" | "USUARIO" }).where(eq(usuarios.id, usuarioId));
  await registrarAuditoria({
    entidad: "Usuario",
    entidadId: usuarioId,
    accion: `Rol cambiado a ${nuevoRol}`,
    autorId,
  });
}

// "Eliminar" un usuario en realidad lo desactiva — nunca se borra de verdad porque tiene
// contactos, notas e historial ligados a su ID. Desactivado pierde acceso inmediato al login,
// pero todo su trabajo queda intacto y trazable.
export async function cambiarEstadoUsuario(usuarioId: string, activo: boolean, autorId: string) {
  if (!activo) {
    const [objetivo] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
    if (!objetivo) throw new Error("Usuario no encontrado");
    if (objetivo.rol === "SUPER_ADMIN") {
      const superAdminsActivos = await db
        .select()
        .from(usuarios)
        .where(and(eq(usuarios.rol, "SUPER_ADMIN"), eq(usuarios.activo, true)));
      if (superAdminsActivos.length <= 1) {
        throw new Error("Debe existir al menos un Super Admin activo. Asigna otro Super Admin antes de desactivar este.");
      }
    }
  }

  await db.update(usuarios).set({ activo }).where(eq(usuarios.id, usuarioId));

  await registrarAuditoria({
    entidad: "Usuario",
    entidadId: usuarioId,
    accion: activo ? "Usuario reactivado" : "Usuario desactivado",
    autorId,
  });
}

// Solo Super Admin: pone una contraseña nueva a otro usuario sin necesitar la actual —
// reemplaza el reset manual por Terminal (fly ssh console) que hacíamos antes.
export async function restablecerPassword(usuarioId: string, passwordNueva: string, autorId: string) {
  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!usuario) throw new Error("Usuario no encontrado");

  const nuevoHash = await bcrypt.hash(passwordNueva, 10);
  await db.update(usuarios).set({ passwordHash: nuevoHash }).where(eq(usuarios.id, usuarioId));

  await registrarAuditoria({
    entidad: "Usuario",
    entidadId: usuarioId,
    accion: "Contraseña restablecida por un Super Admin",
    autorId,
  });
}

// Solo Super Admin: reasigna los departamentos de un usuario (multi-depto).
// La ruta ya borró e insertó en usuario_departamentos. Aquí solo auditamos.
export async function cambiarDepartamento(usuarioId: string, departamentoIds: string[], autorId: string) {
  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!usuario) throw new Error("Usuario no encontrado");

  const deptos = departamentoIds.length > 0
    ? await db.select({ nombre: departamentos.nombre })
        .from(departamentos)
        .where(or(...departamentoIds.map((id) => eq(departamentos.id, id))))
    : [];
  const nombres = deptos.map((d) => d.nombre).join(", ") || "Sin departamento";

  await registrarAuditoria({
    entidad: "Usuario",
    entidadId: usuarioId,
    accion: `Departamentos actualizados: ${nombres}`,
    autorId,
  });
}
