"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.podcastRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const podcast_service_1 = require("../services/podcast.service");
const podcast_performance_service_1 = require("../services/podcast-performance.service");
const validation_1 = require("../lib/validation");
const podcast_citas_service_1 = require("../services/podcast-citas.service");
exports.podcastRouter = (0, express_1.Router)();
exports.podcastRouter.use(auth_1.requireAuth);
// Reporte histórico (snapshot) que ya existía.
exports.podcastRouter.get("/reporte", (0, auth_1.requireDepartamento)("Podcast"), async (_req, res) => {
    try {
        res.json(await (0, podcast_service_1.reportePodcast)());
    }
    catch (err) {
        res.status(404).json({ error: err.message });
    }
});
// ─── Metas (configurables por Super Admin) ────────────────
exports.podcastRouter.get("/metas", (0, auth_1.requireDepartamento)("Podcast"), async (_req, res) => {
    try {
        res.json(await (0, podcast_performance_service_1.obtenerMetas)());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.podcastRouter.put("/metas", (0, auth_1.requireRole)("SUPER_ADMIN"), async (req, res) => {
    const parsed = validation_1.guardarMetasPodcastSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
        return;
    }
    try {
        res.json(await (0, podcast_performance_service_1.guardarMetas)(parsed.data.metas));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── Reporte diario (cierre del día) ──────────────────────
exports.podcastRouter.get("/reporte-diario", (0, auth_1.requireDepartamento)("Podcast"), async (req, res) => {
    try {
        const fecha = typeof req.query.fecha === "string" ? req.query.fecha : undefined;
        res.json(await (0, podcast_performance_service_1.obtenerReporteDiario)(req.user.id, fecha));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.podcastRouter.post("/reporte-diario", (0, auth_1.requireDepartamento)("Podcast"), async (req, res) => {
    const parsed = validation_1.guardarReportePodcastSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
        return;
    }
    try {
        res.json(await (0, podcast_performance_service_1.guardarReporteDiario)(req.user.id, parsed.data));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── Desempeño individual (score + comparaciones) ─────────
exports.podcastRouter.get("/desempeno/mi", (0, auth_1.requireDepartamento)("Podcast"), async (req, res) => {
    try {
        res.json(await (0, podcast_performance_service_1.desempenoMi)(req.user.id));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Vista de equipo: ADMIN del departamento (o Super Admin) — hasta que se asigne líder.
exports.podcastRouter.get("/desempeno/equipo", (0, auth_1.requireRole)("ADMIN"), (0, auth_1.requireDepartamento)("Podcast"), async (_req, res) => {
    try {
        res.json(await (0, podcast_performance_service_1.desempenoEquipo)());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Resumen ejecutivo + alertas de IA.
exports.podcastRouter.get("/inteligencia", (0, auth_1.requireRole)("ADMIN"), (0, auth_1.requireDepartamento)("Podcast"), async (_req, res) => {
    try {
        res.json(await (0, podcast_performance_service_1.inteligenciaPodcast)());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── Calendario de podcasts (citas) ──────────────────────
exports.podcastRouter.get("/citas", (0, auth_1.requireDepartamento)("Podcast"), async (req, res) => {
    const { desde, hasta } = req.query;
    res.json(await (0, podcast_citas_service_1.listarCitas)({ desde, hasta }));
});
exports.podcastRouter.post("/citas", (0, auth_1.requireDepartamento)("Podcast"), async (req, res) => {
    const parsed = validation_1.crearCitaPodcastSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
        return;
    }
    try {
        res.status(201).json(await (0, podcast_citas_service_1.crearCita)(parsed.data, req.user.id));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.podcastRouter.patch("/citas/:id", (0, auth_1.requireDepartamento)("Podcast"), async (req, res) => {
    const parsed = validation_1.actualizarCitaPodcastSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
        return;
    }
    try {
        res.json(await (0, podcast_citas_service_1.actualizarCita)(req.params.id, parsed.data));
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.podcastRouter.delete("/citas/:id", (0, auth_1.requireDepartamento)("Podcast"), async (req, res) => {
    await (0, podcast_citas_service_1.eliminarCita)(req.params.id);
    res.json({ ok: true });
});
