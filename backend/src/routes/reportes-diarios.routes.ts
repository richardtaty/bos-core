import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  reporteDelDia,
  obtenerReporte,
  listarReportes,
  actualizarReporte,
  enviarReporte,
  revisarReporte,
  panelLider,
  resumenSemanal,
} from "../services/reportes-diarios.service";

export const reportesDiariosRouter = Router();
reportesDiariosRouter.use(requireAuth);

// GET /api/reportes-diarios/hoy — reporte de hoy del usuario autenticado (auto-crea)
reportesDiariosRouter.get("/hoy", async (req, res) => {
  const reporte = await reporteDelDia(req.user!.id);
  res.json(reporte);
});

// GET /api/reportes-diarios/lider/equipo?fecha=YYYY-MM-DD — vista del líder
reportesDiariosRouter.get("/lider/equipo", async (req, res) => {
  const { fecha } = req.query as Record<string, string | undefined>;
  res.json(await panelLider(fecha));
});

// GET /api/reportes-diarios/resumen?usuarioId=&desde=&hasta=
reportesDiariosRouter.get("/resumen", async (req, res) => {
  const { usuarioId, desde, hasta } = req.query as Record<string, string | undefined>;
  res.json(await resumenSemanal({ usuarioId, desde: desde!, hasta: hasta! }));
});

// GET /api/reportes-diarios?usuarioId=&fecha=&estado=
reportesDiariosRouter.get("/", async (req, res) => {
  const { usuarioId, fecha, estado } = req.query as Record<string, string | undefined>;
  res.json(await listarReportes({ usuarioId, fecha, estado }));
});

// GET /api/reportes-diarios/:id
reportesDiariosRouter.get("/:id", async (req, res) => {
  const reporte = await obtenerReporte(req.params.id);
  if (!reporte) { res.status(404).json({ error: "Reporte no encontrado" }); return; }
  res.json(reporte);
});

// POST /api/reportes-diarios/:id/enviar
reportesDiariosRouter.post("/:id/enviar", async (req, res) => {
  try {
    const reporte = await enviarReporte(req.params.id, req.user!.id);
    res.json(reporte);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/reportes-diarios/:id/revisar
reportesDiariosRouter.post("/:id/revisar", async (req, res) => {
  try {
    const { decision } = req.body;
    const reporte = await revisarReporte(req.params.id, decision, req.user!.id);
    res.json(reporte);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/reportes-diarios/:id
reportesDiariosRouter.patch("/:id", async (req, res) => {
  try {
    const reporte = await actualizarReporte(req.params.id, req.body, req.user!.id);
    res.json(reporte);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
