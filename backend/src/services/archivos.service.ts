import { eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { archivos, usuarios } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";

export async function listarArchivos(params: { entidad?: string; entidadId?: string }) {
  const condiciones = [
    params.entidad ? eq(archivos.entidad, params.entidad) : undefined,
    params.entidadId ? eq(archivos.entidadId, params.entidadId) : undefined,
  ].filter(Boolean);

  const filas = await db
    .select({
      id: archivos.id,
      nombre: archivos.nombre,
      url: archivos.url,
      tipo: archivos.tipo,
      tamanoBytes: archivos.tamanoBytes,
      entidad: archivos.entidad,
      entidadId: archivos.entidadId,
      autorId: archivos.autorId,
      autorNombre: usuarios.nombre,
      fecha: archivos.fecha,
    })
    .from(archivos)
    .innerJoin(usuarios, eq(archivos.autorId, usuarios.id))
    .where(condiciones.length ? undefined : undefined) // si no hay filtro, trae todos
    .orderBy(desc(archivos.fecha));

  // Aplicar filtro manualmente porque la condición dinámica con arrays es compleja en Drizzle
  if (condiciones.length === 0) return filas;
  return filas.filter((a) => {
    if (params.entidad && a.entidad !== params.entidad) return false;
    if (params.entidadId && a.entidadId !== params.entidadId) return false;
    return true;
  });
}

export async function crearArchivo(input: {
  nombre: string;
  url: string;
  tipo?: string;
  tamanoBytes?: number;
  entidad: string;
  entidadId: string;
}, autorId: string) {
  const id = crypto.randomUUID();

  await db.insert(archivos).values({
    id,
    nombre: input.nombre,
    url: input.url,
    tipo: (input.tipo as "imagen" | "video" | "documento" | "otro") ?? "otro",
    tamanoBytes: input.tamanoBytes ?? 0,
    entidad: input.entidad,
    entidadId: input.entidadId,
    autorId,
    fecha: new Date(),
  });

  await registrarAuditoria({
    entidad: "Archivo",
    entidadId: id,
    accion: `Archivo subido: "${input.nombre}" → ${input.entidad}`,
    autorId,
  });

  const [fila] = await db
    .select({
      id: archivos.id,
      nombre: archivos.nombre,
      url: archivos.url,
      tipo: archivos.tipo,
      tamanoBytes: archivos.tamanoBytes,
      entidad: archivos.entidad,
      entidadId: archivos.entidadId,
      autorId: archivos.autorId,
      autorNombre: usuarios.nombre,
      fecha: archivos.fecha,
    })
    .from(archivos)
    .innerJoin(usuarios, eq(archivos.autorId, usuarios.id))
    .where(eq(archivos.id, id));

  return fila;
}

export async function eliminarArchivo(id: string, autorId: string) {
  const [archivo] = await db.select().from(archivos).where(eq(archivos.id, id));
  if (!archivo) throw new Error("Archivo no encontrado");

  await db.delete(archivos).where(eq(archivos.id, id));

  await registrarAuditoria({
    entidad: "Archivo",
    entidadId: id,
    accion: `Archivo eliminado: "${archivo.nombre}"`,
    autorId,
  });

  return { ok: true };
}
