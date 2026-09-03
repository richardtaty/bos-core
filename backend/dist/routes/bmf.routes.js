"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bmfRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const bmf_solicitudes_service_1 = require("../services/bmf-solicitudes.service");
const documentos_service_1 = require("../services/documentos.service");
const funding_env_1 = require("../lib/funding-env");
const bmf_service_1 = require("../services/bmf.service");
const bmf_reportes_service_1 = require("../services/bmf.reportes.service");
exports.bmfRouter = (0, express_1.Router)();
exports.bmfRouter.use(auth_1.requireAuth);
// ─── Lenders ──────────────────────────────────────────────
exports.bmfRouter.get("/lenders", async (_req, res) => {
    try {
        res.json(await (0, bmf_service_1.listarLenders)());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.post("/lenders", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    try {
        const lender = await (0, bmf_service_1.crearLender)(req.body, req.user.id);
        res.status(201).json(lender);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.bmfRouter.get("/lenders/:id", async (req, res) => {
    try {
        res.json(await (0, bmf_service_1.obtenerLender)(req.params.id));
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
exports.bmfRouter.patch("/lenders/:id", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    try {
        const lender = await (0, bmf_service_1.actualizarLender)(req.params.id, req.body, req.user.id);
        res.json(lender);
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
// ─── Fundings ─────────────────────────────────────────────
exports.bmfRouter.get("/fundings", async (req, res) => {
    try {
        const { estado, agenteId, lenderId, clienteId } = req.query;
        res.json(await (0, bmf_service_1.listarFundings)({
            estado: estado,
            agenteId: agenteId,
            lenderId: lenderId,
            clienteId: clienteId,
        }));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.post("/fundings", async (req, res) => {
    try {
        const funding = await (0, bmf_service_1.crearFunding)(req.body, req.user.id);
        res.status(201).json(funding);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.bmfRouter.get("/fundings/:id", async (req, res) => {
    try {
        res.json(await (0, bmf_service_1.obtenerFunding)(req.params.id));
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
exports.bmfRouter.patch("/fundings/:id", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    try {
        const funding = await (0, bmf_service_1.actualizarFunding)(req.params.id, req.body, req.user.id);
        res.json(funding);
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
// ─── Llamadas ─────────────────────────────────────────────
// IMPORTANTE: /stats va ANTES de cualquier ruta con :id para este prefijo
exports.bmfRouter.get("/llamadas/stats", async (req, res) => {
    try {
        const { agenteId, desde, hasta } = req.query;
        res.json(await (0, bmf_service_1.statsLlamadas)({
            agenteId: agenteId,
            desde: desde,
            hasta: hasta,
        }));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.get("/llamadas", async (req, res) => {
    try {
        const { personaId, agenteId, desde, hasta } = req.query;
        res.json(await (0, bmf_service_1.listarLlamadas)({
            personaId: personaId,
            agenteId: agenteId,
            desde: desde,
            hasta: hasta,
        }));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.post("/llamadas", async (req, res) => {
    try {
        const llamada = await (0, bmf_service_1.registrarLlamada)(req.body, req.user.id);
        res.status(201).json(llamada);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// ─── Comisiones ───────────────────────────────────────────
exports.bmfRouter.get("/comisiones", async (req, res) => {
    try {
        const { agenteId, estado } = req.query;
        res.json(await (0, bmf_service_1.listarComisiones)({
            agenteId: agenteId,
            estado: estado,
        }));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.post("/comisiones", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    try {
        const comision = await (0, bmf_service_1.crearComision)(req.body, req.user.id);
        res.status(201).json(comision);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.bmfRouter.patch("/comisiones/:id", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    try {
        const comision = await (0, bmf_service_1.pagarComision)(req.params.id, req.user.id);
        res.json(comision);
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
// ─── Dashboard ────────────────────────────────────────────
exports.bmfRouter.get("/dashboard", async (req, res) => {
    try {
        const { departamentoId } = req.user;
        if (!departamentoId) {
            res.json({
                clientesActivos: 0, leadsNuevos: 0, seguimientosPendientes: 0, seguimientosVencidos: 0,
                solicitudesAbiertas: 0, solicitudesAprobadas: 0, solicitudesPerdidas: 0,
                fundingMes: 0, fundingHistorico: 0, pipelineActivo: 0, renovacionesProximas: 0,
                lendersActivos: 0, agentesActivos: 0, conversion: 0,
                comisionesGeneradas: 0, comisionesPendientes: 0, actividadHoy: 0,
                agentes: [],
            });
            return;
        }
        res.json(await (0, bmf_service_1.dashboardBMF)(departamentoId));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.get("/dashboard/admin", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    try {
        const { departamentoId } = req.user;
        if (!departamentoId) {
            res.json({ agentesSinActividad: [], kpisPorAgente: [], clientesSinContacto: [], renovacionesProximas: [] });
            return;
        }
        res.json(await (0, bmf_service_1.dashboardAdminBMF)(departamentoId));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── Score ────────────────────────────────────────────────
exports.bmfRouter.get("/score/:personaId", async (req, res) => {
    try {
        res.json(await (0, bmf_service_1.scoreCliente)(req.params.personaId));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── Reportes ─────────────────────────────────────────────
exports.bmfRouter.get("/reportes/produccion-agente", async (req, res) => {
    try {
        const { desde, hasta } = req.query;
        res.json(await (0, bmf_reportes_service_1.produccionPorAgente)({
            desde: desde,
            hasta: hasta,
        }));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.get("/reportes/produccion-lender", async (req, res) => {
    try {
        const { desde, hasta } = req.query;
        res.json(await (0, bmf_reportes_service_1.produccionPorLender)({
            desde: desde,
            hasta: hasta,
        }));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.get("/reportes/funding-mensual", async (req, res) => {
    try {
        const anio = req.query.anio ? Number(req.query.anio) : undefined;
        res.json(await (0, bmf_reportes_service_1.fundingMensual)(anio));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.get("/reportes/pipeline", async (_req, res) => {
    try {
        res.json(await (0, bmf_reportes_service_1.pipelineReport)());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.get("/reportes/llamadas", async (req, res) => {
    try {
        const { desde, hasta } = req.query;
        res.json(await (0, bmf_reportes_service_1.reporteLlamadas)({
            desde: desde,
            hasta: hasta,
        }));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.get("/reportes/ranking", async (req, res) => {
    try {
        const { desde, hasta } = req.query;
        res.json(await (0, bmf_reportes_service_1.rankingAgentes)({
            desde: desde,
            hasta: hasta,
        }));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.get("/reportes/kpi-agente/:agenteId", async (req, res) => {
    try {
        res.json(await (0, bmf_reportes_service_1.kpiAgente)(req.params.agenteId));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── Solicitudes de financiamiento digital (BMF Funding) ────────
// Solo el equipo de Business Market Finders (y SUPER_ADMIN) las ve.
exports.bmfRouter.get("/solicitudes", (0, auth_1.requireDepartamento)("Business Market Finders"), async (_req, res) => {
    try {
        res.json(await (0, bmf_solicitudes_service_1.listarSolicitudes)());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.bmfRouter.get("/solicitudes/:id", (0, auth_1.requireDepartamento)("Business Market Finders"), async (req, res) => {
    try {
        const solicitud = await (0, bmf_solicitudes_service_1.obtenerSolicitud)(req.params.id);
        if (!solicitud) {
            res.status(404).json({ error: "Solicitud no encontrada" });
            return;
        }
        res.json(solicitud);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Genera un enlace de subida presigned a R2 (10 min) para un documento de una solicitud.
// Solo el equipo de Business Market Finders. Devuelve 503 si R2 no está configurado aún.
exports.bmfRouter.post("/solicitudes/:id/documentos/subir", (0, auth_1.requireDepartamento)("Business Market Finders"), async (req, res) => {
    try {
        if (!(0, funding_env_1.documentosActivos)()) {
            res.status(503).json({ error: "Documentos desactivados (falta configuración R2)." });
            return;
        }
        const { tipo, nombre, contentType } = (req.body ?? {});
        if (!(0, documentos_service_1.esTipoDocumento)(tipo)) {
            res.status(400).json({ error: "tipo inválido. Debe ser bank_statement, identificacion, cheque_anulado u otro." });
            return;
        }
        if (typeof nombre !== "string" || !nombre.trim()) {
            res.status(400).json({ error: "nombre es obligatorio." });
            return;
        }
        const enlace = await (0, documentos_service_1.generarEnlaceSubida)({
            solicitudId: req.params.id,
            tipo,
            nombre: nombre.trim(),
            contentType: typeof contentType === "string" ? contentType : undefined,
        });
        if (!enlace) {
            res.status(503).json({ error: "No se pudo generar el enlace de subida." });
            return;
        }
        res.status(201).json(enlace);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
