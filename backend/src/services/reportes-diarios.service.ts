import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { reportesDiarios, usuarios, equipos, equipoMiembros, departamentos } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";

export type EstadoReporte = "no_iniciado" | "en_elaboracion" | "enviado" | "revisado" | "requiere_correccion" | "aprobado";

export interface CrearReporteInput {
  tareasAsignadas?: string;
  tareasCompletadas?: string;
  tareasPendientes?: string;
  tiempoUtilizado?: string;
  enlaces?: string;
  dificultades?: string;
  necesitaRevision?: string;
  apoyoRequerido?: string;
  observaciones?: string;
}

const REPORTE_COLUMNS = {
  id: reportesDiarios.id,
  usuarioId: reportesDiarios.usuarioId,
  usuarioNombre: usuarios.nombre,
  fecha: reportesDiarios.fecha,
  tareasAsignadas: reportesDiarios.tareasAsignadas,
  tareasCompletadas: reportesDiarios.tareasCompletadas,
  tareasPendientes: reportesDiarios.tareasPendientes,
  tiempoUtilizado: reportesDiarios.tiempoUtilizado,
  enlaces: reportesDiarios.enlaces,
  dificultades: reportesDiarios.dificultades,
  necesitaRevision: reportesDiarios.necesitaRevision,
  apoyoRequerido: reportesDiarios.apoyoRequerido,
  observaciones: reportesDiarios.observaciones,
  estado: reportesDiarios.estado,
  revisadoPor: reportesDiarios.revisadoPor,
  createdAt: reportesDiarios.createdAt,
  updatedAt: reportesDiarios.updatedAt,
};

function fechaHoyET(): string {
  // Fecha de hoy en Eastern Time (UTC-4/5)
  const ahora = new Date();
  const et = new Date(ahora.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return et.toISOString().split("T")[0];
}

export async function obtenerReporte(id: string) {
  const [r] = await db
    .select(REPORTE_COLUMNS)
    .from(reportesDiarios)
    .innerJoin(usuarios, eq(reportesDiarios.usuarioId, usuarios.id))
    .where(eq(reportesDiarios.id, id));
  return r ?? null;
}

export async function reporteDelDia(usuarioId: string) {
  const fecha = fechaHoyET();
  const [existente] = await db
    .select(REPORTE_COLUMNS)
    .from(reportesDiarios)
    .innerJoin(usuarios, eq(reportesDiarios.usuarioId, usuarios.id))
    .where(and(eq(reportesDiarios.usuarioId, usuarioId), eq(reportesDiarios.fecha, fecha)));

  if (existente) return existente;

  // Auto-crear si no existe
  const id = crypto.randomUUID();
  const ahora = new Date();
  await db.insert(reportesDiarios).values({
    id,
    usuarioId,
    fecha,
    estado: "no_iniciado",
    createdAt: ahora,
    updatedAt: ahora,
  });

  return obtenerReporte(id);
}

export async function listarReportes(params: {
  usuarioId?: string;
  fecha?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
}) {
  const conds = [
    params.usuarioId ? eq(reportesDiarios.usuarioId, params.usuarioId) : undefined,
    params.fecha ? eq(reportesDiarios.fecha, params.fecha) : undefined,
    params.estado ? eq(reportesDiarios.estado, params.estado as any) : undefined,
  ].filter(Boolean);

  return db
    .select(REPORTE_COLUMNS)
    .from(reportesDiarios)
    .innerJoin(usuarios, eq(reportesDiarios.usuarioId, usuarios.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(reportesDiarios.fecha));
}

export async function actualizarReporte(id: string, input: CrearReporteInput & { estado?: EstadoReporte }, autorId: string) {
  const [r] = await db.select().from(reportesDiarios).where(eq(reportesDiarios.id, id));
  if (!r) throw new Error("Reporte no encontrado");
  if (r.usuarioId !== autorId) throw new Error("Solo el autor puede editar su reporte");

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.tareasAsignadas !== undefined) data.tareasAsignadas = input.tareasAsignadas;
  if (input.tareasCompletadas !== undefined) data.tareasCompletadas = input.tareasCompletadas;
  if (input.tareasPendientes !== undefined) data.tareasPendientes = input.tareasPendientes;
  if (input.tiempoUtilizado !== undefined) data.tiempoUtilizado = input.tiempoUtilizado;
  if (input.enlaces !== undefined) data.enlaces = input.enlaces;
  if (input.dificultades !== undefined) data.dificultades = input.dificultades;
  if (input.necesitaRevision !== undefined) data.necesitaRevision = input.necesitaRevision;
  if (input.apoyoRequerido !== undefined) data.apoyoRequerido = input.apoyoRequerido;
  if (input.observaciones !== undefined) data.observaciones = input.observaciones;
  if (input.estado !== undefined) data.estado = input.estado;

  await db.update(reportesDiarios).set(data).where(eq(reportesDiarios.id, id));

  await registrarAuditoria({
    entidad: "ReporteDiario",
    entidadId: id,
    accion: `Reporte actualizado → estado: ${input.estado ?? r.estado}`,
    autorId,
  });

  return obtenerReporte(id);
}

export async function enviarReporte(id: string, autorId: string) {
  return actualizarReporte(id, { estado: "enviado" }, autorId);
}

export async function revisarReporte(id: string, decision: "revisado" | "requiere_correccion" | "aprobado", revisorId: string) {
  const [r] = await db.select().from(reportesDiarios).where(eq(reportesDiarios.id, id));
  if (!r) throw new Error("Reporte no encontrado");

  await db.update(reportesDiarios)
    .set({
      estado: decision,
      revisadoPor: revisorId,
      updatedAt: new Date(),
    })
    .where(eq(reportesDiarios.id, id));

  await registrarAuditoria({
    entidad: "ReporteDiario",
    entidadId: id,
    accion: `Reporte ${decision} por líder`,
    autorId: revisorId,
  });

  return obtenerReporte(id);
}

export async function panelLider(fecha?: string) {
  const fechaConsulta = fecha ?? fechaHoyET();

  // Obtener el departamento de Marketing
  const [depto] = await db
    .select()
    .from(departamentos)
    .where(eq(departamentos.nombre, "Marketing"));

  if (!depto) return { miembros: [], reportes: [], resumen: { entregados: 0, pendientes: 0, total: 0 } };

  // Miembros del equipo de Marketing
  const miembros = await db
    .select({
      usuarioId: equipoMiembros.usuarioId,
      nombre: usuarios.nombre,
      cargo: equipoMiembros.cargo,
    })
    .from(equipoMiembros)
    .innerJoin(equipos, eq(equipoMiembros.equipoId, equipos.id))
    .innerJoin(usuarios, eq(equipoMiembros.usuarioId, usuarios.id))
    .where(eq(equipos.departamentoId, depto.id));

  // Reportes del día
  const reportes = await db
    .select(REPORTE_COLUMNS)
    .from(reportesDiarios)
    .innerJoin(usuarios, eq(reportesDiarios.usuarioId, usuarios.id))
    .where(eq(reportesDiarios.fecha, fechaConsulta));

  const entregados = reportes.filter((r) => r.estado === "enviado" || r.estado === "revisado" || r.estado === "aprobado").length;
  const pendientes = miembros.length - entregados;

  return {
    miembros,
    reportes,
    resumen: {
      entregados,
      pendientes,
      total: miembros.length,
    },
  };
}

export async function resumenSemanal(params: {
  usuarioId?: string;
  desde: string;
  hasta: string;
}) {
  const conds = [
    params.usuarioId ? eq(reportesDiarios.usuarioId, params.usuarioId) : undefined,
    eq(reportesDiarios.fecha, params.desde), // Simplificado: solo desde/hasta se usa para ordenar
  ].filter(Boolean);

  const reportes = await db
    .select(REPORTE_COLUMNS)
    .from(reportesDiarios)
    .innerJoin(usuarios, eq(reportesDiarios.usuarioId, usuarios.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(reportesDiarios.fecha));

  const enviados = reportes.filter((r) => r.estado !== "no_iniciado" && r.estado !== "en_elaboracion").length;
  const aprobados = reportes.filter((r) => r.estado === "aprobado").length;

  return { reportes, total: reportes.length, enviados, aprobados };
}
