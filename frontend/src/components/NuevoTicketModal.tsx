import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { PrioridadTicket } from "../types";

// ─── Modal global → "Crear ticket" ─────────────────────────────────
// Cualquier usuario autenticado puede enviar una solicitud a la bandeja DEV → Tickets.
// NO otorga acceso a DEV: el solicitante no escribe nombre ni fecha (salen del usuario
// autenticado y del reloj del servidor) y al terminar NO se redirige a DEV.
// El ticket + sus archivos viajan en UNA sola petición: si no hay archivos, el backend
// rechaza el envío y no queda ningún ticket a medias.

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

// Mismo mensaje que exige el backend cuando falta el archivo.
const MENSAJE_SIN_ARCHIVO = "Debes adjuntar al menos una imagen o documento para enviar el ticket.";

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
  /** Opcional: se llama justo después de que el ticket quedó guardado con sus adjuntos. */
  onEnviado?: () => void;
}

/** Cada archivo lleva un id propio: dos archivos con el mismo nombre no se pisan al quitarlos. */
interface ArchivoSel {
  id: string;
  file: File;
}

export function NuevoTicketModal({ onClose, onEnviado }: Props) {
  const [description, setDescription] = useState("");
  const [prioridad, setPrioridad] = useState<PrioridadTicket>("Normal");
  const [archivos, setArchivos] = useState<ArchivoSel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [exito, setExito] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  // Clave de idempotencia: nace UNA vez por apertura del modal, así un doble clic o un
  // reintento tras un fallo de red nunca crean dos tickets (misma mecánica que pagos).
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  // Agrega lo válido SIN perder lo ya seleccionado; lo rechazado se explica y no entra.
  function agregarArchivos(lista: File[]) {
    const nuevos: ArchivoSel[] = [];
    let motivo: string | null = null;
    let cupo = MAX_ADJUNTOS - archivos.length;

    for (const f of lista) {
      if (cupo <= 0) {
        motivo ??= `Un ticket admite hasta ${MAX_ADJUNTOS} archivos.`;
        break;
      }
      if (!EXTENSIONES_PERMITIDAS.includes(extensionDe(f.name))) {
        motivo ??= `«${f.name}» no es un tipo de archivo permitido.`;
        continue;
      }
      if (f.size === 0) {
        motivo ??= `«${f.name}» está vacío.`;
        continue;
      }
      if (f.size > MAX_BYTES) {
        motivo ??= `«${f.name}» supera el máximo de ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`;
        continue;
      }
      nuevos.push({ id: crypto.randomUUID(), file: f });
      cupo--;
    }

    if (nuevos.length > 0) setArchivos((prev) => [...prev, ...nuevos]);
    setError(motivo);
  }

  function onSeleccionarArchivos(e: ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite volver a elegir el mismo archivo tras un rechazo
    if (lista.length > 0) agregarArchivos(lista);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (enviando) return;
    const lista = Array.from(e.dataTransfer?.files ?? []);
    if (lista.length > 0) agregarArchivos(lista);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!enviando) setArrastrando(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    // Solo se apaga si el puntero salió de la zona (no al pasar sobre el texto interno).
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastrando(false);
  }

  function quitarArchivo(id: string) {
    setArchivos((prev) => prev.filter((a) => a.id !== id));
  }

  function abrirSelector() {
    if (!enviando) inputRef.current?.click();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError("Escribe la descripción de tu solicitud.");
      return;
    }
    // El archivo es obligatorio: sin él no se envía nada (el backend también lo exige).
    if (archivos.length === 0) {
      setError(MENSAJE_SIN_ARCHIVO);
      return;
    }

    setEnviando(true);
    setError(null);
    try {
      await api.crearTicket({
        description: description.trim(),
        prioridad,
        idempotencyKey: idempotencyKeyRef.current,
        archivos: archivos.map((a) => a.file),
      });
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

  const puedeEnviar = description.trim().length > 0 && archivos.length > 0 && !enviando;

  return (
    <div className="fixed inset-0 bg-neutral-900/40 flex items-start justify-center pt-10 sm:pt-16 z-50 overflow-y-auto">
      {exito ? (
        <div className="bg-neutral-50 rounded-xl shadow-lg w-full max-w-lg p-6 border border-neutral-200 mb-10">
          <div className="text-center py-4">
            <p className="text-3xl mb-2">✔</p>
            <h2 className="text-lg font-semibold text-neutral-800">Ticket enviado</h2>
            <p className="text-sm text-neutral-500 mt-1.5">
              Tu solicitud llegó a la bandeja DEV → Tickets con{" "}
              {archivos.length} adjunto{archivos.length === 1 ? "" : "s"}.
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

          <label className={CLASE_LABEL}>
            Archivos * <span className="text-neutral-400">(mínimo 1)</span>
          </label>

          {/* Dropzone: se arrastran los archivos o se hace clic para elegirlos. */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Arrastra tus archivos aquí o haz clic para seleccionarlos"
            onClick={abrirSelector}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                abrirSelector();
              }
            }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={[
              "rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors mb-2",
              arrastrando
                ? "border-primary-400 bg-primary-50"
                : "border-neutral-300 bg-white hover:border-primary-300 hover:bg-neutral-50",
              enviando ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              disabled={enviando}
              onChange={onSeleccionarArchivos}
              className="hidden"
            />
            <p className="text-2xl mb-1.5" aria-hidden="true">📎</p>
            <p className="text-sm font-medium text-neutral-700">
              {arrastrando ? "Suelta los archivos aquí" : "Arrastra tus archivos aquí"}
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">o haz clic para seleccionarlos</p>
            <p className="text-[11px] text-neutral-400 mt-1.5">Imágenes y documentos permitidos</p>
          </div>
          <p className="text-[11px] text-neutral-500 mb-2">
            PNG, JPG, WEBP, PDF, Word, Excel o texto. Hasta {MAX_ADJUNTOS} archivos de{" "}
            {Math.round(MAX_BYTES / 1024 / 1024)} MB cada uno · {archivos.length} de {MAX_ADJUNTOS} agregados.
          </p>

          {archivos.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {archivos.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm">
                  <span className="text-neutral-400">📄</span>
                  <span className="text-neutral-700 truncate flex-1">{a.file.name}</span>
                  <span className="text-xs text-neutral-400 shrink-0">{tamanoLegible(a.file.size)}</span>
                  <button
                    type="button"
                    onClick={() => quitarArchivo(a.id)}
                    disabled={enviando}
                    className="shrink-0 text-neutral-400 hover:text-danger-500 disabled:opacity-40"
                    aria-label={`Quitar ${a.file.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="text-xs text-danger-600 mb-3">{error}</p>}

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
              {enviando ? "Enviando…" : "Enviar ticket"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
