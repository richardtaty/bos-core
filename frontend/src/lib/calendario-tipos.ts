import type { TipoRegistroCalendario } from "../types";

// Tipos estructurados de los registros del Calendario (SALA DE OFERTAS → Calendario).
// El valor se guarda tal cual en la base (nunca se deduce por el texto) y aquí solo
// vive su etiqueta para mostrar y los colores de cada uno.
export const TIPOS_REGISTRO_CALENDARIO: { valor: TipoRegistroCalendario; etiqueta: string }[] = [
  { valor: "alerta", etiqueta: "Alerta" },
  { valor: "recordatorio", etiqueta: "Recordatorio" },
  { valor: "seguimiento", etiqueta: "Seguimiento" },
];

export function etiquetaTipoRegistro(tipo?: string | null): string {
  return TIPOS_REGISTRO_CALENDARIO.find((t) => t.valor === tipo)?.etiqueta ?? "Seguimiento";
}

/** Chip pequeño que acompaña al nombre del cliente en las tarjetas del resumen. */
export function claseChipTipoRegistro(tipo?: string | null): string {
  switch (tipo) {
    case "alerta":
      return "bg-danger-50 text-danger-700 border-danger-200";
    case "recordatorio":
      return "bg-warning-50 text-warning-800 border-warning-300";
    case "seguimiento":
      return "bg-primary-50 text-primary-700 border-primary-200";
    default:
      return "bg-neutral-100 text-neutral-600 border-neutral-200";
  }
}
