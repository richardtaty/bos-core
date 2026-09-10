import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type VentaResumen } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { KpiCard } from "../components/KpiCard";
import { VentaDetalleModal } from "../components/VentaDetalleModal";

// Formatea montos como el resto del sistema: enteros, sin decimales ($12,500).
function fmtMonto(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/New_York" });
}

export function VentasDashboardPage() {
  const { usuario } = useAuth();
  const [ventas, setVentas] = useState<VentaResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Venta abierta en el detalle de consulta. Se guarda el registro COMPLETO (no solo el id)
  // para que el modal muestre de inmediato lo que ya trae la fila, por su id real.
  const [ventaAbierta, setVentaAbierta] = useState<VentaResumen | null>(null);

  useEffect(() => {
    const cargar = async () => {
      try {
        const datos = await api.resumenVentas(50);
        setVentas(datos);
      } catch {
        setError("No se pudo cargar el resumen de ventas. Inténtalo de nuevo.");
      } finally {
        setCargando(false);
      }
    };
    void cargar();
  }, []);

  const totalVendido = ventas.reduce((s, v) => s + (v.valor ?? 0), 0);
  const totalCobrado = ventas.reduce((s, v) => s + v.totalPagado, 0);
  const totalPorCobrar = ventas.reduce((s, v) => s + (v.saldoPendiente ?? 0), 0);

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  if (error) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 mb-1">Resumen de Ventas</h1>
        <p className="text-sm text-danger-600 mb-6">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Resumen de Ventas</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Hola, {usuario?.nombre.split(" ")[0]} — lo que se ha vendido, a quién, por cuánto y cuánto se
        ha cobrado. Son ventas ganadas reales, con sus fechas de cierre.
      </p>

      {/* Estado general de las ventas mostradas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard titulo="Ventas ganadas" valor={ventas.length} icono="🏆" color="success" subtitulo="Las más recientes primero" />
        <KpiCard titulo="Total vendido" valor={fmtMonto(totalVendido)} icono="💰" color="primary" subtitulo="Suma del valor de los deals" />
        <KpiCard titulo="Cobrado" valor={fmtMonto(totalCobrado)} icono="✅" color="success" subtitulo="Pagos reales registrados" />
        <KpiCard titulo="Por cobrar" valor={fmtMonto(totalPorCobrar)} icono="⏳" color={totalPorCobrar > 0 ? "warning" : "success"} subtitulo="Saldo pendiente de cobro" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-neutral-700">💸 Ventas ganadas recientes</h3>
        <Link to="/pipelines" className="text-xs text-primary-600 hover:underline">Ver pipelines →</Link>
      </div>

      {ventas.length === 0 ? (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-8 text-center">
          <p className="text-sm text-neutral-500">Aún no hay ventas ganadas registradas. Cuando un deal llegue a una etapa ganada, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Cliente</th>
                <th className="text-left px-4 py-2.5">Qué se vendió</th>
                <th className="text-left px-4 py-2.5">Responsable</th>
                <th className="text-left px-4 py-2.5">Fecha de cierre</th>
                <th className="text-right px-4 py-2.5">Total</th>
                <th className="text-right px-4 py-2.5">Pagado</th>
                <th className="text-right px-4 py-2.5">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => setVentaAbierta(v)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setVentaAbierta(v);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title="Ver el detalle de esta operación"
                  className="border-t border-neutral-200 cursor-pointer hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none"
                >
                  <td className="px-4 py-2.5 font-medium text-neutral-900 whitespace-nowrap">{v.personaNombre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-neutral-700">{v.pipelineNombre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{v.responsableNombre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{fmtFecha(v.fechaVenta)}</td>
                  <td className="px-4 py-2.5 text-neutral-900 text-right whitespace-nowrap">{v.valor != null ? fmtMonto(v.valor) : "—"}</td>
                  <td className="px-4 py-2.5 text-success-600 text-right whitespace-nowrap">{fmtMonto(v.totalPagado)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {v.pagadaCompleta ? (
                      <span className="text-success-600 font-medium">Pagada ✓</span>
                    ) : v.saldoPendiente != null ? (
                      <span className="text-warning-600 font-medium">{fmtMonto(v.saldoPendiente)}</span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-neutral-400 px-4 py-2.5 border-t border-neutral-200">
            Se muestran las últimas {ventas.length} ventas ganadas. "Pagado" y "Saldo" se calculan
            siempre de los cobros reales, nunca se guardan. Haz clic en una venta para consultar el
            detalle de esa operación.
          </p>
        </div>
      )}

      {ventaAbierta && (
        <VentaDetalleModal venta={ventaAbierta} onClose={() => setVentaAbierta(null)} />
      )}
    </div>
  );
}
