import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../db/client";
import { bitacoraAuditoria, usuarios, tareasOperativas } from "../db/schema";
import { esActiva, esAtrasada } from "../lib/tareas-estado";
import { AREA_DEV } from "./tareas.service";

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

// Dashboard ejecutivo: resumen rápido de todo.
// La clasificación pasa por el módulo canónico (lib/tareas-estado.ts): "pendientes" aquí
// son las tareas ACTIVAS (ni terminadas ni canceladas) y "vencidas" son las de fecha
// límite pasada y NO terminadas — una tarea ya completada nunca cuenta como vencida.
// Antes solo se contaba el estado literal "pendiente" y se metían tareas del módulo DEV.
export async function resumenEjecutivo() {
  const todas = await db
    .select()
    .from(tareasOperativas)
    .where(ne(tareasOperativas.departamento, AREA_DEV));

  return {
    tareasPendientes: todas.filter((t) => esActiva(t.estado)).length,
    tareasVencidas: todas.filter((t) => esAtrasada(t)).length,
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
