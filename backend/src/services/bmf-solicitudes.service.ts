import { and, desc, eq, like } from "drizzle-orm";
import { db } from "../db/client";
import {
  bmfSolicitudes,
  bmfOfertas,
  bmfDocumentos,
  bmfMensajes,
  personas,
  usuarios,
  pipelines,
  registros,
  etapas,
} from "../db/schema";
import type { CrearSolicitudFundingInput } from "../lib/validation";
import { crearPersona } from "./personas.service";
import { crearRegistro } from "./pipelines.service";
import { registrarAuditoria } from "./auditoria.service";
import { enviarNotificacionInterna } from "./email.service";

const TAG_BMF_FUNDING = "BMF Funding";
const PIPELINE_NOMBRE = "BMF — English Funding";

// Los contactos que llegan por la landing no tienen un vendedor humano asignado todavía.
// Se les asigna como responsable un "usuario sistema": el Super Admin activo (Richard) o,
// en su defecto, el primer usuario activo. Así `personas.responsable_id` (NOT NULL) queda
// cubierto sin exponer ninguna cuenta real al flujo público.
async function usuarioSistema() {
  const [superAdmin] = await db
    .select()
    .from(usuarios)
    .where(and(eq(usuarios.rol, "SUPER_ADMIN"), eq(usuarios.activo, true)))
    .limit(1);
  if (superAdmin) return superAdmin;

  const [cualquiera] = await db.select().from(usuarios).where(eq(usuarios.activo, true)).limit(1);
  if (!cualquiera) throw new Error("No hay usuarios activos en el sistema");
  return cualquiera;
}

// `BMF-${año}-${secuencial}` — secuencial por año, calculado como el máximo existente + 1.
// En SQLite (un solo proceso, escrituras serializadas) esto es suficiente y no requiere
// una tabla de contadores.
async function siguienteApplicationId(): Promise<string> {
  const anio = new Date().getFullYear();
  const prefijo = `BMF-${anio}-`;

  const existentes = await db
    .select({ applicationId: bmfSolicitudes.applicationId })
    .from(bmfSolicitudes)
    .where(like(bmfSolicitudes.applicationId, `${prefijo}%`));

  let max = 0;
  for (const s of existentes) {
    const num = Number(s.applicationId.slice(prefijo.length));
    if (Number.isFinite(num)) max = Math.max(max, num);
  }
  return `${prefijo}${String(max + 1).padStart(6, "0")}`;
}

/**
 * Ingesta de una aplicación pública de financiamiento. Crea, en orden:
 *   1. la persona (contacto) con fuente "BMF Funding" + tag "BMF Funding",
 *   2. el registro en la etapa 01 del pipeline "BMF — English Funding",
 *   3. la fila en bmf_solicitudes con un applicationId secuencial.
 * Devuelve el applicationId para mostrar al solicitante. Email-first: NADA de este flujo
 * agrega tareas de "llamar"; la comunicación sale por email (Fase 2).
 */
export async function crearSolicitudFunding(input: CrearSolicitudFundingInput) {
  const sistema = await usuarioSistema();

  const nombre = `${input.propietarioNombre} ${input.propietarioApellido}`.trim();
  const fuente = input.fuente?.trim() || TAG_BMF_FUNDING;

  const persona = await crearPersona(
    {
      nombre,
      telefono: input.propietarioTelefono || undefined,
      email: input.propietarioEmail,
      ciudad: input.empresaCiudad,
      estado: input.empresaEstado,
      fuente,
      responsableId: sistema.id,
      tags: [TAG_BMF_FUNDING],
      negocios: [],
    },
    sistema.id,
  );
  if (!persona) throw new Error("No se pudo crear el contacto del solicitante");

  // Espejar los datos de financiamiento en la ficha del contacto, para que el equipo BMF
  // los vea desde el CRM sin abrir la solicitud.
  await db
    .update(personas)
    .set({
      empresa: input.empresaLegal,
      industria: input.industria,
      facturacionMensualEstimada: input.ingresoMensualEstimado,
      fundingSolicitado: input.montoSolicitado,
      estadoProceso: "Nueva solicitud",
    })
    .where(eq(personas.id, persona.id));

  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.nombre, PIPELINE_NOMBRE));
  if (!pipeline) throw new Error(`El pipeline "${PIPELINE_NOMBRE}" no está configurado`);

  const registro = await crearRegistro({
    pipelineId: pipeline.id,
    personaId: persona.id,
    valor: input.montoSolicitado,
    autorId: sistema.id,
  });

  const applicationId = await siguienteApplicationId();
  const id = crypto.randomUUID();
  const ahora = new Date();

  await db.insert(bmfSolicitudes).values({
    id,
    applicationId,
    personaId: persona.id,
    registroId: registro.id,
    empresaLegal: input.empresaLegal,
    dba: input.dba,
    empresaDireccion: input.empresaDireccion,
    empresaCiudad: input.empresaCiudad,
    empresaEstado: input.empresaEstado,
    empresaZip: input.empresaZip,
    industria: input.industria,
    estructuraNegocio: input.estructuraNegocio,
    fechaInicioNegocio: input.fechaInicioNegocio,
    sitioWeb: input.sitioWeb,
    propietarioNombre: input.propietarioNombre,
    propietarioApellido: input.propietarioApellido,
    propietarioEmail: input.propietarioEmail,
    propietarioTelefono: input.propietarioTelefono,
    porcentajePropiedad: input.porcentajePropiedad,
    montoSolicitado: input.montoSolicitado,
    propositoFondos: input.propositoFondos,
    ingresoMensualEstimado: input.ingresoMensualEstimado,
    depositosMensualesPromedio: input.depositosMensualesPromedio,
    tieneFinanciamientoActual: input.tieneFinanciamientoActual ?? false,
    saldoFinanciamientoActual: input.saldoFinanciamientoActual,
    ein: input.ein,
    bancoNombre: input.bancoNombre,
    depositosMensualesAprox: input.depositosMensualesAprox,
    consentimiento: true,
    consentimientoFecha: ahora,
    fuente,
    campana: input.campana,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    landingPage: input.landingPage,
    createdAt: ahora,
    updatedAt: ahora,
  });

  await registrarAuditoria({
    entidad: "bmf_solicitud",
    entidadId: id,
    accion: `Solicitud de financiamiento ${applicationId} recibida (landing pública)`,
    autorId: sistema.id,
    personaId: persona.id,
    detalle: `Monto solicitado: $${input.montoSolicitado} · Industria: ${input.industria} · Fuente: ${fuente}`,
  });

  // Aviso interno: copia de la ficha completa al email del equipo BMF. Se dispara sin
  // bloquear la respuesta; si el email está apagado (sin RESEND_API_KEY) no hace nada.
  enviarNotificacionInterna({
    solicitudId: id,
    personaId: persona.id,
    applicationId,
    datos: input,
  }).catch((err) => console.error("[BMF·notif] error enviando aviso interno:", err));

  return { applicationId, solicitudId: id, personaId: persona.id, registroId: registro.id };
}

// ─── Lecturas para el equipo interno ─────────────────────────────

export async function listarSolicitudes() {
  return db
    .select({
      id: bmfSolicitudes.id,
      applicationId: bmfSolicitudes.applicationId,
      personaId: bmfSolicitudes.personaId,
      registroId: bmfSolicitudes.registroId,
      empresaLegal: bmfSolicitudes.empresaLegal,
      industria: bmfSolicitudes.industria,
      montoSolicitado: bmfSolicitudes.montoSolicitado,
      propietarioNombre: bmfSolicitudes.propietarioNombre,
      propietarioApellido: bmfSolicitudes.propietarioApellido,
      propietarioEmail: bmfSolicitudes.propietarioEmail,
      empresaCiudad: bmfSolicitudes.empresaCiudad,
      empresaEstado: bmfSolicitudes.empresaEstado,
      estadoDocumentos: bmfSolicitudes.estadoDocumentos,
      createdAt: bmfSolicitudes.createdAt,
      personaNombre: personas.nombre,
      etapaNombre: etapas.nombre,
    })
    .from(bmfSolicitudes)
    .leftJoin(personas, eq(personas.id, bmfSolicitudes.personaId))
    .leftJoin(registros, eq(registros.id, bmfSolicitudes.registroId))
    .leftJoin(etapas, eq(etapas.id, registros.etapaId))
    .orderBy(desc(bmfSolicitudes.createdAt));
}

export async function obtenerSolicitud(id: string) {
  const [solicitud] = await db.select().from(bmfSolicitudes).where(eq(bmfSolicitudes.id, id));
  if (!solicitud) return null;

  const [persona] = await db.select().from(personas).where(eq(personas.id, solicitud.personaId));

  let etapaNombre: string | undefined;
  if (solicitud.registroId) {
    const [registro] = await db.select().from(registros).where(eq(registros.id, solicitud.registroId));
    if (registro) {
      const [etapa] = await db.select().from(etapas).where(eq(etapas.id, registro.etapaId));
      etapaNombre = etapa?.nombre;
    }
  }

  const documentos = await db.select().from(bmfDocumentos).where(eq(bmfDocumentos.solicitudId, id));
  const ofertas = await db.select().from(bmfOfertas).where(eq(bmfOfertas.solicitudId, id));
  const mensajes = await db.select().from(bmfMensajes).where(eq(bmfMensajes.solicitudId, id));

  return { ...solicitud, persona, etapaNombre, documentos, ofertas, mensajes };
}
