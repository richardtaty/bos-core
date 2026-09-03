import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { KpiCard } from "../components/KpiCard";
import type { Pipeline } from "../types";

interface Metrica {
  nombre: string;
  total: number;
  ganados: number;
  perdidos: number;
  abiertos: number;
  valorAbierto: number;
  tasaConversion: number;
}

export function VentasDashboardPage() {
  const { usuario } = useAuth();
  const [metricas, setMetricas] = useState<Metrica[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      const pipelines = await api.listarPipelines();

      const resultados: Metrica[] = await Promise.all(
        pipelines.map(async (p: Pipeline) => {
          const m = await api.metricasPipeline(p.id);
          return { nombre: p.nombre, ...m };
        })
      );

      setMetricas(resultados);
      setCargando(false);
    };
    void cargar();
  }, []);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const totalRegistros = metricas.reduce((s, m) => s + m.total, 0);
  const totalGanados = metricas.reduce((s, m) => s + m.ganados, 0);
  const totalPerdidos = metricas.reduce((s, m) => s + m.perdidos, 0);
  const valorAbiertoTotal = metricas.reduce((s, m) => s + m.valorAbierto, 0);
  const tasaGlobal = totalRegistros ? Math.round((totalGanados / totalRegistros) * 100) : 0;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Sala de OFERTAS</h1>
      <p className="text-sm text-neutral-500 mb-6">Hola, {usuario?.nombre.split(" ")[0]} — Centro de Ventas de Taty's Enterprises</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard titulo="Valor abierto" valor={`$${Math.round(valorAbiertoTotal).toLocaleString()}`} icono="💰" color="success" />
        <KpiCard titulo="Deals activos" valor={totalRegistros} icono="📋" color="primary" />
        <KpiCard titulo="Ganados" valor={totalGanados} icono="🏆" color="success" />
        <KpiCard titulo="Perdidos" valor={totalPerdidos} icono="❌" color="danger" />
        <KpiCard titulo="Conversión" valor={`${tasaGlobal}%`} icono="📊" color="neutral" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipelines */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-neutral-700">🏗 Pipelines activos</h3>
            <Link to="/pipelines" className="text-xs text-primary-600 hover:underline">Ver todos →</Link>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-xs text-neutral-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5">Pipeline</th>
                  <th className="text-left px-4 py-2.5">Total</th>
                  <th className="text-left px-4 py-2.5">Ganados</th>
                  <th className="text-left px-4 py-2.5">Perdidos</th>
                  <th className="text-left px-4 py-2.5">Valor abierto</th>
                  <th className="text-left px-4 py-2.5">Conversión</th>
                </tr>
              </thead>
              <tbody>
                {metricas
                  .sort((a, b) => b.valorAbierto - a.valorAbierto)
                  .map((m) => (
                    <tr key={m.nombre} className="border-t border-neutral-200">
                      <td className="px-4 py-2.5 font-medium text-neutral-900">{m.nombre}</td>
                      <td className="px-4 py-2.5 text-neutral-600">{m.total}</td>
                      <td className="px-4 py-2.5 text-success-600">{m.ganados}</td>
                      <td className="px-4 py-2.5 text-danger-600">{m.perdidos}</td>
                      <td className="px-4 py-2.5 text-neutral-700">${Math.round(m.valorAbierto).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-neutral-600">{m.tasaConversion}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Accesos rápidos */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-3">Accesos rápidos</h3>
          <div className="flex flex-col gap-2">
            {[
              { to: "/personas", label: "👤 Contactos", desc: "Gestionar leads y clientes" },
              { to: "/pipelines", label: "🔄 Pipelines", desc: "Tableros Kanban de ventas" },
              { to: "/reporte-ventas", label: "💰 Reporte de ventas", desc: "Facturación y comisiones" },
              { to: "/moc/proyectos", label: "📁 Proyectos", desc: "Proyectos comerciales" },
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
