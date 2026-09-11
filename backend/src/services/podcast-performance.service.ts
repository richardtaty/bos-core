import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, sqlite } from "../db/client";
import { CANALES_CONTACTO } from "../lib/validation";
import {
  pipelines,
  registros,
  usuarios,
  departamentos,
  usuarioDepartamentos,
  podcastMetas,
  podcastReportesDiarios,
  podcastReporteCanales,
  pagos,
} from "../db/schema";
import {
  ETAPA_PODCAST,
  REPORTE_DIARIO_COLUMNS,
  cuadroVisible,
  discrepanciasDe,
  fechaET,
  fechasEntre,
  followupsCompletados,
  followupsVencidosDe,
  hoyET,
  limitesDiaET,
  movimientosPodcast,
  personasEnSeguimientoDe,
  repartir,
  reportesConCanales,
  resolverProspeccion,
  seguimientoPorUsuario,
  sumarCanales,
  sumarCuadros,
  sumarDias,
  sumarProspecciones,
  traerFuentes,
  vencidosPorUsuario,
  type CanalProspeccion,
  type CuadroPodcast,
  type DiscrepanciaPodcast,
  type ProspeccionResuelta,
} from "./podcast-metrics.service";

// ─── Alias de la capa central ─────────────────────────────
// Estas funciones YA NO viven acá: se mudaron a `podcast-metrics.service.ts`, que es el único
// lugar donde se interpretan las métricas de Podcast. Los alias existen para que los ~20 puntos
// de uso de este archivo no tengan que cambiar de nombre.
const _movimientosPodcast = movimientosPodcast;
const _followupsCompletados = followupsCompletados;
const _sumarCanales = sumarCanales;
const _resolverProspeccion = resolverProspeccion;
const _sumarProspecciones = sumarProspecciones;
const _reportesConCanales = reportesConCanales;

// El día de hoy, calculado en la zona del negocio. Se reexporta porque las rutas ya lo importaban
// desde acá; ahora es la capa central la que lo define.
export { hoyET };

// ─── Tipos ────────────────────────────────────────────────

export interface MetasPodcast {
  prospectosEncontrados: number;
  prospectosContactados: number;
  podcastsAgendados: number;
  followupsRatio: number;
}

export interface MetricasDia {
  fecha: string;
  encontrados: number;
  contactados: number;
  respuestas: number;
  interesados: number;
  followupsRealizados: number;
  followupsVencidos: number;
  agendados: number;
  realizados: number;
  reuniones: number;
  ventas: number;
  noShows: number;
}

export interface Compromiso {
  contactos: number | null;
  followups: number | null;
  podcasts: number | null;
  nota: string | null;
}

export interface DesgloseScore {
  total: number;
  actividad: number;
  followup: number;
  resultados: number;
  continuidad: number;
  // Puntos sobre los que se calculó el total. Es 100 siempre, salvo que la Actividad no se haya
  // podido medir ese día (sin Cierre diario): entonces quedan 80 y el total se reparte sobre esos
  // 80 para seguir siendo comparable con cualquier otro día. Ver `parcial`.
  maxDisponible: number;
  /** true cuando algún componente no se pudo medir y el total se reparte sobre `maxDisponible`. */
  parcial: boolean;
  /** false = ese día no hay prospección registrada, así que la Actividad no se puntúa. */
  actividadDisponible: boolean;
}

type Nivel = "normal" | "atencion" | "intervencion";

export interface AlertaPodcast {
  tipo: string;
  nivel: Exclude<Nivel, "normal">;
  titulo: string;
  evidencia: string;
  comparacion: string;
  causa: string;
  accion: string;
}

export interface ComparacionKpi {
  clave: string;
  label: string;
  /** null = ese día no hay dato registrado. Se pinta "—", NUNCA un 0 que nadie escribió. */
  hoy: number | null;
  ayer: number | null;
  promedio7: number | null;
  meta: number | null;
  cumplimiento: number | null;
  variacionAyer: number | null;
  tendencia: "mejorando" | "estable" | "bajando";
  /** false cuando hoy no hay dato: la fila se muestra en blanco en vez de con ceros. */
  disponible: boolean;
}

// Un bloque de prospección del día: qué produjo UN canal. Es la unidad que se guarda; los
// totales del día no existen como dato, se suman a partir de estos bloques.
export type { CanalProspeccion };

// "Resultados de hoy": todo lo que BOS ya calcula solo. No hay ni un campo manual aquí, así que
// nada de esto se guarda — se recalcula al leer y por eso nunca puede contradecir al CRM.
//
// UNA cifra por concepto. Antes había dos versiones de "podcasts agendados" y de "podcasts
// completados" (una del Pipeline y otra del Calendario) mostradas una al lado de la otra, y la
// misma persona el mismo día podía dar 3 en una pantalla y 1 en otra. Ahora manda el Calendario,
// que es la fuente oficial, y `discrepancias` avisa —sin ser una cifra— cuando el Pipeline dice
// algo distinto.
export interface ResultadosDia {
  agendados: number; // Calendario: citas que ESTA persona consiguió hoy (no cuándo se graban)
  completados: number; // Calendario: citas de hoy marcadas "realizado" que consiguió esta persona
  reuniones1: number; // Pipeline: etapa "Reunión del 1%"
  convertidos: number; // Pipeline: etapa "Venta cerrada"
  noShows: number; // Pipeline: etapa "No-show"
  followupsRealizados: number;
  followupsVencidos: number; // foto del momento
  enSeguimiento: number | null; // foto del momento; null si no hay dato
  discrepancias: DiscrepanciaPodcast[]; // avisos de calidad de datos, NO métricas
}

export interface GuardarReporteInput {
  canales?: CanalProspeccion[];
  prospectosEncontrados?: number;
  prospectosContactados?: number;
  respuestas?: number;
  interesados?: number;
  compromisoContactos?: number;
  compromisoFollowups?: number;
  compromisoPodcasts?: number;
  compromisoNota?: string;
  bloqueos?: string;
  enviar?: boolean;
}

// ─── Metas ────────────────────────────────────────────────

const METAS_DEFAULT: MetasPodcast = {
  prospectosEncontrados: 50,
  prospectosContactados: 50,
  podcastsAgendados: 3,
  followupsRatio: 100,
};

// Metas que ya salieron del flujo de trabajo. "Prospectos encontrados" dejó de ser la métrica
// inicial de prospección (hoy es "Prospectos contactados") y el Cierre diario nuevo ya no la
// manda, así que no tiene sentido pedirle a nadie que la configure.
//
// NO se borra de `podcast_metas`: la fila sigue en la base por si algún día hace falta. Sólo se
// oculta de la pantalla de Metas, y como `guardarMetas` recorre únicamente los items que recibe,
// nunca la toca. El campo `metas.prospectosEncontrados` se sigue devolviendo porque el Historial lo
// usa para mostrar los reportes viejos que sí registraron ese dato.
const METAS_OCULTAS = new Set(["prospectos_encontrados"]);

export async function obtenerMetas(): Promise<{ items: { clave: string; nombre: string; valor: number }[]; metas: MetasPodcast }> {
  const filas = await db.select().from(podcastMetas);
  const porClave = new Map(filas.map((f) => [f.clave, f.valor]));
  const metas: MetasPodcast = {
    prospectosEncontrados: porClave.get("prospectos_encontrados") ?? METAS_DEFAULT.prospectosEncontrados,
    prospectosContactados: porClave.get("prospectos_contactados") ?? METAS_DEFAULT.prospectosContactados,
    podcastsAgendados: porClave.get("podcasts_agendados") ?? METAS_DEFAULT.podcastsAgendados,
    followupsRatio: porClave.get("followups_ratio") ?? METAS_DEFAULT.followupsRatio,
  };
  return { items: filas.filter((f) => !METAS_OCULTAS.has(f.clave)), metas };
}

export async function guardarMetas(lista: { clave: string; nombre: string; valor: number }[]) {
  for (const m of lista) {
    const [existente] = await db.select().from(podcastMetas).where(eq(podcastMetas.clave, m.clave));
    if (existente) {
      await db.update(podcastMetas).set({ valor: m.valor, updatedAt: new Date() }).where(eq(podcastMetas.clave, m.clave));
    } else {
      await db.insert(podcastMetas).values({
        id: crypto.randomUUID(),
        clave: m.clave,
        nombre: m.nombre,
        valor: m.valor,
        updatedAt: new Date(),
      });
    }
  }
  return obtenerMetas();
}

// ─── Fuentes de métricas (queries base) ───────────────────
// `_movimientosPodcast` y `_followupsCompletados` son alias de la capa central (ver arriba).

/** Follow-ups vencidos de UNA persona: la versión por lote de la capa central, aplicada a una. */
async function _followupsVencidos(usuarioId: string, fin: Date): Promise<number> {
  return (await followupsVencidosDe([usuarioId], fin)).length;
}

function _metricasVacio(fecha: string): MetricasDia {
  return {
    fecha,
    encontrados: 0,
    contactados: 0,
    respuestas: 0,
    interesados: 0,
    followupsRealizados: 0,
    followupsVencidos: 0,
    agendados: 0,
    realizados: 0,
    reuniones: 0,
    ventas: 0,
    noShows: 0,
  };
}

/**
 * Reparte filas YA TRAÍDAS en métricas por persona y por día. Función pura: no consulta nada.
 *
 * Existe para que la versión de una persona (`_metricasPara`) y la de todo el equipo
 * (`_metricasEquipo`) compartan exactamente el mismo criterio. Antes cada una tenía su propia
 * copia del reparto, y las consultas base —que traen todo el equipo— se repetían una vez por
 * integrante (N+1).
 *
 * Sólo se crean casillas para las personas de `usuariosIds`: lo que venga de alguien de afuera
 * simplemente se descarta, igual que antes.
 */
function _repartirMetricas(
  usuariosIds: string[],
  fechas: string[],
  movimientos: { autorId: string | null; etapaNombre: string | null; fecha: Date }[],
  completados: { responsableId: string | null; fecha: Date | null }[],
  reportes: { usuarioId: string; fecha: string; prospectosEncontrados: number | null; prospectosContactados: number | null; respuestas: number | null; interesados: number | null }[]
): Map<string, Map<string, MetricasDia>> {
  const porUsuario = new Map<string, Map<string, MetricasDia>>();
  for (const id of usuariosIds) {
    const porFecha = new Map<string, MetricasDia>();
    for (const f of fechas) porFecha.set(f, _metricasVacio(f));
    porUsuario.set(id, porFecha);
  }

  const casilla = (usuarioId: string | null, fecha: string) =>
    usuarioId ? porUsuario.get(usuarioId)?.get(fecha) ?? null : null;

  for (const m of movimientos) {
    const b = casilla(m.autorId, fechaET(m.fecha));
    if (!b) continue;
    switch (m.etapaNombre) {
      case ETAPA_PODCAST.AGENDADO: b.agendados++; break;
      case ETAPA_PODCAST.REALIZADO: b.realizados++; break;
      case ETAPA_PODCAST.REUNION_1: b.reuniones++; break;
      case ETAPA_PODCAST.VENTA_CERRADA: b.ventas++; break;
      case ETAPA_PODCAST.NO_SHOW: b.noShows++; break;
    }
  }

  for (const c of completados) {
    if (!c.fecha) continue;
    const b = casilla(c.responsableId, fechaET(c.fecha));
    if (b) b.followupsRealizados++;
  }

  for (const rep of reportes) {
    const b = porUsuario.get(rep.usuarioId)?.get(rep.fecha);
    if (!b) continue;
    b.encontrados = rep.prospectosEncontrados ?? 0;
    b.contactados = rep.prospectosContactados ?? 0;
    b.respuestas = rep.respuestas ?? 0;
    b.interesados = rep.interesados ?? 0;
  }

  return porUsuario;
}

// Devuelve las métricas diarias (auto + manual del reporte) para un usuario en un rango de días.
async function _metricasPara(usuarioId: string, fechas: string[]): Promise<Map<string, MetricasDia>> {
  if (fechas.length === 0) return new Map<string, MetricasDia>();

  const desde = fechas[0];
  const hasta = fechas[fechas.length - 1];
  const { inicio } = limitesDiaET(desde);
  const { fin } = limitesDiaET(hasta);

  const [movimientos, completados, reportes] = await Promise.all([
    _movimientosPodcast(inicio, fin),
    _followupsCompletados(inicio, fin),
    db
      .select()
      .from(podcastReportesDiarios)
      .where(and(eq(podcastReportesDiarios.usuarioId, usuarioId), gte(podcastReportesDiarios.fecha, desde), lte(podcastReportesDiarios.fecha, hasta))),
  ]);

  return _repartirMetricas([usuarioId], fechas, movimientos, completados, reportes).get(usuarioId)!;
}

async function _serieMetricas(usuarioId: string, dias: number): Promise<MetricasDia[]> {
  const hoy = hoyET();
  const fechas: string[] = [];
  for (let i = dias - 1; i >= 0; i--) fechas.push(sumarDias(hoy, -i));
  const porFecha = await _metricasPara(usuarioId, fechas);
  const serie = fechas.map((f) => porFecha.get(f)!);
  serie[serie.length - 1].followupsVencidos = await _followupsVencidos(usuarioId, limitesDiaET(hoy).fin);
  return serie;
}

async function _compromisoDe(usuarioId: string, fecha: string): Promise<Compromiso | null> {
  const [rep] = await db
    .select()
    .from(podcastReportesDiarios)
    .where(and(eq(podcastReportesDiarios.usuarioId, usuarioId), eq(podcastReportesDiarios.fecha, fecha)));
  if (!rep) return null;
  return {
    contactos: rep.compromisoContactos,
    followups: rep.compromisoFollowups,
    podcasts: rep.compromisoPodcasts,
    nota: rep.compromisoNota,
  };
}

/**
 * El compromiso que cada persona dejó para el día siguiente, en UNA consulta para todo el equipo.
 * La versión de a una persona por vez sería un N+1: el compromiso de hoy es lo que esa persona
 * escribió en su reporte de ayer.
 */
async function _compromisosDeEquipo(usuariosIds: string[], fecha: string): Promise<Map<string, Compromiso | null>> {
  const porUsuario = new Map<string, Compromiso | null>();
  if (usuariosIds.length === 0) return porUsuario;
  const filas = await db
    .select()
    .from(podcastReportesDiarios)
    .where(and(inArray(podcastReportesDiarios.usuarioId, usuariosIds), eq(podcastReportesDiarios.fecha, fecha)));
  for (const f of filas) {
    porUsuario.set(f.usuarioId, {
      contactos: f.compromisoContactos,
      followups: f.compromisoFollowups,
      podcasts: f.compromisoPodcasts,
      nota: f.compromisoNota,
    });
  }
  return porUsuario;
}

// ─── Score (transparente, 0–100) ─────────────────────────

function _redondear(n: number): number {
  return Math.round(n * 10) / 10;
}

export function calcularScore(
  m: MetricasDia,
  metas: MetasPodcast,
  compromisoAyer: Compromiso | null,
  opts: { contactados?: number | null } = {}
): DesgloseScore {
  // Actividad (20): prospectos CONTACTADOS vs meta. "Prospectos encontrados" salió del flujo (el
  // formulario nuevo del Cierre diario ya no lo manda), así que ya no entra en la fórmula: dejarlo
  // adentro dejaba topado en la mitad de este componente a quien usa el formulario nuevo. El peso
  // se mantiene en 20; sólo se le quitó la entrada obsoleta.
  //
  // `opts.contactados === null` significa "ese día no hay prospección registrada": no es lo mismo
  // que 0 contactados, así que la Actividad NO se puntúa como 0 — se saca del total y el resto se
  // reparte sobre los puntos que sí son reales (ver `maxDisponible`).
  const contactados = opts.contactados === undefined ? m.contactados : opts.contactados;
  const actividadDisponible = contactados !== null;
  const cumplContactados = actividadDisponible && metas.prospectosContactados > 0
    ? Math.min(1, (contactados as number) / metas.prospectosContactados)
    : 0;
  const actividad = cumplContactados * 20;

  // Follow-up (20): realizados hoy vs (realizados + vencidos), contra la meta configurable
  // de % de follow-ups completados (followups_ratio). Meta por defecto 100%.
  const denomFollowup = m.followupsRealizados + m.followupsVencidos;
  const ratioFollowup = denomFollowup > 0 ? m.followupsRealizados / denomFollowup : 1;
  const objetivoFollowup = metas.followupsRatio > 0 ? metas.followupsRatio / 100 : 1;
  const followup = Math.min(1, ratioFollowup / objetivoFollowup) * 20;

  // Resultados (40): agendados vs meta (20) + realizados vs meta (20).
  const metaAgendados = metas.podcastsAgendados;
  const cumplAgendados = metaAgendados > 0 ? Math.min(1, m.agendados / metaAgendados) : 0;
  const cumplRealizados = metaAgendados > 0 ? Math.min(1, m.realizados / metaAgendados) : 0;
  const resultados = cumplAgendados * 20 + cumplRealizados * 20;

  // Continuidad (20): cumplimiento del compromiso de ayer. Sin compromiso → neutro (20).
  // El ratio de contactos se OMITE cuando la prospección no es medible: contarlo como 0 sería
  // castigar a alguien por no haber podido medir, no por haber incumplido.
  let continuidad = 20;
  if (compromisoAyer && (compromisoAyer.contactos || compromisoAyer.followups || compromisoAyer.podcasts)) {
    const ratios: number[] = [];
    if (compromisoAyer.contactos && actividadDisponible) ratios.push(Math.min(1, (contactados as number) / compromisoAyer.contactos));
    if (compromisoAyer.followups) ratios.push(Math.min(1, m.followupsRealizados / compromisoAyer.followups));
    if (compromisoAyer.podcasts) ratios.push(Math.min(1, m.agendados / compromisoAyer.podcasts));
    if (ratios.length > 0) continuidad = (ratios.reduce((a, b) => a + b, 0) / ratios.length) * 20;
  }

  // El total se reparte sobre los puntos que sí se pudieron medir, para que siga estando en la
  // misma escala (sobre 100) y se pueda comparar con cualquier otro día. `100 / 100` es 1 exacto,
  // así que un día completo da exactamente el mismo número de siempre.
  const maxDisponible = actividadDisponible ? 100 : 80;
  const suma = actividad + followup + resultados + continuidad;

  return {
    total: _redondear(suma * (100 / maxDisponible)),
    actividad: _redondear(actividad),
    followup: _redondear(followup),
    resultados: _redondear(resultados),
    continuidad: _redondear(continuidad),
    maxDisponible,
    parcial: !actividadDisponible,
    actividadDisponible,
  };
}

function _tendencia(hoy: number, promedio7: number): "mejorando" | "estable" | "bajando" {
  if (promedio7 === 0) return hoy > 0 ? "mejorando" : "estable";
  const ratio = hoy / promedio7;
  if (ratio >= 1.1) return "mejorando";
  if (ratio <= 0.9) return "bajando";
  return "estable";
}

/**
 * KPIs del día contra ayer y contra el promedio de los 6 días anteriores.
 *
 * El orden de las filas es el del embudo: contactados → respuestas → interesados → agendados →
 * completados → 1% → convertidos. "Prospectos encontrados" ya NO está: salió del flujo y el
 * Cierre diario nuevo no lo manda.
 *
 * `prospeccionPorFecha` es la prospección resuelta con la regla única del módulo (canal → columnas
 * → null). Cuando se pasa, las tres filas de prospección respetan el null ("no registró" ≠ "0") y
 * el promedio de 7 días se calcula sólo sobre los días que sí tienen dato, para que un día sin
 * reporte no arrastre el promedio hacia abajo como si fuera un cero.
 */
function _comparaciones(
  serie: MetricasDia[],
  metas: MetasPodcast,
  prospeccionPorFecha?: Map<string, { prospeccion: ProspeccionResuelta | null }>
): ComparacionKpi[] {
  const hoy = serie[serie.length - 1];
  const prev = serie.slice(0, -1);
  const ayer = prev.length ? prev[prev.length - 1] : hoy;

  const kpis: { clave: keyof MetricasDia; label: string; meta: number | null; prospeccion?: "contactados" | "respuestas" | "interesados" }[] = [
    { clave: "contactados", label: "Prospectos contactados", meta: metas.prospectosContactados, prospeccion: "contactados" },
    { clave: "respuestas", label: "Respuestas", meta: null, prospeccion: "respuestas" },
    { clave: "interesados", label: "Interesados", meta: null, prospeccion: "interesados" },
    { clave: "agendados", label: "Podcasts agendados", meta: metas.podcastsAgendados },
    { clave: "realizados", label: "Podcasts completados", meta: null },
    { clave: "reuniones", label: "1% completados", meta: null },
    { clave: "ventas", label: "Convertidos", meta: null },
    { clave: "followupsRealizados", label: "Follow-ups realizados", meta: null },
  ];

  // Sin la capa null-aware, las métricas se leen de la serie como siempre. Con ella, las tres de
  // prospección salen de la prospección resuelta y pueden valer null.
  const valor = (d: MetricasDia, k: typeof kpis[number]): number | null => {
    if (k.prospeccion && prospeccionPorFecha) {
      const p = prospeccionPorFecha.get(d.fecha)?.prospeccion;
      return p ? p[k.prospeccion] : null;
    }
    return d[k.clave] as number;
  };

  const promedio = (valores: (number | null)[], saltearNulos: boolean): number | null => {
    const utiles = saltearNulos ? valores.filter((v): v is number => v !== null) : (valores as number[]);
    if (utiles.length === 0) return saltearNulos ? null : 0;
    return utiles.reduce((a, b) => a + b, 0) / utiles.length;
  };

  return kpis.map((k) => {
    const saltearNulos = Boolean(k.prospeccion && prospeccionPorFecha);
    const hoyVal = valor(hoy, k);
    const ayerVal = valor(ayer, k);
    const prom7 = promedio(prev.map((d) => valor(d, k)), saltearNulos);
    return {
      clave: k.clave,
      label: k.label,
      hoy: hoyVal,
      ayer: ayerVal,
      promedio7: prom7 === null ? null : _redondear(prom7),
      meta: k.meta,
      cumplimiento: k.meta && hoyVal !== null ? Math.round((hoyVal / k.meta) * 100) : null,
      variacionAyer: hoyVal !== null && ayerVal !== null && ayerVal > 0 ? Math.round(((hoyVal - ayerVal) / ayerVal) * 100) : null,
      tendencia: _tendencia(hoyVal ?? 0, prom7 ?? 0),
      disponible: hoyVal !== null,
    };
  });
}

// ─── Motor de alertas (reglas deterministas) ─────────────

const NIVEL_ORDEN: Record<Nivel, number> = { normal: 0, atencion: 1, intervencion: 2 };

function _alertasUsuario(
  serie: MetricasDia[],
  compromisoAyer: Compromiso | null,
  prospeccionMedible = true
): AlertaPodcast[] {
  const hoy = serie[serie.length - 1];
  const prev = serie.slice(0, -1);
  const prom = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const promAgendados = prom(prev.map((d) => d.agendados));
  const alertas: AlertaPodcast[] = [];

  // 1. Caída de productividad: agendados hoy muy por debajo del promedio reciente.
  if (promAgendados >= 1 && hoy.agendados <= promAgendados * 0.4) {
    const severo = hoy.agendados <= promAgendados * 0.2;
    alertas.push({
      tipo: "caida_productividad",
      nivel: severo ? "intervencion" : "atencion",
      titulo: "Caída de productividad",
      // El contacto sólo se menciona si se pudo medir: si no hay Cierre diario, decir "contactó 0"
      // sería contar la ausencia de reporte como si fuera ausencia de trabajo.
      evidencia: prospeccionMedible
        ? `Hoy agendó ${hoy.agendados} podcast(s) y contactó ${hoy.contactados} prospecto(s).`
        : `Hoy agendó ${hoy.agendados} podcast(s), según los movimientos del Pipeline.`,
      comparacion: `Su promedio reciente era ${promAgendados.toFixed(1)} agendados/día.`,
      causa: "Ritmo de prospección por debajo de lo habitual.",
      accion: "Revisar bloqueos y priorizar contacto de prospectos hoy.",
    });
  }

  // 2. Compromiso de ayer incumplido.
  // Esta regla compara contra los contactos de hoy, así que sólo tiene sentido si la prospección
  // se pudo medir. Sin Cierre diario no se sabe si cumplió, y disparar la alerta sería justo lo
  // que no queremos: interpretar la falta de reporte como cero actividad.
  if (prospeccionMedible && compromisoAyer && (compromisoAyer.contactos || compromisoAyer.followups || compromisoAyer.podcasts)) {
    const ratios: number[] = [];
    if (compromisoAyer.contactos) ratios.push(compromisoAyer.contactos > 0 ? hoy.contactados / compromisoAyer.contactos : 0);
    if (compromisoAyer.followups) ratios.push(compromisoAyer.followups > 0 ? hoy.followupsRealizados / compromisoAyer.followups : 0);
    if (compromisoAyer.podcasts) ratios.push(compromisoAyer.podcasts > 0 ? hoy.agendados / compromisoAyer.podcasts : 0);
    const cumplimiento = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
    if (cumplimiento < 0.5) {
      alertas.push({
        tipo: "compromiso_incumplido",
        nivel: cumplimiento === 0 ? "intervencion" : "atencion",
        titulo: "Compromiso de ayer sin cumplir",
        evidencia: `Ayer se comprometió a ${compromisoAyer.contactos ?? 0} contactos, ${compromisoAyer.followups ?? 0} follow-ups y ${compromisoAyer.podcasts ?? 0} podcasts.`,
        comparacion: `Hoy alcanzó ${hoy.contactados} contactos, ${hoy.followupsRealizados} follow-ups y ${hoy.agendados} podcasts (${Math.round(cumplimiento * 100)}% del compromiso).`,
        causa: "El compromiso se prometió por encima de lo ejecutable, o hubo un bloqueo no reportado.",
        accion: "Revisar qué lo frenó y reajustar el compromiso de mañana a algo realista.",
      });
    }
  }

  // 3. Incongruencia: reporta interés pero no agenda podcasts.
  if (hoy.contactados >= 5 && hoy.interesados >= 1 && hoy.agendados === 0) {
    alertas.push({
      tipo: "incongruencia",
      nivel: "atencion",
      titulo: "Interesados sin podcast agendado",
      evidencia: `Hoy registró ${hoy.interesados} interesado(s) y ${hoy.contactados} contactos, pero 0 podcasts agendados.`,
      comparacion: "Lo esperado es que un interesado pase a podcast agendado en el mismo día o al siguiente.",
      causa: "Posible fricción al cerrar la agenda (falta de calendario, guion, o seguimiento).",
      accion: "Confirmar que los interesados tienen fecha de grabación agendada antes de cerrar el día.",
    });
  }

  // 4. Cuello de botella: muchos realizados, pocas reuniones del 1%.
  const realizados7 = prom(prev.map((d) => d.realizados)) * prev.length + hoy.realizados;
  const reuniones7 = prom(prev.map((d) => d.reuniones)) * prev.length + hoy.reuniones;
  if (realizados7 >= 3 && reuniones7 / realizados7 < 0.5) {
    alertas.push({
      tipo: "cuello_botella",
      nivel: "atencion",
      titulo: "Cuello de botella en la conversión",
      evidencia: `${realizados7} podcasts realizados en los últimos días pero solo ${reuniones7} reuniones del 1%.`,
      comparacion: "La conversión esperada de realizado → reunión debería estar por encima del 50%.",
      causa: "Falta seguimiento posterior a la grabación para llevar al invitado a la reunión del 1%.",
      accion: "Priorizar el envío de contenido y landing a los invitados ya realizados.",
    });
  }

  return alertas;
}

function _estadoIA(alertas: AlertaPodcast[]): Nivel {
  let nivel: Nivel = "normal";
  for (const a of alertas) if (NIVEL_ORDEN[a.nivel] > NIVEL_ORDEN[nivel]) nivel = a.nivel;
  return nivel;
}

// ─── Usuarios del equipo Podcast ─────────────────────────

async function _usuariosPodcast(): Promise<{ id: string; nombre: string }[]> {
  const [depto] = await db.select().from(departamentos).where(eq(departamentos.nombre, "Podcast"));
  if (!depto) return [];

  const porMulti = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre })
    .from(usuarios)
    .innerJoin(usuarioDepartamentos, eq(usuarios.id, usuarioDepartamentos.usuarioId))
    .where(and(eq(usuarioDepartamentos.departamentoId, depto.id), eq(usuarios.activo, true)));

  const porLegacy = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre })
    .from(usuarios)
    .where(and(eq(usuarios.departamentoId, depto.id), eq(usuarios.activo, true)));

  const mapa = new Map<string, { id: string; nombre: string }>();
  for (const u of [...porMulti, ...porLegacy]) if (!mapa.has(u.id)) mapa.set(u.id, u);
  return Array.from(mapa.values());
}

/**
 * Quién puede ser RESPONSABLE de una tarea de Podcast: los miembros reales del
 * departamento (relación estructurada `usuario_departamentos` / `usuarios.departamento_id`,
 * nunca por nombre escrito) más los SUPER_ADMIN activos, que operan en cualquier
 * departamento y además permiten asignar tareas aunque el equipo esté recién creado.
 */
export async function miembrosElegiblesPodcast(): Promise<{ id: string; nombre: string }[]> {
  const delEquipo = await _usuariosPodcast();

  const superAdmins = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre })
    .from(usuarios)
    .where(and(eq(usuarios.rol, "SUPER_ADMIN"), eq(usuarios.activo, true)));

  const mapa = new Map<string, { id: string; nombre: string }>();
  for (const u of [...delEquipo, ...superAdmins]) if (!mapa.has(u.id)) mapa.set(u.id, u);
  return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** ¿Esta persona puede ser responsable de una tarea de Podcast? */
export async function esMiembroElegiblePodcast(usuarioId: string): Promise<boolean> {
  const miembros = await miembrosElegiblesPodcast();
  return miembros.some((m) => m.id === usuarioId);
}

// ─── Reporte diario ──────────────────────────────────────

// `REPORTE_DIARIO_COLUMNS` es un alias de la capa central (ver arriba).

async function _filaReporte(usuarioId: string, fecha: string) {
  const [rep] = await db
    .select(REPORTE_DIARIO_COLUMNS)
    .from(podcastReportesDiarios)
    .innerJoin(usuarios, eq(podcastReportesDiarios.usuarioId, usuarios.id))
    .where(and(eq(podcastReportesDiarios.usuarioId, usuarioId), eq(podcastReportesDiarios.fecha, fecha)));
  return rep ?? null;
}

// Métricas de UN día concreto: las automáticas que BOS calcula más lo manual que la persona
// escribió ese día.
//
// Es `_metricasEquipo` aplicada a una sola persona, y no una versión propia: así el Cierre diario y
// el Historial muestran EXACTAMENTE el mismo número que Mi desempeño para esa persona y ese día.
// Antes esto salía de `_metricasPara` (la versión Pipeline, la única que quedó para Inteligencia) y
// por eso el Cierre diario podía decir 3 donde Mi desempeño decía 1.
async function _metricasDelDia(usuarioId: string, fecha: string): Promise<MetricasDia> {
  const metricas = (await _metricasEquipo([usuarioId], fecha, fecha)).get(usuarioId)!.get(fecha)!;
  metricas.followupsVencidos = await _followupsVencidos(usuarioId, limitesDiaET(fecha).fin);
  return metricas;
}

// ─── Sello de las métricas automáticas ────────────────────
//
// Las métricas del CRM (agendados, completados, 1%, convertidos, no-shows, follow-ups) no se
// guardaban en ningún lado: se recalculan en cada lectura. Eso hacía que un reporte enviado el 11
// de septiembre cambiara solo si semanas después alguien corregía una tarjeta vieja.
//
// Al pasar a "enviado" se guarda una copia de lo que BOS calculaba en ese momento. Como
// `guardarReporteDiario` escribe SIEMPRE para el día de hoy, una vez que el día termina el sello ya
// no puede cambiar: no hace falta ninguna condición temporal, queda congelado por construcción.

interface MetricasSnapshot {
  v: 1;
  agendados: number;
  completados: number;
  reuniones1: number;
  convertidos: number;
  noShows: number;
  followupsRealizados: number;
  followupsVencidos: number;
}

/**
 * Lo que se guarda es la forma que ya se muestra en pantalla, no la forma interna del cálculo: si
 * mañana cambia cómo se calcula, un reporte viejo sigue diciendo lo que decía. El campo `v` es la
 * versión del formato, justamente para poder distinguirlo.
 */
function _sellarMetricas(m: MetricasDia): string {
  const sello: MetricasSnapshot = {
    v: 1,
    agendados: m.agendados,
    completados: m.realizados,
    reuniones1: m.reuniones,
    convertidos: m.ventas,
    noShows: m.noShows,
    followupsRealizados: m.followupsRealizados,
    followupsVencidos: m.followupsVencidos,
  };
  return JSON.stringify(sello);
}

/** Lee el sello guardado. `null` en los reportes anteriores a la migración 0038: no se inventa. */
function _selloGuardado(json: string | null): MetricasSnapshot | null {
  if (!json) return null;
  try {
    const sello = JSON.parse(json) as MetricasSnapshot;
    return sello.v === 1 ? sello : null;
  } catch {
    // Un sello ilegible se trata como ausente: la pantalla dice que no hay, en vez de romperse.
    return null;
  }
}

// Reporte manual de una fila ya leída (null si no hay fila). Los valores NULL se conservan
// tal cual: "no lo llenó" y "escribió 0" son cosas distintas y el historial no las mezcla.
function _reporteManual(rep: { prospectosEncontrados: number | null; prospectosContactados: number | null; respuestas: number | null; interesados: number | null; bloqueos: string | null }) {
  return {
    prospectosEncontrados: rep.prospectosEncontrados,
    prospectosContactados: rep.prospectosContactados,
    respuestas: rep.respuestas,
    interesados: rep.interesados,
    bloqueos: rep.bloqueos,
  };
}

function _compromisoDeFila(rep: { compromisoContactos: number | null; compromisoFollowups: number | null; compromisoPodcasts: number | null; compromisoNota: string | null }): Compromiso {
  return {
    contactos: rep.compromisoContactos,
    followups: rep.compromisoFollowups,
    podcasts: rep.compromisoPodcasts,
    nota: rep.compromisoNota,
  };
}

// Desglose por canal de UN reporte, en el orden en que se cargaron. Un reporte viejo (anterior a
// la migración 0037) no tiene filas aquí y devuelve lista vacía — nunca null, para que quien lea
// no tenga que distinguir "sin canales" de "no cargó".
async function _canalesDeReporte(reporteId: string | null): Promise<CanalProspeccion[]> {
  if (!reporteId) return [];
  const filas = await db
    .select({
      canal: podcastReporteCanales.canal,
      contactados: podcastReporteCanales.contactados,
      respuestas: podcastReporteCanales.respuestas,
      interesados: podcastReporteCanales.interesados,
    })
    .from(podcastReporteCanales)
    .where(eq(podcastReporteCanales.reporteId, reporteId))
    .orderBy(asc(podcastReporteCanales.orden));
  return filas;
}

/**
 * "Resultados de hoy", tal como se ven en el Cierre diario.
 *
 * Todo sale de la capa central, con las mismas reglas que Mi desempeño y el Reporte de equipo: la
 * misma persona y el mismo día dan el mismo número en las tres pantallas. Antes esto consultaba el
 * Calendario por su cuenta y devolvía las dos versiones de cada cifra, una al lado de la otra; la
 * versión del Pipeline se sigue calculando, pero solo para poder avisar si no coinciden.
 */
async function _resultadosDelDia(usuarioId: string, nombre: string, fecha: string): Promise<ResultadosDia> {
  const fuentes = await traerFuentes([usuarioId], fecha, fecha);
  const cuadros = repartir([usuarioId], [fecha], fuentes);
  const cuadro = cuadros.get(usuarioId)!.get(fecha)!;

  return {
    agendados: cuadro.agendados,
    completados: cuadro.completados,
    reuniones1: cuadro.reuniones1,
    convertidos: cuadro.convertidos,
    noShows: cuadro.noShows,
    followupsRealizados: cuadro.followupsRealizados,
    followupsVencidos: vencidosPorUsuario([usuarioId], fuentes).get(usuarioId) ?? 0,
    // Foto del momento: si el día consultado no es hoy, no hay dato (null), no un 0.
    enSeguimiento: fuentes.incluyeHoy ? seguimientoPorUsuario([usuarioId], fuentes).get(usuarioId) ?? 0 : null,
    discrepancias: discrepanciasDe(new Map([[usuarioId, nombre]]), [fecha], cuadros),
  };
}

// node:sqlite es síncrono por debajo. Mismo helper que metaAds.service.ts (no hay uno compartido).
async function conTransaccion<T>(fn: () => Promise<T>): Promise<T> {
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const result = await fn();
    sqlite.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {
      // si ya no hay transacción activa, ignorar
    }
    throw err;
  }
}

export async function obtenerReporteDiario(usuarioId: string, fechaParam?: string) {
  const fecha = fechaParam ?? hoyET();
  const rep = await _filaReporte(usuarioId, fecha);

  const [metricas, nombreFila] = await Promise.all([
    _metricasDelDia(usuarioId, fecha),
    db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, usuarioId)),
  ]);

  const [canales, resultados, { metas }, compromisoAyer] = await Promise.all([
    _canalesDeReporte(rep?.id ?? null),
    // El nombre solo sirve para redactar el aviso de discrepancia ("Mauri movió la tarjeta…").
    _resultadosDelDia(usuarioId, nombreFila[0]?.nombre ?? "", fecha),
    obtenerMetas(),
    _compromisoDe(usuarioId, sumarDias(fecha, -1)),
  ]);

  return {
    id: rep?.id ?? null,
    fecha,
    estado: rep?.estado ?? null,
    enviadoEn: rep?.enviadoEn ?? null,
    createdAt: rep?.createdAt ?? null,
    updatedAt: rep?.updatedAt ?? null,
    reporte: rep ? _reporteManual(rep) : null,
    canales,
    resultados,
    compromisoHoy: rep ? _compromisoDeFila(rep) : null,
    metricas,
    compromisoAyer,
    metas,
  };
}

export async function guardarReporteDiario(usuarioId: string, datos: GuardarReporteInput) {
  const fecha = hoyET();
  const ahora = new Date();
  const [existente] = await db
    .select()
    .from(podcastReportesDiarios)
    .where(and(eq(podcastReportesDiarios.usuarioId, usuarioId), eq(podcastReportesDiarios.fecha, fecha)));

  const estado: "borrador" | "enviado" = datos.enviar ? "enviado" : existente?.estado === "enviado" ? "enviado" : "borrador";

  // Hora de envío: se sella SOLO en la transición borrador → enviado y nunca se sobrescribe,
  // así que es la primera fecha de envío y no "la última vez que se tocó". Un reporte ya
  // enviado que se vuelve a guardar conserva su hora original. Los reportes anteriores a esta
  // columna quedan en NULL y el historial los muestra como "Enviado" sin hora.
  const enviadoEn = estado === "enviado" ? (existente?.enviadoEn ?? ahora) : existente?.enviadoEn ?? null;

  // Campos del Cierre diario anterior (prospección sin canal + compromiso para mañana). Solo se
  // escriben si de verdad vinieron en la petición: el formulario nuevo ya no los manda, y omitirlos
  // evita BORRAR lo que un borrador guardado con el formulario viejo tuviera escrito.
  const viejos: {
    prospectosEncontrados?: number;
    prospectosContactados?: number;
    respuestas?: number;
    interesados?: number;
    compromisoContactos?: number;
    compromisoFollowups?: number;
    compromisoPodcasts?: number;
    compromisoNota?: string;
  } = {};
  if (datos.prospectosEncontrados !== undefined) viejos.prospectosEncontrados = datos.prospectosEncontrados;
  if (datos.prospectosContactados !== undefined) viejos.prospectosContactados = datos.prospectosContactados;
  if (datos.respuestas !== undefined) viejos.respuestas = datos.respuestas;
  if (datos.interesados !== undefined) viejos.interesados = datos.interesados;
  if (datos.compromisoContactos !== undefined) viejos.compromisoContactos = datos.compromisoContactos;
  if (datos.compromisoFollowups !== undefined) viejos.compromisoFollowups = datos.compromisoFollowups;
  if (datos.compromisoPodcasts !== undefined) viejos.compromisoPodcasts = datos.compromisoPodcasts;
  if (datos.compromisoNota !== undefined) viejos.compromisoNota = datos.compromisoNota;

  // Los números del día viven en el DESGLOSE por canal. Estas tres columnas antiguas son el
  // espejo de la suma, y existen por una sola razón: Equipo, Inteligencia y el Historial las
  // siguen leyendo y, sin esto, mostrarían vacío para los reportes nuevos. No es un segundo dato
  // que pueda contradecir al desglose — es la misma cifra derivada al guardar. Se escribe solo
  // cuando hay canales: un guardado sin canales no toca lo ya guardado.
  const totalesDelDia =
    datos.canales && datos.canales.length > 0
      ? {
          prospectosContactados: _sumarCanales(datos.canales, "contactados"),
          respuestas: _sumarCanales(datos.canales, "respuestas"),
          interesados: _sumarCanales(datos.canales, "interesados"),
        }
      : {};

  // Sello de las métricas automáticas: solo al enviar. Un borrador no sella nada, y un reporte ya
  // enviado no puede volver a borrador, así que un sello nunca se pierde una vez puesto.
  const metricasSnapshot = estado === "enviado" ? _sellarMetricas(await _metricasDelDia(usuarioId, fecha)) : null;

  const valores = {
    ...viejos,
    ...totalesDelDia,
    bloqueos: datos.bloqueos ?? null,
    estado,
    enviadoEn,
    metricasSnapshot,
    updatedAt: ahora,
  };

  // Reporte y su desglose por canal se escriben juntos: o queda todo el día guardado, o nada.
  await conTransaccion(async () => {
    let reporteId = existente?.id ?? "";

    if (existente) {
      await db.update(podcastReportesDiarios).set(valores).where(eq(podcastReportesDiarios.id, existente.id));
    } else {
      reporteId = crypto.randomUUID();
      await db.insert(podcastReportesDiarios).values({
        ...valores,
        id: reporteId,
        usuarioId,
        fecha,
        createdAt: ahora,
      });
    }

    // Desglose por canal: se reemplaza completo (borrar lo de ESTE reporte y reinsertar), igual que
    // Meta Ads. Así nunca se mezclan canales viejos con nuevos. Solo si la petición trajo
    // `canales`; sin ese campo no se toca el desglose ya guardado.
    if (datos.canales) {
      await db.delete(podcastReporteCanales).where(eq(podcastReporteCanales.reporteId, reporteId));
      for (const [i, c] of datos.canales.entries()) {
        await db.insert(podcastReporteCanales).values({
          id: crypto.randomUUID(),
          reporteId,
          canal: c.canal,
          contactados: c.contactados,
          respuestas: c.respuestas,
          interesados: c.interesados,
          orden: i,
        });
      }
    }
  });

  return obtenerReporteDiario(usuarioId, fecha);
}

// ─── Historial de reportes diarios (SOLO LECTURA) ─────────
// Capa de consulta sobre los MISMOS registros que escribe el Cierre diario: no hay segunda
// base, ni copia del contenido, ni resumen generado. Ninguna función de esta sección escribe:
// abrir un reporte histórico no cambia métricas, textos, fecha, usuario ni estado.
//
// AUTORIZACIÓN (validada aquí, en el backend — no basta con esconderlo en la UI):
//   · Cada quien consulta SIEMPRE su propio historial, incluidos sus borradores.
//   · Ver el historial de OTRA persona exige `puedeVerEquipo`, que la ruta calcula con la
//     misma regla que ya usa PODCAST → Equipo: ADMIN / SUPER_ADMIN. Ningún otro rol la obtiene,
//     así que esta tarea no amplía ningún acceso existente.
//   · A terceros NUNCA se les expone un borrador: solo reportes `enviado`.
//   · El `usuario_id` que llega en el request se valida contra el conjunto real de Podcast;
//     cambiarlo a mano no da acceso a nadie de otro departamento.

/** Se lanza cuando alguien intenta consultar el historial de una persona que no le corresponde. */
export class SinPermisoHistorialError extends Error {}

export interface MiembroHistorial {
  usuarioId: string;
  nombre: string;
  esYo: boolean;
}

/**
 * Conjunto real de personas cuyo historial de Podcast existe: los miembros actuales del
 * departamento MÁS quienes alguna vez reportaron aquí. Lo segundo es a propósito: si alguien
 * sale de Podcast, sus cierres ya enviados no deben desaparecer del historial (los datos
 * históricos se conservan). Nunca se hardcodean nombres.
 */
async function _conjuntoHistorial(): Promise<{ id: string; nombre: string }[]> {
  const [miembros, autores] = await Promise.all([
    _usuariosPodcast(),
    db
      .select({ id: usuarios.id, nombre: usuarios.nombre })
      .from(podcastReportesDiarios)
      .innerJoin(usuarios, eq(podcastReportesDiarios.usuarioId, usuarios.id))
      .groupBy(usuarios.id, usuarios.nombre),
  ]);

  const mapa = new Map<string, { id: string; nombre: string }>();
  for (const u of [...miembros, ...autores]) if (!mapa.has(u.id)) mapa.set(u.id, u);
  return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

async function _nombreDeUsuario(usuarioId: string): Promise<string | null> {
  const [u] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, usuarioId));
  return u?.nombre ?? null;
}

/**
 * Verifica que `actorId` pueda consultar el historial de `usuarioId` y lanza
 * SinPermisoHistorialError si no. Consultar lo propio siempre está permitido.
 */
async function _exigirAcceso(actorId: string, usuarioId: string, puedeVerEquipo: boolean): Promise<void> {
  if (usuarioId === actorId) return;
  if (!puedeVerEquipo) {
    throw new SinPermisoHistorialError("Solo puedes consultar tu propio historial de reportes.");
  }
  const permitidos = await _conjuntoHistorial();
  if (!permitidos.some((u) => u.id === usuarioId)) {
    throw new SinPermisoHistorialError("Esa persona no forma parte del equipo de Podcast.");
  }
}

/** Miembros que el solicitante puede elegir en el selector. Sin permiso de equipo, solo él. */
export async function miembrosHistorial(actorId: string, puedeVerEquipo: boolean) {
  if (!puedeVerEquipo) {
    const nombre = (await _nombreDeUsuario(actorId)) ?? "";
    return { puedeVerEquipo: false, miembros: [{ usuarioId: actorId, nombre, esYo: true }] };
  }
  const conjunto = await _conjuntoHistorial();
  return {
    puedeVerEquipo: true,
    miembros: conjunto.map((u) => ({ usuarioId: u.id, nombre: u.nombre, esYo: u.id === actorId })),
  };
}

export interface FiltroHistorial {
  usuarioId?: string;
  desde?: string;
  hasta?: string;
  limite?: number;
}

/**
 * Listado cronológico de reportes (más reciente primero). `fecha` es ISO `YYYY-MM-DD`, que
 * ordena cronológicamente por sí solo; el desempate es por última actualización. Si no se pide
 * un miembro concreto, devuelve los de todo el conjunto de Podcast — siempre acotado a él,
 * nunca a usuarios de otros departamentos.
 */
export async function listarHistorial(actorId: string, puedeVerEquipo: boolean, filtro: FiltroHistorial) {
  // Un `limite` basura (?limite=abc) no debe llegar nunca a la consulta: se cae al valor por defecto.
  const pedido = Number.isFinite(filtro.limite) ? Math.trunc(filtro.limite as number) : 100;
  const limite = Math.min(Math.max(pedido, 1), 200);
  const esPropio = filtro.usuarioId === actorId;

  if (filtro.usuarioId) {
    await _exigirAcceso(actorId, filtro.usuarioId, puedeVerEquipo);
  }

  let condUsuario;
  if (filtro.usuarioId) {
    condUsuario = eq(podcastReportesDiarios.usuarioId, filtro.usuarioId);
  } else {
    const conjunto = await _conjuntoHistorial();
    condUsuario = inArray(podcastReportesDiarios.usuarioId, conjunto.map((u) => u.id));
  }

  const conds = [
    condUsuario,
    // Los borradores son privados: solo su autor los ve en su propio listado.
    esPropio ? undefined : eq(podcastReportesDiarios.estado, "enviado"),
    filtro.desde ? gte(podcastReportesDiarios.fecha, filtro.desde) : undefined,
    filtro.hasta ? lte(podcastReportesDiarios.fecha, filtro.hasta) : undefined,
  ].filter(Boolean);

  // Se pide una fila de más para saber si hay más historial sin traerlo todo.
  const filas = await db
    .select(REPORTE_DIARIO_COLUMNS)
    .from(podcastReportesDiarios)
    .innerJoin(usuarios, eq(podcastReportesDiarios.usuarioId, usuarios.id))
    .where(and(...conds))
    .orderBy(desc(podcastReportesDiarios.fecha), desc(podcastReportesDiarios.updatedAt))
    .limit(limite + 1);

  const truncado = filas.length > limite;
  return {
    truncado,
    reportes: filas.slice(0, limite).map((r) => ({
      id: r.id,
      usuarioId: r.usuarioId,
      usuarioNombre: r.usuarioNombre,
      fecha: r.fecha,
      estado: r.estado,
      enviadoEn: r.enviadoEn,
      updatedAt: r.updatedAt,
      reporte: _reporteManual(r),
      compromiso: _compromisoDeFila(r),
    })),
  };
}

/**
 * Reporte real de una persona en una fecha concreta, o la respuesta explícita de que no existe.
 *
 * NUNCA crea ni modifica nada. Cuando `existe` es false va todo en null A PROPÓSITO: no hay que
 * mostrar ceros ficticios, porque "no entregó el cierre" y "entregó un cierre con actividad 0"
 * son situaciones distintas. Si quien consulta no es el autor y el reporte sigue en borrador,
 * también se responde `existe: false`.
 */
export async function detalleHistorial(actorId: string, puedeVerEquipo: boolean, usuarioId: string, fecha: string) {
  await _exigirAcceso(actorId, usuarioId, puedeVerEquipo);

  const esPropio = usuarioId === actorId;
  const fila = await _filaReporte(usuarioId, fecha);
  const usuarioNombre = fila?.usuarioNombre ?? (await _nombreDeUsuario(usuarioId)) ?? "";
  const visible = fila && (esPropio || fila.estado === "enviado") ? fila : null;

  if (!visible) {
    return {
      usuarioId,
      usuarioNombre,
      fecha,
      existe: false,
      id: null,
      estado: null,
      enviadoEn: null,
      createdAt: null,
      updatedAt: null,
      reporte: null,
      canales: null,
      compromiso: null,
      metricas: null,
      metricasReportadas: null,
      metas: null,
    };
  }

  const [metricas, canales, { metas }] = await Promise.all([
    _metricasDelDia(usuarioId, fecha),
    _canalesDeReporte(visible.id),
    obtenerMetas(),
  ]);

  return {
    usuarioId,
    usuarioNombre,
    fecha,
    existe: true,
    id: visible.id,
    estado: visible.estado,
    enviadoEn: visible.enviadoEn,
    createdAt: visible.createdAt,
    updatedAt: visible.updatedAt,
    reporte: _reporteManual(visible),
    // Desglose por canal del día. Lista vacía en los reportes anteriores a la migración 0037:
    // los que ya existían solo tienen los totales viejos y se muestran con esos, sin inventar
    // un reparto por canal que nunca se registró.
    canales,
    compromiso: _compromisoDeFila(visible),
    // Dos cosas distintas que la pantalla muestra por separado:
    //   · `metricas` → lo que el CRM dice HOY de ese día (métrica operativa actual);
    //   · `metricasReportadas` → la copia sellada al enviar (reporte histórico).
    // Si difieren, es porque alguien corrigió el CRM después. Ninguna de las dos se pisa.
    metricas,
    metricasReportadas: _selloGuardado(visible.metricasSnapshot),
    metas,
  };
}

// ─── Desempeño: capa común de métricas ───────────────────
//
// Un solo lugar decide cuál es la prospección de una persona en una fecha: `_resolverProspeccion`
// —la misma regla que usa la pestaña "Resumen del equipo"—. De acá salen "Mi desempeño" y el
// detalle de esa persona en "Reporte de equipo", así que las dos NO pueden mostrar cifras
// distintas para el mismo período.
//
// Regla de oro de todo este bloque: `null` significa "no registró" y NUNCA se convierte en 0.
// Un día sin Cierre diario no es un día de cero actividad.

export type EstadoReporte = "enviado" | "borrador" | "sin_reporte";

interface ProspeccionDelDia {
  estado: EstadoReporte;
  /** null = no registró prospección ese día. */
  prospeccion: ProspeccionResuelta | null;
  reporteId: string | null;
}

/**
 * Estado y prospección del Cierre diario de VARIAS personas en un rango: dos consultas fijas
 * (los reportes y sus canales), nunca una por persona.
 */
async function _prospeccionDelRango(
  usuariosIds: string[],
  desde: string,
  hasta: string
): Promise<Map<string, Map<string, ProspeccionDelDia>>> {
  const porPersona = new Map<string, Map<string, ProspeccionDelDia>>();
  for (const id of usuariosIds) porPersona.set(id, new Map());
  if (usuariosIds.length === 0) return porPersona;

  const reportes = await _reportesConCanales(
    and(
      inArray(podcastReportesDiarios.usuarioId, usuariosIds),
      gte(podcastReportesDiarios.fecha, desde),
      lte(podcastReportesDiarios.fecha, hasta)
    )!
  );

  for (const { fila, canales } of reportes) {
    const estado: EstadoReporte = fila.estado === "enviado" ? "enviado" : "borrador";
    porPersona.get(fila.usuarioId)?.set(fila.fecha, {
      estado,
      // Un borrador sólo se informa como estado: sus cifras no se exponen. Es la misma regla del
      // Historial, donde un borrador únicamente lo ve su autor.
      prospeccion: estado === "enviado" ? _resolverProspeccion(fila, canales) : null,
      reporteId: fila.id,
    });
  }
  return porPersona;
}

/**
 * Métricas automáticas (CRM + follow-ups) de varias personas en un rango, sin N+1.
 *
 * Es LA puerta de entrada de Mi desempeño, Reporte de equipo y el detalle de un miembro, así que
 * las tres cambian juntas y no pueden discrepar. Lo que hace `repartir` es la interpretación
 * oficial; acá solo se traduce a la forma `MetricasDia` que ya consumen esas pantallas.
 *
 * El reparto base sigue saliendo de `_repartirMetricas` (el que reusa Inteligencia), y sobre eso
 * se pisan las DOS cifras de podcasts con las del Calendario: `agendados` y `realizados` dejan de
 * ser "quién movió la tarjeta" y pasan a ser "quién consiguió al invitado", que es la definición
 * oficial. El resto (1%, convertidos, no-shows, follow-ups) se queda igual.
 */
async function _metricasEquipo(
  usuariosIds: string[],
  desde: string,
  hasta: string
): Promise<Map<string, Map<string, MetricasDia>>> {
  if (usuariosIds.length === 0) return new Map();
  const fechas = fechasEntre(desde, hasta);

  const [fuentes, reportes] = await Promise.all([
    traerFuentes(usuariosIds, desde, hasta),
    db
      .select()
      .from(podcastReportesDiarios)
      .where(
        and(
          inArray(podcastReportesDiarios.usuarioId, usuariosIds),
          gte(podcastReportesDiarios.fecha, desde),
          lte(podcastReportesDiarios.fecha, hasta)
        )
      ),
  ]);

  const porUsuario = _repartirMetricas(usuariosIds, fechas, fuentes.movimientos, fuentes.followups, reportes);
  const cuadros = repartir(usuariosIds, fechas, fuentes);

  for (const [usuarioId, porFecha] of cuadros) {
    const destino = porUsuario.get(usuarioId);
    if (!destino) continue;
    for (const [fecha, cuadro] of porFecha) {
      const m = destino.get(fecha);
      if (!m) continue;
      m.agendados = cuadro.agendados;
      m.realizados = cuadro.completados;
    }
  }

  return porUsuario;
}

/** Tasa calculada. Sin dato, o división entre cero → null ("—"), nunca 0% ni Infinity. */
function _tasa(numerador: number | null, denominador: number | null): number | null {
  if (numerador == null || denominador == null || denominador === 0) return null;
  return Math.round((numerador / denominador) * 100);
}

export interface FunnelPodcast {
  contactados: number | null;
  respuestas: number | null;
  interesados: number | null;
  agendados: number;
  completados: number;
  reuniones1: number;
  transaccionaron: number;
  /** Foto del momento (tarjetas abiertas). null = la fecha consultada no es hoy, no se puede reconstruir. */
  enSeguimiento: number | null;
  tasaRespuesta: number | null;
  tasaInteres: number | null;
}

/** Arma el embudo de un período a partir de lo ya resuelto. Nunca suma prospección con CRM. */
function _embudo(
  fechas: string[],
  prospeccion: Map<string, ProspeccionDelDia>,
  metricas: Map<string, MetricasDia>,
  enSeguimiento: number | null
): FunnelPodcast {
  const delDia = fechas.map((f) => prospeccion.get(f)?.prospeccion ?? null);
  const sumaEventos = (campo: "agendados" | "realizados" | "reuniones" | "ventas") =>
    fechas.reduce((acc, f) => acc + (metricas.get(f)?.[campo] ?? 0), 0);

  const contactados = _sumarProspecciones(delDia, "contactados");
  const respuestas = _sumarProspecciones(delDia, "respuestas");
  const interesados = _sumarProspecciones(delDia, "interesados");

  return {
    contactados,
    respuestas,
    interesados,
    agendados: sumaEventos("agendados"),
    completados: sumaEventos("realizados"),
    reuniones1: sumaEventos("reuniones"),
    transaccionaron: sumaEventos("ventas"),
    enSeguimiento,
    tasaRespuesta: _tasa(respuestas, contactados),
    tasaInteres: _tasa(interesados, respuestas),
  };
}

/**
 * El mismo embudo, pero sumando a TODO el equipo. Reutiliza `_embudo` persona por persona y une los
 * resultados, así que el total del equipo nunca puede calcularse con una regla distinta a la del
 * detalle de una persona.
 */
function _embudoEquipo(
  fechas: string[],
  ids: string[],
  prospeccion: Map<string, Map<string, ProspeccionDelDia>>,
  metricas: Map<string, Map<string, MetricasDia>>,
  enSeguimiento: number | null
): FunnelPodcast {
  const embudos = ids.map((u) =>
    _embudo(fechas, prospeccion.get(u) ?? new Map(), metricas.get(u) ?? new Map(), enSeguimiento)
  );
  if (embudos.length === 0) return _embudo(fechas, new Map(), new Map(), enSeguimiento);

  // La prospección se suma salteando los días sin dato; si nadie registró nada, queda en null.
  const sumaONull = (valores: (number | null)[]): number | null =>
    valores.every((v) => v === null) ? null : valores.reduce<number>((a, v) => a + (v ?? 0), 0);

  const contactados = sumaONull(embudos.map((e) => e.contactados));
  const respuestas = sumaONull(embudos.map((e) => e.respuestas));
  const interesados = sumaONull(embudos.map((e) => e.interesados));
  const sumar = (campo: "agendados" | "completados" | "reuniones1" | "transaccionaron") =>
    embudos.reduce((a, e) => a + e[campo], 0);

  return {
    contactados,
    respuestas,
    interesados,
    agendados: sumar("agendados"),
    completados: sumar("completados"),
    reuniones1: sumar("reuniones1"),
    transaccionaron: sumar("transaccionaron"),
    enSeguimiento,
    // Las tasas se recalculan sobre los totales del equipo, no promediando las tasas de cada uno.
    tasaRespuesta: _tasa(respuestas, contactados),
    tasaInteres: _tasa(interesados, respuestas),
  };
}

/** Bloque donde caen los reportes anteriores al desglose por canal (mismo literal que el Resumen). */
const SIN_DETALLE_CANAL = "Sin detalle de canal";

/**
 * Desglose consolidado por canal, a partir de prospecciones YA RESUELTAS.
 *
 * Recibe las mismas prospecciones que alimentan el total, así que el desglose cuadra exacto con el
 * total: no hay forma de que uno incluya a alguien que el otro no. Un reporte viejo, sin filas de
 * canal, va a "Sin detalle de canal" en vez de repartirse por un canal que nadie registró.
 *
 * Se muestran únicamente los canales con información relevante: uno con todo en cero no aporta nada.
 */
function _canalesConsolidados(prospecciones: (ProspeccionResuelta | null)[]): CanalProspeccion[] {
  const porCanal = new Map<string, CanalProspeccion>();
  const sumar = (canal: string, campo: "contactados" | "respuestas" | "interesados", valor: number | null) => {
    if (valor == null) return;
    const acc = porCanal.get(canal) ?? { canal, contactados: 0, respuestas: 0, interesados: 0 };
    acc[campo] += valor;
    porCanal.set(canal, acc);
  };

  for (const p of prospecciones) {
    if (!p) continue;
    if (p.canales.length > 0) {
      for (const c of p.canales) {
        sumar(c.canal, "contactados", c.contactados);
        sumar(c.canal, "respuestas", c.respuestas);
        sumar(c.canal, "interesados", c.interesados);
      }
    } else {
      sumar(SIN_DETALLE_CANAL, "contactados", p.contactados);
      sumar(SIN_DETALLE_CANAL, "respuestas", p.respuestas);
      sumar(SIN_DETALLE_CANAL, "interesados", p.interesados);
    }
  }

  // El orden es el del catálogo para que la tabla no baile entre consultas.
  const orden: readonly string[] = CANALES_CONTACTO;
  return [...porCanal.values()]
    .filter((c) => c.contactados > 0 || c.respuestas > 0 || c.interesados > 0)
    .sort((a, b) => {
      // "Sin detalle de canal" va siempre al final: no es un canal, es lo que no se pudo repartir.
      if (a.canal === SIN_DETALLE_CANAL) return 1;
      if (b.canal === SIN_DETALLE_CANAL) return -1;
      const ia = orden.indexOf(a.canal);
      const ib = orden.indexOf(b.canal);
      return (ia === -1 ? orden.length : ia) - (ib === -1 ? orden.length : ib);
    });
}

// Follow-ups vencidos y "en seguimiento" del equipo: las consultas viven en la capa central, así
// que estas dos solo les dan la forma de mapa que ya usan Mi desempeño y el Reporte de equipo. Si
// el criterio cambia, cambia para todos: no hay una tercera copia que se pueda quedar atrás.

/** Follow-ups vencidos de varias personas de una sola vez (la versión por persona sería N+1). */
async function _followupsVencidosDeEquipo(usuariosIds: string[], fin: Date): Promise<Map<string, number>> {
  const conteo = new Map<string, number>();
  for (const f of await followupsVencidosDe(usuariosIds, fin)) {
    if (f.responsableId) conteo.set(f.responsableId, (conteo.get(f.responsableId) ?? 0) + 1);
  }
  return conteo;
}

/** Personas con tarjeta abierta, por responsable. Es foto del momento. */
async function _enSeguimientoDeEquipo(usuariosIds: string[]): Promise<Map<string, number>> {
  const sets = new Map<string, Set<string>>();
  for (const f of await personasEnSeguimientoDe(usuariosIds)) {
    if (!f.responsableId || !f.personaId) continue;
    const conjunto = sets.get(f.responsableId) ?? new Set<string>();
    conjunto.add(f.personaId); // una persona con varias tarjetas abiertas cuenta una sola vez
    sets.set(f.responsableId, conjunto);
  }
  return new Map([...sets].map(([id, s]) => [id, s.size]));
}

/**
 * Score, tendencia y semáforo SOLO se pueden calcular para el día en curso.
 *
 * No es una limitación que se pueda sortear: el componente de Follow-up sale de los follow-ups
 * vencidos de HOY (un seguimiento que vencía ayer y se completó hoy se contaría mal hacia atrás) y
 * la tendencia sale de la serie de 7 días que termina hoy. Para cualquier otra fecha se devuelve
 * null y la pantalla lo dice, en vez de inventar un número.
 */
function _scoreSoloDeHoy(fecha: string): boolean {
  return fecha === hoyET();
}

// ─── Desempeño individual ────────────────────────────────

/**
 * El desempeño de UNA persona en una fecha (por defecto, hoy). "Mi desempeño" y el detalle de esa
 * persona en "Reporte de equipo" salen los dos de acá.
 */
async function _desempenoDe(usuarioId: string, fecha: string) {
  const { metas } = await obtenerMetas();
  const inicioSerie = sumarDias(fecha, -6);

  const [metricas, prospeccion] = await Promise.all([
    _metricasEquipo([usuarioId], inicioSerie, fecha),
    _prospeccionDelRango([usuarioId], inicioSerie, fecha),
  ]);

  const porFecha = metricas.get(usuarioId) ?? new Map<string, MetricasDia>();
  const prosPorFecha = prospeccion.get(usuarioId) ?? new Map<string, ProspeccionDelDia>();
  const serie = fechasEntre(inicioSerie, fecha);
  const metricasSerie = serie.map((f) => porFecha.get(f)!);

  const delDia = prosPorFecha.get(fecha);
  const estadoReporte: EstadoReporte = delDia?.estado ?? "sin_reporte";
  const contactadosDelDia = delDia?.prospeccion?.contactados ?? null;

  const esHoy = _scoreSoloDeHoy(fecha);
  const hoy = metricasSerie[metricasSerie.length - 1];
  const compromisoAyer = (await _compromisoDe(usuarioId, sumarDias(fecha, -1))) ?? null;

  if (esHoy) {
    hoy.followupsVencidos = (await _followupsVencidosDeEquipo([usuarioId], limitesDiaET(fecha).fin)).get(usuarioId) ?? 0;
  }

  const score = esHoy ? calcularScore(hoy, metas, compromisoAyer, { contactados: contactadosDelDia }) : null;
  const comparaciones = _comparaciones(metricasSerie, metas, prosPorFecha);
  const alertas = esHoy ? _alertasUsuario(metricasSerie, compromisoAyer, contactadosDelDia !== null) : [];

  const enSeguimiento = esHoy ? (await _enSeguimientoDeEquipo([usuarioId])).get(usuarioId) ?? 0 : null;

  return {
    usuarioId,
    fecha,
    score,
    scoreDisponible: esHoy,
    estadoReporte,
    prospeccion: delDia?.prospeccion ?? null,
    reportesEnviados: serie.filter((f) => prosPorFecha.get(f)?.estado === "enviado").length,
    funnel: _embudo([fecha], prosPorFecha, porFecha, enSeguimiento),
    canales: _canalesConsolidados([delDia?.prospeccion ?? null]),
    metricas: hoy,
    comparaciones,
    metas,
    compromisoAyer,
    alertas,
    estadoIA: _estadoIA(alertas),
  };
}

/** PODCAST → Mi desempeño. Siempre sobre el usuario autenticado. */
export async function desempenoMi(usuarioId: string) {
  return _desempenoDe(usuarioId, hoyET());
}

/**
 * El desempeño de OTRA persona. La autorización se valida acá, en el backend: no basta con
 * esconder el selector en la pantalla. Aunque alguien cambie el `usuarioId` de la URL a mano,
 * `_exigirAcceso` corta con SinPermisoHistorialError (→ 403) si no es del equipo de Podcast.
 */
export async function desempenoDeUsuario(
  actorId: string,
  puedeVerEquipo: boolean,
  usuarioId: string,
  fecha?: string
) {
  await _exigirAcceso(actorId, usuarioId, puedeVerEquipo);
  const dia = fecha?.trim() || hoyET();
  return _desempenoDe(usuarioId, dia);
}

// ─── Desempeño del equipo ────────────────────────────────

export interface PeriodoDesempeno {
  desde: string;
  hasta: string;
}

/**
 * PODCAST → Reporte de equipo, para un período (por defecto, un día: hoy).
 *
 * Sin N+1: todas las consultas son de equipo completo y se reparten en memoria, sin importar
 * cuántas personas tenga el equipo. Antes esta función hacía ~6 consultas POR INTEGRANTE, y dos
 * de ellas traían los datos de todo el equipo para después descartarlos.
 *
 * El score, la tendencia y el semáforo sólo se devuelven cuando el período es HOY (ver
 * `_scoreSoloDeHoy`). El embudo, la prospección y los resultados del CRM sí se reconstruyen para
 * cualquier período, porque todos tienen fecha real.
 */
export async function desempenoEquipo(periodo?: Partial<PeriodoDesempeno>) {
  const hasta = periodo?.hasta?.trim() || hoyET();
  const desde = periodo?.desde?.trim() || hasta;
  const fechas = fechasEntre(desde, hasta);
  const esHoy = _scoreSoloDeHoy(hasta) && desde === hasta;
  const hoy = hoyET();
  // "En seguimiento" es foto del momento: se muestra si el período incluye hoy, y la pantalla lo
  // rotula como tal (no es un total del período, es cuántas tarjetas están abiertas ahora mismo).
  const incluyeHoy = desde <= hoy && hoy <= hasta;

  const { metas } = await obtenerMetas();
  const miembros = await _usuariosPodcast();
  const ids = miembros.map((u) => u.id);

  const [metricas, prospeccion, seguimiento] = await Promise.all([
    _metricasEquipo(ids, desde, hasta),
    _prospeccionDelRango(ids, desde, hasta),
    incluyeHoy ? _enSeguimientoDeEquipo(ids) : Promise.resolve(new Map<string, number>()),
  ]);

  // Para el score de hoy hacen falta la serie de 7 días previos y los follow-ups vencidos.
  const inicioSerie = sumarDias(desde, -6);
  const [metricasSerie, prospeccionSerie, vencidos, compromisosDeAyer] = esHoy
    ? await Promise.all([
        _metricasEquipo(ids, inicioSerie, hasta),
        _prospeccionDelRango(ids, inicioSerie, hasta),
        _followupsVencidosDeEquipo(ids, limitesDiaET(hasta).fin),
        _compromisosDeEquipo(ids, sumarDias(hasta, -1)),
      ])
    : [
        new Map<string, Map<string, MetricasDia>>(),
        new Map<string, Map<string, ProspeccionDelDia>>(),
        new Map<string, number>(),
        new Map<string, Compromiso | null>(),
      ];

  const equipo = await Promise.all(
    miembros.map(async (u) => {
      const porFecha = metricas.get(u.id) ?? new Map<string, MetricasDia>();
      const prosPorFecha = prospeccion.get(u.id) ?? new Map<string, ProspeccionDelDia>();
      const dias = fechas.map((f) => prosPorFecha.get(f));
      const delDia = dias[dias.length - 1];
      const prospeccionDelPeriodo = dias.map((d) => d?.prospeccion ?? null);

      // La prospección del período se suma salteando los días sin dato: si nadie registró nada,
      // el total es null ("—") y no un 0 que nadie escribió.
      const totalProspeccion = (campo: "contactados" | "respuestas" | "interesados") =>
        _sumarProspecciones(prospeccionDelPeriodo, campo);
      const sumaEventos = (campo: keyof MetricasDia) =>
        fechas.reduce((acc, f) => acc + ((porFecha.get(f)?.[campo] as number) ?? 0), 0);

      let score: DesgloseScore | null = null;
      let tendencia: "mejorando" | "estable" | "bajando" | null = null;

      if (esHoy) {
        const serieMap = metricasSerie.get(u.id) ?? new Map<string, MetricasDia>();
        const prosSerie = prospeccionSerie.get(u.id) ?? new Map<string, ProspeccionDelDia>();
        const serieFechas = fechasEntre(inicioSerie, hasta);
        const serie = serieFechas.map((f) => serieMap.get(f)!);
        const hoy = serie[serie.length - 1];
        hoy.followupsVencidos = vencidos.get(u.id) ?? 0;

        const compromisoAyer = compromisosDeAyer.get(u.id) ?? null;
        const contactadosHoy = prosSerie.get(hasta)?.prospeccion?.contactados ?? null;
        score = calcularScore(hoy, metas, compromisoAyer, { contactados: contactadosHoy });

        const prev = serie.slice(0, -1);
        const promAgendados = prev.length ? prev.reduce((a, d) => a + d.agendados, 0) / prev.length : 0;
        tendencia = _tendencia(hoy.agendados, promAgendados);
      }

      const agendadosPeriodo = sumaEventos("agendados");

      return {
        usuarioId: u.id,
        nombre: u.nombre,
        score,
        tendencia,
        contactados: totalProspeccion("contactados"),
        respuestas: totalProspeccion("respuestas"),
        interesados: totalProspeccion("interesados"),
        followupsRealizados: sumaEventos("followupsRealizados"),
        agendados: agendadosPeriodo,
        completados: sumaEventos("realizados"),
        reuniones1: sumaEventos("reuniones"),
        transaccionaron: sumaEventos("ventas"),
        pctMeta: metas.podcastsAgendados > 0 ? Math.round((agendadosPeriodo / metas.podcastsAgendados) * 100) : 0,
        reportesEnviados: dias.filter((d) => d?.estado === "enviado").length,
        diasPeriodo: fechas.length,
        // Sólo tiene sentido para un día suelto; en un rango se muestra el conteo de reportes.
        estado: fechas.length === 1 ? delDia?.estado ?? "sin_reporte" : null,
      };
    })
  );

  equipo.sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1) || a.nombre.localeCompare(b.nombre, "es"));

  // Las MISMAS prospecciones que alimentan el embudo, así que el desglose cuadra con el total.
  const todasLasProspecciones = ids.flatMap((u) =>
    fechas.map((f) => prospeccion.get(u)?.get(f)?.prospeccion ?? null)
  );
  const enSeguimientoEquipo = incluyeHoy ? [...seguimiento.values()].reduce((a, b) => a + b, 0) : null;

  return {
    desde,
    hasta,
    esHoy,
    metas,
    equipo,
    scoreDisponible: esHoy,
    funnel: _embudoEquipo(fechas, ids, prospeccion, metricas, enSeguimientoEquipo),
    canales: _canalesConsolidados(todasLasProspecciones),
    reportesEnviados: equipo.reduce((acc, f) => acc + f.reportesEnviados, 0),
    diasPeriodo: fechas.length,
  };
}

// ─── Detalle de un miembro (drill-down de Reporte de equipo) ─

/**
 * El detalle de UNA persona en un período, para el drill-down de "Reporte de equipo".
 *
 * Cuando el período es un solo día sale de `_desempenoDe`, la MISMA función que alimenta
 * "Mi desempeño": así, para la misma persona y la misma fecha, las dos pantallas no pueden mostrar
 * cifras distintas. Para 7/30 días arma el consolidado con las mismas piezas compartidas.
 *
 * Igual que `desempenoDeUsuario`, la autorización se valida acá y no en la pantalla: mandar a mano
 * el `usuarioId` de alguien que no es del equipo de Podcast termina en 403.
 */
export async function detalleMiembro(
  actorId: string,
  puedeVerEquipo: boolean,
  usuarioId: string,
  desde: string,
  hasta: string
) {
  await _exigirAcceso(actorId, usuarioId, puedeVerEquipo);

  if (desde === hasta) {
    const d = await _desempenoDe(usuarioId, desde);
    return {
      usuarioId,
      desde,
      hasta,
      esHoy: d.scoreDisponible,
      scoreDisponible: d.scoreDisponible,
      score: d.score,
      funnel: d.funnel,
      canales: d.canales,
      metas: d.metas,
      dias: [
        {
          fecha: desde,
          estado: d.estadoReporte,
          prospeccion: d.prospeccion,
          metricas: d.metricas,
        },
      ],
      reportesEnviados: d.estadoReporte === "enviado" ? 1 : 0,
      diasPeriodo: 1,
    };
  }

  const fechas = fechasEntre(desde, hasta);
  const { metas } = await obtenerMetas();
  const [metricas, prospeccion] = await Promise.all([
    _metricasEquipo([usuarioId], desde, hasta),
    _prospeccionDelRango([usuarioId], desde, hasta),
  ]);

  const porFecha = metricas.get(usuarioId) ?? new Map<string, MetricasDia>();
  const prosPorFecha = prospeccion.get(usuarioId) ?? new Map<string, ProspeccionDelDia>();

  // "En seguimiento" es foto del momento: sólo tiene sentido si el período incluye hoy.
  const hoy = hoyET();
  const incluyeHoy = desde <= hoy && hoy <= hasta;
  const enSeguimiento = incluyeHoy ? (await _enSeguimientoDeEquipo([usuarioId])).get(usuarioId) ?? 0 : null;

  const dias = fechas.map((f) => ({
    fecha: f,
    estado: prosPorFecha.get(f)?.estado ?? ("sin_reporte" as EstadoReporte),
    prospeccion: prosPorFecha.get(f)?.prospeccion ?? null,
    metricas: porFecha.get(f)!,
  }));

  return {
    usuarioId,
    desde,
    hasta,
    // El score sólo se puede calcular sobre el día en curso (ver `_scoreSoloDeHoy`).
    esHoy: false,
    scoreDisponible: false,
    score: null,
    funnel: _embudo(fechas, prosPorFecha, porFecha, enSeguimiento),
    canales: _canalesConsolidados(fechas.map((f) => prosPorFecha.get(f)?.prospeccion ?? null)),
    metas,
    dias,
    reportesEnviados: dias.filter((d) => d.estado === "enviado").length,
    diasPeriodo: fechas.length,
  };
}

// ─── Inteligencia (resumen ejecutivo + funnel) ───────────

export async function inteligenciaPodcast() {
  const usuariosPodcast = await _usuariosPodcast();
  const { metas } = await obtenerMetas();

  const desempenos = await Promise.all(
    usuariosPodcast.map(async (u) => {
      const serie = await _serieMetricas(u.id, 7);
      const hoy = serie[serie.length - 1];
      const compromisoAyer = await _compromisoDe(u.id, sumarDias(hoy.fecha, -1));
      const score = calcularScore(hoy, metas, compromisoAyer);
      const alertas = _alertasUsuario(serie, compromisoAyer);
      return { usuarioId: u.id, nombre: u.nombre, score, hoy, alertas };
    })
  );

  // Funnel de los últimos 7 días (estable, no depende de un solo día).
  const hoy = hoyET();
  const desde = sumarDias(hoy, -6);
  const { inicio, fin } = limitesDiaET(hoy);
  const [movimientos, reportes, ingresos] = await Promise.all([
    _movimientosPodcast(limitesDiaET(desde).inicio, fin),
    db
      .select({
        encontrados: podcastReportesDiarios.prospectosEncontrados,
        contactados: podcastReportesDiarios.prospectosContactados,
        respuestas: podcastReportesDiarios.respuestas,
        interesados: podcastReportesDiarios.interesados,
      })
      .from(podcastReportesDiarios)
      .where(and(gte(podcastReportesDiarios.fecha, desde), lte(podcastReportesDiarios.fecha, hoy))),
    db
      .select({ monto: pagos.monto })
      .from(pagos)
      .innerJoin(registros, eq(pagos.registroId, registros.id))
      .innerJoin(pipelines, eq(registros.pipelineId, pipelines.id))
      .where(and(eq(pipelines.nombre, "Podcast"), gte(pagos.fecha, inicio), lte(pagos.fecha, fin))),
  ]);

  const funnel = {
    encontrados: 0,
    contactados: 0,
    respuestas: 0,
    interesados: 0,
    agendados: 0,
    realizados: 0,
    reuniones: 0,
    ventas: 0,
    noShows: 0,
  };
  for (const r of reportes) {
    funnel.encontrados += r.encontrados ?? 0;
    funnel.contactados += r.contactados ?? 0;
    funnel.respuestas += r.respuestas ?? 0;
    funnel.interesados += r.interesados ?? 0;
  }
  for (const m of movimientos) {
    switch (m.etapaNombre) {
      case "Podcast agendado": funnel.agendados++; break;
      case "Podcast realizado": funnel.realizados++; break;
      case "Reunión del 1%": funnel.reuniones++; break;
      case "Venta cerrada": funnel.ventas++; break;
      case "No-show": funnel.noShows++; break;
    }
  }
  const ingresosPeriodo = ingresos.reduce((s, p) => s + p.monto, 0);

  // Todas las alertas del equipo, ordenadas por severidad.
  const alertas = desempenos
    .flatMap((d) => d.alertas.map((a) => ({ ...a, usuarioId: d.usuarioId, nombre: d.nombre })))
    .sort((a, b) => NIVEL_ORDEN[b.nivel] - NIVEL_ORDEN[a.nivel]);

  const totalScores = desempenos.reduce((s, d) => s + d.score.total, 0);
  const saludPromedio = desempenos.length ? Math.round(totalScores / desempenos.length) : 0;

  const intervencion = alertas.filter((a) => a.nivel === "intervencion").length;
  const atencion = alertas.filter((a) => a.nivel === "atencion").length;

  let estadoGeneral: Nivel = "normal";
  if (intervencion > 0) estadoGeneral = "intervencion";
  else if (atencion > 0) estadoGeneral = "atencion";

  // Mayor oportunidad: el invitado más caliente = persona en etapa "Reunión del 1%" o
  // "Oferta" con más interacciones recientes. Como proxy simple, se reporta la cantidad de
  // reuniones y ventas pendientes de cerrar.
  const reunionVenta = funnel.reuniones > 0 ? Math.round((funnel.ventas / funnel.reuniones) * 100) : 0;

  return {
    fecha: hoy,
    equipo: desempenos.map((d) => ({
      usuarioId: d.usuarioId,
      nombre: d.nombre,
      score: d.score,
      estadoIA: _estadoIA(d.alertas),
      agendados: d.hoy.agendados,
      realizados: d.hoy.realizados,
    })),
    funnel,
    conversion: {
      contactoInteresado: funnel.contactados > 0 ? Math.round((funnel.interesados / funnel.contactados) * 100) : 0,
      interesadoAgendado: funnel.interesados > 0 ? Math.round((funnel.agendados / funnel.interesados) * 100) : 0,
      agendadoRealizado: funnel.agendados > 0 ? Math.round((funnel.realizados / funnel.agendados) * 100) : 0,
      realizadoReunion: funnel.realizados > 0 ? Math.round((funnel.reuniones / funnel.realizados) * 100) : 0,
      reunionVenta,
    },
    ingresosPeriodo,
    saludPromedio,
    estadoGeneral,
    alertas,
  };
}

// ─── Resumen del equipo (SOLO LECTURA) ────────────────────
// Vista agregada de UN día para quien puede ver a todo el equipo (ADMIN / SUPER_ADMIN). Igual que
// el Historial: no hay segunda base, ni copia del contenido, ni resumen guardado. Se arma al leer,
// desde los MISMOS registros que escribe el Cierre diario y desde las métricas que BOS ya calcula
// solo (Pipeline, Calendario, follow-ups) — nunca desde un snapshot propio.
//
// NINGUNA función de esta sección escribe: pedir el resumen no cambia reportes, textos, estados,
// `enviado_en` ni usuarios. Consultar el 5 de septiembre devuelve el 5 de septiembre, y lo de hoy
// no sobrescribe a ayer.
//
// REGLA DE ORO (no mezclar ausencia con cero): quien no envió su cierre NO aporta un 0 — no aporta
// nada, y se muestra como "sin reporte". Por eso la prospección de cada persona viaja como
// `number | null`, donde `null` es "no registró" y jamás se convierte en 0. Los totales del equipo
// se calculan SOLO sobre reportes enviados, y la pantalla dice sobre cuántos.

/**
 * Temas con los que se agrupan los bloqueos escritos a mano. Es una lista EDITORIAL y visible
 * (igual que CANALES_CONTACTO en lib/validation.ts): no hay ninguna persona ni ningún nombre
 * escrito aquí, solo las palabras con las que el equipo describe sus problemas.
 *
 * El orden importa: un texto se asigna al PRIMER tema que coincide, y solo a ese. Así un mismo
 * mensaje no infla tres temas a la vez, cada texto aparece una sola vez en el resumen y los
 * conteos son de personas distintas. Lo que no coincide con ningún tema cae en "Otros", literal.
 */
export const TEMAS_BLOQUEO: { clave: string; etiqueta: string; claves: string[] }[] = [
  {
    clave: "respuesta",
    etiqueta: "Falta de respuesta o contactabilidad",
    claves: ["no respond", "sin respues", "no contest", "no devuelv", "poca respues", "baja respues", "respondiendo poco", "no leen", "no revisan", "no abren", "vistos"],
  },
  {
    clave: "invitados",
    etiqueta: "Invitados: cancelaciones o confirmaciones",
    claves: ["cancel", "invitad", "no llego", "no llega", "no asist", "no se present", "no-show", "no show", "noshow", "reprogram", "confirm", "reagend"],
  },
  {
    clave: "contactos",
    etiqueta: "Números o contactos inválidos",
    claves: ["numeros", "numero", "telefono", "desactualiz", "no existe", "equivocad", "fuera de servicio", "base de datos", "lista vieja", "mal numero", "datos malos"],
  },
  {
    clave: "canal",
    etiqueta: "Problemas con un canal",
    claves: ["instagram", "whatsapp", "facebook", "correo", "email", "youtube", "bloquead", "banead", "restricc", "shadowban", "bajo alcance", "poco alcance"],
  },
  {
    clave: "seguimiento",
    etiqueta: "Seguimiento o falta de tiempo",
    claves: ["seguimiento", "follow", "no me dio tiempo", "falta de tiempo", "poco tiempo", "sin tiempo", "mucho trabajo", "carga", "pendiente", "atrasad"],
  },
  {
    clave: "volumen",
    etiqueta: "Poco volumen de contactos",
    claves: ["pocos contacto", "no hay contactos", "sin contactos", "poca gente", "sin leads", "no tengo a quien", "se acabo la lista"],
  },
  {
    clave: "herramientas",
    etiqueta: "Herramientas, accesos o fallas del sistema",
    claves: ["no puedo", "no tengo acceso", "herramienta", "plataforma", "sistema", "error", "falla", "no funciona", "no carga", "se cayo"],
  },
  {
    clave: "dependencia",
    etiqueta: "Dependencia de otra persona o área",
    claves: ["dependo", "esperando", "respuesta de", "no me han", "aprobacion", "no me confirman"],
  },
];

/** Sin acentos y en minúsculas, para que "Números" y "numeros" sean lo mismo. */
function _normalizarTexto(texto: string): string {
  // Los acentos se separan en su propio carácter al normalizar con NFD; se descartan los
  // caracteres combinantes (U+0300–U+036F) uno por uno, sin expresiones con caracteres invisibles.
  const sinAcentos = [...texto.normalize("NFD")]
    .filter((ch) => {
      const c = ch.codePointAt(0)!;
      return c < 0x0300 || c > 0x036f;
    })
    .join("");
  return sinAcentos.toLowerCase();
}

const TEMAS_BLOQUEO_NORMALIZADOS = TEMAS_BLOQUEO.map((t) => ({
  clave: t.clave,
  etiqueta: t.etiqueta,
  claves: t.claves.map(_normalizarTexto),
}));

/** Primer tema que coincide con el texto, o null si ninguno (→ "Otros"). */
function _temaDeBloqueo(texto: string): string | null {
  const t = _normalizarTexto(texto);
  for (const tema of TEMAS_BLOQUEO_NORMALIZADOS) {
    if (tema.claves.some((c) => t.includes(c))) return tema.clave;
  }
  return null;
}

export interface PersonaBloqueo {
  usuarioId: string;
  nombre: string;
  reporteId: string;
  texto: string;
}

export interface TemaBloqueoResumen {
  clave: string;
  etiqueta: string;
  personas: PersonaBloqueo[];
}

export interface SenalAtencion {
  clave: string;
  titulo: string;
  detalle: string;
  usuarioIds: string[];
}

/**
 * Una fila por persona del equipo para esa fecha. `estado` distingue las tres situaciones reales
 * — enviado, borrador sin enviar y sin reporte — porque "no entregó" y "entregó con actividad 0"
 * son cosas distintas y el resumen no las mezcla.
 */
export interface FilaEquipoResumen {
  usuarioId: string;
  nombre: string;
  estado: "enviado" | "borrador" | "sin_reporte";
  enviadoEn: Date | null;
  reporteId: string | null;
  /** null = no registró prospección. Nunca se convierte en 0. */
  contactados: number | null;
  respuestas: number | null;
  interesados: number | null;
  registroProspeccion: boolean;
  canales: CanalProspeccion[];
  bloqueos: string | null;
}

// `ProspeccionResuelta`, `_resolverProspeccion` y `_sumarProspecciones` son de la capa central
// (ver los alias al principio del archivo): la regla de lectura de la prospección vive en un solo
// lugar para que los totales generales y el desglose por canal no puedan contradecirse.

function _plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * RESUMEN AUTOMÁTICO DE LOS REPORTES DIARIOS DE PODCAST, para una fecha.
 *
 * Solo lectura. La población esperada son los miembros REALES del departamento (por la relación
 * estructurada, nunca por nombre) más quien tenga un reporte de ese día; los SUPER_ADMIN no se
 * agregan acá: uno que nunca reporta no debe figurar como "sin reporte" todos los días.
 *
 * OJO con las fechas pasadas: `usuario_departamentos` no guarda fechas de alta ni de baja, así que
 * no se puede reconstruir quién estaba en el equipo un día concreto. Se usa el equipo actual, del
 * que se descarta a quien todavía no existía ese día (`usuarios.created_at`). Si alguien salió del
 * departamento, aparecerá como "sin reporte" en días en que ya no estaba: es el límite real de los
 * datos, y se prefiere eso a inventar una membresía histórica.
 */
export async function resumenEquipoDelDia(fechaParam?: string) {
  // `||` y no `??`: una cadena vacía también significa "sin fecha", y con `??` llegaba hasta
  // `limitesDiaET` y reventaba con "Invalid time value". La ruta ya valida; esto es el último
  // cinturón para que ninguna fecha rara pueda convertirse en un 500.
  const fecha = fechaParam?.trim() || hoyET();
  const ayer = sumarDias(fecha, -1);
  const { fin } = limitesDiaET(fecha);

  const { metas } = await obtenerMetas();

  // 1) Población esperada: miembros reales del equipo + autores de reportes de ese día.
  const [miembros, autores] = await Promise.all([
    _usuariosPodcast(),
    db
      .select({ id: usuarios.id, nombre: usuarios.nombre })
      .from(podcastReportesDiarios)
      .innerJoin(usuarios, eq(podcastReportesDiarios.usuarioId, usuarios.id))
      .where(eq(podcastReportesDiarios.fecha, fecha))
      .groupBy(usuarios.id, usuarios.nombre),
  ]);

  const altas = new Map<string, Date>();
  if (miembros.length > 0) {
    const filasAltas = await db
      .select({ id: usuarios.id, creado: usuarios.createdAt })
      .from(usuarios)
      .where(inArray(usuarios.id, miembros.map((m) => m.id)));
    for (const f of filasAltas) altas.set(f.id, f.creado);
  }

  const poblacion = new Map<string, string>();
  for (const m of miembros) {
    const alta = altas.get(m.id);
    // Sin fecha de alta conocida no se descarta a nadie: mejor de más que de menos.
    if (!alta || alta <= fin) poblacion.set(m.id, m.nombre);
  }
  // Quien envió un reporte ese día siempre está en la lista, aunque haya salido del departamento.
  for (const a of autores) poblacion.set(a.id, a.nombre);

  const idsPoblacion = [...poblacion.keys()];

  // 2) Reportes de la fecha (TODOS los estados) con su desglose por canal.
  const reportesDelDia = await _reportesConCanales(eq(podcastReportesDiarios.fecha, fecha));
  const porUsuario = new Map(reportesDelDia.map((r) => [r.fila.usuarioId, r]));

  // 3) Métricas automáticas del día: UN solo traído de fuentes para todo el equipo, repartido en
  //    memoria — nunca una consulta por persona. Y, sobre todo, las MISMAS fuentes y las mismas
  //    reglas de atribución que usan el Cierre diario, Mi desempeño y el Reporte de equipo: acá no
  //    queda ninguna interpretación propia que pudiera dar un número distinto.
  const fuentes = await traerFuentes(idsPoblacion, fecha, fecha);
  const cuadros = repartir(idsPoblacion, [fecha], fuentes);
  const seguimientoPorAutor = seguimientoPorUsuario(idsPoblacion, fuentes);
  const vencidosPorAutor = vencidosPorUsuario(idsPoblacion, fuentes);

  const cuadroDe = (usuarioId: string): CuadroPodcast | null => cuadros.get(usuarioId)?.get(fecha) ?? null;

  // 4) Una fila por persona del equipo.
  //
  //    De un BORRADOR ajeno solo se informa que existe: ni sus números, ni sus canales, ni lo que
  //    escribió. Un borrador es trabajo sin terminar de esa persona y todavía no es información del
  //    día (la misma regla que ya usa el Historial, donde los borradores solo los ve su autor).
  //    Acá queda el estado —para que se vea que sí escribió algo— pero el contenido va en null.
  //    Por eso el `reporteId` del borrador no es una fuga: el detalle del reporte es el que decide,
  //    y a un tercero le responde que no lo puede ver.
  const equipo: FilaEquipoResumen[] = [...poblacion.entries()].map(([usuarioId, nombre]) => {
    const r = porUsuario.get(usuarioId);
    const estado: FilaEquipoResumen["estado"] = !r ? "sin_reporte" : r.fila.estado === "enviado" ? "enviado" : "borrador";
    const prospeccion = estado === "enviado" ? _resolverProspeccion(r!.fila, r!.canales) : null;
    return {
      usuarioId,
      nombre,
      estado,
      enviadoEn: r?.fila.enviadoEn ?? null,
      reporteId: r?.fila.id ?? null,
      contactados: prospeccion?.contactados ?? null,
      respuestas: prospeccion?.respuestas ?? null,
      interesados: prospeccion?.interesados ?? null,
      registroProspeccion: prospeccion !== null,
      canales: prospeccion?.canales ?? [],
      bloqueos: estado === "enviado" ? r?.fila.bloqueos ?? null : null,
    };
  });
  equipo.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  // 5) Totales del equipo: SOLO reportes enviados. Un borrador o un "sin reporte" no suma cero,
  //    no suma nada — y por eso la pantalla informa sobre cuántos reportes se calculó.
  const enviados = equipo.filter((p) => p.estado === "enviado");
  const prospeccionesEnviadas = enviados.map((p) => {
    const r = porUsuario.get(p.usuarioId)!;
    return _resolverProspeccion(r.fila, r.canales);
  });
  const prospeccion = {
    contactados: _sumarProspecciones(prospeccionesEnviadas, "contactados"),
    respuestas: _sumarProspecciones(prospeccionesEnviadas, "respuestas"),
    interesados: _sumarProspecciones(prospeccionesEnviadas, "interesados"),
    reportesEnviados: enviados.length,
    reportesConProspeccion: prospeccionesEnviadas.filter((p) => p !== null).length,
  };

  // 6) Desglose consolidado por canal. Se suman las MISMAS filas que alimentan los totales de
  //    arriba, así que el desglose siempre cuadra con el total. Los importes de reportes viejos,
  //    que no tienen canal, van en un bloque aparte "Sin detalle de canal" en vez de repartirse
  //    por un canal que nadie registró.
  const canalesAcum = new Map<string, { contactados: number | null; respuestas: number | null; interesados: number | null }>();
  const sumarEnCanal = (canal: string, campo: "contactados" | "respuestas" | "interesados", valor: number) => {
    const acc = canalesAcum.get(canal) ?? { contactados: null, respuestas: null, interesados: null };
    acc[campo] = (acc[campo] ?? 0) + valor;
    canalesAcum.set(canal, acc);
  };
  for (const p of enviados) {
    const r = porUsuario.get(p.usuarioId)!;
    if (r.canales.length > 0) {
      for (const c of r.canales) {
        sumarEnCanal(c.canal, "contactados", c.contactados);
        sumarEnCanal(c.canal, "respuestas", c.respuestas);
        sumarEnCanal(c.canal, "interesados", c.interesados);
      }
    } else if (p.registroProspeccion) {
      const SIN_DETALLE = "Sin detalle de canal";
      const acc = canalesAcum.get(SIN_DETALLE) ?? { contactados: null, respuestas: null, interesados: null };
      if (p.contactados != null) acc.contactados = (acc.contactados ?? 0) + p.contactados;
      if (p.respuestas != null) acc.respuestas = (acc.respuestas ?? 0) + p.respuestas;
      if (p.interesados != null) acc.interesados = (acc.interesados ?? 0) + p.interesados;
      canalesAcum.set(SIN_DETALLE, acc);
    }
  }
  // Orden del catálogo (el mismo del formulario del Cierre diario); cualquier canal fuera de la
  // lista va después, alfabético, para que sumar un canal nuevo no exija tocar nada aquí.
  const ordenCanonico = new Map<string, number>(CANALES_CONTACTO.map((c, i) => [c, i]));
  const canales = [...canalesAcum.entries()]
    .map(([canal, datos]) => ({ canal, ...datos }))
    .sort((a, b) => {
      if (a.canal === "Sin detalle de canal") return 1;
      if (b.canal === "Sin detalle de canal") return -1;
      const ia = ordenCanonico.get(a.canal) ?? 99;
      const ib = ordenCanonico.get(b.canal) ?? 99;
      return ia !== ib ? ia - ib : a.canal.localeCompare(b.canal, "es");
    });

  // 7) Resultados del día: de TODO el equipo de Podcast, sin importar quién llenó su cierre. Son
  //    datos del CRM (Pipeline y Calendario), no del reporte, y van en un bloque aparte para que
  //    nadie los confunda con lo que el equipo escribió.
  //
  //    UNA sola cifra por concepto, sumada del mismo cuadro que usan el Cierre diario y Mi
  //    desempeño. Las dos fuentes de podcasts ya no se muestran una al lado de la otra: manda el
  //    Calendario, y cuando el Pipeline dice otra cosa eso sale como `discrepancias` —un aviso de
  //    calidad de datos, no una segunda cifra—.
  const cuadrosDeTodos = idsPoblacion
    .map((id) => {
      const c = cuadroDe(id);
      if (!c) return null;
      // Foto del momento: solo se completa si el día consultado es hoy.
      if (fuentes.incluyeHoy) c.enSeguimiento = seguimientoPorAutor.get(id) ?? 0;
      c.followupsVencidos = vencidosPorAutor.get(id) ?? 0;
      return c;
    })
    .filter((c): c is CuadroPodcast => c !== null);

  const resultados = {
    ...cuadroVisible(sumarCuadros(cuadrosDeTodos)),
    discrepancias: discrepanciasDe(poblacion, [fecha], cuadros),
  };

  // 8) Bloqueos: SOLO de reportes enviados (un borrador no es información oficial del día). Cada
  //    texto se asigna a un único tema; los que no coinciden con ninguno quedan literales.
  const temas = TEMAS_BLOQUEO.map((t) => ({ clave: t.clave, etiqueta: t.etiqueta, personas: [] as PersonaBloqueo[] }));
  const otros: PersonaBloqueo[] = [];
  const sinBloqueo: { usuarioId: string; nombre: string }[] = [];
  for (const p of enviados) {
    const texto = p.bloqueos?.trim() ?? "";
    if (!texto) {
      sinBloqueo.push({ usuarioId: p.usuarioId, nombre: p.nombre });
      continue;
    }
    const item: PersonaBloqueo = { usuarioId: p.usuarioId, nombre: p.nombre, reporteId: p.reporteId!, texto };
    const clave = _temaDeBloqueo(texto);
    const destino = clave ? temas.find((t) => t.clave === clave) : undefined;
    if (destino) destino.personas.push(item);
    else otros.push(item);
  }
  const temasConGente = temas.filter((t) => t.personas.length > 0);

  // 9) "Requiere atención": hechos verificables, con criterios simples y explicables. Ninguno
  //    compara a una persona contra otra ni la califica — son señales operativas, no una
  //    evaluación de desempeño.
  const atencion: SenalAtencion[] = [];

  const sinReporte = equipo.filter((p) => p.estado === "sin_reporte");
  if (sinReporte.length > 0) {
    atencion.push({
      clave: "sin_reporte",
      titulo: `${_plural(sinReporte.length, "miembro", "miembros")} sin enviar el Cierre diario`,
      detalle: sinReporte.map((p) => p.nombre).join(", "),
      usuarioIds: sinReporte.map((p) => p.usuarioId),
    });
  }

  const sinProspeccion = enviados.filter((p) => !p.registroProspeccion);
  if (sinProspeccion.length > 0) {
    atencion.push({
      clave: "sin_prospeccion",
      titulo: `${_plural(sinProspeccion.length, "reporte", "reportes")} sin registrar prospección`,
      detalle: `Enviaron su cierre sin decir a cuántos contactaron: ${sinProspeccion.map((p) => p.nombre).join(", ")}.`,
      usuarioIds: sinProspeccion.map((p) => p.usuarioId),
    });
  }

  // Se ancla en la meta configurable del equipo, no en un número inventado ni en el promedio de
  // los compañeros.
  const ceroInteresados = enviados.filter(
    (p) => p.contactados != null && p.contactados >= metas.prospectosContactados && p.interesados === 0
  );
  if (ceroInteresados.length > 0) {
    atencion.push({
      clave: "cero_interesados",
      titulo: "Contactaron mucho y ningún interesado",
      detalle: ceroInteresados
        .map((p) => `${p.nombre} (${p.contactados} contactados, meta del equipo ${metas.prospectosContactados}, 0 interesados)`)
        .join(" · "),
      usuarioIds: ceroInteresados.map((p) => p.usuarioId),
    });
  }

  // El Pipeline y el Calendario no cuentan lo mismo. No es un error de nadie: son dos actos
  // distintos (mover la tarjeta y anotar la cita) y pueden quedar desfasados. Se avisa para que se
  // pueda corregir, porque la cifra oficial es la del Calendario y la tarjeta sin cita no se está
  // contando. Solo se avisa cuando el Pipeline dice MÁS: el caso contrario es lo normal.
  if (resultados.discrepancias.length > 0) {
    const describir = (concepto: "agendados" | "completados") => {
      const lista = resultados.discrepancias.filter((d) => d.concepto === concepto);
      if (lista.length === 0) return null;
      const etiqueta = concepto === "agendados" ? "agendados" : "completados";
      return (
        `${_plural(lista.length, `podcast ${etiqueta}`, `podcasts ${etiqueta}`)} en el Pipeline sin su cita: ` +
        lista.map((d) => `${d.nombre} (${d.pipeline} contra ${d.citas} en el Calendario)`).join(", ")
      );
    };
    const partes = [describir("agendados"), describir("completados")].filter((p): p is string => p !== null);
    atencion.push({
      clave: "discrepancia_calendario",
      titulo: "El Pipeline y el Calendario no coinciden",
      detalle: `${partes.join(" · ")}. La cifra oficial es la del Calendario; la tarjeta del Pipeline no se está contando y conviene crear su cita.`,
      usuarioIds: [...new Set(resultados.discrepancias.map((d) => d.usuarioId))],
    });
  }

  // Un tema mencionado por 2 o más personas. Una sola mención NUNCA se reporta como problema del
  // equipo: alcanza con que una persona lo haya escrito una vez.
  for (const t of temasConGente) {
    if (t.personas.length < 2) continue;
    atencion.push({
      clave: `bloqueo_${t.clave}`,
      titulo: `Bloqueo repetido: ${t.etiqueta}`,
      detalle: `${_plural(t.personas.length, "persona lo mencionó", "personas lo mencionaron")}: ${t.personas.map((p) => p.nombre).join(", ")}.`,
      usuarioIds: t.personas.map((p) => p.usuarioId),
    });
  }

  // Mira la fuente oficial (el Calendario), no la del Pipeline: es la misma cifra que el equipo ve
  // en el resto de las pantallas, así que la señal no puede contradecir lo que está en pantalla.
  if (enviados.length > 0 && resultados.agendados === 0 && resultados.completados === 0) {
    atencion.push({
      clave: "sin_podcasts",
      titulo: "Sin podcasts agendados ni completados",
      detalle: "Ese día el equipo no registró ningún podcast agendado ni completado en el Calendario.",
      usuarioIds: [],
    });
  }

  // El umbral es el tamaño del equipo (más de un seguimiento vencido por persona), no un número
  // inventado aparte.
  if (poblacion.size > 0 && resultados.followupsVencidos > poblacion.size) {
    atencion.push({
      clave: "seguimientos_vencidos",
      titulo: "Seguimientos acumulados",
      detalle: `${_plural(resultados.followupsVencidos, "seguimiento vencido", "seguimientos vencidos")} para ${poblacion.size} personas del equipo.`,
      usuarioIds: [],
    });
  }

  // 10) Comparación con ayer: solo si ayer hubo al menos un reporte enviado. Si no, no se muestra
  //     nada — es preferible ausente que comparar contra un día del que no hay información.
  const reportesAyer = await _reportesConCanales(
    and(eq(podcastReportesDiarios.fecha, ayer), eq(podcastReportesDiarios.estado, "enviado"))!
  );
  const prospeccionesAyer = reportesAyer.map((r) => _resolverProspeccion(r.fila, r.canales));
  const comparacionAyer =
    reportesAyer.length > 0
      ? {
          fecha: ayer,
          reportesEnviados: reportesAyer.length,
          contactados: _sumarProspecciones(prospeccionesAyer, "contactados"),
          respuestas: _sumarProspecciones(prospeccionesAyer, "respuestas"),
          interesados: _sumarProspecciones(prospeccionesAyer, "interesados"),
        }
      : null;

  return {
    fecha,
    reportes: { enviados: enviados.length, esperados: poblacion.size },
    equipo,
    prospeccion,
    canales,
    resultados,
    bloqueos: { temas: temasConGente, otros, sinBloqueo },
    atencion,
    comparacionAyer,
    metas,
  };
}

export type ResumenEquipo = Awaited<ReturnType<typeof resumenEquipoDelDia>>;
