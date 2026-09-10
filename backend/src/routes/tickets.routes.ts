import { Router, raw } from "express";
import type { RequestHandler } from "express";
import { requireAuth } from "../middleware/auth";
import {
  crearTicket,
  agregarAdjunto,
  MAX_ADJUNTO_BYTES,
  MAX_ADJUNTOS_POR_TICKET,
  MENSAJE_ADJUNTO_OBLIGATORIO,
  type ArchivoTicket,
} from "../services/tickets.service";

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

// ─── Sobre binario sin dependencias (sin multer/FormData) ───────────────────
// Formato:  "BOST" (4 bytes) + uint32BE largoMeta + meta JSON (UTF-8)
//           + bytes de cada archivo, concatenados en el mismo orden que la meta.
// La meta lleva { description, prioridad, idempotencyKey, archivos:[{nombre,tamano}] }.
// Se usa un sobre binario explícito porque el proyecto no tiene librería de multipart
// y así ticket + adjuntos viajan en UNA sola petición (no puede quedar ticket a medias).
const MAGIA = Buffer.from("BOST", "utf8");

function parsearSobre(cuerpo: Buffer): { meta: Record<string, unknown>; archivos: ArchivoTicket[] } {
  if (cuerpo.length < 8 || !cuerpo.subarray(0, 4).equals(MAGIA)) {
    throw new Error("Formato de envío inválido.");
  }
  const largoMeta = cuerpo.readUInt32BE(4);
  if (largoMeta <= 0 || 8 + largoMeta > cuerpo.length) {
    throw new Error("Formato de envío inválido.");
  }
  let meta: Record<string, unknown>;
  try {
    const crudo = JSON.parse(cuerpo.subarray(8, 8 + largoMeta).toString("utf8"));
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) throw new Error("x");
    meta = crudo as Record<string, unknown>;
  } catch {
    throw new Error("Formato de envío inválido.");
  }

  const listaMeta = Array.isArray(meta.archivos) ? (meta.archivos as unknown[]) : [];
  const archivos: ArchivoTicket[] = [];
  let cursor = 8 + largoMeta;
  for (const item of listaMeta) {
    const entrada = (item ?? {}) as { nombre?: unknown; tamano?: unknown };
    const nombre = typeof entrada.nombre === "string" ? entrada.nombre : "";
    const tamano = typeof entrada.tamano === "number" ? entrada.tamano : -1;
    if (!nombre || !Number.isInteger(tamano) || tamano <= 0) {
      throw new Error("Formato de envío inválido.");
    }
    if (cursor + tamano > cuerpo.length) throw new Error("El envío llegó incompleto.");
    archivos.push({ nombreOriginal: nombre, datos: cuerpo.subarray(cursor, cursor + tamano) });
    cursor += tamano;
  }
  if (cursor !== cuerpo.length) throw new Error("El envío llegó incompleto.");

  return { meta, archivos };
}

function responderError(res: Parameters<RequestHandler>[1], e: unknown): void {
  res.status(statusDe(e)).json({ error: mensajeDe(e) });
}

// Rechazo temprano y claro si la cabecera ya supera el tope (antes de leer el body).
const TAMANO_MAX_ENVIO = MAX_ADJUNTO_BYTES * MAX_ADJUNTOS_POR_TICKET + 64 * 1024;
const revisarTamanoEnvio: RequestHandler = (req, res, next) => {
  const len = Number(req.headers["content-length"]);
  if (Number.isFinite(len) && len > TAMANO_MAX_ENVIO) {
    res.status(413).json({ error: "Los archivos adjuntos superan el tamaño máximo permitido." });
    return;
  }
  next();
};

// POST /api/tickets — crea el ticket CON sus adjuntos en una sola petición.
// El solicitante, la fecha y el estado inicial (PENDIENTE) los pone el servidor.
// Sin al menos un archivo válido la petición se rechaza y NO se crea el ticket.
ticketsRouter.post(
  "/",
  revisarTamanoEnvio,
  raw({ type: () => true, limit: "48mb" }),
  (async (req, res) => {
    try {
      const cuerpo = req.body as unknown;

      // Camino 1: sobre binario con archivos (el que usa la UI).
      if (Buffer.isBuffer(cuerpo)) {
        const { meta, archivos } = parsearSobre(cuerpo);
        const ticket = await crearTicket({ ...meta, archivos }, req.user!.id);
        res.status(201).json(ticket);
        return;
      }

      // Camino 2: JSON sin archivos → se rechaza con el mensaje claro (nunca se crea).
      const datos = (cuerpo ?? {}) as Record<string, unknown>;
      if (!Array.isArray(datos.archivos) || datos.archivos.length === 0) {
        res.status(400).json({ error: MENSAJE_ADJUNTO_OBLIGATORIO });
        return;
      }
      const ticket = await crearTicket(datos, req.user!.id);
      res.status(201).json(ticket);
    } catch (e) {
      responderError(res, e);
    }
  }) as RequestHandler,
);

// Rechazo temprano y claro si la cabecera ya supera el tope (antes de leer el body).
const revisarTamano: RequestHandler = (req, res, next) => {
  const len = Number(req.headers["content-length"]);
  if (Number.isFinite(len) && len > MAX_ADJUNTO_BYTES) {
    res.status(413).json({ error: `El archivo supera el máximo de ${Math.round(MAX_ADJUNTO_BYTES / 1024 / 1024)} MB.` });
    return;
  }
  next();
};

// POST /api/tickets/:id/adjuntos — adjunta UN archivo más a un ticket existente
// (body binario, sin base64). Solo el solicitante del ticket o un SUPER_ADMIN.
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
      responderError(res, e);
    }
  }) as RequestHandler,
);
