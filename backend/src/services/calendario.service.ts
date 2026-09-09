import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { personas, tareasSeguimiento } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";
import type { CrearRegistroCalendarioInput } from "../lib/validation";

// Etiquetas legibles de cada tipo estructurado del Calendario.
export const ETIQUETA_TIPO_REGISTRO: Record<string, string> = {
  alerta: "Alerta",
  recordatorio: "Recordatorio",
  seguimiento: "Seguimiento",
};

/** El cliente elegido no existe (o fue borrado) — la ruta responde 404. */
export class ClienteNoEncontradoError extends Error {}

/**
 * Crea un registro del Calendario (alerta / recordatorio / seguimiento) ligado a un cliente real.
 *
 * Un único INSERT en `tareas_seguimiento`: la misma tabla que alimenta el resumen
 * ATRASADAS / PARA HOY / PRÓXIMAS y la ficha del cliente. Por eso el registro aparece solo
 * y de inmediato en el grupo correcto. NO crea tareas del módulo Tareas (otra tabla) y NO
 * inventa responsables: el responsable visible es el del cliente (personas.responsable_id),
 * igual que los seguimientos que ya agenda el CRM.
 */
export async function crearRegistroCalendario(input: CrearRegistroCalendarioInput, autorId: string) {
  const [cliente] = await db
    .select({ id: personas.id })
    .from(personas)
    .where(eq(personas.id, input.personaId));
  if (!cliente) throw new ClienteNoEncontradoError("Cliente no encontrado");

  const id = crypto.randomUUID();
  const fecha = new Date(input.fecha);
  const etiqueta = ETIQUETA_TIPO_REGISTRO[input.tipo] ?? input.tipo;

  await db.insert(tareasSeguimiento).values({
    id,
    personaId: cliente.id,
    fecha,
    tipo: input.tipo,
    titulo: input.titulo,
    nota: input.nota || null,
    autorId,
    createdAt: new Date(),
  });

  await registrarAuditoria({
    entidad: "TareaSeguimiento",
    entidadId: id,
    accion: `${etiqueta} creado desde el Calendario: ${input.titulo} (fecha ${fecha.toISOString()})`,
    autorId,
    personaId: cliente.id,
  });

  return { ok: true as const, id };
}
