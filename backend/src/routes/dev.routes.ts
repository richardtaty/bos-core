import { Router, type Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  AREA_DEV,
  actualizarTarea,
  crearTarea,
  listarTareasDev,
  SinPermisoTareaError,
} from "../services/tareas.service";
import {
  actualizarEstadoTicket,
  contarTickets,
  listarTicketsDev,
  obtenerTicket,
  obtenerAdjunto,
} from "../services/tickets.service";

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

// ─── Módulo DEV → Tickets: bandeja de recepción (SOLO SUPER_ADMIN) ─────────
// Mismas reglas que DEV → Tareas: este router ya aplicó requireRole("SUPER_ADMIN")
// arriba, así que quien no tenga acceso a DEV no puede listar/consultar/descargar
// tickets ni por sidebar, ni por URL directa, ni por API. CREAR tickets sigue siendo
// abierto a todo autenticado vía /api/tickets (router independiente, sin requireRole).

function statusDe(e: unknown): number {
  const s = (e as { status?: unknown })?.status;
  return typeof s === "number" ? s : 400;
}

// GET /api/dev/tickets — más recientes primero (created_at real de la BD).
devRouter.get("/tickets", async (_req, res) => {
  res.json(await listarTicketsDev());
});

// GET /api/dev/tickets/estadisticas — tres contadores reales (conteos SQL en vivo):
// recibidos (todos), completados y cancelados. Va ANTES de /tickets/:id porque si no
// Express tomaría "estadisticas" como el :id del detalle.
devRouter.get("/tickets/estadisticas", async (_req, res) => {
  res.json(await contarTickets());
});

// PATCH /api/dev/tickets/:id/estado — marca el ticket COMPLETADO o CANCELADO.
// Actualiza el mismo registro (no crea otro, no borra): el ticket sigue en el
// historial con su estado y su created_at intacto.
devRouter.patch("/tickets/:id/estado", async (req, res) => {
  try {
    const estado = (req.body ?? {}) as { status?: unknown };
    res.json(await actualizarEstadoTicket(req.params.id, estado.status));
  } catch (e) {
    const status = statusDe(e);
    if (status === 404) { res.status(404).json({ error: "Ticket no encontrado" }); return; }
    res.status(status).json({ error: e instanceof Error ? e.message : "Error inesperado" });
  }
});

// GET /api/dev/tickets/:id — detalle completo + adjuntos (sin binario).
devRouter.get("/tickets/:id", async (req, res) => {
  try {
    res.json(await obtenerTicket(req.params.id));
  } catch (e) {
    const status = statusDe(e);
    if (status === 404) { res.status(404).json({ error: "Ticket no encontrado" }); return; }
    res.status(status).json({ error: e instanceof Error ? e.message : "Error inesperado" });
  }
});

// GET /api/dev/tickets/:id/adjuntos/:adjuntoId — descarga protegida del binario.
// El nombre original NUNCA se usa como ruta del servidor; el archivo se sirve desde
// el BLOB de la BD con su content-type, tras verificar la pertenencia al ticket.
devRouter.get("/tickets/:id/adjuntos/:adjuntoId", async (req, res) => {
  try {
    const adjunto = await obtenerAdjunto(req.params.adjuntoId);
    if (adjunto.ticketId !== req.params.id) {
      res.status(404).json({ error: "Adjunto no encontrado" });
      return;
    }
    res.setHeader("Content-Type", adjunto.contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(adjunto.nombreOriginal)}`,
    );
    res.send(adjunto.datos);
  } catch (e) {
    const status = statusDe(e);
    if (status === 404) { res.status(404).json({ error: "Adjunto no encontrado" }); return; }
    res.status(status).json({ error: e instanceof Error ? e.message : "Error inesperado" });
  }
});
