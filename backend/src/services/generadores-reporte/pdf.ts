// Generador PDF del reporte de tareas (pdfmake en servidor).
//
// ESTE PDF es un documento administrativo imprimible, NO una copia de la interfaz:
// no hay tablas del sistema, tarjetas, botones, IDs internos ni metadatos de BD.
// Su estructura es cronológica (FECHA → responsable → actividades) y se compone a
// partir del modelo documental DatosPdf (ver etiquetas.ts):
//   [Título del reporte]
//   [Período]
//   Resumen general
//     · Párrafo derivado SOLO de las tareas incluidas.
//   Actividades realizadas
//     [Encabezado de departamento — solo si el reporte es multi-departamento]
//     01 DE SEPTIEMBRE
//       Nombre del responsable (negrita)
//       • Actividad [Estado]   (sufijo solo cuando el filtro es "Todos")
//   Cierre del período
//     · Párrafo final derivado de los mismos datos.
// Pie en todas las páginas: alcance · período …   Página X de Y.

import PdfPrinter = require("pdfmake");
import {
  type DatosPdf,
  type DepartamentoPdf,
  type FechaPdf,
  type TareaPdf,
} from "./etiquetas";

type DocDefinition = PdfPrinter.TDocumentDefinitions;
type FuentesRoboto = PdfPrinter.PdfMakeFonts;

// ─── Fuentes Roboto embebidas (vfs_fonts exporta { 'Roboto-Regular.ttf': base64, ... }) ───
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vfsFonts = require("pdfmake/build/vfs_fonts.js") as Record<string, string>;
function fuente(nombre: string): Buffer {
  return Buffer.from(vfsFonts[nombre], "base64");
}

let _fuentes: FuentesRoboto | null = null;
function fuentesRoboto(): FuentesRoboto {
  if (!_fuentes) {
    _fuentes = {
      Roboto: {
        normal: fuente("Roboto-Regular.ttf"),
        bold: fuente("Roboto-Medium.ttf"),
        italics: fuente("Roboto-Italic.ttf"),
        bolditalics: fuente("Roboto-MediumItalic.ttf"),
      },
    };
  }
  return _fuentes;
}

// ─── Hoja Carta, márgenes ~0.7" y paleta en blanco y negro ─────────────────
const ANCHO_CONTENIDO = 512; // 612 (Carta) − 50 − 50 de márgenes laterales
const MAX_TAREAS_POR_PILA = 12; // para no crear bloques irrompibles más altos que una página

const COLOR_TITULO = "#111827";
const COLOR_TEXTO = "#374151";
const COLOR_SUAVE = "#6b7280";
const COLOR_FECHA = "#1f2937";
const REGLA = "#e5e7eb";

// ─── Viñetas y bloques de contenido ───────────────────────

/** Una tarea como viñeta "• Título  [Estado]". El sufijo de estado va en gris. */
function viñetaDe(t: TareaPdf): unknown {
  const partes: unknown[] = [{ text: "•  " }, { text: t.texto }];
  if (t.estado) {
    partes.push({ text: `   [${t.estado}]`, color: COLOR_SUAVE, italics: true });
  }
  return { text: partes, style: "actividad" };
}

/**
 * Las fechas de un departamento. En el primer bloque de cada fecha se antepone el
 * encabezado de la fecha; en el primer bloque de todo el departamento se antepone
 * también el encabezado del departamento (jerarquía del reporte multi-departamento).
 */
function pilasDeFecha(fecha: FechaPdf, prefijo: unknown[]): unknown[] {
  const prefijoEnviado = prefijo.length > 0;
  const pilas: unknown[] = [];
  let primeraPila = true;
  for (const resp of fecha.responsables) {
    // Se genera una pila por "tanda" de tareas; la primera lleva el encabezado.
    const tandas = resp.tareas.length > 0
      ? Math.ceil(resp.tareas.length / MAX_TAREAS_POR_PILA)
      : 1;
    for (let i = 0; i < tandas; i++) {
      const inicio = i * MAX_TAREAS_POR_PILA;
      const grupo = resp.tareas.slice(inicio, inicio + MAX_TAREAS_POR_PILA);
      if (grupo.length === 0) continue;
      const nodos: unknown[] = [];
      if (primeraPila && prefijoEnviado) nodos.push(...prefijo);
      const encabezadoResponsable =
        i === 0
          ? { text: resp.nombre, style: "responsable" }
          : { text: `${resp.nombre} — continuación`, style: "continuacion" };
      nodos.push(encabezadoResponsable);
      for (const t of grupo) nodos.push(viñetaDe(t));
      pilas.push({ stack: nodos, unbreakable: true });
      primeraPila = false;
    }
  }
  return pilas;
}

function cuerpoDeFechas(depto: DepartamentoPdf, conEncabezadoDepto: boolean): unknown[] {
  const out: unknown[] = [];
  depto.fechas.forEach((fecha, idx) => {
    const prefijo: unknown[] = [];
    if (conEncabezadoDepto && idx === 0) {
      prefijo.push({ text: depto.nombre.toUpperCase(), style: "departamento" });
    }
    prefijo.push({ text: fecha.titulo, style: "fecha" });
    out.push(...pilasDeFecha(fecha, prefijo));
  });
  return out;
}

// ─── Pie de página (todas las páginas) ───────────────────

function hacerFooter(datos: DatosPdf) {
  // pdfmake llama al footer con el número de página actual y el total.
  return (currentPage: number, pageCount: number) => ({
    margin: [50, 0, 50, 0],
    columns: [
      { text: datos.footer, alignment: "left", fontSize: 8, color: COLOR_SUAVE },
      { text: `Página ${currentPage} de ${pageCount}`, alignment: "right", fontSize: 8, color: COLOR_SUAVE },
    ],
  });
}

// ─── Documento ────────────────────────────────────────────

function construirDoc(datos: DatosPdf): DocDefinition {
  const content: unknown[] = [];

  // Encabezado superior: título (dinámico) y período en jerarquía menor.
  content.push({ text: datos.titulo, style: "titulo" });
  content.push({ text: datos.periodo, style: "periodo" });

  // Línea divisoria sutil que separa el membrete del cuerpo (sin cajas).
  content.push({
    canvas: [
      { type: "line", x1: 0, y1: 0, x2: ANCHO_CONTENIDO, y2: 0, lineWidth: 0.75, lineColor: REGLA },
    ],
    margin: [0, 8, 0, 4],
  });

  // Resumen general (solo de los datos incluidos).
  content.push({ stack: [
    { text: "Resumen general", style: "seccion" },
    { text: datos.resumen, style: "parrafo" },
  ], unbreakable: true });

  content.push({ text: "Actividades realizadas", style: "seccion" });

  // Cuerpo: por departamento (si aplica) y cronológico por fecha de creación.
  if (!datos.hayActividades) {
    content.push({ text: "No se registraron actividades en el período indicado.", style: "vacio" });
  } else if (datos.porDepartamento) {
    for (const depto of datos.departamentos) {
      content.push(...cuerpoDeFechas(depto, true));
    }
  } else {
    // Reporte de un solo departamento: el título ya lo nombra, no se repite.
    const depto = datos.departamentos[0];
    if (depto) content.push(...cuerpoDeFechas(depto, false));
  }

  // Cierre del período (solo si hubo actividades que cerrar).
  if (datos.hayActividades && datos.cierre) {
    content.push({ stack: [
      { text: "Cierre del período", style: "seccion" },
      { text: datos.cierre, style: "parrafo" },
    ], unbreakable: true });
  }

  return {
    pageSize: "LETTER",
    pageMargins: [50, 56, 50, 64],
    defaultStyle: { font: "Roboto", fontSize: 9, color: COLOR_TEXTO },
    info: { title: datos.titulo, creator: "BOS Core", subject: "Reporte de actividades" },
    footer: hacerFooter(datos) as unknown,
    styles: {
      titulo: { fontSize: 15, bold: true, color: COLOR_TITULO, margin: [0, 0, 0, 2] },
      periodo: { fontSize: 10, color: COLOR_SUAVE, margin: [0, 0, 0, 0] },
      seccion: {
        fontSize: 11,
        bold: true,
        color: COLOR_TITULO,
        margin: [0, 16, 0, 6],
      },
      departamento: {
        fontSize: 10.5,
        bold: true,
        color: COLOR_FECHA,
        characterSpacing: 0.4,
        margin: [0, 14, 0, 1],
      },
      fecha: {
        fontSize: 9.5,
        bold: true,
        color: COLOR_FECHA,
        characterSpacing: 0.3,
        margin: [0, 10, 0, 1],
      },
      responsable: {
        fontSize: 9.5,
        bold: true,
        color: COLOR_TITULO,
        margin: [0, 4, 0, 1],
      },
      continuacion: {
        fontSize: 8,
        italics: true,
        color: COLOR_SUAVE,
        margin: [0, 4, 0, 1],
      },
      actividad: { fontSize: 8.5, color: COLOR_TEXTO, margin: [0, 0, 0, 1.5] },
      parrafo: {
        fontSize: 9,
        color: COLOR_TEXTO,
        alignment: "justify",
        lineHeight: 1.35,
        margin: [0, 0, 0, 0],
      },
      vacio: { fontSize: 9.5, italics: true, color: COLOR_SUAVE, margin: [0, 10, 0, 0] },
    },
    content,
  };
}

/** Devuelve el PDF como Buffer. */
export async function renderPdf(datos: DatosPdf): Promise<{ buffer: Buffer }> {
  const printer = new PdfPrinter(fuentesRoboto());
  const doc = printer.createPdfKitDocument(construirDoc(datos));
  const chunks: Buffer[] = [];
  return await new Promise<{ buffer: Buffer }>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks) }));
    doc.on("error", reject);
    doc.end();
  });
}
