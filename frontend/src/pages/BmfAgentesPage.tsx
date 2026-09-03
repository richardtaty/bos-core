import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Usuario } from "../types";

interface AgenteKpi {
  usuarioId: string;
  nombre: string;
  email?: string;
  totalFundings: number;
  montoSolicitado: number;
  montoAprobado: number;
  aprobados: number;
  conversion: number;
  totalLlamadas: number;
  comisionesPendientes: number;
  comisionesTotal: number;
  clientes: number;
}

export function BmfAgentesPage() {
  const [agentes, setAgentes] = useState<Usuario[]>([]);
  const [kpis, setKpis] = useState<Map<string, AgenteKpi>>(new Map());
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    // Cargar todos los usuarios y filtrar los del departamento BMF
    const todos = await api.listarUsuarios();
    // Intentamos cargar departamentos para filtrar
    const departamentos = await api.listarDepartamentos().catch(() => [] as { id: string; nombre: string }[]);
    const bmfDepto = departamentos.find((d) => d.nombre === "Business Market Finders");

    // Si encontramos el depto BMF, filtramos; si no, mostramos todos los ADMIN
    const bmfAgentes = bmfDepto
      ? todos.filter((u) => u.departamentoId === bmfDepto.id)
      : todos.filter((u) => u.rol === "ADMIN" || u.rol === "SUPER_ADMIN");

    setAgentes(bmfAgentes);

    // Cargar KPIs para cada agente
    const mapa = new Map<string, AgenteKpi>();
    await Promise.all(
      bmfAgentes.map(async (a) => {
        try {
          const kpi = await api.bmfKpiAgente(a.id);
          mapa.set(a.id, {
            usuarioId: a.id,
            nombre: a.nombre,
            email: a.email,
            ...(kpi as any),
          });
        } catch {
          mapa.set(a.id, {
            usuarioId: a.id,
            nombre: a.nombre,
            email: a.email,
            totalFundings: 0, montoSolicitado: 0, montoAprobado: 0,
            aprobados: 0, conversion: 0, totalLlamadas: 0,
            comisionesPendientes: 0, comisionesTotal: 0, clientes: 0,
          });
        }
      })
    );
    setKpis(mapa);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-1">Agentes BMF</h1>
          <p className="text-sm text-neutral-500">{agentes.length} agentes en Business Market Finders</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agentes.map((a) => {
          const kpi = kpis.get(a.id);
          return (
            <div key={a.id} className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-medium text-neutral-900">
                    <Link to={`/equipo/${a.id}`} className="hover:text-primary-600">{a.nombre}</Link>
                  </h3>
                  <p className="text-xs text-neutral-500">{a.cargo || a.rol}</p>
                </div>
                <span className={`w-2 h-2 rounded-full ${a.activo !== false ? "bg-success-500" : "bg-neutral-300"}`} title={a.activo !== false ? "Activo" : "Inactivo"} />
              </div>

              {kpi ? (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[10px] text-neutral-500 uppercase">Fundings</p>
                    <p className="font-semibold text-neutral-800">{kpi.totalFundings}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500 uppercase">Conversión</p>
                    <p className="font-semibold text-neutral-800">{kpi.conversion}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500 uppercase">Monto Sol.</p>
                    <p className="font-semibold text-neutral-800">${Math.round(kpi.montoSolicitado).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500 uppercase">Monto Apr.</p>
                    <p className="font-semibold text-success-600">${Math.round(kpi.montoAprobado).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500 uppercase">Llamadas</p>
                    <p className="font-semibold text-neutral-800">{kpi.totalLlamadas}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500 uppercase">Clientes</p>
                    <p className="font-semibold text-neutral-800">{kpi.clientes}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-neutral-500 uppercase">Comisiones</p>
                    <p className="text-xs text-neutral-600">
                      Total: ${Math.round(kpi.comisionesTotal).toLocaleString()} | Pendiente: {kpi.comisionesPendientes}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-neutral-500">Sin datos de actividad</p>
              )}
            </div>
          );
        })}
      </div>

      {agentes.length === 0 && (
        <p className="text-sm text-neutral-600 text-center py-8">No se encontraron agentes en el departamento BMF. Agrega usuarios al departamento "Business Market Finders" desde la sección de Equipo.</p>
      )}
    </div>
  );
}
