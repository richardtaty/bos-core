import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { timelineGlobal, actividadPorUsuario, resumenEjecutivo } from "../services/actividad.service";

export const actividadRouter = Router();
actividadRouter.use(requireAuth);

// GET /api/actividad — timeline global.
// SUPER_ADMIN ve todo. Los demás solo ven actividad de su departamento.
actividadRouter.get("/", async (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 100, 200);
  const user = req.user!;

  if (user.rol === "SUPER_ADMIN") {
    res.json(await timelineGlobal(limite));
    return;
  }

  // Cada departamento solo ve su propia actividad
  res.json(await timelineGlobal(limite, user.departamentoId ?? undefined));
});

// GET /api/actividad/usuario/:id — actividad de un usuario específico
actividadRouter.get("/usuario/:id", async (req, res) => {
  res.json(await actividadPorUsuario(req.params.id));
});

// GET /api/actividad/mi-actividad — actividad del usuario autenticado
actividadRouter.get("/mi-actividad", async (req, res) => {
  res.json(await actividadPorUsuario(req.user!.id));
});

// GET /api/actividad/resumen — resumen ejecutivo (tareas pendientes, vencidas)
actividadRouter.get("/resumen", async (_req, res) => {
  res.json(await resumenEjecutivo());
});
