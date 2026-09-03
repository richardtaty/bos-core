"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_routes_1 = require("./routes/auth.routes");
const personas_routes_1 = require("./routes/personas.routes");
const pipelines_routes_1 = require("./routes/pipelines.routes");
const usuarios_routes_1 = require("./routes/usuarios.routes");
const reportes_routes_1 = require("./routes/reportes.routes");
const podcast_routes_1 = require("./routes/podcast.routes");
const tareas_routes_1 = require("./routes/tareas.routes");
const archivos_routes_1 = require("./routes/archivos.routes");
const actividad_routes_1 = require("./routes/actividad.routes");
const org_routes_1 = require("./routes/org.routes");
const proyectos_routes_1 = require("./routes/proyectos.routes");
const bmf_routes_1 = require("./routes/bmf.routes");
const reportes_diarios_routes_1 = require("./routes/reportes-diarios.routes");
const recursos_routes_1 = require("./routes/recursos.routes");
const ingresos_routes_1 = require("./routes/ingresos.routes");
const metaAds_routes_1 = require("./routes/metaAds.routes");
const agente_routes_1 = require("./routes/agente.routes");
const public_bmf_routes_1 = require("./routes/public-bmf.routes");
const funding_worker_service_1 = require("./services/funding-worker.service");
const funding_env_1 = require("./lib/funding-env");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", auth_routes_1.authRouter);
app.use("/api/personas", personas_routes_1.personasRouter);
app.use("/api/pipelines", pipelines_routes_1.pipelinesRouter);
app.use("/api/usuarios", usuarios_routes_1.usuariosRouter);
app.use("/api/reportes", reportes_routes_1.reportesRouter);
app.use("/api/podcast", podcast_routes_1.podcastRouter);
app.use("/api/tareas", tareas_routes_1.tareasRouter);
app.use("/api/archivos", archivos_routes_1.archivosRouter);
app.use("/api/actividad", actividad_routes_1.actividadRouter);
app.use("/api/org", org_routes_1.orgRouter);
app.use("/api/proyectos", proyectos_routes_1.proyectosRouter);
app.use("/api/bmf", bmf_routes_1.bmfRouter);
app.use("/api/reportes-diarios", reportes_diarios_routes_1.reportesDiariosRouter);
app.use("/api/recursos", recursos_routes_1.recursosRouter);
app.use("/api/ingresos", ingresos_routes_1.ingresosRouter);
app.use("/api/meta-ads", metaAds_routes_1.metaAdsRouter);
// Superficie de solo lectura para Hermes Agent — ver routes/agente.routes.ts
app.use("/api/agente", agente_routes_1.agenteRouter);
// Rutas públicas de BMF Funding (landing + aplicación) — SIN autenticación.
app.use("/api/public", public_bmf_routes_1.publicBmfRouter);
// Sirve el frontend ya compilado (dist) desde el mismo servicio — un solo deploy en Fly.io,
// sin necesidad de CORS entre dos dominios ni de correr dos apps separadas.
const FRONTEND_DIST = path_1.default.join(__dirname, "../../frontend/dist");
app.use(express_1.default.static(FRONTEND_DIST));
app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api"))
        return next();
    res.sendFile(path_1.default.join(FRONTEND_DIST, "index.html"));
});
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Error interno del servidor" });
});
const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
    console.log(`BOS core API escuchando en :${PORT}`);
    console.log(`[BMF·Fase2] email=${(0, funding_env_1.emailActivo)() ? "ACTIVO" : "apagado"} · ia=${(0, funding_env_1.iaActiva)() ? "ACTIVA" : "apagada"} · documentos=${(0, funding_env_1.documentosActivos)() ? "ACTIVOS" : "apagados"}`);
});
// Worker de BMF Funding (confirmación + follow-ups por email). Se enciende solo con RESEND_API_KEY.
(0, funding_worker_service_1.iniciarFundingWorker)();
