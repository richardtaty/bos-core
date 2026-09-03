import { eq, and, gte, lte, asc } from "drizzle-orm";
import { db } from "../db/client";
import { podcastCitas, personas, usuarios } from "../db/schema";

// Campos que se devuelven en toda cita (join a persona → invitado y a usuario → autor).
const camposCita = {
  id: podcastCitas.id,
  personaId: podcastCitas.personaId,
  invitado: personas.nombre,
  fecha: podcastCitas.fecha,
  hora: podcastCitas.hora,
  estado: podcastCitas.estado,
  nota: podcastCitas.nota,
  creadoPor: podcastCitas.creadoPor,
  creadoPorNombre: usuarios.nombre,
  createdAt: podcastCitas.createdAt,
  updatedAt: podcastCitas.updatedAt,
};

export async function listarCitas(params: { desde?: string; hasta?: string } = {}) {
  const conds = [
    params.desde ? gte(podcastCitas.fecha, params.desde) : undefined,
    params.hasta ? lte(podcastCitas.fecha, params.hasta) : undefined,
  ].filter(Boolean);

  return db
    .select(camposCita)
    .from(podcastCitas)
    .innerJoin(personas, eq(podcastCitas.personaId, personas.id))
    .innerJoin(usuarios, eq(podcastCitas.creadoPor, usuarios.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(podcastCitas.fecha), asc(podcastCitas.hora));
}

export async function obtenerCita(id: string) {
  const [c] = await db
    .select(camposCita)
    .from(podcastCitas)
    .innerJoin(personas, eq(podcastCitas.personaId, personas.id))
    .innerJoin(usuarios, eq(podcastCitas.creadoPor, usuarios.id))
    .where(eq(podcastCitas.id, id));
  return c ?? null;
}

export async function crearCita(
  input: { personaId: string; fecha: string; hora: string; estado?: string; nota?: string },
  creadoPor: string
) {
  const id = crypto.randomUUID();
  const ahora = new Date();
  await db.insert(podcastCitas).values({
    id,
    personaId: input.personaId,
    fecha: input.fecha,
    hora: input.hora,
    estado: (input.estado || "agendado") as "agendado" | "realizado" | "cancelado",
    nota: input.nota,
    creadoPor,
    createdAt: ahora,
    updatedAt: ahora,
  });
  return obtenerCita(id);
}

export async function actualizarCita(id: string, input: Record<string, unknown>) {
  const [c] = await db.select().from(podcastCitas).where(eq(podcastCitas.id, id));
  if (!c) throw new Error("Cita no encontrada");

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.personaId !== undefined) data.personaId = input.personaId;
  if (input.fecha !== undefined) data.fecha = input.fecha;
  if (input.hora !== undefined) data.hora = input.hora;
  if (input.estado !== undefined) data.estado = input.estado;
  if (input.nota !== undefined) data.nota = input.nota;

  await db.update(podcastCitas).set(data).where(eq(podcastCitas.id, id));
  return obtenerCita(id);
}

export async function eliminarCita(id: string) {
  await db.delete(podcastCitas).where(eq(podcastCitas.id, id));
}
