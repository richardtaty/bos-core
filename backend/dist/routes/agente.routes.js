"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agenteRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const reportes_service_1 = require("../services/reportes.service");
const ingresos_service_1 = require("../services/ingresos.service");
const pipelines_service_1 = require("../services/pipelines.service");
const personas_service_1 = require("../services/personas.service");
const tareas_service_1 = require("../services/tareas.service");
const actividad_service_1 = require("../services/actividad.service");
/**
 * Superficie de solo lectura para Hermes Agent (rol AGENTE).
 *
 * Existe como router propio en vez de abrir las rutas normales porque el rol AGENTE está fuera
 * de JERARQUIA a propósito (ver auth.ts): `requireRole` lo rechaza en todo el resto del sistema.
 * Así el agente solo alcanza exactamente lo que se define aquí.
 *
 * Cada endpoint delega en un servicio que ya existe — no se reimplementa lógica de negocio.
 * En particular el saldo pendiente NUNCA se recalcula a mano: sale de `adelantosPendientes()`
 * y `estadoFinanciero()`, que lo derivan restando los pagos al valor del registro.
 */
exports.agenteRouter = (0, express_1.Router)();
exports.agenteRouter.use(auth_1.requireAuth);
exports.agenteRouter.use(auth_1.requireAgente);
/** Envuelve un handler async para no repetir try/catch en cada ruta. */
const ok = (fn) => async (req, res) => {
    try {
        res.json(await fn(req));
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
// ─── Panorama general ─────────────────────────────────────────
// La foto completa del negocio: vendido, cobrado, brecha de caja, vencidos y alertas.
exports.agenteRouter.get("/panorama", ok(() => (0, reportes_service_1.commandCenter)()));
// ─── Dinero ───────────────────────────────────────────────────
exports.agenteRouter.get("/finanzas/resumen", ok(async (req) => {
    const mes = req.query.mes;
    const [resumen, porOferta, rentabilidad] = await Promise.all([
        (0, ingresos_service_1.resumenMensual)(mes),
        (0, ingresos_service_1.ventasPorOferta)(mes),
        (0, ingresos_service_1.rentabilidadPorLinea)(mes),
    ]);
    return { mes: mes ?? "actual", resumen, porOferta, rentabilidad };
}));
exports.agenteRouter.get("/finanzas/hoy", ok(() => (0, ingresos_service_1.resumenHoy)()));
// Quién debe cuánto. Es la pregunta de cobranza más valiosa del sistema.
exports.agenteRouter.get("/finanzas/saldos", ok(() => (0, ingresos_service_1.adelantosPendientes)()));
// ─── Pipelines ────────────────────────────────────────────────
// Lista con métricas de cada uno, para que el agente sepa qué tablero pedir después.
exports.agenteRouter.get("/pipelines", ok(async () => {
    const pipelines = await (0, pipelines_service_1.listarPipelines)();
    return Promise.all(pipelines.map(async (p) => ({ ...p, metricas: await (0, pipelines_service_1.metricasPipeline)(p.id) })));
}));
// Rutas específicas antes que las dinámicas (regla #2 de CLAUDE.md).
exports.agenteRouter.get("/pipelines/:id/tablero", ok((req) => (0, pipelines_service_1.tableroKanban)(req.params.id)));
// ─── Contactos ────────────────────────────────────────────────
exports.agenteRouter.get("/contactos", ok((req) => (0, personas_service_1.listarPersonas)({
    search: req.query.buscar,
    estado: req.query.estado,
    pagina: req.query.pagina ? Number(req.query.pagina) : undefined,
    limite: req.query.limite ? Number(req.query.limite) : undefined,
})));
exports.agenteRouter.get("/contactos/:id", ok((req) => (0, personas_service_1.obtenerFichaPersona)(req.params.id)));
// ─── Operación ────────────────────────────────────────────────
exports.agenteRouter.get("/tareas", ok((req) => (0, tareas_service_1.listarTareas)({
    departamento: req.query.departamento,
    estado: req.query.estado,
    prioridad: req.query.prioridad,
    responsableId: req.query.responsableId,
})));
// Seguimientos de contactos sin completar (los vencidos son los que importan).
exports.agenteRouter.get("/seguimientos", ok(() => (0, personas_service_1.listarTareasPendientes)()));
exports.agenteRouter.get("/actividad", ok((req) => (0, actividad_service_1.timelineGlobal)(req.query.limite ? Number(req.query.limite) : 50)));
// ─── Detalle financiero de un negocio ─────────────────────────
exports.agenteRouter.get("/registros/:id/financiero", ok((req) => (0, pipelines_service_1.estadoFinanciero)(req.params.id)));
