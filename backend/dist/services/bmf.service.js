"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarLenders = listarLenders;
exports.obtenerLender = obtenerLender;
exports.crearLender = crearLender;
exports.actualizarLender = actualizarLender;
exports.listarFundings = listarFundings;
exports.obtenerFunding = obtenerFunding;
exports.crearFunding = crearFunding;
exports.actualizarFunding = actualizarFunding;
exports.listarLlamadas = listarLlamadas;
exports.registrarLlamada = registrarLlamada;
exports.statsLlamadas = statsLlamadas;
exports.listarComisiones = listarComisiones;
exports.crearComision = crearComision;
exports.pagarComision = pagarComision;
exports.dashboardBMF = dashboardBMF;
exports.dashboardAdminBMF = dashboardAdminBMF;
exports.scoreCliente = scoreCliente;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const auditoria_service_1 = require("./auditoria.service");
// ─── Lenders ──────────────────────────────────────────────
async function listarLenders() {
    return client_1.db.select().from(schema_1.bmfLenders).orderBy((0, drizzle_orm_1.desc)(schema_1.bmfLenders.updatedAt));
}
async function obtenerLender(id) {
    const [lender] = await client_1.db.select().from(schema_1.bmfLenders).where((0, drizzle_orm_1.eq)(schema_1.bmfLenders.id, id));
    if (!lender)
        throw new Error("Lender no encontrado");
    const ops = await client_1.db
        .select({ id: schema_1.bmfFundings.id, estado: schema_1.bmfFundings.estado, montoAprobado: schema_1.bmfFundings.montoAprobado })
        .from(schema_1.bmfFundings)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.bmfFundings.lenderId, id)));
    const aprobadas = ops.filter((o) => o.estado === "aprobado" || o.estado === "funding_enviado");
    const fundingGenerado = aprobadas.reduce((s, o) => s + (o.montoAprobado ?? 0), 0);
    return {
        ...lender,
        kpis: {
            operaciones: ops.length,
            fundingGenerado,
            conversion: ops.length ? Math.round((aprobadas.length / ops.length) * 100) : 0,
        },
    };
}
async function crearLender(input, autorId) {
    const id = crypto.randomUUID();
    await client_1.db.insert(schema_1.bmfLenders).values({
        id,
        nombre: input.nombre,
        contacto: input.contacto,
        email: input.email,
        telefono: input.telefono,
        productos: input.productos,
        montoMinimo: input.montoMinimo,
        montoMaximo: input.montoMaximo,
        tiempoRespuestaDias: input.tiempoRespuestaDias,
        estado: input.estado ?? "activo",
        observaciones: input.observaciones,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "BMF_Lender",
        entidadId: id,
        accion: `Lender creado: "${input.nombre}"`,
        autorId,
    });
    const [lender] = await client_1.db.select().from(schema_1.bmfLenders).where((0, drizzle_orm_1.eq)(schema_1.bmfLenders.id, id));
    return lender;
}
async function actualizarLender(id, input, autorId) {
    const [existente] = await client_1.db.select().from(schema_1.bmfLenders).where((0, drizzle_orm_1.eq)(schema_1.bmfLenders.id, id));
    if (!existente)
        throw new Error("Lender no encontrado");
    const data = { updatedAt: new Date() };
    if (input.nombre !== undefined)
        data.nombre = input.nombre;
    if (input.contacto !== undefined)
        data.contacto = input.contacto;
    if (input.email !== undefined)
        data.email = input.email;
    if (input.telefono !== undefined)
        data.telefono = input.telefono;
    if (input.productos !== undefined)
        data.productos = input.productos;
    if (input.montoMinimo !== undefined)
        data.montoMinimo = input.montoMinimo;
    if (input.montoMaximo !== undefined)
        data.montoMaximo = input.montoMaximo;
    if (input.tiempoRespuestaDias !== undefined)
        data.tiempoRespuestaDias = input.tiempoRespuestaDias;
    if (input.estado !== undefined)
        data.estado = input.estado;
    if (input.observaciones !== undefined)
        data.observaciones = input.observaciones;
    await client_1.db.update(schema_1.bmfLenders).set(data).where((0, drizzle_orm_1.eq)(schema_1.bmfLenders.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "BMF_Lender",
        entidadId: id,
        accion: `Lender actualizado: "${input.nombre ?? existente.nombre}"`,
        autorId,
    });
    const [updated] = await client_1.db.select().from(schema_1.bmfLenders).where((0, drizzle_orm_1.eq)(schema_1.bmfLenders.id, id));
    return updated;
}
// ─── Fundings ─────────────────────────────────────────────
async function listarFundings(filtros) {
    const condiciones = [
        filtros.estado ? (0, drizzle_orm_1.eq)(schema_1.bmfFundings.estado, filtros.estado) : undefined,
        filtros.agenteId ? (0, drizzle_orm_1.eq)(schema_1.bmfFundings.agenteId, filtros.agenteId) : undefined,
        filtros.lenderId ? (0, drizzle_orm_1.eq)(schema_1.bmfFundings.lenderId, filtros.lenderId) : undefined,
        filtros.clienteId ? (0, drizzle_orm_1.eq)(schema_1.bmfFundings.clienteId, filtros.clienteId) : undefined,
    ].filter(Boolean);
    const filas = await client_1.db
        .select({
        id: schema_1.bmfFundings.id,
        clienteId: schema_1.bmfFundings.clienteId,
        agenteId: schema_1.bmfFundings.agenteId,
        lenderId: schema_1.bmfFundings.lenderId,
        montoSolicitado: schema_1.bmfFundings.montoSolicitado,
        montoAprobado: schema_1.bmfFundings.montoAprobado,
        fechaCreacion: schema_1.bmfFundings.fechaCreacion,
        fechaAprobacion: schema_1.bmfFundings.fechaAprobacion,
        fechaFunding: schema_1.bmfFundings.fechaFunding,
        estado: schema_1.bmfFundings.estado,
        comisionPorcentaje: schema_1.bmfFundings.comisionPorcentaje,
        comisionMonto: schema_1.bmfFundings.comisionMonto,
        observaciones: schema_1.bmfFundings.observaciones,
        updatedAt: schema_1.bmfFundings.updatedAt,
    })
        .from(schema_1.bmfFundings)
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.bmfFundings.updatedAt));
    // Enriquecer con nombres
    const resultado = [];
    for (const f of filas) {
        const [cliente] = await client_1.db.select({ nombre: schema_1.personas.nombre }).from(schema_1.personas).where((0, drizzle_orm_1.eq)(schema_1.personas.id, f.clienteId));
        const [agente] = await client_1.db.select({ nombre: schema_1.usuarios.nombre }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, f.agenteId));
        let lenderNombre = null;
        if (f.lenderId) {
            const [lender] = await client_1.db.select({ nombre: schema_1.bmfLenders.nombre }).from(schema_1.bmfLenders).where((0, drizzle_orm_1.eq)(schema_1.bmfLenders.id, f.lenderId));
            lenderNombre = lender?.nombre ?? null;
        }
        resultado.push({
            ...f,
            clienteNombre: cliente?.nombre ?? "",
            agenteNombre: agente?.nombre ?? "",
            lenderNombre,
        });
    }
    return resultado;
}
async function obtenerFunding(id) {
    const [funding] = await client_1.db.select().from(schema_1.bmfFundings).where((0, drizzle_orm_1.eq)(schema_1.bmfFundings.id, id));
    if (!funding)
        throw new Error("Funding no encontrado");
    const [cliente] = await client_1.db.select({ nombre: schema_1.personas.nombre }).from(schema_1.personas).where((0, drizzle_orm_1.eq)(schema_1.personas.id, funding.clienteId));
    const [agente] = await client_1.db.select({ nombre: schema_1.usuarios.nombre }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, funding.agenteId));
    let lenderNombre = null;
    if (funding.lenderId) {
        const [lender] = await client_1.db.select({ nombre: schema_1.bmfLenders.nombre }).from(schema_1.bmfLenders).where((0, drizzle_orm_1.eq)(schema_1.bmfLenders.id, funding.lenderId));
        lenderNombre = lender?.nombre ?? null;
    }
    const comisiones = await client_1.db
        .select({
        id: schema_1.bmfComisiones.id,
        agenteId: schema_1.bmfComisiones.agenteId,
        monto: schema_1.bmfComisiones.monto,
        porcentaje: schema_1.bmfComisiones.porcentaje,
        estado: schema_1.bmfComisiones.estado,
        fechaPago: schema_1.bmfComisiones.fechaPago,
    })
        .from(schema_1.bmfComisiones)
        .where((0, drizzle_orm_1.eq)(schema_1.bmfComisiones.fundingId, id));
    const comisionesConNombre = [];
    for (const c of comisiones) {
        const [ag] = await client_1.db.select({ nombre: schema_1.usuarios.nombre }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, c.agenteId));
        comisionesConNombre.push({ ...c, agenteNombre: ag?.nombre ?? "" });
    }
    const llamadas = await client_1.db
        .select({
        id: schema_1.bmfLlamadas.id,
        fecha: schema_1.bmfLlamadas.fecha,
        duracionMinutos: schema_1.bmfLlamadas.duracionMinutos,
        resultado: schema_1.bmfLlamadas.resultado,
        observaciones: schema_1.bmfLlamadas.observaciones,
        agenteId: schema_1.bmfLlamadas.agenteId,
    })
        .from(schema_1.bmfLlamadas)
        .where((0, drizzle_orm_1.eq)(schema_1.bmfLlamadas.personaId, funding.clienteId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.bmfLlamadas.fecha))
        .limit(10);
    const llamadasConNombre = [];
    for (const l of llamadas) {
        const [ag] = await client_1.db.select({ nombre: schema_1.usuarios.nombre }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, l.agenteId));
        llamadasConNombre.push({ ...l, agenteNombre: ag?.nombre ?? "" });
    }
    return {
        ...funding,
        clienteNombre: cliente?.nombre ?? "",
        agenteNombre: agente?.nombre ?? "",
        lenderNombre,
        comisiones: comisionesConNombre,
        llamadas: llamadasConNombre,
    };
}
async function crearFunding(input, autorId) {
    const id = crypto.randomUUID();
    await client_1.db.insert(schema_1.bmfFundings).values({
        id,
        clienteId: input.clienteId,
        agenteId: input.agenteId,
        lenderId: input.lenderId,
        montoSolicitado: input.montoSolicitado,
        estado: "pendiente",
        observaciones: input.observaciones,
        fechaCreacion: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "BMF_Funding",
        entidadId: id,
        accion: "Funding creado",
        autorId,
        personaId: input.clienteId,
    });
    return obtenerFunding(id);
}
async function actualizarFunding(id, input, autorId) {
    const [existente] = await client_1.db.select().from(schema_1.bmfFundings).where((0, drizzle_orm_1.eq)(schema_1.bmfFundings.id, id));
    if (!existente)
        throw new Error("Funding no encontrado");
    const data = { updatedAt: new Date() };
    if (input.estado !== undefined)
        data.estado = input.estado;
    if (input.montoAprobado !== undefined)
        data.montoAprobado = input.montoAprobado;
    if (input.lenderId !== undefined)
        data.lenderId = input.lenderId;
    if (input.comisionPorcentaje !== undefined)
        data.comisionPorcentaje = input.comisionPorcentaje;
    if (input.comisionMonto !== undefined)
        data.comisionMonto = input.comisionMonto;
    if (input.observaciones !== undefined)
        data.observaciones = input.observaciones;
    if (input.estado === "aprobado" && !existente.fechaAprobacion) {
        data.fechaAprobacion = new Date();
    }
    if (input.estado === "funding_enviado" && !existente.fechaFunding) {
        data.fechaFunding = new Date();
    }
    await client_1.db.update(schema_1.bmfFundings).set(data).where((0, drizzle_orm_1.eq)(schema_1.bmfFundings.id, id));
    const estadoLabel = typeof input.estado === "string" ? input.estado : "actualizado";
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "BMF_Funding",
        entidadId: id,
        accion: `Funding ${estadoLabel}`,
        autorId,
        personaId: existente.clienteId,
    });
    return obtenerFunding(id);
}
// ─── Llamadas ─────────────────────────────────────────────
async function listarLlamadas(filtros) {
    const condiciones = [
        filtros.personaId ? (0, drizzle_orm_1.eq)(schema_1.bmfLlamadas.personaId, filtros.personaId) : undefined,
        filtros.agenteId ? (0, drizzle_orm_1.eq)(schema_1.bmfLlamadas.agenteId, filtros.agenteId) : undefined,
        filtros.desde ? (0, drizzle_orm_1.gte)(schema_1.bmfLlamadas.fecha, new Date(filtros.desde)) : undefined,
        filtros.hasta ? (0, drizzle_orm_1.lte)(schema_1.bmfLlamadas.fecha, new Date(filtros.hasta)) : undefined,
    ].filter(Boolean);
    const filas = await client_1.db
        .select({
        id: schema_1.bmfLlamadas.id,
        personaId: schema_1.bmfLlamadas.personaId,
        agenteId: schema_1.bmfLlamadas.agenteId,
        fecha: schema_1.bmfLlamadas.fecha,
        duracionMinutos: schema_1.bmfLlamadas.duracionMinutos,
        resultado: schema_1.bmfLlamadas.resultado,
        observaciones: schema_1.bmfLlamadas.observaciones,
    })
        .from(schema_1.bmfLlamadas)
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.bmfLlamadas.fecha));
    const resultado = [];
    for (const l of filas) {
        const [p] = await client_1.db.select({ nombre: schema_1.personas.nombre }).from(schema_1.personas).where((0, drizzle_orm_1.eq)(schema_1.personas.id, l.personaId));
        const [u] = await client_1.db.select({ nombre: schema_1.usuarios.nombre }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, l.agenteId));
        resultado.push({
            ...l,
            personaNombre: p?.nombre ?? "",
            agenteNombre: u?.nombre ?? "",
        });
    }
    return resultado;
}
async function registrarLlamada(input, autorId) {
    const id = crypto.randomUUID();
    await client_1.db.insert(schema_1.bmfLlamadas).values({
        id,
        personaId: input.personaId,
        agenteId: input.agenteId,
        fecha: new Date(),
        duracionMinutos: input.duracionMinutos,
        resultado: input.resultado ?? "contestó",
        observaciones: input.observaciones,
        createdAt: new Date(),
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "BMF_Llamada",
        entidadId: id,
        accion: `Llamada registrada: ${input.resultado ?? "contestó"}`,
        autorId,
        personaId: input.personaId,
    });
    const [p] = await client_1.db.select({ nombre: schema_1.personas.nombre }).from(schema_1.personas).where((0, drizzle_orm_1.eq)(schema_1.personas.id, input.personaId));
    const [u] = await client_1.db.select({ nombre: schema_1.usuarios.nombre }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, input.agenteId));
    return {
        id,
        personaId: input.personaId,
        personaNombre: p?.nombre ?? "",
        agenteId: input.agenteId,
        agenteNombre: u?.nombre ?? "",
        fecha: new Date(),
        duracionMinutos: input.duracionMinutos,
        resultado: input.resultado ?? "contestó",
        observaciones: input.observaciones,
    };
}
async function statsLlamadas(filtros) {
    const condiciones = [
        filtros.agenteId ? (0, drizzle_orm_1.eq)(schema_1.bmfLlamadas.agenteId, filtros.agenteId) : undefined,
        filtros.desde ? (0, drizzle_orm_1.gte)(schema_1.bmfLlamadas.fecha, new Date(filtros.desde)) : undefined,
        filtros.hasta ? (0, drizzle_orm_1.lte)(schema_1.bmfLlamadas.fecha, new Date(filtros.hasta)) : undefined,
    ].filter(Boolean);
    const todas = await client_1.db
        .select({
        agenteId: schema_1.bmfLlamadas.agenteId,
        resultado: schema_1.bmfLlamadas.resultado,
        fecha: schema_1.bmfLlamadas.fecha,
    })
        .from(schema_1.bmfLlamadas)
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined);
    // Enriquecer con nombres
    const nombresAgentes = new Map();
    for (const l of todas) {
        if (!nombresAgentes.has(l.agenteId)) {
            const [u] = await client_1.db.select({ nombre: schema_1.usuarios.nombre }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, l.agenteId));
            nombresAgentes.set(l.agenteId, u?.nombre ?? "");
        }
    }
    const porAgente = new Map();
    for (const l of todas) {
        if (!porAgente.has(l.agenteId)) {
            porAgente.set(l.agenteId, { agenteId: l.agenteId, agenteNombre: nombresAgentes.get(l.agenteId) ?? "", total: 0, contesto: 0, noContesto: 0, buzon: 0 });
        }
        const a = porAgente.get(l.agenteId);
        a.total++;
        if (l.resultado === "contestó")
            a.contesto++;
        else if (l.resultado === "no contestó")
            a.noContesto++;
        else if (l.resultado === "buzón")
            a.buzon++;
    }
    const porDia = new Map();
    for (const l of todas) {
        const dia = l.fecha.toISOString().slice(0, 10);
        porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    }
    return {
        total: todas.length,
        porAgente: Array.from(porAgente.values()).sort((a, b) => b.total - a.total),
        porDia: Array.from(porDia.entries())
            .map(([fecha, total]) => ({ fecha, total }))
            .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    };
}
// ─── Comisiones ───────────────────────────────────────────
async function listarComisiones(filtros) {
    const condiciones = [
        filtros.agenteId ? (0, drizzle_orm_1.eq)(schema_1.bmfComisiones.agenteId, filtros.agenteId) : undefined,
        filtros.estado ? (0, drizzle_orm_1.eq)(schema_1.bmfComisiones.estado, filtros.estado) : undefined,
    ].filter(Boolean);
    const filas = await client_1.db
        .select({
        id: schema_1.bmfComisiones.id,
        agenteId: schema_1.bmfComisiones.agenteId,
        fundingId: schema_1.bmfComisiones.fundingId,
        monto: schema_1.bmfComisiones.monto,
        porcentaje: schema_1.bmfComisiones.porcentaje,
        estado: schema_1.bmfComisiones.estado,
        fechaPago: schema_1.bmfComisiones.fechaPago,
        createdAt: schema_1.bmfComisiones.createdAt,
    })
        .from(schema_1.bmfComisiones)
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.bmfComisiones.createdAt));
    const resultado = [];
    for (const c of filas) {
        const [ag] = await client_1.db.select({ nombre: schema_1.usuarios.nombre }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, c.agenteId));
        const [funding] = await client_1.db.select({ clienteId: schema_1.bmfFundings.clienteId }).from(schema_1.bmfFundings).where((0, drizzle_orm_1.eq)(schema_1.bmfFundings.id, c.fundingId));
        let clienteNombre = "";
        if (funding?.clienteId) {
            const [p] = await client_1.db.select({ nombre: schema_1.personas.nombre }).from(schema_1.personas).where((0, drizzle_orm_1.eq)(schema_1.personas.id, funding.clienteId));
            clienteNombre = p?.nombre ?? "";
        }
        resultado.push({
            ...c,
            agenteNombre: ag?.nombre ?? "",
            clienteNombre,
        });
    }
    return resultado;
}
async function crearComision(input, autorId) {
    const id = crypto.randomUUID();
    await client_1.db.insert(schema_1.bmfComisiones).values({
        id,
        agenteId: input.agenteId,
        fundingId: input.fundingId,
        monto: input.monto,
        porcentaje: input.porcentaje,
        estado: "pendiente",
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "BMF_Comision",
        entidadId: id,
        accion: "Comisión creada",
        autorId,
    });
    const [comision] = await client_1.db.select().from(schema_1.bmfComisiones).where((0, drizzle_orm_1.eq)(schema_1.bmfComisiones.id, id));
    return comision;
}
async function pagarComision(id, autorId) {
    const [existente] = await client_1.db.select().from(schema_1.bmfComisiones).where((0, drizzle_orm_1.eq)(schema_1.bmfComisiones.id, id));
    if (!existente)
        throw new Error("Comisión no encontrada");
    await client_1.db.update(schema_1.bmfComisiones).set({
        estado: "pagada",
        fechaPago: new Date(),
        updatedAt: new Date(),
    }).where((0, drizzle_orm_1.eq)(schema_1.bmfComisiones.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "BMF_Comision",
        entidadId: id,
        accion: "Comisión pagada",
        autorId,
    });
    const [updated] = await client_1.db.select().from(schema_1.bmfComisiones).where((0, drizzle_orm_1.eq)(schema_1.bmfComisiones.id, id));
    return updated;
}
// ─── Dashboard BMF ────────────────────────────────────────
async function dashboardBMF(deptoId) {
    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const agentes = await client_1.db
        .select({
        usuarioId: schema_1.equipoMiembros.usuarioId,
        nombre: schema_1.usuarios.nombre,
    })
        .from(schema_1.equipoMiembros)
        .innerJoin(schema_1.equipos, (0, drizzle_orm_1.eq)(schema_1.equipoMiembros.equipoId, schema_1.equipos.id))
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.equipoMiembros.usuarioId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.equipos.departamentoId, deptoId));
    const agentesIds = agentes.map((a) => a.usuarioId);
    if (!agentesIds.length) {
        return {
            clientesActivos: 0, leadsNuevos: 0, seguimientosPendientes: 0, seguimientosVencidos: 0,
            solicitudesAbiertas: 0, solicitudesAprobadas: 0, solicitudesPerdidas: 0,
            fundingMes: 0, fundingHistorico: 0, pipelineActivo: 0, renovacionesProximas: 0,
            lendersActivos: 0, agentesActivos: 0, conversion: 0,
            comisionesGeneradas: 0, comisionesPendientes: 0, actividadHoy: 0,
            agentes,
        };
    }
    const fundings = await client_1.db
        .select({
        estado: schema_1.bmfFundings.estado,
        montoSolicitado: schema_1.bmfFundings.montoSolicitado,
        fechaCreacion: schema_1.bmfFundings.fechaCreacion,
        clienteId: schema_1.bmfFundings.clienteId,
    })
        .from(schema_1.bmfFundings)
        .where((0, drizzle_orm_1.inArray)(schema_1.bmfFundings.agenteId, agentesIds));
    const clientesUnicos = new Set(fundings.filter((f) => f.estado !== "perdido").map((f) => f.clienteId));
    const personasMes = await client_1.db
        .select({ id: schema_1.personas.id })
        .from(schema_1.personas)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.personas.responsableId, agentesIds), (0, drizzle_orm_1.gte)(schema_1.personas.createdAt, inicioMes)));
    const tareasPendientes = await client_1.db
        .select({ fecha: schema_1.tareasSeguimiento.fecha })
        .from(schema_1.tareasSeguimiento)
        .innerJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.personaId, schema_1.personas.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.personas.responsableId, agentesIds), (0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.completado, false)));
    const solicitudesAbiertas = fundings.filter((f) => !["aprobado", "perdido", "funding_enviado"].includes(f.estado)).length;
    const solicitudesAprobadas = fundings.filter((f) => f.estado === "aprobado" || f.estado === "funding_enviado").length;
    const solicitudesPerdidas = fundings.filter((f) => f.estado === "perdido").length;
    const fundingMes = fundings
        .filter((f) => (f.estado === "aprobado" || f.estado === "funding_enviado") && f.fechaCreacion >= inicioMes)
        .reduce((s, f) => s + (f.montoSolicitado ?? 0), 0);
    const fundingHistorico = fundings
        .filter((f) => f.estado === "aprobado" || f.estado === "funding_enviado")
        .reduce((s, f) => s + (f.montoSolicitado ?? 0), 0);
    const pipelineActivo = fundings
        .filter((f) => !["aprobado", "perdido", "funding_enviado"].includes(f.estado))
        .reduce((s, f) => s + (f.montoSolicitado ?? 0), 0);
    const lenders = await client_1.db.select({ id: schema_1.bmfLenders.id }).from(schema_1.bmfLenders).where((0, drizzle_orm_1.eq)(schema_1.bmfLenders.estado, "activo"));
    const comisionesRows = await client_1.db
        .select({ monto: schema_1.bmfComisiones.monto, estado: schema_1.bmfComisiones.estado })
        .from(schema_1.bmfComisiones)
        .where((0, drizzle_orm_1.inArray)(schema_1.bmfComisiones.agenteId, agentesIds));
    const comisionesGeneradas = comisionesRows.reduce((s, c) => s + (c.monto ?? 0), 0);
    const comisionesPendientesCount = comisionesRows
        .filter((c) => c.estado === "pendiente")
        .reduce((s, c) => s + (c.monto ?? 0), 0);
    const conversion = fundings.length ? Math.round((solicitudesAprobadas / fundings.length) * 100) : 0;
    const actividadHoy = await client_1.db
        .select({ id: schema_1.bitacoraAuditoria.id })
        .from(schema_1.bitacoraAuditoria)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.bitacoraAuditoria.autorId, agentesIds), (0, drizzle_orm_1.gte)(schema_1.bitacoraAuditoria.fecha, inicioHoy)));
    return {
        clientesActivos: clientesUnicos.size,
        leadsNuevos: personasMes.length,
        seguimientosPendientes: tareasPendientes.length,
        seguimientosVencidos: tareasPendientes.filter((t) => t.fecha < hoy).length,
        solicitudesAbiertas,
        solicitudesAprobadas,
        solicitudesPerdidas,
        fundingMes,
        fundingHistorico,
        pipelineActivo,
        renovacionesProximas: 0,
        lendersActivos: lenders.length,
        agentesActivos: agentes.length,
        conversion,
        comisionesGeneradas,
        comisionesPendientes: comisionesPendientesCount,
        actividadHoy: actividadHoy.length,
        agentes,
    };
}
// ─── Dashboard Admin BMF ─────────────────────────────────
async function dashboardAdminBMF(deptoId) {
    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const hace7Dias = new Date(hoy.getTime() - 7 * 86400000);
    const agentes = await client_1.db
        .select({
        usuarioId: schema_1.equipoMiembros.usuarioId,
        nombre: schema_1.usuarios.nombre,
        cargo: schema_1.equipoMiembros.cargo,
    })
        .from(schema_1.equipoMiembros)
        .innerJoin(schema_1.equipos, (0, drizzle_orm_1.eq)(schema_1.equipoMiembros.equipoId, schema_1.equipos.id))
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.equipoMiembros.usuarioId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.equipos.departamentoId, deptoId));
    const agentesIds = agentes.map((a) => a.usuarioId);
    if (!agentesIds.length) {
        return { agentesSinActividad: [], kpisPorAgente: [], clientesSinContacto: [], renovacionesProximas: [] };
    }
    // Agentes sin actividad hoy
    const actividadHoy = await client_1.db
        .select({ autorId: schema_1.bitacoraAuditoria.autorId })
        .from(schema_1.bitacoraAuditoria)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.bitacoraAuditoria.autorId, agentesIds), (0, drizzle_orm_1.gte)(schema_1.bitacoraAuditoria.fecha, inicioHoy)));
    const activosHoyIds = new Set(actividadHoy.map((a) => a.autorId));
    const agentesSinActividad = agentes.filter((a) => !activosHoyIds.has(a.usuarioId));
    // KPIs por agente
    const kpisPorAgente = [];
    for (const a of agentes) {
        const llamadasHoy = await client_1.db
            .select({ id: schema_1.bmfLlamadas.id })
            .from(schema_1.bmfLlamadas)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.bmfLlamadas.agenteId, a.usuarioId), (0, drizzle_orm_1.gte)(schema_1.bmfLlamadas.fecha, inicioHoy)));
        const clientes = await client_1.db
            .select({ id: schema_1.personas.id })
            .from(schema_1.personas)
            .where((0, drizzle_orm_1.eq)(schema_1.personas.responsableId, a.usuarioId));
        const opsAgente = await client_1.db
            .select({ estado: schema_1.bmfFundings.estado, montoSolicitado: schema_1.bmfFundings.montoSolicitado })
            .from(schema_1.bmfFundings)
            .where((0, drizzle_orm_1.eq)(schema_1.bmfFundings.agenteId, a.usuarioId));
        const opsAprobadas = opsAgente.filter((f) => f.estado === "aprobado" || f.estado === "funding_enviado");
        const fundingProducido = opsAprobadas.reduce((s, f) => s + (f.montoSolicitado ?? 0), 0);
        const tareas = await client_1.db
            .select({ fecha: schema_1.tareasSeguimiento.fecha })
            .from(schema_1.tareasSeguimiento)
            .innerJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.personaId, schema_1.personas.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.personas.responsableId, a.usuarioId), (0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.completado, false)));
        const vencidas = tareas.filter((t) => t.fecha < hoy).length;
        const conversion = opsAgente.length ? Math.round((opsAprobadas.length / opsAgente.length) * 100) : 0;
        kpisPorAgente.push({
            usuarioId: a.usuarioId,
            nombre: a.nombre,
            cargo: a.cargo,
            llamadasHoy: llamadasHoy.length,
            clientesAtendidos: clientes.length,
            fundingProducido,
            seguimientosVencidos: vencidas,
            conversion,
        });
    }
    // Clientes sin contacto
    const clientesSinContacto = [];
    for (const a of agentes) {
        const clientesAgente = await client_1.db
            .select({ id: schema_1.personas.id, nombre: schema_1.personas.nombre })
            .from(schema_1.personas)
            .where((0, drizzle_orm_1.eq)(schema_1.personas.responsableId, a.usuarioId));
        for (const c of clientesAgente) {
            const ultimasLlamadas = await client_1.db
                .select({ fecha: schema_1.bmfLlamadas.fecha })
                .from(schema_1.bmfLlamadas)
                .where((0, drizzle_orm_1.eq)(schema_1.bmfLlamadas.personaId, c.id))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.bmfLlamadas.fecha))
                .limit(1);
            const ultimaLlamada = ultimasLlamadas[0];
            if (!ultimaLlamada || ultimaLlamada.fecha < hace7Dias) {
                const dias = ultimaLlamada
                    ? Math.round((hoy.getTime() - ultimaLlamada.fecha.getTime()) / 86400000)
                    : 30;
                clientesSinContacto.push({ id: c.id, nombre: c.nombre, agenteNombre: a.nombre, diasSinContacto: dias });
            }
        }
    }
    clientesSinContacto.sort((a, b) => b.diasSinContacto - a.diasSinContacto);
    // Renovaciones próximas
    const renovaciones = await client_1.db
        .select({
        id: schema_1.bmfFundings.id,
        montoSolicitado: schema_1.bmfFundings.montoSolicitado,
        fechaCreacion: schema_1.bmfFundings.fechaCreacion,
        clienteId: schema_1.bmfFundings.clienteId,
    })
        .from(schema_1.bmfFundings)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.bmfFundings.agenteId, agentesIds), (0, drizzle_orm_1.inArray)(schema_1.bmfFundings.estado, ["aprobado", "funding_enviado"])))
        .limit(20);
    const renovacionesProximas = [];
    for (const r of renovaciones) {
        const [p] = await client_1.db.select({ nombre: schema_1.personas.nombre }).from(schema_1.personas).where((0, drizzle_orm_1.eq)(schema_1.personas.id, r.clienteId));
        renovacionesProximas.push({
            id: r.id,
            clienteNombre: p?.nombre ?? "",
            montoSolicitado: r.montoSolicitado ?? 0,
            fechaCreacion: r.fechaCreacion.toISOString(),
        });
    }
    return {
        agentesSinActividad: agentesSinActividad.map((a) => ({ usuarioId: a.usuarioId, nombre: a.nombre })),
        kpisPorAgente: kpisPorAgente.sort((a, b) => b.fundingProducido - a.fundingProducido),
        clientesSinContacto: clientesSinContacto.slice(0, 20),
        renovacionesProximas,
    };
}
// ─── Score del cliente ────────────────────────────────────
async function scoreCliente(personaId) {
    const hoy = new Date();
    const ultimasLlamadas = await client_1.db
        .select({ fecha: schema_1.bmfLlamadas.fecha })
        .from(schema_1.bmfLlamadas)
        .where((0, drizzle_orm_1.eq)(schema_1.bmfLlamadas.personaId, personaId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.bmfLlamadas.fecha))
        .limit(1);
    const ultimaLlamada = ultimasLlamadas[0];
    const diasSinContacto = ultimaLlamada
        ? Math.round((hoy.getTime() - ultimaLlamada.fecha.getTime()) / 86400000)
        : 999;
    const tareas = await client_1.db
        .select({ fecha: schema_1.tareasSeguimiento.fecha, completado: schema_1.tareasSeguimiento.completado })
        .from(schema_1.tareasSeguimiento)
        .where((0, drizzle_orm_1.eq)(schema_1.tareasSeguimiento.personaId, personaId));
    const seguimientosVencidos = tareas.filter((t) => !t.completado && t.fecha < hoy).length;
    const llamadas = await client_1.db
        .select({ id: schema_1.bmfLlamadas.id })
        .from(schema_1.bmfLlamadas)
        .where((0, drizzle_orm_1.eq)(schema_1.bmfLlamadas.personaId, personaId));
    const totalLlamadas = llamadas.length;
    let nivel = "verde";
    let puntaje = 100;
    if (diasSinContacto > 7)
        puntaje -= 20;
    if (diasSinContacto > 14)
        puntaje -= 20;
    if (diasSinContacto > 30)
        puntaje -= 20;
    if (seguimientosVencidos > 0)
        puntaje -= 15 * seguimientosVencidos;
    if (totalLlamadas === 0)
        puntaje -= 10;
    if (puntaje >= 70)
        nivel = "verde";
    else if (puntaje >= 40)
        nivel = "amarillo";
    else
        nivel = "rojo";
    return { personaId, nivel, puntaje, diasSinContacto, seguimientosVencidos, totalLlamadas };
}
