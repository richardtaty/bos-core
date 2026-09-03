import { useState } from "react";
import { api } from "../api/client";
import type { Oferta } from "../types";

const CATEGORIAS = ["Nómina", "Aviones", "Hoteles", "Transportes", "Comidas", "Otro"];

interface Props {
  onClose: () => void;
  onSaved: () => void;
  ofertas: Oferta[];
}

export function EgresoModal({ onClose, onSaved, ofertas }: Props) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [ofertaId, setOfertaId] = useState("");
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!monto || parseFloat(monto) <= 0) { setError("El monto debe ser mayor a $0"); return; }
    setGuardando(true);
    try {
      await api.registrarEgreso({
        fecha,
        categoria,
        monto: parseFloat(monto),
        ofertaId: ofertaId || undefined,
        nota: nota || undefined,
      });
      onSaved();
    } catch (err: any) {
      setError(err.message || "Error al registrar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <form onSubmit={onSubmit} className="bg-neutral-50 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 border border-neutral-200 animate-enter" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900">Registrar egreso</h2>
          <button type="button" onClick={onClose} className="text-neutral-600 hover:text-neutral-300 text-xl leading-none">&times;</button>
        </div>

        {error && <p className="text-danger-600 text-sm mb-3 bg-danger-500/10 rounded-lg px-3 py-2">{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-neutral-600 mb-1">Categoría</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-2 text-sm">
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-neutral-600 mb-1">Evento / Línea (opcional)</label>
            <select value={ofertaId} onChange={(e) => setOfertaId(e.target.value)} className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-2 text-sm">
              <option value="">— General (sin atribuir) —</option>
              {ofertas.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-neutral-600 mb-1">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-2 text-sm" required />
          </div>

          <div>
            <label className="block text-xs text-neutral-600 mb-1">Monto (USD)</label>
            <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} min="0" step="0.01" placeholder="0.00" className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-2 text-sm font-mono" required />
          </div>

          <div>
            <label className="block text-xs text-neutral-600 mb-1">Nota (opcional)</label>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="w-full border border-neutral-200 bg-transparent text-neutral-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">Cancelar</button>
          <button type="submit" disabled={guardando} className="px-5 py-2 text-sm font-medium bg-danger-500 text-white rounded-lg hover:bg-danger-600 disabled:opacity-50">
            {guardando ? "Guardando..." : "Registrar egreso"}
          </button>
        </div>
      </form>
    </div>
  );
}
