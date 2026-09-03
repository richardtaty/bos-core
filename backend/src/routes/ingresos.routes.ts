import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  getOfertas,
  getVentasIngresos,
  getEgresos,
  createVentaIngreso,
  deleteVentaIngreso,
  createEgreso,
  deleteEgreso,
  resumenMensual,
  resumenHoy,
  ventasPorOferta,
  tickerIngresos,
  adelantosPendientes,
  egresosPorCategoria,
  rentabilidadPorLinea,
  actividadReciente,
} from "../services/ingresos.service";

export const ingresosRouter = Router();
ingresosRouter.use(requireAuth);

// ─── Ticker público (todos los usuarios autenticados) ──
ingresosRouter.get("/ticker", async (_req, res) => {
  try { res.json(await tickerIngresos()); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ─── Rutas protegidas (solo SUPER_ADMIN) ──────────────
const admin = requireRole("SUPER_ADMIN");

ingresosRouter.get("/ofertas", admin, async (_req, res) => {
  try { res.json(await getOfertas()); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

ingresosRouter.get("/resumen", admin, async (req, res) => {
  try { res.json(await resumenMensual(req.query.mes as string | undefined)); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

ingresosRouter.get("/resumen/hoy", admin, async (_req, res) => {
  try { res.json(await resumenHoy()); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

ingresosRouter.get("/ofertas/progreso", admin, async (req, res) => {
  try { res.json(await ventasPorOferta(req.query.mes as string | undefined)); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

ingresosRouter.get("/adelantos", admin, async (_req, res) => {
  try { res.json(await adelantosPendientes()); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

ingresosRouter.get("/egresos/categorias", admin, async (req, res) => {
  try { res.json(await egresosPorCategoria(req.query.mes as string | undefined)); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

ingresosRouter.get("/rentabilidad", admin, async (req, res) => {
  try { res.json(await rentabilidadPorLinea(req.query.mes as string | undefined)); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

ingresosRouter.get("/actividad", admin, async (req, res) => {
  try {
    const limite = parseInt(req.query.limite as string, 10) || 12;
    res.json(await actividadReciente(limite));
  }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

ingresosRouter.get("/ventas", admin, async (req, res) => {
  try { res.json(await getVentasIngresos(req.query.mes as string | undefined)); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

ingresosRouter.get("/egresos", admin, async (req, res) => {
  try { res.json(await getEgresos(req.query.mes as string | undefined)); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ─── POST (crear) ─────────────────────────────────────

ingresosRouter.post("/ventas", admin, async (req, res) => {
  try {
    const autorId = (req as any).user.id;
    const data = { ...req.body, autorId };
    res.status(201).json(await createVentaIngreso(data));
  }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

ingresosRouter.post("/egresos", admin, async (req, res) => {
  try {
    const autorId = (req as any).user.id;
    const data = { ...req.body, autorId };
    res.status(201).json(await createEgreso(data));
  }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// ─── DELETE ───────────────────────────────────────────

ingresosRouter.delete("/ventas/:id", admin, async (req, res) => {
  try {
    const autorId = (req as any).user.id;
    res.json(await deleteVentaIngreso(req.params.id, autorId));
  }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

ingresosRouter.delete("/egresos/:id", admin, async (req, res) => {
  try {
    const autorId = (req as any).user.id;
    res.json(await deleteEgreso(req.params.id, autorId));
  }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});
