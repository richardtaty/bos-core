// Formato de jornadas y asistencia. Todo se muestra en Eastern Time (America/New_York),
// la misma zona que usa el resto del CRM — ver lib/fechas-negocio.ts en el backend.
//
// Regla de negocio: la duración SIEMPRE sale de startedAt/endedAt. Nunca se guarda ni se
// muestra un texto suelto tipo "8 horas". Una jornada abierta no tiene duración: se muestra
// como "Abierta" (el tiempo transcurrido es solo un indicador visual, nunca un dato).

import type { EstadoCheckin, TipoSesionJornada } from "../types";

export const ZONA_NEGOCIO = "America/New_York";

export const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function nombreDia(diaSemana: number): string {
  return NOMBRES_DIA[diaSemana] ?? `Día ${diaSemana}`;
}

/** "8 h 12 min" / "45 min" / "3 h". Para el tiempo trabajado y el programado. */
export function fmtDuracion(segundos: number | null): string {
  if (segundos === null || segundos === undefined) return "—";
  const totalMinutos = Math.floor(segundos / 60);
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  if (horas === 0) return `${minutos} min`;
  if (minutos === 0) return `${horas} h`;
  return `${horas} h ${minutos} min`;
}

/** Igual que fmtDuracion pero a partir de minutos (lo programado se guarda en minutos). */
export function fmtMinutos(minutos: number | null): string {
  if (minutos === null || minutos === undefined) return "—";
  return fmtDuracion(minutos * 60);
}

/** Fecha YYYY-MM-DD y hora HH:MM del instante, vistas en Eastern Time. */
export function fechaYHoraET(iso: string): { ymd: string; hhmm: string } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const partes = Object.fromEntries(dtf.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const hora = partes.hour === "24" ? "00" : partes.hour;
  return { ymd: `${partes.year}-${partes.month}-${partes.day}`, hhmm: `${hora}:${partes.minute}` };
}

/** "9:04 AM". Se usa para las horas de inicio y salida. */
export function fmtHora12ET(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });
}

/**
 * "9 de septiembre de 2026 · 9:04 AM" — con año, para que una jornada antigua no se
 * confunda con una de este año. `fecha` es el día del negocio (YYYY-MM-DD); si se pasa
 * `iso` se usa su hora real en ET.
 */
export function fmtFechaHoraLarga(fechaYmd: string, iso?: string | null): string {
  const [y, m, d] = fechaYmd.split("-").map(Number);
  const dia = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
  const texto = dia.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const hora = iso ? fmtHora12ET(iso) : null;
  return hora && hora !== "—" ? `${texto} · ${hora}` : texto;
}

/** "miércoles, 9 de septiembre de 2026" — encabezado de grupo del historial. */
export function fmtFechaLarga(fechaYmd: string): string {
  const [y, m, d] = fechaYmd.split("-").map(Number);
  const dia = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
  return dia.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Mes actual del negocio, YYYY-MM. */
export function mesActualET(): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_NEGOCIO,
    year: "numeric",
    month: "2-digit",
  });
  const partes = Object.fromEntries(dtf.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}`;
}

/** "septiembre de 2026" a partir de YYYY-MM. */
export function etiquetaMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const dia = new Date(Date.UTC(y, (m ?? 1) - 1, 1, 12));
  return dia.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Tiempo transcurrido desde `iso` hasta ahora. SOLO para el indicador visual de una jornada
 * abierta (se refresca en pantalla); nunca se guarda ni cuenta como tiempo trabajado.
 */
export function transcurrido(iso: string, ahora: number): string {
  return fmtDuracion(Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 1000)));
}

// ─── Check-ins de actividad ─────────────────────────────────────────
// Solo informativos: un check-in sin responder NO descuenta sueldo, NO reduce horas y NO cierra
// la jornada. Nunca se etiqueta como falta ni como sanción.

/** «Respondido» / «Sin respuesta» / «Pendiente» / «Cancelado». */
export function etiquetaEstadoCheckin(estado: EstadoCheckin): string {
  switch (estado) {
    case "RESPONDIDO":
      return "Respondido";
    case "SIN_RESPUESTA":
      return "Sin respuesta";
    case "PENDIENTE":
      return "Pendiente";
    case "CANCELADO":
      return "Cancelado";
  }
}

/** «Jornada» / «Reposición de horas». */
export function etiquetaTipoSesion(tipo: TipoSesionJornada): string {
  return tipo === "REPOSICION" ? "Reposición de horas" : "Jornada";
}

/**
 * "10:18 AM Respondido · 10:19 AM" — una línea del historial de check-ins.
 * Cuando aún no hay respuesta se muestra solo la hora y el estado.
 */
export function fmtCheckin(scheduledAt: string, estado: EstadoCheckin, respondedAt: string | null): string {
  const hora = fmtHora12ET(scheduledAt);
  const etiqueta = etiquetaEstadoCheckin(estado);
  const respuesta = respondedAt ? fmtHora12ET(respondedAt) : null;
  return respuesta ? `${hora} ${etiqueta} · ${respuesta}` : `${hora} ${etiqueta}`;
}
