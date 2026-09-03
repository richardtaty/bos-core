import { useState, useEffect, useRef } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api/client";

export function VerificarPinPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [intentos, setIntentos] = useState(0);
  const [bloqueado, setBloqueado] = useState(false);
  const [mostrarPin, setMostrarPin] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);
  const [codigoRecuperacion, setCodigoRecuperacion] = useState("");
  const [modoRecuperacion, setModoRecuperacion] = useState(false);

  // Leer tempToken de localStorage (guardado por AuthContext durante login)
  const tempToken = localStorage.getItem("bos_temp_token");

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  if (!tempToken) {
    return <Navigate to="/login" replace />;
  }

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const nuevo = [...pin];
    nuevo[index] = value.slice(-1);
    setPin(nuevo);
    // Auto-avanzar al siguiente input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
    // Auto-verificar si los 4 dígitos están completos
    if (index === 3 && value && nuevo.every((d) => d.length === 1)) {
      setTimeout(() => verificarPin(nuevo.join("")), 200);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verificarPin = async (codigo: string) => {
    if (codigo.length < 4) return;
    setVerificando(true);
    setError(null);
    try {
      const res = await api.verifyPin(codigo, localStorage.getItem("bos_temp_token")!);
      // Guardar token completo
      localStorage.removeItem("bos_temp_token");
      localStorage.setItem("bos_token", res.token);
      localStorage.setItem("bos_usuario", JSON.stringify({
        ...res.usuario,
        departamentoIds: (res.usuario as any).departamentoIds ?? (res.usuario.departamentoId ? [res.usuario.departamentoId] : []),
      }));

      // Guardar device token si aplica
      if (res.deviceToken) {
        localStorage.setItem("bos_device", res.deviceToken);
      }

      // Forzar recarga para que AuthContext detecte el token completo
      window.location.href = "/ceo";
    } catch (err: any) {
      const msg = typeof err === "string" ? err : (err?.payload ?? err?.message ?? "PIN incorrecto");
      setError(msg);
      setIntentos((i) => i + 1);
      setPin(["", "", "", ""]);
      inputRefs.current[0]?.focus();
      if (msg.includes("Demasiados") || msg.includes("15 minutos")) {
        setBloqueado(true);
      }
    } finally {
      setVerificando(false);
    }
  };

  const usarCodigoRecuperacion = async () => {
    if (!codigoRecuperacion.trim()) return;
    setVerificando(true);
    setError(null);
    try {
      const res = await api.pinRecovery(codigoRecuperacion.trim(), tempToken);
      localStorage.removeItem("bos_temp_token");
      localStorage.setItem("bos_token", res.token);
      localStorage.setItem("bos_usuario", JSON.stringify({
        ...res.usuario,
        departamentoIds: (res.usuario as any).departamentoIds ?? (res.usuario.departamentoId ? [res.usuario.departamentoId] : []),
      }));
      window.location.href = "/ceo";
    } catch (err: any) {
      setError(typeof err === "string" ? err : (err?.payload ?? "Código inválido"));
    } finally {
      setVerificando(false);
    }
  };

  const cerrarSesion = () => {
    localStorage.removeItem("bos_temp_token");
    localStorage.removeItem("bos_usuario");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="bg-neutral-50 rounded-2xl shadow-xl border border-neutral-200 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto mb-3 text-xl">
            🔐
          </div>
          <h1 className="text-lg font-semibold text-neutral-900 mb-1">
            Verificación de identidad
          </h1>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Por seguridad, introduce tu PIN personal para confirmar que realmente eres tú quien está accediendo a BOS.
          </p>
        </div>

        {bloqueado ? (
          <div className="text-center">
            <p className="text-sm text-red-600 font-medium mb-4">
              🚫 Demasiados intentos fallidos
            </p>
            <p className="text-xs text-neutral-500 mb-4">
              Debes esperar 15 minutos antes de intentar de nuevo, o usar un código de recuperación.
            </p>
            {!modoRecuperacion ? (
              <button
                onClick={() => setModoRecuperacion(true)}
                className="text-sm text-primary-600 hover:underline"
              >
                Usar código de recuperación
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  value={codigoRecuperacion}
                  onChange={(e) => setCodigoRecuperacion(e.target.value)}
                  placeholder="Código de recuperación"
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-center tracking-widest"
                />
                <button
                  onClick={usarCodigoRecuperacion}
                  disabled={verificando}
                  className="w-full text-sm bg-primary-600 text-white py-2 rounded-lg font-medium disabled:bg-primary-100 disabled:text-primary-800"
                >
                  {verificando ? "Verificando..." : "Usar código"}
                </button>
              </div>
            )}
            <button onClick={cerrarSesion} className="block mx-auto mt-4 text-xs text-neutral-500 hover:underline">
              Volver al inicio de sesión
            </button>
          </div>
        ) : modoRecuperacion ? (
          <div className="space-y-3">
            <p className="text-xs text-neutral-500 text-center">
              Ingresa uno de tus códigos de recuperación de un solo uso.
            </p>
            <input
              value={codigoRecuperacion}
              onChange={(e) => setCodigoRecuperacion(e.target.value)}
              placeholder="Ej: 48291057"
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-center tracking-widest"
              autoFocus
            />
            <button
              onClick={usarCodigoRecuperacion}
              disabled={verificando || !codigoRecuperacion.trim()}
              className="w-full text-sm bg-primary-600 text-white py-2 rounded-lg font-medium disabled:bg-primary-100 disabled:text-primary-800"
            >
              {verificando ? "Verificando..." : "Verificar código"}
            </button>
            <button onClick={() => { setModoRecuperacion(false); setError(null); }} className="block mx-auto text-xs text-neutral-500 hover:underline">
              Volver al PIN
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-center gap-3 mb-4">
              {pin.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type={mostrarPin ? "text" : "password"}
                  value={d}
                  onChange={(e) => handlePinChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  maxLength={1}
                  className="w-12 h-14 text-center text-xl font-bold border border-neutral-200 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  disabled={verificando}
                  autoComplete="off"
                  inputMode="numeric"
                />
              ))}
            </div>

            {error && (
              <p className="text-xs text-red-600 text-center mb-3">{error}</p>
            )}

            {intentos > 0 && intentos < 5 && (
              <p className="text-[11px] text-amber-600 text-center mb-3">
                {5 - intentos} intento{5 - intentos !== 1 ? "s" : ""} restante{5 - intentos !== 1 ? "s" : ""}
              </p>
            )}

            <div className="flex items-center justify-between mb-4">
              <label className="flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mostrarPin}
                  onChange={() => setMostrarPin(!mostrarPin)}
                  className="w-3.5 h-3.5 rounded"
                />
                Mostrar dígitos
              </label>
              <button
                onClick={() => setModoRecuperacion(true)}
                className="text-xs text-primary-600 hover:underline"
              >
                Código de recuperación
              </button>
            </div>

            <button
              onClick={cerrarSesion}
              className="w-full text-xs text-neutral-500 hover:text-neutral-600 hover:underline text-center"
            >
              Cerrar sesión
            </button>
          </>
        )}
      </div>
    </div>
  );
}
