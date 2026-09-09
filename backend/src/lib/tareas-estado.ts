// Módulo canónico de interpretación del estado de las TAREAS OPERATIVAS.
//
// Es el ÚNICO lugar del backend que define:
//   - qué significa "terminada" (el estado `completada`),
//   - qué significa "activa" (ni terminada ni cancelada),
//   - qué significa "atrasada" (fecha límite pasada y NO terminada),
//   - en qué día calendario (hora de negocio de Florida) se terminó una tarea.
//
// Todo servicio que cuente o clasifique tareas (Tareas, Scrum, dashboards, KPIs,
// resumen ejecutivo, producción del día) DEBE usar estas funciones y no repetir
// criterios a mano — de ahí nacieron las inconsistencias (una misma tarea ya
// completada aparecía como "atrasada" según la vista que la contara).

export const ZONA_NEGOCIO = "America/New_York";

/** Estados que en versiones anteriores del CRM significaban "trabajo terminado" y
 *  que ya no existen: se migraron a `completada` (migración 0026). Se siguen
 *  reconociendo aquí solo por defensa ante filas viejas o clientes con caché. */
export const ESTADOS_OBSOLETOS_TERMINADO = ["aprobado", "publicado"] as const;

/** Corrige un estado que ya no existe: `aprobado`/`publicado` → `completada`.
 *  Devuelve el mismo estado si no hace falta tocar nada. Sirve de barrera en la
 *  escritura: aunque un cliente viejo envíe esos estados, en la BD solo se guarda
 *  `completada`. */
export function normalizarEstado(estado: string | null | undefined): string | null | undefined {
  if (estado === "aprobado" || estado === "publicado") return "completada";
  return estado;
}

/** ¿Es un estado de trabajo TERMINADO? El único estado real es `completada`; los
 *  obsoletos (`aprobado`/`publicado`) también cuentan por defensa, porque significaban
 *  exactamente eso (trabajo terminado) y una fila vieja no debe volverse "activa". */
export function esCompletada(estado: string | null | undefined): boolean {
  return estado === "completada" || estado === "aprobado" || estado === "publicado";
}

/** ¿Es una tarea cancelada? */
export function esCancelada(estado: string | null | undefined): boolean {
  return estado === "cancelado";
}

/** ¿Es una tarea ACTIVA (en curso)? Ni terminada ni cancelada. */
export function esActiva(estado: string | null | undefined): boolean {
  return !esCompletada(estado) && !esCancelada(estado);
}

// ─── Día calendario en Florida (hora de negocio) ────────────────────────────
// El servidor corre en UTC (Fly.io), pero el negocio opera en hora de Florida. Sin
// esto, una tarea terminada después de las 8pm ET "cae al día siguiente" porque en
// UTC ya cruzó la medianoche. Toda comparación de "qué día es" pasa por fechaET.

/** "YYYY-MM-DD" del día calendario en Florida para un instante dado. */
export function fechaET(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** "YYYY-MM-DD" de HOY en Florida. */
export function hoyET(): string {
  return fechaET(new Date());
}

function aDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Una tarea clasificable por estado/fechas (filas de tareas_operativas u objetos
 *  análogos; acepta fechas como Date o como string ISO). */
export interface TareaClasificable {
  estado: string | null;
  fechaLimite?: Date | string | null;
  updatedAt?: Date | string | null;
  completedAt?: Date | string | null;
}

/**
 * ¿La tarea está VENCIDA (atrasada) hoy?
 *
 * Definición única de atrasada: el DÍA (en Florida) de su fecha límite es anterior al
 * día de hoy Y la tarea NO está terminada ni cancelada. Una tarea completada — incluso
 * si se terminó después de su fecha límite — NUNCA es atrasada (regla del documento:
 * "una tarea completada nunca debe aparecer como atrasada").
 */
export function esAtrasada(tarea: TareaClasificable, ref: Date = new Date()): boolean {
  if (!esActiva(tarea.estado)) return false;
  const limite = aDate(tarea.fechaLimite);
  if (!limite) return false;
  return fechaET(limite) < fechaET(ref);
}

/**
 * Momento real de terminación de una tarea ya terminada: `completed_at` si existe
 * (lo registra el sistema al marcarla completada), si no `updated_at` como respaldo.
 * Devuelve null si la tarea no está terminada o no hay fecha que respalde.
 */
export function momentoTerminacion(tarea: TareaClasificable): Date | null {
  if (!esCompletada(tarea.estado)) return null;
  return aDate(tarea.completedAt) ?? aDate(tarea.updatedAt);
}

/** ¿La tarea se terminó HOY (día calendario en Florida)? Para "producción del día". */
export function esTerminadaHoy(tarea: TareaClasificable): boolean {
  const momento = momentoTerminacion(tarea);
  if (!momento) return false;
  return fechaET(momento) === hoyET();
}
