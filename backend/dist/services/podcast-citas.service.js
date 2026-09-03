"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarCitas = listarCitas;
exports.obtenerCita = obtenerCita;
exports.crearCita = crearCita;
exports.actualizarCita = actualizarCita;
exports.eliminarCita = eliminarCita;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
// Campos que se devuelven en toda cita (join a persona → invitado y a usuario → autor).
const camposCita = {
    id: schema_1.podcastCitas.id,
    personaId: schema_1.podcastCitas.personaId,
    invitado: schema_1.personas.nombre,
    fecha: schema_1.podcastCitas.fecha,
    hora: schema_1.podcastCitas.hora,
    estado: schema_1.podcastCitas.estado,
    nota: schema_1.podcastCitas.nota,
    creadoPor: schema_1.podcastCitas.creadoPor,
    creadoPorNombre: schema_1.usuarios.nombre,
    createdAt: schema_1.podcastCitas.createdAt,
    updatedAt: schema_1.podcastCitas.updatedAt,
};
async function listarCitas(params = {}) {
    const conds = [
        params.desde ? (0, drizzle_orm_1.gte)(schema_1.podcastCitas.fecha, params.desde) : undefined,
        params.hasta ? (0, drizzle_orm_1.lte)(schema_1.podcastCitas.fecha, params.hasta) : undefined,
    ].filter(Boolean);
    return client_1.db
        .select(camposCita)
        .from(schema_1.podcastCitas)
        .innerJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.podcastCitas.personaId, schema_1.personas.id))
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.podcastCitas.creadoPor, schema_1.usuarios.id))
        .where(conds.length ? (0, drizzle_orm_1.and)(...conds) : undefined)
        .orderBy((0, drizzle_orm_1.asc)(schema_1.podcastCitas.fecha), (0, drizzle_orm_1.asc)(schema_1.podcastCitas.hora));
}
async function obtenerCita(id) {
    const [c] = await client_1.db
        .select(camposCita)
        .from(schema_1.podcastCitas)
        .innerJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.podcastCitas.personaId, schema_1.personas.id))
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.podcastCitas.creadoPor, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.podcastCitas.id, id));
    return c ?? null;
}
async function crearCita(input, creadoPor) {
    const id = crypto.randomUUID();
    const ahora = new Date();
    await client_1.db.insert(schema_1.podcastCitas).values({
        id,
        personaId: input.personaId,
        fecha: input.fecha,
        hora: input.hora,
        estado: (input.estado || "agendado"),
        nota: input.nota,
        creadoPor,
        createdAt: ahora,
        updatedAt: ahora,
    });
    return obtenerCita(id);
}
async function actualizarCita(id, input) {
    const [c] = await client_1.db.select().from(schema_1.podcastCitas).where((0, drizzle_orm_1.eq)(schema_1.podcastCitas.id, id));
    if (!c)
        throw new Error("Cita no encontrada");
    const data = { updatedAt: new Date() };
    if (input.personaId !== undefined)
        data.personaId = input.personaId;
    if (input.fecha !== undefined)
        data.fecha = input.fecha;
    if (input.hora !== undefined)
        data.hora = input.hora;
    if (input.estado !== undefined)
        data.estado = input.estado;
    if (input.nota !== undefined)
        data.nota = input.nota;
    await client_1.db.update(schema_1.podcastCitas).set(data).where((0, drizzle_orm_1.eq)(schema_1.podcastCitas.id, id));
    return obtenerCita(id);
}
async function eliminarCita(id) {
    await client_1.db.delete(schema_1.podcastCitas).where((0, drizzle_orm_1.eq)(schema_1.podcastCitas.id, id));
}
