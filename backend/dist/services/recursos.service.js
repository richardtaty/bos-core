"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarRecursos = listarRecursos;
exports.crearRecurso = crearRecurso;
exports.actualizarRecurso = actualizarRecurso;
exports.eliminarRecurso = eliminarRecurso;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const auditoria_service_1 = require("./auditoria.service");
async function listarRecursos(params) {
    const conds = [
        params.cliente ? (0, drizzle_orm_1.eq)(schema_1.recursos.cliente, params.cliente) : undefined,
        params.categoria ? (0, drizzle_orm_1.eq)(schema_1.recursos.categoria, params.categoria) : undefined,
    ].filter(Boolean);
    return client_1.db
        .select({
        id: schema_1.recursos.id,
        nombre: schema_1.recursos.nombre,
        url: schema_1.recursos.url,
        descripcion: schema_1.recursos.descripcion,
        cliente: schema_1.recursos.cliente,
        categoria: schema_1.recursos.categoria,
        visibleRoles: schema_1.recursos.visibleRoles,
        autorId: schema_1.recursos.autorId,
        autorNombre: schema_1.usuarios.nombre,
        createdAt: schema_1.recursos.createdAt,
        updatedAt: schema_1.recursos.updatedAt,
    })
        .from(schema_1.recursos)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.recursos.autorId, schema_1.usuarios.id))
        .where(conds.length ? (0, drizzle_orm_1.and)(...conds) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.recursos.updatedAt));
}
async function crearRecurso(input, autorId) {
    const id = crypto.randomUUID();
    const ahora = new Date();
    await client_1.db.insert(schema_1.recursos).values({
        id,
        nombre: input.nombre,
        url: input.url,
        descripcion: input.descripcion,
        cliente: input.cliente,
        categoria: input.categoria,
        visibleRoles: input.visibleRoles ?? "SUPER_ADMIN,ADMIN,USUARIO",
        autorId,
        createdAt: ahora,
        updatedAt: ahora,
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Recurso",
        entidadId: id,
        accion: `Recurso creado: "${input.nombre}"`,
        autorId,
    });
    return { id, nombre: input.nombre, url: input.url };
}
async function actualizarRecurso(id, input, autorId) {
    const [r] = await client_1.db.select().from(schema_1.recursos).where((0, drizzle_orm_1.eq)(schema_1.recursos.id, id));
    if (!r)
        throw new Error("Recurso no encontrado");
    const data = { updatedAt: new Date() };
    if (input.nombre !== undefined)
        data.nombre = input.nombre;
    if (input.url !== undefined)
        data.url = input.url;
    if (input.descripcion !== undefined)
        data.descripcion = input.descripcion;
    if (input.cliente !== undefined)
        data.cliente = input.cliente;
    if (input.categoria !== undefined)
        data.categoria = input.categoria;
    if (input.visibleRoles !== undefined)
        data.visibleRoles = input.visibleRoles;
    await client_1.db.update(schema_1.recursos).set(data).where((0, drizzle_orm_1.eq)(schema_1.recursos.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Recurso",
        entidadId: id,
        accion: `Recurso actualizado: "${input.nombre ?? r.nombre}"`,
        autorId,
    });
    return { id, ...data };
}
async function eliminarRecurso(id, autorId) {
    const [r] = await client_1.db.select().from(schema_1.recursos).where((0, drizzle_orm_1.eq)(schema_1.recursos.id, id));
    if (!r)
        throw new Error("Recurso no encontrado");
    await client_1.db.delete(schema_1.recursos).where((0, drizzle_orm_1.eq)(schema_1.recursos.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Recurso",
        entidadId: id,
        accion: `Recurso eliminado: "${r.nombre}"`,
        autorId,
    });
    return { ok: true };
}
