import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { BmfDashboardAdmin } from "../types";

export function BmfAdminDashboardPage() {
  const [data, setData] = useState<BmfDashboardAdmin | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.bmfDashboardAdmin().then((d) => {
      setData(d);
      setCargando(false);
    });
  }, []);

  if (cargando || !data) return <p className="text-sm text-neutral-500">Cargando...</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Dashboard Administrativo BMF</h1>
      <p className="text-sm text-neutral-500 mb-6">Vista de supervisión — Director de Administración</p>

      {/* Alertas */}
      {data.agentesSinActividad.length > 0 && (
        <div className="bg-danger-50 bg-danger-500/10 border border-danger-200 border-danger-500/20 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-medium text-danger-700 mb-2">⚠ Agentes sin actividad hoy</h3>
          <div className="flex flex-wrap gap-2">
            {data.agentesSinActividad.map((a) => (
              <span key={a.usuarioId} className="text-xs bg-danger-100 text-danger-700 px-2 py-1 rounded-full">{a.nombre}</span>
            ))}
          </div>
        </div>
      )}

      {/* KPIs de agentes */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-neutral-700 mb-3">Rendimiento por Agente</h3>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Agente</th>
                <th className="text-left px-4 py-2.5">Cargo</th>
                <th className="text-left px-4 py-2.5">Llamadas hoy</th>
                <th className="text-left px-4 py-2.5">Clientes</th>
                <th className="text-left px-4 py-2.5">Funding</th>
                <th className="text-left px-4 py-2.5">Seg. vencidos</th>
                <th className="text-left px-4 py-2.5">Conversión</th>
              </tr>
            </thead>
            <tbody>
              {data.kpisPorAgente.map((a) => (
                <tr key={a.usuarioId} className="border-t border-neutral-200">
                  <td className="px-4 py-2.5 font-medium text-neutral-900">
                    <Link to={`/equipo/${a.usuarioId}`} className="hover:text-primary-600">{a.nombre}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 text-xs">{a.cargo}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{a.llamadasHoy}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{a.clientesAtendidos}</td>
                  <td className="px-4 py-2.5 text-neutral-700 font-medium">${Math.round(a.fundingProducido).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <span className={a.seguimientosVencidos > 0 ? "text-danger-600 font-medium" : "text-neutral-500"}>
                      {a.seguimientosVencidos}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">{a.conversion}%</td>
                </tr>
              ))}
              {data.kpisPorAgente.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-4 text-center text-neutral-600">Sin agentes registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Clientes sin contacto */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-3">⚠ Clientes sin contacto reciente</h3>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-xs text-neutral-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5">Cliente</th>
                  <th className="text-left px-4 py-2.5">Agente</th>
                  <th className="text-left px-4 py-2.5">Días sin contacto</th>
                </tr>
              </thead>
              <tbody>
                {data.clientesSinContacto.slice(0, 10).map((c) => (
                  <tr key={c.id} className="border-t border-neutral-200">
                    <td className="px-4 py-2.5 font-medium text-neutral-900">
                      <Link to={`/personas/${c.id}`} className="hover:text-primary-600">{c.nombre}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500">{c.agenteNombre}</td>
                    <td className="px-4 py-2.5">
                      <span className={c.diasSinContacto > 14 ? "text-danger-600 font-medium" : c.diasSinContacto > 7 ? "text-warning-600 font-medium" : "text-neutral-500"}>
                        {c.diasSinContacto}d
                      </span>
                    </td>
                  </tr>
                ))}
                {data.clientesSinContacto.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-4 text-center text-neutral-600">Todos los clientes tienen contacto reciente</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Renovaciones próximas */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-3">🔄 Posibles renovaciones</h3>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-xs text-neutral-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5">Cliente</th>
                  <th className="text-left px-4 py-2.5">Monto</th>
                  <th className="text-left px-4 py-2.5">Desde</th>
                </tr>
              </thead>
              <tbody>
                {data.renovacionesProximas.slice(0, 10).map((r) => (
                  <tr key={r.id} className="border-t border-neutral-200">
                    <td className="px-4 py-2.5 font-medium text-neutral-900">{r.clienteNombre}</td>
                    <td className="px-4 py-2.5 text-neutral-700">${Math.round(r.montoSolicitado).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-neutral-500 text-xs">
                      {new Date(r.fechaCreacion).toLocaleDateString("es-MX")}
                    </td>
                  </tr>
                ))}
                {data.renovacionesProximas.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-4 text-center text-neutral-600">Sin renovaciones detectadas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
