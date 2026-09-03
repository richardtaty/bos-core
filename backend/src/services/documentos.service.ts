import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { bmfDocumentos } from "../db/schema";
import {
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_ENDPOINT,
  documentosActivos,
} from "../lib/funding-env";

// ─── Documentos en Cloudflare R2 (subida/descarga presigned) ───────────────────
// Los archivos NUNCA se exponen con URLs públicas: se generan URLs presigned de corta
// vida (subida 10 min, descarga 5 min). Si faltan las claves de R2, queda "apagado".

const TIPOS_VALIDOS = ["bank_statement", "identificacion", "cheque_anulado", "otro"] as const;
export type TipoDocumento = (typeof TIPOS_VALIDOS)[number];

export function esTipoDocumento(v: unknown): v is TipoDocumento {
  return typeof v === "string" && (TIPOS_VALIDOS as readonly string[]).includes(v);
}

let cliente: S3Client | null = null;

function obtenerCliente(): S3Client {
  if (!cliente) {
    cliente = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT || undefined,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return cliente;
}

function extensionDe(nombre: string, contentType?: string | null): string {
  const limpio = nombre.split(".").pop()?.toLowerCase() ?? "";
  if (limpio && limpio.length > 0 && limpio.length <= 5) return `.${limpio}`;
  if (contentType === "application/pdf") return ".pdf";
  if (contentType?.startsWith("image/")) return ".jpg";
  return "";
}

export interface EnlaceSubida {
  documentoId: string;
  storageKey: string;
  uploadUrl: string;
}

/** Crea la fila de documento (estado "pendiente") y devuelve una URL presigned de subida directa a R2. */
export async function generarEnlaceSubida(args: {
  solicitudId: string;
  tipo: TipoDocumento;
  nombre: string;
  contentType?: string | null;
}): Promise<EnlaceSubida | null> {
  if (!documentosActivos()) return null;

  const storageKey =
    `bmf-funding/${args.solicitudId}/${args.tipo}-${crypto.randomUUID()}${extensionDe(args.nombre, args.contentType)}`;
  const documentoId = crypto.randomUUID();

  const uploadUrl = await getSignedUrl(
    obtenerCliente(),
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: storageKey,
      ContentType: args.contentType || "application/octet-stream",
    }),
    { expiresIn: 600 },
  );

  await db.insert(bmfDocumentos).values({
    id: documentoId,
    solicitudId: args.solicitudId,
    tipo: args.tipo,
    nombre: args.nombre,
    storageKey,
    contentType: args.contentType ?? null,
    tamanoBytes: 0,
    estado: "pendiente",
    createdAt: new Date(),
  });

  return { documentoId, storageKey, uploadUrl };
}

/** URL presigned de descarga (5 min). Solo para flujos internos controlados. */
export async function generarEnlaceDescarga(storageKey: string): Promise<string | null> {
  if (!documentosActivos()) return null;
  return getSignedUrl(
    obtenerCliente(),
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: storageKey }),
    { expiresIn: 300 },
  );
}

/** Marca un documento como recibido (lo llamará el flujo de verificación, Fase 3). */
export async function marcarRecibido(documentoId: string): Promise<void> {
  await db.update(bmfDocumentos).set({ estado: "recibido" }).where(eq(bmfDocumentos.id, documentoId));
}
