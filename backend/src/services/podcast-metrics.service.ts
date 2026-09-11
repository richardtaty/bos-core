/*
 * CAPA CENTRAL DE MÉTRICAS DE PODCAST.
 *
 * POR QUÉ EXISTE
 * Las pantallas de Podcast (Calendario, Cierre diario, Resumen automático, Mi desempeño y Reporte
 * de equipo) medían cada una por su cuenta, y la misma persona el mismo día podía dar 3 en una
 * pantalla y 1 en otra sin que nadie hubiera hecho nada mal. Este archivo es la ÚNICA
 * interpretación: todo lo que un usuario ve como cifra sale de acá.
 *
 * QUÉ NO ES
 * No es un módulo nuevo de cara al usuario, ni una tabla nueva, ni un dashboard. Es el lugar donde
 * vive el criterio. Las pantallas siguen siendo las mismas.
 *
 * LAS DOS FUENTES DE "PODCASTS" NO SE SUMAN NUNCA
 *   · Calendario (`podcast_citas`) → "agendados" y "completados". Es LA fuente de esas dos.
 *   · Pipeline (`historial_etapas`) → 1%, convertidos y no-shows. Y la versión Pipeline de
 *     agendados/completados, que NO es una métrica: es la otra fuente, y solo existe para poder
 *     avisar cuando las dos no coinciden (`discrepanciasDe`).
 *
 * ATRIBUCIÓN SIEMPRE POR ID, NUNCA POR TEXTO
 * `creado_por` (quién consiguió la cita) y `personas.responsable_id` (el dueño del contacto). Nunca
 * por nombre escrito, ni por email, ni por quién tocó el registro por última vez.
 *
 * Este archivo no importa nada de `podcast-performance.service.ts` a propósito: no hay ciclo.
 */

import { and, asc, eq, gte, inArray, isNotNull, lte, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { CANALES_CONTACTO } from "../lib/validation";
import {
  etapas,
  historialEtapas,
  personas,
  pipelines,
  podcastCitas,
  podcastReporteCanales,
  podcastReportesDiarios,
  registros,
  tareasSeguimiento,
  usuarios,
} from "../db/schema";

// ─── Zona horaria ─────────────────────────────────────────
// El negocio opera en Florida (America/New_York) y el servidor corre en UTC. Todo "qué día es"
// pasa por acá, nunca por `new Date().getDate()` directo. Igual que reportes.service.ts.

const ZONA_NEGOCIO = "America/New_York";

/** El día local (ET) al que pertenece un instante. Es la traducción de "epoch" a "fecha". */
export function fechaET(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_NEGOCIO, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function offsetETMinutos(fechaRef: Date): number {
  const comoUTC = new Date(fechaRef.toLocaleString("en-US", { timeZone: "UTC" }));
  const comoET = new Date(fechaRef.toLocaleString("en-US", { timeZone: ZONA_NEGOCIO }));
  return Math.round((comoUTC.getTime() - comoET.getTime()) / 60000);
}

/**
 * El primer y el último instante del día local. Devuelve `Date` porque la base guarda epoch en
 * segundos: comparar contra `fin` (23:59:59.999 hora de Florida) es lo que hace que un registro de
 * las 11 de la noche cuente el día correcto y no al siguiente.
 */
export function limitesDiaET(ymd: string): { inicio: Date; fin: Date } {
  const offsetMin = offsetETMinutos(new Date(`${ymd}T12:00:00Z`));
  const [y, m, d] = ymd.split("-").map(Number);
  const inicio = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offsetMin * 60000);
  return { inicio, fin: new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1) };
}

export function hoyET(): string {
  return fechaET(new Date());
}

export function sumarDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}

/** Todos los días del rango, ambos extremos incluidos. El rango es inclusivo en todo el sistema. */
export function fechasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) out.push(f);
  return out;
}

// ─── El Pipeline de Podcast: nombres declarados UNA sola vez ──
// Los nombres reales siguen viviendo en `seed.ts`. Esto solo evita que los mismos cinco textos
// estén escritos en tres `switch` distintos: si un día cambia uno, cambia en un solo lugar.

export const PIPELINE_PODCAST = "Podcast";

export const ETAPA_PODCAST = {
  AGENDADO: "Podcast agendado",
  REALIZADO: "Podcast realizado",
  NO_SHOW: "No-show",
  REUNION_1: "Reunión del 1%",
  VENTA_CERRADA: "Venta cerrada",
} as const;

// ─── El cuadro común ──────────────────────────────────────

/**
 * Lo que TODAS las pantallas devuelven para una persona y un día. Es el esquema compartido: si una
 * pantalla muestra una cifra de Podcast, sale de acá.
 *
 * `agendadosPipeline` y `completadosPipeline` NO son métricas: son la otra fuente, y existen solo
 * para poder avisar cuando el Pipeline dice algo distinto del Calendario. Nunca se muestran como
 * cifra ni se suman con las de arriba.
 */
export interface CuadroPodcast {
  agendados: number; // Calendario: citas creadas ese día (created_at, hora de Florida)
  completados: number; // Calendario: citas de ese día con estado "realizado"
  reuniones1: number; // Pipeline: movimiento a "Reunión del 1%"
  convertidos: number; // Pipeline: movimiento a "Venta cerrada"
  noShows: number; // Pipeline: movimiento a "No-show"
  followupsRealizados: number;
  followupsVencidos: number;
  enSeguimiento: number | null; // foto del momento: null si el período NO incluye hoy
  agendadosPipeline: number; // no es métrica: es la otra fuente, solo para el aviso
  completadosPipeline: number; // ídem
}

/** Un aviso de que el Pipeline y el Calendario no cuentan lo mismo ese día. No es una cifra más. */
export interface DiscrepanciaPodcast {
  usuarioId: string;
  nombre: string;
  fecha: string;
  concepto: "agendados" | "completados";
  citas: number;
  pipeline: number;
}

export function cuadroVacio(): CuadroPodcast {
  return {
    agendados: 0,
    completados: 0,
    reuniones1: 0,
    convertidos: 0,
    noShows: 0,
    followupsRealizados: 0,
    followupsVencidos: 0,
    enSeguimiento: null,
    agendadosPipeline: 0,
    completadosPipeline: 0,
  };
}

/** Suma varios cuadros en uno (los totales del equipo). `enSeguimiento` suma si hay dato en todos. */
export function sumarCuadros(cuadros: CuadroPodcast[]): CuadroPodcast {
  const total = cuadroVacio();
  let conSeguimiento = 0;
  for (const c of cuadros) {
    total.agendados += c.agendados;
    total.completados += c.completados;
    total.reuniones1 += c.reuniones1;
    total.convertidos += c.convertidos;
    total.noShows += c.noShows;
    total.followupsRealizados += c.followupsRealizados;
    total.followupsVencidos += c.followupsVencidos;
    total.agendadosPipeline += c.agendadosPipeline;
    total.completadosPipeline += c.completadosPipeline;
    if (c.enSeguimiento != null) {
      total.enSeguimiento = (total.enSeguimiento ?? 0) + c.enSeguimiento;
      conSeguimiento++;
    }
  }
  // Si a nadie le llegó el dato, el total es "sin dato" (null), no un 0 que parezca una medición.
  if (conSeguimiento === 0) total.enSeguimiento = null;
  return total;
}

/**
 * El cuadro tal como se muestra: sin las dos cifras del Pipeline, que no son métricas sino la otra
 * fuente. Solo sirven para calcular los avisos, y ya cumplieron su función para cuando esto se
 * llama: si se devolvieran, alguien las mostraría como un número más.
 */
export function cuadroVisible(c: CuadroPodcast): Omit<CuadroPodcast, "agendadosPipeline" | "completadosPipeline"> {
  const { agendadosPipeline, completadosPipeline, ...visible } = c;
  return visible;
}

// ─── Prospección (se muda acá, sin cambios de comportamiento) ──
// Solo se mueve a esta capa porque el Resumen del equipo, el Historial y Mi desempeño ya la
// compartían, pero vivía dentro del archivo de desempeño. La regla es la misma de siempre.

export interface CanalProspeccion {
  canal: string;
  contactados: number;
  respuestas: number;
  interesados: number;
}

/** Prospección de UN reporte, resuelta en un solo lugar para que los totales no puedan discrepar. */
export interface ProspeccionResuelta {
  contactados: number | null;
  respuestas: number | null;
  interesados: number | null;
  canales: CanalProspeccion[];
}

// La fila real del reporte, con el nombre del autor resuelto por JOIN (nunca por texto escrito: la
// relación es `usuario_id`). Devuelve null si esa persona no tiene reporte ese día.
export const REPORTE_DIARIO_COLUMNS = {
  id: podcastReportesDiarios.id,
  usuarioId: podcastReportesDiarios.usuarioId,
  usuarioNombre: usuarios.nombre,
  fecha: podcastReportesDiarios.fecha,
  prospectosEncontrados: podcastReportesDiarios.prospectosEncontrados,
  prospectosContactados: podcastReportesDiarios.prospectosContactados,
  respuestas: podcastReportesDiarios.respuestas,
  interesados: podcastReportesDiarios.interesados,
  compromisoContactos: podcastReportesDiarios.compromisoContactos,
  compromisoFollowups: podcastReportesDiarios.compromisoFollowups,
  compromisoPodcasts: podcastReportesDiarios.compromisoPodcasts,
  compromisoNota: podcastReportesDiarios.compromisoNota,
  bloqueos: podcastReportesDiarios.bloqueos,
  estado: podcastReportesDiarios.estado,
  enviadoEn: podcastReportesDiarios.enviadoEn,
  // Copia de las métricas automáticas al enviar (migración 0038). null en los reportes anteriores.
  metricasSnapshot: podcastReportesDiarios.metricasSnapshot,
  createdAt: podcastReportesDiarios.createdAt,
  updatedAt: podcastReportesDiarios.updatedAt,
};

export function sumarCanales(canales: CanalProspeccion[], campo: "contactados" | "respuestas" | "interesados"): number {
  return canales.reduce((acc, c) => acc + c[campo], 0);
}

/**
 * Cómo se lee la prospección de un reporte (regla única, usada por los totales generales y por el
 * desglose por canal — punto clave: no puede haber dos cifras que se contradigan):
 *   · con filas de canal → manda el desglose (las columnas viejas son su espejo derivado);
 *   · sin filas de canal (reportes anteriores a la migración 0037) → mandan las columnas;
 *   · sin ninguna de las dos → null, que significa "no registró", NUNCA 0.
 *
 * El total general NUNCA suma "Prospectos encontrados": esa métrica se eliminó del sistema y
 * seguir sumándola era justamente lo que hacía que el mismo día diera un número distinto en cada
 * pantalla. Tampoco se suma el total con los canales: el total ES la suma de los canales, sumar
 * las dos cosas duplicaría el resultado.
 */
export function resolverProspeccion(
  fila: { prospectosContactados: number | null; respuestas: number | null; interesados: number | null },
  canales: CanalProspeccion[]
): ProspeccionResuelta | null {
  if (canales.length > 0) {
    return {
      contactados: sumarCanales(canales, "contactados"),
      respuestas: sumarCanales(canales, "respuestas"),
      interesados: sumarCanales(canales, "interesados"),
      canales,
    };
  }
  if (fila.prospectosContactados == null && fila.respuestas == null && fila.interesados == null) return null;
  return {
    contactados: fila.prospectosContactados,
    respuestas: fila.respuestas,
    interesados: fila.interesados,
    canales: [],
  };
}

/** Suma un campo saltando los "no registró" (null). Si nadie registró nada, el total es null. */
export function sumarProspecciones(
  lista: (ProspeccionResuelta | null)[],
  campo: "contactados" | "respuestas" | "interesados"
): number | null {
  let total = 0;
  let hay = false;
  for (const p of lista) {
    const v = p?.[campo];
    if (v != null) {
      total += v;
      hay = true;
    }
  }
  return hay ? total : null;
}

/** Reportes con su desglose por canal, en dos consultas (nunca una por persona). */
export async function reportesConCanales(condicion: SQL) {
  const reportes = await db
    .select(REPORTE_DIARIO_COLUMNS)
    .from(podcastReportesDiarios)
    .innerJoin(usuarios, eq(podcastReportesDiarios.usuarioId, usuarios.id))
    .where(condicion);

  const ids = reportes.map((r) => r.id);
  const filasCanales = ids.length
    ? await db
        .select({
          reporteId: podcastReporteCanales.reporteId,
          canal: podcastReporteCanales.canal,
          contactados: podcastReporteCanales.contactados,
          respuestas: podcastReporteCanales.respuestas,
          interesados: podcastReporteCanales.interesados,
        })
        .from(podcastReporteCanales)
        .where(inArray(podcastReporteCanales.reporteId, ids))
        .orderBy(asc(podcastReporteCanales.orden))
    : [];

  const porReporte = new Map<string, CanalProspeccion[]>();
  for (const c of filasCanales) {
    const lista = porReporte.get(c.reporteId) ?? [];
    lista.push({ canal: c.canal, contactados: c.contactados, respuestas: c.respuestas, interesados: c.interesados });
    porReporte.set(c.reporteId, lista);
  }

  return reportes.map((r) => ({ fila: r, canales: porReporte.get(r.id) ?? [] }));
}

/** Orden canónico de los canales (el mismo del formulario del Cierre diario). */
export function ordenCanonicoCanales(): Map<string, number> {
  return new Map<string, number>(CANALES_CONTACTO.map((c, i) => [c, i]));
}

// ─── Consultas crudas, todas POR LOTE ─────────────────────
// Una consulta por fuente y período, nunca una por persona: el costo no puede depender del tamaño
// del equipo. Por eso todas reciben una lista de ids y devuelven filas sueltas.

/**
 * Movimientos de tarjetas en el Pipeline de Podcast dentro del rango. La atribución es `autor_id`:
 * quien movió la tarjeta. Es válido para 1%, convertidos y no-shows —el acto de registrarlo es el
 * único dato de persona que existe— y es la fuente "Pipeline" de agendados/completados, que solo
 * se usa para comparar.
 */
export async function movimientosPodcast(inicio: Date, fin: Date) {
  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.nombre, PIPELINE_PODCAST));
  if (!pipeline) return [];
  return db
    .select({
      autorId: historialEtapas.autorId,
      etapaNombre: etapas.nombre,
      fecha: historialEtapas.fecha,
    })
    .from(historialEtapas)
    .innerJoin(etapas, eq(historialEtapas.etapaNuevaId, etapas.id))
    .innerJoin(registros, eq(historialEtapas.registroId, registros.id))
    .where(and(eq(registros.pipelineId, pipeline.id), gte(historialEtapas.fecha, inicio), lte(historialEtapas.fecha, fin)));
}

/** Follow-ups completados en el rango, atribuidos al responsable del contacto (no a quien los cerró). */
export async function followupsCompletados(inicio: Date, fin: Date) {
  return db
    .select({
      responsableId: personas.responsableId,
      fecha: tareasSeguimiento.completadoEn,
    })
    .from(tareasSeguimiento)
    .innerJoin(personas, eq(tareasSeguimiento.personaId, personas.id))
    .where(and(gte(tareasSeguimiento.completadoEn, inicio), lte(tareasSeguimiento.completadoEn, fin)));
}

/**
 * Follow-ups vencidos de varias personas, en una sola consulta. Es una FOTO DEL MOMENTO (mira las
 * pendientes de hoy hacia atrás), no un evento con fecha: no se puede reconstruir para un día
 * pasado, y por eso quien la use debe tratarla como "sin dato" cuando el período no incluye hoy.
 */
export async function followupsVencidosDe(usuariosIds: string[], fin: Date) {
  if (usuariosIds.length === 0) return [];
  return db
    .select({ responsableId: personas.responsableId, id: tareasSeguimiento.id })
    .from(tareasSeguimiento)
    .innerJoin(personas, eq(tareasSeguimiento.personaId, personas.id))
    .where(
      and(
        inArray(personas.responsableId, usuariosIds),
        eq(tareasSeguimiento.completado, false),
        lte(tareasSeguimiento.fecha, fin)
      )
    );
}

/**
 * "En seguimiento": personas que todavía no transaccionaron y siguen trabajándose. Sale del
 * Pipeline de Podcast (tarjetas en una etapa que no es ganada ni perdida) atribuidas por
 * `personas.responsable_id` — la relación real con el dueño del contacto, no quién movió la
 * tarjeta por última vez, que cambiaría de dueño el resultado con cada edición.
 *
 * Como excluye las etapas ganadas, quien ya convirtió no vuelve a aparecer acá: una persona
 * convertida se cuenta una vez, como convertida. Y como se agrupa por persona, alguien con varias
 * tarjetas abiertas cuenta una sola vez.
 */
export async function personasEnSeguimientoDe(usuariosIds: string[]) {
  if (usuariosIds.length === 0) return [];
  return db
    .select({ responsableId: personas.responsableId, personaId: registros.personaId })
    .from(registros)
    .innerJoin(etapas, eq(registros.etapaId, etapas.id))
    .innerJoin(pipelines, eq(registros.pipelineId, pipelines.id))
    .innerJoin(personas, eq(registros.personaId, personas.id))
    .where(
      and(
        eq(pipelines.nombre, PIPELINE_PODCAST),
        eq(etapas.esGanada, false),
        eq(etapas.esPerdida, false),
        inArray(personas.responsableId, usuariosIds),
        isNotNull(registros.personaId)
      )
    );
}

/**
 * AGENDADOS — la definición oficial, y la única.
 *
 * Cuenta las citas que ESTA persona creó dentro del rango, por `created_at`: cuándo se consiguió la
 * cita, no cuándo se graba. Agendar hoy para dentro de tres semanas cuenta HOY, y no vuelve a
 * contar el día de la grabación. Se usa `created_at` (que nunca cambia) y NO `fecha`
 * (`event_date` / `recording_date` / `scheduled_for`): esas son la fecha del evento.
 *
 * De regalo, esto hace que reagendar no infle la cifra: mover la cita del 15 al 18 solo cambia
 * `fecha`, así que sigue siendo un solo agendado, el día en que se consiguió el invitado.
 */
export async function citasAgendadasDe(usuariosIds: string[], inicio: Date, fin: Date) {
  if (usuariosIds.length === 0) return [];
  return db
    .select({ creadoPor: podcastCitas.creadoPor, createdAt: podcastCitas.createdAt })
    .from(podcastCitas)
    .where(and(inArray(podcastCitas.creadoPor, usuariosIds), gte(podcastCitas.createdAt, inicio), lte(podcastCitas.createdAt, fin)));
}

/**
 * COMPLETADOS — la definición oficial, y la única.
 *
 * Cuenta las citas de esos días marcadas `estado = "realizado"`: hace falta el estado REAL de
 * realizada. Una fecha pasada NO implica que el podcast se haya hecho. El crédito es de quien
 * consiguió al invitado (`creado_por`), igual que en agendados: la atribución comercial original
 * no cambia porque otro haya marcado el registro al final.
 *
 * Un no-show o una cita cancelada simplemente no están en estado "realizado", así que no suman —
 * sin necesidad de una regla aparte.
 */
export async function citasRealizadasDe(usuariosIds: string[], fechas: string[]) {
  if (usuariosIds.length === 0 || fechas.length === 0) return [];
  return db
    .select({ creadoPor: podcastCitas.creadoPor, fecha: podcastCitas.fecha })
    .from(podcastCitas)
    .where(and(inArray(podcastCitas.creadoPor, usuariosIds), inArray(podcastCitas.fecha, fechas), eq(podcastCitas.estado, "realizado")));
}

// ─── Fuentes y reparto ────────────────────────────────────

export interface FuentesPodcast {
  incluyeHoy: boolean;
  movimientos: { autorId: string | null; etapaNombre: string | null; fecha: Date }[];
  followups: { responsableId: string | null; fecha: Date | null }[];
  citasAgendadas: { creadoPor: string | null; createdAt: Date }[];
  citasRealizadas: { creadoPor: string | null; fecha: string }[];
  seguimiento: { responsableId: string | null; personaId: string | null }[];
  vencidos: { responsableId: string | null }[];
}

/**
 * Trae TODAS las fuentes de un período en ~6 consultas, sin importar cuántas personas haya.
 *
 * Las dos de "foto del momento" (en seguimiento y vencidos) solo se consultan si el rango incluye
 * hoy. Para un período pasado devuelven vacío y `incluyeHoy` queda en false, que es lo que le dice
 * a la pantalla que muestre "—" en vez de un 0 inventado. Cero y "no se sabe" no son lo mismo.
 */
export async function traerFuentes(usuariosIds: string[], desde: string, hasta: string): Promise<FuentesPodcast> {
  const hoy = hoyET();
  const incluyeHoy = desde <= hoy && hoy <= hasta;
  const { inicio } = limitesDiaET(desde);
  const { fin } = limitesDiaET(hasta);

  const vacio: FuentesPodcast = {
    incluyeHoy,
    movimientos: [],
    followups: [],
    citasAgendadas: [],
    citasRealizadas: [],
    seguimiento: [],
    vencidos: [],
  };
  if (usuariosIds.length === 0) return vacio;

  const [movimientos, followups, citasAgendadas, citasRealizadas, seguimiento, vencidos] = await Promise.all([
    movimientosPodcast(inicio, fin),
    followupsCompletados(inicio, fin),
    citasAgendadasDe(usuariosIds, inicio, fin),
    citasRealizadasDe(usuariosIds, fechasEntre(desde, hasta)),
    incluyeHoy ? personasEnSeguimientoDe(usuariosIds) : Promise.resolve([] as FuentesPodcast["seguimiento"]),
    incluyeHoy ? followupsVencidosDe(usuariosIds, limitesDiaET(hoy).fin) : Promise.resolve([] as FuentesPodcast["vencidos"]),
  ]);

  return { incluyeHoy, movimientos, followups, citasAgendadas, citasRealizadas, seguimiento, vencidos };
}

/** Quiénes de la lista coinciden con una fila. Las filas de gente de afuera simplemente se ignoran. */
function _idsDentro<T>(filas: T[], id: (f: T) => string | null, usuariosIds: string[]): string[] {
  const dentro = new Set(usuariosIds);
  return filas.map(id).filter((i): i is string => !!i && dentro.has(i));
}

/**
 * Reparte las filas ya traídas en un cuadro por persona y por día. Función PURA: no consulta nada,
 * así que no puede introducir una consulta por persona ni un criterio distinto.
 *
 * `enSeguimiento` queda en null en todas las casillas: es una foto sin fecha, y solo tiene sentido
 * para el día de hoy. Se completa con `seguimientoPorUsuario` en la fecha que corresponda.
 */
export function repartir(
  usuariosIds: string[],
  fechas: string[],
  fuentes: FuentesPodcast
): Map<string, Map<string, CuadroPodcast>> {
  const porUsuario = new Map<string, Map<string, CuadroPodcast>>();
  for (const id of usuariosIds) {
    const porFecha = new Map<string, CuadroPodcast>();
    for (const f of fechas) porFecha.set(f, cuadroVacio());
    porUsuario.set(id, porFecha);
  }

  const casilla = (usuarioId: string | null, fecha: string) =>
    usuarioId ? porUsuario.get(usuarioId)?.get(fecha) ?? null : null;

  for (const m of fuentes.movimientos) {
    const b = casilla(m.autorId, fechaET(m.fecha));
    if (!b) continue;
    switch (m.etapaNombre) {
      case ETAPA_PODCAST.AGENDADO: b.agendadosPipeline++; break;
      case ETAPA_PODCAST.REALIZADO: b.completadosPipeline++; break;
      case ETAPA_PODCAST.REUNION_1: b.reuniones1++; break;
      case ETAPA_PODCAST.VENTA_CERRADA: b.convertidos++; break;
      case ETAPA_PODCAST.NO_SHOW: b.noShows++; break;
    }
  }

  // Calendario: manda sobre las dos cifras de podcasts. Es lo que hace que una misma persona y un
  // mismo día den el mismo número en el Cierre diario, en Mi desempeño y en el Reporte de equipo.
  for (const c of fuentes.citasAgendadas) {
    const b = casilla(c.creadoPor, fechaET(c.createdAt));
    if (b) b.agendados++;
  }
  for (const c of fuentes.citasRealizadas) {
    const b = casilla(c.creadoPor, c.fecha);
    if (b) b.completados++;
  }

  for (const f of fuentes.followups) {
    if (!f.fecha) continue;
    const b = casilla(f.responsableId, fechaET(f.fecha));
    if (b) b.followupsRealizados++;
  }

  return porUsuario;
}

/**
 * Follow-ups vencidos por persona (foto del momento). Devuelve un mapa vacío si las fuentes no
 * incluyen hoy: en ese caso el dato NO EXISTE, y quien lo consulte debe mostrar "—", no 0.
 */
export function vencidosPorUsuario(usuariosIds: string[], fuentes: FuentesPodcast): Map<string, number> {
  const porUsuario = new Map<string, number>();
  for (const id of _idsDentro(fuentes.vencidos, (v) => v.responsableId, usuariosIds)) {
    porUsuario.set(id, (porUsuario.get(id) ?? 0) + 1);
  }
  return porUsuario;
}

/** Personas en seguimiento por persona. Una misma persona con varias tarjetas abiertas cuenta una vez. */
export function seguimientoPorUsuario(usuariosIds: string[], fuentes: FuentesPodcast): Map<string, number> {
  const conjuntos = new Map<string, Set<string>>();
  for (const s of fuentes.seguimiento) {
    if (!s.responsableId || !s.personaId) continue;
    if (!usuariosIds.includes(s.responsableId)) continue;
    const set = conjuntos.get(s.responsableId) ?? new Set<string>();
    set.add(s.personaId);
    conjuntos.set(s.responsableId, set);
  }
  const porUsuario = new Map<string, number>();
  for (const [id, set] of conjuntos) porUsuario.set(id, set.size);
  return porUsuario;
}

/**
 * AVISOS DE CALIDAD DE DATOS, no métricas.
 *
 * El equipo registra el mismo podcast en dos lugares distintos: mueve la tarjeta en el Pipeline Y
 * anota la cita en el Calendario. Son actos independientes y pueden no coincidir. La cifra oficial
 * es la del Calendario; esto solo avisa cuando el Pipeline dice MÁS, que es el caso que importa
 * —alguien movió la tarjeta sin crear la cita, así que la cifra oficial no lo está contando—.
 *
 * El caso contrario (Calendario por encima del Pipeline) es lo normal y no se avisa: no hay nada
 * que corregir y sería puro ruido en todas las pantallas todos los días.
 */
export function discrepanciasDe(
  nombres: Map<string, string>,
  fechas: string[],
  repartido: Map<string, Map<string, CuadroPodcast>>
): DiscrepanciaPodcast[] {
  const avisos: DiscrepanciaPodcast[] = [];
  for (const [usuarioId, porFecha] of repartido) {
    for (const fecha of fechas) {
      const c = porFecha.get(fecha);
      if (!c) continue;
      const nombre = nombres.get(usuarioId) ?? "";
      if (c.agendadosPipeline > c.agendados) {
        avisos.push({ usuarioId, nombre, fecha, concepto: "agendados", citas: c.agendados, pipeline: c.agendadosPipeline });
      }
      if (c.completadosPipeline > c.completados) {
        avisos.push({ usuarioId, nombre, fecha, concepto: "completados", citas: c.completados, pipeline: c.completadosPipeline });
      }
    }
  }
  return avisos;
}
