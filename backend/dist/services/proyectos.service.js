"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarProyectos = listarProyectos;
exports.obtenerProyecto = obtenerProyecto;
exports.crearProyecto = crearProyecto;
exports.actualizarProyecto = actualizarProyecto;
exports.cambiarActivoProyecto = cambiarActivoProyecto;
exports.agregarComentarioProyecto = agregarComentarioProyecto;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const auditoria_service_1 = require("./auditoria.service");
async function listarProyectos(params) {
    const conds = [
        params.departamentoId ? (0, drizzle_orm_1.eq)(schema_1.proyectos.departamentoId, params.departamentoId) : undefined,
        params.responsableId ? (0, drizzle_orm_1.eq)(schema_1.proyectos.responsableId, params.responsableId) : undefined,
        params.estado ? (0, drizzle_orm_1.eq)(schema_1.proyectos.estado, params.estado) : undefined,
    ].filter(Boolean);
    return client_1.db
        .select({
        id: schema_1.proyectos.id,
        nombre: schema_1.proyectos.nombre,
        objetivo: schema_1.proyectos.objetivo,
        cliente: schema_1.proyectos.cliente,
        responsableId: schema_1.proyectos.responsableId,
        responsableNombre: schema_1.usuarios.nombre,
        departamentoId: schema_1.proyectos.departamentoId,
        departamentoNombre: schema_1.departamentos.nombre,
        fechaInicio: schema_1.proyectos.fechaInicio,
        fechaEntrega: schema_1.proyectos.fechaEntrega,
        prioridad: schema_1.proyectos.prioridad,
        estado: schema_1.proyectos.estado,
        activo: schema_1.proyectos.activo,
        createdAt: schema_1.proyectos.createdAt,
        updatedAt: schema_1.proyectos.updatedAt,
    })
        .from(schema_1.proyectos)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.proyectos.responsableId, schema_1.usuarios.id))
        .innerJoin(schema_1.departamentos, (0, drizzle_orm_1.eq)(schema_1.proyectos.departamentoId, schema_1.departamentos.id))
        .where(conds.length ? (0, drizzle_orm_1.and)(...conds) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.proyectos.updatedAt));
}
async function obtenerProyecto(id) {
    const [p] = await client_1.db
        .select({
        id: schema_1.proyectos.id,
        nombre: schema_1.proyectos.nombre,
        objetivo: schema_1.proyectos.objetivo,
        cliente: schema_1.proyectos.cliente,
        responsableId: schema_1.proyectos.responsableId,
        responsableNombre: schema_1.usuarios.nombre,
        departamentoId: schema_1.proyectos.departamentoId,
        departamentoNombre: schema_1.departamentos.nombre,
        fechaInicio: schema_1.proyectos.fechaInicio,
        fechaEntrega: schema_1.proyectos.fechaEntrega,
        prioridad: schema_1.proyectos.prioridad,
        estado: schema_1.proyectos.estado,
        activo: schema_1.proyectos.activo,
        createdAt: schema_1.proyectos.createdAt,
        updatedAt: schema_1.proyectos.updatedAt,
    })
        .from(schema_1.proyectos)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.proyectos.responsableId, schema_1.usuarios.id))
        .innerJoin(schema_1.departamentos, (0, drizzle_orm_1.eq)(schema_1.proyectos.departamentoId, schema_1.departamentos.id))
        .where((0, drizzle_orm_1.eq)(schema_1.proyectos.id, id));
    if (!p)
        return null;
    const tareas = await client_1.db
        .select()
        .from(schema_1.tareasOperativas)
        .where((0, drizzle_orm_1.eq)(schema_1.tareasOperativas.proyectoId, id))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.tareasOperativas.updatedAt));
    const comentarios = await client_1.db
        .select({
        id: schema_1.proyectoComentarios.id,
        autorId: schema_1.proyectoComentarios.autorId,
        autorNombre: schema_1.usuarios.nombre,
        texto: schema_1.proyectoComentarios.texto,
        fecha: schema_1.proyectoComentarios.fecha,
    })
        .from(schema_1.proyectoComentarios)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.proyectoComentarios.autorId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.proyectoComentarios.proyectoId, id))
        .orderBy(schema_1.proyectoComentarios.fecha);
    return { ...p, tareas, comentarios };
}
async function crearProyecto(input, autorId) {
    const id = crypto.randomUUID();
    const ahora = new Date();
    await client_1.db.insert(schema_1.proyectos).values({
        id,
        nombre: input.nombre,
        objetivo: input.objetivo,
        cliente: input.cliente,
        responsableId: input.responsableId,
        departamentoId: input.departamentoId,
        fechaInicio: input.fechaInicio ? new Date(input.fechaInicio) : undefined,
        fechaEntrega: input.fechaEntrega ? new Date(input.fechaEntrega) : undefined,
        prioridad: (input.prioridad || "media"),
        estado: "activo",
        activo: true,
        createdAt: ahora,
        updatedAt: ahora,
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Proyecto",
        entidadId: id,
        accion: `Proyecto creado: "${input.nombre}"`,
        autorId,
    });
    return obtenerProyecto(id);
}
async function actualizarProyecto(id, input, autorId) {
    const [p] = await client_1.db.select().from(schema_1.proyectos).where((0, drizzle_orm_1.eq)(schema_1.proyectos.id, id));
    if (!p)
        throw new Error("Proyecto no encontrado");
    const data = { updatedAt: new Date() };
    if (input.nombre !== undefined)
        data.nombre = input.nombre;
    if (input.objetivo !== undefined)
        data.objetivo = input.objetivo;
    if (input.cliente !== undefined)
        data.cliente = input.cliente;
    if (input.responsableId !== undefined)
        data.responsableId = input.responsableId;
    if (input.fechaInicio !== undefined)
        data.fechaInicio = input.fechaInicio ? new Date(input.fechaInicio) : null;
    if (input.fechaEntrega !== undefined)
        data.fechaEntrega = input.fechaEntrega ? new Date(input.fechaEntrega) : null;
    if (input.prioridad !== undefined)
        data.prioridad = input.prioridad;
    if (input.estado !== undefined)
        data.estado = input.estado;
    await client_1.db.update(schema_1.proyectos).set(data).where((0, drizzle_orm_1.eq)(schema_1.proyectos.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({ entidad: "Proyecto", entidadId: id, accion: `Proyecto actualizado: "${input.nombre ?? p.nombre}"`, autorId });
    return obtenerProyecto(id);
}
async function cambiarActivoProyecto(id, activo, autorId) {
    const [p] = await client_1.db.select().from(schema_1.proyectos).where((0, drizzle_orm_1.eq)(schema_1.proyectos.id, id));
    if (!p)
        throw new Error("Proyecto no encontrado");
    await client_1.db.update(schema_1.proyectos).set({ activo, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.proyectos.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Proyecto",
        entidadId: id,
        accion: activo ? `Proyecto reactivado: "${p.nombre}"` : `Proyecto desactivado: "${p.nombre}"`,
        autorId,
    });
    return obtenerProyecto(id);
}
async function agregarComentarioProyecto(proyectoId, texto, autorId) {
    const id = crypto.randomUUID();
    await client_1.db.insert(schema_1.proyectoComentarios).values({ id, proyectoId, autorId, texto, fecha: new Date() });
    const [c] = await client_1.db
        .select({ id: schema_1.proyectoComentarios.id, autorId: schema_1.proyectoComentarios.autorId, autorNombre: schema_1.usuarios.nombre, texto: schema_1.proyectoComentarios.texto, fecha: schema_1.proyectoComentarios.fecha })
        .from(schema_1.proyectoComentarios)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.proyectoComentarios.autorId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.proyectoComentarios.id, id));
    return c;
}
