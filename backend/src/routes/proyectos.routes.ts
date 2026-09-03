import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  listarProyectos,
  obtenerProyecto,
  crearProyecto,
  actualizarProyecto,
  cambiarActivoProyecto,
  agregarComentarioProyecto,
} from "../services/proyectos.service";

export const proyectosRouter = Router();
proyectosRouter.use(requireAuth);

proyectosRouter.get("/", async (req, res) => {
  const user = req.user!;
  let { departamentoId, responsableId, estado } = req.query as Record<string, string | undefined>;

  // Si no es SUPER_ADMIN, forzar el departamento del usuario.
  if (user.rol !== "SUPER_ADMIN") {
    departamentoId = user.departamentoId ?? undefined;
  }

  res.json(await listarProyectos({ departamentoId, responsableId, estado }));
});

proyectosRouter.get("/:id", async (req, res) => {
  const p = await obtenerProyecto(req.params.id);
  if (!p) { res.status(404).json({ error: "Proyecto no encontrado" }); return; }
  res.json(p);
});

proyectosRouter.post("/", async (req, res) => {
  try {
    const user = req.user!;
    const data = { ...req.body };
    // Heredar departamento y responsable del creador si no es SUPER_ADMIN
    if (user.rol !== "SUPER_ADMIN") {
      data.departamentoId = user.departamentoId ?? data.departamentoId;
      data.responsableId = user.id;
    }
    const p = await crearProyecto(data, user.id);
    res.status(201).json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

proyectosRouter.patch("/:id/activo", async (req, res) => {
  try {
    const { activo } = req.body;
    if (typeof activo !== "boolean") {
      res.status(400).json({ error: "El campo 'activo' debe ser booleano" });
      return;
    }
    const p = await cambiarActivoProyecto(req.params.id, activo, req.user!.id);
    res.json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

proyectosRouter.patch("/:id", async (req, res) => {
  try {
    const p = await actualizarProyecto(req.params.id, req.body, req.user!.id);
    res.json(p);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

proyectosRouter.post("/:id/comentarios", async (req, res) => {
  const c = await agregarComentarioProyecto(req.params.id, req.body.texto, req.user!.id);
  res.status(201).json(c);
});
