import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { recursos, usuarios } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";

export async function listarRecursos(params: { cliente?: string; categoria?: string }) {
  const conds = [
    params.cliente ? eq(recursos.cliente, params.cliente) : undefined,
    params.categoria ? eq(recursos.categoria, params.categoria) : undefined,
  ].filter(Boolean);

  return db
    .select({
      id: recursos.id,
      nombre: recursos.nombre,
      url: recursos.url,
      descripcion: recursos.descripcion,
      cliente: recursos.cliente,
      categoria: recursos.categoria,
      visibleRoles: recursos.visibleRoles,
      autorId: recursos.autorId,
      autorNombre: usuarios.nombre,
      createdAt: recursos.createdAt,
      updatedAt: recursos.updatedAt,
    })
    .from(recursos)
    .innerJoin(usuarios, eq(recursos.autorId, usuarios.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(recursos.updatedAt));
}

export async function crearRecurso(input: {
  nombre: string;
  url: string;
  descripcion?: string;
  cliente?: string;
  categoria?: string;
  visibleRoles?: string;
}, autorId: string) {
  const id = crypto.randomUUID();
  const ahora = new Date();

  await db.insert(recursos).values({
    id,
    nombre: input.nombre,
    url: input.url,
    descripcion: input.descripcion,
    cliente: input.cliente,
    categoria: input.categoria,
    visibleRoles: input.visibleRoles ?? "SUPER_ADMIN,ADMIN,USUARIO",
    autorId,
    createdAt: ahora,
    updatedAt: ahora,
  });

  await registrarAuditoria({
    entidad: "Recurso",
    entidadId: id,
    accion: `Recurso creado: "${input.nombre}"`,
    autorId,
  });

  return { id, nombre: input.nombre, url: input.url };
}

export async function actualizarRecurso(id: string, input: Record<string, unknown>, autorId: string) {
  const [r] = await db.select().from(recursos).where(eq(recursos.id, id));
  if (!r) throw new Error("Recurso no encontrado");

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.nombre !== undefined) data.nombre = input.nombre;
  if (input.url !== undefined) data.url = input.url;
  if (input.descripcion !== undefined) data.descripcion = input.descripcion;
  if (input.cliente !== undefined) data.cliente = input.cliente;
  if (input.categoria !== undefined) data.categoria = input.categoria;
  if (input.visibleRoles !== undefined) data.visibleRoles = input.visibleRoles;

  await db.update(recursos).set(data).where(eq(recursos.id, id));

  await registrarAuditoria({
    entidad: "Recurso",
    entidadId: id,
    accion: `Recurso actualizado: "${input.nombre ?? r.nombre}"`,
    autorId,
  });

  return { id, ...data };
}

export async function eliminarRecurso(id: string, autorId: string) {
  const [r] = await db.select().from(recursos).where(eq(recursos.id, id));
  if (!r) throw new Error("Recurso no encontrado");

  await db.delete(recursos).where(eq(recursos.id, id));

  await registrarAuditoria({
    entidad: "Recurso",
    entidadId: id,
    accion: `Recurso eliminado: "${r.nombre}"`,
    autorId,
  });

  return { ok: true };
}
