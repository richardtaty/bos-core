"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicBmfRouter = void 0;
const express_1 = require("express");
const drizzle_orm_1 = require("drizzle-orm");
const validation_1 = require("../lib/validation");
const bmf_solicitudes_service_1 = require("../services/bmf-solicitudes.service");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const funding_env_1 = require("../lib/funding-env");
// ─── Rutas públicas de BMF Funding (landing + aplicación) ─────────
// SIN `requireAuth`: es la única puerta de entrada al sistema para un solicitante
// anónimo. El resto del backend sigue igual de cerrado — este router se monta aparte.
exports.publicBmfRouter = (0, express_1.Router)();
// ─── Rate limit simple en memoria ───────────────────────────
// Ventana deslizante por IP: máx 10 solicitudes en 10 minutos. Suficiente para frenar
// spam automático contra la landing. Se limpia solo (las marcas viejas se descartan).
const ventanaMs = 10 * 60 * 1000;
// El chat de la landing también crea solicitudes desde la IP compartida del agente
// Hermes, así que subimos el tope (antes 10) para no frenar el funnel del chat.
const maxPorVentana = 30;
const _rangoPorIp = new Map();
function permitido(ip) {
    const ahora = Date.now();
    const marcas = (_rangoPorIp.get(ip) ?? []).filter((t) => ahora - t < ventanaMs);
    if (marcas.length >= maxPorVentana) {
        _rangoPorIp.set(ip, marcas);
        return false;
    }
    marcas.push(ahora);
    _rangoPorIp.set(ip, marcas);
    return true;
}
function ipDe(req) {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.length > 0)
        return fwd.split(",")[0].trim();
    return req.ip ?? "desconocida";
}
// POST /api/public/funding-aplicar
// Acepta el formulario de 6 pasos. El campo `website` es un honeypot: está oculto en la
// landing y solo un bot lo rellena — si viene con contenido, respondemos "éxito" sin
// tocar la base de datos, para no avisarle al bot que lo detectamos.
exports.publicBmfRouter.post("/funding-aplicar", async (req, res) => {
    try {
        const ip = ipDe(req);
        if (!permitido(ip)) {
            res.status(429).json({ error: "Too many requests. Please try again later." });
            return;
        }
        // Honeypot anti-spam
        if (typeof req.body?.website === "string" && req.body.website.trim().length > 0) {
            res.status(201).json({ ok: true });
            return;
        }
        const parsed = validation_1.crearSolicitudFundingSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const resultado = await (0, bmf_solicitudes_service_1.crearSolicitudFunding)(parsed.data);
        res.status(201).json(resultado);
    }
    catch (err) {
        console.error("Error creando solicitud de financiamiento:", err);
        res.status(500).json({ error: "We could not process your application. Please try again." });
    }
});
// ─── Chat de la landing (asistente BMF vía Hermes api_server) ─────────
// El widget de la landing manda el historial de mensajes y aquí se reenvía al agente
// Hermes (app Fly `bmf-hermes`). La clave API_SERVER_KEY nunca sale al navegador.
const chatVentanaMs = 10 * 60 * 1000;
const chatMaxPorVentana = 60;
const _chatPorIp = new Map();
function chatPermitido(ip) {
    const ahora = Date.now();
    const marcas = (_chatPorIp.get(ip) ?? []).filter((t) => ahora - t < chatVentanaMs);
    if (marcas.length >= chatMaxPorVentana) {
        _chatPorIp.set(ip, marcas);
        return false;
    }
    marcas.push(ahora);
    _chatPorIp.set(ip, marcas);
    return true;
}
exports.publicBmfRouter.post("/bmf-chat", async (req, res) => {
    try {
        const ip = ipDe(req);
        if (!chatPermitido(ip)) {
            res.status(429).json({ error: "Too many messages. Please try again in a few minutes." });
            return;
        }
        if (!(0, funding_env_1.bmfChatActivo)()) {
            res.status(503).json({ error: "The chat assistant is not available yet." });
            return;
        }
        const cuerpo = (req.body ?? {});
        const messages = (Array.isArray(cuerpo.messages) ? cuerpo.messages : [])
            .filter((m) => m && typeof m.content === "string" && m.content.trim().length > 0)
            .slice(-30) // evita mandar un historial infinito al agente
            .map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content.trim(),
        }));
        if (messages.length === 0) {
            res.status(400).json({ error: "No messages provided." });
            return;
        }
        const controlador = new AbortController();
        const temporizador = setTimeout(() => controlador.abort(), 120_000);
        let respuesta;
        try {
            respuesta = await fetch(`${funding_env_1.BMF_CHAT_URL}/v1/chat/completions`, {
                method: "POST",
                signal: controlador.signal,
                headers: {
                    Authorization: `Bearer ${funding_env_1.BMF_CHAT_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ model: "hermes-agent", messages, stream: false }),
            });
        }
        finally {
            clearTimeout(temporizador);
        }
        if (!respuesta.ok) {
            const texto = await respuesta.text().catch(() => "");
            console.error("[BMF·chat] Hermes respondió", respuesta.status, texto.slice(0, 300));
            res.status(502).json({ error: "The assistant could not answer right now." });
            return;
        }
        const datos = (await respuesta.json());
        const reply = datos.choices?.[0]?.message?.content?.trim() ?? "";
        res.json({ reply });
    }
    catch (err) {
        console.error("[BMF·chat] error hacia Hermes:", err);
        res.status(502).json({ error: "The assistant is unavailable right now." });
    }
});
// ─── Webhook entrante de Resend ───────────────────────────
// Cuando un solicitante responde un email, Resend reenvía el mensaje aquí. Lo colgamos a
// la solicitud por el email del remitente y lo registramos como mensaje entrante.
// (Fase 3: este es el punto donde la IA redactará y enviará la respuesta automática.)
function extraerEmail(v) {
    if (typeof v === "string") {
        const m = v.match(/<([^>]+)>/);
        const candidato = m ? m[1] : v;
        return candidato.includes("@") ? candidato.trim() : null;
    }
    if (v && typeof v === "object") {
        const obj = v;
        if (typeof obj.email === "string" && obj.email.includes("@"))
            return obj.email.trim();
    }
    return null;
}
exports.publicBmfRouter.post("/resend-inbound", async (req, res) => {
    try {
        const evento = (req.body ?? {});
        const datos = evento.data ?? req.body ?? {};
        const asunto = typeof datos.subject === "string" ? datos.subject : "(sin asunto)";
        const cuerpo = typeof datos.text === "string" ? datos.text : typeof datos.html === "string" ? datos.html : "";
        const emailRemitente = extraerEmail(datos.from);
        if (!emailRemitente) {
            res.status(200).json({ ok: true });
            return;
        }
        const [solicitud] = await client_1.db
            .select({ id: schema_1.bmfSolicitudes.id, personaId: schema_1.bmfSolicitudes.personaId })
            .from(schema_1.bmfSolicitudes)
            .where((0, drizzle_orm_1.eq)(schema_1.bmfSolicitudes.propietarioEmail, emailRemitente))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.bmfSolicitudes.createdAt))
            .limit(1);
        if (!solicitud) {
            // Respuesta de un email que no corresponde a ninguna solicitud conocida: se ignora.
            res.status(200).json({ ok: true });
            return;
        }
        await client_1.db.insert(schema_1.bmfMensajes).values({
            id: crypto.randomUUID(),
            solicitudId: solicitud.id,
            personaId: solicitud.personaId,
            direccion: "entrante",
            remitente: emailRemitente,
            destinatario: null,
            asunto,
            cuerpo,
            generadoPorIA: false,
            estado: "entregado",
            createdAt: new Date(),
        });
        res.status(200).json({ ok: true });
    }
    catch (err) {
        console.error("[BMF] error procesando webhook entrante:", err);
        res.status(500).json({ error: "No se pudo procesar el mensaje." });
    }
});
