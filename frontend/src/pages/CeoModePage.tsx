import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { CeoMode } from "../types";

const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">{titulo}</p>
      {children}
    </div>
  );
}

export function CeoModePage() {
  const [data, setData] = useState<CeoMode | null>(null);
  const [cargando, setCargando] = useState(true);
  const [verHoy, setVerHoy] = useState(false);

  useEffect(() => {
    api.ceoMode().then((d) => {
      setData(d);
      setCargando(false);
    });
  }, []);

  if (cargando || !data) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const { dinero, ventas, pipeline, equipo, proximaDecision, topAcciones } = data;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">🏁 CEO Mode</h1>
      <p className="text-sm text-neutral-500 mb-6">Tu negocio en 10 segundos.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Bloque titulo="💰 Dinero">
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Cobrado</span><span className="font-semibold text-success-600">{fmt(dinero.cobrado)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Vendido</span><span className="font-semibold text-neutral-800">{fmt(dinero.vendido)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Vencido</span><span className={`font-semibold ${dinero.vencido > 0 ? "text-danger-600" : "text-neutral-600"}`}>{fmt(dinero.vencido)}</span></div>
          </div>
        </Bloque>

        <Bloque titulo="📈 Ventas">
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Deals</span><span className="font-semibold text-neutral-800">{ventas.deals}</span></div>
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Conversión</span><span className="font-semibold text-neutral-800">{ventas.conversion}%</span></div>
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Ticket promedio</span><span className="font-semibold text-neutral-800">{fmt(ventas.ticketPromedio)}</span></div>
          </div>
        </Bloque>

        <Bloque titulo="🔄 Pipeline">
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Total</span><span className="font-semibold text-neutral-800">{fmt(pipeline.total)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Caliente</span><span className="font-semibold text-warning-600">{fmt(pipeline.caliente)}</span></div>
          </div>
        </Bloque>

        <Bloque titulo="👥 Equipo">
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Top performer</span><span className="font-semibold text-success-600">{equipo.topPerformer ?? "—"}</span></div>
            <div className="flex justify-between text-sm"><span className="text-neutral-500">Cuello de botella</span><span className="font-semibold text-warning-600">{equipo.cuelloBotella ?? "—"}</span></div>
          </div>
        </Bloque>
      </div>

      <div className="bg-primary-50 bg-primary-500/10 border border-primary-200 border-primary-500/20 rounded-xl p-5 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary-700 mb-2">🧭 Próxima decisión</p>
        {proximaDecision ? (
          <p className="text-lg font-semibold text-neutral-900">
            Tu mayor oportunidad hoy es <span className="text-primary-700">{proximaDecision.personaNombre}</span>.
            Recomendación: {proximaDecision.accion.toLowerCase()}.
            {proximaDecision.valor != null && <span className="text-neutral-500 font-normal"> ({fmt(proximaDecision.valor)})</span>}
          </p>
        ) : (
          <p className="text-neutral-500">No hay oportunidades abiertas hoy.</p>
        )}
      </div>

      <button
        onClick={() => setVerHoy((v) => !v)}
        className="w-full bg-primary-500 text-white font-bold text-lg py-4 rounded-xl hover:bg-primary-600 shadow-lg shadow-primary-500/20"
      >
        {verHoy ? "Ocultar" : "¿QUÉ DEBO HACER HOY?"}
      </button>

      {verHoy && (
        <div className="mt-4 flex flex-col gap-2">
          {topAcciones.length === 0 ? (
            <p className="text-sm text-neutral-500">Tu pipeline está al día. 👌</p>
          ) : (
            topAcciones.map((a, i) => (
              <Link key={i} to="/pipelines" className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 bg-neutral-50 hover:opacity-80">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-neutral-500">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{a.personaNombre ?? "Sin nombre"}</p>
                    <p className="text-[11px] text-neutral-500">{a.tipo}{a.pipelineNombre ? ` · ${a.pipelineNombre}` : ""}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-neutral-900">{fmt(a.monto)}</p>
                  <p className="text-[11px] text-success-600">🔥 {a.probabilidad}%</p>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
