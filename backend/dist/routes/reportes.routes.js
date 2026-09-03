"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const reportes_service_1 = require("../services/reportes.service");
exports.reportesRouter = (0, express_1.Router)();
exports.reportesRouter.use(auth_1.requireAuth);
// Solo Super Admin ve el total de la empresa y el desglose de todos los agentes.
exports.reportesRouter.get("/actividad-hoy", (0, auth_1.requireRole)("SUPER_ADMIN"), async (_req, res) => {
    res.json(await (0, reportes_service_1.actividadDelDia)());
});
// Cualquier usuario ve SU PROPIA facturación — nunca la de otros ni el total.
exports.reportesRouter.get("/mi-facturacion", async (req, res) => {
    res.json(await (0, reportes_service_1.miFacturacion)(req.user.id));
});
// "desde"/"hasta" llegan como YYYY-MM-DD. Para ADMIN no-SUPER_ADMIN se fuerza
// el rango a los últimos 7 días, sin importar lo que pida el frontend.
function parsearRango(req) {
    const esSuperAdmin = req.user.rol === "SUPER_ADMIN";
    if (!esSuperAdmin) {
        // Forzar últimos 7 días para ADMIN
        const hoy = new Date();
        const hace7 = new Date(hoy.getTime() - 6 * 86400000);
        const fmt = (d) => d.toISOString().slice(0, 10);
        return {
            desde: (0, reportes_service_1.limitesDeRangoET)(fmt(hace7), false),
            hasta: (0, reportes_service_1.limitesDeRangoET)(fmt(hoy), true),
        };
    }
    const desde = req.query.desde ? (0, reportes_service_1.limitesDeRangoET)(req.query.desde, false) : undefined;
    const hasta = req.query.hasta ? (0, reportes_service_1.limitesDeRangoET)(req.query.hasta, true) : undefined;
    return { desde, hasta };
}
// Un agente normal SIEMPRE ve solo lo suyo, sin importar qué usuarioId le pase a la URL —
// solo Super Admin puede pedir el de otro agente o el de todos (sin usuarioId = todos).
exports.reportesRouter.get("/pagos", async (req, res) => {
    const { desde, hasta } = parsearRango(req);
    const esSuperAdmin = req.user.rol === "SUPER_ADMIN";
    const usuarioId = esSuperAdmin ? req.query.usuarioId : req.user.id;
    res.json(await (0, reportes_service_1.listarPagosDetallado)({ desde, hasta, usuarioId }));
});
exports.reportesRouter.get("/ventas-por-dia", async (req, res) => {
    const { desde, hasta } = parsearRango(req);
    const esSuperAdmin = req.user.rol === "SUPER_ADMIN";
    const usuarioId = esSuperAdmin ? req.query.usuarioId : req.user.id;
    res.json(await (0, reportes_service_1.ventasPorDiaYUsuario)({ desde, hasta, usuarioId }));
});
// Dashboard del líder de departamento — solo Marketing
exports.reportesRouter.get("/dashboard-lider", (0, auth_1.requireDepartamento)("Marketing"), async (req, res) => {
    res.json(await (0, reportes_service_1.dashboardLider)(req.user.id));
});
// Dashboard CEO (solo Super Admin)
exports.reportesRouter.get("/dashboard-ceo", (0, auth_1.requireRole)("SUPER_ADMIN"), async (_req, res) => {
    res.json(await (0, reportes_service_1.dashboardCEO)());
});
// Revenue Command Center (solo Super Admin)
exports.reportesRouter.get("/command-center", (0, auth_1.requireRole)("SUPER_ADMIN"), async (_req, res) => {
    res.json(await (0, reportes_service_1.commandCenter)());
});
// Ask BOS (solo Super Admin)
exports.reportesRouter.post("/ask-bos", (0, auth_1.requireRole)("SUPER_ADMIN"), async (req, res) => {
    res.json(await (0, reportes_service_1.askBos)(String(req.body?.pregunta ?? "")));
});
// CEO Mode (solo Super Admin)
exports.reportesRouter.get("/ceo-mode", (0, auth_1.requireRole)("SUPER_ADMIN"), async (_req, res) => {
    res.json(await (0, reportes_service_1.ceoMode)());
});
