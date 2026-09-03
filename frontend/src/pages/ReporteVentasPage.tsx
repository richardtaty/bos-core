import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";

interface Abono {
  id: string;
  monto: number;
  nota: string | null;
  fecha: string;
  autorNombre: string;
  personaNombre: string | null;
  pipelineNombre: string;
}

interface VentasPorDia {
  dias: { fecha: string; total: number; porUsuario: { usuarioId: string; nombre: string; total: number }[] }[];
  totalGeneral: number;
  cantidadAbonos: number;
}

function hace7Dias(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hoyStr(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
}

function fmtFechaCorta(fechaISO: string): string {
  return new Date(fechaISO + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" });
}

function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
}

export function ReporteVentasPage() {
  const { usuario } = useAuth();
  const esSuperAdmin = usuario?.rol === "SUPER_ADMIN";
  // ADMIN: solo últimos 7 días. SUPER_ADMIN: sin restricción.
  const [desde, setDesde] = useState(esSuperAdmin ? hace7Dias() : hace7Dias());
  const [hasta, setHasta] = useState(hoyStr());
  const [resumen, setResumen] = useState<VentasPorDia | null>(null);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [cargando, setCargando] = useState(true);
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [r, a] = await Promise.all([
      api.ventasPorDia({ desde, hasta }),
      api.listarPagosDetallado({ desde, hasta }),
    ]);
    setResumen(r);
    setAbonos(a);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abonosDelDia = (fecha: string) =>
    abonos.filter((a) => {
      const d = new Date(a.fecha);
      const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return f === fecha;
    });

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 text-neutral-800 mb-1">Reporte de ventas</h1>
      <p className="text-sm text-neutral-500 text-neutral-400 mb-4">
        {esSuperAdmin ? "Por día y por agente, con cada abono individual" : "Tus ventas por día, con cada abono individual"}
      </p>

      {esSuperAdmin && (
        <div className="flex items-end gap-3 mb-6">
          <div>
            <label className="text-xs text-neutral-600 block mb-1">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="border border-neutral-200 bg-neutral-50 text-neutral-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-neutral-600 text-neutral-400 block mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="border border-neutral-200 bg-neutral-50 text-neutral-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
        </div>
      )}
      {!esSuperAdmin && (
        <p className="text-xs text-neutral-500 text-neutral-400 mb-4">Últimos 7 días</p>
      )}

      {cargando || !resumen ? (
        <p className="text-sm text-neutral-500 text-neutral-400">Cargando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
            <div className="bg-success-50 bg-success-500/10 rounded-xl p-4">
              <p className="text-xs text-success-700 text-success-600 mb-1">Total del período</p>
              <p className="text-2xl font-semibold text-success-700 text-success-600">${resumen.totalGeneral.toLocaleString()}</p>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
              <p className="text-xs text-neutral-500 text-neutral-400 mb-1">Cantidad de abonos</p>
              <p className="text-2xl font-semibold text-neutral-900 text-neutral-800">{resumen.cantidadAbonos}</p>
            </div>
          </div>

          {resumen.dias.length === 0 && <p className="text-sm text-neutral-400 text-neutral-500">Sin ventas en este rango de fechas.</p>}

          <div className="flex flex-col gap-2">
            {resumen.dias.map((dia) => (
              <div key={dia.fecha} className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setDiaAbierto(diaAbierto === dia.fecha ? null : dia.fecha)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 hover:bg-neutral-100"
                >
                  <span className="text-sm font-medium text-neutral-900 text-neutral-800 capitalize">{fmtFechaCorta(dia.fecha)}</span>
                  <span className="text-sm font-semibold text-success-700 text-success-600">${dia.total.toLocaleString()}</span>
                </button>

                {diaAbierto === dia.fecha && (
                  <div className="border-t border-neutral-100 border-neutral-200 px-4 py-3">
                    {esSuperAdmin && (
                      <div className="mb-3">
                        <p className="text-xs text-neutral-500 text-neutral-400 mb-1.5">Por agente</p>
                        <div className="flex flex-col gap-1">
                          {dia.porUsuario.map((u) => (
                            <div key={u.usuarioId} className="flex justify-between text-sm">
                              <span className="text-neutral-700 text-neutral-300">{u.nombre}</span>
                              <span className="font-medium text-neutral-900 text-neutral-800">${u.total.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-neutral-500 text-neutral-400 mb-1.5">Abonos de este día</p>
                    <div className="flex flex-col gap-1.5">
                      {abonosDelDia(dia.fecha).map((a) => (
                        <div key={a.id} className="flex items-center justify-between text-xs bg-neutral-50 bg-neutral-100 rounded-lg px-3 py-2">
                          <div>
                            <p className="text-neutral-800 text-neutral-300 font-medium">{a.personaNombre ?? "Sin contacto"} · {a.pipelineNombre}</p>
                            <p className="text-neutral-500 text-neutral-400">{a.nota || "sin nota"} · {fmtFechaHora(a.fecha)}{esSuperAdmin ? ` · ${a.autorNombre}` : ""}</p>
                          </div>
                          <span className="font-semibold text-success-700 shrink-0 ml-3">${a.monto.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
