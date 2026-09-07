// ─── 🎂 Configuración central del módulo "Próximos cumpleaños" ───────────────────
// ÚNICA fuente de verdad para los números y nombres que gobiernan el módulo. Si mañana
// el aviso debe ser de 5 días en vez de 7, o la ventana inicial de 4 meses, se cambia
// aquí y todo el backend+frontend lo toma — jamás hardcodear estos valores en servicios,
// rutas o componentes. Los nombres de unidad se comparan por NOMBRE (como ya hace
// requireDepartamento), no por ID.

/** Cuántos días antes del cumpleaños se genera el recordatorio compartido. */
export const DIAS_AVISO_CUMPLEANOS = 7;

/** Ventana de la lista al abrir el módulo (meses calendario hacia adelante). */
export const VENTANA_MESES_INICIAL = 3;

/** Cuántos meses suma cada clic en "Mostrar más cumpleaños". */
export const INCREMENTO_MESES = 3;

/** Tope de la ventana ampliable. */
export const MAX_MESES = 12;

/** Unidades que ven el módulo y sus recordatorios (además de ADMIN/SUPER_ADMIN). */
export const UNIDADES_AUDIENCIA = ["Marketing", "Podcast"];

/** Nombres de los meses en español (es-ES) para fechas legibles tipo "14 de septiembre". */
export const NOMBRES_MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Nombre del mes por número (1..12). */
export function nombreMes(mes: number): string {
  return NOMBRES_MESES[mes - 1] ?? String(mes);
}

/** Formato legible de una fecha: "14 de septiembre". */
export function diaDeMes(mes: number, dia: number): string {
  return `${dia} de ${nombreMes(mes)}`;
}
