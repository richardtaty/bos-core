import { useEffect, useState } from "react";
import { api, type DesempenoMiDTO } from "../api/client";
import { EstadoIABadge, TendenciaBadge, ScoreBar } from "../components/PodcastBadges";

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
      <h3 className="text-sm font-medium text-neutral-700 mb-3">{titulo}</h3>
      {children}
    </div>
  );
}

export function PodcastMiDesempenoPage() {
  const [d, setD] = useState<DesempenoMiDTO | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.podcastDesempenoMi().then((x) => {
      setD(x);
      setCargando(false);
    });
  }, []);

  if (cargando || !d) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const nivelScore = d.score.total >= 80 ? "text-success-600" : d.score.total >= 50 ? "text-amber-600" : "text-danger-600";

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-xl font-semibold text-neutral-800">Mi desempeño · Podcast</h1>
        <EstadoIABadge nivel={d.estadoIA} />
      </div>
      <p className="text-sm text-neutral-500 mb-6">{d.fecha}</p>

      {/* Score */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 flex flex-col items-center justify-center">
          <p className="text-xs text-neutral-500 mb-1">Performance Score</p>
          <p className={`text-5xl font-bold ${nivelScore}`}>{d.score.total}</p>
          <p className="text-xs text-neutral-400 mt-1">de 100</p>
        </div>
        <div className="md:col-span-2 bg-neutral-50 border border-neutral-200 rounded-xl p-5 flex flex-col gap-3 justify-center">
          <ScoreBar label="Actividad (20%)" valor={d.score.actividad} max={20} />
          <ScoreBar label="Follow-up (20%)" valor={d.score.followup} max={20} />
          <ScoreBar label="Resultados (40%)" valor={d.score.resultados} max={40} />
          <ScoreBar label="Continuidad (20%)" valor={d.score.continuidad} max={20} />
        </div>
      </div>

      {/* Comparaciones */}
      <Tarjeta titulo="Hoy vs ayer vs promedio 7 días">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-400 border-b border-neutral-200">
                <th className="py-2 pr-2">KPI</th>
                <th className="py-2 px-2 text-right">Hoy</th>
                <th className="py-2 px-2 text-right">Ayer</th>
                <th className="py-2 px-2 text-right">Prom. 7d</th>
                <th className="py-2 px-2 text-right">Meta</th>
                <th className="py-2 px-2 text-right">% meta</th>
                <th className="py-2 px-2 text-right">vs ayer</th>
                <th className="py-2 pl-2">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {d.comparaciones.map((c) => (
                <tr key={c.clave} className="border-b border-neutral-100">
                  <td className="py-2 pr-2 text-neutral-700">{c.label}</td>
                  <td className="py-2 px-2 text-right font-semibold text-neutral-800">{c.hoy}</td>
                  <td className="py-2 px-2 text-right text-neutral-500">{c.ayer}</td>
                  <td className="py-2 px-2 text-right text-neutral-500">{c.promedio7}</td>
                  <td className="py-2 px-2 text-right text-neutral-500">{c.meta ?? "—"}</td>
                  <td className="py-2 px-2 text-right text-neutral-500">{c.cumplimiento !== null ? `${c.cumplimiento}%` : "—"}</td>
                  <td className={`py-2 px-2 text-right font-medium ${c.variacionAyer === null ? "text-neutral-400" : c.variacionAyer >= 0 ? "text-success-600" : "text-danger-600"}`}>
                    {c.variacionAyer === null ? "—" : `${c.variacionAyer > 0 ? "+" : ""}${c.variacionAyer}%`}
                  </td>
                  <td className="py-2 pl-2"><TendenciaBadge tendencia={c.tendencia} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {/* Alertas */}
      {d.alertas.length > 0 && (
        <div className="mt-4">
          <Tarjeta titulo="Alertas del monitor de IA">
            <div className="flex flex-col gap-3">
              {d.alertas.map((a) => (
                <div key={a.tipo} className="bg-white border border-neutral-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold ${a.nivel === "intervencion" ? "text-danger-600" : "text-amber-600"}`}>
                      {a.nivel === "intervencion" ? "🔴" : "🟡"} {a.titulo}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-700">{a.evidencia}</p>
                  <p className="text-sm text-neutral-500">{a.comparacion}</p>
                  <p className="text-sm text-neutral-600 mt-1"><b>Causa:</b> {a.causa}</p>
                  <p className="text-sm text-neutral-600"><b>Acción:</b> {a.accion}</p>
                </div>
              ))}
            </div>
          </Tarjeta>
        </div>
      )}
    </div>
  );
}
