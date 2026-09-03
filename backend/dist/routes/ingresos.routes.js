"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingresosRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const ingresos_service_1 = require("../services/ingresos.service");
exports.ingresosRouter = (0, express_1.Router)();
exports.ingresosRouter.use(auth_1.requireAuth);
// ─── Ticker público (todos los usuarios autenticados) ──
exports.ingresosRouter.get("/ticker", async (_req, res) => {
    try {
        res.json(await (0, ingresos_service_1.tickerIngresos)());
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ─── Rutas protegidas (solo SUPER_ADMIN) ──────────────
const admin = (0, auth_1.requireRole)("SUPER_ADMIN");
exports.ingresosRouter.get("/ofertas", admin, async (_req, res) => {
    try {
        res.json(await (0, ingresos_service_1.getOfertas)());
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.ingresosRouter.get("/resumen", admin, async (req, res) => {
    try {
        res.json(await (0, ingresos_service_1.resumenMensual)(req.query.mes));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.ingresosRouter.get("/resumen/hoy", admin, async (_req, res) => {
    try {
        res.json(await (0, ingresos_service_1.resumenHoy)());
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.ingresosRouter.get("/ofertas/progreso", admin, async (req, res) => {
    try {
        res.json(await (0, ingresos_service_1.ventasPorOferta)(req.query.mes));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.ingresosRouter.get("/adelantos", admin, async (_req, res) => {
    try {
        res.json(await (0, ingresos_service_1.adelantosPendientes)());
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.ingresosRouter.get("/egresos/categorias", admin, async (req, res) => {
    try {
        res.json(await (0, ingresos_service_1.egresosPorCategoria)(req.query.mes));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.ingresosRouter.get("/rentabilidad", admin, async (req, res) => {
    try {
        res.json(await (0, ingresos_service_1.rentabilidadPorLinea)(req.query.mes));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.ingresosRouter.get("/actividad", admin, async (req, res) => {
    try {
        const limite = parseInt(req.query.limite, 10) || 12;
        res.json(await (0, ingresos_service_1.actividadReciente)(limite));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.ingresosRouter.get("/ventas", admin, async (req, res) => {
    try {
        res.json(await (0, ingresos_service_1.getVentasIngresos)(req.query.mes));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.ingresosRouter.get("/egresos", admin, async (req, res) => {
    try {
        res.json(await (0, ingresos_service_1.getEgresos)(req.query.mes));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ─── POST (crear) ─────────────────────────────────────
exports.ingresosRouter.post("/ventas", admin, async (req, res) => {
    try {
        const autorId = req.user.id;
        const data = { ...req.body, autorId };
        res.status(201).json(await (0, ingresos_service_1.createVentaIngreso)(data));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.ingresosRouter.post("/egresos", admin, async (req, res) => {
    try {
        const autorId = req.user.id;
        const data = { ...req.body, autorId };
        res.status(201).json(await (0, ingresos_service_1.createEgreso)(data));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// ─── DELETE ───────────────────────────────────────────
exports.ingresosRouter.delete("/ventas/:id", admin, async (req, res) => {
    try {
        const autorId = req.user.id;
        res.json(await (0, ingresos_service_1.deleteVentaIngreso)(req.params.id, autorId));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.ingresosRouter.delete("/egresos/:id", admin, async (req, res) => {
    try {
        const autorId = req.user.id;
        res.json(await (0, ingresos_service_1.deleteEgreso)(req.params.id, autorId));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
