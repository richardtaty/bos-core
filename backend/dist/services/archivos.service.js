"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarArchivos = listarArchivos;
exports.crearArchivo = crearArchivo;
exports.eliminarArchivo = eliminarArchivo;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const auditoria_service_1 = require("./auditoria.service");
async function listarArchivos(params) {
    const condiciones = [
        params.entidad ? (0, drizzle_orm_1.eq)(schema_1.archivos.entidad, params.entidad) : undefined,
        params.entidadId ? (0, drizzle_orm_1.eq)(schema_1.archivos.entidadId, params.entidadId) : undefined,
    ].filter(Boolean);
    const filas = await client_1.db
        .select({
        id: schema_1.archivos.id,
        nombre: schema_1.archivos.nombre,
        url: schema_1.archivos.url,
        tipo: schema_1.archivos.tipo,
        tamanoBytes: schema_1.archivos.tamanoBytes,
        entidad: schema_1.archivos.entidad,
        entidadId: schema_1.archivos.entidadId,
        autorId: schema_1.archivos.autorId,
        autorNombre: schema_1.usuarios.nombre,
        fecha: schema_1.archivos.fecha,
    })
        .from(schema_1.archivos)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.archivos.autorId, schema_1.usuarios.id))
        .where(condiciones.length ? undefined : undefined) // si no hay filtro, trae todos
        .orderBy((0, drizzle_orm_1.desc)(schema_1.archivos.fecha));
    // Aplicar filtro manualmente porque la condición dinámica con arrays es compleja en Drizzle
    if (condiciones.length === 0)
        return filas;
    return filas.filter((a) => {
        if (params.entidad && a.entidad !== params.entidad)
            return false;
        if (params.entidadId && a.entidadId !== params.entidadId)
            return false;
        return true;
    });
}
async function crearArchivo(input, autorId) {
    const id = crypto.randomUUID();
    await client_1.db.insert(schema_1.archivos).values({
        id,
        nombre: input.nombre,
        url: input.url,
        tipo: input.tipo ?? "otro",
        tamanoBytes: input.tamanoBytes ?? 0,
        entidad: input.entidad,
        entidadId: input.entidadId,
        autorId,
        fecha: new Date(),
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Archivo",
        entidadId: id,
        accion: `Archivo subido: "${input.nombre}" → ${input.entidad}`,
        autorId,
    });
    const [fila] = await client_1.db
        .select({
        id: schema_1.archivos.id,
        nombre: schema_1.archivos.nombre,
        url: schema_1.archivos.url,
        tipo: schema_1.archivos.tipo,
        tamanoBytes: schema_1.archivos.tamanoBytes,
        entidad: schema_1.archivos.entidad,
        entidadId: schema_1.archivos.entidadId,
        autorId: schema_1.archivos.autorId,
        autorNombre: schema_1.usuarios.nombre,
        fecha: schema_1.archivos.fecha,
    })
        .from(schema_1.archivos)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.archivos.autorId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.archivos.id, id));
    return fila;
}
async function eliminarArchivo(id, autorId) {
    const [archivo] = await client_1.db.select().from(schema_1.archivos).where((0, drizzle_orm_1.eq)(schema_1.archivos.id, id));
    if (!archivo)
        throw new Error("Archivo no encontrado");
    await client_1.db.delete(schema_1.archivos).where((0, drizzle_orm_1.eq)(schema_1.archivos.id, id));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Archivo",
        entidadId: id,
        accion: `Archivo eliminado: "${archivo.nombre}"`,
        autorId,
    });
    return { ok: true };
}
