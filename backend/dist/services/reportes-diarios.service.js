"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerReporte = obtenerReporte;
exports.reporteDelDia = reporteDelDia;
exports.listarReportes = listarReportes;
exports.actualizarReporte = actualizarReporte;
exports.enviarReporte = enviarReporte;
exports.revisarReporte = revisarReporte;
exports.panelLider = panelLider;
exports.resumenSemanal = resumenSemanal;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const auditoria_service_1 = require("./auditoria.service");
const REPORTE_COLUMNS = {
    id: schema_1.reportesDiarios.id,
    usuarioId: schema_1.reportesDiarios.usuarioId,
    usuarioNombre: schema_1.usuarios.nombre,
    fecha: schema_1.reportesDiarios.fecha,
    tareasAsignadas: schema_1.reportesDiarios.tareasAsignadas,
    tareasCompletadas: schema_1.reportesDiarios.tareasCompletadas,
    tareasPendientes: schema_1.reportesDiarios.tareasPendientes,
    tiempoUtilizado: schema_1.reportesDiarios.tiempoUtilizado,
    enlaces: schema_1.reportesDiarios.enlaces,
    dificultades: schema_1.reportesDiarios.dificultades,
    necesitaRevision: schema_1.reportesDiarios.necesitaRevision,
    apoyoRequerido: schema_1.reportesDiarios.apoyoRequerido,
    observaciones: schema_1.reportesDiarios.observaciones,
    estado: schema_1.reportesDiarios.estado,
    revisadoPor: schema_1.reportesDiarios.revisadoPor,
    createdAt: schema_1.reportesDiarios.createdAt,
    updatedAt: schema_1.reportesDiarios.updatedAt,
};
function fechaHoyET() {
    // Fecha de hoy en Eastern Time (UTC-4/5)
    const ahora = new Date();
    const et = new Date(ahora.toLocaleString("en-US", { timeZone: "America/New_York" }));
    return et.toISOString().split("T")[0];
}
async function obtenerReporte(id) {
    const [r] = await client_1.db
        .select(REPORTE_COLUMNS)
        .from(schema_1.reportesDiarios)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.reportesDiarios.usuarioId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.reportesDiarios.id, id));
    return r ?? null;
}
async function reporteDelDia(usuarioId) {
    const fecha = fechaHoyET();
    const [existente] = await client_1.db
        .select(REPORTE_COLUMNS)
        .from(schema_1.reportesDiarios)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.reportesDiarios.usuarioId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reportesDiarios.usuarioId, usuarioId), (0, drizzle_orm_1.eq)(schema_1.reportesDiarios.fecha, fecha)));
    if (existente)
        return existente;
    // Auto-crear si no existe
    const id = crypto.randomUUID();
    const ahora = new Date();
    await client_1.db.insert(schema_1.reportesDiarios).values({
        id,
        usuarioId,
        fecha,
        estado: "no_iniciado",
        createdAt: ahora,
        updatedAt: ahora,
    });
    return obtenerReporte(id);
}
async function listarReportes(params) {
    const conds = [
        params.usuarioId ? (0, drizzle_orm_1.eq)(schema_1.reportesDiarios.usuarioId, params.usuarioId) : undefined,
        params.fecha ? (0, drizzle_orm_1.eq)(schema_1.reportesDiarios.fecha, params.fecha) : undefined,
        params.estado ? (0, drizzle_orm_1.eq)(schema_1.reportesDiarios.estado, params.estado) : undefined,
    ].filter(Boolean);
    return client_1.db
        .select(REPORTE_COLUMNS)
        .from(schema_1.reportesDiarios)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.reportesDiarios.usuarioId, schema_1.usuarios.id))
        .where(conds.length ? (0, drizzle_orm_1.and)(...conds) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.reportesDiarios.fecha));
}
async function actualizarReporte(id, input, autorId) {
    const [r] = await client_1.db.select().from(schema_1.reportesDiarios).where((0, drizzle_orm_1.eq)(schema_1.reportesDiarios.id, id));
    if (!r)
        throw new Error("Reporte no encontrado");
    if (r.usuarioId !== autorId)
        throw new Error("Solo el autor puede editar su reporte");
    const data = { updatedAt: new Date() };
    if (input.tareasAsignadas !== undefined)
        data.tareasAsignadas = input.tareasAsignadas;
    if (input.tareasCompletadas !== undefined)
        data.tareasCompletadas = input.tareasCompletadas;
    if (input.tareasPendientes !== undefined)
        data.tareasPendientes = input.tareasPendientes;
    if (input.tiempoUtilizado !== undefined)
        data.tiempoUtilizado = input.tiempoUtilizado;
    if (input.enlaces !== undefined)
        data.enlaces = input.enlaces;
    if (input.dificultades !== undefined)
        data.dificultades = input.dificultades;
    if (input.necesitaRevision !== undefined)
        data.necesitaRevision = input.necesitaRevision;
    if (input.apoyoRequerido !== undefined)
        data.apoyoRequerido = input.apoyoRequerido;
    if (input.observaciones !== undefined)
        data.observaciones = input.observaciones;
    if (input.estado !== undefined)
        data.estado = input.estado;
    await client_1.db.update(schema_1.reportesDiarios).set(data).where((0, drizzle_orm_1.eq)(schema_1.reportesDiarios.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "ReporteDiario",
        entidadId: id,
        accion: `Reporte actualizado → estado: ${input.estado ?? r.estado}`,
        autorId,
    });
    return obtenerReporte(id);
}
async function enviarReporte(id, autorId) {
    return actualizarReporte(id, { estado: "enviado" }, autorId);
}
async function revisarReporte(id, decision, revisorId) {
    const [r] = await client_1.db.select().from(schema_1.reportesDiarios).where((0, drizzle_orm_1.eq)(schema_1.reportesDiarios.id, id));
    if (!r)
        throw new Error("Reporte no encontrado");
    await client_1.db.update(schema_1.reportesDiarios)
        .set({
        estado: decision,
        revisadoPor: revisorId,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.reportesDiarios.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "ReporteDiario",
        entidadId: id,
        accion: `Reporte ${decision} por líder`,
        autorId: revisorId,
    });
    return obtenerReporte(id);
}
async function panelLider(fecha) {
    const fechaConsulta = fecha ?? fechaHoyET();
    // Obtener el departamento de Marketing
    const [depto] = await client_1.db
        .select()
        .from(schema_1.departamentos)
        .where((0, drizzle_orm_1.eq)(schema_1.departamentos.nombre, "Marketing"));
    if (!depto)
        return { miembros: [], reportes: [], resumen: { entregados: 0, pendientes: 0, total: 0 } };
    // Miembros del equipo de Marketing
    const miembros = await client_1.db
        .select({
        usuarioId: schema_1.equipoMiembros.usuarioId,
        nombre: schema_1.usuarios.nombre,
        cargo: schema_1.equipoMiembros.cargo,
    })
        .from(schema_1.equipoMiembros)
        .innerJoin(schema_1.equipos, (0, drizzle_orm_1.eq)(schema_1.equipoMiembros.equipoId, schema_1.equipos.id))
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.equipoMiembros.usuarioId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.equipos.departamentoId, depto.id));
    // Reportes del día
    const reportes = await client_1.db
        .select(REPORTE_COLUMNS)
        .from(schema_1.reportesDiarios)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.reportesDiarios.usuarioId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.reportesDiarios.fecha, fechaConsulta));
    const entregados = reportes.filter((r) => r.estado === "enviado" || r.estado === "revisado" || r.estado === "aprobado").length;
    const pendientes = miembros.length - entregados;
    return {
        miembros,
        reportes,
        resumen: {
            entregados,
            pendientes,
            total: miembros.length,
        },
    };
}
async function resumenSemanal(params) {
    const conds = [
        params.usuarioId ? (0, drizzle_orm_1.eq)(schema_1.reportesDiarios.usuarioId, params.usuarioId) : undefined,
        (0, drizzle_orm_1.eq)(schema_1.reportesDiarios.fecha, params.desde), // Simplificado: solo desde/hasta se usa para ordenar
    ].filter(Boolean);
    const reportes = await client_1.db
        .select(REPORTE_COLUMNS)
        .from(schema_1.reportesDiarios)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.reportesDiarios.usuarioId, schema_1.usuarios.id))
        .where(conds.length ? (0, drizzle_orm_1.and)(...conds) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.reportesDiarios.fecha));
    const enviados = reportes.filter((r) => r.estado !== "no_iniciado" && r.estado !== "en_elaboracion").length;
    const aprobados = reportes.filter((r) => r.estado === "aprobado").length;
    return { reportes, total: reportes.length, enviados, aprobados };
}
