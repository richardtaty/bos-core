"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportesDiariosRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const reportes_diarios_service_1 = require("../services/reportes-diarios.service");
exports.reportesDiariosRouter = (0, express_1.Router)();
exports.reportesDiariosRouter.use(auth_1.requireAuth);
// GET /api/reportes-diarios/hoy — reporte de hoy del usuario autenticado (auto-crea)
exports.reportesDiariosRouter.get("/hoy", async (req, res) => {
    const reporte = await (0, reportes_diarios_service_1.reporteDelDia)(req.user.id);
    res.json(reporte);
});
// GET /api/reportes-diarios/lider/equipo?fecha=YYYY-MM-DD — vista del líder
exports.reportesDiariosRouter.get("/lider/equipo", async (req, res) => {
    const { fecha } = req.query;
    res.json(await (0, reportes_diarios_service_1.panelLider)(fecha));
});
// GET /api/reportes-diarios/resumen?usuarioId=&desde=&hasta=
exports.reportesDiariosRouter.get("/resumen", async (req, res) => {
    const { usuarioId, desde, hasta } = req.query;
    res.json(await (0, reportes_diarios_service_1.resumenSemanal)({ usuarioId, desde: desde, hasta: hasta }));
});
// GET /api/reportes-diarios?usuarioId=&fecha=&estado=
exports.reportesDiariosRouter.get("/", async (req, res) => {
    const { usuarioId, fecha, estado } = req.query;
    res.json(await (0, reportes_diarios_service_1.listarReportes)({ usuarioId, fecha, estado }));
});
// GET /api/reportes-diarios/:id
exports.reportesDiariosRouter.get("/:id", async (req, res) => {
    const reporte = await (0, reportes_diarios_service_1.obtenerReporte)(req.params.id);
    if (!reporte) {
        res.status(404).json({ error: "Reporte no encontrado" });
        return;
    }
    res.json(reporte);
});
// POST /api/reportes-diarios/:id/enviar
exports.reportesDiariosRouter.post("/:id/enviar", async (req, res) => {
    try {
        const reporte = await (0, reportes_diarios_service_1.enviarReporte)(req.params.id, req.user.id);
        res.json(reporte);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// POST /api/reportes-diarios/:id/revisar
exports.reportesDiariosRouter.post("/:id/revisar", async (req, res) => {
    try {
        const { decision } = req.body;
        const reporte = await (0, reportes_diarios_service_1.revisarReporte)(req.params.id, decision, req.user.id);
        res.json(reporte);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// PATCH /api/reportes-diarios/:id
exports.reportesDiariosRouter.patch("/:id", async (req, res) => {
    try {
        const reporte = await (0, reportes_diarios_service_1.actualizarReporte)(req.params.id, req.body, req.user.id);
        res.json(reporte);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
