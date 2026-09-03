import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";

type Tab = "produccion-agente" | "produccion-lender" | "funding-mensual" | "pipeline" | "llamadas" | "ranking";

export function BmfReportesPage() {
  const [tab, setTab] = useState<Tab>("produccion-agente");
  const [data, setData] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    let result: any[] = [];
    switch (tab) {
      case "produccion-agente": result = await api.bmfProduccionAgente(); break;
      case "produccion-lender": result = await api.bmfProduccionLender() as any[]; break;
      case "funding-mensual": result = await api.bmfFundingMensual(); break;
      case "pipeline": result = await api.bmfPipelineReport(); break;
      case "llamadas": result = await api.bmfReporteLlamadas() as any[]; break;
      case "ranking": result = await api.bmfRanking(); break;
    }
    setData(result);
    setCargando(false);
  }, [tab]);

  useEffect(() => { void cargar(); }, [cargar]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "produccion-agente", label: "Prod. por Agente" },
    { key: "produccion-lender", label: "Prod. por Lender" },
    { key: "funding-mensual", label: "Funding Mensual" },
    { key: "pipeline", label: "Pipeline" },
    { key: "ranking", label: "Ranking" },
    { key: "llamadas", label: "Llamadas" },
  ];

  function renderTabla() {
    if (cargando) return <p className="text-sm text-neutral-500 py-4">Cargando...</p>;
    if (!data.length) return <p className="text-sm text-neutral-400 py-4">Sin datos para este reporte</p>;

    switch (tab) {
      case "produccion-agente":
        return (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 bg-neutral-100 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Agente</th>
                <th className="text-left px-4 py-2.5">Total Fundings</th>
                <th className="text-left px-4 py-2.5">Monto Sol.</th>
                <th className="text-left px-4 py-2.5">Aprobados</th>
                <th className="text-left px-4 py-2.5">Monto Apr.</th>
                <th className="text-left px-4 py-2.5">Conversión</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d: any, i: number) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="px-4 py-2.5 font-medium">{d.agenteNombre}</td>
                  <td className="px-4 py-2.5">{d.totalFundings}</td>
                  <td className="px-4 py-2.5">${Math.round(d.montoSolicitado).toLocaleString()}</td>
                  <td className="px-4 py-2.5">{d.aprobados}</td>
                  <td className="px-4 py-2.5">${Math.round(d.montoAprobado).toLocaleString()}</td>
                  <td className="px-4 py-2.5">{d.conversion}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "funding-mensual":
        const meses = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        return (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 bg-neutral-100 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Mes</th>
                <th className="text-left px-4 py-2.5">Total</th>
                <th className="text-left px-4 py-2.5">Solicitado</th>
                <th className="text-left px-4 py-2.5">Aprobado</th>
                <th className="text-left px-4 py-2.5">Ganados</th>
                <th className="text-left px-4 py-2.5">Perdidos</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d: any, i: number) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="px-4 py-2.5 font-medium">{meses[d.mes]}</td>
                  <td className="px-4 py-2.5">{d.count}</td>
                  <td className="px-4 py-2.5">${Math.round(d.solicitado).toLocaleString()}</td>
                  <td className="px-4 py-2.5">${Math.round(d.aprobado).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-success-600">{d.ganados}</td>
                  <td className="px-4 py-2.5 text-danger-600">{d.perdidos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "pipeline":
        return (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 bg-neutral-100 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Estado</th>
                <th className="text-left px-4 py-2.5">Cantidad</th>
                <th className="text-left px-4 py-2.5">Monto Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d: any, i: number) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="px-4 py-2.5 font-medium capitalize">{d.estado.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2.5">{d.count}</td>
                  <td className="px-4 py-2.5">${Math.round(d.montoTotal).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "ranking":
        return (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 bg-neutral-100 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">#</th>
                <th className="text-left px-4 py-2.5">Agente</th>
                <th className="text-left px-4 py-2.5">Fundings</th>
                <th className="text-left px-4 py-2.5">Monto Sol.</th>
                <th className="text-left px-4 py-2.5">Monto Apr.</th>
                <th className="text-left px-4 py-2.5">Llamadas</th>
                <th className="text-left px-4 py-2.5">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d: any, i: number) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="px-4 py-2.5 font-bold text-neutral-400">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium">{d.agenteNombre}</td>
                  <td className="px-4 py-2.5">{d.totalFundings}</td>
                  <td className="px-4 py-2.5">${Math.round(d.montoSolicitado).toLocaleString()}</td>
                  <td className="px-4 py-2.5">${Math.round(d.montoAprobado).toLocaleString()}</td>
                  <td className="px-4 py-2.5">{d.llamadas}</td>
                  <td className="px-4 py-2.5">{d.conversion}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "llamadas":
        return (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 bg-neutral-100 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Agente</th>
                <th className="text-left px-4 py-2.5">Total</th>
                <th className="text-left px-4 py-2.5">Por Resultado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d: any, i: number) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="px-4 py-2.5 font-medium">{d.agenteNombre}</td>
                  <td className="px-4 py-2.5">{d.total}</td>
                  <td className="px-4 py-2.5 text-xs text-neutral-500">
                    {Object.entries(d.porResultado).map(([k, v]) => `${k}: ${v}`).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      default:
        return null;
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 text-neutral-800 mb-1">Reportes BMF</h1>
      <p className="text-sm text-neutral-500 text-neutral-400 mb-6">Métricas y análisis de la unidad de negocio</p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              tab === t.key
                ? "bg-primary-50 border-primary-300 text-primary-700 bg-primary-500/20 border-primary-500/30 text-primary-600"
                : "border-neutral-200 text-neutral-600 hover:border-primary-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tabla de reporte */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
        {renderTabla()}
      </div>
    </div>
  );
}
