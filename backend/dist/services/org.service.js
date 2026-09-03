"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarDepartamentos = listarDepartamentos;
exports.crearDepartamento = crearDepartamento;
exports.listarEquipos = listarEquipos;
exports.crearEquipo = crearEquipo;
exports.agregarMiembro = agregarMiembro;
exports.removerMiembro = removerMiembro;
exports.miembrosDelEquipo = miembrosDelEquipo;
exports.organigrama = organigrama;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const auditoria_service_1 = require("./auditoria.service");
// ─── Departamentos ────────────────────────────────────────
async function listarDepartamentos() {
    return client_1.db.select().from(schema_1.departamentos).where((0, drizzle_orm_1.eq)(schema_1.departamentos.activo, true));
}
async function crearDepartamento(input, autorId) {
    const id = crypto.randomUUID();
    await client_1.db.insert(schema_1.departamentos).values({
        id,
        nombre: input.nombre,
        descripcion: input.descripcion,
        activo: true,
        createdAt: new Date(),
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Departamento",
        entidadId: id,
        accion: `Departamento creado: "${input.nombre}"`,
        autorId,
    });
    const [d] = await client_1.db.select().from(schema_1.departamentos).where((0, drizzle_orm_1.eq)(schema_1.departamentos.id, id));
    return d;
}
// ─── Equipos ──────────────────────────────────────────────
async function listarEquipos(departamentoId) {
    const cond = departamentoId ? (0, drizzle_orm_1.eq)(schema_1.equipos.departamentoId, departamentoId) : undefined;
    const filas = await client_1.db.select().from(schema_1.equipos).where(cond);
    return filas;
}
async function crearEquipo(input, autorId) {
    const id = crypto.randomUUID();
    await client_1.db.insert(schema_1.equipos).values({
        id,
        nombre: input.nombre,
        departamentoId: input.departamentoId,
        supervisorId: input.supervisorId,
        createdAt: new Date(),
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Equipo",
        entidadId: id,
        accion: `Equipo creado: "${input.nombre}"`,
        autorId,
    });
    const [e] = await client_1.db.select().from(schema_1.equipos).where((0, drizzle_orm_1.eq)(schema_1.equipos.id, id));
    return e;
}
// ─── Miembros ─────────────────────────────────────────────
async function agregarMiembro(equipoId, usuarioId, cargo, autorId) {
    await client_1.db.insert(schema_1.equipoMiembros).values({ equipoId, usuarioId, cargo });
    // Actualizar el cargo en usuarios también
    await client_1.db.update(schema_1.usuarios).set({ cargo }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "EquipoMiembro",
        entidadId: equipoId,
        accion: `Miembro agregado al equipo con cargo: ${cargo}`,
        autorId,
    });
    return { ok: true, equipoId, usuarioId, cargo };
}
async function removerMiembro(equipoId, usuarioId, autorId) {
    await client_1.db.delete(schema_1.equipoMiembros).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.equipoMiembros.equipoId, equipoId), (0, drizzle_orm_1.eq)(schema_1.equipoMiembros.usuarioId, usuarioId)));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "EquipoMiembro",
        entidadId: equipoId,
        accion: "Miembro removido del equipo",
        autorId,
    });
    return { ok: true };
}
async function miembrosDelEquipo(equipoId) {
    return client_1.db
        .select({
        usuarioId: schema_1.equipoMiembros.usuarioId,
        nombre: schema_1.usuarios.nombre,
        email: schema_1.usuarios.email,
        cargo: schema_1.equipoMiembros.cargo,
    })
        .from(schema_1.equipoMiembros)
        .innerJoin(schema_1.usuarios, (0, drizzle_orm_1.eq)(schema_1.equipoMiembros.usuarioId, schema_1.usuarios.id))
        .where((0, drizzle_orm_1.eq)(schema_1.equipoMiembros.equipoId, equipoId));
}
// ─── Organigrama ──────────────────────────────────────────
async function organigrama(deptoId) {
    const whereDepto = deptoId ? (0, drizzle_orm_1.eq)(schema_1.departamentos.id, deptoId) : (0, drizzle_orm_1.eq)(schema_1.departamentos.activo, true);
    const deptos = await client_1.db.select().from(schema_1.departamentos).where(whereDepto);
    const resultado = [];
    for (const d of deptos) {
        const eqs = await client_1.db.select().from(schema_1.equipos).where((0, drizzle_orm_1.eq)(schema_1.equipos.departamentoId, d.id));
        const equiposConMiembros = [];
        for (const equipo of eqs) {
            const miembros = await miembrosDelEquipo(equipo.id);
            const [supervisor] = equipo.supervisorId
                ? await client_1.db.select({ id: schema_1.usuarios.id, nombre: schema_1.usuarios.nombre }).from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, equipo.supervisorId))
                : [null];
            equiposConMiembros.push({
                ...equipo,
                supervisor,
                miembros,
            });
        }
        resultado.push({
            ...d,
            equipos: equiposConMiembros,
        });
    }
    return resultado;
}
