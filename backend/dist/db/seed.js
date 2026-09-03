"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("./client");
const schema_1 = require("./schema");
// Helper: asegura que un usuario esté asignado a un departamento (idempotente).
async function asignarDepartamento(usuarioId, deptoId) {
    const existe = await client_1.db.select().from(schema_1.usuarioDepartamentos)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.usuarioDepartamentos.usuarioId, usuarioId), (0, drizzle_orm_1.eq)(schema_1.usuarioDepartamentos.departamentoId, deptoId)));
    if (existe.length === 0) {
        await client_1.db.insert(schema_1.usuarioDepartamentos).values({ usuarioId, departamentoId: deptoId });
    }
}
const PIPELINES = {
    "Préstamo para negocios": [
        { nombre: "Lead Nuevo" },
        { nombre: "Primer Contacto" },
        { nombre: "Calificación" },
        { nombre: "Aplicación Enviada" },
        { nombre: "En Revisión" },
        { nombre: "Oferta Recibida" },
        { nombre: "Negociación" },
        { nombre: "Aprobado" },
        { nombre: "Funding Enviado" },
        { nombre: "Renovación" },
        { nombre: "Ganado", esGanada: true },
        { nombre: "Perdido", esPerdida: true },
    ],
    // Unidad digital-first, email-first de Business Market Finders (inglés). Las etapas
    // ganada/perdida las maneja el motor genérico (cerrarVenta). La IA resume y organiza,
    // nunca decide crédito; los humanos aprueban ofertas.
    "BMF — English Funding": [
        { nombre: "New Application" },
        { nombre: "AI Review" },
        { nombre: "Information Needed" },
        { nombre: "Documents Requested" },
        { nombre: "Documents Partial" },
        { nombre: "Application Complete" },
        { nombre: "Underwriting Review" },
        { nombre: "Ready for Submission" },
        { nombre: "Submitted to Lenders" },
        { nombre: "Offers Received" },
        { nombre: "Offer Sent to Client" },
        { nombre: "Client Selected Offer" },
        { nombre: "Contracts / Closing" },
        { nombre: "Funding Pending" },
        { nombre: "Funded", esGanada: true },
        { nombre: "Follow-Up" },
        { nombre: "Not Qualified", esPerdida: true },
        { nombre: "Declined", esPerdida: true },
        { nombre: "Lost", esPerdida: true },
        { nombre: "Future Opportunity" },
    ],
    "Código Financiero": [
        { nombre: "Interesado" },
        { nombre: "Matriculado" },
        { nombre: "En progreso" },
        { nombre: "Completado" },
        { nombre: "Certificado", esGanada: true },
    ],
    "Tu Negocio en USA": [
        { nombre: "Nuevo" },
        { nombre: "Contactado" },
        { nombre: "Calificado" },
        { nombre: "Propuesta enviada" },
        { nombre: "Negociación" },
        { nombre: "Cerrado ganado", esGanada: true },
        { nombre: "Cerrado perdido", esPerdida: true },
    ],
    "Mentoría Estratégica": [
        { nombre: "Prospecto" },
        { nombre: "Diagnóstico agendado" },
        { nombre: "Propuesta presentada" },
        { nombre: "Contrato firmado" },
        { nombre: "Onboarding" },
        { nombre: "Activo" },
        { nombre: "Graduado", esGanada: true },
        { nombre: "Perdido", esPerdida: true },
    ],
    "Kappitalia CRM": [
        { nombre: "Trial iniciado" },
        { nombre: "Onboarding" },
        { nombre: "Activo" },
        { nombre: "En riesgo" },
        { nombre: "Renovado", esGanada: true },
        { nombre: "Cancelado", esPerdida: true },
    ],
    Libros: [
        { nombre: "Nuevo" },
        { nombre: "Contactado" },
        { nombre: "Calificado" },
        { nombre: "Propuesta enviada" },
        { nombre: "Negociación" },
        { nombre: "Cerrado ganado", esGanada: true },
        { nombre: "Cerrado perdido", esPerdida: true },
    ],
    "Crea tu libro": [
        { nombre: "Idea" },
        { nombre: "Guion" },
        { nombre: "Grabación" },
        { nombre: "Edición" },
        { nombre: "Aprobación" },
        { nombre: "Publicado", esGanada: true },
    ],
    "Eventos presenciales": [
        { nombre: "Invitado" },
        { nombre: "Registrado" },
        { nombre: "Confirmado" },
        { nombre: "Asistió", esGanada: true },
        { nombre: "No-show", esPerdida: true },
    ],
    "Eventos virtuales": [
        { nombre: "Prospectado" },
        { nombre: "Contactado" },
        { nombre: "Propuesta enviada" },
        { nombre: "Confirmado" },
        { nombre: "Contrato firmado" },
        { nombre: "Presentó", esGanada: true },
    ],
    Marketing: [
        { nombre: "Nuevo" },
        { nombre: "Contactado" },
        { nombre: "Calificado" },
        { nombre: "Propuesta enviada" },
        { nombre: "Negociación" },
        { nombre: "Cerrado ganado", esGanada: true },
        { nombre: "Cerrado perdido", esPerdida: true },
    ],
    // Flujo específico del módulo Podcast (brief del 01/ago/2026). El brief pide 9 etapas
    // lineales, pero los KPIs piden contar no-shows y ventas cerradas por separado — el motor
    // de pipelines necesita una etapa marcada esPerdida/esGanada para calcular conversión, así
    // que se agregan "No-show" (rama temprana) y se separa "Resultado" en dos etapas finales.
    Podcast: [
        { nombre: "Podcast agendado" },
        { nombre: "No-show", esPerdida: true },
        { nombre: "Podcast realizado" },
        { nombre: "Entrega de contenido" },
        { nombre: "Entrega de landing page" },
        { nombre: "Seguimiento" },
        { nombre: "Reunión del 1%" },
        { nombre: "Oferta" },
        { nombre: "Acción" },
        { nombre: "Venta cerrada", esGanada: true },
        { nombre: "No cerró", esPerdida: true },
    ],
    "Fábrica de Talentos": [
        { nombre: "Nuevo" },
        { nombre: "Contactado" },
        { nombre: "Calificado" },
        { nombre: "Propuesta enviada" },
        { nombre: "Negociación" },
        { nombre: "Cerrado ganado", esGanada: true },
        { nombre: "Cerrado perdido", esPerdida: true },
    ],
    Otro: [
        { nombre: "Saludable" },
        { nombre: "Vigilancia" },
        { nombre: "Riesgo alto" },
        { nombre: "Intervención activa" },
        { nombre: "Recuperado", esGanada: true },
        { nombre: "Perdido", esPerdida: true },
    ],
};
// Mapeo de cada pipeline a su unidad de negocio (departamento). Un pipeline sin departamento
// es visible solo para SUPER_ADMIN. Esto implementa el aislamiento entre módulos.
const PIPELINE_DEPARTAMENTO = {
    // Sala de OFERTAS — Edith: servicios que se venden
    "Tu Negocio en USA": "Sala de OFERTAS",
    "Mentoría Estratégica": "Sala de OFERTAS",
    "Código Financiero": "Sala de OFERTAS",
    "Kappitalia CRM": "Sala de OFERTAS",
    "Fábrica de Talentos": "Sala de OFERTAS",
    Libros: "Sala de OFERTAS",
    "Crea tu libro": "Sala de OFERTAS",
    "Eventos presenciales": "Sala de OFERTAS",
    "Eventos virtuales": "Sala de OFERTAS",
    Marketing: "Sala de OFERTAS",
    // Préstamos — Oriany
    "Préstamo para negocios": "Business Market Finders",
    // Funding digital (inglés) — Business Market Finders
    "BMF — English Funding": "Business Market Finders",
    // Podcast — Richard (temporal, hasta nuevo líder)
    Podcast: "Podcast",
    // "Otro" → sin depto (SUPER_ADMIN)
};
// Reconfigura las etapas del pipeline "Podcast" al flujo nuevo, PERO solo si es seguro:
// si ya existen registros (invitados) usando las etapas viejas, nunca se borra nada —
// se conserva todo y solo se agregan las etapas que falten, para no perder datos reales.
async function reconfigurarPodcastSiEsSeguro() {
    const [pipelinePodcast] = await client_1.db.select().from(schema_1.pipelines).where((0, drizzle_orm_1.eq)(schema_1.pipelines.nombre, "Podcast"));
    if (!pipelinePodcast)
        return;
    const etapasActuales = await client_1.db.select().from(schema_1.etapas).where((0, drizzle_orm_1.eq)(schema_1.etapas.pipelineId, pipelinePodcast.id));
    const nombresNuevos = new Set(PIPELINES.Podcast.map((e) => e.nombre));
    const tieneEtapasViejas = etapasActuales.some((e) => !nombresNuevos.has(e.nombre));
    if (!tieneEtapasViejas)
        return;
    const registrosExistentes = await client_1.db.select().from(schema_1.registros).where((0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, pipelinePodcast.id));
    if (registrosExistentes.length === 0) {
        await client_1.db.delete(schema_1.etapas).where((0, drizzle_orm_1.eq)(schema_1.etapas.pipelineId, pipelinePodcast.id));
        console.log("Podcast: etapas viejas reemplazadas por el flujo nuevo de 11 etapas (sin datos que perder).");
    }
    else {
        console.log(`Podcast: ya tiene ${registrosExistentes.length} registro(s) — se conservan las etapas viejas, solo se agregan las nuevas que falten.`);
    }
}
// ─── Consolidación de pipelines → 13 servicios ──────────────────────────────
// Los pipelines históricos (16 verticales) se consolidan en los 13 servicios de
// negocio. Es idempotente y NO toca IDs: renombra por nombre viejo, fusiona los
// registros de los pipelines absorbidos en su destino y elimina los que quedan
// vacíos. Así los tableros existentes (con sus registros y pagos) siguen vivos,
// solo cambian de nombre.
const SERVICIO_RENOMBRES = {
    "BMF Financiero": "Préstamo para negocios",
    Ventas: "Tu Negocio en USA",
    Mentorías: "Mentoría Estratégica",
    Kappitalia: "Kappitalia CRM",
    Eventos: "Eventos presenciales",
    Speakers: "Eventos virtuales",
    "Bases de Datos": "Marketing",
    Contenido: "Crea tu libro",
    "Customer Success": "Otro",
};
// Pipelines que se fusionan dentro de otro servicio. Se mueven sus registros al
// destino y luego se elimina el pipeline fuente (ya sin registros).
const SERVICIO_FUSIONES = {
    Partners: "BMF Financiero", // → Préstamo para negocios
    Afiliados: "Bases de Datos", // → Marketing
    Clientes: "Customer Success", // → Otro
    Onboarding: "Customer Success", // → Otro
};
async function consolidarServicios() {
    // 1) Fusionar los pipelines absorbidos dentro de sus destinos.
    for (const [desde, hacia] of Object.entries(SERVICIO_FUSIONES)) {
        const [origen] = await client_1.db.select().from(schema_1.pipelines).where((0, drizzle_orm_1.eq)(schema_1.pipelines.nombre, desde));
        const [destino] = await client_1.db.select().from(schema_1.pipelines).where((0, drizzle_orm_1.eq)(schema_1.pipelines.nombre, hacia));
        if (!origen || !destino)
            continue;
        const etapasDestino = await client_1.db.select().from(schema_1.etapas).where((0, drizzle_orm_1.eq)(schema_1.etapas.pipelineId, destino.id));
        const etapasOrigen = await client_1.db.select().from(schema_1.etapas).where((0, drizzle_orm_1.eq)(schema_1.etapas.pipelineId, origen.id));
        if (etapasDestino.length === 0)
            continue;
        const etapaDestinoPara = (origenEtapa) => {
            const ganada = etapasDestino.find((e) => e.esGanada);
            const perdida = etapasDestino.find((e) => e.esPerdida);
            if (origenEtapa.esGanada && ganada)
                return ganada.id;
            if (origenEtapa.esPerdida && perdida)
                return perdida.id;
            const porNombre = etapasDestino.find((e) => e.nombre === origenEtapa.nombre);
            if (porNombre)
                return porNombre.id;
            return etapasDestino[0].id;
        };
        const registrosOrigen = await client_1.db.select().from(schema_1.registros).where((0, drizzle_orm_1.eq)(schema_1.registros.pipelineId, origen.id));
        for (const r of registrosOrigen) {
            const etapaOrigen = etapasOrigen.find((e) => e.id === r.etapaId);
            const nuevaEtapaId = etapaOrigen ? etapaDestinoPara(etapaOrigen) : etapasDestino[0].id;
            await client_1.db.update(schema_1.registros).set({ pipelineId: destino.id, etapaId: nuevaEtapaId }).where((0, drizzle_orm_1.eq)(schema_1.registros.id, r.id));
            await client_1.db.update(schema_1.historialEtapas).set({ etapaNuevaId: nuevaEtapaId }).where((0, drizzle_orm_1.eq)(schema_1.historialEtapas.registroId, r.id));
        }
        await client_1.db.delete(schema_1.etapas).where((0, drizzle_orm_1.eq)(schema_1.etapas.pipelineId, origen.id));
        await client_1.db.delete(schema_1.pipelines).where((0, drizzle_orm_1.eq)(schema_1.pipelines.id, origen.id));
        console.log(`Servicios: pipeline "${desde}" fusionado en "${hacia}".`);
    }
    // 2) Renombrar los pipelines a sus nombres de servicio.
    for (const [viejo, nuevo] of Object.entries(SERVICIO_RENOMBRES)) {
        const [p] = await client_1.db.select().from(schema_1.pipelines).where((0, drizzle_orm_1.eq)(schema_1.pipelines.nombre, viejo));
        if (!p)
            continue;
        await client_1.db.update(schema_1.pipelines).set({ nombre: nuevo }).where((0, drizzle_orm_1.eq)(schema_1.pipelines.id, p.id));
    }
    console.log("Servicios: pipelines renombrados a los 13 servicios.");
}
// ─── Migración de nombres de negocio (servicios) legacy ─────────────────────
// Los contactos guardados antes del cambio conservan nombres viejos en la tabla
// `negocios`. Los renombramos a los 13 nombres canónicos, fusionando enlaces
// duplicados sin perder contactos.
const NEGOCIO_RENOMBRES = {
    "Business Market Finders": "Préstamo para negocios",
    "Préstamo Para Tu Negocio": "Préstamo para negocios",
    "Amazon Libros": "Libros",
    "Emprende A Otro Nivel": "Eventos presenciales",
    "Emprende a otro nivel por eventos presenciales": "Eventos presenciales",
    "IMPULSA 2026": "Eventos virtuales",
};
async function migrarNegociosLegacy() {
    for (const [viejo, nuevo] of Object.entries(NEGOCIO_RENOMBRES)) {
        const [origen] = await client_1.db.select().from(schema_1.negocios).where((0, drizzle_orm_1.eq)(schema_1.negocios.nombre, viejo));
        if (!origen)
            continue;
        const [destino] = await client_1.db.select().from(schema_1.negocios).where((0, drizzle_orm_1.eq)(schema_1.negocios.nombre, nuevo));
        if (destino) {
            const links = await client_1.db.select().from(schema_1.personaNegocios).where((0, drizzle_orm_1.eq)(schema_1.personaNegocios.negocioId, origen.id));
            for (const link of links) {
                const [yaExiste] = await client_1.db.select().from(schema_1.personaNegocios).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.personaNegocios.personaId, link.personaId), (0, drizzle_orm_1.eq)(schema_1.personaNegocios.negocioId, destino.id)));
                if (yaExiste) {
                    await client_1.db.delete(schema_1.personaNegocios).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.personaNegocios.personaId, link.personaId), (0, drizzle_orm_1.eq)(schema_1.personaNegocios.negocioId, origen.id)));
                }
                else {
                    await client_1.db.update(schema_1.personaNegocios).set({ negocioId: destino.id }).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.personaNegocios.personaId, link.personaId), (0, drizzle_orm_1.eq)(schema_1.personaNegocios.negocioId, origen.id)));
                }
            }
            await client_1.db.delete(schema_1.negocios).where((0, drizzle_orm_1.eq)(schema_1.negocios.id, origen.id));
        }
        else {
            await client_1.db.update(schema_1.negocios).set({ nombre: nuevo }).where((0, drizzle_orm_1.eq)(schema_1.negocios.id, origen.id));
        }
    }
    console.log("Negocios: nombres legacy renombrados a los 13 servicios.");
}
const OFERTA_RENOMBRES = {
    "IMPULSA 2026": "Eventos virtuales",
    Libro: "Libros",
    "Bases de Datos": "Marketing",
};
async function migrarOfertasLegacy() {
    for (const [viejo, nuevo] of Object.entries(OFERTA_RENOMBRES)) {
        const [origen] = await client_1.db.select().from(schema_1.ofertas).where((0, drizzle_orm_1.eq)(schema_1.ofertas.nombre, viejo));
        if (!origen)
            continue;
        const [destino] = await client_1.db.select().from(schema_1.ofertas).where((0, drizzle_orm_1.eq)(schema_1.ofertas.nombre, nuevo));
        if (destino) {
            await client_1.db.update(schema_1.ventasIngresos).set({ ofertaId: destino.id }).where((0, drizzle_orm_1.eq)(schema_1.ventasIngresos.ofertaId, origen.id));
            await client_1.db.update(schema_1.egresos).set({ ofertaId: destino.id }).where((0, drizzle_orm_1.eq)(schema_1.egresos.ofertaId, origen.id));
            await client_1.db.delete(schema_1.ofertas).where((0, drizzle_orm_1.eq)(schema_1.ofertas.id, origen.id));
        }
        else {
            await client_1.db.update(schema_1.ofertas).set({ nombre: nuevo }).where((0, drizzle_orm_1.eq)(schema_1.ofertas.id, origen.id));
        }
    }
    console.log("Motor de Ingresos: líneas de negocio legacy renombradas a los 13 servicios.");
}
async function main() {
    const passwordHash = await bcryptjs_1.default.hash("changeme123", 10);
    const [existenteAdmin] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.email, "richard@tatysenterprises.com"));
    let adminId;
    if (!existenteAdmin) {
        adminId = crypto.randomUUID();
        await client_1.db.insert(schema_1.usuarios).values({
            id: adminId,
            nombre: "Richard Taty",
            email: "richard@tatysenterprises.com",
            passwordHash,
            rol: "SUPER_ADMIN",
            activo: true,
            createdAt: new Date(),
        });
    }
    else {
        adminId = existenteAdmin.id;
    }
    // ─── Crear departamento de Marketing si no existe ────────
    const [deptoMarketing] = await client_1.db.select().from(schema_1.departamentos).where((0, drizzle_orm_1.eq)(schema_1.departamentos.nombre, "Marketing"));
    let deptoId;
    if (!deptoMarketing) {
        deptoId = crypto.randomUUID();
        await client_1.db.insert(schema_1.departamentos).values({
            id: deptoId,
            nombre: "Marketing",
            descripcion: "Departamento de Marketing — contenido, campañas, redes sociales, landing pages y podcast",
            activo: true,
            createdAt: new Date(),
        });
        console.log("  Departamento Marketing creado");
    }
    else {
        deptoId = deptoMarketing.id;
    }
    // ─── Sala de OFERTAS (Ventas) ──────────────────────────
    const [deptoVentas] = await client_1.db.select().from(schema_1.departamentos).where((0, drizzle_orm_1.eq)(schema_1.departamentos.nombre, "Sala de OFERTAS"));
    let ventasDeptoId;
    if (!deptoVentas) {
        ventasDeptoId = crypto.randomUUID();
        await client_1.db.insert(schema_1.departamentos).values({
            id: ventasDeptoId,
            nombre: "Sala de OFERTAS",
            descripcion: "Departamento de Ventas — ofertas, negociaciones, cierres y seguimiento comercial",
            activo: true,
            createdAt: new Date(),
        });
        console.log("  Departamento Sala de OFERTAS creado");
    }
    else {
        ventasDeptoId = deptoVentas.id;
    }
    // ─── Business Market Finders (BMF) ────────────────────
    const [deptoBmf] = await client_1.db.select().from(schema_1.departamentos).where((0, drizzle_orm_1.eq)(schema_1.departamentos.nombre, "Business Market Finders"));
    let bmfDeptoId;
    if (!deptoBmf) {
        bmfDeptoId = crypto.randomUUID();
        await client_1.db.insert(schema_1.departamentos).values({
            id: bmfDeptoId,
            nombre: "Business Market Finders",
            descripcion: "Departamento de Business Market Finders — financiamiento corporativo, funding y operaciones financieras",
            activo: true,
            createdAt: new Date(),
        });
        console.log("  Departamento Business Market Finders creado");
    }
    else {
        bmfDeptoId = deptoBmf.id;
    }
    // ─── Podcast ──────────────────────────────────────────
    const [deptoPodcast] = await client_1.db.select().from(schema_1.departamentos).where((0, drizzle_orm_1.eq)(schema_1.departamentos.nombre, "Podcast"));
    let podcastDeptoId;
    if (!deptoPodcast) {
        podcastDeptoId = crypto.randomUUID();
        await client_1.db.insert(schema_1.departamentos).values({
            id: podcastDeptoId,
            nombre: "Podcast",
            descripcion: "Departamento de Podcast — grabación, edición, publicación y distribución de episodios",
            activo: true,
            createdAt: new Date(),
        });
        console.log("  Departamento Podcast creado");
    }
    else {
        podcastDeptoId = deptoPodcast.id;
    }
    // ─── Áreas con tablero Scrum propio ───────────────────
    // "Ventas" convive a propósito con "Sala de OFERTAS": son áreas distintas en
    // el sistema. Sin usuarios asignados todavía — por ahora solo el Super Admin
    // ve sus tableros. Los nombres deben coincidir exactamente con los valores de
    // DEPARTAMENTOS en TareaForm.tsx / TareaDetalleModal.tsx, porque el campo
    // `departamento` de cada tarea guarda el nombre como texto.
    for (const { nombre, descripcion } of [
        { nombre: "Ventas", descripcion: "Área de Ventas — tablero Scrum propio" },
        { nombre: "Operaciones", descripcion: "Área de Operaciones — tablero Scrum propio" },
    ]) {
        const [existente] = await client_1.db.select().from(schema_1.departamentos).where((0, drizzle_orm_1.eq)(schema_1.departamentos.nombre, nombre));
        if (!existente) {
            await client_1.db.insert(schema_1.departamentos).values({
                id: crypto.randomUUID(),
                nombre,
                descripcion,
                activo: true,
                createdAt: new Date(),
            });
            console.log(`  Departamento ${nombre} creado`);
        }
    }
    // Richard es SUPER_ADMIN — no se le asigna departamento para que vea todo.
    // El departamento Podcast existe sin líder asignado por ahora.
    // Crear a Giannella como líder de Marketing si no existe
    const [existenteGiannella] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.email, "quinterogiannella@gmail.com"));
    let giannellaId;
    if (!existenteGiannella) {
        giannellaId = crypto.randomUUID();
        await client_1.db.insert(schema_1.usuarios).values({
            id: giannellaId,
            nombre: "Giannella Quintero",
            email: "quinterogiannella@gmail.com",
            passwordHash,
            rol: "ADMIN",
            cargo: "Director de Marketing",
            supervisorId: adminId,
            activo: true,
            createdAt: new Date(),
        });
        console.log("  Giannella Quintero creada como Director de Marketing");
    }
    else {
        giannellaId = existenteGiannella.id;
        if (existenteGiannella.cargo !== "Director de Marketing" || existenteGiannella.supervisorId !== adminId) {
            await client_1.db.update(schema_1.usuarios).set({
                cargo: "Director de Marketing",
                supervisorId: adminId,
            }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, giannellaId));
        }
    }
    // Asignar a Giannella al departamento de Marketing (idempotente)
    await asignarDepartamento(giannellaId, deptoId);
    await reconfigurarPodcastSiEsSeguro();
    await consolidarServicios();
    await migrarNegociosLegacy();
    await migrarOfertasLegacy();
    // Resolver IDs de departamentos para el mapeo pipeline → unidad de negocio
    const deptos = await client_1.db.select().from(schema_1.departamentos);
    const deptoNombreId = new Map(deptos.map((d) => [d.nombre, d.id]));
    for (const [pipelineNombre, etapasDef] of Object.entries(PIPELINES)) {
        let [pipeline] = await client_1.db.select().from(schema_1.pipelines).where((0, drizzle_orm_1.eq)(schema_1.pipelines.nombre, pipelineNombre));
        const deptoNombre = PIPELINE_DEPARTAMENTO[pipelineNombre];
        const departamentoId = deptoNombre ? deptoNombreId.get(deptoNombre) ?? null : null;
        if (!pipeline) {
            const id = crypto.randomUUID();
            await client_1.db.insert(schema_1.pipelines).values({ id, nombre: pipelineNombre, activo: true, departamentoId });
            pipeline = { id, nombre: pipelineNombre, activo: true, departamentoId };
        }
        else if (pipeline.departamentoId !== departamentoId) {
            // Actualizar pipelines cuyo departamento cambió (re-mapeo) o no estaba asignado
            await client_1.db.update(schema_1.pipelines).set({ departamentoId }).where((0, drizzle_orm_1.eq)(schema_1.pipelines.id, pipeline.id));
        }
        const existentes = await client_1.db.select().from(schema_1.etapas).where((0, drizzle_orm_1.eq)(schema_1.etapas.pipelineId, pipeline.id));
        for (let i = 0; i < etapasDef.length; i++) {
            const e = etapasDef[i];
            if (!existentes.find((x) => x.nombre === e.nombre)) {
                await client_1.db.insert(schema_1.etapas).values({
                    id: crypto.randomUUID(),
                    pipelineId: pipeline.id,
                    nombre: e.nombre,
                    orden: i,
                    esGanada: e.esGanada ?? false,
                    esPerdida: e.esPerdida ?? false,
                });
            }
        }
    }
    // ─── Crear equipo de Marketing si no existe ──────────────
    const [equipoMarketing] = await client_1.db.select().from(schema_1.equipos).where((0, drizzle_orm_1.eq)(schema_1.equipos.nombre, "Equipo Marketing"));
    let equipoMktId;
    if (!equipoMarketing) {
        equipoMktId = crypto.randomUUID();
        const supervisorId = giannellaId ?? adminId;
        await client_1.db.insert(schema_1.equipos).values({
            id: equipoMktId,
            nombre: "Equipo Marketing",
            departamentoId: deptoId,
            supervisorId,
            createdAt: new Date(),
        });
        console.log(`  Equipo Marketing creado (supervisor: ${giannellaId ? "Giannella Quintero" : "Richard Taty"})`);
    }
    else {
        equipoMktId = equipoMarketing.id;
    }
    // Agregar a Giannella como miembro del equipo
    const [yaEsMiembro] = await client_1.db.select().from(schema_1.equipoMiembros).where((0, drizzle_orm_1.eq)(schema_1.equipoMiembros.usuarioId, giannellaId));
    if (!yaEsMiembro) {
        await client_1.db.insert(schema_1.equipoMiembros).values({
            equipoId: equipoMktId,
            usuarioId: giannellaId,
            cargo: "Director de Marketing",
        });
        console.log("  Giannella agregada al Equipo Marketing");
    }
    // Edith como líder de Ventas (usar la cuenta activa)
    const [edith] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.email, "edithfernandezmedia@gmail.com"));
    if (edith) {
        if (edith.cargo !== "Director de Ventas") {
            await client_1.db.update(schema_1.usuarios).set({
                cargo: "Director de Ventas",
                supervisorId: adminId,
            }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, edith.id));
        }
        await asignarDepartamento(edith.id, ventasDeptoId);
        // Activar cuenta si está inactiva
        if (!edith.activo) {
            await client_1.db.update(schema_1.usuarios).set({ activo: true }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, edith.id));
        }
        // Equipo de Ventas
        const [equipoVentas] = await client_1.db.select().from(schema_1.equipos).where((0, drizzle_orm_1.eq)(schema_1.equipos.nombre, "Equipo Ventas"));
        let equipoVentasId;
        if (!equipoVentas) {
            equipoVentasId = crypto.randomUUID();
            await client_1.db.insert(schema_1.equipos).values({
                id: equipoVentasId,
                nombre: "Equipo Ventas",
                departamentoId: ventasDeptoId,
                supervisorId: edith.id,
                createdAt: new Date(),
            });
            console.log("  Equipo Ventas creado (supervisor: Edith Fernandez)");
        }
        else {
            equipoVentasId = equipoVentas.id;
        }
        // Agregar a Edith al equipo
        const [yaEsMiembroVentas] = await client_1.db.select().from(schema_1.equipoMiembros).where((0, drizzle_orm_1.eq)(schema_1.equipoMiembros.usuarioId, edith.id));
        if (!yaEsMiembroVentas) {
            await client_1.db.insert(schema_1.equipoMiembros).values({
                equipoId: equipoVentasId,
                usuarioId: edith.id,
                cargo: "Director de Ventas",
            });
            console.log("  Edith agregada al Equipo Ventas");
        }
    }
    // Crear a Oriany Herrera como Directora de Administración.
    // Buscar por el nuevo email primero; si existe con el email viejo, migrarlo.
    const [existenteOriany] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.email, "oriany@orianyherrera.com"));
    const [viejoOriany] = await client_1.db.select().from(schema_1.usuarios).where((0, drizzle_orm_1.eq)(schema_1.usuarios.email, "orioannyherrera@gmail.com"));
    let orianyId;
    if (existenteOriany) {
        orianyId = existenteOriany.id;
        if (existenteOriany.cargo !== "Director de Administración") {
            await client_1.db.update(schema_1.usuarios).set({
                cargo: "Director de Administración",
                supervisorId: adminId,
            }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, orianyId));
        }
        await asignarDepartamento(orianyId, bmfDeptoId);
        if (!existenteOriany.activo) {
            await client_1.db.update(schema_1.usuarios).set({ activo: true }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, orianyId));
        }
    }
    else if (viejoOriany) {
        // Migrar del email viejo al nuevo
        orianyId = viejoOriany.id;
        await client_1.db.update(schema_1.usuarios).set({
            email: "oriany@orianyherrera.com",
            departamentoId: bmfDeptoId,
            cargo: viejoOriany.cargo ?? "Director de Administración",
            supervisorId: viejoOriany.supervisorId ?? adminId,
            activo: true,
        }).where((0, drizzle_orm_1.eq)(schema_1.usuarios.id, orianyId));
        console.log("  Oriany Herrera: email migrado a oriany@orianyherrera.com");
    }
    else {
        orianyId = crypto.randomUUID();
        await client_1.db.insert(schema_1.usuarios).values({
            id: orianyId,
            nombre: "Oriany Herrera",
            email: "oriany@orianyherrera.com",
            passwordHash,
            rol: "ADMIN",
            cargo: "Director de Administración",
            supervisorId: adminId,
            activo: true,
            createdAt: new Date(),
        });
        console.log("  Oriany Herrera creada como Director de Administración (BMF)");
    }
    // Equipo Financial Operations
    const [equipoBmf] = await client_1.db.select().from(schema_1.equipos).where((0, drizzle_orm_1.eq)(schema_1.equipos.nombre, "Financial Operations"));
    let equipoBmfId;
    if (!equipoBmf) {
        equipoBmfId = crypto.randomUUID();
        await client_1.db.insert(schema_1.equipos).values({
            id: equipoBmfId,
            nombre: "Financial Operations",
            departamentoId: bmfDeptoId,
            supervisorId: orianyId,
            createdAt: new Date(),
        });
        console.log("  Equipo Financial Operations creado (supervisor: Oriany Herrera)");
    }
    else {
        equipoBmfId = equipoBmf.id;
    }
    // Agregar a Oriany como miembro del equipo
    const [oriEnEquipo] = await client_1.db.select().from(schema_1.equipoMiembros).where((0, drizzle_orm_1.eq)(schema_1.equipoMiembros.usuarioId, orianyId));
    if (!oriEnEquipo) {
        await client_1.db.insert(schema_1.equipoMiembros).values({
            equipoId: equipoBmfId,
            usuarioId: orianyId,
            cargo: "Director de Administración",
        });
        console.log("  Oriany agregada al equipo Financial Operations");
    }
    // ─── Motor de Ingresos: 10 líneas de negocio ───
    const OFERTAS = [
        { nombre: "MCA Lending", categoria: "Ancla", target: 30000, ticket: 15000 },
        { nombre: "Código Financiero", categoria: "Recurrente", target: 8000, ticket: 4000 },
        { nombre: "Mentoría Estratégica", categoria: "Recurrente", target: 10000, ticket: 5000 },
        { nombre: "Tu Negocio en USA", categoria: "Volumen medio", target: 5000, ticket: 2000 },
        { nombre: "Kappitalia CRM", categoria: "Volumen alto", target: 3000, ticket: 500 },
        { nombre: "Marketing", categoria: "Recurrente", target: 3000, ticket: 1500 },
        { nombre: "Nómina de Marketing", categoria: "Recurrente", target: 3000, ticket: 1500 },
        { nombre: "Podcast", categoria: "Evento", target: 2000, ticket: 500 },
        { nombre: "Eventos virtuales", categoria: "Evento", target: 50000, ticket: 250 },
        { nombre: "Libros", categoria: "Volumen medio", target: 1000, ticket: 20 },
    ];
    const ofertasExistentes = await client_1.db.select().from(schema_1.ofertas);
    for (const o of OFERTAS) {
        if (!ofertasExistentes.find(e => e.nombre === o.nombre)) {
            await client_1.db.insert(schema_1.ofertas).values({
                id: crypto.randomUUID(),
                nombre: o.nombre,
                categoria: o.categoria,
                target: o.target,
                ticket: o.ticket,
            });
        }
    }
    console.log(`  ${OFERTAS.length} ofertas del Motor de Ingresos configuradas.`);
    // ─── Podcast Performance: metas configurables (valores iniciales) ───
    // Se siembran una sola vez; después el Super Admin las edita desde la UI.
    const METAS_PODCAST = [
        { clave: "prospectos_encontrados", nombre: "Prospectos encontrados (día)", valor: 50 },
        { clave: "prospectos_contactados", nombre: "Prospectos contactados (día)", valor: 50 },
        { clave: "podcasts_agendados", nombre: "Podcasts agendados (día)", valor: 3 },
        { clave: "followups_ratio", nombre: "Follow-ups completados (%)", valor: 100 },
    ];
    const metasExistentes = await client_1.db.select().from(schema_1.podcastMetas);
    for (const m of METAS_PODCAST) {
        if (!metasExistentes.find(e => e.clave === m.clave)) {
            await client_1.db.insert(schema_1.podcastMetas).values({
                id: crypto.randomUUID(),
                clave: m.clave,
                nombre: m.nombre,
                valor: m.valor,
                updatedAt: new Date(),
            });
        }
    }
    console.log(`  ${METAS_PODCAST.length} metas de Podcast Performance configuradas.`);
    console.log("Seed completo:");
    console.log("  Super Admin: richard@tatysenterprises.com / changeme123");
    console.log(`  Pipelines configurados: ${Object.keys(PIPELINES).join(", ")}`);
    console.log("  Departamento Marketing + Sala de OFERTAS + Business Market Finders listos");
}
main();
