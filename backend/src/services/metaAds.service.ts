import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, sqlite } from "../db/client";
import { metaAdsReportes, metaAdsGrupos, metaAdsCampanas, usuarios } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";

// ─── Tipos de entrada (payload del frontend) ─────────────────────────────

interface SegmentacionInput {
  nombre: string;
  ubicacionPublico?: string | null;
  presupuesto?: number | null;
  leads?: number | null;
  costoPorLead?: number | null;
  observacion?: string | null;
  orden?: number;
}

interface CampanaInput {
  nombre: string;
  ubicacionPublico?: string | null;
  presupuesto?: number | null;
  detallePresupuesto?: string | null;
  leads?: number | null;
  costoPorLead?: number | null;
  moneda?: string | null;
  estado?: string | null;
  observaciones?: string | null;
  recomendaciones?: string | null;
  orden?: number;
  segmentaciones?: SegmentacionInput[];
}

interface GrupoInput {
  seccionPrincipal: string;
  nombre: string;
  subtitulo?: string | null;
  presupuestoTotalActual?: number | null;
  observacion?: string | null;
  sinCampanasActivas?: boolean;
  orden?: number;
  campanas?: CampanaInput[];
}

interface ReporteInput {
  fechaInicio: string;
  fechaFin: string;
  titulo?: string | null;
  observacionGeneral?: string | null;
  presupuestoTotalActual?: number | null;
  grupos: GrupoInput[];
}

// ─── Errores específicos ─────────────────────────────────────────────────

/** Se lanza al intentar crear un reporte cuyo período ya existe. */
export class ReporteDuplicadoError extends Error {
  constructor(public reporteExistenteId: string) {
    super("Ya existe un reporte para ese período.");
  }
}

// ─── Transacción (node:sqlite es síncrono por debajo) ────────────────────

async function conTransaccion<T>(fn: () => Promise<T>): Promise<T> {
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const result = await fn();
    sqlite.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {
      // si ya no hay transacción activa, ignorar
    }
    throw err;
  }
}

// ─── Utilidades ──────────────────────────────────────────────────────────

function textOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function numOrNull(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (s === "") return undefined;
    const n = Number(s);
    if (Number.isNaN(n)) throw new Error("Valor numérico inválido.");
    return n;
  }
  throw new Error("Valor numérico inválido.");
}

function validarReporte(input: ReporteInput): void {
  const { fechaInicio, fechaFin } = input;
  if (!fechaInicio || !fechaFin) {
    throw new Error("Las fechas de inicio y fin son obligatorias.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fechaFin)) {
    throw new Error("El formato de fecha debe ser AAAA-MM-DD.");
  }
  if (fechaFin < fechaInicio) {
    throw new Error("La fecha de fin no puede ser anterior a la de inicio.");
  }
  if (input.presupuestoTotalActual != null && input.presupuestoTotalActual < 0) {
    throw new Error("El presupuesto total no puede ser negativo.");
  }

  if (!Array.isArray(input.grupos) || input.grupos.length === 0) {
    throw new Error("El reporte debe tener al menos un grupo.");
  }

  for (const g of input.grupos) {
    if (!g.nombre || !g.nombre.trim()) {
      throw new Error("Cada grupo debe tener un nombre.");
    }
    if (g.presupuestoTotalActual != null && g.presupuestoTotalActual < 0) {
      throw new Error("El presupuesto del grupo no puede ser negativo.");
    }
    for (const c of g.campanas ?? []) {
      if (!c.nombre || !c.nombre.trim()) {
        throw new Error("Cada campaña debe tener un nombre.");
      }
      if (c.presupuesto != null && c.presupuesto < 0) throw new Error("El presupuesto no puede ser negativo.");
      if (c.costoPorLead != null && c.costoPorLead < 0) throw new Error("El costo por lead no puede ser negativo.");
      if (c.leads != null && (!Number.isInteger(c.leads) || c.leads < 0)) {
        throw new Error("Los leads deben ser un número entero no negativo.");
      }
      if (c.estado != null && !["Activa", "Inactiva"].includes(c.estado)) {
        throw new Error("El estado debe ser Activa o Inactiva.");
      }
      for (const s of c.segmentaciones ?? []) {
        if (!s.nombre || !s.nombre.trim()) {
          throw new Error("Cada segmentación debe tener un nombre.");
        }
        if (s.presupuesto != null && s.presupuesto < 0) throw new Error("El presupuesto de la segmentación no puede ser negativo.");
        if (s.costoPorLead != null && s.costoPorLead < 0) throw new Error("El costo por lead de la segmentación no puede ser negativo.");
        if (s.leads != null && (!Number.isInteger(s.leads) || s.leads < 0)) {
          throw new Error("Los leads de la segmentación deben ser un número entero no negativo.");
        }
      }
    }
  }
}

function pushMap<K, V>(map: Map<K, V[]>, key: K, val: V): void {
  const arr = map.get(key);
  if (arr) arr.push(val);
  else map.set(key, [val]);
}

// ─── Escritura (crear / reemplazar grupos y campañas) ────────────────────

async function insertarGrupo(reporteId: string, g: GrupoInput, orden: number, ahora: Date): Promise<void> {
  const grupoId = crypto.randomUUID();
  await db.insert(metaAdsGrupos).values({
    id: grupoId,
    reporteId,
    seccionPrincipal: g.seccionPrincipal || "Campañas RT",
    nombre: g.nombre.trim(),
    subtitulo: textOrNull(g.subtitulo),
    presupuestoTotalActual: numOrNull(g.presupuestoTotalActual),
    observacion: textOrNull(g.observacion),
    sinCampanasActivas: g.sinCampanasActivas ?? false,
    orden,
  });

  for (const [ci, c] of (g.campanas ?? []).entries()) {
    const campanaId = crypto.randomUUID();
    await db.insert(metaAdsCampanas).values({
      id: campanaId,
      grupoId,
      campanaPadreId: null,
      nombre: c.nombre.trim(),
      ubicacionPublico: textOrNull(c.ubicacionPublico),
      presupuesto: numOrNull(c.presupuesto),
      detallePresupuesto: textOrNull(c.detallePresupuesto),
      leads: numOrNull(c.leads) ?? null,
      costoPorLead: numOrNull(c.costoPorLead),
      moneda: textOrNull(c.moneda) ?? "USD",
      estado: c.estado === "Inactiva" ? "Inactiva" : "Activa",
      observaciones: textOrNull(c.observaciones),
      recomendaciones: textOrNull(c.recomendaciones),
      orden: c.orden ?? ci,
      createdAt: ahora,
      updatedAt: ahora,
    });

    for (const [si, s] of (c.segmentaciones ?? []).entries()) {
      await db.insert(metaAdsCampanas).values({
        id: crypto.randomUUID(),
        grupoId,
        campanaPadreId: campanaId,
        nombre: s.nombre.trim(),
        ubicacionPublico: textOrNull(s.ubicacionPublico),
        presupuesto: numOrNull(s.presupuesto),
        detallePresupuesto: null,
        leads: numOrNull(s.leads) ?? null,
        costoPorLead: numOrNull(s.costoPorLead),
        moneda: "USD",
        estado: "Activa",
        observaciones: textOrNull(s.observacion),
        recomendaciones: null,
        orden: s.orden ?? si,
        createdAt: ahora,
        updatedAt: ahora,
      });
    }
  }
}

// ─── Lectura ─────────────────────────────────────────────────────────────

async function nombresUsuarios(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const limpios = [...new Set(ids.filter((x): x is string => !!x))];
  if (limpios.length === 0) return new Map();
  const filas = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre })
    .from(usuarios)
    .where(inArray(usuarios.id, limpios));
  return new Map(filas.map((u) => [u.id, u.nombre]));
}

export async function listarReportes() {
  const [reportes, grupos, campanas] = await Promise.all([
    db.select().from(metaAdsReportes).orderBy(desc(metaAdsReportes.fechaInicio)),
    db.select({ id: metaAdsGrupos.id, reporteId: metaAdsGrupos.reporteId }).from(metaAdsGrupos),
    db
      .select({
        grupoId: metaAdsCampanas.grupoId,
        estado: metaAdsCampanas.estado,
        leads: metaAdsCampanas.leads,
      })
      .from(metaAdsCampanas)
      .where(isNull(metaAdsCampanas.campanaPadreId)),
  ]);

  const reportePorGrupo = new Map(grupos.map((g) => [g.id, g.reporteId]));
  const topLevelPorReporte = new Map<string, { estado: string; leads: number | null }[]>();
  for (const c of campanas) {
    const rid = reportePorGrupo.get(c.grupoId);
    if (!rid) continue;
    pushMap(topLevelPorReporte, rid, { estado: c.estado, leads: c.leads });
  }

  const todosIds = reportes.flatMap((r) => [r.creadoPor, r.actualizadoPor]);
  const mapaNombres = await nombresUsuarios(todosIds);

  return reportes.map((r) => {
    const cs = topLevelPorReporte.get(r.id) ?? [];
    const activas = cs.filter((c) => c.estado === "Activa").length;
    const inactivas = cs.filter((c) => c.estado === "Inactiva").length;
    const totalLeads = cs.reduce((s, c) => s + (c.leads ?? 0), 0);
    return {
      id: r.id,
      fechaInicio: r.fechaInicio,
      fechaFin: r.fechaFin,
      titulo: r.titulo,
      presupuestoTotalActual: r.presupuestoTotalActual,
      creadoPor: r.creadoPor,
      creadoPorNombre: mapaNombres.get(r.creadoPor) ?? null,
      actualizadoPor: r.actualizadoPor,
      actualizadoPorNombre: r.actualizadoPor ? mapaNombres.get(r.actualizadoPor) ?? null : null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      resumen: { totalCampanas: cs.length, activas, inactivas, totalLeads },
    };
  });
}

export async function obtenerReporte(id: string) {
  const [r] = await db.select().from(metaAdsReportes).where(eq(metaAdsReportes.id, id));
  if (!r) throw new Error("Reporte no encontrado");

  const grupos = await db
    .select()
    .from(metaAdsGrupos)
    .where(eq(metaAdsGrupos.reporteId, id))
    .orderBy(asc(metaAdsGrupos.orden));

  const grupoIds = grupos.map((g) => g.id);
  const campanas = grupoIds.length
    ? await db
        .select()
        .from(metaAdsCampanas)
        .where(inArray(metaAdsCampanas.grupoId, grupoIds))
        .orderBy(asc(metaAdsCampanas.orden))
    : [];

  const topLevel = campanas.filter((c) => c.campanaPadreId === null);
  const segmentaciones = campanas.filter((c) => c.campanaPadreId !== null);

  const mapaNombres = await nombresUsuarios([r.creadoPor, r.actualizadoPor]);

  const gruposOut = grupos.map((g) => ({
    id: g.id,
    seccionPrincipal: g.seccionPrincipal,
    nombre: g.nombre,
    subtitulo: g.subtitulo,
    presupuestoTotalActual: g.presupuestoTotalActual,
    observacion: g.observacion,
    sinCampanasActivas: g.sinCampanasActivas,
    orden: g.orden,
    campanas: topLevel
      .filter((c) => c.grupoId === g.id)
      .map((c) => ({
        id: c.id,
        nombre: c.nombre,
        ubicacionPublico: c.ubicacionPublico,
        presupuesto: c.presupuesto,
        detallePresupuesto: c.detallePresupuesto,
        leads: c.leads,
        costoPorLead: c.costoPorLead,
        moneda: c.moneda,
        estado: c.estado,
        observaciones: c.observaciones,
        recomendaciones: c.recomendaciones,
        orden: c.orden,
        segmentaciones: segmentaciones
          .filter((s) => s.campanaPadreId === c.id)
          .map((s) => ({
            id: s.id,
            nombre: s.nombre,
            ubicacionPublico: s.ubicacionPublico,
            presupuesto: s.presupuesto,
            leads: s.leads,
            costoPorLead: s.costoPorLead,
            observacion: s.observaciones,
            orden: s.orden,
          })),
      })),
  }));

  const resumen = gruposOut
    .flatMap((g) => g.campanas)
    .reduce(
      (acc, c) => ({
        totalCampanas: acc.totalCampanas + 1,
        activas: acc.activas + (c.estado === "Activa" ? 1 : 0),
        inactivas: acc.inactivas + (c.estado === "Inactiva" ? 1 : 0),
        totalLeads: acc.totalLeads + (c.leads ?? 0),
      }),
      { totalCampanas: 0, activas: 0, inactivas: 0, totalLeads: 0 },
    );

  return {
    id: r.id,
    fechaInicio: r.fechaInicio,
    fechaFin: r.fechaFin,
    titulo: r.titulo,
    observacionGeneral: r.observacionGeneral,
    presupuestoTotalActual: r.presupuestoTotalActual,
    creadoPor: r.creadoPor,
    creadoPorNombre: mapaNombres.get(r.creadoPor) ?? null,
    actualizadoPor: r.actualizadoPor,
    actualizadoPorNombre: r.actualizadoPor ? mapaNombres.get(r.actualizadoPor) ?? null : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    resumen,
    grupos: gruposOut,
  };
}

// ─── Crear / actualizar / eliminar ───────────────────────────────────────

export async function crearReporte(input: ReporteInput, autorId: string): Promise<unknown> {
  validarReporte(input);

  const [dup] = await db
    .select({ id: metaAdsReportes.id })
    .from(metaAdsReportes)
    .where(and(eq(metaAdsReportes.fechaInicio, input.fechaInicio), eq(metaAdsReportes.fechaFin, input.fechaFin)));
  if (dup) throw new ReporteDuplicadoError(dup.id);

  const id = crypto.randomUUID();
  const ahora = new Date();

  await conTransaccion(async () => {
    await db.insert(metaAdsReportes).values({
      id,
      fechaInicio: input.fechaInicio,
      fechaFin: input.fechaFin,
      titulo: textOrNull(input.titulo),
      observacionGeneral: textOrNull(input.observacionGeneral),
      presupuestoTotalActual: numOrNull(input.presupuestoTotalActual),
      creadoPor: autorId,
      actualizadoPor: autorId,
      createdAt: ahora,
      updatedAt: ahora,
    });

    for (const [gi, g] of input.grupos.entries()) {
      await insertarGrupo(id, g, g.orden ?? gi, ahora);
    }
  });

  await registrarAuditoria({
    entidad: "MetaAdsReporte",
    entidadId: id,
    accion: `Reporte de Meta Ads creado (${input.fechaInicio} → ${input.fechaFin})`,
    autorId,
  });

  return obtenerReporte(id);
}

export async function actualizarReporte(id: string, input: ReporteInput, autorId: string): Promise<unknown> {
  const [r] = await db.select().from(metaAdsReportes).where(eq(metaAdsReportes.id, id));
  if (!r) throw new Error("Reporte no encontrado");
  validarReporte(input);

  const ahora = new Date();

  await conTransaccion(async () => {
    await db
      .update(metaAdsReportes)
      .set({
        fechaInicio: input.fechaInicio,
        fechaFin: input.fechaFin,
        titulo: textOrNull(input.titulo),
        observacionGeneral: textOrNull(input.observacionGeneral),
        presupuestoTotalActual: numOrNull(input.presupuestoTotalActual),
        actualizadoPor: autorId,
        updatedAt: ahora,
      })
      .where(eq(metaAdsReportes.id, id));

    // Se reemplaza todo el contenido: eliminar grupos (cascade borra campañas y
    // segmentaciones) y volver a insertar. Así nunca se mezclan datos viejos y nuevos.
    await db.delete(metaAdsGrupos).where(eq(metaAdsGrupos.reporteId, id));

    for (const [gi, g] of input.grupos.entries()) {
      await insertarGrupo(id, g, g.orden ?? gi, ahora);
    }
  });

  await registrarAuditoria({
    entidad: "MetaAdsReporte",
    entidadId: id,
    accion: `Reporte de Meta Ads actualizado (${input.fechaInicio} → ${input.fechaFin})`,
    autorId,
  });

  return obtenerReporte(id);
}

export async function eliminarReporte(id: string, autorId: string): Promise<{ ok: boolean }> {
  const [r] = await db.select().from(metaAdsReportes).where(eq(metaAdsReportes.id, id));
  if (!r) throw new Error("Reporte no encontrado");

  await conTransaccion(async () => {
    await db.delete(metaAdsReportes).where(eq(metaAdsReportes.id, id));
  });

  await registrarAuditoria({
    entidad: "MetaAdsReporte",
    entidadId: id,
    accion: `Reporte de Meta Ads eliminado (${r.fechaInicio} → ${r.fechaFin})`,
    autorId,
  });

  return { ok: true };
}
