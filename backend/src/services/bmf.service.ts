import { and, desc, eq, gte, lte, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  bmfLenders,
  bmfFundings,
  bmfLlamadas,
  bmfComisiones,
  personas,
  usuarios,
  tareasSeguimiento,
  bitacoraAuditoria,
  equipos,
  equipoMiembros,
} from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";

// ─── Lenders ──────────────────────────────────────────────

export async function listarLenders() {
  return db.select().from(bmfLenders).orderBy(desc(bmfLenders.updatedAt));
}

export async function obtenerLender(id: string) {
  const [lender] = await db.select().from(bmfLenders).where(eq(bmfLenders.id, id));
  if (!lender) throw new Error("Lender no encontrado");

  const ops = await db
    .select({ id: bmfFundings.id, estado: bmfFundings.estado, montoAprobado: bmfFundings.montoAprobado })
    .from(bmfFundings)
    .where(and(eq(bmfFundings.lenderId, id)));

  const aprobadas = ops.filter((o) => o.estado === "aprobado" || o.estado === "funding_enviado");
  const fundingGenerado = aprobadas.reduce((s, o) => s + (o.montoAprobado ?? 0), 0);

  return {
    ...lender,
    kpis: {
      operaciones: ops.length,
      fundingGenerado,
      conversion: ops.length ? Math.round((aprobadas.length / ops.length) * 100) : 0,
    },
  };
}

export async function crearLender(input: {
  nombre: string;
  contacto?: string;
  email?: string;
  telefono?: string;
  productos?: string;
  montoMinimo?: number;
  montoMaximo?: number;
  tiempoRespuestaDias?: number;
  estado?: string;
  observaciones?: string;
}, autorId: string) {
  const id = crypto.randomUUID();
  await db.insert(bmfLenders).values({
    id,
    nombre: input.nombre,
    contacto: input.contacto,
    email: input.email,
    telefono: input.telefono,
    productos: input.productos,
    montoMinimo: input.montoMinimo,
    montoMaximo: input.montoMaximo,
    tiempoRespuestaDias: input.tiempoRespuestaDias,
    estado: input.estado ?? "activo",
    observaciones: input.observaciones,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await registrarAuditoria({
    entidad: "BMF_Lender",
    entidadId: id,
    accion: `Lender creado: "${input.nombre}"`,
    autorId,
  });
  const [lender] = await db.select().from(bmfLenders).where(eq(bmfLenders.id, id));
  return lender;
}

export async function actualizarLender(id: string, input: Record<string, unknown>, autorId: string) {
  const [existente] = await db.select().from(bmfLenders).where(eq(bmfLenders.id, id));
  if (!existente) throw new Error("Lender no encontrado");

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.nombre !== undefined) data.nombre = input.nombre;
  if (input.contacto !== undefined) data.contacto = input.contacto;
  if (input.email !== undefined) data.email = input.email;
  if (input.telefono !== undefined) data.telefono = input.telefono;
  if (input.productos !== undefined) data.productos = input.productos;
  if (input.montoMinimo !== undefined) data.montoMinimo = input.montoMinimo;
  if (input.montoMaximo !== undefined) data.montoMaximo = input.montoMaximo;
  if (input.tiempoRespuestaDias !== undefined) data.tiempoRespuestaDias = input.tiempoRespuestaDias;
  if (input.estado !== undefined) data.estado = input.estado;
  if (input.observaciones !== undefined) data.observaciones = input.observaciones;

  await db.update(bmfLenders).set(data).where(eq(bmfLenders.id, id));
  await registrarAuditoria({
    entidad: "BMF_Lender",
    entidadId: id,
    accion: `Lender actualizado: "${input.nombre ?? existente.nombre}"`,
    autorId,
  });
  const [updated] = await db.select().from(bmfLenders).where(eq(bmfLenders.id, id));
  return updated;
}

// ─── Fundings ─────────────────────────────────────────────

export async function listarFundings(filtros: {
  estado?: string;
  agenteId?: string;
  lenderId?: string;
  clienteId?: string;
}) {
  const condiciones = [
    filtros.estado ? eq(bmfFundings.estado, filtros.estado) : undefined,
    filtros.agenteId ? eq(bmfFundings.agenteId, filtros.agenteId) : undefined,
    filtros.lenderId ? eq(bmfFundings.lenderId, filtros.lenderId) : undefined,
    filtros.clienteId ? eq(bmfFundings.clienteId, filtros.clienteId) : undefined,
  ].filter(Boolean);

  const filas = await db
    .select({
      id: bmfFundings.id,
      clienteId: bmfFundings.clienteId,
      agenteId: bmfFundings.agenteId,
      lenderId: bmfFundings.lenderId,
      montoSolicitado: bmfFundings.montoSolicitado,
      montoAprobado: bmfFundings.montoAprobado,
      fechaCreacion: bmfFundings.fechaCreacion,
      fechaAprobacion: bmfFundings.fechaAprobacion,
      fechaFunding: bmfFundings.fechaFunding,
      estado: bmfFundings.estado,
      comisionPorcentaje: bmfFundings.comisionPorcentaje,
      comisionMonto: bmfFundings.comisionMonto,
      observaciones: bmfFundings.observaciones,
      updatedAt: bmfFundings.updatedAt,
    })
    .from(bmfFundings)
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(bmfFundings.updatedAt));

  // Enriquecer con nombres
  const resultado = [];
  for (const f of filas) {
    const [cliente] = await db.select({ nombre: personas.nombre }).from(personas).where(eq(personas.id, f.clienteId));
    const [agente] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, f.agenteId));
    let lenderNombre: string | null = null;
    if (f.lenderId) {
      const [lender] = await db.select({ nombre: bmfLenders.nombre }).from(bmfLenders).where(eq(bmfLenders.id, f.lenderId));
      lenderNombre = lender?.nombre ?? null;
    }
    resultado.push({
      ...f,
      clienteNombre: cliente?.nombre ?? "",
      agenteNombre: agente?.nombre ?? "",
      lenderNombre,
    });
  }
  return resultado;
}

export async function obtenerFunding(id: string) {
  const [funding] = await db.select().from(bmfFundings).where(eq(bmfFundings.id, id));
  if (!funding) throw new Error("Funding no encontrado");

  const [cliente] = await db.select({ nombre: personas.nombre }).from(personas).where(eq(personas.id, funding.clienteId));
  const [agente] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, funding.agenteId));
  let lenderNombre: string | null = null;
  if (funding.lenderId) {
    const [lender] = await db.select({ nombre: bmfLenders.nombre }).from(bmfLenders).where(eq(bmfLenders.id, funding.lenderId));
    lenderNombre = lender?.nombre ?? null;
  }

  const comisiones = await db
    .select({
      id: bmfComisiones.id,
      agenteId: bmfComisiones.agenteId,
      monto: bmfComisiones.monto,
      porcentaje: bmfComisiones.porcentaje,
      estado: bmfComisiones.estado,
      fechaPago: bmfComisiones.fechaPago,
    })
    .from(bmfComisiones)
    .where(eq(bmfComisiones.fundingId, id));

  const comisionesConNombre = [];
  for (const c of comisiones) {
    const [ag] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, c.agenteId));
    comisionesConNombre.push({ ...c, agenteNombre: ag?.nombre ?? "" });
  }

  const llamadas = await db
    .select({
      id: bmfLlamadas.id,
      fecha: bmfLlamadas.fecha,
      duracionMinutos: bmfLlamadas.duracionMinutos,
      resultado: bmfLlamadas.resultado,
      observaciones: bmfLlamadas.observaciones,
      agenteId: bmfLlamadas.agenteId,
    })
    .from(bmfLlamadas)
    .where(eq(bmfLlamadas.personaId, funding.clienteId))
    .orderBy(desc(bmfLlamadas.fecha))
    .limit(10);

  const llamadasConNombre = [];
  for (const l of llamadas) {
    const [ag] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, l.agenteId));
    llamadasConNombre.push({ ...l, agenteNombre: ag?.nombre ?? "" });
  }

  return {
    ...funding,
    clienteNombre: cliente?.nombre ?? "",
    agenteNombre: agente?.nombre ?? "",
    lenderNombre,
    comisiones: comisionesConNombre,
    llamadas: llamadasConNombre,
  };
}

export async function crearFunding(input: {
  clienteId: string;
  agenteId: string;
  lenderId?: string;
  montoSolicitado: number;
  observaciones?: string;
}, autorId: string) {
  const id = crypto.randomUUID();
  await db.insert(bmfFundings).values({
    id,
    clienteId: input.clienteId,
    agenteId: input.agenteId,
    lenderId: input.lenderId,
    montoSolicitado: input.montoSolicitado,
    estado: "pendiente",
    observaciones: input.observaciones,
    fechaCreacion: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await registrarAuditoria({
    entidad: "BMF_Funding",
    entidadId: id,
    accion: "Funding creado",
    autorId,
    personaId: input.clienteId,
  });
  return obtenerFunding(id);
}

export async function actualizarFunding(id: string, input: Record<string, unknown>, autorId: string) {
  const [existente] = await db.select().from(bmfFundings).where(eq(bmfFundings.id, id));
  if (!existente) throw new Error("Funding no encontrado");

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.estado !== undefined) data.estado = input.estado;
  if (input.montoAprobado !== undefined) data.montoAprobado = input.montoAprobado;
  if (input.lenderId !== undefined) data.lenderId = input.lenderId;
  if (input.comisionPorcentaje !== undefined) data.comisionPorcentaje = input.comisionPorcentaje;
  if (input.comisionMonto !== undefined) data.comisionMonto = input.comisionMonto;
  if (input.observaciones !== undefined) data.observaciones = input.observaciones;

  if (input.estado === "aprobado" && !existente.fechaAprobacion) {
    data.fechaAprobacion = new Date();
  }
  if (input.estado === "funding_enviado" && !existente.fechaFunding) {
    data.fechaFunding = new Date();
  }

  await db.update(bmfFundings).set(data).where(eq(bmfFundings.id, id));

  const estadoLabel = typeof input.estado === "string" ? input.estado : "actualizado";
  await registrarAuditoria({
    entidad: "BMF_Funding",
    entidadId: id,
    accion: `Funding ${estadoLabel}`,
    autorId,
    personaId: existente.clienteId,
  });

  return obtenerFunding(id);
}

// ─── Llamadas ─────────────────────────────────────────────

export async function listarLlamadas(filtros: {
  personaId?: string;
  agenteId?: string;
  desde?: string;
  hasta?: string;
}) {
  const condiciones = [
    filtros.personaId ? eq(bmfLlamadas.personaId, filtros.personaId) : undefined,
    filtros.agenteId ? eq(bmfLlamadas.agenteId, filtros.agenteId) : undefined,
    filtros.desde ? gte(bmfLlamadas.fecha, new Date(filtros.desde)) : undefined,
    filtros.hasta ? lte(bmfLlamadas.fecha, new Date(filtros.hasta)) : undefined,
  ].filter(Boolean);

  const filas = await db
    .select({
      id: bmfLlamadas.id,
      personaId: bmfLlamadas.personaId,
      agenteId: bmfLlamadas.agenteId,
      fecha: bmfLlamadas.fecha,
      duracionMinutos: bmfLlamadas.duracionMinutos,
      resultado: bmfLlamadas.resultado,
      observaciones: bmfLlamadas.observaciones,
    })
    .from(bmfLlamadas)
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(bmfLlamadas.fecha));

  const resultado = [];
  for (const l of filas) {
    const [p] = await db.select({ nombre: personas.nombre }).from(personas).where(eq(personas.id, l.personaId));
    const [u] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, l.agenteId));
    resultado.push({
      ...l,
      personaNombre: p?.nombre ?? "",
      agenteNombre: u?.nombre ?? "",
    });
  }
  return resultado;
}

export async function registrarLlamada(input: {
  personaId: string;
  agenteId: string;
  duracionMinutos?: number;
  resultado?: string;
  observaciones?: string;
}, autorId: string) {
  const id = crypto.randomUUID();
  await db.insert(bmfLlamadas).values({
    id,
    personaId: input.personaId,
    agenteId: input.agenteId,
    fecha: new Date(),
    duracionMinutos: input.duracionMinutos,
    resultado: input.resultado ?? "contestó",
    observaciones: input.observaciones,
    createdAt: new Date(),
  });
  await registrarAuditoria({
    entidad: "BMF_Llamada",
    entidadId: id,
    accion: `Llamada registrada: ${input.resultado ?? "contestó"}`,
    autorId,
    personaId: input.personaId,
  });

  const [p] = await db.select({ nombre: personas.nombre }).from(personas).where(eq(personas.id, input.personaId));
  const [u] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, input.agenteId));

  return {
    id,
    personaId: input.personaId,
    personaNombre: p?.nombre ?? "",
    agenteId: input.agenteId,
    agenteNombre: u?.nombre ?? "",
    fecha: new Date(),
    duracionMinutos: input.duracionMinutos,
    resultado: input.resultado ?? "contestó",
    observaciones: input.observaciones,
  };
}

export async function statsLlamadas(filtros: { agenteId?: string; desde?: string; hasta?: string }) {
  const condiciones = [
    filtros.agenteId ? eq(bmfLlamadas.agenteId, filtros.agenteId) : undefined,
    filtros.desde ? gte(bmfLlamadas.fecha, new Date(filtros.desde)) : undefined,
    filtros.hasta ? lte(bmfLlamadas.fecha, new Date(filtros.hasta)) : undefined,
  ].filter(Boolean);

  const todas = await db
    .select({
      agenteId: bmfLlamadas.agenteId,
      resultado: bmfLlamadas.resultado,
      fecha: bmfLlamadas.fecha,
    })
    .from(bmfLlamadas)
    .where(condiciones.length ? and(...condiciones) : undefined);

  // Enriquecer con nombres
  const nombresAgentes = new Map<string, string>();
  for (const l of todas) {
    if (!nombresAgentes.has(l.agenteId)) {
      const [u] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, l.agenteId));
      nombresAgentes.set(l.agenteId, u?.nombre ?? "");
    }
  }

  const porAgente = new Map<string, { agenteId: string; agenteNombre: string; total: number; contesto: number; noContesto: number; buzon: number }>();
  for (const l of todas) {
    if (!porAgente.has(l.agenteId)) {
      porAgente.set(l.agenteId, { agenteId: l.agenteId, agenteNombre: nombresAgentes.get(l.agenteId) ?? "", total: 0, contesto: 0, noContesto: 0, buzon: 0 });
    }
    const a = porAgente.get(l.agenteId)!;
    a.total++;
    if (l.resultado === "contestó") a.contesto++;
    else if (l.resultado === "no contestó") a.noContesto++;
    else if (l.resultado === "buzón") a.buzon++;
  }

  const porDia = new Map<string, number>();
  for (const l of todas) {
    const dia = l.fecha.toISOString().slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }

  return {
    total: todas.length,
    porAgente: Array.from(porAgente.values()).sort((a, b) => b.total - a.total),
    porDia: Array.from(porDia.entries())
      .map(([fecha, total]) => ({ fecha, total }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
  };
}

// ─── Comisiones ───────────────────────────────────────────

export async function listarComisiones(filtros: { agenteId?: string; estado?: string }) {
  const condiciones = [
    filtros.agenteId ? eq(bmfComisiones.agenteId, filtros.agenteId) : undefined,
    filtros.estado ? eq(bmfComisiones.estado, filtros.estado) : undefined,
  ].filter(Boolean);

  const filas = await db
    .select({
      id: bmfComisiones.id,
      agenteId: bmfComisiones.agenteId,
      fundingId: bmfComisiones.fundingId,
      monto: bmfComisiones.monto,
      porcentaje: bmfComisiones.porcentaje,
      estado: bmfComisiones.estado,
      fechaPago: bmfComisiones.fechaPago,
      createdAt: bmfComisiones.createdAt,
    })
    .from(bmfComisiones)
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(bmfComisiones.createdAt));

  const resultado = [];
  for (const c of filas) {
    const [ag] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, c.agenteId));
    const [funding] = await db.select({ clienteId: bmfFundings.clienteId }).from(bmfFundings).where(eq(bmfFundings.id, c.fundingId));
    let clienteNombre = "";
    if (funding?.clienteId) {
      const [p] = await db.select({ nombre: personas.nombre }).from(personas).where(eq(personas.id, funding.clienteId));
      clienteNombre = p?.nombre ?? "";
    }
    resultado.push({
      ...c,
      agenteNombre: ag?.nombre ?? "",
      clienteNombre,
    });
  }
  return resultado;
}

export async function crearComision(input: {
  agenteId: string;
  fundingId: string;
  monto: number;
  porcentaje: number;
}, autorId: string) {
  const id = crypto.randomUUID();
  await db.insert(bmfComisiones).values({
    id,
    agenteId: input.agenteId,
    fundingId: input.fundingId,
    monto: input.monto,
    porcentaje: input.porcentaje,
    estado: "pendiente",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await registrarAuditoria({
    entidad: "BMF_Comision",
    entidadId: id,
    accion: "Comisión creada",
    autorId,
  });
  const [comision] = await db.select().from(bmfComisiones).where(eq(bmfComisiones.id, id));
  return comision;
}

export async function pagarComision(id: string, autorId: string) {
  const [existente] = await db.select().from(bmfComisiones).where(eq(bmfComisiones.id, id));
  if (!existente) throw new Error("Comisión no encontrada");

  await db.update(bmfComisiones).set({
    estado: "pagada",
    fechaPago: new Date(),
    updatedAt: new Date(),
  }).where(eq(bmfComisiones.id, id));

  await registrarAuditoria({
    entidad: "BMF_Comision",
    entidadId: id,
    accion: "Comisión pagada",
    autorId,
  });

  const [updated] = await db.select().from(bmfComisiones).where(eq(bmfComisiones.id, id));
  return updated;
}

// ─── Dashboard BMF ────────────────────────────────────────

export async function dashboardBMF(deptoId: string) {
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const agentes = await db
    .select({
      usuarioId: equipoMiembros.usuarioId,
      nombre: usuarios.nombre,
    })
    .from(equipoMiembros)
    .innerJoin(equipos, eq(equipoMiembros.equipoId, equipos.id))
    .innerJoin(usuarios, eq(equipoMiembros.usuarioId, usuarios.id))
    .where(eq(equipos.departamentoId, deptoId));

  const agentesIds = agentes.map((a) => a.usuarioId);

  if (!agentesIds.length) {
    return {
      clientesActivos: 0, leadsNuevos: 0, seguimientosPendientes: 0, seguimientosVencidos: 0,
      solicitudesAbiertas: 0, solicitudesAprobadas: 0, solicitudesPerdidas: 0,
      fundingMes: 0, fundingHistorico: 0, pipelineActivo: 0, renovacionesProximas: 0,
      lendersActivos: 0, agentesActivos: 0, conversion: 0,
      comisionesGeneradas: 0, comisionesPendientes: 0, actividadHoy: 0,
      agentes,
    };
  }

  const fundings = await db
    .select({
      estado: bmfFundings.estado,
      montoSolicitado: bmfFundings.montoSolicitado,
      fechaCreacion: bmfFundings.fechaCreacion,
      clienteId: bmfFundings.clienteId,
    })
    .from(bmfFundings)
    .where(inArray(bmfFundings.agenteId, agentesIds));

  const clientesUnicos = new Set(
    fundings.filter((f) => f.estado !== "perdido").map((f) => f.clienteId)
  );

  const personasMes = await db
    .select({ id: personas.id })
    .from(personas)
    .where(and(
      inArray(personas.responsableId, agentesIds),
      gte(personas.createdAt, inicioMes)
    ));

  const tareasPendientes = await db
    .select({ fecha: tareasSeguimiento.fecha })
    .from(tareasSeguimiento)
    .innerJoin(personas, eq(tareasSeguimiento.personaId, personas.id))
    .where(and(
      inArray(personas.responsableId, agentesIds),
      eq(tareasSeguimiento.completado, false)
    ));

  const solicitudesAbiertas = fundings.filter((f) => !["aprobado", "perdido", "funding_enviado"].includes(f.estado)).length;
  const solicitudesAprobadas = fundings.filter((f) => f.estado === "aprobado" || f.estado === "funding_enviado").length;
  const solicitudesPerdidas = fundings.filter((f) => f.estado === "perdido").length;

  const fundingMes = fundings
    .filter((f) => (f.estado === "aprobado" || f.estado === "funding_enviado") && f.fechaCreacion >= inicioMes)
    .reduce((s, f) => s + (f.montoSolicitado ?? 0), 0);

  const fundingHistorico = fundings
    .filter((f) => f.estado === "aprobado" || f.estado === "funding_enviado")
    .reduce((s, f) => s + (f.montoSolicitado ?? 0), 0);

  const pipelineActivo = fundings
    .filter((f) => !["aprobado", "perdido", "funding_enviado"].includes(f.estado))
    .reduce((s, f) => s + (f.montoSolicitado ?? 0), 0);

  const lenders = await db.select({ id: bmfLenders.id }).from(bmfLenders).where(eq(bmfLenders.estado, "activo"));

  const comisionesRows = await db
    .select({ monto: bmfComisiones.monto, estado: bmfComisiones.estado })
    .from(bmfComisiones)
    .where(inArray(bmfComisiones.agenteId, agentesIds));

  const comisionesGeneradas = comisionesRows.reduce((s, c) => s + (c.monto ?? 0), 0);
  const comisionesPendientesCount = comisionesRows
    .filter((c) => c.estado === "pendiente")
    .reduce((s, c) => s + (c.monto ?? 0), 0);

  const conversion = fundings.length ? Math.round((solicitudesAprobadas / fundings.length) * 100) : 0;

  const actividadHoy = await db
    .select({ id: bitacoraAuditoria.id })
    .from(bitacoraAuditoria)
    .where(and(
      inArray(bitacoraAuditoria.autorId, agentesIds),
      gte(bitacoraAuditoria.fecha, inicioHoy)
    ));

  return {
    clientesActivos: clientesUnicos.size,
    leadsNuevos: personasMes.length,
    seguimientosPendientes: tareasPendientes.length,
    seguimientosVencidos: tareasPendientes.filter((t) => t.fecha < hoy).length,
    solicitudesAbiertas,
    solicitudesAprobadas,
    solicitudesPerdidas,
    fundingMes,
    fundingHistorico,
    pipelineActivo,
    renovacionesProximas: 0,
    lendersActivos: lenders.length,
    agentesActivos: agentes.length,
    conversion,
    comisionesGeneradas,
    comisionesPendientes: comisionesPendientesCount,
    actividadHoy: actividadHoy.length,
    agentes,
  };
}

// ─── Dashboard Admin BMF ─────────────────────────────────

export async function dashboardAdminBMF(deptoId: string) {
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const hace7Dias = new Date(hoy.getTime() - 7 * 86400000);

  const agentes = await db
    .select({
      usuarioId: equipoMiembros.usuarioId,
      nombre: usuarios.nombre,
      cargo: equipoMiembros.cargo,
    })
    .from(equipoMiembros)
    .innerJoin(equipos, eq(equipoMiembros.equipoId, equipos.id))
    .innerJoin(usuarios, eq(equipoMiembros.usuarioId, usuarios.id))
    .where(eq(equipos.departamentoId, deptoId));

  const agentesIds = agentes.map((a) => a.usuarioId);

  if (!agentesIds.length) {
    return { agentesSinActividad: [], kpisPorAgente: [], clientesSinContacto: [], renovacionesProximas: [] };
  }

  // Agentes sin actividad hoy
  const actividadHoy = await db
    .select({ autorId: bitacoraAuditoria.autorId })
    .from(bitacoraAuditoria)
    .where(and(
      inArray(bitacoraAuditoria.autorId, agentesIds),
      gte(bitacoraAuditoria.fecha, inicioHoy)
    ));
  const activosHoyIds = new Set(actividadHoy.map((a) => a.autorId));
  const agentesSinActividad = agentes.filter((a) => !activosHoyIds.has(a.usuarioId));

  // KPIs por agente
  const kpisPorAgente = [];
  for (const a of agentes) {
    const llamadasHoy = await db
      .select({ id: bmfLlamadas.id })
      .from(bmfLlamadas)
      .where(and(eq(bmfLlamadas.agenteId, a.usuarioId), gte(bmfLlamadas.fecha, inicioHoy)));

    const clientes = await db
      .select({ id: personas.id })
      .from(personas)
      .where(eq(personas.responsableId, a.usuarioId));

    const opsAgente = await db
      .select({ estado: bmfFundings.estado, montoSolicitado: bmfFundings.montoSolicitado })
      .from(bmfFundings)
      .where(eq(bmfFundings.agenteId, a.usuarioId));

    const opsAprobadas = opsAgente.filter((f) => f.estado === "aprobado" || f.estado === "funding_enviado");
    const fundingProducido = opsAprobadas.reduce((s, f) => s + (f.montoSolicitado ?? 0), 0);

    const tareas = await db
      .select({ fecha: tareasSeguimiento.fecha })
      .from(tareasSeguimiento)
      .innerJoin(personas, eq(tareasSeguimiento.personaId, personas.id))
      .where(and(
        eq(personas.responsableId, a.usuarioId),
        eq(tareasSeguimiento.completado, false)
      ));
    const vencidas = tareas.filter((t) => t.fecha < hoy).length;
    const conversion = opsAgente.length ? Math.round((opsAprobadas.length / opsAgente.length) * 100) : 0;

    kpisPorAgente.push({
      usuarioId: a.usuarioId,
      nombre: a.nombre,
      cargo: a.cargo,
      llamadasHoy: llamadasHoy.length,
      clientesAtendidos: clientes.length,
      fundingProducido,
      seguimientosVencidos: vencidas,
      conversion,
    });
  }

  // Clientes sin contacto
  const clientesSinContacto: { id: string; nombre: string; agenteNombre: string; diasSinContacto: number }[] = [];
  for (const a of agentes) {
    const clientesAgente = await db
      .select({ id: personas.id, nombre: personas.nombre })
      .from(personas)
      .where(eq(personas.responsableId, a.usuarioId));

    for (const c of clientesAgente) {
      const ultimasLlamadas = await db
        .select({ fecha: bmfLlamadas.fecha })
        .from(bmfLlamadas)
        .where(eq(bmfLlamadas.personaId, c.id))
        .orderBy(desc(bmfLlamadas.fecha))
        .limit(1);

      const ultimaLlamada = ultimasLlamadas[0];
      if (!ultimaLlamada || ultimaLlamada.fecha < hace7Dias) {
        const dias = ultimaLlamada
          ? Math.round((hoy.getTime() - ultimaLlamada.fecha.getTime()) / 86400000)
          : 30;
        clientesSinContacto.push({ id: c.id, nombre: c.nombre, agenteNombre: a.nombre, diasSinContacto: dias });
      }
    }
  }
  clientesSinContacto.sort((a, b) => b.diasSinContacto - a.diasSinContacto);

  // Renovaciones próximas
  const renovaciones = await db
    .select({
      id: bmfFundings.id,
      montoSolicitado: bmfFundings.montoSolicitado,
      fechaCreacion: bmfFundings.fechaCreacion,
      clienteId: bmfFundings.clienteId,
    })
    .from(bmfFundings)
    .where(and(
      inArray(bmfFundings.agenteId, agentesIds),
      inArray(bmfFundings.estado, ["aprobado", "funding_enviado"])
    ))
    .limit(20);

  const renovacionesProximas = [];
  for (const r of renovaciones) {
    const [p] = await db.select({ nombre: personas.nombre }).from(personas).where(eq(personas.id, r.clienteId));
    renovacionesProximas.push({
      id: r.id,
      clienteNombre: p?.nombre ?? "",
      montoSolicitado: r.montoSolicitado ?? 0,
      fechaCreacion: r.fechaCreacion.toISOString(),
    });
  }

  return {
    agentesSinActividad: agentesSinActividad.map((a) => ({ usuarioId: a.usuarioId, nombre: a.nombre })),
    kpisPorAgente: kpisPorAgente.sort((a, b) => b.fundingProducido - a.fundingProducido),
    clientesSinContacto: clientesSinContacto.slice(0, 20),
    renovacionesProximas,
  };
}

// ─── Score del cliente ────────────────────────────────────

export async function scoreCliente(personaId: string) {
  const hoy = new Date();

  const ultimasLlamadas = await db
    .select({ fecha: bmfLlamadas.fecha })
    .from(bmfLlamadas)
    .where(eq(bmfLlamadas.personaId, personaId))
    .orderBy(desc(bmfLlamadas.fecha))
    .limit(1);

  const ultimaLlamada = ultimasLlamadas[0];
  const diasSinContacto = ultimaLlamada
    ? Math.round((hoy.getTime() - ultimaLlamada.fecha.getTime()) / 86400000)
    : 999;

  const tareas = await db
    .select({ fecha: tareasSeguimiento.fecha, completado: tareasSeguimiento.completado })
    .from(tareasSeguimiento)
    .where(eq(tareasSeguimiento.personaId, personaId));
  const seguimientosVencidos = tareas.filter((t) => !t.completado && t.fecha < hoy).length;

  const llamadas = await db
    .select({ id: bmfLlamadas.id })
    .from(bmfLlamadas)
    .where(eq(bmfLlamadas.personaId, personaId));
  const totalLlamadas = llamadas.length;

  let nivel: "verde" | "amarillo" | "rojo" = "verde";
  let puntaje = 100;

  if (diasSinContacto > 7) puntaje -= 20;
  if (diasSinContacto > 14) puntaje -= 20;
  if (diasSinContacto > 30) puntaje -= 20;
  if (seguimientosVencidos > 0) puntaje -= 15 * seguimientosVencidos;
  if (totalLlamadas === 0) puntaje -= 10;

  if (puntaje >= 70) nivel = "verde";
  else if (puntaje >= 40) nivel = "amarillo";
  else nivel = "rojo";

  return { personaId, nivel, puntaje, diasSinContacto, seguimientosVencidos, totalLlamadas };
}
