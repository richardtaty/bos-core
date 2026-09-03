import type { EventoActividad } from "../types";

function fmtFecha(iso: string) {
  const d = new Date(iso);
  const ahora = new Date();
  const diff = ahora.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const dias = Math.floor(diff / 86400000);

  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins}m`;
  if (hrs < 24) return `Hace ${hrs}h`;
  if (dias < 7) return `Hace ${dias}d`;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

const ICONOS: Record<string, string> = {
  Persona: "👤",
  Interaccion: "💬",
  TareaSeguimiento: "📋",
  Registro: "🔄",
  Pago: "💰",
  TareaOperativa: "✅",
  Archivo: "📎",
  Usuario: "👥",
  Pipeline: "⚙️",
  Podcast: "🎙",
};

export function ActividadTimeline({ eventos }: { eventos: EventoActividad[] }) {
  if (eventos.length === 0) {
    return <p className="text-sm text-neutral-400 text-neutral-500 text-center py-8">Sin actividad registrada todavía.</p>;
  }

  return (
    <div className="relative">
      {/* Línea vertical */}
      <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-neutral-200 bg-neutral-100" />

      <div className="flex flex-col gap-3">
        {eventos.map((evento) => (
          <div key={evento.id} className="flex gap-3 items-start pl-1">
            {/* Círculo en la línea */}
            <div className="w-5 h-5 rounded-full bg-neutral-200 border-2 border-neutral-300 border-neutral-500 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
              {ICONOS[evento.entidad] ?? "•"}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-800 text-neutral-200">{evento.detalle}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-neutral-500 text-neutral-400">{evento.autorNombre}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 bg-neutral-100 text-neutral-500 text-neutral-400">
                  {evento.categoria}
                </span>
                <span className="text-xs text-neutral-400 text-neutral-500">{fmtFecha(evento.fecha)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
