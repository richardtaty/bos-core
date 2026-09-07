import { Router } from "express";
import { requireAuth, requireDepartamento } from "../middleware/auth";
import {
  actualizarPublicacion,
  crearPublicacion,
  eliminarPublicacion,
  listarPublicaciones,
} from "../services/marketing-calendario.service";
import {
  actualizarPublicacionMarketingSchema,
  crearPublicacionMarketingSchema,
} from "../lib/validation";

// ─── 📅 Calendario de Marketing (correos/contenido por proyecto) ─────────────
// Router del Calendario de Marketing. Toda ruta exige pertenecer al departamento de
// Marketing (SUPER_ADMIN siempre entra). El alta de proyectos NO vive aquí: los proyectos
// se eligen existentes desde /api/proyectos y este módulo solo crea la RELACIÓN.
export const marketingRouter = Router();
marketingRouter.use(requireAuth);
marketingRouter.use(requireDepartamento("Marketing"));

marketingRouter.get("/calendario", async (req, res) => {
  const { desde, hasta } = req.query as Record<string, string | undefined>;
  try {
    res.json(await listarPublicaciones({ desde, hasta }, req.user!));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

marketingRouter.post("/calendario", async (req, res) => {
  const parsed = crearPublicacionMarketingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  try {
    const creado = await crearPublicacion(parsed.data, req.user!);
    res.status(201).json(creado);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

marketingRouter.delete("/calendario/:id", async (req, res) => {
  try {
    await eliminarPublicacion(req.params.id, req.user!);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Editar un elemento del calendario (incluye agregar/modificar/borrar la NOTA — regla 13).
marketingRouter.patch("/calendario/:id", async (req, res) => {
  const parsed = actualizarPublicacionMarketingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  try {
    res.json(await actualizarPublicacion(req.params.id, parsed.data, req.user!));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
