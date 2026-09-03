"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recursosRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const recursos_service_1 = require("../services/recursos.service");
exports.recursosRouter = (0, express_1.Router)();
exports.recursosRouter.use(auth_1.requireAuth);
// GET /api/recursos?cliente=&categoria=
exports.recursosRouter.get("/", async (req, res) => {
    const { cliente, categoria } = req.query;
    res.json(await (0, recursos_service_1.listarRecursos)({ cliente, categoria }));
});
// POST /api/recursos — cualquier usuario autenticado puede crear
exports.recursosRouter.post("/", async (req, res) => {
    try {
        const r = await (0, recursos_service_1.crearRecurso)(req.body, req.user.id);
        res.status(201).json(r);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// PATCH /api/recursos/:id — solo ADMIN/SUPER_ADMIN
exports.recursosRouter.patch("/:id", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    try {
        const r = await (0, recursos_service_1.actualizarRecurso)(req.params.id, req.body, req.user.id);
        res.json(r);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// DELETE /api/recursos/:id — solo ADMIN/SUPER_ADMIN
exports.recursosRouter.delete("/:id", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    try {
        const r = await (0, recursos_service_1.eliminarRecurso)(req.params.id, req.user.id);
        res.json(r);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
