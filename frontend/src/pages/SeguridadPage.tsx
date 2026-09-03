import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

export function SeguridadPage() {
  const [status, setStatus] = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  // Setup / change
  const [modoSetup, setModoSetup] = useState(false);
  const [modoChange, setModoChange] = useState(false);
  const [modoDisable, setModoDisable] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinActual, setPinActual] = useState("");
  const [passwordActual, setPasswordActual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Recovery codes
  const [codigos, setCodigos] = useState<string[] | null>(null);

  const cargar = async () => {
    try {
      const s = await api.pinStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    }
    setCargando(false);
  };

  useEffect(() => { void cargar(); }, []);

  const validarPin = (p: string): string | null => {
    if (p.length < 4) return "El PIN debe tener al menos 4 dígitos.";
    if (!/^\d+$/.test(p)) return "Solo se permiten números.";
    if (/^(\d)\1{3,}$/.test(p)) return "No uses PINs repetitivos como 0000 o 1111.";
    if (p === "1234" || p === "6543" || p === "4321") return "No uses secuencias simples.";
    if (p.length >= 4 && p[0] === p[2] && p[1] === p[3] && p[0] !== p[1]) return "No uses PINs con patrones repetitivos como 1212.";
    return null;
  };

  const onSetup = async () => {
    setError(null); setOk(null);
    const e = validarPin(pin);
    if (e) { setError(e); return; }
    if (pin !== pinConfirm) { setError("Los PINs no coinciden."); return; }
    if (!passwordActual) { setError("Debes ingresar tu contraseña actual."); return; }
    setGuardando(true);
    try {
      const res = await api.pinSetup(pin, passwordActual);
      setOk("PIN activado correctamente. Guarda tus códigos de recuperación.");
      setCodigos(res.codigosRecuperacion);
      setModoSetup(false);
      void cargar();
    } catch (err) { setError(err instanceof ApiError ? String(err.payload) : "Error"); }
    finally { setGuardando(false); }
  };

  const onChange = async () => {
    setError(null); setOk(null);
    const e = validarPin(pin);
    if (e) { setError(e); return; }
    if (pin !== pinConfirm) { setError("Los PINs no coinciden."); return; }
    if (!pinActual) { setError("Debes ingresar tu PIN actual."); return; }
    setGuardando(true);
    try {
      await api.pinChange(pinActual, pin);
      setOk("PIN cambiado correctamente.");
      setModoChange(false);
      void cargar();
    } catch (err) { setError(err instanceof ApiError ? String(err.payload) : "Error"); }
    finally { setGuardando(false); }
  };

  const onDisable = async () => {
    setError(null); setOk(null);
    if (!pinActual || !passwordActual) { setError("Debes ingresar tu PIN y contraseña actuales."); return; }
    if (!confirm("¿Desactivar la verificación en dos pasos? Tu cuenta quedará protegida solo por la contraseña.")) return;
    setGuardando(true);
    try {
      await api.pinDisable(pinActual, passwordActual);
      setOk("PIN desactivado.");
      setModoDisable(false);
      void cargar();
    } catch (err) { setError(err instanceof ApiError ? String(err.payload) : "Error"); }
    finally { setGuardando(false); }
  };

  const onRegenerarCodigos = async () => {
    if (!confirm("¿Generar nuevos códigos? Los códigos anteriores serán invalidados.")) return;
    try {
      const res = await api.pinRegenerateCodes();
      setCodigos(res.codigosRecuperacion);
      setOk("Nuevos códigos generados.");
    } catch (err) { setError(err instanceof ApiError ? String(err.payload) : "Error"); }
  };

  const onCerrarSesiones = async () => {
    if (!confirm("¿Cerrar todas las sesiones? Deberás volver a iniciar sesión en todos tus dispositivos.")) return;
    try {
      await api.closeAllSessions();
      setOk("Todas las sesiones cerradas.");
    } catch (err) { setError(err instanceof ApiError ? String(err.payload) : "Error"); }
  };

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Seguridad de acceso</h1>
      <p className="text-sm text-neutral-500 mb-6">Verificación en dos pasos para tu cuenta SUPER_ADMIN</p>

      {ok && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">{ok}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {/* Estado actual */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 mb-4">
        <h3 className="text-sm font-medium text-neutral-700 mb-3">Estado de seguridad</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-neutral-600">PIN:</span>{" "}
            <span className={status?.habilitado ? "text-green-600 font-medium" : "text-red-500"}>
              {status?.habilitado ? "Activado ✓" : "No activado"}
            </span>
          </div>
          {status?.ultimoAcceso && <div><span className="text-neutral-600">Último acceso:</span> <span className="text-neutral-700">{new Date(status.ultimoAcceso).toLocaleString("es-ES")}</span></div>}
          {status?.ultimoCambio && <div><span className="text-neutral-600">Último cambio:</span> <span className="text-neutral-700">{new Date(status.ultimoCambio).toLocaleString("es-ES")}</span></div>}
          {status?.tieneDispositivoConfiable && <div><span className="text-neutral-600">Dispositivo:</span> <span className="text-green-600">Confiado (12h)</span></div>}
        </div>
      </div>

      {/* Acciones */}
      <div className="space-y-3">
        {!status?.habilitado ? (
          <button onClick={() => { setModoSetup(true); setModoChange(false); setModoDisable(false); setError(null); setOk(null); }} className="w-full text-left bg-neutral-50 border border-neutral-200 rounded-xl p-4 hover:border-primary-300 transition-colors">
            <p className="font-medium text-sm text-neutral-900">🔐 Activar verificación mediante PIN</p>
            <p className="text-xs text-neutral-500 mt-0.5">Protege tu cuenta con un segundo factor de autenticación.</p>
          </button>
        ) : (
          <>
            <button onClick={() => { setModoChange(true); setModoSetup(false); setModoDisable(false); setError(null); setOk(null); }} className="w-full text-left bg-neutral-50 border border-neutral-200 rounded-xl p-4 hover:border-primary-300 transition-colors">
              <p className="font-medium text-sm text-neutral-900">🔄 Cambiar PIN</p>
              <p className="text-xs text-neutral-500 mt-0.5">Actualiza tu PIN por uno nuevo.</p>
            </button>
            <button onClick={onRegenerarCodigos} className="w-full text-left bg-neutral-50 border border-neutral-200 rounded-xl p-4 hover:border-primary-300 transition-colors">
              <p className="font-medium text-sm text-neutral-900">📋 Regenerar códigos de recuperación</p>
              <p className="text-xs text-neutral-500 mt-0.5">Genera nuevos códigos. Los anteriores se invalidan.</p>
            </button>
            <button onClick={onCerrarSesiones} className="w-full text-left bg-neutral-50 border border-neutral-200 rounded-xl p-4 hover:border-primary-300 transition-colors">
              <p className="font-medium text-sm text-neutral-900">🚪 Cerrar todas las sesiones</p>
              <p className="text-xs text-neutral-500 mt-0.5">Revoque todos los dispositivos y sesiones abiertas.</p>
            </button>
            <button onClick={() => { setModoDisable(true); setModoSetup(false); setModoChange(false); setError(null); setOk(null); }} className="w-full text-left bg-neutral-50 border border-red-200 rounded-xl p-4 hover:border-red-300 transition-colors">
              <p className="font-medium text-sm text-red-600">⚠️ Desactivar verificación mediante PIN</p>
              <p className="text-xs text-red-500 mt-0.5">Tu cuenta quedará protegida solo por contraseña.</p>
            </button>
          </>
        )}
      </div>

      {/* Modal: Setup */}
      {modoSetup && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
          <div className="bg-neutral-50 rounded-xl p-5 w-full max-w-sm shadow-xl border">
            <p className="text-sm font-semibold mb-3">Activar PIN</p>
            <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="Nuevo PIN (mínimo 4 dígitos)" maxLength={10} className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
            <input type="password" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)} placeholder="Confirmar PIN" maxLength={10} className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
            <input type="password" value={passwordActual} onChange={e => setPasswordActual(e.target.value)} placeholder="Contraseña actual" className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
            <div className="flex gap-2">
              <button onClick={onSetup} disabled={guardando} className="text-sm bg-primary-600 text-white px-4 py-2 rounded-lg font-medium disabled:bg-primary-100 disabled:text-primary-800">{guardando ? "..." : "Activar"}</button>
              <button onClick={() => { setModoSetup(false); setError(null); }} className="text-sm border px-4 py-2 rounded-lg">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Change */}
      {modoChange && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
          <div className="bg-neutral-50 rounded-xl p-5 w-full max-w-sm shadow-xl border">
            <p className="text-sm font-semibold mb-3">Cambiar PIN</p>
            <input type="password" value={pinActual} onChange={e => setPinActual(e.target.value)} placeholder="PIN actual" maxLength={10} className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
            <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="Nuevo PIN (mínimo 4 dígitos)" maxLength={10} className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
            <input type="password" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)} placeholder="Confirmar nuevo PIN" maxLength={10} className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
            <div className="flex gap-2">
              <button onClick={onChange} disabled={guardando} className="text-sm bg-primary-600 text-white px-4 py-2 rounded-lg font-medium disabled:bg-primary-100 disabled:text-primary-800">{guardando ? "..." : "Cambiar"}</button>
              <button onClick={() => { setModoChange(false); setError(null); }} className="text-sm border px-4 py-2 rounded-lg">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Disable */}
      {modoDisable && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
          <div className="bg-neutral-50 rounded-xl p-5 w-full max-w-sm shadow-xl border">
            <p className="text-sm font-semibold mb-3 text-red-600">Desactivar PIN</p>
            <input type="password" value={pinActual} onChange={e => setPinActual(e.target.value)} placeholder="PIN actual" maxLength={10} className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
            <input type="password" value={passwordActual} onChange={e => setPasswordActual(e.target.value)} placeholder="Contraseña actual" className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
            <div className="flex gap-2">
              <button onClick={onDisable} disabled={guardando} className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg font-medium disabled:bg-red-100 disabled:text-red-800">{guardando ? "..." : "Desactivar"}</button>
              <button onClick={() => { setModoDisable(false); setError(null); }} className="text-sm border px-4 py-2 rounded-lg">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Códigos de recuperación */}
      {codigos && codigos.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
          <div className="bg-neutral-50 rounded-xl p-5 w-full max-w-sm shadow-xl border">
            <p className="text-sm font-semibold mb-1">📋 Códigos de recuperación</p>
            <p className="text-xs text-red-600 mb-3">Guarda estos códigos en un lugar seguro. Solo se muestran una vez.</p>
            <div className="bg-neutral-100 rounded-lg p-3 mb-3 font-mono text-xs text-center">
              {codigos.map((c, i) => <div key={i} className="py-0.5 tracking-widest">{c}</div>)}
            </div>
            <button onClick={() => setCodigos(null)} className="w-full text-sm bg-primary-600 text-white py-2 rounded-lg font-medium">Ya los guardé</button>
          </div>
        </div>
      )}
    </div>
  );
}
