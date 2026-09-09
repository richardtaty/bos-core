import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { crearRegistroCalendarioSchema } from "../lib/validation";
import { crearRegistroCalendario, ClienteNoEncontradoError } from "../services/calendario.service";

// 📅 Calendario (SALA DE OFERTAS → Calendario). Crea alertas/recordatorios/seguimientos
// ligados a un cliente real. La lectura de pendientes sigue en GET /personas/tareas/pendientes
// (misma tabla, misma fuente única); aquí solo vive la escritura del módulo.
export const calendarioRouter = Router();
calendarioRouter.use(requireAuth);

calendarioRouter.post("/registros", async (req, res) => {
  const parsed = crearRegistroCalendarioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const resultado = await crearRegistroCalendario(parsed.data, req.user!.id);
    res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof ClienteNoEncontradoError) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error("[Calendario] error al crear registro:", err);
    res.status(500).json({ error: "No se pudo crear el registro del Calendario" });
  }
});
