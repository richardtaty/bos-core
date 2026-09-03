"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actividadRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const actividad_service_1 = require("../services/actividad.service");
exports.actividadRouter = (0, express_1.Router)();
exports.actividadRouter.use(auth_1.requireAuth);
// GET /api/actividad — timeline global.
// SUPER_ADMIN ve todo. Los demás solo ven actividad de su departamento.
exports.actividadRouter.get("/", async (req, res) => {
    const limite = Math.min(Number(req.query.limite) || 100, 200);
    const user = req.user;
    if (user.rol === "SUPER_ADMIN") {
        res.json(await (0, actividad_service_1.timelineGlobal)(limite));
        return;
    }
    // Cada departamento solo ve su propia actividad
    res.json(await (0, actividad_service_1.timelineGlobal)(limite, user.departamentoId ?? undefined));
});
// GET /api/actividad/usuario/:id — actividad de un usuario específico
exports.actividadRouter.get("/usuario/:id", async (req, res) => {
    res.json(await (0, actividad_service_1.actividadPorUsuario)(req.params.id));
});
// GET /api/actividad/mi-actividad — actividad del usuario autenticado
exports.actividadRouter.get("/mi-actividad", async (req, res) => {
    res.json(await (0, actividad_service_1.actividadPorUsuario)(req.user.id));
});
// GET /api/actividad/resumen — resumen ejecutivo (tareas pendientes, vencidas)
exports.actividadRouter.get("/resumen", async (_req, res) => {
    res.json(await (0, actividad_service_1.resumenEjecutivo)());
});
