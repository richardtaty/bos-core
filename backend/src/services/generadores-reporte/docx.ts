// Generador Word (DOCX) del reporte de tareas (docx en servidor).
// El texto Unicode (acentos del español) se serializa sin fuentes especiales.

import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  type ReporteAgrupado,
  type BloqueResponsable,
  type FilaTareaReporte,
  fechaCorta,
  formatearMinutos,
} from "./etiquetas";

const COLUMNAS = ["Título", "Estado", "Prioridad", "Vence", "Avance", "Tiempo"];

function celda(texto: string, opciones?: { bold?: boolean; header?: boolean }): TableCell {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: texto,
          bold: opciones?.bold ?? opciones?.header ?? false,
          color: opciones?.header ? "FFFFFF" : "1F2937",
        }),
      ],
    }),
  ];
  return new TableCell({
    shading: opciones?.header ? { fill: "1D4ED8", type: ShadingType.CLEAR } : undefined,
    children,
  });
}

function filaEncabezado(): TableRow {
  return new TableRow({
    tableHeader: true,
    children: COLUMNAS.map((c) => celda(c, { header: true })),
  });
}

function filaTarea(t: FilaTareaReporte): TableRow {
  return new TableRow({
    children: [
      celda(t.titulo),
      celda(t.estadoLabel),
      celda(t.prioridadLabel),
      celda(fechaCorta(t.fechaLimite)),
      celda(`${t.porcentajeAvance ?? 0}%`),
      celda(formatearMinutos(t.tiempoInvertido)),
    ],
  });
}

function tablaDeResponsable(r: BloqueResponsable): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [filaEncabezado(), ...r.tareas.map(filaTarea)],
  });
}

export async function renderDocx(reporte: ReporteAgrupado): Promise<{ buffer: Buffer }> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: "Reporte de Tareas Operativas", bold: true, size: 32 })],
    }),
    new Paragraph({ children: [new TextRun(`Generado por: ${reporte.info.por} · ${reporte.info.rol}`)] }),
    new Paragraph({ children: [new TextRun(`Fecha de generación: ${reporte.info.generadoEn}`)] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun(reporte.info.filtros)] }),
  ];

  if (reporte.departamentos.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: "No hay tareas para los filtros seleccionados.", italics: true })] }));
  } else {
    for (const d of reporte.departamentos) {
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 60 },
          children: [new TextRun({ text: d.nombre, bold: true, color: "1D4ED8", size: 26 })],
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: `Total del departamento: ${d.totalTareas} tareas · ${formatearMinutos(d.tiempoTotalMin)}`, italics: true })],
        }),
      );
      for (const r of d.responsables) {
        children.push(
          new Paragraph({
            spacing: { before: 160, after: 80 },
            children: [
              new TextRun({ text: `▶ ${r.responsableNombre} — ${r.totalTareas} tareas · ${formatearMinutos(r.tiempoTotalMin)}`, bold: true }),
            ],
          }),
          tablaDeResponsable(r),
        );
      }
    }
    children.push(
      new Paragraph({
        spacing: { before: 240 },
        children: [
          new TextRun({
            text: `TOTAL GENERAL: ${reporte.totalGeneralTareas} tareas · ${formatearMinutos(reporte.tiempoGeneralMin)}`,
            bold: true,
          }),
        ],
      }),
    );
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer };
}
