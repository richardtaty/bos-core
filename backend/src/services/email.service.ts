import { db } from "../db/client";
import { bmfMensajes } from "../db/schema";
import { EMAIL_DESDE, RESEND_API_KEY, BMF_NOTIFICACION_EMAIL, emailActivo } from "../lib/funding-env";
import type { CrearSolicitudFundingInput } from "../lib/validation";

// ─── Envío de email vía Resend (API REST con fetch, sin SDK extra) ───────────
// Resend se invoca con fetch para no meter una dependencia más al backend. Si falta
// RESEND_API_KEY, todo queda "apagado": las funciones no envían nada y solo registran un log.

interface EmailInput {
  to: string;
  asunto: string;
  html: string;
  texto: string;
}

async function enviarEmail({ to, asunto, html, texto }: EmailInput): Promise<{ id: string }> {
  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_DESDE,
      to: [to],
      subject: asunto,
      html,
      text: texto,
    }),
  });

  const data = (await respuesta.json()) as { id?: string; message?: string };
  if (!respuesta.ok) {
    throw new Error(data.message ?? `Resend respondió ${respuesta.status}`);
  }
  return { id: data.id ?? "" };
}

export type ResultadoEnvioSolicitud = "enviado" | "desactivado" | "error";

/**
 * Envía un email y registra el mensaje en bmf_mensajes (dirección saliente).
 * Si el email está desactivado (sin RESEND_API_KEY) no hace nada — es el "modo apagado".
 */
export async function enviarEmailSolicitud(args: {
  solicitudId: string;
  personaId?: string | null;
  to: string;
  asunto: string;
  html: string;
  texto: string;
  generadoPorIA?: boolean;
}): Promise<ResultadoEnvioSolicitud> {
  if (!emailActivo()) {
    console.log("[BMF·email] desactivado (falta RESEND_API_KEY). No se envió nada.");
    return "desactivado";
  }

  try {
    const { id } = await enviarEmail({ to: args.to, asunto: args.asunto, html: args.html, texto: args.texto });
    await db.insert(bmfMensajes).values({
      id: crypto.randomUUID(),
      solicitudId: args.solicitudId,
      personaId: args.personaId ?? null,
      direccion: "saliente",
      remitente: EMAIL_DESDE,
      destinatario: args.to,
      asunto: args.asunto,
      cuerpo: args.texto,
      resendMessageId: id || null,
      generadoPorIA: args.generadoPorIA ?? false,
      estado: "enviado",
      createdAt: new Date(),
    });
    return "enviado";
  } catch (err) {
    console.error("[BMF·email] error enviando:", err);
    try {
      await db.insert(bmfMensajes).values({
        id: crypto.randomUUID(),
        solicitudId: args.solicitudId,
        personaId: args.personaId ?? null,
        direccion: "saliente",
        remitente: EMAIL_DESDE,
        destinatario: args.to,
        asunto: args.asunto,
        cuerpo: args.texto,
        generadoPorIA: args.generadoPorIA ?? false,
        estado: "error",
        createdAt: new Date(),
      });
    } catch {
      // no romper el flujo si el propio registro de error falla
    }
    return "error";
  }
}

// ─── Plantillas de email (Fase 2) ─────────────────────────────────────────────
// Funciones puras: devuelven { asunto, html, texto } sin efectos secundarios. El
// caller decide cuándo enviarlas. Todas respetan el "email-first": nunca proponen
// una llamada telefónica.

export interface Plantilla {
  asunto: string;
  html: string;
  texto: string;
}

const firma = (): string =>
  "\n\n— Business Market Finders\nBusiness Funding. Without the Phone Calls.\nEmail-first: reply to this email and we'll help you in writing.";

export function plantillaConfirmacion(args: { applicationId: string; nombre: string }): Plantilla {
  const asunto = `We received your application ${args.applicationId}`;
  const texto =
    `Hi ${args.nombre},\n\n` +
    `We received your funding application (${args.applicationId}). Our team is reviewing it now.\n\n` +
    `What happens next:\n` +
    `1. We review your business details.\n` +
    `2. We email you with any questions or documents we need.\n` +
    `3. You receive your funding options by email — no phone call required.\n\n` +
    `If we need anything, you'll hear from us here.${firma()}`;
  const html =
    `<p>Hi ${args.nombre},</p>` +
    `<p>We received your funding application (<strong>${args.applicationId}</strong>). Our team is reviewing it now.</p>` +
    `<ol><li>We review your business details.</li><li>We email you with any questions or documents we need.</li><li>You receive your funding options by email — no phone call required.</li></ol>` +
    `<p>If we need anything, you'll hear from us here.</p>`;
  return { asunto, html, texto };
}

export function plantillaSeguimiento(args: { applicationId: string; nombre: string }): Plantilla {
  const asunto = `Quick check-in on your application ${args.applicationId}`;
  const texto =
    `Hi ${args.nombre},\n\n` +
    `Just checking in on your funding application (${args.applicationId}). We want to make sure nothing is holding you up.\n\n` +
    `If you have any questions or need help gathering anything, just reply to this email — no phone call needed.${firma()}`;
  const html =
    `<p>Hi ${args.nombre},</p>` +
    `<p>Just checking in on your funding application (<strong>${args.applicationId}</strong>). We want to make sure nothing is holding you up.</p>` +
    `<p>If you have any questions or need help gathering anything, just reply to this email — no phone call needed.</p>`;
  return { asunto, html, texto };
}

export function plantillaPedidoDocumentos(args: { applicationId: string; nombre: string; enlace?: string }): Plantilla {
  const asunto = `Documents needed for your application ${args.applicationId}`;
  const lineaEnlace = args.enlace
    ? `Upload securely here: ${args.enlace}\n\n`
    : "We'll send you a secure link in a separate email.\n\n";
  const texto =
    `Hi ${args.nombre},\n\n` +
    `To move your application (${args.applicationId}) forward, we need a few documents from you:\n` +
    `- Last 3 months of business bank statements\n` +
    `- Government ID (driver's license or passport)\n` +
    `- Voided check for disbursement\n\n` +
    lineaEnlace +
    `Reply to this email if you have any questions.${firma()}`;
  const html =
    `<p>Hi ${args.nombre},</p>` +
    `<p>To move your application (<strong>${args.applicationId}</strong>) forward, we need a few documents from you:</p>` +
    `<ul><li>Last 3 months of business bank statements</li><li>Government ID (driver's license or passport)</li><li>Voided check for disbursement</li></ul>` +
    (args.enlace ? `<p>Upload securely here: <a href="${args.enlace}">${args.enlace}</a></p>` : `<p>We'll send you a secure link in a separate email.</p>`) +
    `<p>Reply to this email if you have any questions.</p>`;
  return { asunto, html, texto };
}

export function plantillaActualizacionEstado(args: { applicationId: string; nombre: string; estado: string }): Plantilla {
  const asunto = `Update on your application ${args.applicationId}`;
  const texto =
    `Hi ${args.nombre},\n\n` +
    `Here's an update on your funding application (${args.applicationId}): ${args.estado}.\n\n` +
    `We'll email you again as soon as there's more to share.${firma()}`;
  const html =
    `<p>Hi ${args.nombre},</p>` +
    `<p>Here's an update on your funding application (<strong>${args.applicationId}</strong>): ${args.estado}.</p>` +
    `<p>We'll email you again as soon as there's more to share.</p>`;
  return { asunto, html, texto };
}

export function plantillaOpcionesListas(args: { applicationId: string; nombre: string }): Plantilla {
  const asunto = `Your funding options are ready — ${args.applicationId}`;
  const texto =
    `Hi ${args.nombre},\n\n` +
    `Good news: your funding options for application ${args.applicationId} are ready. We've laid them out in writing so you can review them on your own time.\n\n` +
    `Reply to this email and we'll walk you through the details — no phone call needed.${firma()}`;
  const html =
    `<p>Hi ${args.nombre},</p>` +
    `<p>Good news: your funding options for application <strong>${args.applicationId}</strong> are ready. We've laid them out in writing so you can review them on your own time.</p>` +
    `<p>Reply to this email and we'll walk you through the details — no phone call needed.</p>`;
  return { asunto, html, texto };
}

export function plantillaFinanciado(args: { applicationId: string; nombre: string; monto: string }): Plantilla {
  const asunto = `Your funding is on its way — ${args.applicationId}`;
  const texto =
    `Hi ${args.nombre},\n\n` +
    `Congratulations — your funding (${args.monto}) for application ${args.applicationId} has been processed. Funds will be deposited to your account.\n\n` +
    `If anything looks off, reply here and we'll sort it out in writing.${firma()}`;
  const html =
    `<p>Hi ${args.nombre},</p>` +
    `<p>Congratulations — your funding (<strong>${args.monto}</strong>) for application <strong>${args.applicationId}</strong> has been processed. Funds will be deposited to your account.</p>` +
    `<p>If anything looks off, reply here and we'll sort it out in writing.</p>`;
  return { asunto, html, texto };
}

// ─── Notificación interna al equipo BMF ─────────────────────────────────────
// Cada aplicación dispara un aviso a `BMF_NOTIFICACION_EMAIL` con la ficha completa,
// para que Richard/equipo vean quién aplicó sin abrir BOS. Usa el mismo canal Resend.

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toLocaleString("en-US");
  return String(v);
}

export function plantillaNotificacionInterna(args: {
  applicationId: string;
  datos: CrearSolicitudFundingInput;
}): Plantilla {
  const d = args.datos;
  const monto =
    typeof d.montoSolicitado === "number" ? `$${d.montoSolicitado.toLocaleString("en-US")}` : undefined;

  const filas: [string, unknown][] = [
    ["Application ID", args.applicationId],
    ["Legal business name", d.empresaLegal],
    ["DBA", d.dba],
    ["Business address", d.empresaDireccion],
    ["City", d.empresaCiudad],
    ["State", d.empresaEstado],
    ["ZIP", d.empresaZip],
    ["Industry", d.industria],
    ["Business structure", d.estructuraNegocio],
    ["Business start date", d.fechaInicioNegocio],
    ["Website", d.sitioWeb],
    ["Owner name", `${d.propietarioNombre} ${d.propietarioApellido}`.trim()],
    ["Owner email", d.propietarioEmail],
    ["Owner phone", d.propietarioTelefono],
    ["Ownership %", d.porcentajePropiedad],
    ["Requested amount", monto],
    ["Purpose of funds", d.propositoFondos],
    ["Monthly revenue (est.)", d.ingresoMensualEstimado],
    ["Avg monthly deposits", d.depositosMensualesPromedio],
    ["Has current financing", d.tieneFinanciamientoActual],
    ["Current financing balance", d.saldoFinanciamientoActual],
    ["EIN", d.ein],
    ["Bank name", d.bancoNombre],
    ["Approx monthly deposits", d.depositosMensualesAprox],
    ["Source", d.fuente],
    ["Campaign", d.campana],
    ["UTM source", d.utmSource],
    ["UTM medium", d.utmMedium],
    ["UTM campaign", d.utmCampaign],
    ["Landing page", d.landingPage],
  ];

  const asunto = `Nueva solicitud BMF ${args.applicationId} — ${d.propietarioNombre} ${d.propietarioApellido} · ${d.empresaLegal}`;

  const texto = [
    "Nueva solicitud BMF recibida",
    "",
    ...filas.map(([k, v]) => `${k}: ${fmt(v)}`),
  ].join("\n");

  const html =
    `<h2 style="margin:0 0 4px">Nueva solicitud BMF</h2>` +
    `<p style="margin:0 0 16px;color:#555">${args.applicationId}</p>` +
    `<table style="border-collapse:collapse;font-size:14px">` +
    filas
      .map(
        ([k, v]) =>
          `<tr><td style="padding:3px 12px 3px 0;color:#888;white-space:nowrap;vertical-align:top">${k}</td>` +
          `<td style="padding:3px 0">${fmt(v)}</td></tr>`,
      )
      .join("") +
    `</table>`;

  return { asunto, html, texto };
}

export async function enviarNotificacionInterna(args: {
  solicitudId: string;
  personaId?: string | null;
  applicationId: string;
  datos: CrearSolicitudFundingInput;
}): Promise<ResultadoEnvioSolicitud> {
  const p = plantillaNotificacionInterna({ applicationId: args.applicationId, datos: args.datos });
  return enviarEmailSolicitud({
    solicitudId: args.solicitudId,
    personaId: args.personaId,
    to: BMF_NOTIFICACION_EMAIL,
    asunto: p.asunto,
    html: p.html,
    texto: p.texto,
    generadoPorIA: false,
  });
}
