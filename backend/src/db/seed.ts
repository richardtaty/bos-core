import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { usuarios, pipelines, etapas, registros, historialEtapas, departamentos, equipos, equipoMiembros, usuarioDepartamentos, ofertas, ventasIngresos, egresos, podcastMetas, negocios, personaNegocios } from "./schema";

// Helper: asegura que un usuario esté asignado a un departamento (idempotente).
async function asignarDepartamento(usuarioId: string, deptoId: string) {
  const existe = await db.select().from(usuarioDepartamentos)
    .where(and(eq(usuarioDepartamentos.usuarioId, usuarioId), eq(usuarioDepartamentos.departamentoId, deptoId)));
  if (existe.length === 0) {
    await db.insert(usuarioDepartamentos).values({ usuarioId, departamentoId: deptoId });
  }
}

const PIPELINES: Record<string, { nombre: string; esGanada?: boolean; esPerdida?: boolean }[]> = {
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
const PIPELINE_DEPARTAMENTO: Record<string, string> = {
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
  const [pipelinePodcast] = await db.select().from(pipelines).where(eq(pipelines.nombre, "Podcast"));
  if (!pipelinePodcast) return;

  const etapasActuales = await db.select().from(etapas).where(eq(etapas.pipelineId, pipelinePodcast.id));
  const nombresNuevos = new Set(PIPELINES.Podcast.map((e) => e.nombre));
  const tieneEtapasViejas = etapasActuales.some((e) => !nombresNuevos.has(e.nombre));
  if (!tieneEtapasViejas) return;

  const registrosExistentes = await db.select().from(registros).where(eq(registros.pipelineId, pipelinePodcast.id));

  if (registrosExistentes.length === 0) {
    await db.delete(etapas).where(eq(etapas.pipelineId, pipelinePodcast.id));
    console.log("Podcast: etapas viejas reemplazadas por el flujo nuevo de 11 etapas (sin datos que perder).");
  } else {
    console.log(`Podcast: ya tiene ${registrosExistentes.length} registro(s) — se conservan las etapas viejas, solo se agregan las nuevas que falten.`);
  }
}

// ─── Consolidación de pipelines → 13 servicios ──────────────────────────────
// Los pipelines históricos (16 verticales) se consolidan en los 13 servicios de
// negocio. Es idempotente y NO toca IDs: renombra por nombre viejo, fusiona los
// registros de los pipelines absorbidos en su destino y elimina los que quedan
// vacíos. Así los tableros existentes (con sus registros y pagos) siguen vivos,
// solo cambian de nombre.
const SERVICIO_RENOMBRES: Record<string, string> = {
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
const SERVICIO_FUSIONES: Record<string, string> = {
  Partners: "BMF Financiero", // → Préstamo para negocios
  Afiliados: "Bases de Datos", // → Marketing
  Clientes: "Customer Success", // → Otro
  Onboarding: "Customer Success", // → Otro
};

async function consolidarServicios() {
  // 1) Fusionar los pipelines absorbidos dentro de sus destinos.
  for (const [desde, hacia] of Object.entries(SERVICIO_FUSIONES)) {
    const [origen] = await db.select().from(pipelines).where(eq(pipelines.nombre, desde));
    const [destino] = await db.select().from(pipelines).where(eq(pipelines.nombre, hacia));
    if (!origen || !destino) continue;

    const etapasDestino = await db.select().from(etapas).where(eq(etapas.pipelineId, destino.id));
    const etapasOrigen = await db.select().from(etapas).where(eq(etapas.pipelineId, origen.id));
    if (etapasDestino.length === 0) continue;

    const etapaDestinoPara = (origenEtapa: (typeof etapasOrigen)[number]) => {
      const ganada = etapasDestino.find((e) => e.esGanada);
      const perdida = etapasDestino.find((e) => e.esPerdida);
      if (origenEtapa.esGanada && ganada) return ganada.id;
      if (origenEtapa.esPerdida && perdida) return perdida.id;
      const porNombre = etapasDestino.find((e) => e.nombre === origenEtapa.nombre);
      if (porNombre) return porNombre.id;
      return etapasDestino[0].id;
    };

    const registrosOrigen = await db.select().from(registros).where(eq(registros.pipelineId, origen.id));
    for (const r of registrosOrigen) {
      const etapaOrigen = etapasOrigen.find((e) => e.id === r.etapaId);
      const nuevaEtapaId = etapaOrigen ? etapaDestinoPara(etapaOrigen) : etapasDestino[0].id;
      await db.update(registros).set({ pipelineId: destino.id, etapaId: nuevaEtapaId }).where(eq(registros.id, r.id));
      await db.update(historialEtapas).set({ etapaNuevaId: nuevaEtapaId }).where(eq(historialEtapas.registroId, r.id));
    }

    await db.delete(etapas).where(eq(etapas.pipelineId, origen.id));
    await db.delete(pipelines).where(eq(pipelines.id, origen.id));
    console.log(`Servicios: pipeline "${desde}" fusionado en "${hacia}".`);
  }

  // 2) Renombrar los pipelines a sus nombres de servicio.
  for (const [viejo, nuevo] of Object.entries(SERVICIO_RENOMBRES)) {
    const [p] = await db.select().from(pipelines).where(eq(pipelines.nombre, viejo));
    if (!p) continue;
    await db.update(pipelines).set({ nombre: nuevo }).where(eq(pipelines.id, p.id));
  }
  console.log("Servicios: pipelines renombrados a los 13 servicios.");
}

// ─── Migración de nombres de negocio (servicios) legacy ─────────────────────
// Los contactos guardados antes del cambio conservan nombres viejos en la tabla
// `negocios`. Los renombramos a los 13 nombres canónicos, fusionando enlaces
// duplicados sin perder contactos.
const NEGOCIO_RENOMBRES: Record<string, string> = {
  "Business Market Finders": "Préstamo para negocios",
  "Préstamo Para Tu Negocio": "Préstamo para negocios",
  "Amazon Libros": "Libros",
  "Emprende A Otro Nivel": "Eventos presenciales",
  "Emprende a otro nivel por eventos presenciales": "Eventos presenciales",
  "IMPULSA 2026": "Eventos virtuales",
};

async function migrarNegociosLegacy() {
  for (const [viejo, nuevo] of Object.entries(NEGOCIO_RENOMBRES)) {
    const [origen] = await db.select().from(negocios).where(eq(negocios.nombre, viejo));
    if (!origen) continue;
    const [destino] = await db.select().from(negocios).where(eq(negocios.nombre, nuevo));

    if (destino) {
      const links = await db.select().from(personaNegocios).where(eq(personaNegocios.negocioId, origen.id));
      for (const link of links) {
        const [yaExiste] = await db.select().from(personaNegocios).where(
          and(eq(personaNegocios.personaId, link.personaId), eq(personaNegocios.negocioId, destino.id))
        );
        if (yaExiste) {
          await db.delete(personaNegocios).where(
            and(eq(personaNegocios.personaId, link.personaId), eq(personaNegocios.negocioId, origen.id))
          );
        } else {
          await db.update(personaNegocios).set({ negocioId: destino.id }).where(
            and(eq(personaNegocios.personaId, link.personaId), eq(personaNegocios.negocioId, origen.id))
          );
        }
      }
      await db.delete(negocios).where(eq(negocios.id, origen.id));
    } else {
      await db.update(negocios).set({ nombre: nuevo }).where(eq(negocios.id, origen.id));
    }
  }
  console.log("Negocios: nombres legacy renombrados a los 13 servicios.");
}

const OFERTA_RENOMBRES: Record<string, string> = {
  "IMPULSA 2026": "Eventos virtuales",
  Libro: "Libros",
  "Bases de Datos": "Marketing",
};

async function migrarOfertasLegacy() {
  for (const [viejo, nuevo] of Object.entries(OFERTA_RENOMBRES)) {
    const [origen] = await db.select().from(ofertas).where(eq(ofertas.nombre, viejo));
    if (!origen) continue;
    const [destino] = await db.select().from(ofertas).where(eq(ofertas.nombre, nuevo));

    if (destino) {
      await db.update(ventasIngresos).set({ ofertaId: destino.id }).where(eq(ventasIngresos.ofertaId, origen.id));
      await db.update(egresos).set({ ofertaId: destino.id }).where(eq(egresos.ofertaId, origen.id));
      await db.delete(ofertas).where(eq(ofertas.id, origen.id));
    } else {
      await db.update(ofertas).set({ nombre: nuevo }).where(eq(ofertas.id, origen.id));
    }
  }
  console.log("Motor de Ingresos: líneas de negocio legacy renombradas a los 13 servicios.");
}

async function main() {
  const passwordHash = await bcrypt.hash("changeme123", 10);

  const [existenteAdmin] = await db.select().from(usuarios).where(eq(usuarios.email, "richard@tatysenterprises.com"));
  let adminId: string;
  if (!existenteAdmin) {
    adminId = crypto.randomUUID();
    await db.insert(usuarios).values({
      id: adminId,
      nombre: "Richard Taty",
      email: "richard@tatysenterprises.com",
      passwordHash,
      rol: "SUPER_ADMIN",
      activo: true,
      createdAt: new Date(),
    });
  } else {
    adminId = existenteAdmin.id;
  }

  // ─── Crear departamento de Marketing si no existe ────────
  const [deptoMarketing] = await db.select().from(departamentos).where(eq(departamentos.nombre, "Marketing"));
  let deptoId: string;
  if (!deptoMarketing) {
    deptoId = crypto.randomUUID();
    await db.insert(departamentos).values({
      id: deptoId,
      nombre: "Marketing",
      descripcion: "Departamento de Marketing — contenido, campañas, redes sociales, landing pages y podcast",
      activo: true,
      createdAt: new Date(),
    });
    console.log("  Departamento Marketing creado");
  } else {
    deptoId = deptoMarketing.id;
  }

  // ─── Sala de OFERTAS (Ventas) ──────────────────────────
  const [deptoVentas] = await db.select().from(departamentos).where(eq(departamentos.nombre, "Sala de OFERTAS"));
  let ventasDeptoId: string;
  if (!deptoVentas) {
    ventasDeptoId = crypto.randomUUID();
    await db.insert(departamentos).values({
      id: ventasDeptoId,
      nombre: "Sala de OFERTAS",
      descripcion: "Departamento de Ventas — ofertas, negociaciones, cierres y seguimiento comercial",
      activo: true,
      createdAt: new Date(),
    });
    console.log("  Departamento Sala de OFERTAS creado");
  } else {
    ventasDeptoId = deptoVentas.id;
  }

  // ─── Business Market Finders (BMF) ────────────────────
  const [deptoBmf] = await db.select().from(departamentos).where(eq(departamentos.nombre, "Business Market Finders"));
  let bmfDeptoId: string;
  if (!deptoBmf) {
    bmfDeptoId = crypto.randomUUID();
    await db.insert(departamentos).values({
      id: bmfDeptoId,
      nombre: "Business Market Finders",
      descripcion: "Departamento de Business Market Finders — financiamiento corporativo, funding y operaciones financieras",
      activo: true,
      createdAt: new Date(),
    });
    console.log("  Departamento Business Market Finders creado");
  } else {
    bmfDeptoId = deptoBmf.id;
  }

  // ─── Podcast ──────────────────────────────────────────
  const [deptoPodcast] = await db.select().from(departamentos).where(eq(departamentos.nombre, "Podcast"));
  let podcastDeptoId: string;
  if (!deptoPodcast) {
    podcastDeptoId = crypto.randomUUID();
    await db.insert(departamentos).values({
      id: podcastDeptoId,
      nombre: "Podcast",
      descripcion: "Departamento de Podcast — grabación, edición, publicación y distribución de episodios",
      activo: true,
      createdAt: new Date(),
    });
    console.log("  Departamento Podcast creado");
  } else {
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
    const [existente] = await db.select().from(departamentos).where(eq(departamentos.nombre, nombre));
    if (!existente) {
      await db.insert(departamentos).values({
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
  const [existenteGiannella] = await db.select().from(usuarios).where(eq(usuarios.email, "quinterogiannella@gmail.com"));
  let giannellaId: string;
  if (!existenteGiannella) {
    giannellaId = crypto.randomUUID();
    await db.insert(usuarios).values({
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
  } else {
    giannellaId = existenteGiannella.id;
    if (existenteGiannella.cargo !== "Director de Marketing" || existenteGiannella.supervisorId !== adminId) {
      await db.update(usuarios).set({
        cargo: "Director de Marketing",
        supervisorId: adminId,
      }).where(eq(usuarios.id, giannellaId));
    }
  }
  // Asignar a Giannella al departamento de Marketing (idempotente)
  await asignarDepartamento(giannellaId, deptoId);

  await reconfigurarPodcastSiEsSeguro();
  await consolidarServicios();
  await migrarNegociosLegacy();
  await migrarOfertasLegacy();

  // Resolver IDs de departamentos para el mapeo pipeline → unidad de negocio
  const deptos = await db.select().from(departamentos);
  const deptoNombreId = new Map(deptos.map((d) => [d.nombre, d.id]));

  for (const [pipelineNombre, etapasDef] of Object.entries(PIPELINES)) {
    let [pipeline] = await db.select().from(pipelines).where(eq(pipelines.nombre, pipelineNombre));
    const deptoNombre = PIPELINE_DEPARTAMENTO[pipelineNombre];
    const departamentoId = deptoNombre ? deptoNombreId.get(deptoNombre) ?? null : null;

    if (!pipeline) {
      const id = crypto.randomUUID();
      await db.insert(pipelines).values({ id, nombre: pipelineNombre, activo: true, departamentoId });
      pipeline = { id, nombre: pipelineNombre, activo: true, departamentoId };
    } else if (pipeline.departamentoId !== departamentoId) {
      // Actualizar pipelines cuyo departamento cambió (re-mapeo) o no estaba asignado
      await db.update(pipelines).set({ departamentoId }).where(eq(pipelines.id, pipeline.id));
    }

    const existentes = await db.select().from(etapas).where(eq(etapas.pipelineId, pipeline.id));

    for (let i = 0; i < etapasDef.length; i++) {
      const e = etapasDef[i];
      if (!existentes.find((x) => x.nombre === e.nombre)) {
        await db.insert(etapas).values({
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
  const [equipoMarketing] = await db.select().from(equipos).where(eq(equipos.nombre, "Equipo Marketing"));
  let equipoMktId: string;
  if (!equipoMarketing) {
    equipoMktId = crypto.randomUUID();
    const supervisorId = giannellaId ?? adminId;
    await db.insert(equipos).values({
      id: equipoMktId,
      nombre: "Equipo Marketing",
      departamentoId: deptoId,
      supervisorId,
      createdAt: new Date(),
    });
    console.log(`  Equipo Marketing creado (supervisor: ${giannellaId ? "Giannella Quintero" : "Richard Taty"})`);
  } else {
    equipoMktId = equipoMarketing.id;
  }

  // Agregar a Giannella como miembro del equipo
  const [yaEsMiembro] = await db.select().from(equipoMiembros).where(eq(equipoMiembros.usuarioId, giannellaId));
  if (!yaEsMiembro) {
    await db.insert(equipoMiembros).values({
      equipoId: equipoMktId,
      usuarioId: giannellaId,
      cargo: "Director de Marketing",
    });
    console.log("  Giannella agregada al Equipo Marketing");
  }

  // Edith como líder de Ventas (usar la cuenta activa)
  const [edith] = await db.select().from(usuarios).where(eq(usuarios.email, "edithfernandezmedia@gmail.com"));
  if (edith) {
    if (edith.cargo !== "Director de Ventas") {
      await db.update(usuarios).set({
        cargo: "Director de Ventas",
        supervisorId: adminId,
      }).where(eq(usuarios.id, edith.id));
    }
    await asignarDepartamento(edith.id, ventasDeptoId);
    // Activar cuenta si está inactiva
    if (!edith.activo) {
      await db.update(usuarios).set({ activo: true }).where(eq(usuarios.id, edith.id));
    }

    // Equipo de Ventas
    const [equipoVentas] = await db.select().from(equipos).where(eq(equipos.nombre, "Equipo Ventas"));
    let equipoVentasId: string;
    if (!equipoVentas) {
      equipoVentasId = crypto.randomUUID();
      await db.insert(equipos).values({
        id: equipoVentasId,
        nombre: "Equipo Ventas",
        departamentoId: ventasDeptoId,
        supervisorId: edith.id,
        createdAt: new Date(),
      });
      console.log("  Equipo Ventas creado (supervisor: Edith Fernandez)");
    } else {
      equipoVentasId = equipoVentas.id;
    }

    // Agregar a Edith al equipo
    const [yaEsMiembroVentas] = await db.select().from(equipoMiembros).where(eq(equipoMiembros.usuarioId, edith.id));
    if (!yaEsMiembroVentas) {
      await db.insert(equipoMiembros).values({
        equipoId: equipoVentasId,
        usuarioId: edith.id,
        cargo: "Director de Ventas",
      });
      console.log("  Edith agregada al Equipo Ventas");
    }
  }

  // Crear a Oriany Herrera como Directora de Administración.
  // Buscar por el nuevo email primero; si existe con el email viejo, migrarlo.
  const [existenteOriany] = await db.select().from(usuarios).where(eq(usuarios.email, "oriany@orianyherrera.com"));
  const [viejoOriany] = await db.select().from(usuarios).where(eq(usuarios.email, "orioannyherrera@gmail.com"));
  let orianyId: string;

  if (existenteOriany) {
    orianyId = existenteOriany.id;
    if (existenteOriany.cargo !== "Director de Administración") {
      await db.update(usuarios).set({
        cargo: "Director de Administración",
        supervisorId: adminId,
      }).where(eq(usuarios.id, orianyId));
    }
    await asignarDepartamento(orianyId, bmfDeptoId);
    if (!existenteOriany.activo) {
      await db.update(usuarios).set({ activo: true }).where(eq(usuarios.id, orianyId));
    }
  } else if (viejoOriany) {
    // Migrar del email viejo al nuevo
    orianyId = viejoOriany.id;
    await db.update(usuarios).set({
      email: "oriany@orianyherrera.com",
      departamentoId: bmfDeptoId,
      cargo: viejoOriany.cargo ?? "Director de Administración",
      supervisorId: viejoOriany.supervisorId ?? adminId,
      activo: true,
    }).where(eq(usuarios.id, orianyId));
    console.log("  Oriany Herrera: email migrado a oriany@orianyherrera.com");
  } else {
    orianyId = crypto.randomUUID();
    await db.insert(usuarios).values({
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
  const [equipoBmf] = await db.select().from(equipos).where(eq(equipos.nombre, "Financial Operations"));
  let equipoBmfId: string;
  if (!equipoBmf) {
    equipoBmfId = crypto.randomUUID();
    await db.insert(equipos).values({
      id: equipoBmfId,
      nombre: "Financial Operations",
      departamentoId: bmfDeptoId,
      supervisorId: orianyId,
      createdAt: new Date(),
    });
    console.log("  Equipo Financial Operations creado (supervisor: Oriany Herrera)");
  } else {
    equipoBmfId = equipoBmf.id;
  }

  // Agregar a Oriany como miembro del equipo
  const [oriEnEquipo] = await db.select().from(equipoMiembros).where(eq(equipoMiembros.usuarioId, orianyId));
  if (!oriEnEquipo) {
    await db.insert(equipoMiembros).values({
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

  const ofertasExistentes = await db.select().from(ofertas);
  for (const o of OFERTAS) {
    if (!ofertasExistentes.find(e => e.nombre === o.nombre)) {
      await db.insert(ofertas).values({
        id: crypto.randomUUID(),
        nombre: o.nombre,
        categoria: o.categoria as "Ancla" | "Recurrente" | "Volumen medio" | "Volumen alto" | "Evento",
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
  const metasExistentes = await db.select().from(podcastMetas);
  for (const m of METAS_PODCAST) {
    if (!metasExistentes.find(e => e.clave === m.clave)) {
      await db.insert(podcastMetas).values({
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
