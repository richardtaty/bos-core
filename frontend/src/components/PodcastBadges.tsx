import type { NivelAlertaDTO, TendenciaDTO } from "../api/client";

/** Semáforo de IA: 🟢 normal / 🟡 atención / 🔴 intervención. */
export function EstadoIABadge({ nivel }: { nivel: NivelAlertaDTO }) {
  const mapa: Record<NivelAlertaDTO, { texto: string; clase: string }> = {
    normal: { texto: "🟢 NORMAL", clase: "bg-success-500/10 text-success-600" },
    atencion: { texto: "🟡 ATENCIÓN", clase: "bg-amber-500/10 text-amber-600" },
    intervencion: { texto: "🔴 INTERVENCIÓN", clase: "bg-danger-500/10 text-danger-600" },
  };
  const { texto, clase } = mapa[nivel];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${clase}`}>
      {texto}
    </span>
  );
}

/** Flecha de tendencia frente al promedio de 7 días. */
export function TendenciaBadge({ tendencia }: { tendencia: TendenciaDTO }) {
  const mapa: Record<TendenciaDTO, { texto: string; clase: string }> = {
    mejorando: { texto: "↑ Mejorando", clase: "text-success-600" },
    estable: { texto: "→ Estable", clase: "text-neutral-500" },
    bajando: { texto: "↓ Bajando", clase: "text-danger-600" },
  };
  const { texto, clase } = mapa[tendencia];
  return <span className={`text-xs font-semibold ${clase}`}>{texto}</span>;
}

/** Barra horizontal para el desglose del score (0 a `max`, valor ya en puntos). */
export function ScoreBar({ label, valor, max }: { label: string; valor: number; max: number }) {
  const pct = Math.min(100, Math.round((valor / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-neutral-500">{label}</span>
        <span className="font-medium text-neutral-800">{valor.toFixed(1)} / {max}</span>
      </div>
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
