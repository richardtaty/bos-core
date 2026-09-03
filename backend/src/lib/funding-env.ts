// Configuración central de la unidad BMF Funding (Fase 2): email, IA y documentos.
// Cada pieza se "apaga" sola si falta su clave de entorno — el código compila, se despliega
// y no hace ninguna llamada externa hasta que la variable exista en Fly (`fly secrets set ...`).

export const RESEND_API_KEY = (process.env.RESEND_API_KEY ?? "").trim();

// "From" que Resend acepta. En modo sandbox se usa onboarding@resend.dev; en producción debe
// ser un dominio verificado por Richard en resend.com (ej. funding@businessmarketfinders.com).
export const EMAIL_DESDE =
  (process.env.EMAIL_DESDE ?? "").trim() || "Business Market Finders <onboarding@resend.dev>";

// Email interno que recibe una copia de cada aplicación (aviso al equipo BMF).
export const BMF_NOTIFICACION_EMAIL =
  (process.env.BMF_NOTIFICACION_EMAIL ?? "").trim() || "richard@richardtaty.com";

export const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY ?? "").trim();
export const ANTHROPIC_MODELO = (process.env.ANTHROPIC_MODELO ?? "").trim() || "claude-sonnet-5";

export const R2_ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID ?? "").trim();
export const R2_SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY ?? "").trim();
export const R2_BUCKET = (process.env.R2_BUCKET ?? "").trim();
// Endpoint S3 de Cloudflare R2: https://<account-id>.r2.cloudflarestorage.com
export const R2_ENDPOINT = (process.env.R2_ENDPOINT ?? "").trim();

export const emailActivo = () => RESEND_API_KEY.length > 0;
export const iaActiva = () => ANTHROPIC_API_KEY.length > 0;
export const documentosActivos = () =>
  R2_ACCESS_KEY_ID.length > 0 && R2_SECRET_ACCESS_KEY.length > 0 && R2_BUCKET.length > 0;

// ─── Chat de la landing (asistente BMF vía Hermes api_server) ─────────
// El widget del sitio habla con un agente Hermes dedicado (app Fly `bmf-hermes`).
// La URL y la clave viven en Fly (`fly secrets set BMF_CHAT_URL=... BMF_CHAT_KEY=...`);
// sin ellas el chat queda apagado y POST /api/public/bmf-chat responde 503.
export const BMF_CHAT_URL = (process.env.BMF_CHAT_URL ?? "").trim();
export const BMF_CHAT_KEY = (process.env.BMF_CHAT_KEY ?? "").trim();

export const bmfChatActivo = () => BMF_CHAT_URL.length > 0 && BMF_CHAT_KEY.length > 0;
