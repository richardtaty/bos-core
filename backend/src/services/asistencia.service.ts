import { and, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import { db } from "../db/client";
import { empleados, horarioDias, horarios, jornadasLaborales, usuarios } from "../db/schema";
import { registrarAuditoria } from "./auditoria.service";
import {
  cerrarCheckinsDeSesion,
  conteosPorJornada,
  listarCheckinsDeJornada,
  sincronizarJornada,
  tomarPendiente,
  type CheckinDTO,
  type ConteoCheckinsDTO,
  type SesionParaCheckins,
  type TipoSesion,
} from "./checkins.service";
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
// Tampoco cierra jornadas solo: una sesión olvidada nunca se termina a mano del sistema.
//
// Check-ins (ver checkins.service.ts): SÍ existen desde la fase 4, pero son solo un registro
// de actividad. No descuentan sueldo, no reducen horas, no cierran jornadas ni marcan
// ausencias. Las horas trabajadas siguen saliendo ÚNICAMENTE de started_at/ended_at.
//
// Reposición de horas: una sesión de tipo REPOSICION recupera dentro del mismo mes lo que
// quedó pendiente, como sesión nueva e independiente. NUNCA modifica una jornada anterior:
// el lunes que tuvo 6 h de 8 h sigue mostrando 6 h regulares, y aparte aparece la reposición.
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
/** La sesión abierta es del otro tipo: una jornada regular no se cierra como reposición. */
export class TipoSesionIncorrectoError extends Error {}
/** Se pidió reponer cuando no hay déficit de horas en el mes. */
export class SinHorasPendientesError extends Error {}

export interface SesionJornadaDTO {
  id: string;
  /** ID real de la persona en el CRM. */
  userId: string;
  /** ID del perfil laboral (relación estructurada para el futuro Control de Sueldo). */
  empleadoId: string;
  personaNombre: string;
  /** REGULAR = jornada normal. REPOSICION = recuperar horas pendientes del mes. */
  sessionType: TipoSesion;
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
  /**
   * Resumen de check-ins de la sesión (solo informativo: no afecta a las horas ni al sueldo).
   * null cuando quien pide la sesión no los necesita (p. ej. Mi día, que solo pinta el reloj).
   */
  checkins: ConteoCheckinsDTO | null;
}

/**
 * Acreditación de horas de un período: cuánto de lo trabajado cuenta de verdad para cumplir
 * la jornada mensual. Todo en SEGUNDOS ENTEROS (nunca coma flotante: el resultado alimenta
 * un cálculo de dinero).
 *
 * La reposición solo cubre el déficit: si alguien repone más de lo que le faltaba, el exceso
 * se conserva en el historial como tiempo registrado pero NO acredita más sueldo. Como
 * `segundosAcreditables` nunca supera lo programado, el sueldo estimado nunca pasa del sueldo
 * mensual configurado — no hay overtime automático.
 */
export interface AcreditacionDTO {
  segundosProgramados: number;
  segundosRegulares: number;
  segundosReposicion: number;
  /** De lo repuesto, cuánto cubre déficit real. El resto es exceso. */
  segundosReposicionAcreditable: number;
  /** Lo que cuenta para cumplir la jornada mensual. Tope: segundosProgramados. */
  segundosAcreditables: number;
  /** Reposición registrada por encima del déficit: se muestra, no paga. */
  segundosExcedidos: number;
  /** Lo que falta para completar el mes. Nunca negativo. */
  minutosPendientes: number;
}

/**
 * Reparte las horas de un período. Función pura y ÚNICA: la usan Mi día, Asistencia y Control
 * de Sueldo, así que las tres pantallas no pueden mostrar números distintos.
 */
export function acreditarHoras(
  minutosProgramados: number,
  segundosRegulares: number,
  segundosReposicion: number,
): AcreditacionDTO {
  const tope = Math.max(0, minutosProgramados) * 60;
  const regularAcreditado = Math.min(segundosRegulares, tope);
  const reposicionAcreditable = Math.min(segundosReposicion, Math.max(tope - regularAcreditado, 0));
  const acreditables = regularAcreditado + reposicionAcreditable;
  return {
    segundosProgramados: tope,
    segundosRegulares,
    segundosReposicion,
    segundosReposicionAcreditable: reposicionAcreditable,
    segundosAcreditables: acreditables,
    segundosExcedidos: Math.max(segundosReposicion - reposicionAcreditable, 0),
    minutosPendientes: Math.max(Math.ceil((tope - acreditables) / 60), 0),
  };
}

export interface ResumenAsistenciaDTO {
  sesionesFinalizadas: number;
  /** Jornadas sin terminar: se cuentan aparte y NO suman al tiempo trabajado. */
  sesionesAbiertas: number;
  /** Tiempo registrado TOTAL del período (jornadas regulares + reposiciones). */
  totalSegundos: number;
  totalMinutos: number;
  /** Horas programadas del período. null si no se pidió una persona concreta. */
  minutosProgramados: number | null;
  /** false = la persona no tiene horario configurado todavía (no se inventan horas). */
  horarioConfigurado: boolean;
  /** Rango realmente consultado, en días del negocio. */
  desde: string;
  hasta: string;

  // ─── Desglose regulares vs repuestas (fase 4) ─────────────────
  // Se muestran SEPARADAS a propósito: una reposición no ocurrió dentro de la jornada del
  // lunes, así que no puede mezclarse visualmente con las horas de ese día.
  /** Tiempo de jornadas regulares. Es lo que se compara con lo programado. */
  totalSegundosRegulares: number;
  totalSegundosReposicion: number;
  /** Cuánto de la reposición cubre déficit real (el resto es exceso que no acredita). */
  minutosReposicionAcreditables: number;
  /** Lo que cuenta para cumplir el mes: min(regulares, programadas) + reposición acreditable. */
  minutosAcreditables: number;
  /** Lo que falta para completar el mes. 0 si no se pidió una persona concreta. */
  minutosPendientes: number;
  /** Reposición por encima del déficit: queda en historial, no paga. */
  minutosExcedidos: number;
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
  try {
    await db.insert(empleados).values({
      id,
      userId,
      estadoLaboral: "ACTIVO",
      createdAt: ahora,
      updatedAt: ahora,
    });
  } catch (e) {
    // `empleados.user_id` es UNIQUE: dos peticiones a la vez para alguien que aún no tiene
    // perfil laboral (doble clic, dos pestañas) harían fallar la segunda con un 500. El
    // perfil que creó la otra petición ya sirve, así que se relee en vez de propagar el error.
    if (!String((e as Error)?.message ?? "").includes("UNIQUE")) throw e;
    const [creado] = await db.select().from(empleados).where(eq(empleados.userId, userId));
    if (creado) return creado.id;
    throw e;
  }
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
  /**
   * SOLO de jornadas terminadas. Una jornada abierta no aporta segundos.
   * Es el TOTAL registrado (regulares + reposiciones), como siempre.
   */
  segundosRegistrados: number;
  sesionesFinalizadas: number;
  sesionesAbiertas: number;

  // ─── Desglose por tipo + acreditación (fase 4) ────────────────
  /** Tiempo de jornadas regulares: es lo que se compara contra lo programado. */
  segundosRegulares: number;
  /** Tiempo de reposiciones, INCLUIDO el que excede el déficit. */
  segundosReposicion: number;
  sesionesReposicion: number;
  /** Reparto y acreditación calculados con `acreditarHoras`. */
  acreditacion: AcreditacionDTO;
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
      segundosRegulares: 0,
      segundosReposicion: 0,
      sesionesReposicion: 0,
      acreditacion: acreditarHoras(0, 0, 0),
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
    const segundos = Math.max(0, Math.round((fila.endedAt.getTime() - fila.startedAt.getTime()) / 1000));
    acumulado.segundosRegistrados += segundos;
    // El reparto por tipo se hace aquí, con la fila ya delante: cero consultas extra.
    if (fila.sessionType === "REPOSICION") {
      acumulado.segundosReposicion += segundos;
      acumulado.sesionesReposicion += 1;
    } else {
      acumulado.segundosRegulares += segundos;
    }
  }

  // El horario de cada persona se resuelve una vez y se reutiliza para todo el mes. La
  // acreditación se cierra al final, cuando ya se conocen el horario y los dos acumulados.
  for (const [userId, acumulado] of porUsuario) {
    const { minutos, configurado } = await minutosProgramadosDelMes(userId, mes);
    acumulado.minutosProgramados = minutos;
    acumulado.horarioConfigurado = configurado;
    acumulado.acreditacion = acreditarHoras(minutos, acumulado.segundosRegulares, acumulado.segundosReposicion);
  }

  return porUsuario;
}

/**
 * Minutos programados de UN día concreto (objetivo del día en curso).
 * Exportada porque de aquí sale cuántos check-ins corresponden a una jornada regular: 8 h → 8,
 * 4 h → 4, un día sin horario configurado → 1. Nunca un 8 fijo.
 */
export async function minutosProgramadosDelDia(userId: string, ymd: string): Promise<number> {
  const horario = await horarioDeUsuario(userId);
  return minutosProgramadosEnDias(horario, [ymd]);
}

// ─── Sesiones de jornada ────────────────────────────────────────

function aDTO(
  fila: typeof jornadasLaborales.$inferSelect,
  personaNombre: string,
  minutosProgramados: number,
  checkins: ConteoCheckinsDTO | null = null,
): SesionJornadaDTO {
  const abierta = fila.endedAt === null;
  const segundos = abierta ? null : Math.max(0, Math.round((fila.endedAt!.getTime() - fila.startedAt.getTime()) / 1000));
  return {
    id: fila.id,
    userId: fila.userId,
    empleadoId: fila.empleadoId,
    personaNombre,
    sessionType: fila.sessionType,
    startedAt: fila.startedAt.toISOString(),
    endedAt: fila.endedAt ? fila.endedAt.toISOString() : null,
    estado: abierta ? "ABIERTA" : "FINALIZADA",
    duracionSegundos: segundos,
    duracionMinutos: segundos === null ? null : Math.round(segundos / 60),
    fecha: fechaET(fila.startedAt),
    minutosProgramados,
    checkins,
  };
}

/**
 * La sesión como la ve el módulo de check-ins. La duración es real: `started_at`/`ended_at`,
 * nunca lo que el usuario escriba ni cuántos check-ins haya respondido.
 */
function aSesionCheckins(fila: typeof jornadasLaborales.$inferSelect): SesionParaCheckins {
  return {
    id: fila.id,
    userId: fila.userId,
    empleadoId: fila.empleadoId,
    sessionType: fila.sessionType,
    startedAt: fila.startedAt,
    endedAt: fila.endedAt,
  };
}

/**
 * Materializa los check-ins que le tocan a una sesión, sin poder tumbar la operación.
 *
 * Va en try/catch a propósito: un fallo al programar una alerta de actividad JAMÁS puede
 * impedir que alguien fiche su entrada o su salida. Si algo falla, queda anotado en el log y
 * el siguiente poll lo vuelve a intentar (la materialización es idempotente).
 */
async function materializarCheckins(fila: typeof jornadasLaborales.$inferSelect): Promise<void> {
  try {
    const minutos = await minutosProgramadosDelDia(fila.userId, fechaET(fila.startedAt));
    await sincronizarJornada(aSesionCheckins(fila), minutos);
  } catch (e) {
    console.error("No se pudieron programar los check-ins de la jornada:", e);
  }
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
 * Abre una sesión de trabajo del tipo indicado. El momento lo pone el servidor, nunca el
 * navegador.
 *
 * Regla dura: una persona no puede tener dos sesiones abiertas, sean del tipo que sean. Se
 * valida aquí y, además, el índice único parcial de la BD lo impide aunque dos peticiones
 * entren a la vez (por eso no hace falta un índice distinto por tipo).
 */
async function abrirSesion(
  userId: string,
  tipo: TipoSesion,
  errorSiAbierta: () => Error,
): Promise<SesionJornadaDTO> {
  const [persona] = await db.select().from(usuarios).where(eq(usuarios.id, userId));
  if (!persona) throw new SinJornadaActivaError("Usuario no encontrado.");

  if (await jornadaAbierta(userId)) throw errorSiAbierta();

  const empleadoId = await asegurarEmpleado(userId);
  const ahora = new Date();
  const id = crypto.randomUUID();

  try {
    await db.insert(jornadasLaborales).values({
      id,
      userId,
      empleadoId,
      sessionType: tipo,
      startedAt: ahora,
      createdAt: ahora,
      updatedAt: ahora,
    });
  } catch (e) {
    // Choque contra el índice de "una sola sesión abierta": dos clics simultáneos.
    if (String((e as Error)?.message ?? "").includes("UNIQUE")) throw errorSiAbierta();
    throw e;
  }

  await registrarAuditoria({
    entidad: "JornadaRRHH",
    entidadId: id,
    accion: tipo === "REPOSICION" ? "Reposición de horas iniciada" : "Jornada iniciada",
    autorId: userId,
  });

  const creada = {
    id,
    userId,
    empleadoId,
    sessionType: tipo,
    startedAt: ahora,
    endedAt: null,
    createdAt: ahora,
    updatedAt: ahora,
  };

  // Los check-ins se programan aquí para que la primera hora de trabajo ya quede cubierta,
  // pero un fallo suyo no puede impedir la entrada: puede tocar la sesión sin tumbarla.
  await materializarCheckins(creada);

  const minutos = await minutosProgramadosDelDia(userId, fechaET(ahora));
  return aDTO(creada, persona.nombre, minutos);
}

/**
 * INICIAR JORNADA regular. Es el botón de siempre, byte-idéntico para el usuario.
 */
export async function iniciarJornada(userId: string): Promise<SesionJornadaDTO> {
  return abrirSesion(userId, "REGULAR", () =>
    new JornadaYaActivaError("Ya tienes una jornada abierta. Termínala antes de iniciar otra."),
  );
}

/**
 * Cierra la MISMA sesión abierta (no crea una nueva para la salida) y sella ended_at con la
 * hora del servidor. Si no hay sesión abierta, es un error: nunca se inventa una salida.
 *
 * El `tipo` exigido evita cerrar una reposición como si fuera la jornada del día (o al revés),
 * que dejaría el mes cuadrado por casualidad y el historial mintiendo.
 */
async function cerrarSesion(
  userId: string,
  tipo: TipoSesion,
  mensajeSinSesion: string,
): Promise<SesionJornadaDTO> {
  const [persona] = await db.select().from(usuarios).where(eq(usuarios.id, userId));
  if (!persona) throw new SinJornadaActivaError("Usuario no encontrado.");

  const abierta = await jornadaAbierta(userId);
  if (!abierta) throw new SinJornadaActivaError(mensajeSinSesion);
  if (abierta.sessionType !== tipo) {
    throw new TipoSesionIncorrectoError(
      tipo === "REPOSICION"
        ? "Lo que tienes abierto es una jornada regular, no una reposición."
        : "Lo que tienes abierto es una reposición de horas, no la jornada del día.",
    );
  }

  const ahora = new Date();
  await db
    .update(jornadasLaborales)
    .set({ endedAt: ahora, updatedAt: ahora })
    .where(eq(jornadasLaborales.id, abierta.id));

  await registrarAuditoria({
    entidad: "JornadaRRHH",
    entidadId: abierta.id,
    accion: tipo === "REPOSICION" ? "Reposición de horas terminada" : "Jornada terminada",
    autorId: userId,
  });

  // Se cancelan los check-ins que aún no habían ocurrido; los respondidos, vencidos y el
  // historial se conservan tal cual. Un fallo aquí NO puede impedir la salida.
  try {
    await cerrarCheckinsDeSesion(abierta.id, ahora);
  } catch (e) {
    console.error("No se pudieron cerrar los check-ins de la jornada:", e);
  }

  const minutos = await minutosProgramadosDelDia(userId, fechaET(abierta.startedAt));
  return aDTO({ ...abierta, endedAt: ahora, updatedAt: ahora }, persona.nombre, minutos);
}

/** TERMINAR JORNADA regular (el botón de siempre). */
export async function terminarJornada(userId: string): Promise<SesionJornadaDTO> {
  return cerrarSesion(userId, "REGULAR", "No tienes una jornada abierta que terminar.");
}

// ─── Reposición de horas ────────────────────────────────────────

export interface PendientesMesDTO {
  /** Mes del negocio al que se refiere el cálculo (AAAA-MM). */
  mes: string;
  minutosProgramados: number;
  /** false = la persona no tiene jornada esperada configurada; no se puede reponer nada. */
  horarioConfigurado: boolean;
  minutosRegulares: number;
  minutosReposicion: number;
  minutosAcreditables: number;
  /** Lo que falta para completar el mes. 0 = nada que reponer. */
  minutosPendientes: number;
  /** Reposición que excede el déficit: queda en el historial, no acredita. */
  minutosExcedidos: number;
  /** true solo si hay déficit Y no hay ya una sesión abierta: es lo que habilita el botón. */
  puedeReponer: boolean;
}

/**
 * Horas pendientes del mes en curso para la propia persona (GENERAL → Mi día).
 *
 * `puedeReponer` junta las dos condiciones del requisito: que haya déficit real y que no haya
 * ninguna otra sesión activa (el índice único lo impide igualmente, pero la UI necesita saberlo
 * ANTES de ofrecer el botón, no después del error).
 */
export async function pendientesDelMes(userId: string, mes: string = mesActualET()): Promise<PendientesMesDTO> {
  const totales = await totalesDelMes([userId], mes);
  const t = totales.get(userId);
  const a = t?.acreditacion ?? acreditarHoras(0, 0, 0);
  const abierta = await jornadaAbierta(userId);

  return {
    mes,
    minutosProgramados: t?.minutosProgramados ?? 0,
    horarioConfigurado: t?.horarioConfigurado ?? false,
    minutosRegulares: Math.round(a.segundosRegulares / 60),
    minutosReposicion: Math.round(a.segundosReposicion / 60),
    minutosAcreditables: Math.round(a.segundosAcreditables / 60),
    minutosPendientes: a.minutosPendientes,
    minutosExcedidos: Math.round(a.segundosExcedidos / 60),
    puedeReponer: a.minutosPendientes > 0 && abierta === null,
  };
}

/**
 * INICIAR REPOSICIÓN. Crea una sesión NUEVA e independiente para recuperar horas del mes.
 *
 * Nunca toca la jornada original: el lunes que tuvo 6 h de 8 h sigue mostrando 6 h, y esta
 * reposición aparece como una línea aparte. El mes al que se imputa sale del reloj del
 * servidor en el momento de empezar, así que una reposición pertenece al mes en que se hace.
 */
export async function iniciarReposicion(userId: string): Promise<SesionJornadaDTO> {
  const abierta = await jornadaAbierta(userId);
  if (abierta) {
    throw new JornadaYaActivaError(
      abierta.sessionType === "REPOSICION"
        ? "Ya tienes una reposición de horas en curso."
        : "Tienes una jornada abierta. Termínala antes de iniciar una reposición.",
    );
  }

  const pendientes = await pendientesDelMes(userId);
  if (pendientes.minutosPendientes <= 0) {
    throw new SinHorasPendientesError(
      pendientes.horarioConfigurado
        ? "No tienes horas pendientes este mes: tu jornada ya está completa."
        : "Todavía no tienes una jornada esperada configurada, así que no hay horas que reponer.",
    );
  }

  return abrirSesion(userId, "REPOSICION", () =>
    new JornadaYaActivaError("Ya tienes una sesión abierta. Termínala antes de iniciar otra."),
  );
}

/**
 * TERMINAR REPOSICIÓN. Sella ended_at en la misma sesión. Las horas que pasen del déficit
 * quedan registradas igual (se ven como excedidas) pero no acreditan más sueldo.
 */
export async function terminarReposicion(userId: string): Promise<SesionJornadaDTO> {
  return cerrarSesion(userId, "REPOSICION", "No tienes una reposición de horas en curso.");
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

  // Conteos de check-ins de TODAS las sesiones listadas en UNA sola consulta (nunca N+1).
  // Es solo informativo: no entra en ningún cálculo de horas ni de sueldo.
  const conteos = await conteosPorJornada(sesiones.map((s) => s.id));
  for (const s of sesiones) {
    s.checkins = conteos.get(s.id) ?? null;
  }

  const finalizadas = sesiones.filter((s) => s.estado === "FINALIZADA");
  const totalSegundos = finalizadas.reduce((acc, s) => acc + (s.duracionSegundos ?? 0), 0);
  // Reparto por tipo con la misma función pura que usan Mi día y Control de Sueldo: las tres
  // pantallas no pueden mostrar números distintos.
  const segundosRegulares = finalizadas.filter((s) => s.sessionType !== "REPOSICION").reduce((acc, s) => acc + (s.duracionSegundos ?? 0), 0);
  const segundosReposicion = finalizadas.filter((s) => s.sessionType === "REPOSICION").reduce((acc, s) => acc + (s.duracionSegundos ?? 0), 0);
  const acreditacion = acreditarHoras(minutosProgramados ?? 0, segundosRegulares, segundosReposicion);

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
      totalSegundosRegulares: segundosRegulares,
      totalSegundosReposicion: segundosReposicion,
      minutosReposicionAcreditables: Math.round(acreditacion.segundosReposicionAcreditable / 60),
      minutosAcreditables: Math.round(acreditacion.segundosAcreditables / 60),
      minutosPendientes: acreditacion.minutosPendientes,
      minutosExcedidos: Math.round(acreditacion.segundosExcedidos / 60),
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
 *
 * `activa` NO sale del listado de hoy: sale de `jornadaAbierta`, que es independiente del día.
 * Si alguien inició jornada ayer y no la terminó, esa sesión sigue abierta y tiene que poder
 * cerrarse — buscándola solo entre las de hoy, la tarjeta mostraba «Iniciar jornada», el botón
 * «Terminar» no aparecía nunca y el backend respondía 409 al intentar iniciar otra.
 * Sus minutos programados son los del día en que EMPEZÓ, no los de hoy.
 * `sesionesHoy` y `totalHoySegundos` sí siguen acotados al día de hoy.
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

  const abierta = await jornadaAbierta(userId);
  const activa = abierta
    ? aDTO(abierta, nombre, await minutosProgramadosDelDia(userId, fechaET(abierta.startedAt)))
    : null;

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

// ─── Actividad (check-ins) ──────────────────────────────────────

export interface EstadoActividadDTO {
  /** true = hay sesión abierta (regular o reposición) y por tanto puede haber check-ins. */
  activa: boolean;
  /** El check-in que toca mostrar ahora mismo, o null. */
  checkin: CheckinDTO | null;
}

/**
 * Lo que consulta la alerta global en cada poll. Sigue al usuario por CUALQUIER módulo del
 * CRM, no solo a Mi día.
 *
 * Sin sesión abierta no hay check-ins: se responde mirando solo `jornadaAbierta` (una consulta
 * al índice único parcial) y se sale, sin tocar la tabla de check-ins.
 *
 * Cuando sí hay sesión, se materializa lo que falte y se barre lo vencido: así no hace falta
 * ningún proceso de fondo, y el horario no depende de que el navegador haya estado abierto.
 * `tomarPendiente` sella `delivered_at` la primera vez, que es de donde cuenta la ventana de
 * respuesta — nadie puede quedar «Sin respuesta» por una alerta que su pantalla nunca mostró.
 */
export async function estadoMiActividad(userId: string): Promise<EstadoActividadDTO> {
  const abierta = await jornadaAbierta(userId);
  if (!abierta) return { activa: false, checkin: null };

  try {
    const minutos = await minutosProgramadosDelDia(userId, fechaET(abierta.startedAt));
    await sincronizarJornada(aSesionCheckins(abierta), minutos);
  } catch (e) {
    // La alerta es un extra: si falla, Mi día y el fichaje tienen que seguir funcionando.
    console.error("No se pudo sincronizar la actividad de la jornada:", e);
    return { activa: true, checkin: null };
  }

  return { activa: true, checkin: await tomarPendiente(abierta.id) };
}

export interface CheckinsDeJornadaDTO {
  /** La sesión con sus conteos, para el chip «Check-ins: 7 de 8». */
  sesion: SesionJornadaDTO;
  /** El detalle línea a línea: hora, estado y hora de respuesta. */
  checkins: CheckinDTO[];
}

/**
 * Detalle de los check-ins de UNA sesión, para RRHH → Asistencia al desplegar la jornada.
 *
 * Solo lo sirve el módulo de RRHH, detrás de su control de acceso: no hay versión para el
 * propio empleado, así nadie puede ver por adelantado los check-ins que le quedan por delante.
 */
export async function checkinsDeJornada(jornadaId: string): Promise<CheckinsDeJornadaDTO> {
  const [fila] = await db.select().from(jornadasLaborales).where(eq(jornadasLaborales.id, jornadaId));
  if (!fila) throw new SinJornadaActivaError("Esa jornada no existe.");

  const [persona] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, fila.userId));
  const minutos = await minutosProgramadosDelDia(fila.userId, fechaET(fila.startedAt));

  // Una sesión abierta se pone al día antes de listar, para que el detalle que se ve sea el
  // real en este momento y no una foto vieja.
  if (fila.endedAt === null) {
    await sincronizarJornada(aSesionCheckins(fila), minutos);
  }

  const items = await listarCheckinsDeJornada(fila.id);
  const sesion = aDTO(fila, persona?.nombre ?? "Usuario eliminado", minutos, conteosDe(items));
  return { sesion, checkins: items };
}

/** Conteos a partir de una lista ya leída (mismo criterio que `conteosPorJornada`). */
function conteosDe(items: CheckinDTO[]): ConteoCheckinsDTO {
  const c: ConteoCheckinsDTO = { total: 0, respondidos: 0, sinRespuesta: 0, pendientes: 0, cancelados: 0 };
  for (const item of items) {
    if (item.estado === "RESPONDIDO") c.respondidos += 1;
    else if (item.estado === "SIN_RESPUESTA") c.sinRespuesta += 1;
    else if (item.estado === "CANCELADO") c.cancelados += 1;
    else c.pendientes += 1;
  }
  c.total = c.respondidos + c.sinRespuesta + c.pendientes;
  return c;
}
