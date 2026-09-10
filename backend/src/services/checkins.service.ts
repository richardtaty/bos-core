import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import { db } from "../db/client";
import { jornadasCheckins } from "../db/schema";

// ─── Recursos Humanos → Asistencia · Check-ins de actividad ─────
//
// Un check-in es una pregunta suelta —«¿Sigues activo?»— que aparece al azar mientras hay una
// sesión de trabajo abierta. Sirve para saber si alguien está de verdad frente al CRM.
//
// LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO (regla dura del negocio):
//   · NO descuenta sueldo ni genera penalización
//   · NO reduce ni elimina horas trabajadas
//   · NO cierra la jornada ni marca ausencia
//   · NO modifica el sueldo estimado de Control de Sueldo
// Las horas trabajadas dependen SIEMPRE de `jornadas_laborales.started_at`/`ended_at`, nunca
// de cuántos check-ins se respondieron. Este módulo solo deja constancia para consulta.
//
// ALEATORIO PERO ESTABLE. Los minutos se derivan de un PRNG sembrado con el id de la sesión.
// Cada persona obtiene así una programación independiente (no todos a la misma hora), y el
// horario es el mismo cada vez que se recalcula: un refresh, un redeploy o dos pestañas
// abiertas no lo cambian ni lo duplican. No hace falta ningún proceso de fondo: el servidor
// materializa en cada lectura, y el índice único (jornada_id, block_index) garantiza que dos
// materializaciones simultáneas no creen filas de más.
//
// QUIÉN PUEDE QUÉ: responder un check-in ajeno es imposible — toda búsqueda filtra por
// `user_id`, que sale del token. Ver routes/jornada.routes.ts.

/** Un bloque es una hora de la sesión. También es la unidad de la ventana de respuesta. */
export const MS_BLOQUE = 60 * 60 * 1000;
/** Tiempo para pulsar «Sigo activo» desde que la alerta LLEGA a la pantalla. */
export const VENTANA_RESPUESTA_MS = 60 * 60 * 1000;
/**
 * Tope de cordura para una reposición: una sesión olvidada abierta semanas no puede generar
 * cientos de check-ins. Al llegar aquí la sesión NO se cierra sola (igual que una jornada
 * olvidada hoy): simplemente deja de generar actividad y el historial se conserva.
 */
export const MAX_BLOQUES_REPOSICION = 12;
/** Tope absoluto, por si el horario de un día viniera absurdo. */
const MAX_BLOQUES = 24;

export type EstadoCheckin = "PENDIENTE" | "RESPONDIDO" | "SIN_RESPUESTA" | "CANCELADO";
export type TipoSesion = "REGULAR" | "REPOSICION";

export class CheckinNoEncontradoError extends Error {}

export interface CheckinDTO {
  id: string;
  jornadaId: string;
  blockIndex: number;
  /** Instante en que la alerta toca (lo pone el servidor). */
  scheduledAt: string;
  /** Primera vez que la alerta se mostró. De aquí cuenta la ventana. */
  deliveredAt: string | null;
  respondedAt: string | null;
  estado: EstadoCheckin;
  /** Fin de la ventana de respuesta. null mientras no se haya entregado. */
  expiraEn: string | null;
}

export interface ConteoCheckinsDTO {
  /** Denominador de «7 de 8»: NO incluye los cancelados, que nunca llegaron a ocurrir. */
  total: number;
  respondidos: number;
  sinRespuesta: number;
  pendientes: number;
  cancelados: number;
}

/** Lo mínimo que este módulo necesita de una sesión de jornada. */
export interface SesionParaCheckins {
  id: string;
  userId: string;
  empleadoId: string;
  sessionType: TipoSesion;
  startedAt: Date;
  endedAt: Date | null;
}

// ─── Azar determinista ──────────────────────────────────────────

/** xmur3: hash de cadena a semilla de 32 bits. */
function semillaDe(texto: string): number {
  let h = 1779033703 ^ texto.length;
  for (let i = 0; i < texto.length; i++) {
    h = Math.imul(h ^ texto.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** mulberry32: generador pequeño, uniforme de sobra para unos pocos sorteos por sesión. */
function generador(semilla: number): () => number {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Desplazamiento dentro de un bloque, en milisegundos. La semilla es POR BLOQUE
 * (`id#bloque`), no un único stream secuencial: así el bloque 7 da lo mismo sin haber
 * consumido antes los bloques 0 a 6, y materializar un rango parcial nunca desvía el resto.
 *
 * El desplazamiento se suma en milisegundos ABSOLUTOS desde el inicio del bloque; nunca se
 * alinea con el reloj de pared de Florida. Ahí es justo donde nacería un bug de horario de
 * verano (una hora repetida daría dos check-ins y una saltada, ninguno).
 */
export function desplazamientoDelBloque(jornadaId: string, blockIndex: number, msBloqueReal: number): number {
  if (msBloqueReal <= 0) return 0;
  const azar = generador(semillaDe(`${jornadaId}#${blockIndex}`))();
  return Math.floor(azar * msBloqueReal);
}

// ─── Plan de bloques ────────────────────────────────────────────

interface BloquePlan {
  blockIndex: number;
  scheduledAt: Date;
}

/**
 * Los check-ins que le tocan a una sesión, con su hora exacta.
 *
 * REGULAR: la cantidad sale de las horas REALMENTE programadas para ese día (`minutosProgramadosDelDia`),
 *   nunca de un 8 fijo — 8 h → 8, 4 h → 4, sábado de 3 h → 3. Un día sin jornada esperada
 *   configurada da 1: la jornada igual se inició y conviene verificar la actividad al menos
 *   una vez. Se planifican TODOS los bloques aunque aún no hayan llegado, para que al terminar
 *   la sesión los futuros se puedan marcar como cancelados de verdad.
 * REPOSICION: no hay horario que los limite. Se planifica un bloque por cada hora ya
 *   transcurrida, con tope de cordura. Cuando la sesión termina, no se genera ninguno más.
 *
 * `minutosProgramadosDia` se recibe como parámetro a propósito: así este módulo no depende de
 * asistencia.service y la dependencia queda en un solo sentido.
 */
export function planDeBloques(
  jornada: SesionParaCheckins,
  minutosProgramadosDia: number,
  ahora: Date,
): BloquePlan[] {
  const inicio = jornada.startedAt.getTime();
  // El fin de la sesión es un límite duro: nunca se materializa un check-in posterior a la
  // salida. Mientras siga abierta, el límite para REPOSICION es "ahora".
  const fin = jornada.endedAt ? jornada.endedAt.getTime() : Infinity;

  let tope: number;
  if (jornada.sessionType === "REPOSICION") {
    const transcurrido = Math.min(ahora.getTime(), fin) - inicio;
    tope = Math.min(Math.floor(Math.max(0, transcurrido) / MS_BLOQUE) + 1, MAX_BLOQUES_REPOSICION);
  } else {
    tope = Math.min(Math.max(1, Math.floor(minutosProgramadosDia / 60)), MAX_BLOQUES);
  }

  const plan: BloquePlan[] = [];
  for (let k = 0; k < tope; k++) {
    const inicioBloque = inicio + k * MS_BLOQUE;
    // El bloque empezó después de la salida: no ocurrió y no debe existir.
    if (inicioBloque >= fin) break;
    // El último bloque puede estar recortado por la salida; el sorteo nunca cae fuera.
    const finBloque = Math.min(inicioBloque + MS_BLOQUE, fin);
    plan.push({
      blockIndex: k,
      scheduledAt: new Date(inicioBloque + desplazamientoDelBloque(jornada.id, k, finBloque - inicioBloque)),
    });
  }
  return plan;
}

// ─── Materialización y barrido ──────────────────────────────────

/**
 * Crea los check-ins que falten para esa sesión. IDEMPOTENTE: se puede llamar en cada lectura.
 *
 * El INSERT lleva ON CONFLICT DO NOTHING contra el índice único (jornada_id, block_index).
 * Nunca un «leer cuáles faltan y luego insertar»: entre la lectura y la escritura se colaría
 * otra pestaña y se duplicarían filas.
 */
async function materializar(
  jornada: SesionParaCheckins,
  minutosProgramadosDia: number,
  ahora: Date,
): Promise<void> {
  const plan = planDeBloques(jornada, minutosProgramadosDia, ahora);
  if (plan.length === 0) return;

  const sello = new Date();
  await db
    .insert(jornadasCheckins)
    .values(
      plan.map((bloque) => ({
        id: crypto.randomUUID(),
        jornadaId: jornada.id,
        userId: jornada.userId,
        empleadoId: jornada.empleadoId,
        blockIndex: bloque.blockIndex,
        scheduledAt: bloque.scheduledAt,
        estado: "PENDIENTE" as const,
        createdAt: sello,
        updatedAt: sello,
      })),
    )
    .onConflictDoNothing();
}

/**
 * Marca como SIN_RESPUESTA las alertas entregadas cuya ventana ya cerró.
 *
 * La ventana se cuenta desde `delivered_at` (cuando la alerta llegó a la pantalla), no desde
 * `scheduled_at`. Una fila que nunca se entregó permanece PENDIENTE: no se puede marcar «sin
 * respuesta» algo que el usuario jamás vio. Ese es el motivo de la columna.
 */
async function barrerVencidos(jornada: SesionParaCheckins, ahora: Date): Promise<void> {
  const limite = jornada.endedAt ?? ahora;
  const corte = new Date(limite.getTime() - VENTANA_RESPUESTA_MS);
  await db
    .update(jornadasCheckins)
    .set({ estado: "SIN_RESPUESTA", updatedAt: new Date() })
    .where(
      and(
        eq(jornadasCheckins.jornadaId, jornada.id),
        eq(jornadasCheckins.estado, "PENDIENTE"),
        lte(jornadasCheckins.deliveredAt, corte),
      ),
    );
}

/**
 * Pone al día los check-ins de UNA sesión: crea los que falten y cierra los vencidos.
 * Es lo que se llama en cada lectura, así que no hace falta ningún proceso programado.
 */
export async function sincronizarJornada(
  jornada: SesionParaCheckins,
  minutosProgramadosDia: number,
  ahora: Date = new Date(),
): Promise<void> {
  await materializar(jornada, minutosProgramadosDia, ahora);
  await barrerVencidos(jornada, ahora);
}

/**
 * Cierra los check-ins de una sesión que termina. NUNCA borra nada:
 *   · entregado y ya ocurrido, sin responder → SIN_RESPUESTA (se le mostró y no contestó)
 *   · nunca entregado, o aún por llegar       → CANCELADO (no llegó a ocurrir)
 * Los RESPONDIDO / SIN_RESPUESTA / CANCELADO previos quedan intactos.
 */
export async function cerrarCheckinsDeSesion(jornadaId: string, endedAt: Date): Promise<void> {
  const sello = new Date();
  const base = and(eq(jornadasCheckins.jornadaId, jornadaId), eq(jornadasCheckins.estado, "PENDIENTE"));

  await db
    .update(jornadasCheckins)
    .set({ estado: "SIN_RESPUESTA", updatedAt: sello })
    .where(and(base, lte(jornadasCheckins.scheduledAt, endedAt)));

  // Lo que siga pendiente (nunca entregado, o con hora posterior a la salida) no llegó a
  // ocurrir: se cancela en vez de contarlo como una falta.
  await db
    .update(jornadasCheckins)
    .set({ estado: "CANCELADO", updatedAt: sello })
    .where(base);
}

// ─── Lectura ────────────────────────────────────────────────────

function aDTO(fila: typeof jornadasCheckins.$inferSelect): CheckinDTO {
  return {
    id: fila.id,
    jornadaId: fila.jornadaId,
    blockIndex: fila.blockIndex,
    scheduledAt: fila.scheduledAt.toISOString(),
    deliveredAt: fila.deliveredAt ? fila.deliveredAt.toISOString() : null,
    respondedAt: fila.respondedAt ? fila.respondedAt.toISOString() : null,
    estado: fila.estado,
    expiraEn: fila.deliveredAt
      ? new Date(fila.deliveredAt.getTime() + VENTANA_RESPUESTA_MS).toISOString()
      : null,
  };
}

/**
 * El check-in que toca mostrar AHORA para esa sesión, o null. Devuelve el más antiguo de los
 * que ya vencieron su hora (si alguien estuvo desconectado, pueden acumularse varios).
 *
 * Efecto deliberado: al servirlo se sella `delivered_at` la primera vez. Ese es el momento en
 * que la ventana de respuesta empieza a correr, para que nadie quede como «Sin respuesta» por
 * una alerta que su navegador nunca mostró.
 */
export async function tomarPendiente(jornadaId: string, ahora: Date = new Date()): Promise<CheckinDTO | null> {
  const [fila] = await db
    .select()
    .from(jornadasCheckins)
    .where(
      and(
        eq(jornadasCheckins.jornadaId, jornadaId),
        eq(jornadasCheckins.estado, "PENDIENTE"),
        lte(jornadasCheckins.scheduledAt, ahora),
      ),
    )
    .orderBy(asc(jornadasCheckins.scheduledAt));

  if (!fila) return null;

  if (!fila.deliveredAt) {
    // Condicionado a isNull para que dos pestañas no reescriban la hora de entrega: la
    // primera que la sirve define la ventana, y esa es la que vale para todos.
    await db
      .update(jornadasCheckins)
      .set({ deliveredAt: ahora, updatedAt: ahora })
      .where(and(eq(jornadasCheckins.id, fila.id), isNull(jornadasCheckins.deliveredAt)));
    return aDTO({ ...fila, deliveredAt: ahora });
  }

  return aDTO(fila);
}

/**
 * RESPONDER («Sigo activo»). Actualiza EL MISMO registro: nunca crea uno nuevo.
 *
 * El UPDATE va condicionado a `estado = 'PENDIENTE'`. Si otra pestaña respondió primero, esta
 * actualiza cero filas y la relectura devuelve el registro con su `responded_at` ORIGINAL: un
 * solo registro real y una sola hora de respuesta, aunque el usuario tenga diez pestañas.
 *
 * `aplicado` indica si esta petición escribió la respuesta; `checkin` es siempre el estado real
 * guardado, que es lo que la interfaz debe mostrar.
 */
export async function responderCheckin(
  userId: string,
  checkinId: string,
): Promise<{ aplicado: boolean; checkin: CheckinDTO }> {
  const [fila] = await db
    .select()
    .from(jornadasCheckins)
    .where(and(eq(jornadasCheckins.id, checkinId), eq(jornadasCheckins.userId, userId)));

  if (!fila) {
    throw new CheckinNoEncontradoError("Ese check-in no existe o no es tuyo.");
  }

  const ahora = new Date();
  if (fila.estado === "PENDIENTE") {
    await db
      .update(jornadasCheckins)
      .set({
        estado: "RESPONDIDO",
        respondedAt: ahora,
        // Si la alerta se respondió sin haberse servido antes (caso raro), queda entregada.
        deliveredAt: fila.deliveredAt ?? ahora,
        updatedAt: ahora,
      })
      .where(and(eq(jornadasCheckins.id, checkinId), eq(jornadasCheckins.estado, "PENDIENTE")));
  }

  // Relectura: si otra pestaña ganó la carrera, aquí viene SU responded_at, no el nuestro.
  const [final] = await db.select().from(jornadasCheckins).where(eq(jornadasCheckins.id, checkinId));
  return { aplicado: fila.estado === "PENDIENTE", checkin: aDTO(final ?? fila) };
}

/** Conteos de varias sesiones en UNA sola consulta (nunca una por sesión). */
export async function conteosPorJornada(jornadaIds: string[]): Promise<Map<string, ConteoCheckinsDTO>> {
  const mapa = new Map<string, ConteoCheckinsDTO>();
  for (const id of jornadaIds) {
    mapa.set(id, { total: 0, respondidos: 0, sinRespuesta: 0, pendientes: 0, cancelados: 0 });
  }
  if (jornadaIds.length === 0) return mapa;

  const filas = await db
    .select({ jornadaId: jornadasCheckins.jornadaId, estado: jornadasCheckins.estado })
    .from(jornadasCheckins)
    .where(inArray(jornadasCheckins.jornadaId, jornadaIds));

  for (const fila of filas) {
    const conteo = mapa.get(fila.jornadaId);
    if (!conteo) continue;
    if (fila.estado === "RESPONDIDO") conteo.respondidos += 1;
    else if (fila.estado === "SIN_RESPUESTA") conteo.sinRespuesta += 1;
    else if (fila.estado === "CANCELADO") conteo.cancelados += 1;
    else conteo.pendientes += 1;
  }

  // Los cancelados nunca llegaron a ocurrir, así que no cuentan como algo que faltó responder.
  for (const conteo of mapa.values()) {
    conteo.total = conteo.respondidos + conteo.sinRespuesta + conteo.pendientes;
  }
  return mapa;
}

/** Detalle completo de los check-ins de una sesión (RRHH → Asistencia, al desplegar). */
export async function listarCheckinsDeJornada(jornadaId: string): Promise<CheckinDTO[]> {
  const filas = await db
    .select()
    .from(jornadasCheckins)
    .where(eq(jornadasCheckins.jornadaId, jornadaId))
    .orderBy(asc(jornadasCheckins.scheduledAt));
  return filas.map(aDTO);
}
