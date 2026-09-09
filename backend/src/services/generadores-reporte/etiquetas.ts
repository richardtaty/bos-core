// Etiquetas, mapeos y tipos compartidos por los generadores del reporte de tareas.
// El módulo de Tareas muestra 5 grupos y esconde los 12 estados internos (igual que
// frontend/src/lib/estados.ts, pero del lado del servidor: el backend no puede
// importar código del frontend). Aquí vive ese espejo invertido: grupo → estados.

export type GrupoEstado = "pendiente" | "en_revision" | "en_proceso" | "realizado" | "cancelado";
export type FormatoReporte = "pdf" | "excel" | "word";

export const GRUPO_LABEL: Record<GrupoEstado, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  en_proceso: "En proceso",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

/** Los estados internos de tareas_operativas, agrupados como los ve el tablero.
 *  El único estado de trabajo terminado es "completada": "aprobado"/"publicado" dejaron
 *  de existir (migración 0026). Se dejan fuera de la lista para que el filtro "Realizado"
 *  solo consulte "completada"; grupoDeEstado y esCompletada (lib/tareas-estado.ts) siguen
 *  reconociéndolos por defensa ante una fila vieja, sin mostrarlos como estados propios. */
export const ESTADOS_POR_GRUPO: Record<GrupoEstado, string[]> = {
  en_proceso: ["en_proceso", "bloqueada"],
  en_revision: ["en_revision", "requiere_ajustes"],
  realizado: ["completada"],
  cancelado: ["cancelado"],
  // solicitud, backlog, pendiente, por_hacer y cualquier valor desconocido
  pendiente: ["solicitud", "backlog", "pendiente", "por_hacer"],
};

/** Mapea un estado interno de la BD a uno de los 5 grupos (espejo del frontend). */
export function grupoDeEstado(estado: string): GrupoEstado {
  switch (estado) {
    case "en_proceso":
    case "bloqueada":
      return "en_proceso";
    case "en_revision":
    case "requiere_ajustes":
      return "en_revision";
    case "completada":
    // Estados ya retirados (migración 0026): si aparece uno, era trabajo terminado.
    case "aprobado":
    case "publicado":
      return "realizado";
    case "cancelado":
      return "cancelado";
    default:
      return "pendiente";
  }
}

export const ESTADO_LABEL: Record<string, string> = {
  solicitud: "Solicitud",
  backlog: "Backlog",
  pendiente: "Pendiente",
  por_hacer: "Por hacer",
  en_proceso: "En proceso",
  bloqueada: "Bloqueada",
  en_revision: "En revisión",
  requiere_ajustes: "Requiere ajustes",
  completada: "Completada",
  cancelado: "Cancelado",
};

export const PRIORIDAD_LABEL: Record<string, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
};

export const ROL_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Administrador",
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  USUARIO: "Usuario",
};

/** "YYYY-MM-DD" → "DD/MM/YYYY" para mostrar en el archivo; vacío → "—". */
export function fechaCorta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Minutos → "2 h 15 min" (o "45 min"). */
export function formatearMinutos(minutos: number): string {
  const m = Math.round(minutos || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

// ─── Modelo intermedio sobre el que trabajan los 3 generadores ─────────────

export interface FilaTareaReporte {
  id: string;
  titulo: string;
  departamento: string;
  responsableId: string;
  responsableNombre: string;
  createdISO: string; // ISO completo (fecha de creación, base del agrupado cronológico del PDF)
  estado: string; // interno
  estadoLabel: string;
  grupo: GrupoEstado;
  prioridad: string; // interno
  prioridadLabel: string;
  fechaLimite: string | null; // ISO o null
  porcentajeAvance: number;
  canal: string | null;
  tipoContenido: string | null;
  tiempoInvertido: number; // minutos
  sprint: string | null;
}

export interface BloqueResponsable {
  responsableId: string;
  responsableNombre: string;
  tareas: FilaTareaReporte[];
  totalTareas: number;
  tiempoTotalMin: number;
}

export interface BloqueDepartamento {
  nombre: string;
  responsables: BloqueResponsable[];
  totalTareas: number;
  tiempoTotalMin: number;
}

/** Metadatos del encabezado común a los 3 formatos. */
export interface InfoReporte {
  por: string; // nombre de quien genera
  rol: string; // etiqueta del rol en español
  generadoEn: string; // p. ej. "04/09/2026 11:20"
  filtros: string; // línea legible con los filtros aplicados
}

export interface ReporteAgrupado {
  departamentos: BloqueDepartamento[];
  totalGeneralTareas: number;
  tiempoGeneralMin: number;
  info: InfoReporte;
}

// ─── Fechas y período (en español, para el PDF documental) ─────────────────

export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

export const MESES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
] as const;

/** ¿"YYYY-MM-DD" válido? */
export function esYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** "YYYY-MM-DD" → { anio, mes (1-12), dia }. */
export function descomponerYmd(ymd: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = ymd.split("-").map(Number);
  return { anio, mes, dia };
}

/** "2026-09-01" → "01 DE SEPTIEMBRE" (encabezado de día del PDF). */
export function diaEncabezado(ymd: string): string {
  const { dia, mes } = descomponerYmd(ymd);
  return `${String(dia).padStart(2, "0")} DE ${MESES[mes - 1].toUpperCase()}`;
}

/** Período largo para el subtítulo: "1 al 14 de septiembre de 2026". */
export function periodoLargo(desde: string, hasta: string): string {
  const a = descomponerYmd(desde);
  const b = descomponerYmd(hasta);
  if (desde === hasta) return `${a.dia} de ${MESES[a.mes - 1]} de ${a.anio}`;
  if (a.mes === b.mes && a.anio === b.anio) return `${a.dia} al ${b.dia} de ${MESES[a.mes - 1]} de ${a.anio}`;
  if (a.anio === b.anio) return `${a.dia} de ${MESES[a.mes - 1]} al ${b.dia} de ${MESES[b.mes - 1]} de ${a.anio}`;
  return `${a.dia} de ${MESES[a.mes - 1]} de ${a.anio} al ${b.dia} de ${MESES[b.mes - 1]} de ${b.anio}`;
}

/** Período corto para el pie de página: "1-14 septiembre 2026". */
export function periodoCorto(desde: string, hasta: string): string {
  const a = descomponerYmd(desde);
  const b = descomponerYmd(hasta);
  if (desde === hasta) return `${a.dia} ${MESES_CORTO[a.mes - 1]} ${a.anio}`;
  if (a.mes === b.mes && a.anio === b.anio) return `${a.dia}-${b.dia} ${MESES_CORTO[a.mes - 1]} ${a.anio}`;
  if (a.anio === b.anio) return `${a.dia} ${MESES_CORTO[a.mes - 1]}-${b.dia} ${MESES_CORTO[b.mes - 1]} ${a.anio}`;
  return `${a.dia} ${MESES_CORTO[a.mes - 1]} ${a.anio} - ${b.dia} ${MESES_CORTO[b.mes - 1]} ${b.anio}`;
}

// ─── Modelo documental del PDF (solo lo que imprime el PDF) ────────────────
// Orden: departamento → fecha (día) → responsable → viñetas de tarea.

export interface TareaPdf {
  texto: string; // título; si aporta contexto, título + descripción corta
  estado?: string; // sufijo "[...]" solo cuando el filtro es "Todos" y no está realizada
}

export interface ResponsablePdf {
  nombre: string;
  tareas: TareaPdf[];
}

export interface FechaPdf {
  titulo: string; // ya con formato "01 DE SEPTIEMBRE"
  responsables: ResponsablePdf[];
}

export interface DepartamentoPdf {
  nombre: string; // para el encabezado de jerarquía cuando hay varios departamentos
  fechas: FechaPdf[];
}

export interface DatosPdf {
  titulo: string; // "Reporte de actividades de Marketing" | "Reporte general de actividades"
  periodo: string; // largo, p. ej. "1 al 14 de septiembre de 2026"
  footer: string; // corto + alcance, p. ej. "Marketing · 1-14 septiembre 2026"
  resumen: string;
  cierre: string;
  /** true → imprimir encabezado de departamento antes de sus bloques de fecha (reporte multi-departamento). */
  porDepartamento: boolean;
  departamentos: DepartamentoPdf[];
  hayActividades: boolean;
}
