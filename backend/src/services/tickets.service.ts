import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { ticketAdjuntos, tickets, usuarios } from "../db/schema";

// ─── Tickets de soporte (DEV → Tickets) ────────────────────────────────────────
// Bandeja de solicitudes que cualquier usuario autenticado puede CREAR desde el botón
// «Crear ticket» del sidebar. VER/administrar queda restringido a SUPER_ADMIN en el
// router /api/dev — aquí no se decide quién puede listar, solo se exponen los servicios
// que ese router llama. Un ticket NO es una tarea DEV y no se convierte en una.

export const PRIORIDADES_TICKET = ["Baja", "Normal", "Alta"] as const;
export type PrioridadTicket = (typeof PRIORIDADES_TICKET)[number];

export function esPrioridadTicket(v: unknown): v is PrioridadTicket {
  return typeof v === "string" && (PRIORIDADES_TICKET as readonly string[]).includes(v);
}

// Estados reales del ticket. Un ticket nuevo SIEMPRE nace PENDIENTE; el solicitante no
// elige estado. Solo se resuelve una vez (no hay reapertura ni estados extra).
export const ESTADOS_TICKET = ["PENDIENTE", "COMPLETADO", "CANCELADO"] as const;
export type EstadoTicket = (typeof ESTADOS_TICKET)[number];

/** Estados a los que un ticket PENDIENTE puede pasar (las dos acciones del detalle). */
export const ESTADOS_RESOLUCION = ["COMPLETADO", "CANCELADO"] as const;
export type EstadoResolucion = (typeof ESTADOS_RESOLUCION)[number];

export function esEstadoResolucion(v: unknown): v is EstadoResolucion {
  return typeof v === "string" && (ESTADOS_RESOLUCION as readonly string[]).includes(v);
}

// Adjuntos: límites y allowlist (validación REAL en backend, no solo el `accept`).
export const MAX_ADJUNTO_BYTES = 8 * 1024 * 1024; // 8 MB por archivo
export const MAX_ADJUNTOS_POR_TICKET = 5;

// Todo ticket debe traer al menos un archivo válido: el backend lo exige, no solo la UI.
export const MENSAJE_ADJUNTO_OBLIGATORIO =
  "Debes adjuntar al menos una imagen o documento para enviar el ticket.";

// Extensión → content-type canónico. El content-type que mande el navegador no se
// guarda tal cual: se normaliza desde la extensión permitida (es la fuente de confianza).
const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
};

function extensionDe(nombre: string): string {
  const limpio = nombre.split(".").pop()?.toLowerCase().trim() ?? "";
  return EXT_MIME[limpio] ? limpio : "";
}

function esBytes(buf: Buffer, seq: number[]): boolean {
  return seq.every((b, i) => buf[i] === b);
}

// Chequeo de firmas (magic bytes): no basta el `accept` del navegador ni la cabecera.
// Se rechazan ejecutables disfrazados (MZ/ELF/#!) y se verifica la firma real de cada
// tipo permitido. Office antiguo (doc/xls) es contenedor OLE; docx/xlsx son ZIP (PK).
function validarFirma(datos: Buffer, ext: string): boolean {
  if (datos.length < 8) return false;
  // Ejecutables y scripts NUNCA, aunque el nombre mienta (.png con cuerpo MZ).
  if (esBytes(datos, [0x4d, 0x5a]) || esBytes(datos, [0x7f, 0x45, 0x4c, 0x46])) return false; // MZ / ELF
  if (datos[0] === 0x23 && datos[1] === 0x21) return false; // shebang "#!"

  switch (ext) {
    case "png":
      return esBytes(datos, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg":
      return esBytes(datos, [0xff, 0xd8, 0xff]);
    case "webp": {
      const esRiff = esBytes(datos, [0x52, 0x49, 0x46, 0x46]);
      const esWebp = esBytes(datos.slice(8), [0x57, 0x45, 0x42, 0x50]); // "WEBP"
      return esRiff && esWebp;
    }
    case "pdf":
      return esBytes(datos, [0x25, 0x50, 0x44, 0x46]); // "%PDF"
    case "doc":
    case "xls":
      return esBytes(datos, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // OLE2
    case "docx":
    case "xlsx":
      return esBytes(datos, [0x50, 0x4b, 0x03, 0x04]) || esBytes(datos, [0x50, 0x4b, 0x05, 0x06]); // PK ZIP
    case "txt":
      // Texto plano: no debe contener bytes NUL en la cabecera.
      return !datos.subarray(0, 1024).includes(0);
    default:
      return false;
  }
}

/** Error con código HTTP: el router lo traduce tal cual (400/403/404). */
function errorConStatus(mensaje: string, status: number): Error {
  const err = new Error(mensaje) as Error & { status?: number };
  err.status = status;
  return err;
}

export function validarAdjunto(nombreOriginal: string, datos: Buffer): { nombre: string; contentType: string } {
  if (!Buffer.isBuffer(datos) || datos.length === 0) throw new Error("El archivo está vacío.");
  if (datos.length > MAX_ADJUNTO_BYTES) {
    throw new Error(`El archivo supera el máximo de ${Math.round(MAX_ADJUNTO_BYTES / 1024 / 1024)} MB.`);
  }
  // Solo el nombre base (nunca rutas del usuario se tocan como ruta de servidor).
  const nombreBase = nombreOriginal.split(/[\\/]/).pop() ?? "";
  if (!nombreBase.trim()) throw new Error("Falta el nombre del archivo.");
  const ext = extensionDe(nombreBase);
  if (!ext) throw new Error("Tipo de archivo no permitido.");
  if (!validarFirma(datos, ext)) throw new Error("El archivo no corresponde al tipo indicado o no está permitido.");

  return { nombre: nombreBase.trim(), contentType: EXT_MIME[ext] };
}

// ─── Crear ticket (abierto a cualquier usuario autenticado) ──────────────
// Un ticket SIEMPRE se crea con al menos un adjunto: se validan TODOS los archivos
// antes de insertar nada, así nunca queda un ticket incompleto en la base de datos.

export interface ArchivoTicket {
  nombreOriginal: string;
  datos: Buffer;
}

export async function crearTicket(
  input: {
    description?: unknown;
    prioridad?: unknown;
    idempotencyKey?: unknown;
    archivos?: unknown;
  },
  autorId: string,
) {
  const descripcion = typeof input.description === "string" ? input.description.trim() : "";
  if (!descripcion) throw new Error("La descripción es obligatoria.");
  const prioridad = esPrioridadTicket(input.prioridad) ? input.prioridad : "Normal";
  const idempotencyKey =
    typeof input.idempotencyKey === "string" && input.idempotencyKey.trim().length > 0
      ? input.idempotencyKey.trim()
      : null;

  // Idempotencia anti doble-clic: misma clave → mismo ticket ya creado (como pagos).
  if (idempotencyKey) {
    const [existente] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.requestedByUserId, autorId), eq(tickets.idempotencyKey, idempotencyKey)));
    if (existente) return obtenerTicket(existente.id);
  }

  const archivos = Array.isArray(input.archivos) ? (input.archivos as ArchivoTicket[]) : [];
  if (archivos.length === 0) throw new Error(MENSAJE_ADJUNTO_OBLIGATORIO);
  if (archivos.length > MAX_ADJUNTOS_POR_TICKET) {
    throw new Error(`Un ticket admite hasta ${MAX_ADJUNTOS_POR_TICKET} archivos.`);
  }
  // Validar TODOS antes de escribir: si uno falla, no se crea el ticket. Los datos
  // que no tengan la forma esperada se tratan como archivo vacío (error claro en
  // español, no un fallo del parser).
  const validados = archivos.map((a) => {
    const entrada = (a ?? {}) as Partial<ArchivoTicket>;
    const nombre = typeof entrada.nombreOriginal === "string" ? entrada.nombreOriginal : "";
    const datos = Buffer.isBuffer(entrada.datos) ? entrada.datos : Buffer.alloc(0);
    return validarAdjunto(nombre, datos);
  });

  const id = crypto.randomUUID();
  await db.insert(tickets).values({
    id,
    requestedByUserId: autorId,
    description: descripcion,
    prioridad,
    status: "PENDIENTE", // el estado inicial no lo elige el usuario
    idempotencyKey,
    createdAt: new Date(),
  });

  for (let i = 0; i < validados.length; i++) {
    await db.insert(ticketAdjuntos).values({
      id: crypto.randomUUID(),
      ticketId: id,
      nombreOriginal: validados[i].nombre,
      contentType: validados[i].contentType,
      tamanoBytes: archivos[i].datos.length,
      datos: archivos[i].datos,
      subidoPor: autorId,
      createdAt: new Date(),
    });
  }

  return obtenerTicket(id);
}

// ─── Consulta (usada SOLO por el router /api/dev, restringido a SUPER_ADMIN) ──

const COLUMNAS_TICKET = {
  id: tickets.id,
  requestedByUserId: tickets.requestedByUserId,
  solicitanteNombre: usuarios.nombre,
  solicitudEmail: usuarios.email,
  solicitudCargo: usuarios.cargo,
  description: tickets.description,
  prioridad: tickets.prioridad,
  status: tickets.status,
  completedAt: tickets.completedAt,
  cancelledAt: tickets.cancelledAt,
  createdAt: tickets.createdAt,
};

// Más recientes → más antiguos, ordenando por el timestamp real de la BD (INTEGER),
// nunca por el texto de la fecha. El estado NO cambia el orden ni la fecha de creación.
export async function listarTicketsDev() {
  const filas = await db
    .select(COLUMNAS_TICKET)
    .from(tickets)
    .innerJoin(usuarios, eq(tickets.requestedByUserId, usuarios.id))
    .orderBy(desc(tickets.createdAt));

  if (filas.length === 0) return [];

  const conteos = await db
    .select({ ticketId: ticketAdjuntos.ticketId, total: count(ticketAdjuntos.id) })
    .from(ticketAdjuntos)
    .groupBy(ticketAdjuntos.ticketId);
  const mapaConteo = new Map(conteos.map((c) => [c.ticketId, c.total]));

  return filas.map((f) => ({ ...f, adjuntosCount: mapaConteo.get(f.id) ?? 0 }));
}

/** Estadísticas reales (conteos SQL sobre los registros, nunca números fijos). */
export async function contarTickets() {
  const filas = await db
    .select({ status: tickets.status, total: count(tickets.id) })
    .from(tickets)
    .groupBy(tickets.status);

  const porEstado = new Map(filas.map((f) => [f.status, f.total]));
  const completados = porEstado.get("COMPLETADO") ?? 0;
  const cancelados = porEstado.get("CANCELADO") ?? 0;
  const pendientes = porEstado.get("PENDIENTE") ?? 0;

  return { recibidos: pendientes + completados + cancelados, completados, cancelados };
}

export async function obtenerTicket(id: string) {
  const [fila] = await db
    .select(COLUMNAS_TICKET)
    .from(tickets)
    .innerJoin(usuarios, eq(tickets.requestedByUserId, usuarios.id))
    .where(eq(tickets.id, id));

  if (!fila) throw errorConStatus("Ticket no encontrado", 404);

  const adjuntos = await db
    .select({
      id: ticketAdjuntos.id,
      nombreOriginal: ticketAdjuntos.nombreOriginal,
      contentType: ticketAdjuntos.contentType,
      tamanoBytes: ticketAdjuntos.tamanoBytes,
      createdAt: ticketAdjuntos.createdAt,
    })
    .from(ticketAdjuntos)
    .where(eq(ticketAdjuntos.ticketId, id))
    .orderBy(desc(ticketAdjuntos.createdAt));

  return { ...fila, adjuntosCount: adjuntos.length, adjuntos };
}

// ─── Resolver un ticket (solo SUPER_ADMIN, vía router /api/dev) ──────────
// Actualiza EL MISMO registro (nunca crea otro, nunca borra): el ticket sigue en el
// historial con su estado. created_at no se toca; se sella la fecha de resolución.

export async function actualizarEstadoTicket(id: string, estado: unknown) {
  if (!esEstadoResolucion(estado)) {
    throw new Error("Estado de ticket inválido. Solo se puede marcar COMPLETADO o CANCELADO.");
  }

  const [ticket] = await db.select({ status: tickets.status }).from(tickets).where(eq(tickets.id, id));
  if (!ticket) throw errorConStatus("Ticket no encontrado", 404);
  if (ticket.status !== "PENDIENTE") {
    const comoEsta = ticket.status === "COMPLETADO" ? "completado" : "cancelado";
    throw new Error(`El ticket ya está ${comoEsta}. No se puede cambiar de nuevo.`);
  }

  const ahora = new Date();
  await db
    .update(tickets)
    .set(
      estado === "COMPLETADO"
        ? { status: "COMPLETADO", completedAt: ahora }
        : { status: "CANCELADO", cancelledAt: ahora },
    )
    .where(eq(tickets.id, id));

  return obtenerTicket(id);
}

// ─── Adjuntos ───────────────────────────────────────────────────────────────

export async function agregarAdjunto(args: {
  ticketId: string;
  nombreOriginal: string;
  datos: Buffer;
}, autor: { id: string; rol: string }) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, args.ticketId));
  if (!ticket) throw errorConStatus("Ticket no encontrado", 404);

  // Quién adjunta: el propio solicitante o un SUPER_ADMIN. Nadie más puede tocar
  // un ticket ajeno aunque conozca su ID (uuid imposible de adivinar).
  if (ticket.requestedByUserId !== autor.id && autor.rol !== "SUPER_ADMIN") {
    throw errorConStatus("No tienes permiso para adjuntar archivos a este ticket.", 403);
  }

  const { nombre, contentType } = validarAdjunto(args.nombreOriginal, args.datos);

  const [{ total }] = await db
    .select({ total: count(ticketAdjuntos.id) })
    .from(ticketAdjuntos)
    .where(eq(ticketAdjuntos.ticketId, args.ticketId));
  if (total >= MAX_ADJUNTOS_POR_TICKET) {
    throw new Error(`Un ticket admite hasta ${MAX_ADJUNTOS_POR_TICKET} archivos.`);
  }

  const id = crypto.randomUUID();
  await db.insert(ticketAdjuntos).values({
    id,
    ticketId: args.ticketId,
    nombreOriginal: nombre,
    contentType,
    tamanoBytes: args.datos.length,
    datos: args.datos,
    subidoPor: autor.id,
    createdAt: new Date(),
  });

  const [fila] = await db
    .select({
      id: ticketAdjuntos.id,
      nombreOriginal: ticketAdjuntos.nombreOriginal,
      contentType: ticketAdjuntos.contentType,
      tamanoBytes: ticketAdjuntos.tamanoBytes,
      createdAt: ticketAdjuntos.createdAt,
    })
    .from(ticketAdjuntos)
    .where(eq(ticketAdjuntos.id, id));
  return fila;
}

/** Adjunto completo (incluye el binario) — SOLO para el endpoint de descarga del DEV. */
export async function obtenerAdjunto(adjuntoId: string) {
  const [fila] = await db.select().from(ticketAdjuntos).where(eq(ticketAdjuntos.id, adjuntoId));
  if (!fila) throw errorConStatus("Adjunto no encontrado", 404);
  return fila;
}
