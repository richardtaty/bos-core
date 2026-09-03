import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { listarArchivos, crearArchivo, eliminarArchivo } from "../services/archivos.service";

export const archivosRouter = Router();
archivosRouter.use(requireAuth);

// GET /api/archivos?entidad=TareaOperativa&entidadId=xxx
archivosRouter.get("/", async (req, res) => {
  const { entidad, entidadId } = req.query as Record<string, string | undefined>;
  res.json(await listarArchivos({ entidad, entidadId }));
});

// POST /api/archivos
archivosRouter.post("/", async (req, res) => {
  try {
    const archivo = await crearArchivo(req.body, req.user!.id);
    res.status(201).json(archivo);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/archivos/:id
archivosRouter.delete("/:id", async (req, res) => {
  try {
    await eliminarArchivo(req.params.id, req.user!.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
