import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { KpiCard } from "../components/KpiCard";
import type { BmfDashboard, BmfFunding } from "../types";

export function BmfDashboardPage() {
  const { usuario } = useAuth();
  const [data, setData] = useState<BmfDashboard | null>(null);
  const [fundings, setFundings] = useState<BmfFunding[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      api.bmfDashboard(),
      api.listarBmfFundings().catch(() => [] as BmfFunding[]),
    ]).then(([d, f]) => {
      setData(d);
      setFundings(f.slice(0, 10));
      setCargando(false);
    });
  }, []);

  if (cargando || !data) return <p className="text-sm text-neutral-500">Cargando...</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Business Market Finders</h1>
      <p className="text-sm text-neutral-500 mb-6">Hola, {usuario?.nombre.split(" ")[0]} — Centro de Operaciones BMF</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard titulo="Clientes activos" valor={data.clientesActivos} icono="👥" color="primary" />
        <KpiCard titulo="Leads nuevos" valor={data.leadsNuevos} icono="🆕" color="neutral" />
        <KpiCard titulo="Seg. pendientes" valor={data.seguimientosPendientes} icono="📋" color={data.seguimientosVencidos > 0 ? "warning" : "neutral"} />
        <KpiCard titulo="Sol. abiertas" valor={data.solicitudesAbiertas} icono="📂" color="primary" />
        <KpiCard titulo="Sol. aprobadas" valor={data.solicitudesAprobadas} icono="✅" color="success" />
        <KpiCard titulo="Funding del mes" valor={`$${Math.round(data.fundingMes).toLocaleString()}`} icono="💵" color="success" />
        <KpiCard titulo="Pipeline activo" valor={`$${Math.round(data.pipelineActivo).toLocaleString()}`} icono="📊" color="neutral" />
        <KpiCard titulo="Lenders activos" valor={data.lendersActivos} icono="🏛" color="neutral" />
        <KpiCard titulo="Agentes activos" valor={data.agentesActivos} icono="👤" color="primary" />
        <KpiCard titulo="Conversión" valor={`${data.conversion}%`} icono="🎯" color="neutral" />
        <KpiCard titulo="Comisiones gen." valor={`$${Math.round(data.comisionesGeneradas).toLocaleString()}`} icono="💸" color="warning" />
        <KpiCard titulo="Actividad hoy" valor={data.actividadHoy} icono="🕐" color="primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fundings recientes */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-neutral-700">💵 Fundings recientes</h3>
            <Link to="/bmf/fundings" className="text-xs text-primary-600 hover:underline">Ver todos →</Link>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-xs text-neutral-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5">Cliente</th>
                  <th className="text-left px-4 py-2.5">Agente</th>
                  <th className="text-left px-4 py-2.5">Monto</th>
                  <th className="text-left px-4 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {fundings.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-4 text-center text-neutral-600">Sin fundings registrados</td></tr>
                ) : (
                  fundings.map((f) => (
                    <tr key={f.id} className="border-t border-neutral-200 hover:bg-neutral-100">
                      <td className="px-4 py-2.5 font-medium text-neutral-900">
                        <Link to={`/personas/${f.clienteId}`} className="hover:text-primary-600">{f.clienteNombre}</Link>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600">{f.agenteNombre}</td>
                      <td className="px-4 py-2.5 text-neutral-700">${Math.round(f.montoSolicitado).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          f.estado === "aprobado" || f.estado === "funding_enviado" ? "bg-success-100 text-success-700" :
                          f.estado === "perdido" ? "bg-danger-100 text-danger-700" :
                          "bg-neutral-100 text-neutral-600"
                        }`}>{f.estado.replace(/_/g, " ")}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Accesos rápidos */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-3">Accesos rápidos</h3>
          <div className="flex flex-col gap-2">
            {[
              { to: "/bmf/lenders", label: "🏛 Lenders", desc: "Gestionar entidades financieras" },
              { to: "/bmf/fundings", label: "💵 Fundings", desc: "Operaciones de financiamiento" },
              { to: "/bmf/llamadas", label: "📞 Llamadas", desc: "Registro de llamadas" },
              { to: "/bmf/comisiones", label: "💸 Comisiones", desc: "Gestión de comisiones" },
              { to: "/bmf/reportes", label: "📊 Reportes", desc: "Métricas y análisis" },
              { to: "/personas", label: "👤 CRM", desc: "Gestionar contactos" },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 hover:border-primary-300 hover:border-primary-500/30 hover:shadow-sm transition-all"
              >
                <p className="font-medium text-sm text-neutral-900 mb-1">{item.label}</p>
                <p className="text-xs text-neutral-500">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
