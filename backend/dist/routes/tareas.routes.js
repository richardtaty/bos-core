"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tareasRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const tareas_service_1 = require("../services/tareas.service");
exports.tareasRouter = (0, express_1.Router)();
exports.tareasRouter.use(auth_1.requireAuth);
/** Un fallo de permiso es 403, no 400: el dato estaba bien, el usuario no tiene derecho. */
function responderError(res, e) {
    const mensaje = e instanceof Error ? e.message : "Error inesperado";
    res.status(e instanceof tareas_service_1.SinPermisoTareaError ? 403 : 400).json({ error: mensaje });
}
// ⚠️ Rutas específicas DEBEN ir antes que /:id (regla #2 de CLAUDE.md)
// GET /api/tareas?responsableId=&departamento=&estado=&prioridad=&proyectoId=&canal=
exports.tareasRouter.get("/", async (req, res) => {
    const { responsableId, estado, prioridad, proyectoId, canal } = req.query;
    const { departamento } = req.query;
    res.json(await (0, tareas_service_1.listarTareas)({ responsableId, departamento, estado: estado, prioridad: prioridad, proyectoId, canal }));
});
// GET /api/tareas/mis-tareas — las del usuario autenticado
exports.tareasRouter.get("/mis-tareas", async (req, res) => {
    const { proyectoId, canal } = req.query;
    res.json(await (0, tareas_service_1.listarTareas)({ responsableId: req.user.id, proyectoId, canal }));
});
// GET /api/tareas/calendario — calendario editorial
exports.tareasRouter.get("/calendario", async (req, res) => {
    const { canal, desde, hasta, responsableId } = req.query;
    res.json(await (0, tareas_service_1.calendarioEditorial)({ canal, desde, hasta, responsableId }));
});
// GET /api/tareas/kpi — KPIs del usuario autenticado
exports.tareasRouter.get("/kpi", async (req, res) => {
    res.json(await (0, tareas_service_1.kpiUsuario)(req.user.id));
});
// GET /api/tareas/kpi/:usuarioId — KPIs de otro usuario (admin)
exports.tareasRouter.get("/kpi/:usuarioId", async (req, res) => {
    res.json(await (0, tareas_service_1.kpiUsuario)(req.params.usuarioId));
});
// ─── Marketing v2: Extensiones (rutas específicas ANTES de /:id) ───
// GET /api/tareas/extensiones?tareaId=&estado=
exports.tareasRouter.get("/extensiones", async (req, res) => {
    const { tareaId, estado } = req.query;
    res.json(await (0, tareas_service_1.listarSolicitudesExtension)({ tareaId, estado }));
});
// PATCH /api/tareas/extensiones/:id
exports.tareasRouter.patch("/extensiones/:id", async (req, res) => {
    try {
        const r = await (0, tareas_service_1.resolverExtension)(req.params.id, req.body.aprobada, req.user);
        res.json(r);
    }
    catch (e) {
        responderError(res, e);
    }
});
// ─── Checklist (rutas específicas ANTES de /:id) ───────────
// PATCH /api/tareas/checklist/:itemId
exports.tareasRouter.patch("/checklist/:itemId", async (req, res) => {
    await (0, tareas_service_1.toggleChecklistItem)(req.params.itemId, req.body.completado);
    res.json({ ok: true });
});
// DELETE /api/tareas/checklist/:itemId
exports.tareasRouter.delete("/checklist/:itemId", async (req, res) => {
    await (0, tareas_service_1.eliminarChecklistItem)(req.params.itemId);
    res.json({ ok: true });
});
// ─── Rutas con /:id (DEBEN ir al final) ────────────────────
// GET /api/tareas/:id
exports.tareasRouter.get("/:id", async (req, res) => {
    const tarea = await (0, tareas_service_1.obtenerTarea)(req.params.id);
    if (!tarea) {
        res.status(404).json({ error: "Tarea no encontrada" });
        return;
    }
    res.json(tarea);
});
// POST /api/tareas
exports.tareasRouter.post("/", async (req, res) => {
    try {
        const user = req.user;
        const data = { ...req.body };
        // Heredar departamento del creador si no se especifica
        if (!data.departamento && user.rol !== "SUPER_ADMIN") {
            data.departamento = user.departamentoId
                ? (await (0, auth_1.nombreDepartamentoDe)(user.departamentoId)) ?? "Marketing"
                : "Marketing";
        }
        const tarea = await (0, tareas_service_1.crearTarea)(data, user);
        res.status(201).json(tarea);
    }
    catch (e) {
        responderError(res, e);
    }
});
// PATCH /api/tareas/:id
exports.tareasRouter.patch("/:id", async (req, res) => {
    try {
        const tarea = await (0, tareas_service_1.actualizarTarea)(req.params.id, req.body, req.user);
        res.json(tarea);
    }
    catch (e) {
        responderError(res, e);
    }
});
// POST /api/tareas/:id/checklist
exports.tareasRouter.post("/:id/checklist", async (req, res) => {
    const item = await (0, tareas_service_1.agregarChecklistItem)(req.params.id, req.body.texto);
    res.status(201).json(item);
});
// POST /api/tareas/:id/comentarios
exports.tareasRouter.post("/:id/comentarios", async (req, res) => {
    const comentario = await (0, tareas_service_1.agregarComentario)(req.params.id, req.body.texto, req.user.id);
    res.status(201).json(comentario);
});
// PATCH /api/tareas/:id/reasignar
exports.tareasRouter.patch("/:id/reasignar", async (req, res) => {
    try {
        const tarea = await (0, tareas_service_1.reasignarTarea)(req.params.id, req.body.responsableId, req.user);
        res.json(tarea);
    }
    catch (e) {
        responderError(res, e);
    }
});
// PATCH /api/tareas/:id/tiempo
exports.tareasRouter.patch("/:id/tiempo", async (req, res) => {
    try {
        const r = await (0, tareas_service_1.registrarTiempo)(req.params.id, req.body.minutos, req.user.id);
        res.json(r);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// ─── Marketing v2: Bloqueos ──────────────────────────
// POST /api/tareas/:id/bloquear
exports.tareasRouter.post("/:id/bloquear", async (req, res) => {
    try {
        const tarea = await (0, tareas_service_1.bloquearTarea)(req.params.id, req.body.motivo, req.body.dependeDe, req.user);
        res.json(tarea);
    }
    catch (e) {
        responderError(res, e);
    }
});
// POST /api/tareas/:id/desbloquear
exports.tareasRouter.post("/:id/desbloquear", async (req, res) => {
    try {
        const tarea = await (0, tareas_service_1.desbloquearTarea)(req.params.id, req.user);
        res.json(tarea);
    }
    catch (e) {
        responderError(res, e);
    }
});
// POST /api/tareas/:id/extension
exports.tareasRouter.post("/:id/extension", async (req, res) => {
    try {
        const sol = await (0, tareas_service_1.solicitarExtension)({
            tareaId: req.params.id,
            motivo: req.body.motivo,
            porcentajeCompletado: req.body.porcentajeCompletado ?? 0,
            tiempoAdicionalMinutos: req.body.tiempoAdicionalMinutos ?? 0,
            nuevaFecha: req.body.nuevaFecha,
            dificultad: req.body.dificultad,
        }, req.user.id);
        res.status(201).json(sol);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
