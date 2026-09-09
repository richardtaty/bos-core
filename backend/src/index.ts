import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes";
import { personasRouter } from "./routes/personas.routes";
import { pipelinesRouter } from "./routes/pipelines.routes";
import { usuariosRouter } from "./routes/usuarios.routes";
import { reportesRouter } from "./routes/reportes.routes";
import { podcastRouter } from "./routes/podcast.routes";
import { tareasRouter } from "./routes/tareas.routes";
import { devRouter } from "./routes/dev.routes";
import { archivosRouter } from "./routes/archivos.routes";
import { actividadRouter } from "./routes/actividad.routes";
import { orgRouter } from "./routes/org.routes";
import { proyectosRouter } from "./routes/proyectos.routes";
import { bmfRouter } from "./routes/bmf.routes";
import { reportesDiariosRouter } from "./routes/reportes-diarios.routes";
import { recursosRouter } from "./routes/recursos.routes";
import { ingresosRouter } from "./routes/ingresos.routes";
import { metaAdsRouter } from "./routes/metaAds.routes";
import { agenteRouter } from "./routes/agente.routes";
import { publicBmfRouter } from "./routes/public-bmf.routes";
import { cumpleanosRouter } from "./routes/cumpleanos.routes";
import { marketingRouter } from "./routes/marketing.routes";
import { calendarioRouter } from "./routes/calendario.routes";
import { iniciarFundingWorker } from "./services/funding-worker.service";
import { iniciarCumpleanosWorker } from "./services/cumpleanos-worker.service";
import { emailActivo, iaActiva, documentosActivos } from "./lib/funding-env";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Versión del código en ejecución — el SHA y el build vienen sellados en la imagen
// por deploy.sh (Dockerfile ARG GIT_SHA/BUILD_TIME). Sirve para verificar que
// producción corre el commit esperado y detectar deploys desde copias viejas.
app.get("/version", (_req, res) =>
  res.json({
    app: "tatys-bos-core",
    commit: process.env.GIT_SHA ?? "sin-sello",
    buildTime: process.env.BUILD_TIME ?? "sin-sello",
    release: process.env.FLY_APP_VERSION ?? null,
    node: process.version,
  }),
);

app.use("/api/auth", authRouter);
app.use("/api/personas", personasRouter);
app.use("/api/pipelines", pipelinesRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/reportes", reportesRouter);
app.use("/api/podcast", podcastRouter);
app.use("/api/tareas", tareasRouter);
// Módulo DEV (tareas de desarrollo) — restringido a SUPER_ADMIN dentro del router.
app.use("/api/dev", devRouter);
app.use("/api/archivos", archivosRouter);
app.use("/api/actividad", actividadRouter);
app.use("/api/org", orgRouter);
app.use("/api/proyectos", proyectosRouter);
app.use("/api/bmf", bmfRouter);
app.use("/api/reportes-diarios", reportesDiariosRouter);
app.use("/api/recursos", recursosRouter);
app.use("/api/ingresos", ingresosRouter);
app.use("/api/meta-ads", metaAdsRouter);
// Superficie de solo lectura para Hermes Agent — ver routes/agente.routes.ts
app.use("/api/agente", agenteRouter);
// Rutas públicas de BMF Funding (landing + aplicación) — SIN autenticación.
app.use("/api/public", publicBmfRouter);
// Módulo 🎂 Próximos cumpleaños — ver routes/cumpleanos.routes.ts (requiere acceso).
app.use("/api/cumpleanos", cumpleanosRouter);
// 📅 Calendario de Marketing (correos/contenido por proyecto) — rutas/marketing.routes.ts.
app.use("/api/marketing", marketingRouter);
// 📅 Calendario (SALA DE OFERTAS → Calendario): crear alertas/recordatorios/seguimientos.
app.use("/api/calendario", calendarioRouter);

// Sirve el frontend ya compilado (dist) desde el mismo servicio — un solo deploy en Fly.io,
// sin necesidad de CORS entre dos dominios ni de correr dos apps separadas.
const FRONTEND_DIST = path.join(__dirname, "../../frontend/dist");
app.use(express.static(FRONTEND_DIST));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(FRONTEND_DIST, "index.html"));
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`BOS core API escuchando en :${PORT}`);
  console.log(
    `[BMF·Fase2] email=${emailActivo() ? "ACTIVO" : "apagado"} · ia=${iaActiva() ? "ACTIVA" : "apagada"} · documentos=${documentosActivos() ? "ACTIVOS" : "apagados"}`,
  );
});

// Worker de BMF Funding (confirmación + follow-ups por email). Se enciende solo con RESEND_API_KEY.
iniciarFundingWorker();
// Worker de 🎂 cumpleaños: asegura los recordatorios compartidos en la ventana de aviso.
iniciarCumpleanosWorker();
