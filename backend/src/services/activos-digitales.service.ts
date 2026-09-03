import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { activosDigitales, personas } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";
import type { ActivoDigitalInput } from "../lib/validation";

// Quien gestiona los activos digitales de una ficha es quien puede editar sus datos:
// el responsable asignado o un ADMIN/SUPER_ADMIN. El backend lo protege igual que
// actualizarDatosPersona — no es solo una ocultación en la UI.
export class SinPermisoActivoError extends Error {}

type Actor = { id: string; rol: string };

async function validarMutacion(personaId: string, actor: Actor) {
  const [persona] = await db
    .select({ responsableId: personas.responsableId, nombre: personas.nombre })
    .from(personas)
    .where(eq(personas.id, personaId));

  if (!persona) throw new Error("Persona no encontrada");

  const esAdmin = actor.rol === "ADMIN" || actor.rol === "SUPER_ADMIN";
  if (!esAdmin && persona.responsableId !== actor.id) {
    throw new SinPermisoActivoError("Solo el responsable de la ficha o un administrador puede gestionar los activos digitales");
  }
}

async function obtenerActivo(personaId: string, activoId: string) {
  const [activo] = await db
    .select()
    .from(activosDigitales)
    .where(and(eq(activosDigitales.id, activoId), eq(activosDigitales.personaId, personaId)));
  return activo;
}

export async function listarActivosDigitales(personaId: string) {
  // Valida que la persona exista; una persona inexistente no es "lista vacía", es un 404.
  const [persona] = await db.select({ id: personas.id }).from(personas).where(eq(personas.id, personaId));
  if (!persona) throw new Error("Persona no encontrada");

  // Activos primero; dentro de cada grupo el más reciente primero.
  return db
    .select()
    .from(activosDigitales)
    .where(eq(activosDigitales.personaId, personaId))
    .orderBy(desc(activosDigitales.activo), desc(activosDigitales.createdAt));
}

export async function crearActivoDigital(personaId: string, input: ActivoDigitalInput, autorId: string, rol: string) {
  await validarMutacion(personaId, { id: autorId, rol });

  const id = crypto.randomUUID();
  const ahora = new Date();

  await db.insert(activosDigitales).values({
    id,
    personaId,
    nombre: input.nombre,
    url: input.url ?? null,
    tipo: input.tipo,
    plataforma: input.plataforma ?? null,
    objetivo: input.objetivo ?? null,
    activo: input.activo ?? true,
    notas: input.notas ?? null,
    autorId,
    createdAt: ahora,
    updatedAt: ahora,
  });

  await registrarAuditoria({
    entidad: "Activo digital",
    entidadId: id,
    accion: `Activo digital creado: "${input.nombre}" (${input.tipo})`,
    autorId,
  });

  const activo = await obtenerActivo(personaId, id);
  if (!activo) throw new Error("No se pudo crear el activo digital");
  return activo;
}

export async function actualizarActivoDigital(
  personaId: string,
  activoId: string,
  input: ActivoDigitalInput,
  autorId: string,
  rol: string
) {
  await validarMutacion(personaId, { id: autorId, rol });

  const previo = await obtenerActivo(personaId, activoId);
  if (!previo) throw new Error("Activo digital no encontrado");

  await db
    .update(activosDigitales)
    .set({
      nombre: input.nombre,
      url: input.url ?? null,
      tipo: input.tipo,
      plataforma: input.plataforma ?? null,
      objetivo: input.objetivo ?? null,
      activo: input.activo ?? previo.activo,
      notas: input.notas ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(activosDigitales.id, activoId), eq(activosDigitales.personaId, personaId)));

  await registrarAuditoria({
    entidad: "Activo digital",
    entidadId: activoId,
    accion: `Activo digital actualizado: "${input.nombre}"`,
    autorId,
  });

  const activo = await obtenerActivo(personaId, activoId);
  if (!activo) throw new Error("Activo digital no encontrado");
  return activo;
}

export async function eliminarActivoDigital(personaId: string, activoId: string, autorId: string, rol: string) {
  await validarMutacion(personaId, { id: autorId, rol });

  const previo = await obtenerActivo(personaId, activoId);
  if (!previo) throw new Error("Activo digital no encontrado");

  await db
    .delete(activosDigitales)
    .where(and(eq(activosDigitales.id, activoId), eq(activosDigitales.personaId, personaId)));

  await registrarAuditoria({
    entidad: "Activo digital",
    entidadId: activoId,
    accion: `Activo digital eliminado: "${previo.nombre}"`,
    autorId,
  });

  return { ok: true };
}
