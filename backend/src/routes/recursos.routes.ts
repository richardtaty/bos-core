import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  listarRecursos,
  crearRecurso,
  actualizarRecurso,
  eliminarRecurso,
} from "../services/recursos.service";

export const recursosRouter = Router();
recursosRouter.use(requireAuth);

// GET /api/recursos?cliente=&categoria=
recursosRouter.get("/", async (req, res) => {
  const { cliente, categoria } = req.query as Record<string, string | undefined>;
  res.json(await listarRecursos({ cliente, categoria }));
});

// POST /api/recursos — cualquier usuario autenticado puede crear
recursosRouter.post("/", async (req, res) => {
  try {
    const r = await crearRecurso(req.body, req.user!.id);
    res.status(201).json(r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/recursos/:id — solo ADMIN/SUPER_ADMIN
recursosRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const r = await actualizarRecurso(req.params.id, req.body, req.user!.id);
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/recursos/:id — solo ADMIN/SUPER_ADMIN
recursosRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const r = await eliminarRecurso(req.params.id, req.user!.id);
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
