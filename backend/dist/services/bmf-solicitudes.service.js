"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearSolicitudFunding = crearSolicitudFunding;
exports.listarSolicitudes = listarSolicitudes;
exports.obtenerSolicitud = obtenerSolicitud;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../db/client");
const schema_1 = require("../db/schema");
const personas_service_1 = require("./personas.service");
const pipelines_service_1 = require("./pipelines.service");
const auditoria_service_1 = require("./auditoria.service");
const TAG_BMF_FUNDING = "BMF Funding";
const PIPELINE_NOMBRE = "BMF — English Funding";
// Los contactos que llegan por la landing no tienen un vendedor humano asignado todavía.
// Se les asigna como responsable un "usuario sistema": el Super Admin activo (Richard) o,
// en su defecto, el primer usuario activo. Así `personas.responsable_id` (NOT NULL) queda
// cubierto sin exponer ninguna cuenta real al flujo público.
async function usuarioSistema() {
    const [superAdmin] = await client_1.db
        .select()
        .from(schema_1.usuarios)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.usuarios.rol, "SUPER_ADMIN"), (0, drizzle_orm_1.eq)(schema_1.usuarios.activo, true)))
        .limit(1);
    if (superAdmin)
        return superAdmin;
    const [cualquiera] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.activo, true)).limit(1);
    if (!cualquiera)
        throw new Error("No hay usuarios activos en el sistema");
    return cualquiera;
}
// `BMF-${año}-${secuencial}` — secuencial por año, calculado como el máximo existente + 1.
// En SQLite (un solo proceso, escrituras serializadas) esto es suficiente y no requiere
// una tabla de contadores.
async function siguienteApplicationId() {
    const anio = new Date().getFullYear();
    const prefijo = `BMF-${anio}-`;
    const existentes = await client_1.db
        .select({ applicationId: schema_1.bmfSolicitudes.applicationId })
        .from(schema_1.bmfSolicitudes)
        .where((0, drizzle_orm_1.like)(schema_1.bmfSolicitudes.applicationId, `${prefijo}%`));
    let max = 0;
    for (const s of existentes) {
        const num = Number(s.applicationId.slice(prefijo.length));
        if (Number.isFinite(num))
            max = Math.max(max, num);
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
async function crearSolicitudFunding(input) {
    const sistema = await usuarioSistema();
    const nombre = `${input.propietarioNombre} ${input.propietarioApellido}`.trim();
    const fuente = input.fuente?.trim() || TAG_BMF_FUNDING;
    const persona = await (0, personas_service_1.crearPersona)({
        nombre,
        telefono: input.propietarioTelefono || undefined,
        email: input.propietarioEmail,
        ciudad: input.empresaCiudad,
        estado: input.empresaEstado,
        fuente,
        responsableId: sistema.id,
        tags: [TAG_BMF_FUNDING],
        negocios: [],
    }, sistema.id);
    if (!persona)
        throw new Error("No se pudo crear el contacto del solicitante");
    // Espejar los datos de financiamiento en la ficha del contacto, para que el equipo BMF
    // los vea desde el CRM sin abrir la solicitud.
    await client_1.db
        .update(schema_1.personas)
        .set({
        empresa: input.empresaLegal,
        industria: input.industria,
        facturacionMensualEstimada: input.ingresoMensualEstimado,
        fundingSolicitado: input.montoSolicitado,
        estadoProceso: "Nueva solicitud",
    })
        .where((0, drizzle_orm_1.eq)(schema_1.personas.id, persona.id));
    const [pipeline] = await client_1.db.select().from(schema_1.pipelines).where((0, drizzle_orm_1.eq)(schema_1.pipelines.nombre, PIPELINE_NOMBRE));
    if (!pipeline)
        throw new Error(`El pipeline "${PIPELINE_NOMBRE}" no está configurado`);
    const registro = await (0, pipelines_service_1.crearRegistro)({
        pipelineId: pipeline.id,
        personaId: persona.id,
        valor: input.montoSolicitado,
        autorId: sistema.id,
    });
    const applicationId = await siguienteApplicationId();
    const id = crypto.randomUUID();
    const ahora = new Date();
    await client_1.db.insert(schema_1.bmfSolicitudes).values({
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
    await (0, auditoria_service_1.registrarAuditoria)({
        entidad: "bmf_solicitud",
        entidadId: id,
        accion: `Solicitud de financiamiento ${applicationId} recibida (landing pública)`,
        autorId: sistema.id,
        personaId: persona.id,
        detalle: `Monto solicitado: $${input.montoSolicitado} · Industria: ${input.industria} · Fuente: ${fuente}`,
    });
    return { applicationId, solicitudId: id, personaId: persona.id, registroId: registro.id };
}
// ─── Lecturas para el equipo interno ─────────────────────────────
async function listarSolicitudes() {
    return client_1.db
        .select({
        id: schema_1.bmfSolicitudes.id,
        applicationId: schema_1.bmfSolicitudes.applicationId,
        personaId: schema_1.bmfSolicitudes.personaId,
        registroId: schema_1.bmfSolicitudes.registroId,
        empresaLegal: schema_1.bmfSolicitudes.empresaLegal,
        industria: schema_1.bmfSolicitudes.industria,
        montoSolicitado: schema_1.bmfSolicitudes.montoSolicitado,
        propietarioNombre: schema_1.bmfSolicitudes.propietarioNombre,
        propietarioApellido: schema_1.bmfSolicitudes.propietarioApellido,
        propietarioEmail: schema_1.bmfSolicitudes.propietarioEmail,
        empresaCiudad: schema_1.bmfSolicitudes.empresaCiudad,
        empresaEstado: schema_1.bmfSolicitudes.empresaEstado,
        estadoDocumentos: schema_1.bmfSolicitudes.estadoDocumentos,
        createdAt: schema_1.bmfSolicitudes.createdAt,
        personaNombre: schema_1.personas.nombre,
        etapaNombre: schema_1.etapas.nombre,
    })
        .from(schema_1.bmfSolicitudes)
        .leftJoin(schema_1.personas, (0, drizzle_orm_1.eq)(schema_1.personas.id, schema_1.bmfSolicitudes.personaId))
        .leftJoin(schema_1.registros, (0, drizzle_orm_1.eq)(schema_1.registros.id, schema_1.bmfSolicitudes.registroId))
        .leftJoin(schema_1.etapas, (0, drizzle_orm_1.eq)(schema_1.etapas.id, schema_1.registros.etapaId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.bmfSolicitudes.createdAt));
}
async function obtenerSolicitud(id) {
    const [solicitud] = await client_1.db.select().from(schema_1.bmfSolicitudes).where((0, drizzle_orm_1.eq)(schema_1.bmfSolicitudes.id, id));
    if (!solicitud)
        return null;
    const [persona] = await client_1.db.select().from(schema_1.personas).where((0, drizzle_orm_1.eq)(schema_1.personas.id, solicitud.personaId));
    let etapaNombre;
    if (solicitud.registroId) {
        const [registro] = await client_1.db.select().from(schema_1.registros).where((0, drizzle_orm_1.eq)(schema_1.registros.id, solicitud.registroId));
        if (registro) {
            const [etapa] = await client_1.db.select().from(schema_1.etapas).where((0, drizzle_orm_1.eq)(schema_1.etapas.id, registro.etapaId));
            etapaNombre = etapa?.nombre;
        }
    }
    const documentos = await client_1.db.select().from(schema_1.bmfDocumentos).where((0, drizzle_orm_1.eq)(schema_1.bmfDocumentos.solicitudId, id));
    const ofertas = await client_1.db.select().from(schema_1.bmfOfertas).where((0, drizzle_orm_1.eq)(schema_1.bmfOfertas.solicitudId, id));
    const mensajes = await client_1.db.select().from(schema_1.bmfMensajes).where((0, drizzle_orm_1.eq)(schema_1.bmfMensajes.solicitudId, id));
    return { ...solicitud, persona, etapaNombre, documentos, ofertas, mensajes };
}
