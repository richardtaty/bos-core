import { and, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import { db } from "../db/client";
import { ofertas, ventasIngresos, egresos, usuarios, pagos, registros, personas, pipelines as pipelineTable } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";

// ─── Helpers de fecha ──────────────────────────────────

function inicioDeMes(ym?: string): string {
  if (ym) return `${ym}-01`;
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-01`;
}

function hoy(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
}

function asNumber(v: string | number | null | undefined): number {
  return Number(v ?? 0);
}

// ─── Ofertas ───────────────────────────────────────────

export async function getOfertas() {
  return db.select().from(ofertas).orderBy(ofertas.nombre);
}

// ─── Ventas (ingresos) ────────────────────────────────

export async function getVentasIngresos(ym?: string) {
  const condiciones = [];
  if (ym) {
    const inicio = inicioDeMes(ym);
    const [y, m] = ym.split("-").map(Number);
    const fin = `${y}-${String(m).padStart(2, "0")}-31`;
    condiciones.push(gte(ventasIngresos.fecha, inicio));
    condiciones.push(lte(ventasIngresos.fecha, fin));
  }

  // Ventas manuales
  const manuales = await db
    .select({
      id: ventasIngresos.id,
      fecha: ventasIngresos.fecha,
      ofertaId: ventasIngresos.ofertaId,
      ofertaNombre: ofertas.nombre,
      monto: ventasIngresos.monto,
      nota: ventasIngresos.nota,
      esAnticipo: ventasIngresos.esAnticipo,
      totalDeal: ventasIngresos.totalDeal,
      autorId: ventasIngresos.autorId,
      autorNombre: usuarios.nombre,
    })
    .from(ventasIngresos)
    .innerJoin(ofertas, eq(ventasIngresos.ofertaId, ofertas.id))
    .innerJoin(usuarios, eq(ventasIngresos.autorId, usuarios.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(ventasIngresos.fecha));

  // Pagos del pipeline (unificados)
  let pipelinePagos: any[] = [];
  if (ym) {
    const inicio = inicioDeMes(ym);
    const [y, m] = ym.split("-").map(Number);
    const fin = `${y}-${String(m).padStart(2, "0")}-31`;
    const inicioMesDate = new Date(`${inicio}T00:00:00`);
    const finMesDate = new Date(`${fin}T23:59:59.999`);

    pipelinePagos = await db
      .select({
        id: pagos.id,
        fecha: pagos.fecha,
        pipelineId: registros.pipelineId,
        pipelineNombre: pipelineTable.nombre,
        monto: pagos.monto,
        nota: pagos.nota,
        personaNombre: personas.nombre,
        autorId: pagos.autorId,
        autorNombre: usuarios.nombre,
      })
      .from(pagos)
      .innerJoin(registros, eq(pagos.registroId, registros.id))
      .innerJoin(pipelineTable, eq(registros.pipelineId, pipelineTable.id))
      .leftJoin(personas, eq(registros.personaId, personas.id))
      .innerJoin(usuarios, eq(pagos.autorId, usuarios.id))
      .where(and(gte(pagos.fecha, inicioMesDate), lte(pagos.fecha, finMesDate)))
      .orderBy(desc(pagos.fecha));
  } else {
    pipelinePagos = await db
      .select({
        id: pagos.id,
        fecha: pagos.fecha,
        pipelineId: registros.pipelineId,
        pipelineNombre: pipelineTable.nombre,
        monto: pagos.monto,
        nota: pagos.nota,
        personaNombre: personas.nombre,
        autorId: pagos.autorId,
        autorNombre: usuarios.nombre,
      })
      .from(pagos)
      .innerJoin(registros, eq(pagos.registroId, registros.id))
      .innerJoin(pipelineTable, eq(registros.pipelineId, pipelineTable.id))
      .leftJoin(personas, eq(registros.personaId, personas.id))
      .innerJoin(usuarios, eq(pagos.autorId, usuarios.id))
      .orderBy(desc(pagos.fecha));
  }

  // Mapear pagos del pipeline al mismo formato que ventasIngresos
  const pagosMapeados = pipelinePagos.map((p) => ({
    id: p.id,
    fecha: typeof p.fecha === "string" ? p.fecha : (p.fecha as Date).toISOString().slice(0, 10),
    ofertaId: p.pipelineId,
    ofertaNombre: p.personaNombre
      ? `${p.pipelineNombre} — ${p.personaNombre}`
      : p.pipelineNombre,
    monto: p.monto,
    nota: p.nota,
    esAnticipo: false,
    totalDeal: null as number | null,
    autorId: p.autorId,
    autorNombre: p.autorNombre,
    fuente: "pipeline" as const,
  }));

  // Unificar y ordenar por fecha descendente
  const unificados = [...manuales, ...pagosMapeados]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  return unificados;
}

// ─── Egresos ───────────────────────────────────────────

export async function getEgresos(ym?: string) {
  const condiciones = [];
  if (ym) {
    const inicio = inicioDeMes(ym);
    const [y, m] = ym.split("-").map(Number);
    const fin = `${y}-${String(m).padStart(2, "0")}-31`;
    condiciones.push(gte(egresos.fecha, inicio));
    condiciones.push(lte(egresos.fecha, fin));
  }
  return db
    .select({
      id: egresos.id,
      fecha: egresos.fecha,
      categoria: egresos.categoria,
      ofertaId: egresos.ofertaId,
      ofertaNombre: ofertas.nombre,
      monto: egresos.monto,
      nota: egresos.nota,
      autorId: egresos.autorId,
      autorNombre: usuarios.nombre,
    })
    .from(egresos)
    .leftJoin(ofertas, eq(egresos.ofertaId, ofertas.id))
    .innerJoin(usuarios, eq(egresos.autorId, usuarios.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(egresos.fecha));
}

// ─── Crear / eliminar ─────────────────────────────────

export async function createVentaIngreso(data: {
  fecha: string;
  ofertaId: string;
  monto: number;
  nota?: string;
  esAnticipo?: boolean;
  totalDeal?: number;
  autorId: string;
}) {
  if (!data.fecha || !data.ofertaId || !data.monto) {
    throw new Error("Fecha, oferta y monto son obligatorios");
  }
  if (data.esAnticipo && !data.totalDeal) {
    throw new Error("Si es anticipo, el total del deal es obligatorio");
  }
  const id = crypto.randomUUID();
  await db.insert(ventasIngresos).values({
    id,
    fecha: data.fecha,
    ofertaId: data.ofertaId,
    monto: data.monto,
    nota: data.nota ?? null,
    esAnticipo: data.esAnticipo ?? false,
    totalDeal: data.totalDeal ?? null,
    autorId: data.autorId,
  });
  await registrarAuditoria({
    entidad: "venta_ingreso",
    entidadId: id,
    accion: "crear",
    autorId: data.autorId,
    detalle: `Venta de $${data.monto.toLocaleString("en-US")}`,
  });
  return { id };
}

export async function deleteVentaIngreso(id: string, autorId: string) {
  const [existe] = await db.select().from(ventasIngresos).where(eq(ventasIngresos.id, id));
  if (!existe) throw new Error("Venta no encontrada");
  await db.delete(ventasIngresos).where(eq(ventasIngresos.id, id));
  await registrarAuditoria({
    entidad: "venta_ingreso",
    entidadId: id,
    accion: "eliminar",
    autorId,
    detalle: "Venta eliminada",
  });
  return { ok: true };
}

export async function createEgreso(data: {
  fecha: string;
  categoria: string;
  monto: number;
  ofertaId?: string;
  nota?: string;
  autorId: string;
}) {
  if (!data.fecha || !data.categoria || !data.monto) {
    throw new Error("Fecha, categoría y monto son obligatorios");
  }
  const id = crypto.randomUUID();
  await db.insert(egresos).values({
    id,
    fecha: data.fecha,
    categoria: data.categoria as "Nómina" | "Aviones" | "Hoteles" | "Transportes" | "Comidas" | "Otro",
    monto: data.monto,
    ofertaId: data.ofertaId ?? null,
    nota: data.nota ?? null,
    autorId: data.autorId,
  });
  await registrarAuditoria({
    entidad: "egreso",
    entidadId: id,
    accion: "crear",
    autorId: data.autorId,
    detalle: `Egreso de $${data.monto.toLocaleString("en-US")} — ${data.categoria}`,
  });
  return { id };
}

export async function deleteEgreso(id: string, autorId: string) {
  const [existe] = await db.select().from(egresos).where(eq(egresos.id, id));
  if (!existe) throw new Error("Egreso no encontrado");
  await db.delete(egresos).where(eq(egresos.id, id));
  await registrarAuditoria({
    entidad: "egreso",
    entidadId: id,
    accion: "eliminar",
    autorId,
    detalle: "Egreso eliminado",
  });
  return { ok: true };
}

// ─── Resumen del mes ──────────────────────────────────

export async function resumenMensual(ym?: string) {
  const inicio = inicioDeMes(ym);
  const ahora = ym ? new Date(`${ym}-01`) : new Date();
  const y = ahora.getFullYear();
  const m = ahora.getMonth() + 1;
  const fin = `${y}-${String(m).padStart(2, "0")}-31`;

  // Ventas manuales (motor de ingresos)
  const [facturadoManual] = await db
    .select({ total: sum(ventasIngresos.monto) })
    .from(ventasIngresos)
    .where(and(gte(ventasIngresos.fecha, inicio), lte(ventasIngresos.fecha, fin)));

  // Pagos reales del pipeline (unificado)
  const inicioMesDate = new Date(`${inicio}T00:00:00`);
  const finMesDate = new Date(`${fin}T23:59:59.999`);
  const [facturadoPipeline] = await db
    .select({ total: sum(pagos.monto) })
    .from(pagos)
    .where(and(gte(pagos.fecha, inicioMesDate), lte(pagos.fecha, finMesDate)));

  const [gastos] = await db
    .select({ total: sum(egresos.monto) })
    .from(egresos)
    .where(and(gte(egresos.fecha, inicio), lte(egresos.fecha, fin)));

  const todas = await db.select({ target: ofertas.target }).from(ofertas);
  const metaMensual = todas.reduce((s, o) => s + o.target, 0);

  const facturadoVal = asNumber(facturadoManual?.total) + asNumber(facturadoPipeline?.total);
  const gastosVal = asNumber(gastos?.total);
  const gananciaNeta = facturadoVal - gastosVal;
  const pctMeta = metaMensual > 0 ? Math.round((facturadoVal / metaMensual) * 100) : 0;
  const margen = facturadoVal > 0 ? Math.round((gananciaNeta / facturadoVal) * 100) : 0;

  return {
    mes: ym ?? `${y}-${String(m).padStart(2, "0")}`,
    metaMensual,
    facturado: facturadoVal,
    pctMeta,
    gastos: gastosVal,
    gananciaNeta,
    margen,
  };
}

// ─── Resumen HOY ──────────────────────────────────────

export async function resumenHoy() {
  const dia = hoy();

  // Ventas manuales del día
  const [facturadoManual] = await db
    .select({ total: sum(ventasIngresos.monto) })
    .from(ventasIngresos)
    .where(eq(ventasIngresos.fecha, dia));

  // Pagos reales del pipeline hoy
  const inicioHoy = new Date(`${dia}T00:00:00`);
  const finHoy = new Date(`${dia}T23:59:59.999`);
  const [facturadoPipeline] = await db
    .select({ total: sum(pagos.monto) })
    .from(pagos)
    .where(and(gte(pagos.fecha, inicioHoy), lte(pagos.fecha, finHoy)));

  const facturadoHoy = asNumber(facturadoManual?.total) + asNumber(facturadoPipeline?.total);
  const metaDiaria = 10000;
  const pct = Math.round((facturadoHoy / metaDiaria) * 100);

  return {
    fecha: dia,
    facturado: facturadoHoy,
    metaDiaria,
    pct,
    cumplida: facturadoHoy >= metaDiaria,
  };
}

// ─── Ventas por oferta (progreso vs meta) ─────────────

export async function ventasPorOferta(ym?: string) {
  const inicio = inicioDeMes(ym);
  const ahora = ym ? new Date(`${ym}-01`) : new Date();
  const y = ahora.getFullYear();
  const m = ahora.getMonth() + 1;
  const fin = `${y}-${String(m).padStart(2, "0")}-31`;

  const todas = await db.select().from(ofertas).orderBy(ofertas.nombre);

  // ── Pagos del pipeline agrupados por pipeline ──
  const inicioMesDate = new Date(`${inicio}T00:00:00`);
  const finMesDate = new Date(`${fin}T23:59:59.999`);

  const pagosPorPipeline = await db
    .select({
      pipelineNombre: pipelineTable.nombre,
      total: sum(pagos.monto),
    })
    .from(pagos)
    .innerJoin(registros, eq(pagos.registroId, registros.id))
    .innerJoin(pipelineTable, eq(registros.pipelineId, pipelineTable.id))
    .where(and(gte(pagos.fecha, inicioMesDate), lte(pagos.fecha, finMesDate)))
    .groupBy(pipelineTable.nombre);

  const resultados = await Promise.all(
    todas.map(async (o) => {
      // Ventas manuales de esta oferta
      const [totalManual] = await db
        .select({ total: sum(ventasIngresos.monto) })
        .from(ventasIngresos)
        .where(and(eq(ventasIngresos.ofertaId, o.id), gte(ventasIngresos.fecha, inicio), lte(ventasIngresos.fecha, fin)));

      // Pagos reales matcheados por nombre de pipeline ≈ nombre de oferta
      const match = pagosPorPipeline.find(
        p => p.pipelineNombre.toLowerCase().includes(o.nombre.toLowerCase()) ||
             o.nombre.toLowerCase().includes(p.pipelineNombre.toLowerCase())
      );

      const actual = asNumber(totalManual?.total) + asNumber(match?.total);
      const pct = o.target > 0 ? Math.round((actual / o.target) * 100) : 0;

      return {
        ofertaId: o.id,
        nombre: o.nombre,
        categoria: o.categoria,
        target: o.target,
        ticket: o.ticket,
        actual,
        pct,
      };
    })
  );

  return resultados;
}

// ─── Ticker (datos reales del CRM, sin restricción de rol) ──

// Zona horaria del negocio (Florida = America/New_York)
const ZONA = "America/New_York";

function fechaET(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function offsetETMinutos(fechaRef: Date): number {
  const comoUTC = new Date(fechaRef.toLocaleString("en-US", { timeZone: "UTC" }));
  const comoET = new Date(fechaRef.toLocaleString("en-US", { timeZone: ZONA }));
  return Math.round((comoUTC.getTime() - comoET.getTime()) / 60000);
}

function inicioDelDiaET(ymd: string, offsetMin: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offsetMin * 60000);
}

export async function tickerIngresos() {
  const ahora = new Date();
  const dia = fechaET(ahora);
  const offsetMin = offsetETMinutos(ahora);

  // ─── HOY: total de pagos reales del día ──────────
  const inicioHoy = inicioDelDiaET(dia, offsetMin);
  const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60 * 1000 - 1);

  const [facturadoHoy] = await db
    .select({ total: sum(pagos.monto) })
    .from(pagos)
    .where(and(gte(pagos.fecha, inicioHoy), lte(pagos.fecha, finHoy)));

  const hoyFacturado = asNumber(facturadoHoy?.total);
  const metaDiaria = 10000;
  const pctHoy = Math.round((hoyFacturado / metaDiaria) * 100);

  // ─── Últimos 7 días de facturación real ─────────
  const ultimos7dias: { fecha: string; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(ahora);
    d.setDate(d.getDate() - i);
    const ymd = fechaET(d);
    const inicioDia = inicioDelDiaET(ymd, offsetMin);
    const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000 - 1);

    const [res] = await db
      .select({ total: sum(pagos.monto) })
      .from(pagos)
      .where(and(gte(pagos.fecha, inicioDia), lte(pagos.fecha, finDia)));

    const diaSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()];
    ultimos7dias.push({ fecha: `${diaSemana} ${d.getDate()}`, total: asNumber(res?.total) });
  }

  // ─── Por pipeline (línea de negocio) ────────────
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999);

  const todas = await db.select().from(ofertas).orderBy(ofertas.nombre);

  // Pagos del mes agrupados por pipeline
  const pagosPorPipeline = await db
    .select({
      pipelineNombre: pipelineTable.nombre,
      total: sum(pagos.monto),
    })
    .from(pagos)
    .innerJoin(registros, eq(pagos.registroId, registros.id))
    .innerJoin(pipelineTable, eq(registros.pipelineId, pipelineTable.id))
    .where(and(gte(pagos.fecha, inicioMes), lte(pagos.fecha, finMes)))
    .groupBy(pipelineTable.nombre);

  // Combinar ofertas con datos reales de pagos
  const resultados = todas.map(o => {
    const match = pagosPorPipeline.find(
      p => p.pipelineNombre.toLowerCase().includes(o.nombre.toLowerCase()) ||
           o.nombre.toLowerCase().includes(p.pipelineNombre.toLowerCase())
    );
    const actual = match ? asNumber(match.total) : 0;
    const pct = o.target > 0 ? Math.round((actual / o.target) * 100) : 0;
    return { nombre: o.nombre, categoria: o.categoria, target: o.target, actual, pct };
  });

  return {
    hoy: { facturado: hoyFacturado, meta: metaDiaria, pct: pctHoy },
    ultimos7dias,
    ofertas: resultados,
  };
}

// ─── Anticipos pendientes ─────────────────────────────

export async function adelantosPendientes() {
  // ── Anticipos manuales (motor de ingresos) ──
  const filasManuales = await db
    .select({
      id: ventasIngresos.id,
      fecha: ventasIngresos.fecha,
      ofertaId: ventasIngresos.ofertaId,
      ofertaNombre: ofertas.nombre,
      monto: ventasIngresos.monto,
      totalDeal: ventasIngresos.totalDeal,
      nota: ventasIngresos.nota,
    })
    .from(ventasIngresos)
    .innerJoin(ofertas, eq(ventasIngresos.ofertaId, ofertas.id))
    .where(eq(ventasIngresos.esAnticipo, true));

  const manuales = filasManuales
    .map((f) => ({
      ...f,
      totalDeal: f.totalDeal ?? f.monto,
      saldoPendiente: (f.totalDeal ?? f.monto) - f.monto,
    }))
    .filter((f) => f.saldoPendiente > 0);

  // ── Saldos reales del pipeline (deals con pagos parciales) ──
  const dealsConSaldo = await db
    .select({
      id: registros.id,
      valor: registros.valor,
      pipelineId: registros.pipelineId,
      pipelineNombre: pipelineTable.nombre,
      personaNombre: personas.nombre,
      createdAt: registros.createdAt,
      totalPagado: sum(pagos.monto),
    })
    .from(registros)
    .innerJoin(pipelineTable, eq(registros.pipelineId, pipelineTable.id))
    .leftJoin(personas, eq(registros.personaId, personas.id))
    .leftJoin(pagos, eq(registros.id, pagos.registroId))
    .groupBy(registros.id)
    .having(sql`COALESCE(${registros.valor}, 0) > COALESCE(SUM(${pagos.monto}), 0)`);

  const pipelineSaldos = dealsConSaldo
    .filter((d) => (d.valor ?? 0) > asNumber(d.totalPagado))
    .map((d) => ({
      id: d.id,
      fecha: d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : "",
      ofertaId: d.pipelineId,
      ofertaNombre: d.personaNombre
        ? `${d.pipelineNombre} — ${d.personaNombre}`
        : d.pipelineNombre,
      monto: asNumber(d.totalPagado),
      totalDeal: d.valor ?? 0,
      saldoPendiente: (d.valor ?? 0) - asNumber(d.totalPagado),
      nota: d.personaNombre ?? null,
    }))
    .sort((a, b) => b.saldoPendiente - a.saldoPendiente);

  // ── Unificar ambas fuentes ──
  const todos = [...manuales, ...pipelineSaldos]
    .sort((a, b) => b.saldoPendiente - a.saldoPendiente);

  return todos;
}

// ─── Egresos por categoría ────────────────────────────

export async function egresosPorCategoria(ym?: string) {
  const inicio = inicioDeMes(ym);
  const ahora = ym ? new Date(`${ym}-01`) : new Date();
  const y = ahora.getFullYear();
  const m = ahora.getMonth() + 1;
  const fin = `${y}-${String(m).padStart(2, "0")}-31`;

  const filas = await db
    .select({ categoria: egresos.categoria, total: sum(egresos.monto) })
    .from(egresos)
    .where(and(gte(egresos.fecha, inicio), lte(egresos.fecha, fin)))
    .groupBy(egresos.categoria);

  const totalGeneral = filas.reduce((s, f) => s + asNumber(f.total), 0);

  return filas.map((f) => ({
    categoria: f.categoria,
    monto: asNumber(f.total),
    pct: totalGeneral > 0 ? Math.round((asNumber(f.total) / totalGeneral) * 100) : 0,
  }));
}

// ─── Rentabilidad por línea ───────────────────────────

export async function rentabilidadPorLinea(ym?: string) {
  const inicio = inicioDeMes(ym);
  const ahora = ym ? new Date(`${ym}-01`) : new Date();
  const y = ahora.getFullYear();
  const m = ahora.getMonth() + 1;
  const fin = `${y}-${String(m).padStart(2, "0")}-31`;

  const todas = await db.select().from(ofertas).orderBy(ofertas.nombre);

  // ── Pagos del pipeline agrupados por pipeline ──
  const inicioMesDate = new Date(`${inicio}T00:00:00`);
  const finMesDate = new Date(`${fin}T23:59:59.999`);

  const pagosPorPipeline = await db
    .select({
      pipelineNombre: pipelineTable.nombre,
      total: sum(pagos.monto),
    })
    .from(pagos)
    .innerJoin(registros, eq(pagos.registroId, registros.id))
    .innerJoin(pipelineTable, eq(registros.pipelineId, pipelineTable.id))
    .where(and(gte(pagos.fecha, inicioMesDate), lte(pagos.fecha, finMesDate)))
    .groupBy(pipelineTable.nombre);

  const resultados: { ofertaId: string | null; ofertaNombre: string; ingresos: number; egresos: number; neto: number }[] = await Promise.all(
    todas.map(async (o) => {
      // Ventas manuales de esta oferta
      const [ingManual] = await db
        .select({ total: sum(ventasIngresos.monto) })
        .from(ventasIngresos)
        .where(and(eq(ventasIngresos.ofertaId, o.id), gte(ventasIngresos.fecha, inicio), lte(ventasIngresos.fecha, fin)));

      // Pagos reales matcheados por nombre
      const match = pagosPorPipeline.find(
        p => p.pipelineNombre.toLowerCase().includes(o.nombre.toLowerCase()) ||
             o.nombre.toLowerCase().includes(p.pipelineNombre.toLowerCase())
      );

      const [egr] = await db
        .select({ total: sum(egresos.monto) })
        .from(egresos)
        .where(and(eq(egresos.ofertaId, o.id), gte(egresos.fecha, inicio), lte(egresos.fecha, fin)));

      const ingresos = asNumber(ingManual?.total) + asNumber(match?.total);
      const gastos = asNumber(egr?.total);

      return {
        ofertaId: o.id,
        ofertaNombre: o.nombre,
        ingresos,
        egresos: gastos,
        neto: ingresos - gastos,
      };
    })
  );

  // Gastos generales (sin ofertaId)
  const [gastosGenerales] = await db
    .select({ total: sum(egresos.monto) })
    .from(egresos)
    .where(and(gte(egresos.fecha, inicio), lte(egresos.fecha, fin), sql`${egresos.ofertaId} IS NULL`));

  const gastosGenVal = asNumber(gastosGenerales?.total);
  if (gastosGenVal > 0) {
    resultados.push({
      ofertaId: null,
      ofertaNombre: "Gastos generales",
      ingresos: 0,
      egresos: gastosGenVal,
      neto: -gastosGenVal,
    });
  }

  return resultados;
}

// ─── Actividad reciente ───────────────────────────────

export async function actividadReciente(limite = 12) {
  // Ventas manuales (motor de ingresos)
  const ventas = await db
    .select({
      id: ventasIngresos.id,
      fecha: ventasIngresos.fecha,
      monto: ventasIngresos.monto,
      ofertaNombre: ofertas.nombre,
      nota: ventasIngresos.nota,
    })
    .from(ventasIngresos)
    .innerJoin(ofertas, eq(ventasIngresos.ofertaId, ofertas.id))
    .orderBy(desc(ventasIngresos.fecha))
    .limit(limite);

  // Pagos reales del pipeline (unificado)
  const pipelinePagos = await db
    .select({
      id: pagos.id,
      fecha: pagos.fecha,
      monto: pagos.monto,
      pipelineNombre: pipelineTable.nombre,
      personaNombre: personas.nombre,
      nota: pagos.nota,
    })
    .from(pagos)
    .innerJoin(registros, eq(pagos.registroId, registros.id))
    .innerJoin(pipelineTable, eq(registros.pipelineId, pipelineTable.id))
    .leftJoin(personas, eq(registros.personaId, personas.id))
    .orderBy(desc(pagos.fecha))
    .limit(limite);

  const gastos = await db
    .select({
      id: egresos.id,
      fecha: egresos.fecha,
      monto: egresos.monto,
      ofertaNombre: ofertas.nombre,
      categoria: egresos.categoria,
      nota: egresos.nota,
    })
    .from(egresos)
    .leftJoin(ofertas, eq(egresos.ofertaId, ofertas.id))
    .orderBy(desc(egresos.fecha))
    .limit(limite);

  const unificados = [
    ...ventas.map((v) => ({ tipo: "ingreso" as const, ...v, categoria: undefined as string | undefined })),
    ...pipelinePagos.map((p) => ({
      tipo: "ingreso" as const,
      id: p.id,
      fecha: typeof p.fecha === "string" ? p.fecha : (p.fecha as Date).toISOString().slice(0, 10),
      monto: p.monto,
      ofertaNombre: p.pipelineNombre,
      nota: p.personaNombre ? `${p.personaNombre}${p.nota ? ` — ${p.nota}` : ""}` : (p.nota ?? null),
      categoria: undefined as string | undefined,
    })),
    ...gastos.map((g) => ({ tipo: "egreso" as const, ...g })),
  ]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .slice(0, limite);

  return unificados;
}
