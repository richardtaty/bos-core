"use strict";
// Configuración central de la unidad BMF Funding (Fase 2): email, IA y documentos.
// Cada pieza se "apaga" sola si falta su clave de entorno — el código compila, se despliega
// y no hace ninguna llamada externa hasta que la variable exista en Fly (`fly secrets set ...`).
Object.defineProperty(exports, "__esModule", { value: true });
exports.bmfChatActivo = exports.BMF_CHAT_KEY = exports.BMF_CHAT_URL = exports.documentosActivos = exports.iaActiva = exports.emailActivo = exports.R2_ENDPOINT = exports.R2_BUCKET = exports.R2_SECRET_ACCESS_KEY = exports.R2_ACCESS_KEY_ID = exports.ANTHROPIC_MODELO = exports.ANTHROPIC_API_KEY = exports.EMAIL_DESDE = exports.RESEND_API_KEY = void 0;
exports.RESEND_API_KEY = (process.env.RESEND_API_KEY ?? "").trim();
// "From" que Resend acepta. En modo sandbox se usa onboarding@resend.dev; en producción debe
// ser un dominio verificado por Richard en resend.com (ej. funding@businessmarketfinders.com).
exports.EMAIL_DESDE = (process.env.EMAIL_DESDE ?? "").trim() || "Business Market Finders <onboarding@resend.dev>";
exports.ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY ?? "").trim();
exports.ANTHROPIC_MODELO = (process.env.ANTHROPIC_MODELO ?? "").trim() || "claude-sonnet-5";
exports.R2_ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID ?? "").trim();
exports.R2_SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY ?? "").trim();
exports.R2_BUCKET = (process.env.R2_BUCKET ?? "").trim();
// Endpoint S3 de Cloudflare R2: https://<account-id>.r2.cloudflarestorage.com
exports.R2_ENDPOINT = (process.env.R2_ENDPOINT ?? "").trim();
const emailActivo = () => exports.RESEND_API_KEY.length > 0;
exports.emailActivo = emailActivo;
const iaActiva = () => exports.ANTHROPIC_API_KEY.length > 0;
exports.iaActiva = iaActiva;
const documentosActivos = () => exports.R2_ACCESS_KEY_ID.length > 0 && exports.R2_SECRET_ACCESS_KEY.length > 0 && exports.R2_BUCKET.length > 0;
exports.documentosActivos = documentosActivos;
// ─── Chat de la landing (asistente BMF vía Hermes api_server) ─────────
// El widget del sitio habla con un agente Hermes dedicado (app Fly `bmf-hermes`).
// La URL y la clave viven en Fly (`fly secrets set BMF_CHAT_URL=... BMF_CHAT_KEY=...`);
// sin ellas el chat queda apagado y POST /api/public/bmf-chat responde 503.
exports.BMF_CHAT_URL = (process.env.BMF_CHAT_URL ?? "").trim();
exports.BMF_CHAT_KEY = (process.env.BMF_CHAT_KEY ?? "").trim();
const bmfChatActivo = () => exports.BMF_CHAT_URL.length > 0 && exports.BMF_CHAT_KEY.length > 0;
exports.bmfChatActivo = bmfChatActivo;
