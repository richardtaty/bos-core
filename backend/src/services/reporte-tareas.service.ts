// Orquestador del reporte de tareas operativas. Aquí vive la seguridad: la puerta de
// rol, el alcance por departamento (siempre desde el usuario autenticado, NUNCA desde
// los parámetros que mande el navegador) y la validación del responsable. Los
// generadores de archivo (PDF/Excel/Word) reciben un modelo agrupado ya filtrado.

import { and, eq, gte, inArray, lte, ne, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { tareasOperativas, usuarios, usuarioDepartamentos } from "../db/schema";
import { nombreDepartamentoDe, type AuthUser } from "../middleware/auth";
import { registrarAuditoria } from "./auditoria.service";
import { AREA_DEV, TAREA_COLUMNS } from "./tareas.service";
import {
  diaEncabezado,
  esYmd,
  ESTADO_LABEL,
  ESTADOS_POR_GRUPO,
  formatearMinutos,
  GRUPO_LABEL,
  MESES,
  MESES_CORTO,
  periodoCorto,
  periodoLargo,
  PRIORIDAD_LABEL,
  ROL_LABEL,
  descomponerYmd,
  grupoDeEstado,
  type BloqueDepartamento,
  type BloqueResponsable,
  type DatosPdf,
  type DepartamentoPdf,
  type FechaPdf,
  type FilaTareaReporte,
  type FormatoReporte,
  type GrupoEstado,
  type ReporteAgrupado,
  type ResponsablePdf,
} from "./generadores-reporte/etiquetas";
import { renderDocx } from "./generadores-reporte/docx";
import { renderPdf } from "./generadores-reporte/pdf";
import { renderXlsx } from "./generadores-reporte/xlsx";

/** Fallo de permiso del reporte → la ruta responde 403 (dato bien, usuario sin derecho). */
export class SinPermisoReporteError extends Error {}

export interface FiltrosReporteTareas {
  formato: FormatoReporte;
  departamento?: string; // nombre (texto); SOLO afina, nunca amplía
  responsableId?: string;
  grupo?: GrupoEstado | ""; // "" = todos los estados
  desde?: string; // YYYY-MM-DD (fecha de creación)
  hasta?: string;
}

export interface ResultadoReporte {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

// ─── Helpers locales ─────────────────────────────────────

/** Los nombres de los departamentos de OTRO usuario (por id), con fallback al legacy. */
async function departamentosDeUsuarioId(usuarioId: string): Promise<string[]> {
  const filas = await db
    .select({ departamentoId: usuarioDepartamentos.departamentoId })
    .from(usuarioDepartamentos)
    .where(eq(usuarioDepartamentos.usuarioId, usuarioId));
  const ids = filas.map((f) => f.departamentoId);
  if (ids.length === 0) {
    const [u] = await db.select({ departamentoId: usuarios.departamentoId }).from(usuarios).where(eq(usuarios.id, usuarioId));
    if (u?.departamentoId) ids.push(u.departamentoId);
  }
  const nombres: string[] = [];
  for (const id of ids) {
    const nombre = await nombreDepartamentoDe(id);
    if (nombre) nombres.push(nombre);
  }
  return nombres;
}

async function nombreDeUsuarioId(usuarioId: string): Promise<string | null> {
  const [u] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, usuarioId));
  return u?.nombre ?? null;
}

const aIso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const ymdCorta = (ymd: string): string => {
  const [anio, mes, dia] = ymd.split("-");
  return `${dia}/${mes}/${anio}`;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" del día de HOY en la zona horaria del servidor. */
function hoyYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Resuelve el rango de fechas efectivo del reporte. Sin fechas (o solo una) se usa
 * una regla simple: nada → mes actual (1ro a hoy); solo `desde` → de esa fecha a hoy;
 * solo `hasta` → desde el 1ro de ese mes. Así el título/pie del documento nunca miente
 * sobre el período que filtran las tareas.
 */
function rangoEfectivo(desde?: string, hasta?: string): { desde: string; hasta: string } {
  const hoy = hoyYmd();
  const d = esYmd(desde) ? desde : undefined;
  const h = esYmd(hasta) ? hasta : undefined;
  if (d && h) return d <= h ? { desde: d, hasta: h } : { desde: h, hasta: d };
  if (d) return { desde: d, hasta: d > hoy ? d : hoy };
  if (h) return { desde: `${h.slice(0, 7)}-01`, hasta: h };
  const [anio, mes] = hoy.split("-");
  return { desde: `${anio}-${mes}-01`, hasta: hoy };
}

function fechaGeneradoEn(): string {
  const ahora = new Date();
  const dd = pad2(ahora.getDate());
  const mm = pad2(ahora.getMonth() + 1);
  const hh = pad2(ahora.getHours());
  const mi = pad2(ahora.getMinutes());
  return `${dd}/${mm}/${ahora.getFullYear()} ${hh}:${mi}`;
}

function slugAscii(texto: string): string {
  const limpio = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return limpio || "departamento";
}

const capitalizar = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Token de archivo del alcance: nombre del departamento o "General". */
function tokenAlcance(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return limpio || "General";
}

/**
 * Token de período para el nombre de archivo del PDF.
 *  - Mes calendario completo → "Septiembre_2026"
 *  - Mismo mes → "01-14_Septiembre_2026"
 *  - Cruza meses/años → "31Ago-06Sep_2026"
 */
function tokenPeriodoArchivo(desde: string, hasta: string): string {
  const a = descomponerYmd(desde);
  const b = descomponerYmd(hasta);
  if (a.mes === b.mes && a.anio === b.anio) {
    const ultimoDia = new Date(Date.UTC(a.anio, a.mes, 0)).getUTCDate();
    if (a.dia === 1 && b.dia === ultimoDia) return `${capitalizar(MESES[a.mes - 1])}_${a.anio}`;
    return `${pad2(a.dia)}-${pad2(b.dia)}_${capitalizar(MESES[a.mes - 1])}_${a.anio}`;
  }
  if (a.anio === b.anio) {
    return `${pad2(a.dia)}${capitalizar(MESES_CORTO[a.mes - 1])}-${pad2(b.dia)}${capitalizar(MESES_CORTO[b.mes - 1])}_${a.anio}`;
  }
  return `${pad2(a.dia)}${capitalizar(MESES_CORTO[a.mes - 1])}${a.anio}-${pad2(b.dia)}${capitalizar(MESES_CORTO[b.mes - 1])}${b.anio}`;
}

const METADATOS: Record<FormatoReporte, { ext: string; contentType: string }> = {
  pdf: { ext: "pdf", contentType: "application/pdf" },
  excel: { ext: "xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  word: { ext: "docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
};

/** Conteos por grupo de estado a partir de las tareas ya filtradas. */
interface ConteosGrupo {
  porGrupo: Record<GrupoEstado, number>;
  total: number;
  responsables: Set<string>;
  tiempoTotalMin: number;
}

function conteosDe(bloques: BloqueDepartamento[]): ConteosGrupo {
  const porGrupo: Record<GrupoEstado, number> = {
    pendiente: 0,
    en_revision: 0,
    en_proceso: 0,
    realizado: 0,
    cancelado: 0,
  };
  const responsables = new Set<string>();
  let total = 0;
  let tiempoTotalMin = 0;
  for (const depto of bloques) {
    for (const resp of depto.responsables) {
      responsables.add(resp.responsableId);
      for (const t of resp.tareas) {
        porGrupo[t.grupo] += 1;
        total += 1;
        tiempoTotalMin += t.tiempoInvertido;
      }
    }
  }
  return { porGrupo, total, responsables, tiempoTotalMin };
}

/** "14 realizadas, 5 en proceso y 2 pendientes" (solo los grupos presentes). */
function desgloseGrupos(porGrupo: Record<GrupoEstado, number>): string {
  const palabras: Record<GrupoEstado, string> = {
    pendiente: "pendientes",
    en_revision: "en revisión",
    en_proceso: "en proceso",
    realizado: "realizadas",
    cancelado: "canceladas",
  };
  const presentes: string[] = [];
  for (const g of ["realizado", "en_proceso", "en_revision", "pendiente", "cancelado"] as GrupoEstado[]) {
    const c = porGrupo[g];
    if (c > 0) presentes.push(`${c} ${palabras[g]}`);
  }
  if (presentes.length === 0) return "";
  if (presentes.length === 1) return presentes[0];
  const ultimo = presentes.pop()!;
  return `${presentes.join(", ")} y ${ultimo}`;
}

/**
 * "Resumen general": 1-2 frases escritas SOLO a partir de los datos incluidos
 * (totales, responsables, desglose de estados, tiempo). Nunca inventa logros.
 */
function textoResumen(
  conteos: ConteosGrupo,
  alcanceFrase: string, // ", del departamento de X" | "" | " de todos los departamentos"
): string {
  const { total } = conteos;
  if (total === 0) return "No se registraron actividades en el período seleccionado.";
  const frasePrincipal =
    total === 1
      ? `Se registró 1 actividad${alcanceFrase}.`
      : `Se registraron ${total} actividades${alcanceFrase}.`;
  const fraseParticipantes =
    conteos.responsables.size === 1
      ? "Participó 1 responsable."
      : `Participaron ${conteos.responsables.size} responsables.`;
  const desglose = desgloseGrupos(conteos.porGrupo);
  let fraseEstados = "";
  if (desglose && !(conteos.porGrupo.realizado === total)) {
    fraseEstados = desglose.includes(",") || desglose.includes(" y ")
      ? `De ellas, ${desglose}.`
      : `Todas se registraron como ${desglose}.`;
  }
  return [frasePrincipal, fraseParticipantes, fraseEstados].filter(Boolean).join(" ");
}

/**
 * "Cierre del período": párrafo final derivado únicamente de las tareas incluidas
 * (realizadas vs. abiertas y tiempo registrado). Sin elogios ni promesas inventadas.
 */
function textoCierre(conteos: ConteosGrupo): string {
  const { total, porGrupo, tiempoTotalMin } = conteos;
  if (total === 0) return "";
  const realizadas = porGrupo.realizado;
  const abiertas = total - realizadas;
  const frases: string[] = [];
  frases.push(
    realizadas === 0
      ? "Al cierre del período no se registraron actividades realizadas."
      : realizadas === total
        ? `Al cierre del período las ${total} actividades quedaron registradas como realizadas.`
        : `Al cierre del período ${realizadas} de las ${total} actividades quedaron registradas como realizadas.`,
  );
  if (abiertas > 0) {
    frases.push(abiertas === 1 ? "La restante se mantiene abierta." : `Las ${abiertas} restantes se mantienen abiertas.`);
  }
  if (tiempoTotalMin > 0) {
    frases.push(`Se contabilizaron ${formatearMinutos(tiempoTotalMin)} de tiempo de trabajo.`);
  }
  return frases.join(" ");
}

/**
 * Reordena las tareas de cada departamento a la estructura documental del PDF:
 * departamento → FECHA (día de creación) → responsable → viñetas. Dentro de un
 * departamento las fechas van en orden cronológico ascendente y dentro de cada fecha
 * los responsables aparecen en el orden de su primera tarea del día.
 */
function construirDepartamentosPdf(
  bloques: BloqueDepartamento[],
  sufijosEstado: boolean,
): DepartamentoPdf[] {
  return bloques.map((depto) => {
    const tareas = depto.responsables
      .flatMap((r) => r.tareas)
      .slice()
      .sort((a, b) => {
        const c = a.createdISO.localeCompare(b.createdISO);
        return c !== 0 ? c : a.titulo.localeCompare(b.titulo);
      });

    // fecha (YYYY-MM-DD) → responsableId → lista de tareas (orden de aparición).
    const porFecha = new Map<string, Map<string, FilaTareaReporte[]>>();
    for (const t of tareas) {
      const ymd = t.createdISO.slice(0, 10);
      if (!porFecha.has(ymd)) porFecha.set(ymd, new Map());
      const porResponsable = porFecha.get(ymd)!;
      if (!porResponsable.has(t.responsableId)) porResponsable.set(t.responsableId, []);
      porResponsable.get(t.responsableId)!.push(t);
    }

    const fechas: FechaPdf[] = [];
    for (const [ymd, porResponsable] of porFecha) {
      const responsables: ResponsablePdf[] = [];
      for (const tareasDelDia of porResponsable.values()) {
        const nombre = tareasDelDia[0]?.responsableNombre ?? "Sin responsable";
        responsables.push({
          nombre,
          tareas: tareasDelDia.map((t) => ({
            texto: t.titulo,
            estado: sufijosEstado && t.grupo !== "realizado" ? GRUPO_LABEL[t.grupo] : undefined,
          })),
        });
      }
      fechas.push({ titulo: diaEncabezado(ymd), responsables });
    }
    return { nombre: depto.nombre, fechas };
  });
}

// ─── Generador del reporte ───────────────────────────────

export async function generarReporteTareas(usuario: AuthUser, filtros: FiltrosReporteTareas): Promise<ResultadoReporte> {
  // 1. Puerta de rol: SOLO SUPER_ADMIN exporta reportes (PDF/Excel/Word). El resto
  //    —incluido ADMIN— queda fuera aunque conozca la URL, el departamento o el formato.
  if (usuario.rol !== "SUPER_ADMIN") {
    throw new SinPermisoReporteError("Solo el Super Admin puede exportar reportes de tareas.");
  }

  const departamentoPedido = (filtros.departamento ?? "").trim();

  // 2. Alcance desde el usuario autenticado (nunca del cliente). permitidos === null
  //    significa "sin límite": el Super Admin elige un departamento o "Todos".
  const permitidos: string[] | null = departamentoPedido ? [departamentoPedido] : null;

  // 3. El responsable pedido debe pertenecer al alcance del reporte.
  let nombreResponsable: string | null = null;
  if (filtros.responsableId) {
    const deptosDelResponsable = await departamentosDeUsuarioId(filtros.responsableId);
    const coincide =
      permitidos === null
        ? deptosDelResponsable.length > 0
        : deptosDelResponsable.some((d) => permitidos!.includes(d));
    if (!coincide) {
      throw new SinPermisoReporteError("El responsable indicado no pertenece al departamento del reporte.");
    }
    nombreResponsable = await nombreDeUsuarioId(filtros.responsableId);
  }

  // 4. Rango de fechas efectivo (nunca vacío) y consulta única: los filtros SIEMPRE
  //    se ANDean sobre el alcance. Los valores del query se vuelven a validar aquí
  //    (grupo conocido, fechas YYYY-MM-DD) para que un parámetro raro nunca rompa la
  //    consulta ni amplíe el alcance.
  const { desde, hasta } = rangoEfectivo(filtros.desde, filtros.hasta);
  const GRUPOS_VALIDOS: GrupoEstado[] = ["pendiente", "en_revision", "en_proceso", "realizado", "cancelado"];
  const grupoElegido = GRUPOS_VALIDOS.find((g) => g === filtros.grupo);
  const condiciones: SQL<unknown>[] = [];
  // Las tareas DEV son del módulo DEV (solo SUPER ADMIN) y no entran al reporte general.
  condiciones.push(ne(tareasOperativas.departamento, AREA_DEV));
  if (permitidos) condiciones.push(inArray(tareasOperativas.departamento, permitidos));
  if (filtros.responsableId) condiciones.push(eq(tareasOperativas.responsableId, filtros.responsableId));
  if (grupoElegido) {
    // Los valores de ESTADOS_POR_GRUPO son un subconjunto del enum de la columna.
    condiciones.push(inArray(tareasOperativas.estado, ESTADOS_POR_GRUPO[grupoElegido] as any));
  }
  condiciones.push(gte(tareasOperativas.createdAt, new Date(`${desde}T00:00:00`)));
  condiciones.push(lte(tareasOperativas.createdAt, new Date(`${hasta}T23:59:59.999`)));

  // Mismas columnas que el listado del tablero (TAREA_COLUMNS), con el responsable unido.
  const filas = await db
    .select(TAREA_COLUMNS)
    .from(tareasOperativas)
    .innerJoin(usuarios, eq(tareasOperativas.responsableId, usuarios.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(tareasOperativas.departamento, usuarios.nombre, tareasOperativas.createdAt);

  // 5. Modelo agrupado departamento → responsable → tareas.
  const porDepartamento = new Map<string, Map<string, FilaTareaReporte[]>>();
  for (const fila of filas) {
    if (!porDepartamento.has(fila.departamento)) porDepartamento.set(fila.departamento, new Map());
    const depto = porDepartamento.get(fila.departamento)!;
    if (!depto.has(fila.responsableId)) depto.set(fila.responsableId, []);
    depto.get(fila.responsableId)!.push({
      id: fila.id,
      titulo: fila.titulo,
      departamento: fila.departamento,
      responsableId: fila.responsableId,
      responsableNombre: fila.responsableNombre,
      createdISO: fila.createdAt.toISOString(),
      estado: fila.estado,
      estadoLabel: ESTADO_LABEL[fila.estado] ?? fila.estado,
      grupo: grupoDeEstado(fila.estado),
      prioridad: fila.prioridad,
      prioridadLabel: PRIORIDAD_LABEL[fila.prioridad] ?? fila.prioridad,
      fechaLimite: aIso(fila.fechaLimite),
      porcentajeAvance: fila.porcentajeAvance ?? 0,
      canal: fila.canal,
      tipoContenido: fila.tipoContenido,
      tiempoInvertido: fila.tiempoInvertido ?? 0,
      sprint: fila.sprint,
    });
  }

  const bloquesDepartamento: BloqueDepartamento[] = [];
  for (const [nombreDepto, responsables] of porDepartamento) {
    const bloquesResponsable: BloqueResponsable[] = [];
    let totalDepto = 0;
    let tiempoDepto = 0;
    for (const [responsableId, tareasDelResponsable] of responsables) {
      const tareasOrdenadas = [...tareasDelResponsable].sort((a, b) => {
        const fa = a.fechaLimite ? new Date(a.fechaLimite).getTime() : Number.MAX_SAFE_INTEGER;
        const fb = b.fechaLimite ? new Date(b.fechaLimite).getTime() : Number.MAX_SAFE_INTEGER;
        if (fa !== fb) return fa - fb;
        return a.titulo.localeCompare(b.titulo);
      });
      const totalTareas = tareasOrdenadas.length;
      const tiempoTotalMin = tareasOrdenadas.reduce((s, t) => s + t.tiempoInvertido, 0);
      bloquesResponsable.push({
        responsableId,
        responsableNombre: tareasOrdenadas[0]?.responsableNombre ?? responsableId,
        tareas: tareasOrdenadas,
        totalTareas,
        tiempoTotalMin,
      });
      totalDepto += totalTareas;
      tiempoDepto += tiempoTotalMin;
    }
    bloquesDepartamento.push({ nombre: nombreDepto, responsables: bloquesResponsable, totalTareas: totalDepto, tiempoTotalMin: tiempoDepto });
  }
  bloquesDepartamento.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const totalGeneralTareas = bloquesDepartamento.reduce((s, d) => s + d.totalTareas, 0);
  const tiempoGeneralMin = bloquesDepartamento.reduce((s, d) => s + d.tiempoTotalMin, 0);

  // 6. Línea de filtros legible para el encabezado de los archivos (Excel/Word) y la auditoría.
  //    (El generador solo se alcanza con SUPER_ADMIN: ver puerta de rol arriba.)
  const partesFiltro: string[] = [];
  partesFiltro.push(`Departamento: ${departamentoPedido || "Todos los departamentos"}`);
  partesFiltro.push(`Estado: ${grupoElegido ? GRUPO_LABEL[grupoElegido] : "Todos los estados"}`);
  partesFiltro.push(`Responsable: ${nombreResponsable || "Todos"}`);
  partesFiltro.push(`Período (creación): ${ymdCorta(desde)} a ${ymdCorta(hasta)}`);

  const reporte: ReporteAgrupado = {
    departamentos: bloquesDepartamento,
    totalGeneralTareas,
    tiempoGeneralMin,
    info: {
      por: usuario.nombre,
      rol: ROL_LABEL[usuario.rol] ?? usuario.rol,
      generadoEn: fechaGeneradoEn(),
      filtros: partesFiltro.join(" · "),
    },
  };

  // 7. Título / alcance del documento y modelo documental del PDF.
  const alcanceNombres = permitidos ?? [];
  const soloUnDepartamento = permitidos !== null && alcanceNombres.length === 1;
  const deptoTitulo = soloUnDepartamento ? alcanceNombres[0] : null;
  const esGlobal = permitidos === null;

  const tituloDoc = deptoTitulo ? `Reporte de actividades de ${deptoTitulo}` : "Reporte general de actividades";
  const footerEtiqueta = esGlobal ? "Todos los departamentos" : alcanceNombres.join(" · ");
  const conteos = conteosDe(bloquesDepartamento);
  const alcanceFrase = deptoTitulo
    ? ` del departamento de ${deptoTitulo}`
    : esGlobal
      ? " en todos los departamentos"
      : "";
  const hayActividades = conteos.total > 0;

  const datosPdf: DatosPdf = {
    titulo: tituloDoc,
    periodo: periodoLargo(desde, hasta),
    footer: `${footerEtiqueta} · ${periodoCorto(desde, hasta)}`,
    resumen: textoResumen(conteos, alcanceFrase),
    cierre: textoCierre(conteos),
    porDepartamento: !soloUnDepartamento,
    departamentos: construirDepartamentosPdf(bloquesDepartamento, !grupoElegido),
    hayActividades,
  };

  // 8. Dispatch al generador correspondiente.
  const { buffer } =
    filtros.formato === "pdf"
      ? await renderPdf(datosPdf)
      : filtros.formato === "excel"
        ? await renderXlsx(reporte)
        : await renderDocx(reporte);

  const meta = METADATOS[filtros.formato];
  if (filtros.formato === "pdf") {
    // Nombres documentales del PDF (especificación): Reporte_Actividades_<Alcance>_<período>.pdf
    const escopo = deptoTitulo ? tokenAlcance(deptoTitulo) : "General";
    const base = `Reporte_Actividades_${escopo}_${tokenPeriodoArchivo(desde, hasta)}`;
    const filename = `${base}.pdf`;
    await registrarAuditoria({
      entidad: "ReporteTareas",
      entidadId: "reporte-tareas",
      accion: `Reporte exportado (pdf) — ${partesFiltro.join(", ")}`,
      autorId: usuario.id,
      detalle: JSON.stringify(filtros),
    });
    return { buffer, filename, contentType: meta.contentType };
  }

  const fechaHoy = new Date().toISOString().slice(0, 10);
  const base = departamentoPedido ? `reporte-tareas_${fechaHoy}_${slugAscii(departamentoPedido)}` : `reporte-tareas_${fechaHoy}`;
  const filename = `${base}.${meta.ext}`;

  // 9. Auditoría de la exportación (lectura sensible de un equipo completo).
  await registrarAuditoria({
    entidad: "ReporteTareas",
    entidadId: "reporte-tareas",
    accion: `Reporte exportado (${filtros.formato}) — ${partesFiltro.join(", ")}`,
    autorId: usuario.id,
    detalle: JSON.stringify(filtros),
  });

  return { buffer, filename, contentType: meta.contentType };
}
