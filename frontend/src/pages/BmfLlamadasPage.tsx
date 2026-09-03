import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../api/AuthContext";
import type { BmfLlamada } from "../types";

const RESULTADOS = ["contestó", "no contestó", "buzón", "volver a llamar", "interesado", "no interesado", "aplicación enviada", "esperando respuesta", "funding aprobado", "funding perdido"];

export function BmfLlamadasPage() {
  const { usuario } = useAuth();
  const [llamadas, setLlamadas] = useState<BmfLlamada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState({ personaId: "", duracionMinutos: "", resultado: "contestó", observaciones: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; porAgente: any[] }>({ total: 0, porAgente: [] });

  const cargar = useCallback(async () => {
    setCargando(true);
    const [llamadasData, statsData] = await Promise.all([
      api.listarBmfLlamadas(),
      api.statsBmfLlamadas(),
    ]);
    setLlamadas(llamadasData);
    setStats(statsData);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function registrar() {
    if (!form.personaId.trim()) { setError("El ID del cliente es obligatorio"); return; }
    setGuardando(true);
    setError(null);
    try {
      await api.registrarBmfLlamada({
        personaId: form.personaId,
        agenteId: usuario!.id,
        duracionMinutos: form.duracionMinutos ? Number(form.duracionMinutos) : undefined,
        resultado: form.resultado,
        observaciones: form.observaciones || undefined,
      });
      setModalAbierto(false);
      setForm({ personaId: "", duracionMinutos: "", resultado: "contestó", observaciones: "" });
      await cargar();
    } catch (e: any) {
      setError(e?.message ?? "Error al registrar llamada");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-1">Llamadas</h1>
          <p className="text-sm text-neutral-500">{stats.total} llamadas registradas</p>
        </div>
        <button onClick={() => setModalAbierto(true)} className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors">
          + Registrar Llamada
        </button>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {stats.porAgente.slice(0, 4).map((a) => (
          <div key={a.agenteId} className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-sm">
            <p className="text-xs text-neutral-500">{a.agenteNombre}</p>
            <p className="font-semibold text-neutral-900">{a.total} llamadas</p>
            <p className="text-[10px] text-neutral-500">✅{a.contesto} ❌{a.noContesto} 📼{a.buzon}</p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-xs text-neutral-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">Fecha</th>
              <th className="text-left px-4 py-2.5">Cliente</th>
              <th className="text-left px-4 py-2.5">Agente</th>
              <th className="text-left px-4 py-2.5">Duración</th>
              <th className="text-left px-4 py-2.5">Resultado</th>
              <th className="text-left px-4 py-2.5">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {llamadas.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-4 text-center text-neutral-600">Sin llamadas registradas</td></tr>
            ) : (
              llamadas.map((l) => (
                <tr key={l.id} className="border-t border-neutral-200">
                  <td className="px-4 py-2.5 text-neutral-500 text-xs">{new Date(l.fecha).toLocaleString("es-MX")}</td>
                  <td className="px-4 py-2.5 font-medium text-neutral-900">
                    <Link to={`/personas/${l.personaId}`} className="hover:text-primary-600">{l.personaNombre}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">{l.agenteNombre}</td>
                  <td className="px-4 py-2.5 text-neutral-500">{l.duracionMinutos ? `${l.duracionMinutos}min` : "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      l.resultado === "contestó" ? "bg-success-100 text-success-700" :
                      l.resultado === "no contestó" || l.resultado === "buzón" ? "bg-neutral-100 text-neutral-600" :
                      l.resultado === "interesado" || l.resultado === "funding aprobado" ? "bg-success-100 text-success-700" :
                      "bg-warning-100 text-warning-700"
                    }`}>{l.resultado}</span>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 text-xs max-w-[200px] truncate">{l.observaciones || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal registrar llamada */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-neutral-900/40 flex items-center justify-center z-50" onClick={() => setModalAbierto(false)}>
          <div className="bg-neutral-50 rounded-xl p-5 border border-neutral-200 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-neutral-900 mb-4">Registrar Llamada</h3>
            {error && <p className="text-xs text-danger-600 mb-3">{error}</p>}
            <div className="flex flex-col gap-3">
              <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="ID del cliente *" value={form.personaId} onChange={(e) => setForm({ ...form, personaId: e.target.value })} />
              <input className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Duración (minutos)" type="number" value={form.duracionMinutos} onChange={(e) => setForm({ ...form, duracionMinutos: e.target.value })} />
              <select className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" value={form.resultado} onChange={(e) => setForm({ ...form, resultado: e.target.value })}>
                {RESULTADOS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <textarea className="border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Observaciones" rows={3} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setModalAbierto(false)} className="border border-neutral-200 px-3 py-1.5 rounded-lg text-sm text-neutral-600">Cancelar</button>
              <button onClick={registrar} disabled={guardando} className="bg-primary-500 text-white px-4 py-1.5 rounded-lg text-sm disabled:bg-primary-100 disabled:text-primary-800">
                {guardando ? "Registrando..." : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
