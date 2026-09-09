// ─── Módulo canónico de estados de TAREA (espejo del backend lib/tareas-estado.ts) ─────
// Toda vista del CRM consulta aquí para interpretar una tarea_operativa. Nada de repetir
// filtros a mano en cada página: si una tarea está "atrasada", "completada" o "produce hoy"
// se decide UNA sola vez, en este archivo (y en su espejo del backend). La tabla no tiene
// copias: una tarea es una fila de tareas_operativas; lo que cambiaba entre vistas era la
// lógica de interpretación, y eso es lo que se centraliza.
//
// Reglas innegociables (decisión del negocio):
//  • El ÚNICO estado de trabajo terminado es "completada". "aprobado"/"publicado" dejaron
//    de existir (migración 0026); si una fila vieja llegara con ellos, se tratan como
//    completada por defensa, nunca como pendiente ni atrasada.
//  • Una tarea TERMINADA jamás es "atrasada", aunque se haya terminado después de su fecha
//    límite. "Atrasada" = fecha límite (día en Florida) anterior a hoy y tarea NO terminada.
//  • "Producción del día" usa el momento real de terminación (completed_at ?? updated_at),
//    no la fecha de creación ni un estado.

export type GrupoEstado = "pendiente" | "en_revision" | "en_proceso" | "realizado" | "cancelado";

export const GRUPOS: { valor: GrupoEstado; etiqueta: string }[] = [
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "en_revision", etiqueta: "En revisión" },
  { valor: "en_proceso", etiqueta: "En proceso" },
  { valor: "realizado", etiqueta: "Realizado" },
  { valor: "cancelado", etiqueta: "Cancelado" },
];

export const GRUPO_LABEL: Record<GrupoEstado, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  en_proceso: "En proceso",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

export const GRUPO_COLOR: Record<GrupoEstado, string> = {
  pendiente: "bg-neutral-100 text-neutral-700",
  en_revision: "bg-warning-100 text-warning-700",
  en_proceso: "bg-primary-100 text-primary-700",
  realizado: "bg-success-100 text-success-700",
  cancelado: "bg-danger-100 text-danger-700",
};

/** Los 3 grupos que se consideran "activos" (aparecen por defecto). */
export const ESTADOS_ACTIVOS: GrupoEstado[] = ["pendiente", "en_revision", "en_proceso"];

/** Mapea cualquier estado interno de la BD a uno de los 5 grupos. */
export function grupoDeEstado(estado: string | null | undefined): GrupoEstado {
  switch (estado) {
    case "en_proceso":
    case "bloqueada":
      return "en_proceso";
    case "en_revision":
    case "requiere_ajustes":
      return "en_revision";
    case "completada":
    // Estados ya retirados (migración 0026): por defensa eran trabajo terminado.
    case "aprobado":
    case "publicado":
      return "realizado";
    case "cancelado":
      return "cancelado";
    // solicitud, backlog, pendiente, por_hacer y cualquier valor desconocido
    default:
      return "pendiente";
  }
}

// ─── Clasificación canónica ──────────────────────────────────────────────────

/** ¿Es una tarea cuyo trabajo terminó? Solo "completada" (defensa: también aprobado/publicado). */
export function esCompletada(estado: string | null | undefined): boolean {
  return estado === "completada" || estado === "aprobado" || estado === "publicado";
}

/** ¿Fue cancelada? */
export function esCancelada(estado: string | null | undefined): boolean {
  return estado === "cancelado";
}

/** ¿Es una tarea viva (ni terminada ni cancelada)? */
export function esActiva(estado: string | null | undefined): boolean {
  return !esCompletada(estado) && !esCancelada(estado);
}

/** "YYYY-MM-DD" (día calendario en Florida) para un instante dado. */
export function fechaET(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** "YYYY-MM-DD" de HOY en Florida (hora de negocio; el servidor corre en UTC). */
export function hoyET(): string {
  return fechaET(new Date());
}

/** Lo mínimo que necesita una tarea para clasificarla (lo que llega del backend en JSON). */
export interface TareaClasificable {
  estado?: string | null;
  fechaLimite?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
}

/**
 * ¿Está atrasada? Sí solo si es ACTIVA y el día (Florida) de su fecha límite es anterior
 * al día de hoy. Una completada o cancelada NUNCA es atrasada — aunque haya vencido.
 */
export function esAtrasada(t: TareaClasificable, ref: Date = new Date()): boolean {
  if (!esActiva(t.estado)) return false;
  if (!t.fechaLimite) return false;
  return fechaET(new Date(t.fechaLimite)) < fechaET(ref);
}

/**
 * Momento real de terminación (ISO o null): completed_at ?? updated_at de una terminada.
 * Solo las tareas TERMINADAS tienen "momento de terminación"; las activas no producen.
 */
export function momentoTerminacion(t: TareaClasificable): string | null {
  if (!esCompletada(t.estado)) return null;
  return t.completedAt ?? t.updatedAt ?? null;
}

/** ¿Se terminó HOY (día en Florida)? Base de "producción del día". */
export function esTerminadaHoy(t: TareaClasificable): boolean {
  const m = momentoTerminacion(t);
  if (!m) return false;
  return fechaET(new Date(m)) === hoyET();
}
