import type { InferSelectModel } from "drizzle-orm";
import { bmfSolicitudes } from "../db/schema";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODELO, iaActiva } from "../lib/funding-env";

// ─── AI Funding Agent (Claude / Anthropic) ────────────────────────────────────
// Redacta emails y resume solicitudes. Reglas fijas (email-first, sin decidir crédito,
// sin promesas de aprobación) viven en el system prompt. Se invoca con fetch directo a
// la Messages API para no meter el SDK. Si falta ANTHROPIC_API_KEY queda "apagada".

export type SolicitudBMF = InferSelectModel<typeof bmfSolicitudes>;

const SISTEMA = [
  "You are the BMF Funding Agent for Business Market Finders, writing to U.S. business owners applying for funding.",
  "Rules:",
  "- Always in English, warm but concise (no fluff).",
  "- NEVER suggest or schedule a phone call. Resolve everything in writing by email. If a client explicitly asks for a call, escalate to a human instead.",
  "- You NEVER make credit decisions. You only summarize, request missing information, or relay status.",
  "- Never promise guaranteed approval.",
].join("\n");

async function completar(sistema: string, usuario: string): Promise<string | null> {
  if (!iaActiva()) return null;

  let respuesta: Response;
  try {
    respuesta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODELO,
        max_tokens: 600,
        system: sistema,
        messages: [{ role: "user", content: usuario }],
      }),
    });
  } catch (err) {
    console.error("[BMF·ia] error de red hacia Claude:", err);
    return null;
  }

  if (!respuesta.ok) {
    const err = await respuesta.text().catch(() => "");
    console.error("[BMF·ia] Claude respondió", respuesta.status, err.slice(0, 300));
    return null;
  }

  const data = (await respuesta.json()) as { content?: { type: string; text?: string }[] };
  return data.content?.find((c) => c.type === "text")?.text?.trim() || null;
}

/** Redacta el cuerpo (texto plano) de un email para una solicitud. Devuelve null si la IA está apagada. */
export async function redactarEmail(solicitud: SolicitudBMF, proposito: string): Promise<string | null> {
  const contexto =
    `Application ${solicitud.applicationId} — ${solicitud.empresaLegal ?? "business"}\n` +
    `Industry: ${solicitud.industria ?? "—"}\n` +
    `Requested: $${solicitud.montoSolicitado ?? 0}\n` +
    `Purpose: ${solicitud.propositoFondos ?? "—"}\n` +
    `Owner: ${solicitud.propietarioNombre ?? ""} ${solicitud.propietarioApellido ?? ""}\n\n` +
    `Draft an email for: ${proposito}. Return ONLY the email body (plain text), starting with "Hi [first name]".`;

  return completar(SISTEMA, contexto);
}

/** Resumen interno de underwriting. No decide crédito: solo organiza lo que se sabe. */
export async function resumenUnderwriting(solicitud: SolicitudBMF): Promise<string | null> {
  const contexto =
    "Summarize this funding application for an internal underwriting review. " +
    "Do NOT make a credit decision. List: business profile, requested amount & purpose, " +
    "revenue, existing financing, and any missing info or red flags.\n\nApplication:\n" +
    JSON.stringify(
      {
        applicationId: solicitud.applicationId,
        empresaLegal: solicitud.empresaLegal,
        industria: solicitud.industria,
        montoSolicitado: solicitud.montoSolicitado,
        propositoFondos: solicitud.propositoFondos,
        ingresoMensualEstimado: solicitud.ingresoMensualEstimado,
        depositosMensualesPromedio: solicitud.depositosMensualesPromedio,
        tieneFinanciamientoActual: solicitud.tieneFinanciamientoActual,
        saldoFinanciamientoActual: solicitud.saldoFinanciamientoActual,
        fechaInicioNegocio: solicitud.fechaInicioNegocio,
        estadoDocumentos: solicitud.estadoDocumentos,
      },
      null,
      2,
    );

  return completar(SISTEMA, contexto);
}
