"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.produccionPorAgente = produccionPorAgente;
exports.produccionPorLender = produccionPorLender;
exports.fundingMensual = fundingMensual;
exports.pipelineReport = pipelineReport;
exports.reporteLlamadas = reporteLlamadas;
exports.rankingAgentes = rankingAgentes;
exports.kpiAgente = kpiAgente;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
// ─── Producción por Agente ───────────────────────────────
async function produccionPorAgente(filtros) {
    const condiciones = [
        filtros.desde ? (0, drizzle_orm_1.gte)(schema_1.bmfFundings.fechaCreacion, new Date(filtros.desde)) : undefined,
        filtros.hasta ? (0, drizzle_orm_1.lte)(schema_1.bmfFundings.fechaCreacion, new Date(filtros.hasta)) : undefined,
    ].filter(Boolean);
    const filas = await client_1.db
        .select({
        agenteId: schema_1.bmfFundings.agenteId,
        montoSolicitado: schema_1.bmfFundings.montoSolicitado,
        montoAprobado: schema_1.bmfFundings.montoAprobado,
        estado: schema_1.bmfFundings.estado,
    })
        .from(schema_1.bmfFundings)
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined);
    // Agrupar por agente
    const porAgente = new Map();
    for (const f of filas) {
        if (!porAgente.has(f.agenteId)) {
            porAgente.set(f.agenteId, { agenteId: f.agenteId, totalFundings: 0, montoSolicitado: 0, aprobados: 0, montoAprobado: 0 });
        }
        const a = porAgente.get(f.agenteId);
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
        const [u] = await client_1.db.select({ nombre: schema_1.usuarios.nombre }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, a.agenteId));
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
async function produccionPorLender(filtros) {
    const condiciones = [
        filtros.desde ? (0, drizzle_orm_1.gte)(schema_1.bmfFundings.fechaCreacion, new Date(filtros.desde)) : undefined,
        filtros.hasta ? (0, drizzle_orm_1.lte)(schema_1.bmfFundings.fechaCreacion, new Date(filtros.hasta)) : undefined,
    ].filter(Boolean);
    const filas = await client_1.db
        .select({
        lenderId: schema_1.bmfFundings.lenderId,
        montoSolicitado: schema_1.bmfFundings.montoSolicitado,
        montoAprobado: schema_1.bmfFundings.montoAprobado,
        estado: schema_1.bmfFundings.estado,
    })
        .from(schema_1.bmfFundings)
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined);
    const porLender = new Map();
    for (const f of filas) {
        const lid = f.lenderId ?? "sin-lender";
        if (!porLender.has(lid)) {
            porLender.set(lid, { lenderId: lid, totalFundings: 0, montoSolicitado: 0, aprobados: 0, montoAprobado: 0 });
        }
        const a = porLender.get(lid);
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
            const [l] = await client_1.db.select({ nombre: schema_1.bmfLenders.nombre }).from(schema_1.bmfLenders).where((0, drizzle_orm_1.eq)(schema_1.bmfLenders.id, a.lenderId));
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
async function fundingMensual(anio) {
    const year = anio ?? new Date().getFullYear();
    const inicio = new Date(year, 0, 1);
    const fin = new Date(year + 1, 0, 1);
    const filas = await client_1.db
        .select({
        fechaCreacion: schema_1.bmfFundings.fechaCreacion,
        estado: schema_1.bmfFundings.estado,
        montoSolicitado: schema_1.bmfFundings.montoSolicitado,
        montoAprobado: schema_1.bmfFundings.montoAprobado,
    })
        .from(schema_1.bmfFundings)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(schema_1.bmfFundings.fechaCreacion, inicio), (0, drizzle_orm_1.lte)(schema_1.bmfFundings.fechaCreacion, fin)));
    const porMes = new Map();
    for (const f of filas) {
        const mes = f.fechaCreacion.getMonth() + 1;
        if (!porMes.has(mes)) {
            porMes.set(mes, { mes, solicitado: 0, aprobado: 0, count: 0, ganados: 0, perdidos: 0 });
        }
        const m = porMes.get(mes);
        m.solicitado += f.montoSolicitado ?? 0;
        m.aprobado += f.montoAprobado ?? 0;
        m.count++;
        if (f.estado === "aprobado" || f.estado === "funding_enviado")
            m.ganados++;
        if (f.estado === "perdido")
            m.perdidos++;
    }
    return Array.from(porMes.values()).sort((a, b) => a.mes - b.mes);
}
// ─── Pipeline Report ─────────────────────────────────────
async function pipelineReport() {
    const filas = await client_1.db
        .select({
        estado: schema_1.bmfFundings.estado,
        montoSolicitado: schema_1.bmfFundings.montoSolicitado,
    })
        .from(schema_1.bmfFundings);
    const porEstado = new Map();
    for (const f of filas) {
        if (!porEstado.has(f.estado)) {
            porEstado.set(f.estado, { estado: f.estado, count: 0, montoTotal: 0 });
        }
        const e = porEstado.get(f.estado);
        e.count++;
        e.montoTotal += f.montoSolicitado ?? 0;
    }
    return Array.from(porEstado.values());
}
// ─── Reporte de Llamadas ────────────────────────────────
async function reporteLlamadas(filtros) {
    const condiciones = [
        filtros.desde ? (0, drizzle_orm_1.gte)(schema_1.bmfLlamadas.fecha, new Date(filtros.desde)) : undefined,
        filtros.hasta ? (0, drizzle_orm_1.lte)(schema_1.bmfLlamadas.fecha, new Date(filtros.hasta)) : undefined,
    ].filter(Boolean);
    const filas = await client_1.db
        .select({
        agenteId: schema_1.bmfLlamadas.agenteId,
        resultado: schema_1.bmfLlamadas.resultado,
    })
        .from(schema_1.bmfLlamadas)
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined);
    const porAgente = new Map();
    for (const f of filas) {
        if (!porAgente.has(f.agenteId)) {
            porAgente.set(f.agenteId, { agenteId: f.agenteId, total: 0, porResultado: {} });
        }
        const a = porAgente.get(f.agenteId);
        a.total++;
        a.porResultado[f.resultado] = (a.porResultado[f.resultado] ?? 0) + 1;
    }
    const resultado = [];
    for (const [, a] of porAgente) {
        const [u] = await client_1.db.select({ nombre: schema_1.usuarios.nombre }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, a.agenteId));
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
async function rankingAgentes(filtros) {
    const condiciones = [
        filtros.desde ? (0, drizzle_orm_1.gte)(schema_1.bmfFundings.fechaCreacion, new Date(filtros.desde)) : undefined,
        filtros.hasta ? (0, drizzle_orm_1.lte)(schema_1.bmfFundings.fechaCreacion, new Date(filtros.hasta)) : undefined,
    ].filter(Boolean);
    const filas = await client_1.db
        .select({
        agenteId: schema_1.bmfFundings.agenteId,
        montoSolicitado: schema_1.bmfFundings.montoSolicitado,
        montoAprobado: schema_1.bmfFundings.montoAprobado,
        estado: schema_1.bmfFundings.estado,
    })
        .from(schema_1.bmfFundings)
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined);
    const porAgente = new Map();
    for (const f of filas) {
        if (!porAgente.has(f.agenteId)) {
            porAgente.set(f.agenteId, { agenteId: f.agenteId, totalFundings: 0, montoSolicitado: 0, montoAprobado: 0 });
        }
        const a = porAgente.get(f.agenteId);
        a.totalFundings++;
        a.montoSolicitado += f.montoSolicitado ?? 0;
        if (f.estado === "aprobado" || f.estado === "funding_enviado") {
            a.montoAprobado += f.montoAprobado ?? 0;
        }
    }
    // Llamadas
    const llamadasRows = await client_1.db
        .select({ agenteId: schema_1.bmfLlamadas.agenteId })
        .from(schema_1.bmfLlamadas)
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined);
    const llamadasPorAgente = new Map();
    for (const l of llamadasRows) {
        llamadasPorAgente.set(l.agenteId, (llamadasPorAgente.get(l.agenteId) ?? 0) + 1);
    }
    const resultado = [];
    for (const [, a] of porAgente) {
        const [u] = await client_1.db.select({ nombre: schema_1.usuarios.nombre }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, a.agenteId));
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
async function kpiAgente(agenteId) {
    const fundings = await client_1.db
        .select({
        estado: schema_1.bmfFundings.estado,
        montoSolicitado: schema_1.bmfFundings.montoSolicitado,
        montoAprobado: schema_1.bmfFundings.montoAprobado,
    })
        .from(schema_1.bmfFundings)
        .where((0, drizzle_orm_1.eq)(schema_1.bmfFundings.agenteId, agenteId));
    const aprobados = fundings.filter((f) => f.estado === "aprobado" || f.estado === "funding_enviado");
    const llamadas = await client_1.db
        .select({ id: schema_1.bmfLlamadas.id })
        .from(schema_1.bmfLlamadas)
        .where((0, drizzle_orm_1.eq)(schema_1.bmfLlamadas.agenteId, agenteId));
    const comisiones = await client_1.db
        .select({ monto: schema_1.bmfComisiones.monto, estado: schema_1.bmfComisiones.estado })
        .from(schema_1.bmfComisiones)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.bmfComisiones.agenteId, agenteId), (0, drizzle_orm_1.eq)(schema_1.bmfComisiones.estado, "pendiente")));
    const clientes = await client_1.db
        .select({ id: schema_1.personas.id })
        .from(schema_1.personas)
        .where((0, drizzle_orm_1.eq)(schema_1.personas.responsableId, agenteId));
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
