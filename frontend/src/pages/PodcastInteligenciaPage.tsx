import { useEffect, useState } from "react";
import { api, type InteligenciaPodcastDTO } from "../api/client";
import { EstadoIABadge } from "../components/PodcastBadges";

// Resumen ejecutivo del departamento Podcast + monitor de IA. Diseñado para
// leerse en ~60 segundos: salud, funnel comercial y alertas priorizadas.

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
      <h3 className="text-sm font-medium text-neutral-700 mb-3">{titulo}</h3>
      {children}
    </div>
  );
}

function pct(a: number, b: number): number {
  return a > 0 ? Math.round((b / a) * 100) : 0;
}

export function PodcastInteligenciaPage() {
  const [d, setD] = useState<InteligenciaPodcastDTO | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.podcastInteligencia().then((x) => {
      setD(x);
      setCargando(false);
    });
  }, []);

  if (cargando || !d) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const f = d.funnel;
  const etapas = [
    { label: "Encontrados", valor: f.encontrados },
    { label: "Contactados", valor: f.contactados },
    { label: "Respondieron", valor: f.respuestas },
    { label: "Interesados", valor: f.interesados },
    { label: "Agendados", valor: f.agendados },
    { label: "Realizados", valor: f.realizados },
    { label: "Reuniones 1%", valor: f.reuniones },
    { label: "Ventas", valor: f.ventas },
  ];
  const maxEtapa = Math.max(1, ...etapas.map((e) => e.valor));

  const conversiones = [
    { label: "Contacto → Interesado", valor: pct(f.contactados, f.interesados) },
    { label: "Interesado → Agendado", valor: pct(f.interesados, f.agendados) },
    { label: "Agendado → Realizado", valor: pct(f.agendados, f.realizados) },
    { label: "Realizado → Reunión 1%", valor: pct(f.realizados, f.reuniones) },
    { label: "Reunión → Venta", valor: pct(f.reuniones, f.ventas) },
  ];

  const intervencion = d.alertas.filter((a) => a.nivel === "intervencion").length;
  const atencion = d.alertas.filter((a) => a.nivel === "atencion").length;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-xl font-semibold text-neutral-800">Inteligencia · Podcast</h1>
        <EstadoIABadge nivel={d.estadoGeneral} />
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        {d.fecha} · Salud promedio {d.saludPromedio}/100 · {intervencion} intervención(es), {atencion} atención(es)
      </p>

      {/* Funnel comercial (últimos 7 días) */}
      <Tarjeta titulo="Funnel comercial (7 días)">
        <div className="flex flex-col gap-1.5">
          {etapas.map((e) => (
            <div key={e.label} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-xs text-neutral-500">{e.label}</span>
              <div className="flex-1 h-5 bg-neutral-100 rounded">
                <div
                  className="h-full rounded bg-primary-500/80 flex items-center justify-end pr-2"
                  style={{ width: `${(e.valor / maxEtapa) * 100}%` }}
                >
                  <span className="text-[11px] font-semibold text-white">{e.valor}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Tarjeta>

      {/* Conversiones */}
      <div className="mt-4">
        <Tarjeta titulo="Conversión">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {conversiones.map((c) => (
              <div key={c.label} className="bg-white border border-neutral-200 rounded-lg p-3">
                <p className="text-xs text-neutral-500">{c.label}</p>
                <p className="text-lg font-semibold text-neutral-800">{c.valor}%</p>
              </div>
            ))}
          </div>
        </Tarjeta>
      </div>

      {/* Ingresos */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500">Ingresos del período (7 días)</p>
          <p className="text-2xl font-bold text-neutral-800">${d.ingresosPeriodo.toLocaleString()}</p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <p className="text-xs text-neutral-500">No-shows (7 días)</p>
          <p className="text-2xl font-bold text-neutral-800">{f.noShows}</p>
        </div>
      </div>

      {/* Alertas priorizadas */}
      <div className="mt-4">
        <Tarjeta titulo="Alertas del monitor de IA">
          {d.alertas.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin alertas. Todo dentro de lo normal. 🟢</p>
          ) : (
            <div className="flex flex-col gap-3">
              {d.alertas.map((a, i) => (
                <div key={i} className="bg-white border border-neutral-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-semibold ${a.nivel === "intervencion" ? "text-danger-600" : "text-amber-600"}`}>
                      {a.nivel === "intervencion" ? "🔴" : "🟡"} {a.titulo}
                    </span>
                    <span className="text-xs text-neutral-500">{a.nombre}</span>
                  </div>
                  <p className="text-sm text-neutral-700">{a.evidencia}</p>
                  <p className="text-sm text-neutral-500">{a.comparacion}</p>
                  <p className="text-sm text-neutral-600 mt-1"><b>Causa:</b> {a.causa}</p>
                  <p className="text-sm text-neutral-600"><b>Acción:</b> {a.accion}</p>
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
