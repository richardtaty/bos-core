"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timelineGlobal = timelineGlobal;
exports.actividadPorUsuario = actividadPorUsuario;
exports.resumenEjecutivo = resumenEjecutivo;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
// Timeline global: toda la actividad de la empresa en orden cronológico inverso.
// Si se pasa departamentoId, filtra solo eventos donde el autor pertenece a ese depto.
async function timelineGlobal(limite = 100, departamentoId) {
    const condiciones = [
        departamentoId ? (0, drizzle_orm_1.eq)(schema_1.usuarios.departamentoId, departamentoId) : undefined,
    ].filter(Boolean);
    const auditoria = await client_1.db
        .select({
        id: schema_1.bitacoraAuditoria.id,
        tipo: schema_1.bitacoraAuditoria.entidad,
        accion: schema_1.bitacoraAuditoria.accion,
        autorId: schema_1.bitacoraAuditoria.autorId,
        autorNombre: schema_1.usuarios.nombre,
        entidad: schema_1.bitacoraAuditoria.entidad,
        entidadId: schema_1.bitacoraAuditoria.entidadId,
        fecha: schema_1.bitacoraAuditoria.fecha,
    })
        .from(schema_1.bitacoraAuditoria)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.bitacoraAuditoria.autorId, schema_1.usuarios.id))
        .where(condiciones.length ? (0, drizzle_orm_1.and)(...condiciones) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.bitacoraAuditoria.fecha))
        .limit(limite);
    return auditoria.map((a) => ({
        ...a,
        detalle: a.accion,
        categoria: mapearCategoria(a.entidad),
    }));
}
// Actividad filtrada por usuario
async function actividadPorUsuario(usuarioId, limite = 50) {
    const auditoria = await client_1.db
        .select({
        id: schema_1.bitacoraAuditoria.id,
        tipo: schema_1.bitacoraAuditoria.entidad,
        accion: schema_1.bitacoraAuditoria.accion,
        autorId: schema_1.bitacoraAuditoria.autorId,
        autorNombre: schema_1.usuarios.nombre,
        entidad: schema_1.bitacoraAuditoria.entidad,
        entidadId: schema_1.bitacoraAuditoria.entidadId,
        fecha: schema_1.bitacoraAuditoria.fecha,
    })
        .from(schema_1.bitacoraAuditoria)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.bitacoraAuditoria.autorId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.bitacoraAuditoria.autorId, usuarioId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.bitacoraAuditoria.fecha))
        .limit(limite);
    return auditoria.map((a) => ({
        ...a,
        detalle: a.accion,
        categoria: mapearCategoria(a.entidad),
    }));
}
// Dashboard ejecutivo: resumen rápido de todo
async function resumenEjecutivo() {
    const [tareasPendientes, tareasVencidas] = await Promise.all([
        client_1.db.select().from(schema_1.tareasOperativas).where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.estado, "pendiente")),
        (async () => {
            const todas = await client_1.db.select().from(schema_1.tareasOperativas).where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.estado, "pendiente"));
            return todas.filter((t) => t.fechaLimite && t.fechaLimite < new Date());
        })(),
    ]);
    return {
        tareasPendientes: tareasPendientes.length,
        tareasVencidas: tareasVencidas.length,
    };
}
function mapearCategoria(entidad) {
    const mapa = {
        Persona: "CRM",
        Interaccion: "CRM",
        TareaSeguimiento: "Seguimiento",
        Registro: "Pipeline",
        Pago: "Facturación",
        TareaOperativa: "Tareas",
        Archivo: "Archivos",
        Usuario: "Equipo",
        Pipeline: "Configuración",
    };
    return mapa[entidad] ?? entidad;
}
