import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { BmfFunding } from "../types";

export function BmfFundingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "SUPER_ADMIN" || usuario?.rol === "ADMIN";
  const [data, setData] = useState<BmfFunding | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.obtenerBmfFunding(id).then((d) => {
      setData(d);
      setCargando(false);
    });
  }, [id]);

  async function actualizarEstado(estado: string) {
    if (!id || !data) return;
    setGuardando(true);
    await api.actualizarBmfFunding(id, { estado });
    const updated = await api.obtenerBmfFunding(id);
    setData(updated);
    setGuardando(false);
  }

  if (cargando || !data) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const estados = ["pendiente", "aprobado", "funding_enviado", "perdido"];

  return (
    <div>
      <Link to="/bmf/fundings" className="text-xs text-primary-600 hover:underline mb-4 inline-block">← Volver a Fundings</Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
          <h2 className="font-semibold text-neutral-900 mb-4">Detalle del Funding</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-neutral-600 text-xs">Cliente</dt>
              <dd className="font-medium text-neutral-900">
                <Link to={`/personas/${data.clienteId}`} className="hover:text-primary-600">{data.clienteNombre}</Link>
              </dd>
            </div>
            <div>
              <dt className="text-neutral-600 text-xs">Agente</dt>
              <dd className="text-neutral-700">{data.agenteNombre}</dd>
            </div>
            <div>
              <dt className="text-neutral-600 text-xs">Lender</dt>
              <dd className="text-neutral-700">{data.lenderNombre || "No asignado"}</dd>
            </div>
            <div>
              <dt className="text-neutral-600 text-xs">Monto Solicitado</dt>
              <dd className="font-medium text-neutral-900">${Math.round(data.montoSolicitado).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-neutral-600 text-xs">Monto Aprobado</dt>
              <dd className="text-neutral-700">{data.montoAprobado ? `$${Math.round(data.montoAprobado).toLocaleString()}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-neutral-600 text-xs">Comisión</dt>
              <dd className="text-neutral-700">{data.comisionPorcentaje ? `${data.comisionPorcentaje}%` : "—"} {data.comisionMonto ? `($${Math.round(data.comisionMonto).toLocaleString()})` : ""}</dd>
            </div>
          </dl>

          {/* Estado */}
          {esAdmin && (
            <div className="mt-6 pt-4 border-t border-neutral-200">
              <h4 className="text-xs font-medium text-neutral-500 mb-2 uppercase">Cambiar Estado</h4>
              <div className="flex flex-wrap gap-2">
                {estados.map((e) => (
                  <button
                    key={e}
                    disabled={guardando || e === data.estado}
                    onClick={() => actualizarEstado(e)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      e === data.estado
                        ? "bg-primary-100 text-primary-700"
                        : "border-neutral-200 text-neutral-600 hover:border-primary-300 hover:border-primary-500/30"
                    } disabled:opacity-50`}
                  >
                    {e.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          {/* Timeline */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 mb-4">
            <h3 className="text-sm font-medium text-neutral-700 mb-3">Fechas</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-neutral-600">Creación</span><span className="text-neutral-700">{new Date(data.fechaCreacion).toLocaleDateString("es-MX")}</span></div>
              {data.fechaAprobacion && <div className="flex justify-between"><span className="text-neutral-600">Aprobación</span><span className="text-neutral-700">{new Date(data.fechaAprobacion).toLocaleDateString("es-MX")}</span></div>}
              {data.fechaFunding && <div className="flex justify-between"><span className="text-neutral-600">Funding</span><span className="text-neutral-700">{new Date(data.fechaFunding).toLocaleDateString("es-MX")}</span></div>}
            </div>
          </div>

          {/* Comisiones */}
          {data.comisiones && data.comisiones.length > 0 && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 mb-4">
              <h3 className="text-sm font-medium text-neutral-700 mb-3">Comisiones</h3>
              {data.comisiones.map((c) => (
                <div key={c.id} className="flex justify-between items-center py-1.5 border-t border-neutral-200 first:border-0 text-sm">
                  <span className="text-neutral-700">{c.agenteNombre}</span>
                  <span className="font-medium text-neutral-900">${Math.round(c.monto).toLocaleString()}</span>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${c.estado === "pagada" ? "bg-success-100 text-success-700" : "bg-warning-100 text-warning-700"}`}>{c.estado}</span>
                </div>
              ))}
            </div>
          )}

          {/* Llamadas recientes */}
          {data.llamadas && data.llamadas.length > 0 && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
              <h3 className="text-sm font-medium text-neutral-700 mb-3">Llamadas recientes</h3>
              {data.llamadas.slice(0, 5).map((l) => (
                <div key={l.id} className="flex justify-between items-center py-1.5 border-t border-neutral-200 first:border-0 text-sm">
                  <span className="text-neutral-600 text-xs">{new Date(l.fecha).toLocaleString("es-MX")}</span>
                  <span className="text-neutral-700">{l.agenteNombre}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    l.resultado === "contestó" ? "bg-success-100 text-success-700" :
                    l.resultado === "no contestó" ? "bg-warning-100 text-warning-700" :
                    "bg-neutral-100 text-neutral-600"
                  }`}>{l.resultado}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
