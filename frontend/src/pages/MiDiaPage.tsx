import { FormEvent, useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../api/AuthContext";
import { MiJornadaCard } from "../components/MiJornadaCard";
import { claseChipTipoRegistro, etiquetaTipoRegistro } from "../lib/calendario-tipos";
import type { TareaPendiente, Cumpleanero } from "../types";

function diasDiferencia(fechaIso: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaIso);
  fecha.setHours(0, 0, 0, 0);
  return Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", timeZone: "America/New_York" });
}

function calcularEdad(fechaNacimiento: string): number {
  const hoy = new Date();
  const [y, m, d] = fechaNacimiento.split("-").map(Number);
  let edad = hoy.getFullYear() - y;
  const mesActual = hoy.getMonth() + 1;
  if (mesActual < m || (mesActual === m && hoy.getDate() < d)) edad--;
  return edad;
}

// Fecha (YYYY-MM-DD) y hora (HH:MM, 24h) del instante guardado vistas en Eastern Time,
// la misma zona que usa el resto del CRM. Así "Reagendar" abre con los valores reales
// que el usuario ve en el calendario (no con la hora UTC cruda).
function fechaYHoraET(iso: string): { ymd: string; hhmm: string } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const partes = Object.fromEntries(dtf.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const hora = partes.hour === "24" ? "00" : partes.hour;
  return { ymd: `${partes.year}-${partes.month}-${partes.day}`, hhmm: `${hora}:${partes.minute}` };
}

function fmtHora12ET(iso: string): string | null {
  const { hhmm } = fechaYHoraET(iso);
  // El Calendario guarda al mediodía ET cuando el usuario no eligió hora: no se muestra.
  if (hhmm === "12:00") return null;
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

// Misma semántica que el Calendario (NuevoRegistroCalendarioModal): fecha obligatoria y
// hora opcional; sin hora se guarda al mediodía para que el registro no caiga en el día
// anterior por zona horaria.
function fechaAISO(fechaYmd: string, horaHm: string): string {
  const conHora = horaHm ? `${fechaYmd}T${horaHm}:00` : `${fechaYmd}T12:00:00`;
  return new Date(conHora).toISOString();
}

const CLASE_BOTON_ACCION =
  "text-xs font-medium px-3 py-1.5 rounded-lg border bg-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed";

interface TarjetaAccionableProps {
  t: TareaPendiente;
  colorClase: string;
  procesando: boolean;
  onCompletar: (t: TareaPendiente) => void;
  onReagendar: (t: TareaPendiente) => void;
}

// Tarjeta de ATRASADAS / PARA HOY: el registro real se puede completar o reagendar.
// El nombre del cliente sigue siendo el enlace a su ficha; los botones son acciones
// independientes (no toda la tarjeta es una acción ambigua).
function TarjetaAccionable({ t, colorClase, procesando, onCompletar, onReagendar }: TarjetaAccionableProps) {
  return (
    <div className={`p-3 rounded-lg border ${colorClase}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              aria-label={etiquetaTipoRegistro(t.tipo)}
              className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${claseChipTipoRegistro(t.tipo)}`}
            >
              {etiquetaTipoRegistro(t.tipo)}
            </span>
            <Link
              to={`/personas/${t.personaId}`}
              className="text-sm font-medium text-neutral-900 hover:underline"
              title="Ver ficha del cliente"
            >
              {t.personaNombre}
            </Link>
          </div>
          {t.titulo ? <p className="text-xs text-neutral-700 mt-0.5">{t.titulo}</p> : null}
          {t.nota ? <p className="text-xs text-neutral-500 mt-0.5">{t.nota}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <span className="text-xs text-neutral-600">{fmtFecha(t.fecha)}</span>
          {fmtHora12ET(t.fecha) ? <span className="text-[11px] text-neutral-500 block">{fmtHora12ET(t.fecha)}</span> : null}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onCompletar(t)}
          disabled={procesando}
          title="Marcar el registro real como completado"
          className={`${CLASE_BOTON_ACCION} text-success-700 border-success-300 hover:bg-success-50`}
        >
          {procesando ? "Completando…" : "✓ Completada"}
        </button>
        <button
          type="button"
          onClick={() => onReagendar(t)}
          disabled={procesando}
          title="Cambiar la fecha/hora del mismo registro real"
          className={`${CLASE_BOTON_ACCION} text-primary-700 border-primary-300 hover:bg-primary-50`}
        >
          ↻ Reagendar cita
        </button>
      </div>
    </div>
  );
}

interface ModalReagendarProps {
  tarea: TareaPendiente;
  onClose: () => void;
  /** Se llama SOLO cuando el registro real quedó reagendado. */
  onGuardada: () => void;
}

// Reagendar la MISMA fila real (tareas_seguimiento): solo se cambia fecha/hora. Se muestra
// el estado actual (tipo, cliente, título, nota y fecha/hora guardadas) y se editan la
// nueva fecha y, opcionalmente, la nueva hora — los mismos campos del Calendario.
function ModalReagendar({ tarea, onClose, onGuardada }: ModalReagendarProps) {
  const inicial = fechaYHoraET(tarea.fecha);
  const [fecha, setFecha] = useState(inicial.ymd);
  const [hora, setHora] = useState(inicial.hhmm === "12:00" ? "" : inicial.hhmm);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fecha) {
      setError("La fecha es obligatoria.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await api.reagendarTarea(tarea.id, fechaAISO(fecha, hora));
      onGuardada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reagendar. Inténtalo de nuevo.");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-neutral-900/40 flex items-start justify-center pt-10 sm:pt-16 z-40 overflow-y-auto">
      <form
        onSubmit={onSubmit}
        className="bg-neutral-50 rounded-xl shadow-lg w-full max-w-md p-6 border border-neutral-200 mb-10"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-neutral-800">Reagendar cita</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-600 text-lg leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Cambia la fecha y la hora de este registro. Se actualiza la misma cita; no se crea
          una nueva.
        </p>

        {/* Contexto del registro real (solo lectura) */}
        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 mb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              aria-label={etiquetaTipoRegistro(tarea.tipo)}
              className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${claseChipTipoRegistro(tarea.tipo)}`}
            >
              {etiquetaTipoRegistro(tarea.tipo)}
            </span>
            <p className="text-sm font-medium text-neutral-900">{tarea.personaNombre}</p>
          </div>
          {tarea.titulo ? <p className="text-xs text-neutral-700 mt-0.5">{tarea.titulo}</p> : null}
          {tarea.nota ? <p className="text-xs text-neutral-500 mt-0.5">{tarea.nota}</p> : null}
          <p className="text-xs text-neutral-500 mt-1.5">
            Actual: {fmtFecha(tarea.fecha)}
            {fmtHora12ET(tarea.fecha) ? ` · ${fmtHora12ET(tarea.fecha)}` : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-neutral-600 mb-1 block">Fecha *</label>
            <input
              type="date"
              value={fecha}
              required
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-600 mb-1 block">Hora (opcional)</label>
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && <p className="text-xs text-danger-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
          >
            Cancelar
          </button>
          <button
            disabled={guardando || !fecha}
            className="text-sm px-4 py-2 rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800 disabled:cursor-not-allowed"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function MiDiaPage() {
  const { usuario } = useAuth();
  const [tareas, setTareas] = useState<TareaPendiente[]>([]);
  const [cumpleanosHoy, setCumpleanosHoy] = useState<Cumpleanero[]>([]);
  const [cumpleanosProximos, setCumpleanosProximos] = useState<Cumpleanero[]>([]);
  const [cargando, setCargando] = useState(true);
  // Id del registro cuyo "Completada" está en vuelo (evita dobles clics).
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  // Registro que se está reagendando (abre el modal con sus datos reales).
  const [reagendando, setReagendando] = useState<TareaPendiente | null>(null);

  const cargar = useCallback(async () => {
    const [data, cumple] = await Promise.all([
      api.listarTareasPendientes(true),
      api.cumpleanos(),
    ]);
    setTareas(data.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()));
    setCumpleanosHoy(cumple.hoy);
    setCumpleanosProximos(cumple.proximos);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Marca como completado el REGISTRO REAL usando la misma lógica que ya usa el CRM
  // (PATCH /personas/tareas/:id/completar → completado=true + completadoEn=ahora).
  // El refetch lo quita de la lista y los contadores se actualizan solos.
  async function completar(t: TareaPendiente) {
    if (procesandoId) return;
    setProcesandoId(t.id);
    setErrorAccion(null);
    try {
      await api.completarTarea(t.id);
      await cargar();
    } catch (err) {
      setErrorAccion(err instanceof ApiError ? err.message : "No se pudo completar. Inténtalo de nuevo.");
    } finally {
      setProcesandoId(null);
    }
  }

  async function trasReagendar() {
    setReagendando(null);
    await cargar();
  }

  if (cargando) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const atrasadas = tareas.filter((t) => diasDiferencia(t.fecha) < 0);
  const hoy = tareas.filter((t) => diasDiferencia(t.fecha) === 0);
  const proximas = tareas.filter((t) => diasDiferencia(t.fecha) > 0);

  const Grupo = ({
    titulo,
    items,
    colorClase,
    accionable,
  }: {
    titulo: string;
    items: TareaPendiente[];
    colorClase: string;
    accionable?: boolean;
  }) => (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-neutral-700 mb-2">
        {titulo} <span className="text-neutral-500 font-normal">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-500">Nada aquí.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((t) =>
            accionable ? (
              <TarjetaAccionable
                key={t.id}
                t={t}
                colorClase={colorClase}
                procesando={procesandoId === t.id}
                onCompletar={(tt) => void completar(tt)}
                onReagendar={setReagendando}
              />
            ) : (
              <Link
                key={t.id}
                to={`/personas/${t.personaId}`}
                className={`flex items-center justify-between p-3 rounded-lg border ${colorClase} hover:opacity-80`}
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">{t.personaNombre}</p>
                  <p className="text-xs text-neutral-500">{t.nota}</p>
                </div>
                <span className="text-xs text-neutral-500">{fmtFecha(t.fecha)}</span>
              </Link>
            )
          )}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-1">Hola, {usuario?.nombre.split(" ")[0]}</h1>
      <p className="text-sm text-neutral-500 mb-6">Esto es lo que tienes pendiente hoy</p>

      {/* ⏱ Mi jornada — control personal de entrada/salida (no da acceso a RRHH) */}
      <MiJornadaCard />

      {errorAccion && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2">
          <p className="text-xs text-danger-700">{errorAccion}</p>
          <button type="button" onClick={() => setErrorAccion(null)} className="text-xs text-danger-600 hover:underline">
            Cerrar
          </button>
        </div>
      )}

      {/* 🎂 Cumpleaños */}
      {(cumpleanosHoy.length > 0 || cumpleanosProximos.length > 0) && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">🎂 Cumpleaños</h2>

          {cumpleanosHoy.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-pink-600 mb-1.5">Hoy</p>
              <div className="flex flex-col gap-2">
                {cumpleanosHoy.map((c) => (
                  <Link
                    key={c.personaId}
                    to={`/personas/${c.personaId}`}
                    className="flex items-center justify-between p-3 rounded-lg border bg-pink-50 bg-pink-500/10 border-pink-200 border-pink-500/20 hover:opacity-80"
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900">
                        {c.personaNombre}{" "}
                        <span className="font-normal text-neutral-500">
                          ({calcularEdad(c.fechaNacimiento)} años)
                        </span>
                      </p>
                    </div>
                    <span className="text-xs text-pink-600 font-medium">🎉 Hoy</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {cumpleanosProximos.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1.5">Próximos 14 días</p>
              <div className="flex flex-col gap-2">
                {cumpleanosProximos.map((c) => {
                  const [, m, d] = c.fechaNacimiento.split("-").map(Number);
                  const hoy2 = new Date();
                  const cumpleEsteAno = new Date(hoy2.getFullYear(), m - 1, d);
                  if (cumpleEsteAno <= hoy2) cumpleEsteAno.setFullYear(hoy2.getFullYear() + 1);
                  const diasRestantes = Math.round((cumpleEsteAno.getTime() - hoy2.getTime()) / 86400000);
                  return (
                    <Link
                      key={c.personaId}
                      to={`/personas/${c.personaId}`}
                      className="flex items-center justify-between p-3 rounded-lg border bg-neutral-50 border-neutral-200 hover:opacity-80"
                    >
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{c.personaNombre}</p>
                      </div>
                      <span className="text-xs text-neutral-500">
                        {diasRestantes === 1 ? "Mañana" : `En ${diasRestantes} días`} — {fmtFecha(cumpleEsteAno.toISOString())}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <Grupo
        titulo="Atrasadas"
        items={atrasadas}
        colorClase="bg-danger-50 bg-danger-500/10 border-danger-100 border-danger-500/20"
        accionable
      />
      <Grupo
        titulo="Para hoy"
        items={hoy}
        colorClase="bg-warning-50 bg-warning-500/10 border-warning-100 border-warning-500/20"
        accionable
      />
      <Grupo titulo="Próximas" items={proximas} colorClase="bg-neutral-50 border-neutral-200" />

      {reagendando && (
        <ModalReagendar
          tarea={reagendando}
          onClose={() => setReagendando(null)}
          onGuardada={() => void trasReagendar()}
        />
      )}
    </div>
  );
}
