import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { EstadoMiJornada } from "../types";
import { fmtDuracion, fmtHora12ET, fmtMinutos, transcurrido } from "../lib/jornada-formato";

// ─── GENERAL → Mi día · Mi jornada ──────────────────────────────────
// Control PERSONAL: cada quien ficha su propia entrada y salida. No es un privilegio —
// consultar la asistencia de la plantilla vive en RECURSOS HUMANOS → Asistencia y exige
// otro acceso. La identidad la pone el backend desde el token: aquí no se envía ningún
// userId, así que no hay forma de fichar por otra persona.
//
// El estado viene del servidor (SQLite), nunca de localStorage: sobrevive a refresh, a
// cambiar de dispositivo y a un deploy.

export function MiJornadaCard() {
  const [estado, setEstado] = useState<EstadoMiJornada | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Solo para el reloj visual de la jornada abierta (no es un dato guardado).
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    try {
      setEstado(await api.miJornadaActual());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo leer tu jornada.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // El indicador visual avanza solo mientras haya una jornada abierta.
  useEffect(() => {
    if (!estado?.activa) return;
    const id = window.setInterval(() => setAhora(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [estado?.activa]);

  async function accion(operacion: () => Promise<EstadoMiJornada>) {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      setEstado(await operacion());
      setAhora(Date.now());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar. Inténtalo de nuevo.");
      // El estado puede haber cambiado por otro lado (u otra pestaña): se relee del servidor.
      await cargar();
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return (
      <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <p className="text-xs text-neutral-500">Leyendo tu jornada…</p>
      </div>
    );
  }

  const activa = estado?.activa ?? null;
  const programadoHoy = estado?.minutosProgramadosHoy ?? 0;
  const trabajado = estado?.totalHoySegundos ?? 0;
  const cerradas = (estado?.sesionesHoy ?? []).filter((s) => s.estado === "FINALIZADA");

  return (
    <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700">⏱ Mi jornada</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {activa
              ? `Trabajando desde las ${fmtHora12ET(activa.startedAt)}`
              : cerradas.length > 0
                ? "Jornada terminada. Puedes iniciar otra si vuelves a trabajar."
                : "Todavía no has iniciado tu jornada de hoy."}
          </p>
        </div>

        {activa ? (
          <button
            type="button"
            onClick={() => void accion(api.terminarJornada)}
            disabled={enviando}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-danger-500 text-white hover:bg-danger-600 disabled:bg-danger-100 disabled:text-danger-800 disabled:cursor-not-allowed"
          >
            {enviando ? "Terminando…" : "■ Terminar jornada"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void accion(api.iniciarJornada)}
            disabled={enviando}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800 disabled:cursor-not-allowed"
          >
            {enviando ? "Iniciando…" : "▶ Iniciar jornada"}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2">
          <p className="text-xs text-danger-700">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-xs text-danger-600 hover:underline">
            Cerrar
          </button>
        </div>
      )}

      {activa && (
        <div className="mt-3 rounded-lg border border-success-200 bg-success-50 px-3 py-2">
          <p className="text-xs text-success-700">
            Jornada <span className="font-semibold">abierta</span> desde las {fmtHora12ET(activa.startedAt)}
            {transcurrido(activa.startedAt, ahora) ? ` · ${transcurrido(activa.startedAt, ahora)} transcurridas` : ""}
          </p>
          <p className="text-[11px] text-success-700/80 mt-0.5">
            Ese tiempo todavía no cuenta como trabajado: se registra cuando pulses Terminar jornada.
          </p>
        </div>
      )}

      {(trabajado > 0 || programadoHoy > 0) && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-neutral-100 pt-3">
          <p className="text-xs text-neutral-600">
            Trabajado hoy: <span className="font-semibold text-neutral-800">{fmtDuracion(trabajado)}</span>
          </p>
          <p className="text-xs text-neutral-600">
            Jornada esperada hoy:{" "}
            <span className="font-semibold text-neutral-800">
              {programadoHoy > 0 ? fmtMinutos(programadoHoy) : "sin configurar"}
            </span>
          </p>
          {cerradas.length > 1 && (
            <p className="text-xs text-neutral-600">
              Sesiones de hoy: <span className="font-semibold text-neutral-800">{cerradas.length}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
