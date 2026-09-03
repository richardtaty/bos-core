import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import {
  bmfFundings,
  bmfLenders,
  bmfLlamadas,
  bmfComisiones,
  personas,
  usuarios,
} from "../db/schema";

// ─── Producción por Agente ───────────────────────────────

export async function produccionPorAgente(filtros: { desde?: string; hasta?: string }) {
  const condiciones = [
    filtros.desde ? gte(bmfFundings.fechaCreacion, new Date(filtros.desde)) : undefined,
    filtros.hasta ? lte(bmfFundings.fechaCreacion, new Date(filtros.hasta)) : undefined,
  ].filter(Boolean);

  const filas = await db
    .select({
      agenteId: bmfFundings.agenteId,
      montoSolicitado: bmfFundings.montoSolicitado,
      montoAprobado: bmfFundings.montoAprobado,
      estado: bmfFundings.estado,
    })
    .from(bmfFundings)
    .where(condiciones.length ? and(...condiciones) : undefined);

  // Agrupar por agente
  const porAgente = new Map<string, { agenteId: string; totalFundings: number; montoSolicitado: number; aprobados: number; montoAprobado: number }>();
  for (const f of filas) {
    if (!porAgente.has(f.agenteId)) {
      porAgente.set(f.agenteId, { agenteId: f.agenteId, totalFundings: 0, montoSolicitado: 0, aprobados: 0, montoAprobado: 0 });
    }
    const a = porAgente.get(f.agenteId)!;
    a.totalFundings++;
    a.montoSolicitado += f.montoSolicitado ?? 0;
    if (f.estado === "aprobado" || f.estado === "funding_enviado") {
      a.aprobados++;
      a.montoAprobado += f.montoAprobado ?? 0;
    }
  }

  // Enriquecer con nombres
  const resultado = [];
  for (const [, a] of porAgente) {
    const [u] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, a.agenteId));
    resultado.push({
      agenteId: a.agenteId,
      agenteNombre: u?.nombre ?? "",
      totalFundings: a.totalFundings,
      montoSolicitado: a.montoSolicitado,
      aprobados: a.aprobados,
      montoAprobado: a.montoAprobado,
      conversion: a.totalFundings ? Math.round((a.aprobados / a.totalFundings) * 100) : 0,
    });
  }
  return resultado.sort((a, b) => b.montoSolicitado - a.montoSolicitado);
}

// ─── Producción por Lender ───────────────────────────────

export async function produccionPorLender(filtros: { desde?: string; hasta?: string }) {
  const condiciones = [
    filtros.desde ? gte(bmfFundings.fechaCreacion, new Date(filtros.desde)) : undefined,
    filtros.hasta ? lte(bmfFundings.fechaCreacion, new Date(filtros.hasta)) : undefined,
  ].filter(Boolean);

  const filas = await db
    .select({
      lenderId: bmfFundings.lenderId,
      montoSolicitado: bmfFundings.montoSolicitado,
      montoAprobado: bmfFundings.montoAprobado,
      estado: bmfFundings.estado,
    })
    .from(bmfFundings)
    .where(condiciones.length ? and(...condiciones) : undefined);

  const porLender = new Map<string, { lenderId: string; totalFundings: number; montoSolicitado: number; aprobados: number; montoAprobado: number }>();
  for (const f of filas) {
    const lid = f.lenderId ?? "sin-lender";
    if (!porLender.has(lid)) {
      porLender.set(lid, { lenderId: lid, totalFundings: 0, montoSolicitado: 0, aprobados: 0, montoAprobado: 0 });
    }
    const a = porLender.get(lid)!;
    a.totalFundings++;
    a.montoSolicitado += f.montoSolicitado ?? 0;
    if (f.estado === "aprobado" || f.estado === "funding_enviado") {
      a.aprobados++;
      a.montoAprobado += f.montoAprobado ?? 0;
    }
  }

  const resultado = [];
  for (const [, a] of porLender) {
    let nombre = "Sin lender";
    if (a.lenderId !== "sin-lender") {
      const [l] = await db.select({ nombre: bmfLenders.nombre }).from(bmfLenders).where(eq(bmfLenders.id, a.lenderId));
      nombre = l?.nombre ?? "Sin lender";
    }
    resultado.push({
      lenderId: a.lenderId,
      lenderNombre: nombre,
      totalFundings: a.totalFundings,
      montoSolicitado: a.montoSolicitado,
      aprobados: a.aprobados,
      montoAprobado: a.montoAprobado,
      conversion: a.totalFundings ? Math.round((a.aprobados / a.totalFundings) * 100) : 0,
    });
  }
  return resultado.sort((a, b) => b.montoSolicitado - a.montoSolicitado);
}

// ─── Funding Mensual ─────────────────────────────────────

export async function fundingMensual(anio?: number) {
  const year = anio ?? new Date().getFullYear();
  const inicio = new Date(year, 0, 1);
  const fin = new Date(year + 1, 0, 1);

  const filas = await db
    .select({
      fechaCreacion: bmfFundings.fechaCreacion,
      estado: bmfFundings.estado,
      montoSolicitado: bmfFundings.montoSolicitado,
      montoAprobado: bmfFundings.montoAprobado,
    })
    .from(bmfFundings)
    .where(and(
      gte(bmfFundings.fechaCreacion, inicio),
      lte(bmfFundings.fechaCreacion, fin)
    ));

  const porMes = new Map<number, { mes: number; solicitado: number; aprobado: number; count: number; ganados: number; perdidos: number }>();
  for (const f of filas) {
    const mes = f.fechaCreacion.getMonth() + 1;
    if (!porMes.has(mes)) {
      porMes.set(mes, { mes, solicitado: 0, aprobado: 0, count: 0, ganados: 0, perdidos: 0 });
    }
    const m = porMes.get(mes)!;
    m.solicitado += f.montoSolicitado ?? 0;
    m.aprobado += f.montoAprobado ?? 0;
    m.count++;
    if (f.estado === "aprobado" || f.estado === "funding_enviado") m.ganados++;
    if (f.estado === "perdido") m.perdidos++;
  }

  return Array.from(porMes.values()).sort((a, b) => a.mes - b.mes);
}

// ─── Pipeline Report ─────────────────────────────────────

export async function pipelineReport() {
  const filas = await db
    .select({
      estado: bmfFundings.estado,
      montoSolicitado: bmfFundings.montoSolicitado,
    })
    .from(bmfFundings);

  const porEstado = new Map<string, { estado: string; count: number; montoTotal: number }>();
  for (const f of filas) {
    if (!porEstado.has(f.estado)) {
      porEstado.set(f.estado, { estado: f.estado, count: 0, montoTotal: 0 });
    }
    const e = porEstado.get(f.estado)!;
    e.count++;
    e.montoTotal += f.montoSolicitado ?? 0;
  }

  return Array.from(porEstado.values());
}

// ─── Reporte de Llamadas ────────────────────────────────

export async function reporteLlamadas(filtros: { desde?: string; hasta?: string }) {
  const condiciones = [
    filtros.desde ? gte(bmfLlamadas.fecha, new Date(filtros.desde)) : undefined,
    filtros.hasta ? lte(bmfLlamadas.fecha, new Date(filtros.hasta)) : undefined,
  ].filter(Boolean);

  const filas = await db
    .select({
      agenteId: bmfLlamadas.agenteId,
      resultado: bmfLlamadas.resultado,
    })
    .from(bmfLlamadas)
    .where(condiciones.length ? and(...condiciones) : undefined);

  const porAgente = new Map<string, { agenteId: string; total: number; porResultado: Record<string, number> }>();
  for (const f of filas) {
    if (!porAgente.has(f.agenteId)) {
      porAgente.set(f.agenteId, { agenteId: f.agenteId, total: 0, porResultado: {} });
    }
    const a = porAgente.get(f.agenteId)!;
    a.total++;
    a.porResultado[f.resultado] = (a.porResultado[f.resultado] ?? 0) + 1;
  }

  const resultado = [];
  for (const [, a] of porAgente) {
    const [u] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, a.agenteId));
    resultado.push({
      agenteId: a.agenteId,
      agenteNombre: u?.nombre ?? "",
      total: a.total,
      porResultado: a.porResultado,
    });
  }
  return resultado.sort((a, b) => b.total - a.total);
}

// ─── Ranking de Agentes ──────────────────────────────────

export async function rankingAgentes(filtros: { desde?: string; hasta?: string }) {
  const condiciones = [
    filtros.desde ? gte(bmfFundings.fechaCreacion, new Date(filtros.desde)) : undefined,
    filtros.hasta ? lte(bmfFundings.fechaCreacion, new Date(filtros.hasta)) : undefined,
  ].filter(Boolean);

  const filas = await db
    .select({
      agenteId: bmfFundings.agenteId,
      montoSolicitado: bmfFundings.montoSolicitado,
      montoAprobado: bmfFundings.montoAprobado,
      estado: bmfFundings.estado,
    })
    .from(bmfFundings)
    .where(condiciones.length ? and(...condiciones) : undefined);

  const porAgente = new Map<string, { agenteId: string; totalFundings: number; montoSolicitado: number; montoAprobado: number }>();
  for (const f of filas) {
    if (!porAgente.has(f.agenteId)) {
      porAgente.set(f.agenteId, { agenteId: f.agenteId, totalFundings: 0, montoSolicitado: 0, montoAprobado: 0 });
    }
    const a = porAgente.get(f.agenteId)!;
    a.totalFundings++;
    a.montoSolicitado += f.montoSolicitado ?? 0;
    if (f.estado === "aprobado" || f.estado === "funding_enviado") {
      a.montoAprobado += f.montoAprobado ?? 0;
    }
  }

  // Llamadas
  const llamadasRows = await db
    .select({ agenteId: bmfLlamadas.agenteId })
    .from(bmfLlamadas)
    .where(condiciones.length ? and(...condiciones) : undefined);

  const llamadasPorAgente = new Map<string, number>();
  for (const l of llamadasRows) {
    llamadasPorAgente.set(l.agenteId, (llamadasPorAgente.get(l.agenteId) ?? 0) + 1);
  }

  const resultado = [];
  for (const [, a] of porAgente) {
    const [u] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, a.agenteId));
    resultado.push({
      agenteId: a.agenteId,
      agenteNombre: u?.nombre ?? "",
      totalFundings: a.totalFundings,
      montoSolicitado: a.montoSolicitado,
      montoAprobado: a.montoAprobado,
      llamadas: llamadasPorAgente.get(a.agenteId) ?? 0,
      conversion: a.totalFundings ? Math.round(((a.montoAprobado > 0 ? 1 : 0)) * 100) : 0,
    });
  }
  return resultado.sort((a, b) => b.montoAprobado - a.montoAprobado);
}

// ─── KPIs de Agente Individual ──────────────────────────

export async function kpiAgente(agenteId: string) {
  const fundings = await db
    .select({
      estado: bmfFundings.estado,
      montoSolicitado: bmfFundings.montoSolicitado,
      montoAprobado: bmfFundings.montoAprobado,
    })
    .from(bmfFundings)
    .where(eq(bmfFundings.agenteId, agenteId));

  const aprobados = fundings.filter((f) => f.estado === "aprobado" || f.estado === "funding_enviado");

  const llamadas = await db
    .select({ id: bmfLlamadas.id })
    .from(bmfLlamadas)
    .where(eq(bmfLlamadas.agenteId, agenteId));

  const comisiones = await db
    .select({ monto: bmfComisiones.monto, estado: bmfComisiones.estado })
    .from(bmfComisiones)
    .where(and(
      eq(bmfComisiones.agenteId, agenteId),
      eq(bmfComisiones.estado, "pendiente")
    ));

  const clientes = await db
    .select({ id: personas.id })
    .from(personas)
    .where(eq(personas.responsableId, agenteId));

  return {
    totalFundings: fundings.length,
    montoSolicitado: fundings.reduce((s, f) => s + (f.montoSolicitado ?? 0), 0),
    montoAprobado: fundings.reduce((s, f) => s + (f.montoAprobado ?? 0), 0),
    aprobados: aprobados.length,
    conversion: fundings.length ? Math.round((aprobados.length / fundings.length) * 100) : 0,
    totalLlamadas: llamadas.length,
    comisionesPendientes: comisiones.length,
    comisionesTotal: comisiones.reduce((s, c) => s + (c.monto ?? 0), 0),
    clientes: clientes.length,
  };
}
