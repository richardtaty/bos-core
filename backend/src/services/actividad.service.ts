import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { bitacoraAuditoria, usuarios, tareasOperativas } from "../db/schema";

// Timeline global: toda la actividad de la empresa en orden cronológico inverso.
// Si se pasa departamentoId, filtra solo eventos donde el autor pertenece a ese depto.
export async function timelineGlobal(limite = 100, departamentoId?: string) {
  const condiciones = [
    departamentoId ? eq(usuarios.departamentoId, departamentoId) : undefined,
  ].filter(Boolean);

  const auditoria = await db
    .select({
      id: bitacoraAuditoria.id,
      tipo: bitacoraAuditoria.entidad,
      accion: bitacoraAuditoria.accion,
      autorId: bitacoraAuditoria.autorId,
      autorNombre: usuarios.nombre,
      entidad: bitacoraAuditoria.entidad,
      entidadId: bitacoraAuditoria.entidadId,
      fecha: bitacoraAuditoria.fecha,
    })
    .from(bitacoraAuditoria)
    .innerJoin(usuarios, eq(bitacoraAuditoria.autorId, usuarios.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(bitacoraAuditoria.fecha))
    .limit(limite);

  return auditoria.map((a) => ({
    ...a,
    detalle: a.accion,
    categoria: mapearCategoria(a.entidad),
  }));
}

// Actividad filtrada por usuario
export async function actividadPorUsuario(usuarioId: string, limite = 50) {
  const auditoria = await db
    .select({
      id: bitacoraAuditoria.id,
      tipo: bitacoraAuditoria.entidad,
      accion: bitacoraAuditoria.accion,
      autorId: bitacoraAuditoria.autorId,
      autorNombre: usuarios.nombre,
      entidad: bitacoraAuditoria.entidad,
      entidadId: bitacoraAuditoria.entidadId,
      fecha: bitacoraAuditoria.fecha,
    })
    .from(bitacoraAuditoria)
    .innerJoin(usuarios, eq(bitacoraAuditoria.autorId, usuarios.id))
    .where(eq(bitacoraAuditoria.autorId, usuarioId))
    .orderBy(desc(bitacoraAuditoria.fecha))
    .limit(limite);

  return auditoria.map((a) => ({
    ...a,
    detalle: a.accion,
    categoria: mapearCategoria(a.entidad),
  }));
}

// Dashboard ejecutivo: resumen rápido de todo
export async function resumenEjecutivo() {
  const [tareasPendientes, tareasVencidas] = await Promise.all([
    db.select().from(tareasOperativas).where(
      eq(tareasOperativas.estado, "pendiente")
    ),
    (async () => {
      const todas = await db.select().from(tareasOperativas).where(
        eq(tareasOperativas.estado, "pendiente")
      );
      return todas.filter((t) => t.fechaLimite && t.fechaLimite < new Date());
    })(),
  ]);

  return {
    tareasPendientes: tareasPendientes.length,
    tareasVencidas: tareasVencidas.length,
  };
}

function mapearCategoria(entidad: string): string {
  const mapa: Record<string, string> = {
    Persona: "CRM",
    Interaccion: "CRM",
    TareaSeguimiento: "Seguimiento",
    Registro: "Pipeline",
    Pago: "Facturación",
    TareaOperativa: "Tareas",
    Archivo: "Archivos",
    Usuario: "Equipo",
    Pipeline: "Configuración",
  };
  return mapa[entidad] ?? entidad;
}
