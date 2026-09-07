import { Router, type Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  AREA_DEV,
  actualizarTarea,
  crearTarea,
  listarTareasDev,
  SinPermisoTareaError,
} from "../services/tareas.service";

// ─── Módulo DEV: tareas de desarrollo ───────────────────────────
// Apartado exclusivo del SUPER ADMIN (matriz: ADMIN, SUPERVISOR y USUARIO quedan fuera
// aunque conozcan la URL). No duplica lógica: delega en los mismos servicios del sistema
// de tareas. El área DEV (`departamento = "DEV"`) se fuerza aquí y en crearTarea.
export const devRouter = Router();
devRouter.use(requireAuth);
devRouter.use(requireRole("SUPER_ADMIN"));

/** Un fallo de permiso es 403, no 400: el dato estaba bien, el usuario no tiene derecho. */
function responderError(res: Response, e: unknown): void {
  const mensaje = e instanceof Error ? e.message : "Error inesperado";
  const esPermiso = e instanceof SinPermisoTareaError;
  res.status(esPermiso ? 403 : 400).json({ error: mensaje });
}

// GET /api/dev/tareas?estado=pendiente|en_proceso|completada
devRouter.get("/tareas", async (req, res) => {
  const { estado } = req.query as Record<string, string | undefined>;
  res.json(await listarTareasDev(estado as any));
});

// POST /api/dev/tareas — crea una tarea DEV. Siempre nace PENDIENTE y con área DEV
// (el servicio de creación no acepta otro estado inicial).
devRouter.post("/tareas", async (req, res) => {
  try {
    const tarea = await crearTarea({ ...req.body, departamento: AREA_DEV }, req.user!);
    res.status(201).json(tarea);
  } catch (e) {
    responderError(res, e);
  }
});

// PATCH /api/dev/tareas/:id — edita la tarea o cambia su estado entre los tres de DEV
// (PENDIENTE / EN PROCESO / FINALIZADA). La validación vive en actualizarTarea.
devRouter.patch("/tareas/:id", async (req, res) => {
  try {
    const tarea = await actualizarTarea(req.params.id, req.body, req.user!);
    res.json(tarea);
  } catch (e) {
    responderError(res, e);
  }
});
