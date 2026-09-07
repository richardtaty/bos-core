// ─── 🎂 Matemática de fechas del módulo "Próximos cumpleaños" ─────────────────────
// Funciones PURAS de calendario: solo operan sobre día/mes/año sin timezone-shift. El
// negocio corre en Eastern Time (America/New_York), igual que el resto del CRM, así que
// el único punto que toca reloj es `hoyET()`. Todo lo demás compara fechas con Date.UTC
// (estable, sin horario de verano) para que una corrida cerca de la medianoche o un
// cambio de DST nunca desplace un cumpleaños un día.

/** Día con el que se festeja el 29 de febrero en años NO bisiestos (regla estándar). */
const FEB29_EN_NO_BISIESTO = 28;

export interface FechaCalendario {
  y: number;
  m: number; // 1..12
  d: number;
}

/** "Hoy" en Eastern Time como { y, m, d }. */
export function hoyET(): FechaCalendario {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const get = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? NaN);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** ¿Es año bisiesto (regla gregoriana)? */
export function esBisiesto(año: number): boolean {
  return (año % 4 === 0 && año % 100 !== 0) || año % 400 === 0;
}

/**
 * Cuántos días tiene un mes (1..12). Para validar día/mes al crear un cumpleaños. Febrero
 * se evalúa sobre un año bisiesto (2000) a propósito: así se admite el 29 y el ajuste a
 * 28 lo hace `clamp` cuando el año real no es bisiesto.
 */
export function diasEnMes(mes: number): number {
  if (mes === 2) return 29;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

/** Suma N días calendario a una fecha (para ventanas de días, p. ej. hoy + 7). */
export function sumarDiasCalendario(hoy: FechaCalendario, n: number): FechaCalendario {
  const ms = Date.UTC(hoy.y, hoy.m - 1, hoy.d) + n * 86_400_000;
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/**
 * Ajusta un (mes, día) a una fecha válida en el año dado. Regla del 29/02: en años no
 * bisiestos se festeja el 28 de febrero (constante documentada arriba). Y en general,
 * si el día se pasa del fin de mes (p. ej. 30 de febrero, o "un mes después" de un 31),
 * se recorta al último día válido del mes. Nunca devuelve una fecha inexistente, así el
 * resto del código puede confiar en `new Date.UTC(año, mes-1, día)`.
 *
 * Los días/mes que escribe el usuario ya se validan aparte (diasEnMes), así que aquí solo
 * llegan fechas derivadas de la aritmética de ventanas — nunca se "corrige" en silencio
 * un dato mal tipeado.
 */
export function clamp(mes: number, dia: number, año: number): FechaCalendario {
  const maxDia = mes === 2 ? (esBisiesto(año) ? 29 : 28) : diasEnMes(mes);
  if (dia > maxDia) {
    return { y: año, m: mes, d: maxDia };
  }
  if (mes === 2 && dia === 29 && !esBisiesto(año)) {
    return { y: año, m: 2, d: FEB29_EN_NO_BISIESTO };
  }
  return { y: año, m: mes, d: dia };
}

/** ymd: serializa una fecha de calendario como "YYYY-MM-DD" (con ceros). */
export function ymd(f: FechaCalendario): string {
  const mm = String(f.m).padStart(2, "0");
  const dd = String(f.d).padStart(2, "0");
  return `${f.y}-${mm}-${dd}`;
}

/** Milisegundos (UTC, sin DST) de una fecha de calendario — útil para restar fechas. */
function utcMs(f: FechaCalendario): number {
  return Date.UTC(f.y, f.m - 1, f.d);
}

/** Días enteros entre dos fechas (b - a). Compara a medianoche UTC, sin horas. */
export function diasEntre(a: FechaCalendario, b: FechaCalendario): number {
  return Math.round((utcMs(b) - utcMs(a)) / 86_400_000);
}

/**
 * Próxima ocurrencia de un cumpleaños (mes, día) desde "hoy": intenta este año; si ya
 * pasó (o cae hoy) usa el siguiente. Cada intento pasa por `clamp`, así un 29/02 en un
 * año no bisiesto se festeja el 28/02 y el conteo nunca salta.
 */
export function proximaOcurrencia(mes: number, dia: number, hoy: FechaCalendario): FechaCalendario {
  const esteAño = clamp(mes, dia, hoy.y);
  if (diasEntre(hoy, esteAño) >= 0) return esteAño;
  return clamp(mes, dia, hoy.y + 1);
}

/**
 * Suma N meses calendario a una fecha (para las ventanas 3→6→9→12). No es "N × 30 días":
 * 3 meses desde el 30 de noviembre debe caer en febrero (ajustado), no en marzo. Se suma
 * a la fecha "de hoy" tal cual, de modo que la ventana siempre empieza hoy.
 */
export function sumarMesesCalendario(hoy: FechaCalendario, n: number): FechaCalendario {
  const idx = hoy.y * 12 + (hoy.m - 1) + n;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return clamp(m, hoy.d, y);
}
