import { eq, sum } from "drizzle-orm";
import { db } from "../db/client";
import { pipelines, etapas, registros, pagos } from "../db/schema";

function inicioDeSemana(): Date {
  const ahora = new Date();
  const dia = ahora.getDay(); // 0 = domingo
  const diff = dia === 0 ? 6 : dia - 1; // semana empieza lunes
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - diff, 0, 0, 0);
  return inicio;
}

const META_PODCASTS_SEMANA = 12;
const META_REUNIONES_SEMANA = 10;

// Reporte específico del módulo Podcast — cuenta cuántos invitados llegaron a cada hito del
// funnel (no solo los que están AHÍ ahora), usando el orden de las etapas: si un registro está
// en una etapa de orden N, se asume que ya pasó por todas las etapas anteriores de orden menor
// (el flujo es lineal, sin saltos hacia atrás).
export async function reportePodcast() {
  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.nombre, "Podcast"));
  if (!pipeline) throw new Error("El pipeline de Podcast no existe todavía");

  const etapasPipeline = await db.select().from(etapas).where(eq(etapas.pipelineId, pipeline.id)).orderBy(etapas.orden);
  const registrosPipeline = await db.select().from(registros).where(eq(registros.pipelineId, pipeline.id));

  const etapaPorId = new Map(etapasPipeline.map((e) => [e.id, e]));
  const ordenDe = (nombre: string) => etapasPipeline.find((e) => e.nombre === nombre)?.orden ?? -1;

  const noShowOrden = ordenDe("No-show");
  const realizadoOrden = ordenDe("Podcast realizado");
  const contenidoOrden = ordenDe("Entrega de contenido");
  const landingOrden = ordenDe("Entrega de landing page");
  const reunionOrden = ordenDe("Reunión del 1%");
  const ofertaOrden = ordenDe("Oferta");
  const ventaOrden = ordenDe("Venta cerrada");
  const noCerroOrden = ordenDe("No cerró");

  // "Llegó a X" = su etapa actual tiene orden >= X, Y no está en una rama de pérdida temprana
  // (no-show) que por número de orden pudiera dar falsos positivos.
  const llegoA = (ordenObjetivo: number) =>
    registrosPipeline.filter((r) => {
      const e = etapaPorId.get(r.etapaId);
      if (!e) return false;
      if (e.orden === noShowOrden) return false; // no-show nunca "llegó" a nada más adelante
      return e.orden >= ordenObjetivo;
    });

  const agendados = registrosPipeline.length;
  const noShows = registrosPipeline.filter((r) => etapaPorId.get(r.etapaId)?.orden === noShowOrden).length;
  const realizados = llegoA(realizadoOrden).length;
  const contenidoEntregado = llegoA(contenidoOrden + 1).length; // pasó de "entrega de contenido" en adelante
  const contenidoPendiente = llegoA(realizadoOrden).length - contenidoEntregado;
  const landingEntregada = llegoA(landingOrden + 1).length;
  const landingPendiente = llegoA(contenidoOrden).length - landingEntregada;
  const reuniones = llegoA(reunionOrden).length;
  const ofertas = llegoA(ofertaOrden).length;
  const ventasCerradas = registrosPipeline.filter((r) => etapaPorId.get(r.etapaId)?.orden === ventaOrden).length;
  const noCerraron = registrosPipeline.filter((r) => etapaPorId.get(r.etapaId)?.orden === noCerroOrden).length;

  const registroIds = registrosPipeline.map((r) => r.id);
  let ingresos = 0;
  if (registroIds.length > 0) {
    for (const id of registroIds) {
      const [fila] = await db.select({ total: sum(pagos.monto) }).from(pagos).where(eq(pagos.registroId, id));
      ingresos += Number(fila?.total ?? 0);
    }
  }
  const ticketPromedio = ventasCerradas > 0 ? ingresos / ventasCerradas : 0;

  // Metas semanales — cuántos registros de esta semana (por fecha de creación) ya cumplieron el hito.
  const inicioSemana = inicioDeSemana();
  const registrosEstaSemana = registrosPipeline.filter((r) => r.createdAt >= inicioSemana);
  const podcastsEstaSemana = registrosEstaSemana.length;
  const reunionesEstaSemana = registrosEstaSemana.filter((r) => {
    const e = etapaPorId.get(r.etapaId);
    return e && e.orden !== noShowOrden && e.orden >= reunionOrden;
  }).length;

  return {
    agendados,
    noShows,
    realizados,
    contenidoEntregado,
    contenidoPendiente: Math.max(0, contenidoPendiente),
    landingEntregada,
    landingPendiente: Math.max(0, landingPendiente),
    reuniones,
    ofertas,
    ventasCerradas,
    noCerraron,
    ingresos,
    ticketPromedio,
    conversionPodcastReunion: realizados > 0 ? Number(((reuniones / realizados) * 100).toFixed(1)) : 0,
    conversionReunionVenta: reuniones > 0 ? Number(((ventasCerradas / reuniones) * 100).toFixed(1)) : 0,
    metaSemana: {
      podcasts: { actual: podcastsEstaSemana, meta: META_PODCASTS_SEMANA },
      reuniones: { actual: reunionesEstaSemana, meta: META_REUNIONES_SEMANA },
    },
    alertas: {
      noShowsAltos: agendados > 0 && noShows / agendados > 0.3,
      landingPendienteAlta: landingPendiente > 3,
      contenidoPendienteAlto: contenidoPendiente > 3,
    },
  };
}
