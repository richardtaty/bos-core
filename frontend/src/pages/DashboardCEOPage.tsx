import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ActividadTimeline } from "../components/ActividadTimeline";
import { KpiCard } from "../components/KpiCard";
import type { DashboardCEO } from "../types";

function EstadoBadge({ estado }: { estado: string }) {
  const c: Record<string, string> = {
    saludable: "bg-success-100 text-success-700",
    advertencia: "bg-warning-100 text-warning-700",
    critico: "bg-danger-100 text-danger-700",
  };
  return <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${c[estado] ?? ""}`}>{estado}</span>;
}

export function DashboardCEOPage() {
  const [data, setData] = useState<DashboardCEO | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.dashboardCEO().then((d) => {
      setData(d);
      setCargando(false);
    });
  }, []);

  if (cargando || !data) return <p className="text-sm text-neutral-500">Cargando...</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 text-neutral-800 mb-1">Dashboard CEO</h1>
      <p className="text-sm text-neutral-500 text-neutral-400 mb-6">Visión global de todos los departamentos</p>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard titulo="Tareas activas" valor={data.totalTareasActivas} icono="📋" color="neutral" />
        <KpiCard titulo="Producción hoy" valor={data.produccionTotalHoy} icono="📦" color="success" />
        <KpiCard titulo="Usuarios activos" valor={data.usuariosActivos.length} icono="🟢" color="primary" />
        <KpiCard titulo="Sin actividad 7d" valor={data.usuariosSinActividad.length} icono="🔴" color={data.usuariosSinActividad.length > 0 ? "danger" : "neutral"} />
      </div>

      {/* Alertas y Riesgos */}
      {(data.alertas.length > 0 || data.riesgos.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {data.alertas.length > 0 && (
            <div className="bg-danger-50 bg-danger-500/10 border border-danger-200 border-danger-500/20 rounded-xl p-4">
              <h3 className="text-sm font-medium text-danger-700 text-danger-600 mb-2">🚨 Alertas</h3>
              {data.alertas.map((a, i) => <p key={i} className="text-xs text-danger-700 text-danger-600 py-0.5">{a}</p>)}
            </div>
          )}
          {data.riesgos.length > 0 && (
            <div className="bg-warning-50 bg-warning-500/10 border border-warning-200 border-warning-500/20 rounded-xl p-4">
              <h3 className="text-sm font-medium text-warning-700 text-warning-600 mb-2">⚠ Riesgos</h3>
              {data.riesgos.map((r, i) => <p key={i} className="text-xs text-warning-700 text-warning-600 py-0.5">{r}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Departamentos */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-3">Departamentos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.departamentos.map((d) => (
            <div key={d.id} className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm text-neutral-900 text-neutral-800">{d.nombre}</h4>
                <EstadoBadge estado={d.estado} />
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div>
                  <p className="text-neutral-400 text-neutral-500">Total</p>
                  <p className="font-semibold text-neutral-700 text-neutral-300">{d.total}</p>
                </div>
                <div>
                  <p className="text-neutral-400 text-neutral-500">Completadas</p>
                  <p className="font-semibold text-success-600 text-success-600">{d.completadas}</p>
                </div>
                <div>
                  <p className="text-neutral-400 text-neutral-500">Atrasadas</p>
                  <p className={`font-semibold ${d.atrasadas > 0 ? "text-danger-600 text-danger-600" : "text-neutral-600 text-neutral-400"}`}>{d.atrasadas}</p>
                </div>
                <div>
                  <p className="text-neutral-400 text-neutral-500">Prod. hoy</p>
                  <p className="font-semibold text-primary-600 text-primary-600">{d.produccionHoy}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actividad + Usuarios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-3">Actividad reciente</h3>
          <ActividadTimeline eventos={data.actividad.slice(0, 10)} />
        </div>
        <div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-medium text-neutral-700 text-neutral-300 mb-2">Usuarios activos hoy</h3>
            <div className="flex flex-wrap gap-2">
              {data.usuariosActivos.map((u) => (
                <span key={u} className="text-xs bg-success-50 bg-success-500/10 text-success-700 text-success-600 px-2 py-1 rounded-full">{u}</span>
              ))}
            </div>
          </div>
          {data.usuariosSinActividad.length > 0 && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-2 text-neutral-500 text-neutral-400">Sin actividad 7+ días</h3>
              <div className="flex flex-wrap gap-2">
                {data.usuariosSinActividad.map((u) => (
                  <span key={u} className="text-xs bg-neutral-100 bg-neutral-100 text-neutral-500 text-neutral-400 px-2 py-1 rounded-full">{u}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
