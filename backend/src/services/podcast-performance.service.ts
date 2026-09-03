import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import {
  pipelines,
  etapas,
  registros,
  historialEtapas,
  tareasSeguimiento,
  personas,
  usuarios,
  departamentos,
  usuarioDepartamentos,
  podcastMetas,
  podcastReportesDiarios,
  pagos,
} from "../db/schema";

// ─── Timezone ─────────────────────────────────────────────
// Igual que reportes.service.ts: el negocio opera en Florida (America/New_York) y el
// servidor corre en UTC. Todo "qué día es" pasa por estas funciones, nunca por
// new Date().getDate() directo.

const ZONA_NEGOCIO = "America/New_York";

function fechaET(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_NEGOCIO, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function offsetETMinutos(fechaRef: Date): number {
  const comoUTC = new Date(fechaRef.toLocaleString("en-US", { timeZone: "UTC" }));
  const comoET = new Date(fechaRef.toLocaleString("en-US", { timeZone: ZONA_NEGOCIO }));
  return Math.round((comoUTC.getTime() - comoET.getTime()) / 60000);
}

function limitesDiaET(ymd: string): { inicio: Date; fin: Date } {
  const offsetMin = offsetETMinutos(new Date(`${ymd}T12:00:00Z`));
  const [y, m, d] = ymd.split("-").map(Number);
  const inicio = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offsetMin * 60000);
  return { inicio, fin: new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1) };
}

function hoyET(): string {
  return fechaET(new Date());
}

function sumarDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}

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
  hoy: number;
  ayer: number;
  promedio7: number;
  meta: number | null;
  cumplimiento: number | null;
  variacionAyer: number | null;
  tendencia: "mejorando" | "estable" | "bajando";
}

export interface GuardarReporteInput {
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

export async function obtenerMetas(): Promise<{ items: { clave: string; nombre: string; valor: number }[]; metas: MetasPodcast }> {
  const filas = await db.select().from(podcastMetas);
  const porClave = new Map(filas.map((f) => [f.clave, f.valor]));
  const metas: MetasPodcast = {
    prospectosEncontrados: porClave.get("prospectos_encontrados") ?? METAS_DEFAULT.prospectosEncontrados,
    prospectosContactados: porClave.get("prospectos_contactados") ?? METAS_DEFAULT.prospectosContactados,
    podcastsAgendados: porClave.get("podcasts_agendados") ?? METAS_DEFAULT.podcastsAgendados,
    followupsRatio: porClave.get("followups_ratio") ?? METAS_DEFAULT.followupsRatio,
  };
  return { items: filas, metas };
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

async function _movimientosPodcast(inicio: Date, fin: Date) {
  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.nombre, "Podcast"));
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

async function _followupsCompletados(inicio: Date, fin: Date) {
  return db
    .select({
      responsableId: personas.responsableId,
      fecha: tareasSeguimiento.completadoEn,
    })
    .from(tareasSeguimiento)
    .innerJoin(personas, eq(tareasSeguimiento.personaId, personas.id))
    .where(and(gte(tareasSeguimiento.completadoEn, inicio), lte(tareasSeguimiento.completadoEn, fin)));
}

async function _followupsVencidos(usuarioId: string, fin: Date): Promise<number> {
  const filas = await db
    .select({ id: tareasSeguimiento.id })
    .from(tareasSeguimiento)
    .innerJoin(personas, eq(tareasSeguimiento.personaId, personas.id))
    .where(and(eq(personas.responsableId, usuarioId), eq(tareasSeguimiento.completado, false), lte(tareasSeguimiento.fecha, fin)));
  return filas.length;
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

// Devuelve las métricas diarias (auto + manual del reporte) para un usuario en un rango de días.
async function _metricasPara(usuarioId: string, fechas: string[]): Promise<Map<string, MetricasDia>> {
  const porFecha = new Map<string, MetricasDia>();
  if (fechas.length === 0) return porFecha;
  for (const f of fechas) porFecha.set(f, _metricasVacio(f));

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

  for (const m of movimientos) {
    if (m.autorId !== usuarioId) continue;
    const b = porFecha.get(fechaET(m.fecha));
    if (!b) continue;
    switch (m.etapaNombre) {
      case "Podcast agendado": b.agendados++; break;
      case "Podcast realizado": b.realizados++; break;
      case "Reunión del 1%": b.reuniones++; break;
      case "Venta cerrada": b.ventas++; break;
      case "No-show": b.noShows++; break;
    }
  }

  for (const c of completados) {
    if (c.responsableId !== usuarioId || !c.fecha) continue;
    const b = porFecha.get(fechaET(c.fecha));
    if (b) b.followupsRealizados++;
  }

  for (const rep of reportes) {
    const b = porFecha.get(rep.fecha);
    if (!b) continue;
    b.encontrados = rep.prospectosEncontrados ?? 0;
    b.contactados = rep.prospectosContactados ?? 0;
    b.respuestas = rep.respuestas ?? 0;
    b.interesados = rep.interesados ?? 0;
  }

  return porFecha;
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

// ─── Score (transparente, 0–100) ─────────────────────────

function _redondear(n: number): number {
  return Math.round(n * 10) / 10;
}

export function calcularScore(m: MetricasDia, metas: MetasPodcast, compromisoAyer: Compromiso | null): DesgloseScore {
  // Actividad (20): encontrados + contactados vs meta.
  const cumplEncontrados = metas.prospectosEncontrados > 0 ? Math.min(1, m.encontrados / metas.prospectosEncontrados) : 0;
  const cumplContactados = metas.prospectosContactados > 0 ? Math.min(1, m.contactados / metas.prospectosContactados) : 0;
  const actividad = ((cumplEncontrados + cumplContactados) / 2) * 20;

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
  let continuidad = 20;
  if (compromisoAyer && (compromisoAyer.contactos || compromisoAyer.followups || compromisoAyer.podcasts)) {
    const ratios: number[] = [];
    if (compromisoAyer.contactos) ratios.push(Math.min(1, m.contactados / compromisoAyer.contactos));
    if (compromisoAyer.followups) ratios.push(Math.min(1, m.followupsRealizados / compromisoAyer.followups));
    if (compromisoAyer.podcasts) ratios.push(Math.min(1, m.agendados / compromisoAyer.podcasts));
    if (ratios.length > 0) continuidad = (ratios.reduce((a, b) => a + b, 0) / ratios.length) * 20;
  }

  return {
    total: _redondear(actividad + followup + resultados + continuidad),
    actividad: _redondear(actividad),
    followup: _redondear(followup),
    resultados: _redondear(resultados),
    continuidad: _redondear(continuidad),
  };
}

function _tendencia(hoy: number, promedio7: number): "mejorando" | "estable" | "bajando" {
  if (promedio7 === 0) return hoy > 0 ? "mejorando" : "estable";
  const ratio = hoy / promedio7;
  if (ratio >= 1.1) return "mejorando";
  if (ratio <= 0.9) return "bajando";
  return "estable";
}

function _comparaciones(serie: MetricasDia[], metas: MetasPodcast): ComparacionKpi[] {
  const hoy = serie[serie.length - 1];
  const prev = serie.slice(0, -1);
  const ayer = prev.length ? prev[prev.length - 1] : hoy;
  const prom = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const kpis: { clave: keyof MetricasDia; label: string; meta: number | null }[] = [
    { clave: "encontrados", label: "Prospectos encontrados", meta: metas.prospectosEncontrados },
    { clave: "contactados", label: "Prospectos contactados", meta: metas.prospectosContactados },
    { clave: "followupsRealizados", label: "Follow-ups realizados", meta: null },
    { clave: "agendados", label: "Podcasts agendados", meta: metas.podcastsAgendados },
    { clave: "realizados", label: "Podcasts realizados", meta: null },
    { clave: "reuniones", label: "Reuniones del 1%", meta: null },
  ];

  return kpis.map((k) => {
    const hoyVal = hoy[k.clave] as number;
    const ayerVal = ayer[k.clave] as number;
    const prom7 = prom(prev.map((d) => d[k.clave] as number));
    return {
      clave: k.clave,
      label: k.label,
      hoy: hoyVal,
      ayer: ayerVal,
      promedio7: _redondear(prom7),
      meta: k.meta,
      cumplimiento: k.meta ? Math.round((hoyVal / k.meta) * 100) : null,
      variacionAyer: ayerVal > 0 ? Math.round(((hoyVal - ayerVal) / ayerVal) * 100) : null,
      tendencia: _tendencia(hoyVal, prom7),
    };
  });
}

// ─── Motor de alertas (reglas deterministas) ─────────────

const NIVEL_ORDEN: Record<Nivel, number> = { normal: 0, atencion: 1, intervencion: 2 };

function _alertasUsuario(serie: MetricasDia[], compromisoAyer: Compromiso | null): AlertaPodcast[] {
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
      evidencia: `Hoy agendó ${hoy.agendados} podcast(s) y contactó ${hoy.contactados} prospecto(s).`,
      comparacion: `Su promedio reciente era ${promAgendados.toFixed(1)} agendados/día.`,
      causa: "Ritmo de prospección por debajo de lo habitual.",
      accion: "Revisar bloqueos y priorizar contacto de prospectos hoy.",
    });
  }

  // 2. Compromiso de ayer incumplido.
  if (compromisoAyer && (compromisoAyer.contactos || compromisoAyer.followups || compromisoAyer.podcasts)) {
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

// ─── Reporte diario ──────────────────────────────────────

export async function obtenerReporteDiario(usuarioId: string, fechaParam?: string) {
  const fecha = fechaParam ?? hoyET();
  const [rep] = await db
    .select()
    .from(podcastReportesDiarios)
    .where(and(eq(podcastReportesDiarios.usuarioId, usuarioId), eq(podcastReportesDiarios.fecha, fecha)));

  const metricas = (await _metricasPara(usuarioId, [fecha])).get(fecha)!;
  metricas.followupsVencidos = await _followupsVencidos(usuarioId, limitesDiaET(fecha).fin);

  const { metas } = await obtenerMetas();
  const compromisoAyer = await _compromisoDe(usuarioId, sumarDias(fecha, -1));

  return {
    fecha,
    estado: rep?.estado ?? null,
    reporte: rep
      ? {
          prospectosEncontrados: rep.prospectosEncontrados,
          prospectosContactados: rep.prospectosContactados,
          respuestas: rep.respuestas,
          interesados: rep.interesados,
          bloqueos: rep.bloqueos,
        }
      : null,
    compromisoHoy: rep
      ? { contactos: rep.compromisoContactos, followups: rep.compromisoFollowups, podcasts: rep.compromisoPodcasts, nota: rep.compromisoNota }
      : null,
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

  const valores = {
    prospectosEncontrados: datos.prospectosEncontrados ?? null,
    prospectosContactados: datos.prospectosContactados ?? null,
    respuestas: datos.respuestas ?? null,
    interesados: datos.interesados ?? null,
    compromisoContactos: datos.compromisoContactos ?? null,
    compromisoFollowups: datos.compromisoFollowups ?? null,
    compromisoPodcasts: datos.compromisoPodcasts ?? null,
    compromisoNota: datos.compromisoNota ?? null,
    bloqueos: datos.bloqueos ?? null,
    estado,
    updatedAt: ahora,
  };

  if (existente) {
    await db.update(podcastReportesDiarios).set(valores).where(eq(podcastReportesDiarios.id, existente.id));
  } else {
    await db.insert(podcastReportesDiarios).values({
      ...valores,
      id: crypto.randomUUID(),
      usuarioId,
      fecha,
      createdAt: ahora,
    });
  }

  return obtenerReporteDiario(usuarioId, fecha);
}

// ─── Desempeño individual ────────────────────────────────

export async function desempenoMi(usuarioId: string) {
  const serie = await _serieMetricas(usuarioId, 7);
  const hoy = serie[serie.length - 1];
  const { metas } = await obtenerMetas();
  const compromisoAyer = await _compromisoDe(usuarioId, sumarDias(hoy.fecha, -1));
  const score = calcularScore(hoy, metas, compromisoAyer);
  const comparaciones = _comparaciones(serie, metas);
  const alertas = _alertasUsuario(serie, compromisoAyer);

  return {
    usuarioId,
    fecha: hoy.fecha,
    score,
    metricas: hoy,
    comparaciones,
    metas,
    compromisoAyer,
    alertas,
    estadoIA: _estadoIA(alertas),
  };
}

// ─── Desempeño del equipo ────────────────────────────────

export async function desempenoEquipo() {
  const usuariosPodcast = await _usuariosPodcast();
  const { metas } = await obtenerMetas();

  const filas = await Promise.all(
    usuariosPodcast.map(async (u) => {
      const serie = await _serieMetricas(u.id, 7);
      const hoy = serie[serie.length - 1];
      const compromisoAyer = await _compromisoDe(u.id, sumarDias(hoy.fecha, -1));
      const score = calcularScore(hoy, metas, compromisoAyer);
      const alertas = _alertasUsuario(serie, compromisoAyer);
      const prev = serie.slice(0, -1);
      const promAgendados = prev.length ? prev.reduce((a, d) => a + d.agendados, 0) / prev.length : 0;

      return {
        usuarioId: u.id,
        nombre: u.nombre,
        score,
        contactados: hoy.contactados,
        followupsRealizados: hoy.followupsRealizados,
        agendados: hoy.agendados,
        realizados: hoy.realizados,
        pctMeta: metas.podcastsAgendados > 0 ? Math.round((hoy.agendados / metas.podcastsAgendados) * 100) : 0,
        tendencia: _tendencia(hoy.agendados, promAgendados),
        estadoIA: _estadoIA(alertas),
      };
    })
  );

  filas.sort((a, b) => b.score.total - a.score.total);

  return { fecha: hoyET(), metas, equipo: filas };
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
