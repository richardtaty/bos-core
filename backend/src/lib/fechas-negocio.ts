// ─── Fechas y horas del negocio (Florida) ───────────────────────
//
// El servidor corre en UTC (Fly.io), pero el negocio opera en hora de Florida. Todo lo que
// signifique "¿qué día es?" o "¿en qué mes cae esto?" DEBE pasar por aquí: si no, una
// jornada que empieza después de las 8pm ET cae al día siguiente porque en UTC ya cruzó la
// medianoche, y los totales mensuales se corren de mes.
//
// Este archivo es el hogar canónico de la zona y de los formateadores. `tareas-estado.ts`
// los reexporta, así que el criterio sigue siendo ÚNICO en todo el backend — no se repite
// la lógica en cada módulo.
//
// Se separó de tareas-estado.ts para que Recursos Humanos no dependa del módulo de Tareas.

export const ZONA_NEGOCIO = "America/New_York";

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

/** "YYYY-MM" del mes calendario en Florida para un instante dado. */
export function mesET(d: Date): string {
  return fechaET(d).slice(0, 7);
}

/** "YYYY-MM" del mes en curso. */
export function mesActualET(): string {
  return mesET(new Date());
}

/** ¿Es un "YYYY-MM" bien formado? */
export function esMesValido(mes: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

/**
 * ¿Es una fecha "YYYY-MM-DD" que EXISTE en el calendario?
 * No basta con el formato: "2026-02-30" lo cumple y no es un día real. Se comprueba dando la
 * vuelta la fecha, para que un 30 de febrero no se cuele como vigencia ni como filtro.
 */
export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia, 12));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Día de la semana (0 = domingo … 6 = sábado) de una fecha "YYYY-MM-DD".
 * Se interpreta a mediodía UTC para que el día de la semana no baile según la zona de
 * quien ejecute el código: la fecha ya viene como día calendario del negocio.
 */
export function diaSemanaDeYmd(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

/**
 * Todos los días "YYYY-MM-DD" del mes indicado, en orden.
 * Puro cálculo de calendario: se construyen con UTC y se devuelven como texto, sin
 * convertirlos a horas locales (evita el clásico "el día 1 se vuelve el 31 del mes previo").
 */
export function diasDelMes(mes: string): string[] {
  const [anio, m] = mes.split("-").map(Number);
  const total = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  const dias: string[] = [];
  for (let dia = 1; dia <= total; dia++) {
    dias.push(`${mes}-${String(dia).padStart(2, "0")}`);
  }
  return dias;
}

/** "HH:MM" → minutos desde la medianoche. null si el formato no es válido. */
export function minutosDeHHMM(hhmm: string | null | undefined): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Duración en minutos entre dos horas "HH:MM" del mismo día.
 * Si la hora final es anterior o igual a la inicial se asume que la jornada cruza la
 * medianoche (turno de noche: 22:00 → 06:00 = 8 h). Devuelve null si alguna hora es inválida.
 */
export function minutosEntreHHMM(inicio: string | null | undefined, fin: string | null | undefined): number | null {
  const desde = minutosDeHHMM(inicio);
  const hasta = minutosDeHHMM(fin);
  if (desde === null || hasta === null) return null;
  const bruto = hasta - desde;
  return bruto > 0 ? bruto : bruto + 24 * 60;
}
