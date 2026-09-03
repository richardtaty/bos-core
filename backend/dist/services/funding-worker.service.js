"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.iniciarFundingWorker = iniciarFundingWorker;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const funding_env_1 = require("../lib/funding-env");
const email_service_1 = require("./email.service");
const funding_agent_service_1 = require("./funding-agent.service");
// ─── Worker de BMF Funding ─────────────────────────────────────────────────────
// Un `setInterval` dentro del mismo proceso (un solo machine en Fly) que envía la
// confirmación de aplicación y los follow-ups 24/48/72h/5d/7d. Todo "email-first":
// nunca genera tareas de llamar. Si el email está apagado, el worker no hace nada.
const INTERVALO_MS = 60 * 1000; // revisa cada minuto
// Cadencia por número de seguimiento YA enviado (ms). Índice 0 = confirmación inmediata;
// 1..5 = los follow-ups; a partir de 6 se detiene para no insistir de por vida.
const CADENCIA_MS = {
    0: 0,
    1: 24 * 60 * 60 * 1000,
    2: 48 * 60 * 60 * 1000,
    3: 72 * 60 * 60 * 1000,
    4: 5 * 24 * 60 * 60 * 1000,
    5: 7 * 24 * 60 * 60 * 1000,
};
async function procesarSeguimientos() {
    if (!(0, funding_env_1.emailActivo)())
        return;
    const filas = await client_1.db
        .select({
        id: schema_1.bmfSolicitudes.id,
        applicationId: schema_1.bmfSolicitudes.applicationId,
        personaId: schema_1.bmfSolicitudes.personaId,
        propietarioNombre: schema_1.bmfSolicitudes.propietarioNombre,
        propietarioEmail: schema_1.bmfSolicitudes.propietarioEmail,
        seguimientosEnviados: schema_1.bmfSolicitudes.seguimientosEnviados,
        ultimoSeguimientoEn: schema_1.bmfSolicitudes.ultimoSeguimientoEn,
        etapaGanada: schema_1.etapas.esGanada,
        etapaPerdida: schema_1.etapas.esPerdida,
    })
        .from(schema_1.bmfSolicitudes)
        .leftJoin(schema_1.registros, (0, drizzle_orm_1.eq)(schema_1.registros.id, schema_1.bmfSolicitudes.registroId))
        .leftJoin(schema_1.etapas, (0, drizzle_orm_1.eq)(schema_1.etapas.id, schema_1.registros.etapaId))
        .where((0, drizzle_orm_1.isNotNull)(schema_1.bmfSolicitudes.propietarioEmail));
    const ahora = Date.now();
    for (const s of filas) {
        if (!s.propietarioEmail)
            continue;
        // Cerradas (ganada/perdida) → no se les hace seguimiento automático.
        if (s.etapaGanada || s.etapaPerdida)
            continue;
        const n = s.seguimientosEnviados;
        const espera = CADENCIA_MS[n];
        if (espera === undefined)
            continue; // ya pasó el último seguimiento
        const ultimo = s.ultimoSeguimientoEn?.getTime() ?? 0;
        if (ahora - ultimo < espera)
            continue; // aún no toca
        const nombre = (s.propietarioNombre ?? "").trim() || "there";
        let asunto;
        let html;
        let texto;
        let generadoPorIA = false;
        if (n === 0) {
            const p = (0, email_service_1.plantillaConfirmacion)({ applicationId: s.applicationId, nombre });
            asunto = p.asunto;
            html = p.html;
            texto = p.texto;
        }
        else {
            // La IA redacta si está activa; si no (o si falla), se usa la plantilla fija.
            const [solicitud] = await client_1.db.select().from(schema_1.bmfSolicitudes).where((0, drizzle_orm_1.eq)(schema_1.bmfSolicitudes.id, s.id));
            const cuerpoIA = solicitud
                ? await (0, funding_agent_service_1.redactarEmail)(solicitud, "a friendly follow-up checking if they need help, without scheduling a call")
                : null;
            if (cuerpoIA) {
                asunto = `Quick check-in on your application ${s.applicationId}`;
                texto = cuerpoIA;
                html = cuerpoIA.split(/\n\n+/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
                generadoPorIA = true;
            }
            else {
                const p = (0, email_service_1.plantillaSeguimiento)({ applicationId: s.applicationId, nombre });
                asunto = p.asunto;
                html = p.html;
                texto = p.texto;
            }
        }
        const resultado = await (0, email_service_1.enviarEmailSolicitud)({
            solicitudId: s.id,
            personaId: s.personaId,
            to: s.propietarioEmail,
            asunto,
            html,
            texto,
            generadoPorIA,
        });
        // Solo avanzamos el contador cuando el email realmente salió. Si está apagado o
        // falló, se reintenta en el siguiente tick (así no se pierde la confirmación).
        if (resultado === "enviado") {
            await client_1.db
                .update(schema_1.bmfSolicitudes)
                .set({ seguimientosEnviados: n + 1, ultimoSeguimientoEn: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.bmfSolicitudes.id, s.id));
        }
    }
}
function iniciarFundingWorker() {
    setInterval(() => {
        procesarSeguimientos().catch((err) => console.error("[BMF·worker] error:", err));
    }, INTERVALO_MS);
    if ((0, funding_env_1.emailActivo)()) {
        console.log("[BMF·worker] activo — revisa confirmaciones y seguimientos cada 60s");
    }
    else {
        console.log("[BMF·worker] arrancado en modo apagado (sin RESEND_API_KEY): no enviará nada hasta configurar la clave.");
    }
}
