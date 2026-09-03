// Modelo simplificado de 5 estados para el módulo de Tareas.
// Los 12 estados internos de la base de datos se agrupan en 5 grupos visibles.
// NO se migra la base de datos: el backend conserva su flujo granular (marketing),
// solo la vista de Tareas se muestra con estos 5 estados.

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

/** Los 3 estados que se consideran "activos" (aparecen por defecto). */
export const ESTADOS_ACTIVOS: GrupoEstado[] = ["pendiente", "en_revision", "en_proceso"];

/** Mapea cualquier estado interno de la BD a uno de los 5 grupos. */
export function grupoDeEstado(estado: string): GrupoEstado {
  switch (estado) {
    case "en_proceso":
    case "bloqueada":
      return "en_proceso";
    case "en_revision":
    case "requiere_ajustes":
      return "en_revision";
    case "completada":
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
