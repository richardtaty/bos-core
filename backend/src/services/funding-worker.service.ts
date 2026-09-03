import { eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { bmfSolicitudes, registros, etapas } from "../db/schema";
import { emailActivo } from "../lib/funding-env";
import { enviarEmailSolicitud, plantillaConfirmacion, plantillaSeguimiento } from "./email.service";
import { redactarEmail } from "./funding-agent.service";

// ─── Worker de BMF Funding ─────────────────────────────────────────────────────
// Un `setInterval` dentro del mismo proceso (un solo machine en Fly) que envía la
// confirmación de aplicación y los follow-ups 24/48/72h/5d/7d. Todo "email-first":
// nunca genera tareas de llamar. Si el email está apagado, el worker no hace nada.

const INTERVALO_MS = 60 * 1000; // revisa cada minuto

// Cadencia por número de seguimiento YA enviado (ms). Índice 0 = confirmación inmediata;
// 1..5 = los follow-ups; a partir de 6 se detiene para no insistir de por vida.
const CADENCIA_MS: Record<number, number> = {
  0: 0,
  1: 24 * 60 * 60 * 1000,
  2: 48 * 60 * 60 * 1000,
  3: 72 * 60 * 60 * 1000,
  4: 5 * 24 * 60 * 60 * 1000,
  5: 7 * 24 * 60 * 60 * 1000,
};

async function procesarSeguimientos(): Promise<void> {
  if (!emailActivo()) return;

  const filas = await db
    .select({
      id: bmfSolicitudes.id,
      applicationId: bmfSolicitudes.applicationId,
      personaId: bmfSolicitudes.personaId,
      propietarioNombre: bmfSolicitudes.propietarioNombre,
      propietarioEmail: bmfSolicitudes.propietarioEmail,
      seguimientosEnviados: bmfSolicitudes.seguimientosEnviados,
      ultimoSeguimientoEn: bmfSolicitudes.ultimoSeguimientoEn,
      etapaGanada: etapas.esGanada,
      etapaPerdida: etapas.esPerdida,
    })
    .from(bmfSolicitudes)
    .leftJoin(registros, eq(registros.id, bmfSolicitudes.registroId))
    .leftJoin(etapas, eq(etapas.id, registros.etapaId))
    .where(isNotNull(bmfSolicitudes.propietarioEmail));

  const ahora = Date.now();

  for (const s of filas) {
    if (!s.propietarioEmail) continue;
    // Cerradas (ganada/perdida) → no se les hace seguimiento automático.
    if (s.etapaGanada || s.etapaPerdida) continue;

    const n = s.seguimientosEnviados;
    const espera = CADENCIA_MS[n];
    if (espera === undefined) continue; // ya pasó el último seguimiento

    const ultimo = s.ultimoSeguimientoEn?.getTime() ?? 0;
    if (ahora - ultimo < espera) continue; // aún no toca

    const nombre = (s.propietarioNombre ?? "").trim() || "there";
    let asunto: string;
    let html: string;
    let texto: string;
    let generadoPorIA = false;

    if (n === 0) {
      const p = plantillaConfirmacion({ applicationId: s.applicationId, nombre });
      asunto = p.asunto;
      html = p.html;
      texto = p.texto;
    } else {
      // La IA redacta si está activa; si no (o si falla), se usa la plantilla fija.
      const [solicitud] = await db.select().from(bmfSolicitudes).where(eq(bmfSolicitudes.id, s.id));
      const cuerpoIA = solicitud
        ? await redactarEmail(solicitud, "a friendly follow-up checking if they need help, without scheduling a call")
        : null;

      if (cuerpoIA) {
        asunto = `Quick check-in on your application ${s.applicationId}`;
        texto = cuerpoIA;
        html = cuerpoIA.split(/\n\n+/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
        generadoPorIA = true;
      } else {
        const p = plantillaSeguimiento({ applicationId: s.applicationId, nombre });
        asunto = p.asunto;
        html = p.html;
        texto = p.texto;
      }
    }

    const resultado = await enviarEmailSolicitud({
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
      await db
        .update(bmfSolicitudes)
        .set({ seguimientosEnviados: n + 1, ultimoSeguimientoEn: new Date(), updatedAt: new Date() })
        .where(eq(bmfSolicitudes.id, s.id));
    }
  }
}

export function iniciarFundingWorker(): void {
  setInterval(() => {
    procesarSeguimientos().catch((err) => console.error("[BMF·worker] error:", err));
  }, INTERVALO_MS);

  if (emailActivo()) {
    console.log("[BMF·worker] activo — revisa confirmaciones y seguimientos cada 60s");
  } else {
    console.log("[BMF·worker] arrancado en modo apagado (sin RESEND_API_KEY): no enviará nada hasta configurar la clave.");
  }
}
