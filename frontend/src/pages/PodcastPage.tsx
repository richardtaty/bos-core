import { useEffect, useState } from "react";
import { api } from "../api/client";
import { KanbanBoard } from "../components/KanbanBoard";
import type { Pipeline } from "../types";

interface ReportePodcast {
  agendados: number;
  noShows: number;
  realizados: number;
  contenidoEntregado: number;
  contenidoPendiente: number;
  landingEntregada: number;
  landingPendiente: number;
  reuniones: number;
  ofertas: number;
  ventasCerradas: number;
  noCerraron: number;
  ingresos: number;
  ticketPromedio: number;
  conversionPodcastReunion: number;
  conversionReunionVenta: number;
  metaSemana: { podcasts: { actual: number; meta: number }; reuniones: { actual: number; meta: number } };
  alertas: { noShowsAltos: boolean; landingPendienteAlta: boolean; contenidoPendienteAlto: boolean };
}

function BarraMeta({ titulo, actual, meta }: { titulo: string; actual: number; meta: number }) {
  const pct = Math.min(100, Math.round((actual / meta) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-neutral-600">{titulo}</span>
        <span className="font-medium text-neutral-900">{actual} / {meta}</span>
      </div>
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-success-500" : "bg-primary-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PodcastPage() {
  const [reporte, setReporte] = useState<ReportePodcast | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      const [rep, pipelines] = await Promise.all([api.reportePodcast(), api.listarPipelines()]);
      setReporte(rep);
      const podcast = pipelines.find((p: Pipeline) => p.nombre === "Podcast");
      if (podcast) setPipelineId(podcast.id);
      setCargando(false);
    };
    void cargar();
  }, []);

  if (cargando || !reporte) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const hayAlertas = reporte.alertas.noShowsAltos || reporte.alertas.landingPendienteAlta || reporte.alertas.contenidoPendienteAlto;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Podcast</h1>
      <p className="text-sm text-neutral-500 mb-6">Agendados → realizados → 1% → oferta → resultado</p>

      {hayAlertas && (
        <div className="bg-danger-50 bg-danger-500/10 border border-danger-200 border-danger-500/20 rounded-xl p-3 mb-6 text-sm text-danger-700">
          {reporte.alertas.noShowsAltos && <p>⚠ La tasa de no-shows está por encima del 30%.</p>}
          {reporte.alertas.landingPendienteAlta && <p>⚠ Hay más de 3 landing pages pendientes de entregar.</p>}
          {reporte.alertas.contenidoPendienteAlto && <p>⚠ Hay más de 3 contenidos pendientes de entregar.</p>}
        </div>
      )}

      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-medium text-neutral-700 mb-3">Metas de la semana</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BarraMeta titulo="Podcasts agendados" actual={reporte.metaSemana.podcasts.actual} meta={reporte.metaSemana.podcasts.meta} />
          <BarraMeta titulo="Reuniones del 1%" actual={reporte.metaSemana.reuniones.actual} meta={reporte.metaSemana.reuniones.meta} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Agendados</p>
          <p className="text-xl font-semibold text-neutral-900">{reporte.agendados}</p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Realizados</p>
          <p className="text-xl font-semibold text-neutral-900">{reporte.realizados}</p>
        </div>
        <div className="bg-danger-50 bg-danger-500/10 rounded-xl p-3">
          <p className="text-xs text-danger-600">No-shows</p>
          <p className="text-xl font-semibold text-danger-600">{reporte.noShows}</p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Reuniones del 1%</p>
          <p className="text-xl font-semibold text-neutral-900">{reporte.reuniones}</p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Ofertas presentadas</p>
          <p className="text-xl font-semibold text-neutral-900">{reporte.ofertas}</p>
        </div>
        <div className="bg-success-50 bg-success-500/10 rounded-xl p-3">
          <p className="text-xs text-success-700">Ventas cerradas</p>
          <p className="text-xl font-semibold text-success-700">{reporte.ventasCerradas}</p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Ingresos</p>
          <p className="text-xl font-semibold text-neutral-900">${reporte.ingresos.toLocaleString()}</p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Ticket promedio</p>
          <p className="text-xl font-semibold text-neutral-900">${Math.round(reporte.ticketPromedio).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Contenido entregado</p>
          <p className="text-lg font-semibold text-neutral-900">{reporte.contenidoEntregado} <span className="text-xs text-neutral-500 font-normal">/ {reporte.contenidoPendiente} pend.</span></p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Landing entregada</p>
          <p className="text-lg font-semibold text-neutral-900">{reporte.landingEntregada} <span className="text-xs text-neutral-500 font-normal">/ {reporte.landingPendiente} pend.</span></p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Conversión podcast→reunión</p>
          <p className="text-lg font-semibold text-neutral-900">{reporte.conversionPodcastReunion}%</p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
          <p className="text-xs text-neutral-500">Conversión reunión→venta</p>
          <p className="text-lg font-semibold text-neutral-900">{reporte.conversionReunionVenta}%</p>
        </div>
      </div>

      <h3 className="text-sm font-medium text-neutral-700 mb-3">Tablero de invitados</h3>
      {pipelineId && <KanbanBoard pipelineId={pipelineId} />}
    </div>
  );
}
