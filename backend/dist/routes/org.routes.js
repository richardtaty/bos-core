"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orgRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const org_service_1 = require("../services/org.service");
exports.orgRouter = (0, express_1.Router)();
exports.orgRouter.use(auth_1.requireAuth);
// ─── Departamentos ────────────────────────────────────────
exports.orgRouter.get("/departamentos", async (_req, res) => {
    res.json(await (0, org_service_1.listarDepartamentos)());
});
// Solo SUPER_ADMIN puede crear departamentos.
exports.orgRouter.post("/departamentos", (0, auth_1.requireRole)("SUPER_ADMIN"), async (req, res) => {
    const d = await (0, org_service_1.crearDepartamento)(req.body, req.user.id);
    res.status(201).json(d);
});
// ─── Equipos ──────────────────────────────────────────────
// Filtrar equipos por departamento del usuario si no es SUPER_ADMIN
exports.orgRouter.get("/equipos", async (req, res) => {
    const user = req.user;
    const { departamentoId } = req.query;
    // SUPER_ADMIN puede filtrar por cualquier depto. Los demás solo ven el suyo.
    const filtro = user.rol === "SUPER_ADMIN" ? departamentoId : (user.departamentoId ?? undefined);
    res.json(await (0, org_service_1.listarEquipos)(filtro));
});
// ADMIN solo puede crear equipos en su propio departamento.
exports.orgRouter.post("/equipos", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const user = req.user;
    const data = { ...req.body };
    // Forzar departamento del creador si no es SUPER_ADMIN
    if (user.rol !== "SUPER_ADMIN") {
        if (!user.departamentoId) {
            res.status(403).json({ error: "No tienes un departamento asignado." });
            return;
        }
        data.departamentoId = user.departamentoId;
    }
    const e = await (0, org_service_1.crearEquipo)(data, user.id);
    res.status(201).json(e);
});
// ─── Miembros ─────────────────────────────────────────────
exports.orgRouter.get("/equipos/:equipoId/miembros", async (req, res) => {
    res.json(await (0, org_service_1.miembrosDelEquipo)(req.params.equipoId));
});
exports.orgRouter.post("/equipos/:equipoId/miembros", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const { usuarioId, cargo } = req.body;
    const m = await (0, org_service_1.agregarMiembro)(req.params.equipoId, usuarioId, cargo, req.user.id);
    res.status(201).json(m);
});
exports.orgRouter.delete("/equipos/:equipoId/miembros/:usuarioId", (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    await (0, org_service_1.removerMiembro)(req.params.equipoId, req.params.usuarioId, req.user.id);
    res.json({ ok: true });
});
// ─── Organigrama ──────────────────────────────────────────
// SUPER_ADMIN ve toda la estructura. Los demás solo su departamento.
exports.orgRouter.get("/organigrama", async (req, res) => {
    const user = req.user;
    const deptoId = user.rol === "SUPER_ADMIN" ? undefined : (user.departamentoId ?? undefined);
    res.json(await (0, org_service_1.organigrama)(deptoId));
});
