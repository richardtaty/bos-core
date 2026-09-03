"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.archivosRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const archivos_service_1 = require("../services/archivos.service");
exports.archivosRouter = (0, express_1.Router)();
exports.archivosRouter.use(auth_1.requireAuth);
// GET /api/archivos?entidad=TareaOperativa&entidadId=xxx
exports.archivosRouter.get("/", async (req, res) => {
    const { entidad, entidadId } = req.query;
    res.json(await (0, archivos_service_1.listarArchivos)({ entidad, entidadId }));
});
// POST /api/archivos
exports.archivosRouter.post("/", async (req, res) => {
    try {
        const archivo = await (0, archivos_service_1.crearArchivo)(req.body, req.user.id);
        res.status(201).json(archivo);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// DELETE /api/archivos/:id
exports.archivosRouter.delete("/:id", async (req, res) => {
    try {
        await (0, archivos_service_1.eliminarArchivo)(req.params.id, req.user.id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
