// Generador Excel (XLSX) del reporte de tareas (exceljs en servidor).

import { Workbook } from "exceljs";
import {
  type ReporteAgrupado,
  fechaCorta,
  formatearMinutos,
} from "./etiquetas";

const CABECERAS = [
  "Departamento",
  "Responsable",
  "Título",
  "Estado",
  "Prioridad",
  "Fecha límite",
  "Avance %",
  "Tiempo invertido (min)",
  "Canal",
  "Sprint",
];

const ANCHOS = [18, 22, 48, 16, 12, 14, 10, 22, 16, 14];

export async function renderXlsx(reporte: ReporteAgrupado): Promise<{ buffer: Buffer }> {
  const wb = new Workbook();
  const ws = wb.addWorksheet("Reporte de tareas");

  for (let i = 0; i < CABECERAS.length; i++) {
    ws.getColumn(i + 1).width = ANCHOS[i];
  }

  const azul = "FF1D4ED8";
  const grisClaro = "FFEEF2F7";
  const azulClaro = "FFDBEAFE";
  const azulMasClaro = "FFBFDBFE";

  // ── Encabezado del documento ──
  ws.addRow(["Reporte de Tareas Operativas"]).font = { bold: true, size: 14 };
  ws.addRow([`Generado por: ${reporte.info.por} (${reporte.info.rol})`]);
  ws.addRow([`Fecha de generación: ${reporte.info.generadoEn}`]);
  ws.addRow([reporte.info.filtros]);
  ws.addRow([]);

  // ── Fila de columnas ──
  const filaCol = ws.addRow(CABECERAS);
  filaCol.font = { bold: true, color: { argb: "FFFFFFFF" } };
  filaCol.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azul } };

  const agregarFila = (
    valores: (string | number | null)[],
    estilos?: { bold?: boolean; fill?: string },
  ): void => {
    const fila = ws.addRow(valores.map((v) => v ?? ""));
    if (estilos?.bold) fila.font = { bold: true };
    if (estilos?.fill) fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: estilos.fill } };
  };

  if (reporte.departamentos.length === 0) {
    agregarFila(["No hay tareas para los filtros seleccionados."]);
  } else {
    for (const d of reporte.departamentos) {
      for (const r of d.responsables) {
        for (const t of r.tareas) {
          agregarFila([
            d.nombre,
            r.responsableNombre,
            t.titulo,
            t.estadoLabel,
            t.prioridadLabel,
            fechaCorta(t.fechaLimite),
            t.porcentajeAvance ?? 0,
            t.tiempoInvertido,
            t.canal ?? "",
            t.sprint ?? "",
          ]);
        }
        agregarFila(
          [
            "",
            `Subtotal — ${r.responsableNombre}`,
            `${r.totalTareas} tareas · ${formatearMinutos(r.tiempoTotalMin)}`,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
          ],
          { bold: true, fill: grisClaro },
        );
      }
      agregarFila(
        [
          `TOTAL — ${d.nombre}`,
          "",
          `${d.totalTareas} tareas · ${formatearMinutos(d.tiempoTotalMin)}`,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ],
        { bold: true, fill: azulClaro },
      );
    }
    agregarFila(
      [
        "TOTAL GENERAL",
        "",
        `${reporte.totalGeneralTareas} tareas · ${formatearMinutos(reporte.tiempoGeneralMin)}`,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      { bold: true, fill: azulMasClaro },
    );
  }

  const out = await wb.xlsx.writeBuffer();
  return { buffer: out as unknown as Buffer };
}
