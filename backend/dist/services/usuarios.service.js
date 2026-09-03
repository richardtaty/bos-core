"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarUsuarios = listarUsuarios;
exports.crearUsuario = crearUsuario;
exports.cambiarPassword = cambiarPassword;
exports.cambiarRol = cambiarRol;
exports.cambiarEstadoUsuario = cambiarEstadoUsuario;
exports.restablecerPassword = restablecerPassword;
exports.cambiarDepartamento = cambiarDepartamento;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const auditoria_service_1 = require("./auditoria.service");
async function listarUsuarios(departamentoIds) {
    const ids = departamentoIds ?? [];
    // Obtener usuarios. Si hay filtro de departamentos, buscar en la tabla M:N.
    let filas;
    if (ids.length > 0) {
        // Usuarios que pertenecen a al menos uno de los departamentos
        const usuarioIds = await client_1.db
            .selectDistinct({ usuarioId: schema_1.usuarioDepartamentos.usuarioId })
            .from(schema_1.usuarioDepartamentos)
            .where((0, drizzle_orm_1.inArray)(schema_1.usuarioDepartamentos.departamentoId, ids));
        const idsFiltrados = usuarioIds.map((r) => r.usuarioId);
        filas = idsFiltrados.length > 0
            ? await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.inArray)(schema_1.usuarios.id, idsFiltrados))
            : [];
    }
    else {
        filas = await client_1.db.select().from(schema_1.usuarios);
    }
    // Cargar departamentos (M:N) para cada usuario
    const todosDeptos = await client_1.db.select().from(schema_1.usuarioDepartamentos);
    const deptosPorUsuario = new Map();
    for (const d of todosDeptos) {
        const arr = deptosPorUsuario.get(d.usuarioId) ?? [];
        arr.push(d.departamentoId);
        deptosPorUsuario.set(d.usuarioId, arr);
    }
    return filas.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        activo: u.activo,
        departamentoId: u.departamentoId,
        departamentoIds: deptosPorUsuario.get(u.id) ?? [],
        cargo: u.cargo,
        supervisorId: u.supervisorId,
    }));
}
async function crearUsuario(input, autorId) {
    const [existente] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.email, input.email));
    if (existente)
        throw new Error("Ya existe un usuario con ese email");
    const passwordHash = await bcryptjs_1.default.hash(input.password, 10);
    const id = crypto.randomUUID();
    await client_1.db.insert(schema_1.usuarios).values({
        id,
        nombre: input.nombre,
        email: input.email,
        passwordHash,
        rol: input.rol,
        departamentoId: input.departamentoId,
        cargo: input.cargo,
        supervisorId: input.supervisorId,
        activo: true,
        createdAt: new Date(),
    });
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Usuario",
        entidadId: id,
        accion: `Miembro de equipo creado: ${input.nombre} — ${input.cargo ?? "sin cargo"} (${input.rol})`,
        autorId,
    });
    return { id, nombre: input.nombre, email: input.email, rol: input.rol, cargo: input.cargo, departamentoId: input.departamentoId, supervisorId: input.supervisorId };
}
async function cambiarPassword(usuarioId, passwordActual, passwordNueva) {
    const [usuario] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    if (!usuario)
        throw new Error("Usuario no encontrado");
    const valido = await bcryptjs_1.default.compare(passwordActual, usuario.passwordHash);
    if (!valido)
        throw new Error("La contraseña actual no es correcta");
    const nuevoHash = await bcryptjs_1.default.hash(passwordNueva, 10);
    await client_1.db.update(schema_1.usuarios).set({ passwordHash: nuevoHash }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Usuario",
        entidadId: usuarioId,
        accion: "Contraseña actualizada por el propio usuario",
        autorId: usuarioId,
    });
}
async function cambiarRol(usuarioId, nuevoRol, autorId) {
    if (nuevoRol !== "SUPER_ADMIN") {
        const superAdmins = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.rol, "SUPER_ADMIN"));
        const objetivo = superAdmins.find((u) => u.id === usuarioId);
        if (objetivo && superAdmins.length <= 1) {
            throw new Error("Debe existir al menos un Super Admin. Asigna otro Super Admin antes de cambiar este.");
        }
    }
    await client_1.db.update(schema_1.usuarios).set({ rol: nuevoRol }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Usuario",
        entidadId: usuarioId,
        accion: `Rol cambiado a ${nuevoRol}`,
        autorId,
    });
}
// "Eliminar" un usuario en realidad lo desactiva — nunca se borra de verdad porque tiene
// contactos, notas e historial ligados a su ID. Desactivado pierde acceso inmediato al login,
// pero todo su trabajo queda intacto y trazable.
async function cambiarEstadoUsuario(usuarioId, activo, autorId) {
    if (!activo) {
        const [objetivo] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
        if (!objetivo)
            throw new Error("Usuario no encontrado");
        if (objetivo.rol === "SUPER_ADMIN") {
            const superAdminsActivos = await client_1.db
                .select()
                .from(schema_1.usuarios)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.usuarios.rol, "SUPER_ADMIN"), (0, drizzle_orm_1.eq)(schema_1.usuarios.activo, true)));
            if (superAdminsActivos.length <= 1) {
                throw new Error("Debe existir al menos un Super Admin activo. Asigna otro Super Admin antes de desactivar este.");
            }
        }
    }
    await client_1.db.update(schema_1.usuarios).set({ activo }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Usuario",
        entidadId: usuarioId,
        accion: activo ? "Usuario reactivado" : "Usuario desactivado",
        autorId,
    });
}
// Solo Super Admin: pone una contraseña nueva a otro usuario sin necesitar la actual —
// reemplaza el reset manual por Terminal (fly ssh console) que hacíamos antes.
async function restablecerPassword(usuarioId, passwordNueva, autorId) {
    const [usuario] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    if (!usuario)
        throw new Error("Usuario no encontrado");
    const nuevoHash = await bcryptjs_1.default.hash(passwordNueva, 10);
    await client_1.db.update(schema_1.usuarios).set({ passwordHash: nuevoHash }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Usuario",
        entidadId: usuarioId,
        accion: "Contraseña restablecida por un Super Admin",
        autorId,
    });
}
// Solo Super Admin: reasigna los departamentos de un usuario (multi-depto).
// La ruta ya borró e insertó en usuario_departamentos. Aquí solo auditamos.
async function cambiarDepartamento(usuarioId, departamentoIds, autorId) {
    const [usuario] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, usuarioId));
    if (!usuario)
        throw new Error("Usuario no encontrado");
    const deptos = departamentoIds.length > 0
        ? await client_1.db.select({ nombre: schema_1.departamentos.nombre })
            .from(schema_1.departamentos)
            .where((0, drizzle_orm_1.or)(...departamentoIds.map((id) => (0, drizzle_orm_1.eq)(schema_1.departamentos.id, id))))
        : [];
    const nombres = deptos.map((d) => d.nombre).join(", ") || "Sin departamento";
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "Usuario",
        entidadId: usuarioId,
        accion: `Departamentos actualizados: ${nombres}`,
        autorId,
    });
}
