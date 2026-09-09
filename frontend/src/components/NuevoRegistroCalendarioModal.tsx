import { FormEvent, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { NuevaPersonaModal } from "./NuevaPersonaModal";
import { TIPOS_REGISTRO_CALENDARIO } from "../lib/calendario-tipos";
import type { Persona, RegistroCalendarioInput, TipoRegistroCalendario } from "../types";

// Hoy en Eastern Time (YYYY-MM-DD), la misma zona horaria que usa el resto del CRM.
function hoyET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function fechaAISO(fechaYmd: string, horaHm: string): string {
  // La fecha es obligatoria; la hora opcional. Sin hora se guarda al mediodía para
  // evitar problemas de zona horaria (que un registro "del día" caiga en el día anterior).
  const conHora = horaHm ? `${fechaYmd}T${horaHm}:00` : `${fechaYmd}T12:00:00`;
  return new Date(conHora).toISOString();
}

const CLASE_LABEL = "text-xs text-neutral-600 mb-1 block";
const CLASE_INPUT =
  "w-full border border-neutral-200 bg-neutral-50 text-neutral-800 rounded-lg px-3 py-2 text-sm";

function claseActivaTipo(valor: TipoRegistroCalendario): string {
  switch (valor) {
    case "alerta":
      return "bg-danger-500 text-white border-danger-500";
    case "recordatorio":
      return "bg-warning-500 text-white border-warning-500";
    case "seguimiento":
    default:
      return "bg-primary-500 text-white border-primary-500";
  }
}

const claseInactivaTipo =
  "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50";

export interface ClienteResumen {
  id: string;
  nombre: string;
}

interface BuscadorProps {
  valor: ClienteResumen | null;
  onChange: (v: ClienteResumen | null) => void;
  /** El usuario eligió crear un cliente nuevo con ese nombre escrito. */
  onCrearNuevo: (nombre: string) => void;
  disabled?: boolean;
}

// Buscador de clientes existentes: mientras se escribe muestra coincidencias del CRM
// (reutiliza la búsqueda de /personas, sin cargar nunca la lista completa) y, si el
// nombre no existe, ofrece la acción explícita de crearlo con el flujo oficial.
function BuscadorCliente({ valor, onChange, onCrearNuevo, disabled }: BuscadorProps) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<Persona[] | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const secuencia = useRef(0); // ignora respuestas fuera de orden
  const inputRef = useRef<HTMLInputElement>(null);

  const trimTexto = texto.trim();

  useEffect(() => {
    if (disabled || !abierto) return;
    if (trimTexto.length < 2) {
      setResultado(null);
      setCargando(false);
      setErrorBusqueda(null);
      return;
    }
    const miSecuencia = ++secuencia.current;
    setCargando(true);
    setErrorBusqueda(null);
    const timer = setTimeout(() => {
      api
        .listarPersonas({ search: trimTexto, limite: 10 })
        .then((r) => {
          if (secuencia.current !== miSecuencia) return;
          setResultado(r.items);
        })
        .catch((err) => {
          if (secuencia.current !== miSecuencia) return;
          setErrorBusqueda(err instanceof ApiError ? err.message : "No se pudo buscar");
        })
        .finally(() => {
          if (secuencia.current === miSecuencia) setCargando(false);
        });
    }, 220);
    return () => clearTimeout(timer);
  }, [trimTexto, abierto, disabled]);

  function comprometer(v: ClienteResumen) {
    setTexto("");
    setAbierto(false);
    setResultado(null);
    setErrorBusqueda(null);
    onChange(v);
    inputRef.current?.focus();
  }

  function limpiar() {
    setTexto("");
    setResultado(null);
    setErrorBusqueda(null);
    onChange(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // Ya hay un cliente elegido: se muestra como chip con opción de quitar/cambiar.
  if (valor) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-primary-900 truncate">{valor.nombre}</p>
          <p className="text-[11px] text-primary-700/80">Cliente del CRM</p>
        </div>
        <button
          type="button"
          onClick={limpiar}
          disabled={disabled}
          title="Quitar cliente"
          className="shrink-0 text-[11px] px-2.5 py-1 rounded-lg border border-primary-300 text-primary-700 hover:bg-primary-100 disabled:opacity-50"
        >
          Cambiar
        </button>
      </div>
    );
  }

  const hayCoincidenciaExacta = (resultado ?? []).some(
    (p) => p.nombre.trim().toLowerCase() === trimTexto.toLowerCase(),
  );
  const puedeCrearNuevo = trimTexto.length >= 1 && resultado !== null && !cargando && !hayCoincidenciaExacta;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={texto}
        disabled={disabled}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 130)}
        placeholder="Escribe para buscar un cliente…"
        autoComplete="off"
        className={`${CLASE_INPUT} pr-9`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <svg className="w-3.5 h-3.5 text-neutral-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 7l5 5 5-5" />
        </svg>
      </span>

      {abierto && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
          {cargando && (
            <div className="px-3 py-2 text-xs text-neutral-500 flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-neutral-300 border-t-primary-500 rounded-full animate-spin" />
              Buscando…
            </div>
          )}

          {errorBusqueda && <div className="px-3 py-2 text-xs text-danger-600">{errorBusqueda}</div>}

          {!cargando && !errorBusqueda && trimTexto.length > 0 && trimTexto.length < 2 && (
            <div className="px-3 py-2 text-xs text-neutral-500">Escribe al menos 2 letras para buscar.</div>
          )}

          {(resultado ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => comprometer({ id: p.id, nombre: p.nombre })}
              className="block w-full text-left px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              <span className="font-medium">{p.nombre}</span>
              <span className="text-xs text-neutral-400 ml-1">
                {[p.ciudad, p.estado].filter(Boolean).join(", ")}
              </span>
            </button>
          ))}

          {!cargando && !errorBusqueda && trimTexto.length >= 2 && resultado && resultado.length === 0 && (
            <div className="px-3 pt-2 text-xs text-neutral-500">No encontramos un cliente con ese nombre.</div>
          )}

          {puedeCrearNuevo && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setAbierto(false);
                setResultado(null);
                onChange(null);
                onCrearNuevo(trimTexto);
              }}
              className="block w-full text-left px-3 py-2 text-sm text-primary-600 border-t border-neutral-100 hover:bg-neutral-50"
            >
              <span className="font-medium">+ Crear nuevo cliente “{trimTexto}”</span>
            </button>
          )}
        </div>
      )}

      <p className="mt-1 text-[11px] text-neutral-500">
        Si el cliente no existe, escribe su nombre y elige «+ Crear nuevo cliente».
      </p>
    </div>
  );
}

interface Props {
  onClose: () => void;
  /** Se llama SOLO cuando el registro quedó guardado (ya con su id en la base). */
  onSaved: () => void;
}

export function NuevoRegistroCalendarioModal({ onClose, onSaved }: Props) {
  const [tipo, setTipo] = useState<TipoRegistroCalendario>("seguimiento");
  const [cliente, setCliente] = useState<ClienteResumen | null>(null);
  const [fecha, setFecha] = useState(hoyET());
  const [hora, setHora] = useState("");
  const [titulo, setTitulo] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Crear cliente nuevo: se abre el flujo oficial de "Nuevo contacto". Mientras está
  // abierto, el formulario del Calendario NO se desmonta: se conserva lo escrito.
  const [crearClienteAbierto, setCrearClienteAbierto] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");

  const puedeGuardar = !!cliente && !!fecha && titulo.trim().length > 0 && !enviando;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cliente) {
      setError("Selecciona o crea el cliente.");
      return;
    }
    if (!fecha) {
      setError("La fecha es obligatoria.");
      return;
    }
    if (!titulo.trim()) {
      setError("Escribe un título o motivo.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const datos: RegistroCalendarioInput = {
        personaId: cliente.id,
        tipo,
        fecha: fechaAISO(fecha, hora),
        titulo: titulo.trim(),
        nota: nota.trim() || undefined,
      };
      await api.crearRegistroCalendario(datos);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && typeof err.payload === "object" && err.payload) {
        const payload = err.payload as { fieldErrors?: Record<string, string[]> };
        const primerCampo = payload.fieldErrors ? Object.values(payload.fieldErrors)[0]?.[0] : undefined;
        setError(primerCampo ?? "No se pudo guardar. Revisa los datos e inténtalo de nuevo.");
      } else {
        setError("No se pudo guardar. Revisa los datos e inténtalo de nuevo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-neutral-900/40 flex items-start justify-center pt-10 sm:pt-16 z-40 overflow-y-auto">
      <form onSubmit={onSubmit} className="bg-neutral-50 rounded-xl shadow-lg w-full max-w-xl p-6 border border-neutral-200 mb-10">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-neutral-800">Nuevo registro en el Calendario</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-600 text-lg leading-none" aria-label="Cerrar">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Se guardará como un registro pendiente del Calendario y se ubicará solo en
          ATRASADAS, PARA HOY o PRÓXIMAS según su fecha.
        </p>

        {/* Tipo del registro */}
        <label className={CLASE_LABEL}>Tipo</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {TIPOS_REGISTRO_CALENDARIO.map((t) => (
            <button
              key={t.valor}
              type="button"
              onClick={() => setTipo(t.valor)}
              className={`text-sm px-3.5 py-1.5 rounded-full border font-medium ${
                tipo === t.valor ? claseActivaTipo(t.valor) : claseInactivaTipo
              }`}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>

        {/* Cliente */}
        <label className={CLASE_LABEL}>Cliente *</label>
        <div className="mb-3">
          <BuscadorCliente
            valor={cliente}
            onChange={setCliente}
            disabled={enviando}
            onCrearNuevo={(nombre) => {
              setNombreNuevo(nombre);
              setCrearClienteAbierto(true);
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={CLASE_LABEL}>Fecha *</label>
            <input type="date" value={fecha} required onChange={(e) => setFecha(e.target.value)} className={CLASE_INPUT} />
          </div>
          <div>
            <label className={CLASE_LABEL}>Hora (opcional)</label>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={CLASE_INPUT} />
          </div>
        </div>

        <label className={CLASE_LABEL}>Título o motivo *</label>
        <input
          value={titulo}
          maxLength={300}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej. Llamar para seguimiento, Confirmar documentación…"
          className={`${CLASE_INPUT} mb-3`}
        />

        <label className={CLASE_LABEL}>Nota / descripción</label>
        <textarea
          value={nota}
          rows={4}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Detalle para la alerta, el recordatorio o el seguimiento…"
          className={`${CLASE_INPUT} resize-y mb-4`}
        />

        {error && <p className="text-xs text-danger-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50">
            Cancelar
          </button>
          <button
            disabled={!puedeGuardar}
            className="text-sm px-4 py-2 rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800 disabled:cursor-not-allowed"
          >
            {enviando ? "Guardando…" : "Guardar registro"}
          </button>
        </div>
      </form>

      {/* Flujo oficial de creación de cliente. Al guardarse/cancelarse se vuelve aquí
          conservando todo lo escrito; el registro NO se guarda automáticamente. */}
      {crearClienteAbierto && (
        <NuevaPersonaModal
          inicialNombre={nombreNuevo || undefined}
          onClose={() => setCrearClienteAbierto(false)}
          onCreated={(persona) => {
            setCrearClienteAbierto(false);
            setCliente({ id: persona.id, nombre: persona.nombre });
          }}
        />
      )}
    </div>
  );
}
