import { FormEvent, useState } from "react";
import { api, ApiError } from "../api/client";

export function CambiarPasswordModal({ onClose }: { onClose: () => void }) {
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (passwordNueva !== confirmar) {
      setError("Las contraseñas nuevas no coinciden");
      return;
    }
    setEnviando(true);
    try {
      await api.cambiarPassword(passwordActual, passwordNueva);
      setOk(true);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.payload) : "Error al cambiar la contraseña");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form onSubmit={onSubmit} className="bg-neutral-50 rounded-xl shadow-lg w-full max-w-sm p-6 border border-neutral-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900">Cambiar contraseña</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-600">✕</button>
        </div>

        {ok ? (
          <>
            <p className="text-sm text-success-700 bg-success-500/10 rounded-lg p-3 mb-4">Contraseña actualizada correctamente.</p>
            <button type="button" onClick={onClose} className="w-full text-sm bg-primary-500 text-white py-2 rounded-lg font-medium">Listo</button>
          </>
        ) : (
          <>
            <label className="text-xs text-neutral-600">Contraseña actual</label>
            <input value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)} type="password" required className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-1.5 text-sm mb-3" />
            <label className="text-xs text-neutral-600">Contraseña nueva</label>
            <input value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)} type="password" required className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-1.5 text-sm mb-3" />
            <label className="text-xs text-neutral-600">Confirmar contraseña nueva</label>
            <input value={confirmar} onChange={(e) => setConfirmar(e.target.value)} type="password" required className="w-full border border-neutral-200 bg-transparent text-neutral-800 rounded-lg px-3 py-1.5 text-sm mb-3" />
            {error && <p className="text-xs text-danger-600 mb-3">{error}</p>}
            <button disabled={enviando} className="w-full text-sm bg-primary-500 text-white py-2 rounded-lg font-medium disabled:bg-primary-100 disabled:text-primary-800">
              {enviando ? "Guardando..." : "Actualizar contraseña"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
