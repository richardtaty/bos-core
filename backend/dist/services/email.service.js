"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enviarEmailSolicitud = enviarEmailSolicitud;
exports.plantillaConfirmacion = plantillaConfirmacion;
exports.plantillaSeguimiento = plantillaSeguimiento;
exports.plantillaPedidoDocumentos = plantillaPedidoDocumentos;
exports.plantillaActualizacionEstado = plantillaActualizacionEstado;
exports.plantillaOpcionesListas = plantillaOpcionesListas;
exports.plantillaFinanciado = plantillaFinanciado;
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const funding_env_1 = require("../lib/funding-env");
async function enviarEmail({ to, asunto, html, texto }) {
    const respuesta = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${funding_env_1.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: funding_env_1.EMAIL_DESDE,
            to: [to],
            subject: asunto,
            html,
            text: texto,
        }),
    });
    const data = (await respuesta.json());
    if (!respuesta.ok) {
        throw new Error(data.message ?? `Resend respondió ${respuesta.status}`);
    }
    return { id: data.id ?? "" };
}
/**
 * Envía un email y registra el mensaje en bmf_mensajes (dirección saliente).
 * Si el email está desactivado (sin RESEND_API_KEY) no hace nada — es el "modo apagado".
 */
async function enviarEmailSolicitud(args) {
    if (!(0, funding_env_1.emailActivo)()) {
        console.log("[BMF·email] desactivado (falta RESEND_API_KEY). No se envió nada.");
        return "desactivado";
    }
    try {
        const { id } = await enviarEmail({ to: args.to, asunto: args.asunto, html: args.html, texto: args.texto });
        await client_1.db.insert(schema_1.bmfMensajes).values({
            id: crypto.randomUUID(),
            solicitudId: args.solicitudId,
            personaId: args.personaId ?? null,
            direccion: "saliente",
            remitente: funding_env_1.EMAIL_DESDE,
            destinatario: args.to,
            asunto: args.asunto,
            cuerpo: args.texto,
            resendMessageId: id || null,
            generadoPorIA: args.generadoPorIA ?? false,
            estado: "enviado",
            createdAt: new Date(),
        });
        return "enviado";
    }
    catch (err) {
        console.error("[BMF·email] error enviando:", err);
        try {
            await client_1.db.insert(schema_1.bmfMensajes).values({
                id: crypto.randomUUID(),
                solicitudId: args.solicitudId,
                personaId: args.personaId ?? null,
                direccion: "saliente",
                remitente: funding_env_1.EMAIL_DESDE,
                destinatario: args.to,
                asunto: args.asunto,
                cuerpo: args.texto,
                generadoPorIA: args.generadoPorIA ?? false,
                estado: "error",
                createdAt: new Date(),
            });
        }
        catch {
            // no romper el flujo si el propio registro de error falla
        }
        return "error";
    }
}
const firma = () => "\n\n— Business Market Finders\nBusiness Funding. Without the Phone Calls.\nEmail-first: reply to this email and we'll help you in writing.";
function plantillaConfirmacion(args) {
    const asunto = `We received your application ${args.applicationId}`;
    const texto = `Hi ${args.nombre},\n\n` +
        `We received your funding application (${args.applicationId}). Our team is reviewing it now.\n\n` +
        `What happens next:\n` +
        `1. We review your business details.\n` +
        `2. We email you with any questions or documents we need.\n` +
        `3. You receive your funding options by email — no phone call required.\n\n` +
        `If we need anything, you'll hear from us here.${firma()}`;
    const html = `<p>Hi ${args.nombre},</p>` +
        `<p>We received your funding application (<strong>${args.applicationId}</strong>). Our team is reviewing it now.</p>` +
        `<ol><li>We review your business details.</li><li>We email you with any questions or documents we need.</li><li>You receive your funding options by email — no phone call required.</li></ol>` +
        `<p>If we need anything, you'll hear from us here.</p>`;
    return { asunto, html, texto };
}
function plantillaSeguimiento(args) {
    const asunto = `Quick check-in on your application ${args.applicationId}`;
    const texto = `Hi ${args.nombre},\n\n` +
        `Just checking in on your funding application (${args.applicationId}). We want to make sure nothing is holding you up.\n\n` +
        `If you have any questions or need help gathering anything, just reply to this email — no phone call needed.${firma()}`;
    const html = `<p>Hi ${args.nombre},</p>` +
        `<p>Just checking in on your funding application (<strong>${args.applicationId}</strong>). We want to make sure nothing is holding you up.</p>` +
        `<p>If you have any questions or need help gathering anything, just reply to this email — no phone call needed.</p>`;
    return { asunto, html, texto };
}
function plantillaPedidoDocumentos(args) {
    const asunto = `Documents needed for your application ${args.applicationId}`;
    const lineaEnlace = args.enlace
        ? `Upload securely here: ${args.enlace}\n\n`
        : "We'll send you a secure link in a separate email.\n\n";
    const texto = `Hi ${args.nombre},\n\n` +
        `To move your application (${args.applicationId}) forward, we need a few documents from you:\n` +
        `- Last 3 months of business bank statements\n` +
        `- Government ID (driver's license or passport)\n` +
        `- Voided check for disbursement\n\n` +
        lineaEnlace +
        `Reply to this email if you have any questions.${firma()}`;
    const html = `<p>Hi ${args.nombre},</p>` +
        `<p>To move your application (<strong>${args.applicationId}</strong>) forward, we need a few documents from you:</p>` +
        `<ul><li>Last 3 months of business bank statements</li><li>Government ID (driver's license or passport)</li><li>Voided check for disbursement</li></ul>` +
        (args.enlace ? `<p>Upload securely here: <a href="${args.enlace}">${args.enlace}</a></p>` : `<p>We'll send you a secure link in a separate email.</p>`) +
        `<p>Reply to this email if you have any questions.</p>`;
    return { asunto, html, texto };
}
function plantillaActualizacionEstado(args) {
    const asunto = `Update on your application ${args.applicationId}`;
    const texto = `Hi ${args.nombre},\n\n` +
        `Here's an update on your funding application (${args.applicationId}): ${args.estado}.\n\n` +
        `We'll email you again as soon as there's more to share.${firma()}`;
    const html = `<p>Hi ${args.nombre},</p>` +
        `<p>Here's an update on your funding application (<strong>${args.applicationId}</strong>): ${args.estado}.</p>` +
        `<p>We'll email you again as soon as there's more to share.</p>`;
    return { asunto, html, texto };
}
function plantillaOpcionesListas(args) {
    const asunto = `Your funding options are ready — ${args.applicationId}`;
    const texto = `Hi ${args.nombre},\n\n` +
        `Good news: your funding options for application ${args.applicationId} are ready. We've laid them out in writing so you can review them on your own time.\n\n` +
        `Reply to this email and we'll walk you through the details — no phone call needed.${firma()}`;
    const html = `<p>Hi ${args.nombre},</p>` +
        `<p>Good news: your funding options for application <strong>${args.applicationId}</strong> are ready. We've laid them out in writing so you can review them on your own time.</p>` +
        `<p>Reply to this email and we'll walk you through the details — no phone call needed.</p>`;
    return { asunto, html, texto };
}
function plantillaFinanciado(args) {
    const asunto = `Your funding is on its way — ${args.applicationId}`;
    const texto = `Hi ${args.nombre},\n\n` +
        `Congratulations — your funding (${args.monto}) for application ${args.applicationId} has been processed. Funds will be deposited to your account.\n\n` +
        `If anything looks off, reply here and we'll sort it out in writing.${firma()}`;
    const html = `<p>Hi ${args.nombre},</p>` +
        `<p>Congratulations — your funding (<strong>${args.monto}</strong>) for application <strong>${args.applicationId}</strong> has been processed. Funds will be deposited to your account.</p>` +
        `<p>If anything looks off, reply here and we'll sort it out in writing.</p>`;
    return { asunto, html, texto };
}
