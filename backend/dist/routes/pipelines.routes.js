"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pipelinesRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../lib/validation");
const pipelines_service_1 = require("../services/pipelines.service");
exports.pipelinesRouter = (0, express_1.Router)();
exports.pipelinesRouter.use(auth_1.requireAuth);
exports.pipelinesRouter.get("/", async (req, res) => {
    // Aislamiento por unidad de negocio: el usuario ve los pipelines de todos sus
    // departamentos (multi-depto). SUPER_ADMIN ve todo.
    const user = req.user;
    if (user.rol === "SUPER_ADMIN") {
        res.json(await (0, pipelines_service_1.listarPipelines)());
        return;
    }
    const ids = user.departamentoIds ?? (user.departamentoId ? [user.departamentoId] : []);
    res.json(await (0, pipelines_service_1.listarPipelines)({ departamentoIds: ids }));
});
exports.pipelinesRouter.get("/:id/tablero", async (req, res) => {
    try {
        res.json(await (0, pipelines_service_1.tableroKanban)(req.params.id));
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
exports.pipelinesRouter.get("/:id/metricas", async (req, res) => {
    res.json(await (0, pipelines_service_1.metricasPipeline)(req.params.id));
});
exports.pipelinesRouter.post("/:id/registros", async (req, res) => {
    try {
        const registro = await (0, pipelines_service_1.crearRegistro)({
            pipelineId: req.params.id,
            personaId: req.body.personaId,
            valor: req.body.valor,
            autorId: req.user.id,
        });
        res.status(201).json(registro);
    }
    catch (err) {
        res.status(422).json({ error: err.message });
    }
});
exports.pipelinesRouter.patch("/registros/:registroId/etapa", (0, auth_1.requireRole)("USUARIO"), async (req, res) => {
    const parsed = validation_1.moverEtapaSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const registro = await (0, pipelines_service_1.moverEtapa)({
            registroId: req.params.registroId,
            etapaId: parsed.data.etapaId,
            motivoPerdida: parsed.data.motivoPerdida,
            autorId: req.user.id,
        });
        res.json(registro);
    }
    catch (err) {
        res.status(422).json({ error: err.message });
    }
});
exports.pipelinesRouter.get("/registros/:registroId/pagos", (0, auth_1.requireRole)("USUARIO"), async (req, res) => {
    res.json(await (0, pipelines_service_1.listarPagos)(req.params.registroId));
});
exports.pipelinesRouter.patch("/registros/:registroId/valor", (0, auth_1.requireRole)("USUARIO"), async (req, res) => {
    const nuevoValor = Number(req.body.valor);
    if (!nuevoValor || nuevoValor <= 0) {
        res.status(400).json({ error: "El valor debe ser un número mayor a cero" });
        return;
    }
    try {
        const resultado = await (0, pipelines_service_1.actualizarValorRegistro)(req.params.registroId, nuevoValor, req.user.id);
        res.json(resultado);
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
exports.pipelinesRouter.patch("/registros/:registroId/plan-pago", (0, auth_1.requireRole)("USUARIO"), async (req, res) => {
    const parsed = validation_1.actualizarPlanPagoSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const resultado = await (0, pipelines_service_1.actualizarPlanPago)(req.params.registroId, parsed.data, req.user.id);
        res.json(resultado);
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
exports.pipelinesRouter.post("/registros/:registroId/cerrar-venta", (0, auth_1.requireRole)("USUARIO"), async (req, res) => {
    const parsed = validation_1.cerrarVentaSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const resultado = await (0, pipelines_service_1.cerrarVenta)({
            registroId: req.params.registroId,
            montoTotal: parsed.data.montoTotal,
            montoCobrado: parsed.data.montoCobrado,
            proximaFechaCobro: parsed.data.proximaFechaCobro,
            metodoPago: parsed.data.metodoPago,
            nota: parsed.data.nota,
            autorId: req.user.id,
        });
        res.status(201).json(resultado);
    }
    catch (err) {
        res.status(422).json({ error: err.message });
    }
});
exports.pipelinesRouter.post("/registros/:registroId/pagos", (0, auth_1.requireRole)("USUARIO"), async (req, res) => {
    const parsed = validation_1.registrarPagoSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const resultado = await (0, pipelines_service_1.registrarPago)({
            registroId: req.params.registroId,
            monto: parsed.data.monto,
            nota: parsed.data.nota,
            proximaFechaCobro: parsed.data.proximaFechaCobro,
            proximoPago: parsed.data.proximoPago,
            metodoPago: parsed.data.metodoPago,
            fecha: parsed.data.fecha,
            autorId: req.user.id,
        });
        res.status(201).json(resultado);
    }
    catch (err) {
        res.status(422).json({ error: err.message });
    }
});
