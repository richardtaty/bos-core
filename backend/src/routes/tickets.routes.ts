import { Router, raw } from "express";
import type { RequestHandler } from "express";
import { requireAuth } from "../middleware/auth";
import { crearTicket, agregarAdjunto, MAX_ADJUNTO_BYTES } from "../services/tickets.service";

// ─── Tickets: CREACIÓN abierta a todo usuario autenticado ──────────────────
// Este router NO aplica requireRole: cualquier autenticado (SUPER_ADMIN, ADMIN,
// SUPERVISOR, USUARIO) puede crear tickets y adjuntar archivos al suyo. La bandeja
// de consulta vive en /api/dev/tickets (restringida a SUPER_ADMIN) — crear un ticket
// nunca otorga acceso al módulo DEV.
export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : "Error inesperado";
}
function statusDe(e: unknown): number {
  const s = (e as { status?: unknown })?.status;
  return typeof s === "number" ? s : 400;
}

// POST /api/tickets — crea un ticket. El solicitante y la fecha salen del usuario
// autenticado y del reloj del servidor; el usuario no los escribe.
ticketsRouter.post("/", async (req, res) => {
  try {
    const ticket = await crearTicket(req.body ?? {}, req.user!.id);
    res.status(201).json(ticket);
  } catch (e) {
    res.status(statusDe(e)).json({ error: mensajeDe(e) });
  }
});

// Rechazo temprano y claro si la cabecera ya supera el tope (antes de leer el body).
const revisarTamano: RequestHandler = (req, res, next) => {
  const len = Number(req.headers["content-length"]);
  if (Number.isFinite(len) && len > MAX_ADJUNTO_BYTES) {
    res.status(413).json({ error: `El archivo supera el máximo de ${Math.round(MAX_ADJUNTO_BYTES / 1024 / 1024)} MB.` });
    return;
  }
  next();
};

// POST /api/tickets/:id/adjuntos — adjunta UN archivo (body binario, sin base64).
// Solo el solicitante del ticket o un SUPER_ADMIN puede adjuntar a ese ticket.
// express.raw se monta a nivel de ruta: el express.json() global no toca los
// content-types binarios, así que no hace falta subir el límite global.
ticketsRouter.post(
  "/:id/adjuntos",
  revisarTamano,
  raw({ type: () => true, limit: "12mb" }),
  (async (req, res) => {
    try {
      const cabeceraNombre = req.headers["x-nombre-archivo"];
      if (typeof cabeceraNombre !== "string" || !cabeceraNombre.trim()) {
        res.status(400).json({ error: "Falta el nombre del archivo." });
        return;
      }
      let nombreOriginal: string;
      try {
        nombreOriginal = decodeURIComponent(cabeceraNombre.trim());
      } catch {
        res.status(400).json({ error: "Nombre de archivo inválido." });
        return;
      }
      const datos = req.body as Buffer;
      if (!Buffer.isBuffer(datos) || datos.length === 0) {
        res.status(400).json({ error: "Cuerpo de archivo inválido." });
        return;
      }
      const adjunto = await agregarAdjunto(
        { ticketId: req.params.id, nombreOriginal, datos },
        req.user!,
      );
      res.status(201).json(adjunto);
    } catch (e) {
      res.status(statusDe(e)).json({ error: mensajeDe(e) });
    }
  }) as RequestHandler,
);
