import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, nombreDepartamentoDe } from "../middleware/auth";
import {
  listarReportes,
  obtenerReporte,
  crearReporte,
  actualizarReporte,
  eliminarReporte,
  ReporteDuplicadoError,
} from "../services/metaAds.service";

export const metaAdsRouter = Router();
metaAdsRouter.use(requireAuth);

// Gestionar = crear/editar/eliminar. Pueden: SUPER_ADMIN, ADMIN o un usuario
// del departamento de Marketing. No se usan nombres/emails/IDs fijos: se
// resuelve el departamento del usuario autenticado.
async function puedeGestionar(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.user!;
  if (user.rol === "SUPER_ADMIN" || user.rol === "ADMIN") {
    next();
    return;
  }
  const ids = user.departamentoIds ?? (user.departamentoId ? [user.departamentoId] : []);
  for (const id of ids) {
    const nombre = await nombreDepartamentoDe(id);
    if (nombre === "Marketing") {
      next();
      return;
    }
  }
  res.status(403).json({ error: "No tienes permiso para gestionar métricas de Meta Ads." });
}

// GET /api/meta-ads — lista de reportes (cualquier usuario autenticado puede ver)
metaAdsRouter.get("/", async (_req, res) => {
  res.json(await listarReportes());
});

// GET /api/meta-ads/:id — detalle completo con grupos, campañas y segmentaciones
metaAdsRouter.get("/:id", async (req, res) => {
  try {
    res.json(await obtenerReporte(req.params.id));
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

// POST /api/meta-ads — registrar nuevo reporte (solo quien gestiona)
metaAdsRouter.post("/", puedeGestionar, async (req, res) => {
  try {
    const r = await crearReporte(req.body, req.user!.id);
    res.status(201).json(r);
  } catch (e: any) {
    if (e instanceof ReporteDuplicadoError) {
      res.status(409).json({ error: e.message, reporteExistenteId: e.reporteExistenteId });
      return;
    }
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/meta-ads/:id — editar reporte (solo quien gestiona)
metaAdsRouter.patch("/:id", puedeGestionar, async (req, res) => {
  try {
    const r = await actualizarReporte(req.params.id, req.body, req.user!.id);
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/meta-ads/:id — eliminar reporte (solo quien gestiona)
metaAdsRouter.delete("/:id", puedeGestionar, async (req, res) => {
  try {
    res.json(await eliminarReporte(req.params.id, req.user!.id));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
