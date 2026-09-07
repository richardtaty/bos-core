// ─── 🎂 Ayudantes de presentación del módulo "Próximos cumpleaños" ─────────────
// Solo nombres/fechas legibles y los topes de la ventana para la UI. Espejo de
// backend/src/lib/cumpleanos-config.ts (la fuente de verdad de los números sigue
// siendo el backend; aquí SOLO se usan para el botón "Mostrar más" y etiquetas).

export const VENTANA_MESES_INICIAL = 3;
export const INCREMENTO_MESES = 3;
export const MAX_MESES = 12;

export const NOMBRES_MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function nombreMes(mes: number): string {
  return NOMBRES_MESES[mes - 1] ?? String(mes);
}

/** Formato legible de una fecha: "14 de septiembre". */
export function diaDeMes(mes: number, dia: number): string {
  return `${dia} de ${nombreMes(mes)}`;
}

/**
 * Etiqueta de cuenta regresiva de la lista: "Hoy" / "Mañana" / "Faltan N días".
 * Un cumpleaños con daysUntil negativo (hoy ya pasó) no aparece en la lista.
 */
export function etiquetaDias(daysUntil: number): string {
  if (daysUntil === 0) return "Hoy";
  if (daysUntil === 1) return "Mañana";
  return `Faltan ${daysUntil} días`;
}

export function esHoy(daysUntil: number): boolean {
  return daysUntil === 0;
}
