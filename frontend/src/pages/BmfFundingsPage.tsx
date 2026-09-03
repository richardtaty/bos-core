import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { BmfFunding } from "../types";

export function BmfFundingsPage() {
  const [fundings, setFundings] = useState<BmfFunding[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const params: Record<string, string> = {};
    if (filtroEstado) params.estado = filtroEstado;
    const data = await api.listarBmfFundings(params);
    setFundings(data);
    setCargando(false);
  }, [filtroEstado]);

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-1">Fundings</h1>
          <p className="text-sm text-neutral-500">Operaciones de financiamiento — {fundings.length} registradas</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4">
        <select className="border border-neutral-200 rounded-lg px-3 py-1.5 text-sm" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobado">Aprobado</option>
          <option value="funding_enviado">Funding Enviado</option>
          <option value="perdido">Perdido</option>
        </select>
      </div>

      {cargando ? <p className="text-sm text-neutral-500">Cargando...</p> : (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Cliente</th>
                <th className="text-left px-4 py-2.5">Agente</th>
                <th className="text-left px-4 py-2.5">Lender</th>
                <th className="text-left px-4 py-2.5">Monto Sol.</th>
                <th className="text-left px-4 py-2.5">Monto Apr.</th>
                <th className="text-left px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {fundings.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-4 text-center text-neutral-600">Sin fundings registrados</td></tr>
              ) : (
                fundings.map((f) => (
                  <tr key={f.id} className="border-t border-neutral-200 hover:bg-neutral-100">
                    <td className="px-4 py-2.5 font-medium text-neutral-900">
                      <Link to={`/bmf/fundings/${f.id}`} className="hover:text-primary-600">{f.clienteNombre}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{f.agenteNombre}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{f.lenderNombre || "—"}</td>
                    <td className="px-4 py-2.5 text-neutral-700">${Math.round(f.montoSolicitado).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{f.montoAprobado ? `$${Math.round(f.montoAprobado).toLocaleString()}` : "—"}</td>
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
      )}
    </div>
  );
}
