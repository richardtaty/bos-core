import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  listarDepartamentos,
  crearDepartamento,
  listarEquipos,
  crearEquipo,
  agregarMiembro,
  removerMiembro,
  miembrosDelEquipo,
  organigrama,
} from "../services/org.service";

export const orgRouter = Router();
orgRouter.use(requireAuth);

// ─── Departamentos ────────────────────────────────────────

orgRouter.get("/departamentos", async (_req, res) => {
  res.json(await listarDepartamentos());
});

// Solo SUPER_ADMIN puede crear departamentos.
orgRouter.post("/departamentos", requireRole("SUPER_ADMIN"), async (req, res) => {
  const d = await crearDepartamento(req.body, req.user!.id);
  res.status(201).json(d);
});

// ─── Equipos ──────────────────────────────────────────────

// Filtrar equipos por departamento del usuario si no es SUPER_ADMIN
orgRouter.get("/equipos", async (req, res) => {
  const user = req.user!;
  const { departamentoId } = req.query as Record<string, string | undefined>;
  // SUPER_ADMIN puede filtrar por cualquier depto. Los demás solo ven el suyo.
  const filtro = user.rol === "SUPER_ADMIN" ? departamentoId : (user.departamentoId ?? undefined);
  res.json(await listarEquipos(filtro));
});

// ADMIN solo puede crear equipos en su propio departamento.
orgRouter.post("/equipos", requireRole("ADMIN"), async (req, res) => {
  const user = req.user!;
  const data = { ...req.body };
  // Forzar departamento del creador si no es SUPER_ADMIN
  if (user.rol !== "SUPER_ADMIN") {
    if (!user.departamentoId) {
      res.status(403).json({ error: "No tienes un departamento asignado." });
      return;
    }
    data.departamentoId = user.departamentoId;
  }
  const e = await crearEquipo(data, user.id);
  res.status(201).json(e);
});

// ─── Miembros ─────────────────────────────────────────────

orgRouter.get("/equipos/:equipoId/miembros", async (req, res) => {
  res.json(await miembrosDelEquipo(req.params.equipoId));
});

orgRouter.post("/equipos/:equipoId/miembros", requireRole("ADMIN"), async (req, res) => {
  const { usuarioId, cargo } = req.body;
  const m = await agregarMiembro(req.params.equipoId, usuarioId, cargo, req.user!.id);
  res.status(201).json(m);
});

orgRouter.delete("/equipos/:equipoId/miembros/:usuarioId", requireRole("ADMIN"), async (req, res) => {
  await removerMiembro(req.params.equipoId, req.params.usuarioId, req.user!.id);
  res.json({ ok: true });
});

// ─── Organigrama ──────────────────────────────────────────

// SUPER_ADMIN ve toda la estructura. Los demás solo su departamento.
orgRouter.get("/organigrama", async (req, res) => {
  const user = req.user!;
  const deptoId = user.rol === "SUPER_ADMIN" ? undefined : (user.departamentoId ?? undefined);
  res.json(await organigrama(deptoId));
});
