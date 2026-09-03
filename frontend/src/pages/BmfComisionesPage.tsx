import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { BmfComision } from "../types";

export function BmfComisionesPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "SUPER_ADMIN" || usuario?.rol === "ADMIN";
  const [comisiones, setComisiones] = useState<BmfComision[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState({ agenteId: "", fundingId: "", monto: "", porcentaje: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const params: Record<string, string> = {};
    if (filtroEstado) params.estado = filtroEstado;
    const data = await api.listarBmfComisiones(params);
    setComisiones(data);
    setCargando(false);
  }, [filtroEstado]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function pagar(id: string) {
    await api.pagarBmfComision(id);
    await cargar();
  }

  async function crear() {
    if (!form.agenteId.trim() || !form.fundingId.trim() || !form.monto.trim()) {
      setError("Todos los campos son obligatorios"); return;
    }
    setGuardando(true);
    setError(null);
    try {
      await api.crearBmfComision({
        agenteId: form.agenteId,
        fundingId: form.fundingId,
        monto: Number(form.monto),
        porcentaje: Number(form.porcentaje) || 0,
      });
      setModalAbierto(false);
      setForm({ agenteId: "", fundingId: "", monto: "", porcentaje: "" });
      await cargar();
    } catch (e: any) {
      setError(e?.message ?? "Error al crear comisión");
    } finally {
      setGuardando(false);
    }
  }

  const totalGenerado = comisiones.reduce((s, c) => s + (c.monto ?? 0), 0);
  const totalPendiente = comisiones.filter((c) => c.estado === "pendiente").reduce((s, c) => s + (c.monto ?? 0), 0);
  const totalPagado = comisiones.filter((c) => c.estado === "pagada").reduce((s, c) => s + (c.monto ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 text-neutral-800 mb-1">Comisiones</h1>
          <p className="text-sm text-neutral-500 text-neutral-400">
            Total: ${Math.round(totalGenerado).toLocaleString()} — Pendiente: ${Math.round(totalPendiente).toLocaleString()} — Pagado: ${Math.round(totalPagado).toLocaleString()}
          </p>
        </div>
        {esAdmin && (
          <button onClick={() => setModalAbierto(true)} className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors">
            + Nueva Comisión
          </button>
        )}
      </div>

      <div className="mb-4">
        <select className="border border-neutral-200 rounded-lg px-3 py-1.5 text-sm" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="pagada">Pagada</option>
        </select>
      </div>

      {cargando ? <p className="text-sm text-neutral-500">Cargando...</p> : (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 bg-neutral-100 text-xs text-neutral-500 text-neutral-400 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Agente</th>
                <th className="text-left px-4 py-2.5">Cliente</th>
                <th className="text-left px-4 py-2.5">Monto</th>
                <th className="text-left px-4 py-2.5">%</th>
                <th className="text-left px-4 py-2.5">Estado</th>
                <th className="text-left px-4 py-2.5">Fecha Pago</th>
                {esAdmin && <th className="text-left px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody>
              {comisiones.length === 0 ? (
                <tr><td colSpan={esAdmin ? 7 : 6} className="px-4 py-4 text-center text-neutral-400">Sin comisiones registradas</td></tr>
              ) : (
                comisiones.map((c) => (
                  <tr key={c.id} className="border-t border-neutral-100 border-neutral-200">
                    <td className="px-4 py-2.5 font-medium text-neutral-900 text-neutral-800">{c.agenteNombre}</td>
                    <td className="px-4 py-2.5 text-neutral-600 text-neutral-400">{c.clienteNombre || c.fundingId.slice(0, 8)}</td>
                    <td className="px-4 py-2.5 text-neutral-700 text-neutral-300 font-medium">${Math.round(c.monto).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-neutral-500 text-neutral-400">{c.porcentaje}%</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${c.estado === "pagada" ? "bg-success-100 text-success-700" : "bg-warning-100 text-warning-700"}`}>
                        {c.estado}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500 text-neutral-400 text-xs">{c.fechaPago ? new Date(c.fechaPago).toLocaleDateString("es-MX") : "—"}</td>
                    {esAdmin && (
                      <td className="px-4 py-2.5">
                        {c.estado === "pendiente" && (
                          <button onClick={() => pagar(c.id)} className="text-xs text-success-600 text-success-600 hover:underline">Marcar pagada</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal crear comisión */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-neutral-900/40 flex items-center justify-center z-50" onClick={() => setModalAbierto(false)}>
          <div className="bg-neutral-50 rounded-xl p-5 border border-neutral-200 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-neutral-900 text-neutral-800 mb-4">Nueva Comisión</h3>
            {error && <p className="text-xs text-danger-600 mb-3">{error}</p>}
            <div className="flex flex-col gap-3">
              <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="ID del Agente *" value={form.agenteId} onChange={(e) => setForm({ ...form, agenteId: e.target.value })} />
              <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="ID del Funding *" value={form.fundingId} onChange={(e) => setForm({ ...form, fundingId: e.target.value })} />
              <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Monto *" type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
              <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Porcentaje (%)" type="number" value={form.porcentaje} onChange={(e) => setForm({ ...form, porcentaje: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setModalAbierto(false)} className="border border-neutral-200 px-3 py-1.5 rounded-lg text-sm text-neutral-600">Cancelar</button>
              <button onClick={crear} disabled={guardando} className="bg-primary-500 text-white px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">
                {guardando ? "Creando..." : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
