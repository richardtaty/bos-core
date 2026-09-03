"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.esTipoDocumento = esTipoDocumento;
exports.generarEnlaceSubida = generarEnlaceSubida;
exports.generarEnlaceDescarga = generarEnlaceDescarga;
exports.marcarRecibido = marcarRecibido;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const funding_env_1 = require("../lib/funding-env");
// ─── Documentos en Cloudflare R2 (subida/descarga presigned) ───────────────────
// Los archivos NUNCA se exponen con URLs públicas: se generan URLs presigned de corta
// vida (subida 10 min, descarga 5 min). Si faltan las claves de R2, queda "apagado".
const TIPOS_VALIDOS = ["bank_statement", "identificacion", "cheque_anulado", "otro"];
function esTipoDocumento(v) {
    return typeof v === "string" && TIPOS_VALIDOS.includes(v);
}
let cliente = null;
function obtenerCliente() {
    if (!cliente) {
        cliente = new client_s3_1.S3Client({
            region: "auto",
            endpoint: funding_env_1.R2_ENDPOINT || undefined,
            credentials: {
                accessKeyId: funding_env_1.R2_ACCESS_KEY_ID,
                secretAccessKey: funding_env_1.R2_SECRET_ACCESS_KEY,
            },
        });
    }
    return cliente;
}
function extensionDe(nombre, contentType) {
    const limpio = nombre.split(".").pop()?.toLowerCase() ?? "";
    if (limpio && limpio.length > 0 && limpio.length <= 5)
        return `.${limpio}`;
    if (contentType === "application/pdf")
        return ".pdf";
    if (contentType?.startsWith("image/"))
        return ".jpg";
    return "";
}
/** Crea la fila de documento (estado "pendiente") y devuelve una URL presigned de subida directa a R2. */
async function generarEnlaceSubida(args) {
    if (!(0, funding_env_1.documentosActivos)())
        return null;
    const storageKey = `bmf-funding/${args.solicitudId}/${args.tipo}-${crypto.randomUUID()}${extensionDe(args.nombre, args.contentType)}`;
    const documentoId = crypto.randomUUID();
    const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(obtenerCliente(), new client_s3_1.PutObjectCommand({
        Bucket: funding_env_1.R2_BUCKET,
        Key: storageKey,
        ContentType: args.contentType || "application/octet-stream",
    }), { expiresIn: 600 });
    await client_1.db.insert(schema_1.bmfDocumentos).values({
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
async function generarEnlaceDescarga(storageKey) {
    if (!(0, funding_env_1.documentosActivos)())
        return null;
    return (0, s3_request_presigner_1.getSignedUrl)(obtenerCliente(), new client_s3_1.GetObjectCommand({ Bucket: funding_env_1.R2_BUCKET, Key: storageKey }), { expiresIn: 300 });
}
/** Marca un documento como recibido (lo llamará el flujo de verificación, Fase 3). */
async function marcarRecibido(documentoId) {
    await client_1.db.update(schema_1.bmfDocumentos).set({ estado: "recibido" }).where((0, drizzle_orm_1.eq)(schema_1.bmfDocumentos.id, documentoId));
}
