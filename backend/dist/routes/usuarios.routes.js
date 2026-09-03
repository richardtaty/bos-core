"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usuariosRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../lib/validation");
const usuarios_service_1 = require("../services/usuarios.service");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
exports.usuariosRouter = (0, express_1.Router)();
exports.usuariosRouter.use(auth_1.requireAuth);
// Todos los usuarios autenticados ven la lista completa para permitir
// la asignación de tareas entre departamentos.
exports.usuariosRouter.get("/", async (_req, res) => {
    res.json(await (0, usuarios_service_1.listarUsuarios)());
});
// Crear usuario: ADMIN puede crear solo USUARIO para su propio departamento.
// SUPER_ADMIN puede crear cualquier rol en cualquier departamento.
exports.usuariosRouter.post("/", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const parsed = validation_1.crearUsuarioSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const creador = req.user;
    const esSuperAdmin = creador.rol === "SUPER_ADMIN";
    // Un ADMIN que no es SUPER_ADMIN puede nombrar gente de su propio equipo: USUARIO,
    // TEAM_LEADER y SUPERVISOR. No puede crear ADMIN ni SUPER_ADMIN.
    // No hay escalación: más abajo se fuerza el departamento del creador, y estos dos roles
    // solo mandan sobre las tareas de ese mismo departamento — territorio que el ADMIN ya
    // controlaba de todos modos.
    const ROLES_QUE_UN_ADMIN_PUEDE_CREAR = ["USUARIO", "TEAM_LEADER", "SUPERVISOR"];
    if (!esSuperAdmin && !ROLES_QUE_UN_ADMIN_PUEDE_CREAR.includes(parsed.data.rol)) {
        res.status(403).json({ error: "Solo Super Admin puede crear usuarios con rol ADMIN o SUPER_ADMIN. Los líderes de departamento pueden crear Usuario, Team Leader y Supervisor dentro de su propio departamento." });
        return;
    }
    // Un ADMIN hereda el departamento del creador. Cada líder solo puede
    // crear usuarios en su propia unidad de negocio.
    if (!esSuperAdmin) {
        if (!creador.departamentoId) {
            res.status(403).json({ error: "No tienes un departamento asignado. Solo puedes agregar miembros si lideras un departamento." });
            return;
        }
        // Forzar el departamento del creador y supervisor = creador
        parsed.data.departamentoId = creador.departamentoId;
        parsed.data.supervisorId = creador.id;
    }
    try {
        const usuario = await (0, usuarios_service_1.crearUsuario)(parsed.data, creador.id);
        // Asignar a la tabla M:N de departamentos
        const deptoId = parsed.data.departamentoId;
        if (deptoId) {
            await client_1.db.insert(schema_1.usuarioDepartamentos).values({ usuarioId: usuario.id, departamentoId: deptoId });
        }
        res.status(201).json(usuario);
        return;
    }
    catch (err) {
        res.status(409).json({ error: err.message });
        return;
    }
});
exports.usuariosRouter.patch("/me/password", async (req, res) => {
    const parsed = validation_1.cambiarPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        await (0, usuarios_service_1.cambiarPassword)(req.user.id, parsed.data.passwordActual, parsed.data.passwordNueva);
        res.json({ ok: true });
        return;
    }
    catch (err) {
        res.status(400).json({ error: err.message });
        return;
    }
});
exports.usuariosRouter.patch("/:id/rol", (0, auth_1.requireRole)("SUPER_ADMIN"), async (req, res) => {
    const { rol } = req.body;
    if (!["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "TEAM_LEADER", "USUARIO"].includes(rol)) {
        res.status(400).json({ error: "Rol inválido" });
        return;
    }
    try {
        await (0, usuarios_service_1.cambiarRol)(req.params.id, rol, req.user.id);
        res.json({ ok: true });
        return;
    }
    catch (err) {
        res.status(422).json({ error: err.message });
        return;
    }
});
exports.usuariosRouter.patch("/:id/estado", (0, auth_1.requireRole)("SUPER_ADMIN"), async (req, res) => {
    const { activo } = req.body;
    if (typeof activo !== "boolean") {
        res.status(400).json({ error: "El campo activo debe ser true o false" });
        return;
    }
    try {
        await (0, usuarios_service_1.cambiarEstadoUsuario)(req.params.id, activo, req.user.id);
        res.json({ ok: true });
        return;
    }
    catch (err) {
        res.status(422).json({ error: err.message });
        return;
    }
});
// Solo SUPER_ADMIN puede cambiar los departamentos de un usuario (multi-depto)
exports.usuariosRouter.patch("/:id/departamento", (0, auth_1.requireRole)("SUPER_ADMIN"), async (req, res) => {
    const { departamentoIds } = req.body;
    if (!Array.isArray(departamentoIds)) {
        res.status(400).json({ error: "El campo departamentoIds (array) es obligatorio" });
        return;
    }
    try {
        // Reemplazar todas las asignaciones: borrar las viejas, insertar las nuevas
        await client_1.db.delete(schema_1.usuarioDepartamentos).where((0, drizzle_orm_1.eq)(schema_1.usuarioDepartamentos.usuarioId, req.params.id));
        for (const deptoId of departamentoIds) {
            if (deptoId) {
                await client_1.db.insert(schema_1.usuarioDepartamentos).values({ usuarioId: req.params.id, departamentoId: deptoId });
            }
        }
        await (0, usuarios_service_1.cambiarDepartamento)(req.params.id, departamentoIds, req.user.id);
        res.json({ ok: true });
        return;
    }
    catch (err) {
        res.status(422).json({ error: err.message });
        return;
    }
});
exports.usuariosRouter.patch("/:id/password", (0, auth_1.requireRole)("SUPER_ADMIN"), async (req, res) => {
    const { passwordNueva } = req.body;
    if (typeof passwordNueva !== "string" || passwordNueva.length < 6) {
        res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
        return;
    }
    try {
        await (0, usuarios_service_1.restablecerPassword)(req.params.id, passwordNueva, req.user.id);
        res.json({ ok: true });
        return;
    }
    catch (err) {
        res.status(404).json({ error: err.message });
        return;
    }
});
