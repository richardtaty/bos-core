"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proyectosRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const proyectos_service_1 = require("../services/proyectos.service");
exports.proyectosRouter = (0, express_1.Router)();
exports.proyectosRouter.use(auth_1.requireAuth);
exports.proyectosRouter.get("/", async (req, res) => {
    const user = req.user;
    let { departamentoId, responsableId, estado } = req.query;
    // Si no es SUPER_ADMIN, forzar el departamento del usuario.
    if (user.rol !== "SUPER_ADMIN") {
        departamentoId = user.departamentoId ?? undefined;
    }
    res.json(await (0, proyectos_service_1.listarProyectos)({ departamentoId, responsableId, estado }));
});
exports.proyectosRouter.get("/:id", async (req, res) => {
    const p = await (0, proyectos_service_1.obtenerProyecto)(req.params.id);
    if (!p) {
        res.status(404).json({ error: "Proyecto no encontrado" });
        return;
    }
    res.json(p);
});
exports.proyectosRouter.post("/", async (req, res) => {
    try {
        const user = req.user;
        const data = { ...req.body };
        // Heredar departamento y responsable del creador si no es SUPER_ADMIN
        if (user.rol !== "SUPER_ADMIN") {
            data.departamentoId = user.departamentoId ?? data.departamentoId;
            data.responsableId = user.id;
        }
        const p = await (0, proyectos_service_1.crearProyecto)(data, user.id);
        res.status(201).json(p);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.proyectosRouter.patch("/:id/activo", async (req, res) => {
    try {
        const { activo } = req.body;
        if (typeof activo !== "boolean") {
            res.status(400).json({ error: "El campo 'activo' debe ser booleano" });
            return;
        }
        const p = await (0, proyectos_service_1.cambiarActivoProyecto)(req.params.id, activo, req.user.id);
        res.json(p);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.proyectosRouter.patch("/:id", async (req, res) => {
    try {
        const p = await (0, proyectos_service_1.actualizarProyecto)(req.params.id, req.body, req.user.id);
        res.json(p);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.proyectosRouter.post("/:id/comentarios", async (req, res) => {
    const c = await (0, proyectos_service_1.agregarComentarioProyecto)(req.params.id, req.body.texto, req.user.id);
    res.status(201).json(c);
});
