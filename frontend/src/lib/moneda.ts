// Formato y captura de dinero. La moneda del sistema es USD (igual que el resto del CRM).
//
// REGLA: el monto real vive en CENTAVOS ENTEROS de punta a punta. Aquí solo se convierte
// para mostrar y para leer lo que el usuario escribe — nunca se manda un decimal al backend,
// así que un sueldo no puede desviarse por redondeo de coma flotante.

/** Centavos → "$2,000.00". null/undefined → "—" (no se inventa un monto). */
export function formatearMoneda(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(centavos / 100);
}

/**
 * Lo que el usuario escribe → centavos enteros, con aritmética de texto (sin float).
 * Acepta "2000", "2,000", "2000.5", "2,000.50". Devuelve null si no es un monto válido.
 */
export function textoACentavos(texto: string): number | null {
  // Las comas son separador de miles (el sistema muestra "$2,000.00"): se descartan.
  const limpio = texto.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const [entera, decimales = ""] = limpio.split(".");
  // "5" → "50" centavos: se rellena a la derecha en vez de multiplicar por 100.
  const centavos = decimales.padEnd(2, "0");
  return Number(entera) * 100 + Number(centavos);
}

/** Centavos → "2000.50", para precargar el input al editar. */
export function centavosATexto(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "";
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
