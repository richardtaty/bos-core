import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client";
import { marketingCalendario, proyectos, usuarios } from "../db/schema";
import type { AuthUser } from "../middleware/auth";

// ─── 📅 Calendario de Marketing (correos/contenido por proyecto) ─────────────
// Registros creados desde el Calendario de Marketing. Cada fila es una RELACIÓN a un
// proyecto real + la fecha programada; el nombre del proyecto se lee en vivo (un renombre
// en Proyectos se refleja aquí sin tocar el registro — regla 17). Fuente SEPARADA de las
// tareas de Marketing y de los cumpleaños (regla 16): nada de esto aparece en Tareas.

/** Campos que se devuelven en todo elemento (join al proyecto y al autor). */
const camposPublicacion = {
  id: marketingCalendario.id,
  proyectoId: marketingCalendario.proyectoId,
  proyectoNombre: proyectos.nombre,
  fecha: marketingCalendario.fecha,
  creadoPor: marketingCalendario.creadoPor,
  creadoPorNombre: usuarios.nombre,
  createdAt: marketingCalendario.createdAt,
  updatedAt: marketingCalendario.updatedAt,
};

/** Departamentos del usuario (la M:N, con fallback a la columna legacy). */
function departamentoIdsDe(user: AuthUser): string[] {
  return user.departamentoIds ?? (user.departamentoId ? [user.departamentoId] : []);
}

export async function listarPublicaciones(params: { desde?: string; hasta?: string }, user: AuthUser) {
  // Alcance por departamento, igual que el módulo de Proyectos: SUPER_ADMIN ve todo;
  // los demás solo los proyectos de sus departamentos. Sin departamento asignado y sin
  // ser Super Admin no hay proyectos propios → lista vacía.
  const idsDepto = user.rol === "SUPER_ADMIN" ? undefined : departamentoIdsDe(user);
  if (idsDepto && idsDepto.length === 0) return [];

  const conds = [
    params.desde ? gte(marketingCalendario.fecha, params.desde) : undefined,
    params.hasta ? lte(marketingCalendario.fecha, params.hasta) : undefined,
    idsDepto ? inArray(proyectos.departamentoId, idsDepto) : undefined,
  ].filter(Boolean);

  return db
    .select(camposPublicacion)
    .from(marketingCalendario)
    .innerJoin(proyectos, eq(marketingCalendario.proyectoId, proyectos.id))
    .innerJoin(usuarios, eq(marketingCalendario.creadoPor, usuarios.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(marketingCalendario.fecha), asc(marketingCalendario.createdAt));
}

async function obtenerPublicacion(id: string) {
  const [p] = await db
    .select(camposPublicacion)
    .from(marketingCalendario)
    .innerJoin(proyectos, eq(marketingCalendario.proyectoId, proyectos.id))
    .innerJoin(usuarios, eq(marketingCalendario.creadoPor, usuarios.id))
    .where(eq(marketingCalendario.id, id));
  return p ?? null;
}

/**
 * Crea un elemento del calendario ligado a un PROYECTO EXISTENTE. Nunca crea el
 * proyecto (regla 18): si el ID no existe, o el usuario no tiene acceso a ese proyecto,
 * responde con error claro — el alta de proyectos vive en Marketing → Proyectos.
 */
export async function crearPublicacion(
  input: { proyectoId: string; fecha: string },
  user: AuthUser,
) {
  const [proyecto] = await db
    .select({ id: proyectos.id, departamentoId: proyectos.departamentoId })
    .from(proyectos)
    .where(eq(proyectos.id, input.proyectoId));
  if (!proyecto) throw new Error("El proyecto seleccionado ya no existe.");
  if (user.rol !== "SUPER_ADMIN" && !departamentoIdsDe(user).includes(proyecto.departamentoId)) {
    throw new Error("No tienes acceso a ese proyecto.");
  }

  const id = crypto.randomUUID();
  const ahora = new Date();
  await db.insert(marketingCalendario).values({
    id,
    proyectoId: input.proyectoId,
    fecha: input.fecha,
    creadoPor: user.id,
    createdAt: ahora,
    updatedAt: ahora,
  });
  return obtenerPublicacion(id);
}

export async function eliminarPublicacion(id: string, user: AuthUser) {
  const [existente] = await db
    .select({ id: marketingCalendario.id, proyectoId: marketingCalendario.proyectoId })
    .from(marketingCalendario)
    .where(eq(marketingCalendario.id, id));
  if (!existente) throw new Error("El elemento del calendario ya no existe.");

  // Fuera del área del usuario no se borra: el registro pertenece a un proyecto de otro
  // departamento (o el usuario no tiene departamento). SUPER_ADMIN siempre puede.
  if (user.rol !== "SUPER_ADMIN") {
    const [proyecto] = await db
      .select({ departamentoId: proyectos.departamentoId })
      .from(proyectos)
      .where(eq(proyectos.id, existente.proyectoId));
    if (!proyecto || !departamentoIdsDe(user).includes(proyecto.departamentoId)) {
      throw new Error("No tienes acceso a ese elemento del calendario.");
    }
  }

  await db.delete(marketingCalendario).where(eq(marketingCalendario.id, id));
}
