import { FormEvent, useState } from "react";
import { api, ApiError } from "../api/client";

const TIPOS = ["Llamada", "WhatsApp", "Email", "Reunion", "Nota"];

export function RegistrarInteraccionForm({ personaId, onDone }: { personaId: string; onDone: () => void }) {
  const [tipo, setTipo] = useState("Llamada");
  const [nota, setNota] = useState("");
  const [proximoSeguimiento, setProximoSeguimiento] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.registrarInteraccion(personaId, {
        tipo,
        nota,
        proximoSeguimiento: new Date(proximoSeguimiento).toISOString(),
      });
      setNota("");
      setProximoSeguimiento("");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? "Nota y próximo seguimiento son obligatorios" : "Error al guardar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="border border-neutral-200 rounded-lg px-2 py-1.5 text-sm">
          {TIPOS.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input
          type="datetime-local"
          value={proximoSeguimiento}
          onChange={(e) => setProximoSeguimiento(e.target.value)}
          required
          className="border border-neutral-200 rounded-lg px-2 py-1.5 text-sm"
        />
      </div>
      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota de la interacción *"
        required
        className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-sm mb-2"
      />
      {error && <p className="text-[11px] text-danger-600 mb-2">{error}</p>}
      <button disabled={enviando} className="text-xs bg-primary-500 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50">
        {enviando ? "Guardando..." : "Registrar interacción"}
      </button>
    </form>
  );
}
