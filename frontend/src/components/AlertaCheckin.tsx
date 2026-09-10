import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Checkin } from "../types";
import { fmtHora12ET } from "../lib/jornada-formato";

// ─── Alerta global «¿Sigues activo?» ────────────────────────────
//
// Una tarjeta flotante abajo a la derecha que aparece mientras haya una jornada (o reposición)
// abierta y toque un check-in. Se monta UNA vez en AppLayout, que envuelve todas las páginas
// protegidas: así el aviso alcanza al usuario en cualquier módulo sin tocar ningún módulo.
//
// QUÉ NO HACE, a propósito:
//   · NO bloquea la pantalla: no hay fondo oscuro ni modal que impida trabajar
//   · NO tiene botón de cerrar: una alerta descartable se descarta sola y deja de existir
//   · NO descuenta ni sanciona nada: sin respuesta, el check-in queda «Sin respuesta» en el
//     historial y nada más. Las horas trabajadas dependen de startedAt/endedAt.
//
// NADA DE STATE EN EL NAVEGADOR: la fuente de verdad es el servidor. Un refresh no borra, no
// regenera ni duplica nada — solo vuelve a preguntar. No se usa localStorage ni setTimeout
// para programar el siguiente aviso.
//
// El poll salta las pestañas ocultas: si el usuario no está mirando, no tiene sentido pedir el
// check-in (y sobre todo no debe empezar a correr su ventana de respuesta sin verlo). Al volver
// el foco se consulta de inmediato.

const INTERVALO_MS = 60_000;

export function AlertaCheckin() {
  const [pendiente, setPendiente] = useState<Checkin | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  // Una sola notificación del navegador por check-in, no una por cada poll.
  const notificado = useRef<string | null>(null);

  const consultar = useCallback(async () => {
    // Pestaña oculta: ni se pregunta. Así la hora de entrega (y con ella la ventana) empieza
    // cuando la persona puede verla de verdad.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const estado = await api.checkinPendiente();
      setPendiente(estado.checkin);
      setError(null);

      if (estado.checkin && notificado.current !== estado.checkin.id) {
        notificado.current = estado.checkin.id;
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Taty's Enterprises BOS", { body: "¿Sigues activo?" });
        }
      }
    } catch {
      // Un fallo de red no puede romper el CRM: la alerta es un extra, se reintenta al minuto.
      setError(null);
    }
  }, []);

  useEffect(() => {
    void consultar();
    const intervalo = setInterval(() => void consultar(), INTERVALO_MS);

    const alVolver = () => {
      if (document.visibilityState === "visible") void consultar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [consultar]);

  // Solo para el contador que se ve en la tarjeta. No programa nada en el servidor.
  useEffect(() => {
    if (!pendiente) return;
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [pendiente]);

  const responder = useCallback(async () => {
    if (!pendiente || enviando) return;
    setEnviando(true);
    try {
      await api.responderCheckin(pendiente.id);
      setPendiente(null);
      setError(null);
      // Re-consulta inmediata: si ya había otro vencido, aparece ahora sin esperar al minuto.
      void consultar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la respuesta.");
    } finally {
      setEnviando(false);
    }
  }, [pendiente, enviando, consultar]);

  if (!pendiente) return null;

  // Minutos que quedan de la ventana. Es informativo: no cierra nada al llegar a cero.
  const restantes = pendiente.expiraEn
    ? Math.max(0, Math.ceil((new Date(pendiente.expiraEn).getTime() - ahora) / 60_000))
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-amber-300 bg-white shadow-2xl"
    >
      <div className="flex items-start gap-3 p-4">
        <span className="text-2xl leading-none" aria-hidden="true">
          🖐️
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">¿Sigues activo?</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Programado para las {fmtHora12ET(pendiente.scheduledAt)}
            {restantes !== null && restantes > 0 ? ` · quedan ${restantes} min` : ""}
          </p>
          <button
            type="button"
            onClick={() => void responder()}
            disabled={enviando}
            className="mt-3 w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? "Guardando…" : "Sigo activo"}
          </button>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
