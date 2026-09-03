import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "../db/client";
import { pagos, personas, interacciones, historialEtapas, etapas, usuarios, registros, pipelines, tareasOperativas, departamentos, equipoMiembros, equipos, bitacoraAuditoria, tareasSeguimiento } from "../db/schema";

const ZONA_NEGOCIO = "America/New_York";

// El servidor corre en UTC (Fly.io), pero el negocio opera en hora de Florida — sin esto,
// una venta después de las 8pm ET aparece "al día siguiente" porque en UTC ya cruzó la
// medianoche. Todo cálculo de "qué día es hoy" o "a qué día pertenece este pago" pasa por
// estas funciones, nunca por new Date().getDate() directo.

// YYYY-MM-DD del día calendario en Florida para un instante dado.
function fechaET(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_NEGOCIO, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Cuántos minutos hay que sumarle a la medianoche UTC de una fecha para llegar a la
// medianoche real en Florida ese mismo día (240 en horario de verano, 300 en invierno).
function offsetETMinutos(fechaRef: Date): number {
  const comoUTC = new Date(fechaRef.toLocaleString("en-US", { timeZone: "UTC" }));
  const comoET = new Date(fechaRef.toLocaleString("en-US", { timeZone: ZONA_NEGOCIO }));
  return Math.round((comoUTC.getTime() - comoET.getTime()) / 60000);
}

// Convierte un "YYYY-MM-DD" (día calendario en Florida) en el instante UTC real de su
// medianoche — el punto exacto donde ese día empieza en Florida, no en el servidor.
function inicioDelDiaET(ymd: string, offsetMin: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offsetMin * 60000);
}

function inicioYFinDeHoy() {
  const ahora = new Date();
  const offsetMin = offsetETMinutos(ahora);
  const inicio = inicioDelDiaET(fechaET(ahora), offsetMin);
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { inicio, fin };
}

function inicioDeMes(): Date {
  const ahora = new Date();
  const offsetMin = offsetETMinutos(ahora);
  const hoyYmd = fechaET(ahora);
  const primerDiaYmd = hoyYmd.slice(0, 8) + "01"; // mismo año-mes, día 01
  return inicioDelDiaET(primerDiaYmd, offsetMin);
}

// Convierte un "YYYY-MM-DD" que viene de un <input type="date"> del navegador (que no trae
// zona horaria) en los límites reales de ese día en Florida — para que un filtro "desde
// 2026-07-31 hasta 2026-07-31" capture exactamente las ventas de ese día en Florida.
export function limitesDeRangoET(ymd: string, finDelDia: boolean): Date {
  const offsetMin = offsetETMinutos(new Date(`${ymd}T12:00:00Z`));
  const inicio = inicioDelDiaET(ymd, offsetMin);
  return finDelDia ? new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1) : inicio;
}

interface ActividadUsuario {
  usuarioId: string;
  nombre: string;
  ingresos: number;
  contactosNuevos: number;
  interacciones: number;
  dealsGanados: number;
}

// Todo lo que pasó hoy en la empresa, cruzado por usuario — SOLO para Super Admin (la ruta
// que llama a esto ya exige ese rol). Un agente normal nunca debe poder ver cuánto facturó
// otro agente ni el total de la empresa.
export async function actividadDelDia() {
  const { inicio, fin } = inicioYFinDeHoy();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enRangoHoy = (col: SQLiteColumn<any>) => and(gte(col, inicio), lte(col, fin));

  const pagosHoy = await db
    .select({ monto: pagos.monto, autorId: pagos.autorId, autorNombre: usuarios.nombre })
    .from(pagos)
    .innerJoin(usuarios, eq(pagos.autorId, usuarios.id))
    .where(enRangoHoy(pagos.fecha));

  const personasHoy = await db
    .select({ id: personas.id, responsableId: personas.responsableId, responsableNombre: usuarios.nombre })
    .from(personas)
    .innerJoin(usuarios, eq(personas.responsableId, usuarios.id))
    .where(enRangoHoy(personas.createdAt));

  const interaccionesHoy = await db
    .select({ id: interacciones.id, autorId: interacciones.autorId, autorNombre: usuarios.nombre })
    .from(interacciones)
    .innerJoin(usuarios, eq(interacciones.autorId, usuarios.id))
    .where(enRangoHoy(interacciones.fecha));

  const movimientosHoy = await db
    .select({
      autorId: historialEtapas.autorId,
      autorNombre: usuarios.nombre,
      esGanada: etapas.esGanada,
    })
    .from(historialEtapas)
    .innerJoin(usuarios, eq(historialEtapas.autorId, usuarios.id))
    .innerJoin(etapas, eq(historialEtapas.etapaNuevaId, etapas.id))
    .where(enRangoHoy(historialEtapas.fecha));

  const dealsGanadosHoy = movimientosHoy.filter((m) => m.esGanada);

  const porUsuario = new Map<string, ActividadUsuario>();
  const asegurar = (id: string, nombre: string): ActividadUsuario => {
    if (!porUsuario.has(id)) {
      porUsuario.set(id, { usuarioId: id, nombre, ingresos: 0, contactosNuevos: 0, interacciones: 0, dealsGanados: 0 });
    }
    return porUsuario.get(id)!;
  };

  pagosHoy.forEach((p) => (asegurar(p.autorId, p.autorNombre).ingresos += p.monto));
  personasHoy.forEach((p) => (asegurar(p.responsableId, p.responsableNombre).contactosNuevos += 1));
  interaccionesHoy.forEach((i) => (asegurar(i.autorId, i.autorNombre).interacciones += 1));
  dealsGanadosHoy.forEach((m) => (asegurar(m.autorId, m.autorNombre).dealsGanados += 1));

  const inicioMes = inicioDeMes();
  const pagosMes = await db.select({ monto: pagos.monto }).from(pagos).where(gte(pagos.fecha, inicioMes));

  return {
    ingresosTotalHoy: pagosHoy.reduce((s, p) => s + p.monto, 0),
    ingresosTotalMes: pagosMes.reduce((s, p) => s + p.monto, 0),
    contactosNuevosHoy: personasHoy.length,
    interaccionesHoy: interaccionesHoy.length,
    dealsGanadosHoy: dealsGanadosHoy.length,
    porUsuario: Array.from(porUsuario.values()).sort((a, b) => b.ingresos - a.ingresos),
  };
}

// Facturación de UN SOLO agente — lo único que un agente que no es Super Admin puede ver de
// dinero: lo suyo, hoy y este mes. Nunca el total de la empresa ni lo de otros compañeros.
export async function miFacturacion(usuarioId: string) {
  const { inicio: inicioHoy, fin: finHoy } = inicioYFinDeHoy();
  const inicioMes = inicioDeMes();

  const pagosHoy = await db
    .select({ monto: pagos.monto })
    .from(pagos)
    .where(and(eq(pagos.autorId, usuarioId), gte(pagos.fecha, inicioHoy), lte(pagos.fecha, finHoy)));

  const pagosMes = await db
    .select({ monto: pagos.monto })
    .from(pagos)
    .where(and(eq(pagos.autorId, usuarioId), gte(pagos.fecha, inicioMes)));

  return {
    hoy: pagosHoy.reduce((s, p) => s + p.monto, 0),
    mes: pagosMes.reduce((s, p) => s + p.monto, 0),
  };
}

interface FiltroPagos {
  desde?: Date;
  hasta?: Date;
  usuarioId?: string;
}

// Cada abono individual, con quién lo cobró, a quién, y por cuál producto — el detalle
// que faltaba: hasta ahora solo se veían totales acumulados, nunca los pagos uno por uno.
export async function listarPagosDetallado(filtro: FiltroPagos) {
  const condiciones = [
    filtro.usuarioId ? eq(pagos.autorId, filtro.usuarioId) : undefined,
    filtro.desde ? gte(pagos.fecha, filtro.desde) : undefined,
    filtro.hasta ? lte(pagos.fecha, filtro.hasta) : undefined,
  ].filter(Boolean);

  const filas = await db
    .select({
      id: pagos.id,
      monto: pagos.monto,
      nota: pagos.nota,
      fecha: pagos.fecha,
      autorId: pagos.autorId,
      autorNombre: usuarios.nombre,
      personaNombre: personas.nombre,
      pipelineNombre: pipelines.nombre,
    })
    .from(pagos)
    .innerJoin(usuarios, eq(pagos.autorId, usuarios.id))
    .innerJoin(registros, eq(pagos.registroId, registros.id))
    .leftJoin(personas, eq(registros.personaId, personas.id))
    .innerJoin(pipelines, eq(registros.pipelineId, pipelines.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(pagos.fecha));

  return filas;
}

interface DiaResumen {
  fecha: string;
  total: number;
  porUsuario: Map<string, { usuarioId: string; nombre: string; total: number }>;
}

// Agrupa los mismos abonos por día calendario EN FLORIDA (no en el servidor) y, dentro de
// cada día, por usuario — responde exactamente "cuánto vendió cada quién, cada día".
export async function ventasPorDiaYUsuario(filtro: FiltroPagos) {
  const detalle = await listarPagosDetallado(filtro);

  const porDia = new Map<string, DiaResumen>();
  for (const p of detalle) {
    const dia = fechaET(p.fecha);
    if (!porDia.has(dia)) porDia.set(dia, { fecha: dia, total: 0, porUsuario: new Map() });
    const resumenDia = porDia.get(dia)!;
    resumenDia.total += p.monto;
    if (!resumenDia.porUsuario.has(p.autorId)) {
      resumenDia.porUsuario.set(p.autorId, { usuarioId: p.autorId, nombre: p.autorNombre, total: 0 });
    }
    resumenDia.porUsuario.get(p.autorId)!.total += p.monto;
  }

  const dias = Array.from(porDia.values())
    .map((d) => ({ fecha: d.fecha, total: d.total, porUsuario: Array.from(d.porUsuario.values()).sort((a, b) => b.total - a.total) }))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  return {
    dias,
    totalGeneral: detalle.reduce((s, p) => s + p.monto, 0),
    cantidadAbonos: detalle.length,
  };
}

// ─── Dashboard del Líder ──────────────────────────────────

export async function dashboardLider(usuarioId: string) {
  // Determinar el departamento del líder
  const [lider] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!lider?.departamentoId) {
    return { error: "El usuario no pertenece a un departamento" };
  }

  const deptoId = lider.departamentoId;
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const inicioSemana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - hoy.getDay());
  const en7Dias = new Date(hoy.getTime() + 7 * 86400000);

  // Miembros del equipo
  const miembros = await db
    .select({
      usuarioId: equipoMiembros.usuarioId,
      nombre: usuarios.nombre,
      cargo: equipoMiembros.cargo,
    })
    .from(equipoMiembros)
    .innerJoin(equipos, eq(equipoMiembros.equipoId, equipos.id))
    .innerJoin(usuarios, eq(equipoMiembros.usuarioId, usuarios.id))
    .where(eq(equipos.departamentoId, deptoId));

  // Tareas del departamento
  const tareasDepto = await db
    .select()
    .from(tareasOperativas)
    .where(eq(tareasOperativas.departamento, "Marketing"));

  // Producción del día (tareas completadas hoy)
  const produccionHoy = tareasDepto.filter(
    (t) => ["aprobado", "publicado"].includes(t.estado) && t.updatedAt && t.updatedAt >= inicioHoy
  ).length;

  // Producción semanal
  const produccionSemana = tareasDepto.filter(
    (t) => ["aprobado", "publicado"].includes(t.estado) && t.updatedAt && t.updatedAt >= inicioSemana
  ).length;

  // KPIs individuales
  const kpisIndividuales = await Promise.all(
    miembros.map(async (m) => {
      const tareasUsuario = tareasDepto.filter((t) => t.responsableId === m.usuarioId);
      return {
        usuarioId: m.usuarioId,
        nombre: m.nombre,
        cargo: m.cargo,
        total: tareasUsuario.length,
        completadas: tareasUsuario.filter((t) => ["aprobado", "publicado"].includes(t.estado)).length,
        enProgreso: tareasUsuario.filter((t) => t.estado === "en_proceso").length,
        atrasadas: tareasUsuario.filter(
          (t) => t.fechaLimite && t.fechaLimite < hoy && !["aprobado", "publicado", "cancelado"].includes(t.estado)
        ).length,
      };
    })
  );

  // Cuellos de botella (tareas en mismo estado > 5 días)
  const hace5Dias = new Date(hoy.getTime() - 5 * 86400000);
  const cuellos = tareasDepto.filter(
    (t) => !["aprobado", "publicado", "cancelado"].includes(t.estado) && t.updatedAt && t.updatedAt < hace5Dias
  );

  // Tareas vencidas
  const vencidas = tareasDepto.filter(
    (t) => t.fechaLimite && t.fechaLimite < hoy && !["aprobado", "publicado", "cancelado"].includes(t.estado)
  );

  // Próximas entregas (7 días)
  const proximasEntregas = tareasDepto.filter(
    (t) => t.fechaLimite && t.fechaLimite >= hoy && t.fechaLimite <= en7Dias && !["cancelado"].includes(t.estado)
  ).sort((a, b) => (a.fechaLimite?.getTime() ?? 0) - (b.fechaLimite?.getTime() ?? 0));

  // Próximas publicaciones
  const proximasPublicaciones = tareasDepto.filter(
    (t) => t.fechaPublicacion && t.fechaPublicacion >= hoy && t.fechaPublicacion <= en7Dias
  ).sort((a, b) => (a.fechaPublicacion?.getTime() ?? 0) - (b.fechaPublicacion?.getTime() ?? 0));

  return {
    departamento: "Marketing",
    miembros,
    produccionHoy,
    produccionSemana,
    totalTareas: tareasDepto.length,
    kpisIndividuales,
    cuellosDeBotella: cuellos.length,
    cuellos,
    vencidas: vencidas.length,
    proximasEntregas,
    proximasPublicaciones,
  };
}

// ─── Dashboard CEO ────────────────────────────────────────

export async function dashboardCEO() {
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const hace7d = new Date(hoy.getTime() - 7 * 86400000);

  // Todos los departamentos
  const deptos = await db.select().from(departamentos).where(eq(departamentos.activo, true));

  // Estado por departamento
  const estadoDeptos = await Promise.all(
    deptos.map(async (d) => {
      const tareas = await db
        .select()
        .from(tareasOperativas)
        .where(eq(tareasOperativas.departamento, d.nombre));

      const total = tareas.length;
      const completadas = tareas.filter((t) => ["aprobado", "publicado"].includes(t.estado)).length;
      const atrasadas = tareas.filter(
        (t) => t.fechaLimite && t.fechaLimite < hoy && !["aprobado", "publicado", "cancelado"].includes(t.estado)
      ).length;
      const produccionHoy = tareas.filter(
        (t) => ["aprobado", "publicado"].includes(t.estado) && t.updatedAt && t.updatedAt >= inicioHoy
      ).length;

      // Estado: saludable, advertencia, crítico
      let estado: "saludable" | "advertencia" | "critico" = "saludable";
      if (atrasadas > total * 0.3 || produccionHoy === 0) estado = "critico";
      else if (atrasadas > 0) estado = "advertencia";

      return {
        id: d.id,
        nombre: d.nombre,
        total,
        completadas,
        atrasadas,
        produccionHoy,
        estado,
      };
    })
  );

  // Actividad reciente global
  const actividad = await db
    .select({
      id: bitacoraAuditoria.id,
      entidad: bitacoraAuditoria.entidad,
      accion: bitacoraAuditoria.accion,
      autorId: bitacoraAuditoria.autorId,
      autorNombre: usuarios.nombre,
      fecha: bitacoraAuditoria.fecha,
    })
    .from(bitacoraAuditoria)
    .innerJoin(usuarios, eq(bitacoraAuditoria.autorId, usuarios.id))
    .orderBy(desc(bitacoraAuditoria.fecha))
    .limit(30);

  // Usuarios activos hoy
  const usuariosActivos = await db
    .select({
      usuarioId: bitacoraAuditoria.autorId,
      nombre: usuarios.nombre,
    })
    .from(bitacoraAuditoria)
    .innerJoin(usuarios, eq(bitacoraAuditoria.autorId, usuarios.id))
    .where(gte(bitacoraAuditoria.fecha, inicioHoy))
    .groupBy(bitacoraAuditoria.autorId);

  // Usuarios sin actividad > 7 días
  const todosUsuarios = await db.select().from(usuarios).where(eq(usuarios.activo, true));
  const usuariosSinActividad: { id: string; nombre: string }[] = [];
  for (const u of todosUsuarios) {
    const [ultimo] = await db
      .select({ fecha: bitacoraAuditoria.fecha })
      .from(bitacoraAuditoria)
      .where(eq(bitacoraAuditoria.autorId, u.id))
      .orderBy(desc(bitacoraAuditoria.fecha))
      .limit(1);
    if (!ultimo || ultimo.fecha < hace7d) {
      usuariosSinActividad.push({ id: u.id, nombre: u.nombre });
    }
  }

  // Alertas
  const alertas: string[] = [];
  estadoDeptos.filter((d) => d.estado === "critico").forEach((d) => {
    alertas.push(`⚠ ${d.nombre}: estado crítico (${d.atrasadas} tareas atrasadas)`);
  });

  // Riesgos
  const riesgos: string[] = [];
  if (usuariosSinActividad.length > 0) {
    riesgos.push(`${usuariosSinActividad.length} usuario(s) sin actividad en 7+ días`);
    usuariosSinActividad.forEach((u) => riesgos.push(`  • ${u.nombre}`));
  }

  return {
    departamentos: estadoDeptos,
    actividad: actividad.map((a) => ({ ...a, detalle: a.accion })),
    usuariosActivos: usuariosActivos.map((u) => u.nombre),
    usuariosSinActividad: usuariosSinActividad.map((u) => u.nombre),
    alertas,
    riesgos,
    totalTareasActivas: estadoDeptos.reduce((s, d) => s + d.total - d.completadas, 0),
    produccionTotalHoy: estadoDeptos.reduce((s, d) => s + d.produccionHoy, 0),
  };
}

// ─── Revenue Command Center ──────────────────────────────
// Responde "¿dónde está el dinero y qué hago hoy para moverlo?" con un solo vistazo:
// Vendido vs Cobrado (Cash Gap), lo vencido, lo programado y el pipeline caliente.

interface ItemDinero {
  registroId: string;
  personaNombre: string | null;
  pipelineNombre: string | null;
  monto: number;
  fecha: Date | null;
}

// Opportunity Score 0-100: pondera etapa, recencia, ticket, actividad y urgencia de cobro.
// Determinista (no IA) — cada factor tiene un peso documentado para que sea auditable.
function calcularScoreOportunidad(opts: {
  etapaOrden: number;
  valor: number | null;
  ultimaInteraccion?: Date;
  numInteracciones: number;
  montoVencido: number;
  saldoPendiente: number;
}): number {
  let score = 0;

  // Etapa 0-35: más avanzado = más cerca de cerrar
  score += Math.min(35, opts.etapaOrden * 5);

  // Recencia 0-20
  if (opts.ultimaInteraccion) {
    const horas = (Date.now() - opts.ultimaInteraccion.getTime()) / 3600000;
    if (horas < 24) score += 20;
    else if (horas < 72) score += 15;
    else if (horas < 168) score += 10;
    else if (horas < 336) score += 5;
  }

  // Ticket 0-20
  const v = opts.valor ?? 0;
  if (v >= 10000) score += 20;
  else if (v >= 5000) score += 15;
  else if (v >= 500) score += 10;
  else if (v > 0) score += 5;

  // Interacciones 0-10
  if (opts.numInteracciones >= 5) score += 10;
  else if (opts.numInteracciones >= 3) score += 7;
  else if (opts.numInteracciones >= 1) score += 4;

  // Urgencia de cobro 0-15
  if (opts.montoVencido > 0) score += 15;
  else if (opts.saldoPendiente > 0) score += 5;

  return Math.min(100, score);
}

function accionRecomendada(opts: { montoVencido: number; etapaOrden: number }): string {
  if (opts.montoVencido > 0) return "Cobrar pago vencido";
  if (opts.etapaOrden >= 7) return "Llamar hoy (cerrar)";
  if (opts.etapaOrden >= 5) return "Presentar propuesta";
  if (opts.etapaOrden >= 3) return "Hacer follow-up";
  return "Reactivar contacto";
}

export async function commandCenter() {
  const hoy = new Date();
  const en7 = new Date(hoy.getTime() + 7 * 86400000);
  const en30 = new Date(hoy.getTime() + 30 * 86400000);

  // Todos los deals con su contexto (persona, pipeline, etapa)
  const filas = await db
    .select({
      id: registros.id,
      personaId: registros.personaId,
      valor: registros.valor,
      proximoPago: registros.proximoPago,
      fechaProximoPago: registros.fechaProximoPago,
      personaNombre: personas.nombre,
      pipelineNombre: pipelines.nombre,
      etapaNombre: etapas.nombre,
      etapaOrden: etapas.orden,
      esGanada: etapas.esGanada,
      esPerdida: etapas.esPerdida,
    })
    .from(registros)
    .leftJoin(personas, eq(registros.personaId, personas.id))
    .leftJoin(pipelines, eq(registros.pipelineId, pipelines.id))
    .leftJoin(etapas, eq(registros.etapaId, etapas.id));

  const todosPagos = await db
    .select({ registroId: pagos.registroId, monto: pagos.monto, fecha: pagos.fecha })
    .from(pagos);

  const cobradoPorRegistro = new Map<string, number>();
  for (const p of todosPagos) {
    cobradoPorRegistro.set(p.registroId, (cobradoPorRegistro.get(p.registroId) ?? 0) + p.monto);
  }

  const cobradoTotal = todosPagos.reduce((s, p) => s + p.monto, 0);
  const inicioMes = inicioDeMes();
  const cobradoMes = todosPagos.filter((p) => p.fecha >= inicioMes).reduce((s, p) => s + p.monto, 0);

  // Para las alertas: última interacción por persona y personas con tarea de seguimiento pendiente.
  const interaccionesTodas = await db
    .select({ personaId: interacciones.personaId, fecha: interacciones.fecha })
    .from(interacciones);
  const ultimaInteraccion = new Map<string, Date>();
  const numInteracciones = new Map<string, number>();
  for (const i of interaccionesTodas) {
    const actual = ultimaInteraccion.get(i.personaId);
    if (!actual || i.fecha > actual) ultimaInteraccion.set(i.personaId, i.fecha);
    numInteracciones.set(i.personaId, (numInteracciones.get(i.personaId) ?? 0) + 1);
  }

  const tareasPendientes = await db
    .select({ personaId: tareasSeguimiento.personaId })
    .from(tareasSeguimiento)
    .where(eq(tareasSeguimiento.completado, false));
  const personasConTareaPendiente = new Set(tareasPendientes.map((t) => t.personaId));

  let vendido = 0;
  let vencido = 0;
  let proximos7dias = 0;
  let proximos30dias = 0;
  let pipelineCaliente = 0;

  const cobrosVencidos: ItemDinero[] = [];
  const pagosProgramados: ItemDinero[] = [];
  const ofertasCalientes: { registroId: string; personaNombre: string | null; pipelineNombre: string | null; monto: number; etapaNombre: string | null }[] = [];
  const oportunidades: { personaNombre: string | null; pipelineNombre: string | null; etapaNombre: string | null; valor: number | null; score: number; accion: string }[] = [];

  for (const f of filas) {
    if (f.esPerdida) continue; // perdido no cuenta ni como vendido ni como caliente

    const cobrado = cobradoPorRegistro.get(f.id) ?? 0;
    const saldo = f.valor != null ? Math.max(0, f.valor - cobrado) : 0;
    const montoVencido = f.fechaProximoPago && f.fechaProximoPago < hoy && saldo > 0 ? (f.proximoPago ?? 0) : 0;

    if (f.valor != null) vendido += f.valor;

    if (montoVencido > 0) {
      vencido += montoVencido;
      cobrosVencidos.push({ registroId: f.id, personaNombre: f.personaNombre, pipelineNombre: f.pipelineNombre, monto: montoVencido, fecha: f.fechaProximoPago });
    }

    const proxPago = f.proximoPago ?? 0;
    if (f.fechaProximoPago && f.fechaProximoPago >= hoy && f.fechaProximoPago <= en7 && proxPago > 0) {
      proximos7dias += proxPago;
      pagosProgramados.push({ registroId: f.id, personaNombre: f.personaNombre, pipelineNombre: f.pipelineNombre, monto: proxPago, fecha: f.fechaProximoPago });
    }
    if (f.fechaProximoPago && f.fechaProximoPago >= hoy && f.fechaProximoPago <= en30 && proxPago > 0) {
      proximos30dias += proxPago;
    }

    // Pipeline caliente: deal abierto en etapa avanzada (orden >= 4) con saldo y valor
    if (!f.esGanada && !f.esPerdida && f.valor != null && (f.etapaOrden ?? 0) >= 4 && saldo > 0) {
      pipelineCaliente += f.valor;
      ofertasCalientes.push({ registroId: f.id, personaNombre: f.personaNombre, pipelineNombre: f.pipelineNombre, monto: f.valor, etapaNombre: f.etapaNombre });
    }

    // Opportunity Score (solo deals abiertos)
    if (!f.esGanada && !f.esPerdida) {
      const score = calcularScoreOportunidad({
        etapaOrden: f.etapaOrden ?? 0,
        valor: f.valor,
        ultimaInteraccion: f.personaId ? ultimaInteraccion.get(f.personaId) : undefined,
        numInteracciones: f.personaId ? (numInteracciones.get(f.personaId) ?? 0) : 0,
        montoVencido,
        saldoPendiente: saldo,
      });
      oportunidades.push({
        personaNombre: f.personaNombre,
        pipelineNombre: f.pipelineNombre,
        etapaNombre: f.etapaNombre,
        valor: f.valor,
        score,
        accion: accionRecomendada({ montoVencido, etapaOrden: f.etapaOrden ?? 0 }),
      });
    }
  }

  oportunidades.sort((a, b) => b.score - a.score);

  const cashGap = Math.max(0, vendido - cobradoTotal);

  // ─── Alertas inteligentes ───
  const alertas: { severidad: "critica" | "advertencia" | "info"; titulo: string; detalle: string; enlace: string }[] = [];
  const hace72h = new Date(hoy.getTime() - 72 * 3600000);

  // 1. Pagos vencidos
  if (vencido > 0) {
    alertas.push({
      severidad: "critica",
      titulo: "Pagos vencidos",
      detalle: `${cobrosVencidos.length} pago(s) vencido(s) por $${vencido.toLocaleString("en-US")}`,
      enlace: "/command-center",
    });
  }

  // 2. Oportunidades calientes sin contacto en 72h
  const hotSinContacto = filas.filter((f) => {
    if (f.esGanada || f.esPerdida) return false;
    if (f.valor == null || f.valor <= 0) return false;
    if ((f.etapaOrden ?? 0) < 4) return false;
    const ult = f.personaId ? ultimaInteraccion.get(f.personaId) : undefined;
    return !ult || ult < hace72h;
  });
  const valorHotSinContacto = hotSinContacto.reduce((s, f) => s + (f.valor ?? 0), 0);
  if (valorHotSinContacto > 0) {
    alertas.push({
      severidad: "critica",
      titulo: "Oportunidades calientes sin contacto",
      detalle: `$${valorHotSinContacto.toLocaleString("en-US")} en oportunidades HOT llevan +72h sin contacto`,
      enlace: "/pipelines",
    });
  }

  // 3. Deals sin valor asignado
  const sinValor = filas.filter((f) => !f.esGanada && !f.esPerdida && f.valor == null);
  if (sinValor.length > 0) {
    alertas.push({
      severidad: "advertencia",
      titulo: "Deals sin valor",
      detalle: `${sinValor.length} oportunidad(es) no tienen valor asignado`,
      enlace: "/pipelines",
    });
  }

  // 4. Ofertas sin próxima tarea de seguimiento
  const sinSeguimiento = filas.filter((f) => {
    if (f.esGanada || f.esPerdida) return false;
    const enOferta = f.etapaNombre === "Oferta" || f.etapaNombre === "Acción";
    if (!enOferta) return false;
    return !(f.personaId && personasConTareaPendiente.has(f.personaId));
  });
  if (sinSeguimiento.length > 0) {
    alertas.push({
      severidad: "advertencia",
      titulo: "Ofertas sin seguimiento",
      detalle: `${sinSeguimiento.length} oferta(s) no tienen próxima tarea agendada`,
      enlace: "/pipelines",
    });
  }

  // 5. Sin conversión medida
  const ganados = filas.filter((f) => f.esGanada).length;
  const perdidos = filas.filter((f) => f.esPerdida).length;
  if (ganados === 0 && perdidos === 0) {
    alertas.push({
      severidad: "info",
      titulo: "Sin conversión medida",
      detalle: "No hay deals ganados/perdidos — no se puede medir la conversión",
      enlace: "/pipelines",
    });
  }

  // Top 5 acciones por impacto: vencido (95%), programado (80%), caliente (55%).
  // El Opportunity Score real (Fase 5) reemplazará esta probabilidad simple.
  const acciones = [
    ...cobrosVencidos.map((c) => ({ personaNombre: c.personaNombre, pipelineNombre: c.pipelineNombre, monto: c.monto, tipo: "vencido" as const, probabilidad: 95 })),
    ...pagosProgramados.map((p) => ({ personaNombre: p.personaNombre, pipelineNombre: p.pipelineNombre, monto: p.monto, tipo: "programado" as const, probabilidad: 80 })),
    ...ofertasCalientes.map((o) => ({ personaNombre: o.personaNombre, pipelineNombre: o.pipelineNombre, monto: o.monto, tipo: "caliente" as const, probabilidad: 55 })),
  ]
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5);

  return {
    resumen: { vendido, cobrado: cobradoTotal, cobradoMes, cashGap, vencido, proximos7dias, proximos30dias, pipelineCaliente },
    moneyToday: { cobrosVencidos, pagosProgramados, ofertasCalientes },
    topAcciones: acciones,
    alertas,
    oportunidades,
  };
}

// ─── Ask BOS (asistente por reglas) ─────────────────────
// Reconoce preguntas clave en lenguaje natural y responde con los datos reales. Sin IA externa:
// determinista, gratis e instantáneo. Reutiliza commandCenter() para no duplicar consultas.

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export async function askBos(pregunta: string) {
  const q = normalizar(pregunta);
  const cc = await commandCenter();
  const { resumen, topAcciones, oportunidades } = cc;

  // 1. Dinero más fácil de cobrar
  if (/cobr|dinero|vencid|saldo|cobro/.test(q)) {
    const vencidos = [...cc.moneyToday.cobrosVencidos].sort((a, b) => b.monto - a.monto);
    if (vencidos.length === 0) {
      const linea = topAcciones[0];
      return {
        respuesta: `No tienes pagos vencidos. 👌\n\nEl dinero más accesible hoy es: ${linea ? `${linea.personaNombre} — ${usd(linea.monto)} (${linea.tipo})` : "nada pendiente."}`,
      };
    }
    const total = vencidos.reduce((s, c) => s + c.monto, 0);
    const lista = vencidos.slice(0, 3).map((c, i) => `${i + 1}. ${c.personaNombre} — ${usd(c.monto)}`).join("\n");
    return {
      respuesta: `💰 El dinero más fácil de cobrar hoy son ${vencidos.length} pago(s) vencido(s) por ${usd(total)}.\n\nEmpieza por:\n${lista}`,
    };
  }

  // 2. Prospectos más calientes
  if (/caliente|prospect|ranking|oportunidad|score/.test(q)) {
    if (oportunidades.length === 0) return { respuesta: "No hay oportunidades abiertas todavía." };
    const lista = oportunidades.slice(0, 10).map((o, i) => `${i + 1}. ${o.personaNombre} — 🔥 ${o.score}/100 — ${usd(o.valor ?? 0)} — ${o.accion}`).join("\n");
    return { respuesta: `🔥 Tus 10 prospectos más calientes:\n\n${lista}` };
  }

  // 3. Qué hacer en 2 horas
  if (/hora|hago|prioridad|hacer/.test(q)) {
    if (topAcciones.length === 0) return { respuesta: "No hay acciones urgentes hoy. Tu pipeline está al día. 👌" };
    const lista = topAcciones.slice(0, 3).map((a, i) => `${i + 1}. ${a.personaNombre} — ${usd(a.monto)} (${a.tipo})`).join("\n");
    return { respuesta: `⏱️ En 2 horas, haz esto (máximo retorno):\n\n${lista}` };
  }

  // 4. Qué línea produce más este mes
  if (/unidad|produce|produciendo|linea/.test(q)) {
    const inicioMes = inicioDeMes();
    const pagosMes = await db
      .select({ monto: pagos.monto, pipelineNombre: pipelines.nombre })
      .from(pagos)
      .innerJoin(registros, eq(pagos.registroId, registros.id))
      .innerJoin(pipelines, eq(registros.pipelineId, pipelines.id))
      .where(gte(pagos.fecha, inicioMes));
    const porPipeline = new Map<string, number>();
    for (const p of pagosMes) {
      porPipeline.set(p.pipelineNombre, (porPipeline.get(p.pipelineNombre) ?? 0) + p.monto);
    }
    const orden = Array.from(porPipeline.entries()).sort((a, b) => b[1] - a[1]);
    if (orden.length === 0) return { respuesta: "No hay cobros registrados este mes todavía." };
    const lista = orden.slice(0, 5).map(([nombre, monto], i) => `${i + 1}. ${nombre} — ${usd(monto)}`).join("\n");
    return { respuesta: `📊 Producción este mes por línea:\n\n${lista}` };
  }

  // 5. Qué oferta empujar esta semana
  if (/oferta|empujar|semana/.test(q)) {
    const top = oportunidades[0];
    const lista = oportunidades.slice(0, 3).map((o, i) => `${i + 1}. ${o.pipelineNombre} — ${usd(o.valor ?? 0)} (${o.accion})`).join("\n");
    return {
      respuesta: `📈 La oferta a empujar esta semana es ${top ? top.pipelineNombre : "—"}.\n\nTop oportunidades:\n${lista}\n\nPróximos 7 días por cobrar: ${usd(resumen.proximos7dias)}`,
    };
  }

  // Fallback: resumen
  return {
    respuesta: `📊 Resumen de hoy:\n\nVendido: ${usd(resumen.vendido)}\nCobrado: ${usd(resumen.cobrado)}\n💰 Cash Gap: ${usd(resumen.cashGap)}\nVencido: ${usd(resumen.vencido)}\n\nTu próxima acción: ${topAcciones[0] ? `${topAcciones[0].personaNombre} — ${usd(topAcciones[0].monto)}` : "pipeline al día 👌"}`,
  };
}

// ─── CEO Mode (5 bloques) ────────────────────────────────
// Vista mínima para un vistazo de 10 segundos: DINERO, VENTAS, PIPELINE, EQUIPO y
// PRÓXIMA DECISIÓN + los 5 movimientos del día. Reutiliza commandCenter() para no duplicar.
export async function ceoMode() {
  const cc = await commandCenter();
  const { resumen, oportunidades, topAcciones } = cc;

  // ── VENTAS ──
  const filas = await db
    .select({ valor: registros.valor, esGanada: etapas.esGanada })
    .from(registros)
    .innerJoin(etapas, eq(registros.etapaId, etapas.id));
  const deals = filas.length;
  const ganados = filas.filter((f) => f.esGanada).length;
  const conversion = deals > 0 ? Math.round((ganados / deals) * 100) : 0;
  const ticketPromedio = deals > 0 ? Math.round(resumen.vendido / deals) : 0;

  // ── EQUIPO ──
  const usuariosTodos = await db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios);
  const nombrePorId = new Map(usuariosTodos.map((u) => [u.id, u.nombre]));

  // Top performer: mayor cobrado del mes
  const inicioMes = inicioDeMes();
  const pagosMes = await db
    .select({ autorId: pagos.autorId, monto: pagos.monto })
    .from(pagos)
    .where(gte(pagos.fecha, inicioMes));
  const cobradoPorUsuario = new Map<string, number>();
  for (const p of pagosMes) cobradoPorUsuario.set(p.autorId, (cobradoPorUsuario.get(p.autorId) ?? 0) + p.monto);

  let topPerformer: string | null = null;
  let topMonto = 0;
  for (const [autorId, monto] of cobradoPorUsuario) {
    if (monto > topMonto) { topMonto = monto; topPerformer = nombrePorId.get(autorId) ?? null; }
  }

  // Cuello de botella: quien acumula más dinero vencido en sus deals abiertos
  const hoy = new Date();
  const todosPagos = await db.select({ registroId: pagos.registroId, monto: pagos.monto }).from(pagos);
  const cobradoPorRegistro = new Map<string, number>();
  for (const p of todosPagos) cobradoPorRegistro.set(p.registroId, (cobradoPorRegistro.get(p.registroId) ?? 0) + p.monto);

  const dealsAbiertos = await db
    .select({
      id: registros.id,
      valor: registros.valor,
      proximoPago: registros.proximoPago,
      fechaProximoPago: registros.fechaProximoPago,
      responsableId: personas.responsableId,
    })
    .from(registros)
    .innerJoin(personas, eq(registros.personaId, personas.id))
    .innerJoin(etapas, eq(registros.etapaId, etapas.id))
    .where(and(eq(etapas.esPerdida, false), eq(etapas.esGanada, false)));

  const vencidoPorResponsable = new Map<string, number>();
  for (const d of dealsAbiertos) {
    const cobrado = cobradoPorRegistro.get(d.id) ?? 0;
    const saldo = d.valor != null ? Math.max(0, d.valor - cobrado) : 0;
    const montoVencido = d.fechaProximoPago && d.fechaProximoPago < hoy && saldo > 0 ? (d.proximoPago ?? 0) : 0;
    if (montoVencido > 0 && d.responsableId) {
      vencidoPorResponsable.set(d.responsableId, (vencidoPorResponsable.get(d.responsableId) ?? 0) + montoVencido);
    }
  }

  let cuelloBotella: string | null = null;
  let maxVencido = 0;
  for (const [respId, monto] of vencidoPorResponsable) {
    if (monto > maxVencido) { maxVencido = monto; cuelloBotella = nombrePorId.get(respId) ?? null; }
  }

  // ── PRÓXIMA DECISIÓN ──
  const top = oportunidades[0] ?? null;
  const proximaDecision = top
    ? { personaNombre: top.personaNombre, accion: top.accion, pipelineNombre: top.pipelineNombre, valor: top.valor }
    : null;

  return {
    dinero: { cobrado: resumen.cobrado, vendido: resumen.vendido, vencido: resumen.vencido },
    ventas: { deals, conversion, ticketPromedio },
    pipeline: { total: resumen.vendido, caliente: resumen.pipelineCaliente },
    equipo: { topPerformer, cuelloBotella },
    proximaDecision,
    topAcciones,
  };
}
