import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { BmfLender } from "../types";

export function BmfLendersPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "SUPER_ADMIN" || usuario?.rol === "ADMIN";
  const [lenders, setLenders] = useState<BmfLender[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: "", contacto: "", email: "", telefono: "", productos: "", montoMinimo: "", montoMaximo: "", tiempoRespuestaDias: "", estado: "activo", observaciones: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await api.listarBmfLenders();
    setLenders(data);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  function abrirNuevo() {
    setForm({ nombre: "", contacto: "", email: "", telefono: "", productos: "", montoMinimo: "", montoMaximo: "", tiempoRespuestaDias: "", estado: "activo", observaciones: "" });
    setEditandoId(null);
    setError(null);
    setModalAbierto(true);
  }

  function abrirEditar(l: BmfLender) {
    setForm({
      nombre: l.nombre, contacto: l.contacto ?? "", email: l.email ?? "", telefono: l.telefono ?? "",
      productos: l.productos ?? "", montoMinimo: l.montoMinimo?.toString() ?? "", montoMaximo: l.montoMaximo?.toString() ?? "",
      tiempoRespuestaDias: l.tiempoRespuestaDias?.toString() ?? "", estado: l.estado, observaciones: l.observaciones ?? "",
    });
    setEditandoId(l.id);
    setError(null);
    setModalAbierto(true);
  }

  async function guardar() {
    if (!form.nombre.trim()) { setError("El nombre es obligatorio"); return; }
    setGuardando(true);
    setError(null);
    try {
      const data: Record<string, unknown> = {
        nombre: form.nombre,
        contacto: form.contacto || undefined,
        email: form.email || undefined,
        telefono: form.telefono || undefined,
        productos: form.productos || undefined,
        montoMinimo: form.montoMinimo ? Number(form.montoMinimo) : undefined,
        montoMaximo: form.montoMaximo ? Number(form.montoMaximo) : undefined,
        tiempoRespuestaDias: form.tiempoRespuestaDias ? Number(form.tiempoRespuestaDias) : undefined,
        estado: form.estado,
        observaciones: form.observaciones || undefined,
      };
      if (editandoId) {
        await api.actualizarBmfLender(editandoId, data);
      } else {
        await api.crearBmfLender({ nombre: form.nombre, ...data } as any);
      }
      setModalAbierto(false);
      await cargar();
    } catch (e: any) {
      setError(e?.message ?? "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-1">Lenders</h1>
          <p className="text-sm text-neutral-500">Entidades financieras — {lenders.length} registradas</p>
        </div>
        {esAdmin && (
          <button onClick={abrirNuevo} className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors">
            + Nuevo Lender
          </button>
        )}
      </div>

      <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-xs text-neutral-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">Nombre</th>
              <th className="text-left px-4 py-2.5">Contacto</th>
              <th className="text-left px-4 py-2.5">Email</th>
              <th className="text-left px-4 py-2.5">Productos</th>
              <th className="text-left px-4 py-2.5">Rango</th>
              <th className="text-left px-4 py-2.5">Estado</th>
              {esAdmin && <th className="text-left px-4 py-2.5"></th>}
            </tr>
          </thead>
          <tbody>
            {lenders.length === 0 ? (
              <tr><td colSpan={esAdmin ? 7 : 6} className="px-4 py-4 text-center text-neutral-600">Sin lenders registrados</td></tr>
            ) : (
              lenders.map((l) => (
                <tr key={l.id} className="border-t border-neutral-200 hover:bg-neutral-100">
                  <td className="px-4 py-2.5 font-medium text-neutral-900">{l.nombre}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{l.contacto || "—"}</td>
                  <td className="px-4 py-2.5 text-neutral-500 text-xs">{l.email || "—"}</td>
                  <td className="px-4 py-2.5 text-neutral-600 text-xs">{l.productos || "—"}</td>
                  <td className="px-4 py-2.5 text-neutral-600 text-xs">
                    {l.montoMinimo ? `$${l.montoMinimo.toLocaleString()}` : "—"} – {l.montoMaximo ? `$${l.montoMaximo.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${l.estado === "activo" ? "bg-success-100 text-success-700" : "bg-neutral-100 text-neutral-600"}`}>
                      {l.estado}
                    </span>
                  </td>
                  {esAdmin && (
                    <td className="px-4 py-2.5">
                      <button onClick={() => abrirEditar(l)} className="text-xs text-primary-600 hover:underline">Editar</button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-neutral-900/40 flex items-center justify-center z-50" onClick={() => setModalAbierto(false)}>
          <div className="bg-neutral-50 rounded-xl p-5 border border-neutral-200 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-neutral-900 mb-4">{editandoId ? "Editar Lender" : "Nuevo Lender"}</h3>
            {error && <p className="text-xs text-danger-600 mb-3">{error}</p>}
            <div className="flex flex-col gap-3">
              <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Nombre *" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Contacto" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
                <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Productos (ej: MCA, Term Loan)" value={form.productos} onChange={(e) => setForm({ ...form, productos: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Monto mínimo" type="number" value={form.montoMinimo} onChange={(e) => setForm({ ...form, montoMinimo: e.target.value })} />
                <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Monto máximo" type="number" value={form.montoMaximo} onChange={(e) => setForm({ ...form, montoMaximo: e.target.value })} />
              </div>
              <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Tiempo de respuesta (días)" type="number" value={form.tiempoRespuestaDias} onChange={(e) => setForm({ ...form, tiempoRespuestaDias: e.target.value })} />
              <select className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
              <textarea className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Observaciones" rows={2} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setModalAbierto(false)} className="border border-neutral-200 px-3 py-1.5 rounded-lg text-sm text-neutral-600">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="bg-primary-500 text-white px-4 py-1.5 rounded-lg text-sm disabled:bg-primary-100 disabled:text-primary-800">
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
