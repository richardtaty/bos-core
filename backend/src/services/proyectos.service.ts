import { eq, desc, and } from "drizzle-orm";
import { db } from "../db/client";
import { proyectos, proyectoComentarios, usuarios, departamentos, tareasOperativas } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";

export async function listarProyectos(params: { departamentoId?: string; responsableId?: string; estado?: string }) {
  const conds = [
    params.departamentoId ? eq(proyectos.departamentoId, params.departamentoId) : undefined,
    params.responsableId ? eq(proyectos.responsableId, params.responsableId) : undefined,
    params.estado ? eq(proyectos.estado, params.estado as "activo" | "en_proceso" | "completado" | "en_revision" | "cancelado" | "en_pausa") : undefined,
  ].filter(Boolean);

  return db
    .select({
      id: proyectos.id,
      nombre: proyectos.nombre,
      objetivo: proyectos.objetivo,
      cliente: proyectos.cliente,
      responsableId: proyectos.responsableId,
      responsableNombre: usuarios.nombre,
      departamentoId: proyectos.departamentoId,
      departamentoNombre: departamentos.nombre,
      fechaInicio: proyectos.fechaInicio,
      fechaEntrega: proyectos.fechaEntrega,
      prioridad: proyectos.prioridad,
      estado: proyectos.estado,
      activo: proyectos.activo,
      createdAt: proyectos.createdAt,
      updatedAt: proyectos.updatedAt,
    })
    .from(proyectos)
    .innerJoin(usuarios, eq(proyectos.responsableId, usuarios.id))
    .innerJoin(departamentos, eq(proyectos.departamentoId, departamentos.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(proyectos.updatedAt));
}

export async function obtenerProyecto(id: string) {
  const [p] = await db
    .select({
      id: proyectos.id,
      nombre: proyectos.nombre,
      objetivo: proyectos.objetivo,
      cliente: proyectos.cliente,
      responsableId: proyectos.responsableId,
      responsableNombre: usuarios.nombre,
      departamentoId: proyectos.departamentoId,
      departamentoNombre: departamentos.nombre,
      fechaInicio: proyectos.fechaInicio,
      fechaEntrega: proyectos.fechaEntrega,
      prioridad: proyectos.prioridad,
      estado: proyectos.estado,
      activo: proyectos.activo,
      createdAt: proyectos.createdAt,
      updatedAt: proyectos.updatedAt,
    })
    .from(proyectos)
    .innerJoin(usuarios, eq(proyectos.responsableId, usuarios.id))
    .innerJoin(departamentos, eq(proyectos.departamentoId, departamentos.id))
    .where(eq(proyectos.id, id));

  if (!p) return null;

  const tareas = await db
    .select()
    .from(tareasOperativas)
    .where(eq(tareasOperativas.proyectoId, id))
    .orderBy(desc(tareasOperativas.updatedAt));

  const comentarios = await db
    .select({
      id: proyectoComentarios.id,
      autorId: proyectoComentarios.autorId,
      autorNombre: usuarios.nombre,
      texto: proyectoComentarios.texto,
      fecha: proyectoComentarios.fecha,
    })
    .from(proyectoComentarios)
    .innerJoin(usuarios, eq(proyectoComentarios.autorId, usuarios.id))
    .where(eq(proyectoComentarios.proyectoId, id))
    .orderBy(proyectoComentarios.fecha);

  return { ...p, tareas, comentarios };
}

export async function crearProyecto(input: {
  nombre: string;
  objetivo?: string;
  cliente?: string;
  responsableId: string;
  departamentoId: string;
  fechaInicio?: string;
  fechaEntrega?: string;
  prioridad?: string;
}, autorId: string) {
  const id = crypto.randomUUID();
  const ahora = new Date();

  await db.insert(proyectos).values({
    id,
    nombre: input.nombre,
    objetivo: input.objetivo,
    cliente: input.cliente,
    responsableId: input.responsableId,
    departamentoId: input.departamentoId,
    fechaInicio: input.fechaInicio ? new Date(input.fechaInicio) : undefined,
    fechaEntrega: input.fechaEntrega ? new Date(input.fechaEntrega) : undefined,
    prioridad: (input.prioridad || "media") as "baja" | "media" | "alta" | "urgente",
    estado: "activo",
    activo: true,
    createdAt: ahora,
    updatedAt: ahora,
  });

  await registrarAuditoria({
    entidad: "Proyecto",
    entidadId: id,
    accion: `Proyecto creado: "${input.nombre}"`,
    autorId,
  });

  return obtenerProyecto(id);
}

export async function actualizarProyecto(id: string, input: Record<string, unknown>, autorId: string) {
  const [p] = await db.select().from(proyectos).where(eq(proyectos.id, id));
  if (!p) throw new Error("Proyecto no encontrado");

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.nombre !== undefined) data.nombre = input.nombre;
  if (input.objetivo !== undefined) data.objetivo = input.objetivo;
  if (input.cliente !== undefined) data.cliente = input.cliente;
  if (input.responsableId !== undefined) data.responsableId = input.responsableId;
  if (input.fechaInicio !== undefined) data.fechaInicio = input.fechaInicio ? new Date(input.fechaInicio as string) : null;
  if (input.fechaEntrega !== undefined) data.fechaEntrega = input.fechaEntrega ? new Date(input.fechaEntrega as string) : null;
  if (input.prioridad !== undefined) data.prioridad = input.prioridad;
  if (input.estado !== undefined) data.estado = input.estado;

  await db.update(proyectos).set(data).where(eq(proyectos.id, id));
  await registrarAuditoria({ entidad: "Proyecto", entidadId: id, accion: `Proyecto actualizado: "${input.nombre ?? p.nombre}"`, autorId });
  return obtenerProyecto(id);
}

export async function cambiarActivoProyecto(id: string, activo: boolean, autorId: string) {
  const [p] = await db.select().from(proyectos).where(eq(proyectos.id, id));
  if (!p) throw new Error("Proyecto no encontrado");

  await db.update(proyectos).set({ activo, updatedAt: new Date() }).where(eq(proyectos.id, id));
  await registrarAuditoria({
    entidad: "Proyecto",
    entidadId: id,
    accion: activo ? `Proyecto reactivado: "${p.nombre}"` : `Proyecto desactivado: "${p.nombre}"`,
    autorId,
  });
  return obtenerProyecto(id);
}

export async function agregarComentarioProyecto(proyectoId: string, texto: string, autorId: string) {
  const id = crypto.randomUUID();
  await db.insert(proyectoComentarios).values({ id, proyectoId, autorId, texto, fecha: new Date() });
  const [c] = await db
    .select({ id: proyectoComentarios.id, autorId: proyectoComentarios.autorId, autorNombre: usuarios.nombre, texto: proyectoComentarios.texto, fecha: proyectoComentarios.fecha })
    .from(proyectoComentarios)
    .innerJoin(usuarios, eq(proyectoComentarios.autorId, usuarios.id))
    .where(eq(proyectoComentarios.id, id));
  return c;
}
