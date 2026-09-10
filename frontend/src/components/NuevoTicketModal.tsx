import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { PrioridadTicket } from "../types";

// ─── Botón flotante global → "Crear ticket" ────────────────────────
// Cualquier usuario autenticado puede enviar una solicitud a la bandeja DEV → Tickets.
// NO otorga acceso a DEV: el solicitante no escribe nombre ni fecha (salen del usuario
// autenticado y del reloj del servidor), y al terminar NO se redirige a DEV.

const CLASE_LABEL = "text-xs text-neutral-600 mb-1 block";
const CLASE_INPUT =
  "w-full border border-neutral-200 bg-white text-neutral-800 rounded-lg px-3 py-2 text-sm";

// Misma allowlist que el backend (la validación real vive allí; esto es solo ayuda).
const EXTENSIONES_PERMITIDAS = [
  "png", "jpg", "jpeg", "webp", "pdf",
  "doc", "docx", "xls", "xlsx", "txt",
];
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB por archivo (igual que el backend)
const MAX_ADJUNTOS = 5;

const ACCEPT = EXTENSIONES_PERMITIDAS
  .map((e) => `.${e}`)
  .concat([
    "image/png", "image/jpeg", "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
  ])
  .join(",");

const PRIORIDADES: { valor: PrioridadTicket; etiqueta: string }[] = [
  { valor: "Baja", etiqueta: "Baja" },
  { valor: "Normal", etiqueta: "Normal" },
  { valor: "Alta", etiqueta: "Alta" },
];

function extensionDe(nombre: string): string {
  return (nombre.split(".").pop() ?? "").toLowerCase();
}

function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  onClose: () => void;
  /** Opcional: se llama justo después de que el ticket quedó guardado (con adjuntos o sin ellos). */
  onEnviado?: () => void;
}

export function NuevoTicketModal({ onClose, onEnviado }: Props) {
  const [description, setDescription] = useState("");
  const [prioridad, setPrioridad] = useState<PrioridadTicket>("Normal");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState<{ actual: number; total: number } | null>(null);
  const [exito, setExito] = useState(false);

  // Clave de idempotencia: nace UNA vez por apertura del modal, así un doble clic o
  // un reintento tras un fallo de red nunca crean dos tickets (misma mecánica que pagos).
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  // Si el ticket ya quedó creado y solo falló un adjunto, se reutiliza su id en el
  // reintento (se suben solo los archivos pendientes, nunca se recrea el ticket).
  const ticketIdRef = useRef<string | null>(null);

  function validarAlAgregar(lista: File[]): { validos: File[]; motivo: string | null } {
    const disponibles = MAX_ADJUNTOS - archivos.length;
    if (disponibles <= 0) {
      return { validos: [], motivo: `Un ticket admite hasta ${MAX_ADJUNTOS} archivos.` };
    }
    const aceptados = lista.slice(0, disponibles); // acepta hasta el tope, no rechaza el lote
    for (const f of aceptados) {
      if (!EXTENSIONES_PERMITIDAS.includes(extensionDe(f.name))) {
        return { validos: [], motivo: `«${f.name}» no es un tipo de archivo permitido.` };
      }
      if (f.size > MAX_BYTES) {
        return { validos: [], motivo: `«${f.name}» supera el máximo de 8 MB.` };
      }
      if (f.size === 0) {
        return { validos: [], motivo: `«${f.name}» está vacío.` };
      }
    }
    const excedentes = lista.length - aceptados.length;
    return {
      validos: aceptados,
      motivo: excedentes > 0 ? `Un ticket admite hasta ${MAX_ADJUNTOS} archivos; se ignoró el excedente.` : null,
    };
  }

  function onSeleccionarArchivos(e: ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite volver a elegir el mismo archivo tras un rechazo
    if (lista.length === 0) return;
    const { validos, motivo } = validarAlAgregar(lista);
    if (validos.length === 0) {
      setError(motivo ?? "No se pudo agregar el archivo.");
      return;
    }
    setArchivos((prev) => [...prev, ...validos]);
    setError(motivo); // si hay excedente se informa como aviso, pero los válidos ya quedaron
  }

  function quitarArchivo(nombre: string) {
    setArchivos((prev) => prev.filter((f) => f.name !== nombre));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError("Escribe la descripción de tu solicitud.");
      return;
    }
    setEnviando(true);
    setError(null);
    setSubiendo(null);
    try {
      // 1) Crear el ticket (o recuperar el ya creado si reintentamos con adjuntos pendientes).
      let ticketId = ticketIdRef.current;
      if (!ticketId) {
        const ticket = await api.crearTicket({
          description: description.trim(),
          prioridad,
          idempotencyKey: idempotencyKeyRef.current,
        });
        ticketId = ticket.id;
        ticketIdRef.current = ticket.id;
      }

      // 2) Subir adjuntos uno a uno. Si uno falla, el reintento continúa desde los pendientes.
      if (archivos.length > 0) {
        for (let i = 0; i < archivos.length; i++) {
          setSubiendo({ actual: i + 1, total: archivos.length });
          try {
            await api.subirAdjuntoTicket(ticketId, archivos[i]);
          } catch (err) {
            throw new Error(
              `No se pudo subir «${archivos[i].name}». ${err instanceof Error ? err.message : "Inténtalo de nuevo."}`,
            );
          }
        }
      }

      setSubiendo(null);
      setExito(true);
      onEnviado?.();
    } catch (err) {
      const mensaje =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : undefined;
      setError(mensaje ?? "No se pudo enviar el ticket. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const puedeEnviar = description.trim().length > 0 && !enviando;

  return (
    <div className="fixed inset-0 bg-neutral-900/40 flex items-start justify-center pt-10 sm:pt-16 z-50 overflow-y-auto">
      {exito ? (
        <div className="bg-neutral-50 rounded-xl shadow-lg w-full max-w-lg p-6 border border-neutral-200 mb-10">
          <div className="text-center py-4">
            <p className="text-3xl mb-2">✔</p>
            <h2 className="text-lg font-semibold text-neutral-800">Ticket enviado</h2>
            <p className="text-sm text-neutral-500 mt-1.5">
              Tu solicitud llegó a la bandeja DEV → Tickets.
              {archivos.length > 0 && ` Se subieron ${archivos.length} adjunto${archivos.length === 1 ? "" : "s"}.`}
            </p>
            <p className="text-xs text-neutral-400 mt-1">No es necesario hacer nada más.</p>
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-5 py-2 rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-600"
            >
              Listo
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="bg-neutral-50 rounded-xl shadow-lg w-full max-w-lg p-6 border border-neutral-200 mb-10">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold text-neutral-800">🎫 Crear ticket</h2>
            <button
              type="button"
              onClick={onClose}
              disabled={enviando}
              className="text-neutral-500 hover:text-neutral-600 text-lg leading-none disabled:opacity-40"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-neutral-500 mb-4">
            Cuéntanos qué hay que corregir o mejorar en el CRM. Tu nombre y la fecha se
            agregan automáticamente; la solicitud llega a DEV → Tickets.
          </p>

          <label className={CLASE_LABEL}>¿Qué hay que hacer? *</label>
          <textarea
            value={description}
            rows={5}
            required
            disabled={enviando}
            maxLength={4000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe el error, ajuste o mejora con el mayor detalle posible…"
            className={`${CLASE_INPUT} resize-y mb-3`}
          />

          <label className={CLASE_LABEL}>Prioridad</label>
          <select
            value={prioridad}
            disabled={enviando}
            onChange={(e) => setPrioridad(e.target.value as PrioridadTicket)}
            className={`${CLASE_INPUT} mb-4`}
          >
            {PRIORIDADES.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.etiqueta}
              </option>
            ))}
          </select>

          <label className={CLASE_LABEL}>Archivos (opcional)</label>
          <input
            type="file"
            multiple
            accept={ACCEPT}
            disabled={enviando}
            onChange={onSeleccionarArchivos}
            className="block w-full text-xs text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-primary-700 file:text-xs file:font-medium hover:file:bg-primary-100 mb-2"
          />
          <p className="text-[11px] text-neutral-500 mb-2">
            Imágenes (PNG, JPG, WEBP), documentos (PDF, Word, Excel) o texto. Máximo{" "}
            {MAX_ADJUNTOS} archivos de {Math.round(MAX_BYTES / 1024 / 1024)} MB cada uno.
          </p>

          {archivos.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {archivos.map((f) => (
                <li key={f.name} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm">
                  <span className="text-neutral-400">📄</span>
                  <span className="text-neutral-700 truncate flex-1">{f.name}</span>
                  <span className="text-xs text-neutral-400 shrink-0">{tamanoLegible(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => quitarArchivo(f.name)}
                    disabled={enviando}
                    className="shrink-0 text-neutral-400 hover:text-danger-500 disabled:opacity-40"
                    aria-label={`Quitar ${f.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="text-xs text-danger-600 mb-3">{error}</p>}

          {subiendo && (
            <p className="text-xs text-neutral-500 mb-3">
              Subiendo adjuntos {subiendo.actual} de {subiendo.total}…
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={enviando}
              className="text-sm px-4 py-2 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              disabled={!puedeEnviar}
              className="text-sm px-4 py-2 rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800 disabled:cursor-not-allowed"
            >
              {enviando ? (subiendo ? `Subiendo ${subiendo.actual}/${subiendo.total}…` : "Enviando…") : "Enviar ticket"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
