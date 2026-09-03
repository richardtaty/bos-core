import { db } from "../db/client";
import { bitacoraAuditoria } from "../db/schema";

interface RegistrarAuditoriaInput {
  entidad: string;
  entidadId: string;
  accion: string;
  autorId: string;
  detalle?: string;
  personaId?: string;
}

// Único punto de escritura hacia bitacora_auditoria en todo el backend.
// Nunca se expone un endpoint de UPDATE/DELETE sobre esta tabla — es append-only por diseño.
export async function registrarAuditoria(input: RegistrarAuditoriaInput): Promise<void> {
  await db.insert(bitacoraAuditoria).values({
    id: crypto.randomUUID(),
    entidad: input.entidad,
    entidadId: input.entidadId,
    accion: input.accion,
    autorId: input.autorId,
    detalle: input.detalle,
    personaId: input.personaId,
    fecha: new Date(),
  });
}
