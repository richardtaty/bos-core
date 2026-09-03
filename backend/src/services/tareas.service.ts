import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { tareasOperativas, tareaChecklist, tareaComentarios, solicitudesExtension, usuarios } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";
import { nombreDepartamentoDe } from "../middleware/auth";
import type { AuthUser, Rol } from "../middleware/auth";

/** Convierte una fecha YYYY-MM-DD en un Date al mediodía UTC, evitando que
 *  el offset de zona horaria (ej. UTC-4 en ET) la desplace al día anterior. */
function fechaNoon(ymd: string): Date {
  return new Date(ymd + "T12:00:00");
}

export type EstadoTarea =
  | "solicitud" | "backlog" | "pendiente" | "por_hacer"
  | "en_proceso" | "bloqueada" | "en_revision" | "requiere_ajustes"
  | "completada" | "aprobado" | "publicado" | "cancelado";

export type Prioridad = "baja" | "media" | "alta" | "urgente";

export type TipoTarea =
  | "diseno_grafico" | "video" | "pagina_web"
  | "email_marketing" | "automatizacion" | "redes_sociales"
  | "publicidad" | "reporte_analisis" | "revision" | "administracion";

export interface CrearTareaInput {
  titulo: string;
  descripcion?: string;
  responsableId: string;
  departamento?: string;
  prioridad?: Prioridad;
  fechaInicio?: string;
  fechaLimite?: string;
  aprobadorId?: string;
  proyectoId?: string;
  canal?: string;
  tipoContenido?: string;
  fechaPublicacion?: string;
  subtareaDe?: string;
  // ─── Marketing v2 ──────────────────────────
  tipoTarea?: TipoTarea;
  tiempoEstimado?: number;
  solicitanteId?: string;
  criteriosTerminado?: string;
  sprint?: string;
}

export interface ActualizarTareaInput {
  titulo?: string;
  descripcion?: string;
  responsableId?: string;
  departamento?: string;
  prioridad?: Prioridad;
  fechaInicio?: string | null;
  fechaLimite?: string | null;
  estado?: EstadoTarea;
  aprobadorId?: string | null;
  proyectoId?: string | null;
  porcentajeAvance?: number;
  canal?: string | null;
  tipoContenido?: string | null;
  fechaPublicacion?: string | null;
  tiempoInvertido?: number;
  // ─── Marketing v2 ──────────────────────────
  tipoTarea?: TipoTarea | null;
  tiempoEstimado?: number;
  solicitanteId?: string | null;
  criteriosTerminado?: string | null;
  sprint?: string | null;
  bloqueoMotivo?: string | null;
  bloqueoDependeDe?: string | null;
  resultadoFinal?: string | null;
}

const TAREA_COLUMNS = {
  id: tareasOperativas.id,
  titulo: tareasOperativas.titulo,
  descripcion: tareasOperativas.descripcion,
  responsableId: tareasOperativas.responsableId,
  responsableNombre: usuarios.nombre,
  departamento: tareasOperativas.departamento,
  prioridad: tareasOperativas.prioridad,
  fechaInicio: tareasOperativas.fechaInicio,
  fechaLimite: tareasOperativas.fechaLimite,
  estado: tareasOperativas.estado,
  aprobadorId: tareasOperativas.aprobadorId,
  proyectoId: tareasOperativas.proyectoId,
  porcentajeAvance: tareasOperativas.porcentajeAvance,
  canal: tareasOperativas.canal,
  tipoContenido: tareasOperativas.tipoContenido,
  fechaPublicacion: tareasOperativas.fechaPublicacion,
  subtareaDe: tareasOperativas.subtareaDe,
  tiempoInvertido: tareasOperativas.tiempoInvertido,
  // ─── Marketing v2 ──────────────────────────
  tipoTarea: tareasOperativas.tipoTarea,
  tiempoEstimado: tareasOperativas.tiempoEstimado,
  solicitanteId: tareasOperativas.solicitanteId,
  asignadoPorId: tareasOperativas.asignadoPorId,
  criteriosTerminado: tareasOperativas.criteriosTerminado,
  bloqueoMotivo: tareasOperativas.bloqueoMotivo,
  bloqueoDependeDe: tareasOperativas.bloqueoDependeDe,
  bloqueoDesde: tareasOperativas.bloqueoDesde,
  fechaLimiteOriginal: tareasOperativas.fechaLimiteOriginal,
  sprint: tareasOperativas.sprint,
  resultadoFinal: tareasOperativas.resultadoFinal,
  createdAt: tareasOperativas.createdAt,
  updatedAt: tareasOperativas.updatedAt,
};

// ─── Permisos sobre una tarea ─────────────────────────────
//
// Antes de esto el módulo no tenía ninguna verificación: cualquiera con sesión podía
// editar, reasignar y cambiar de estado cualquier tarea de cualquier departamento.

/** El autor no tiene permiso sobre esta tarea. Clase propia para que la ruta pueda
 *  responder 403 en vez del 400 genérico. Mismo patrón que SinPermisoError en personas. */
export class SinPermisoTareaError extends Error {}

/** Roles con mando sobre el trabajo de otros. Son los que pueden delegar y aprobar. */
export function esRolDeMando(rol: Rol): boolean {
  return rol === "SUPER_ADMIN" || rol === "ADMIN" || rol === "SUPERVISOR" || rol === "TEAM_LEADER";
}

/** Los departamentos del usuario, resueltos a nombre (la tarea guarda el nombre, no el id). */
async function departamentosDe(user: AuthUser): Promise<string[]> {
  const ids = user.departamentoIds ?? (user.departamentoId ? [user.departamentoId] : []);
  const nombres: string[] = [];
  for (const id of ids) {
    const nombre = await nombreDepartamentoDe(id);
    if (nombre) nombres.push(nombre);
  }
  return nombres;
}

type TareaParaPermiso = {
  departamento: string;
  responsableId: string;
  asignadoPorId?: string | null;
  solicitanteId?: string | null;
  aprobadorId?: string | null;
};

/**
 * ¿Puede este usuario ver y gestionar esta tarea (editar, mover de estado, bloquear)?
 *
 * El punto 2 es la garantía que se pidió: quien delega una tarea NO la pierde. Reasignarla
 * no lo saca — sigue viéndola, editándola y moviéndola de estado. Y va ANTES que la regla
 * de departamento a propósito, para que la garantía se sostenga aunque la tarea termine
 * en otra área.
 */
export async function puedeGestionarTarea(user: AuthUser, tarea: TareaParaPermiso): Promise<boolean> {
  // 1. El dueño del sistema pasa siempre.
  if (user.rol === "SUPER_ADMIN") return true;

  // 2. Relación directa con la tarea: la ejecuta, LA ASIGNÓ, la pidió o la aprueba.
  if (
    tarea.responsableId === user.id ||
    tarea.asignadoPorId === user.id ||
    tarea.solicitanteId === user.id ||
    tarea.aprobadorId === user.id
  ) {
    return true;
  }

  // 3. Su departamento. Cubre tanto a los roles de mando sobre su área como al compañero
  //    de equipo que mueve una tarjeta ajena en el Kanban compartido — cerrar eso rompería
  //    la operación diaria del tablero.
  return (await departamentosDe(user)).includes(tarea.departamento);
}

/** Igual que puedeGestionarTarea pero lanza. Para usar al inicio de cada escritura. */
async function asegurarPuedeGestionar(user: AuthUser, tarea: TareaParaPermiso): Promise<void> {
  if (!(await puedeGestionarTarea(user, tarea))) {
    throw new SinPermisoTareaError("No tienes permiso sobre esta tarea. Pertenece a otro departamento y no participas en ella.");
  }
}

/**
 * Delegar (cambiar el responsable) es más restrictivo que editar: exige rol de mando, o
 * ser quien ya la había asignado. Sin esto, cualquier compañero de departamento podría
 * pasarle el trabajo a otro, que es justo el descontrol que se quería resolver.
 */
async function asegurarPuedeDelegar(user: AuthUser, tarea: TareaParaPermiso): Promise<void> {
  await asegurarPuedeGestionar(user, tarea);
  if (esRolDeMando(user.rol) || tarea.asignadoPorId === user.id) return;
  throw new SinPermisoTareaError("Solo un Team Leader, Supervisor o Admin puede reasignar una tarea a otra persona.");
}

export async function listarTareas(params: {
  responsableId?: string;
  departamento?: string;
  estado?: EstadoTarea;
  prioridad?: Prioridad;
  proyectoId?: string;
  canal?: string;
}) {
  const condiciones = [
    params.responsableId ? eq(tareasOperativas.responsableId, params.responsableId) : undefined,
    params.departamento ? eq(tareasOperativas.departamento, params.departamento) : undefined,
    params.estado ? eq(tareasOperativas.estado, params.estado) : undefined,
    params.prioridad ? eq(tareasOperativas.prioridad, params.prioridad) : undefined,
    params.proyectoId ? eq(tareasOperativas.proyectoId, params.proyectoId) : undefined,
    params.canal ? eq(tareasOperativas.canal, params.canal) : undefined,
  ].filter(Boolean);

  return db
    .select(TAREA_COLUMNS)
    .from(tareasOperativas)
    .innerJoin(usuarios, eq(tareasOperativas.responsableId, usuarios.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(tareasOperativas.updatedAt));
}

export async function obtenerTarea(id: string) {
  const [tarea] = await db
    .select(TAREA_COLUMNS)
    .from(tareasOperativas)
    .innerJoin(usuarios, eq(tareasOperativas.responsableId, usuarios.id))
    .where(eq(tareasOperativas.id, id));

  if (!tarea) return null;

  const checklist = await db
    .select()
    .from(tareaChecklist)
    .where(eq(tareaChecklist.tareaId, id))
    .orderBy(tareaChecklist.orden);

  const comentarios = await db
    .select({
      id: tareaComentarios.id,
      autorId: tareaComentarios.autorId,
      autorNombre: usuarios.nombre,
      texto: tareaComentarios.texto,
      fecha: tareaComentarios.fecha,
    })
    .from(tareaComentarios)
    .innerJoin(usuarios, eq(tareaComentarios.autorId, usuarios.id))
    .where(eq(tareaComentarios.tareaId, id))
    .orderBy(tareaComentarios.fecha);

  // Subtareas
  const subtareas = await db
    .select(TAREA_COLUMNS)
    .from(tareasOperativas)
    .innerJoin(usuarios, eq(tareasOperativas.responsableId, usuarios.id))
    .where(eq(tareasOperativas.subtareaDe, id))
    .orderBy(desc(tareasOperativas.createdAt));

  return { ...tarea, checklist, comentarios, subtareas };
}

export async function crearTarea(input: CrearTareaInput, autor: AuthUser) {
  const id = crypto.randomUUID();
  const ahora = new Date();
  const autorId = autor.id;

  await db.insert(tareasOperativas).values({
    id,
    titulo: input.titulo,
    descripcion: input.descripcion,
    responsableId: input.responsableId,
    departamento: input.departamento ?? "Marketing",
    prioridad: input.prioridad ?? "media",
    fechaInicio: input.fechaInicio ? fechaNoon(input.fechaInicio) : undefined,
    fechaLimite: input.fechaLimite ? fechaNoon(input.fechaLimite) : undefined,
    aprobadorId: input.aprobadorId,
    proyectoId: input.proyectoId,
    canal: input.canal,
    tipoContenido: input.tipoContenido,
    fechaPublicacion: input.fechaPublicacion ? fechaNoon(input.fechaPublicacion) : undefined,
    subtareaDe: input.subtareaDe,
    // ─── Marketing v2 ──────────────────────────
    tipoTarea: input.tipoTarea,
    tiempoEstimado: input.tiempoEstimado ?? 0,
    solicitanteId: input.solicitanteId,
    // Quien crea la tarea es quien la delega. Queda grabado desde el minuto uno para que
    // no pueda perder el acceso más adelante, aunque la reasigne.
    asignadoPorId: autorId,
    criteriosTerminado: input.criteriosTerminado,
    sprint: input.sprint,
    estado: "pendiente",
    createdAt: ahora,
    updatedAt: ahora,
  });

  await registrarAuditoria({
    entidad: "TareaOperativa",
    entidadId: id,
    accion: `Tarea creada: "${input.titulo}" — ${input.departamento ?? "Marketing"}${input.canal ? ` | Canal: ${input.canal}` : ""}`,
    autorId,
  });

  return obtenerTarea(id);
}

export async function actualizarTarea(id: string, input: ActualizarTareaInput, autor: AuthUser) {
  const [tarea] = await db.select().from(tareasOperativas).where(eq(tareasOperativas.id, id));
  if (!tarea) throw new Error("Tarea no encontrada");

  const autorId = autor.id;
  await asegurarPuedeGestionar(autor, tarea);

  // Cambiar el responsable por esta vía es delegar igual que usar /reasignar, así que
  // pide el mismo permiso. Si no se cerrara aquí, el gate de /reasignar sería decorativo.
  const estaDelegando = input.responsableId !== undefined && input.responsableId !== tarea.responsableId;
  if (estaDelegando) await asegurarPuedeDelegar(autor, tarea);

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.titulo !== undefined) data.titulo = input.titulo;
  if (input.descripcion !== undefined) data.descripcion = input.descripcion;
  if (input.responsableId !== undefined) data.responsableId = input.responsableId;
  // Quien delega queda grabado como asignador y conserva el control de la tarea.
  if (estaDelegando) data.asignadoPorId = autorId;
  if (input.departamento !== undefined) data.departamento = input.departamento;
  if (input.prioridad !== undefined) data.prioridad = input.prioridad;
  if (input.fechaInicio !== undefined) data.fechaInicio = input.fechaInicio ? fechaNoon(input.fechaInicio) : null;
  if (input.fechaLimite !== undefined) data.fechaLimite = input.fechaLimite ? fechaNoon(input.fechaLimite) : null;
  if (input.estado !== undefined) data.estado = input.estado;
  if (input.aprobadorId !== undefined) data.aprobadorId = input.aprobadorId;
  if (input.proyectoId !== undefined) data.proyectoId = input.proyectoId;
  if (input.porcentajeAvance !== undefined) data.porcentajeAvance = input.porcentajeAvance;
  if (input.canal !== undefined) data.canal = input.canal;
  if (input.tipoContenido !== undefined) data.tipoContenido = input.tipoContenido;
  if (input.fechaPublicacion !== undefined) data.fechaPublicacion = input.fechaPublicacion ? fechaNoon(input.fechaPublicacion) : null;
  if (input.tipoTarea !== undefined) data.tipoTarea = input.tipoTarea;
  if (input.tiempoEstimado !== undefined) data.tiempoEstimado = input.tiempoEstimado;
  if (input.solicitanteId !== undefined) data.solicitanteId = input.solicitanteId;
  if (input.criteriosTerminado !== undefined) data.criteriosTerminado = input.criteriosTerminado;
  if (input.sprint !== undefined) data.sprint = input.sprint;
  if (input.bloqueoMotivo !== undefined) data.bloqueoMotivo = input.bloqueoMotivo;
  if (input.bloqueoDependeDe !== undefined) data.bloqueoDependeDe = input.bloqueoDependeDe;
  if (input.resultadoFinal !== undefined) data.resultadoFinal = input.resultadoFinal;

  await db.update(tareasOperativas).set(data).where(eq(tareasOperativas.id, id));

  const cambios = input.responsableId && input.responsableId !== tarea.responsableId ? " (reasignada)" : "";
  await registrarAuditoria({
    entidad: "TareaOperativa",
    entidadId: id,
    accion: `Tarea actualizada: "${input.titulo ?? tarea.titulo}" → estado: ${input.estado ?? tarea.estado}${cambios}`,
    autorId,
  });

  return obtenerTarea(id);
}

// ─── Reasignación ─────────────────────────────────────────

export async function reasignarTarea(id: string, nuevoResponsableId: string, autor: AuthUser) {
  const [tarea] = await db.select().from(tareasOperativas).where(eq(tareasOperativas.id, id));
  if (!tarea) throw new Error("Tarea no encontrada");

  const autorId = autor.id;
  await asegurarPuedeDelegar(autor, tarea);

  // `asignadoPorId` se reescribe con quien delega ahora. La tarea puede cambiar de manos
  // muchas veces; el que conserva el control es siempre el último que la delegó.
  await db.update(tareasOperativas)
    .set({ responsableId: nuevoResponsableId, asignadoPorId: autorId, updatedAt: new Date() })
    .where(eq(tareasOperativas.id, id));

  await registrarAuditoria({
    entidad: "TareaOperativa",
    entidadId: id,
    accion: `Tarea reasignada: "${tarea.titulo}" → nuevo responsable`,
    autorId,
  });

  return obtenerTarea(id);
}

// ─── Registro de tiempo ───────────────────────────────────

export async function registrarTiempo(id: string, minutos: number, _autorId: string) {
  const [tarea] = await db.select().from(tareasOperativas).where(eq(tareasOperativas.id, id));
  if (!tarea) throw new Error("Tarea no encontrada");

  const nuevoTiempo = (tarea.tiempoInvertido ?? 0) + minutos;
  await db.update(tareasOperativas)
    .set({ tiempoInvertido: nuevoTiempo, updatedAt: new Date() })
    .where(eq(tareasOperativas.id, id));

  return { tareaId: id, tiempoInvertido: nuevoTiempo, minutosAgregados: minutos };
}

// ─── Calendario Editorial ─────────────────────────────────

export async function calendarioEditorial(params: {
  canal?: string;
  desde?: string;
  hasta?: string;
  responsableId?: string;
}) {
  const conds = [
    params.canal ? eq(tareasOperativas.canal, params.canal) : undefined,
    params.responsableId ? eq(tareasOperativas.responsableId, params.responsableId) : undefined,
    params.desde ? gte(tareasOperativas.fechaPublicacion, new Date(params.desde)) : undefined,
    params.hasta ? lte(tareasOperativas.fechaPublicacion, new Date(params.hasta)) : undefined,
  ].filter(Boolean);

  return db
    .select(TAREA_COLUMNS)
    .from(tareasOperativas)
    .innerJoin(usuarios, eq(tareasOperativas.responsableId, usuarios.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(tareasOperativas.fechaPublicacion ?? desc(tareasOperativas.updatedAt));
}

// ─── Checklist (sin cambios) ──────────────────────────────

export async function agregarChecklistItem(tareaId: string, texto: string) {
  const id = crypto.randomUUID();
  const [ultimo] = await db
    .select({ orden: tareaChecklist.orden })
    .from(tareaChecklist)
    .where(eq(tareaChecklist.tareaId, tareaId))
    .orderBy(tareaChecklist.orden)
    .limit(1);
  const orden = (ultimo?.orden ?? -1) + 1;
  await db.insert(tareaChecklist).values({ id, tareaId, texto, orden, completado: false });
  return { id, tareaId, texto, completado: false, orden };
}

export async function toggleChecklistItem(itemId: string, completado: boolean) {
  await db.update(tareaChecklist).set({ completado }).where(eq(tareaChecklist.id, itemId));
  return { ok: true };
}

export async function eliminarChecklistItem(itemId: string) {
  await db.delete(tareaChecklist).where(eq(tareaChecklist.id, itemId));
  return { ok: true };
}

// ─── Comentarios ──────────────────────────────────────────

export async function agregarComentario(tareaId: string, texto: string, autorId: string) {
  const id = crypto.randomUUID();
  await db.insert(tareaComentarios).values({ id, tareaId, autorId, texto, fecha: new Date() });
  await registrarAuditoria({
    entidad: "TareaOperativa",
    entidadId: tareaId,
    accion: "Comentario agregado en tarea",
    autorId,
  });
  const [comentario] = await db
    .select({
      id: tareaComentarios.id,
      autorId: tareaComentarios.autorId,
      autorNombre: usuarios.nombre,
      texto: tareaComentarios.texto,
      fecha: tareaComentarios.fecha,
    })
    .from(tareaComentarios)
    .innerJoin(usuarios, eq(tareaComentarios.autorId, usuarios.id))
    .where(eq(tareaComentarios.id, id));
  return comentario;
}

// ─── KPIs ─────────────────────────────────────────────────

export async function kpiUsuario(usuarioId: string) {
  const misTareas = await db.select().from(tareasOperativas).where(eq(tareasOperativas.responsableId, usuarioId));
  const total = misTareas.length;
  const completadas = misTareas.filter((t) => ["aprobado", "publicado", "completada"].includes(t.estado)).length;
  const enProgreso = misTareas.filter((t) => t.estado === "en_proceso").length;
  const enRevision = misTareas.filter((t) => t.estado === "en_revision").length;
  const atrasadas = misTareas.filter((t) => {
    if (!t.fechaLimite) return false;
    return t.fechaLimite < new Date() && !["aprobado", "publicado", "completada", "cancelado"].includes(t.estado);
  }).length;
  const bloqueadas = misTareas.filter((t) => t.estado === "bloqueada").length;
  const tiempoTotal = misTareas.reduce((s, t) => s + (t.tiempoInvertido ?? 0), 0);
  const publicadas = misTareas.filter((t) => t.estado === "publicado").length;
  return { total, completadas, enProgreso, enRevision, atrasadas, bloqueadas, tiempoTotal, publicadas };
}

// ─── Marketing v2: Bloqueos ─────────────────────────────

export async function bloquearTarea(id: string, motivo: string, dependeDe: string | undefined, autor: AuthUser) {
  const [tarea] = await db.select().from(tareasOperativas).where(eq(tareasOperativas.id, id));
  if (!tarea) throw new Error("Tarea no encontrada");

  const autorId = autor.id;
  await asegurarPuedeGestionar(autor, tarea);

  await db.update(tareasOperativas)
    .set({
      estado: "bloqueada",
      bloqueoMotivo: motivo,
      bloqueoDependeDe: dependeDe ?? null,
      bloqueoDesde: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tareasOperativas.id, id));

  await registrarAuditoria({
    entidad: "TareaOperativa",
    entidadId: id,
    accion: `Tarea bloqueada: "${tarea.titulo}" — ${motivo}`,
    autorId,
  });

  return obtenerTarea(id);
}

export async function desbloquearTarea(id: string, autor: AuthUser) {
  const [tarea] = await db.select().from(tareasOperativas).where(eq(tareasOperativas.id, id));
  if (!tarea) throw new Error("Tarea no encontrada");

  const autorId = autor.id;
  await asegurarPuedeGestionar(autor, tarea);

  await db.update(tareasOperativas)
    .set({
      estado: "en_proceso",
      bloqueoMotivo: null,
      bloqueoDependeDe: null,
      bloqueoDesde: null,
      updatedAt: new Date(),
    })
    .where(eq(tareasOperativas.id, id));

  await registrarAuditoria({
    entidad: "TareaOperativa",
    entidadId: id,
    accion: `Tarea desbloqueada: "${tarea.titulo}"`,
    autorId,
  });

  return obtenerTarea(id);
}

// ─── Marketing v2: Solicitudes de extensión ────────────

export async function solicitarExtension(input: {
  tareaId: string;
  motivo: string;
  porcentajeCompletado: number;
  tiempoAdicionalMinutos: number;
  nuevaFecha: string;
  dificultad?: string;
}, autorId: string) {
  const [tarea] = await db.select().from(tareasOperativas).where(eq(tareasOperativas.id, input.tareaId));
  if (!tarea) throw new Error("Tarea no encontrada");

  const id = crypto.randomUUID();
  const ahora = new Date();

  await db.insert(solicitudesExtension).values({
    id,
    tareaId: input.tareaId,
    solicitanteId: autorId,
    motivo: input.motivo,
    porcentajeCompletado: input.porcentajeCompletado,
    tiempoAdicionalMinutos: input.tiempoAdicionalMinutos,
    nuevaFecha: new Date(input.nuevaFecha),
    dificultad: input.dificultad,
    estado: "pendiente",
    createdAt: ahora,
    updatedAt: ahora,
  });

  await registrarAuditoria({
    entidad: "TareaOperativa",
    entidadId: input.tareaId,
    accion: `Solicitud de extensión: "${tarea.titulo}" — nueva fecha: ${input.nuevaFecha}`,
    autorId,
  });

  return { id, tareaId: input.tareaId, estado: "pendiente" };
}

export async function resolverExtension(
  id: string,
  aprobada: boolean,
  autorizador: AuthUser,
) {
  const [sol] = await db.select().from(solicitudesExtension).where(eq(solicitudesExtension.id, id));
  if (!sol) throw new Error("Solicitud no encontrada");

  const autorizadorId = autorizador.id;

  // Aprobar una prórroga es una decisión de jefe, no de par: mueve la fecha límite de un
  // compromiso. Antes lo podía hacer cualquiera con sesión — incluida la propia persona
  // que la pidió, que es como no tener control ninguno sobre lo que se delega.
  const [tareaDeLaSolicitud] = await db.select().from(tareasOperativas).where(eq(tareasOperativas.id, sol.tareaId));
  if (!tareaDeLaSolicitud) throw new Error("Tarea no encontrada");
  await asegurarPuedeGestionar(autorizador, tareaDeLaSolicitud);

  if (sol.solicitanteId === autorizadorId) {
    throw new SinPermisoTareaError("No puedes aprobar tu propia solicitud de extensión. Debe resolverla quien te asignó la tarea o un superior.");
  }
  if (!esRolDeMando(autorizador.rol) && tareaDeLaSolicitud.asignadoPorId !== autorizadorId) {
    throw new SinPermisoTareaError("Solo un Team Leader, Supervisor o Admin — o quien asignó la tarea — puede resolver una solicitud de extensión.");
  }

  const nuevoEstado = aprobada ? "aprobada" : "rechazada";
  await db.update(solicitudesExtension)
    .set({ estado: nuevoEstado, autorizadorId, updatedAt: new Date() })
    .where(eq(solicitudesExtension.id, id));

  if (aprobada && sol.nuevaFecha) {
    const [tarea] = await db.select().from(tareasOperativas).where(eq(tareasOperativas.id, sol.tareaId));
    await db.update(tareasOperativas)
      .set({
        fechaLimiteOriginal: tarea?.fechaLimite ?? undefined,
        fechaLimite: sol.nuevaFecha,
        updatedAt: new Date(),
      })
      .where(eq(tareasOperativas.id, sol.tareaId));
  }

  await registrarAuditoria({
    entidad: "SolicitudExtension",
    entidadId: id,
    accion: `Extensión ${nuevoEstado} para tarea ${sol.tareaId}`,
    autorId: autorizadorId,
  });

  return { id, estado: nuevoEstado };
}

export async function listarSolicitudesExtension(params: {
  tareaId?: string;
  estado?: string;
}) {
  const conds = [
    params.tareaId ? eq(solicitudesExtension.tareaId, params.tareaId) : undefined,
    params.estado ? eq(solicitudesExtension.estado, params.estado as any) : undefined,
  ].filter(Boolean);

  return db
    .select({
      id: solicitudesExtension.id,
      tareaId: solicitudesExtension.tareaId,
      solicitanteId: solicitudesExtension.solicitanteId,
      solicitanteNombre: usuarios.nombre,
      motivo: solicitudesExtension.motivo,
      porcentajeCompletado: solicitudesExtension.porcentajeCompletado,
      tiempoAdicionalMinutos: solicitudesExtension.tiempoAdicionalMinutos,
      nuevaFecha: solicitudesExtension.nuevaFecha,
      dificultad: solicitudesExtension.dificultad,
      estado: solicitudesExtension.estado,
      autorizadorId: solicitudesExtension.autorizadorId,
      createdAt: solicitudesExtension.createdAt,
      updatedAt: solicitudesExtension.updatedAt,
    })
    .from(solicitudesExtension)
    .innerJoin(usuarios, eq(solicitudesExtension.solicitanteId, usuarios.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(solicitudesExtension.createdAt));
}
