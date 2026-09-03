import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { BmfSolicitud } from "../types";

// Solicitudes de financiamiento digital (landing/chat BMF). Es la lista cruda de
// aplicaciones que llegan por `/api/public/funding-aplicar` o por el asistente Jennifer.
const fmtFecha = (v: string) => new Date(v).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
const fmtMonto = (v: number | null) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`);

const ESTADO_DOCS: Record<string, string> = {
  pendiente: "Sin documentos",
  parcial: "Parcial",
  completo: "Completo",
};

export function BmfSolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<BmfSolicitud[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await api.listarBmfSolicitudes();
    setSolicitudes(data);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-800 mb-1">Solicitudes</h1>
        <p className="text-sm text-neutral-500">Aplicaciones de financiamiento digital — {solicitudes.length} registradas</p>
      </div>

      {cargando ? <p className="text-sm text-neutral-500">Cargando...</p> : (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Aplicación</th>
                <th className="text-left px-4 py-2.5">Fecha</th>
                <th className="text-left px-4 py-2.5">Empresa</th>
                <th className="text-left px-4 py-2.5">Dueño</th>
                <th className="text-left px-4 py-2.5">Monto</th>
                <th className="text-left px-4 py-2.5">Industria</th>
                <th className="text-left px-4 py-2.5">Ubicación</th>
                <th className="text-left px-4 py-2.5">Etapa</th>
                <th className="text-left px-4 py-2.5">Documentos</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-neutral-400">Sin solicitudes registradas</td></tr>
              ) : (
                solicitudes.map((s) => (
                  <tr key={s.id} className="border-t border-neutral-200 hover:bg-neutral-100">
                    <td className="px-4 py-2.5 font-semibold text-neutral-800">
                      <Link to={`/bmf/solicitudes/${s.id}`} className="hover:text-primary-600">{s.applicationId}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{fmtFecha(s.createdAt)}</td>
                    <td className="px-4 py-2.5 text-neutral-800">{s.empresaLegal ?? "—"}</td>
                    <td className="px-4 py-2.5 text-neutral-600">
                      {[s.propietarioNombre, s.propietarioApellido].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-700 font-medium">{fmtMonto(s.montoSolicitado)}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{s.industria ?? "—"}</td>
                    <td className="px-4 py-2.5 text-neutral-600">
                      {[s.empresaCiudad, s.empresaEstado].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{s.etapaNombre ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        s.estadoDocumentos === "completo" ? "bg-success-100 text-success-700" :
                        s.estadoDocumentos === "parcial" ? "bg-warning-100 text-warning-700" :
                        "bg-neutral-100 text-neutral-600"
                      }`}>{ESTADO_DOCS[s.estadoDocumentos] ?? s.estadoDocumentos}</span>
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
