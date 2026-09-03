"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metaAdsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const metaAds_service_1 = require("../services/metaAds.service");
exports.metaAdsRouter = (0, express_1.Router)();
exports.metaAdsRouter.use(auth_1.requireAuth);
// Gestionar = crear/editar/eliminar. Pueden: SUPER_ADMIN, ADMIN o un usuario
// del departamento de Marketing. No se usan nombres/emails/IDs fijos: se
// resuelve el departamento del usuario autenticado.
async function puedeGestionar(req, res, next) {
    const user = req.user;
    if (user.rol === "SUPER_ADMIN" || user.rol === "ADMIN") {
        next();
        return;
    }
    const ids = user.departamentoIds ?? (user.departamentoId ? [user.departamentoId] : []);
    for (const id of ids) {
        const nombre = await (0, auth_1.nombreDepartamentoDe)(id);
        if (nombre === "Marketing") {
            next();
            return;
        }
    }
    res.status(403).json({ error: "No tienes permiso para gestionar métricas de Meta Ads." });
}
// GET /api/meta-ads — lista de reportes (cualquier usuario autenticado puede ver)
exports.metaAdsRouter.get("/", async (_req, res) => {
    res.json(await (0, metaAds_service_1.listarReportes)());
});
// GET /api/meta-ads/:id — detalle completo con grupos, campañas y segmentaciones
exports.metaAdsRouter.get("/:id", async (req, res) => {
    try {
        res.json(await (0, metaAds_service_1.obtenerReporte)(req.params.id));
    }
    catch (e) {
        res.status(404).json({ error: e.message });
    }
});
// POST /api/meta-ads — registrar nuevo reporte (solo quien gestiona)
exports.metaAdsRouter.post("/", puedeGestionar, async (req, res) => {
    try {
        const r = await (0, metaAds_service_1.crearReporte)(req.body, req.user.id);
        res.status(201).json(r);
    }
    catch (e) {
        if (e instanceof metaAds_service_1.ReporteDuplicadoError) {
            res.status(409).json({ error: e.message, reporteExistenteId: e.reporteExistenteId });
            return;
        }
        res.status(400).json({ error: e.message });
    }
});
// PATCH /api/meta-ads/:id — editar reporte (solo quien gestiona)
exports.metaAdsRouter.patch("/:id", puedeGestionar, async (req, res) => {
    try {
        const r = await (0, metaAds_service_1.actualizarReporte)(req.params.id, req.body, req.user.id);
        res.json(r);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// DELETE /api/meta-ads/:id — eliminar reporte (solo quien gestiona)
exports.metaAdsRouter.delete("/:id", puedeGestionar, async (req, res) => {
    try {
        res.json(await (0, metaAds_service_1.eliminarReporte)(req.params.id, req.user.id));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
