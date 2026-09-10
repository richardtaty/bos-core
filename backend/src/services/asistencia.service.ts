import { and, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import { db } from "../db/client";
import { empleados, horarioDias, horarios, jornadasLaborales, usuarios } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";
import {
  diaSemanaDeYmd,
  diasDelMes,
  esFechaValida,
  esMesValido,
  fechaET,
  hoyET,
  mesActualET,
  minutosEntreHHMM,
} from "../lib/fechas-negocio";

// ─── Recursos Humanos → Asistencia ──────────────────────────────
//
// Registra tiempo real trabajado: cuándo entra y sale una persona, y cuánto dura cada
// jornada. NO calcula dinero: ni sueldo, ni tarifa por hora, ni nómina, ni pagos.
// Tampoco hay check-ins, alertas ni cierre automático de jornadas.
//
// Todo cuelga de IDs reales: `jornadas_laborales.user_id` → `usuarios.id` (la persona del
// CRM) y `empleado_id` → `empleados.id` (su perfil laboral de la fase 1). Nunca por nombre.
//
// Identidad: las acciones de "mi jornada" reciben el userId del TOKEN, jamás del cuerpo de
// la petición — así nadie puede registrar asistencia de otra persona manipulando el request.

const MINUTOS_DIA = 24 * 60;
/** Un día laborable razonable no pasa de 24 h; evita datos absurdos por error de tipeo. */
const MAX_MINUTOS_ESPERADOS = MINUTOS_DIA;

export class JornadaYaActivaError extends Error {}
export class SinJornadaActivaError extends Error {}
export class HorarioInvalidoError extends Error {}
export class FiltroInvalidoError extends Error {}

export interface SesionJornadaDTO {
  id: string;
  /** ID real de la persona en el CRM. */
  userId: string;
  /** ID del perfil laboral (relación estructurada para el futuro Control de Sueldo). */
  empleadoId: string;
  personaNombre: string;
  startedAt: string;
  /** null mientras la jornada siga abierta. */
  endedAt: string | null;
  estado: "ABIERTA" | "FINALIZADA";
  /** Segundos reales trabajados. null si la jornada está abierta (no se inventa duración). */
  duracionSegundos: number | null;
  duracionMinutos: number | null;
  /** Día calendario del negocio (Florida) en que INICIÓ la jornada. */
  fecha: string;
  /** Minutos que ese día tenía programados según el horario de la persona. */
  minutosProgramados: number;
}

export interface ResumenAsistenciaDTO {
  sesionesFinalizadas: number;
  /** Jornadas sin terminar: se cuentan aparte y NO suman al tiempo trabajado. */
  sesionesAbiertas: number;
  totalSegundos: number;
  totalMinutos: number;
  /** Horas programadas del período. null si no se pidió una persona concreta. */
  minutosProgramados: number | null;
  /** false = la persona no tiene horario configurado todavía (no se inventan horas). */
  horarioConfigurado: boolean;
  /** Rango realmente consultado, en días del negocio. */
  desde: string;
  hasta: string;
}

export interface AsistenciaDTO {
  sesiones: SesionJornadaDTO[];
  resumen: ResumenAsistenciaDTO;
}

/** Filtros de consulta de asistencia. Todos opcionales: sin filtros, es el historial global. */
export interface FiltrosAsistencia {
  userId?: string;
  mes?: string;
  desde?: string;
  hasta?: string;
}

// ─── Perfil laboral ─────────────────────────────────────────────

/**
 * Devuelve el `empleado_id` de una persona, creando su perfil laboral si aún no existe.
 * NO crea a la persona: solo la fila de RRHH que la enlaza (misma idea de la fase 1, donde
 * el perfil nace al primer dato laboral). Se hace aquí para que toda jornada quede ligada a
 * un empleado real desde el primer segundo, lista para el futuro Control de Sueldo.
 */
export async function asegurarEmpleado(userId: string): Promise<string> {
  const [perfil] = await db.select().from(empleados).where(eq(empleados.userId, userId));
  if (perfil) return perfil.id;

  const ahora = new Date();
  const id = crypto.randomUUID();
  await db.insert(empleados).values({
    id,
    userId,
    estadoLaboral: "ACTIVO",
    createdAt: ahora,
    updatedAt: ahora,
  });
  return id;
}

// ─── Horario esperado ───────────────────────────────────────────

export interface DiaHorarioDTO {
  diaSemana: number;
  laborable: boolean;
  horaInicio: string | null;
  horaFin: string | null;
  minutosEsperados: number;
}

/** Lo que llega al guardar: los campos opcionales pueden venir ausentes. */
export interface DiaHorarioInput {
  diaSemana: number;
  laborable: boolean;
  horaInicio?: string | null;
  horaFin?: string | null;
  minutosEsperados?: number;
}

export interface HorarioDTO {
  id: string | null;
  nombre: string;
  esPredeterminado: boolean;
  /** Siempre los 7 días, para que la UI pinte la semana completa aunque falten filas. */
  dias: DiaHorarioDTO[];
}

const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function nombreDia(diaSemana: number): string {
  return NOMBRES_DIA[diaSemana] ?? `Día ${diaSemana}`;
}

/** Los 7 días con valores neutros (nada laborable, 0 minutos) — sin inventar horarios. */
function diasVacios(): DiaHorarioDTO[] {
  return Array.from({ length: 7 }, (_, diaSemana) => ({
    diaSemana,
    laborable: false,
    horaInicio: null,
    horaFin: null,
    minutosEsperados: 0,
  }));
}

/** El horario predeterminado, o null si todavía nadie lo ha configurado. */
async function horarioPredeterminado(): Promise<HorarioDTO | null> {
  const [horario] = await db.select().from(horarios).where(eq(horarios.esPredeterminado, true));
  if (!horario) return null;

  const filas = await db.select().from(horarioDias).where(eq(horarioDias.horarioId, horario.id));
  const porDia = new Map(filas.map((f) => [f.diaSemana, f]));
  return {
    id: horario.id,
    nombre: horario.nombre,
    esPredeterminado: horario.esPredeterminado,
    dias: diasVacios().map((base) => {
      const fila = porDia.get(base.diaSemana);
      if (!fila) return base;
      return {
        diaSemana: fila.diaSemana,
        laborable: fila.laborable,
        horaInicio: fila.horaInicio,
        horaFin: fila.horaFin,
        minutosEsperados: fila.minutosEsperados,
      };
    }),
  };
}

/** El horario que rige a una persona: el suyo si lo tiene, si no el predeterminado. */
async function horarioDeUsuario(userId: string): Promise<HorarioDTO | null> {
  const [perfil] = await db.select().from(empleados).where(eq(empleados.userId, userId));
  if (perfil?.horarioId) {
    const [horario] = await db.select().from(horarios).where(eq(horarios.id, perfil.horarioId));
    if (horario) {
      const filas = await db.select().from(horarioDias).where(eq(horarioDias.horarioId, horario.id));
      const porDia = new Map(filas.map((f) => [f.diaSemana, f]));
      return {
        id: horario.id,
        nombre: horario.nombre,
        esPredeterminado: horario.esPredeterminado,
        dias: diasVacios().map((base) => {
          const fila = porDia.get(base.diaSemana);
          if (!fila) return base;
          return {
            diaSemana: fila.diaSemana,
            laborable: fila.laborable,
            horaInicio: fila.horaInicio,
            horaFin: fila.horaFin,
            minutosEsperados: fila.minutosEsperados,
          };
        }),
      };
    }
  }
  return horarioPredeterminado();
}

/** Lee el horario predeterminado para la pantalla de RRHH → Asistencia. */
export async function obtenerHorarioPredeterminado(): Promise<HorarioDTO> {
  const horario = await horarioPredeterminado();
  if (horario) return horario;
  return { id: null, nombre: "Jornada estándar", esPredeterminado: true, dias: diasVacios() };
}

/**
 * Guarda el horario predeterminado (upsert). Cada día se guarda como fila propia: la semana
 * nunca se almacena como texto libre. Los minutos esperados se derivan de la hora de inicio
 * y fin cuando no vienen explícitos, así `minutos_esperados` siempre es un número real.
 */
export async function guardarHorarioPredeterminado(
  input: { nombre?: string; dias: DiaHorarioInput[] },
  autorId: string,
): Promise<HorarioDTO> {
  const ahora = new Date();
  let horario = (await db.select().from(horarios).where(eq(horarios.esPredeterminado, true)))[0];

  if (!horario) {
    const id = crypto.randomUUID();
    await db.insert(horarios).values({
      id,
      nombre: input.nombre?.trim() || "Jornada estándar",
      esPredeterminado: true,
      createdAt: ahora,
      updatedAt: ahora,
    });
    horario = (await db.select().from(horarios).where(eq(horarios.id, id)))[0]!;
  } else if (input.nombre?.trim() && input.nombre.trim() !== horario.nombre) {
    await db.update(horarios).set({ nombre: input.nombre.trim(), updatedAt: ahora }).where(eq(horarios.id, horario.id));
  }

  for (const dia of input.dias) {
    if (dia.diaSemana < 0 || dia.diaSemana > 6) {
      throw new HorarioInvalidoError("Día de la semana inválido.");
    }

    // Los minutos esperados salen del horario cuando está definido; si no, de lo que se
    // indique a mano. Un día no laborable nunca tiene minutos esperados.
    let minutos = dia.laborable ? dia.minutosEsperados ?? 0 : 0;
    if (dia.laborable && !dia.minutosEsperados) {
      minutos = minutosEntreHHMM(dia.horaInicio, dia.horaFin) ?? 0;
    }
    if (minutos < 0 || minutos > MAX_MINUTOS_ESPERADOS) {
      throw new HorarioInvalidoError(`La jornada del ${nombreDia(dia.diaSemana)} no puede superar 24 horas.`);
    }

    const valores = {
      laborable: dia.laborable,
      horaInicio: dia.laborable ? dia.horaInicio?.trim() || null : null,
      horaFin: dia.laborable ? dia.horaFin?.trim() || null : null,
      minutosEsperados: minutos,
    };

    const [existente] = await db
      .select()
      .from(horarioDias)
      .where(and(eq(horarioDias.horarioId, horario.id), eq(horarioDias.diaSemana, dia.diaSemana)));

    if (existente) {
      await db.update(horarioDias).set(valores).where(eq(horarioDias.id, existente.id));
    } else {
      await db.insert(horarioDias).values({ id: crypto.randomUUID(), horarioId: horario.id, diaSemana: dia.diaSemana, ...valores });
    }
  }

  await registrarAuditoria({
    entidad: "HorarioRRHH",
    entidadId: horario.id,
    accion: "Jornada esperada actualizada",
    autorId,
  });

  return obtenerHorarioPredeterminado();
}

/**
 * Minutos programados para una persona dentro de un mes: suma la jornada esperada de cada
 * día del mes según su día de la semana. Así el sábado de media jornada cuenta como media
 * jornada y el domingo no laborable no suma — nunca se asume "un día = jornada completa".
 */
function minutosProgramadosEnDias(horario: HorarioDTO | null, dias: string[]): number {
  if (!horario || horario.id === null) return 0;
  const porDia = new Map(horario.dias.map((d) => [d.diaSemana, d]));
  let minutos = 0;
  for (const ymd of dias) {
    const dia = porDia.get(diaSemanaDeYmd(ymd));
    if (dia?.laborable) minutos += dia.minutosEsperados;
  }
  return minutos;
}

/** Minutos programados para una persona en un mes completo. */
export async function minutosProgramadosDelMes(userId: string, mes: string): Promise<{ minutos: number; configurado: boolean }> {
  const horario = await horarioDeUsuario(userId);
  // `!= null` (no `!== null`): sin horario configurado la función devuelve null y el id no
  // existe. Comparar solo contra null daba `true` y hacía creer que sí había jornada definida.
  return { minutos: minutosProgramadosEnDias(horario, diasDelMes(mes)), configurado: horario?.id != null };
}

export interface TotalesPeriodoDTO {
  minutosProgramados: number;
  /** false = esa persona todavía no tiene jornada esperada configurada. */
  horarioConfigurado: boolean;
  /** SOLO de jornadas terminadas. Una jornada abierta no aporta segundos. */
  segundosRegistrados: number;
  sesionesFinalizadas: number;
  sesionesAbiertas: number;
}

/**
 * Totales de un mes para VARIAS personas de una sola pasada. Es la fuente de verdad que
 * consume Control de Sueldo: así las horas que se pagan son exactamente las mismas que se
 * ven en Asistencia, sin un segundo contador que pueda desincronizarse.
 *
 * Las jornadas ABIERTAS se cuentan aparte y NO suman segundos: no se inventa una salida.
 */
export async function totalesDelMes(userIds: string[], mes: string): Promise<Map<string, TotalesPeriodoDTO>> {
  const { desde, hasta } = resolverRango({ mes });
  const inicio = fechaAInstante(desde, "00:00");
  const fin = fechaAInstante(hasta, "00:00");
  fin.setDate(fin.getDate() + 1);

  const rango = [gte(jornadasLaborales.startedAt, inicio), lt(jornadasLaborales.startedAt, fin)];
  const filas = await db
    .select()
    .from(jornadasLaborales)
    .where(userIds.length > 0 ? and(...rango, inArray(jornadasLaborales.userId, userIds)) : and(...rango));

  const porUsuario = new Map<string, TotalesPeriodoDTO>();
  for (const id of userIds) {
    porUsuario.set(id, {
      minutosProgramados: 0,
      horarioConfigurado: false,
      segundosRegistrados: 0,
      sesionesFinalizadas: 0,
      sesionesAbiertas: 0,
    });
  }

  for (const fila of filas) {
    const acumulado = porUsuario.get(fila.userId);
    if (!acumulado) continue; // persona fuera del filtro pedido
    if (fila.endedAt === null) {
      acumulado.sesionesAbiertas += 1;
      continue;
    }
    acumulado.sesionesFinalizadas += 1;
    acumulado.segundosRegistrados += Math.max(0, Math.round((fila.endedAt.getTime() - fila.startedAt.getTime()) / 1000));
  }

  // El horario de cada persona se resuelve una vez y se reutiliza para todo el mes.
  for (const [userId, acumulado] of porUsuario) {
    const { minutos, configurado } = await minutosProgramadosDelMes(userId, mes);
    acumulado.minutosProgramados = minutos;
    acumulado.horarioConfigurado = configurado;
  }

  return porUsuario;
}

/** Minutos programados de UN día concreto (objetivo del día en curso). */
async function minutosProgramadosDelDia(userId: string, ymd: string): Promise<number> {
  const horario = await horarioDeUsuario(userId);
  return minutosProgramadosEnDias(horario, [ymd]);
}

// ─── Sesiones de jornada ────────────────────────────────────────

function aDTO(fila: typeof jornadasLaborales.$inferSelect, personaNombre: string, minutosProgramados: number): SesionJornadaDTO {
  const abierta = fila.endedAt === null;
  const segundos = abierta ? null : Math.max(0, Math.round((fila.endedAt!.getTime() - fila.startedAt.getTime()) / 1000));
  return {
    id: fila.id,
    userId: fila.userId,
    empleadoId: fila.empleadoId,
    personaNombre,
    startedAt: fila.startedAt.toISOString(),
    endedAt: fila.endedAt ? fila.endedAt.toISOString() : null,
    estado: abierta ? "ABIERTA" : "FINALIZADA",
    duracionSegundos: segundos,
    duracionMinutos: segundos === null ? null : Math.round(segundos / 60),
    fecha: fechaET(fila.startedAt),
    minutosProgramados,
  };
}

/** La jornada abierta de una persona, o null. Nunca puede haber más de una. */
export async function jornadaAbierta(userId: string) {
  const [fila] = await db
    .select()
    .from(jornadasLaborales)
    .where(and(eq(jornadasLaborales.userId, userId), isNull(jornadasLaborales.endedAt)));
  return fila ?? null;
}

/**
 * INICIAR JORNADA. El momento lo pone el servidor, nunca el navegador.
 * Regla dura: una persona no puede tener dos jornadas abiertas. Se valida aquí y, además,
 * el índice único parcial de la BD lo impide aunque dos peticiones entren a la vez.
 */
export async function iniciarJornada(userId: string): Promise<SesionJornadaDTO> {
  const [persona] = await db.select().from(usuarios).where(eq(usuarios.id, userId));
  if (!persona) throw new SinJornadaActivaError("Usuario no encontrado.");

  if (await jornadaAbierta(userId)) {
    throw new JornadaYaActivaError("Ya tienes una jornada abierta. Termínala antes de iniciar otra.");
  }

  const empleadoId = await asegurarEmpleado(userId);
  const ahora = new Date();
  const id = crypto.randomUUID();

  try {
    await db.insert(jornadasLaborales).values({
      id,
      userId,
      empleadoId,
      startedAt: ahora,
      createdAt: ahora,
      updatedAt: ahora,
    });
  } catch (e) {
    // Choque contra el índice de "una sola jornada abierta": dos clics simultáneos.
    if (String((e as Error)?.message ?? "").includes("UNIQUE")) {
      throw new JornadaYaActivaError("Ya tienes una jornada abierta. Termínala antes de iniciar otra.");
    }
    throw e;
  }

  await registrarAuditoria({
    entidad: "JornadaRRHH",
    entidadId: id,
    accion: "Jornada iniciada",
    autorId: userId,
  });

  const minutos = await minutosProgramadosDelDia(userId, fechaET(ahora));
  return aDTO({ id, userId, empleadoId, startedAt: ahora, endedAt: null, createdAt: ahora, updatedAt: ahora }, persona.nombre, minutos);
}

/**
 * TERMINAR JORNADA. Cierra la MISMA sesión abierta (no crea una nueva para la salida) y
 * sella ended_at con la hora del servidor. Si no hay jornada abierta, es un error: nunca se
 * inventa una salida.
 */
export async function terminarJornada(userId: string): Promise<SesionJornadaDTO> {
  const [persona] = await db.select().from(usuarios).where(eq(usuarios.id, userId));
  if (!persona) throw new SinJornadaActivaError("Usuario no encontrado.");

  const abierta = await jornadaAbierta(userId);
  if (!abierta) throw new SinJornadaActivaError("No tienes una jornada abierta que terminar.");

  const ahora = new Date();
  await db
    .update(jornadasLaborales)
    .set({ endedAt: ahora, updatedAt: ahora })
    .where(eq(jornadasLaborales.id, abierta.id));

  await registrarAuditoria({
    entidad: "JornadaRRHH",
    entidadId: abierta.id,
    accion: "Jornada terminada",
    autorId: userId,
  });

  const minutos = await minutosProgramadosDelDia(userId, fechaET(abierta.startedAt));
  return aDTO({ ...abierta, endedAt: ahora, updatedAt: ahora }, persona.nombre, minutos);
}

/** Rango de días del negocio que cubre una consulta. */
function resolverRango(filtros: FiltrosAsistencia): { desde: string; hasta: string; mes: string | null } {
  // Un filtro mal escrito NO se ignora en silencio: devolver otro mes sin avisar haría que el
  // usuario creyera estar viendo el mes que pidió. Mejor un error claro.
  if (filtros.mes) {
    if (!esMesValido(filtros.mes)) {
      throw new FiltroInvalidoError("El mes debe tener el formato AAAA-MM (por ejemplo 2026-09).");
    }
    const dias = diasDelMes(filtros.mes);
    return { desde: dias[0], hasta: dias[dias.length - 1], mes: filtros.mes };
  }
  if (filtros.desde || filtros.hasta) {
    if (!filtros.desde || !filtros.hasta || !esFechaValida(filtros.desde) || !esFechaValida(filtros.hasta)) {
      throw new FiltroInvalidoError("El rango necesita 'desde' y 'hasta' en formato AAAA-MM-DD.");
    }
    if (filtros.desde > filtros.hasta) {
      throw new FiltroInvalidoError("La fecha 'desde' no puede ser posterior a 'hasta'.");
    }
    return { desde: filtros.desde, hasta: filtros.hasta, mes: null };
  }
  const mes = mesActualET();
  const dias = diasDelMes(mes);
  return { desde: dias[0], hasta: dias[dias.length - 1], mes };
}

/**
 * Historial de jornadas + totales del período.
 *
 * Se filtra por día del negocio (Florida): un turno que empieza a las 9pm ET pertenece a ese
 * día, no al siguiente. El rango se aplica sobre `started_at` en UTC equivalente a las 00:00
 * y 24:00 de Florida, para que la frontera del mes coincida con lo que ve el usuario.
 *
 * Las jornadas ABIERTAS se listan pero NO suman tiempo trabajado (no se inventa una duración).
 */
export async function listarAsistencia(filtros: FiltrosAsistencia): Promise<AsistenciaDTO> {
  const { desde, hasta, mes } = resolverRango(filtros);

  // Límites reales del rango, en el instante UTC que corresponde a la medianoche de Florida.
  const inicio = fechaAInstante(desde, "00:00");
  const fin = fechaAInstante(hasta, "00:00");
  fin.setDate(fin.getDate() + 1);

  const condiciones = [gte(jornadasLaborales.startedAt, inicio), lt(jornadasLaborales.startedAt, fin)];
  if (filtros.userId) condiciones.push(eq(jornadasLaborales.userId, filtros.userId));

  const filas = await db
    .select()
    .from(jornadasLaborales)
    .where(and(...condiciones));

  const personas = await db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios);
  const nombrePorId = new Map(personas.map((p) => [p.id, p.nombre]));

  // El horario de cada persona se resuelve UNA vez y se reutiliza: sirve tanto para los
  // minutos programados de cada jornada como para el total programado del período.
  const cacheHorario = new Map<string, HorarioDTO | null>();
  async function horarioDe(userId: string): Promise<HorarioDTO | null> {
    if (!cacheHorario.has(userId)) cacheHorario.set(userId, await horarioDeUsuario(userId));
    return cacheHorario.get(userId) ?? null;
  }

  // Orden por el instante real (no por texto de fecha): más reciente primero.
  const sesiones = filas
    .map((f) => aDTO(f, nombrePorId.get(f.userId) ?? "Usuario eliminado", 0))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  // El objetivo programado de cada jornada se completa después de ordenar, para no hacer
  // trabajo de más sobre una lista que primero hay que acotar.
  for (const s of sesiones) {
    s.minutosProgramados = minutosProgramadosEnDias(await horarioDe(s.userId), [s.fecha]);
  }

  // Horas programadas del período: solo tiene sentido para una persona concreta (el
  // listado global mezcla horarios distintos). Sin persona, queda en null y la UI lo dice.
  let minutosProgramados: number | null = null;
  let horarioConfigurado = false;
  if (filtros.userId) {
    const horario = await horarioDe(filtros.userId);
    horarioConfigurado = horario?.id !== null;
    minutosProgramados = minutosProgramadosEnDias(horario, diasDelMes(mes ?? mesActualET()));
  }

  const finalizadas = sesiones.filter((s) => s.estado === "FINALIZADA");
  const totalSegundos = finalizadas.reduce((acc, s) => acc + (s.duracionSegundos ?? 0), 0);

  return {
    sesiones,
    resumen: {
      sesionesFinalizadas: finalizadas.length,
      sesionesAbiertas: sesiones.length - finalizadas.length,
      totalSegundos,
      totalMinutos: Math.round(totalSegundos / 60),
      minutosProgramados,
      horarioConfigurado,
      desde,
      hasta,
    },
  };
}

/**
 * Convierte un día del negocio + hora local (Florida) al instante real.
 * Se usa el desfase real de la zona en esa fecha, así el horario de verano no corre el
 * límite del mes una hora.
 */
function fechaAInstante(ymd: string, hhmm: string): Date {
  const [anio, mes, dia] = ymd.split("-").map(Number);
  const [hora, minuto] = hhmm.split(":").map(Number);
  // Instante provisional tratando la hora como UTC; se corrige con el desfase real de la zona.
  const provisional = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto));
  const desfase = desfaseZona(provisional);
  return new Date(provisional.getTime() - desfase);
}

/** Desfase de Florida respecto a UTC, en milisegundos, para ese instante. */
function desfaseZona(instante: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(instante).map((x) => [x.type, x.value]));
  const hora = p.hour === "24" ? "00" : p.hour;
  const comoUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(hora), Number(p.minute), Number(p.second));
  return comoUTC - instante.getTime();
}

/**
 * Estado de "mi jornada" para GENERAL → Mi día: la jornada abierta (si la hay) y el tiempo
 * trabajado hoy, sumando SOLO las sesiones finalizadas de hoy.
 */
export async function estadoMiJornada(userId: string): Promise<{
  activa: SesionJornadaDTO | null;
  sesionesHoy: SesionJornadaDTO[];
  totalHoySegundos: number;
  minutosProgramadosHoy: number;
  fecha: string;
}> {
  const hoy = hoyET();
  const [persona] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, userId));
  const nombre = persona?.nombre ?? "Usuario";

  const inicio = fechaAInstante(hoy, "00:00");
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);

  const filas = await db
    .select()
    .from(jornadasLaborales)
    .where(and(eq(jornadasLaborales.userId, userId), gte(jornadasLaborales.startedAt, inicio), lte(jornadasLaborales.startedAt, fin)));

  const minutosHoy = await minutosProgramadosDelDia(userId, hoy);
  const sesionesHoy = filas
    .map((f) => aDTO(f, nombre, minutosHoy))
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  const activa = sesionesHoy.find((s) => s.estado === "ABIERTA") ?? null;
  const totalHoySegundos = sesionesHoy
    .filter((s) => s.estado === "FINALIZADA")
    .reduce((acc, s) => acc + (s.duracionSegundos ?? 0), 0);

  return { activa, sesionesHoy, totalHoySegundos, minutosProgramadosHoy: minutosHoy, fecha: hoy };
}

/** Resumen de hoy para varias personas (lo usa la cabecera de RRHH → Asistencia). */
export async function quienEstaTrabajandoHoy(): Promise<{ userId: string; personaNombre: string; startedAt: string }[]> {
  const hoy = hoyET();
  const inicio = fechaAInstante(hoy, "00:00");
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  const abiertas = await db.select().from(jornadasLaborales).where(isNull(jornadasLaborales.endedAt));
  const personas = await db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios);
  const nombrePorId = new Map(personas.map((p) => [p.id, p.nombre]));
  return abiertas
    .filter((j) => j.startedAt >= inicio && j.startedAt < fin)
    .map((j) => ({ userId: j.userId, personaNombre: nombrePorId.get(j.userId) ?? "Usuario", startedAt: j.startedAt.toISOString() }))
    .sort((a, b) => a.personaNombre.localeCompare(b.personaNombre, "es"));
}
