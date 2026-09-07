import { Router, Request, Response } from "express";
import { puedeAccederCumpleanos, requireAccesoCumpleanos, requireAuth } from "../middleware/auth";
import {
  actualizarCumpleanoSchema,
  crearCumpleanoSchema,
} from "../lib/validation";
import {
  CumpleanoDuplicadoError,
  CumpleanoNoEncontradoError,
  DatoCumpleanoInvalidoError,
  PersonaNoEncontradaError,
  activarCumpleano,
  actualizarCumpleano,
  crearCumpleano,
  desactivarCumpleano,
  listarCumpleanos,
  listarRecordatoriosActivos,
  marcarRecordatorioRealizado,
  obtenerCumpleano,
} from "../services/cumpleanos.service";

export const cumpleanosRouter = Router();
cumpleanosRouter.use(requireAuth);

// Mapea los errores de dominio del servicio al código HTTP correcto.
function manejarError(res: Response, err: unknown): void {
  if (err instanceof CumpleanoNoEncontradoError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof PersonaNoEncontradaError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof CumpleanoDuplicadoError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof DatoCumpleanoInvalidoError) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: (err as Error).message ?? "Error interno del servidor" });
}

// ── Consulta de permiso ─────────────────────────────────────
// DEBE ir antes del guard de acceso: un usuario sin permiso tiene que poder leer
// { puede: false } aquí para que el frontend oculte el módulo (y no recibir un 403).
cumpleanosRouter.get("/permiso", async (req: Request, res: Response) => {
  res.json({ puede: await puedeAccederCumpleanos(req.user!) });
});

// Todo lo que sigue exige acceso al módulo (ADMIN/SUPER_ADMIN o Marketing/Podcast).
cumpleanosRouter.use(requireAccesoCumpleanos);

// ── Recordatorios (el grupo "🎂 Cumpleaños" de Tareas) ─────
// Rutas específicas ANTES de "/:id" (regla #2 de errores ya resueltos).
cumpleanosRouter.get("/recordatorios/activos", async (_req, res) => {
  try {
    res.json(await listarRecordatoriosActivos());
  } catch (err) {
    manejarError(res, err);
  }
});

cumpleanosRouter.post("/recordatorios/:id/marcar-realizado", async (req, res) => {
  try {
    res.json(await marcarRecordatorioRealizado(req.params.id, req.user!.id));
  } catch (err) {
    manejarError(res, err);
  }
});

// ── Lista (GET /) y alta (POST /) ──────────────────────────
cumpleanosRouter.get("/", async (req, res) => {
  try {
    const meses = req.query.meses ? parseInt(req.query.meses as string, 10) : undefined;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    res.json(await listarCumpleanos({ meses, q }));
  } catch (err) {
    manejarError(res, err);
  }
});

cumpleanosRouter.post("/", async (req, res) => {
  const parsed = crearCumpleanoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const creado = await crearCumpleano(parsed.data, req.user!.id);
    res.status(201).json(creado);
  } catch (err) {
    manejarError(res, err);
  }
});

// ── Acciones sobre un registro ─────────────────────────────
cumpleanosRouter.post("/:id/activar", async (req, res) => {
  try {
    res.json(await activarCumpleano(req.params.id, req.user!.id));
  } catch (err) {
    manejarError(res, err);
  }
});

cumpleanosRouter.post("/:id/desactivar", async (req, res) => {
  try {
    res.json(await desactivarCumpleano(req.params.id, req.user!.id));
  } catch (err) {
    manejarError(res, err);
  }
});

cumpleanosRouter.get("/:id", async (req, res) => {
  try {
    const detalle = await obtenerCumpleano(req.params.id);
    if (!detalle) {
      res.status(404).json({ error: "Cumpleaños no encontrado." });
      return;
    }
    res.json(detalle);
  } catch (err) {
    manejarError(res, err);
  }
});

cumpleanosRouter.patch("/:id", async (req, res) => {
  const parsed = actualizarCumpleanoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await actualizarCumpleano(req.params.id, parsed.data, req.user!.id));
  } catch (err) {
    manejarError(res, err);
  }
});
